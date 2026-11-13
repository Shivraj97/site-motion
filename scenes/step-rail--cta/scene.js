/* step-rail--cta: the step rail as the closing call to action (SVG + DOM).
 * A centred CTA: heading and sub, and under them the same numbered steps compressed into one short run of nodes
 * on a rail that ends in the button. The button is the last step: its badge carries that step's number and sits
 * on the rail's rhythm. A small token runs the rail quickly, ticking each node as it leaves it, and docks in the
 * badge: the token swells to fill it, a tick draws in, the button presses in once and sends one pulse, and the
 * total time (the sum of the step times, e.g. "Live in 12 min") lands under the run.
 *
 * Everything comes from content.json: the steps (title + time), the button label, the payoff label and note.
 * With `href`, the button is a real link: it opens in the page around the embed (target _top), and takes focus.
 * Node spacing and the button width are computed from the longest strings. Intro-free loop (loop: 0): everything
 * the run built fades together at RESET and the scene rests on the untouched rail well before the seam.
 */
(function () {
  const W = 1600, H = 900, D = 7;
  const RAIL_Y = 562, NODE_R = 17, BADGE = 48, BTN_H = 84, BTN_PAD_L = 18;
  const T0 = 0.9, TL = 2.9, RESET = 5.6; // the token on node 1, the landing in the button, the fade back to rest
  SiteMotion.scene({
    width: W,
    height: H,
    loop: 0,
    duration: D,
    still: 3.5,
    setup({ root, content, tokens, h }) {
      const { el, svg, ui } = h;
      const C = tokens.color;
      root.classList.add("sc");
      const copy = el("div", "sc-copy", root);
      el("div", "sc-eyebrow", copy, content.eyebrow || "");
      el("div", "sc-h", copy, content.heading || "");
      if (content.sub) el("div", "sc-sub", copy, content.sub);

      const steps = (content.steps || []).slice(0, 6);
      const n = Math.max(2, steps.length);
      // widths from the longest strings (Inter is about 0.56 em per character at 500, titles at 17 px)
      const titleW = (s) => (s || "").length * 17 * 0.56;
      const SP = Math.max(168, Math.min(232, Math.max(...steps.map((s) => titleW(s.title))) + 34));
      const label = content.button || "";
      const stepLine = [steps[n - 1] && steps[n - 1].title, steps[n - 1] && steps[n - 1].time].filter(Boolean).join(" · ");
      const btnW = Math.round(BTN_PAD_L + BADGE + 18 + Math.max(label.length * 22 * 0.56, stepLine.length * 16 * 0.62) + 20 + 14 + 34);
      // the badge sits on the rail's rhythm, so the button reads as the last node
      const left = titleW(steps[0] && steps[0].title) / 2;
      const span = (n - 1) * SP - BTN_PAD_L - BADGE / 2 + btnW; // node 1's centre to the button's right edge
      const x0 = Math.round(W / 2 - (span - left) / 2);
      const nodeX = (i) => x0 + i * SP;
      const btnLeft = nodeX(n - 1) - BTN_PAD_L - BADGE / 2;

      const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "sc-svg" }, root);
      svg("line", { x1: nodeX(0), y1: RAIL_Y, x2: nodeX(n - 1), y2: RAIL_Y, stroke: C.line, "stroke-width": ui.stroke("regular", 2), "stroke-linecap": "round" }, s);
      const progress = svg("line", { x1: nodeX(0), y1: RAIL_Y, x2: nodeX(0), y2: RAIL_Y, stroke: C.accent, "stroke-width": ui.stroke("bold", 3), "stroke-linecap": "round", opacity: 0 }, s);
      // the pulse the button sends: drawn under the button, so only the part outside it shows
      const radius = ui.radius("lg", BTN_H / 2);
      // sm-native: the pulse is the button's own outline, its weight is the cue
      const pulse = svg("rect", { x: btnLeft, y: RAIL_Y - BTN_H / 2, width: btnW, height: BTN_H, rx: radius, fill: "none", stroke: C.accent, "stroke-width": 2.5, opacity: 0 }, s);

      const nodes = steps.slice(0, n - 1).map((_, i) => {
        const g = svg("g", { transform: `translate(${nodeX(i)} ${RAIL_Y})` }, s);
        svg("circle", { r: NODE_R, fill: C.surface, ...ui.strokeAttrs("regular", 1.5, C.line) }, g);
        // sm-native: the running ring is a state cue, not outline style
        const ring = svg("circle", { r: NODE_R + 4, fill: "none", stroke: C.accent, "stroke-width": 2, opacity: 0 }, g);
        const num = svg("text", { "text-anchor": "middle", y: 5, "font-family": "var(--font-mono)", "font-size": 14, fill: C.ink }, g);
        num.textContent = String(i + 1);
        const fill = svg("circle", { r: NODE_R, fill: C.accentFill || C.accent, opacity: 0 }, g);
        // sm-native: a tick is a glyph, its weight is part of the mark
        const tick = svg("path", { d: "M-6.5 0.5 L-2 5 L7 -4.5", fill: "none", stroke: C.onAccent || C.ink, "stroke-width": 2.4, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0 }, g);
        return { ring, num, fill, tick };
      });

      // each step's label under its node; the last step's label rides in the button, over the button label
      steps.slice(0, n - 1).forEach((st, i) => {
        const lab = el("div", "sc-step", root);
        Object.assign(lab.style, { left: nodeX(i) - 120 + "px", top: RAIL_Y + 34 + "px" });
        el("div", "sc-title", lab, st.title || "");
        el("div", "sc-time", lab, st.time || "");
      });
      const lastStep = steps[n - 1] || {};

      // the button: badge (the last step's number), label, arrow
      // with an href the button is the page's real CTA: a link that opens in the page the embed sits in
      const btn = el(content.href ? "a" : "div", "sc-btn", root);
      if (content.href) { btn.href = content.href; btn.target = content.target || "_top"; btn.setAttribute("aria-label", content.button || "Get started"); }
      Object.assign(btn.style, { left: btnLeft + "px", top: RAIL_Y - BTN_H / 2 + "px", width: btnW + "px", height: BTN_H + "px", borderRadius: `var(--sm-radius-lg, ${BTN_H / 2}px)` });
      const badge = el("div", "sc-badge", btn);
      const badgeNum = el("span", "", badge, String(n));
      const txt = el("div", "sc-btn-text", btn);
      el("div", "sc-btn-step", txt, [lastStep.title, lastStep.time].filter(Boolean).join(" · "));
      el("div", "sc-btn-label", txt, label);
      const arrow = el("span", "sc-arrow", btn, "→");

      // the token rides over everything, and the tick it leaves sits over the token
      const token = el("div", "sc-token", root);
      const tickBox = svg("svg", { viewBox: "-24 -24 48 48", class: "sc-tick" }, root);
      Object.assign(tickBox.style, { left: nodeX(n - 1) + "px", top: RAIL_Y + "px" });
      // sm-native: a tick is a glyph, its weight is part of the mark
      const bigTick = svg("path", { d: "M-8 0.5 L-2.5 6 L8.5 -5.5", fill: "none", stroke: C.accent, "stroke-width": 3, "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-dasharray": "28", "stroke-dashoffset": "28" }, tickBox);

      // the readout: the sum of the step times, so the number is what the run added up to
      const p = content.payoff || {};
      const times = steps.map((st) => String(st.time || "").match(/^\s*([\d.]+)\s*(.*)$/));
      const total = times.every((m) => m && m[2] === times[0][2]) ? `${+times.reduce((a, m) => a + parseFloat(m[1]), 0).toFixed(2)} ${times[0][2]}` : p.value || "";
      const out = el("div", "sc-out", root);
      out.style.top = RAIL_Y + 124 + "px";
      if (p.label) el("span", "sc-out-label", out, p.label);
      el("span", "sc-out-value", out, total);
      if (p.note) el("span", "sc-out-note", out, p.note);

      const per = (TL - T0) / (n - 1);
      const travel = Math.min(0.32, per * 0.62);
      const col = { from: C.accentFill || C.accent, to: C.onAccent || C.ink };
      return { n, nodeX, per, travel, progress, pulse, nodes, btn, badgeNum, arrow, token, tickBox, bigTick, out, col, btnLeft, btnW, radius };
    },

    render(t, S, h) {
      const { tw, lerp, ease } = h;
      const { n, per, travel, nodeX } = S;
      const arrive = (i) => T0 + i * per;
      const leave = (i) => arrive(i + 1) - travel;
      const keep = 1 - tw(t, RESET, 0.6, "inOut");

      // the token: slides onto node 1, then hops node to node, quickly, and the last hop ends in the badge
      let x = lerp(nodeX(0) - 36, nodeX(0), tw(t, T0 - 0.45, 0.45, "signature"));
      for (let i = 0; i < n - 1; i++) if (t >= leave(i)) x = lerp(nodeX(i), nodeX(i + 1), tw(t, leave(i), travel, "inOut"));
      const show = tw(t, T0 - 0.45, 0.3, "soft") * keep;
      // landing: it swells to fill the badge and darkens to the button's ink
      const land = tw(t, TL - 0.02, 0.3, "snappy");
      const press = tw(t, TL + 0.06, 0.09, "snappy") * (1 - tw(t, TL + 0.18, 0.5, "signature"));
      const dy = press * 5;
      const k = lerp(14 / BADGE, 1, land);
      S.token.style.transform = `translate(${x.toFixed(1)}px, ${(RAIL_Y + dy).toFixed(2)}px) scale(${k.toFixed(3)})`;
      S.token.style.opacity = show.toFixed(3);
      S.token.style.background = h.mix(S.col.from, S.col.to, land);
      S.token.style.boxShadow = `0 0 0 ${((4 * BADGE) / 14 * (1 - land)).toFixed(2)}px var(--c-paper)`;
      S.progress.setAttribute("x2", Math.max(nodeX(0), x).toFixed(1));
      S.progress.setAttribute("opacity", show.toFixed(3));

      S.nodes.forEach((nd, i) => {
        const on = tw(t, arrive(i), 0.2, "snappy") * (1 - tw(t, leave(i), 0.25, "snappy")) * keep;
        const done = tw(t, leave(i) + 0.05, 0.25, "snappy") * keep;
        nd.ring.setAttribute("opacity", on.toFixed(3));
        nd.fill.setAttribute("opacity", done.toFixed(3));
        nd.tick.setAttribute("opacity", done.toFixed(3));
        nd.num.setAttribute("opacity", (1 - done).toFixed(3));
      });

      // the badge: its number gives way to the tick the token leaves
      S.badgeNum.style.opacity = (1 - land * keep).toFixed(3);
      const drawn = tw(t, TL + 0.12, 0.3, "snappy") * keep;
      S.bigTick.setAttribute("stroke-dashoffset", (28 * (1 - drawn)).toFixed(2));
      S.tickBox.style.transform = `translateY(${dy.toFixed(2)}px)`;

      // the button: one press, one pulse, the arrow nudges on
      S.btn.style.transform = `translateY(${dy.toFixed(2)}px)`;
      const nudge = tw(t, TL + 0.1, 0.3, "snappy") * (1 - tw(t, TL + 0.7, 0.5, "inOut"));
      S.arrow.style.transform = `translateX(${(nudge * 7).toFixed(2)}px)`;
      const pa = (t - TL - 0.1) / 1.2;
      if (pa > 0 && pa < 1) {
        const g = ease.signature(pa) * 26;
        h.set(S.pulse, { x: (S.btnLeft - g).toFixed(2), y: (RAIL_Y - BTN_H / 2 - g).toFixed(2), width: (S.btnW + 2 * g).toFixed(2), height: (BTN_H + 2 * g).toFixed(2), rx: (S.radius + g).toFixed(2), opacity: ((1 - pa) * 0.85).toFixed(3) });
      } else h.set(S.pulse, { opacity: 0 });

      // the total lands under the run
      const o = tw(t, TL + 0.2, 0.7, "signature") * keep;
      S.out.style.opacity = o.toFixed(3);
      S.out.style.transform = `translateY(${((1 - o) * 16).toFixed(1)}px)`;
    },
  });
})();
