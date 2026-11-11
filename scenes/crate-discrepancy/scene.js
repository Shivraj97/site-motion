/* crate-discrepancy: reconciliation as unpacking (SVG + DOM).
 * A delivery crate is unpacked against its packing slip. Trays lift out of the shredded paper one at a time;
 * while a tray is in the air its line on the slip lights up, and when it lands on the pallet the line gets the
 * received count and a tick. The one tray that doesn't match its line (two places empty) glows in the warning
 * colour and floats up instead, with a note tied to its flagged line. The slip's total is the sum of what landed.
 *
 * Every tray's path is planned in setup from content (crate position seeded, pallet slot from its order), and
 * every mark is a function of the times that tray lifted, landed or was flagged, so any frame can be seeked.
 * The loop resets by clearing the pallet and the slip before the seam: frame D equals frame 0.
 */
(function () {
  const W = 1600, H = 900, D = 14;
  const GROUND = 858;
  const CR = { x: 110, y: 540, w: 450, h: GROUND - 540 }; // crate front face
  const IN_Y = 640, LIFT_Y = 428; // tray centre inside the crate (hidden), and once it is out
  const PAL = { x: 650, w: 400, y: 836 }; // pallet deck top
  const STACKS = [945, 765]; // the far stack fills first, so a later tray never passes in front of an earlier one
  const HOVER = { x: 862, y: 282 };
  const SHEET = { x: 1132, y: 86, w: 346, h: 754 };
  const ROW0 = 236, RH = 64; // slip rows, stage y
  const U = 23, UR = 8.5, TH = 82, BAND = 22; // unit pitch, unit radius, tray height, label band
  const START = 0.7, GAP = 1.3, ARC = 170;
  const RESET = 11.8, SWAP = RESET + 0.65;
  const PING = 1.6, BOB = 2.4;
  const NOTE = { w: 268, h: 70 };

  const fmt = (s, v) => String(s || "").replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? ""));

  SiteMotion.scene({
    width: W,
    height: H,
    loop: 0,
    duration: D,
    still: 9.3,
    setup({ root, content, tokens, h }) {
      const { el, svg, mix, alpha, rng, lerp, ui } = h;
      const C = tokens.color, pal = tokens.palette;
      const INK = C.stroke || C.ink;
      const OUT = ui.strokeAttrs("regular", 1.5, INK);
      root.classList.add("cd");
      const rand = rng(content.seed || 7);
      const lines = content.lines || [];

      // ---------- plan: where each tray sits in the crate, and where it ends up ----------
      const okOf = (ln) => ln.received === ln.ordered && !ln.wrongSku;
      const matchedIdx = lines.map((ln, i) => (okOf(ln) ? i : -1)).filter((i) => i >= 0);
      const farCount = Math.ceil(matchedIdx.length / 2);
      const PAL_ORDER = [2, 0, 4, 3, 1, 5];
      const plan = lines.map((ln, i) => {
        const ok = okOf(ln);
        const slots = Math.max(ln.ordered, ln.received);
        const cols = Math.ceil(slots / 2);
        const w = cols * U + 18;
        const cx = lerp(CR.x + 36 + w / 2, CR.x + CR.w - 36 - w / 2, rand());
        const s = START + i * GAP;
        let slot = null, order = 0;
        if (ok) {
          const m = matchedIdx.indexOf(i), stack = m < farCount ? 0 : 1, level = stack ? m - farCount : m;
          slot = { x: STACKS[stack], y: PAL.y - TH / 2 - level * TH };
          order = m;
        }
        // which sockets are empty: spread through the tray, never all at the end
        const missing = new Set();
        for (let k = 0; k < Math.max(0, ln.ordered - ln.received); k++) {
          let pick = Math.floor(rand() * slots);
          while (missing.has(pick)) pick = (pick + 5) % slots;
          missing.add(pick);
        }
        const tilt = (rand() < 0.5 ? -1 : 1) * (4 + rand() * 4);
        return { ...ln, ok, slots, cols, w, cx, s, slot, order, missing, tilt, colour: pal[PAL_ORDER[i % 6] % pal.length],
          landAt: s + 1.45, flagAt: s + 0.95 };
      });

      // ---------- copy ----------
      if (content.showCopy !== false) {
        const copy = el("div", "cd-copy", root);
        el("div", "cd-eyebrow", copy, content.eyebrow || "");
        el("div", "cd-h", copy, content.heading || "");
        el("div", "cd-sub", copy, content.sub || "");
      }

      const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "cd-svg" }, root);
      const defs = svg("defs", {}, s);
      // trays are only seen once they clear the crate's rim (or have moved past its right side)
      const clip = svg("clipPath", { id: "cd-out" }, defs);
      svg("rect", { x: 0, y: 0, width: W, height: CR.y }, clip);
      svg("rect", { x: CR.x + CR.w + 2, y: 0, width: W, height: H }, clip);

      // ---------- ground, pallet ----------
      svg("line", { x1: 80, x2: 1092, y1: GROUND, y2: GROUND, "stroke-linecap": "round", ...ui.strokeAttrs("regular", 1.5, C.faint || C.line) }, s);
      const wood = mix(C.paper, C.ink, 0.08), woodDark = mix(C.paper, C.ink, 0.16);
      [PAL.x + 14, PAL.x + PAL.w / 2 - 15, PAL.x + PAL.w - 44].forEach((x) => svg("rect", { x, y: PAL.y + 10, width: 30, height: GROUND - PAL.y - 10, fill: woodDark, ...OUT }, s));
      svg("rect", { x: PAL.x, y: PAL.y, width: PAL.w, height: 10, rx: ui.radius("sm", 2), fill: wood, ...OUT }, s);

      // ---------- crate: back wall, then trays, then the front face and the shred over the rim ----------
      svg("rect", { x: CR.x + 22, y: CR.y - 16, width: CR.w - 44, height: 20, rx: ui.radius("sm", 3), fill: mix(C.paper, C.ink, 0.3), ...OUT }, s);
      const trayLayer = svg("g", { "clip-path": "url(#cd-out)" }, s);
      const face = svg("g", {}, s);
      svg("rect", { x: CR.x, y: CR.y, width: CR.w, height: CR.h, rx: ui.radius("sm", 4), fill: mix(C.paper, C.ink, 0.42) }, face);
      const PLANK = (CR.h - 18) / 3;
      for (let k = 0; k < 3; k++) {
        const y = CR.y + k * (PLANK + 9);
        svg("rect", { x: CR.x, y, width: CR.w, height: PLANK, rx: ui.radius("sm", 3), fill: wood, ...OUT }, face);
        // grain, near the plank's edges so it never runs through the stencil
        for (let g = 0; g < 2; g++) {
          const gx = CR.x + 50 + rand() * (CR.w - 200), gy = y + (g ? PLANK - 14 - rand() * 8 : 12 + rand() * 8);
          // sm-native: wood grain is texture on the material, not an outline
          svg("path", { d: `M${gx.toFixed(1)} ${gy.toFixed(1)}q${(30 + rand() * 40).toFixed(1)} ${(-3 + rand() * 6).toFixed(1)} ${(70 + rand() * 60).toFixed(1)} 0`, fill: "none", "stroke-linecap": "round", stroke: woodDark, "stroke-width": 1.2 }, face);
        }
      }
      [CR.x, CR.x + CR.w - 32].forEach((x) => {
        svg("rect", { x, y: CR.y, width: 32, height: CR.h, rx: ui.radius("sm", 3), fill: woodDark, ...OUT }, face);
        for (let k = 0; k < 3; k++) for (const dy of [18, PLANK - 18]) svg("circle", { cx: x + 16, cy: CR.y + k * (PLANK + 9) + dy, r: 3, fill: mix(C.ink, C.paper, 0.35) }, face);
      });
      const stencilInk = mix(C.ink, C.paper, 0.32);
      const st1 = svg("text", { x: CR.x + CR.w / 2, y: CR.y + PLANK + 9 + PLANK / 2 + 11, "text-anchor": "middle", class: "cd-stencil", fill: stencilInk }, face);
      st1.textContent = content.po || "";
      const st2 = svg("text", { x: CR.x + CR.w / 2, y: CR.y + 2 * (PLANK + 9) + PLANK / 2 + 5, "text-anchor": "middle", class: "cd-stencil-s", fill: stencilInk }, face);
      st2.textContent = (content.crateNote || "").toUpperCase();

      // shredded paper packing, spilling over the rim
      const shredLayer = svg("g", {}, s);
      const shredInks = [mix(C.ink, C.paper, 0.6), mix(C.ink, C.paper, 0.72), mix(C.ink, C.paper, 0.84)];
      const shred = Array.from({ length: 96 }, (_, n) => {
        const u = rand(), x = CR.x + 16 + u * (CR.w - 32);
        const y = CR.y - 6 + rand() * 16 - 16 * Math.sin(Math.PI * u); // a low mound over the rim
        const a = (rand() - 0.5) * 1.5 + (rand() < 0.5 ? Math.PI : 0); // mostly lying flat
        const L = 22 + rand() * 20, segs = 5, ca = Math.cos(a), sa = Math.sin(a);
        let d = "M0 0";
        for (let k = 1; k <= segs; k++) {
          const along = (L * k) / segs, side = (k % 2 ? 1 : -1) * (2.2 + rand() * 1.6);
          d += `L${(ca * along - sa * side).toFixed(1)} ${(sa * along + ca * side).toFixed(1)}`;
        }
        // sm-native: shredded paper is material, drawn at its own weight in every look
        const p = svg("path", { d, fill: "none", stroke: shredInks[n % 3], "stroke-width": 3, "stroke-linecap": "round", "stroke-linejoin": "round" }, shredLayer);
        return { p, x, y };
      });

      // ---------- trays ----------
      const items = plan.map((p) => {
        const g = svg("g", { transform: `translate(${p.cx} ${IN_Y})` }, trayLayer);
        const halo = svg("rect", { x: -p.w / 2 - 18, y: -TH / 2 - 18, width: p.w + 36, height: TH + 36, rx: ui.radius("lg", 22), fill: alpha(C.warning, 0.24), opacity: 0 }, g);
        const ring = svg("rect", { x: -p.w / 2 - 6, y: -TH / 2 - 6, width: p.w + 12, height: TH + 12, rx: ui.radius("md", 14), fill: "none", stroke: C.warning, "stroke-width": ui.stroke("regular", 2), opacity: 0 }, g);
        const body = svg("rect", { x: -p.w / 2, y: -TH / 2, width: p.w, height: TH, rx: ui.radius("md", 10), fill: C.surface, ...OUT }, g);
        svg("line", { x1: -p.w / 2, x2: p.w / 2, y1: TH / 2 - BAND, y2: TH / 2 - BAND, ...ui.strokeAttrs("hair", 1, C.line) }, g);
        const sku = svg("text", { x: 0, y: TH / 2 - 7, "text-anchor": "middle", class: "cd-sku" }, g);
        sku.textContent = p.sku;
        const sockets = [];
        for (let k = 0; k < p.slots; k++) {
          const cx = -p.w / 2 + 9 + U / 2 + (k % p.cols) * U, cy = -TH / 2 + 7 + U / 2 + Math.floor(k / p.cols) * U;
          if (p.missing.has(k)) {
            sockets.push(svg("circle", { cx, cy, r: UR, fill: "none", stroke: C.faint || C.line, "stroke-width": ui.stroke("fine", 1.4), "stroke-dasharray": "3 2.6" }, g));
          } else {
            svg("circle", { cx, cy, r: UR, fill: p.colour, ...ui.strokeAttrs("fine", 1.2, INK) }, g);
            svg("circle", { cx: cx - 2.6, cy: cy - 2.6, r: 2.2, fill: mix(p.colour, "#ffffff", 0.6) }, g);
          }
        }
        return { p, g, halo, ring, body, sockets };
      });

      // ---------- clipboard and the slip ----------
      const board = mix(C.paper, C.ink, 0.17);
      svg("rect", { x: SHEET.x - 22, y: SHEET.y - 28, width: SHEET.w + 44, height: SHEET.h + 52, rx: ui.radius("lg", 22), fill: board, ...OUT }, s);
      const sheet = el("div", "cd-sheet", root);
      Object.assign(sheet.style, { left: SHEET.x + "px", top: SHEET.y + "px", width: SHEET.w + "px", height: SHEET.h + "px" });
      const head = el("div", "cd-head", sheet);
      el("span", "cd-label", head, content.slipTitle || "Packing slip");
      el("span", "cd-po", head, content.po || "");
      el("div", "cd-supplier", sheet, content.supplier || "");
      el("div", "cd-meta", sheet, content.slipMeta || "");
      const cols = el("div", "cd-cols cd-label", sheet);
      (content.cols || ["Item", "Ord", "Rec"]).forEach((c) => el("span", "", cols, c));
      el("span", "", cols, "");
      const rows = plan.map((p, i) => {
        const r = el("div", "cd-row", sheet);
        r.style.top = ROW0 - SHEET.y + i * RH + "px";
        const check = el("i", "cd-band cd-band-check", r);
        const flag = el("i", "cd-band cd-band-flag", r);
        const item = el("div", "cd-item", r);
        el("span", "cd-name", item, p.name);
        el("span", "cd-code", item, p.sku);
        el("div", "cd-num", r, String(p.ordered));
        const rec = el("div", "cd-num", r);
        const dash = el("span", "cd-dash", rec, "—");
        const val = el("span", "cd-val", rec, String(p.received));
        if (!p.ok) val.dataset.flag = "";
        val.style.opacity = "0";
        const mark = el("div", "cd-mark", r);
        const ms = svg("svg", { viewBox: "0 0 26 26", width: 26, height: 26 }, mark);
        let tick = null, flagMark = null;
        if (p.ok) {
          // sm-native: a tick is a glyph, drawn at the weight that reads at its size
          tick = svg("path", { d: "M5 13.5L10.5 19L21 7.5", fill: "none", stroke: C.positiveText || C.positive, "stroke-width": 2.6, "stroke-linecap": "round", "stroke-linejoin": "round", pathLength: 1, "stroke-dasharray": 1, "stroke-dashoffset": 1 }, ms);
        } else {
          flagMark = svg("g", { opacity: 0 }, ms);
          svg("circle", { cx: 13, cy: 13, r: 11, fill: C.warning }, flagMark);
          // sm-native: the exclamation mark is a glyph
          svg("path", { d: "M13 7.5V14", stroke: C.onWarning || C.ink, "stroke-width": 2.6, "stroke-linecap": "round" }, flagMark);
          svg("circle", { cx: 13, cy: 18.3, r: 1.6, fill: C.onWarning || C.ink }, flagMark);
        }
        return { check, flag, dash, val, tick, flagMark };
      });
      const sum = el("div", "cd-sum", sheet);
      const r1 = el("div", "cd-sum-row", sum);
      const big = el("b", "cd-big", r1, "0");
      el("span", "cd-label", r1, content.matchedLabel || "units matched");
      const r2 = el("div", "cd-sum-row cd-flagrow", sum);
      el("i", "cd-dot", r2);
      const flagNum = el("b", "", r2, "0");
      const flagLab = el("span", "cd-label", r2, content.flagLabelPlural || "discrepancies");

      const pl = el("div", "cd-pallet cd-label", root, content.palletLabel || "");
      Object.assign(pl.style, { left: PAL.x + PAL.w / 2 + "px", top: GROUND + 10 + "px" });

      // ---------- the note, the leader to the slip, the clip over the sheet ----------
      const bad = plan.find((p) => !p.ok);
      let note = null;
      if (bad) {
        note = el("div", "cd-note", root);
        Object.assign(note.style, { left: HOVER.x - NOTE.w / 2 + "px", top: HOVER.y + TH / 2 + 40 + "px" });
        const diff = bad.received - bad.ordered;
        el("div", "cd-note-k", note, bad.note ? bad.noteTitle || "" : fmt(diff < 0 ? content.shortNote : content.overNote, { n: Math.abs(diff) }));
        el("div", "cd-note-v", note, bad.note || fmt(content.countNote, { ord: bad.ordered, rec: bad.received }));
      }
      const top = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "cd-top" }, root);
      const tdefs = svg("defs", {}, top);
      const lclip = svg("clipPath", { id: "cd-lead" }, tdefs);
      const lrect = svg("rect", { x: 0, y: 0, width: 0, height: H }, lclip);
      const badRow = bad ? plan.indexOf(bad) : 0;
      const nx = HOVER.x + NOTE.w / 2, ny = HOVER.y + TH / 2 + 40 + NOTE.h / 2;
      const ex = SHEET.x + 14, ey = ROW0 + badRow * RH + RH / 2;
      const lead = svg("g", { "clip-path": "url(#cd-lead)", opacity: 0 }, top);
      svg("path", { d: `M${nx} ${ny}C${nx + 70} ${ny} ${ex - 80} ${ey} ${ex} ${ey}`, fill: "none", stroke: C.warning, "stroke-width": ui.stroke("regular", 2), "stroke-dasharray": "5 5", "stroke-linecap": "round" }, lead);
      svg("circle", { cx: ex, cy: ey, r: 4.5, fill: C.warning, ...ui.strokeAttrs("fine", 1.2, INK) }, lead);
      svg("circle", { cx: nx, cy: ny, r: 3.5, fill: C.warning }, lead);
      // the clipboard's clip holds the sheet down
      const cx0 = SHEET.x + SHEET.w / 2;
      svg("rect", { x: cx0 - 84, y: SHEET.y - 46, width: 168, height: 70, rx: ui.radius("md", 14), fill: mix(C.ink, C.paper, 0.3), ...OUT }, top);
      svg("rect", { x: cx0 - 34, y: SHEET.y - 34, width: 68, height: 16, rx: 8, fill: board, ...OUT }, top); // sm-native: a pill stays a pill
      svg("rect", { x: cx0 - 64, y: SHEET.y + 8, width: 128, height: 8, rx: 4, fill: mix(C.ink, C.paper, 0.5) }, top); // sm-native: a pill stays a pill

      return { plan, items, rows, big, flagNum, flagLab, note, lead, lrect, shred, content, C, leadW: ex - nx + 10, nx };
    },

    render(t, S, h) {
      const { tw, clamp, lerp, text, set } = h;
      const { C, content } = S;
      const outOf = (i, extra = 0) => tw(t, RESET + extra + h.motion.stagger(i, 0.07), 0.45, "inOut");

      // ---------- trays ----------
      S.items.forEach((it) => {
        const p = it.p, sT = p.s;
        const lift = tw(t, sT, 0.7, "signature");
        let x = p.cx, y = lerp(IN_Y, LIFT_Y, lift), rot = p.tilt * (1 - lift), op = 1, grow = 1;
        if (p.ok) {
          const tr = tw(t, sT + 0.8, 0.65, "inOut");
          x = lerp(p.cx, p.slot.x, tr);
          y = lerp(y, p.slot.y, tr) - ARC * Math.sin(Math.PI * tr);
          rot += 5 * Math.sin(Math.PI * tr);
          const out = outOf(p.order);
          op = 1 - out;
          y += 12 * out;
        } else {
          const fl = tw(t, sT + 0.8, 0.9, "signature");
          x = lerp(p.cx, HOVER.x, fl);
          y = lerp(y, HOVER.y, fl) + 4 * Math.sin((2 * Math.PI * (t - (sT + 1.7))) / BOB) * tw(t, sT + 1.7, 0.6, "soft");
          rot += -2.5 * fl;
          grow = 1 + 0.16 * fl; // the short tray comes forward as it floats up
          const on = tw(t, p.flagAt, 0.4, "snappy");
          const out = outOf(0, 0.1);
          op = 1 - out;
          set(it.halo, { opacity: (on * 0.95).toFixed(3) });
          const ph = t >= p.flagAt ? ((t - p.flagAt) / PING) % 1 : 0;
          set(it.ring, { opacity: (t >= p.flagAt ? 0.7 * (1 - ph) : 0).toFixed(3), transform: `scale(${(1 + 0.22 * ph).toFixed(4)})` });
          const warm = on > 0.5;
          set(it.body, { stroke: warm ? C.warning : h.ui.strokeColor(C.stroke || C.ink), "stroke-width": warm ? h.ui.stroke("bold", 3) : h.ui.stroke("regular", 1.5) });
          it.sockets.forEach((c) => set(c, { stroke: warm ? C.warning : C.faint || C.line, fill: warm ? h.alpha(C.warning, 0.2) : "none" }));
        }
        set(it.g, { transform: `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${rot.toFixed(2)}) scale(${(p.ok ? 1 : grow).toFixed(4)})`, opacity: op.toFixed(3) });
      });

      // ---------- shred: pushed aside as each tray comes up through it ----------
      for (const sh of S.shred) {
        let dx = 0, dy = 0;
        for (const p of S.plan) {
          if (t < p.s || t > p.s + 1.3) continue;
          const env = clamp((t - p.s) / 0.3) * (1 - tw(t, p.s + 0.3, 0.9, "soft"));
          const prox = Math.max(0, 1 - Math.abs(sh.x - p.cx) / (p.w / 2 + 50));
          dx += Math.sign(sh.x - p.cx || 1) * 14 * env * prox;
          dy -= 9 * env * prox;
        }
        set(sh.p, { transform: `translate(${(sh.x + dx).toFixed(2)} ${(sh.y + dy).toFixed(2)})` });
      }

      // ---------- slip rows ----------
      let matched = 0, flags = 0, last = -1;
      S.plan.forEach((p, i) => {
        const r = S.rows[i];
        const done = p.ok ? p.landAt : p.flagAt;
        const back = tw(t, RESET + 0.3 + h.motion.stagger(i, 0.06), 0.35, "inOut");
        const checking = tw(t, p.s + 0.15, 0.3, "snappy") * (1 - tw(t, done, 0.3, "snappy"));
        r.check.style.opacity = checking.toFixed(3);
        const v = tw(t, done, 0.35, "snappy") * (1 - back);
        r.val.style.opacity = v.toFixed(3);
        r.val.style.transform = `translateY(${((1 - tw(t, done, 0.35, "snappy")) * 8).toFixed(2)}px)`;
        r.dash.style.opacity = (1 - v).toFixed(3);
        if (p.ok) {
          set(r.tick, { "stroke-dashoffset": (1 - tw(t, p.landAt + 0.05, 0.3, "snappy")).toFixed(4), opacity: (1 - back).toFixed(3) });
          if (t >= p.landAt && t < SWAP) { matched += p.received; last = Math.max(last, p.landAt); }
        } else {
          const on = tw(t, p.flagAt, 0.4, "snappy");
          r.flag.style.opacity = (on * (1 - back)).toFixed(3);
          set(r.flagMark, { opacity: (on * (1 - back)).toFixed(3), transform: `translate(13 13) scale(${(0.6 + 0.4 * on).toFixed(3)}) translate(-13 -13)` });
          if (t >= p.flagAt && t < SWAP) { flags += 1; last = Math.max(last, p.flagAt); }
        }
      });

      // ---------- the total: what landed, nudged in as it changes ----------
      if (t >= SWAP) last = SWAP;
      const bump = last < 0 ? 1 : tw(t, last, 0.35, "snappy");
      const fade = t < SWAP ? 1 - tw(t, RESET + 0.3, 0.3, "inOut") : tw(t, SWAP + 0.05, 0.4, "soft");
      text(S.big, String(matched));
      text(S.flagNum, String(flags));
      text(S.flagLab, flags === 1 ? content.flagLabel || "discrepancy" : content.flagLabelPlural || "discrepancies");
      for (const n of [S.big, S.flagNum]) {
        n.style.transform = `translateY(${((1 - bump) * 10).toFixed(2)}px)`;
        n.style.opacity = (fade * (0.35 + 0.65 * bump)).toFixed(3);
      }

      // ---------- the note and its leader ----------
      const bad = S.plan.find((p) => !p.ok);
      if (bad && S.note) {
        const out = outOf(0, 0.1);
        const n = tw(t, bad.flagAt + 0.5, 0.6, "signature");
        S.note.style.opacity = (n * (1 - out)).toFixed(3);
        S.note.style.transform = `translateY(${((1 - n) * 14).toFixed(2)}px)`;
        const l = tw(t, bad.flagAt + 0.8, 0.55, "inOut");
        set(S.lead, { opacity: (l > 0 ? 1 - out : 0).toFixed(3) });
        set(S.lrect, { x: S.nx - 6, width: (l * S.leadW).toFixed(1) });
      }
    },
  });
})();
