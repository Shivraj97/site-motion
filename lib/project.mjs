// site-motion.json: one file per project that fixes the brand and the look, like shadcn's components.json.
// Every add, build, make and sync (and the MCP server) reads it, so every scene on the site matches.
//
//   { "version": 1, "tokens": "./brand.json", "style": "ink", "overrides": { "motif": "dot-grid" },
//     "dir": "public/motion", "scenes": ["ledger-stamp", "card-story"],
//     "plan": { "look": "ink", "slots": { "home.hero": { "scene": "ledger-stamp", "why": "…", "brief": "…" } } } }
//
// Precedence for each input: a CLI flag > the lockfile > the default (tokens "default", style "native").
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { createRequire } from "node:module";
import { loadStyle } from "./build.mjs";

const SMStyle = createRequire(import.meta.url)("../runtime/style.cjs");
export const PROJECT_FILE = "site-motion.json";

// Walk up from cwd to the filesystem root; the first site-motion.json wins.
export function findProject(cwd = process.cwd()) {
  let dir = resolve(cwd);
  for (;;) {
    const file = join(dir, PROJECT_FILE);
    if (existsSync(file)) return { file, dir, data: readProject(file) };
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

export function readProject(file) {
  let data;
  try { data = JSON.parse(readFileSync(file, "utf8")); } catch (error) { throw new Error(`${file}: not valid JSON (${error.message})`); }
  if (data.version !== 1) throw new Error(`${file}: unsupported version ${data.version} (expected 1)`);
  return { scenes: [], overrides: {}, ...data };
}

export function writeProject(file, data) {
  const ordered = { version: 1, tokens: data.tokens, style: data.style, overrides: data.overrides || {}, dir: data.dir, scenes: [...new Set(data.scenes || [])] };
  if (!Object.keys(ordered.overrides).length) delete ordered.overrides;
  // the site plan (site-motion plan): which scene goes in which section, kept until it's applied or replaced
  if (data.plan && Object.keys(data.plan.slots || {}).length) ordered.plan = data.plan;
  writeFileSync(file, JSON.stringify(ordered, null, 2) + "\n");
  return ordered;
}

// A path in the lockfile is relative to the lockfile; a preset name stays a name.
const fromProject = (project, ref) => (typeof ref === "string" && (ref.startsWith(".") || ref.includes("/")) && !isAbsolute(ref) ? join(project.dir, ref) : ref);
const toProject = (projectDir, ref, cwd) => {
  if (typeof ref !== "string") return ref;
  const abs = resolve(cwd, ref);
  if (!existsSync(abs)) return ref; // a preset name or a code
  const rel = relative(projectDir, abs);
  return rel.startsWith(".") ? rel : "./" + rel;
};

// The project's pack: the named style (preset, file or code) with its overrides applied, or null for native.
export function projectStyle(project) {
  const base = loadStyle(fromProject(project, project.data.style || "native"));
  const overrides = project.data.overrides || {};
  if (!Object.keys(overrides).length) return base;
  if (!base) throw new Error(`${project.file}: overrides need a style to override (style is "native")`);
  return SMStyle.normalize({ ...base, ...overrides, name: `${base.name}+` }, project.file);
}

// What a command should build with. cli.tokens / cli.style win over the lockfile.
export function resolveInputs({ project, cli = {} }) {
  const tokens = cli.tokens ?? (project ? fromProject(project, project.data.tokens) : undefined) ?? "default";
  const style = cli.style ?? (project ? projectStyle(project) : "native");
  return { tokens, style };
}

/**
 * Before an add: find the project, or create one locked to this scene's look (its meta.json "home" pack).
 * A --style that disagrees with an existing lockfile is an error: the whole point is one look per site.
 */
export function projectForAdd({ cwd = process.cwd(), meta = {}, cli = {}, dir }) {
  const found = findProject(cwd);
  if (found) {
    if (cli.style && cli.style !== found.data.style) {
      throw new Error(`this project's look is locked to "${found.data.style}" in ${found.file}. Change it for every scene with: site-motion style set ${cli.style}`);
    }
    return { project: found, created: false };
  }
  const file = join(resolve(cwd), PROJECT_FILE);
  const style = cli.style || meta.home || "native";
  const data = writeProject(file, { tokens: toProject(resolve(cwd), cli.tokens || "default", cwd), style, dir, scenes: [] });
  return { project: { file, dir: resolve(cwd), data: { scenes: [], overrides: {}, ...data } }, created: true };
}

export function recordScene(project, name) {
  const scenes = [...new Set([...(project.data.scenes || []), name])];
  project.data = writeProject(project.file, { ...project.data, scenes });
  return project;
}
