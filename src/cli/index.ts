#!/usr/bin/env node
import { Command } from "commander";
import { runTrace } from "./commands/trace.js";
import { runBatch } from "./commands/batch.js";
import { runInit } from "./commands/init.js";

const program = new Command();

program
  .name("kerf-shapes")
  .description(
    "Trace an SVG or raster asset into a self-contained, typed React/Next.js shape component."
  )
  .version("0.1.0");

program
  .command("trace <input>")
  .description("Trace a single .svg/.png/.jpg/.bmp file into a component")
  .option("-n, --name <ComponentName>", "component name (default: derived from the file name)")
  .option("-o, --out <dir>", "output directory (default: ./components/kerf)")
  .option("--fill <color>", "default fill color (default: currentColor)")
  .option("--stroke <color>", "default stroke color (default: none)")
  .option("--stroke-width <n>", "default stroke width in px (default: 0)")
  .option(
    "--facet <tolerance>",
    "flatten curves into straight chords for a low-poly/chamfer look; " +
      "tolerance is a 0..1 fraction of the shape's own size (try 0.01–0.03)"
  )
  .option("--padding <n>", "padding around the shape, as a 0..1 fraction (default: 0)")
  .option("--raster-threshold <n>", "alpha cutoff (0-255) separating shape from background in raster input (default: 128)")
  .option("--raster-invert", "trace the transparent region instead of the opaque region")
  .option("-f, --force", "overwrite the output file if it already exists")
  .action(async (input: string, opts) => {
    try {
      const result = await runTrace(input, opts);
      console.log(`✓ ${result.componentName} → ${result.outFile}`);
      if (result.subpathCount > 1) {
        console.log(`  (${result.subpathCount} subpaths — compound shape or holes, fill-rule: evenodd)`);
      }
    } catch (err) {
      console.error(`✗ ${(err as Error).message}`);
      process.exitCode = 1;
    }
  });

program
  .command("batch <dir>")
  .description("Trace every supported asset in a directory")
  .option("-o, --out <dir>", "output directory (default: ./components/kerf)")
  .option("--fill <color>", "default fill color")
  .option("--stroke <color>", "default stroke color")
  .option("--stroke-width <n>", "default stroke width in px")
  .option("--facet <tolerance>", "flatten curves into straight chords (0..1 fraction)")
  .option("--padding <n>", "padding around each shape, as a 0..1 fraction")
  .option("--raster-threshold <n>", "alpha cutoff (0-255) for raster input")
  .option("--raster-invert", "trace the transparent region instead of the opaque region")
  .option("-f, --force", "overwrite output files that already exist")
  .action(async (dir: string, opts) => {
    const results = await runBatch(dir, opts);
    let failed = 0;
    for (const item of results) {
      if (item.result) {
        console.log(`✓ ${item.result.componentName} → ${item.result.outFile}`);
      } else {
        failed += 1;
        console.error(`✗ ${item.file}: ${item.error}`);
      }
    }
    console.log(`\n${results.length - failed}/${results.length} traced.`);
    if (failed > 0) process.exitCode = 1;
  });

program
  .command("init")
  .description("Write a kerf.config.json with sensible defaults")
  .option("-f, --force", "overwrite kerf.config.json if it already exists")
  .action(async (opts) => {
    try {
      const path = await runInit(opts.force);
      console.log(`✓ wrote ${path}`);
    } catch (err) {
      console.error(`✗ ${(err as Error).message}`);
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv);
