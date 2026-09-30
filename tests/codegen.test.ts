import { describe, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import React from "react";
import { render } from "@testing-library/react";
import {
  generateComponentSource,
  generateAndFormatComponent,
} from "../src/codegen/generateComponent.js";
import { traceSvgSource } from "../src/trace/traceSvg.js";

const SAMPLE = traceSvgSource(
  `<svg viewBox="0 0 320 200"><path d="M24 0L296 0L320 24L320 176L296 200L24 200L0 176L0 24Z"/></svg>`,
  "notch-card.svg"
);

describe("generateComponentSource", () => {
  it("includes the component name, props interface, and path constant", () => {
    const source = generateComponentSource(SAMPLE, { componentName: "NotchCard" });
    expect(source).toContain("export function NotchCard(");
    expect(source).toContain("export interface NotchCardProps");
    expect(source).toContain("const PATH_D =");
    expect(source).toContain(SAMPLE.pathD);
    expect(source).toContain("export default NotchCard;");
  });

  it("has zero imports beyond React — no kerf runtime dependency", () => {
    const source = generateComponentSource(SAMPLE, { componentName: "NotchCard" });
    const importLines = source.match(/^import .*/gm) ?? [];
    expect(importLines).toHaveLength(1);
    expect(importLines[0]).toMatch(/^import \* as React from "react";$/);
  });

  it("bakes in the requested default fill/stroke", () => {
    const source = generateComponentSource(SAMPLE, {
      componentName: "NotchCard",
      defaultFill: "#1a1a1a",
      defaultStroke: "#ffffff",
      defaultStrokeWidth: 2,
    });
    expect(source).toContain('fill = "#1a1a1a"');
    expect(source).toContain('stroke = "#ffffff"');
    expect(source).toContain("strokeWidth = 2");
  });
});

describe("generated component (rendered)", () => {
  it("renders as a flat filled SVG shape with no children", async () => {
    const source = await generateAndFormatComponent(SAMPLE, { componentName: "CodegenSmokeFlat" });
    const file = join(__dirname, "__generated__", "CodegenSmokeFlat.tsx");
    await writeFile(file, source, "utf8");
    const mod = await import(pathToFileURL(file).href + `?t=${Date.now()}`);
    const { CodegenSmokeFlat } = mod;

    const { container } = render(React.createElement(CodegenSmokeFlat, { size: 100 }));
    const svg = container.querySelector("svg");
    const path = container.querySelector("path");
    expect(svg).toBeTruthy();
    expect(path?.getAttribute("d")).toBe(SAMPLE.pathD);
    expect(container.querySelector("div")).toBeNull();
  });

  it("clips children with a hook-free CSS polygon for single-subpath shapes", async () => {
    const source = await generateAndFormatComponent(SAMPLE, { componentName: "CodegenSmokeClip" });
    const file = join(__dirname, "__generated__", "CodegenSmokeClip.tsx");
    await writeFile(file, source, "utf8");
    const mod = await import(pathToFileURL(file).href + `?t=${Date.now()}`);
    const { CodegenSmokeClip } = mod;

    const { container } = render(
      React.createElement(
        CodegenSmokeClip,
        { size: 200 },
        React.createElement("img", { src: "/photo.jpg", alt: "test" })
      )
    );

    const wrapper = container.querySelector("[data-kerf-shape]");
    expect(wrapper).toBeTruthy();
    expect(container.querySelector("img")).toBeTruthy();
    // No SVG clipPath machinery in polygon mode.
    expect(container.querySelector("clipPath")).toBeNull();
    expect(container.querySelector("svg")).toBeNull();
  });
});

// A square with a square hole — CSS polygon() can't express the hole.
const DONUT = traceSvgSource(
  `<svg viewBox="0 0 100 100"><path d="M0 0L100 0L100 100L0 100Z M25 25L75 25L75 75L25 75Z"/></svg>`,
  "donut.svg"
);

// A rounded rectangle — arcs become cubic curves, so polygon() can't be exact.
const CURVED = traceSvgSource(
  `<svg viewBox="0 0 100 50"><path d="M10 0H90A10 10 0 0 1 100 10V40A10 10 0 0 1 90 50H10A10 10 0 0 1 0 40V10A10 10 0 0 1 10 0Z"/></svg>`,
  "pill.svg"
);

describe("clip mode selection", () => {
  it("straight-edged shapes use a lossless, hook-free CSS polygon", () => {
    const source = generateComponentSource(SAMPLE, { componentName: "NotchCard" });
    expect(source).not.toContain("use client");
    expect(source).not.toContain("useId");
    expect(source).not.toContain("<clipPath");
    expect(source).toContain("const CLIP_POLYGON =");
    expect(source).toContain("polygon(");
  });

  it("the clip polygon traces the same silhouette as the notch card", () => {
    const source = generateComponentSource(SAMPLE, { componentName: "NotchCard" });
    // The chamfered corners of the 320x200 card, as percentages.
    expect(source).toContain("7.50% 0.00%");
    expect(source).toContain("100.00% 12.00%");
    expect(source).toContain("0.00% 88.00%");
  });

  it("curved shapes keep an exact SVG <clipPath> (no polygon approximation)", () => {
    const source = generateComponentSource(CURVED, { componentName: "Pill" });
    expect(source).toContain("<clipPath");
    expect(source).toContain("React.useId()");
    expect(source).not.toContain("CLIP_POLYGON");
    expect(source).toContain("shape has curves");
  });

  it("no generated file ever needs 'use client' (useId works in Server Components)", () => {
    for (const [r, name] of [[SAMPLE, "A"], [DONUT, "B"], [CURVED, "C"]] as const) {
      expect(generateComponentSource(r, { componentName: name })).not.toMatch(/^\s*["']use client["']/m);
    }
  });

  it("compound clipPath uses clip-rule (not fill-rule) so holes actually punch through", () => {
    // Inside <clipPath>, browsers honor clip-rule and ignore fill-rule — found via
    // a real-browser pixel check; jsdom can't see this.
    const source = generateComponentSource(DONUT, { componentName: "Donut" });
    const clipBlock = source.slice(source.indexOf("<clipPath"), source.indexOf("</clipPath>"));
    expect(clipBlock).toContain('clipRule="evenodd"');
    expect(clipBlock).not.toContain("fillRule");
  });

  it("compound shapes (with holes) fall back to <clipPath>", () => {
    const source = generateComponentSource(DONUT, { componentName: "Donut" });
    expect(source).toContain("React.useId()");
    expect(source).toContain("<clipPath");
    expect(source).not.toContain("CLIP_POLYGON");
    expect(source).toContain("2 subpaths");
  });

  it("compound shape still renders and clips children with an SVG clipPath", async () => {
    const source = await generateAndFormatComponent(DONUT, { componentName: "CodegenSmokeDonut" });
    const file = join(__dirname, "__generated__", "CodegenSmokeDonut.tsx");
    await writeFile(file, source, "utf8");
    const mod = await import(pathToFileURL(file).href + `?t=${Date.now()}`);
    const { CodegenSmokeDonut } = mod;

    const { container } = render(
      React.createElement(
        CodegenSmokeDonut,
        { size: 120 },
        React.createElement("span", null, "hello")
      )
    );
    expect(container.querySelector("clipPath")).toBeTruthy();
    expect(container.querySelector("span")?.textContent).toBe("hello");
  });

  it("two instances of the same shape don't collide on a shared clip id", async () => {
    const source = await generateAndFormatComponent(DONUT, { componentName: "CodegenSmokeDonut2" });
    const file = join(__dirname, "__generated__", "CodegenSmokeDonut2.tsx");
    await writeFile(file, source, "utf8");
    const mod = await import(pathToFileURL(file).href + `?t=${Date.now()}`);
    const { CodegenSmokeDonut2 } = mod;

    const { container } = render(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(CodegenSmokeDonut2, { size: 50 }, "a"),
        React.createElement(CodegenSmokeDonut2, { size: 50 }, "b")
      )
    );
    const ids = Array.from(container.querySelectorAll("clipPath")).map((el) => el.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});
