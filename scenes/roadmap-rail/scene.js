/* roadmap-rail: a roadmap on a time axis (SVG shapes, DOM text).
 * Periods from content (quarters, weeks) run left to right; 2–3 tracks each hold 2–5 dated milestones, some a
 * single day (a dot), some a range (a bar). A "Today" playhead walks the axis: the past behind it is washed,
 * milestones it passes fill in, bars fill as it travels through them, and future ones stay outlined.
 * The signature: the playhead settles on the milestone marked `highlight`, and its pill opens into a detail card.
 *
 * Everything shown comes from content.json: periods, tracks, milestone titles, dates, positions (`at`, `end` in
 * period units from the axis start), the card's status and note, and the words in the summary line. Positions,
 * label slots (above or below the rail) and widths are computed from the arrays and measured text.
 * Keep the highlight right of the heading column (about the right 55% of the axis) so the card has room.
 */
(function () {
  const W = 1600, H = 900, D = 14, LOOP = 2;
  // the loop: the playhead walks to the highlight, dwells while the card is open, walks on to the end, then resets
  const T0 = 2.3, TH = 6.1, TH2 = 9.0, TE = 11.5, TR = 12.5, TRD = 0.6, TIN = 13.25;
  const L = 96, R = 1504, PILL_Y = 292, PILL_H = 32, AXIS_TOP = 342, AXIS_Y = 380, TOP = 392, BOT = 812, CW = 400;

  SiteMotion.scene({
    width: W,
    height: H,
    duration: D,
    loop: LOOP,
    still: 7.5,
    async setup({ root, content, tokens, h }) {
      const { el, svg, mix, alpha, ui, ease, clamp, lerp } = h;
      const C = tokens.color, pal = tokens.palette;
      root.classList.add("rr");
      const words = Object.assign({ done: "done", active: "in progress", planned: "planned" }, content.status || {});

      // ---------- copy ----------
      const copy = el("div", "rr-copy", root);
      const copyNodes = [el("div", "rr-eyebrow", copy, content.eyebrow || ""), el("div", "rr-h", copy, content.heading || "")];
      if (content.sub) copyNodes.push(el("div", "rr-sub", copy, content.sub));

      // ---------- track names (measured first: the column is as wide as the longest name) ----------
      const tracks = content.tracks || [];
      const nT = tracks.length;
      const trackEls = tracks.map((tr, i) => {
        const colour = tr.colour || pal[i % pal.length];
        const box = el("div", "rr-track", root);
        const name = el("div", "rr-track-n", box);
        const sw = el("span", "rr-sw", name);
        sw.style.background = colour;
        el("span", "", name, tr.name);
        const n = (tr.milestones || []).length;
        const count = el("div", "rr-track-c", box, `${n}/${n} ${words.done}`); // widest value, for measuring
        return { box, count, colour, n };
      });

      // ---------- milestone labels ----------
      const periods = content.axis.periods;
      const nP = periods.length;
      const subdiv = Math.max(1, content.axis.sub || 1);
      const ms = [];
      tracks.forEach((tr, ti) => (tr.milestones || []).forEach((m) => {
        const label = el("div", "rr-ms", root);
        const title = el("div", "rr-ms-t", label, m.title);
        el("div", "rr-ms-d", label, m.date || "");
        ms.push({ ti, m, at: m.at, end: m.end, range: m.end != null && m.end > m.at, hl: !!m.highlight, label, title });
      }));
      if (!ms.some((x) => x.hl) && ms.length) [...ms].sort((a, b) => a.at - b.at)[Math.floor(ms.length * 0.6)].hl = true;
      const hl = ms.find((x) => x.hl);

      // ---------- the playhead's pill and the card it opens into ----------
      const ph = Object.assign({ label: "Today" }, content.playhead || {});
      const pill = el("div", "rr-pill", root);
      pill.style.background = C.accentFill || C.accent;
      pill.style.color = C.onAccent || h.inkOn(C.accent);
      const pillText = el("span", "", pill, "");
      const card = el("div", "rr-card", root);
      const hlTrack = tracks[hl.ti];
      const cardRows = [];
      const head = el("div", "rr-card-head", card);
      const chip = el("span", "rr-chip", head);
      const csw = el("span", "rr-sw", chip);
      csw.style.background = trackEls[hl.ti].colour;
      el("span", "", chip, hlTrack.name);
      if (hl.m.status) el("span", "rr-status", head, hl.m.status);
      cardRows.push(head);
      cardRows.push(el("div", "rr-card-t", card, hl.m.title));
      if (hl.m.date) cardRows.push(el("div", "rr-card-d", card, hl.m.date));
      if (hl.m.note) cardRows.push(el("div", "rr-card-n", card, hl.m.note));

      // ---------- summary line: counts that come from what the playhead passed ----------
      const sum = el("div", "rr-sum", root);
      const sumParts = ["done", "active", "planned"].map((k) => {
        const item = el("span", "rr-sum-i", sum);
        el("span", `rr-g rr-g-${k}`, item);
        const num = el("b", "", item, String(ms.length));
        el("span", "", item, words[k]);
        return num;
      });

      // measure once the web fonts are in (setup may be async), so every slot and width is the real one
      if (document.fonts) { void root.offsetWidth; await document.fonts.ready; }
      const colW = Math.max(150, ...trackEls.map((t) => t.box.offsetWidth));
      const x0 = L + colW + 40;
      const pw = (R - x0) / nP;
      const X = (a) => x0 + a * pw;
      sum.style.left = x0 + "px";
      let pillW = 0;
      for (const p of periods) { pillText.textContent = `${ph.label} · ${p}`; pillW = Math.max(pillW, pillText.offsetWidth); }
      pillW = Math.ceil(pillW + 36);
      pill.style.width = pillW + "px";
      pill.style.top = PILL_Y + "px";
      const copyRight = L + Math.max(...copyNodes.map((n) => n.offsetWidth));

      // ---------- SVG ----------
      const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "rr-svg" }, root);
      const HAIR = ui.stroke("hair", 1), REG = ui.stroke("regular", 1.5), BOLD = ui.stroke("bold", 2);
      const wash = svg("rect", { x: x0, y: AXIS_TOP, width: 0, height: BOT - AXIS_TOP, fill: alpha(C.accent, 0.08) }, s);
      const grid = svg("g", {}, s);
      const gridLine = mix(C.line, C.paper, 0.1);
      periods.forEach((p, i) => {
        svg("line", { x1: X(i), y1: AXIS_TOP, x2: X(i), y2: BOT, stroke: gridLine, "stroke-width": HAIR }, grid);
        const lab = el("div", "rr-period", root, p);
        lab.style.left = X(i) + 12 + "px";
        lab.style.top = AXIS_TOP + 8 + "px";
        for (let k = 1; k < subdiv; k++) svg("line", { x1: X(i + k / subdiv), y1: AXIS_Y - 6, x2: X(i + k / subdiv), y2: AXIS_Y, stroke: C.faint, "stroke-width": HAIR }, grid);
      });
      svg("line", { x1: X(nP), y1: AXIS_TOP, x2: X(nP), y2: BOT, stroke: gridLine, "stroke-width": HAIR }, grid);
      svg("line", { x1: x0, y1: AXIS_Y, x2: R, y2: AXIS_Y, stroke: C.line, "stroke-width": HAIR }, grid);
      const laneH = (BOT - TOP) / Math.max(1, nT);
      for (let i = 1; i < nT; i++) svg("line", { x1: L, y1: TOP + laneH * i, x2: R, y2: TOP + laneH * i, stroke: gridLine, "stroke-width": HAIR, "stroke-dasharray": "2 6" }, grid);

      const lanes = trackEls.map((tr, i) => {
        const y = TOP + laneH * (i + 0.5) + 4;
        tr.box.style.top = y - tr.box.offsetHeight / 2 + "px";
        const base = svg("line", { x1: x0, y1: y, x2: R, y2: y, stroke: C.line, "stroke-width": ui.stroke("regular", 2), "stroke-linecap": "round" }, s);
        const done = svg("line", { x1: x0, y1: y, x2: x0, y2: y, stroke: mix(tr.colour, C.ink, 0.3), "stroke-width": ui.stroke("bold", 3), "stroke-linecap": "round" }, s);
        return { ...tr, y, base, done };
      });

      // markers: an outline when planned; a fill (and a tick) once the playhead has passed
      const future = ui.strokeColor(mix(C.ink, C.paper, 0.45)), INK = ui.strokeColor(C.ink);
      const ringLayer = svg("g", {}, s);
      const markLayer = svg("g", {}, s);
      ms.forEach((x, i) => {
        const lane = lanes[x.ti];
        x.colour = lane.colour;
        x.x = X(x.at);
        x.xe = x.range ? X(x.end) : x.x;
        x.y = lane.y;
        const g = svg("g", {}, markLayer);
        x.g = g;
        if (x.range) {
          const len = x.xe - x.x;
          const clip = svg("clipPath", { id: `rr-clip-${i}` }, g);
          // sm-native: a range bar is a pill, its ends round whatever the corner style
          svg("rect", { x: 0, y: -10, width: len, height: 20, rx: 10 }, clip);
          svg("rect", { x: 0, y: -10, width: len, height: 20, rx: 10, fill: C.surface, stroke: future, "stroke-width": REG }, g); // sm-native: pill
          x.fill = svg("rect", { x: 0, y: -10, width: 0, height: 20, fill: x.colour, "clip-path": `url(#rr-clip-${i})` }, g);
          x.edge = svg("rect", { x: 0, y: -10, width: len, height: 20, rx: 10, fill: "none", stroke: INK, "stroke-width": REG, opacity: 0 }, g); // sm-native: pill
          x.half = 10;
        } else if (x.hl) {
          // the key milestone is a diamond, outlined in the accent until it is reached
          svg("rect", { x: -9, y: -9, width: 18, height: 18, transform: "rotate(45)", fill: C.surface, stroke: C.accent, "stroke-width": BOLD }, g);
          x.dot = svg("rect", { x: -9, y: -9, width: 18, height: 18, transform: "rotate(45)", fill: C.accentFill || C.accent, stroke: INK, "stroke-width": REG, opacity: 0 }, g);
          // sm-native: the tick is a glyph inside the marker, drawn at a fixed weight
          x.tick = svg("path", { d: "M-5 0.5l3.2 3.2 6.3-6.6", fill: "none", stroke: C.onAccent || h.inkOn(C.accent), "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0 }, g);
          x.half = 13;
        } else {
          svg("circle", { r: 8, fill: C.surface, stroke: future, "stroke-width": REG }, g);
          x.dot = svg("circle", { r: 8.5, fill: x.colour, stroke: INK, "stroke-width": REG, opacity: 0 }, g);
          // sm-native: the tick is a glyph inside the marker, drawn at a fixed weight
          x.tick = svg("path", { d: "M-3.6 0.2l2.5 2.5 4.8-5", fill: "none", stroke: h.inkOn(x.colour), "stroke-width": 1.8, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0 }, g);
          x.half = 9;
        }
        // sm-native: reach rings are a state cue, not outline style
        x.ring = svg("circle", { cx: x.xe, cy: x.y, r: 10, fill: "none", stroke: x.hl ? C.accent : mix(x.colour, C.ink, 0.35), "stroke-width": 2, opacity: 0 }, ringLayer);
        if (x.hl) {
          // sm-native: reach rings are a state cue, not outline style
          x.ring2 = svg("circle", { cx: x.xe, cy: x.y, r: 10, fill: "none", stroke: C.accent, "stroke-width": 1.5, opacity: 0 }, ringLayer);
          x.halo = svg("circle", { cx: x.xe, cy: x.y, r: 19, fill: alpha(C.accent, 0.16), stroke: "none", opacity: 0 }, ringLayer);
        }
      });

      // label slots: above the rail first, below when that would collide with the previous label on the track
      lanes.forEach((lane, ti) => {
        const end = { up: -Infinity, down: -Infinity };
        ms.filter((x) => x.ti === ti).sort((a, b) => a.x - b.x).forEach((x) => {
          const w = x.label.offsetWidth;
          // the highlight's label starts just past the playhead, which rests on it at the still
          let lx = x.range ? x.x : x.hl ? x.x + 8 : x.x - x.half;
          if (lx + w > R + 36) lx = (x.range ? x.xe : x.x + x.half) - w;
          const slot = lx >= end.up + 18 ? "up" : lx >= end.down + 18 ? "down" : end.up <= end.down ? "up" : "down";
          end[slot] = lx + w;
          x.label.style.left = lx + "px";
          x.label.style.top = (slot === "up" ? x.y - 54 : x.y + 16) + "px";
        });
      });

      const playLine = svg("line", { x1: 0, y1: PILL_Y + PILL_H, x2: 0, y2: BOT + 6, stroke: C.accent, "stroke-width": BOLD }, s);
      // the card and pill sit above the SVG
      root.appendChild(card);
      root.appendChild(pill);

      // ---------- the playhead's path, in period units ----------
      const hAt = hl.range ? hl.end : hl.at;
      const endAt = clamp(ph.to ?? nP, hAt, nP);
      const posAt = (t) => {
        if (t < T0) return 0;
        if (t < TH) return lerp(0, hAt, ease.inOut((t - T0) / (TH - T0)));
        if (t < TH2) return hAt;
        if (t < TE) return lerp(hAt, endAt, ease.inOut((t - TH2) / (TE - TH2)));
        return endAt;
      };
      // when the playhead first reaches a position (for the reach pings): bisection on the eased segments
      const reachAt = (a) => {
        if (a <= 0) return T0;
        const [lo0, hi0] = a <= hAt ? [T0, TH] : a <= endAt ? [TH2, TE] : [Infinity, Infinity];
        if (lo0 === Infinity) return Infinity;
        let lo = lo0, hi = hi0;
        for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (posAt(mid) >= a) hi = mid; else lo = mid; }
        return hi;
      };
      ms.forEach((x) => { x.tDone = reachAt(x.range ? x.end : x.at); });
      hl.tDone = TH;

      // the card opens out of the pill at the highlight; it hugs the pill's left edge, clear of the copy
      const hx = X(hAt);
      const pillOff = (px) => {
        const start = W - 24 - pillW + 16 - 90;
        const u = clamp((px - start) / Math.max(1, R - start));
        return lerp(-16, -(pillW - 16), u * u * (3 - 2 * u));
      };
      const pillL = hx + pillOff(hx);
      const cardL = clamp(pillL, Math.min(copyRight + 48, R - CW), R - CW);
      card.style.left = cardL + "px";
      card.style.bottom = H - (PILL_Y + PILL_H) + "px";
      const inset = { l: Math.max(0, pillL - cardL), r: Math.max(0, cardL + CW - (pillL + pillW)) };

      const order = [...ms].sort((a, b) => a.x - b.x || a.ti - b.ti);
      order.forEach((x, i) => { x.k = i; });
      const step = Math.min(0.07, 0.7 / Math.max(1, ms.length - 1));
      return { words, sum, copyNodes, lanes, ms, hl, wash, playLine, pill, pillText, pillW, pillOff, card, cardRows, inset, sumParts, posAt, X, x0, periods, ph, step, gridEls: [grid], periodEls: [...root.querySelectorAll(".rr-period")], trackEls };
    },

    render(t, S, h) {
      const { tw, clamp, ease } = h;
      const resetDone = t >= TR + TRD;
      const pv = 1 - ease.inOut(clamp((t - TR) / TRD)); // progress visibility: fades to nothing before the reset
      const pos = resetDone ? 0 : S.posAt(t);
      const px = S.X(pos);

      // ---------- intro (finished by LOOP) ----------
      S.copyNodes.forEach((n, i) => {
        const a = tw(t, 0.05 + h.motion.stagger(i, 0.08), 0.7);
        n.style.opacity = a.toFixed(3);
        n.style.transform = `translateY(${((1 - a) * 14).toFixed(1)}px)`;
      });
      const gridIn = tw(t, 0.2, 0.6, "soft");
      S.gridEls.forEach((g) => g.setAttribute("opacity", gridIn.toFixed(3)));
      S.periodEls.forEach((p) => (p.style.opacity = gridIn.toFixed(3)));
      S.lanes.forEach((lane, i) => {
        const a = tw(t, 0.3 + h.motion.stagger(i, 0.08), 0.8);
        h.set(lane.base, { x2: (S.x0 + (1504 - S.x0) * a).toFixed(1) });
        lane.box.style.opacity = a.toFixed(3);
      });

      // ---------- the past: wash, filled rails ----------
      const live = t >= T0 && !resetDone;
      h.set(S.wash, { width: Math.max(0, px - S.x0).toFixed(1), opacity: (live ? pv : 0).toFixed(3) });
      S.lanes.forEach((lane) => h.set(lane.done, { x2: px.toFixed(1), opacity: (live ? pv : 0).toFixed(3) }));

      // ---------- milestones ----------
      let done = 0, active = 0;
      const perTrack = S.lanes.map(() => 0);
      S.ms.forEach((x) => {
        const a = tw(t, 0.55 + h.motion.stagger(x.k, S.step), 0.45);
        const sc = 0.6 + 0.4 * a;
        h.set(x.g, { transform: `translate(${x.x.toFixed(1)} ${x.y.toFixed(1)}) scale(${sc.toFixed(3)})`, opacity: a.toFixed(3) });
        x.label.style.opacity = a.toFixed(3);
        x.label.style.transform = `translateY(${((1 - a) * 6).toFixed(1)}px)`;
        const reached = live && t >= x.tDone ? 1 : 0;
        const d = reached * pv;
        if (x.range) {
          const prog = live && t >= T0 ? clamp((pos - x.at) / (x.end - x.at)) : 0;
          h.set(x.fill, { width: ((x.xe - x.x) * prog).toFixed(1), opacity: pv.toFixed(3) });
          h.set(x.edge, { opacity: (prog > 0 ? pv : 0).toFixed(3) });
          if (prog > 0 && prog < 1 && pv > 0.5) active++;
        } else {
          const pop = tw(t, x.tDone, 0.4, "snappy");
          h.set(x.dot, { opacity: d.toFixed(3), transform: x.hl ? `rotate(45) scale(${(0.7 + 0.3 * pop).toFixed(3)})` : `scale(${(0.7 + 0.3 * pop).toFixed(3)})` });
          h.set(x.tick, { opacity: (d * pop).toFixed(3) });
        }
        if (d > 0.5) { done++; perTrack[x.ti]++; }
        x.title.classList.toggle("is-done", d > 0.5);
        // a ring rings out as the playhead reaches it
        const ping = live && t >= x.tDone ? tw(t, x.tDone, x.hl ? 0.9 : 0.7, "soft") : 0;
        h.set(x.ring, { r: (10 + ping * (x.hl ? 30 : 16)).toFixed(1), opacity: (ping > 0 && ping < 1 ? (1 - ping) * 0.8 * pv : 0).toFixed(3) });
        if (x.hl) {
          const p2 = live && t >= x.tDone + 0.25 ? tw(t, x.tDone + 0.25, 0.9, "soft") : 0;
          h.set(x.ring2, { r: (10 + p2 * 44).toFixed(1), opacity: (p2 > 0 && p2 < 1 ? (1 - p2) * 0.6 * pv : 0).toFixed(3) });
        }
      });
      S.sum.style.opacity = tw(t, 0.9, 0.5, "soft").toFixed(3);
      const total = S.ms.length;
      [done, active, total - done - active].forEach((n, i) => h.text(S.sumParts[i], String(n)));
      S.lanes.forEach((lane, i) => h.text(lane.count, `${perTrack[i]}/${lane.n} ${S.words.done}`));

      // ---------- the playhead ----------
      const phOp = resetDone ? tw(t, TIN, 0.5, "soft") : tw(t, 1.3, 0.5, "soft") * pv;
      h.set(S.playLine, { x1: px.toFixed(1), x2: px.toFixed(1), opacity: phOp.toFixed(3) });
      const pl = px + S.pillOff(px);
      S.pill.style.transform = `translateX(${pl.toFixed(1)}px)`;
      S.pill.style.opacity = phOp.toFixed(3);
      const period = S.periods[Math.min(S.periods.length - 1, Math.floor(pos + 1e-6))];
      h.text(S.pillText, `${S.ph.label} · ${period}`);

      // ---------- the signature: the pill opens into the card ----------
      const kOut = tw(t, TH2 - 0.45, 0.4, "snappy");
      const k = tw(t, TH - 0.05, 0.75) * (1 - kOut);
      S.card.style.visibility = k > 0.001 ? "visible" : "hidden";
      const r = 1 - k;
      S.card.style.clipPath = k >= 0.999 ? "none" : `inset(calc((100% - ${32}px) * ${r.toFixed(4)}) ${(S.inset.r * r).toFixed(1)}px 0 ${(S.inset.l * r).toFixed(1)}px round ${(16 - 4 * k).toFixed(1)}px)`;
      S.cardRows.forEach((row, i) => {
        const a = tw(t, TH + 0.2 + h.motion.stagger(i, 0.07), 0.45, "soft") * (1 - kOut);
        row.style.opacity = a.toFixed(3);
        row.style.transform = `translateY(${((1 - a) * 8).toFixed(1)}px)`;
      });
      const hl = S.hl;
      h.set(hl.halo, { opacity: (k * pv).toFixed(3) });
    },
  });
})();
