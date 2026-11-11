import { test } from "node:test";
import assert from "node:assert/strict";
import { lintSource } from "./lint-scene.mjs";

const rules = (r) => r.map((f) => f.rule);

test("determinism rules apply to every scene", () => {
  const js = `const a = Math.random();\nconst b = Date.now();\nconst c = h.rng(7)();`;
  assert.deepEqual(rules(lintSource({ js })), ["random", "wall-clock"]);
  assert.deepEqual(rules(lintSource({ css: ".x { transition: opacity 1s; }\n.y { animation: none; }" })), ["css-animation"]);
});

test("colours come from tokens; fallbacks, comments, and pure black and white are fine", () => {
  assert.deepEqual(rules(lintSource({ js: `el.style.color = "#ff6600";` })), ["hex-color"]);
  assert.deepEqual(lintSource({ js: `mix(accent, "#ffffff", 0.5); o.fillStyle = "#000"; // #abcdef in a comment` }), []);
  assert.deepEqual(lintSource({ css: ".x { color: var(--c-warning, #e8a33d); box-shadow: 0 0 0 1px var(--sm-stroke-color, #d6d9d1); }" }), []);
});

test("axis rules only bind the axes a scene follows", () => {
  const js = `svg("rect", { rx: 6, "stroke-width": 1.5 });\nctx.lineWidth = 2;`;
  assert.deepEqual(lintSource({ js, directable: [] }), []);
  assert.deepEqual(rules(lintSource({ js, directable: ["stroke"] })), ["raw-stroke", "raw-stroke"]);
  assert.deepEqual(rules(lintSource({ js, directable: ["stroke", "corner"] })), ["raw-stroke", "raw-radius", "raw-stroke"]);
  const css = ".card { box-shadow: 0 8px 24px rgba(0,0,0,.2); border-radius: 12px; border: 1px solid red; }";
  assert.deepEqual(rules(lintSource({ css, directable: ["elevation"] })), ["raw-shadow"]);
  assert.deepEqual(rules(lintSource({ js: `const e = bezier(.2, 0, .1, 1);`, directable: ["motion"] })), ["raw-curve"]);
});

test("values routed through the look pass", () => {
  const js = `svg("rect", { rx: h.ui.radius("sm", 6), ...h.ui.strokeAttrs("fine", 1.2, C.ink) });\nctx.lineWidth = h.ui.stroke("bold", 2.5);`;
  assert.deepEqual(lintSource({ js, directable: ["stroke", "corner"] }), []);
  const css = ".card { box-shadow: 0 0 0 var(--sm-stroke-fine, 1px) var(--sm-stroke-color, #ccc), var(--sm-shadow-2, 0 8px 24px rgba(0,0,0,.2)); border-radius: var(--sm-radius-md, 12px); }";
  assert.deepEqual(lintSource({ css, directable: ["stroke", "elevation", "corner"] }), []);
});

test("sm-native keeps a value on purpose: on the line, the line above, or around a block", () => {
  const d = ["stroke", "corner"];
  assert.deepEqual(lintSource({ js: `svg("rect", { rx: 5 }); // sm-native: a pill stays a pill`, directable: d }), []);
  assert.deepEqual(lintSource({ js: `// sm-native: yarn thickness\nctx.lineWidth = 4;\nctx.lineWidth = 3;`, directable: d }).map((f) => f.line), [3]);
  const js = `// sm-native-start: the stamp keeps its weight\nctx.lineWidth = 4;\nsvg("rect", { rx: 2 });\n// sm-native-end\nctx.lineWidth = 9;`;
  assert.deepEqual(lintSource({ js, directable: d }).map((f) => f.line), [5]);
  // a stray mention in code (not a comment) on the line above does not count
  assert.equal(lintSource({ js: `const tag = "sm-native";\nctx.lineWidth = 4;`, directable: d }).length, 1);
});

test("shapes and lines drawn with box-shadow are not corner style or elevation", () => {
  const css = ".pill { border-radius: 999px; } .dot { border-radius: 50%; } .sq { border-radius: 0; } .row { box-shadow: inset 0 -1px 0 var(--c-line); } .knock { box-shadow: 0 0 0 2.5px var(--c-paper); }";
  assert.deepEqual(lintSource({ css, directable: ["corner", "elevation"] }), []);
  assert.deepEqual(rules(lintSource({ css: ".c { border-radius: 8px; box-shadow: 0 8px 24px -12px rgba(0,0,0,.3); }", directable: ["corner", "elevation"] })), ["raw-radius", "raw-shadow"]);
});

test("SVG ellipses and pills are shapes, not corner style", () => {
  const corner = { directable: ["corner"] };
  assert.deepEqual(rules(lintSource({ js: `svg("ellipse", { cx: 4, rx: 74, ry: 30 }, s);`, ...corner })), []);
  assert.deepEqual(rules(lintSource({ js: `svg("rect", { x: 0, width: 124, height: 22, rx: 11 }, g);`, ...corner })), []);
  assert.deepEqual(rules(lintSource({ js: `svg("rect", { x: 0, width: 124, height: 22, rx: 6 }, g);`, ...corner })), ["raw-radius"]);
});
