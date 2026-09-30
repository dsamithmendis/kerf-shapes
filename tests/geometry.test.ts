import { describe, expect, it } from "vitest";
import {
  computeBBox,
  normalizePath,
  flattenToFacets,
  pruneHairlineSubpaths,
  pathToPolygonPercent,
} from "../src/trace/geometry.js";

describe("computeBBox", () => {
  it("finds the bounding box of a simple polygon", () => {
    const d = "M24 0L296 0L320 24L320 176L296 200L24 200L0 176L0 24Z";
    const bbox = computeBBox(d);
    expect(bbox).toEqual({ minX: 0, minY: 0, maxX: 320, maxY: 200 });
  });

  it("includes cubic control points, not just endpoints", () => {
    // A curve that bulges further out than either endpoint.
    const d = "M0 0C-50 0 -50 100 0 100";
    const bbox = computeBBox(d);
    expect(bbox.minX).toBe(-50);
  });

  it("throws a helpful error on an empty path", () => {
    expect(() => computeBBox("")).toThrow(/bounding box/i);
  });
});

describe("normalizePath", () => {
  it("maps a bounding box exactly onto the unit square", () => {
    const d = "M24 0L296 0L320 24L320 176L296 200L24 200L0 176L0 24Z";
    const bbox = computeBBox(d);
    const normalized = normalizePath(d, bbox, 0);
    // Corner-cut points map to expected fractions.
    expect(normalized).toContain("0.075 0");
    expect(normalized).toContain("1 0.12");
    expect(normalized).toContain("0 0.88");
  });

  it("applies padding symmetrically", () => {
    const d = "M0 0L100 0L100 100L0 100Z";
    const bbox = computeBBox(d);
    const padded = normalizePath(d, bbox, 0.1);
    // With 10% padding on a square, the shape now occupies the middle
    // ~83% of the unit square (100 / 120), starting at 0.1/1.2 ≈ 0.0833.
    expect(padded).toMatch(/0\.0833\d*\s+0\.0833/);
  });

  it("converts H and V commands into equivalent L commands", () => {
    const d = "M0 0H100V100H0Z";
    const bbox = computeBBox(d);
    const normalized = normalizePath(d, bbox, 0);
    expect(normalized).not.toMatch(/[HV]/);
  });
});

describe("flattenToFacets", () => {
  it("replaces curve commands with straight-line segments", () => {
    const d = "M0 0.5C0 0.7761 0.2239 1 0.5 1C0.7761 1 1 0.7761 1 0.5Z";
    const faceted = flattenToFacets(d, 0.02);
    expect(faceted).not.toMatch(/[CQ]/);
    expect(faceted).toMatch(/[LM]/);
  });

  it("stays within tolerance of the original curve", () => {
    // A quarter circle from (1,0) to (0,1) centered at origin, radius 1,
    // approximated as a cubic bezier (standard k = 0.5523 constant).
    const k = 0.5522847498;
    const d = `M1 0C1 ${k} ${k} 1 0 1`;
    const tolerance = 0.01;
    const faceted = flattenToFacets(d, tolerance);
    // Every replacement point must lie within `tolerance` of the true arc.
    const points = [...faceted.matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((m) => [
      Number(m[1]),
      Number(m[2]),
    ]);
    for (const [x, y] of points) {
      const distFromOrigin = Math.hypot(x, y);
      expect(Math.abs(distFromOrigin - 1)).toBeLessThan(tolerance * 3);
    }
  });

  it("produces more points for a tighter tolerance", () => {
    const k = 0.5522847498;
    const d = `M1 0C1 ${k} ${k} 1 0 1`;
    const loose = flattenToFacets(d, 0.05);
    const tight = flattenToFacets(d, 0.001);
    // svgpath compresses repeated command letters (e.g. "L1 2 3 4"), so
    // count coordinate pairs rather than command letters.
    const countPoints = (s: string) => (s.match(/-?[\d.]+[ ,]-?[\d.]+/g) ?? []).length;
    expect(countPoints(tight)).toBeGreaterThan(countPoints(loose));
  });
});

describe("pruneHairlineSubpaths", () => {
  it("leaves a single-subpath shape untouched", () => {
    const d = "M0 0L100 0L100 100L0 100Z";
    expect(pruneHairlineSubpaths(d)).toBe(d);
  });

  it("keeps a genuinely large hole (e.g. a donut shape)", () => {
    const outer = "M0 0L100 0L100 100L0 100Z";
    const hole = "M25 25L75 25L75 75L25 75Z"; // 50x50 hole in a 100x100 square — not degenerate
    const merged = `${outer} ${hole}`;
    const result = pruneHairlineSubpaths(merged, 0.01);
    expect(result).toContain("25 25");
  });

  it("drops a degenerate hairline sliver relative to the main shape", () => {
    const outer = "M0 0L100 0L100 100L0 100Z";
    // A near-zero-width sliver: 0.05 units wide against a 100-unit shape.
    const sliver = "M50 10C50.02 30 49.98 70 50 90";
    const merged = `${outer} ${sliver}`;
    const result = pruneHairlineSubpaths(merged, 0.01);
    expect(result).not.toContain("50.02");
  });
});

describe("pathToPolygonPercent", () => {
  it("converts a normalized polygon path into CSS percentage points", () => {
    const d = "M0.075 0L0.925 0L1 0.12L1 0.88L0.925 1L0.075 1L0 0.88L0 0.12Z";
    expect(pathToPolygonPercent(d)).toBe(
      "7.50% 0.00%, 92.50% 0.00%, 100.00% 12.00%, 100.00% 88.00%, 92.50% 100.00%, 7.50% 100.00%, 0.00% 88.00%, 0.00% 12.00%"
    );
  });

  it("returns null for compound shapes, which CSS polygon() can't express", () => {
    const d = "M0 0L1 0L1 1L0 1Z M0.25 0.25L0.75 0.25L0.75 0.75L0.25 0.75Z";
    expect(pathToPolygonPercent(d)).toBeNull();
  });

  it("returns null while curves remain (they must be flattened first)", () => {
    const d = "M0 0.5C0 0.8 0.2 1 0.5 1L1 1L1 0Z";
    expect(pathToPolygonPercent(d)).toBeNull();
    expect(pathToPolygonPercent(flattenToFacets(d, 0.01))).not.toBeNull();
  });
});
