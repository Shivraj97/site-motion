import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { exportStyle, lookModel, mergeDesignMd, shadowLayers, FORMATS } from "./style-export.mjs";
import { listStyles, loadStyle, loadTokens, ROOT } from "./build.mjs";

const S = createRequire(import.meta.url)("../runtime/style.cjs");
const mint = loadTokens("default");

test("shadow strings parse into layers; no shadow is no layers", () => {
  assert.deepEqual(shadowLayers("0 0 0 0 transparent"), []);
  const [l] = shadowLayers("0 12px 32px -18px rgba(18,20,17,0.18)");
  assert.deepEqual([l.x, l.y, l.blur, l.spread, l.color.a], [0, 12, 32, -18, 0.18]);
  assert.equal(shadowLayers("0 1px 2px 0px rgba(0,0,0,0.1),0 4px 8px 0px rgba(0,0,0,0.2)").length, 2);
  assert.equal(shadowLayers("0 4px 0 0 #343633")[0].color.r, 0x34);
});

test("native has no shared look to export", () => {
  assert.throws(() => lookModel(null, mint), /native/);
});

test("the studio curves in style.cjs are the ones stage.js runs", () => {
  const stage = readFileSync(`${ROOT}/runtime/stage.js`, "utf8");
  for (const [role, b] of Object.entries(S.STUDIO_EASE)) assert.ok(stage.includes(`${role}: bezier(${b.join(", ")})`), role);
});

test("every pack exports in every format, on light and dark brands", () => {
  for (const name of listStyles()) for (const tokens of ["default", "night"]) for (const f of FORMATS) {
    const text = exportStyle(loadStyle(name), loadTokens(tokens), f);
    assert.ok(text.length > 400, `${name}/${tokens}/${f}`);
  }
});

test("css and tailwind carry the pack's own values", () => {
  const soft = loadStyle("soft-ui");
  const r = S.resolve(soft, mint);
  const css = exportStyle(soft, mint, "css");
  assert.ok(css.includes(`--sm-shadow-2: ${r.shadow[2]};`));
  assert.ok(css.includes(`--sm-radius-md: ${r.radius.md}px;`));
  assert.ok(css.includes(".sm-label {"));
  const tw = exportStyle(soft, mint, "tailwind");
  assert.match(tw, /@theme \{[\s\S]*--shadow-md: 0 12px 32px -18px/);
  assert.ok(tw.includes("@utility sm-label {"));
  assert.ok(!tw.includes("@utility sm-motif"), "soft-ui has no motif");
  // a flat look overrides Tailwind's shadows with its own "none", so cards really are flat
  assert.ok(exportStyle(loadStyle("ink"), mint, "tailwind").includes("--shadow-md: 0 0 #0000;"));
  assert.ok(exportStyle(loadStyle("ink"), mint, "tailwind").includes("@utility sm-motif {"));
});

test("tempo scales component durations; studio motion exports the built-in curves", () => {
  const ink = lookModel(loadStyle("ink"), mint);
  assert.deepEqual(ink.ease, S.STUDIO_EASE);
  assert.equal(ink.duration.base, 240);
  const languid = lookModel({ ...loadStyle("ink"), tempo: "languid" }, mint);
  assert.equal(languid.duration.base, 276);
});

test("dtcg follows the 2025.10 value shapes", () => {
  const doc = JSON.parse(exportStyle(loadStyle("dimensional"), mint, "dtcg"));
  const dim = (v) => typeof v.value === "number" && ["px", "rem"].includes(v.unit);
  const color = (v) => v.colorSpace === "srgb" && v.components.length === 3 && v.components.every((c) => c >= 0 && c <= 1);
  const checks = {
    color, dimension: dim,
    fontFamily: (v) => Array.isArray(v) && v.every((f) => typeof f === "string"),
    cubicBezier: (v) => v.length === 4 && v.every(Number.isFinite) && v[0] >= 0 && v[0] <= 1 && v[2] >= 0 && v[2] <= 1,
    duration: (v) => typeof v.value === "number" && ["ms", "s"].includes(v.unit),
    shadow: (v) => (Array.isArray(v) ? v : [v]).every((l) => color(l.color) && dim(l.offsetX) && dim(l.offsetY) && dim(l.blur) && dim(l.spread)),
    typography: (v) => Array.isArray(v.fontFamily) && dim(v.fontSize) && typeof v.fontWeight === "number" && dim(v.letterSpacing),
  };
  let n = 0;
  const walk = (node, path) => {
    if (node && typeof node === "object" && "$value" in node) {
      assert.ok(checks[node.$type], `${path}: unknown $type ${node.$type}`);
      assert.ok(checks[node.$type](node.$value), `${path}: bad ${node.$type} value ${JSON.stringify(node.$value)}`);
      n++;
      return;
    }
    for (const [k, v] of Object.entries(node || {})) if (!k.startsWith("$") && v && typeof v === "object") walk(v, `${path}.${k}`);
  };
  walk(doc, "");
  assert.ok(n > 30, `only ${n} tokens`);
  assert.equal(doc.$extensions["dev.site-motion"].code, S.encode(loadStyle("dimensional")));
});

test("DESIGN.md: only the marked section is ever replaced", () => {
  const ink = exportStyle(loadStyle("ink"), mint, "design-md");
  const field = exportStyle(loadStyle("field"), mint, "design-md");
  const mine = "# Acme\n\nOur own rules.\n";
  const once = mergeDesignMd(mine, ink);
  assert.ok(once.startsWith(mine.trimEnd()));
  const twice = mergeDesignMd(once, field);
  assert.equal(twice.split("site-motion:start").length, 2, "one section");
  assert.ok(twice.includes("Our own rules.") && twice.includes("**Field** look") && !twice.includes("**Ink** look"));
  assert.equal(mergeDesignMd(twice, field), twice, "idempotent");
  assert.ok(mergeDesignMd(null, ink).startsWith("# Design"));
});
