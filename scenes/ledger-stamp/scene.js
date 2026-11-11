/* ledger-stamp: trust given an action, not a shield icon (SVG + DOM).
 * Payments ride an indexed belt through three stations: a scanner checks each against policy, a press
 * stamps it approved, then it is signed and a seal is pressed onto it before it leaves for the audit
 * trail. A payment that breaks policy is stamped HELD in the warning colour and waits for a second
 * approver instead of being sealed.
 *
 * The belt moves one pitch per step (move, then dwell) and the step length is D / docs, so after one loop
 * every document has moved on by exactly the length of the list: document i at t + D looks like document
 * i − N at t. Each document's marks are functions of the times it reached each station, never of state,
 * so any frame can be seeked and frame D equals frame 0.
 *
 * content.legible: true re-typesets the scene for a page that shows it ~1200 px wide: three larger cards
 * (2 checks each), a larger trail with 3–4 rows, every word at 15 px or more (focal text 24 px or more),
 * corners from the tokens, no shadows. content.showCopy: false drops the heading block; under legible the
 * freed space goes to a bigger belt, bigger cards and a taller trail (the "stage" layout). Both default off,
 * and the default layout is untouched.
 */
(function () {
  const W = 1600, H = 900, D = 12;
  const X0 = 790, PITCH = 230, DW = 188, DH = 268, BELT_Y = 650, TOP = BELT_Y - DH / 2;
  const MOVE = 0.55; // seconds of each step spent moving; the rest is the dwell when stations act
  const RAIL = 334, REST = 432;
  // the default geometry, as render reads it (setupLegible returns its own)
  const NATIVE = { k: 1, PITCH, DW, DH, TOP, REST, RAIL, RH: 38, ROWS: 4, stamp: [84, 190], seal: [152, 236], head2: 27, head3: 33,
    scan: { bar: 12, glow: 34 }, tick: { x0: 664, gap: 46, y1: BELT_Y - 145, y2: BELT_Y + 138, len: 7 } };

  const hashOf = (str) => { let x = 2166136261; for (const ch of str) x = Math.imul(x ^ ch.charCodeAt(0), 16777619) >>> 0; return x.toString(16).padStart(8, "0").slice(0, 4); };
  const sigOf = (rng, seed) => {
    const R = rng(seed);
    let x = 0, d = `M0 ${(R() * 6).toFixed(1)}`;
    while (x < 86) {
      const nx = x + 10 + R() * 12, up = -6 - R() * 10, dn = 4 + R() * 6;
      d += ` C${(x + 4).toFixed(1)} ${up.toFixed(1)} ${(nx - 8).toFixed(1)} ${up.toFixed(1)} ${(nx - 3).toFixed(1)} ${(dn * 0.3).toFixed(1)}`;
      d += ` S${(nx + 2).toFixed(1)} ${dn.toFixed(1)} ${nx.toFixed(1)} ${(dn * 0.5).toFixed(1)}`;
      x = nx;
    }
    return d;
  };

  // ---------- legible layout (content.legible) ----------
  // Cards are drawn at a base size (280 × 400) and scaled by G.k, so the stage layout is the same card, bigger.
  function legibleGeom(stage) {
    // stage: same type at 1.1x on a narrower card, so all three stations still fit one 960-wide phone crop
    const k = stage ? 1.1 : 1, BW = stage ? 262 : 280;
    const DW = BW * k, DH = 400 * k, PITCH = stage ? 322 : 320;
    const X3 = 1440, X0 = X3 - 3 * PITCH;
    const TOP = stage ? 318 : 340, RAIL = stage ? 96 : 120, REST = stage ? 236 : 250;
    const CLIP = X0 + PITCH - DW / 2 - 20; // the feeder mouth: a card at station 0 sits wholly behind it
    return {
      stage, k, BW, DW, DH, PITCH, X0, TOP, RAIL, REST, CLIP,
      RH: stage ? 134 : 82, ROWS: stage ? 4 : 3,
      stamp: [BW / 2 - 4, 282], seal: [BW - 50, 356], head2: 36, head3: 46,
      scan: { bar: 14, glow: 44 },
      tick: { x0: CLIP - 16, gap: PITCH / 8, y1: TOP - 18, y2: TOP + DH + 10, len: 8 },
      log: stage ? { left: 40, top: RAIL - 12, width: CLIP - 84 - 64, bottom: TOP + DH + 22 }
                 : { left: 48, top: 404, width: CLIP - 84 - 74, bottom: TOP + DH + 22 },
    };
  }

  function setupLegible({ root, content, tokens, h }) {
    const { el, svg, mix, rng, ui } = h;
    const C = tokens.color, ink = ui.strokeColor(C.stroke || C.ink);
    const OUT = ui.stroke("regular", 1.5);
    const rad = (size, fallback) => Math.min(3, tokens.radius?.[size] ?? fallback); // corners stay <= 3
    const showCopy = content.showCopy !== false;
    const G = legibleGeom(!showCopy);
    const { k, DW, DH, PITCH, TOP, RAIL, REST, CLIP } = G;
    root.classList.add("ls", "ls-L");
    if (G.stage) root.classList.add("ls-L-stage");
    const docs = content.docs;
    const N = docs.length, STEP = D / N;
    const X = (p) => G.X0 + p * PITCH;

    if (showCopy) {
      const copy = el("div", "ls-copy ls-L-copy", root);
      el("div", "ls-eyebrow", copy, content.eyebrow || "");
      el("div", "ls-h", copy, content.heading || "");
      el("div", "ls-sub", copy, content.sub || "");
    }

    const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "ls-svg" }, root);
    const defs = svg("defs", {}, s);
    const clip = svg("clipPath", { id: "ls-clip" }, defs);
    svg("rect", { x: CLIP, y: 0, width: W - CLIP, height: H }, clip);
    const glow = svg("linearGradient", { id: "ls-glow", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    svg("stop", { offset: 0, "stop-color": C.accent, "stop-opacity": 0.28 }, glow); // light enough that muted text under the beam still reads at AA
    svg("stop", { offset: 1, "stop-color": C.accent, "stop-opacity": 0 }, glow);

    // belt (ticks travel with it), then the cards, then the feeder over the belt's mouth
    svg("rect", { x: CLIP - 40, y: TOP - 22, width: W - CLIP + 80, height: DH + 44, rx: ui.radius("lg", rad("lg", 3)), fill: mix(C.paper, C.ink, 0.05), ...ui.strokeAttrs("regular", 1.5, C.line) }, s);
    // sm-native: the ticks show the belt's travel, part of the indexed-belt motif
    const ticks = svg("path", { stroke: mix(C.paper, C.ink, 0.22), "stroke-width": 2, "stroke-linecap": "round", fill: "none" }, s);
    const docLayer = svg("g", { "clip-path": "url(#ls-clip)" }, s);
    svg("rect", { x: CLIP - 84, y: TOP - 34, width: 92, height: DH + 68, rx: ui.radius("md", rad("md", 3)), fill: C.surface, stroke: ink, "stroke-width": OUT }, s);
    svg("rect", { x: CLIP, y: TOP + 20, width: 8, height: DH - 40, rx: rad("sm", 2), fill: mix(C.paper, C.ink, 0.6) }, s);
    for (let r = 0; r < 3; r++) svg("rect", { x: CLIP - 66, y: TOP + 26 + r * 18, width: 52, height: 7, rx: rad("sm", 2), fill: mix(C.paper, C.ink, 0.12) }, s);
    const feeder = el("div", "ls-feeder ls-L-feeder", root, content.feeder || "Queue");
    Object.assign(feeder.style, { left: CLIP - 38 + "px", top: TOP + DH + 46 + "px" });

    // ---------- cards (a pool, rebound as the belt moves), drawn at base size ----------
    const { BW } = G, BH = 400;
    const txt = (parent, attrs, cls, value = "") => { const n = svg("text", { ...attrs, class: cls }, parent); n.textContent = value; return n; };
    const pool = Array.from({ length: 7 }, () => {
      const g = svg("g", {}, docLayer);
      svg("rect", { x: 0, y: 0, width: BW, height: BH, rx: ui.radius("sm", rad("sm", 2)) / k, fill: C.surface, stroke: ink, "stroke-width": OUT / k }, g);
      const type = txt(g, { x: 20, y: 38 }, "ls-L-type");
      const ref = txt(g, { x: BW - 20, y: 38, "text-anchor": "end" }, "ls-L-type");
      svg("line", { x1: 20, x2: BW - 20, y1: 54, y2: 54, stroke: C.line, "stroke-width": ui.stroke("hair", 1) }, g);
      const payee = txt(g, { x: 20, y: 92 }, "ls-L-payee");
      const amount = txt(g, { x: 20, y: 142 }, "ls-L-amount");
      const rows = [0, 1].map((r) => {
        const y = 190 + r * 36;
        const box = svg("rect", { x: 20, y: y - 17, width: 22, height: 22, rx: Math.min(6, ui.radius("sm", rad("sm", 2))), fill: "none", stroke: C.faint || C.line, "stroke-width": ui.stroke("fine", 1.6) }, g);
        // sm-native: a check mark is a glyph, drawn at the weight that reads at its size
        const mark = svg("path", { d: "", fill: "none", "stroke-width": 1.6, "stroke-linecap": "round", "stroke-linejoin": "round", transform: `translate(20 ${y - 17}) scale(${22 / 12})` }, g);
        const label = txt(g, { x: 54, y: y + 1 }, "ls-L-check");
        return { box, mark, label };
      });
      svg("line", { x1: 20, x2: 160, y1: 370, y2: 370, stroke: C.faint || C.line, "stroke-width": ui.stroke("hair", 1) }, g);
      const sig = svg("path", { d: "", fill: "none", stroke: ink, "stroke-width": ui.stroke("regular", 1.6) / 1.25, "stroke-linecap": "round", pathLength: 1, "stroke-dasharray": 1, transform: "translate(26 356) scale(1.25)" }, g);
      const signer = txt(g, { x: 20, y: 391 }, "ls-L-signer");
      const stamp = svg("g", {}, g);
      // sm-native: the rubber stamp is the scene's motif and keeps its own weight
      const stampRect = svg("rect", { x: -108, y: -30, width: 216, height: 60, rx: rad("sm", 2), fill: "none", "stroke-width": 3.4 }, stamp);
      const stampText = txt(stamp, { x: 0, y: 3, "text-anchor": "middle" }, "ls-L-stamp");
      const stampDate = txt(stamp, { x: 0, y: 22, "text-anchor": "middle" }, "ls-L-stamp-date", content.stampDate || "");
      const seal = svg("g", {}, g);
      svg("circle", { r: 40, fill: C.accentFill || C.accent, stroke: ink, "stroke-width": OUT }, seal);
      svg("circle", { r: 34.5, fill: "none", stroke: C.onAccent || C.paper, "stroke-width": ui.stroke("hair", 1.2), "stroke-dasharray": "2.4 3", opacity: 0.8 }, seal);
      txt(seal, { x: 0, y: 0, "text-anchor": "middle" }, "ls-L-seal", content.seal || "SEALED");
      const sealHash = txt(seal, { x: 0, y: 18, "text-anchor": "middle" }, "ls-L-seal-hash");
      const held = svg("g", { transform: "translate(20 368)" }, g);
      svg("rect", { x: 0, y: -24, width: BW - 40, height: 38, rx: ui.radius("sm", rad("sm", 2)), fill: mix(C.surface, C.warning, 0.18) }, held);
      txt(held, { x: 14, y: 1 }, "ls-L-held", content.heldNote || "Waiting for approver");
      return { g, type, ref, payee, amount, rows, sig, signer, stamp, stampRect, stampText, stampDate, seal, sealHash, held, bound: null };
    });
    const info = docs.map((d, i) => ({ ...d, hash: hashOf(d.ref + d.amount), sig: sigOf(rng, 31 + i * 17) }));

    // ---------- stations: a rail, a scanner, a stamp press, a seal press; names under the belt ----------
    // sm-native-start: the press machinery is the scene's motif; it keeps its own weights and corners in every look
    svg("rect", { x: X(1) - DW / 2 - 30, y: RAIL - 12, width: W - X(1) + DW / 2 + 60, height: 14, rx: rad("sm", 2), fill: C.ink }, s);
    (content.stations || []).forEach((name, n) => {
      const lab = el("div", "ls-station ls-L-station", root);
      el("span", "ls-n ls-L-n", lab, String(n + 1).padStart(2, "0"));
      el("span", "", lab, name);
      Object.assign(lab.style, { left: X(n + 1) + "px", top: TOP + DH + 40 + "px" });
    });
    const sleeve = (x) => svg("rect", { x: x - 14, y: RAIL, width: 28, height: 56, rx: rad("sm", 2), fill: mix(C.ink, C.paper, 0.25) }, s);
    const rod = (x) => svg("rect", { x: x - 4, y: RAIL, width: 8, height: 10, rx: rad("sm", 2), fill: mix(C.ink, C.paper, 0.55) }, s);
    const x1 = X(1);
    const scanGlow = svg("rect", { x: x1 - DW / 2 - 4, y: 0, width: DW + 8, height: G.scan.glow, fill: "url(#ls-glow)" }, s);
    const rod1 = rod(x1); sleeve(x1);
    const scanBar = svg("rect", { x: x1 - DW / 2 - 20, y: 0, width: DW + 40, height: G.scan.bar, rx: rad("sm", 2), fill: C.ink }, s);
    const scanLine = svg("rect", { x: x1 - DW / 2 - 4, y: 0, width: DW + 8, height: 3, fill: C.accent }, s);
    const x2 = X(2) - DW / 2 + G.stamp[0] * k;
    const rod2 = rod(x2); sleeve(x2);
    const head2 = svg("g", {}, s);
    svg("rect", { x: -122, y: -36, width: 244, height: 72, rx: rad("sm", 2), fill: C.ink }, head2);
    const pad2 = svg("rect", { x: -114, y: 28, width: 228, height: 7, rx: rad("sm", 2), fill: C.accent }, head2);
    const x3 = X(3) - DW / 2 + G.seal[0] * k;
    const rod3 = rod(x3); sleeve(x3);
    const head3 = svg("g", {}, s);
    svg("circle", { r: 46, fill: C.ink }, head3);
    svg("circle", { r: 34, fill: "none", stroke: C.accent, "stroke-width": 3.5 }, head3);
    // sm-native-end

    // ---------- the trail: two-line rows (action, then id and status) ----------
    const log = el("div", "ls-log ls-L-log", root);
    Object.assign(log.style, { left: G.log.left + "px", top: G.log.top + "px", width: G.log.width + "px", height: G.log.bottom - G.log.top + "px" });
    const lh = el("div", "ls-log-head ls-L-head", log);
    const lt = el("div", "ls-L-title", lh);
    el("i", "ls-live", lt);
    el("span", "", lt, content.logTitle || "Audit trail");
    el("div", "ls-L-stat", lh, content.logStat || "");
    const rowsBox = el("div", "ls-rows ls-L-rows", log);
    rowsBox.style.height = G.ROWS * G.RH + "px";
    const logRows = Array.from({ length: 6 }, () => {
      const r = el("div", "ls-L-row", rowsBox);
      r.style.height = G.RH + "px";
      const amt = el("span", "ls-L-act", r);
      const meta = el("div", "ls-L-meta", r);
      return { r, amt, ref: el("span", "ls-ref ls-L-ref", meta), st: el("span", "ls-st ls-L-st", meta), bound: null };
    });
    return { G, N, STEP, X, pool, info, ticks, scanGlow, scanBar, scanLine, rod1, rod2, rod3, head2, pad2, shadow2: null, head3, shadow3: null, x1, x2, x3, logRows, content, C };
  }

  SiteMotion.scene({
    width: W,
    height: H,
    loop: 0,
    duration: D,
    still: 7.45,
    setup({ root, content, tokens, h }) {
      const { el, svg, mix, rng, ui } = h;
      if (content.legible) return setupLegible({ root, content, tokens, h });
      const C = tokens.color, ink = ui.strokeColor(C.stroke || C.ink);
      // outlines and corners of the belt, feeder, documents and seal follow the style pack; the rubber stamp and
      // the press machinery keep their own weights, because they are the scene's motif
      const OUT = ui.stroke("regular", 1.5);
      root.classList.add("ls");
      const docs = content.docs;
      const N = docs.length, STEP = D / N;
      const X = (p) => X0 + p * PITCH;

      if (content.showCopy !== false) {
        const copy = el("div", "ls-copy", root);
        el("div", "ls-eyebrow", copy, content.eyebrow || "");
        el("div", "ls-h", copy, content.heading || "");
        el("div", "ls-sub", copy, content.sub || "");
      }

      const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "ls-svg" }, root);
      const defs = svg("defs", {}, s);
      const clip = svg("clipPath", { id: "ls-clip" }, defs);
      svg("rect", { x: 690, y: 0, width: W - 690, height: H }, clip);
      const glow = svg("linearGradient", { id: "ls-glow", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
      svg("stop", { offset: 0, "stop-color": C.accent, "stop-opacity": 0.28 }, glow); // light enough that muted text under the beam still reads at AA
      svg("stop", { offset: 1, "stop-color": C.accent, "stop-opacity": 0 }, glow);

      // the belt, with tick marks that travel with it
      svg("rect", { x: 650, y: BELT_Y - 152, width: W - 600, height: 304, rx: ui.radius("lg", 18), fill: mix(C.paper, C.ink, 0.05), ...ui.strokeAttrs("regular", 1.5, C.line) }, s);
      // sm-native: the ticks show the belt's travel, part of the indexed-belt motif
      const ticks = svg("path", { stroke: mix(C.paper, C.ink, 0.22), "stroke-width": 2, "stroke-linecap": "round", fill: "none" }, s);
      const docLayer = svg("g", { "clip-path": "url(#ls-clip)" }, s);
      // the feeder the queue slides out of
      svg("rect", { x: 604, y: BELT_Y - 166, width: 88, height: 332, rx: ui.radius("md", 14), fill: C.surface, stroke: ink, "stroke-width": OUT }, s);
      svg("rect", { x: 684, y: BELT_Y - 128, width: 8, height: 256, rx: 4, fill: mix(C.paper, C.ink, 0.6) }, s);
      for (let k = 0; k < 3; k++) svg("rect", { x: 620, y: BELT_Y - 120 + k * 14, width: 50, height: 6, rx: 3, fill: mix(C.paper, C.ink, 0.12) }, s);
      const feeder = el("div", "ls-feeder", root, content.feeder || "Queue");
      Object.assign(feeder.style, { left: "648px", top: BELT_Y + 178 + "px" });

      // ---------- documents (a pool, rebound as the belt moves) ----------
      const hash = hashOf, sigPath = (seed) => sigOf(rng, seed);
      const txt = (parent, attrs, cls, value = "") => { const n = svg("text", { ...attrs, class: cls }, parent); n.textContent = value; return n; };
      const pool = Array.from({ length: 7 }, () => {
        const g = svg("g", {}, docLayer);
        svg("rect", { x: 0, y: 0, width: DW, height: DH, rx: ui.radius("sm", tokens.radius?.sm ?? 6), fill: C.surface, stroke: ink, "stroke-width": OUT }, g);
        const type = txt(g, { x: 14, y: 25 }, "ls-d-type");
        const ref = txt(g, { x: DW - 14, y: 25, "text-anchor": "end" }, "ls-d-type");
        svg("line", { x1: 14, x2: DW - 14, y1: 36, y2: 36, stroke: C.line, "stroke-width": ui.stroke("hair", 1) }, g);
        const payee = txt(g, { x: 14, y: 58 }, "ls-d-payee");
        const amount = txt(g, { x: 14, y: 90 }, "ls-d-amount");
        const rows = [0, 1, 2].map((r) => {
          const y = 114 + r * 19;
          const box = svg("rect", { x: 14, y: y - 10, width: 12, height: 12, rx: Math.min(4, ui.radius("sm", 3)), fill: "none", stroke: C.faint || C.line, "stroke-width": ui.stroke("fine", 1.2) }, g);
          // sm-native: a check mark is a glyph, drawn at the weight that reads at its size
          const mark = svg("path", { d: "", fill: "none", "stroke-width": 1.8, "stroke-linecap": "round", "stroke-linejoin": "round", transform: `translate(14 ${y - 10})` }, g);
          const label = txt(g, { x: 34, y: y + 0.5 }, "ls-d-check");
          return { box, mark, label };
        });
        svg("line", { x1: 14, x2: 122, y1: 240, y2: 240, stroke: C.faint || C.line, "stroke-width": ui.stroke("hair", 1) }, g);
        const sig = svg("path", { d: "", fill: "none", stroke: ink, "stroke-width": ui.stroke("regular", 1.6), "stroke-linecap": "round", pathLength: 1, "stroke-dasharray": 1, transform: "translate(20 230)" }, g);
        const signer = txt(g, { x: 14, y: 256 }, "ls-d-signer");
        const stamp = svg("g", {}, g);
        // sm-native: the rubber stamp is the scene's motif and keeps its own weight and corners
        const stampRect = svg("rect", { x: -62, y: -21, width: 124, height: 42, rx: 6, fill: "none", "stroke-width": 2.6 }, stamp);
        const stampText = txt(stamp, { x: 0, y: 4, "text-anchor": "middle" }, "ls-stamp");
        const stampDate = txt(stamp, { x: 0, y: 16, "text-anchor": "middle" }, "ls-stamp-date", content.stampDate || "");
        const seal = svg("g", {}, g);
        svg("circle", { r: 26, fill: C.accentFill || C.accent, stroke: ink, "stroke-width": OUT }, seal);
        svg("circle", { r: 21, fill: "none", stroke: C.onAccent || C.paper, "stroke-width": ui.stroke("hair", 1), "stroke-dasharray": "2 2.6", opacity: 0.8 }, seal);
        txt(seal, { x: 0, y: -1, "text-anchor": "middle" }, "ls-seal", content.seal || "SEALED");
        const sealHash = txt(seal, { x: 0, y: 9, "text-anchor": "middle" }, "ls-seal-hash");
        const held = svg("g", { transform: "translate(14 236)" }, g);
        svg("rect", { x: 0, y: -13, width: 124, height: 22, rx: 11, fill: mix(C.surface, C.warning, 0.18) }, held);
        txt(held, { x: 11, y: 2 }, "ls-held", content.heldNote || "Waiting for approver");
        return { g, type, ref, payee, amount, rows, sig, signer, stamp, stampRect, stampText, stampDate, seal, sealHash, held, bound: null };
      });
      const info = docs.map((d, i) => ({ ...d, hash: hash(d.ref + d.amount), sig: sigPath(31 + i * 17) }));

      // ---------- stations: a rail, a scanner, a stamp press, a seal press ----------
      // sm-native-start: the press machinery is the scene's motif; it keeps its own weights and corners in every look
      svg("rect", { x: X(1) - 130, y: RAIL - 10, width: X(3) - X(1) + 260, height: 12, rx: 6, fill: C.ink }, s);
      (content.stations || []).forEach((name, k) => {
        const lab = el("div", "ls-station", root);
        el("span", "ls-n", lab, String(k + 1).padStart(2, "0"));
        el("span", "", lab, name);
        Object.assign(lab.style, { left: X(k + 1) + "px", top: RAIL - 64 + "px" });
      });
      const sleeve = (x) => svg("rect", { x: x - 11, y: RAIL, width: 22, height: 44, rx: 4, fill: mix(C.ink, C.paper, 0.25) }, s);
      const rod = (x) => svg("rect", { x: x - 3, y: RAIL, width: 6, height: 10, rx: 3, fill: mix(C.ink, C.paper, 0.55) }, s);
      // scanner (station 1)
      const x1 = X(1);
      const scanGlow = svg("rect", { x: x1 - DW / 2 - 4, y: 0, width: DW + 8, height: 34, fill: "url(#ls-glow)" }, s);
      const rod1 = rod(x1); sleeve(x1);
      const scanBar = svg("rect", { x: x1 - DW / 2 - 16, y: 0, width: DW + 32, height: 12, rx: 6, fill: C.ink }, s);
      const scanLine = svg("rect", { x: x1 - DW / 2 - 4, y: 0, width: DW + 8, height: 2.5, fill: C.accent }, s);
      // stamp press (station 2): its head lands on the stamp area of the document below
      const x2 = X(2) - DW / 2 + 84;
      const shadow2 = svg("ellipse", { cx: x2, cy: TOP + 190, rx: 74, ry: 30, fill: C.ink, opacity: 0 }, s);
      const rod2 = rod(x2); sleeve(x2);
      const head2 = svg("g", {}, s);
      svg("rect", { x: -70, y: -27, width: 140, height: 54, rx: 9, fill: C.ink }, head2);
      const pad2 = svg("rect", { x: -64, y: 19, width: 128, height: 6, rx: 3, fill: C.accent }, head2);
      // seal press (station 3)
      const x3 = X(3) - DW / 2 + 152;
      const shadow3 = svg("ellipse", { cx: x3, cy: TOP + 236, rx: 36, ry: 22, fill: C.ink, opacity: 0 }, s);
      const rod3 = rod(x3); sleeve(x3);
      const head3 = svg("g", {}, s);
      svg("circle", { r: 33, fill: C.ink }, head3);
      svg("circle", { r: 24, fill: "none", stroke: C.accent, "stroke-width": 3 }, head3);
      // sm-native-end

      // ---------- the audit trail ----------
      const log = el("div", "ls-log", root);
      const lh = el("div", "ls-log-head", log);
      el("i", "ls-live", lh);
      el("span", "", lh, content.logTitle || "Audit trail");
      el("span", "ls-log-stat", lh, content.logStat || "");
      const rowsBox = el("div", "ls-rows", log);
      const logRows = Array.from({ length: 6 }, () => {
        const r = el("div", "ls-row", rowsBox);
        return { r, ref: el("span", "ls-ref", r), amt: el("span", "ls-amt", r), st: el("span", "ls-st", r), bound: null };
      });
      return { N, STEP, X, pool, info, ticks, scanGlow, scanBar, scanLine, rod1, rod2, rod3, head2, pad2, shadow2, head3, shadow3, x1, x2, x3, logRows, content, C };
    },

    render(t, S, h) {
      const { ease, clamp, lerp } = h;
      const { N, STEP, X, C } = S;
      const G = S.G || NATIVE;
      const { PITCH, DW, DH, TOP, REST, RAIL } = G;
      const k = Math.floor(t / STEP + 1e-9);
      const q = k + ease.inOut(clamp((t - k * STEP) / MOVE));
      const tau = t - k * STEP - MOVE; // time into this step's dwell (negative while the belt moves)
      // document i sits at station s once the belt has made step i + s, i.e. during the dwell of step i + s − 1
      const at = (i, station) => (i + station - 1) * STEP + MOVE;
      const ci = (i) => ((i % N) + N) % N;

      // belt ticks travel with the documents (period PITCH/5, so whole pitches leave them in place)
      const TK = G.tick;
      const off = (((q * PITCH) % TK.gap) + TK.gap) % TK.gap;
      let d = "";
      for (let x = TK.x0 + off; x < W; x += TK.gap) d += `M${x.toFixed(1)} ${TK.y1}v${TK.len}M${x.toFixed(1)} ${TK.y2}v${TK.len}`;
      S.ticks.setAttribute("d", d);

      // documents
      const iLo = Math.ceil(q - 4.7), iHi = Math.floor(q + 1);
      const used = new Set();
      for (let i = iLo; i <= iHi; i++) {
        const slot = ((i % 7) + 7) % 7;
        const P = S.pool[slot];
        used.add(slot);
        const doc = S.info[ci(i)];
        const held = !!doc.held;
        if (P.bound !== i) {
          P.bound = i;
          P.type.textContent = doc.type.toUpperCase();
          P.ref.textContent = doc.ref;
          P.payee.textContent = doc.payee;
          P.amount.textContent = doc.amount;
          const checks = S.content.checks || [];
          P.rows.forEach((r, n) => { r.label.textContent = n === 0 && held ? S.content.heldCheck || "Over limit" : checks[n] || ""; });
          P.sig.setAttribute("d", doc.sig);
          P.signer.textContent = S.content.signer || "";
          P.stampText.textContent = held ? S.content.stampHeld || "HELD" : S.content.stampOk || "APPROVED";
          // the stamp is one ink, in the colour's text shade so its words read at AA
          const col = held ? C.warningText || C.warning : C.accentText || C.accent;
          P.stampRect.setAttribute("stroke", col);
          P.stampText.setAttribute("fill", col);
          P.stampDate.setAttribute("fill", col);
          P.sealHash.textContent = doc.hash;
        }
        const p = q - i;
        P.g.setAttribute("transform", `translate(${(X(p) - DW / 2).toFixed(1)} ${TOP})${G.k === 1 ? "" : ` scale(${G.k})`}`);
        // station 1: the scanner ticks each check as it passes that row
        const t1 = at(i, 1);
        P.rows.forEach((r, n) => {
          const on = clamp((t - (t1 + 0.18 + n * 0.17)) / 0.12);
          const bad = held && n === 0;
          r.mark.setAttribute("d", on <= 0 ? "" : bad ? "M3 3L9 9M9 3L3 9" : "M2.5 6.5L5 9L9.8 3.2");
          r.mark.setAttribute("stroke", bad ? C.warning : C.positive);
          r.mark.setAttribute("opacity", on.toFixed(3));
          r.box.setAttribute("stroke", on > 0.5 ? (bad ? C.warning : C.positive) : C.faint || C.line);
          r.label.setAttribute("opacity", (0.55 + 0.45 * on).toFixed(3));
        });
        // station 2: the stamp lands at contact, slightly oversized, and settles
        const c2 = at(i, 2) + 0.2;
        const sv = clamp((t - c2) / 0.14);
        P.stamp.setAttribute("opacity", t < c2 ? 0 : 0.92);
        P.stamp.setAttribute("transform", `translate(${G.stamp[0]} ${G.stamp[1]}) rotate(-6) scale(${(1.12 - 0.12 * ease.snappy(sv)).toFixed(3)})`);
        // station 3: signed, then sealed (or held: a note instead of a signature and a seal)
        const t3 = at(i, 3);
        const sig = held ? 0 : ease.inOut(clamp((t - t3 - 0.02) / 0.4));
        P.sig.setAttribute("stroke-dashoffset", (1 - sig).toFixed(4));
        P.sig.setAttribute("opacity", sig > 0 ? 1 : 0);
        P.signer.setAttribute("opacity", (0.7 * clamp((t - t3 - 0.1) / 0.2) * (held ? 0 : 1)).toFixed(3));
        const c3 = t3 + 0.55;
        const seal = held ? 0 : clamp((t - c3) / 0.14);
        P.seal.setAttribute("opacity", t < c3 || held ? 0 : 1);
        P.seal.setAttribute("transform", `translate(${G.seal[0]} ${G.seal[1]}) scale(${(1.15 - 0.15 * ease.snappy(seal)).toFixed(3)})`);
        P.held.setAttribute("opacity", (held ? clamp((t - t3 - 0.05) / 0.25) : 0).toFixed(3));
      }
      S.pool.forEach((P, n) => { if (!used.has(n)) { P.g.setAttribute("transform", "translate(-400 0)"); P.bound = null; } });

      // heads: each acts during the dwell on whichever document is under it
      const docAt = (station) => S.info[ci(k + 1 - station)];
      const press = (down, hold, up) => {
        if (tau < down[0]) return 0;
        if (tau < down[1]) return Math.pow((tau - down[0]) / (down[1] - down[0]), 2); // accelerates into the paper
        if (tau < hold) return 1;
        return 1 - ease.inOut(clamp((tau - hold) / (up - hold)));
      };
      // scanner sweeps the document top to bottom, then lifts back to rest while the belt moves
      const sweep = tau < 0 ? 0 : tau < 0.75 ? ease.inOut(clamp((tau - 0.04) / 0.62)) : 1 - ease.inOut(clamp((tau - 0.75) / 0.2));
      const live = tau >= 0 && tau < 0.75 ? 1 : tau >= 0.75 ? 1 - clamp((tau - 0.75) / 0.15) : 0;
      const sy = lerp(REST, TOP + DH - 6, sweep);
      const bh = G.scan.bar / 2;
      S.scanBar.setAttribute("y", (sy - bh).toFixed(1));
      S.scanLine.setAttribute("y", (sy + bh).toFixed(1));
      S.scanLine.setAttribute("opacity", live.toFixed(3));
      S.scanGlow.setAttribute("y", (sy - G.scan.glow + 4).toFixed(1));
      S.scanGlow.setAttribute("opacity", (live * clamp((sy - TOP + 20) / 40)).toFixed(3));
      S.rod1.setAttribute("height", Math.max(10, sy - bh - RAIL).toFixed(1));

      const d2 = press([0.06, 0.2], 0.3, 0.72);
      const y2 = lerp(REST, TOP + G.stamp[1] * G.k, d2);
      S.head2.setAttribute("transform", `translate(${S.x2} ${y2.toFixed(1)}) scale(${(G.k * (1.06 - 0.06 * d2)).toFixed(3)})`);
      S.rod2.setAttribute("height", Math.max(10, y2 - G.head2 * G.k - RAIL).toFixed(1));
      S.pad2.setAttribute("fill", docAt(2).held && tau >= 0 ? C.warning : C.accent);
      if (S.shadow2) S.shadow2.setAttribute("opacity", (0.16 * clamp((d2 - 0.55) / 0.45)).toFixed(3));

      const d3 = docAt(3).held ? 0 : press([0.42, 0.55], 0.64, 0.95);
      const y3 = lerp(REST, TOP + G.seal[1] * G.k, d3);
      S.head3.setAttribute("transform", `translate(${S.x3} ${y3.toFixed(1)}) scale(${(G.k * (1.06 - 0.06 * d3)).toFixed(3)})`);
      S.rod3.setAttribute("height", Math.max(10, y3 - G.head3 * G.k - RAIL).toFixed(1));
      if (S.shadow3) S.shadow3.setAttribute("opacity", (0.16 * clamp((d3 - 0.55) / 0.45)).toFixed(3));

      // audit trail: a row lands as each document leaves the seal station
      const L = (i) => at(i, 3) + STEP - MOVE + 0.05; // the moment the belt starts carrying it away
      const iMax = Math.floor((t - 0.05) / STEP) - 3;
      const pushIn = ease.inOut(clamp((t - L(iMax)) / 0.3));
      S.logRows.forEach((row, r) => {
        const i = iMax - r;
        const doc = S.info[ci(i)];
        if (row.bound !== i) {
          row.bound = i;
          row.ref.textContent = doc.ref;
          row.amt.textContent = S.G ? doc.log || `${doc.type} · ${doc.amount}` : doc.amount;
          row.st.textContent = doc.held ? S.content.logHeld || "held · 2nd approver" : `${S.content.logOk || "sealed"} · ${doc.hash}`;
          row.st.dataset.kind = doc.held ? "held" : "ok";
        }
        const y = (r - 1 + pushIn) * G.RH;
        const op = r === 0 ? pushIn : r >= G.ROWS ? 1 - clamp(r - G.ROWS + pushIn) : 1;
        row.r.style.transform = `translateY(${y.toFixed(1)}px)`;
        row.r.style.opacity = op.toFixed(3);
      });
    },
  });
})();
