import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { trace } from "../../trace/index.js";
import { generateAndFormatComponent } from "../../codegen/generateComponent.js";
import { assertValidComponentName, componentNameFromFile } from "../../codegen/naming.js";
import { loadConfig } from "../config.js";

export interface TraceCliFlags {
  name?: string;
  out?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: string;
  facet?: string;
  padding?: string;
  force?: boolean;
  rasterThreshold?: string;
  rasterInvert?: boolean;
}

export interface TraceRunResult {
  outFile: string;
  componentName: string;
  subpathCount: number;
  sourceKind: "svg" | "raster";
}

/** Resolves CLI flags against `kerf.config.json`, CLI flags always winning. */
async function resolveOptions(flags: TraceCliFlags) {
  const config = await loadConfig();
  return {
    out: flags.out ?? config.out ?? "./components/kerf",
    fill: flags.fill ?? config.fill ?? "currentColor",
    stroke: flags.stroke ?? config.stroke,
    strokeWidth: Number(flags.strokeWidth ?? config.strokeWidth ?? 0),
    padding: Number(flags.padding ?? config.padding ?? 0),
    facet: flags.facet !== undefined ? Number(flags.facet) : config.facet,
    rasterThreshold: Number(flags.rasterThreshold ?? 128),
    rasterInvert: Boolean(flags.rasterInvert),
  };
}

export async function runTrace(input: string, flags: TraceCliFlags): Promise<TraceRunResult> {
  const inputPath = resolve(input);
  if (!existsSync(inputPath)) {
    throw new Error(`No such file: ${inputPath}`);
  }

  const resolved = await resolveOptions(flags);
  const componentName = flags.name ? flags.name : componentNameFromFile(inputPath);
  assertValidComponentName(componentName);

  const result = await trace(inputPath, {
    padding: resolved.padding,
    facet: resolved.facet,
    raster: {
      threshold: resolved.rasterThreshold,
      blackOnWhite: !resolved.rasterInvert,
    },
  });

  const source = await generateAndFormatComponent(result, {
    componentName,
    defaultFill: resolved.fill,
    defaultStroke: resolved.stroke,
    defaultStrokeWidth: resolved.strokeWidth,
  });

  const outDir = resolve(resolved.out);
  const outFile = join(outDir, `${componentName}.tsx`);

  if (existsSync(outFile) && !flags.force) {
    throw new Error(`${outFile} already exists — pass --force to overwrite it.`);
  }

  await mkdir(outDir, { recursive: true });
  await writeFile(outFile, source, "utf8");

  return {
    outFile,
    componentName,
    subpathCount: result.subpathCount,
    sourceKind: result.sourceKind,
  };
}
