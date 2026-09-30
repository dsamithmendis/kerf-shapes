import type JimpType from "jimp";
import { extractPathData, traceSvgSource } from "./traceSvg.js";
import { mergePaths, pruneHairlineSubpaths } from "./geometry.js";
import type { TraceOptions, TraceResult } from "./types.js";

/**
 * Builds a pure black/white mask from an image's alpha channel: any pixel
 * whose alpha is at or above `alphaThreshold` becomes solid black (traced
 * as foreground), everything else becomes solid white (background).
 *
 * This mirrors the manual alpha-channel-tracing workflow it's modeled on —
 * tracing the actual cutout silhouette of a transparent PNG, rather than
 * potrace's default color/luminance thresholding, which falls apart on
 * flat-color logos and multi-color brand cutouts.
 */
async function alphaToMask(
  Jimp: typeof JimpType,
  filePath: string,
  alphaThreshold: number,
  invert: boolean
) {
  const image = await Jimp.read(filePath);
  const { width, height } = image.bitmap;
  const mask = new Jimp(width, height, 0xffffffff);

  const black = Jimp.rgbaToInt(0, 0, 0, 255);
  const white = Jimp.rgbaToInt(255, 255, 255, 255);

  image.scan(0, 0, width, height, (x: number, y: number, idx: number) => {
    const a = image.bitmap.data[idx + 3] ?? 255;
    const isForeground = invert ? a < alphaThreshold : a >= alphaThreshold;
    mask.setPixelColor(isForeground ? black : white, x, y);
  });

  return { mask, width, height };
}

type PotraceTrace = typeof import("potrace").trace;

let rasterDeps: Promise<{ Jimp: typeof JimpType; potraceTrace: PotraceTrace }> | undefined;

/**
 * Raster tracing needs jimp + potrace, which are heavy and (via jimp's old
 * dependency tree) print a Node `DEP0040 punycode` deprecation warning the
 * moment they load. Load them lazily so SVG-only runs never pay for either,
 * and swallow just that one third-party warning while they load.
 *
 * The warning fires on a deferred tick (confirmed empirically — it's a
 * `process.emitWarning` call queued from somewhere inside jimp's dependency
 * chain, not raised synchronously during `import()`), so restoring the
 * patch immediately after `import()` resolves is a race: sometimes the
 * deferred call lands after the restore and leaks through. Holding the
 * patch through one `setImmediate` — after every currently-queued
 * microtask and `process.nextTick` callback has run — closes that race.
 */
function loadRasterDeps() {
  rasterDeps ??= (async () => {
    const original = process.emitWarning;
    process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
      const opt = rest[0];
      const code = typeof opt === "object" && opt !== null ? (opt as { code?: string }).code : rest[1];
      if (code === "DEP0040") return;
      return (original as (...a: unknown[]) => void).call(process, warning, ...rest);
    }) as typeof process.emitWarning;
    try {
      const [jimpMod, potraceMod] = await Promise.all([import("jimp"), import("potrace")]);
      await new Promise((resolve) => setImmediate(resolve));
      // CJS packages surface differently under ESM vs CJS builds — accept both shapes.
      const Jimp = ((jimpMod as { default?: unknown }).default ?? jimpMod) as typeof JimpType;
      const pm = potraceMod as { trace?: PotraceTrace; default?: { trace?: PotraceTrace } };
      const potraceTrace = (pm.trace ?? pm.default?.trace) as PotraceTrace;
      return { Jimp, potraceTrace };
    } finally {
      process.emitWarning = original;
    }
  })();
  return rasterDeps;
}

function potraceTraceAsync(
  potraceTrace: PotraceTrace,
  input: Buffer,
  params: Record<string, unknown>
): Promise<string> {
  return new Promise((resolve, reject) => {
    potraceTrace(input, params, (err: Error | null, svg: string) => {
      if (err) reject(err);
      else resolve(svg);
    });
  });
}

export async function traceRasterFile(
  filePath: string,
  options: TraceOptions = {}
): Promise<TraceResult> {
  const rasterOpts = options.raster ?? {};
  const alphaThreshold = rasterOpts.threshold ?? 128;
  const invert = rasterOpts.blackOnWhite === false;

  const { Jimp, potraceTrace } = await loadRasterDeps();
  const { mask, width, height } = await alphaToMask(Jimp, filePath, alphaThreshold, invert);
  const maskBuffer = await mask.getBufferAsync(Jimp.MIME_PNG);

  const svg = await potraceTraceAsync(potraceTrace, maskBuffer, {
    threshold: 128, // the mask is already pure black/white, so this just needs to split them
    blackOnWhite: true,
    turdSize: rasterOpts.turdSize ?? 2,
    optCurve: true,
    optTolerance: rasterOpts.optTolerance ?? 0.2,
    color: "#000000",
    background: "transparent",
  });

  // potrace's own output SVG omits width/height on some inputs — inject
  // the source raster's real dimensions so aspect ratio is read correctly.
  const svgWithDims = svg.includes("viewBox")
    ? svg
    : svg.replace("<svg", `<svg viewBox="0 0 ${width} ${height}"`);

  // Raster-only cleanup: potrace's bitmap-tracing stage can leave a
  // degenerate hairline subpath on certain hard-edged diagonal patterns.
  // See pruneHairlineSubpaths for why this is safe to do unconditionally here.
  const rawPaths = extractPathData(svgWithDims);
  const pruned = pruneHairlineSubpaths(mergePaths(rawPaths));
  const cleanedSvg = svgWithDims.replace(
    /<path\b[^>]*\bd\s*=\s*(?:"[^"]*"|'[^']*')[^>]*\/?>/i,
    `<path d="${pruned.replace(/"/g, "&quot;")}" />`
  );

  const result = traceSvgSource(cleanedSvg, filePath, options);
  return { ...result, sourceKind: "raster" };
}
