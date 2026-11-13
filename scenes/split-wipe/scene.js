/* split-wipe: a before / after slider for any "scattered manual work → one ordered surface" story (DOM).
 * One frame, split by a vertical divider with a grip. Left of it, the before state: loose fragments (spreadsheet
 * cells, email threads, chat messages, notes, docs, events) at slight angles over a desk, and a counter of tools and
 * time. Right of it, the after state: one product surface with a row slot for every fragment. The divider sweeps to
 * the left edge; each fragment it touches snaps into its row with a resolved status, and as the divider crosses the
 * counter the counter re-reads (tools and time are summed from the items, never typed). Then it sweeps back.
 * Everything shown comes from content; the scatter, the rows and the timings are computed from the items (5–9).
 */
(function () {
  const D = 14, W = 1600, H = 900;
  const FX = 96, FY = 256, FW = 1408, FH = 592; // the frame, in stage px
  const R = 760; // the divider's resting x in the frame: the before side is [0, R], the product surface sits right of it
  const T1 = 1.4, SW = 5.0, T3 = 10.4, RW = 2.8; // sweep left from T1 for SW s; hold; sweep back from T3 for RW s
  const FLY = 0.7, TX = 792, TW = 584; // a fragment's flight; the table's x and width in the frame
  // estimated fragment sizes by kind (width fixed in CSS, height for layout only)
  const KIND = { note: [212, 118], cell: [232, 104], email: [258, 118], message: [258, 98], doc: [244, 84], event: [236, 100] };

  SiteMotion.scene({
    width: W,
    height: H,
    loop: 0,
    duration: D,
    still: 3.4,
    setup({ root, content, tokens, h }) {
      const { el, svg, mix, rng, ui } = h;
      const C = tokens.color, pal = tokens.palette;
      const rand = rng(content.seed || 74);
      root.classList.add("sw");
      const items = content.items || [];
      const n = items.length;
      const cn = content.counter || {};

      // ---- copy: heading on the left, the sub in a column on the right, the frame below at full width ----
      const copy = el("div", "sw-copy", root);
      el("div", "sw-eyebrow", copy, content.eyebrow || "");
      el("div", "sw-h", copy, content.heading || "");
      if (content.sub) el("div", "sw-sub", root, content.sub);

      // ---- sources: one colour per distinct source, in order of appearance ----
      const sources = [];
      items.forEach((it) => { if (!sources.includes(it.source)) sources.push(it.source); });
      const srcColour = (s) => pal[sources.indexOf(s) % pal.length];

      // ---- numbers, summed from the items ----
      const fmt = (m) => {
        const hh = Math.floor(m / 60), mm = Math.round(m % 60);
        const hu = cn.h || "h", mu = cn.min || "min";
        return hh && mm ? `${hh} ${hu} ${mm} ${mu}` : hh ? `${hh} ${hu}` : `${mm} ${mu}`;
      };
      const sum = (k) => items.reduce((a, it) => a + (Number(it[k]) || 0), 0);
      const before = { tools: String(sources.length), time: fmt(sum("before")) };
      const after = { tools: "1", time: fmt(sum("after")) };

      // ---- the frame: after surface underneath, the before desk on top, each clipped to its side of the divider ----
      const frame = el("div", "sw-frame", root);
      Object.assign(frame.style, { left: FX + "px", top: FY + "px", width: FW + "px", height: FH + "px" });
      const afterL = el("div", "sw-after", frame);
      const beforeL = el("div", "sw-before", frame);

      // after: the product surface (header + a slot and a row per item)
      const table = el("div", "sw-table", afterL);
      Object.assign(table.style, { left: TX + "px", width: TW + "px" });
      const head = el("div", "sw-thead", table);
      const mark = el("span", "sw-mark", head, (content.product && content.product.mark) || "");
      mark.style.background = C.accent;
      mark.style.color = h.inkOn(C.accent);
      el("span", "sw-pname", head, (content.product && content.product.name) || "");
      const tally = el("span", "sw-tally", head, "");
      // rows take the height they need (up to 64 px) and the whole table centres in the frame
      const rowH = Math.min(64, (FH - 84 - 22) / Math.max(1, n));
      const off = Math.max(0, (FH - 84 - n * rowH - 14) / 2), ROW_TOP = 84 + off;
      table.style.top = off + "px";
      const toneBg = { done: mix(C.positive || C.accent, C.surface, 0.8), active: mix(C.accent, C.surface, 0.72), neutral: C.raised };
      const toneDot = { done: C.positive || C.accent, active: C.warning || C.accent, neutral: C.muted };
      const rows = items.map((it, i) => {
        const y = ROW_TOP - off + i * rowH; // in the table, which sits off px down the frame
        const slot = el("div", "sw-slot", table);
        Object.assign(slot.style, { top: y + "px", height: rowH - 8 + "px" });
        const row = el("div", "sw-row", table);
        Object.assign(row.style, { top: y + "px", height: rowH - 8 + "px" });
        const lm = el("span", "sw-lm", row, (it.source || "?")[0]);
        lm.style.background = srcColour(it.source);
        lm.style.color = h.inkOn(srcColour(it.source));
        const txt = el("div", "sw-rtext", row);
        el("div", "sw-rtitle", txt, it.title || it.raw || "");
        el("div", "sw-rsub", txt, `${content.fromLabel || "from"} ${it.source}`);
        const tone = toneBg[it.tone] ? it.tone : "neutral";
        const pill = el("span", "sw-pill", row);
        pill.style.background = toneBg[tone];
        pill.style.color = h.inkOn(toneBg[tone]);
        const dot = el("i", "sw-dot", pill);
        dot.style.background = toneDot[tone];
        el("span", "", pill, it.status || "");
        return { row, pill, y: off + y + (rowH - 8) / 2 };
      });

      // the counter: the same block on both sides, so the divider re-reads it as it passes
      const counter = (layer, vals, was) => {
        const box = el("div", "sw-counter", layer);
        [[cn.toolsLabel || "Tools", vals.tools, was && before.tools], [cn.timeLabel || "Time", vals.time, was && before.time]].forEach(([label, value, old]) => {
          const stat = el("div", "sw-stat", box);
          el("div", "sw-clabel", stat, label);
          el("div", "sw-cnum", stat, value);
          const w = el("div", "sw-cwas", stat, old ? `${cn.was || "was"} ` : "\u00a0");
          if (old) el("s", "", w, old);
        });
        return box;
      };
      counter(beforeL, before, false);
      counter(afterL, after, true);
      // ---- the fragments: scattered over the desk, the first item rightmost so items arrive in row order ----
      const chipsL = el("div", "sw-chips", root);
      Object.assign(chipsL.style, { left: FX + "px", top: FY + "px" });
      // a loose 3-column grid over the desk (x 24–730, y 22–424, clear of the counter), filled right column first so
      // the divider reaches the items in content order; rows shift per column and every edge is staggered
      const COLS = 3, ROWS = Math.max(1, Math.ceil(n / COLS)), DX0 = 24, DX1 = R - 30, DY0 = 22, DY1 = 424;
      const colW = (DX1 - DX0) / COLS, rowHt = (DY1 - DY0) / ROWS;
      const chips = items.map((it, i) => {
        const kind = KIND[it.kind] ? it.kind : "note";
        const [cw, chH] = KIND[kind];
        const node = el("div", `sw-chip sw-chip--${kind}`, chipsL);
        node.style.width = cw + "px";
        const sc = srcColour(it.source);
        const cap = el("div", "sw-cap", node);
        const sq = el("i", "sw-sq", cap);
        sq.style.background = sc;
        el("span", "", cap, it.ref ? `${it.source} · ${it.ref}` : it.source);
        if (it.badge) {
          const b = el("span", "sw-badge", cap, String(it.badge));
          b.style.background = C.warning || C.accent;
          b.style.color = h.inkOn(C.warning || C.accent);
        }
        if (kind === "message") {
          const line = el("div", "sw-msg", node);
          const av = el("span", "sw-av", line, it.from || (it.source || "?")[0]);
          av.style.background = sc;
          av.style.color = h.inkOn(sc);
          el("div", "sw-bubble", line, it.raw || "");
        } else if (kind === "doc") {
          const line = el("div", "sw-docline", node);
          const fi = el("span", "sw-file", line);
          fi.style.background = sc;
          el("div", "sw-raw", line, it.raw || "");
        } else {
          el("div", kind === "cell" ? "sw-raw sw-cell" : "sw-raw", node, it.raw || "");
          if (it.meta) el("div", "sw-meta", node, it.meta);
        }
        if (kind === "note") {
          const fill = pal[4 % pal.length]; // the sticky-note tint: the palette's fifth colour
          node.style.background = fill;
          node.style.color = h.inkOn(fill);
        }
        if (kind === "event") node.style.borderLeftColor = sc;
        const rot = (i % 2 ? 1 : -1) * (2 + rand() * 4);
        const rad = (rot * Math.PI) / 180;
        const ext = (cw / 2) * Math.cos(rad) + (chH / 2) * Math.abs(Math.sin(rad));
        const col = Math.floor(i / ROWS), k = i % ROWS; // col 0 is the rightmost
        const rowAt = (k + col) % ROWS; // each column starts on a different row
        const edge = DX1 - col * colW - k * 16 - (rowAt % 2) * 10;
        const cx = Math.max(DX0 + ext, edge - ext);
        const free = Math.max(0, rowHt - chH);
        const y = DY0 + rowAt * rowHt + free * (0.5 + (rand() - 0.5) * 0.7);
        const home = { x: cx - cw / 2, y, rot };
        const dest = { x: TX, y: rows[i].y - chH / 2 };
        // on the after side, a dashed trace stays where the fragment used to sit: the cleared desk
        const ghost = el("div", "sw-ghost", afterL);
        Object.assign(ghost.style, { width: cw + "px", height: chH + "px", transform: `translate(${home.x.toFixed(1)}px, ${home.y.toFixed(1)}px) rotate(${rot.toFixed(2)}deg)` });
        node.style.zIndex = String(n - i);
        return { node, home, dest, edge: cx + ext };
      });

      // ---- the divider: a rail with a grip, above the frame; labels ride on either side of it ----
      const div = el("div", "sw-div", root);
      Object.assign(div.style, { left: FX + "px", top: FY - 44 + "px", height: FH + 44 + "px" });
      const line = el("div", "sw-line", div);
      line.style.width = ui.stroke("bold", 2) + "px";
      const grip = el("div", "sw-grip", div);
      grip.style.top = 44 + FH / 2 + "px";
      const gs = svg("svg", { viewBox: "0 0 52 52", width: 52, height: 52 }, grip);
      const chev = svg("path", { d: "M21 19l-7 7 7 7M31 19l7 7-7 7", fill: "none", stroke: C.ink, "stroke-width": ui.stroke("regular", 2), "stroke-linecap": "round", "stroke-linejoin": "round" }, gs);
      const tagB = el("div", "sw-tag sw-tag--b", div, content.beforeLabel || "Before");
      const tagA = el("div", "sw-tag sw-tag--a", div, content.afterLabel || "After");

      // ---- when the divider touches each fragment's right edge: on the way left (snap) and on the way back ----
      const divX = (t) => R - R * h.tw(t, T1, SW, "inOut") + R * h.tw(t, T3, RW, "inOut") - 14 * Math.sin(Math.PI * h.tw(t, 0.3, 1.0, "inOut"));
      const cross = (e, a, b, falling) => {
        for (let k = 0; k < 40; k++) { const m = (a + b) / 2; if ((divX(m) > e) === falling) a = m; else b = m; }
        return (a + b) / 2;
      };
      chips.forEach((c) => { c.snap = cross(c.edge, T1, T3, true); c.back = cross(c.edge, T3, D, false); });
      return { chips, rows, n, divX, div, grip, chev, tagB, tagA, afterL, beforeL, tally, done: content.doneLabel || "done", C };
    },

    render(t, S, h) {
      const { tw, lerp, clamp, mix } = h;
      const C = S.C;
      const x = S.divX(t);
      S.afterL.style.clipPath = `inset(0 0 0 ${x.toFixed(1)}px)`;
      S.beforeL.style.clipPath = `inset(0 ${(FW - x).toFixed(1)}px 0 0)`;
      S.div.style.transform = `translateX(${x.toFixed(1)}px)`;
      // the Before label slides out of the frame with the divider; it fades before it would leave the stage
      S.tagB.style.opacity = clamp((x - 70) / 60).toFixed(3);
      // docked at the far edge, the grip turns to the accent: the sweep is complete
      const dock = tw(t, T1 + SW - 0.15, 0.4, "snappy") * (1 - tw(t, T3, 0.3, "snappy"));
      S.grip.style.background = mix(C.surface, C.accent, dock);
      S.chev.setAttribute("stroke", mix(C.ink, C.onAccent || C.ink, dock));

      let landed = 0;
      S.chips.forEach((c, i) => {
        const go = tw(t, c.snap, FLY, "signature"), ret = tw(t, c.back, FLY, "signature");
        const s = go * (1 - ret); // 0 at home on the desk, 1 in its row
        const px = lerp(c.home.x, c.dest.x, s), py = lerp(c.home.y, c.dest.y, s);
        c.node.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) rotate(${lerp(c.home.rot, 0, s).toFixed(2)}deg) scale(${lerp(1, 0.9, s).toFixed(3)})`;
        c.node.style.opacity = (1 - clamp((s - 0.5) / 0.28)).toFixed(3);
        const r = S.rows[i];
        const vis = clamp((s - 0.66) / 0.3);
        r.row.style.opacity = vis.toFixed(3);
        r.row.style.transform = `translateX(${((1 - vis) * 14).toFixed(1)}px)`;
        const pill = tw(t, c.snap + 0.45, 0.35, "snappy") * vis;
        r.pill.style.opacity = pill.toFixed(3);
        r.pill.style.transform = `scale(${lerp(0.86, 1, pill).toFixed(3)})`;
        if (s >= 0.6) landed++;
      });
      h.text(S.tally, `${landed} / ${S.n} ${S.done}`);
    },
  });
})();
