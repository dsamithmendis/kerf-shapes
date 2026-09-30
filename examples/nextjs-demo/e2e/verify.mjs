// Real-browser verification of Kerf's generated shapes.
//
//   npm run build && npm start &                 # serves the demo on :3000
//   CHROME_PATH=/path/to/chrome node e2e/verify.mjs
//
// Samples actual screenshot pixels (not DOM strings) to assert that each shape's
// silhouette is correct — at its native size AND after being resized to an
// aspect ratio it wasn't traced at. Also fails on console errors/hydration warnings.
import puppeteer from "puppeteer-core";
import { PNG } from "pngjs";
import { writeFileSync } from "node:fs";

const URL_ = process.env.DEMO_URL ?? "http://localhost:3000";
const CHROME = process.env.CHROME_PATH;
if (!CHROME) {
  console.error("Set CHROME_PATH to a Chrome/Chromium executable.");
  process.exit(2);
}
const BG = [15, 17, 21]; // page background (#0f1115)

const near = (a, b, tol = 8) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
const isBg = (c) => near(c, BG, 8);

// Fractional probe points (x, y in 0..1 of the element box). "out" = must show
// the page background (outside the silhouette); "in" = must NOT.
const GEOM = {
  NotchCard: {
    out: [[0.02, 0.02], [0.98, 0.02], [0.02, 0.98], [0.98, 0.98], [0.05, 0.02]],
    in: [[0.5, 0.5], [0.06, 0.08], [0.05, 0.06]],
  },
  RoundedBanner: {
    out: [[0.01, 0.02], [0.99, 0.02], [0.01, 0.98], [0.99, 0.98]],
    in: [[0.5, 0.5], [0.04, 0.12], [0.96, 0.88]],
  },
  RingFrame: {
    out: [[0.02, 0.02], [0.98, 0.98], [0.5, 0.5]], // includes the HOLE center
    in: [[0.15, 0.5], [0.5, 0.15], [0.12, 0.12]],
  },
};
const FLAT_FILL = { NotchCard: [245, 165, 36], RoundedBanner: [239, 68, 68], RingFrame: [56, 189, 248] };

let failures = 0;
let checks = 0;
const check = (label, ok, detail = "") => {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? "  ✓" : "  ✗"} ${label}${ok ? "" : "  " + detail}`);
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "shell",
  args: (process.env.CHROME_ARGS ?? "--no-sandbox --disable-gpu").split(" "),
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1400, deviceScaleFactor: 1 });

const problems = [];
page.on("console", (m) => ["error", "warning"].includes(m.type()) && problems.push(`console.${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("requestfailed", (r) => problems.push(`requestfailed: ${r.url()}`));

await page.goto(URL_, { waitUntil: "networkidle0" });

async function shot() {
  const buf = await page.screenshot({ type: "png" });
  return { png: PNG.sync.read(buf), buf };
}
async function shapes() {
  return page.$$eval("[data-kerf-shape]", (els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { name: el.dataset.kerfShape, tag: el.tagName.toLowerCase(), x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height };
    })
  );
}
const px = (png, x, y) => {
  const i = (Math.floor(y) * png.width + Math.floor(x)) * 4;
  return [png.data[i], png.data[i + 1], png.data[i + 2]];
};

function verifyGeometry(png, s, label) {
  const g = GEOM[s.name];
  for (const [fx, fy] of g.out) {
    const c = px(png, s.x + fx * s.w, s.y + fy * s.h);
    check(`${label}: (${fx},${fy}) is outside the silhouette`, isBg(c), `got rgb(${c})`);
  }
  for (const [fx, fy] of g.in) {
    const c = px(png, s.x + fx * s.w, s.y + fy * s.h);
    check(`${label}: (${fx},${fy}) is inside the silhouette`, !isBg(c), `got background rgb(${c})`);
  }
}

// ---- 1. native size ------------------------------------------------------
console.log("\n[1] native sizes");
let { png, buf } = await shot();
writeFileSync(new URL("./demo.png", import.meta.url), buf);
const list = await shapes();
check(`found ${list.length} kerf shapes on the page`, list.length >= 7, `found ${list.length}`);
list.forEach((s, i) => {
  const mode = s.tag === "svg" ? "flat" : "clip";
  const label = `${s.name}#${i} (${mode}, ${Math.round(s.w)}×${Math.round(s.h)})`;
  verifyGeometry(png, s, label);
  if (mode === "flat") {
    const c = px(png, s.x + s.w * 0.5, s.y + s.h * (s.name === "RingFrame" ? 0.15 : 0.5));
    check(`${label}: fill color`, near(c, FLAT_FILL[s.name], 10), `got rgb(${c})`);
  }
});

// ---- 2. resized to aspect ratios the shapes were NOT traced at -----------
console.log("\n[2] resized to non-native aspect ratios");
const targets = [
  { name: "NotchCard", tag: "svg", w: 600, h: 100 },
  { name: "NotchCard", tag: "div", w: 600, h: 100 },
  { name: "RoundedBanner", tag: "div", w: 500, h: 80 },
  { name: "RingFrame", tag: "div", w: 260, h: 90 },
];
for (const t of targets) {
  const idx = (await shapes()).findIndex((s) => s.name === t.name && s.tag === t.tag);
  await page.$$eval("[data-kerf-shape]", (els, idx, t) => {
    const el = els[idx];
    el.style.width = t.w + "px";
    el.style.height = t.h + "px";
    el.style.aspectRatio = "auto";
    if (el.tagName.toLowerCase() === "svg") { el.setAttribute("width", t.w); el.setAttribute("height", t.h); }
  }, idx, t);
  ({ png } = await shot());
  const s = (await shapes())[idx];
  verifyGeometry(png, s, `${t.name} ${t.tag === "svg" ? "flat" : "clip"} resized ${t.w}×${t.h}`);
}

// ---- 3. hydration / clip-path reference integrity -------------------------
console.log("\n[3] hydration + clip references");
const refs = await page.evaluate(() =>
  [...document.querySelectorAll("[data-kerf-shape]")]
    .map((el) => el.style.clipPath || el.style.webkitClipPath || "")
    .filter((v) => v.startsWith("url("))
    .map((v) => v.match(/#([^")]+)/)?.[1])
    .map((id) => ({ id, resolves: document.getElementById(id)?.tagName.toLowerCase() === "clippath" }))
);
check(`every url(#id) clip resolves to a <clipPath> (${refs.length} refs)`, refs.length > 0 && refs.every((r) => r.resolves), JSON.stringify(refs));
check("clip ids are unique across instances", new Set(refs.map((r) => r.id)).size === refs.length);
check("no console errors / hydration warnings / failed requests", problems.length === 0, problems.join(" | "));

await browser.close();
console.log(`\n${checks - failures}/${checks} checks passed${failures ? `  —  ${failures} FAILED` : ""}`);
process.exit(failures ? 1 : 0);
