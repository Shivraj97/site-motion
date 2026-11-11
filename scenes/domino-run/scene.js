// @vendor matter
/* domino-run: one trigger, every step fires (Matter.js, baked).
 * A ball rolls down a ramp and tips a line of dominoes. The dominoes are grouped into the steps of an
 * automation; each step's label lights the moment the wave reaches its first domino. The physics is
 * stepped once in setup at a fixed 60 Hz and recorded, so render(t) only reads frames. At the seam the
 * fallen dominoes fade out while upright ones fade back in, so frame `duration` equals frame 0.
 */
(function () {
  const D = 12, W = 1600, H = 900, HZ = 60;
  SiteMotion.scene({
    width: W,
    height: H,
    loop: 0,
    duration: D,
    still: 7.4,
    setup({ root, content, tokens, h }) {
      const { el, svg, mix, ui } = h;
      const C = tokens.color, pal = tokens.palette;
      const { Engine, Bodies, Composite, Body } = Matter;
      root.classList.add("dr");
      const copy = el("div", "dr-copy", root);
      el("div", "dr-eyebrow", copy, content.eyebrow || "");
      el("div", "dr-h", copy, content.heading || "");
      el("div", "dr-sub", copy, content.sub || "");

      const floorY = 640, DW = 16, DH = 96, SP = 40, BALL = 15;
      const groups = content.steps;
      const per = content.perStep ?? 4;
      const x0 = 700;
      const engine = Engine.create({ gravity: { y: 1.0 }, positionIterations: 10, velocityIterations: 8 });
      const floor = Bodies.rectangle(1100, floorY + 20, 1400, 40, { isStatic: true, friction: 0.8 });
      const ramp = Bodies.rectangle(590, floorY - 70, 240, 12, { isStatic: true, angle: 0.62, friction: 0.05 });
      Composite.add(engine.world, [floor, ramp]);
      const dominoes = [];
      groups.forEach((g, gi) => {
        for (let k = 0; k < per; k++) {
          const x = x0 + (gi * per + k) * SP + gi * 14; // a small gap between steps
          const b = Bodies.rectangle(x, floorY - DH / 2, DW, DH, { friction: 0.12, frictionStatic: 0.25, restitution: 0, density: 0.002, chamfer: { radius: 2 } });
          dominoes.push({ b, gi, k, x0: x });
        }
      });
      const ball = Bodies.circle(520, floorY - 190, BALL, { density: 0.02, friction: 0.01, restitution: 0.05 });
      Composite.add(engine.world, dominoes.map((d) => d.b));
      const releaseAt = content.releaseAt ?? 0.6;
      Body.setStatic(ball, true);
      Composite.add(engine.world, ball);

      // bake
      const frames = Math.ceil(D * HZ) + 1;
      const track = dominoes.map(() => new Float32Array(frames * 3));
      const ballTrack = new Float32Array(frames * 2);
      for (let f = 0; f < frames; f++) {
        if (Math.abs(f / HZ - releaseAt) < 0.5 / HZ) Body.setStatic(ball, false);
        Engine.update(engine, 1000 / HZ);
        dominoes.forEach((d, i) => track[i].set([d.b.position.x, d.b.position.y, d.b.angle], f * 3));
        ballTrack.set([ball.position.x, ball.position.y], f * 2);
      }
      // when does each step light? the moment its first domino has tipped 0.35 rad
      const fireAt = groups.map((_, gi) => {
        const i = dominoes.findIndex((d) => d.gi === gi);
        for (let f = 0; f < frames; f++) if (Math.abs(track[i][f * 3 + 2]) > 0.35) return f / HZ;
        return Infinity;
      });

      // drawing
      const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "dr-svg" }, root);
      svg("rect", { x: 440, y: floorY, width: 1120, height: 8, rx: 4, fill: C.stroke || C.ink }, s); // sm-native: a pill (radius = half its height) stays a pill in every look
      svg("rect", { x: -120, y: -6, width: 240, height: 12, rx: 6, fill: mix(C.paper, C.ink, 0.25), transform: `translate(590 ${floorY - 70}) rotate(${(0.62 * 180) / Math.PI})` }, s); // sm-native: a pill (radius = half its height) stays a pill in every look
      // outline weight, colour and corner follow the style pack when it directs them (else these are the scene's own)
      const outline = ui.strokeAttrs("regular", 1.5, C.stroke || C.ink);
      const rule = ui.strokeAttrs("hair", 1, C.stroke || C.ink);
      const rx = Math.min(DW / 2, ui.radius("sm", 3));
      const domino = (colour) => {
        const g = svg("g", {}, s);
        svg("rect", { x: -DW / 2, y: -DH / 2, width: DW, height: DH, rx, fill: colour, ...outline }, g);
        svg("line", { x1: -DW / 2 + 2, y1: 0, x2: DW / 2 - 2, y2: 0, ...rule }, g);
        for (const y of [-DH / 4, DH / 4]) svg("circle", { cx: 0, cy: y, r: 2.4, fill: C.stroke || C.ink }, g);
        return g;
      };
      const live = dominoes.map((d) => ({ g: domino(pal[d.gi % pal.length]) }));
      const ghost = dominoes.map((d) => { const g = domino(pal[d.gi % pal.length]); g.setAttribute("transform", `translate(${d.x0} ${floorY - DH / 2})`); return g; });
      const ballEl = svg("circle", { r: BALL, fill: C.accent, ...outline }, s);
      const labels = groups.map((g, gi) => {
        const xs = dominoes.filter((d) => d.gi === gi).map((d) => d.x0);
        const box = el("div", "dr-step", root);
        Object.assign(box.style, { left: (xs[0] + xs[xs.length - 1]) / 2 + "px", top: floorY + 30 + "px" });
        const n = el("span", "dr-n", box, String(gi + 1).padStart(2, "0"));
        el("span", "dr-name", box, g.label);
        const done = el("span", "dr-done", box, "✓ " + (g.done || "done"));
        return { box, n, done };
      });
      const timer = el("div", "dr-timer", root);
      return { dominoes, track, ballTrack, frames, live, ghost, ballEl, labels, fireAt, timer, releaseAt, run: content.run || "" };
    },

    render(t, S, h) {
      const { tw } = h;
      const f = Math.min(S.frames - 1, Math.max(0, Math.round(t * HZ)));
      const out = 1 - tw(t, D - 1.6, 0.7, "inOut"); // fallen dominoes fade…
      const back = tw(t, D - 0.9, 0.7, "inOut"); // …and upright ones fade back in
      S.dominoes.forEach((d, i) => {
        const x = S.track[i][f * 3], y = S.track[i][f * 3 + 1], a = S.track[i][f * 3 + 2];
        S.live[i].g.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${((a * 180) / Math.PI).toFixed(2)})`);
        S.live[i].g.setAttribute("opacity", t < D - 1.6 ? 1 : out.toFixed(3));
        S.ghost[i].setAttribute("opacity", back.toFixed(3));
      });
      const bx = S.ballTrack[f * 2], by = S.ballTrack[f * 2 + 1];
      S.ballEl.setAttribute("cx", bx.toFixed(1)); S.ballEl.setAttribute("cy", by.toFixed(1));
      S.ballEl.setAttribute("opacity", (t < D - 1.6 ? 1 : Math.max(out, back)).toFixed(3));
      if (back > 0) { S.ballEl.setAttribute("cx", 520); S.ballEl.setAttribute("cy", 640 - 190); S.ballEl.setAttribute("opacity", back.toFixed(3)); }
      // steps light as the wave reaches them
      let fired = 0;
      S.labels.forEach((L, gi) => {
        const on = tw(t, S.fireAt[gi], 0.3, "snappy") * (1 - tw(t, D - 1.0, 0.6, "inOut"));
        if (t >= S.fireAt[gi] && t < D - 1.0) fired++;
        L.box.style.setProperty("--on", on.toFixed(3));
      });
      const last = S.fireAt[S.fireAt.length - 1];
      const ms = Math.round(Math.max(0, Math.min(t, last) - S.releaseAt) * 1000);
      S.timer.textContent = `${S.run}${fired}/${S.labels.length} steps · ${t < S.releaseAt ? 0 : ms} ms`;
      S.timer.style.opacity = (tw(t, 0, 0.4) * (1 - tw(t, D - 1.0, 0.6, "inOut"))).toFixed(3); // in at the start, out before the seam
    },
  });
})();
