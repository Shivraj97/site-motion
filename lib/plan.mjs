// plan: one scene per section of a whole site, all in one look, before anything is built.
// Sections come from page templates (--pages home,features,pricing), a brief (markdown or JSON an agent or a person
// writes), or a live site's own headings (--url). Each section is matched to the scene whose stories its words
// name; every scene is used once; scenes that follow looks are preferred so the set really is one look.
// Pure (no Chrome, no network): the CLI adds the contact sheet and fetching.
import { withParent } from "./variant.mjs";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./build.mjs";

// What a section of each kind of page usually needs. A slot is "<page>.<role>" (numbered when a role repeats).
export const PAGE_TEMPLATES = {
  home: ["hero", "feature", "feature", "feature", "proof"],
  features: ["hero", "feature", "feature", "feature"],
  product: ["hero", "feature", "feature", "feature"],
  solutions: ["hero", "feature", "feature"],
  pricing: ["hero"],
  security: ["hero", "feature"],
  integrations: ["hero"],
  about: ["story"],
  customers: ["proof"],
  platform: ["hero", "feature", "feature"],
};

// words in a section → the scene stories they point at (a word matches as a prefix: "integrat" ⊂ "integrations")
export const LEXICON = {
  approvals: ["approv", "sign-off", "signoff", "spend control", "spend", "limit", "authori", "policy", "policies", "controls"],
  compliance: ["complian", "audit", "soc 2", "soc2", "gdpr", "regulat", "hipaa", "iso 27001"],
  trust: ["trust", "secur", "safe", "verif", "tamper", "encrypt"],
  integrations: ["integrat", "connect", "sync", "your tools", "apps", "api", "plug", "stack you"],
  reliability: ["uptime", "reliab", "outage", "incident", "failover", "status", "resilien", "always on", "redundan"],
  automation: ["automat", "autopilot", "trigger", "no-code", "hands-free", "manual work", "busywork"],
  workflows: ["workflow", "steps", "pipeline", "process ", "processes"],
  routing: ["rout", "optimi", "smart", "best rate", "acceptance", "authorization rate"],
  payments: ["payment", "payout", "checkout", "transaction", "card", "billing", "invoice", "refund", "money"],
  "many-to-one": ["one place", "unif", "centrali", "consolidat", "single source", "everything in one", "all in one", "one inbox"],
  inbox: ["inbox", "queue", "request", "ticket"],
  metrics: ["metric", "analytic", "dashboard", "report", "insight", "kpi", "track", "measure"],
  scale: ["scale", "volume", "million", "billion", "growth", "real-time", "realtime"],
  "messy-to-structured": ["unstructured", "messy", "structur", "clean", "organi", "make sense", "extract", "parse", "receipt", "invoice", "read and", "coded", "ocr", "fields"],
  ai: [" ai", "ai-", "ai ", "llm", "machine learning", "model", "intelligen", "gpt"],
  classification: ["classif", "categori", "label", "tag", "sort"],
  data: ["data", "dataset", "pipeline", "warehouse", "etl"],
  architecture: ["architect", "layer", "edge", "latency", "under the hood", "how it works"],
  infrastructure: ["infrastructure", "server", "cloud", "deploy", "cluster", "region", "database"],
  platform: ["platform", "developer", "build on"],
  credit: ["credit", "contribut", "reward", "points", "recogni", "leaderboard"],
  community: ["community", "member", "open source", "contributor"],
  collaboration: ["collaborat", "team", "together", "comment", "share", "review together"],
  multiplayer: ["multiplayer", "live cursor", "real-time collaboration"],
  orchestration: ["orchestrat", "coordinat", "multi-agent", "multi agent"],
  agents: ["agent", "autonomous", "copilot", "assistant", "does the work"],
  product: ["product", "feature"],
  provenance: ["provenance", "citation", "source", "precedent"],
  knowledge: ["knowledge", "wiki", "docs", "documentation"],
  memory: ["memory", "remember", "recall", "context"],
  review: ["review", "redline", "contract", "clause", "legal"],
  documents: ["document", "pdf", "file", "contract", "form"],
  // stories added with the Tier A scenes (2026-11-06); prefixes kept narrow so they don't take older matches
  conversion: ["conversion", "convert", "funnel", "drop-off", "drop off", "sign-up rate", "signup rate", "activation"],
  search: ["search", "query", "queries", "find anything", "lookup", "results as you type"],
  engagement: ["engagement", "adoption", "heatmap", "where users", "where people", "session replay", "behaviour", "behavior"],
  branching: ["branch", "preview environment", "copy-on-write", "staging"],
  prediction: ["predict", "forecast", "early warning", "before they", "ahead of", "anticipat"],
  health: ["patient", "clinic", "biomarker", "blood test", "lab result", "longevity", "wellness", "preventive", "screening", "diagnos"],
  simplification: ["simplif", "before and after", "the old way", "fewer steps", "streamlin", "detour"],
  i18n: ["locali", "i18n", "translat", "language", "multilingual"],
  deploys: ["deploy", "release", "rollout", "roll out", "ci/cd", "push to main", "go live", "ship to production", "ship faster"],
  autoscaling: ["autoscal", "scale up", "scale down", "elastic", "capacity", "traffic spike", "serverless"],
  pricing: ["pricing", "price", "per seat", "per month", "per payout", "plans", "tier"],
  permissions: ["permission", "role", "access control", "rbac", "who can", "least privilege"],
  milestones: ["milestone", "year in review", "anniversar", "lifetime", "since 20"],
  changelog: ["changelog", "release notes", "what's new", "what’s new", "product update", "version"],
  migration: ["migrat", "import", "switch from", "move from", "bring your"],
  privacy: ["privacy", "pii", "redact", "anonymi", "personal data"],
  expenses: ["expense", "spend management", "reimburse", "corporate card"],
  payroll: ["payroll", "salar", "contractor", "global team", "hire anywhere", "time zone"],
  focus: ["focus", "calm", "noise", "distraction", "clarity"],
  theming: ["theming", "theme", "white-label", "white label", "rebrand", "your colours", "your colors", "customis", "customiz"],
  environments: ["environment", "preview", "roll back", "rollback", "production", "prod ", "pull request"],
  testing: ["testing", "test ", "tests ", "test suite", "unit test", "end-to-end", "e2e", "qa ", "quality assurance", "regression", "ci ", "catch bugs", "bugs ", "flaky"],
  observability: ["observab", "monitor", "tracing", "trace", "logs", "every run", "visibility", "pause", "retry"],
  reconciliation: ["reconcil", "match ", "matched", "mismatch", "discrepanc", "receiving", "purchase order", "three-way", "3-way"],
  retention: ["retention", "retain", "churn", "renewal", "at risk", "at-risk", "customer success", "health score", "win back", "win-back", "expansion"],
};
// what a role tends to want when the words don't say much
const ROLE_PRIOR = {
  hero: { featured: 1.2 },
  proof: { stories: { trust: 1.2, credit: 1, metrics: 1, reliability: 0.8, community: 0.8 } },
  story: { stories: { collaboration: 1, community: 1, credit: 0.6 } },
  metrics: { stories: { metrics: 1.2, scale: 1, conversion: 0.8 } },
};

// which variant roles can fill a section's role, in order of preference
const ROLE_STANDINS = { proof: ["proof", "trust", "metrics"], trust: ["trust", "proof"], metrics: ["metrics", "proof"] };

// ---------- scenes ----------
// variants come with their parent's stories (and home look, unless they set one); see lib/variant.mjs
export function sceneCatalog(root = join(ROOT, "scenes")) {
  const names = readdirSync(root).filter((n) => existsSync(join(root, n, "scene.js")) && existsSync(join(root, n, "meta.json")));
  const metas = Object.fromEntries(names.map((name) => [name, JSON.parse(readFileSync(join(root, name, "meta.json"), "utf8"))]));
  return names.map((name) => {
    const meta = withParent(metas[name], metas[metas[name].variantOf]);
    const content = existsSync(join(root, name, "content.json")) ? JSON.parse(readFileSync(join(root, name, "content.json"), "utf8")) : {};
    return { name, title: content.title || name, stories: meta.stories || [meta.story].filter(Boolean), home: meta.home || null, family: meta.family || null, directable: meta.directable || [], featured: !!meta.featured, renderer: meta.renderer || "", blurb: meta.blurb || "", eyebrow: content.eyebrow || "", ...(meta.variantOf ? { variantOf: meta.variantOf, role: meta.role } : {}) };
  }).filter((s) => s.stories.length);
}

// ---------- sections ----------
const norm = (s) => ` ${String(s).toLowerCase().replace(/[’']/g, "").replace(/\s+/g, " ")} `;

/** sections from page names: [{ slot, page, role, text }] */
export function sectionsFromPages(pages, about = "") {
  const out = [];
  for (const page of pages) {
    const roles = PAGE_TEMPLATES[page] || ["hero"];
    const seen = {};
    for (const role of roles) {
      seen[role] = (seen[role] || 0) + 1;
      const slot = roles.filter((r) => r === role).length > 1 ? `${page}.${role}-${seen[role]}` : `${page}.${role}`;
      out.push({ slot, page, role, text: `${page} ${about}`.trim() });
    }
  }
  return out;
}

/**
 * A brief, as markdown:            or JSON:
 *   # Acme: spend approvals          { "product": "…", "pages": { "home": ["hero: Every payment approved", …] } }
 *   ## home
 *   - hero: Every payment approved before it moves
 *   - feature: Connect your bank, ERP and cards
 * A line without "role:" is a feature. The first heading (#) is the product line, used to steer every section.
 */
export function parseBrief(text) {
  const t = String(text).trim();
  if (t.startsWith("{")) {
    const j = JSON.parse(t);
    return { product: j.product || "", sections: briefSections(Object.entries(j.pages || {}).map(([page, items]) => ({ page, items }))) };
  }
  let product = "", page = null;
  const pages = [];
  for (const line of t.split("\n")) {
    const h1 = /^#\s+(.+)/.exec(line), h2 = /^##+\s+(.+)/.exec(line), item = /^\s*[-*]\s+(.+)/.exec(line);
    if (h2) { page = { page: h2[1].trim().toLowerCase().replace(/\s+/g, "-"), items: [] }; pages.push(page); }
    else if (h1 && !product) product = h1[1].trim();
    else if (item) { if (!page) { page = { page: "home", items: [] }; pages.push(page); } page.items.push(item[1].trim()); }
  }
  return { product, sections: briefSections(pages) };
}
function briefSections(pages) {
  const out = [];
  for (const { page, items } of pages) {
    const parsed = items.map((it) => { const m = /^(hero|feature|proof|story|cta|pricing|trust|metrics)\s*[:–-]\s*(.+)$/i.exec(it); return m ? { role: m[1].toLowerCase(), text: m[2] } : { role: "feature", text: it }; });
    const counts = {};
    for (const p of parsed) counts[p.role] = (counts[p.role] || 0) + 1;
    const seen = {};
    for (const p of parsed) { seen[p.role] = (seen[p.role] || 0) + 1; out.push({ slot: counts[p.role] > 1 ? `${page}.${p.role}-${seen[p.role]}` : `${page}.${p.role}`, page, role: p.role, text: p.text, fromBrief: true }); }
  }
  return out;
}

/** A page's sections from its own HTML: the h1 (hero), then each h2 with the text under it. Navigation, footers,
 *  logo walls, FAQs and newsletter boxes are skipped. */
// depth 2 reads h1/h2 sections; depth 3 also reads h3 cards (a bento of features, a security/pricing pair). Then an h2
// that only introduces a run of h3 cards is a group title, not a slot: each card is matched on its own words.
export function sectionsFromHtml(html, page = "home", { max = 16, depth = 2 } = {}) {
  const H = depth >= 3 ? "h[1-3]" : "h[12]";
  // self-closing tags first: a lazy <svg …>…</svg> match from a `<svg … />` would run on to the next </svg> and
  // swallow everything in between (Ramp's hero <h1> went that way)
  // <template> is not stripped: frameworks stream real page content in it (Ramp's hero is inside one)
  // and a block that would swallow a heading was never closed where it should have been: drop its tag, keep the rest
  const strip = (h, tag) => h.replace(new RegExp(`<${tag}\\b[^>]*\\/>`, "gi"), " ").replace(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"), (m, inner) => (new RegExp(`<${H}\\b`, "i").test(inner) ? inner : " "));
  const clean = ["script", "style", "noscript", "svg"].reduce(strip, String(html)).replace(/<(nav|footer|header)\b(?!-)[\s\S]*?<\/\1>/gi, (m, tag) => (tag === "header" && /<h1/i.test(m) ? m.replace(/<nav[\s\S]*?<\/nav>/gi, " ") : " "));
  const text = (s) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
  // an eyebrow (a short label right above a heading: "Pricing", "How it works", "Security") often names the
  // section's job better than the heading does: carry it into the heading as a marker. Short means at most four
  // words and no closing full stop, so a lede sentence above the next heading is never taken for one. The label may
  // hold inline tags (`<p><span>[ 02 ]</span> How it works</p>`); an index like "[ 02 ]", "02" or "02 /" is dropped.
  const marked = clean.replace(new RegExp(`<(p|span|div|small)\\b[^>]*>((?:(?!<\\/?(?:p|div|section|article|h[1-6])\\b)[\\s\\S]){1,160}?)<\\/\\1>\\s*(<${H}\\b[^>]*>)`, "gi"), (m, tag, inner, h) => {
    const label = text(inner).replace(/^(\[\s*\d+\s*\]|\(?\d{1,2}\)?[.\/·—–-]?)\s*/, "").trim();
    return label && label.length <= 60 && label.split(/\s+/).length <= 4 && !/[.!?:]$/.test(label) ? `${h}<!--eyebrow:${label.replace(/--/g, " ")}-->` : m;
  });
  // a page with an <h1> starts there: h2s above it are menus, banners and announcement bars (Linear's mega-menu)
  const h1 = marked.search(/<h1\b/i);
  const parts = (h1 >= 0 ? marked.slice(h1) : marked).split(new RegExp(`(?=<${H}\\b)`, "i")).filter((p) => new RegExp(`^<${H}\\b`, "i").test(p));
  const out = [];
  const SKIP = /\b(faq|frequently asked|questions|newsletter|subscribe|logos?|as seen|press|careers|footer|cookie|changelog|blog|latest news|resources)\b/i;
  // social proof is a section of its own kind (it never becomes the hero)
  const PROOF = /\b(customers?|testimonial|loved by|case stud|results|trusted by|join [\d,.]+|[\d,.]+k?\+? (companies|teams|businesses|customers))\b/i;
  // a heading often names its own job on the page: those become pricing, trust, story (how it works) and cta slots
  const ROLES = [
    ["cta", /\b(get started|start (free|today|tonight|now|your)|try (it )?(free|now)|sign up|book a (demo|call)|ready to|join the waitlist)\b/i],
    ["pricing", /\b(pricing|plans? (and|&) pricing|simple plans|per (seat|month|user|task))\b/i],
    ["trust", /\b(security|secure by|trust|privacy|compliance|soc ?2|gdpr|hipaa)\b/i],
    ["story", /\b(how it works|in (three|four|five|\d) (simple )?steps|step by step|from .* to .* in)\b/i],
  ];
  let group = ""; // the title of the h2 that introduces the h3 cards being read
  for (const [pi, part] of parts.entries()) {
    const m = /^<h([1-3])[^>]*>([\s\S]*?)<\/h\1>([\s\S]*)$/i.exec(part);
    if (!m) continue;
    if (m[1] !== "3") group = "";
    const eyebrow = (/<!--eyebrow:([\s\S]*?)-->/.exec(m[2]) || [])[1]?.trim() || "";
    // responsive sites often print a heading twice (desktop and mobile spans): keep one copy; long ones are cut
    let heading = text(m[2]);
    // drop only the repeated run: "X X" → "X", "X X and more" → "X and more"; again until none is left ("X X X")
    for (let changed = true; changed;) {
      changed = false;
      const words = heading.split(" ");
      for (let n = 3; n <= words.length / 2; n++) if (words.slice(n, 2 * n).join(" ") === words.slice(0, n).join(" ")) { heading = [...words.slice(0, n), ...words.slice(2 * n)].join(" "); changed = true; break; }
    }
    if (heading.length > 160) heading = heading.slice(0, 157).replace(/\s+\S*$/, "") + "…";
    if (!heading || SKIP.test(heading)) continue;
    const body = text(m[3]).slice(0, 360);
    // an h2 with little of its own, right before h3 cards, is the cards' title (depth 3), kept on each card for reference
    if (m[1] === "2" && depth >= 3 && /^<h3\b/i.test(parts[pi + 1] || "") && body.length < 200) { group = `${eyebrow ? eyebrow + ": " : ""}${heading.replace(/[.!?]+$/, "")}`; continue; }
    const label = `${eyebrow} ${heading}`;
    const named = ROLES.find(([, re]) => re.test(label))?.[0];
    const role = m[1] === "1" && !out.some((s) => s.role === "hero") ? "hero" : PROOF.test(label) ? "proof" : named || "feature";
    out.push({ role, heading, text: `${eyebrow ? eyebrow + ": " : ""}${heading.replace(/[.!?]+$/, "")}. ${body}`, ...(group ? { group } : {}) });
    if (out.length >= max) break;
  }
  const first = out.find((s) => s.role !== "proof");
  if (first && !out.some((s) => s.role === "hero")) first.role = "hero";
  const counts = {}, seen = {};
  for (const s of out) counts[s.role] = (counts[s.role] || 0) + 1;
  return out.map((s) => { seen[s.role] = (seen[s.role] || 0) + 1; return { slot: counts[s.role] > 1 ? `${page}.${s.role}-${seen[s.role]}` : `${page}.${s.role}`, page, role: s.role, heading: s.heading, text: s.text }; });
}

// ---------- matching ----------
/** How well a scene fits a section, and the words that made it fit. */
// a lexicon word matches at the start of a word ("rout" in "route", never in "throughout")
const has = (text, word) => new RegExp(`(^|[^a-z0-9])${word.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${/\s$/.test(word) ? "(?![a-z])" : ""}`).test(text);
const STOP = new Set(["about", "their", "every", "which", "where", "these", "those", "there", "other", "after", "before", "with", "your", "from", "into", "onto", "each", "then", "than", "that", "this", "what", "when"]);

export function fit(scene, section, { product = "" } = {}) {
  const own = norm(section.text), steer = norm(product);
  let score = 0, ownScore = 0; // ownScore: from the section's own words only (no product line, no role prior)
  const hits = new Set();
  // a scene's main story (its first) is what it's about; the others are where else it fits
  scene.stories.forEach((story, i) => {
    const weight = i === 0 ? 3 : 1.5;
    for (const word of LEXICON[story] || [story]) {
      if (has(own, word)) { score += weight; ownScore += weight; hits.add(word.trim()); }
      else if (has(steer, word)) { score += weight * 0.3; hits.add(word.trim()); }
    }
  });
  // the section's own longer words in the scene's description ("payment" in ledger-stamp's blurb): a small nudge
  const blurb = norm(`${scene.title} ${scene.blurb}`);
  const shared = [...new Set(own.match(/[a-z]{5,}/g) || [])].filter((w) => !STOP.has(w) && has(blurb, w.slice(0, Math.max(5, w.length - 2))));
  score += Math.min(1.5, shared.length * 0.5);
  // the scene's own name for itself (its eyebrow, e.g. "Approvals") in the section is a strong hint
  if (scene.eyebrow && own.includes(norm(scene.eyebrow).trim())) { score += 1.5; ownScore += 1.5; hits.add(scene.eyebrow.toLowerCase()); }
  const prior = ROLE_PRIOR[section.role] || {};
  if (prior.featured && scene.featured) score += prior.featured;
  for (const story of scene.stories) score += prior.stories?.[story] || 0;
  return { score, ownScore, hits: [...hits] };
}

/**
 * Assign one scene per section. Greedy by confidence: the section with the clearest best match picks first, so a
 * section about integrations gets the loom before a vague feature slot takes it. A scene is used once while unused
 * ones remain. Scenes that can't follow looks score lower (−4) so the set stays one look. The home hero picks first:
 * it is the scene a visitor sees first, and the look is taken from it. Other heroes compete like any section.
 */
// equal scores: a featured scene, then 2D before 3D (the library is 2D-first), then the name, so a new scene never
// silently displaces an established one on a tie
const is3D = (scene) => /three/i.test(scene.renderer || "");
const tieBreak = (a, b) => (b.featured - a.featured) || (is3D(a) - is3D(b)) || a.name.localeCompare(b.name);

export function planSite(sections, scenes, { product = "", look = null, available = null, motif = null } = {}) {
  const used = new Set(); // concepts: a concept and its variants count as one
  const left = [...sections];
  const picks = {};
  // only concepts compete; once a concept wins a section, the variant built for that section's role stands in for it
  // a product demo shows one specific screen: it proves a feature when someone asks for it by name (plan swap), but
  // it isn't a stand-in for a section's story, so the planner never draws one on its own
  const concepts = scenes.filter((s) => !s.variantOf && s.family !== "ui-demo");
  const variants = {};
  for (const v of scenes.filter((s) => s.variantOf)) (variants[v.variantOf] ||= []).push(v);
  const usedVariants = new Set();
  // a variant built for this role, else for a role that does the same job (proof is the home page's evidence slot,
  // where a trust or a metrics variant belongs: ROLE_PRIOR.proof already leans to those stories)
  const forRole = (concept, role) => {
    const free = (variants[concept] || []).filter((v) => !usedVariants.has(v.name)).sort((a, b) => a.name.localeCompare(b.name));
    for (const r of ROLE_STANDINS[role] || [role]) { const v = free.find((x) => x.role === r); if (v) return v; }
  };
  const place = (section, concept, extra) => {
    const v = forRole(concept.name, section.role);
    if (v) usedVariants.add(v.name);
    const chosen = v || concept;
    used.add(concept.name);
    picks[section.slot] = { scene: chosen.name, ...(v ? { variantOf: concept.name } : {}), ...extra(v), follows: chosen.directable.length > 0, brief: section.heading || (section.fromBrief ? section.text : undefined) };
  };
  // one motif: the home page is built from one concept and its variants (the strongest pattern on the best sites).
  // The home hero gets the concept (or its hero variant); each other home section gets the variant for its role, if
  // there is one; sections with no variant are planned as usual.
  if (motif) {
    const home = sections.filter((s) => s.page === "home");
    const hero = home.find((s) => s.role === "hero") || home[0];
    const pick = typeof motif === "string" ? concepts.find((c) => c.name === motif) : hero && concepts.map((scene) => ({ scene, score: fit(scene, hero, { product }).score - (scene.directable.length ? 0 : 4) })).sort((a, b) => b.score - a.score || tieBreak(a.scene, b.scene))[0]?.scene;
    if (!pick) throw new Error(`motif: "${motif}" is not a concept (variants hang off a concept; pass the concept)`);
    for (const section of home) {
      if (section !== hero && !forRole(pick.name, section.role)) continue;
      place(section, pick, (v) => ({ why: v ? `one motif: ${pick.name}'s ${v.role} variant` : `one motif: ${pick.name}`, weak: false }));
      left.splice(left.indexOf(section), 1);
    }
  }
  const rank = (section) => concepts.map((scene) => {
    const f = fit(scene, section, { product });
    let s = f.score;
    if (!scene.directable.length) s -= 4;
    if (used.has(scene.name)) s -= 100;
    return { scene, score: s, own: f.ownScore, hits: f.hits };
  }).sort((a, b) => b.score - a.score || tieBreak(a.scene, b.scene));
  while (left.length) {
    // the section whose best option leads its second best by the most goes next
    let bestIdx = 0, bestGap = -Infinity, bestRank = null;
    left.forEach((section, i) => {
      const r = rank(section);
      const order = section.role === "hero" && section.page === "home" ? 1000 : 0;
      const gap = order + r[0].score - (r[1]?.score ?? 0) + r[0].score * 0.01;
      if (gap > bestGap) { bestGap = gap; bestIdx = i; bestRank = r; }
    });
    const section = left.splice(bestIdx, 1)[0];
    const top = bestRank[0];
    // a weak pick says which scene would have fit, if it's already taken (reuse it, or accept the stand-in)
    const taken = bestRank.find((r) => used.has(r.scene.name) && r.own >= 3);
    const where = taken && Object.entries(picks).find(([, p]) => (p.variantOf || p.scene) === taken.scene.name)?.[0];
    const why = top.hits.length ? `matches "${top.hits.slice(0, 3).join('", "')}" (${top.scene.stories.join(", ")})` : section.role === "hero" && top.scene.featured ? "a featured scene for the hero; nothing in the section named a story" : "no strong match: a general pick, check it";
    place(section, top.scene, (v) => ({
      why: v ? `${why}; its ${v.role} variant` : why,
      weak: top.score < 2,
      ...(top.score < 2 && where ? { alt: `${taken.scene.name} fits better but is on ${where}` } : {}),
    }));
  }
  // keep the sections' own order
  const ordered = Object.fromEntries(sections.map((s) => [s.slot, picks[s.slot]]));
  return { look: look || chooseLook(ordered, scenes, sections, available), slots: ordered };
}

/** No look locked yet: the hero's home look (the same rule as auto-lock on the first add), else the most common. */
export function chooseLook(slots, scenes, sections, available = null) {
  const ok = (name) => name && (!available || available.includes(name));
  const byName = Object.fromEntries(scenes.map((s) => [s.name, s]));
  const hero = sections.find((s) => s.role === "hero");
  const heroHome = hero && byName[slots[hero.slot]?.scene]?.home;
  if (ok(heroHome) && byName[slots[hero.slot].scene].directable.length) return heroHome;
  const counts = {};
  for (const p of Object.values(slots)) { const h = byName[p.scene]?.home; if (ok(h)) counts[h] = (counts[h] || 0) + 1; }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "ink";
}

export function planTable(plan) {
  const rows = Object.entries(plan.slots);
  const w = Math.max(14, ...rows.map(([slot]) => slot.length + 1));
  const lines = [`look ${plan.look}${plan.code ? ` (${plan.code})` : ""}`, ""];
  for (const [slot, p] of rows) {
    lines.push(`${slot.padEnd(w)} ${p.scene.padEnd(16)} ${p.weak ? "?  " : "   "}${p.why}${p.follows ? "" : "  [keeps its own look]"}${p.alt ? `; ${p.alt}` : ""}`);
    if (p.brief) lines.push(`${"".padEnd(w)} ${"".padEnd(16)}    “${p.brief.slice(0, 90)}”`);
  }
  return lines.join("\n");
}
