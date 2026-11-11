// Spawns the MCP server over stdio and talks JSON-RPC to it like a client would. No Chrome needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const SERVER = fileURLToPath(new URL("./server.mjs", import.meta.url));

// t: the test, so a failed assertion still stops the server (an orphaned child kept the suite alive for 15 minutes)
function client(cwd, t) {
  const proc = spawn(process.execPath, [SERVER], { cwd, stdio: ["pipe", "pipe", "pipe"] });
  t?.after(() => { if (proc.exitCode === null) proc.kill(); });
  const waiting = new Map();
  let next = 1;
  createInterface({ input: proc.stdout }).on("line", (line) => {
    const msg = JSON.parse(line); // every stdout line must be JSON-RPC
    if (msg.id !== undefined && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
  });
  return {
    request(method, params) {
      const id = next++;
      proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      return new Promise((done) => waiting.set(id, done));
    },
    notify(method, params) { proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n"); },
    close() { proc.stdin.end(); return new Promise((done) => proc.on("exit", done)); },
  };
}

test("initialize, tools/list and build_scene over stdio", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sm-mcp-test-"));
  const c = client(dir, t);
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const init = await c.request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
  assert.equal(init.result.protocolVersion, "2025-06-18");
  assert.equal(init.result.serverInfo.name, "site-motion");
  assert.ok(init.result.capabilities.tools);
  c.notify("notifications/initialized");

  const list = await c.request("tools/list", {});
  assert.deepEqual(list.result.tools.map((x) => x.name).sort(), ["build_scene", "export_style", "list_scenes", "plan_site", "render_scene", "theme_from_url"]);
  for (const tool of list.result.tools) assert.equal(tool.inputSchema.type, "object");

  const scenes = await c.request("tools/call", { name: "list_scenes", arguments: {} });
  assert.equal(scenes.result.isError, false);
  const ledger = scenes.result.structuredContent.scenes.find((s) => s.name === "ledger-stamp");
  assert.equal(ledger.story, "approvals");
  assert.ok(ledger.contentKeys.includes("heading"));
  assert.ok(scenes.result.structuredContent.tokenPresets.includes("mint"));

  const out = join(dir, "built", "ledger.html");
  const built = await c.request("tools/call", { name: "build_scene", arguments: { scene: "ledger-stamp", tokens: "mint", content: { heading: "Every refund\nchecked twice." }, out } });
  assert.equal(built.result.isError, false, built.result.content[0].text);
  assert.equal(built.result.structuredContent.file, out);
  const html = readFileSync(out, "utf8");
  assert.match(html, /<title>Ledger stamp<\/title>/);
  assert.match(html, /Every refund\\nchecked twice\./);
  assert.match(html, /#5bd96a/); // mint's accent

  // relative paths land in the server's working directory
  const rel = await c.request("tools/call", { name: "build_scene", arguments: { scene: "ledger-stamp", tokens: "mint" } });
  assert.equal(rel.result.isError, false);
  assert.ok(existsSync(join(dir, "out", "ledger-stamp-mint.html")));

  // a token object is validated by the same normaliser as files
  const badTokens = await c.request("tools/call", { name: "build_scene", arguments: { scene: "loom", tokens: { color: { paper: "#fff" }, palette: [] } } });
  assert.equal(badTokens.result.isError, true);
  assert.match(badTokens.result.content[0].text, /color\.surface is required/);

  const badScene = await c.request("tools/call", { name: "build_scene", arguments: { scene: "no-such-scene" } });
  assert.equal(badScene.result.isError, true);
  assert.match(badScene.result.content[0].text, /ledger-stamp/);

  const unknown = await c.request("tools/call", { name: "nope", arguments: {} });
  assert.equal(unknown.error.code, -32602);

  // theme_from_url refuses non-http(s) before anything runs
  const file = await c.request("tools/call", { name: "theme_from_url", arguments: { url: "file:///etc/passwd" } });
  assert.equal(file.result.isError, true);

  assert.equal((await c.request("ping")).result && true, true);
  assert.equal((await c.request("resources/list")).error.code, -32601);
  await c.close();
});

test("style packs: list_scenes reports them and the project; build_scene follows the project's lock", async (t) => {
  const { writeFileSync } = await import("node:fs");
  const dir = mkdtempSync(join(tmpdir(), "sm-mcp-style-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const c = client(dir, t);
  await c.request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });

  const bare = await c.request("tools/call", { name: "list_scenes", arguments: {} });
  const sc = bare.result.structuredContent;
  assert.deepEqual(sc.styles.map((s) => s.name).sort(), ["dimensional", "field", "ink", "outline", "soft-ui"]);
  assert.match(sc.styles[0].code, /^sm1\./);
  assert.equal(sc.project, null);
  assert.equal(sc.scenes.find((s) => s.name === "ledger-stamp").home, "ink");

  const explicit = await c.request("tools/call", { name: "build_scene", arguments: { scene: "card-story", style: "soft-ui", out: "a.html" } });
  assert.equal(explicit.result.isError, false, explicit.result.content[0].text);
  assert.equal(explicit.result.structuredContent.style.name, "soft-ui");

  const badStyle = await c.request("tools/call", { name: "build_scene", arguments: { scene: "card-story", style: { stroke: "thick" } } });
  assert.equal(badStyle.result.isError, true);
  assert.match(badStyle.result.content[0].text, /stroke must be one of/);

  // with a site-motion.json, leaving tokens and style out uses the project's brand and look
  writeFileSync(join(dir, "site-motion.json"), JSON.stringify({ version: 1, tokens: "mint", style: "ink", dir: "motion", scenes: [] }));
  const listed = await c.request("tools/call", { name: "list_scenes", arguments: {} });
  assert.equal(listed.result.structuredContent.project.style, "ink");
  const locked = await c.request("tools/call", { name: "build_scene", arguments: { scene: "card-story", out: "b.html" } });
  assert.equal(locked.result.isError, false, locked.result.content[0].text);
  assert.equal(locked.result.structuredContent.style.name, "ink");
  assert.match(readFileSync(join(dir, "b.html"), "utf8"), /#5bd96a/);

  // export_style: the project's look for the site's own components; DESIGN.md keeps the user's text
  const tw = await c.request("tools/call", { name: "export_style", arguments: { format: "tailwind" } });
  assert.equal(tw.result.isError, false, tw.result.content[0].text);
  assert.equal(tw.result.structuredContent.look.name, "ink");
  assert.match(tw.result.structuredContent.text, /@theme \{/);
  writeFileSync(join(dir, "DESIGN.md"), "# Ours\n\nKeep me.\n");
  const md = await c.request("tools/call", { name: "export_style", arguments: { format: "design-md", style: "outline", out: "DESIGN.md" } });
  assert.equal(md.result.isError, false, md.result.content[0].text);
  const doc = readFileSync(join(dir, "DESIGN.md"), "utf8");
  assert.ok(doc.includes("Keep me.") && doc.includes("**Outline** look"));
  const native = await c.request("tools/call", { name: "export_style", arguments: { style: "native" } });
  assert.equal(native.result.isError, true);
  await c.close();
});

test("plan_site: a brief becomes a plan in site-motion.json; swap changes a pick", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sm-mcp-plan-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const c = client(dir, t);
  await c.request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
  const brief = "# Acme: payouts\n## home\n- hero: Every payment approved before money moves\n- feature: Connect your bank and cards";
  const made = await c.request("tools/call", { name: "plan_site", arguments: { brief, sheet: false } });
  assert.equal(made.result.isError, false, made.result.content[0].text);
  const r = made.result.structuredContent;
  // the concepts win the sections, and the library's own variants for those roles stand in for them
  assert.equal(r.plan["home.hero"].scene, "ledger-stamp--hero");
  assert.equal(r.plan["home.hero"].variantOf, "ledger-stamp");
  assert.equal(r.look, "ink");
  assert.equal(JSON.parse(readFileSync(join(dir, "site-motion.json"), "utf8")).plan.slots["home.feature"].scene, "loom--feature");
  const swapped = await c.request("tools/call", { name: "plan_site", arguments: { action: "swap", slot: "home.feature", scene: "drop-pile" } });
  assert.equal(swapped.result.isError, false, swapped.result.content[0].text);
  assert.equal(swapped.result.structuredContent.plan["home.feature"].scene, "drop-pile");
  const bad = await c.request("tools/call", { name: "plan_site", arguments: { action: "swap", slot: "home.nope", scene: "loom" } });
  assert.equal(bad.result.isError, true);
  await c.close();
});
