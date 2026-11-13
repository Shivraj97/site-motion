/* ledger-stamp--hero: one payment, close up (SVG + DOM).
 * The parent's belt of small cards becomes one large payment document on a short pile, its amount at display
 * size. In turn: its checks tick, the stamp press slams APPROVED onto it (a short, heavy press with a small
 * squash; the inked impression is left slightly rotated, like a real stamp), the approver's signature writes
 * itself and a seal is pressed. Then the finished document slides off and the next one rises from the pile.
 *
 * One document per period P = D / docs. Document i is on top during period i; every mark on it is a function of
 * u = t − i·P, never of state, and the pile is index arithmetic (document i at t + D looks like document
 * i − N at t), so any frame can be seeked and frame D equals frame 0.
 */
(function () {
  const W = 1600, H = 900, D = 12;
  const DX = 840, DY = 150, DW = 640, DH = 660; // the top document
  const STAMP = [430, 420], SEAL = [530, 584]; // on the document
  const CX = DX + STAMP[0], CY = DY + STAMP[1]; // where the press lands, in the frame
  const REST = 66; // the press head's centre at rest, hovering over the top of the pile
  // timeline inside one period (seconds)
  const OUT = 0.7, RISE = [0.12, 0.75], TICK = 0.82, DROP = [1.3, 1.5], HOLD = 1.64, LIFT = 0.42, SIGN = [2.12, 0.62], PRESS = 2.95;

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

  SiteMotion.scene({
    width: W,
    height: H,
    loop: 0,
    duration: D,
    still: 7.62,
    setup({ root, content, tokens, h }) {
      const { el, svg, mix, rng, ui } = h;
      const C = tokens.color, ink = ui.strokeColor(C.stroke || C.ink);
      const OUTW = ui.stroke("regular", 1.5);
      root.classList.add("lsh");
      const docs = content.docs;
      const N = docs.length, P = D / N;

      const copy = el("div", "lsh-copy", root);
      el("div", "lsh-eyebrow", copy, content.eyebrow || "");
      el("div", "lsh-h", copy, content.heading || "");
      el("div", "lsh-sub", copy, content.sub || "");

      const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "lsh-svg" }, root);
      const defs = svg("defs", {}, s);
      // the rubber leaves paper showing through: a seeded speckle mask over the impression
      const R = rng(7);
      const mask = svg("mask", { id: "lsh-ink", maskUnits: "userSpaceOnUse", x: -190, y: -80, width: 380, height: 160 }, defs);
      svg("rect", { x: -190, y: -80, width: 380, height: 160, fill: "white" }, mask);
      for (let n = 0; n < 70; n++) svg("circle", { cx: (R() * 340 - 170).toFixed(1), cy: (R() * 120 - 60).toFixed(1), r: (0.8 + R() * 2.2).toFixed(1), fill: "black", opacity: (0.5 + R() * 0.5).toFixed(2) }, mask);
      for (let n = 0; n < 6; n++) {
        const x = R() * 300 - 150, y = R() * 100 - 50;
        svg("rect", { x: x.toFixed(1), y: y.toFixed(1), width: (20 + R() * 40).toFixed(1), height: (1 + R() * 1.5).toFixed(1), fill: "black", opacity: 0.55 }, mask);
      }

      const docLayer = svg("g", {}, s);
      const txt = (parent, attrs, cls, value = "") => { const n = svg("text", { ...attrs, class: cls }, parent); n.textContent = value; return n; };
      const checks = content.checks || [];
      const pool = Array.from({ length: 4 }, () => {
        const g = svg("g", {}, docLayer);
        const nudge = svg("g", {}, g);
        svg("rect", { x: 0, y: 0, width: DW, height: DH, rx: ui.radius("md", tokens.radius?.md ?? 12), fill: C.surface, stroke: ink, "stroke-width": OUTW }, nudge);
        const type = txt(nudge, { x: 44, y: 62 }, "lsh-type");
        const ref = txt(nudge, { x: DW - 44, y: 62, "text-anchor": "end" }, "lsh-type");
        svg("line", { x1: 44, x2: DW - 44, y1: 88, y2: 88, stroke: C.line, "stroke-width": ui.stroke("hair", 1) }, nudge);
        const payee = txt(nudge, { x: 44, y: 144 }, "lsh-payee");
        const amount = txt(nudge, { x: 40, y: 262 }, "lsh-amount");
        const whole = svg("tspan", {}, amount), cents = svg("tspan", { class: "lsh-cents" }, amount);
        svg("line", { x1: 44, x2: DW - 44, y1: 306, y2: 306, stroke: C.line, "stroke-width": ui.stroke("hair", 1) }, nudge);
        const rows = [0, 1, 2].map((r) => {
          const y = 366 + r * 52;
          const box = svg("rect", { x: 44, y: y - 21, width: 26, height: 26, rx: Math.min(6, ui.radius("sm", 5)), fill: "none", stroke: C.faint || C.line, "stroke-width": ui.stroke("fine", 1.6) }, nudge);
          // sm-native: a check mark is a glyph, drawn at the weight that reads at its size
          const mark = svg("path", { d: "M2.5 6.5L5 9L9.8 3.2", fill: "none", stroke: C.positive, "stroke-width": 1.6, "stroke-linecap": "round", "stroke-linejoin": "round", transform: `translate(44 ${y - 21}) scale(${26 / 12})` }, nudge);
          const label = txt(nudge, { x: 86, y: y }, "lsh-check", checks[r] || "");
          return { box, mark, label };
        });
        svg("line", { x1: 44, x2: 330, y1: 600, y2: 600, stroke: C.faint || C.line, "stroke-width": ui.stroke("hair", 1) }, nudge);
        const sig = svg("path", { d: "", fill: "none", stroke: ink, "stroke-width": (ui.stroke("regular", 1.6) * 1.7) / 2.5, "stroke-linecap": "round", pathLength: 1, "stroke-dasharray": 1, transform: "translate(56 580) scale(2.5)" }, nudge);
        txt(nudge, { x: 44, y: 630 }, "lsh-signer", [content.signer, content.signerRole].filter(Boolean).join(" · "));
        // the impression: one ink, in the accent's text shade so its words read at AA
        const stamp = svg("g", {}, nudge);
        const inked = svg("g", { mask: "url(#lsh-ink)" }, stamp);
        const col = C.accentText || C.accent;
        // sm-native-start: the rubber stamp is the scene's motif and keeps its own weight and corners
        svg("rect", { x: -158, y: -54, width: 316, height: 108, rx: 10, fill: "none", stroke: col, "stroke-width": 5 }, inked);
        svg("rect", { x: -148, y: -44, width: 296, height: 88, rx: 5, fill: "none", stroke: col, "stroke-width": 1.5 }, inked);
        // sm-native-end
        txt(inked, { x: 0, y: 8, "text-anchor": "middle", fill: col }, "lsh-stamp", content.stampOk || "APPROVED");
        txt(inked, { x: 0, y: 33, "text-anchor": "middle", fill: col }, "lsh-stamp-date", content.stampDate || "");
        const seal = svg("g", {}, nudge);
        const ripple = svg("circle", { cx: SEAL[0], cy: SEAL[1], r: 58, fill: "none", stroke: C.accent, "stroke-width": ui.stroke("regular", 2) }, nudge);
        svg("circle", { r: 58, fill: C.accentFill || C.accent, stroke: ink, "stroke-width": OUTW }, seal);
        svg("circle", { r: 49, fill: "none", stroke: C.onAccent || C.paper, "stroke-width": ui.stroke("hair", 1.2), "stroke-dasharray": "3 3.6", opacity: 0.8 }, seal);
        txt(seal, { x: 0, y: -2, "text-anchor": "middle" }, "lsh-seal", content.seal || "SEALED");
        const sealHash = txt(seal, { x: 0, y: 20, "text-anchor": "middle" }, "lsh-seal-hash");
        return { g, nudge, type, ref, payee, whole, cents, rows, sig, stamp, seal, ripple, sealHash, bound: null };
      });
      const R2 = rng(53);
      const info = docs.map((d, i) => {
        const dot = d.amount.lastIndexOf(".");
        return { ...d, whole: dot > 0 ? d.amount.slice(0, dot) : d.amount, cents: dot > 0 ? d.amount.slice(dot) : "", hash: hashOf(d.ref + d.amount), sig: sigOf(rng, 31 + i * 17), angle: -(4 + R2() * 5) };
      });

      // sm-native-start: the press machinery is the scene's motif; it keeps its own weights and corners in every look
      const shadow = svg("ellipse", { cx: CX, cy: CY + 10, rx: 190, ry: 66, fill: C.ink, opacity: 0 }, s);
      const head = svg("g", {}, s);
      const body = svg("g", {}, head);
      svg("rect", { x: -172, y: -60, width: 344, height: 120, rx: 12, fill: C.ink }, body);
      svg("rect", { x: -150, y: -42, width: 300, height: 74, rx: 6, fill: "none", stroke: mix(C.ink, C.paper, 0.3), "stroke-width": 2 }, body);
      svg("circle", { r: 18, fill: mix(C.ink, C.paper, 0.25) }, body);
      svg("rect", { x: -164, y: 48, width: 328, height: 8, rx: 4, fill: C.accent }, body);
      // sm-native-end

      return { N, P, pool, info, docLayer, shadow, head, body, content, C };
    },

    render(t, S, h) {
      const { ease, clamp, lerp } = h;
      const { N, P } = S;
      const ci = (i) => ((i % N) + N) % N;
      const k = Math.floor(t / P + 1e-9);
      const u = t - k * P; // time into the period of document k

      // the pile: document k − 1 leaves on the right while k rises to the top and the rest move up one sheet
      const eOut = ease.inOut(clamp(u / OUT));
      const eRise = h.tw(u, RISE[0], RISE[1] - RISE[0], "signature");
      const order = [];
      for (let i = k + 2; i >= k - 1; i--) {
        const slot = ((i % 4) + 4) % 4;
        const T = S.pool[slot];
        order.push(T.g);
        const doc = S.info[ci(i)];
        if (T.bound !== i) {
          T.bound = i;
          T.type.textContent = doc.type.toUpperCase();
          T.ref.textContent = doc.ref;
          T.payee.textContent = doc.payee;
          T.whole.textContent = doc.whole;
          T.cents.textContent = doc.cents;
          T.sig.setAttribute("d", doc.sig);
          T.sealHash.textContent = doc.hash;
          T.stampAngle = doc.angle;
        }
        const base = i - (k - 1);
        let tr;
        if (base === 0) tr = `translate(${(DX + 820 * eOut).toFixed(1)} ${(DY + 30 * eOut).toFixed(1)}) rotate(${(7 * eOut).toFixed(2)} ${DW / 2} ${DH / 2})`;
        else {
          const p = Math.min(2, base - eRise);
          tr = `translate(${(DX + 16 * p).toFixed(1)} ${(DY + 13 * p).toFixed(1)}) rotate(${(1.6 * p).toFixed(2)} ${DW / 2} ${DH / 2})`;
        }
        T.g.setAttribute("transform", tr);

        // marks, from the time into this document's own period
        const v = t - i * P;
        T.rows.forEach((r, n) => {
          const on = clamp((v - (TICK + h.motion.stagger(n, 0.14))) / 0.12);
          r.mark.setAttribute("opacity", on.toFixed(3));
          r.box.setAttribute("stroke", on > 0.5 ? S.C.positive : S.C.faint || S.C.line);
          r.label.setAttribute("opacity", (0.55 + 0.45 * on).toFixed(3));
        });
        const contact = DROP[1];
        const inked = clamp((v - contact) / 0.14);
        T.stamp.setAttribute("opacity", v < contact ? 0 : 0.9);
        T.stamp.setAttribute("transform", `translate(${STAMP[0]} ${STAMP[1]}) rotate(${T.stampAngle.toFixed(2)}) scale(${(1.05 - 0.05 * ease.snappy(inked)).toFixed(3)})`);
        // the paper gives a little under the press
        const give = v < contact ? 0 : 6 * (1 - ease.snappy(clamp((v - contact) / 0.3)));
        T.nudge.setAttribute("transform", `translate(0 ${give.toFixed(2)})`);
        const sg = ease.inOut(clamp((v - SIGN[0]) / SIGN[1]));
        T.sig.setAttribute("stroke-dashoffset", (1 - sg).toFixed(4));
        T.sig.setAttribute("opacity", sg > 0 ? 1 : 0);
        const sv = clamp((v - PRESS) / 0.16);
        T.seal.setAttribute("opacity", v < PRESS ? 0 : 1);
        T.seal.setAttribute("transform", `translate(${SEAL[0]} ${SEAL[1]}) scale(${(1.2 - 0.2 * ease.snappy(sv)).toFixed(3)})`);
        const rp = clamp((v - PRESS - 0.08) / 0.55);
        T.ripple.setAttribute("r", (58 + 34 * ease.soft(rp)).toFixed(1));
        T.ripple.setAttribute("opacity", (v < PRESS + 0.08 ? 0 : 0.6 * (1 - rp)).toFixed(3));
      }
      // z-order follows the pile: the leaving sheet on top, the deepest at the bottom
      const kids = S.docLayer.childNodes;
      if (order.some((g, n) => kids[n] !== g)) order.forEach((g) => S.docLayer.appendChild(g));

      // the press, seen from above: it hovers over the pile, larger because nearer; it accelerates into the paper,
      // squashes a little at contact, then lifts back
      let d;
      if (u < DROP[0]) d = 0;
      else if (u < DROP[1]) d = Math.pow((u - DROP[0]) / (DROP[1] - DROP[0]), 2);
      else if (u < HOLD) d = 1;
      else d = 1 - ease.inOut(clamp((u - HOLD) / LIFT));
      // between slams the head turns to the angle it will strike the next document at
      const angle = lerp(S.info[ci(k - 1)].angle, S.info[ci(k)].angle, h.tw(u, 0.35, 0.6, "snappy"));
      const y = lerp(REST, CY, d);
      const sq = Math.sin(Math.PI * clamp((u - DROP[1]) / 0.12));
      const scale = 1.12 - 0.12 * d;
      S.head.setAttribute("transform", `translate(${CX} ${y.toFixed(1)}) rotate(${angle.toFixed(2)}) scale(${scale.toFixed(3)})`);
      S.body.setAttribute("transform", `scale(${(1 + 0.03 * sq).toFixed(4)} ${(1 - 0.07 * sq).toFixed(4)})`);
      S.shadow.setAttribute("opacity", (0.16 * clamp((d - 0.45) / 0.55)).toFixed(3));
      S.shadow.setAttribute("transform", `rotate(${angle.toFixed(2)} ${CX} ${CY})`);
    },
  });
})();
