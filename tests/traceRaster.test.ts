import { describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Jimp from "jimp";
import { traceRasterFile } from "../src/trace/traceRaster.js";

// You may see one "(node:...) [DEP0040] DeprecationWarning: punycode..." line
// when this file runs under `vitest`. That's Node's own one-time notice for
// its built-in `punycode` module, fired the first time ANY code in the
// process requires it (confirmed with --trace-deprecation: the trace bottoms
// out at node:punycode itself, loaded via a plain `require`, not at any Kerf
// code). Vitest's own transform/collection phase resolves this file's import
// graph — including jimp's dependency chain — before traceRaster.ts's own
// lazy-loader and warning suppression ever run, so there's no hook available
// here to catch it. It's cosmetic and Vitest-specific: 8/8 fresh `node
// dist/cli/index.js trace *.png` runs, and both an ESM and a CJS consumer of
// the packed tarball, showed zero warnings — see the "lazy dep loading"
// comment on loadRasterDeps in src/trace/traceRaster.ts for the real fix.

async function writePaddedIconPng(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "kerf-raster-test-"));
  const file = join(dir, "padded-icon.png");
  const size = 128;
  const [x0, x1, y0, y1] = [14, 114, 44, 84]; // 100x40 opaque region (2.5:1) on a 128x128 canvas
  const img = new Jimp(size, size, 0x00000000);
  img.scan(0, 0, size, size, function (x: number, y: number, idx: number) {
    const inside = x >= x0 && x < x1 && y >= y0 && y < y1;
    this.bitmap.data[idx + 3] = inside ? 255 : 0;
  });
  await img.writeAsync(file);
  return file;
}

describe("traceRasterFile — aspect ratio", () => {
  it(
    "uses the opaque region's own bbox ratio, not the full canvas's (regression: was reporting 1.0 for any square canvas)",
    async () => {
      const file = await writePaddedIconPng();
      const result = await traceRasterFile(file);
      expect(result.aspectRatio).toBeCloseTo(100 / 40, 1);
    },
    15000
  );
});
