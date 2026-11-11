// @vendor ui-kit
/* phone-stack: the moment a product reaches someone, on the screen it reaches them on.
 * A phone's lock screen. Notifications land one by one, newest on top, and each arrival sends a ring of signal
 * outward behind the phone (the only decoration, and it means something: this just reached you). The camera
 * leans in, a finger taps the newest, and it opens into the app: the screen is revealed from the card's own
 * rectangle outward, so the notification becomes the page. A swipe home closes it, the stack clears, and the lock
 * screen is back to its first frame.
 */
(function () {
  const D = 12;
  const PHONE = { x: 600, y: 40, w: 400, h: 820 };
  const SW = 378, SH = 798; // the screen inside the bezel
  const CARD = { x: 16, y: 318, w: 346, h: 86, gap: 10 };

  SiteMotion.scene({
    width: 1600,
    height: 900,
    duration: D,
    loop: 0,
    still: 4.4,
    setup({ root, content, tokens, h }) {
      const { el } = h;
      root.classList.add("ps");
      const kit = SMUI.kit({ root, h, tokens, width: 1600, height: 900 });
      // signal rings sit in the world, behind the phone, centred on it
      const rings = content.notes.map(() => el("div", "ps-ring", kit.world));
      const phone = kit.frame("phone", { ...PHONE, time: content.time, name: "phone", float: true }); // the swipe home needs the whole device in view
      const scr = phone.screen;
      scr.classList.add("ps-screen");
      scr.querySelector(".ui-home").dataset.ui = "home";
      const swipe = el("i", "ps-mark", scr);
      swipe.dataset.ui = "swipe";

      // ---------- lock screen ----------
      const lock = el("div", "ps-lock", scr);
      el("div", "ps-date", lock, content.date);
      el("div", "ps-time", lock, content.time);
      const cards = content.notes.map((n, i) => {
        const card = el("div", "ps-note", lock);
        card.dataset.ui = "note-" + i;
        el("span", "ps-icon", card, content.app.text);
        const txt = el("div", "ps-note-txt", card);
        const top = el("div", "ps-note-top", txt);
        el("span", "", top, content.app.name);
        el("span", "", top, content.now);
        el("b", "", txt, n.title);
        el("span", "ps-note-body", txt, n.body);
        return card;
      });

      // ---------- the app, opened from the newest notification ----------
      const s = content.screen;
      const app = el("div", "ps-app", scr);
      const body = el("div", "ps-app-body", app);
      el("div", "ps-back", body, "‹ " + s.back);
      el("div", "ps-eyebrow", body, s.eyebrow);
      el("div", "ps-amount", body, s.amount);
      el("div", "ps-to", body, s.to);
      const steps = el("div", "ps-steps", body);
      steps.dataset.ui = "steps";
      const rail = el("i", "ps-rail", steps);
      const railFill = el("i", "ps-rail-fill", steps);
      const stepNodes = s.steps.map((st, i) => {
        const row = el("div", "ps-step", steps);
        const dot = el("span", "ps-step-dot", row);
        const t = el("div", "", row);
        el("b", "", t, st.label);
        el("span", "", t, st.when);
        return { row, dot };
      });
      el("div", "ps-btn", body, s.button);

      kit.cursor(content.cursor, { kind: "touch", hidden: true, start: [800, 760] });
      kit.camera(content.camera);
      return { kit, content, rings, cards, lock, app, body, rail, railFill, stepNodes };
    },

    render(t, S, h) {
      const { tw, span, clamp, lerp } = h;
      const c = S.content, T = c.times, notes = c.notes;
      S.kit.render(t);
      const open = c.notes.length - 1; // the newest is the one that opens

      // rings: each arrival sends one out, growing and fading over 1.8 s
      S.rings.forEach((ring, i) => {
        const p = clamp((t - notes[i].at) / 1.8);
        ring.style.opacity = (p > 0 && p < 1 ? 0.9 * (1 - h.ease.soft(p)) : 0).toFixed(3);
        ring.style.transform = `scale(${(0.55 + h.ease.signature(p) * 1.25).toFixed(4)})`;
      });

      // the stack: newest on top; a card makes room for every card that arrives after it.
      // The opened card leaves the stack as it becomes the app; at the clear, all of them lift away.
      const arrive = notes.map((n) => tw(t, n.at, 0.65, "signature"));
      const opened = tw(t, T.open, 0.3, "soft");
      const clear = (i) => tw(t, T.clear + (notes.length - 1 - i) * 0.08, 0.5, "inOut");
      S.cards.forEach((card, i) => {
        let below = 0;
        for (let j = i + 1; j < notes.length; j++) below += arrive[j] * (j === open ? 1 - tw(t, T.close + 0.1, 0.45, "snappy") : 1);
        const a = arrive[i], gone = clear(i);
        const leave = i === open ? opened : 0; // read: it stays gone once opened
        const y = CARD.y + below * (CARD.h + CARD.gap) - (1 - a) * 26 - gone * 30;
        card.style.transform = `translateY(${y.toFixed(2)}px) scale(${(0.95 + 0.05 * a).toFixed(4)})`;
        card.style.opacity = (a * (1 - leave) * (1 - gone)).toFixed(3);
      });

      // the app: revealed from the tapped card's rectangle out to the whole screen, then closed by the swipe home
      const grow = tw(t, T.open, 0.55, "signature"), shut = tw(t, T.close, 0.45, "snappy");
      const r0 = { top: CARD.y, left: CARD.x, right: SW - CARD.x - CARD.w, bottom: SH - CARD.y - CARD.h };
      const k = grow * (1 - shut);
      const inset = (side) => lerp(r0[side], 0, k).toFixed(1) + "px";
      const radius = lerp(22, 47, k).toFixed(1);
      S.app.style.clipPath = `inset(${inset("top")} ${inset("right")} ${inset("bottom")} ${inset("left")} round ${radius}px)`;
      // the app fades up over the card while the card fades out, so the notification never vanishes in one frame
      S.app.style.opacity = (tw(t, T.open, 0.22, "soft") * (1 - shut)).toFixed(3);
      S.app.style.transform = `scale(${(1 - shut * 0.08).toFixed(4)})`;
      const inside = tw(t, T.open + 0.25, 0.5, "signature") * (1 - shut);
      S.body.style.opacity = inside.toFixed(3);
      S.body.style.transform = `translateY(${((1 - inside) * 16).toFixed(2)}px)`;
      S.lock.style.opacity = (1 - k * 0.6).toFixed(3);

      // payout progress: the rail fills to the current step after the screen settles
      const done = c.screen.done, steps = c.screen.steps.length;
      const fill = tw(t, T.open + 0.6, 0.8, "inOut") * (1 - shut);
      S.railFill.style.transform = `scaleY(${((done / (steps - 1)) * fill).toFixed(4)})`;
      // each step lights as the rail reaches it (a continuous --on, so nothing snaps between frames)
      S.stepNodes.forEach((st, i) => {
        const on = i === 0 ? inside : clamp((fill * done - i) * 5 + 1);
        st.row.style.setProperty("--on", on.toFixed(3));
      });
    },
  });
})();
