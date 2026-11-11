/* pigeonhole-wall: memory shown as filing, in flat elevation (SVG + DOM).
 * A wall of six labelled pigeonholes (3 × 2), drawn as ruled cells, each showing one top document. Documents rise
 * out of an intake tray, travel along a corridor under the wall and up into their pigeonhole; the card already
 * there is pushed back and leaves. Then a request arrives: the three items it needs travel out to the request
 * card, each tethered to its source by a hairline, and each § mark commits from pending (outline) to verified
 * (filled). They travel home, leaving their titles in the request as its verified sources. A ledger lists the
 * latest filings. One focal action at a time: a filing phase, then a request, twice per loop.
 *
 * Typeset for a 1600 × 900 stage shown at ~1200 px wide: titles, the request and plate labels ≥ 24 px, tags and
 * ledger rows ≥ 18 px, ornament ≥ 15 px.
 *
 * Timing is a pure function of t. The loop of D seconds is split into one segment per request. In each segment
 * the filed items assigned to it (items in order, split evenly) land GAP apart, then the request arrives. Items
 * marked `resident` are never filed: they sit in their pigeonhole for good (give a pigeonhole either one resident
 * item or two or more filed ones, so its top card at the seam is the one it started with). Filings and requests
 * repeat every D, so frame D equals frame 0, at rest, with the last request's sources showing.
 * Motion verbs only: travel (transform), draw (stroke-dasharray), commit (pending → verified), reveal
 * (opacity + ≤ 12 px). Nothing scales, rotates or counts up.
 */
(function () {
  const W = 1600, H = 900, D = 24;
  const CARD_H = 120, FAN = 76, PUSH_DY = 18; // card height; request fan pitch (one title strip); push-back of the old card
  const FLIGHT = 1.4, PUSH = 0.36, LEAD = 0.12, GAP = 1.6; // intake → pigeonhole; push of the older card; spacing of filings
  // a request's timeline, in seconds from its arrival (120 ms tick)
  const SWAP = 0.36, OUT0 = 0.6, STAG = 0.24, OUT_D = 1.2, COMMIT0 = 2.64, COMMIT_STEP = 0.36, RESULT = 3.48, BACK0 = 4.8, BACK_D = 1.08;
  const REQ_SPAN = 6.6; // arrival → last card home (6.36 s) plus a beat

  SiteMotion.scene({
    width: W,
    height: H,
    loop: 0,
    duration: D,
    still: 9.6,
    setup({ root, content, tokens, h }) {
      const { el, svg, mix, alpha, ui } = h;
      const C = tokens.color;
      const ink = C.ink;
      const redline = C.redline || C.warningText || C.warning;
      const pending = C.pending || C.faint;
      const verified = C.accentText || C.accent;
      const rule = alpha(ink, 0.16), ruleSoft = alpha(ink, 0.08);
      const cellFill = mix(C.paper, ink, 0.022);
      // the look: object outlines (carcass, cards, tray) take the pack's line colour and weight; the soft inner rules
      // keep their tint and take only the hairline weight; corners take the pack's radii (native: square)
      const edge = ui.strokeColor(rule);
      const W_HAIR = ui.stroke("hair", 1), W_FINE = ui.stroke("fine", 1), W_REG = ui.stroke("regular", 1);
      const R_SM = ui.radius("sm", 0), R_MD = ui.radius("md", 0);
      const rx = (r) => (r > 0 ? { rx: r } : {});
      root.classList.add("ph");
      root.style.setProperty("--ph-rule", rule);
      root.style.setProperty("--ph-rule-soft", ruleSoft);
      root.style.setProperty("--ph-pending", pending);
      root.style.setProperty("--ph-verified", verified);
      root.style.setProperty("--ph-redline", redline);
      root.style.setProperty("--ph-cell", cellFill);
      // small machine labels use the faint ink only where it still reads on the paper; otherwise the muted ink
      const readable = (c) => !window.SMTokens || Math.min(SMTokens.contrast(c, C.paper), SMTokens.contrast(c, C.surface)) >= 4.5;
      root.style.setProperty("--ph-label", readable(C.faint) ? C.faint : C.muted);

      // ---------- layout: copy top-left with the request under it, or (showHeading: false) the wall and request side by side ----------
      const full = content.showHeading === false;
      root.classList.toggle("ph-full", full);
      const L = full
        ? { wall: { x0: 64, x1: 1064, y0: 52, y1: 540 }, panel: { x: 1104, y: 52, w: 432, h: 488 }, feed: { x: 440, y: 690, w: 1096 }, side: "right" }
        : { wall: { x0: 600, x1: 1536, y0: 52, y1: 540 }, panel: { x: 64, y: 396, w: 480, h: 464 }, feed: { x: 952, y: 690, w: 584 }, side: "left" };
      const slots = content.slots.map((s) => (typeof s === "string" ? { name: s } : { ...s })).map((s, n) => ({ ...s, n }));
      const cols = content.cols ?? 3, rows = Math.ceil(slots.length / cols);
      const { x0, x1, y0, y1 } = L.wall;
      const colW = (x1 - x0) / cols, rowH = (y1 - y0) / rows;
      const cardW = Math.round(Math.min(296, colW - 32));
      const CARD_TOP = 50, PLATE_TOP = rowH - 50, SHELF = rowH - 58; // inside a cell: top card, label plate, shelf edge
      for (const s of slots) {
        s.col = s.n % cols; s.row = Math.floor(s.n / cols);
        s.cx = Math.round(x0 + (s.col + 0.5) * colW); // whole pixels: text and dots raster the same on every run
        s.left = s.cx - cardW / 2;
        s.top = y0 + s.row * rowH;
        s.bottom = s.top + rowH;
        s.red = s.tone === "redline" || s.colour === "redline" || s.colour === "warning";
      }
      const slotOf = Object.fromEntries(slots.map((s) => [s.name, s]));
      const restTop = (s, kf) => s.top + CARD_TOP - kf * PUSH_DY;

      // ---------- copy ----------
      if (!full) {
        const copy = el("div", "ph-copy", root);
        el("div", "ph-eyebrow", copy, content.eyebrow || "");
        el("div", "ph-h", copy, content.heading || "");
        el("div", "ph-sub", copy, content.sub || "");
      }

      // ---------- the wall: ruled cells in elevation ----------
      const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "ph-svg" }, root);
      const crisp = (v) => Math.round(v) + 0.5;
      // cornice and plinth: double rules, structure weight
      const hair = (color) => ({ stroke: color, "stroke-width": W_HAIR });
      for (const y of [y0 - 14, y0 - 9]) svg("line", { x1: x0 - 10, x2: x1 + 10, y1: crisp(y), y2: crisp(y), ...hair(rule) }, s);
      for (const y of [y1 + 9, y1 + 14]) svg("line", { x1: x0 - 10, x2: x1 + 10, y1: crisp(y), y2: crisp(y), ...hair(rule) }, s);
      for (const sl of slots) {
        const cx0 = x0 + sl.col * colW, cy0 = sl.top;
        svg("rect", { x: cx0 + 6, y: cy0 + 6, width: colW - 12, height: rowH - 12, ...rx(R_SM), fill: cellFill, ...hair(ruleSoft) }, s);
        const num = svg("text", { x: cx0 + 18, y: cy0 + 36, class: "ph-num" }, s);
        num.textContent = String(sl.n + 1).padStart(2, "0");
        // the edges of older papers filed behind the top card
        const rt = restTop(sl, 0);
        svg("line", { x1: sl.left + 10, x2: sl.left + cardW - 10, y1: crisp(rt - 5), y2: crisp(rt - 5), ...hair(rule) }, s);
        svg("line", { x1: sl.left + 22, x2: sl.left + cardW - 22, y1: crisp(rt - 10), y2: crisp(rt - 10), ...hair(ruleSoft) }, s);
        // the shelf edge the plate is fixed to
        svg("line", { x1: cx0 + 6, x2: cx0 + colW - 6, y1: crisp(sl.top + SHELF), y2: crisp(sl.top + SHELF), ...hair(ruleSoft) }, s);
      }
      // carcass: outer frame and dividers, object weight
      svg("rect", { x: crisp(x0), y: crisp(y0), width: Math.round(x1 - x0), height: Math.round(y1 - y0), ...rx(R_MD), fill: "none", stroke: edge, "stroke-width": W_REG }, s);
      for (let c = 1; c < cols; c++) svg("line", { x1: crisp(x0 + c * colW), x2: crisp(x0 + c * colW), y1: y0, y2: y1, stroke: edge, "stroke-width": W_REG }, s);
      for (let r = 1; r < rows; r++) svg("line", { x1: x0, x2: x1, y1: crisp(y0 + r * rowH), y2: crisp(y0 + r * rowH), stroke: edge, "stroke-width": W_REG }, s);

      // label plates: flat, ruled, two screws; the redline slot (privileged) gets a redline plate
      const plate = (parent, name, red) => {
        const p = el("div", "ph-plate" + (red ? " ph-plate-red" : ""), parent);
        el("i", "ph-screw", p); el("span", "", p, name); el("i", "ph-screw", p);
        return p;
      };
      for (const sl of slots) Object.assign(plate(root, sl.name, sl.red).style, { left: sl.cx + "px", top: sl.top + PLATE_TOP + "px" });

      // ---------- the intake tray, under the first column; cards rise from behind its front ----------
      // filings travel in a corridor under the wall, so they never cross a resting card or the ledger
      const corridor = y1 + 12;
      const tray = { cx: slots[0].cx, front: corridor + CARD_H + 4, w: cardW + 24 };
      const tx0 = tray.cx - tray.w / 2;
      const R0 = h.rng(17);
      for (let k = 0; k < 4; k++) {
        const inset = 10 + R0() * 26, y = tray.front - 6 - k * 5;
        svg("line", { x1: tx0 + inset, x2: tx0 + tray.w - 10 - R0() * 24, y1: crisp(y), y2: crisp(y), ...hair(rule) }, s);
      }
      svg("line", { x1: tx0, x2: tx0, y1: tray.front - 30, y2: tray.front, stroke: edge, "stroke-width": W_FINE }, s);
      svg("line", { x1: tx0 + tray.w, x2: tx0 + tray.w, y1: tray.front - 30, y2: tray.front, stroke: edge, "stroke-width": W_FINE }, s);
      // the corridor drawn as a dotted rail, with a branch up into each column the filings rise into
      const railY = Math.round(corridor + CARD_H / 2), lastCx = Math.max(...slots.map((sl) => sl.cx));
      // 2 px squares on whole pixels (no antialiasing, so every run rasters them identically)
      let dots = "";
      for (let x = Math.round(tx0 + tray.w + 8); x <= lastCx; x += 8) dots += `M${x - 1} ${railY - 1}h2v2h-2z`;
      for (const cx of [...new Set(slots.map((sl) => sl.cx))]) if (cx > tx0 + tray.w) for (let y = railY - 8; y >= y1 + 24; y -= 8) dots += `M${cx - 1} ${y - 1}h2v2h-2z`;
      svg("path", { d: dots, fill: rule, "shape-rendering": "crispEdges" }, s);
      const front = el("div", "ph-tray", root);
      Object.assign(front.style, { left: tx0 + "px", top: tray.front + "px", width: tray.w + "px", height: CARD_H + 12 + "px" });
      plate(front, content.intake || "Intake", false).classList.add("ph-plate-tray");

      // tethers (above the wall and the request card, below every card)
      const tetherSvg = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "ph-tethers" }, root);
      // sm-native: a tether is a data mark (it carries the pending → verified state), so it keeps its weight in every look
      const tethers = [0, 1, 2].map(() => svg("path", { d: "", fill: "none", stroke: pending, "stroke-width": 1.5, "stroke-linejoin": "miter", opacity: 0 }, tetherSvg));

      // ---------- cards: one element per resident item, two per filed item (alternate cycles); text set once ----------
      const items = content.items.map((it, i) => {
        const slot = slotOf[it.slot];
        if (!slot) throw new Error(`pigeonhole-wall: item "${it.title}" names unknown slot "${it.slot}"`);
        return { ...it, i, slot, resident: !!it.resident };
      });
      const fold = 14, titleW = cardW - 60;
      // the card outline: dog-eared top right; the other three corners take the pack's radius (native: square)
      const o = W_FINE / 2, cr = Math.min(R_MD, 24);
      const arc = (x, y) => `A${cr} ${cr} 0 0 1 ${x} ${y}`;
      const cardPath = cr > 0
        ? `M${o + cr} ${o}H${cardW - fold - o}L${cardW - o} ${fold + o}V${CARD_H - o - cr}${arc(cardW - o - cr, CARD_H - o)}H${o + cr}${arc(o, CARD_H - o - cr)}V${o + cr}${arc(o + cr, o)}Z`
        : `M${o} ${o}H${cardW - fold - o}L${cardW - o} ${fold + o}V${CARD_H - o}H${o}Z`;
      const makeCard = (it) => {
        const c = el("div", "ph-card", root);
        c.style.width = cardW + "px";
        const bg = svg("svg", { width: cardW, height: CARD_H, class: "ph-card-bg" }, c);
        svg("path", { d: cardPath, fill: C.surface, stroke: edge, "stroke-width": W_FINE }, bg);
        svg("path", { d: `M${cardW - fold - o} ${o}V${fold + o}H${cardW - o}`, fill: "none", stroke: edge, "stroke-width": W_FINE }, bg);
        svg("line", { x1: 0.5, x2: cardW - 0.5, y1: FAN - 3.5, y2: FAN - 3.5, ...hair(ruleSoft) }, bg);
        const title = el("div", "ph-card-t", c, it.title);
        title.style.width = titleW + "px";
        const sec = el("span", "ph-sec", c);
        const sp = el("i", "ph-sec-p", sec, "§");
        const sv = el("i", "ph-sec-v", sec, "§");
        const body = el("div", "ph-card-b", c);
        el("span", "ph-tag", body, it.type || "DOC");
        return { c, sp, sv, last: {} };
      };
      for (const it of items) it.cards = it.resident ? [makeCard(it)] : [makeCard(it), makeCard(it)];

      // ---------- requests and the filing schedule: one segment per request ----------
      const reqDefs = content.requests || [];
      const nSeg = Math.max(1, reqDefs.length);
      const SEG = D / nSeg;
      const filed = items.filter((it) => !it.resident);
      const per = Math.ceil(filed.length / nSeg);
      const gap = per > 1 ? Math.min(GAP, (SEG - REQ_SPAN - FLIGHT - 0.4) / (per - 1)) : GAP;
      filed.forEach((it, q) => { it.seg = Math.floor(q / per); it.land = it.seg * SEG + FLIGHT + (q % per) * gap; });
      const reqAt = (ri) => ri * SEG + FLIGHT + (per - 1) * gap + 0.8;

      // instances: (item, cycle) with a landing time; residents are one instance, there from the start
      const instances = [];
      for (const it of items) {
        if (it.resident) { instances.push({ it, c: 0, a: -1e9, resident: true, card: it.cards[0], pulls: [] }); continue; }
        for (const c of [-2, -1, 0, 1]) instances.push({ it, c, a: it.land + c * D, card: it.cards[((c % 2) + 2) % 2], pulls: [] });
      }
      instances.sort((p, q) => p.a - q.a);
      const bySlot = new Map(slots.map((sl) => [sl, []]));
      for (const ins of instances) bySlot.get(ins.it.slot).push(ins);
      for (const [sl, list] of bySlot) {
        list.forEach((ins, m) => { ins.later = list.slice(m + 1); });
        const nFiled = list.filter((x) => !x.resident).length / 4, nRes = list.filter((x) => x.resident).length;
        if ((nFiled === 1 && nRes === 0) || (nRes && nFiled)) console.warn(`pigeonhole-wall: "${sl.name}" needs one resident item or two or more filed ones`);
      }
      const keep = Math.max(1, content.keep ?? 1);

      const reqs = reqDefs.map((r, ri) => ({
        ...r, ri, at: reqAt(ri),
        picks: (r.items || []).slice(0, 3).map((title) => {
          const it = items.find((x) => x.title === title);
          if (!it) throw new Error(`pigeonhole-wall: request "${r.prompt}" names unknown item "${title}"`);
          return it;
        }),
      }));
      const occurrences = [];
      for (const c of [-1, 0, 1]) for (const r of reqs) {
        const T = r.at + c * D;
        const occ = { r, T, pulls: [] };
        r.picks.forEach((it, k) => {
          let inst = null;
          for (const ins of instances) if (ins.it === it && ins.a <= T + OUT0) inst = ins;
          if (!inst) return;
          const pull = { occ, k, inst, T, out: T + OUT0 + h.motion.stagger(k, STAG), back: T + BACK0 + h.motion.stagger(k, STAG), commit: T + COMMIT0 + h.motion.stagger(k, COMMIT_STEP) };
          pull.arrive = pull.out + OUT_D;
          occ.pulls.push(pull);
          inst.pulls.push(pull);
        });
        occurrences.push(occ);
      }
      occurrences.sort((p, q) => p.T - q.T);
      // the result line follows the last commit; a wider stagger (cascade) moves it later by the same amount
      const resultAt = RESULT + 2 * (h.motion.stagger(1, COMMIT_STEP) - COMMIT_STEP);

      // ---------- the request card ----------
      const P = L.panel;
      const panel = el("div", "ph-panel", root);
      Object.assign(panel.style, { left: P.x + "px", top: P.y + "px", width: P.w + "px", height: P.h + "px" });
      const ph = el("div", "ph-panel-h", panel);
      el("span", "ph-panel-k", ph, content.requestLabel || "Request");
      const reqNo = el("span", "ph-panel-n", ph, "");
      const legend = el("span", "ph-legend", ph);
      const lg = content.legend || {};
      const lp = el("span", "ph-lg", legend); el("i", "ph-lg-p", lp, "§"); el("span", "", lp, lg.pending || "pending");
      const lv = el("span", "ph-lg", legend); el("i", "ph-lg-v", lv, "§"); el("span", "", lv, lg.verified || "verified");
      const idle = el("div", "ph-idle", panel, content.idle || "");
      idle.style.display = reqs.length ? "none" : "";
      const SLOT0 = P.h - 56 - (2 * FAN + CARD_H); // the fan of three sources sits above the result line
      const slotLeft = P.x + 24;
      const slotTop = (k) => P.y + SLOT0 + k * FAN;
      for (let k = 0; k < 3; k++) {
        // an empty, dashed place for each source the request will need
        const hole = el("div", "ph-hole", panel);
        Object.assign(hole.style, { top: SLOT0 + k * FAN + "px", width: cardW + "px", height: FAN - 6 + "px" });
        const n = el("div", "ph-slotno", panel, String(k + 1).padStart(2, "0"));
        n.style.top = SLOT0 + k * FAN + 18 + "px";
      }
      const reqEls = reqs.map((r) => {
        const prompt = el("div", "ph-prompt", panel, r.prompt || "");
        prompt.style.width = P.w - 48 + "px";
        // each source leaves its title behind in the request, verified: the record the cards return from
        const recs = r.picks.map((it, k) => {
          const rec = el("div", "ph-rec", panel);
          Object.assign(rec.style, { top: SLOT0 + k * FAN + "px", width: cardW + "px" });
          const t = el("div", "ph-card-t", rec, it.title);
          t.style.width = titleW + "px";
          const sec = el("span", "ph-sec", rec);
          el("i", "ph-sec-v ph-on", sec, "§");
          return rec;
        });
        const res = el("div", "ph-result", panel);
        el("i", "", res, "§");
        el("span", "", res, r.result || "");
        return { prompt, recs, res };
      });
      const ghosts = [0, 1, 2].map(() => {
        const g = el("div", "ph-ghost", root);
        Object.assign(g.style, { width: cardW + "px", height: CARD_H + "px" });
        return g;
      });

      // ---------- the ledger of filings ----------
      const F = L.feed;
      const feed = el("div", "ph-feed", root);
      Object.assign(feed.style, { left: F.x + "px", top: F.y + "px", width: F.w + "px" });
      const fh = el("div", "ph-feed-h", feed);
      el("i", "ph-feed-dot", fh);
      el("span", "", fh, content.feedTitle || "Filed just now");
      el("span", "ph-feed-stat", fh, content.feedStat || "");
      const rowsBox = el("div", "ph-rows", feed);
      const feedRows = Array.from({ length: 4 }, () => {
        const r = el("div", "ph-row", rowsBox);
        return { r, tag: el("span", "ph-tag", r), title: el("span", "ph-row-t", r), to: el("span", "ph-row-to", r) };
      });

      // ---------- paths (in card top-left coordinates) ----------
      const filingRoutes = new Map(slots.map((sl) => {
        const sx = tray.cx - cardW / 2;
        return [sl, measure([[sx, tray.front + 6], [sx, corridor], [sl.left, corridor], [sl.left, restTop(sl, 0)]])];
      }));
      // a pulled card: up to the empty band at the top of its row, along it, down a lane in the gutter beside the
      // request card, and into its place in the fan
      const pullRoute = (sl, kf, k) => {
        const band = sl.top + 9 + k * 5;
        const lane = L.side === "right" ? P.x - 36 + k * 8 : P.x + P.w + 12 + k * 8;
        return [[sl.left, restTop(sl, kf)], [sl.left, band], [lane, band], [lane, slotTop(k)], [slotLeft, slotTop(k)]];
      };
      function measure(pts) {
        const segs = [];
        let len = 0;
        for (let k = 1; k < pts.length; k++) {
          const l = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
          segs.push(l);
          len += l;
        }
        return { pts, segs, len };
      }
      const pointAt = (m, d) => {
        let rest = Math.max(0, Math.min(m.len, d));
        for (let k = 0; k < m.segs.length; k++) {
          if (rest <= m.segs[k] || k === m.segs.length - 1) {
            const f = m.segs[k] ? rest / m.segs[k] : 1;
            const [ax, ay] = m.pts[k], [bx, by] = m.pts[k + 1];
            return [ax + (bx - ax) * f, ay + (by - ay) * f];
          }
          rest -= m.segs[k];
        }
        return m.pts[m.pts.length - 1];
      };
      const pathD = (pts) => pts.map((p, k) => `${k ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("");

      return { items, instances, keep, occurrences, resultAt, reqs, reqEls, reqNo, ghosts, tethers, feedRows, cardW, restTop, filingRoutes, pullRoute, measure, pointAt, pathD, verified, pending };
    },

    render(t, S, h) {
      const { ease, clamp } = h;
      const pushOf = (ins) => {
        let kf = 0;
        for (const j of ins.later) {
          if (j.a - LEAD > t) break;
          kf += ease.inOut(clamp((t - (j.a - LEAD)) / PUSH));
        }
        return kf;
      };
      const zRest = (kf) => 100 - Math.round(kf * 10);
      const place = (card, x, y, z, op) => {
        const tr = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        if (card.last.tr !== tr) { card.c.style.transform = tr; card.last.tr = tr; }
        const zs = String(z);
        if (card.last.z !== zs) { card.c.style.zIndex = zs; card.last.z = zs; }
        const os = op.toFixed(3);
        if (card.last.op !== os) { card.c.style.opacity = os; card.last.op = os; }
      };

      const shown = new Set();
      let ghostUsed = 0;
      const activeTethers = [];
      for (const ins of S.instances) {
        const start = ins.a - FLIGHT;
        if (t < start) continue;
        const kf = pushOf(ins);
        if (kf >= S.keep) continue;
        const card = ins.card;
        shown.add(card);
        const sl = ins.it.slot;
        let x, y, z, op = 1 - clamp(kf - (S.keep - 1));
        if (t < ins.a) {
          // travelling from the tray, under the wall, up into the front of its pigeonhole
          const m = S.filingRoutes.get(sl);
          [x, y] = S.pointAt(m, m.len * ease.inOut(clamp((t - start) / FLIGHT)));
          z = 200; op = 1;
        } else {
          x = sl.left; y = S.restTop(sl, kf); z = zRest(kf);
        }
        // pulled to a request: out along the route, back along it; the tether is the route travelled so far
        let pend = 0, ver = 0;
        for (const p of ins.pulls) {
          if (t >= p.arrive) pend = Math.max(pend, clamp((t - p.arrive) / 0.24));
          if (t >= p.commit) ver = Math.max(ver, clamp((t - p.commit) / 0.12));
          if (t < p.out || t > p.back + BACK_D) continue;
          const u = ease.inOut(clamp((t - p.out) / OUT_D)) - ease.inOut(clamp((t - p.back) / BACK_D));
          if (u <= 0) continue;
          const m = S.measure(S.pullRoute(sl, kf, p.k));
          [x, y] = S.pointAt(m, m.len * u);
          const g = S.ghosts[ghostUsed++];
          if (g) {
            g.style.transform = `translate(${sl.left.toFixed(1)}px, ${S.restTop(sl, kf).toFixed(1)}px)`;
            g.style.zIndex = String(zRest(kf));
            g.style.opacity = op.toFixed(3);
          }
          activeTethers.push({ m, u, committed: t >= p.commit });
          z = 400 + p.k;
        }
        place(card, x, y, z, op);
        // the § mark: pending outline once it reaches the request, verified once committed; it stays verified
        const ps = pend.toFixed(3), vs = ver.toFixed(3);
        if (card.last.ps !== ps) { card.sp.style.opacity = ps; card.last.ps = ps; }
        if (card.last.vs !== vs) { card.sv.style.opacity = vs; card.last.vs = vs; }
      }
      for (const it of S.items) for (const card of it.cards) if (!shown.has(card)) place(card, -600, 0, 0, 0);
      for (let k = ghostUsed; k < S.ghosts.length; k++) S.ghosts[k].style.opacity = "0";

      S.tethers.forEach((path, k) => {
        const a = activeTethers[k];
        if (!a) { path.setAttribute("opacity", "0"); return; }
        const d = S.pathD(a.m.pts);
        if (path.getAttribute("d") !== d) path.setAttribute("d", d);
        path.setAttribute("stroke-dasharray", `${(a.m.len * a.u).toFixed(1)} ${(a.m.len + 20).toFixed(1)}`);
        path.setAttribute("stroke", a.committed ? S.verified : S.pending);
        path.setAttribute("opacity", "1");
      });

      // the request card: the current request reveals its prompt, its sources and its result; the previous one's
      // record stays until the next request arrives, so the card is never empty
      let cur = null, prev = null;
      for (const occ of S.occurrences) if (occ.T <= t) { prev = cur; cur = occ; }
      const st = S.reqEls.map((E) => ({ prompt: 0, recs: E.recs.map(() => 0), res: 0 }));
      if (cur) {
        const tau = t - cur.T;
        const old = 1 - clamp(tau / SWAP);
        if (prev && old > 0) {
          const o = st[prev.r.ri];
          o.prompt = old; o.res = old; o.recs = o.recs.map(() => old);
        }
        const c = st[cur.r.ri];
        c.prompt = Math.max(c.prompt, h.tw(tau, SWAP * 0.8, 0.6));
        c.res = Math.max(c.res, h.tw(tau, S.resultAt, 0.6));
        for (const p of cur.pulls) if (t >= p.arrive) c.recs[p.k] = 1;
      }
      const reveal = (node, v, dy) => {
        node.style.opacity = v.toFixed(3);
        node.style.transform = dy ? `translateY(${((1 - v) * dy).toFixed(1)}px)` : "";
      };
      S.reqEls.forEach((E, ri) => {
        const v = st[ri];
        reveal(E.prompt, v.prompt, 12);
        E.recs.forEach((r, k) => reveal(r, v.recs[k], 0));
        reveal(E.res, v.res, 8);
      });
      h.text(S.reqNo, cur ? `${String(cur.r.ri + 1).padStart(2, "0")} / ${String(S.reqs.length).padStart(2, "0")}` : "");

      // the ledger: newest filing on top, each landing pushes the list down one row
      const landed = [];
      for (let k = S.instances.length - 1; k >= 0 && landed.length < 4; k--) {
        const ins = S.instances[k];
        if (!ins.resident && ins.a <= t) landed.push(ins);
      }
      const p = landed.length ? ease.inOut(clamp((t - landed[0].a) / PUSH)) : 1;
      const RH = 48;
      S.feedRows.forEach((row, r) => {
        const ins = landed[r];
        if (!ins) { row.r.style.opacity = "0"; return; }
        h.text(row.tag, ins.it.type || "DOC");
        h.text(row.title, ins.it.title);
        h.text(row.to, "→ " + ins.it.slot.name);
        const y = (r - 1 + p) * RH;
        const op = r === 0 ? p : r === 3 ? 1 - p : 1;
        row.r.style.transform = `translateY(${y.toFixed(1)}px)`;
        row.r.style.opacity = op.toFixed(3);
      });
    },
  });
})();
