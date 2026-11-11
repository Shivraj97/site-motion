/* roadmap-rail--story: a company's history on a vertical rail (SVG shapes, DOM text), for an about page.
 * The years from content run bottom to top along one rail; dated milestones sit on it with one line each.
 * A marker climbs from the founding year, stopping at every milestone: the rail below it fills, the milestone
 * lights and rings out. The signature: the marker reaches the top (the milestone marked `highlight`, today) and
 * today's card unfurls from it with the company's headline figure, while every milestone below pulses once.
 *
 * Everything shown comes from content.json: years (`axis.periods`), milestone titles, dates, positions (`at`, in
 * years from the first period), the one-line notes, and today's status, figure, unit and note. The marker's flag
 * reads the year it is in, taken from where it is on the rail. Positions and widths come from the arrays and
 * measured text.
 */
(function () {
  const W = 1600, H = 900, D = 14, LOOP = 2;
  // the loop: climb in steps to today, the card opens and holds, it folds back, the climb resets
  const T0 = 2.3, TA = 7.0, TC = 11.4, TR = 12.2, TRD = 0.6, TIN = 13.25, DWELL = 0.28;
  const RX = 820, TOPY = 156, BOT = 806, LX = RX + 46, CW = 600;

  SiteMotion.scene({
    width: W,
    height: H,
    duration: D,
    loop: LOOP,
    still: 8.7,
    async setup({ root, content, tokens, h }) {
      const { el, svg, mix, alpha, ui, ease, clamp, lerp } = h;
      const C = tokens.color;
      root.classList.add("rs");
      const FILL = C.accentFill || C.accent, ON = C.onAccent || h.inkOn(C.accent);

      // ---------- copy ----------
      const copy = el("div", "rs-copy", root);
      const copyNodes = [el("div", "rs-eyebrow", copy, content.eyebrow || ""), el("div", "rs-h", copy, content.heading || "")];
      if (content.sub) copyNodes.push(el("div", "rs-sub", copy, content.sub));

      // ---------- the years and the rail's scale ----------
      const periods = (content.axis && content.axis.periods) || [];
      const nP = periods.length;
      const span = Math.max(1, nP - 1);
      const Y = (a) => BOT - (a / span) * (BOT - TOPY);
      const yearEls = periods.map((p, i) => {
        const e = el("div", "rs-year", root, p);
        e.style.top = Y(i) - 9 + "px";
        return e;
      });

      // ---------- milestones ----------
      const ms = (content.milestones || []).map((m) => ({ m, at: clamp(m.at ?? 0, 0, span), hl: !!m.highlight }));
      ms.sort((a, b) => a.at - b.at);
      if (ms.length && !ms.some((x) => x.hl)) ms[ms.length - 1].hl = true;
      const hl = ms.find((x) => x.hl);
      ms.forEach((x) => {
        x.y = Y(x.at);
        x.label = el("div", "rs-ms", root);
        if (x.m.date) el("div", "rs-ms-d", x.label, x.m.date);
        x.title = el("div", "rs-ms-t", x.label, x.m.title || "");
        if (x.m.note && !x.hl) el("div", "rs-ms-n", x.label, x.m.note);
        x.label.style.left = LX + "px";
      });

      // ---------- today's card ----------
      const card = el("div", "rs-card", root);
      const cardRows = [];
      const head = el("div", "rs-card-head", card);
      const stat = el("span", "rs-status", head, hl.m.status || hl.m.title || "");
      stat.style.background = FILL;
      stat.style.color = ON;
      if (hl.m.date) el("span", "rs-card-d", head, hl.m.date);
      cardRows.push(head);
      if (hl.m.value) {
        const fig = el("div", "rs-fig", card);
        el("span", "rs-fig-v", fig, hl.m.value);
        if (hl.m.unit) el("span", "rs-fig-u", fig, hl.m.unit);
        cardRows.push(fig);
      } else cardRows.push(el("div", "rs-card-t", card, hl.m.title || ""));
      if (hl.m.note) cardRows.push(el("div", "rs-card-n", card, hl.m.note));

      // ---------- the marker's flag ----------
      const pill = el("div", "rs-pill", root);
      pill.style.background = FILL;
      pill.style.color = ON;
      const pillText = el("span", "", pill, "");

      // measure once the web fonts are in, so every width is the real one
      if (document.fonts) { void root.offsetWidth; await document.fonts.ready; }
      let pillW = 0;
      for (const p of periods) { pillText.textContent = p; pillW = Math.max(pillW, pillText.offsetWidth); }
      pillW = Math.ceil(pillW + 32);
      pill.style.width = pillW + "px";
      pill.style.left = RX - 26 - pillW + "px";
      ms.forEach((x) => {
        // the title's centre sits on the node
        const d = x.label.querySelector(".rs-ms-d");
        x.label.style.top = x.y - (d ? d.offsetHeight : 0) - x.title.offsetHeight / 2 + "px";
      });
      const cardH = card.offsetHeight;
      const cardTop = clamp(hl.y - 36, 24, H - 24 - cardH);
      card.style.left = LX - 22 + "px";
      card.style.top = cardTop + "px";
      const nodeInCard = hl.y - cardTop; // the node's height inside the card: the card unfurls from there

      // ---------- SVG ----------
      const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "rs-svg" }, root);
      const HAIR = ui.stroke("hair", 1), REG = ui.stroke("regular", 1.5), BOLD = ui.stroke("bold", 2);
      const INK = ui.strokeColor(C.ink), future = ui.strokeColor(mix(C.ink, C.paper, 0.45));
      const glow = svg("rect", { x: RX - 30, y: BOT, width: 60, height: 0, fill: alpha(C.accent, 0.1) }, s);
      const ticks = svg("g", {}, s);
      periods.forEach((p, i) => svg("line", { x1: RX - 14, y1: Y(i), x2: RX, y2: Y(i), stroke: C.faint, "stroke-width": HAIR }, ticks));
      const base = svg("line", { x1: RX, y1: BOT, x2: RX, y2: BOT, stroke: C.line, "stroke-width": ui.stroke("regular", 2), "stroke-linecap": "round" }, s);
      const done = svg("line", { x1: RX, y1: BOT, x2: RX, y2: BOT, stroke: mix(C.accent, C.ink, 0.3), "stroke-width": ui.stroke("bold", 4), "stroke-linecap": "round" }, s);
      const ringLayer = svg("g", {}, s);
      const markLayer = svg("g", {}, s);
      ms.forEach((x) => {
        const g = svg("g", {}, markLayer);
        x.g = g;
        x.stub = svg("line", { x1: RX + 14, y1: x.y, x2: RX + 14, y2: x.y, stroke: mix(C.accent, C.ink, 0.3), "stroke-width": REG }, s);
        if (x.hl) {
          svg("rect", { x: -10, y: -10, width: 20, height: 20, transform: "rotate(45)", fill: C.surface, stroke: C.accent, "stroke-width": BOLD }, g);
          x.dot = svg("rect", { x: -10, y: -10, width: 20, height: 20, transform: "rotate(45)", fill: FILL, stroke: INK, "stroke-width": REG, opacity: 0 }, g);
          // sm-native: the tick is a glyph inside the marker, drawn at a fixed weight
          x.tick = svg("path", { d: "M-5 0.5l3.2 3.2 6.3-6.6", fill: "none", stroke: ON, "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0 }, g);
        } else {
          svg("circle", { r: 9, fill: C.surface, stroke: future, "stroke-width": REG }, g);
          x.dot = svg("circle", { r: 9.5, fill: FILL, stroke: INK, "stroke-width": REG, opacity: 0 }, g);
          // sm-native: the tick is a glyph inside the marker, drawn at a fixed weight
          x.tick = svg("path", { d: "M-4 0.2l2.8 2.8 5.3-5.6", fill: "none", stroke: ON, "stroke-width": 1.8, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0 }, g);
        }
        // sm-native: reach rings are a state cue, not outline style
        x.ring = svg("circle", { cx: RX, cy: x.y, r: 10, fill: "none", stroke: x.hl ? C.accent : mix(C.accent, C.ink, 0.35), "stroke-width": 2, opacity: 0 }, ringLayer);
        // sm-native: reach rings are a state cue, not outline style
        x.echo = svg("circle", { cx: RX, cy: x.y, r: 10, fill: "none", stroke: C.accent, "stroke-width": 1.5, opacity: 0 }, ringLayer);
      });
      // the climbing marker: a halo, a knob, and a hairline to its flag
      const flagLine = svg("line", { x1: RX - 26, y1: BOT, x2: RX - 10, y2: BOT, stroke: C.accent, "stroke-width": BOLD }, s);
      const knobHalo = svg("circle", { cx: RX, cy: BOT, r: 18, fill: alpha(C.accent, 0.2) }, s);
      const knob = svg("circle", { cx: RX, cy: BOT, r: 8, fill: FILL, stroke: INK, "stroke-width": REG }, s);
      root.appendChild(card);
      root.appendChild(pill);

      // ---------- the climb: travel to each milestone, dwell, travel on ----------
      const keys = [{ t: T0, a: 0 }];
      const stops = ms.map((x) => x.at).filter((a) => a > 0);
      const nDwell = Math.max(0, stops.length - 1);
      const travel = Math.max(0.5, TA - T0 - nDwell * DWELL);
      let prev = 0;
      const weights = stops.map((a) => { const w = Math.max(0.3, Math.pow(a - prev, 0.6)); prev = a; return w; });
      const wSum = weights.reduce((p, w) => p + w, 0) || 1;
      let tt = T0;
      stops.forEach((a, i) => {
        tt += (travel * weights[i]) / wSum;
        keys.push({ t: tt, a, move: true });
        if (i < stops.length - 1) { tt += DWELL; keys.push({ t: tt, a }); }
      });
      const posAt = (t) => {
        if (t <= keys[0].t) return keys[0].a;
        for (let i = 1; i < keys.length; i++) {
          const k = keys[i], p = keys[i - 1];
          if (t < k.t) return k.move ? lerp(p.a, k.a, ease.inOut((t - p.t) / (k.t - p.t))) : p.a;
        }
        return keys[keys.length - 1].a;
      };
      // each milestone lights the moment the marker arrives on it
      ms.forEach((x) => { const k = keys.find((q) => q.move && q.a === x.at); x.tDone = x.at <= 0 ? T0 : k ? k.t : Infinity; });
      hl.tDone = keys[keys.length - 1].t;

      // intro order: bottom to top, as the story reads
      ms.forEach((x, i) => { x.k = i; });
      return { copyNodes, yearEls, ms, hl, card, cardRows, cardH, nodeInCard, pill, pillText, pillW, periods, base, done, glow, ticks, knob, knobHalo, flagLine, posAt, Y, span };
    },

    render(t, S, h) {
      const { tw, clamp, ease } = h;
      const resetDone = t >= TR + TRD;
      const pv = 1 - ease.inOut(clamp((t - TR) / TRD)); // the climb's traces fade before the reset
      const live = t >= T0 && !resetDone;
      const pos = resetDone ? 0 : S.posAt(t);
      const py = S.Y(pos);
      const TOP_Y = S.Y(S.span);

      // ---------- intro (finished by LOOP) ----------
      S.copyNodes.forEach((n, i) => {
        const a = tw(t, 0.05 + h.motion.stagger(i, 0.08), 0.7);
        n.style.opacity = a.toFixed(3);
        n.style.transform = `translateY(${((1 - a) * 14).toFixed(1)}px)`;
      });
      const railIn = tw(t, 0.25, 0.9);
      h.set(S.base, { y2: (BOT - (BOT - TOP_Y) * railIn).toFixed(1) });
      S.ticks.setAttribute("opacity", tw(t, 0.4, 0.6, "soft").toFixed(3));

      // year labels make way for the flag as it passes
      const phOp = resetDone ? tw(t, TIN, 0.5, "soft") : tw(t, 1.3, 0.5, "soft") * pv;
      S.yearEls.forEach((e, i) => {
        const a = tw(t, 0.4 + h.motion.stagger(i, 0.06), 0.5, "soft");
        const away = clamp((Math.abs(S.Y(i) - py) - 12) / 18);
        e.style.opacity = (a * (1 - phOp * (1 - away))).toFixed(3);
      });

      // ---------- the past: the rail fills below the marker ----------
      h.set(S.done, { y2: py.toFixed(1), opacity: (live ? pv : 0).toFixed(3) });
      h.set(S.glow, { y: py.toFixed(1), height: Math.max(0, BOT - py).toFixed(1), opacity: (live ? pv : 0).toFixed(3) });

      // ---------- milestones ----------
      S.ms.forEach((x) => {
        const a = tw(t, 0.6 + h.motion.stagger(x.k, 0.09), 0.5);
        h.set(x.g, { transform: `translate(${RX} ${x.y.toFixed(1)}) scale(${(0.6 + 0.4 * a).toFixed(3)})`, opacity: a.toFixed(3) });
        x.label.style.opacity = a.toFixed(3);
        x.label.style.transform = `translateX(${((1 - a) * 12).toFixed(1)}px)`;
        const reached = live && t >= x.tDone;
        const d = (reached ? 1 : 0) * pv;
        const pop = reached ? tw(t, x.tDone, 0.4, "snappy") : 0;
        h.set(x.dot, { opacity: d.toFixed(3), transform: x.hl ? `rotate(45) scale(${(0.7 + 0.3 * pop).toFixed(3)})` : `scale(${(0.7 + 0.3 * pop).toFixed(3)})` });
        h.set(x.tick, { opacity: (d * pop).toFixed(3) });
        h.set(x.stub, { x2: (RX + 14 + (LX - 10 - RX - 14) * pop).toFixed(1), opacity: d.toFixed(3) });
        x.title.classList.toggle("is-done", d > 0.5);
        x.label.classList.toggle("is-done", d > 0.5);
        const ping = reached ? tw(t, x.tDone, x.hl ? 0.9 : 0.7, "soft") : 0;
        h.set(x.ring, { r: (10 + ping * (x.hl ? 34 : 18)).toFixed(1), opacity: (ping > 0 && ping < 1 ? (1 - ping) * 0.8 * pv : 0).toFixed(3) });
        // the echo: once today is reached, every milestone below pulses once, top to bottom
        const eStart = S.hl.tDone + 0.35 + h.motion.stagger(S.ms.length - 1 - x.k, 0.09);
        const e = !x.hl && live && t >= eStart ? tw(t, eStart, 0.7, "soft") : 0;
        h.set(x.echo, { r: (10 + e * 16).toFixed(1), opacity: (e > 0 && e < 1 ? (1 - e) * 0.7 * pv : 0).toFixed(3) });
      });

      // ---------- the signature: today's card unfurls from the top node ----------
      const kOut = tw(t, TC, 0.4, "snappy");
      const k = tw(t, S.hl.tDone + 0.05, 0.8) * (1 - kOut);

      // ---------- the marker and its flag (the knob settles into today's node as the card opens) ----------
      h.set(S.knob, { cy: py.toFixed(1), r: (8 * (1 - k)).toFixed(2), opacity: (phOp * (k > 0.98 ? 0 : 1)).toFixed(3) });
      h.set(S.knobHalo, { cy: py.toFixed(1), opacity: phOp.toFixed(3) });
      h.set(S.flagLine, { y1: py.toFixed(1), y2: py.toFixed(1), opacity: phOp.toFixed(3) });
      S.pill.style.transform = `translateY(${(py - 15).toFixed(1)}px)`;
      S.pill.style.opacity = phOp.toFixed(3);
      h.text(S.pillText, S.periods[Math.min(S.periods.length - 1, Math.floor(pos + 1e-6))] || "");

      S.card.style.visibility = k > 0.001 ? "visible" : "hidden";
      const r = 1 - k;
      const top = (S.nodeInCard - 16) * r, bottom = (S.cardH - S.nodeInCard - 16) * r, right = (CW - 32) * r;
      S.card.style.clipPath = k >= 0.999 ? "none" : `inset(${top.toFixed(1)}px ${right.toFixed(1)}px ${bottom.toFixed(1)}px 0 round ${(16 - 4 * k).toFixed(1)}px)`;
      S.cardRows.forEach((row, i) => {
        const a = tw(t, S.hl.tDone + 0.3 + h.motion.stagger(i, 0.08), 0.5, "soft") * (1 - kOut);
        row.style.opacity = a.toFixed(3);
        row.style.transform = `translateY(${((1 - a) * 8).toFixed(1)}px)`;
      });
      // today's own label gives way to the card, and comes back as it folds
      S.hl.label.style.opacity = (tw(t, 0.6 + h.motion.stagger(S.hl.k, 0.09), 0.5) * (t < TC ? 1 - clamp(k * 3) : tw(t, TC + 0.4, 0.3, "soft"))).toFixed(3);
    },
  });
})();
