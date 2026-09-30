# Kerf

**Trace any SVG or PNG asset into a typed, dependency-free React/Next.js shape component.**
Fill it, stroke it, or clip arbitrary children — an image, a video, text, another component — to its exact silhouette.

```bash
npx kerf-shapes trace brand-notch.svg --name NotchCard
```

```tsx
import { NotchCard } from "./components/kerf/NotchCard";

// flat, filled shape
<NotchCard size={240} fill="#1a1a1a" />

// clip a photo to the same silhouette
<NotchCard size={240}>
  <img src="/team/photo.jpg" alt="" />
</NotchCard>
```

## Why

If you've ever hand-built a design system with an angular, chamfered, or notched
visual language, you know the workflow: export the shape from Figma, trace it
into an SVG path, hand-write a component with a sane prop API, repeat for every
shape. Kerf automates that pipeline — vectorize (or pass through) → normalize →
generate — for arbitrary asset silhouettes, not just Figma's own primitive
"corner radius."

**The output has zero runtime dependency on Kerf.** Every generated component
is a single, self-contained `.tsx` file — one `import * as React`, nothing
else. Once it's generated, it's exactly as much yours as any other file in
your repo. Delete Kerf, upgrade React, copy the file into a different project
— nothing breaks, because nothing depends on Kerf at runtime. Kerf is a build
tool, not a UI library.

## Install

```bash
npm install --save-dev kerf-shapes
```

(Also works with `npx kerf-shapes ...` for one-off use with no install.)

## Quick start

```bash
# Trace a single asset
npx kerf-shapes trace ./assets/notch-card.svg --name NotchCard

# Trace every asset in a folder
npx kerf-shapes batch ./assets --out ./components/kerf

# Save your defaults so you don't have to repeat flags every time
npx kerf-shapes init
```

## CLI reference

### `kerf-shapes trace <input>`

Traces one `.svg`, `.png`, `.jpg`/`.jpeg`, or `.bmp` file into a component.

| Flag | Default | Description |
| --- | --- | --- |
| `-n, --name <Name>` | derived from filename | Component name (PascalCase) |
| `-o, --out <dir>` | `./components/kerf` | Output directory |
| `--fill <color>` | `currentColor` | Default fill for flat-mode rendering |
| `--stroke <color>` | none | Default stroke color |
| `--stroke-width <n>` | `0` | Default stroke width (px) |
| `--facet <tolerance>` | off | Flatten curves into straight chords — the low-poly/chamfer look. Tolerance is a 0–1 fraction of the shape's own size; try `0.01`–`0.03` |
| `--padding <n>` | `0` | Padding around the shape, as a 0–1 fraction |
| `--raster-threshold <n>` | `128` | Alpha cutoff (0–255) separating shape from background, for PNG/JPEG input |
| `--raster-invert` | off | Trace the transparent region instead of the opaque one |
| `-f, --force` | off | Overwrite the output file if it already exists |

### `kerf-shapes batch <dir>`

Same flags as `trace`, applied to every supported file in a directory. Names
are always derived from each filename (an explicit `--name` would collide
across the batch).

### `kerf-shapes init`

Writes a `kerf.config.json` with sensible defaults so you don't have to pass
`--out`/`--fill`/etc. on every call. CLI flags always win over the config
file, which always wins over Kerf's built-in defaults.

```json
{
  "out": "./components/kerf",
  "fill": "currentColor",
  "padding": 0,
  "strokeWidth": 0
}
```

## The component API

Every generated component shares the same prop shape:

```tsx
export interface <Name>Props {
  size?: number | string;   // sets width & height, preserving aspect ratio
  width?: number | string;
  height?: number | string;
  fill?: string;            // flat-mode only
  stroke?: string;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode; // pass this to switch to clip mode
}
```

- **No children** → renders a flat `<svg><path/></svg>`, filled/stroked per your props.
- **With children** → renders a `<div>` clipped to the shape, with your
  children laid out normally inside it. This is what lets you drop a photo,
  a video, or any other component into the silhouette. Kerf picks the
  simplest *exact* technique for each shape at generation time:
  - **Straight-edged outline** (chamfers, notches, bevels) → an inline CSS
    `clip-path: polygon(...)` with percentage points. Lossless, no hook, no
    ids, no hidden `<svg>`.
  - **Curves or holes** → an SVG `<clipPath>` (`objectBoundingBox` units) with
    a `useId()` id, since `polygon()` can't express those exactly. Needs
    React 18+. Kerf never approximates curves into polygons for clipping.

## How it works

1. **Extract** — pulls `<path d="...">` geometry straight out of an SVG, or
   for raster input, builds a black/white mask from the image's **alpha
   channel** (not color/luminance — this is what makes it work on flat-color
   logos and multi-color cutouts) and traces that mask with `potrace`.
2. **Normalize** — remaps the path into the unit square `(0,0)–(1,1)` using
   independent x/y scale factors. This is deliberate: both clip techniques
   (CSS percentages, and `clipPathUnits="objectBoundingBox"`) map the unit
   square onto the rendered element non-uniformly — two non-uniform maps
   compose back into one faithful transform, so the shape matches the source
   at any size or aspect ratio.
3. **Facet (optional)** — adaptively subdivides every bezier curve into
   straight chords within your chosen tolerance (De Casteljau flattening),
   turning a smooth trace into an angular, low-poly silhouette.
4. **Generate** — emits a self-contained, Prettier-formatted `.tsx` file.

## Next.js

Generated components have no `"use client"` directive and work in React
Server Components. `useId` (used only for curved/compound shapes) is
supported on the server, and straight-edged shapes use no hooks at all.

`examples/nextjs-demo` is a real App Router app whose page is a Server
Component rendering every kind of shape. Run it yourself:

```bash
npm run build                      # build Kerf
cd examples/nextjs-demo && npm install
npm run gen                        # trace ../assets/* with the real CLI
npm run dev
```

`next build` on Next.js 16.3.6 / React 19 succeeds, and the server-rendered
HTML contains the expected `clip-path: polygon(...)` values and unique
`<clipPath>` ids per instance.

### Real-browser verification

`examples/nextjs-demo/e2e/verify.mjs` drives headless Chrome against the
built demo and asserts on **actual screenshot pixels** — chamfered corners
must show the page background, a ring's hole must be empty, fills must match —
at native sizes *and* after resizing shapes to aspect ratios they weren't
traced at (600×100, 500×80, 260×90). It also fails on any console error,
hydration warning, or unresolved `url(#id)` clip reference.

```bash
cd examples/nextjs-demo && npm run build && npm start &
CHROME_PATH=/path/to/chrome npm run e2e     # 86 checks
```

This check earned its keep: it caught that a clipped shape with a hole wasn't
punching the hole out (`<clipPath>` children obey `clip-rule`, not
`fill-rule`) — a bug jsdom and the SSR HTML both missed.

## Known limitations

- **Browser coverage is Chromium only.** The pixel checks ran in headless
  Chrome 153. Straight-edged shapes use standard CSS `clip-path: polygon()`
  and curved/compound ones use standard SVG `<clipPath>`, so Safari and
  Firefox should behave, but they haven't been tested — run the e2e script
  against them before relying on it there.
- **Bounding boxes are computed from a path's anchor/control points**, not
  true curve extrema. For chamfered frames, notched cards, and similar
  angular/gently-curved shapes this is exact or a pixel or two generous. A
  curve whose extremum bulges outside its control-point hull may get clipped
  slightly — pass `--padding` to compensate.
- **Raster tracing can occasionally emit a degenerate hairline subpath** on
  hard-edged, perfectly diagonal/staircase patterns — a known quirk of
  potrace's bitmap-tracing stage (its area-based artifact filter doesn't
  catch this because the sliver's *signed* area is near zero even though its
  bounding box isn't tiny). Kerf detects and prunes these automatically for
  raster input; if you ever see an unexpected extra subpath, SVG input traces
  exactly and sidesteps the issue entirely.
- **Nested group transforms in SVG aren't resolved.** Flatten/outline your
  shape before exporting (standard advice for any vector-to-path workflow;
  in Figma: right-click → "Flatten").

## Fixed since last release

A design/document review this round found a real correctness bug: the
emitted `ASPECT_RATIO` was read from the source SVG's `viewBox` (the
document canvas), not from the traced shape's own bounding box. Any asset
exported with padding around the artwork — the normal case for a real
design-tool export, and for most app icons — got the wrong aspect ratio,
visibly stretching or squashing the shape whenever only one of `size`/
`width`/`height` was set. It's fixed for both SVG and raster input (raster
funnels through the same code path), with regression tests locking in a
padded 2.2:1 shape on a square canvas and a 2.5:1 icon on a square PNG.

Separately, the "no warning on raster trace" fix from the last round turned
out to be timing-dependent — the punycode warning fires on a deferred tick,
so restoring the suppression immediately after `import()` resolved was a
race that usually, not always, won. It now holds the suppression through
one extra tick and was stress-tested over 8–10 fresh processes with zero
leaks; `npm test` can still print the warning once, which is Vitest's own
transform pipeline touching the dependency before any Kerf code runs, not a
race in the shipped code — see the comment in `tests/traceRaster.test.ts`.

## Security note

`npm audit --omit=dev` reports 6 moderate advisories. All of them come from
one place: raster (PNG/JPEG) tracing, which depends on `potrace`, which pins
an old `jimp` 0.x (→ `file-type`, `phin`). Practical impact:

- A maliciously crafted **image file** could make `file-type` spin in an
  infinite loop (a hang/DoS), so **only raster-trace images you trust**.
- The `phin` advisory (headers leaked across redirects) doesn't apply — Kerf
  only reads local files and never makes HTTP requests.
- **SVG input is unaffected:** those libraries are loaded lazily, only when
  you trace a raster file, so an SVG-only workflow never executes them.

I can't fix this from Kerf's side without replacing potrace. If it matters
to you, the clean fix is swapping in a maintained tracer (a v0.2 candidate).

## Programmatic API

```ts
import { trace, generateAndFormatComponent } from "kerf-shapes";

const result = await trace("./assets/notch-card.svg", { padding: 0.02 });
const source = await generateAndFormatComponent(result, {
  componentName: "NotchCard",
  defaultFill: "#1a1a1a",
});
```

## Before you publish this yourself

This package is scaffolded and ready to publish, but a few placeholders need
your details first:

- `package.json` — set `repository`, `homepage`, and `bugs` to your GitHub URL.
- `LICENSE` — copyright line is already set to you; update the year if needed.
- Consider adding a GitHub Actions workflow to run `npm test` on PRs before
  you rely on this in production projects.

## License

MIT © Samith
