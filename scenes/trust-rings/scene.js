/* trust-rings: defence in depth, seen flat (SVG + DOM).
 * The protected asset sits at the centre of 3–5 concentric rings; each ring is one control, named on the ring.
 * Requests travel in from outside. At every ring a request pauses, a check chip says what was verified, then the
 * chip folds into a tick on the ring and the segment it passed lights. The unauthorised request is stopped at the
 * ring its content names: that ring closes all the way round, a "Blocked" chip says why, and the decision lands in
 * the audit log beside the rings. The counters are the log: they count rows as they land.
 *
 * Content: asset { name, detail }, rings [{ name, short, pass }] (outside → in, 3–5), requests [{ who, action,
 * time, blockedAt?, reason? }] (2–3; blockedAt names a ring by name or short), log { title, allowed, blocked,
 * allowedBadge, blockedBadge }. Every word on screen comes from there.
 */
(function () {
  const D = 14, W = 1600, H = 900;
  const BLOCK = 8.4; // the first unauthorised request is stopped here, whatever the content's counts
  const OUT = 12.3; // everything the run built clears from here, well before the seam
  const rad = (deg) => (deg * Math.PI) / 180;

  SiteMotion.scene({
    width: W,
    height: H,
    loop: 0,
    duration: D,
    still: 9.3,
    setup({ root, content, tokens, h }) {
      const { el, svg, mix, alpha, ui } = h;
      const C = tokens.color, pal = tokens.palette;
      root.classList.add("tr");
      const rings = content.rings || [], reqs = content.requests || [], LOG = content.log || {};
      const n = rings.length, k = reqs.length;

      // ---- geometry: the rings share the space between the core and the outer radius, whatever their count
      const cx = 580, cy = 470, RMAX = 345, R0 = 94, RIN = R0 + 46;
      const gap = n > 1 ? (RMAX - RIN) / (n - 1) : 0;
      const radii = rings.map((_, i) => RMAX - i * gap);
      const P = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
      const LINE = ui.stroke("regular", 1.4), BOLD = ui.stroke("bold", 3.2);

      // ---- copy and the audit log share the right-hand column
      const col = el("div", "tr-col", root);
      el("div", "tr-eyebrow", col, content.eyebrow || "");
      el("div", "tr-h", col, content.heading || "");
      if (content.sub) el("div", "tr-sub", col, content.sub);
      const panel = el("div", "tr-log", col);
      el("div", "tr-log-title", panel, LOG.title || "");
      const stats = el("div", "tr-stats", panel);
      const stat = (word, cls) => {
        const s = el("div", "tr-stat " + cls, stats);
        const num = el("span", "tr-num", s, "0");
        el("span", "tr-word", s, word || "");
        return { s, num };
      };
      const statA = stat(LOG.allowed, "is-allowed"), statB = stat(LOG.blocked, "is-blocked");
      const slots = reqs.map(() => el("div", "tr-row", panel));

      // ---- the picture
      const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "tr-svg" }, root);
      const defs = svg("defs", {}, s);
      // bands tint a little deeper toward the centre: defence in depth, read at a glance
      radii.forEach((r) => svg("circle", { cx, cy, r, fill: alpha(C.accent, 0.035), stroke: "none" }, s));
      // each ring is an arc with a gap at twelve o'clock for its name (the gap is sized in render, from the set type)
      const ringLines = radii.map(() => svg("path", { fill: "none", stroke: mix(C.ink, C.paper, 0.72), "stroke-width": LINE }, s));
      const closeLayer = svg("g", {}, s); // a closed ring sits under the segments other requests lit
      const litLayer = svg("g", {}, s);
      const trailLayer = svg("g", {}, s);
      // the core: the asset everything protects
      svg("circle", { cx, cy, r: R0, fill: mix(C.accent, C.surface, 0.78), stroke: mix(C.accent, C.ink, 0.4), "stroke-width": LINE }, s);
      const corePing = svg("circle", { cx, cy, r: R0, fill: "none", stroke: C.accent, "stroke-width": 2, opacity: 0 }, s); // sm-native: a one-off ping, a state cue
      // sm-native: a padlock glyph keeps its own line weight
      const lock = svg("g", { transform: `translate(${cx} ${cy - 38})`, fill: "none", stroke: C.ink, "stroke-width": 1.8, "stroke-linecap": "round" }, s);
      svg("path", { d: "M-6 -3 V-8 A6 6 0 0 1 6 -8 V-3" }, lock);
      svg("rect", { x: -9.5, y: -3, width: 19, height: 14, rx: 3, fill: C.ink, stroke: "none" }, lock); // sm-native: a glyph, not a card
      const core = el("div", "tr-core", root);
      Object.assign(core.style, { left: cx - R0 + 12 + "px", top: cy - 12 + "px", width: 2 * (R0 - 12) + "px" });
      el("div", "tr-core-name", core, (content.asset && content.asset.name) || "");
      el("div", "tr-core-detail", core, (content.asset && content.asset.detail) || "");

      // ring names sit in the gap at the top of their ring
      const labels = rings.map((ring, i) => {
        const r = radii[i];
        svg("path", { id: `tr-arc-${i}`, d: `M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`, fill: "none" }, defs);
        const text = svg("text", { class: "tr-ring-label", fill: C.muted, "dominant-baseline": "central" }, s);
        const tp = svg("textPath", { href: `#tr-arc-${i}`, startOffset: "50%", "text-anchor": "middle" }, text);
        tp.textContent = ring.name || "";
        return text;
      });

      // ---- requests: angles fan out over the left side, upper first
      const spread = k <= 1 ? 0 : k === 2 ? 52 : 68;
      const ringIndex = (name) => rings.findIndex((r) => r.name === name || r.short === name);
      const allowed = reqs.map((q, j) => j).filter((j) => !reqs[j].blockedAt || ringIndex(reqs[j].blockedAt) < 0);
      const A = allowed.length;
      // the step between rings stretches when there are fewer rings or requests, so the block always lands at BLOCK
      const STEP = h.clamp((BLOCK - 0.75 - 0.8 - 1.6 * Math.max(0, A - 1) - 0.95) / Math.max(1, n), 0.85, 1.35);
      const lastAllowedRes = BLOCK - 0.75;
      let blockedSeen = 0;
      const tiers = [];
      const Q = reqs.map((q, j) => {
        const a = rad(180 + spread / 2 - (k > 1 ? (j * spread) / (k - 1) : 0));
        const dir = [-Math.cos(a), -Math.sin(a)]; // inward
        let perp = [-dir[1], dir[0]];
        const up = Math.sin(a) <= 0.001; // the upper and middle paths keep their chips above, the lower one below
        if ((up && perp[1] > 0) || (!up && perp[1] < 0)) perp = [-perp[0], -perp[1]];
        const b = allowed.includes(j) ? -1 : ringIndex(q.blockedAt);
        let start;
        if (b < 0) start = lastAllowedRes - (0.95 + n * STEP) - 1.6 * (A - 1 - allowed.indexOf(j));
        else start = BLOCK + 1.3 * blockedSeen++ - 0.2 - 0.95 - b * STEP;
        const arr = rings.map((_, i) => start + 0.95 + i * STEP);
        const passes = b < 0 ? n : b;
        const resolve = b < 0 ? start + 0.95 + n * STEP : arr[b] + 0.2;
        // keyframes of the dot's radius along its path
        const keys = [[start + 0.45, RMAX + 42]];
        for (let i = 0; i < passes; i++) keys.push([arr[i], radii[i] + 14], [arr[i] + STEP - 0.3, radii[i] + 14]);
        if (b < 0) keys.push([resolve, R0 - 4]);
        else keys.push([arr[b], radii[b] + 14]);

        // the tag: who is asking, parked outside the rings at the start of the path
        const [tx, ty] = P(RMAX + 100, a);
        const tag = el("div", "tr-tag", root);
        Object.assign(tag.style, { left: tx + "px", top: ty + "px" });
        const sq = el("span", "tr-sq", tag, (q.who || "?").replace(/^[^A-Za-z0-9]+/, "")[0] || "?");
        const colour = pal[j % pal.length];
        sq.style.background = colour;
        sq.style.color = h.inkOn(colour);
        el("span", "", tag, q.who || "");

        const trail = svg("line", { stroke: mix(C.ink, C.paper, 0.45), "stroke-width": ui.stroke("fine", 1.2), "stroke-dasharray": "3 6", "stroke-linecap": "round", opacity: 0 }, trailLayer);
        const dot = svg("g", { opacity: 0 }, s);
        const halo = svg("circle", { r: 15, fill: alpha(C.accent, 0.22) }, dot);
        const dotCore = svg("circle", { r: 7.5, fill: C.accent, stroke: mix(C.accent, C.ink, 0.45), "stroke-width": ui.stroke("fine", 1.5) }, dot);

        // per ring: a lit arc, a tick node and a check chip, for every ring the request clears
        const steps = rings.slice(0, passes).map((ring, i) => {
          const r = radii[i];
          const arc = svg("path", { fill: "none", stroke: C.positive, "stroke-width": BOLD, "stroke-linecap": "round", opacity: 0 }, litLayer);
          const [nx, ny] = P(r, a);
          const node = svg("g", { transform: `translate(${nx.toFixed(1)} ${ny.toFixed(1)}) scale(0)` }, s);
          svg("circle", { r: 8.5, fill: C.surface, stroke: C.positive, "stroke-width": ui.stroke("regular", 1.8) }, node);
          // sm-native: the tick is a glyph and keeps its weight
          svg("path", { d: "M-3.6 0.2 L-1 2.8 L3.8 -2.4", fill: "none", stroke: C.positive, "stroke-width": 1.8, "stroke-linecap": "round", "stroke-linejoin": "round" }, node);
          const chip = el("div", "tr-chip", root);
          const tick = el("span", "tr-tick", chip);
          tick.style.background = C.positive;
          el("span", "", chip, `${ring.short || ring.name} · ${ring.pass || ""}`);
          const [chx, chy] = [nx + perp[0] * 34, ny + perp[1] * 34];
          Object.assign(chip.style, { left: chx.toFixed(1) + "px", top: chy.toFixed(1) + "px" });
          return { r, arc, node, chip, at: arr[i] };
        });

        // the block: the ring closes both ways round from the hit point, and a chip says why
        let block = null;
        if (b >= 0) {
          const r = radii[b];
          const [hx, hy] = P(r, a);
          const cw = svg("path", { fill: "none", stroke: C.warning, "stroke-width": BOLD, "stroke-linecap": "round", opacity: 0 }, closeLayer);
          const ccw = svg("path", { fill: "none", stroke: C.warning, "stroke-width": BOLD, "stroke-linecap": "round", opacity: 0 }, closeLayer);
          const ping = svg("circle", { cx, cy, r, fill: "none", stroke: C.warning, "stroke-width": 2, opacity: 0 }, closeLayer); // sm-native: a one-off ping, a state cue
          const node = svg("g", { transform: `translate(${hx.toFixed(1)} ${hy.toFixed(1)}) scale(0)` }, s);
          svg("circle", { r: 9.5, fill: C.warning, stroke: mix(C.warning, C.ink, 0.45), "stroke-width": ui.stroke("fine", 1.5) }, node);
          const xInk = h.inkOn(C.warning);
          // sm-native: the cross is a glyph and keeps its weight
          svg("path", { d: "M-3.3 -3.3 L3.3 3.3 M3.3 -3.3 L-3.3 3.3", stroke: xInk, "stroke-width": 2, "stroke-linecap": "round" }, node);
          const chip = el("div", "tr-chip tr-chip--block", root);
          chip.style.background = mix(C.warning, C.surface, 0.78);
          chip.style.boxShadow = `inset 0 0 0 1.5px ${C.warning}`; // sm-native: the block's edge is a state colour, not outline style
          const x = el("span", "tr-tick", chip);
          x.style.background = C.warning;
          el("span", "", chip, `${LOG.blockedBadge || ""} · ${q.reason || ""}`);
          // the verdict sits on the closed ring itself, at six o'clock, clear of every request path
          Object.assign(chip.style, { left: cx + "px", top: cy + r + "px" });
          block = { b, r, cw, ccw, ping, node, chip, label: labels[b], line: ringLines[b] };
        }
        return { j, q, a, dir, step: STEP, start, keys, resolve, passes, tag, trail, dot, halo, dotCore, steps, block, blocked: b >= 0, ring: b >= 0 ? rings[b] : null };
      });

      // the audit log fills in the order decisions were made
      const order = [...Q].sort((x, y) => x.resolve - y.resolve);
      order.forEach((r, i) => {
        const row = slots[i];
        const top = el("div", "tr-row-top", row);
        el("span", "tr-who", top, r.q.who || "");
        const badge = el("span", "tr-badge", top, r.blocked ? LOG.blockedBadge || "" : LOG.allowedBadge || "");
        badge.style.background = mix(r.blocked ? C.warning : C.positive, C.surface, r.blocked ? 0.74 : 0.8);
        el("div", "tr-row-sub", row, [r.q.time, r.q.action, r.blocked ? r.ring.name : null].filter(Boolean).join(" · "));
        row.style.setProperty("--bar", r.blocked ? C.warning : C.positive);
        r.row = row;
        r.rowParts = [...row.children];
      });

      return { cx, cy, R0, rings, radii, labels, ringLines, Q, P, statA, statB, corePing, LINE, BOLD, C };
    },

    render(t, S, h) {
      const { tw, clamp, lerp, mix } = h;
      const out = 1 - tw(t, OUT, 0.7, "inOut");
      const arcD = (r, a, half) => {
        const [x0, y0] = S.P(r, a - half), [x1, y1] = S.P(r, a + half);
        return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
      };
      // the gap in each ring fits its name as set (the label voice may change the face)
      const TOP = -Math.PI / 2;
      const half = S.labels.map((tx, i) => {
        const L = tx.getComputedTextLength();
        return (Math.max(0, L) / 2 + 11) / S.radii[i];
      });
      const pt = (r, a) => S.P(r, a).map((v) => v.toFixed(1)).join(" ");
      S.ringLines.forEach((line, i) => {
        const r = S.radii[i];
        line.setAttribute("d", `M${pt(r, TOP + half[i])} A${r} ${r} 0 1 1 ${pt(r, TOP - half[i])}`);
      });
      let nA = 0, nB = 0, corePing = 0;
      const counting = t < OUT + 0.55; // the counters drop back to zero while they are dipped out, not in view

      S.Q.forEach((R) => {
        // where the dot is: eased between its keyframes
        let r = R.keys[0][1];
        for (let i = 1; i < R.keys.length; i++) {
          const [t0, r0] = R.keys[i - 1], [t1, r1] = R.keys[i];
          if (t >= t0) r = t1 > t0 ? lerp(r0, r1, tw(t, t0, t1 - t0, "inOut")) : r1;
        }
        let recoil = 0;
        if (R.block) recoil = 8 * tw(t, R.resolve, 0.35, "snappy"); // a short shove back off the closed ring
        const [x, y] = S.P(r + recoil, R.a);
        const appear = tw(t, R.start, 0.5, "signature");
        const gone = R.blocked ? 0 : tw(t, R.resolve - 0.05, 0.3, "soft");
        R.dot.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(1 - 0.5 * gone).toFixed(3)})`);
        R.dot.setAttribute("opacity", (tw(t, R.start + 0.25, 0.3) * (1 - gone) * out).toFixed(3));
        const [sx, sy] = S.P(S.radii.length ? S.radii[0] + 42 : 400, R.a);
        R.trail.setAttribute("x1", sx.toFixed(1)); R.trail.setAttribute("y1", sy.toFixed(1));
        R.trail.setAttribute("x2", x.toFixed(1)); R.trail.setAttribute("y2", y.toFixed(1));
        R.trail.setAttribute("opacity", (0.8 * tw(t, R.start + 0.45, 0.3) * out).toFixed(3));
        R.tag.style.opacity = (appear * out).toFixed(3);
        R.tag.style.transform = `translate(-50%, -50%) translate(${(-(1 - appear) * 24 * R.dir[0]).toFixed(1)}px, ${(-(1 - appear) * 24 * R.dir[1]).toFixed(1)}px)`;

        // each ring it clears: chip in, then it folds into a tick on the ring and the segment lights
        const STEP = R.step;
        R.steps.forEach((st) => {
          const chipIn = tw(t, st.at + 0.04, 0.26, "snappy");
          const fold = tw(t, st.at + Math.max(0.5, STEP - 0.38), 0.26, "snappy");
          const light = tw(t, st.at + Math.max(0.46, STEP - 0.42), 0.4, "signature");
          st.chip.style.opacity = (chipIn * (1 - fold) * out).toFixed(3);
          st.chip.style.transform = `translate(-50%, -50%) scale(${(0.92 + 0.08 * chipIn - 0.25 * fold).toFixed(3)})`;
          st.node.setAttribute("transform", st.node.getAttribute("transform").replace(/scale\([^)]*\)/, `scale(${(light * out).toFixed(3)})`));
          st.arc.setAttribute("d", arcD(st.r, R.a, ((Math.PI / 180) * 10 * Math.max(0.02, light))));
          st.arc.setAttribute("opacity", (light > 0 ? out : 0).toFixed(3));
        });

        if (!R.blocked) {
          if (t >= R.resolve && counting) nA++;
          corePing = Math.max(corePing, t >= R.resolve ? 1 - tw(t, R.resolve, 0.9, "soft") : 0);
        } else {
          const B = R.block, T = R.resolve;
          if (t >= T && counting) nB++;
          const close = tw(t, T, 0.75, "signature");
          // both ways round from the hit point to the edges of the name's gap, arriving together
          const g = half[B.b], r = B.r;
          const toCw = TOP + 2 * Math.PI - g - R.a, toCcw = R.a - (TOP + g);
          for (const [p, span, sweep, end] of [[B.cw, toCw, 1, TOP + 2 * Math.PI - g], [B.ccw, toCcw, 0, TOP + g]]) {
            p.setAttribute("d", `M${pt(r, R.a)} A${r} ${r} 0 ${span > Math.PI ? 1 : 0} ${sweep} ${pt(r, end)}`);
            const len = span * r;
            p.setAttribute("stroke-dasharray", `${(close * len).toFixed(1)} ${(len + 2).toFixed(1)}`);
            p.setAttribute("opacity", (close > 0 ? out : 0).toFixed(3));
          }
          const ping = tw(t, T + 0.1, 0.9, "soft");
          B.ping.setAttribute("r", (S.radii[B.b] + ping * 26).toFixed(1));
          B.ping.setAttribute("opacity", (ping > 0 && ping < 1 ? (1 - ping) * 0.8 * out : 0).toFixed(3));
          const pop = tw(t, T, 0.35, "snappy");
          B.node.setAttribute("transform", B.node.getAttribute("transform").replace(/scale\([^)]*\)/, `scale(${(pop * out).toFixed(3)})`));
          const chip = tw(t, T + 0.4, 0.45, "signature");
          B.chip.style.opacity = (chip * out).toFixed(3);
          B.chip.style.transform = `translate(-50%, -50%) translateY(${((1 - chip) * 8).toFixed(1)}px)`;
          B.label.setAttribute("fill", mix(S.C.muted, S.C.ink, close * out));
          B.label.style.fontWeight = close * out > 0.5 ? 600 : "";
          R.dotCore.setAttribute("fill", mix(S.C.accent, S.C.warning, tw(t, T, 0.3, "snappy")));
          R.halo.setAttribute("fill", h.alpha(mix(S.C.accent, S.C.warning, tw(t, T, 0.3, "snappy")), 0.22));
          R.tag.classList.toggle("is-blocked", t >= T + 0.15 && out > 0.5);
        }

        // its row in the audit log
        const land = tw(t, R.resolve + (R.blocked ? 0.35 : 0.12), 0.45, "signature");
        R.rowParts.forEach((p) => {
          p.style.opacity = (land * out).toFixed(3);
          p.style.transform = `translateY(${((1 - land) * 8).toFixed(1)}px)`;
        });
        R.row.classList.toggle("is-new", land > 0 && t < R.resolve + 1.6 && out > 0.5);
      });

      S.corePing.setAttribute("r", (S.R0 + (1 - corePing) * 22).toFixed(1));
      S.corePing.setAttribute("opacity", (corePing > 0 && corePing < 1 ? corePing * 0.8 * out : 0).toFixed(3));
      // counters: what the log holds; they dip while the log clears so the reset is never seen as a jump
      const dip = 1 - tw(t, OUT + 0.25, 0.3, "soft") * (1 - tw(t, OUT + 0.6, 0.3, "soft"));
      for (const [st, v] of [[S.statA, nA], [S.statB, nB]]) {
        h.text(st.num, String(v));
        st.num.style.opacity = clamp(dip).toFixed(3);
      }
      S.statB.s.classList.toggle("is-hot", nB > 0);
    },
  });
})();
