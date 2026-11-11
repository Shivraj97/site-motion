import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chooseLook, fit, parseBrief, planSite, sceneCatalog, sectionsFromHtml, sectionsFromPages } from "./plan.mjs";
import { writeProject } from "./project.mjs";

// concepts only: tests that need variants add fixture ones, so the library's own variants can't change what these expect
const scenes = sceneCatalog().filter((s) => !s.variantOf);
const byName = (n) => scenes.find((s) => s.name === n);

test("a brief: pages, roles, numbered slots and the product line", () => {
  const b = parseBrief(`# Acme: payouts\n\n## home\n- hero: Every payment approved\n- Connect your bank\n- feature: Route each payout\n\n## pricing\n- hero: Pay per payout`);
  assert.equal(b.product, "Acme: payouts");
  assert.deepEqual(b.sections.map((s) => s.slot), ["home.hero", "home.feature-1", "home.feature-2", "pricing.hero"]);
  assert.equal(b.sections[1].text, "Connect your bank");
  const j = parseBrief(JSON.stringify({ product: "x", pages: { home: ["hero: y"] } }));
  assert.deepEqual(j.sections.map((s) => s.slot), ["home.hero"]);
});

test("page templates give each page its usual sections", () => {
  assert.deepEqual(sectionsFromPages(["home", "pricing"]).map((s) => s.slot), ["home.hero", "home.feature-1", "home.feature-2", "home.feature-3", "home.proof", "pricing.hero"]);
});

test("live HTML: hero from the h1, menus and furniture skipped, broken markup survived", () => {
  const html = `<html><body>
    <div class="menu"><h2>Intake and integrations</h2><h2>Planning</h2></div>
    <svg class="logo" viewBox="0 0 10 10" /><template><style>.a{}</style>
    <h1><span>Time is money.</span> <span>Time is money.</span> <span>Time is money.</span> Save both.</h1></template>
    <p>Corporate cards and spend controls.</p>
    <h2>Join 50,000 companies growing faster</h2><p>Logos</p>
    <h2>Approve every payment</h2><p>Spend limits and policies, enforced.</p>
    <h2>Frequently asked questions</h2><p>…</p>
    <h2>Changelog</h2>
    <footer><h2>Company</h2></footer></body></html>`;
  const s = sectionsFromHtml(html, "home");
  assert.deepEqual(s.map((x) => [x.slot, x.heading]), [
    ["home.hero", "Time is money. Save both."],
    ["home.proof", "Join 50,000 companies growing faster"],
    ["home.feature", "Approve every payment"],
  ]);
});

test("words match at the start of a word, and a scene's main story counts most", () => {
  const galton = byName("galton-router");
  assert.equal(fit(galton, { text: "throughout the year", role: "feature" }).hits.includes("rout"), false);
  assert.ok(fit(galton, { text: "Route each payout", role: "feature" }).hits.includes("rout"));
  const hero = { text: "Every payment approved before money moves", role: "hero" };
  assert.ok(fit(byName("ledger-stamp"), hero).score > fit(galton, hero).score, "approvals is ledger-stamp's main story; payments is galton's second");
});

test("a plan uses each scene once, the home hero first, and says when a pick is weak", () => {
  const { sections, product } = parseBrief(`# Ledgerly: spend approvals and payouts
## home
- hero: Every payment approved before money moves
- feature: Connect your bank, ERP and cards
- feature: Route each payout to the processor most likely to accept it
- feature: Receipts and invoices read and coded automatically
## security
- hero: SOC 2, audit trails on every approval
## pricing
- hero: Pay per payout, not per seat`);
  // a fixed pool, so new scenes in the library (a compliance or pricing one) can't change what "weak" means here
  const POOL = ["ledger-stamp", "loom", "galton-router", "receipt-printer", "domino-run", "drop-pile", "grain-tally", "weather-board", "signal-field", "score-sheet", "lens-of-order", "bloom-flow"];
  const plan = planSite(sections, scenes.filter((s) => POOL.includes(s.name)), { product, available: ["ink", "soft-ui", "outline", "dimensional", "field"] });
  const pick = (slot) => plan.slots[slot].scene;
  assert.equal(pick("home.hero"), "ledger-stamp");
  assert.equal(pick("home.feature-1"), "loom");
  assert.equal(pick("home.feature-2"), "galton-router");
  assert.equal(pick("home.feature-3"), "receipt-printer");
  const used = Object.values(plan.slots).map((p) => p.scene);
  assert.equal(new Set(used).size, used.length, "each scene once");
  assert.equal(plan.slots["security.hero"].weak, true);
  assert.match(plan.slots["security.hero"].alt, /ledger-stamp fits better but is on home\.hero/);
  assert.equal(plan.slots["pricing.hero"].alt, undefined, "no better fit claimed from the product line alone");
  assert.equal(plan.look, "ink", "the look is the home hero's");
  assert.ok(Object.values(plan.slots).every((p) => p.follows), "scenes that follow looks are preferred");
});

test("the look falls back when the hero's home look doesn't exist", () => {
  const sections = [{ slot: "home.hero", page: "home", role: "hero", text: "" }, { slot: "home.feature", page: "home", role: "feature", text: "" }];
  const paper = { name: "fixture-paper", home: "paper", directable: ["stroke"], stories: [], featured: false, renderer: "SVG" };
  const slots = { "home.hero": { scene: "fixture-paper" }, "home.feature": { scene: "loom" } };
  assert.equal(chooseLook(slots, [...scenes, paper], sections, ["ink", "field"]), "field");
});

test("the lockfile keeps the plan", () => {
  const dir = mkdtempSync(join(tmpdir(), "sm-plan-"));
  try {
    const file = join(dir, "site-motion.json");
    writeProject(file, { tokens: "default", style: "ink", dir: "motion", scenes: [], plan: { look: "ink", slots: { "home.hero": { scene: "ledger-stamp" } } } });
    assert.equal(JSON.parse(readFileSync(file, "utf8")).plan.slots["home.hero"].scene, "ledger-stamp");
    writeProject(file, { tokens: "default", style: "ink", dir: "motion", scenes: [] });
    assert.equal(JSON.parse(readFileSync(file, "utf8")).plan, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// variants: fixtures hung off real concepts, so the concepts' scores stay the real ones
const variant = (parent, role, idea = role) => { const p = byName(parent); return { ...p, name: `${parent}--${idea}`, variantOf: parent, role, featured: false }; };

test("variants never compete: a concept wins the section, then its variant for that role stands in", () => {
  const withV = [...scenes, variant("ledger-stamp", "hero"), variant("loom", "cta")];
  const { sections, product } = parseBrief(`# Ledgerly\n## home\n- hero: Every payment approved before money moves\n- feature: Connect your bank, ERP and cards`);
  const plan = planSite(sections, withV, { product });
  assert.equal(plan.slots["home.hero"].scene, "ledger-stamp--hero");
  assert.equal(plan.slots["home.hero"].variantOf, "ledger-stamp");
  assert.match(plan.slots["home.hero"].why, /its hero variant/);
  assert.equal(plan.slots["home.feature"].scene, "loom", "loom's cta variant doesn't fit a feature, so the concept itself is used");
  const again = planSite(sections, scenes, { product });
  assert.equal(again.slots["home.hero"].scene, "ledger-stamp", "without variants nothing changes");
});

test("a proof section takes a trust or metrics variant; a brief can name a metrics section", () => {
  const withV = [...scenes, variant("ledger-stamp", "hero"), variant("ledger-stamp", "trust", "trail"), variant("ledger-stamp", "metrics", "month")];
  const { sections, product } = parseBrief(`# Ledgerly\n## home\n- hero: Every payment approved before money moves\n- proof: Audited by the big four\n- metrics: Payments signed this month`);
  assert.deepEqual(sections.map((s) => s.role), ["hero", "proof", "metrics"]);
  const plan = planSite(sections, withV, { product, motif: "ledger-stamp" });
  assert.equal(plan.slots["home.hero"].scene, "ledger-stamp--hero");
  assert.equal(plan.slots["home.proof"].scene, "ledger-stamp--trail", "proof prefers trust over metrics");
  assert.equal(plan.slots["home.metrics"].scene, "ledger-stamp--month");
  assert.match(plan.slots["home.proof"].why, /trust variant/);
});

test("one motif: the home page comes from one concept and its variants", () => {
  const withV = [...scenes, variant("loom", "feature", "pairs"), variant("loom", "cta")];
  const { sections, product } = parseBrief(`# Ledgerly\n## home\n- hero: Every payment approved before money moves\n- feature: Route each payout to the processor most likely to accept it\n- feature: Receipts read and coded automatically\n- cta: Start in an afternoon\n## pricing\n- hero: Pay per payout, not per seat`);
  const plan = planSite(sections, withV, { product, motif: "loom" });
  const pick = (slot) => plan.slots[slot].scene;
  assert.equal(pick("home.hero"), "loom");
  assert.equal(pick("home.feature-1"), "loom--pairs");
  assert.equal(pick("home.cta"), "loom--cta");
  assert.notEqual(pick("home.feature-2"), "loom", "one variant per role: the second feature is planned as usual");
  assert.ok(!["loom", "loom--pairs", "loom--cta"].includes(pick("pricing.hero")), "the motif is spent on home");
  assert.match(plan.slots["home.cta"].why, /one motif: loom's cta variant/);
  const auto = planSite(sections, withV, { product, motif: true });
  assert.equal(auto.slots["home.hero"].scene, "ledger-stamp", "motif: true takes the hero's best concept");
  assert.throws(() => planSite(sections, withV, { product, motif: "loom--cta" }), /not a concept/);
});

test("product demos are picked by name, never drawn on their own", () => {
  const { sections, product } = parseBrief(`# Ledgerly\n## home\n- hero: Every payment approved before money moves`);
  const demo = { name: "agent-checkout", title: "Pay", stories: ["payments", "approvals"], home: null, directable: [], family: "ui-demo" };
  const plan = planSite(sections, [...scenes.filter((s) => s.family !== "ui-demo"), demo], { product });
  assert.notEqual(plan.slots["home.hero"].scene, "agent-checkout");
});

test("the catalog reads a variant folder with its parent's stories", async () => {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const dir = mkdtempSync(join(tmpdir(), "sm-cat-"));
  try {
    const put = (name, meta) => { mkdirSync(join(dir, name)); writeFileSync(join(dir, name, "meta.json"), JSON.stringify(meta)); writeFileSync(join(dir, name, "scene.js"), ""); };
    put("loom", { story: "integrations", stories: ["integrations", "many-to-one"], home: "field", directable: ["stroke"] });
    put("loom--cta", { variantOf: "loom", role: "cta", differs: { layout: "one thread, centred", moment: "the thread becomes the button" }, directable: ["stroke"] });
    const v = sceneCatalog(dir).find((s) => s.name === "loom--cta");
    assert.deepEqual([v.stories, v.home, v.variantOf, v.role], [["integrations", "many-to-one"], "field", "loom", "cta"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("live HTML: long pages keep every section, and headings that name their job get that role", () => {
  const sections = ["How it works, in three steps", "Plans and pricing", "Security and compliance", "Customers love it", "Get started today"].map((h) => `<h2>${h}</h2><p>Body.</p>`);
  const filler = Array.from({ length: 8 }, (_, i) => `<h2>Feature number ${i + 1}</h2><p>Body.</p>`);
  const s = sectionsFromHtml(`<h1>Your back office, done</h1><p>Lede.</p>${filler.join("")}${sections.join("")}`, "home");
  assert.equal(s.length, 14, "a 14-section page is read to the end (the old cap was 6)");
  const role = (heading) => s.find((x) => x.heading === heading).role;
  assert.equal(role("Your back office, done"), "hero");
  assert.equal(role("How it works, in three steps"), "story");
  assert.equal(role("Plans and pricing"), "pricing");
  assert.equal(role("Security and compliance"), "trust");
  assert.equal(role("Customers love it"), "proof");
  assert.equal(role("Get started today"), "cta");
});

test("live HTML: an eyebrow above a heading names its role and joins its words; a lede sentence never does", () => {
  const html = `<h1>Your back office, done</h1><p>Agents run it while you sleep.</p>
    <section><p class="eyebrow">How it works</p><h2>Connect, set rules, sleep.</h2><p>Five steps.</p></section>
    <section><p class="eyebrow">Payments</p><h2>Your agent pays vendors by card.</h2><p>Inside its limit.</p></section>
    <section><span>Pricing</span><h2>Pay per closed task.</h2><p>Three plans.</p></section>
    <section><p>We read every invoice the moment it lands.</p><h2>Clean records out.</h2><p>Body.</p></section>`;
  const s = sectionsFromHtml(html, "home");
  const by = (heading) => s.find((x) => x.heading === heading);
  assert.equal(by("Connect, set rules, sleep.").role, "story");
  assert.equal(by("Pay per closed task.").role, "pricing");
  assert.match(by("Your agent pays vendors by card.").text, /^Payments: Your agent pays vendors by card\. /);
  assert.equal(by("Clean records out.").role, "feature");
  assert.doesNotMatch(by("Clean records out.").text, /We read every invoice:/);
});
