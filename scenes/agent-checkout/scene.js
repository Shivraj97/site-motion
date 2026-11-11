// @vendor ui-kit
/* agent-checkout: one agent's virtual card doing the one job it exists for.
 * A purchase request comes in and the limit meter marks exactly that amount. The agent's pointer hits Autofill, the
 * camera moves in and the checkout fills field by field with a masked card. It pays; the camera pulls back, the meter
 * closes over the marked amount and the receipt slides out of the checkout into a gap the list opens for it, then
 * folds down into an ordinary row. Spent is the sum of the rows and the amount is the sum of the receipt's lines, so
 * every figure on screen adds up. Cursor, camera and times live in content.json.
 */
(function () {
  const D = 13.2;
  const ROW = 70, TALL = 186, LIST_W = 608, GAP = 20; // a list row, the open receipt, the list card, the gap beside it
  const cents = (v) => Math.round(v * 100);
  const sum = (list, f) => list.reduce((s, x) => s + cents(f(x)), 0);

  SiteMotion.scene({
    width: 1600,
    height: 900,
    duration: D,
    loop: 0,
    still: 8.7,
    setup({ root, content, tokens, h }) {
      const { el } = h;
      const c = content;
      const plain = (n) => (n / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const money = (n) => c.currency + plain(n);
      root.classList.add("aco");
      el("div", "aco-glow", root);
      const kit = SMUI.kit({ root, h, tokens, width: 1600, height: 900 });
      const app = kit.frame("browser", { url: c.url, x: 120, y: 48, w: 1360, h: 900 });

      // the sums every figure is drawn from
      const amount = sum(c.receipt.lines, (l) => l.v);
      const spent = sum(c.transactions, (x) => x.amount);
      const limit = cents(c.meter.limit);

      // ---------- sidebar ----------
      const side = el("div", "aco-side", app.body);
      const brand = el("div", "aco-brand", side);
      el("span", "aco-mark", brand, c.brand.text);
      el("span", "", brand, c.brand.name);
      c.nav.forEach((n, i) => {
        const item = el("div", "aco-nav" + (i === c.active ? " is-active" : ""), side);
        el("i", "", item);
        kit.label(item, n);
      });
      const quiet = el("div", "aco-side-foot", side);
      kit.lines(quiet, ["72%", "48%", "60%"]);

      // ---------- header ----------
      const head = el("div", "aco-head", app.body);
      kit.avatar(head, c.agent.name, { size: 44, i: 2 });
      const who = el("div", "aco-who", head);
      el("div", "aco-h1", who, c.agent.name);
      kit.label(who, c.agent.role, { cls: "aco-role" });
      kit.badge(head, c.agent.status, { tone: "good" });
      const acts = el("div", "aco-acts", head);
      c.actions.forEach((a) => kit.button(acts, a));

      // ---------- the card itself ----------
      const vcard = el("div", "aco-vcard", app.body);
      el("i", "aco-vcard-arc", vcard);
      const vtop = el("div", "aco-vcard-top", vcard);
      el("span", "aco-vcard-mark", vtop, c.brand.text);
      el("span", "", vtop, c.card.kind);
      el("div", "aco-vcard-num", vcard, c.card.number);
      const vfoot = el("div", "aco-vcard-foot", vcard);
      el("span", "", vfoot, c.card.holder);
      el("span", "", vfoot, c.card.expiry);

      // ---------- the limit meter ----------
      const meter = kit.card(app.body, { cls: "aco-meter", name: "meter" });
      const mtop = el("div", "aco-meter-top", meter);
      el("span", "aco-label", mtop, c.meter.label);
      const okBadge = kit.badge(mtop, c.meter.ok, { tone: "good" });
      const figure = el("div", "aco-figure", meter);
      // the currency sits outside the roll: a roll sizes each cell by its old character, and a figure losing a digit would squeeze it
      const spentNum = el("span", "", figure, c.currency);
      const spentRoll = kit.roll(spentNum);
      el("span", "aco-of", figure, `${c.meter.of} ${money(limit)}`);
      const left = el("div", "aco-left", meter);
      el("span", "aco-label", left, c.meter.left);
      const leftRoll = kit.roll(el("b", "", left, c.currency));
      const bar = el("div", "aco-bar", meter);
      const hold = el("i", "aco-hold", bar);
      const fill = el("i", "aco-fill", bar);
      const seg = el("i", "aco-seg", bar);
      const delta = el("span", "aco-delta", meter, "+" + money(amount));
      const scale = el("div", "aco-scale", meter);
      for (let i = 0; i <= 4; i++) el("span", "", scale, c.currency + ((c.meter.limit * i) / 4).toLocaleString("en-US"));

      // ---------- checkout ----------
      const checkout = kit.card(app.body, { cls: "aco-checkout" });
      const reqBox = el("div", "aco-req", checkout);
      const reqTop = el("div", "aco-req-top", reqBox);
      el("span", "aco-label", reqTop, c.request.label);
      const reqFrom = el("span", "aco-req-from", reqTop, c.request.from);
      const flash = el("i", "aco-flash", reqBox);
      const idle = el("div", "aco-req-idle", reqBox);
      kit.label(idle, c.request.idle);
      const active = el("div", "aco-req-on", reqBox);
      kit.avatar(active, c.request.merchant, { size: 46, i: 3 });
      const reqMain = el("div", "aco-req-main", active);
      el("b", "", reqMain, c.request.merchant);
      el("span", "", reqMain, c.request.item);
      el("div", "aco-req-amt", active, money(amount));

      const form = el("div", "aco-form", checkout);
      form.dataset.ui = "form";
      const formTop = el("div", "aco-form-top", form);
      el("span", "aco-form-title", formTop, c.form.title);
      kit.button(formTop, c.form.autofill, { name: "autofill" });
      const grid = el("div", "aco-grid", form);
      const fields = c.form.fields.map((f, i) => {
        const wrap = el("label", "aco-fw aco-fw-" + i, grid);
        el("span", "aco-flabel", wrap, f.label);
        const field = kit.field(wrap, "aco-field");
        field.node.dataset.ui = "field-" + i;
        const tint = el("i", "aco-tint", field.node);
        const ring = el("i", "aco-ring", field.node);
        const tick = el("i", "aco-tick", field.node);
        field.node.prepend(tint);
        return { field, tint, ring, tick };
      });
      const pay = kit.button(form, "", { primary: true, name: "pay" });
      pay.classList.add("aco-pay");
      const payBg = el("i", "aco-pay-bg", pay);
      const payIdle = el("span", "aco-pay-idle", pay, c.form.pay);
      const payReady = el("span", "aco-pay-on", pay, `${c.form.pay} ${money(amount)}`);
      const paySpin = el("span", "aco-spin", pay);
      const payDone = el("span", "aco-pay-on", pay);
      el("i", "aco-check", payDone);
      el("span", "", payDone, `${c.form.paid} ${money(amount)}`);

      const rail = el("div", "aco-steps", checkout);
      const steps = c.steps.map((s, i) => {
        if (i) { const line = el("span", "aco-step-line", rail); var run = el("i", "", line); }
        const step = el("span", "aco-step", rail);
        const dot = el("span", "aco-dot", step);
        const on = el("i", "aco-check", dot);
        const text = el("span", "", step, s);
        return { on, text, run };
      });

      // ---------- transactions ----------
      const list = kit.card(app.body, { cls: "aco-list" });
      const listTop = el("div", "aco-list-top", list);
      el("span", "aco-form-title", listTop, c.transactionsTitle);
      const countChip = kit.chip(listTop, "");
      const count = kit.roll(countChip);
      const rows = el("div", "aco-rows", list);
      const txRow = (parent, x, tone, i) => {
        const r = kit.row(parent, {
          lead: (n) => kit.avatar(n, x.merchant, { size: 36, i }),
          text: x.merchant,
          sub: x.sub,
          trail: (n) => { n.className = "aco-trail"; kit.badge(n, x.status, { tone }); el("b", "aco-amt", n, money(x.amt)); },
        });
        r.classList.add("aco-tx");
        return r;
      };
      const old = c.transactions.map((x, i) => txRow(rows, { ...x, amt: cents(x.amount) }, "neutral", i));
      const footer = el("div", "aco-tx aco-foot", rows);
      kit.label(footer, c.footer);
      old.push(footer);

      // ---------- the receipt: the same element is paper while open and a row once folded ----------
      const slot = el("div", "aco-slot", app.body);
      const receipt = el("div", "aco-rcpt", slot);
      const paper = el("div", "aco-paper", receipt);
      const tear = el("i", "aco-tear", receipt);
      const zig = ["0 0", "100% 0"];
      for (let x = LIST_W, up = false; x >= 0; x -= 8, up = !up) zig.push(`${x}px ${up ? 0 : 100}%`);
      tear.style.clipPath = `polygon(${zig.join(",")})`;
      const glow = el("i", "aco-new", paper);
      txRow(paper, { merchant: c.request.merchant, sub: c.receipt.sub, status: c.receipt.status, amt: amount }, "good", 3);
      const detail = el("div", "aco-detail", paper);
      const colA = el("div", "", detail), colB = el("div", "", detail);
      const line = (col, k, v, cls) => { const r = el("div", "aco-line" + (cls ? " " + cls : ""), col); el("span", "", r, k); el("b", "", r, v); };
      c.receipt.lines.forEach((l) => line(colA, l.k, money(cents(l.v))));
      line(colA, c.receipt.total, money(amount), "is-total");
      c.receipt.meta.forEach((m) => line(colB, m.k, m.v));
      const lip = el("i", "aco-lip", app.body);

      kit.cursor(c.cursor, { start: [760, 520], label: c.agent.name, hidden: true });
      kit.camera(c.camera);
      return { kit, content: c, plain, amount, spent, limit, idle, active, reqFrom, fields, pay, payBg, payIdle, payReady, paySpin, payDone, steps, spentRoll, leftRoll, okBadge, hold, fill, seg, flash, delta, rows: old, count, receipt, tear, detail, glow, lip };
    },

    render(t, S, h) {
      const { tw, span, clamp, lerp } = h;
      const c = S.content, T = c.times, R = T.reset, kit = S.kit;
      kit.render(t);
      const out = (d = 0, len = 0.5) => 1 - tw(t, R + d, len, "inOut"); // everything lets go at the reset

      // the moments everything answers to
      const fillAt = kit.clickedAt("autofill") ?? 2;
      const payAt = kit.clickedAt("pay") ?? 4.85;
      const paidAt = payAt + T.spin;
      const settled = paidAt + 0.85;
      const receiptAt = paidAt + T.receipt;

      // the request arrives in its slot and marks its amount on the meter
      const req = tw(t, T.request, 0.5, "snappy") * out();
      kit.swap(S.idle, S.active, req, 14);
      S.flash.style.opacity = (kit.bump(t, T.request, 1.3) * 0.9).toFixed(3);
      S.reqFrom.style.opacity = req.toFixed(3);

      // autofill: one field after the next; each flashes a ring while it fills and keeps a tint and a tick
      const cleared = t >= R + 0.35;
      c.form.fields.forEach((f, i) => {
        const F = S.fields[i], start = fillAt + T.fields[i], end = start + f.value.length / T.cps;
        kit.type(F.field, cleared ? 0 : t, f.value, start, { placeholder: f.placeholder, cps: T.cps, blurAt: end + 0.1 });
        F.field.text.style.opacity = (cleared ? tw(t, R + 0.35, 0.3, "soft") : out(0, 0.3)).toFixed(3);
        F.ring.style.opacity = span(t, start - 0.08, end + 0.1, 0.12, 0.2).toFixed(3);
        F.tint.style.opacity = (tw(t, start, 0.3, "soft") * out(0, 0.35)).toFixed(3);
        const tick = tw(t, end + 0.04, 0.3, "signature") * out(0, 0.3);
        F.tick.style.opacity = tick.toFixed(3);
        F.tick.style.transform = `scale(${(0.6 + tick * 0.4).toFixed(3)})`;
      });

      // pay: wakes when the form is complete, pressed by the click, a short spinner, then confirmed until the reset
      const last = c.form.fields.length - 1;
      const ready = tw(t, fillAt + T.fields[last] + 0.3, 0.35, "snappy") * out(0, 0.35);
      const done = tw(t, paidAt + 0.1, 0.35, "snappy") * out(0, 0.3);
      S.payBg.style.opacity = ready.toFixed(3);
      S.payIdle.style.opacity = (1 - ready).toFixed(3);
      S.payReady.style.opacity = (ready * (1 - tw(t, payAt + 0.03, 0.14, "soft"))).toFixed(3);
      S.paySpin.style.opacity = span(t, payAt + 0.06, paidAt, 0.14, 0.14).toFixed(3);
      S.paySpin.style.transform = `rotate(${((t - payAt) * 540).toFixed(1)}deg)`;
      S.payDone.style.opacity = done.toFixed(3);
      S.payDone.style.transform = `translateY(${((1 - done) * 8).toFixed(2)}px)`;

      // the meter: marked on request, and the fill closes over the mark on payment, moving by exactly the amount
      const pct = (n) => (n / S.limit) * 100;
      const mark = tw(t, T.request + 0.3, 0.5, "snappy") * out(0.2, 0.4);
      const move = tw(t, paidAt + 0.08, 0.75, "inOut") * out(0, 0.7);
      S.hold.style.left = pct(S.spent).toFixed(3) + "%";
      S.hold.style.width = (pct(S.amount) * mark).toFixed(3) + "%";
      S.fill.style.width = pct(S.spent).toFixed(3) + "%";
      S.seg.style.left = S.hold.style.left;
      S.seg.style.width = (pct(S.amount) * move).toFixed(3) + "%";
      S.delta.style.left = `calc(18px + (100% - 36px) * ${((S.spent + S.amount / 2) / S.limit).toFixed(4)})`;
      S.delta.style.opacity = mark.toFixed(3);
      S.delta.style.transform = `translate(-50%, ${((1 - mark) * 6).toFixed(2)}px)`;
      S.spentRoll.render(S.plain(S.spent), S.plain(S.spent + S.amount), move);
      S.leftRoll.render(S.plain(S.limit - S.spent), S.plain(S.limit - S.spent - S.amount), move);

      // the receipt: the list opens a gap, the paper slides out of the checkout into it, later folds into a row
      const open = tw(t, receiptAt, 0.5, "snappy");
      const slide = tw(t, receiptAt + 0.14, 0.8, "signature");
      const fold = tw(t, receiptAt + T.fold, 0.55, "inOut");
      const leave = tw(t, R, 0.5, "inOut");
      const height = lerp(TALL, ROW, fold);
      const pushed = (height + (1 - fold) * 16) * open * (1 - leave); // the open paper's torn edge gets its own room
      S.rows.forEach((r, i) => { r.style.transform = `translateY(${(i * ROW + pushed).toFixed(2)}px)`; });
      S.receipt.style.height = (height * (1 - leave)).toFixed(2) + "px"; // it leaves by closing, with the rows rising under it
      S.receipt.style.transform = `translateX(${lerp(-(LIST_W + GAP), 0, slide).toFixed(2)}px)`;
      S.receipt.style.opacity = (slide > 0 ? 1 - leave : 0).toFixed(3);
      S.receipt.style.setProperty("--aco-lift", (1 - fold).toFixed(3));
      S.tear.style.opacity = (1 - fold).toFixed(3);
      S.detail.style.opacity = clamp(1 - fold * 1.8).toFixed(3);
      S.glow.style.opacity = fold.toFixed(3);
      S.lip.style.opacity = span(t, receiptAt + 0.05, receiptAt + 0.95, 0.2, 0.4).toFixed(3);

      // the steps tick as each thing is true
      const logged = receiptAt + 0.75;
      const at = [paidAt, settled, logged].map((v) => tw(t, v, 0.4, "signature") * out(0, 0.4));
      S.steps.forEach((s, i) => {
        s.on.style.opacity = at[i].toFixed(3);
        s.on.style.transform = `scale(${(0.5 + at[i] * 0.5).toFixed(3)})`;
        s.text.style.color = `color-mix(in srgb, var(--c-ink) ${(at[i] * 100).toFixed(0)}%, var(--c-muted))`;
        if (s.run) s.run.style.transform = `scaleX(${at[i].toFixed(3)})`;
      });
      S.okBadge.style.opacity = at[1].toFixed(3);
      S.okBadge.style.transform = `translateY(${((1 - at[1]) * 6).toFixed(2)}px)`;
      const n = c.transactions.length;
      S.count.render(String(n), String(n + 1), at[2]);
    },
  });
})();
