/* bloom-flow: a workflow that blooms as it runs.
 * Action cards sit on a dotted storyboard, joined by connectors. An event pulse travels the graph;
 * each action lights up as it completes, shows its duration, and a cluster of generative line-art
 * flowers opens beside it. Flowers close and the graph resets before the seam, so the loop is clean.
 * Flowers are drawn procedurally (petal rings, stamens, leaves) from the palette, never traced.
 */
(function () {
  const D = 12;
  SiteMotion.scene({
    width: 1600,
    height: 900,
    loop: 0,
    duration: D,
    still: 8.6,
    setup({ root, content, tokens, h }) {
      const { el, svg, rng, mix, ui } = h;
      const C = tokens.color, pal = tokens.palette;
      // graph lines, card outlines and corners follow the style pack when it directs them
      const EDGE = ui.stroke("regular", 2), LIT = ui.stroke("bold", 2.2), CARD = ui.stroke("regular", 2), ICON = ui.strokeAttrs("fine", 1.2, C.ink);
      root.classList.add("bf");

      // ---------- flowers (canvas, behind the graph) ----------
      const canvas = el("canvas", "bf-flowers", root);
      canvas.width = 1600 * 1.5; canvas.height = 900 * 1.5;
      const ctx = canvas.getContext("2d");
      ctx.scale(1.5, 1.5);
      const rand = rng(content.seed || 9);
      const stroke = C.accent;

      // ---------- graph (SVG) ----------
      const s = svg("svg", { viewBox: "0 0 1600 900", width: 1600, height: 900, class: "bf-graph" }, root);
      const W = 380, H = 76;
      const nodes = content.nodes.map((n) => ({ ...n }));
      const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
      const edgesG = svg("g", {}, s);
      const edges = content.edges.map(([a, b]) => {
        const A = byId[a], B = byId[b];
        const x0 = A.x, y0 = A.y + H / 2, x1 = B.x, y1 = B.y - H / 2, my = (y0 + y1) / 2;
        const d = `M${x0} ${y0} C ${x0} ${my}, ${x1} ${my}, ${x1} ${y1}`;
        const base = svg("path", { d, fill: "none", stroke: ui.strokeColor(C.lavender || C.line), "stroke-width": EDGE }, edgesG);
        const lit = svg("path", { d, fill: "none", stroke: C.accent, "stroke-width": LIT, "stroke-linecap": "round" }, edgesG);
        const dot = svg("circle", { r: 5.5, fill: C.accent, stroke: C.surface, "stroke-width": 2, opacity: 0 }, edgesG); // sm-native: a halo that keeps the dot clear of the edge it rides
        return { a, b, base, lit, dot, len: null };
      });
      const kinds = content.kinds;
      nodes.forEach((n, i) => {
        const g = svg("g", { transform: `translate(${n.x - W / 2} ${n.y - H / 2})` }, s);
        n.card = svg("rect", { width: W, height: H, rx: ui.radius("md", 10), fill: C.surface, stroke: C.lavender || C.line, "stroke-width": CARD }, g);
        const k = kinds[n.kind] || { colour: pal[0], glyph: "•" };
        svg("rect", { x: 14, y: 16, width: 44, height: 44, rx: ui.radius("sm", 8), fill: k.colour, ...ICON }, g);
        const glyph = svg("text", { x: 36, y: 45, "text-anchor": "middle", "font-family": "var(--font-mono)", "font-size": 20, fill: h.inkOn(k.colour) }, g);
        glyph.textContent = k.glyph;
        const type = svg("text", { x: 72, y: 32, "font-family": "var(--font-mono)", "font-size": 16, "letter-spacing": "0.06em", fill: C.muted }, g);
        type.textContent = (k.label || n.kind).toUpperCase();
        const label = svg("text", { x: 72, y: 57, "font-family": "var(--font-sans)", "font-size": 17, fill: C.ink }, g);
        label.textContent = n.label;
        n.badge = svg("g", { opacity: 0, transform: `translate(${W - 14} ${H / 2})` }, g);
        svg("rect", { x: -84, y: -14, width: 84, height: 28, rx: 14, fill: mix(C.positive, C.surface, 0.86) }, n.badge); // sm-native: a pill (radius = half its height) stays a pill in every look
        const bt = svg("text", { x: -42, y: 5.5, "text-anchor": "middle", "font-family": "var(--font-mono)", "font-size": 16, fill: C.positiveText || C.positive }, n.badge);
        bt.textContent = "✓ " + n.ms + "ms";
        // flowers that belong to this node: a cluster on its open side
        const side = n.side || (i % 2 ? 1 : -1);
        n.flowers = Array.from({ length: n.blooms || 3 }, (_, f) => {
          const r = f === 0 ? 46 + rand() * 18 : 18 + rand() * 22;
          const dx = side * (W / 2 + 40 + f * 34 + rand() * 50);
          const dy = (rand() - 0.5) * 120;
          return {
            x: n.x + dx, y: n.y + dy, r,
            petals: 7 + Math.floor(rand() * 7),
            rings: f === 0 ? 3 : 2,
            colours: [pal[Math.floor(rand() * (pal.length - 1))], pal[Math.floor(rand() * (pal.length - 1))], pal[Math.floor(rand() * (pal.length - 1))]],
            spin: rand() * Math.PI,
            delay: f * 0.14 + rand() * 0.1,
            leaf: rand() * Math.PI * 2,
          };
        });
      });

      // ---------- header and counter ----------
      const head = el("div", "bf-head", root);
      el("span", "bf-chip", head, content.story);
      const live = el("span", "bf-live", head, "● Live");
      const counter = el("div", "bf-counter", root);
      el("span", "bf-counter-k", counter, content.counter.label);
      const value = el("span", "bf-counter-v", counter, "");

      function flower(f, open) {
        if (open <= 0.01) return;
        const { x, y } = f;
        const r = f.r * (0.35 + 0.65 * open);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(f.spin + (1 - open) * 0.6);
        ctx.lineWidth = 1.1; // sm-native: leaf outlines are part of the drawing
        ctx.strokeStyle = stroke;
        // two leaves under the bloom
        for (const a of [f.leaf, f.leaf + 2.4]) {
          ctx.save(); ctx.rotate(a);
          ctx.beginPath(); ctx.ellipse(r * 0.95, 0, r * 0.55 * open, r * 0.2 * open, 0, 0, Math.PI * 2);
          ctx.fillStyle = mix(pal[3] || C.positive, C.surface, 0.2); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(r * 0.45, 0); ctx.lineTo(r * 1.45 * open + r * 0.45 * (1 - open), 0); ctx.stroke();
          ctx.restore();
        }
        // petal rings, outer to inner, each opening a little after the last
        for (let ring = 0; ring < f.rings; ring++) {
          const rr = r * (1 - ring * 0.3), n = f.petals + ring * 2;
          const o = Math.max(0, Math.min(1, open * 1.3 - ring * 0.15));
          ctx.fillStyle = f.colours[ring % f.colours.length];
          for (let p = 0; p < n; p++) {
            ctx.save();
            ctx.rotate((p / n) * Math.PI * 2 + ring * 0.4);
            ctx.beginPath();
            ctx.ellipse(rr * 0.55 * o + rr * 0.1, 0, rr * 0.48 * o, rr * 0.2 * (0.6 + 0.4 * o), 0, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();
            // a vein down each petal
            ctx.beginPath(); ctx.moveTo(rr * 0.15, 0); ctx.lineTo(rr * 0.85 * o, 0); ctx.globalAlpha = 0.5; ctx.stroke(); ctx.globalAlpha = 1;
            ctx.restore();
          }
        }
        // centre and stamens
        ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = pal[1]; ctx.fill(); ctx.stroke();
        const dots = 10;
        ctx.fillStyle = stroke;
        for (let d = 0; d < dots; d++) {
          const a = (d / dots) * Math.PI * 2;
          ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.12, Math.sin(a) * r * 0.12, 1.1, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
      return { ctx, nodes, byId, edges, flower, value, live, content, counterEl: counter, cardW: CARD, colours: { on: C.accent, off: ui.strokeColor(C.lavender || C.line) } };
    },

    render(t, S, h) {
      const { tw, span, ease } = h;
      const { nodes, edges, ctx } = S;
      const reset = 10.6, out = 1 - tw(t, reset, 0.9, "inOut");
      ctx.clearRect(0, 0, 1600, 900);

      // each node completes at its time; the edge into it carries the pulse just before
      const draw = [];
      nodes.forEach((n) => {
        const on = tw(t, n.at, 0.35, "snappy") * out;
        n.card.style.stroke = on > 0.5 ? S.colours.on : S.colours.off;
        n.card.setAttribute("stroke-width", (S.cardW + on * 0.6).toFixed(2));
        n.badge.setAttribute("opacity", (tw(t, n.at + 0.15, 0.3, "soft") * out).toFixed(3));
        n.flowers.forEach((f) => draw.push([f, tw(t, n.at + 0.1 + f.delay, 1.1, "signature") * out]));
      });
      draw.forEach(([f, open]) => S.flower(f, open));

      edges.forEach((e) => {
        const B = S.byId[e.b];
        if (e.len == null) { e.len = e.lit.getTotalLength(); e.lit.setAttribute("stroke-dasharray", e.len.toFixed(1)); }
        const start = B.at - 0.55, p = tw(t, start, 0.5, "inOut");
        e.lit.setAttribute("stroke-dashoffset", (e.len * (1 - p * out)).toFixed(1));
        const moving = t >= start && t <= start + 0.55;
        e.dot.setAttribute("opacity", moving ? 1 : 0);
        if (moving) {
          const pt = e.lit.getPointAtLength(e.len * ease.inOut(Math.min(1, (t - start) / 0.5)));
          e.dot.setAttribute("cx", pt.x.toFixed(1)); e.dot.setAttribute("cy", pt.y.toFixed(1));
        }
      });

      const c = S.content.counter;
      // the run counter ticks when this run completes, and is hidden across the seam
      const last = Math.max(...nodes.map((n) => n.at));
      S.value.textContent = (c.from + (t >= last ? 1 : 0)).toLocaleString("en-US");
      S.counterEl.style.opacity = (tw(t, 0.2, 0.5) * out).toFixed(3);
      S.counterEl.style.setProperty("--tick", span(t, last, last + 0.8, 0.15, 0.6).toFixed(3));
      S.live.style.opacity = (0.45 + 0.55 * (0.5 + 0.5 * Math.cos(t * Math.PI))).toFixed(2);
    },
  });
})();
