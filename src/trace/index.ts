import { extname } from "node:path";
import { traceSvgFile } from "./traceSvg.js";
import { traceRasterFile } from "./traceRaster.js";
import type { TraceOptions, TraceResult } from "./types.js";

const RASTER_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".bmp"]);

/** Traces an SVG or raster (PNG/JPEG/BMP) asset into a normalized path + metadata. */
export async function trace(filePath: string, options: TraceOptions = {}): Promise<TraceResult> {
  const ext = extname(filePath).toLowerCase();

  if (ext === ".svg") {
    return traceSvgFile(filePath, options);
  }

  if (RASTER_EXTENSIONS.has(ext)) {
    return traceRasterFile(filePath, options);
  }

  throw new Error(
    `Kerf doesn't know how to trace "${filePath}" (${ext || "no extension"}). ` +
      `Supported input: .svg, .png, .jpg/.jpeg, .bmp.`
  );
}

export * from "./types.js";
export { computeBBox, normalizePath, flattenToFacets } from "./geometry.js";
export { extractPathData } from "./traceSvg.js";
