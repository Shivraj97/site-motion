/* loom--feature: threading a new tool into a loom that is already weaving (Canvas 2D + DOM labels).
 * A close crop of the parent's loom: three tools are woven, the fourth slot on the rod is empty. In the intro the
 * loom stands still while a new spool slides onto the rod and a threading hook draws its warp down through the
 * heddle eyes and the reed to the fell. Weaving resumes, and from the next row on the cloth is four bands wide:
 * the step in the cloth is where the tool joined. The count on the beam is read off the newest row.
 * Loop: the step has rolled past the beam by `loop`; after that the loom weaves 32 rows per loop (twill 4,
 * shuttle 2, weft stripe 16), so the seam lands on the same pattern.
 */
(function () {
  const W = 1600, H = 900, LOOP = 8, D = 16;
  // intro timeline (seconds)
  const SPOOL = 0.2, CHIP = 0.75, HOOK_IN = 1.2;
  const LEGS = [[1.45, 0.6], [2.2, 0.5], [2.85, 0.4]]; // spool → heddle, heddle → reed, reed → fell
  const RELEASE = 3.25, HOOK_OUT = 3.35;
  const T0 = 3.75, RATE = 4; // weaving resumes at T0, four rows a second
  const FIRST = T0 + 1 / RATE; // the first row carrying the new tool lands
  SiteMotion.scene({
    width: W,
    height: H,
    loop: LOOP,
    duration: D,
    still: 5.35, // six new rows woven, the shuttle mid-pass
    setup({ root, content, tokens, h }) {
      const { el, mix } = h;
      const C = tokens.color, pal = tokens.palette;
      root.classList.add("lf");

      // ---- copy (right column) ----
      const copy = el("div", "lf-copy", root);
      el("div", "lf-eyebrow", copy, content.eyebrow || "");
      el("div", "lf-h", copy, content.heading || "");
      el("div", "lf-sub", copy, content.sub || "");
      const list = el("div", "lf-points", copy);
      (content.points || []).forEach((p) => el("div", "lf-point", list, p));

      const canvas = el("canvas", "lf-canvas", root);
      const exporting = document.documentElement.classList.contains("sm-exporting");
      const dpr = exporting ? 1 : Math.min(2, window.devicePixelRatio || 1);
      canvas.width = W * dpr; canvas.height = H * dpr;
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);

      // ---- geometry ----
      const threads = content.threads;
      const per = content.perTool ?? 5, gap = 30;
      const nb = threads.length, n = nb * per;
      const left = 190, right = left + n * gap;
      const fresh = Math.max(0, threads.findIndex((t) => t.new)); // the tool being threaded in
      const rodY = 150, warpTop = 165, heddleY = 300, fell = 500, beam = 756;
      const reedRest = fell - 52;
      const ROW = content.rowHeight ?? 16;
      const bandX = (g) => left + (g * per + per / 2) * gap;
      const warpX = (i) => left + (i + 0.5) * gap;

      // colours: tools from the palette (or a named token); a colour mode on a light brand must not darken them
      const lum = (c) => { const v = c.replace("#", ""); return [0, 2, 4].reduce((s, k, j) => s + parseInt(v.slice(k, k + 2), 16) / 255 * [0.3, 0.59, 0.11][j], 0); };
      const lift = (c) => (h.dir.has("color") && lum(C.paper) > 0.5 && lum(c) < 0.5 ? mix(c, C.paper, 0.4) : c);
      const toolColour = threads.map((th, g) => lift(th.colour ? C[th.colour] || th.colour : pal[(th.palette ?? g) % pal.length]));
      const weft = [mix(C.paper, C.ink, 0.12), mix(C.paper, C.ink, 0.24)];

      // ---- chips: one per tool, above its spool ----
      const chips = threads.map((th, g) => {
        const chip = el("div", "lf-chip" + (g === fresh ? " lf-new" : ""), root);
        chip.style.left = bandX(g) + "px";
        const ring = g === fresh ? el("span", "lf-ring", chip) : null; // lights when the first row carries the tool
        const mark = el("span", "lf-mark", chip, th.mark || th.name.slice(0, 1));
        mark.style.background = toolColour[g];
        mark.style.color = h.inkOn(toolColour[g]);
        const txt = el("span", "lf-txt", chip);
        el("span", "lf-name", txt, th.name);
        const st = el("span", "lf-status", txt);
        const done = el("span", "lf-st lf-done", st, (content.status && content.status.done) || "Connected");
        const pend = g === fresh ? el("span", "lf-st lf-pend", st, (content.status && content.status.pending) || "Threading") : null;
        return { chip, done, pend, ring };
      });

      // ---- the tag that rides the step in the cloth ----
      const tag = el("div", "lf-tag", root);
      el("span", "lf-tag-line", tag);
      el("span", "lf-tag-txt", tag, `${content.firstRow || "First row with"} ${threads[fresh].name}`);

      // ---- the beam label: a count read off the newest row ----
      const beamLabel = el("div", "lf-beam", root);
      Object.assign(beamLabel.style, { left: left - 40 + "px", width: right - left + 80 + "px", top: beam + 34 + "px" });
      const win = el("span", "lf-count", beamLabel);
      const before = el("span", "lf-digit", win, String(nb - 1));
      const after = el("span", "lf-digit", win, String(nb));
      el("span", "lf-count-label", beamLabel, `${content.countLabel || "tools woven in"} · ${content.product || ""}`);

      return { ctx, C, mix, threads, per, gap, nb, n, left, right, fresh, rodY, warpTop, heddleY, fell, beam, reedRest, ROW, bandX, warpX, toolColour, weft, chips, tag, before, after };
    },

    render(t, S, h) {
      const { ctx, C, mix, per, gap, nb, n, left, right, fresh, rodY, warpTop, heddleY, fell, beam, reedRest, ROW, bandX, warpX, toolColour } = S;
      const ui = h.ui;
      ctx.clearRect(0, 0, W, H);

      // ---- the weaving clock: still through the intro, then a continuous number of rows ----
      const rows = t < T0 ? 0 : (t - T0) * RATE;
      const whole = Math.floor(rows), part = rows - whole;
      const scroll = part * ROW;
      const bandsIn = (r) => (r >= 1 ? nb : nb - 1); // rows from 1 on carry the new tool

      // ---- the threading: spool slide, hook path, thread release ----
      const slide = h.tw(t, SPOOL, 0.9, "signature");
      const spoolX = bandX(fresh) + (1 - slide) * 230;
      const legs = LEGS.map(([s, d]) => h.tw(t, s, d, "inOut"));
      const hookStart = warpTop + 24;
      const hookY = legs[2] > 0 ? h.lerp(reedRest, fell, legs[2]) : legs[1] > 0 ? h.lerp(heddleY, reedRest, legs[1]) : h.lerp(hookStart, heddleY, legs[0]);
      const hx = bandX(fresh);
      const passH = h.tw(t, LEGS[0][0] + LEGS[0][1], 0.3, "snappy"); // threads settle into their heddle eyes
      const passR = h.tw(t, LEGS[1][0] + LEGS[1][1], 0.3, "snappy"); // and into their dents in the reed
      const release = h.tw(t, RELEASE, 0.4, "snappy"); // tied on at the fell, the bundle spreads to its width
      const hookIn = h.tw(t, HOOK_IN, 0.3, "soft"), hookOut = h.tw(t, HOOK_OUT, 0.4, "soft");
      const threading = hookIn > 0; // the new warp exists once the hook has caught it

      // ---- loom frame and rod ----
      ctx.fillStyle = mix(C.paper, C.ink, 0.08);
      ctx.fillRect(left - 46, 118, 14, beam - 118 + 40);
      ctx.fillRect(right + 32, 118, 14, beam - 118 + 40);
      ctx.fillStyle = mix(C.paper, C.ink, 0.22);
      ctx.fillRect(left - 40, rodY - 2, right - left + 80 + 180, 4); // the rod runs out past the frame: spools slide on from there

      // heddle shafts behind the warp
      ctx.fillStyle = mix(C.paper, C.ink, 0.14);
      ctx.fillRect(left - 30, heddleY - 40, right - left + 60, 6);
      ctx.fillRect(left - 30, heddleY + 34, right - left + 60, 6);

      // ---- spools: a bobbin per tool, the thread wound in its colour, spinning as it pays out ----
      const spin = (1 - slide) * 230 + (threading ? (hookY - hookStart) * (1 - hookOut) : 0);
      for (let g = 0; g < nb; g++) {
        const cx = g === fresh ? spoolX : bandX(g);
        if (g === fresh && slide <= 0) continue;
        const bw = per * gap * 0.82, bh = 26;
        ctx.save();
        ctx.globalAlpha = g === fresh ? h.clamp(slide * 3) : 1;
        ctx.fillStyle = toolColour[g];
        ctx.fillRect(cx - bw / 2, rodY - bh / 2, bw, bh);
        // winding: helix lines that scroll as the spool turns
        ctx.save();
        ctx.beginPath(); ctx.rect(cx - bw / 2, rodY - bh / 2, bw, bh); ctx.clip();
        ctx.strokeStyle = mix(toolColour[g], C.ink, 0.18);
        ctx.lineWidth = 1.2; // sm-native: wound yarn texture, not an outline
        const ph = g === fresh ? (spin * 0.6) % 7 : 0;
        for (let y = -7; y < bh + 7; y += 7) {
          ctx.beginPath();
          ctx.moveTo(cx - bw / 2, rodY - bh / 2 + y + ph);
          ctx.lineTo(cx + bw / 2, rodY - bh / 2 + y + ph + 3);
          ctx.stroke();
        }
        ctx.restore();
        ctx.fillStyle = mix(C.paper, C.ink, 0.4);
        ctx.beginPath(); ctx.roundRect(cx - bw / 2 - 8, rodY - 20, 8, 40, 3); ctx.fill(); // sm-native: bobbin flange
        ctx.beginPath(); ctx.roundRect(cx + bw / 2, rodY - 20, 8, 40, 3); ctx.fill(); // sm-native: bobbin flange
        ctx.restore();
      }

      // ---- warp: the woven tools run straight from spool to fell ----
      const fullW = gap * 0.42;
      for (let i = 0; i < n; i++) {
        const g = Math.floor(i / per);
        if (g === fresh) continue;
        ctx.strokeStyle = toolColour[g];
        ctx.lineWidth = fullW; // sm-native: warp yarn has a physical width
        ctx.beginPath(); ctx.moveTo(warpX(i), warpTop); ctx.lineTo(warpX(i), fell); ctx.stroke();
      }
      // the new tool's warp: drawn down by the hook, straightened at each station it has passed
      if (threading) {
        ctx.strokeStyle = toolColour[fresh];
        ctx.lineCap = release < 1 ? "round" : "butt";
        ctx.lineWidth = h.lerp(4, fullW, release); // sm-native: pulled taut, then relaxed to full width
        for (let j = 0; j < per; j++) {
          const i = fresh * per + j, x = warpX(i), tipX = hx + (j - (per - 1) / 2) * 2.5;
          ctx.beginPath();
          ctx.moveTo(x, warpTop);
          if (hookY >= heddleY) ctx.lineTo(h.lerp(tipX, x, passH), heddleY);
          if (hookY >= reedRest) ctx.lineTo(h.lerp(tipX, x, passR), reedRest);
          ctx.lineTo(h.lerp(tipX, x, release), hookY);
          ctx.stroke();
        }
        ctx.lineCap = "butt";
      }

      // heddle eyes over the warp: empty rings in the free slot until the hook threads them
      const eyeW = Math.max(1, ui.stroke("fine", 1.5));
      for (let i = 0; i < n; i++) {
        const g = Math.floor(i / per), x = warpX(i), j = i - fresh * per;
        const threaded = g !== fresh || passH > 0;
        ctx.strokeStyle = g === fresh && passH > 0 && passH < 1 ? C.accentInk || C.ink : mix(C.paper, C.ink, threaded ? 0.55 : 0.32);
        ctx.lineWidth = eyeW;
        ctx.beginPath(); ctx.ellipse(x, heddleY, 5, 9, 0, 0, Math.PI * 2); ctx.stroke();
        if (g === fresh) {
          const p = h.tw(t, LEGS[0][0] + LEGS[0][1] + h.motion.stagger(j, 0.07), 0.5, "soft");
          if (p > 0 && p < 1) {
            ctx.strokeStyle = h.alpha(toolColour[fresh], 1 - p);
            ctx.beginPath(); ctx.ellipse(x, heddleY, 5 + p * 10, 9 + p * 12, 0, 0, Math.PI * 2); ctx.stroke();
          }
        }
      }

      // ---- the reed: a comb the warp passes through, beaten forward once per row ----
      const beat = Math.pow(Math.sin(part * Math.PI), 6);
      const reedY = reedRest + beat * 22;
      ctx.fillStyle = mix(C.paper, C.ink, 0.3);
      ctx.fillRect(left - 30, reedY - 18, right - left + 60, 5);
      ctx.fillRect(left - 30, reedY + 13, right - left + 60, 5);
      for (let i = 0; i <= n; i++) ctx.fillRect(left + i * gap - 1, reedY - 13, 2, 26);
      for (let j = 0; j < per; j++) {
        const p = h.tw(t, LEGS[1][0] + LEGS[1][1] + h.motion.stagger(j, 0.07), 0.5, "soft");
        if (p > 0 && p < 1) {
          ctx.fillStyle = h.alpha(toolColour[fresh], 0.55 * (1 - p));
          ctx.fillRect(left + (fresh * per + j) * gap + 1, reedY - 13 - p * 8, gap - 2, 26 + p * 16);
        }
      }

      // ---- cloth: rows below the fell, newest on top; old rows are a band narrower ----
      ctx.save();
      ctx.beginPath(); ctx.rect(left - 24, fell, right - left + 48, beam - fell); ctx.clip();
      const visible = Math.ceil((beam - fell) / ROW) + 2;
      for (let k = 0; k < visible; k++) {
        const r = whole - k;
        const y = fell + k * ROW + scroll;
        const m = ((r % 16) + 16) % 16;
        const bands = bandsIn(r);
        const edge = left + bands * per * gap;
        ctx.fillStyle = S.weft[m < 8 ? 0 : 1];
        ctx.fillRect(left - 14, y, edge - left + 28, ROW);
        for (let i = 0; i < bands * per; i++) {
          if ((((i + r) % 4) + 4) % 4 < 2) { // 2/2 twill
            ctx.fillStyle = toolColour[Math.floor(i / per)];
            ctx.fillRect(left + i * gap + gap * 0.04, y, gap * 0.92, ROW);
          }
        }
        ctx.fillStyle = h.alpha(C.ink, 0.05);
        ctx.fillRect(left - 14, y + ROW - 0.5, edge - left + 28, 0.5);
      }
      ctx.restore();

      // ---- weft being laid and the shuttle (parked at the left while the loom is threaded) ----
      const dir = whole % 2 === 0 ? 1 : -1;
      const ease = part < 0.8 ? h.ease.inOut(part / 0.8) : 1;
      const from = dir > 0 ? left - 60 : right + 60, to = dir > 0 ? right + 60 : left - 60;
      const sx = h.lerp(from, to, ease);
      if (rows > 0) {
        const nm = (((whole + 1) % 16) + 16) % 16;
        ctx.strokeStyle = S.weft[nm < 8 ? 0 : 1];
        ctx.lineWidth = 4; // sm-native: the weft is yarn: its thickness is physical
        ctx.beginPath(); ctx.moveTo(from, fell - 8); ctx.lineTo(sx, fell - 8); ctx.stroke();
      }
      ctx.save();
      ctx.translate(sx, fell - 8);
      ctx.scale(dir, 1);
      ctx.fillStyle = C.ink;
      ctx.beginPath(); ctx.moveTo(30, 0); ctx.quadraticCurveTo(10, -14, -30, -9); ctx.lineTo(-30, 9); ctx.quadraticCurveTo(10, 14, 30, 0); ctx.fill();
      ctx.fillStyle = mix(C.ink, C.paper, 0.35);
      ctx.fillRect(-14, -4, 18, 8);
      ctx.restore();

      // breast beam
      ctx.fillStyle = C.ink;
      ctx.beginPath(); ctx.roundRect(left - 40, beam, right - left + 80, 20, 10); ctx.fill(); // sm-native: a beam is round

      // ---- the threading hook, on top of everything ----
      const hookA = hookIn * (1 - hookOut);
      if (hookA > 0) {
        const hy = hookY - (1 - hookIn) * 14 + hookOut * 24;
        ctx.save();
        ctx.globalAlpha = hookA;
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 3; // sm-native: a steel hook, not an outline
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(hx, hy - 76);
        ctx.lineTo(hx, hy - 2);
        ctx.quadraticCurveTo(hx, hy + 6, hx + 6, hy + 3);
        ctx.lineTo(hx + 8, hy - 6);
        ctx.stroke();
        ctx.fillStyle = mix(C.ink, C.paper, 0.25);
        ctx.beginPath(); ctx.roundRect(hx - 6, hy - 100, 12, 28, 6); ctx.fill(); // sm-native: the hook's handle
        ctx.restore();
      }

      // ---- DOM: chips, the step tag, the count ----
      S.chips.forEach(({ chip, done, pend, ring }, g) => {
        if (g !== S.fresh) return;
        const inP = h.tw(t, CHIP, 0.45, "snappy");
        chip.style.opacity = inP.toFixed(3);
        chip.style.transform = `translate(-50%, ${((1 - inP) * -16).toFixed(2)}px)`;
        const sw = h.tw(t, FIRST, 0.4, "snappy");
        pend.style.opacity = (1 - sw).toFixed(3);
        pend.style.transform = `translateY(${(-sw * 14).toFixed(2)}px)`;
        done.style.opacity = sw.toFixed(3);
        done.style.transform = `translateY(${((1 - sw) * 14).toFixed(2)}px)`;
        ring.style.opacity = sw.toFixed(3);
      });
      // the tag rides the step between the first new row and the old cloth
      const stepY = fell + whole * ROW + scroll;
      const tagA = h.tw(t, FIRST, 0.4, "snappy") * (1 - h.clamp((stepY - (beam - 70)) / 50));
      S.tag.style.opacity = (rows >= 1 ? tagA : 0).toFixed(3);
      S.tag.style.transform = `translate(${right + 16}px, ${(stepY - 9).toFixed(2)}px)`;
      // the count is the number of bands in the newest woven row
      const flip = h.tw(t, FIRST, 0.4, "snappy");
      S.before.style.transform = `translateY(${(-flip * 100).toFixed(2)}%)`;
      S.after.style.transform = `translateY(${((1 - flip) * 100).toFixed(2)}%)`;
      S.before.style.opacity = (1 - flip).toFixed(3);
      S.after.style.opacity = flip.toFixed(3);
    },
  });
})();
