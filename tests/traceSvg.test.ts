import { describe, expect, it } from "vitest";
import { extractPathData, traceSvgSource } from "../src/trace/traceSvg.js";

describe("extractPathData", () => {
  it("extracts a single path's d attribute", () => {
    const svg = `<svg viewBox="0 0 10 10"><path d="M0 0L10 10Z"/></svg>`;
    expect(extractPathData(svg)).toEqual(["M0 0L10 10Z"]);
  });

  it("extracts multiple paths in document order", () => {
    const svg = `<svg><path d="M0 0Z"/><path d='M1 1Z'/></svg>`;
    expect(extractPathData(svg)).toEqual(["M0 0Z", "M1 1Z"]);
  });

  it("returns an empty array when there are no paths", () => {
    const svg = `<svg><rect x="0" y="0" width="10" height="10"/></svg>`;
    expect(extractPathData(svg)).toEqual([]);
  });
});

describe("traceSvgSource", () => {
  it("throws a helpful error when the SVG has no <path> elements", () => {
    const svg = `<svg><circle cx="5" cy="5" r="5"/></svg>`;
    expect(() => traceSvgSource(svg, "shape.svg")).toThrow(/flatten/i);
  });

  it("computes aspect ratio from the traced shape's own bounding box", () => {
    const svg = `<svg viewBox="0 0 320 200"><path d="M0 0L320 0L320 200L0 200Z"/></svg>`;
    const result = traceSvgSource(svg, "shape.svg");
    expect(result.aspectRatio).toBeCloseTo(1.6, 5);
    expect(result.sourceKind).toBe("svg");
  });

  it("uses the shape's bbox ratio, NOT the document canvas's, when they differ", () => {
    // A square 200x200 canvas with a 110x50 (2.2:1) chamfered bar centered in it —
    // the kind of padding a real design-tool export almost always has.
    const svg = `<svg viewBox="0 0 200 200"><path d="M50 75H140L150 85V115L140 125H50L40 115V85Z"/></svg>`;
    const result = traceSvgSource(svg, "shape.svg");
    expect(result.aspectRatio).toBeCloseTo(110 / 50, 5);
  });

  it("padding preserves the shape's aspect ratio (scales both axes proportionally)", () => {
    const svg = `<svg viewBox="0 0 200 100"><path d="M0 0L200 0L200 100L0 100Z"/></svg>`;
    const noPad = traceSvgSource(svg, "shape.svg", { padding: 0 });
    const padded = traceSvgSource(svg, "shape.svg", { padding: 0.15 });
    expect(padded.aspectRatio).toBeCloseTo(noPad.aspectRatio, 10);
  });

  it("normalizes the path into the unit square", () => {
    const svg = `<svg viewBox="0 0 200 100"><path d="M0 0L200 0L200 100L0 100Z"/></svg>`;
    const result = traceSvgSource(svg, "shape.svg");
    // All coordinates should be within [0, 1].
    const coords = [...result.pathD.matchAll(/(-?[\d.]+)/g)].map((m) => Number(m[1]));
    for (const c of coords) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });

  it("applies faceting when requested", () => {
    const svg = `<svg viewBox="0 0 100 100"><path d="M0 50C0 77.61 22.39 100 50 100C77.61 100 100 77.61 100 50Z"/></svg>`;
    const result = traceSvgSource(svg, "shape.svg", { facet: 0.02 });
    expect(result.pathD).not.toMatch(/[CQ]/);
  });

  it("counts subpaths for a compound shape", () => {
    const svg = `<svg viewBox="0 0 100 100"><path d="M0 0L100 0L100 100L0 100Z M25 25L75 25L75 75L25 75Z"/></svg>`;
    const result = traceSvgSource(svg, "shape.svg");
    expect(result.subpathCount).toBe(2);
  });
});
