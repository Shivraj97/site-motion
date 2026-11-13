/* iso-blocks: a tiled isometric floor in the palette, with accent blocks rising out of it.
 * Each block carries live product data on its faces (a typed log, a counting metric with a drawn
 * sparkline, replicas lighting up, a latency figure), and pulses of accent run along the floor
 * lanes toward the hero block. Intro 0–2.2 s (blocks rise), then a seamless loop.
 */
SiteMotion.scene({
  width: 1600,
  height: 900,
  loop: 2.2,
  duration: 12.2,
  still: 7.5,
  setup({ root, content, tokens, h }) {
    const { svg, mix, alpha, rng, isoCamera, ui } = h;
    const C = tokens.color;
    const T = content.tile || 64;
    const cam = isoCamera(content.origin || [820, 40], 1, 30);
    const s = svg("svg", { viewBox: "0 0 1600 900", width: 1600, height: 900, class: "ib" }, root);
    const defs = svg("defs", {}, s);
    const blur = svg("filter", { id: "ib-soft", x: "-20%", y: "-20%", width: "140%", height: "140%" }, defs);
    svg("feGaussianBlur", { stdDeviation: 14 }, blur);

    // ---------- floor ----------
    const floor = svg("g", { class: "ib-floor" }, s);
    const rand = rng(content.seed || 7);
    const neutral = C.raised || mix(C.paper, C.ink, 0.04);
    // the floor is a backdrop: pastel palettes go in as they are, saturated brand colours are softened toward the paper
    const strength = (c) => (window.SMTokens ? SMTokens.contrast(c, C.paper) : 1);
    const colours = tokens.palette.slice(0, -1).map((c) => (strength(c) > 1.8 ? mix(c, C.paper, Math.min(0.62, (strength(c) - 1.8) * 0.18 + 0.38)) : c));
    const lanes = new Set(content.lanes || [3, 5, 7]);
    const pulses = [];
    const visible = (pts) => pts.some(([x, y]) => x > -80 && x < 1680 && y > -80 && y < 980);
    for (let j = -8; j < 22; j++) {
      // runs of colour along each lane, like coloured traffic on a road
      let run = 0, colour = neutral;
      for (let i = -10; i < 26; i++) {
        if (run <= 0) {
          const r = rand();
          colour = r < 0.58 ? neutral : colours[Math.floor(rand() * colours.length)];
          run = 1 + Math.floor(rand() * (colour === neutral ? 3 : 5));
        }
        run--;
        const quad = [[i * T, j * T, 0], [(i + 1) * T, j * T, 0], [(i + 1) * T, (j + 1) * T, 0], [i * T, (j + 1) * T, 0]];
        const screen = quad.map((q) => cam.p(...q));
        if (!visible(screen)) continue;
        svg("polygon", { points: cam.pts(quad), fill: colour, stroke: ui.strokeColor(C.line), "stroke-width": ui.stroke("hair", 1) }, floor);
        if (lanes.has(j)) {
          const glow = svg("polygon", { points: cam.pts(quad), fill: mix(C.accent, C.paper, 0.35), opacity: 0, stroke: "none" }, floor);
          pulses.push({ node: glow, i, j });
        }
      }
    }

    // ---------- blocks ----------
    const accent = C.accent;
    const tone = {
      top: mix(accent, "#ffffff", 0.55),
      side: accent,
      front: mix(accent, C.accentInk || C.ink, 0.58),
      ink: mix(accent, "#ffffff", 0.78),
      dim: alpha(mix(accent, "#ffffff", 0.78), 0.5),
    };
    // the front face carries live data in the pale ink: it deepens only as far as that ink needs to read at AA
    tone.front = h.textOn(tone.ink, tone.front);
    const titleInk = h.textOn(tone.top, mix(accent, C.accentInk || C.ink, 0.55));
    const world = svg("g", {}, s);
    const blocks = (content.blocks || []).map((b, index) => ({ ...b, index, depth: b.at[0] + b.size[0] / 2 + b.at[1] + b.size[1] / 2 }));
    blocks.sort((a, b) => a.depth - b.depth);
    const built = blocks.map((b) => {
      const g = svg("g", {}, world);
      const shadow = svg("polygon", { fill: "#000", opacity: 0.12, filter: "url(#ib-soft)" }, g);
      const side = svg("polygon", { fill: tone.side }, g);
      const front = svg("polygon", { fill: tone.front }, g);
      const top = svg("polygon", { fill: tone.top }, g);
      const edges = svg("path", { fill: "none", stroke: ui.strokeColor(mix(accent, C.accentInk || C.ink, 0.3)), "stroke-width": ui.stroke("fine", 1), "stroke-linejoin": "round", opacity: 0.6 }, g);
      const faceFront = svg("g", { class: "ib-face" }, g);
      const faceTop = svg("g", { class: "ib-face" }, g);
      const faceSide = svg("g", { class: "ib-face" }, g);
      const parts = { g, shadow, side, front, top, edges, faceFront, faceTop, faceSide, b, data: {} };
      return parts;
    });

    function mono(parent, x, y, size, str, attrs = {}) {
      const t = svg("text", { x, y, "font-family": "var(--font-mono)", "font-size": size, fill: tone.ink, "letter-spacing": "0.06em", ...attrs }, parent);
      t.textContent = str;
      return t;
    }
    function sparkPath(series, w, hgt) {
      const lo = Math.min(...series), hi = Math.max(...series);
      return series.map((v, i) => `${i ? "L" : "M"}${((i / (series.length - 1)) * w).toFixed(1)} ${(hgt - ((v - lo) / (hi - lo || 1)) * hgt).toFixed(1)}`).join("");
    }

    var faces = {
      log(P) {
        const lines = P.b.lines || [];
        P.data.rows = lines.map((line, i) => {
          const y = 40 + i * 30;
          return { time: mono(P.faceFront, 22, y, 16, line.time, { opacity: 0.55 }), text: mono(P.faceFront, 88, y, 16, ""), full: line.text };
        });
      },
      hero(P) {
        const b = P.b, d = b.size[1], H = b.size[2];
        const title = (b.title || "").split("\n");
        title.forEach((line, i) => mono(P.faceTop, 18, 34 + i * 30, 26, line, { "font-family": "var(--font-sans)", "letter-spacing": "0", "font-weight": 500, fill: titleInk }));
        const status = b.status || "ACTIVE";
        P.data.dot = svg("circle", { cx: d - 22 - status.length * 10.6 - 10, cy: 28.5, r: 3.5, fill: tone.ink }, P.faceFront);
        mono(P.faceFront, d - 22, 34, 16, status, { "text-anchor": "end" });
        mono(P.faceFront, 24, 68, 17, b.label || "");
        mono(P.faceFront, 24, 92, 16, b.sub || "", { opacity: 0.6 });
        P.data.metric = mono(P.faceFront, 22, 150, 44, "0", { "font-family": "var(--font-sans)", "letter-spacing": "-0.01em", "font-weight": 500 });
        mono(P.faceFront, 24, 178, 16, b.unit || "", { opacity: 0.7 });
        const chart = svg("g", { transform: `translate(24 ${H - 128})` }, P.faceFront);
        const w = d - 48, ch = 104;
        [0, 0.5, 1].forEach((k) => svg("path", { d: `M0 ${k * ch}H${w}`, stroke: tone.dim, "stroke-dasharray": "2 5", "stroke-width": 1, fill: "none" }, chart)); // sm-native: data marks are content: they keep their weight, so data never vanishes under stroke none
        P.data.spark = svg("path", { d: sparkPath(b.series, w, ch), stroke: tone.ink, "stroke-width": 1.6, fill: "none", "stroke-linejoin": "round" }, chart); // sm-native: data marks are content: they keep their weight, so data never vanishes under stroke none
        P.data.sparkLength = null;
        // the mark on the narrow face: nested squares
        const m = svg("g", { transform: `translate(${(b.size[0] - 56) / 2} 26)` }, P.faceSide);
        svg("rect", { width: 56, height: 56, fill: mix(accent, C.accentInk || C.ink, 0.7) }, m);
        svg("rect", { x: 10, y: 10, width: 36, height: 36, fill: tone.top }, m);
        svg("rect", { x: 19, y: 19, width: 18, height: 18, fill: mix(accent, C.accentInk || C.ink, 0.7) }, m);
      },
      replicas(P) {
        const b = P.b, n = b.total || 4;
        mono(P.faceFront, 24, 40, 16, b.label || "REPLICAS");
        P.data.count = mono(P.faceFront, b.size[1] - 22, 40, 16, "", { "text-anchor": "end" });
        P.data.cells = Array.from({ length: n }, (_, i) => svg("rect", { x: 24 + i * 52, y: 62, width: 40, height: 40, fill: "none", stroke: tone.ink, "stroke-width": 1.4 }, P.faceFront)); // sm-native: data marks are content: they keep their weight, so data never vanishes under stroke none
      },
      metric(P) {
        const b = P.b, d = b.size[1], H = b.size[2];
        P.data.value = mono(P.faceFront, d - 52, 64, 52, "0", { "text-anchor": "end", "font-family": "var(--font-sans)", "letter-spacing": "-0.02em" });
        mono(P.faceFront, d - 22, 46, 18, b.unit || "", { "text-anchor": "end", "font-family": "var(--font-sans)" });
        mono(P.faceFront, 24, H - 34, 16, b.label || "");
        mono(P.faceFront, 24, H - 12, 16, b.sub || "", { opacity: 0.55 });
        const chart = svg("g", { transform: `translate(${d * 0.5} ${H - 48})` }, P.faceFront);
        svg("path", { d: `M0 34H${d * 0.5 - 24}`, stroke: tone.dim, "stroke-dasharray": "2 5", "stroke-width": 1, fill: "none" }, chart); // sm-native: data marks are content: they keep their weight, so data never vanishes under stroke none
        P.data.spark = svg("path", { d: sparkPath(b.series, d * 0.5 - 24, 30), stroke: tone.ink, "stroke-width": 1.4, fill: "none" }, chart); // sm-native: data marks are content: they keep their weight, so data never vanishes under stroke none
      },
    };

    built.forEach((P) => faces[P.b.kind]?.(P));
    return { cam, T, pulses, built, tone, mono };
  },

  render(t, S, h) {
    const { tw, set, text, typed, count, span } = h;
    const { cam, T, pulses } = S;

    // floor pulses: heads travel along each lane; 1.2 tiles/s over a 12-tile period loops every 10 s exactly
    const P = 12, speed = 1.2;
    const head = (t * speed) % P;
    for (const q of pulses) {
      const lane = ((q.i - head - q.j * 3) % P + P) % P; // distance behind the head, staggered per lane
      const glow = lane < 4 ? Math.pow(1 - lane / 4, 1.6) * 0.85 : 0;
      set(q.node, { opacity: glow.toFixed(3) });
    }

    const loopT = t < 2.2 ? t : t; // content timeline uses absolute t; the loop wraps to 2.2 where every face is blank
    for (const B of S.built) {
      const { b } = B;
      const rise = tw(t, 0.25 + B.b.index * 0.16, 1.4, "signature");
      const [x, y] = b.at, [w, d, H] = b.size;
      const z = H * rise;
      set(B.side, { points: cam.pts([[x, y + d, 0], [x + w, y + d, 0], [x + w, y + d, z], [x, y + d, z]]) });
      set(B.front, { points: cam.pts([[x + w, y, 0], [x + w, y + d, 0], [x + w, y + d, z], [x + w, y, z]]) });
      set(B.top, { points: cam.pts([[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z]]) });
      const sh = 18;
      set(B.shadow, { points: cam.pts([[x - sh, y - sh, 0], [x + w + sh * 2, y - sh, 0], [x + w + sh * 2, y + d + sh, 0], [x - sh, y + d + sh, 0]]), opacity: (0.13 * rise).toFixed(3) });
      const E = (a, b2) => { const p = cam.p(...a), q = cam.p(...b2); return `M${p[0].toFixed(1)} ${p[1].toFixed(1)}L${q[0].toFixed(1)} ${q[1].toFixed(1)}`; };
      set(B.edges, { d: E([x + w, y + d, 0], [x + w, y + d, z]) + E([x, y + d, z], [x + w, y + d, z]) + E([x + w, y, z], [x + w, y + d, z]) });
      set(B.faceFront, { transform: cam.matrix([x + w, y + d, z], [0, -1, 0], [0, 0, -1]) });
      set(B.faceTop, { transform: cam.matrix([x, y + d, z], [0, -1, 0], [1, 0, 0]) });
      set(B.faceSide, { transform: cam.matrix([x, y + d, z], [1, 0, 0], [0, 0, -1]) });

      // content: in after the block is up, out just before the loop wraps
      const show = span(loopT, 2.2 + b.index * 0.12, 11.55, 0.5, 0.5);
      const faceOpacity = (rise > 0.97 ? show : 0).toFixed(3);
      set(B.faceFront, { opacity: faceOpacity });
      set(B.faceSide, { opacity: Math.max(rise > 0.97 ? 1 : 0, 0).toFixed(3) });
      set(B.faceTop, { opacity: (rise > 0.97 ? Math.max(show, b.kind === "hero" ? 1 : 0) : 0).toFixed(3) });

      const D = B.data;
      const local = loopT - 2.3 - b.index * 0.12;
      if (b.kind === "log") {
        let at = 0;
        D.rows.forEach((row) => {
          const cps = 22;
          text(row.text, typed(row.full, local, at, cps) + (local > at && local < at + row.full.length / cps + 0.6 ? "▍" : ""));
          set(row.time, { opacity: local > at ? 0.55 : 0 });
          at += row.full.length / cps + 0.7;
        });
      } else if (b.kind === "hero") {
        const v = count(local, 0.3, 2.4, b.from ?? b.value * 0.6, b.value);
        text(D.metric, b.format === "k" ? (v / 1000).toFixed(1) + "k" : Math.round(v).toLocaleString("en-US"));
        if (D.sparkLength == null) { D.sparkLength = D.spark.getTotalLength(); set(D.spark, { "stroke-dasharray": D.sparkLength }); }
        set(D.spark, { "stroke-dashoffset": (D.sparkLength * (1 - tw(local, 0.4, 4.2, "soft"))).toFixed(1) });
        set(D.dot, { opacity: (0.35 + 0.65 * (0.5 + 0.5 * Math.cos(t * Math.PI * 1.2))).toFixed(2) });
      } else if (b.kind === "replicas") {
        const n = b.total || 4, on = Math.min(b.running ?? n, Math.max(0, Math.floor((local - 0.4) / 0.45) + 1));
        D.cells.forEach((cell, i) => set(cell, { fill: i < on ? S.tone.ink : "none" }));
        text(D.count, `${Math.max(0, on)}/${n} ${b.state || "RUNNING"}`);
      } else if (b.kind === "metric") {
        const v = count(local, 0.5, 2.0, b.from ?? b.value * 3, b.value);
        text(D.value, Math.round(v).toString());
        const len = D.len ?? (D.len = D.spark.getTotalLength());
        set(D.spark, { "stroke-dasharray": len, "stroke-dashoffset": (len * (1 - tw(local, 0.6, 3, "soft"))).toFixed(1) });
      }
    }
    void T;
  },
});
