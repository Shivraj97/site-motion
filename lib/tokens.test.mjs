import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const T = createRequire(import.meta.url)("../runtime/tokens.cjs");
const preset = (name) => T.normalize(createRequire(import.meta.url)(`../tokens/${name}.json`));

test("muted, and every derived text shade, reads at AA on the theme's own grounds", () => {
  for (const name of ["default", "mint", "ledger", "night"]) {
    const c = preset(name).color;
    for (const bg of [c.paper, c.surface, c.raised]) assert.ok(T.contrast(c.muted, bg) >= 4.5, `${name} muted on ${bg}`);
    for (const k of ["accentText", "positiveText", "warningText"]) assert.ok(T.contrast(c[k], c.surface) >= 4.5, `${name} ${k}`);
    assert.ok(T.contrast(c.onAccent, c.accentFill) >= 4.5, `${name} onAccent on accentFill`);
    assert.ok(T.contrast(c.onPositive, c.positive) >= 4.5, `${name} onPositive`);
    assert.ok(T.contrast(c.onWarning, c.warning) >= 4.5, `${name} onWarning`);
  }
});

test("a brand colour that already reads is kept exactly; one that has to move lands past the line, not on it", () => {
  const c = T.normalize({ color: { paper: "#ffffff", surface: "#ffffff", ink: "#111111", muted: "#555555", line: "#dddddd", accent: "#1a4fd6" }, palette: ["#eeeeee", "#dddddd", "#cccccc"] }).color;
  assert.equal(c.muted, "#555555");
  assert.equal(c.accentText, "#1a4fd6");
  const pale = T.textOn("#ffffff", "#9fd9a8");
  assert.ok(T.contrast(pale, "#ffffff") >= 4.6 && T.contrast(pale, "#ffffff") < 5.2, `aims a little past 4.5, got ${T.contrast(pale, "#ffffff").toFixed(2)}`);
});

test("inkOn picks the theme's ink on a pastel chip in a light theme, its paper on the same chip in a dark one", () => {
  const light = preset("default").color, dark = preset("night").color;
  assert.equal(T.inkOn("#d8cfb8", light), light.ink);
  assert.equal(T.inkOn("#d8cfb8", dark), dark.paper);
  const mid = T.inkOn("#5f6e78", dark); // neither the light ink nor the dark paper reads on this slate
  assert.ok(T.contrast(mid, "#5f6e78") >= 4.5);
});

test("palette CSS carries a readable text colour for each chip", () => {
  const t = preset("night");
  const css = T.css(t);
  t.palette.forEach((p, i) => {
    const on = css.match(new RegExp(`--p-${i}-on:(#[0-9a-f]{6})`))[1];
    assert.ok(T.contrast(on, p) >= 4.5, `--p-${i}-on on ${p}`);
  });
});
