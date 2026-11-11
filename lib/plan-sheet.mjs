// The plan's contact sheet: every planned section as its scene's poster frame, in the site's look and brand, on one
// image to approve before anything is added. One Chrome pass per scene gives both the frame and the measurements,
// so the sheet also carries the score's verdict (one look, or the odd one out and why).
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildHtml } from "./build.mjs";
import { launch } from "./chrome.mjs";
import { oddOneOut, scoreHtml } from "./style-score.mjs";
import { titleOf } from "./style-export.mjs";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const W = 1600, PAD = 48, GAP = 24, COLS = 3;
const CELL_W = Math.floor((W - PAD * 2 - GAP * (COLS - 1)) / COLS), IMG_H = Math.round((CELL_W * 9) / 16), CELL_H = IMG_H + 150;
const HEAD_H = 236, PAGE_H = 52, FOOT_H = 96;

/**
 * plan: { look, code?, slots }   pack: normalized style pack   tokens: token file/name (for buildHtml)
 * tokenSet: normalized tokens (for palette scoring)   title: what the sheet is for (product line or URL)
 * Returns { png, rows, findings }.
 */
export async function renderPlanSheet({ plan, pack, tokens, tokenSet, title = "", progress = () => {} }) {
  const tmp = mkdtempSync(join(tmpdir(), "sm-plan-"));
  const scenes = [...new Set(Object.values(plan.slots).map((p) => p.scene))];
  const shots = {}, rows = [];
  for (const [i, scene] of scenes.entries()) {
    progress(`${i + 1}/${scenes.length} ${scene}`);
    const html = join(tmp, `${scene}.html`);
    writeFileSync(html, buildHtml({ scene, tokens, style: pack || "native" }));
    const row = await scoreHtml(html, { name: scene, tokens: tokenSet, keepShot: true });
    writeFileSync(join(tmp, `${scene}.png`), row.png);
    shots[scene] = `${scene}.png`;
    delete row.png;
    rows.push(row);
  }
  const findings = rows.length >= 3 ? oddOneOut(rows) : [];

  const pages = {};
  for (const [slot, p] of Object.entries(plan.slots)) (pages[slot.split(".")[0]] ||= []).push([slot, p]);
  const height = HEAD_H + Object.values(pages).reduce((h, list) => h + PAGE_H + Math.ceil(list.length / COLS) * (CELL_H + GAP), 0) + FOOT_H;
  const verdict = !findings.length
    ? `<b class="ok">One look.</b> No scene stands out on line weight, elevation, corners, colour or labels.`
    : findings.every((f) => f.minor)
    ? `<b class="ok">Close to one look.</b> ${findings.slice(0, 2).map((f) => esc(f.sentence)).join(" ")}`
    : `<b class="warn">Odd one out: ${esc(findings[0].name)}.</b> ${findings.slice(0, 2).map((f) => esc(f.sentence)).join(" ")}`;
  const weak = Object.values(plan.slots).filter((p) => p.weak).length;
  const page = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;width:${W}px;height:${height}px;background:#f4f5f1;color:#121411;font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
.wrap{padding:${PAD}px ${PAD}px 0}.mono{font-family:ui-monospace,Menlo,monospace;font-size:12px;letter-spacing:.04em}
header{height:${HEAD_H - PAD}px;border-bottom:1px solid rgba(18,20,17,.16)}h1{margin:10px 0 8px;font-size:40px;line-height:1.1;font-weight:560;letter-spacing:-.02em}
.meta{color:#50554d}.verdict{margin-top:16px;padding:10px 14px;background:#fff;border:1px solid rgba(18,20,17,.12);font-size:14px}.ok{color:#1d7a34}.warn{color:#b3361f}
.page{height:${PAGE_H}px;display:flex;align-items:flex-end;padding-bottom:10px;text-transform:uppercase;color:#686d64}
.grid{display:grid;grid-template-columns:repeat(${COLS},${CELL_W}px);gap:${GAP}px}.cell{height:${CELL_H}px}
.cell img{display:block;width:${CELL_W}px;height:${IMG_H}px;object-fit:cover;border:1px solid rgba(18,20,17,.12);background:#fff}
.slot{margin-top:10px;display:flex;justify-content:space-between;color:#686d64}.flag{color:#b3361f}.title{margin-top:2px;font-size:17px;font-weight:560}
.brief{margin-top:2px;color:#50554d;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.why{margin-top:4px;color:#686d64;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
footer{height:${FOOT_H}px;display:flex;align-items:center;gap:32px;color:#50554d;border-top:1px solid rgba(18,20,17,.16);margin-top:${GAP}px}
</style></head><body><div class="wrap">
<header><div class="mono meta">SITE-MOTION PLAN · ${Object.keys(plan.slots).length} SECTIONS ON ${Object.keys(pages).length} PAGE${Object.keys(pages).length === 1 ? "" : "S"}${weak ? ` · ${weak} WEAK PICK${weak === 1 ? "" : "S"} (?)` : ""}</div>
<h1>${esc(title || "Your site, in one look")}</h1>
<div class="meta">Look <b>${esc(titleOf(plan.look))}</b>${plan.code ? ` <span class="mono">${esc(plan.code)}</span>` : ""} · brand <b>${esc(tokenSet.name || "custom")}</b> · every scene drawn as it will ship, with its default copy until you write yours</div>
<div class="verdict">${verdict}</div></header>
${Object.entries(pages).map(([name, list]) => `<div class="page mono">${esc(name)}</div><div class="grid">${list.map(([slot, p]) => `<div class="cell"><img src="${shots[p.scene]}">
<div class="slot mono"><span>${esc(slot)}</span><span class="flag">${p.weak ? "? check this pick" : ""}${p.follows === false ? " keeps its own look" : ""}</span></div>
<div class="title">${esc(p.scene)}</div>${p.brief ? `<div class="brief">“${esc(p.brief)}”</div>` : ""}<div class="why">${esc(p.alt || p.why)}</div></div>`).join("")}</div>`).join("")}
<footer class="mono"><span>APPROVE: site-motion plan apply</span><span>SWAP: site-motion plan swap &lt;slot&gt; &lt;scene&gt;</span><span>RE-DRAW: site-motion plan sheet</span></footer>
</div></body></html>`;
  const file = join(tmp, "sheet.html");
  writeFileSync(file, page);
  const tab = await launch({ width: W, height, scale: 1 });
  try {
    await tab.goto(pathToFileURL(file).href);
    await tab.eval(`Promise.all([...document.images].map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; })))`);
    return { png: await tab.shot(), rows, findings };
  } finally {
    tab.close();
  }
}
