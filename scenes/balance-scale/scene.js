/* balance-scale: quality against cost, weighed rather than claimed (SVG + DOM).
 * Three pan balances share one rubric. Quality blocks (accuracy, speed, uptime) land on the left pan, cost
 * blocks (price, setup, overages) on the right; every block is as wide as its score. The rivals are weighed
 * block by block, quality and cost in turn, and wobble into a sag under heavy cost; ours takes its small cost blocks, then its quality blocks land
 * together and the beam tips decisively, overshoots and settles (the signature moment).
 *
 * The picture is honest: the resting angle of a beam whose centre of mass hangs below the pivot satisfies
 * tan θ = (left − right) · L / (M · d). Every balance here uses the same stiffness K = M·d/L (content.stiffness),
 * so each beam rests at atan((quality − cost) / K) and the three tilts compare like for like.
 *
 * Motion is closed-form: each block landing is a step in the beam's rest angle, and the beam's angle is the sum
 * of damped-spring step responses evaluated at t (never simulated step by step), so any frame can be seeked.
 * Intro 0 → 1 s (copy and balances fade in), then the loop 1 → 14 s: load, settle, hold, unload, level.
 */
(function () {
  const W = 1600, H = 900, D = 14, LOOP = 1;
  const FLOOR = 760;
  const UNLOAD = 12.0; // blocks lift off; readouts fade just before
  const SLOTS = [250, 800, 1350];

  // unit step response of a damped spring (rest 0 → 1), closed form
  const spring = (tau, w, z) => {
    if (tau <= 0) return 0;
    const wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * tau) * (Math.cos(wd * tau) + ((z * w) / wd) * Math.sin(wd * tau));
  };
  // critically damped return (no bounce) for the unload
  const settle = (tau, w) => (tau <= 0 ? 0 : 1 - (1 + w * tau) * Math.exp(-w * tau));
  const MONO = 7.25; // px per character, 12px monospace

  SiteMotion.scene({
    width: W,
    height: H,
    duration: D,
    loop: LOOP,
    still: 10,
    setup({ root, content, tokens, h }) {
      const { el, svg, mix, ui, motion, textOn } = h;
      const C = tokens.color;
      const INK = ui.strokeColor(C.ink);
      const OUT = (n = 1.5) => ui.strokeAttrs("regular", n, C.ink);
      root.classList.add("bs");
      // our ratio and verdict in the accent ink, lifted until it reads at AA on this paper (dark themes)
      root.style.setProperty("--bs-ours", textOn(C.paper, C.accentInk || C.ink));
      const K = content.stiffness || 40;
      const qFill = C.accent, cFill = mix(C.warning, C.surface, 0.18);
      const qText = textOn(qFill, C.onAccent || C.ink), cText = textOn(cFill, C.ink);

      // ---------- copy ----------
      const copy = el("div", "bs-copy", root);
      el("div", "bs-eyebrow", copy, content.eyebrow || "");
      el("div", "bs-h", copy, content.heading || "");
      el("div", "bs-sub", copy, content.sub || "");
      const legend = el("div", "bs-legend", root);
      const lg = content.legend || {};
      [["q", lg.quality], ["c", lg.cost]].forEach(([k, txt]) => {
        const row = el("div", "bs-legend-row", legend);
        el("span", "bs-swatch bs-swatch-" + k, row);
        el("span", "", row, txt || "");
      });
      el("div", "bs-legend-note", legend, lg.note || "");

      const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "bs-svg" }, root);
      // sm-native: the floor is a hairline rule under the bases, not an outline
      svg("line", { x1: 96, x2: W - 96, y1: FLOOR, y2: FLOOR, stroke: C.line, "stroke-width": ui.stroke("hair", 1) }, s);

      // ---------- balances ----------
      // timing: a rival is weighed block by block, quality and cost in turn, and wobbles into a sag;
      // ours takes its small cost blocks first, then its quality blocks land together as one gesture
      const plan = [
        (side, k) => 1.3 + (2 * k + (side > 0 ? 1 : 0)) * 0.34,
        (side, k) => (side > 0 ? 3.9 : 5.3) + motion.stagger(k, 0.12),
        (side, k) => 1.45 + (2 * k + (side > 0 ? 1 : 0)) * 0.34,
      ];
      const scales = content.scales.slice(0, 3).map((sc, si) => {
        const ours = !!sc.ours;
        const f = ours ? 1 : 0.62;
        const cx = SLOTS[si];
        const L = 200 * f, P = 30 * f, PT = 8 * f, PW = 176 * f, SH = 30 * f, U = 16 * f, BH = 12 * f;
        const py = FLOOR - 290 * f;
        const Lp = 130 * f; // pointer length
        const w = ours ? 2 * Math.PI * 0.6 : 2 * Math.PI * 0.85, z = ours ? 0.42 : 0.38;
        const g = svg("g", {}, s);

        // pillar, base, gauge
        const baseH = 22 * f, baseW = 150 * f;
        svg("path", { d: `M${cx - baseW / 2} ${FLOOR}L${cx - baseW / 2 + 20 * f} ${FLOOR - baseH}H${cx + baseW / 2 - 20 * f}L${cx + baseW / 2} ${FLOOR}Z`, fill: C.surface, ...OUT(), "stroke-linejoin": "round" }, g);
        svg("rect", { x: cx - 7 * f, y: py, width: 14 * f, height: FLOOR - baseH - py, fill: C.surface, ...OUT() }, g);
        const arcR = Lp + 6 * f, A = (35 * Math.PI) / 180;
        // sm-native: the gauge is a printed scale; its ticks keep their hairline weight
        svg("path", { d: `M${cx - arcR * Math.sin(A)} ${py + arcR * Math.cos(A)}A${arcR} ${arcR} 0 0 0 ${cx + arcR * Math.sin(A)} ${py + arcR * Math.cos(A)}`, fill: "none", stroke: mix(C.ink, C.paper, 0.45), "stroke-width": 1.2 }, g);
        let ticks = "";
        for (let d = -30; d <= 30; d += 10) {
          const a = (d * Math.PI) / 180, r1 = arcR, r2 = arcR + (d === 0 ? 12 : 7) * f;
          ticks += `M${(cx + r1 * Math.sin(a)).toFixed(1)} ${(py + r1 * Math.cos(a)).toFixed(1)}L${(cx + r2 * Math.sin(a)).toFixed(1)} ${(py + r2 * Math.cos(a)).toFixed(1)}`;
        }
        svg("path", { d: ticks, fill: "none", stroke: mix(C.ink, C.paper, 0.45), "stroke-width": 1.2, "stroke-linecap": "round" }, g); // sm-native: printed ticks
        const pointer = svg("g", {}, g);
        svg("line", { x1: 0, y1: 0, x2: 0, y2: Lp, stroke: ours ? C.accentInk || INK : INK, "stroke-width": ui.stroke("bold", 2.5) * (ours ? 1 : 0.8), "stroke-linecap": "round" }, pointer);

        // beam
        const beam = svg("g", {}, g);
        svg("rect", { x: -L - 12 * f, y: -BH / 2, width: 2 * L + 24 * f, height: BH, rx: BH / 2, fill: C.surface, ...OUT() }, beam); // sm-native: the beam is a bar with round ends in every look
        [-L, L].forEach((x) => svg("circle", { cx: x, cy: 0, r: 4 * f, fill: INK }, beam));
        svg("circle", { cx, cy: py, r: 9 * f, fill: ours ? C.accent : C.surface, ...OUT() }, g);
        svg("circle", { cx, cy: py, r: 2.6 * f, fill: INK }, g);

        // pans: a post and a plate riding each beam end (the plates stay level), blocks stacked on the plate
        const mkPan = (side, items, fill, txtCol, when) => {
          const pan = svg("g", {}, g);
          svg("line", { x1: 0, y1: 0, x2: 0, y2: -P, stroke: INK, "stroke-width": ui.stroke("bold", 3) * (ours ? 1 : 0.8), "stroke-linecap": "round" }, pan);
          svg("rect", { x: -PW / 2, y: -P - PT, width: PW, height: PT, rx: Math.min(PT / 2, ui.radius("sm", 4)), fill: C.surface, ...OUT() }, pan);
          const blocks = items.map((it, k) => {
            const bw = Math.max(4, it.value * U);
            const y = -P - PT - (k + 1) * SH;
            const bg = svg("g", {}, pan);
            svg("rect", { x: -bw / 2, y, width: bw, height: SH, rx: Math.min(ui.radius("sm", 4), SH / 3), fill, ...OUT(1.2) }, bg);
            const val = it.value.toFixed(1);
            const name = ours ? it.label + " " : "";
            const full = name + val;
            const inside = bw >= full.length * MONO + 16;
            const ty = y + SH / 2 + 4.2;
            if (inside && ours) {
              const a = svg("text", { x: -bw / 2 + 9, y: ty, class: "bs-block", fill: txtCol }, bg); a.textContent = it.label;
              const b = svg("text", { x: bw / 2 - 9, y: ty, "text-anchor": "end", class: "bs-block", fill: txtCol }, bg); b.textContent = val;
            } else if (inside) {
              const a = svg("text", { x: 0, y: ty, "text-anchor": "middle", class: "bs-block", fill: txtCol }, bg); a.textContent = val;
            } else {
              const a = svg("text", { x: bw / 2 + 7, y: ty, class: "bs-block bs-block-out" }, bg); a.textContent = full;
            }
            const start = when(side, k);
            return { node: bg, value: it.value, start, land: start + 0.22, out: UNLOAD + motion.stagger(k, 0.06), dy: 26 * f };
          });
          return { side, node: pan, blocks };
        };
        const left = mkPan(-1, sc.quality, qFill, qText, plan[si]);
        const right = mkPan(1, sc.cost, cFill, cText, plan[si]);

        // every landing changes the beam's rest angle; the beam follows each change with a damped spring
        const landings = [...left.blocks.map((b) => ({ t: b.land, dq: b.value, dc: 0 })), ...right.blocks.map((b) => ({ t: b.land, dq: 0, dc: b.value }))].sort((a, b) => a.t - b.t);
        let q = 0, c = 0, prev = 0;
        const steps = landings.map((l) => {
          q += l.dq; c += l.dc;
          const rest = (Math.atan((q - c) / K) * 180) / Math.PI;
          const step = { t: l.t, d: rest - prev, q, c };
          prev = rest;
          return step;
        });
        const Q = q, Cs = c, theta = prev;
        const lastLand = steps[steps.length - 1].t;

        // readout under the base
        const rd = el("div", "bs-read" + (ours ? " bs-read-ours" : ""), root);
        Object.assign(rd.style, { left: cx - (ours ? 230 : 150) + "px", width: (ours ? 460 : 300) + "px" });
        const ratio = el("div", "bs-ratio", rd, (Q / Cs).toFixed(1) + "×");
        const col = el("div", "bs-read-col", rd);
        const head = el("div", "bs-name", col);
        el("span", "", head, sc.name);
        const verdict = el("span", "bs-verdict", head, theta > 0 ? content.verdict?.quality || "" : content.verdict?.cost || "");
        const rl = el("div", "bs-ratio-label", col, content.ratioLabel || "");
        const sums = el("div", "bs-sums", col, "");
        return { ours, cx, py, L, w, z, beam, pointer, left, right, steps, theta, ratio, verdict, rl, sums, rd, lastLand, firstLand: steps[0].t, showAt: lastLand + (ours ? 1.1 : 0.9), qWord: content.qualityWord || "Quality", cWord: content.costWord || "Cost" };
      });

      return { copy, legend, scales, s };
    },

    render(t, S, h) {
      const { tw, clamp } = h;
      const intro = tw(t, 0, 0.8, "soft");
      S.copy.style.opacity = intro.toFixed(3);
      S.copy.style.transform = `translateY(${((1 - tw(t, 0, 0.8)) * 16).toFixed(1)}px)`;
      S.legend.style.opacity = tw(t, 0.15, 0.8, "soft").toFixed(3);
      S.s.style.opacity = tw(t, 0.1, 0.8, "soft").toFixed(3);
      const readOut = 1 - tw(t, UNLOAD - 0.15, 0.4, "inOut");

      S.scales.forEach((sc) => {
        // beam angle: sum of spring step responses, then a calm return once the blocks lift off
        let th = 0;
        for (const st of sc.steps) th += st.d * spring(t - st.t, sc.w, sc.z);
        th -= sc.theta * settle(t - (UNLOAD + 0.12), 4.5);
        th *= 1 - tw(t, 13.35, 0.5, "inOut"); // retire the last hundredth of a degree before the seam
        const rad = (th * Math.PI) / 180;
        h.set(sc.beam, { transform: `translate(${sc.cx} ${sc.py}) rotate(${(-th).toFixed(3)})` });
        h.set(sc.pointer, { transform: `translate(${sc.cx} ${sc.py}) rotate(${(-th).toFixed(3)})` });
        [sc.left, sc.right].forEach((pan) => {
          const x = sc.cx + pan.side * sc.L * Math.cos(rad), y = sc.py - pan.side * sc.L * Math.sin(rad);
          h.set(pan.node, { transform: `translate(${x.toFixed(2)} ${y.toFixed(2)})` });
          pan.blocks.forEach((b) => {
            const pin = tw(t, b.start, 0.55), off = tw(t, b.out, 0.5, "inOut");
            const op = clamp(pin * 2.2) * (1 - off);
            h.set(b.node, { transform: `translate(0 ${(-(1 - pin) * b.dy - off * b.dy).toFixed(2)})`, opacity: op.toFixed(3) });
          });
        });

        // readouts: totals add up as blocks land; the ratio and verdict arrive once the last block is on
        let q = 0, c = 0;
        for (const st of sc.steps) if (t >= st.t) { q = st.q; c = st.c; }
        h.text(sc.sums, `${sc.qWord} ${q.toFixed(1)} · ${sc.cWord} ${c.toFixed(1)}`);
        sc.sums.style.opacity = (tw(t, sc.firstLand - 0.1, 0.3, "soft") * readOut).toFixed(3);
        const show = tw(t, sc.showAt, 0.45, "snappy") * readOut;
        sc.ratio.style.opacity = show.toFixed(3);
        sc.ratio.style.transform = `translateY(${((1 - tw(t, sc.showAt, 0.45, "snappy")) * 12).toFixed(1)}px)`;
        sc.verdict.style.opacity = show.toFixed(3);
        sc.rl.style.opacity = show.toFixed(3);
        sc.rd.style.opacity = intro.toFixed(3);
      });
    },
  });
})();
