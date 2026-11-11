import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addScene, defaultAddDir, vendorsOf } from "./add.mjs";
import { buildHtml } from "./build.mjs";

const scratch = () => mkdtempSync(join(tmpdir(), "sm-add-"));

test("copies source, runtime and vendors, and the bundle matches a rebuild of the copy", () => {
  const cwd = scratch();
  const r = addScene({ scene: "domino-run", dir: "motion", tokens: "night", cwd });
  for (const f of ["scene.js", "scene.css", "content.json", "tokens.json", "index.html"]) assert.ok(existsSync(join(r.sceneOut, f)), f);
  for (const f of ["stage.js", "tokens.cjs", "matter.min.js"]) assert.ok(existsSync(join(r.runtimeOut, f)), f);
  assert.deepEqual(r.vendors, ["matter.min.js"]);
  const dev = readFileSync(join(r.sceneOut, "index.html"), "utf8");
  assert.match(dev, /\.\.\/runtime\/matter\.min\.js/);
  assert.equal(readFileSync(r.bundle, "utf8"), buildHtml({ scene: r.sceneOut, tokens: join(r.sceneOut, "tokens.json") }));
});

test("merges --content over the scene defaults", () => {
  const cwd = scratch();
  writeFileSync(join(cwd, "copy.json"), JSON.stringify({ eyebrow: "Payouts" }));
  const r = addScene({ scene: "ledger-stamp", dir: "motion", tokens: "mint", content: "copy.json", cwd });
  const content = JSON.parse(readFileSync(join(r.sceneOut, "content.json"), "utf8"));
  assert.equal(content.eyebrow, "Payouts");
  assert.ok(content.heading, "defaults kept");
});

test("refuses to overwrite an added scene without force", () => {
  const cwd = scratch();
  addScene({ scene: "ledger-stamp", dir: "motion", cwd });
  assert.throws(() => addScene({ scene: "ledger-stamp", dir: "motion", cwd }), /already exists/);
  assert.doesNotThrow(() => addScene({ scene: "ledger-stamp", dir: "motion", cwd, force: true }));
});

test("defaults to public/motion when the project has a public folder", () => {
  const cwd = scratch();
  assert.equal(defaultAddDir(cwd), "motion");
  mkdirSync(join(cwd, "public"));
  assert.equal(defaultAddDir(cwd), join("public", "motion"));
});

test("reads @vendor lines", () => {
  assert.deepEqual(vendorsOf("// @vendor three-full three-kit\nSiteMotion.scene({})"), ["three-full", "three-kit"]);
  assert.deepEqual(vendorsOf("SiteMotion.scene({})"), []);
});

test("a Pro scene missing from the public repo says so, with where to watch it", async () => {
  const { proNote } = await import("./build.mjs");
  const root = scratch();
  assert.equal(proNote("kpi-bento", root), null); // no PRO-SCENES.json: the full repo, nothing is Pro-only
  writeFileSync(join(root, "PRO-SCENES.json"), JSON.stringify({ site: "https://example.test", scenes: { "kpi-bento": "Revenue, four ways" } }));
  const note = proNote("kpi-bento", root);
  assert.match(note, /"kpi-bento" \(Revenue, four ways\) is a site-motion Pro scene/);
  assert.match(note, /https:\/\/example\.test\/scenes\/kpi-bento/);
  assert.equal(proNote("ledger-stamp", root), null);
});
