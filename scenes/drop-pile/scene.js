// @vendor matter
/* drop-pile: work arrives from everywhere and lands in one place (Matter.js physics).
 * Physics is stateful, so it is baked: setup() steps the engine at a fixed 60 Hz for the whole
 * timeline and records every body's position and angle per frame; render(t) only looks frames up.
 * The same t always shows the same frame, and the export is frame-exact. Items are DOM chips so
 * the text stays sharp; the tray then tips them into the "done" counter and the loop restarts empty.
 */
(function () {
  const D = 12, W = 1600, H = 900, HZ = 60;
  SiteMotion.scene({
    width: W,
    height: H,
    loop: 0,
    duration: D,
    still: 7.6,
    setup({ root, content, tokens, h }) {
      const { el, rng } = h;
      const pal = tokens.palette;
      const { Engine, Bodies, Composite, Body } = Matter;
      root.classList.add("dp");
      const rand = rng(content.seed || 4);
      const tray = { x: W * 0.6, y: 760, w: 760, wall: 230 };
      const engine = Engine.create({ gravity: { y: 1.15 } });
      const statics = [
        Bodies.rectangle(tray.x, tray.y + 20, tray.w, 40, { isStatic: true }),
        Bodies.rectangle(tray.x - tray.w / 2 - 15, tray.y - tray.wall / 2, 30, tray.wall, { isStatic: true }),
        Bodies.rectangle(tray.x + tray.w / 2 + 15, tray.y - tray.wall / 2, 30, tray.wall, { isStatic: true }),
      ];
      Composite.add(engine.world, statics);

      // the items: chips of measured-ish width, dropped one by one from above the tray
      const items = content.items.map((label, i) => {
        const w = 52 + label.length * 9.4, hgt = 48;
        return { label, w, hgt, at: 0.5 + i * (content.every ?? 0.32), x: tray.x + (rand() - 0.5) * (tray.w - w - 60), spin: (rand() - 0.5) * 0.25, colour: pal[i % pal.length] };
      });
      // bake: step the engine through the whole timeline, recording each body every frame
      const frames = Math.ceil(D * HZ) + 1;
      const track = items.map(() => new Float32Array(frames * 3).fill(NaN));
      const bodies = items.map(() => null);
      const tipAt = content.tipAt ?? 9.6;
      for (let f = 0; f < frames; f++) {
        const t = f / HZ;
        items.forEach((it, i) => {
          if (!bodies[i] && t >= it.at) {
            bodies[i] = Bodies.rectangle(it.x, -60, it.w, it.hgt, { chamfer: { radius: 14 }, restitution: 0.15, friction: 0.6, angle: it.spin });
            Body.setVelocity(bodies[i], { x: 0, y: 6 });
            Composite.add(engine.world, bodies[i]);
          }
        });
        // at tipAt the tray floor drops away: everything falls out of frame together
        if (Math.abs(t - tipAt) < 0.5 / HZ) Composite.remove(engine.world, statics[0]);
        Engine.update(engine, 1000 / HZ);
        bodies.forEach((b, i) => { if (b) track[i].set([b.position.x, b.position.y, b.angle], f * 3); });
      }

      // DOM: tray, chips, counter, heading
      const trayEl = el("div", "dp-tray", root);
      Object.assign(trayEl.style, { left: tray.x - tray.w / 2 - 30 + "px", top: tray.y - tray.wall + "px", width: tray.w + 60 + "px", height: tray.wall + 40 + "px" });
      el("div", "dp-tray-label", trayEl, content.trayLabel || "Inbox");
      const chips = items.map((it) => {
        const c = el("div", "dp-chip", root);
        Object.assign(c.style, { width: it.w + "px", height: it.hgt + "px", marginLeft: -it.w / 2 + "px", marginTop: -it.hgt / 2 + "px" });
        el("i", "", c).style.background = it.colour;
        el("span", "", c, it.label);
        return c;
      });
      const counter = el("div", "dp-counter", root);
      const count = el("b", "", counter, "0");
      el("span", "", counter, content.counterLabel || "handled");
      const title = el("div", "dp-title", root);
      el("div", "dp-eyebrow", title, content.eyebrow || "");
      el("div", "dp-h", title, content.heading || "");
      return { items, track, chips, frames, tipAt, count, trayEl };
    },

    render(t, S, h) {
      const f = Math.min(S.frames - 1, Math.max(0, Math.round(t * HZ)));
      S.chips.forEach((c, i) => {
        const x = S.track[i][f * 3], y = S.track[i][f * 3 + 1], a = S.track[i][f * 3 + 2];
        if (Number.isNaN(x) || y > H + 200) { c.style.opacity = 0; return; }
        c.style.opacity = 1;
        c.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${a.toFixed(4)}rad)`;
      });
      // the counter counts items that have landed, then the batch that leaves at the tip
      const landed = S.items.filter((it) => t >= it.at + 0.9).length;
      S.count.textContent = String(t >= S.tipAt ? S.items.length : landed);
      // the flap swings open at the tip and closes again before the loop, so the seam is clean
      S.trayEl.style.setProperty("--open", (h.tw(t, S.tipAt - 0.05, 0.3, "snappy") * (1 - h.tw(t, D - 1.0, 0.6, "inOut"))).toFixed(3));
      // in at the start as it went out before the end, so the loop seam has no pop
      S.count.parentNode.style.opacity = (h.tw(t, 0, 0.4, "soft") * (1 - h.tw(t, D - 0.9, 0.5, "inOut"))).toFixed(3);
    },
  });
})();
