/* step-rail: a "how it works" section as numbered steps on a horizontal rail (SVG + DOM).
 * 3–5 steps sit on one rail, each with a card below it: a title, a one-line detail, a time and a result slot
 * that shows a skeleton until its step has run. A token (a small flag labelled from content) travels the rail;
 * as it reaches a step, the card's edge turns accent and the slot opens on what the step produced (a line, chips,
 * people, a ticked list or a value). When the token moves on, the node behind it is ticked. The last card holds
 * no result of its own: it lands the payoff of the whole run (e.g. "Live in 12 min"), the one signature beat.
 *
 * Everything shown comes from content.json: the token, the state words, each step and its result, the payoff.
 * Columns, the title size and the payoff size are computed from the number of steps and the longest strings.
 * Every value is a function of t: the token arrives at step i at T0 + i * per, so the last always lands at TL,
 * and everything that built up fades together before the seam, leaving the rest state frame 0 starts from.
 */
(function () {
  const W = 1600, H = 900, D = 12;
  const L = 96, R = 1504, GAP = 24, RAIL_Y = 396, CARD_TOP = 440, NODE_R = 17, PAD = 26;
  const T0 = 1.0, TL = 7.6, RESET = 10.5; // first arrival, last arrival (the landing), the calm fade back to rest
  SiteMotion.scene({
    width: W,
    height: H,
    loop: 0,
    duration: D,
    still: 9.2,
    setup({ root, content, tokens, h }) {
      const { el, svg, mix, ui } = h;
      const C = tokens.color, pal = tokens.palette;
      root.classList.add("sr");
      const copy = el("div", "sr-copy", root);
      el("div", "sr-eyebrow", copy, content.eyebrow || "");
      el("div", "sr-h", copy, content.heading || "");
      if (content.sub) el("div", "sr-sub", root, content.sub);

      const steps = content.steps || [];
      const n = steps.length;
      const colW = (R - L - (n - 1) * GAP) / n;
      const inner = colW - PAD * 2;
      const colX = (i) => L + i * (colW + GAP);
      const nodeX = (i) => colX(i) + PAD + NODE_R; // the node's left edge lines up with the card's text
      // the title size fits the longest title in one line across every card (Inter is about 0.56 em per character)
      const longest = Math.max(...steps.map((s) => s.title.length));
      const titleFs = Math.max(18, Math.min(24, Math.floor(inner / (longest * 0.56))));
      const states = content.states || {};

      const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "sr-svg" }, root);
      const line = ui.stroke("regular", 2);
      svg("line", { x1: nodeX(0), y1: RAIL_Y, x2: nodeX(n - 1), y2: RAIL_Y, stroke: C.line, "stroke-width": line, "stroke-linecap": "round" }, s);
      const progress = svg("line", { x1: nodeX(0), y1: RAIL_Y, x2: nodeX(0), y2: RAIL_Y, stroke: C.accent, "stroke-width": ui.stroke("bold", 3), "stroke-linecap": "round", opacity: 0 }, s);
      // connectors from each node down to its card
      steps.forEach((_, i) => svg("line", { x1: nodeX(i), y1: RAIL_Y + NODE_R, x2: nodeX(i), y2: CARD_TOP, stroke: C.line, "stroke-width": ui.stroke("hair", 1) }, s));
      // the token's stem and its dot on the rail sit under the nodes, so a docked token points at its node
      const tokenG = svg("g", { opacity: 0 }, s);
      svg("line", { x1: 0, y1: RAIL_Y - 26, x2: 0, y2: RAIL_Y - 4, stroke: C.accentFill || C.accent, "stroke-width": ui.stroke("regular", 2) }, tokenG);
      svg("circle", { cx: 0, cy: RAIL_Y, r: 6, fill: C.accentFill || C.accent }, tokenG);
      // the pulse that answers the landing
      // sm-native: the ring is the landing cue, not outline style
      const pulse = svg("circle", { cx: nodeX(n - 1), cy: RAIL_Y, r: NODE_R, fill: "none", stroke: C.accent, "stroke-width": 2, opacity: 0 }, s);

      const nodes = steps.map((_, i) => {
        const g = svg("g", { transform: `translate(${nodeX(i)} ${RAIL_Y})` }, s);
        const base = svg("circle", { r: NODE_R, fill: C.surface, ...ui.strokeAttrs("regular", 1.5, C.line) }, g);
        // sm-native: the running ring is a state cue, not outline style
        const ring = svg("circle", { r: NODE_R, fill: "none", stroke: C.accent, "stroke-width": 2.5, opacity: 0 }, g);
        const num = svg("text", { "text-anchor": "middle", y: 5, "font-family": "var(--font-mono)", "font-size": 14, fill: C.muted }, g);
        num.textContent = String(i + 1);
        const fill = svg("circle", { r: NODE_R, fill: C.accentFill || C.accent, opacity: 0 }, g);
        // sm-native: a tick is a glyph, its weight is part of the mark
        const tick = svg("path", { d: "M-6.5 0.5 L-2 5 L7 -4.5", fill: "none", stroke: C.onAccent || C.paper, "stroke-width": 2.4, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0 }, g);
        return { g, base, ring, num, fill, tick };
      });

      const cards = steps.map((st, i) => {
        const last = i === n - 1;
        const card = el("div", "sr-card", root);
        Object.assign(card.style, { left: colX(i) + "px", width: colW + "px" });
        const head = el("div", "sr-head", card);
        const state = el("div", "sr-state", head);
        const sPend = el("span", "", state, states.pending || "");
        const sOn = el("span", "is-on", state, states.active || "");
        const sDone = el("span", "is-done", state, states.done || "");
        el("div", "sr-time", head, st.time || "");
        const title = el("div", "sr-title", card, st.title);
        title.style.fontSize = titleFs + "px";
        el("div", "sr-detail", card, st.detail || "");
        const res = el("div", "sr-res", card);
        const skel = el("div", "sr-skel", res);
        [0.72, 0.46, 0.6].forEach((w) => { el("i", "", skel).style.width = w * 100 + "%"; });
        const items = []; // each item reveals on its own, staggered
        const item = (cls, parent) => { const node = el("div", "sr-item " + cls, parent || res); items.push(node); return node; };
        if (last) {
          const p = content.payoff || {};
          const pay = el("div", "sr-pay", res);
          item("sr-pay-label", pay).textContent = p.label || "";
          const v = item("sr-pay-value", pay);
          v.textContent = p.value || "";
          // the focal value: as large as the card allows at its length, never past 64 px
          v.style.fontSize = Math.max(32, Math.min(64, Math.floor(inner / (Math.max(3, (p.value || "").length) * 0.6)))) + "px";
          if (p.note) item("sr-pay-note", pay).textContent = p.note;
        } else {
          const r = st.result || {};
          if (r.kind === "line") item("sr-line").textContent = r.text || "";
          else if (r.kind === "chips") {
            const wrap = el("div", "sr-chips", res);
            (r.items || []).forEach((c, k) => { const chip = item("sr-chip", wrap); el("b", "", chip).style.background = pal[(k + 2) % pal.length]; el("span", "", chip, c); });
          } else if (r.kind === "people") {
            const row = el("div", "sr-people", res);
            const faces = item("sr-faces", row);
            (r.items || []).forEach((who, k) => { const f = el("div", "sr-face", faces, who); f.style.background = pal[k % pal.length]; f.style.color = h.inkOn(pal[k % pal.length]); });
            if (r.text) item("sr-people-text", row).textContent = r.text;
          } else if (r.kind === "list") {
            const list = el("div", "sr-list", res);
            (r.items || []).forEach((txt) => {
              const row = item("sr-row", list);
              const tk = svg("svg", { viewBox: "0 0 18 18", class: "sr-tick" }, row);
              svg("circle", { cx: 9, cy: 9, r: 9, fill: mix(C.positive, C.surface, 0.8) }, tk);
              // sm-native: a tick is a glyph, its weight is part of the mark
              svg("path", { d: "M5.2 9.3 L7.8 11.8 L12.8 6.6", fill: "none", stroke: C.positiveText || C.positive, "stroke-width": 1.8, "stroke-linecap": "round", "stroke-linejoin": "round" }, tk);
              el("span", "", row, txt);
            });
          } else if (r.kind === "value") {
            const box = el("div", "sr-value", res);
            item("sr-value-n", box).textContent = r.value || "";
            if (r.unit) item("sr-value-u", box).textContent = r.unit;
          }
        }
        return { card, sPend, sOn, sDone, skel, items, last };
      });

      const token = el("div", "sr-token", root, content.token || "");
      token.style.top = RAIL_Y - 26 - 32 + "px";
      const per = n > 1 ? (TL - T0) / (n - 1) : 0;
      const travel = Math.min(1.0, per * 0.55);
      return { n, nodes, cards, token, tokenG, progress, pulse, nodeX, per, travel };
    },

    render(t, S, h) {
      const { tw, clamp, lerp } = h;
      const { n, per, travel, nodeX } = S;
      const arrive = (i) => (n > 1 ? T0 + i * per : TL);
      const doneAt = (i) => (i < n - 1 ? arrive(i + 1) - travel : TL + 0.5);
      // the fade back to rest: results, ticks and the token go first, then the skeletons return
      const keep = 1 - tw(t, RESET, 0.6, "inOut");
      const back = tw(t, RESET + 0.45, 0.5, "soft");

      // the token: slides onto the first node, then hops node to node (move, then dwell)
      let x = lerp(nodeX(0) - 40, nodeX(0), tw(t, 0.4, 0.6, "signature"));
      for (let i = 0; i < n - 1; i++) {
        const leave = arrive(i + 1) - travel;
        if (t >= leave) x = lerp(nodeX(i), nodeX(i + 1), tw(t, leave, travel, "inOut"));
      }
      const tokOp = tw(t, 0.4, 0.4, "soft") * keep;
      S.token.style.transform = `translateX(${(x - 13).toFixed(1)}px)`;
      S.token.style.opacity = tokOp.toFixed(3);
      S.tokenG.setAttribute("transform", `translate(${x.toFixed(1)} 0)`);
      S.tokenG.setAttribute("opacity", tokOp.toFixed(3));
      S.progress.setAttribute("x2", Math.max(nodeX(0), x).toFixed(1));
      S.progress.setAttribute("opacity", (t >= T0 - 0.6 ? keep : 0).toFixed(3));

      S.cards.forEach((c, i) => {
        const a = arrive(i), d = doneAt(i);
        const on = tw(t, a, 0.3, "snappy") * (c.last ? 1 : 1 - tw(t, d, 0.35, "snappy")) * keep;
        const done = tw(t, d, 0.35, "snappy") * keep;
        const open = tw(t, a, 0.45, "snappy") * (1 - back);
        c.card.style.setProperty("--on", on.toFixed(3));
        if (c.last) c.card.style.setProperty("--land", (tw(t, TL, 0.8, "signature") * keep).toFixed(3));
        // the state word cross-fades: up next → working → done
        const act = Math.min(tw(t, a, 0.3, "snappy"), 1 - tw(t, d, 0.3, "snappy")) * keep;
        c.sDone.style.opacity = done.toFixed(3);
        c.sOn.style.opacity = Math.max(0, act).toFixed(3);
        c.sPend.style.opacity = clamp(1 - done - act).toFixed(3);
        c.skel.style.opacity = (1 - open).toFixed(3);
        c.items.forEach((node, k) => {
          // the payoff lands on the signature curve; ordinary results open like UI
          const p = c.last ? tw(t, TL + 0.1 + h.motion.stagger(k, 0.09), 0.8, "signature") : tw(t, a + 0.08 + h.motion.stagger(k, 0.07), 0.45, "snappy");
          node.style.opacity = (p * keep).toFixed(3);
          node.style.transform = `translateY(${((1 - p) * (c.last ? 18 : 8)).toFixed(1)}px)`;
        });
        const nd = S.nodes[i];
        nd.ring.setAttribute("opacity", on.toFixed(3));
        nd.fill.setAttribute("opacity", done.toFixed(3));
        nd.tick.setAttribute("opacity", done.toFixed(3));
        nd.num.setAttribute("opacity", (1 - done).toFixed(3));
        nd.num.setAttribute("fill", on > 0.5 ? "var(--c-ink)" : "var(--c-muted)");
      });

      // the landing: one ring answers the last node
      const q = tw(t, TL + 0.45, 0.9, "soft");
      S.pulse.setAttribute("r", (17 + q * 30).toFixed(1));
      S.pulse.setAttribute("opacity", (q > 0 && q < 1 ? (1 - q) * 0.8 : 0).toFixed(3));
    },
  });
})();
