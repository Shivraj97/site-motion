import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adoptTokens, findProject, projectForAdd, projectStyle, recordScene, resolveInputs, startTokens, writeProject, PROJECT_FILE } from "./project.mjs";
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

test("recordScene keeps a demo's view and play, and a plain re-add drops them", () => {
  const root = scratch();
  writeProject(join(root, PROJECT_FILE), { tokens: "mint", style: "soft-ui", dir: "motion" });
  const p = findProject(root);
  recordScene(p, "agent-checkout", { view: "card", play: "once" });
  assert.deepEqual(findProject(root).data.embeds, { "agent-checkout": { view: "card", play: "once" } });
  recordScene(p, "agent-checkout", { view: null, play: null });
  assert.equal(findProject(root).data.embeds, undefined);
  assert.deepEqual(findProject(root).data.scenes, ["agent-checkout"]);
});

test("adding a variant first locks the project to its concept's look, not native", async () => {
  const { execFileSync } = await import("node:child_process");
  const root = scratch();
  execFileSync(process.execPath, [new URL("../bin/site-motion.mjs", import.meta.url).pathname, "add", "score-sheet--hero", "--tokens", "mint"], { cwd: root, stdio: "pipe" });
  const p = findProject(root);
  assert.equal(p.data.style, "ink"); // score-sheet's home pack
  assert.ok(existsSync(join(root, "motion", "score-sheet--hero.html")));
});

test("a new project takes --tokens, else a brand.json in the folder, else says it is on the default", () => {
  const root = mkdtempSync(join(tmpdir(), "sm-start-"));
  assert.deepEqual(startTokens(root), { tokens: "default", from: "default" });
  writeFileSync(join(root, "brand.json"), "{}");
  assert.deepEqual(startTokens(root), { tokens: "./brand.json", from: "found" });
  writeFileSync(join(root, "other.json"), "{}");
  assert.deepEqual(startTokens(root, join(root, "other.json")), { tokens: "./other.json", from: "given" });
  assert.equal(startTokens(root, "ledger").tokens, "ledger");
  // the first add in a folder with a brand.json uses it, not the default
  const { project } = projectForAdd({ cwd: root, meta: { home: "ink" }, dir: "motion" });
  assert.equal(project.data.tokens, "./brand.json");
});

test("a project still on the default brand adopts the first tokens it is given, so sync keeps them", () => {
  const root = mkdtempSync(join(tmpdir(), "sm-adopt-"));
  writeFileSync(join(root, "brand.json"), "{}");
  const file = join(root, PROJECT_FILE);
  writeProject(file, { tokens: "default", style: "ink", dir: "motion", scenes: [] });
  const project = findProject(root);
  assert.equal(adoptTokens(project, undefined, root), false);
  assert.equal(adoptTokens(project, "brand.json", root), "./brand.json");
  assert.equal(JSON.parse(readFileSync(file, "utf8")).tokens, "./brand.json");
  assert.equal(resolveInputs({ project: findProject(root) }).tokens, join(root, "brand.json"));
  // a real brand is never replaced by a later --tokens
  assert.equal(adoptTokens(findProject(root), "ledger", root), false);
  assert.equal(findProject(root).data.tokens, "./brand.json");
});
