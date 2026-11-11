import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findProject, projectForAdd, projectStyle, recordScene, resolveInputs, writeProject, PROJECT_FILE } from "./project.mjs";
import { addScene, syncScene } from "./add.mjs";

const scratch = () => mkdtempSync(join(tmpdir(), "sm-proj-"));

test("finds site-motion.json by walking up, and resolves paths relative to it", () => {
  const root = scratch();
  writeFileSync(join(root, "brand.json"), readFileSync(new URL("../tokens/mint.json", import.meta.url)));
  writeProject(join(root, PROJECT_FILE), { tokens: "./brand.json", style: "ink", dir: "public/motion" });
  const deep = join(root, "app", "src", "pages");
  mkdirSync(deep, { recursive: true });
  const p = findProject(deep);
  assert.equal(p.dir, root);
  assert.equal(resolveInputs({ project: p }).tokens, join(root, "brand.json"));
  assert.equal(findProject(scratch()), null);
});

test("precedence: a CLI flag beats the lockfile, the lockfile beats native", () => {
  const root = scratch();
  writeProject(join(root, PROJECT_FILE), { tokens: "night", style: "ink", dir: "motion" });
  const p = findProject(root);
  assert.equal(resolveInputs({ project: p }).style.name, "ink");
  assert.equal(resolveInputs({ project: p, cli: { style: "soft-ui" } }).style, "soft-ui");
  assert.equal(resolveInputs({ project: p, cli: { tokens: "mint" } }).tokens, "mint");
  assert.deepEqual(resolveInputs({ project: null }), { tokens: "default", style: "native" });
});

test("the first add locks the scene's home pack; a different --style later is refused", () => {
  const root = scratch();
  const first = projectForAdd({ cwd: root, meta: { home: "ink" }, dir: "motion" });
  assert.equal(first.created, true);
  assert.equal(first.project.data.style, "ink");
  const again = projectForAdd({ cwd: root, meta: { home: "soft-ui" }, dir: "motion" });
  assert.equal(again.created, false);
  assert.equal(again.project.data.style, "ink", "a second scene's home pack doesn't change the lock");
  assert.throws(() => projectForAdd({ cwd: root, meta: {}, cli: { style: "field" } }), /locked to "ink".*style set field/);
});

test("overrides change single knobs of the named pack", () => {
  const root = scratch();
  writeProject(join(root, PROJECT_FILE), { tokens: "default", style: "ink", overrides: { motion: "expressive" }, dir: "motion" });
  const pack = projectStyle(findProject(root));
  assert.equal(pack.stroke, "ink");
  assert.equal(pack.motion, "expressive");
  writeProject(join(root, PROJECT_FILE), { tokens: "default", style: "native", overrides: { motion: "expressive" }, dir: "motion" });
  assert.throws(() => projectStyle(findProject(root)), /overrides need a style/);
});

test("add writes style.json and records the scene; sync restyles it without touching the user's files", () => {
  const root = scratch();
  const { project } = projectForAdd({ cwd: root, meta: { home: "ink" }, dir: "motion" });
  const { tokens, style } = resolveInputs({ project });
  const r = addScene({ scene: "card-story", dir: "motion", tokens, style, cwd: root });
  recordScene(project, r.name);
  assert.equal(JSON.parse(readFileSync(join(r.sceneOut, "style.json"), "utf8")).name, "ink");
  assert.deepEqual(findProject(root).data.scenes, ["card-story"]);
  const userEdit = readFileSync(join(r.sceneOut, "content.json"), "utf8").replace('"', '"');
  writeFileSync(join(r.sceneOut, "content.json"), userEdit);
  const synced = syncScene({ sceneOut: r.sceneOut, tokens: "night", style: "soft-ui" });
  assert.equal(synced.style, "soft-ui");
  assert.equal(JSON.parse(readFileSync(join(r.sceneOut, "style.json"), "utf8")).name, "soft-ui");
  assert.equal(readFileSync(join(r.sceneOut, "content.json"), "utf8"), userEdit);
  assert.match(readFileSync(synced.bundle, "utf8"), /"name":"soft-ui"/);
});
