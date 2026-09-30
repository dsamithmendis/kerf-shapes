import svgpath from "svgpath";
import type { BBox } from "./types.js";

type Segment = [string, ...number[]];
type Pt = [number, number];

/**
 * Compute a bounding box from a path's `d` string.
 *
 * The box is derived from every anchor and control point in the path
 * (after normalizing shorthand/arcs to M/L/H/V/C/Q/Z), not from true
 * curve extrema. For the kinds of assets Kerf targets — chamfered
 * frames, notched cards, brand cutouts — this is exactly right or a
 * pixel or two generous. For a path with an aggressively bulging curve
 * whose extremum falls outside its control-point hull, pass a bigger
 * `padding` to `trace()` to compensate.
 */
export function computeBBox(d: string): BBox {
  const prepared = svgpath(d).abs().unshort().unarc();

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const consider = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };

  prepared.iterate((segment: Segment, _index: number, x: number, y: number) => {
    const [cmd, ...args] = segment;
    switch (cmd) {
      case "M":
      case "L":
        consider(args[0], args[1]);
        break;
      case "H":
        consider(args[0], y);
        break;
      case "V":
        consider(x, args[0]);
        break;
      case "C":
        consider(args[0], args[1]);
        consider(args[2], args[3]);
        consider(args[4], args[5]);
        break;
      case "Q":
        consider(args[0], args[1]);
        consider(args[2], args[3]);
        break;
      case "Z":
      case "z":
        break;
      default:
        for (let i = 0; i + 1 < args.length; i += 2) consider(args[i], args[i + 1]);
    }
  });

  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
    throw new Error(
      "Kerf couldn't compute a bounding box for this path — the traced shape looks empty."
    );
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Remap a path's `d` string into the unit square (0,0)-(1,1), given a
 * bounding box (typically from `computeBBox`) and optional uniform
 * padding (fraction of the box's width/height on every side).
 *
 * Non-uniform x/y scale factors are used on purpose: the generated
 * components consume this path with `clipPathUnits="objectBoundingBox"`,
 * which itself maps the unit square onto the *actual* rendered box
 * non-uniformly. Two non-uniform maps compose back into one faithful
 * transform, so the traced silhouette always matches the source
 * regardless of what size or aspect ratio it's rendered at.
 */
export function normalizePath(d: string, bbox: BBox, padding = 0): string {
  const w = bbox.maxX - bbox.minX || 1;
  const h = bbox.maxY - bbox.minY || 1;
  const padX = w * padding;
  const padY = h * padding;
  const minX = bbox.minX - padX;
  const minY = bbox.minY - padY;
  const spanX = w + padX * 2 || 1;
  const spanY = h + padY * 2 || 1;

  const mapX = (x: number) => (x - minX) / spanX;
  const mapY = (y: number) => (y - minY) / spanY;

  const prepared = svgpath(d).abs().unshort().unarc();

  prepared.iterate((segment: Segment, _index: number, x: number, y: number) => {
    // svgpath expects the REPLACEMENT to be an array of segments (even for a
    // single replacement segment) — a bare segment tuple gets misread as
    // several one-item segments and corrupts the path.
    const [cmd, ...args] = segment;
    switch (cmd) {
      case "M":
        return [["M", mapX(args[0]), mapY(args[1])]];
      case "L":
        return [["L", mapX(args[0]), mapY(args[1])]];
      case "H":
        // Horizontal-only move — re-expressed as L; y is unchanged so
        // mapY(y) lands exactly where the previous point already mapped to.
        return [["L", mapX(args[0]), mapY(y)]];
      case "V":
        return [["L", mapX(x), mapY(args[0])]];
      case "C":
        return [
          [
            "C",
            mapX(args[0]),
            mapY(args[1]),
            mapX(args[2]),
            mapY(args[3]),
            mapX(args[4]),
            mapY(args[5]),
          ],
        ];
      case "Q":
        return [["Q", mapX(args[0]), mapY(args[1]), mapX(args[2]), mapY(args[3])]];
      case "Z":
      case "z":
        return undefined;
      default:
        return undefined;
    }
  });

  return prepared.round(5).toString();
}

// ---------------------------------------------------------------------------
// Curve flattening ("faceting") — turns smooth curves into straight chords,
// which is what gives a traced shape the angular, low-poly chamfer look.
// ---------------------------------------------------------------------------

function cubicAt(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
  ];
}

function distancePointToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a[0] + t * dx;
  const projY = a[1] + t * dy;
  return Math.hypot(p[0] - projX, p[1] - projY);
}

function subdivideCubic(
  p0: Pt,
  p1: Pt,
  p2: Pt,
  p3: Pt,
  t: number
): [[Pt, Pt, Pt, Pt], [Pt, Pt, Pt, Pt]] {
  const mid = (a: Pt, b: Pt): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const p01 = mid(p0, p1);
  const p12 = mid(p1, p2);
  const p23 = mid(p2, p3);
  const p012 = mid(p01, p12);
  const p123 = mid(p12, p23);
  const p0123 = mid(p012, p123);
  return [
    [p0, p01, p012, p0123],
    [p0123, p123, p23, p3],
  ];
}

/** Adaptively flattens a cubic bezier into a polyline within `tolerance`. */
function flattenCubic(
  p0: Pt,
  p1: Pt,
  p2: Pt,
  p3: Pt,
  tolerance: number,
  depth = 0
): Pt[] {
  const flat =
    distancePointToSegment(p1, p0, p3) <= tolerance &&
    distancePointToSegment(p2, p0, p3) <= tolerance;

  if (flat || depth >= 16) return [p3];

  const [left, right] = subdivideCubic(p0, p1, p2, p3, 0.5);
  return [
    ...flattenCubic(left[0], left[1], left[2], left[3], tolerance, depth + 1),
    ...flattenCubic(right[0], right[1], right[2], right[3], tolerance, depth + 1),
  ];
}

/** Elevates a quadratic control point pair to the equivalent cubic control points. */
function quadToCubic(p0: Pt, p1: Pt, p2: Pt): [Pt, Pt] {
  const c1: Pt = [p0[0] + (2 / 3) * (p1[0] - p0[0]), p0[1] + (2 / 3) * (p1[1] - p0[1])];
  const c2: Pt = [p2[0] + (2 / 3) * (p1[0] - p2[0]), p2[1] + (2 / 3) * (p1[1] - p2[1])];
  return [c1, c2];
}

/**
 * Replaces every curve command in `d` with straight-line chords, adaptively
 * subdivided so no chord strays more than `tolerance` (in the path's own
 * coordinate space — pass a normalized path and this is a 0..1 fraction)
 * from the curve it replaces. This is the "chamfer"/low-poly styling pass.
 */
export function flattenToFacets(d: string, tolerance: number): string {
  const prepared = svgpath(d).abs().unshort().unarc();

  prepared.iterate((segment: Segment, _index: number, x: number, y: number) => {
    const [cmd, ...args] = segment;
    const p0: Pt = [x, y];

    if (cmd === "C") {
      const p1: Pt = [args[0], args[1]];
      const p2: Pt = [args[2], args[3]];
      const p3: Pt = [args[4], args[5]];
      const points = flattenCubic(p0, p1, p2, p3, tolerance);
      return points.map((p) => ["L", p[0], p[1]] as Segment);
    }

    if (cmd === "Q") {
      const p1: Pt = [args[0], args[1]];
      const p3: Pt = [args[2], args[3]];
      const [c1, c2] = quadToCubic(p0, p1, p3);
      const points = flattenCubic(p0, c1, c2, p3, tolerance);
      return points.map((p) => ["L", p[0], p[1]] as Segment);
    }

    return undefined;
  });

  return prepared.round(5).toString();
}

/** Merges several path `d` strings (e.g. multiple layers) into one multi-subpath `d`. */
export function mergePaths(paths: string[]): string {
  return paths.map((p) => p.trim()).join(" ");
}

/** Counts subpaths (rough proxy for compound shapes / holes) by counting M commands. */
export function countSubpaths(d: string): number {
  const matches = d.match(/M/gi);
  return matches ? matches.length : d.trim().length ? 1 : 0;
}

function splitSubpaths(d: string): string[] {
  return d
    .split(/(?=[Mm])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Drops degenerate "hairline" subpaths — ones whose bounding box is far
 * thinner in one dimension than the overall shape — relative to
 * `minFraction` of the shape's larger dimension.
 *
 * This exists specifically for raster tracing: potrace's bitmap-tracing
 * stage can emit a near-zero-area sliver subpath on certain hard-edged
 * diagonal/staircase patterns (a known upstream quirk, independent of
 * `turdSize`, since turdSize filters by enclosed area and a degenerate
 * sliver's signed area is close to zero even though its bounding box
 * isn't tiny). A genuine designer-drawn hole or thin accent is virtually
 * never this thin relative to the whole shape, so this is safe as a
 * raster-only cleanup pass — it is not applied to hand-authored SVG input.
 */
export function pruneHairlineSubpaths(d: string, minFraction = 0.01): string {
  const subpaths = splitSubpaths(d);
  if (subpaths.length <= 1) return d;

  const boxed = subpaths
    .map((sp) => {
      try {
        return { d: sp, bbox: computeBBox(sp) };
      } catch {
        return null;
      }
    })
    .filter((b): b is { d: string; bbox: BBox } => b !== null);

  if (boxed.length <= 1) return d;

  const area = (b: BBox) => (b.maxX - b.minX) * (b.maxY - b.minY);
  const referenceSize = Math.max(
    ...boxed.map((b) => Math.max(b.bbox.maxX - b.bbox.minX, b.bbox.maxY - b.bbox.minY))
  ) || 1;

  const kept = boxed.filter((b) => {
    const w = b.bbox.maxX - b.bbox.minX;
    const h = b.bbox.maxY - b.bbox.minY;
    return Math.min(w, h) >= referenceSize * minFraction;
  });

  if (kept.length === 0) {
    // Degenerate case (shouldn't happen in practice): keep the largest one.
    const largest = boxed.reduce((a, b) => (area(b.bbox) > area(a.bbox) ? b : a));
    return largest.d;
  }

  return kept.map((b) => b.d).join(" ");
}

/**
 * Converts a single-subpath, curve-free (M/L/Z only) path already normalized
 * to the unit square into a CSS `polygon()` argument list, e.g.
 * `"7.5% 0%, 92.5% 0%, 100% 12%"`.
 *
 * Returns `null` if the path has more than one subpath (CSS `polygon()` can't
 * express holes/compound shapes — that case falls back to an SVG
 * `<clipPath>`) or contains any remaining curve commands (run it through
 * `flattenToFacets` first).
 *
 * This is what lets a generated component's clip mode skip `useId()`
 * entirely: a `clip-path: polygon(...)` inline style needs no DOM `id` to
 * reference, so the component needs no hook, no client-only randomness, and
 * no `"use client"` directive — it can be a Server Component.
 */
export function pathToPolygonPercent(d: string): string | null {
  if (splitSubpaths(d).length > 1) return null;

  const prepared = svgpath(d).abs().unshort().unarc();
  const points: Pt[] = [];
  let hasCurve = false;

  prepared.iterate((segment: Segment) => {
    const [cmd, ...args] = segment;
    if (cmd === "M" || cmd === "L") {
      points.push([args[0], args[1]]);
    } else if (cmd === "Z" || cmd === "z") {
      // no-op
    } else {
      hasCurve = true;
    }
  });

  if (hasCurve || points.length < 3) return null;

  const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
  return points.map(([x, y]) => `${pct(x)} ${pct(y)}`).join(", ");
}
