/* receipt-printer: messy inputs in, a structured record out (DOM + SVG).
 * Documents of every kind feed into a slot one by one; the printer's light blinks while it works;
 * a receipt unrolls line by line with each extracted field, its value and a confidence score,
 * ends in a schema check and a barcode, then tears off and slides away. Pure in t; seamless loop.
 */
(function () {
  const D = 12, W = 1600, H = 900;
  SiteMotion.scene({
    width: W,
    height: H,
    loop: 0,
    duration: D,
    still: 8.9,
    setup({ root, content, tokens, h }) {
      const { el, svg, rng } = h;
      const pal = tokens.palette;
      root.classList.add("rp");
      const rand = rng(content.seed || 8);

      const copy = el("div", "rp-copy", root);
      el("div", "rp-eyebrow", copy, content.eyebrow || "");
      el("div", "rp-h", copy, content.heading || "");
      el("div", "rp-sub", copy, content.sub || "");

      // inputs: a fan of documents waiting above the slot
      const inputs = content.inputs.map((inp, i) => {
        const card = el("div", "rp-doc", root);
        const icon = el("span", "rp-doc-icon", card, inp.kind);
        icon.style.background = pal[i % pal.length];
        icon.style.color = h.inkOn(pal[i % pal.length]);
        const txt = el("div", "", card);
        el("div", "rp-doc-name", txt, inp.name);
        el("div", "rp-doc-meta", txt, inp.meta || "");
        // ragged "messy" lines under the name
        const lines = el("div", "rp-doc-lines", card);
        for (let k = 0; k < 3; k++) el("i", "", lines).style.width = 40 + rand() * 55 + "%";
        const home = { x: 640 + i * 120, y: 96 + (i % 2) * 34, r: (rand() - 0.5) * 10 };
        return { card, home, at: 0.6 + i * 0.55 };
      });

      // the printer
      const printer = el("div", "rp-printer", root);
      el("div", "rp-slot", printer);
      el("div", "rp-printer-label", printer, content.printerLabel || "extract");
      const led = el("span", "rp-led", printer);
      el("div", "rp-mouth", printer);

      // the receipt: a clipped window that grows as lines print
      const clip = el("div", "rp-clip", root);
      const paper = el("div", "rp-paper", clip);
      const head = el("div", "rp-row rp-head", paper);
      el("span", "", head, content.receipt.title);
      el("span", "", head, content.receipt.date);
      el("div", "rp-rule", paper);
      const rows = content.receipt.fields.map((f) => {
        const r = el("div", "rp-row", paper);
        el("span", "rp-k", r, f.k);
        const v = el("span", "rp-v", r, "");
        const c = el("span", "rp-c", r, f.c != null ? f.c.toFixed(2) : "");
        if (f.c != null && f.c < 0.95) c.classList.add("rp-c-low");
        return { r, v, c, full: f.v, total: !!f.total };
      });
      el("div", "rp-rule", paper);
      const foot = content.receipt.footer.map((line) => el("div", "rp-row rp-foot", paper, line));
      const bars = svg("svg", { viewBox: "0 0 340 46", width: 340, height: 46, class: "rp-bars" }, paper);
      for (let x = 0; x < 340; ) { const w = 1 + Math.floor(rand() * 4); if (rand() > 0.35) svg("rect", { x, y: 0, width: w, height: 46, fill: "currentColor" }, bars); x += w + 1 + Math.floor(rand() * 2); }
      el("div", "rp-serial", paper, content.receipt.serial || "");
      const headBar = el("div", "rp-printhead", root);
      return { inputs, led, clip, paper, rows, foot, headBar, LINE: 34 };
    },

    render(t, S, h) {
      const { tw, typed, lerp, ease } = h;
      // documents fade in, then each flies to the slot and sinks into it
      S.inputs.forEach(({ card, home, at }) => {
        const appear = tw(t, 0.05, 0.4, "soft");
        const fly = tw(t, at, 0.55, "inOut");
        const sink = tw(t, at + 0.5, 0.3, "soft");
        const x = lerp(home.x, 1040, fly), y = lerp(home.y, 218, fly) + sink * 40;
        card.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${lerp(home.r, 0, fly).toFixed(2)}deg) scale(${lerp(1, 0.86, fly).toFixed(3)})`;
        card.style.opacity = (appear * (1 - sink)).toFixed(3);
        card.style.clipPath = `inset(0 0 ${(sink * 100).toFixed(1)}% 0)`;
      });
      // printing: each line takes a beat; the paper grows to show it
      const start = 3.0, per = 0.42, headH = 70;
      const printed = (k) => tw(t, start + k * per, 0.3, "snappy");
      let height = headH * tw(t, start - 0.4, 0.4, "snappy");
      S.rows.forEach((row, k) => {
        const p = printed(k);
        row.v.textContent = typed(row.full, t, start + k * per, 40);
        row.r.style.opacity = p > 0 ? 1 : 0;
        row.c.style.opacity = tw(t, start + k * per + 0.25, 0.2, "soft").toFixed(3);
        height += S.LINE * p;
      });
      const after = start + S.rows.length * per + 0.2;
      S.foot.forEach((f, k) => { const p = tw(t, after + 0.2 + k * 0.4, 0.3, "snappy"); f.style.opacity = p.toFixed(3); height += 30 * p; });
      height += 86 * tw(t, after + 1.2, 0.5, "snappy") + 30 * tw(t, after + 0.05, 0.2); // rule, barcode, serial
      const printing = t > start - 0.4 && t < after + 1.7;
      S.led.classList.toggle("is-on", printing && Math.floor(t * 6) % 2 === 0);
      S.headBar.style.opacity = printing ? 1 : 0;
      S.headBar.style.transform = `translateY(${Math.max(0, height).toFixed(1)}px)`;
      // tear off and slide away, then nothing is left at the seam
      const tear = tw(t, 9.6, 0.9, "inOut");
      S.clip.style.height = Math.max(0, height).toFixed(1) + "px";
      S.clip.style.transform = `translateY(${(ease.inOut(tear) * 120).toFixed(1)}px) rotate(${(tear * 4).toFixed(2)}deg)`;
      S.clip.style.opacity = (1 - tw(t, 9.9, 0.7, "soft")).toFixed(3);
    },
  });
})();
