import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { variantFindings, withParent, parentOf } from "./variant.mjs";
import { lintScene } from "./lint-scene.mjs";

const scenes = {
  "water-slide-funnel": { story: "conversion", stories: ["conversion", "funnel"], home: "field", directable: ["stroke"] },
  "water-slide-funnel--hero": { variantOf: "water-slide-funnel", role: "hero" },
};
const read = (n) => scenes[n] || null;
const rules = (name, meta) => variantFindings(name, meta, read).map((f) => f.rule);
const good = { variantOf: "water-slide-funnel", role: "hero", differs: { layout: "one huge slide, one rider, centred", moment: "the splash into Paid with the big number" } };

test("a well-formed variant passes", () => {
  assert.deepEqual(rules("water-slide-funnel--hero", good), []);
});

test("a concept is left alone, unless its folder name says it is a variant", () => {
  assert.deepEqual(rules("water-slide-funnel", scenes["water-slide-funnel"]), []);
  assert.deepEqual(rules("water-slide-funnel--cta", { story: "conversion" }), ["variant-meta"]);
});

test("parent: must exist, must be a concept, and the folder must be named after it", () => {
  assert.deepEqual(rules("ghost--hero", { ...good, variantOf: "ghost" }), ["variant-parent"]);
  assert.deepEqual(rules("water-slide-funnel--hero--cta", { ...good, variantOf: "water-slide-funnel--hero" }), ["variant-parent"]);
  assert.deepEqual(rules("slide-hero", good), ["variant-name"]);
});

test("role must be a planner role (plus metrics)", () => {
  assert.deepEqual(rules("water-slide-funnel--x", { ...good, role: "banner" }), ["variant-role"]);
  assert.deepEqual(rules("water-slide-funnel--x", { ...good, role: "metrics" }), []);
});

test("differs: at least two known axes, each said in a real line", () => {
  assert.deepEqual(rules("water-slide-funnel--x", { ...good, differs: { layout: "one huge slide, one rider" } }), ["variant-differs"]);
  assert.deepEqual(rules("water-slide-funnel--x", { ...good, differs: { layout: "one huge slide, one rider", colour: "night palette" } }), ["variant-differs", "variant-differs"]);
  assert.deepEqual(rules("water-slide-funnel--x", { ...good, differs: { layout: "big", moment: "x" } }), ["variant-differs"], "a word is not a line");
  assert.deepEqual(rules("water-slide-funnel--x", { ...good, differs: ["layout", "moment"] }), ["variant-differs"]);
});

test("a variant inherits its parent's story instead of setting one", () => {
  assert.deepEqual(rules("water-slide-funnel--x", { ...good, stories: ["growth"] }), ["variant-stories"]);
  const m = withParent(good, scenes["water-slide-funnel"]);
  assert.deepEqual(m.stories, ["conversion", "funnel"]);
  assert.equal(m.home, "field");
  assert.equal(withParent({ ...good, home: "ink" }, scenes["water-slide-funnel"]).home, "ink", "a variant may choose its own home look");
  assert.equal(parentOf("water-slide-funnel--weekly"), "water-slide-funnel");
  assert.equal(parentOf("loom"), null);
});

test("lint runs the variant rules on real folders", () => {
  const dir = mkdtempSync(join(tmpdir(), "sm-variant-"));
  try {
    const put = (name, meta) => { mkdirSync(join(dir, name)); writeFileSync(join(dir, name, "meta.json"), JSON.stringify(meta)); writeFileSync(join(dir, name, "scene.js"), ""); };
    put("water-slide-funnel", scenes["water-slide-funnel"]);
    put("water-slide-funnel--hero", good);
    put("water-slide-funnel--lazy", { variantOf: "water-slide-funnel", role: "cta", differs: { layout: "a smaller slide in the corner" } });
    assert.deepEqual(lintScene(join(dir, "water-slide-funnel--hero")).findings, []);
    assert.deepEqual(lintScene(join(dir, "water-slide-funnel--lazy")).findings.map((f) => f.rule), ["variant-differs"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
