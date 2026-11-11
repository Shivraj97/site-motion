import { test } from "node:test";
import assert from "node:assert/strict";
import { brandColours, deltaE2000, elevationOf, lab, offPalette, oddOneOut } from "./style-score.mjs";
import { loadTokens } from "./build.mjs";

test("CIEDE2000 matches Sharma, Wu & Dalal's reference pairs", () => {
  const pairs = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
  ];
  for (const [a, b, want] of pairs) assert.ok(Math.abs(deltaE2000(a, b) - want) < 1e-3, `${deltaE2000(a, b)} vs ${want}`);
  assert.equal(deltaE2000(lab([10, 20, 30]), lab([10, 20, 30])), 0);
});

const image = (w, h, fill) => { const data = new Uint8Array(w * h * 4); for (let i = 0; i < w * h; i++) data.set([...fill(i % w, Math.floor(i / w)), 255], i * 4); return { width: w, height: h, data }; };

test("off-palette counts only colour the brand can't reach", () => {
  const mint = loadTokens("default");
  const labs = brandColours(mint);
  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  // paper, a 40% tint of the accent, and ink: all on brand
  const onBrand = image(60, 60, (x) => (x < 20 ? hex(mint.color.paper) : x < 40 ? hex(mint.color.accent).map((v, i) => v + (hex(mint.color.paper)[i] - v) * 0.4) : hex(mint.color.ink)));
  assert.equal(offPalette(onBrand, labs), 0);
  // half the frame in a saturated orange Mint never uses
  const offBrand = image(60, 60, (x) => (x < 30 ? [240, 110, 20] : hex(mint.color.paper)));
  assert.ok(Math.abs(offPalette(offBrand, labs) - 0.5) < 0.05);
});

test("elevation is a category: a sliver of shadow is still flat", () => {
  assert.equal(elevationOf(0), "flat");
  assert.equal(elevationOf(0.03), "flat");
  assert.equal(elevationOf(0.2), "casts shadows");
  assert.equal(elevationOf(null), null);
});

const row = (name, o = {}) => ({ name, line: 1.2, shadows: 0, corners: 4, palette: 0, labels: "mono caps", ...o });

test("a set that agrees has no odd one out, even with ordinary spread", () => {
  const rows = [row("a", { line: 1.5, corners: 3 }), row("b", { corners: 3 }), row("c", { line: 1 }), row("d", { corners: 6 }), row("e")];
  assert.deepEqual(oddOneOut(rows), []);
});

test("the odd one out is named, with the reason in a sentence", () => {
  const rows = [row("a"), row("b", { corners: 3 }), row("c", { corners: 6 }), row("soft", { shadows: 0.3, corners: 9, labels: "sans sentence" }), row("d")];
  const f = oddOneOut(rows);
  assert.deepEqual([...new Set(f.map((x) => x.name))], ["soft"]);
  assert.deepEqual(f.map((x) => x.key).sort(), ["corners", "elevation", "labels"]);
  assert.match(f.find((x) => x.key === "corners").sentence, /9px corners, where the others run 3–6px/);
  assert.match(f.find((x) => x.key === "elevation").sentence, /casts shadows, where the rest of the set is flat/);
});

test("colour drift and line weight flag only outside the others' range", () => {
  const rows = [row("a"), row("b", { palette: 0.001 }), row("c"), row("ledger", { palette: 0.06 }), row("heavy", { line: 3 })];
  const f = oddOneOut(rows);
  assert.ok(f.some((x) => x.name === "ledger" && x.key === "palette"));
  assert.ok(f.some((x) => x.name === "heavy" && x.key === "line"));
  assert.equal(f.length, 2);
});

test("a finding on an axis the scene doesn't follow says no look can fix it", () => {
  const rows = [row("a", { shadows: 0.3 }), row("b", { shadows: 0.4 }), row("c", { shadows: 0.2 }), row("flat", { shadows: 0, follows: ["stroke", "corner"] })];
  const [f] = oddOneOut(rows);
  assert.equal(f.name, "flat");
  assert.match(f.sentence, /doesn't follow elevation yet/);
});

test("metrics a scene can't show are skipped, not counted against it", () => {
  const rows = [row("a"), row("b"), row("canvas", { line: null, corners: null, shadows: null, labels: null }), row("c")];
  assert.deepEqual(oddOneOut(rows), []);
});
