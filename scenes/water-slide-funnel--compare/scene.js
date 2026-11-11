/* water-slide-funnel--compare: the conversion funnel as two water slides, before and after (SVG, closed-form paths).
 * The same riders (each a fixed batch of visitors) drop into both slides at the same moments. The cascades are
 * mirrored so their paid pools meet in the middle. Before: open gaps between ramps, riders jump them and more fall
 * off each lip into the lost trough. After: guard rails and joined chutes, riders slide through. Every path is
 * planned in setup (slides, hops, ballistic falls), so each stage's count lands on the content's figure and the
 * paid pools' water rises one step per rider landed. The gap between the two pools is the moment: a bracket and
 * the ratio of paid riders that actually landed. Intro-free loop: everything drains before the seam.
 */
(function () {
  const D = 12, W = 1600, H = 900;
  const G = 1900; // px/s², the fall acceleration
  SiteMotion.scene({
    width: W,
    height: H,
    loop: 0,
    duration: D,
    still: 9.7,
    setup({ root, content, tokens, h }) {
      const { el, svg, rng, mix, ui } = h;
      const C = tokens.color, pal = tokens.palette;
      root.classList.add("wc");
      const rand = rng(content.seed || 11);
      const sides = content.sides;
      const R = content.riders ?? 50;
      const S = sides[0].stages.length; // stages per side; the last one is the paid pool
      const nR = S - 1; // ramps per side
      const fmt = (n) => Math.round(n).toLocaleString("en-US");

      // ---- geometry, drawn for the left (Before) cascade and mirrored for the right (After) ----
      const ground = 812, bottom = 800;
      const ramps = Array.from({ length: nR }, (_, i) => {
        const ax = 128 + i * 172, ay = 312 + i * 100;
        return { ax, ay, bx: ax + 138, by: ay + 44 };
      });
      const trough = { left: 104, right: 630, rim: 742 };
      const paid = { left: 650, w: 124, rim: 584 };
      const PAID_BASE = 16, PAID_STEP = 13, LOST_BASE = 14, LOST_STEP = 0.6;
      // the trough is split under the lips, so riders settle near where they fell
      const cuts = [trough.left, ...ramps.slice(0, -1).map((r, i) => (r.bx + ramps[i + 1].bx) / 2), trough.right];
      const X = (x, s) => (s ? W - x : x);

      const spawnUntil = content.spawnUntil ?? 4.9, RIDE = 0.55, HOP = 0.26, CONN = 0.2;
      const sideData = sides.map((side, s) => {
        const st = side.stages;
        const reach = st.map((x) => Math.max(1, Math.round((R * x.value) / st[0].value)));
        reach[0] = R;
        const order = Array.from({ length: R }, (_, k) => k);
        for (let k = R - 1; k > 0; k--) { const j = Math.floor(rand() * (k + 1)); [order[k], order[j]] = [order[j], order[k]]; }
        const out = new Array(R);
        order.forEach((rider, rank) => { let j = 0; while (j + 1 < S && rank < reach[j + 1]) j++; out[rider] = j; });
        const after = s === 1;
        // pass 1: down the ramps to the last lip each rider reaches
        const riders = Array.from({ length: R }, (_, k) => {
          const at = 0.35 + (k * (spawnUntil - 0.35)) / Math.max(1, R - 1);
          const pts = []; // [x, y, time, kind]  kind: 0 settle, 1 slide (accelerating), 2 hop arc, 3 fall
          const enterX = ramps[0].ax + 8, enterY = ramps[0].ay - 9;
          pts.push([X(enterX, s), 196, at, 3]);
          let t = at + Math.sqrt((2 * (enterY - 196)) / G);
          pts.push([X(enterX, s), enterY, t, 1]);
          const enters = [];
          const last = Math.min(out[k], nR - 1);
          for (let i = 0; i <= last; i++) {
            const r = ramps[i];
            if (i > 0) { t += after ? CONN : HOP; pts.push([X(r.ax + 8, s), r.ay - 9, t, 1]); }
            enters.push(t);
            t += RIDE * (0.92 + rand() * 0.16);
            pts.push([X(r.bx, s), r.by - 9, t, i < out[k] && i < nR - 1 ? (after ? 1 : 2) : 3]);
          }
          return { pts, out: out[k], enters, lipAt: t, colour: pal[(k * 3 + s) % pal.length], drift: rand() * Math.PI * 2 };
        });
        // pass 2: off the lip, in landing order, into a slot (paid pool) or the trough region under that lip
        const byLip = riders.slice().sort((a, b) => a.lipAt - b.lipAt);
        let nPaid = 0;
        const regionN = ramps.map(() => 0);
        const regionSlots = ramps.map((r, i) => {
          const l = cuts[i] + 10, rr = cuts[i + 1] - 10, per = Math.max(3, Math.floor((rr - l) / 13.5) + 1);
          const slots = [];
          for (let row = 0; row < 4; row++) for (let c = 0; c < per; c++) slots.push([l + (c * (rr - l)) / Math.max(1, per - 1) + (row % 2 ? 3 : -3), bottom - 8 - row * 11.5, row]);
          return slots.sort((a, b) => a[2] - b[2] || Math.abs(a[0] - r.bx) - Math.abs(b[0] - r.bx));
        });
        byLip.forEach((rd) => {
          const [lx, ly] = rd.pts[rd.pts.length - 1];
          let t = rd.lipAt, landX, landY, sx, sy;
          if (rd.out === S - 1) {
            const n = nPaid++;
            landY = bottom - (PAID_BASE + n * PAID_STEP);
            landX = paid.left + 30 + rand() * (paid.w - 60);
            const per = 8, row = Math.floor(n / per), c = n % per;
            sx = paid.left + 14 + (c * (paid.w - 28)) / (per - 1) + (row % 2 ? 3 : -3);
            sy = bottom - 8 - row * 11.5;
            rd.enters.push(t + Math.sqrt((2 * (landY - ly)) / G)); // "reached paid" = splashed in
          } else {
            const i = rd.out, n = regionN[i]++;
            landY = bottom - (LOST_BASE + 2);
            landX = ramps[i].bx - 6 + rand() * 14;
            [sx, sy] = regionSlots[i][n % regionSlots[i].length];
          }
          t += Math.sqrt((2 * (landY - ly)) / G);
          rd.pts.push([X(landX, s), landY, t, 0]);
          rd.splashAt = t; rd.landX = X(landX, s); rd.landY = landY;
          t += 0.55;
          rd.pts.push([X(sx, s), sy, t, 0]);
          rd.settled = t;
        });
        return { side, after, reach, riders, s };
      });
      const all = sideData.flatMap((sd) => sd.riders);
      const lastLand = Math.max(...all.map((r) => r.settled));
      if (lastLand > D - 2.4) console.warn(`water-slide-funnel--compare: last rider settles at ${lastLand.toFixed(2)} s`);
      const paidDone = Math.max(...all.filter((r) => r.out === S - 1).map((r) => r.splashAt));

      // ---- drawing ----
      const INK = ui.strokeColor(C.stroke || C.ink);
      const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "wc-svg" }, root);
      const defs = svg("defs", {}, s);
      const strutC = mix(C.line, C.paper, 0.1);
      const waterTint = mix(pal[2 % pal.length], C.surface, 0.35), goalTint = mix(C.accent, C.surface, 0.45);
      const ringLost = mix(pal[2 % pal.length], C.ink, 0.2);
      const railC = mix(C.accent, C.ink, 0.2);
      svg("line", { x1: 60, y1: ground, x2: W - 60, y2: ground, ...ui.strokeAttrs("regular", 1.5, C.line) }, s);

      const view = sideData.map((sd) => {
        const sx = (x) => X(x, sd.s);
        // scaffold behind the flumes and pools
        ramps.forEach((r) => {
          [r.ax + 18, r.bx - 14].forEach((x) => svg("line", { x1: sx(x), y1: r.ay + (x - r.ax) * ((r.by - r.ay) / (r.bx - r.ax)) + 14, x2: sx(x), y2: ground, stroke: strutC, "stroke-width": ui.stroke("fine", 2) }, s));
        });
        // entry chute
        const a0 = ramps[0];
        svg("path", { d: `M${sx(a0.ax - 22)} 186 L${sx(a0.ax - 6)} 222 L${sx(a0.ax - 6)} ${a0.ay - 22} M${sx(a0.ax + 38)} 186 L${sx(a0.ax + 22)} 222 L${sx(a0.ax + 22)} ${a0.ay - 26}`, stroke: INK, "stroke-width": ui.stroke("regular", 2), "stroke-linecap": "round", fill: "none" }, s);

        // pools: the lost trough and the paid pool, each a basin with water that rises with what it holds
        const basin = (left, right, rim, tint, crestC, id) => {
          const g = svg("g", {}, s);
          const l = Math.min(sx(left), sx(right)), w = Math.abs(sx(right) - sx(left));
          const clip = svg("clipPath", { id }, defs);
          svg("rect", { x: l, y: rim, width: w, height: bottom - rim, rx: ui.radius("md", 12) }, clip);
          const water = svg("rect", { x: l, y: bottom, width: w, height: 0, fill: tint, "clip-path": `url(#${id})` }, g);
          // sm-native-start: water and basins are the scene's material, not outlines a look should restyle
          const crest = svg("line", { x1: l + 4, x2: l + w - 4, y1: bottom, y2: bottom, stroke: crestC, "stroke-width": 2, "stroke-linecap": "round" }, g);
          svg("path", { d: `M${l} ${rim} V${bottom - 12} q0 12 12 12 H${l + w - 12} q12 0 12 -12 V${rim}`, fill: "none", stroke: INK, "stroke-width": ui.stroke("bold", 2.5), "stroke-linecap": "round" }, g);
          // sm-native-end
          return { g, water, crest, l, w };
        };
        const lost = basin(trough.left, trough.right, trough.rim, waterTint, ringLost, `wc-lost-${sd.s}`);
        const goal = basin(paid.left, paid.left + paid.w, paid.rim, goalTint, C.accent, `wc-paid-${sd.s}`);
        // gauge ticks on the paid pool's outer wall: one per two riders, a measuring beaker
        for (let n = 2; PAID_BASE + n * PAID_STEP < bottom - paid.rim - 6; n += 2) {
          const y = bottom - (PAID_BASE + n * PAID_STEP);
          const x = sd.s ? goal.l + goal.w : goal.l;
          svg("line", { x1: x, x2: x + (sd.s ? 8 : -8), y1: y, y2: y, stroke: C.faint || C.muted, "stroke-width": ui.stroke("fine", 1.5) }, s);
        }

        // flumes. sm-native-start: the flume is drawn as stacked strokes (wall, channel, water, flow), its shape
        const flumes = [];
        const flume = (d, tint) => {
          svg("path", { d, stroke: INK, "stroke-width": 22, "stroke-linecap": "round", fill: "none" }, s);
          svg("path", { d, stroke: C.surface, "stroke-width": 16, "stroke-linecap": "round", fill: "none" }, s);
          svg("path", { d, stroke: tint, "stroke-width": 8, "stroke-linecap": "round", fill: "none" }, s);
          flumes.push(svg("path", { d, stroke: C.surface, "stroke-width": 2.5, "stroke-dasharray": "6 18", "stroke-linecap": "round", fill: "none", opacity: 0.9 }, s));
        };
        ramps.forEach((r, i) => {
          if (sd.after && i > 0) { const p = ramps[i - 1]; flume(`M${sx(p.bx)} ${p.by} L${sx(r.ax)} ${r.ay}`, waterTint); } // joined chute
          flume(`M${sx(r.ax)} ${r.ay} L${sx(r.bx)} ${r.by}`, i === nR - 1 && sd.after ? goalTint : waterTint);
        });
        // sm-native-end
        // guard rails on the After slide: a rail above each ramp on posts
        if (sd.after) ramps.forEach((r) => {
          const off = 20, dx = r.bx - r.ax, dy = r.by - r.ay, len = Math.hypot(dx, dy), nx = dy / len, ny = -dx / len;
          const rail = [[r.ax + 6, r.ay], [r.bx - 2, r.by]].map(([x, y]) => [sx(x + nx * off), y + ny * off]);
          svg("line", { x1: rail[0][0], y1: rail[0][1], x2: rail[1][0], y2: rail[1][1], stroke: railC, "stroke-width": ui.stroke("regular", 2.5), "stroke-linecap": "round" }, s);
          for (let u = 0.08; u < 1; u += 0.28) {
            const x = r.ax + dx * u, y = r.ay + dy * u;
            svg("line", { x1: sx(x + nx * 10), y1: y + ny * 10, x2: sx(x + nx * off), y2: y + ny * off, stroke: railC, "stroke-width": ui.stroke("fine", 1.5), "stroke-linecap": "round" }, s);
          }
        });
        return { lost, goal, flumes };
      });

      // splash rings, then the riders on top of everything
      // sm-native-start: splash rings are water, not outlines
      const ringG = svg("g", {}, s);
      const rings = sideData.map((sd) => sd.riders.map((rd) => [0, 1].map(() => svg("ellipse", { cx: rd.landX, cy: rd.landY, rx: 0, ry: 0, fill: "none", stroke: rd.out === S - 1 ? C.accent : ringLost, "stroke-width": 2, opacity: 0 }, ringG))));
      // sm-native-end
      const BALL = ui.strokeAttrs("fine", 1.2, C.stroke || C.ink);
      const dots = sideData.map((sd) => sd.riders.map((rd) => svg("circle", { r: 6, fill: rd.colour, ...BALL, opacity: 0 }, s)));

      // the gap between the two paid pools: a level line from Before across to After, and a bracket
      const beforePaid = sideData[0].reach[S - 1], afterPaid = sideData[1].reach[S - 1];
      const yB = bottom - (PAID_BASE + beforePaid * PAID_STEP), yA = bottom - (PAID_BASE + afterPaid * PAID_STEP);
      const levelLine = svg("line", { x1: paid.left + 6, x2: W - paid.left - 6, y1: yB, y2: yB, stroke: C.ink, "stroke-width": ui.stroke("fine", 1.5), "stroke-dasharray": "5 6", opacity: 0 }, s);
      const brG = svg("g", { opacity: 0 }, s);
      const bracket = svg("path", { d: "", fill: "none", stroke: C.accentInk || C.ink, "stroke-width": ui.stroke("regular", 2.5), "stroke-linecap": "round", "stroke-linejoin": "round" }, brG);

      // ---- labels ----
      const head = el("div", "wc-head", root);
      el("div", "wc-eyebrow", head, content.eyebrow || "");
      el("div", "wc-h", head, content.heading || "");
      el("div", "wc-sub", head, content.sub || "");
      const legend = el("div", "wc-legend", root);
      el("i", "", legend);
      el("span", "", legend, content.legend || `= ${Math.round(sides[0].stages[0].value / R)} ${content.unit || "visitors"}`);

      const labels = sideData.map((sd) => {
        const right = sd.s === 1, st = sd.side.stages;
        const place = (box, x, top, w) => { box.style.top = top + "px"; box.style.width = w + "px"; box.style.left = (right ? W - x - w : x) + "px"; };
        const tag = el("div", right ? "wc-tag wc-r wc-after" : "wc-tag", root);
        place(tag, ramps[0].ax + 52, 190, 300);
        el("b", "", tag, sd.side.name);
        el("span", "", tag, sd.side.note || "");
        const stages = ramps.map((r, i) => {
          const box = el("div", right ? "wc-stage wc-r" : "wc-stage", root);
          place(box, r.ax + (i === 0 ? 52 : 6), r.ay - 86, 168);
          el("div", "wc-stage-name", box, st[i].name);
          const num = el("div", "wc-stage-n", box, "0");
          const pct = el("div", "wc-stage-pct", box, i === 0 ? "" : `${Math.round((st[i].value / st[i - 1].value) * 100)}% ${content.ofPrev || "of"} ${st[i - 1].name.toLowerCase()}`);
          return { box, num, pct };
        });
        const lostBox = el("div", "wc-pool", root);
        place(lostBox, trough.left, ground + 10, trough.right - trough.left);
        const lostN = el("div", "wc-pool-n", lostBox, "0");
        el("div", "wc-pool-name", lostBox, content.lost || "lost on the way");
        const paidBox = el("div", "wc-pool wc-goal", root);
        place(paidBox, paid.left - 18, ground + 6, paid.w + 36);
        const paidN = el("div", "wc-pool-n", paidBox, "0");
        el("div", "wc-pool-name", paidBox, `${st[S - 1].name} · ${sd.side.name}`);
        return { stages, lostN, lostBox, paidN, paidBox, tag };
      });

      const call = el("div", "wc-call", root);
      const callN = el("div", "wc-call-n", call, "");
      el("div", "wc-call-t", call, content.compare || "more paid customers");
      el("div", "wc-call-note", call, (content.compareNote || "from the same {n} visitors").replace("{n}", fmt(sides[0].stages[0].value)));

      return { sideData, view, rings, dots, labels, S, nR, fmt, legend, call, callN, levelLine, brG, bracket, yA, yB, paidDone, bottom, PAID_BASE, PAID_STEP, LOST_BASE, LOST_STEP };
    },

    render(t, V, h) {
      const { tw, lerp, ease, motion } = h;
      const drain = tw(t, D - 1.15, 0.85, "inOut"); // pools drain and riders fade before the seam
      const labelsIn = tw(t, 0, 0.5, "soft") * (1 - drain);
      const flow = -((t * 50) % 24); // 50 px/s × 12 s = 600 px = 25 whole dash periods
      V.view.forEach((v) => v.flumes.forEach((f) => f.setAttribute("stroke-dashoffset", flow.toFixed(2))));

      const landed = [0, 0];
      V.sideData.forEach((sd, s) => {
        let paidLevel = 0, lostLevel = 0, paidN = 0, lostN = 0;
        sd.riders.forEach((rd, k) => {
          const d = V.dots[s][k], p = rd.pts;
          if (t < p[0][2]) d.setAttribute("opacity", 0);
          else {
            let i = 0;
            while (i < p.length - 2 && t >= p[i + 1][2]) i++;
            const [xa, ya, ta, kind] = p[i], [xb, yb, tb] = p[i + 1];
            const u = Math.min(1, Math.max(0, (t - ta) / Math.max(1e-3, tb - ta)));
            let x, y;
            if (kind === 3) { x = lerp(xa, xb, u); y = lerp(ya, yb, u * u); } // falling: accelerates
            else if (kind === 1) { const v = u * u * 0.45 + u * 0.55; x = lerp(xa, xb, v); y = lerp(ya, yb, v); } // sliding: picks up speed
            else if (kind === 2) { x = lerp(xa, xb, u); y = lerp(ya, yb, u) - Math.sin(u * Math.PI) * 18; } // jumping the gap
            else { const v = ease.soft(u); x = lerp(xa, xb, v); y = lerp(ya, yb, v); } // sink into the pool
            if (t >= rd.settled) { // settled: a slow bob, one whole cycle every 3 s (4 per loop)
              x = p[p.length - 1][0]; y = p[p.length - 1][1] + Math.sin((t / 3) * Math.PI * 2 + rd.drift) * 1.4;
            }
            y += drain * 24;
            d.setAttribute("cx", x.toFixed(1)); d.setAttribute("cy", y.toFixed(1));
            d.setAttribute("opacity", (1 - drain).toFixed(3));
          }
          // water rises one step per rider, eased over 0.4 s from its splash
          const rise = tw(t, rd.splashAt, 0.4, "snappy");
          if (rd.out === V.S - 1) { paidLevel += rise; if (t >= rd.splashAt) paidN++; }
          else { lostLevel += rise; if (t >= rd.splashAt) lostN++; }
          V.rings[s][k].forEach((ring, j) => {
            const a = (t - rd.splashAt - j * 0.12) / 0.75;
            if (a <= 0 || a >= 1) { ring.setAttribute("opacity", 0); return; }
            const e = ease.signature(a);
            ring.setAttribute("rx", (6 + e * 30).toFixed(1)); ring.setAttribute("ry", (2 + e * 6).toFixed(1));
            ring.setAttribute("opacity", ((1 - a) * 0.9).toFixed(3));
          });
        });
        landed[s] = paidN;
        const v = V.view[s];
        const pTop = V.bottom - (V.PAID_BASE + paidLevel * V.PAID_STEP * (1 - drain));
        v.goal.water.setAttribute("y", pTop.toFixed(1)); v.goal.water.setAttribute("height", (V.bottom - pTop).toFixed(1));
        v.goal.crest.setAttribute("y1", pTop.toFixed(1)); v.goal.crest.setAttribute("y2", pTop.toFixed(1));
        const lTop = V.bottom - (V.LOST_BASE + lostLevel * V.LOST_STEP * (1 - drain));
        v.lost.water.setAttribute("y", lTop.toFixed(1)); v.lost.water.setAttribute("height", (V.bottom - lTop).toFixed(1));
        v.lost.crest.setAttribute("y1", lTop.toFixed(1)); v.lost.crest.setAttribute("y2", lTop.toFixed(1));

        // counts, each from the riders that got there
        const st = sd.side.stages, L = V.labels[s], R = sd.reach;
        const lostTotal = R[0] - R[V.S - 1];
        L.paidN.textContent = V.fmt((st[V.S - 1].value * paidN) / R[V.S - 1]);
        L.lostN.textContent = "−" + V.fmt(((st[0].value - st[V.S - 1].value) * lostN) / Math.max(1, lostTotal));
        L.paidBox.style.opacity = labelsIn.toFixed(3);
        L.lostBox.style.opacity = labelsIn.toFixed(3);
        L.stages.forEach((lab, i) => {
          let entered = 0, first = Infinity;
          sd.riders.forEach((rd) => { if (rd.enters.length > i) { first = Math.min(first, rd.enters[i]); if (t >= rd.enters[i]) entered++; } });
          lab.num.textContent = V.fmt((st[i].value * entered) / R[i]);
          lab.box.style.opacity = labelsIn.toFixed(3);
          lab.pct.style.opacity = (labelsIn * tw(t, first, 0.5, "soft")).toFixed(3);
        });
      });

      // the moment: once every paid rider has landed, the gap is marked and stated, from the landed riders
      const at = V.paidDone + 0.3;
      const inA = tw(t, at, 0.7, "signature") * (1 - drain);
      const inB = tw(t, at + motion.stagger(1, 0.1), 0.8, "signature") * (1 - drain);
      if (landed[0] > 0 && t >= at) { const r = landed[1] / landed[0]; V.callN.textContent = (Number.isInteger(r) ? r : r.toFixed(1)) + "×"; }
      V.levelLine.setAttribute("opacity", (inA * 0.7).toFixed(3));
      const yTop = lerp(V.yB, V.yA, tw(t, at, 0.7, "signature"));
      V.bracket.setAttribute("d", `M792 ${V.yB} H808 M800 ${V.yB} V${yTop.toFixed(1)} M792 ${yTop.toFixed(1)} H808`);
      V.brG.setAttribute("opacity", inA.toFixed(3));
      V.call.style.opacity = inB.toFixed(3);
      V.call.style.transform = `translate(-50%, ${((1 - inB) * 18).toFixed(1)}px)`;
      V.legend.style.opacity = labelsIn.toFixed(3);
    },
  });
})();
