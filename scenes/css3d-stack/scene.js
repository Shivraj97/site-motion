/* css3d-stack: an architecture stack as real HTML boxes in CSS 3D (transform-style: preserve-3d).
 * 2.5D without WebGL: text stays crisp and selectable, the page is light, and export is deterministic.
 * The layers lift apart, a request drops through them lighting each one in turn, then they settle.
 */
(function () {
  const D = 12;
  SiteMotion.scene({
    width: 1600,
    height: 900,
    loop: 0,
    duration: D,
    still: 5.6,
    setup({ root, content, tokens, h }) {
      const { el } = h;
      const pal = tokens.palette, C = tokens.color;
      root.classList.add("c3");
      const copy = el("div", "c3-copy", root);
      el("div", "c3-eyebrow", copy, content.eyebrow || "");
      el("div", "c3-h", copy, content.heading || "");
      el("div", "c3-sub", copy, content.sub || "");
      const view = el("div", "c3-view", root);
      const stack = el("div", "c3-stack", view);
      const layers = content.layers.map((L, i) => {
        const layer = el("div", "c3-layer", stack);
        const colour = L.colour || pal[i % pal.length];
        layer.style.setProperty("--layer", colour);
        // a lit layer mixes up to 78% of its colour into the face; on a dark theme a pale layer colour would wash the
        // light ink out, so the face only brightens as far as the ink still reads (light themes keep the full range)
        const reads = (p) => !window.SMTokens || SMTokens.contrast(C.ink, h.mix(C.surface, colour, p)) >= 4.65;
        let hi = 0.78; while (hi > 0.1 && !reads(hi)) hi -= 0.02;
        const lo = Math.min(0.28, hi);
        layer.style.setProperty("--lit-lo", (lo * 100).toFixed(1) + "%");
        layer.style.setProperty("--lit-span", ((hi - lo) * 100).toFixed(1) + "%");
        const top = el("div", "c3-face c3-top", layer);
        const head = el("div", "c3-row", top);
        el("span", "c3-name", head, L.title);
        el("span", "c3-tag", head, L.tag || "");
        el("div", "c3-sub-l", top, L.sub || "");
        const chips = el("div", "c3-chips", top);
        (L.chips || []).forEach((c) => el("span", "c3-chip", chips, c));
        el("div", "c3-face c3-side-y", layer);
        el("div", "c3-face c3-side-x", layer);
        return { layer, top };
      });
      // the request: a glowing token that drops through the stack
      const token = el("div", "c3-token", stack);
      el("span", "", token, content.request || "GET /orders");
      return { layers, token, n: layers.length };
    },

    render(t, S, h) {
      const { tw, lerp, span } = h;
      const open = tw(t, 0.6, 1.1, "signature") * (1 - tw(t, 10.4, 1.0, "inOut"));
      const GAP = 34 + 120 * open; // vertical space between layers in px of Z
      // the request visits each layer, top to bottom, between 2.4 s and 8.8 s
      const from = 2.4, per = (8.8 - from) / S.n;
      const visit = Math.min(S.n - 1, Math.max(0, Math.floor((t - from) / per)));
      const into = (t - from - visit * per) / per;
      S.layers.forEach((L, i) => {
        const z = (S.n - 1 - i) * GAP; // the first layer sits on top
        L.layer.style.transform = `translateZ(${z.toFixed(1)}px)`;
        const lit = t >= from && t < 8.8 + 0.6 ? span(t, from + i * per, from + (i + 1) * per - 0.05, 0.2, 0.35) : 0;
        L.top.style.setProperty("--lit", lit.toFixed(3));
      });
      const zTop = (S.n - 1) * GAP + 160, zNow = (S.n - 1 - visit) * GAP + 22;
      const drop = t < from ? zTop : lerp((S.n - visit) * GAP + 22, zNow, tw(into, 0, 0.35, "inOut"));
      S.token.style.transform = `translate3d(450px, 150px, ${Math.max(zNow, Math.min(zTop, drop)).toFixed(1)}px)`; // beside the stack, like a lift
      S.token.style.opacity = (tw(t, from - 0.3, 0.3) * (1 - tw(t, 9.0, 0.4))).toFixed(3);
    },
  });
})();
