/* press-qa: testing as a print line, seen from above (SVG + DOM).
 * A rotary press prints one sheet per build; each sheet carries a grid of marks, one per test. Sheets slide right
 * under an inspector whose beam turns every mark it passes green. One build has a failing test: its mark turns red,
 * the line stops the sheet, and a reject arm flicks it off the line into a chute that loops underneath, back to the
 * press. It is printed again (the clean print wipes the misprint away at the nip), passes on the second run and lands
 * on the stack of passed builds. The tally is the sum of the tests on the sheets that have landed.
 *
 * Every sheet's pose is a closed-form function of t: a trapezoid speed profile on the line, a seeded stack slot,
 * and for the caught sheet a flick (a fast start decaying to line speed) along an analytic chute path. Nothing is
 * accumulated, so any frame can be seeked. The run starts with an empty line and ends with the stack shipped out
 * and the tally cleared, so the frame at D equals the frame at 0.
 */
(function () {
  const W = 1600, H = 900, D = 16.4;
  const LY = 520, SW = 140, SH = 184;                   // line centre, sheet size
  const TX = 20, IX = 330, NX = 440, GX = 880, FX = 1010, SX = 1340, R = 120; // feed, infeed, nip, beam, reject, stack, chute radius
  const V = 380, TA = 0.35, TD = 0.7, STEP = 1.0;       // line speed, accel, decel, feed interval
  const HOLD = 0.42;                                    // the stopped sheet waits under the arm
  const KICK = 300, KICK_K = 0.14, CONTACT = 0.012;      // the flick: extra distance, decay, arm-to-sheet delay
  const CH = 0.8;                                       // a sheet in the chute sits lower, so it reads smaller
  const SHIP = 15.0, SHIP_DUR = 0.9;
  const ARM = { x: 1160, y: 398, len: 230, rest: 181, back: 192, hit: 146 };
  const COLS = 6, PX = 15, PY = 13;                     // test-mark grid

  // ---------- motion profiles ----------
  const dA = (V * TA) / 2, dD = (V * TD) / 2;
  const trapT = (dist) => TA + (dist - dA - dD) / V + TD;
  function trap(a, dist) {
    const tc = (dist - dA - dD) / V, T = TA + tc + TD;
    if (a <= 0) return 0;
    if (a < TA) return (V * a * a) / (2 * TA);
    if (a < TA + tc) return dA + V * (a - TA);
    if (a < T) { const u = a - TA - tc; return dA + (dist - dA - dD) + V * u - (V * u * u) / (2 * TD); }
    return dist;
  }
  const L2 = FX - IX, CHUTE = 2 * Math.PI * R + L2;
  // the chute's centreline: down-and-round from the reject point, left along the bottom, up into the infeed
  function chuteAt(s) {
    s = Math.max(0, Math.min(CHUTE, s));
    const A = Math.PI * R;
    let x, y, hd;
    if (s < A) { const p = s / R; x = FX + R * Math.sin(p); y = LY + R - R * Math.cos(p); hd = p; }
    else if (s < A + L2) { x = FX - (s - A); y = LY + 2 * R; hd = Math.PI; }
    else { const p = (s - A - L2) / R; x = IX - R * Math.sin(p); y = LY + R + R * Math.cos(p); hd = Math.PI + p; }
    const q = Math.PI * R * 0.5;
    const sc = s < q ? 1 - (1 - CH) * Math.sin((s / q) * Math.PI * 0.5) : s > CHUTE - q ? CH + (1 - CH) * (1 - Math.cos(((s - CHUTE + q) / q) * Math.PI * 0.5)) : CH;
    // off the table the sheet trails the turn a little, so the arm stays behind it
    const lag = s < q ? Math.pow(s / q, 1.6) * (Math.PI / 2) : hd;
    return { x, y, rot: (lag * 180) / Math.PI, sc };
  }
  const kick = (tau) => V * tau + KICK * (1 - Math.exp(-tau / KICK_K));

  SiteMotion.scene({
    width: W,
    height: H,
    duration: D,
    loop: 0,
    still: 8.63,
    setup({ root, content, tokens, h }) {
      const { el, svg, mix, rng, ui } = h;
      const C = tokens.color;
      const rand = rng(content.seed || 58);
      const ink = ui.strokeColor(C.ink);
      const LINE = ui.strokeAttrs("regular", 1.5, C.line);
      const OUT = ui.strokeAttrs("regular", 1.5, mix(C.line, C.ink, 0.25));
      root.classList.add("pq");
      const builds = content.builds || [];
      const unit = content.testsUnit || "tests";
      const status = content.status || {};

      // ---------- schedule ----------
      const fIdx = builds.findIndex((b) => b.failing);
      const recs = builds.map((b, i) => ({ b, i, fail: i === fIdx }));
      const tsF = fIdx * STEP, T1 = trapT(FX - TX), tF = tsF + T1 + HOLD;
      let lo = 0, hi = 10;
      for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (kick(m) < CHUTE) lo = m; else hi = m; }
      const tM = tF + CONTACT + hi;
      const aIX = TA + (IX - TX - dA) / V;
      const tsR = tM - aIX;
      let slot = fIdx + 2;
      recs.forEach((r) => {
        if (r.i < fIdx) r.ts = r.i * STEP;
        else if (r.fail) r.ts = tsF;
        else { let ts = slot * STEP; if (Math.abs(ts - tsR) < 0.75) ts = tsR + 1.0; r.ts = ts; slot = ts / STEP + 1; }
      });
      const failRec = recs[fIdx];
      // landing order decides each sheet's slot on the stack (approximate T: the stack only rises a few px)
      const lineStart = (r) => (r.fail ? tsR : r.ts);
      recs.forEach((r) => (r.landApprox = lineStart(r) + trapT(SX - TX)));
      [...recs].sort((a, b) => a.landApprox - b.landApprox).forEach((r, k) => {
        r.k = k;
        r.target = { x: SX - k * 0.9 + (rand() - 0.5) * 2.8, y: LY - k * 2.4, rot: (rand() - 0.5) * 1.6 };
        r.dist = r.target.x - TX;
        r.land = lineStart(r) + trapT(r.dist);
      });
      if (recs.some((r) => r.land > SHIP - 0.15)) console.warn("press-qa: a sheet lands after the stack ships; shorten the run");

      // pose of a sheet at time t: { phase, x, y, rot, sc, lift }
      function lineTo(r, a, dist) {
        const T = trapT(dist), x = TX + trap(a, dist);
        const u = Math.max(0, (a - (T - TD)) / TD);
        const e = h.ease.soft(Math.min(1, u));
        return { x, y: LY + (r.target.y - LY) * e, rot: r.target.rot * e, sc: 1, lift: u > 0 && u < 1 ? Math.sin(u * Math.PI) : 0 };
      }
      function pose(r, t) {
        const ship = t >= SHIP ? 440 * h.ease.inOut(Math.min(1, (t - SHIP) / SHIP_DUR)) : 0;
        if (t >= SHIP + SHIP_DUR) return { phase: "gone" };
        if (t >= r.land) return { phase: "landed", x: r.target.x + ship, y: r.target.y, rot: r.target.rot, sc: 1, lift: 0 };
        if (!r.fail) {
          const a = t - r.ts;
          if (a < 0) return { phase: "hidden" };
          return { phase: "line1", ...lineTo(r, a, r.dist) };
        }
        const a1 = t - r.ts;
        if (a1 < 0) return { phase: "hidden" };
        if (a1 < T1) return { phase: "line1", x: TX + trap(a1, FX - TX), y: LY, rot: 0, sc: 1, lift: 0 };
        if (t < tF + CONTACT) return { phase: "hold", x: FX, y: LY, rot: 0, sc: 1, lift: 0 };
        if (t < tM) return { phase: "chute", ...chuteAt(kick(t - tF - CONTACT)), lift: 0 };
        return { phase: "line2", ...lineTo(r, t - tsR, r.dist) };
      }

      // when a sheet's world x first reaches `x` on a given run (bisection on the monotonic profile)
      const reach = (start, dist, x) => { let a0 = 0, a1 = trapT(dist); for (let k = 0; k < 40; k++) { const m = (a0 + a1) / 2; if (TX + trap(m, dist) < x) a0 = m; else a1 = m; } return start + a1; };

      // ---------- drawing ----------
      const copy = el("div", "pq-copy", root);
      el("div", "pq-eyebrow", copy, content.eyebrow || "");
      el("div", "pq-h", copy, content.heading || "");
      el("div", "pq-sub", copy, content.sub || "");

      const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "pq-svg" }, root);
      const defs = svg("defs", {}, s);
      const glowGrad = (id, col) => {
        const g = svg("linearGradient", { id, x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
        svg("stop", { offset: 0, "stop-color": col, "stop-opacity": 0 }, g);
        svg("stop", { offset: 0.5, "stop-color": col, "stop-opacity": 0.26 }, g);
        svg("stop", { offset: 1, "stop-color": col, "stop-opacity": 0 }, g);
      };
      glowGrad("pq-glow", C.accent);
      glowGrad("pq-glow-w", C.warning);
      const cyl = svg("linearGradient", { id: "pq-cyl", x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
      [[0, 0.22], [0.35, 0.04], [0.6, 0.02], [1, 0.26]].forEach(([o, k]) => svg("stop", { offset: o, "stop-color": mix(C.surface, C.ink, k) }, cyl));

      // the chute, under everything: a trough with rims, chevrons pointing back to the press
      const chuteD = `M${FX} ${LY}A${R} ${R} 0 0 1 ${FX} ${LY + 2 * R}L${IX} ${LY + 2 * R}A${R} ${R} 0 0 1 ${IX} ${LY}`;
      // sm-native-start: the chute is a channel drawn as two wide strokes (rim and trough), not an outline
      svg("path", { d: chuteD, fill: "none", stroke: mix(C.paper, C.ink, 0.16), "stroke-width": 172, "stroke-linecap": "butt" }, s);
      svg("path", { d: chuteD, fill: "none", stroke: mix(C.paper, C.ink, 0.07), "stroke-width": 160, "stroke-linecap": "butt" }, s);
      for (let d = Math.PI * R + 40; d < Math.PI * R + L2 - 20; d += 74) {
        const p = chuteAt(d);
        svg("path", { d: "M-6 -9L4 0L-6 9", fill: "none", stroke: mix(C.paper, C.ink, 0.26), "stroke-width": 3, "stroke-linecap": "round", "stroke-linejoin": "round", transform: `translate(${p.x.toFixed(1)} ${(p.y - 16).toFixed(1)}) rotate(${p.rot.toFixed(1)})` }, s);
      }
      // sm-native-end

      // the line: a roller table from the feed to the delivery board
      svg("rect", { x: -20, y: LY - 104, width: 1250, height: 208, rx: ui.radius("md", 12), fill: mix(C.paper, C.ink, 0.045), ...LINE }, s);
      for (let x = 14; x < 1220; x += 34) svg("line", { x1: x, x2: x, y1: LY - 96, y2: LY + 96, stroke: mix(C.paper, C.ink, 0.11), "stroke-width": ui.stroke("hair", 1) }, s);
      // delivery board with joggers that square the stack
      svg("rect", { x: SX - 98, y: LY - 116, width: 196, height: 232, rx: ui.radius("md", 12), fill: mix(C.paper, C.ink, 0.07), ...LINE }, s);
      const jog = mix(C.ink, C.paper, 0.35), JW = ui.stroke("bold", 3);
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
        const x = SX + sx * (SW / 2 + 8), y = LY + sy * (SH / 2 + 8) - 8;
        svg("path", { d: `M${x} ${y - sy * 26}L${x} ${y}L${x - sx * 26} ${y}`, fill: "none", stroke: jog, "stroke-width": JW, "stroke-linecap": "round", "stroke-linejoin": "round" }, s);
      });
      // feed pile of blank sheets (the top one is where each build starts)
      for (let k = 4; k >= 0; k--) svg("rect", { x: TX - SW / 2 + k * 1.2, y: LY - SH / 2 + k * 2.6, width: SW, height: SH, rx: ui.radius("sm", 3), fill: C.surface, ...OUT }, s);

      // ---------- sheets ----------
      const ghostLayer = svg("g", {}, s);
      const sheetLayer = svg("g", {}, s);
      const txt = (parent, attrs, cls, value = "") => { const n = svg("text", { ...attrs, class: cls }, parent); n.textContent = value; return n; };
      const markAt = (n, j) => { const rows = Math.ceil(n / COLS), row = Math.floor(j / COLS), col = j % COLS; return { x: -((COLS - 1) * PX) / 2 + col * PX, y: -4 - ((rows - 1) * PY) / 2 + row * PY }; };
      const RAD = ui.radius("sm", 3);
      function printLayer(parent, b, mode) {
        const g = svg("g", {}, parent);
        if (mode === "mis") {
          // the misregistered second pass: a ghost of the print, offset and in the warning colour
          const ghost = svg("g", { transform: "translate(4 3)", opacity: 0.5, "data-sm-decor": "" }, g);
          txt(ghost, { x: -58, y: -66 }, "pq-s-id pq-s-ghost", b.id);
          for (let j = 0; j < b.tests; j++) { const m = markAt(b.tests, j); svg("rect", { x: m.x - 5, y: m.y - 5, width: 10, height: 10, rx: Math.min(2, RAD), fill: C.warning }, ghost); }
        }
        txt(g, { x: -58, y: -66 }, "pq-s-id", b.id);
        txt(g, { x: 58, y: -66, "text-anchor": "end" }, "pq-s-n", `${b.tests} ${unit}`);
        svg("line", { x1: -58, x2: 58, y1: -57, y2: -57, stroke: C.line, "stroke-width": ui.stroke("hair", 1) }, g);
        const marks = Array.from({ length: b.tests }, (_, j) => {
          const m = markAt(b.tests, j);
          return { mx: m.x, node: svg("rect", { x: m.x - 5, y: m.y - 5, width: 10, height: 10, rx: Math.min(2, RAD), fill: mix(C.ink, C.surface, 0.55) }, g), bad: mode === "mis" && j === b.failAt };
        });
        const foot = svg("g", { opacity: 0 }, g);
        const bad = mode === "mis";
        svg("rect", { x: -58, y: 63, width: 10, height: 10, rx: Math.min(2, RAD), fill: bad ? C.warning : C.positive }, foot);
        txt(foot, { x: -42, y: 72 }, bad ? "pq-s-foot pq-s-bad" : "pq-s-foot pq-s-ok", bad ? `1 ${status.failed ? status.failed.toLowerCase() : "failed"}` : mode === "rerun" ? status.rerun || "Re-run passed" : status.passed || "Passed");
        return { g, marks, foot };
      }
      const sheetOf = (r, id) => {
        const g = svg("g", { opacity: 0 }, sheetLayer);
        // sm-native: a sheet's contact shadow is a flat offset of the paper, not an elevation level
        const shadow = svg("rect", { x: -SW / 2, y: -SH / 2, width: SW, height: SH, rx: RAD, fill: C.ink, opacity: 0.07 }, g);
        const paper = svg("rect", { x: -SW / 2, y: -SH / 2, width: SW, height: SH, rx: RAD, fill: C.surface, ...OUT }, g);
        const clipA = svg("clipPath", { id: `pq-a${id}` }, defs), clipB = svg("clipPath", { id: `pq-b${id}` }, defs);
        const rectA = svg("rect", { x: -SW / 2, y: -SH / 2 - 2, width: 0, height: SH + 4 }, clipA);
        const rectB = svg("rect", { x: -SW / 2, y: -SH / 2 - 2, width: 0, height: SH + 4 }, clipB);
        const wrapA = svg("g", { "clip-path": `url(#pq-a${id})` }, g), wrapB = svg("g", { "clip-path": `url(#pq-b${id})` }, g);
        const A = printLayer(wrapA, r.b, r.fail ? "mis" : "clean");
        const B = r.fail ? printLayer(wrapB, r.b, "rerun") : null;
        return { g, shadow, paper, rectA, rectB, A, B };
      };
      // pass sheets first, the caught sheet on top: it lands last
      recs.filter((r) => !r.fail).forEach((r) => (r.view = sheetOf(r, r.i)));
      if (failRec) failRec.view = sheetOf(failRec, failRec.i);
      const ghosts = [0, 1].map(() => svg("rect", { x: -SW / 2, y: -SH / 2, width: SW, height: SH, rx: RAD, fill: mix(C.surface, C.warning, 0.12), stroke: C.warning, "stroke-width": ui.stroke("regular", 1.5), opacity: 0 }, ghostLayer));

      // ---------- machinery over the sheets ----------
      // sm-native-start: the press, inspector and reject arm are the scene's motif; they keep their own weights and corners
      // press: side frames, an ink roller and the plate cylinder the sheet passes under
      [LY - 140, LY + 118].forEach((y) => {
        svg("rect", { x: NX - 66, y, width: 112, height: 22, rx: 5, fill: C.surface, stroke: ink, "stroke-width": 1.5 }, s);
        [NX - 52, NX + 32].forEach((x) => svg("circle", { cx: x, cy: y + 11, r: 3.5, fill: mix(C.ink, C.paper, 0.45) }, s));
      });
      svg("rect", { x: NX - 54, y: LY - 120, width: 16, height: 240, rx: 8, fill: C.ink }, s); // sm-native: a roller is a pill
      svg("rect", { x: NX - 26, y: LY - 124, width: 52, height: 248, rx: 6, fill: "url(#pq-cyl)", stroke: ink, "stroke-width": 1.5 }, s);
      const stripes = Array.from({ length: 10 }, () => svg("rect", { x: 0, y: LY - 118, width: 2, height: 236, fill: mix(C.ink, C.surface, 0.35), opacity: 0 }, s));
      // inspector gantry: a camera bar across the line, with the beam it casts
      const glowA = svg("rect", { x: GX - 70, y: LY - 104, width: 140, height: 208, fill: "url(#pq-glow)", opacity: 0.6 }, s);
      const glowW = svg("rect", { x: GX - 70, y: LY - 104, width: 140, height: 208, fill: "url(#pq-glow-w)", opacity: 0 }, s);
      [LY - 128, LY + 104].forEach((y) => svg("rect", { x: GX - 15, y, width: 30, height: 24, rx: 5, fill: C.surface, stroke: ink, "stroke-width": 1.5 }, s));
      svg("rect", { x: GX - 11, y: LY - 112, width: 22, height: 224, rx: 6, fill: C.ink }, s);
      const lenses = [-66, 0, 66].map((dy) => svg("circle", { cx: GX, cy: LY + dy, r: 5, fill: C.accent }, s));
      // reject arm: hub on the rail past the beam, parked along the top edge of the line
      const arm = svg("g", {}, s);
      svg("path", { d: `M0 -9L${ARM.len - 36} -6L${ARM.len - 36} 6L0 9Z`, fill: C.ink, stroke: ink, "stroke-width": 1.5, "stroke-linejoin": "round" }, arm);
      svg("rect", { x: ARM.len - 40, y: -8, width: 40, height: 16, rx: 8, fill: C.warning, stroke: ink, "stroke-width": 1.5 }, arm); // sm-native: the paddle is a pill
      svg("circle", { cx: ARM.x, cy: ARM.y, r: 22, fill: C.surface, stroke: ink, "stroke-width": 1.5 }, s);
      svg("circle", { cx: ARM.x, cy: ARM.y, r: 8, fill: C.ink }, s);
      // sm-native-end

      // ---------- labels, readout, tally ----------
      const label = (text, x, y) => { const n = el("div", "pq-station", root, text); Object.assign(n.style, { left: x + "px", top: y + "px" }); return n; };
      const st = content.stations || [];
      label(st[0] || "", NX, LY - 176);
      label(st[1] || "", GX, LY - 176);
      label(st[2] || "", SX, LY + 132);
      const chuteLab = el("div", "pq-chute", root, content.chute || "");
      Object.assign(chuteLab.style, { left: (IX + FX) / 2 + "px", top: LY + 2 * R + 14 + "px" });

      const chip = el("div", "pq-chip", root);
      Object.assign(chip.style, { left: GX - 150 + "px", top: LY - 266 + "px" });
      const chipTop = el("div", "pq-chip-top", chip);
      const chipId = el("span", "pq-chip-id", chipTop);
      const chipPill = el("span", "pq-pill", chipTop);
      const chipD = el("div", "pq-chip-d", chip);

      const tally = el("div", "pq-tally", root);
      const tallyN = el("div", "pq-n", tally, "0");
      const row = el("div", "pq-row", tally);
      el("span", "pq-row-l", row, (content.tally && content.tally.passedLabel) || "tests passed");
      el("span", "pq-sep", row, "·");
      const caught = el("span", "pq-caught", row);
      el("i", "", caught);
      const caughtN = el("b", "", caught, "0");
      el("span", "", caught, ((content.tally && content.tally.caughtLabel) || "caught"));
      const floats = recs.map((r) => { const n = txt(s, { x: SX, y: 0, "text-anchor": "middle", opacity: 0 }, "pq-float", `+${r.b.tests}`); return n; });

      // ---------- events the readout shows: each run's result as the sheet clears the beam ----------
      const failMark = failRec ? markAt(failRec.b.tests, failRec.b.failAt) : null;
      const tDet = failRec ? reach(failRec.ts, FX - TX, GX - failMark.x) : Infinity;
      const events = [];
      recs.forEach((r) => {
        if (!r.fail) events.push({ t: reach(r.ts, r.dist, GX + SW / 2), id: r.b.id, kind: "ok", d: `${r.b.tests} of ${r.b.tests} ${unit}` });
        else {
          events.push({ t: tDet, id: r.b.id, kind: "bad", d: `✕ ${r.b.failing}` });
          events.push({ t: reach(tsR, r.dist, GX + SW / 2), id: r.b.id, kind: "rerun", d: `${r.b.tests} of ${r.b.tests} ${unit}` });
        }
      });
      events.sort((a, b) => a.t - b.t);
      const expect = content.tally && content.tally.passed;
      const atStill = recs.filter((r) => r.land <= 8.63).reduce((n, r) => n + r.b.tests, 0);
      if (expect != null && atStill !== expect) console.warn(`press-qa: ${atStill} tests have landed at the still, content says ${expect}`);

      const labels = { passed: status.passed || "Passed", failed: status.failed || "Failed", rerun: status.rerun || "Re-run passed" };
      return { labels, recs, failRec, tF, tM, tsR, tDet, ghosts, pose, stripes, glowA, glowW, lenses, arm, chip, chipId, chipPill, chipD, events, tallyN, tally, caught, caughtN, floats, C, mix };
    },

    render(t, S, h) {
      const { tw, set, text, clamp, lerp } = h;
      const { C } = S;
      // press cylinder: stripes turning at a rate that completes whole stripe periods per loop
      const om = ((2 * Math.PI) / 10) * 78 / D;
      S.stripes.forEach((n, k) => {
        const p = om * t + (k * 2 * Math.PI) / 10, c = Math.cos(p);
        set(n, { x: (NX - 1 + 24 * Math.sin(p)).toFixed(2), opacity: c > 0 ? (0.7 * c).toFixed(3) : 0 });
      });

      // sheets
      let under = 0;
      S.recs.forEach((r) => {
        const v = r.view, P = S.pose(r, t);
        if (P.phase === "hidden" || P.phase === "gone") { set(v.g, { opacity: 0 }); return; }
        set(v.g, { opacity: 1, transform: `translate(${P.x.toFixed(2)} ${P.y.toFixed(2)}) rotate(${P.rot.toFixed(2)}) scale(${(P.sc * (1 + 0.05 * P.lift)).toFixed(4)})` });
        set(v.shadow, { transform: `translate(${(2 + 6 * P.lift).toFixed(2)} ${(3 + 9 * P.lift).toFixed(2)})`, opacity: P.phase === "chute" ? 0 : (0.07 + 0.05 * P.lift).toFixed(3) });
        const onLine = P.phase === "line1" || P.phase === "line2" || P.phase === "hold";
        if (onLine) under = Math.max(under, clamp(1 - Math.abs(P.x - GX) / 120));
        // the print appears where the sheet has passed the nip; a re-press wipes the misprint the same way
        const cut = clamp(NX - P.x, -SW / 2, SW / 2);
        const first = P.phase === "line1" ? cut : -SW / 2;
        if (!r.fail || P.phase !== "line2" && P.phase !== "landed") {
          set(v.rectA, { x: first.toFixed(2), width: (SW / 2 - first).toFixed(2) });
          if (v.B) set(v.rectB, { x: -SW / 2, width: 0 });
        } else {
          const c2 = P.phase === "line2" ? cut : -SW / 2;
          set(v.rectA, { x: -SW / 2, width: (c2 + SW / 2).toFixed(2) });
          set(v.rectB, { x: c2.toFixed(2), width: (SW / 2 - c2).toFixed(2) });
        }
        // marks turn as they clear the beam
        const scanLayer = (L, live) => {
          L.marks.forEach((m) => {
            const done = live ? P.x + m.mx >= GX : true;
            set(m.node, { fill: done ? (m.bad ? C.warning : C.positive) : S.mix(C.ink, C.surface, 0.55) });
          });
          set(L.foot, { opacity: live ? clamp((P.x - SW / 2 - GX) / 40).toFixed(3) : 1 });
        };
        if (!r.fail) scanLayer(v.A, P.phase === "line1");
        else {
          scanLayer(v.A, P.phase === "line1");
          if (P.phase === "line2") scanLayer(v.B, true);
          else if (P.phase === "landed") scanLayer(v.B, false);
          else { v.B.marks.forEach((m) => set(m.node, { fill: S.mix(C.ink, C.surface, 0.55) })); set(v.B.foot, { opacity: 0 }); }
          const red = t >= S.tDet && (P.phase === "line1" || P.phase === "hold" || P.phase === "chute" || (P.phase === "line2" && P.x < NX + SW / 2 - 8));
          set(v.paper, { stroke: red ? C.warning : h.ui.strokeColor(S.mix(C.line, C.ink, 0.25)), "stroke-width": red ? h.ui.stroke("bold", 2.5) : h.ui.stroke("regular", 1.5) });
        }
      });

      // the flick's afterimages
      const tF = S.tF;
      S.ghosts.forEach((g, i) => {
        const tg = t - 0.045 * (i + 1);
        const o = t >= tF + 0.03 && t < tF + 0.6 ? (0.42 - 0.18 * i) * (1 - tw(t, tF + 0.16, 0.3, "soft")) : 0;
        if (o <= 0.002) { set(g, { opacity: 0 }); return; }
        const P = S.pose(S.failRec, Math.max(tg, tF));
        set(g, { opacity: o.toFixed(3), transform: `translate(${P.x.toFixed(2)} ${P.y.toFixed(2)}) rotate(${P.rot.toFixed(2)}) scale(${P.sc.toFixed(4)})` });
      });

      // beam: brighter while a sheet is under it, red from the failing mark until the sheet is gone
      const warn = tw(t, S.tDet, 0.12, "snappy") * (1 - tw(t, tF + 0.45, 0.5, "soft"));
      set(S.glowA, { opacity: ((0.45 + 0.55 * under) * (1 - warn)).toFixed(3) });
      set(S.glowW, { opacity: (warn * (0.6 + 0.4 * under)).toFixed(3) });
      S.lenses.forEach((n) => set(n, { fill: warn > 0.5 ? C.warning : C.accent }));

      // reject arm: a small wind-up, the flick, a slow return
      let ang = ARM.rest;
      ang = lerp(ang, ARM.back, tw(t, tF - 0.3, 0.26, "soft"));
      ang = lerp(ang, ARM.hit, tw(t, tF, 0.2, "snappy"));
      ang = lerp(ang, ARM.rest, tw(t, tF + 0.45, 0.6, "inOut"));
      set(S.arm, { transform: `translate(${ARM.x} ${ARM.y}) rotate(${ang.toFixed(2)})` });

      // readout: the latest result; before the first one in a run, the last one of the previous run
      let ev = null;
      for (const e of S.events) if (e.t <= t) ev = e;
      const fresh = ev ? tw(t, ev.t, 0.35, "snappy") : 1;
      ev = ev || S.events[S.events.length - 1];
      if (ev) {
        text(S.chipId, ev.id);
        if (S.chip.dataset.kind !== ev.kind) S.chip.dataset.kind = ev.kind;
        text(S.chipPill, ev.kind === "bad" ? S.labels.failed : ev.kind === "rerun" ? S.labels.rerun : S.labels.passed);
        text(S.chipD, ev.d);
        S.chipD.style.opacity = (0.35 + 0.65 * fresh).toFixed(3);
        S.chipD.style.transform = `translateY(${((1 - fresh) * 6).toFixed(2)}px)`;
      }

      // tally: the tests on every sheet that has landed; cleared while the stack ships
      const live = t < SHIP + 0.5;
      let passed = 0, lastLand = -1;
      if (live) S.recs.forEach((r) => { if (t >= r.land) { passed += r.b.tests; lastLand = Math.max(lastLand, r.land); } });
      text(S.tallyN, String(passed));
      const bump = lastLand >= 0 ? 1 - tw(t, lastLand, 0.4, "snappy") : 0;
      S.tallyN.style.transform = `translateY(${(-6 * bump).toFixed(2)}px)`;
      S.tally.style.opacity = (live ? 1 - tw(t, SHIP, 0.45, "soft") : tw(t, SHIP + 0.6, 0.5, "soft")).toFixed(3);
      const isCaught = live && t >= tF;
      text(S.caughtN, isCaught ? "1" : "0");
      S.caught.classList.toggle("on", isCaught);
      S.recs.forEach((r, i) => {
        const n = S.floats[i];
        const o = tw(t, r.land, 0.2, "soft") * (1 - tw(t, r.land + 0.55, 0.4, "soft"));
        set(n, { opacity: o.toFixed(3), y: (r.target.y - SH / 2 - 26 - 22 * tw(t, r.land, 0.9, "signature")).toFixed(2) });
      });
    },
  });
})();
