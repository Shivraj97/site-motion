// lint: the rules a scene must keep for looks to work, checked in its source (like Atlassian's motion-token rule,
// applied to scenes). Two kinds:
//   always       determinism (no clock, no unseeded randomness, no CSS animation) and colours from tokens only
//   variants     meta.json of a `<parent>--<idea>` scene: parent, role, ≥ 2 differences (lib/variant.mjs)
//   per axis     a scene that lists an axis in meta.json "directable" promises to route it through the look, so a raw
//                value for that axis is a value the look can't reach: a stroke width, a shadow, a radius, a curve
// A value kept on purpose is marked in the source: `sm-native: <why>` on the line or the line above, or around a
// block with `sm-native-start: <why>` … `sm-native-end`. The reason is the point: it tells the next person (or
// agent) the value is a decision, not an oversight.
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { variantFindings } from "./variant.mjs";

const LIBRARY = join(import.meta.dirname, "..", "scenes");

// strip what can't be a style decision: var(--x, fallback) fallbacks (the native value a scene must keep) and comments
// (the variable's name stays, so "is this routed through the look?" can still be read from what's left)
const unfallback = (line) => { let s = line, prev; do { prev = s; s = s.replace(/var\(\s*(--[\w-]+)\s*,[^()]*(?:\([^()]*\)[^()]*)*\)/g, "var($1)"); } while (s !== prev); return s; };
// a value for this axis already goes through the look
const ROUTED = { stroke: /--sm-stroke/, elevation: /--sm-(shadow|stroke|glow)/, corner: /--sm-(radius|corner)/, motion: /--sm-ease/ };
const uncommentJs = (line) => line.replace(/\/\*.*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/, "$1");
const uncommentCss = (line) => line.replace(/\/\*.*?\*\//g, "");

// A CSS shadow is elevation only if some layer casts: it has blur or an outward offset. An inset or zero-blur ring
// (`inset 0 -1px 0 …`, `0 0 0 2px …`) is a line drawn with box-shadow, which no look turns into a drop shadow.
const casts = (decl) => {
  const value = decl.replace(/^\s*box-shadow\s*:/, "");
  return value.split(/,(?![^(]*\))/).some((layer) => {
    if (/\binset\b/.test(layer)) return false;
    const n = (layer.replace(/var\([^)]*\)|calc\([^)]*\)|(rgba?|hsla?|color-mix)\([^)]*\)/g, " ").match(/-?[\d.]+(px)?/g) || []).map(parseFloat);
    return n.length >= 3 && (n[0] !== 0 || n[1] !== 0 || n[2] !== 0);
  });
};
// shapes, not corner style: square (0), circle (50%) and pill (999px) stay the same in every look
const shapeRadius = (decl) => /radius\s*:\s*(0(px)?|50%|9{3,}px|100%)\s*$/.test(decl.trim());
// the same in SVG: an ellipse's rx/ry is its size, and a rect whose rx is half its literal width or height is a pill
const svgShape = (line) => {
  if (/svg\(\s*["']ellipse["']/.test(line)) return true;
  const rx = line.match(/\brx\s*:\s*([\d.]+)/);
  if (!rx) return false;
  // the short side decides: half the literal width or height makes a pill (a 6 × 10 rod with rx 3 is one)
  return ["width", "height"].some((side) => { const m = line.match(new RegExp(`\\b${side}\\s*:\\s*([\\d.]+)\\s*[,}]`)); return m && Math.abs(parseFloat(rx[1]) * 2 - parseFloat(m[1])) < 1e-6; });
};

export const RULES = [
  { id: "wall-clock", axis: null, js: /\b(Date\.now|performance\.now)\s*\(|\bnew Date\s*\(/, message: "reads the clock: a scene is a pure function of t, so every frame must come from t alone" },
  { id: "random", axis: null, js: /\bMath\.random\s*\(/, message: "unseeded randomness: use h.rng(seed) so every seek gives the same frame" },
  { id: "css-animation", axis: null, css: /^\s*(transition|animation)(-[a-z-]+)?\s*:(?!\s*none\b)/, message: "CSS transitions and animations run on wall time, not t: drive the motion from render(t)" },
  // pure black and white are allowed: they are tint and shade endpoints (mix(accent, "#ffffff", 0.5)) and mask fills
  { id: "hex-color", axis: null, js: /#(?!(?:fff|ffffff|000|000000)\b)[0-9a-f]{3,8}\b/i, css: /#(?!(?:fff|ffffff|000|000000)\b)[0-9a-f]{3,8}\b/i, message: "a colour literal: take colours from tokens (h.ui, tokens.color, var(--c-…)), so the brand reaches it" },
  { id: "raw-stroke", axis: "stroke", js: /(["']stroke-width["']|\bstrokeWidth)\s*:\s*[\d.]+|\blineWidth\s*=\s*[\d.]+/, css: /^\s*(border(-(top|right|bottom|left))?|outline)\s*:\s*[\d.]+px\b/, message: "a raw line width on a scene that follows stroke: use h.ui.stroke(role, native) or var(--sm-stroke-<role>, native)" },
  { id: "raw-shadow", axis: "elevation", js: /\bboxShadow\s*[:=]\s*["'`][^"'`]*\d+px|\bshadowBlur\s*=\s*[1-9]/, css: /^\s*box-shadow\s*:(?!\s*none\b)/, cssTest: casts, message: "a raw shadow on a scene that follows elevation: use h.ui.shadow(level, native) or var(--sm-shadow-<level>, native)" },
  { id: "raw-radius", axis: "corner", js: /\b(rx|ry)\s*:\s*[\d.]+|\bborderRadius\s*[:=]\s*["'`]?[\d.]+/, css: /^\s*border(-[a-z-]+)?-radius\s*:\s*[\d.]+/, cssTest: (d) => !shapeRadius(d), message: "a raw corner radius on a scene that follows corner: use h.ui.radius(size, native) or var(--sm-radius-<size>, native)" },
  { id: "raw-curve", axis: "motion", js: /\bbezier\s*\(|cubic-bezier\(/, css: /cubic-bezier\(/, message: "a custom curve on a scene that follows motion: use the named roles (signature, snappy, soft, inOut) so the look can remap them" },
];

/** Pure: lint one scene's sources. Returns [{ rule, file, line, text, message }]. */
export function lintSource({ js = "", css = "", directable = [] }) {
  const findings = [];
  for (const [file, src] of [["scene.js", js], ["scene.css", css]]) {
    const kind = file.endsWith(".js") ? "js" : "css";
    const lines = src.split("\n");
    let block = false;
    lines.forEach((raw, i) => {
      if (/sm-native-start/.test(raw)) block = true;
      const kept = block || /sm-native(?!-)/.test(raw) || /sm-native(?!-)/.test(lines[i - 1] || "") && /^\s*(\/\/|\/\*)/.test(lines[i - 1]);
      if (/sm-native-end/.test(raw)) block = false;
      if (kept) return;
      const code = unfallback(kind === "js" ? uncommentJs(raw) : uncommentCss(raw));
      if (!code.trim() || /^\s*\*/.test(raw)) return;
      // CSS is judged per declaration: scene CSS often keeps a whole rule on one line, and
      // `box-shadow: var(--sm-shadow-1, …); border-radius: 12px` is one routed value and one raw one
      const units = kind === "css" ? code.split(/[;{}]/) : [code];
      const seen = new Set();
      for (const unit of units) for (const rule of RULES) {
        const re = rule[kind];
        if (!re || seen.has(rule.id) || (rule.axis && !directable.includes(rule.axis))) continue;
        if (rule.axis && (/\bh\.ui\./.test(unit) || ROUTED[rule.axis].test(unit))) continue;
        if (rule.id === "raw-radius" && kind === "js" && svgShape(unit)) continue;
        if (re.test(unit) && (kind !== "css" || !rule.cssTest || rule.cssTest(unit))) { seen.add(rule.id); findings.push({ rule: rule.id, file, line: i + 1, text: raw.trim().slice(0, 140), message: rule.message }); }
      }
    });
  }
  return findings;
}

export function lintScene(dir) {
  const read = (f) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), "utf8") : "");
  const meta = existsSync(join(dir, "meta.json")) ? JSON.parse(read("meta.json")) : {};
  // a variant's parent: a sibling folder, else the library's scene (a project adds a variant without its concept)
  const sibling = (name) => {
    for (const f of [join(dirname(dir), name, "meta.json"), join(LIBRARY, name, "meta.json")]) if (existsSync(f)) return JSON.parse(readFileSync(f, "utf8"));
    return null;
  };
  const findings = [...variantFindings(basename(dir), meta, sibling), ...lintSource({ js: read("scene.js"), css: read("scene.css"), directable: meta.directable || [] })];
  return { name: basename(dir), directable: meta.directable || [], findings };
}

export function lintReport(result, rel = (p) => p) {
  if (!result.findings.length) return `pass  ${result.name}${result.directable.length ? `  (follows ${result.directable.join(", ")})` : ""}`;
  const lines = [`FAIL  ${result.name}  ${result.findings.length} finding${result.findings.length === 1 ? "" : "s"}`];
  for (const f of result.findings) lines.push(`  ${rel(f.file)}:${f.line}  ${f.rule}  ${f.message}\n      ${f.text}`);
  return lines.join("\n");
}
