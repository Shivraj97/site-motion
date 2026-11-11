import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spill, findJumps, JUMP_GAP, framingVerdict } from "./layout.mjs";
import { lintSource } from "./lint-scene.mjs";
import { buildHtml } from "./build.mjs";

const steps = (dbs) => dbs.map((db, i) => ({ t: +(i / 15).toFixed(3), db }));

test("spill: inside is ≤ 0, outside reports the worst side", () => {
  const box = { left: 0, top: 0, right: 100, bottom: 40 };
  assert.ok(spill({ left: 10, top: 10, right: 90, bottom: 30 }, box) <= 0);
  assert.equal(spill({ left: 10, top: 10, right: 112, bottom: 30 }, box), 12);
  assert.equal(spill({ left: -3, top: 10, right: 50, bottom: 46 }, box), 6);
});

test("findJumps: one card appearing in a still scene is a jump", () => {
  const j = findJumps(steps([Infinity, Infinity, 45, Infinity, 19, Infinity, 44, Infinity, Infinity]));
  assert.equal(j.length, 1);
  assert.equal(j[0].db, 19);
});

test("findJumps: a camera coming to rest is not a jump (busy before, still after)", () => {
  assert.deepEqual(findJumps(steps([18.5, 20.1, 21.3, 24.4, 33.5, Infinity, Infinity])), []);
});

test("findJumps: a transition starting is not a jump (still before, busy after)", () => {
  assert.deepEqual(findJumps(steps([42.2, 39.7, 40.1, 21.9, 23.1, 27.9, 26.8])), []);
});

test("findJumps: a busy scene where every step is big has no jumps", () => {
  assert.deepEqual(findJumps(steps([22, 21, 23, 20, 22, 21, 22, 23])), []);
});

test("findJumps: a big step only slightly worse than its neighbours is not a jump", () => {
  assert.deepEqual(findJumps(steps([30, 30, 30, 30 - JUMP_GAP + 1, 30, 30, 30])), []);
});

test("ui-kit: a scene asks for it with @vendor and gets it inlined", () => {
  const html = buildHtml({ scene: "click-to-done", tokens: "default", style: "native" });
  assert.match(html, /window\.SMUI = \{ kit \}/);
});

test("ui-demo scenes keep the look rules", () => {
  for (const name of ["click-to-done", "dashboard-push", "phone-stack"]) {
    const dir = new URL(`../scenes/${name}/`, import.meta.url);
    const meta = JSON.parse(readFileSync(new URL("meta.json", dir), "utf8"));
    assert.equal(meta.family, "ui-demo");
    const findings = lintSource({ js: readFileSync(new URL("scene.js", dir), "utf8"), css: readFileSync(new URL("scene.css", dir), "utf8"), directable: meta.directable });
    assert.deepEqual(findings, [], `${name}: ${findings.map((f) => f.rule + " " + f.text).join("; ")}`);
  }
});

test("framing: big and off an edge passes; boxed or small fails; none and float are exempt", () => {
  assert.equal(framingVerdict({ fillW: 0.81, fillH: 0.98, off: ["bottom"] }).ok, true);
  assert.equal(framingVerdict({ fillW: 0.75, fillH: 0.82, off: [] }).ok, false, "air on all four sides");
  assert.equal(framingVerdict({ fillW: 0.4, fillH: 0.5, off: ["right"] }).ok, false, "too small");
  assert.equal(framingVerdict({ none: true }).ok, true);
  assert.equal(framingVerdict({ float: true }).ok, true);
});

const dataOf = (html) => JSON.parse(html.match(/<script id="sm-data" type="application\/json">(.*?)<\/script>/s)[1]);

test("views and play modes: a demo takes them; a fixed-stage scene refuses a view; unknown names throw", () => {
  const data = dataOf(buildHtml({ scene: "click-to-done", view: "compact", play: "once" }));
  assert.deepEqual(data.view, [720, 900]);
  assert.equal(data.play, "once");
  assert.equal(dataOf(buildHtml({ scene: "click-to-done" })).view, undefined);
  assert.throws(() => buildHtml({ scene: "loom", view: "compact" }), /product demos/);
  assert.throws(() => buildHtml({ scene: "click-to-done", view: "huge" }), /No view/);
  assert.throws(() => buildHtml({ scene: "click-to-done", play: "sometimes" }), /No play mode/);
});
