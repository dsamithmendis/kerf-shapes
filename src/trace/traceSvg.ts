import { readFile } from "node:fs/promises";
import { computeBBox, mergePaths, normalizePath, flattenToFacets, countSubpaths } from "./geometry.js";
import type { TraceOptions, TraceResult } from "./types.js";

const PATH_D_RE = /<path\b[^>]*\bd\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi;

/** Extracts every `<path d="...">` value from a raw SVG document string. */
export function extractPathData(svgSource: string): string[] {
  const paths: string[] = [];
  let match: RegExpExecArray | null;
  PATH_D_RE.lastIndex = 0;
  while ((match = PATH_D_RE.exec(svgSource))) {
    const d = match[1] ?? match[2];
    if (d && d.trim()) paths.push(d.trim());
  }
  return paths;
}

export async function traceSvgFile(filePath: string, options: TraceOptions = {}): Promise<TraceResult> {
  const source = await readFile(filePath, "utf8");
  return traceSvgSource(source, filePath, options);
}

export function traceSvgSource(
  svgSource: string,
  sourceFile: string,
  options: TraceOptions = {}
): TraceResult {
  const paths = extractPathData(svgSource);

  if (paths.length === 0) {
    throw new Error(
      `Kerf couldn't find any <path> elements in "${sourceFile}". ` +
        `Kerf traces <path> geometry — in your design tool, flatten/outline the ` +
        `shape (e.g. Figma: right-click → "Flatten") before exporting as SVG.`
    );
  }

  const merged = mergePaths(paths);
  const bbox = computeBBox(merged);
  const padding = options.padding ?? 0;
  let normalized = normalizePath(merged, bbox, padding);

  if (options.facet && options.facet > 0) {
    normalized = flattenToFacets(normalized, options.facet);
  }

  // Deliberately the traced SHAPE's own bbox ratio, not the source document's
  // viewBox/canvas ratio — PATH_D is normalized to the shape's bbox, so that's
  // the ratio that keeps it looking right when only one of width/height is
  // set. A document canvas with any padding/margin around the artwork (the
  // common case for real design-tool exports) would otherwise report the
  // wrong ratio and render the shape visibly stretched or squashed. Padding
  // (above) doesn't change this: it scales both dimensions proportionally.
  const aspectRatio = (bbox.maxX - bbox.minX) / (bbox.maxY - bbox.minY || 1);

  return {
    pathD: normalized,
    aspectRatio,
    subpathCount: countSubpaths(merged),
    sourceFile,
    sourceKind: "svg",
  };
}
