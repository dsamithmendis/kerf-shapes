import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { runTrace, type TraceCliFlags, type TraceRunResult } from "./trace.js";

const SUPPORTED = new Set([".svg", ".png", ".jpg", ".jpeg", ".bmp"]);

export interface BatchItemResult {
  file: string;
  result?: TraceRunResult;
  error?: string;
}

export async function runBatch(dir: string, flags: TraceCliFlags): Promise<BatchItemResult[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && SUPPORTED.has(extname(e.name).toLowerCase()))
    .map((e) => join(dir, e.name));

  if (files.length === 0) {
    throw new Error(`No .svg/.png/.jpg/.bmp files found in ${dir}`);
  }

  const results: BatchItemResult[] = [];
  for (const file of files) {
    try {
      // Batch mode always derives the component name from each filename —
      // an explicit --name would collide across every file in the folder.
      const result = await runTrace(file, { ...flags, name: undefined });
      results.push({ file, result });
    } catch (err) {
      results.push({ file, error: (err as Error).message });
    }
  }
  return results;
}
