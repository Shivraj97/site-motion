// @vendor p5
/* signal-field: noisy signals pass through a gate and come out as clean, evenly spaced lanes (p5.js).
 * Each strand's position is computed from t, not integrated, so any frame can be drawn on its own:
 * p5 runs with noLoop() and render(t) calls redraw(). Noise is sampled on a circle in time, so the
 * wobble at t = duration is the wobble at t = 0.
 */
(function () {
  const D = 10, W = 1600, H = 900;
  SiteMotion.scene({
    width: W,
    height: H,
    loop: 0,
    duration: D,
    still: 6,
    setup({ root, content, tokens, h }) {
      const { el, rng, mix, ui } = h;
      // line weights follow the project's style pack when it directs stroke; otherwise these are the scene's own
      const W_GATE = ui.stroke("regular", 1.5), W_ACCENT = ui.stroke("bold", 2.2), W_STRAND = ui.stroke("fine", 1.3);
      const C = tokens.color, pal = tokens.palette;
      root.classList.add("sf");
      const host = el("div", "sf-canvas", root);
      const rand = rng(content.seed || 9);
      const N = content.strands || 14;
      const gate = W * (content.gate ?? 0.56);
      const top = 250, bottom = 770;
      const strands = Array.from({ length: N }, (_, i) => ({
        lane: top + ((i + 0.5) / N) * (bottom - top),
        start: top + rand() * (bottom - top),
        seed: rand() * 100,
        speed: 1 + Math.floor(rand() * 2), // whole laps per loop keeps the loop seamless
        phase: rand(),
        colour: i % 4 === 0 ? C.accent : mix(C.ink, C.paper, 0.35 + rand() * 0.25),
      }));
      const state = { t: 0 };
      const inst = new p5((p) => {
        p.setup = () => {
          p.createCanvas(W, H);
          p.pixelDensity(document.documentElement.classList.contains("sm-exporting") ? 1 : Math.min(2, window.devicePixelRatio || 1));
          p.noLoop();
          p.noiseSeed(content.seed || 9);
        };
        p.draw = () => {
          const t = state.t, loopA = (t / D) * Math.PI * 2;
          p.background(C.paper);
          // the gate: a dotted vertical rule with a label
          p.stroke(mix(C.ink, C.paper, 0.55));
          p.strokeWeight(W_GATE);
          for (let y = top - 40; y < bottom + 40; y += 10) p.point(gate, y);
          // y of a strand at x: noisy before the gate, eased into its lane after it
          const yAt = (s, x) => {
            const n = p.noise(s.seed + x * 0.004, Math.cos(loopA) * 0.8 + 3, Math.sin(loopA) * 0.8 + 3);
            const messy = p.constrain(s.start + (n - 0.5) * 380, top - 10, bottom + 10);
            const k = p.constrain((x - (gate - 160)) / 160, 0, 1);
            const ease = k * k * (3 - 2 * k);
            return p.lerp(messy, s.lane, ease);
          };
          p.noFill();
          for (const s of strands) {
            p.stroke(s.colour);
            p.strokeWeight(s.colour === C.accent ? W_ACCENT : W_STRAND);
            p.beginShape();
            for (let x = 80; x <= W - 80; x += 8) p.vertex(x, yAt(s, x));
            p.endShape();
            // a packet rides each strand, a whole number of laps per loop
            const u = ((t / D) * s.speed + s.phase) % 1;
            const px = 80 + u * (W - 160);
            p.noStroke();
            p.fill(px > gate ? C.accent : C.ink);
            p.circle(px, yAt(s, px), px > gate ? 9 : 7);
            p.noFill();
          }
        };
      }, host);
      const label = el("div", "sf-label", root);
      el("div", "sf-eyebrow", label, content.eyebrow || "");
      el("div", "sf-h", label, content.heading || "");
      const tagIn = el("div", "sf-tag sf-in", root, content.inLabel || "messy inputs");
      const tagOut = el("div", "sf-tag sf-out", root, content.outLabel || "reliable output");
      tagIn.style.left = "80px"; tagOut.style.right = "80px";
      return { state, inst };
    },
    render(t, S) {
      S.state.t = t;
      S.inst.redraw();
    },
  });
})();
