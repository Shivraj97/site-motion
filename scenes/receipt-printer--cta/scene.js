/* receipt-printer--cta: the receipt printer as the call to action (DOM).
 * A centred CTA: heading and sub, and under them a small printer. Its light blinks and it prints one short slip,
 * band by band: a header, the offer's lines (typed as the printhead passes), a footer, and last a coloured stub
 * carrying the call to action. The printer's cutter runs along the perforation, the stub rips free from left to
 * right, drops and settles at a tilt as the button; the slip sways from the jolt and the arrow nudges once.
 * Then the slip clears and the printer waits. Intro-free loop (loop: 0): nothing is out of the printer at t = 0
 * or at t = D.
 */
(function () {
  const D = 9, W = 1600, H = 900;
  const FEED_H = 470; // the window under the printer's mouth the slip prints into
  const TEETH = 10, TOOTH = 8; // perforation: one tooth every 2 × TEETH px, TOOTH px deep
  const P0 = 0.7; // printing starts
  const CUT_DELAY = 0.45, SWEEP = 0.38, DROP = 0.75;
  const EXIT = 7.8;

  SiteMotion.scene({
    width: W,
    height: H,
    loop: 0,
    duration: D,
    still: 6.3,
    setup({ root, content, h }) {
      const { el } = h;
      root.classList.add("rpc");
      const rc = content.receipt || {};

      const copy = el("div", "rpc-copy", root);
      el("div", "rpc-eyebrow", copy, content.eyebrow || "");
      el("div", "rpc-h", copy, content.heading || "");
      el("div", "rpc-sub", copy, content.sub || "");

      // the printer: the parent's case, smaller, centred
      const printer = el("div", "rpc-printer", root);
      el("div", "rpc-slot", printer);
      el("div", "rpc-printer-label", printer, content.printerLabel || "extract");
      const led = el("span", "rpc-led", printer);
      el("div", "rpc-mouth", printer);

      // the slip: bands of known height, so the printhead knows where every line is
      const feed = el("div", "rpc-feed", root);
      const wrapBody = el("div", "rpc-wrap rpc-wrap-body", feed);
      const body = el("div", "rpc-body", wrapBody);
      const bands = [];
      const band = (cls, hgt, dur) => {
        const node = el("div", "rpc-band " + cls, body);
        node.style.height = hgt + "px";
        bands.push({ node, hgt, dur, typed: [] });
        return bands[bands.length - 1];
      };
      band("", 20, 0.12);
      const hd = band("rpc-head", 30, 0.3);
      el("span", "", hd.node, rc.title || "");
      el("span", "", hd.node, rc.date || "");
      band("rpc-rule", 18, 0.16);
      (rc.fields || []).forEach((f) => {
        const b = band("rpc-row" + (f.total ? " rpc-total" : ""), 34, 0.32);
        el("span", "rpc-k", b.node, f.k);
        const v = el("span", "rpc-v", b.node, "");
        b.typed.push({ node: v, full: String(f.v) });
      });
      band("rpc-rule", 18, 0.16);
      (rc.footer || []).forEach((line) => {
        const b = band("rpc-foot", 30, 0.3);
        const v = el("span", "", b.node, "");
        b.typed.push({ node: v, full: line });
      });
      band("", 14 + TOOTH, 0.14); // bottom margin, with the perforation's teeth in its last TOOTH px
      const bodyH = bands.reduce((s, b) => s + b.hgt, 0);
      // the perforation: the body's teeth point down into the stub's notches, so the two interlock exactly
      const teeth = Math.round(380 / TEETH);
      const bodyPoly = ["0 0", "380px 0"];
      for (let i = 0; i <= teeth; i++) bodyPoly.push(`${380 - i * TEETH}px ${i % 2 ? bodyH : bodyH - TOOTH}px`);
      body.style.clipPath = `polygon(${bodyPoly.join(",")})`;

      // the stub: the call to action, the last thing the printer pushes out
      const STUB_H = 104;
      const wrapStub = el("div", "rpc-wrap rpc-wrap-stub", feed);
      wrapStub.style.top = bodyH - TOOTH + "px";
      const stub = el("div", "rpc-stub", wrapStub);
      stub.style.height = STUB_H + TOOTH + "px";
      const stubPoly = [];
      for (let i = 0; i <= teeth; i++) stubPoly.push(`${i * TEETH}px ${i % 2 ? TOOTH : 0}px`);
      stubPoly.push(`380px ${STUB_H + TOOTH}px`, `0 ${STUB_H + TOOTH}px`);
      stub.style.clipPath = `polygon(${stubPoly.join(",")})`;
      const btn = el("div", "rpc-btn", stub);
      el("span", "rpc-btn-label", btn, content.button || "Start free");
      const arrow = el("span", "rpc-arrow", btn, "→");
      if (content.fine) el("div", "rpc-fine", stub, content.fine);

      // the print schedule: each band starts when the last one is out
      let at = P0, y = 0;
      bands.forEach((b) => { b.start = at; b.y = y; at += b.dur; y += b.hgt; });
      const stubBand = { start: at, dur: 0.55, hgt: STUB_H };
      const printEnd = at + stubBand.dur;
      const cut = printEnd + CUT_DELAY;

      const headBar = el("div", "rpc-printhead", feed);
      const cutter = el("div", "rpc-cut", feed);
      cutter.style.top = bodyH - TOOTH / 2 + "px";

      return { led, feed, wrapBody, wrapStub, bands, stubBand, bodyH, printEnd, cut, headBar, cutter, arrow };
    },

    render(t, S, h) {
      const { tw, typed, lerp, clamp } = h;
      const printing = t >= P0 && t < S.printEnd;

      // ---- printing: the paper grows band by band; values type as the printhead crosses them ----
      let shown = 0;
      S.bands.forEach((b) => {
        const p = tw(t, b.start, b.dur, "snappy");
        shown += b.hgt * p;
        b.node.style.opacity = p > 0 ? 1 : 0;
        b.typed.forEach((v) => h.text(v.node, typed(v.full, t, b.start, 44)));
      });
      shown += S.stubBand.hgt * tw(t, S.stubBand.start, S.stubBand.dur, "snappy");
      // once the stub is out, nothing is clipped: it has to fall below the window's edge
      const clipBottom = t >= S.printEnd ? -200 : Math.max(0, FEED_H - shown);
      S.feed.style.clipPath = `inset(0px -160px ${clipBottom.toFixed(1)}px -160px)`;
      S.headBar.style.opacity = printing ? 1 : 0;
      S.headBar.style.transform = `translateY(${shown.toFixed(1)}px)`;

      // ---- the light: blinks while printing, steady while the slip is out ----
      const out = t >= S.printEnd && t < EXIT + 0.3;
      S.led.classList.toggle("is-on", (printing && Math.floor(t * 6) % 2 === 0) || out);

      // ---- the cut: the cutter runs left to right; the stub opens from the left, then drops free ----
      const sweep = tw(t, S.cut, SWEEP, "inOut");
      const cutterOn = t >= S.cut - 0.1 && t < S.cut + SWEEP + 0.15;
      S.cutter.style.opacity = cutterOn ? (tw(t, S.cut - 0.1, 0.1, "soft") * (1 - tw(t, S.cut + SWEEP, 0.15, "soft"))).toFixed(3) : 0;
      S.cutter.style.left = lerp(-6, 386, sweep).toFixed(1) + "px";
      const fall = tw(t, S.cut + SWEEP, DROP, "signature");
      const rot = lerp(0, -3.2, sweep) + lerp(0, 1.0, fall);
      const ty = 40 * fall, tx = -8 * fall;
      // the jolt: the slip swings once the stub lets go, and is still again in two seconds
      const u = t - (S.cut + SWEEP);
      const sway = u > 0 && u < 2.2 ? 0.9 * Math.exp(-2.6 * u) * Math.sin(u * Math.PI * 2 * 1.4) * (1 - clamp((u - 1.8) / 0.4)) : 0;

      // ---- the button: lifted once free, the arrow nudges once ----
      const nudgeAt = S.cut + SWEEP + DROP - 0.1;
      const nudge = tw(t, nudgeAt, 0.3, "snappy") * (1 - tw(t, nudgeAt + 0.4, 0.45, "inOut"));
      S.arrow.style.transform = `translateX(${(nudge * 8).toFixed(2)}px)`;
      const lift = fall;
      // sm-native: the torn stub's own paper shadow grows as it comes free
      S.wrapStub.style.filter = `drop-shadow(0 ${(2 + 14 * lift).toFixed(1)}px ${(4 + 18 * lift).toFixed(1)}px rgba(0,0,0,${(0.1 + 0.12 * lift).toFixed(3)}))`;

      // ---- exit: the slip and the button clear before the seam ----
      const gone = tw(t, EXIT, 0.6, "inOut");
      const exitY = 24 * gone, op = (1 - gone).toFixed(3);
      S.wrapBody.style.transform = `translateY(${exitY.toFixed(1)}px) rotate(${sway.toFixed(3)}deg)`;
      S.wrapBody.style.opacity = op;
      S.wrapStub.style.transform = `translate(${tx.toFixed(1)}px, ${(ty + exitY).toFixed(1)}px) rotate(${rot.toFixed(3)}deg)`;
      S.wrapStub.style.opacity = op;
    },
  });
})();
