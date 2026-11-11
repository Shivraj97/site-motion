/* account-health--proof: one account's year, told as a customer story (SVG chart in a DOM card, DOM copy beside it).
 * The parent's health table shrinks to the one row that mattered, and its sparkline grows into the whole chart: a
 * year of weekly scores drawn large over the watch and at-risk bands. The line holds, slides through watch into at
 * risk, and at the trough the same playbook chip drops onto it on a stem. The line climbs back; a bracket under it
 * grows from the playbook to the point it re-enters healthy, and a second bracket at the year's end grows as the
 * line rises past a dashed line at its old level. The two numbers those brackets measure are the outcomes beside the
 * quote, so every figure on screen is read off the line.
 *
 * Everything comes from content: the account (name, mark, `series` of any length >= 8, `playbook`), thresholds,
 * state names, axis labels, the quote and person, the mark and outcome templates ({gain}, {recovery}, {before},
 * {end}, {unit}). The trough is the lowest point of the series (or `playbook.at`); "before" is the highest point
 * ahead of it (or `playbook.before`).
 */
(function () {
  const D = 14, LOOP = 1.2, W = 1600, H = 900;
  SiteMotion.scene({
    width: W,
    height: H,
    loop: LOOP,
    duration: D,
    still: 11.4,
    setup({ root, content, tokens, h }) {
      const { el, svg, mix, ui } = h;
      const C = tokens.color, pal = tokens.palette;
      const dark = window.SMTokens ? SMTokens.lum(C.paper) < 0.2 : false;
      root.classList.add("ahp");
      const acc = content.account || { series: [80, 80] };
      const s = acc.series;
      const N = s.length;
      const thr = content.thresholds || { healthy: 70, watch: 50 };
      const states = content.states || {};
      const marks = content.marks || {};
      const axis = content.axis || [];
      const pb = acc.playbook || {};

      const GOOD = C.positive, WARN = C.warning, RISK = C.danger || C.negative || C.warningText || C.warning;
      const LINE = mix(C.ink, C.surface, dark ? 0.12 : 0.08);

      // ---- what the story reads off the series ----
      const trough = pb.at ?? s.indexOf(Math.min(...s));
      let before = pb.before;
      if (before == null) { before = 0; for (let i = 0; i < trough; i++) if (s[i] > s[before]) before = i; }
      let back = N - 1;
      for (let i = trough; i < N; i++) if (s[i] >= thr.healthy) { back = i; break; }
      const vBefore = s[before], vEnd = s[N - 1];
      const vals = { before: vBefore, end: vEnd, gain: Math.round(vEnd - vBefore), recovery: back - trough, unit: content.unit || "weeks", weeks: N };
      const fill = (str, extra = {}) => String(str || "").replace(/\{(\w+)\}/g, (_, k) => (k in extra ? extra[k] : k in vals ? vals[k] : ""));

      // ---- the chart's frame, in card coordinates ----
      const CW = 884, CH = 676, HEAD = 84;
      const X0 = 76, X1 = CW - 124, Y0 = 156, Y1 = CH - 58;
      const lo = Math.max(0, Math.floor((Math.min(thr.watch, ...s) - 14) / 10) * 10), hi = 100;
      const xOf = (p) => X0 + p * (X1 - X0);
      const xAt = (i) => xOf(i / (N - 1));
      const yOf = (v) => Y1 - ((v - lo) / (hi - lo)) * (Y1 - Y0);
      const valAt = (p) => { const f = h.clamp(p) * (N - 1), i = Math.min(N - 2, Math.floor(f)); return h.lerp(s[i], s[i + 1], f - i); };

      // A: draw to the start of the slide; B: the slide to the trough; hold while the playbook fires; C: the climb to the year's end
      let start = 0;
      for (let i = 0; i < trough; i++) if (s[i] >= thr.healthy + 5) start = i;
      const p0 = Math.max(0.15, (start - 1) / (N - 1)), pT = trough / (N - 1);
      const pAt = (t) => p0 * h.tw(t, 1.5, 2.0, "signature") + (pT - p0) * h.tw(t, 3.5, 1.9, "inOut") + (1 - pT) * h.tw(t, 6.2, 3.4, "inOut");
      const tFire = 5.55, tEnd = 9.6;
      let tRecover = 99, tPass = 99;
      for (let t = 5.4; t < 10; t += 1 / 120) {
        const v = valAt(pAt(t));
        if (tRecover > 90 && v >= thr.healthy) tRecover = t;
        if (tPass > 90 && v >= vBefore) tPass = t;
      }

      // ---- the chart card ----
      const card = el("div", "ahp-card", root);
      const head = el("div", "ahp-head", card);
      const who = el("div", "ahp-acc", head);
      const markBg = pal[2 % pal.length];
      const mk = el("span", "ahp-mark", who, acc.mark || "");
      mk.style.background = markBg;
      mk.style.color = h.inkOn(markBg);
      const whoT = el("div", "ahp-acc-t", who);
      el("div", "ahp-name", whoT, acc.name || "");
      el("div", "ahp-sub", whoT, fill(content.chartTitle || "Weekly health score · {period}", { period: content.period || "" }));
      const live = el("div", "ahp-live", head);
      const cursor = el("span", "ahp-cursor", live, "");
      const score = el("span", "ahp-score", live, "");
      const pill = el("span", "ahp-pill", live);
      const dot = el("span", "ahp-dot", pill);
      const stack = el("span", "ahp-pill-stack", pill);
      const lab = ["healthy", "watch", "risk"].map((k) => el("span", "ahp-pill-l", stack, states[k] || k));

      const plot = svg("svg", { class: "ahp-plot", width: CW, height: CH, viewBox: `0 0 ${CW} ${CH}` }, card);
      const defs = svg("defs", {}, plot);
      // bands: watch and at risk, faintly, so the line visibly enters them
      const yH = yOf(thr.healthy), yW = yOf(thr.watch);
      svg("rect", { x: X0, y: yH.toFixed(1), width: X1 - X0, height: (yW - yH).toFixed(1), fill: h.alpha(WARN, dark ? 0.07 : 0.08) }, plot);
      svg("rect", { x: X0, y: yW.toFixed(1), width: X1 - X0, height: (Y1 - yW).toFixed(1), fill: h.alpha(RISK, dark ? 0.06 : 0.05) }, plot);
      // measured against a heavier tint than the band's own, so the label keeps AA wherever the card sits
      const onBand = { watch: h.textOn(h.mix(C.surface, WARN, 0.3), C.muted), risk: h.textOn(h.mix(C.surface, RISK, 0.3), C.muted) };
      const hair = ui.stroke("hair", 1);
      [[thr.healthy, yH], [thr.watch, yW]].forEach(([v, y]) => {
        svg("line", { x1: X0, x2: X1, y1: y.toFixed(1), y2: y.toFixed(1), stroke: C.line, "stroke-width": hair, "stroke-dasharray": "3 5" }, plot);
        svg("text", { x: X0 - 14, y: (y + 4.5).toFixed(1), class: "ahp-ylab", "text-anchor": "end" }, plot).textContent = String(v);
      });
      svg("line", { x1: X0, x2: X1, y1: Y1, y2: Y1, stroke: C.line, "stroke-width": ui.stroke("fine", 1) }, plot);
      // band names sit at the left, where the line is still high
      [["healthy", yH - 12], ["watch", yH + 22], ["risk", yW + 22]].forEach(([k, y]) => {
        const label = svg("text", { x: X0 + 14, y: y.toFixed(1), class: "ahp-band" }, plot);
        label.textContent = states[k] || k;
        // a name inside a tinted band reads at AA on that tint, not just on the card
        if (onBand[k]) label.style.fill = onBand[k];
      });
      axis.forEach((m, k) => {
        svg("text", { x: (X0 + ((k + 0.5) / axis.length) * (X1 - X0)).toFixed(1), y: Y1 + 32, class: "ahp-xlab", "text-anchor": "middle" }, plot).textContent = m;
      });

      // the line: neutral while healthy, warm through watch, the risk colour below; drawn through a clip
      const grad = svg("linearGradient", { id: "ahp-g", gradientUnits: "userSpaceOnUse", x1: 0, y1: Y0, x2: 0, y2: Y1 }, defs);
      const off = (y) => h.clamp((y - Y0) / (Y1 - Y0)).toFixed(4);
      [[0, LINE], [off(yH), LINE], [off(yH), WARN], [off(yW), WARN], [off(yW), RISK], [1, RISK]].forEach(([o, c]) => svg("stop", { offset: o, "stop-color": c }, grad));
      const agrad = svg("linearGradient", { id: "ahp-a", gradientUnits: "userSpaceOnUse", x1: 0, y1: Y0, x2: 0, y2: Y1 }, defs);
      svg("stop", { offset: 0, "stop-color": C.ink, "stop-opacity": dark ? 0.1 : 0.07 }, agrad);
      svg("stop", { offset: 1, "stop-color": C.ink, "stop-opacity": 0 }, agrad);
      const clipRect = svg("rect", { x: 0, y: 0, width: 0, height: CH }, svg("clipPath", { id: "ahp-c" }, defs));
      const pts = s.map((v, i) => [xAt(i), yOf(v)]);
      // a light Catmull-Rom smoothing so weekly steps read as one line
      let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
      for (let i = 0; i < N - 1; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[i + 1], e = pts[Math.min(N - 1, i + 2)], k = 1 / 6;
        d += `C${(b[0] + (c[0] - a[0]) * k).toFixed(1)} ${(b[1] + (c[1] - a[1]) * k).toFixed(1)} ${(c[0] - (e[0] - b[0]) * k).toFixed(1)} ${(c[1] - (e[1] - b[1]) * k).toFixed(1)} ${c[0].toFixed(1)} ${c[1].toFixed(1)}`;
      }
      const g = svg("g", { "clip-path": "url(#ahp-c)" }, plot);
      svg("path", { d: `${d}L${X1} ${Y1}L${X0} ${Y1}Z`, fill: "url(#ahp-a)" }, g);
      // sm-native: the health line is the data; its weight stays with the data
      svg("path", { d, fill: "none", stroke: "url(#ahp-g)", "stroke-width": 3, "stroke-linejoin": "round", "stroke-linecap": "round" }, g);

      // "before": a dashed line at the old level, drawn out to the year's end
      const xB = xAt(before), yB = yOf(vBefore), yE = yOf(vEnd);
      const bLine = svg("line", { x1: xB.toFixed(1), x2: xB.toFixed(1), y1: yB.toFixed(1), y2: yB.toFixed(1), stroke: C.muted, "stroke-width": ui.stroke("fine", 1.2), "stroke-dasharray": "5 5", opacity: 0 }, plot);
      const bLab = svg("text", { x: X1, y: (yB + 22).toFixed(1), class: "ahp-mk", "text-anchor": "end", opacity: 0 }, plot);
      bLab.textContent = fill(marks.before || "Before {before}");

      // the playbook moment: a ring on the trough, a stem up to the chip
      const xT = xAt(trough), yT = yOf(s[trough]);
      const chipTop = HEAD + 14, chipH = 32;
      const stem = svg("line", { x1: xT.toFixed(1), x2: xT.toFixed(1), y1: chipTop + chipH, y2: (yT - 8).toFixed(1), stroke: C.faint, "stroke-width": ui.stroke("fine", 1), "stroke-dasharray": "2 4", opacity: 0 }, plot);
      // sm-native: the trough marker is a state cue
      const ring = svg("circle", { cx: xT.toFixed(1), cy: yT.toFixed(1), r: 7, fill: C.surface, stroke: RISK, "stroke-width": 2, opacity: 0 }, plot);

      // the recovery bracket under the climb: playbook to back in healthy
      const xC = xOf(h.clamp((function () { // where the line crosses the healthy threshold, between two weeks
        const i = Math.max(trough, back - 1), a = s[i], b = s[back];
        return (i + (b === a ? 0 : (thr.healthy - a) / (b - a))) / (N - 1);
      })()));
      const yR = Math.min(Y1 - 36, yT + 44);
      const rBr = svg("path", { d: "", fill: "none", stroke: C.ink, "stroke-width": ui.stroke("fine", 1.4), opacity: 0 }, plot);
      const rLab = svg("text", { x: ((xT + xC) / 2).toFixed(1), y: (yR + 24).toFixed(1), class: "ahp-mk ahp-mk-strong", "text-anchor": "middle", opacity: 0 }, plot);
      rLab.textContent = fill(marks.recovery || "{recovery} {unit} to healthy");
      // sm-native: a state cue (where the line re-enters healthy)
      const ping = svg("circle", { cx: xC.toFixed(1), cy: yH.toFixed(1), r: 4, fill: "none", stroke: GOOD, "stroke-width": 1.6, opacity: 0 }, plot);

      // the gain bracket at the year's end: from the old level up to where the line finished
      const xG = X1 + 22;
      const gBr = svg("path", { d: "", fill: "none", stroke: GOOD, "stroke-width": ui.stroke("regular", 2), opacity: 0 }, plot);
      const gLab = svg("text", { x: xG + 12, y: ((yB + yE) / 2 + 6).toFixed(1), class: "ahp-gain", opacity: 0 }, plot);
      gLab.textContent = fill(marks.gain || "+{gain}");

      // sm-native: the tip's surface halo separates it from the line; not an outline
      const tip = svg("circle", { r: 6, fill: LINE, stroke: C.surface, "stroke-width": 2.5, opacity: 0 }, plot);

      const chip = el("div", "ahp-chip", card);
      Object.assign(chip.style, { left: xT.toFixed(1) + "px", top: chipTop + "px", height: chipH + "px" });
      el("span", "ahp-chip-dot", chip);
      el("span", "ahp-chip-k", chip, (pb.label || "Playbook") + ":");
      el("span", "ahp-chip-n", chip, pb.name || "");
      const st = el("span", "ahp-chip-st", chip);
      const pend = el("span", "ahp-chip-pend", st, pb.pending ? "· " + pb.pending : "");
      const sent = el("span", "ahp-chip-sent", st, "· " + (pb.status || "sent") + " ✓");

      // ---- the story beside it ----
      const side = el("div", "ahp-side", root);
      const top = el("div", "ahp-top", side);
      const eyebrow = el("div", "ahp-eyebrow", top, content.eyebrow || "");
      const quote = el("blockquote", "ahp-quote", top, content.quote || "");
      const per = content.person || {};
      const att = el("div", "ahp-att", top);
      const av = el("span", "ahp-av", att, per.initials || "");
      const avBg = pal[0];
      av.style.background = avBg;
      av.style.color = h.inkOn(avBg);
      const attT = el("div", "ahp-att-t", att);
      el("div", "ahp-att-n", attT, per.name || "");
      el("div", "ahp-att-r", attT, [per.role, per.company].filter(Boolean).join(", "));
      const outs = el("div", "ahp-outs", side);
      const O = (content.outcomes || []).slice(0, 2).map((o) => {
        const box = el("div", "ahp-out ahp-out-" + (o.kind || "x"), outs);
        const row = el("div", "ahp-out-v", box);
        const num = el("span", "ahp-out-n", row, fill(o.value));
        if (o.suffix) el("span", "ahp-out-s", row, fill(o.suffix));
        el("div", "ahp-out-l", box, fill(o.label));
        return { kind: o.kind, row, num };
      });

      return { card, chip, head, live, cursor, score, pill, dot, lab, clipRect, tip, bLine, bLab, stem, ring, rBr, rLab, ping, gBr, gLab, pend, sent,
        intro: [eyebrow, quote, att, outs], O, lineG: g,
        pAt, valAt, xOf, yOf, thr, vals, tpl: content.cursor || "", tFire, tEnd, tRecover, tPass,
        geo: { X1, xB, yB, yE, xT, yT, xC, yR, xG, yH },
        col: { GOOD, WARN, RISK, LINE, surface: C.surface, positiveText: C.positiveText || C.positive, warningText: C.warningText || C.warning, onWarning: C.onWarning || C.ink } };
    },

    render(t, S, h) {
      const { tw, clamp, mix } = h;
      const { thr, col, geo } = S;
      const p = S.pAt(t);
      const v = S.valAt(p);
      const out = 1 - tw(t, 12.6, 0.7, "inOut");
      const vis = tw(t, 1.4, 0.45, "snappy") * out;
      const band = (x, edge) => clamp((x - (edge - 1.5)) / 3);
      const blend3 = (a, b, c, wb, wc) => mix(mix(a, b, wb), c, wc);
      const op = (x) => x.toFixed(3);

      // intro: the card, then the story column, settle in once
      S.card.style.opacity = op(tw(t, 0, 0.5, "soft"));
      S.card.style.transform = `translateY(${((1 - tw(t, 0, 0.8, "signature")) * 16).toFixed(1)}px)`;
      S.intro.forEach((n, k) => {
        const e = tw(t, 0.15 + Math.min(0.45, h.motion.stagger(k, 0.09)), 0.7, "signature");
        n.style.opacity = op(e);
        n.style.transform = `translateY(${((1 - e) * 14).toFixed(1)}px)`;
      });

      // the line and its tip
      const x = S.xOf(p), y = S.yOf(v);
      h.set(S.clipRect, { width: (x + 3).toFixed(1) });
      h.set(S.lineG, { opacity: op(out) });
      const wg = band(v, thr.healthy), wr = 1 - band(v, thr.watch), ww = Math.max(0, 1 - wg - wr);
      const tipC = blend3(col.LINE, col.WARN, col.RISK, ww / Math.max(1e-6, wg + ww), wr);
      h.set(S.tip, { cx: x.toFixed(1), cy: y.toFixed(1), fill: tipC, opacity: op(clamp((t - 1.45) / 0.15) * out) });

      // the live readout: week, score and state, read under the tip
      const week = 1 + Math.round(p * (S.vals.weeks - 1));
      h.text(S.cursor, S.tpl.replace(/\{(\w+)\}/g, (_, k) => (k === "week" ? week : k === "weeks" ? S.vals.weeks : "")));
      h.text(S.score, String(Math.round(v)));
      S.live.style.opacity = op(vis);
      const bgG = mix(col.surface, col.GOOD, 0.16), bgW = mix(col.surface, col.WARN, 0.22);
      const bg = blend3(bgG, bgW, col.RISK, ww / Math.max(1e-6, wg + ww), wr);
      S.pill.style.background = bg;
      S.dot.style.background = blend3(col.GOOD, col.WARN, col.RISK, ww / Math.max(1e-6, wg + ww), wr);
      const fg = h.textOn(bg, wr > 0.5 ? col.onWarning : wg > 0.5 ? col.positiveText : col.warningText);
      S.lab.forEach((l, k) => { l.style.opacity = op([wg, ww, wr][k]); l.style.color = fg; });

      // before: the old level, drawn out to the end as the slide begins
      const bIn = tw(t, 3.3, 0.9, "signature") * out;
      h.set(S.bLine, { x2: (geo.xB + (geo.X1 + 10 - geo.xB) * bIn).toFixed(1), opacity: op(bIn > 0 ? out : 0) });
      h.set(S.bLab, { opacity: op(tw(t, 3.8, 0.5, "soft") * out) });

      // the playbook fires at the trough
      h.set(S.ring, { opacity: op(tw(t, S.tFire - 0.05, 0.35, "snappy") * out) });
      h.set(S.stem, { opacity: op(tw(t, S.tFire + 0.1, 0.35, "snappy") * out) });
      const chipIn = tw(t, S.tFire, 0.45, "snappy") * out;
      S.chip.style.opacity = op(chipIn);
      S.chip.style.transform = `translate(-50%, ${((1 - chipIn) * -8).toFixed(1)}px)`;
      const sentK = tw(t, S.tFire + 0.55, 0.35, "snappy");
      S.pend.style.opacity = op(1 - sentK);
      S.sent.style.opacity = op(sentK);

      // the recovery bracket grows with the climb and closes where the line re-enters healthy
      const rx = Math.min(geo.xC, Math.max(geo.xT, x));
      const rOn = x > geo.xT + 0.5 && t > S.tFire ? out : 0;
      h.set(S.rBr, { d: `M${geo.xT.toFixed(1)} ${(geo.yR - 7).toFixed(1)}V${geo.yR.toFixed(1)}H${rx.toFixed(1)}` + (rx >= geo.xC - 0.5 ? `V${(geo.yR - 7).toFixed(1)}` : ""), opacity: op(rOn) });
      const rDone = tw(t, S.tRecover, 0.45, "snappy") * out;
      h.set(S.rLab, { opacity: op(rDone) });
      const pk = tw(t, S.tRecover, 0.9, "soft");
      h.set(S.ping, { r: (4 + pk * 16).toFixed(1), opacity: op(pk > 0 && pk < 1 ? (1 - pk) * 0.9 * out : 0) });

      // the gain bracket rises with the line once it passes its old level
      const gTop = S.yOf(Math.max(S.vals.before, v));
      const gOn = t >= S.tPass ? out : 0;
      h.set(S.gBr, { d: `M${(geo.xG - 7).toFixed(1)} ${geo.yB.toFixed(1)}H${geo.xG.toFixed(1)}V${gTop.toFixed(1)}H${(geo.xG - 7).toFixed(1)}`, opacity: op(gOn) });
      const gDone = tw(t, S.tEnd, 0.5, "snappy") * out;
      h.set(S.gLab, { opacity: op(gDone) });

      // the outcomes beside the quote arrive when their bracket closes
      S.O.forEach((o) => {
        const k = o.kind === "recovery" ? rDone : o.kind === "gain" ? gDone : vis;
        o.row.style.opacity = op(k);
        o.row.style.transform = `translateY(${((1 - k) * 10).toFixed(1)}px)`;
      });
    },
  });
})();
