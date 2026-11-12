/* ledger-stamp--month: a month of approvals as a stamped calendar page (SVG + DOM). Metrics variant of ledger-stamp.
 * The parent's rubber stamp leaves the belt and works a desk calendar: day by day it stamps each working day's cell
 * APPROVED. A busier day collects more overlapping impressions (denser ink) and prints its payment count; a day
 * with held payments also gets an attention-coloured HELD mark, which a second approver's stamp clears a day or two later.
 * The total beside the page is the sum of the cells stamped so far (held ones count once they are cleared), so it
 * lands on content.total exactly when the last held payment is cleared. The month is sealed, then the page tears
 * off the pad, leaving the next, unprinted page; the loop opens by printing the month onto it.
 *
 * Every mark is a function of its event's contact time, computed once in setup from content (the schedule), so
 * any frame can be seeked. Frame 0 and frame D are the same blank page: at 0 the top page is in place with nothing
 * printed yet, at D it has fallen away and the identical page under it shows.
 */
(function () {
  const W = 1600, H = 900, D = 16;
  const PAGE = { x: 100, y: 118, w: 900, h: 700 };
  const GX = 120, GY = 246, GW = 860, GB = 800; // the day grid: left, top, width, bottom
  const T0 = 1.3, TLAST = 12.2, SEAL_T = 12.95, TEAR = 14.45, TEAR_DUR = 1.05;
  const DOWN = 0.06, HOLD = 0.05, UP = 0.11, GAP = 0.02; // a press: accelerate into the paper, hold, lift
  const IW = 96, IH = 32; // one impression of the stamp

  const hashOf = (str) => { let x = 2166136261; for (const ch of str) x = Math.imul(x ^ ch.charCodeAt(0), 16777619) >>> 0; return x.toString(16).padStart(8, "0").slice(0, 4); };
  const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  SiteMotion.scene({
    width: W,
    height: H,
    loop: 0,
    duration: D,
    still: 13.6,
    setup({ root, content, tokens, h }) {
      const { el, svg, mix, rng, ui } = h;
      const C = tokens.color, ink = ui.strokeColor(C.stroke || C.ink);
      const accentText = C.accentText || C.accent, warnText = C.attentionText || C.attention;
      root.classList.add("lsm");

      // ---------- the month, from content ----------
      const first = content.firstWeekday || 0, days = content.days || 30;
      const ROWS = Math.ceil((first + days) / 7), CW = GW / 7, CH = (GB - GY) / ROWS;
      const counts = content.counts || [];
      const heldBy = {};
      (content.held || []).forEach((x) => { heldBy[x.day] = x; });
      const cells = [];
      let w = 0;
      for (let d = 1; d <= days; d++) {
        const idx = first + d - 1, col = idx % 7, row = Math.floor(idx / 7);
        const work = col < 5;
        const count = work ? counts[w++] || 0 : 0;
        cells.push({ d, col, row, work, count, held: work && heldBy[d] ? heldBy[d].n : 0, x: GX + col * CW, y: GY + row * CH });
      }
      const total = cells.reduce((a, c) => a + c.count, 0);
      const work = cells.filter((c) => c.work);
      const lo = Math.min(...work.map((c) => c.count)), hi = Math.max(...work.map((c) => c.count));

      // ---------- the schedule: one event per working day, plus a clearing stamp after the day it names ----------
      const imp = (c) => [c.x + CW / 2, c.y + CH * 0.5];
      const heldAt = (c) => [c.x + 10, c.y + CH - 32];
      const clearAt = (c) => [c.x + 82, c.y + CH - 22];
      const trail = cells[cells.length - 1].row * 7 + cells[cells.length - 1].col < ROWS * 7 - 1; // an empty cell after the last day
      const park = trail ? [GX + 6.5 * CW, GY + (ROWS - 0.5) * CH] : [PAGE.x + PAGE.w - 70, PAGE.y + PAGE.h + 6];
      const plan = [];
      work.forEach((c) => {
        plan.push({ kind: "day", c, at: imp(c) });
        (content.held || []).forEach((x) => { if (x.clearedAfter === c.d) { const hc = cells[x.day - 1]; plan.push({ kind: "clear", c: hc, at: [clearAt(hc)[0] - 4, clearAt(hc)[1] - 8] }); } });
      });
      // travel time grows with distance; the whole run is fitted between T0 and TLAST
      let prev = park;
      const travel = plan.map((e) => { const dist = Math.hypot(e.at[0] - prev[0], e.at[1] - prev[1]); prev = e.at; return Math.min(0.5, Math.max(0.2, 0.13 + dist / 2400)); });
      const press = DOWN + HOLD + UP + GAP;
      const raw = travel.reduce((a, v) => a + v, 0) + plan.length * press;
      const k = Math.min(1, (TLAST - T0 - plan.length * press) / (raw - plan.length * press));
      let ts = T0;
      prev = park;
      plan.forEach((e, i) => {
        e.from = prev; e.ts = ts; e.tv = travel[i] * k; e.tc = ts + e.tv + DOWN; e.end = ts + e.tv + press;
        prev = e.at; ts = e.end;
      });
      const home = { from: prev, ts, tv: 0.42 };
      plan.forEach((e) => { if (e.kind === "day") e.c.tc = e.tc; else e.c.tClear = e.tc; });

      // ---------- copy and the total ----------
      const copy = el("div", "lsm-copy", root);
      el("div", "lsm-eyebrow", copy, content.eyebrow || "");
      el("div", "lsm-h", copy, content.heading || "");
      el("div", "lsm-sub", copy, content.sub || "");
      const metric = el("div", "lsm-metric", root);
      const numWrap = el("div", "lsm-num-wrap", metric);
      const num = el("div", "lsm-num", numWrap, "0");
      el("div", "lsm-num-label", metric, content.signedLabel || "payments signed");
      const stats = el("div", "lsm-stats", metric);
      const stat = (name) => { const s = el("div", "lsm-stat", stats); el("div", "lsm-stat-k", s, name); return el("div", "lsm-stat-v", s, "0"); };
      const [kUnsigned, kHeld, kCleared] = content.stats || ["Unsigned", "Held", "Cleared"];
      const vUnsigned = stat(kUnsigned), vHeld = stat(kHeld), vCleared = stat(kCleared);

      // ---------- the pad: a backing board, the edges of the pages below, an unprinted page, the month's page ----------
      const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "lsm-svg" }, root);
      const txt = (parent, attrs, cls, value = "") => { const n = svg("text", { ...attrs, class: cls }, parent); n.textContent = value; return n; };
      svg("rect", { x: PAGE.x - 14, y: PAGE.y - 22, width: PAGE.w + 28, height: PAGE.h + 46, rx: ui.radius("lg", 18), fill: C.raised || mix(C.paper, C.ink, 0.05), ...ui.strokeAttrs("regular", 1.5, C.line) }, s);
      for (let n = 2; n >= 1; n--) svg("rect", { x: PAGE.x + n * 2, y: PAGE.y + n * 5, width: PAGE.w - n * 4, height: PAGE.h, rx: ui.radius("md", 10), fill: C.surface, ...ui.strokeAttrs("regular", 1.5, C.line) }, s);
      const blank = (parent) => {
        svg("rect", { x: PAGE.x, y: PAGE.y, width: PAGE.w, height: PAGE.h, rx: ui.radius("md", 10), fill: C.surface, ...ui.strokeAttrs("regular", 1.5, ink) }, parent);
        // perforation the page tears along, just under the binding
        svg("line", { x1: PAGE.x + 16, x2: PAGE.x + PAGE.w - 16, y1: PAGE.y + 24, y2: PAGE.y + 24, stroke: C.faint || C.line, "stroke-width": ui.stroke("hair", 1), "stroke-dasharray": "3 5" }, parent);
        for (const col of [5, 6]) svg("rect", { x: GX + col * CW, y: GY, width: CW, height: GB - GY, fill: mix(C.surface, C.ink, 0.035) }, parent);
        txt(parent, { x: PAGE.x + PAGE.w - 22, y: PAGE.y + 74, "text-anchor": "end" }, "lsm-plabel", content.pageLabel || "");
        (content.weekdays || []).forEach((wd, n) => txt(parent, { x: GX + n * CW + 12, y: GY - 12 }, "lsm-wd", wd));
        let d = "";
        for (let r = 0; r <= ROWS; r++) d += `M${GX} ${(GY + r * CH).toFixed(1)}H${GX + GW}`;
        // the empty cells before day 1 are one field (the month's seal goes there)
        const merged = first >= 3 ? first : 0;
        for (let c = 1; c < 7; c++) d += `M${(GX + c * CW).toFixed(1)} ${(c < merged ? GY + CH : GY).toFixed(1)}V${GB}`;
        svg("path", { d, fill: "none", stroke: C.line, "stroke-width": ui.stroke("hair", 1) }, parent);
      };
      blank(svg("g", {}, s));
      const page = svg("g", {}, s);
      blank(page);

      // the month printed on the page
      const head = txt(page, { x: PAGE.x + 22, y: PAGE.y + 82 }, "lsm-month");
      const tMonth = svg("tspan", {}, head); tMonth.textContent = content.month || "";
      const tYear = svg("tspan", { dx: 14, class: "lsm-year" }, head); tYear.textContent = content.year || "";
      const R = rng(4127);
      const J = (a) => (R() * 2 - 1) * a;
      // sm-native-start: the stamp's impressions are the scene's data marks (their weight is the ink) and keep it
      cells.forEach((c) => {
        c.dayT = txt(page, { x: c.x + 12, y: c.y + 24 }, "lsm-day", String(c.d));
        if (!c.work) return;
        const dens = hi > lo ? (c.count - lo) / (hi - lo) : 0.5;
        const tint = mix(C.surface, C.accent, 0.03 + 0.3 * dens);
        const impInk = h.textOn(tint, accentText); // the impression's words read at AA on the day's ink
        c.tint = svg("rect", { x: c.x + 1, y: c.y + 1, width: CW - 2, height: CH - 2, fill: tint, opacity: 0 }, page);
        page.insertBefore(c.tint, c.dayT);
        const [cx, cy] = imp(c);
        c.cx = cx; c.cy = cy;
        // earlier impressions under the top one: none on the quietest day, five on the busiest
        c.ghosts = Array.from({ length: Math.round(dens * 5) }, () => svg("rect", { x: -IW / 2, y: -IH / 2, width: IW, height: IH, rx: 4, fill: "none", stroke: mix(C.accent, accentText, 0.5), "stroke-width": 2.2, opacity: 0, transform: `translate(${(cx + J(7)).toFixed(1)} ${(cy + J(5)).toFixed(1)}) rotate(${J(9).toFixed(1)})` }, page));
        c.rot = -3 + J(2.5);
        c.imp = svg("g", { opacity: 0 }, page);
        svg("rect", { x: -IW / 2, y: -IH / 2, width: IW, height: IH, rx: 4, fill: "none", stroke: impInk, "stroke-width": 2.4 }, c.imp);
        txt(c.imp, { x: 0, y: 5, "text-anchor": "middle", fill: impInk }, "lsm-imp", content.stampOk || "APPROVED");
        c.countT = txt(page, { x: c.x + CW - 12, y: c.y + 24, "text-anchor": "end", opacity: 0 }, "lsm-count", String(c.count));
        if (c.held) {
          const [hx, hy] = heldAt(c);
          c.heldG = svg("g", { opacity: 0, transform: `translate(${hx} ${hy}) rotate(-2)` }, page);
          svg("rect", { x: 0, y: 0, width: 62, height: 22, rx: 3, fill: mix(C.surface, C.attention, 0.14), stroke: C.attention, "stroke-width": 1.6 }, c.heldG);
          txt(c.heldG, { x: 31, y: 15.5, "text-anchor": "middle", fill: warnText }, "lsm-held", `${content.stampHeld || "HELD"} ${c.held}`);
          const [qx, qy] = clearAt(c);
          c.clearG = svg("g", { opacity: 0 }, page);
          svg("circle", { cx: 0, cy: 0, r: 12, fill: C.positive, stroke: C.surface, "stroke-width": 2 }, c.clearG);
          svg("path", { d: "M-5 0.5L-1.5 4L5.5 -4", fill: "none", stroke: C.onPositive || C.surface, "stroke-width": 2.2, "stroke-linecap": "round", "stroke-linejoin": "round" }, c.clearG);
          c.clearAt = [qx, qy];
        }
      });
      // sm-native-end

      // the month seal, in the empty cells before day 1 (or after the last day)
      const lead = first >= 3;
      const sx = lead ? GX + 52 : GX + ((first + days) % 7) * CW + 52, sy = lead ? GY + CH / 2 : GY + (ROWS - 0.5) * CH;
      const seal = svg("g", { opacity: 0 }, page);
      svg("circle", { r: 38, fill: C.accentFill || C.accent, stroke: ink, "stroke-width": ui.stroke("regular", 1.5) }, seal);
      svg("circle", { r: 32, fill: "none", stroke: C.onAccent || C.paper, "stroke-width": ui.stroke("hair", 1), "stroke-dasharray": "2.4 3", opacity: 0.8 }, seal);
      txt(seal, { x: 0, y: -1, "text-anchor": "middle" }, "lsm-seal", content.seal || "SEALED");
      txt(seal, { x: 0, y: 15, "text-anchor": "middle" }, "lsm-seal-hash", hashOf(`${content.month}${content.year}${total}`));
      const sealT = txt(page, { x: sx + 54, y: sy - 4, opacity: 0 }, "lsm-seal-title", content.sealTitle || "");
      const sealN = txt(page, { x: sx + 54, y: sy + 18, opacity: 0 }, "lsm-seal-note", content.sealNote || "");

      // ---------- the binding the pages hang from ----------
      // sm-native-start: the binding and the stamp are the scene's motif: their own weights and corners in every look
      svg("rect", { x: PAGE.x - 6, y: PAGE.y - 16, width: PAGE.w + 12, height: 30, rx: 6, fill: C.ink }, s);
      for (let n = 0; n < 12; n++) svg("rect", { x: PAGE.x + 44 + n * ((PAGE.w - 100) / 11), y: PAGE.y - 7, width: 12, height: 12, rx: 6, fill: mix(C.ink, C.paper, 0.35) }, s);

      // ---------- the stamp, seen from above ----------
      const stamp = svg("g", {}, s);
      const shadow = svg("rect", { x: -58, y: -24, width: 116, height: 48, rx: 10, fill: C.ink }, stamp);
      const body = svg("g", {}, stamp);
      svg("rect", { x: -58, y: -24, width: 116, height: 48, rx: 10, fill: C.ink }, body);
      svg("rect", { x: -54, y: 17, width: 108, height: 5, rx: 2.5, fill: C.accent }, body);
      svg("rect", { x: -44, y: -15, width: 88, height: 26, rx: 6, fill: mix(C.ink, C.paper, 0.16) }, body);
      svg("circle", { r: 9, cy: -2, fill: mix(C.ink, C.paper, 0.4) }, body);
      // sm-native-end

      return { cells, plan, home, park, total, page, head, seal, sealT, sealN, sx, sy, stamp, shadow, body, num, numWrap, stats, vUnsigned, vHeld, vCleared };
    },

    render(t, S, h) {
      const { ease, clamp, lerp, tw, set, text } = h;
      const pressed = (tc) => t >= tc;
      const land = (tc, dur = 0.14) => ease.snappy(clamp((t - tc) / dur)); // a mark lands slightly large and settles

      // the tear: the left corner lets go first, then the page drops away; at D it is gone and the blank page shows
      const p = clamp((t - TEAR) / TEAR_DUR);
      const a1 = ease.inOut(clamp(p / 0.45)), a2 = clamp((p - 0.3) / 0.7);
      const ang = -5 * a1 - 8 * a2 * a2, dy = 170 * a2 * a2;
      set(S.page, { transform: p > 0 ? `translate(0 ${dy.toFixed(1)}) rotate(${ang.toFixed(2)} ${PAGE.x + PAGE.w} ${PAGE.y + 14})` : "", opacity: (1 - clamp((p - 0.4) / 0.6)).toFixed(3) });

      // the month prints at the start: name, then day numbers row by row
      set(S.head, { opacity: tw(t, 0.15, 0.7, "signature").toFixed(3) });
      S.cells.forEach((c) => {
        const at = 0.3 + h.motion.stagger(c.row, 0.08) + c.col * 0.025;
        set(c.dayT, { opacity: tw(t, at, 0.45, "soft").toFixed(3) });
        if (!c.work) return;
        const on = pressed(c.tc);
        const l = land(c.tc);
        set(c.tint, { opacity: on ? (0.4 + 0.6 * l).toFixed(3) : 0 });
        set(c.imp, { opacity: on ? 1 : 0, transform: `translate(${c.cx.toFixed(1)} ${c.cy.toFixed(1)}) rotate(${c.rot.toFixed(2)}) scale(${(1.12 - 0.12 * l).toFixed(3)})` });
        c.ghosts.forEach((g, n) => set(g, { opacity: (0.4 * clamp((t - c.tc - 0.04 - n * 0.05) / 0.12)).toFixed(3) }));
        set(c.countT, { opacity: tw(t, c.tc + 0.04, 0.3, "soft").toFixed(3) });
        if (c.held) {
          set(c.heldG, { opacity: on ? 1 : 0 });
          const q = land(c.tClear);
          set(c.clearG, { opacity: pressed(c.tClear) ? 1 : 0, transform: `translate(${c.clearAt[0]} ${c.clearAt[1]}) scale(${(1.25 - 0.25 * q).toFixed(3)})` });
        }
      });

      // the seal closes the month
      const sl = land(SEAL_T, 0.16);
      set(S.seal, { opacity: t >= SEAL_T ? 1 : 0, transform: `translate(${S.sx} ${S.sy}) rotate(-8) scale(${(1.15 - 0.15 * sl).toFixed(3)})` });
      set(S.sealT, { opacity: tw(t, SEAL_T + 0.12, 0.5, "soft").toFixed(3) });
      set(S.sealN, { opacity: tw(t, SEAL_T + 0.12 + h.motion.stagger(1, 0.08), 0.5, "soft").toFixed(3) });

      // the stamp: lifted while it travels, pressed at each event, home to its corner when the month is done
      let pos = S.park, lift = 0;
      const ev = S.plan.find((e) => t >= e.ts && t < e.end);
      if (ev) {
        const u = t - ev.ts;
        if (u < ev.tv) {
          const m = ease.inOut(clamp(u / ev.tv));
          pos = [lerp(ev.from[0], ev.at[0], m), lerp(ev.from[1], ev.at[1], m)];
          lift = ev === S.plan[0] ? ease.soft(clamp(u / 0.12)) : 1;
        } else {
          pos = ev.at;
          const v = u - ev.tv;
          lift = v < DOWN ? 1 - (v / DOWN) ** 2 : v < DOWN + HOLD ? 0 : ease.inOut(clamp((v - DOWN - HOLD) / UP));
        }
      } else if (t >= S.home.ts) {
        const u = t - S.home.ts;
        const m = ease.inOut(clamp(u / S.home.tv));
        pos = [lerp(S.home.from[0], S.park[0], m), lerp(S.home.from[1], S.park[1], m)];
        lift = 1 - ease.soft(clamp((u - S.home.tv) / 0.22));
      }
      set(S.stamp, { transform: `translate(${pos[0].toFixed(1)} ${pos[1].toFixed(1)})` });
      set(S.body, { transform: `scale(${(1 + 0.1 * lift).toFixed(3)})` });
      set(S.shadow, { transform: `translate(${(3 + 10 * lift).toFixed(1)} ${(4 + 13 * lift).toFixed(1)})`, opacity: (0.16 - 0.06 * lift).toFixed(3) });

      // the total: the stamped cells, held payments counted once they are cleared; the next page starts at 0
      let signed = 0, unsigned = 0, held = 0, cleared = 0, last = -1;
      S.cells.forEach((c) => {
        if (!c.work || !pressed(c.tc)) return;
        signed += c.count - c.held; unsigned += c.held; held += c.held; last = Math.max(last, c.tc);
        if (c.held && pressed(c.tClear)) { signed += c.held; unsigned -= c.held; cleared += c.held; last = Math.max(last, c.tClear); }
      });
      const fresh = t >= TEAR + 0.35;
      if (fresh) signed = unsigned = held = cleared = 0;
      text(S.num, fmt(signed));
      text(S.vUnsigned, String(unsigned));
      text(S.vHeld, String(held));
      text(S.vCleared, String(cleared));
      if (S.vUnsigned.dataset.kind !== (unsigned ? "held" : "ok")) S.vUnsigned.dataset.kind = unsigned ? "held" : "ok";
      const fade = t < TEAR ? 1 : t < TEAR + 0.35 ? 1 - ease.soft(clamp((t - TEAR) / 0.3)) : ease.soft(clamp((t - TEAR - 0.4) / 0.4));
      const bump = last >= 0 && !fresh ? 1 - ease.snappy(clamp((t - last) / 0.3)) : 0;
      S.numWrap.style.opacity = fade.toFixed(3);
      S.stats.style.opacity = fade.toFixed(3);
      S.numWrap.style.transform = `translateY(${(-6 * bump).toFixed(2)}px)`;
    },
  });
})();
