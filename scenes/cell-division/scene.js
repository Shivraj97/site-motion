/* cell-division: database branching as a dividing cell (Canvas 2D metaball membrane, DOM tags).
 * The cell "main" holds four organelles that are tables. It buds two daughters, each tagged with a branch name; a
 * daughter's tables are dashed outlines because they are references to the parent's data (copy-on-write: 0 bytes
 * copied). On one branch the orders table is changed: it turns solid (now its own copy), recolours and grows a
 * column. The other branch is discarded and dissolves; nothing needs cleaning up because it owned nothing. The
 * changed branch moves back and its membrane fuses with main's; main's orders table now carries the column.
 * The log under the copy times the split from the visual itself (it lands on content.branchSeconds).
 *
 * The membrane is a metaball field sampled on a 4 px grid each frame from the cell centres at t: the inside is
 * filled from an ImageData scaled up smoothly, the outline is a marching-squares iso line stroked in ink.
 * Pure in t; loop: 0. Before the seam the merged change settles back and the log clears.
 */
(function () {
  const W = 1600, H = 900, D = 15, TAU = Math.PI * 2;
  const GX0 = 620, GY0 = 96, GS = 4, GW = Math.ceil((1520 - GX0) / GS) + 1, GH = Math.ceil((840 - GY0) / GS) + 1;
  const ISO = 0.2, SPAN = 1.55; // kernel reach = SPAN × radius puts the iso line at the radius
  const MAIN = [945, 480], RM = 165, RB = 106;
  const TARGET = [[1318, 238], [1318, 722]];
  // timeline
  const PREP = 1.0, SPLIT = 1.6, TINKER = 3.4, DISCARD = 5.4, MERGE = 7.4, MERGE_DUR = 1.8, RESET = 12.3;
  const OFFS = [[-62, -48], [60, -40], [-54, 52], [58, 58]]; // table slots in a cell, at main's scale
  const TW = 86, TH = 58;

  const hexRgb = (c) => { const m = c.replace("#", ""); const v = m.length === 3 ? m.split("").map((x) => x + x).join("") : m; return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)); };
  const lum = (c) => { const [r, g, b] = hexRgb(c); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
  const pack = (c, a = 1) => { const [r, g, b] = hexRgb(c); return ((Math.round(a * 255) << 24) | (b << 16) | (g << 8) | r) >>> 0; };

  SiteMotion.scene({
    width: W, height: H, duration: D, loop: 0, still: 10.6,

    async setup({ root, content, tokens, h }) {
      const { el, mix } = h;
      const C = tokens.color, pal = tokens.palette;
      const dark = lum(C.paper) < 0.4;
      root.classList.add("cd");
      const canvas = el("canvas", "cd-canvas", root);
      const exporting = document.documentElement.classList.contains("sm-exporting");
      const dpr = exporting ? 1 : Math.min(2, window.devicePixelRatio || 1);
      canvas.width = W * dpr; canvas.height = H * dpr;
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);
      const off = document.createElement("canvas");
      off.width = GW; off.height = GH;
      const octx = off.getContext("2d");
      const img = octx.createImageData(GW, GH);
      const px = new Uint32Array(img.data.buffer);
      const mono = (tokens.font && tokens.font.mono) || "monospace";
      const tableFont = `500 12px ${mono}`;
      try { await document.fonts.load(tableFont, "orders"); } catch (e) { /* the fallback face will do */ }

      const copy = el("div", "cd-copy", root);
      el("div", "cd-eyebrow", copy, content.eyebrow || "");
      el("div", "cd-h", copy, content.heading || "");
      el("div", "cd-sub", copy, content.sub || "");

      const tables = (content.tables || []).slice(0, 4);
      const changeJ = Math.min(tables.length - 1, content.changeTable ?? 1);
      const branches = content.branches || ["preview", "fix"];
      const readable = (c, against) => { let x = c; for (let k = 0; k < 6 && Math.abs(lum(x) - lum(against)) < 0.2; k++) x = mix(x, dark ? "#ffffff" : C.ink, 0.18); return x; };
      const cyto = dark ? mix(C.accentInk || C.accent, C.surface, 0.62) : mix(pal[0], C.surface, 0.35);
      const cortex = dark ? mix(C.accentInk || C.accent, C.surface, 0.38) : mix(pal[0], C.ink, 0.06);
      const tcol = tables.map((_, i) => readable(pal[(i + 2) % pal.length], cyto));
      const changed = mix(C.accent, C.surface, dark ? 0.1 : 0.05);

      // ---- tags ----
      const branchIcon = (parent) => {
        const s = h.svg("svg", { width: 14, height: 14, viewBox: "0 0 14 14", fill: "none" }, parent);
        const at = h.ui.strokeAttrs("regular", 1.5, C.ink);
        h.svg("circle", { cx: 4, cy: 3, r: 1.8, ...at }, s); h.svg("circle", { cx: 4, cy: 11, r: 1.8, ...at }, s); h.svg("circle", { cx: 10.5, cy: 5, r: 1.8, ...at }, s);
        h.svg("path", { d: "M4 4.8 V9.2 M10.5 6.8 C10.5 9 6 8 4.6 9.6", "stroke-linecap": "round", ...at }, s);
      };
      const mainTag = el("div", "cd-tag main", root, content.main || "main");
      const notes = [content.mergedNote || "merged", content.discardedNote || "discarded"];
      const tags = branches.slice(0, 2).map((b, i) => { const node = el("div", "cd-tag", root); branchIcon(node); el("span", "cd-tag-name", node, b); const note = el("span", "cd-tag-note", node, notes[i]); return { node, note }; });
      const chip = el("div", "cd-chip", root, content.changeTag || "+ column");
      chip.style.background = C.accentFill || C.accent;
      chip.style.color = Math.abs(lum(C.accent) - lum(C.ink)) > Math.abs(lum(C.accent) - lum(C.paper)) ? C.ink : C.paper;

      // ---- the log: one line per event, the split timed from the visual ----
      const L = content.log || {};
      const fill = (s) => (s || "").replace("{main}", content.main || "main");
      const log = el("div", "cd-log", root);
      const line = (colour, text) => { const n = el("div", "cd-line", log); const i = el("i", "", n); i.style.setProperty("--c", colour); const s = el("span", "", n); s.textContent = text; return { n, s }; };
      const lBranch = line(C.ink, "");
      const lChange = line(C.accent, fill(L.change).replace("{branch}", branches[0]));
      const lDiscard = line(C.faint || C.muted, fill(L.discard).replace("{branch}", branches[1] || ""));
      const lMerge = line(C.accentInk || C.ink, fill(L.merge).replace("{branch}", branches[0]));
      const branchTpl = fill(L.branch || "branched in {s} s");

      // ---- vesicles: small dots drifting in the cytoplasm, whole cycles per loop ----
      const r = h.rng(content.seed ?? 3);
      const ves = Array.from({ length: 9 }, () => ({ a: r() * TAU, d: 0.35 + r() * 0.5, sp: 1 + Math.floor(r() * 2), s: 2.5 + r() * 2.5 }));
      const bubbles = Array.from({ length: 16 }, () => ({ a: r() * TAU, d: 20 + r() * 70, up: 40 + r() * 60, s: 3 + r() * 5, dl: r() * 0.5 }));

      return {
        ctx, octx, off, img, px, f: new Float32Array(GW * GH), tables, changeJ, branches, tcol, changed, cyto, cortex, tableFont,
        cytoPx: pack(cyto), cortexPx: pack(cortex), mainTag, tags, chip, lBranch, lChange, lDiscard, lMerge, branchTpl, ves, bubbles, content, C, dark,
      };
    },

    render(t, S, h) {
      const { ctx, f, px, C } = S;
      const { tw, clamp, lerp, ease, ui, mix } = h;
      ctx.clearRect(0, 0, W, H);
      const INK = ui.strokeColor(C.ink);
      const stroke = (w, c) => { if (w > 0) { ctx.lineWidth = w; ctx.strokeStyle = c; ctx.stroke(); } };
      const labelsIn = tw(t, 0, 0.6, "soft") * (1 - tw(t, RESET, 0.6, "inOut"));

      // ---- where everything is at t ----
      const split = tw(t, SPLIT, 0.8, "signature"); // the buds pinch off in exactly branchSeconds
      const gone = tw(t, DISCARD, 1.3, "inOut"); // fix/login dissolves
      const back = tw(t, MERGE, MERGE_DUR, "inOut"); // preview/new-checkout comes home
      const fuse = tw(t, MERGE + MERGE_DUR * 0.55, MERGE_DUR * 0.55, "soft"); // its field is absorbed
      const tinker = tw(t, TINKER, 0.9, "snappy");
      const merged = tw(t, MERGE + MERGE_DUR - 0.35, 0.5, "snappy") * (1 - tw(t, RESET + 0.2, 0.9, "inOut"));
      const bob = (k) => Math.sin((t / D) * TAU * 2 + k) * 3; // two slow breaths per loop
      const cells = [];
      const mainR = RM + 10 * Math.sin(Math.PI * fuse);
      cells.push({ x: MAIN[0], y: MAIN[1] + bob(0) * 0.5, R: mainR, w: 1 });
      const live = t >= SPLIT - 0.25;
      if (live) {
        TARGET.forEach((tg, b) => {
          const dir = [tg[0] - MAIN[0], tg[1] - MAIN[1]], len = Math.hypot(dir[0], dir[1]);
          const start = [MAIN[0] + (dir[0] / len) * 30, MAIN[1] + (dir[1] / len) * 30];
          let x = lerp(start[0], tg[0], split), y = lerp(start[1], tg[1], split) + bob(b + 1) * split;
          let R = lerp(60, RB, clamp(split * 1.4)), w = clamp((t - SPLIT + 0.25) / 0.35);
          if (b === 1) { R *= 1 - 0.75 * gone; w *= 1 - gone; }
          if (b === 0 && back > 0) { x = lerp(x, MAIN[0] + 30, back); y = lerp(y, MAIN[1] - 10, back); R = lerp(R, 70, back); w *= 1 - fuse; }
          cells.push({ x, y, R, w, b });
        });
      }

      // ---- the history: where each branch went, drawn as it happens and kept until the reset ----
      const hist = 1 - tw(t, RESET, 0.6, "inOut");
      const curve = (p0, p1, bend, u, dash) => {
        if (u <= 0.001 || hist <= 0) return;
        const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2, dx = p1[0] - p0[0], dy = p1[1] - p0[1];
        const cx = mx - dy * bend, cy = my + dx * bend;
        ctx.beginPath(); ctx.moveTo(p0[0], p0[1]);
        for (let k = 1; k <= 40 * u; k++) { const v = k / 40, a = (1 - v) * (1 - v), b = 2 * v * (1 - v), c = v * v; ctx.lineTo(a * p0[0] + b * cx + c * p1[0], a * p0[1] + b * cy + c * p1[1]); }
        ctx.setLineDash(dash); stroke(ui.stroke("regular", 2), h.alpha(C.ink, 0.45 * hist)); ctx.setLineDash([]);
      };
      if (t >= SPLIT) {
        TARGET.forEach((tg, b) => curve(MAIN, tg, b ? -0.12 : 0.12, split, [2, 7]));
        curve(TARGET[0], MAIN, 0.3, back, [10, 6]);
        if (back > 0) { ctx.beginPath(); ctx.arc(TARGET[0][0], TARGET[0][1], 7, 0, TAU); ctx.fillStyle = h.alpha(C.surface, hist); ctx.fill(); stroke(ui.stroke("regular", 2), h.alpha(C.ink, 0.55 * hist * clamp(back * 4))); }
        if (gone > 0.5) { // the discarded branch: a cross where it was
          const a = clamp((gone - 0.5) * 2) * hist, [x, y] = TARGET[1];
          ctx.beginPath(); ctx.moveTo(x - 12, y - 12); ctx.lineTo(x + 12, y + 12); ctx.moveTo(x + 12, y - 12); ctx.lineTo(x - 12, y + 12);
          ctx.lineCap = "round"; stroke(ui.stroke("bold", 3), h.alpha(C.ink, 0.55 * a));
        }
      }

      // ---- the membrane field ----
      const src = cells.filter((c) => c.w > 0.001).map((c) => [c.x, c.y, 1 / (SPAN * c.R) ** 2, c.w]);
      for (let gy = 0; gy < GH; gy++) {
        const y = GY0 + gy * GS;
        for (let gx = 0; gx < GW; gx++) {
          const x = GX0 + gx * GS;
          let s = 0;
          for (let i = 0; i < src.length; i++) { const dx = x - src[i][0], dy = y - src[i][1]; const q = 1 - (dx * dx + dy * dy) * src[i][2]; if (q > 0) s += src[i][3] * q * q * q; }
          const k = gy * GW + gx;
          f[k] = s;
          px[k] = s > ISO ? (s < ISO * 1.9 ? S.cortexPx : S.cytoPx) : 0;
        }
      }
      S.octx.putImageData(S.img, 0, 0);
      ctx.save(); ctx.imageSmoothingEnabled = true;
      ctx.drawImage(S.off, GX0 - GS / 2, GY0 - GS / 2, GW * GS, GH * GS);
      ctx.restore();
      // marching squares: an iso line, interpolated along each cell edge
      const contour = (iso) => {
        ctx.beginPath();
        const at = (a, b) => (iso - a) / (b - a);
        for (let gy = 0; gy < GH - 1; gy++) {
          for (let gx = 0; gx < GW - 1; gx++) {
            const i = gy * GW + gx;
            const a = f[i], b = f[i + 1], c = f[i + GW + 1], d = f[i + GW];
            const code = (a > iso ? 8 : 0) | (b > iso ? 4 : 0) | (c > iso ? 2 : 0) | (d > iso ? 1 : 0);
            if (code === 0 || code === 15) continue;
            const x = GX0 + gx * GS, y = GY0 + gy * GS;
            const T = [x + at(a, b) * GS, y], R = [x + GS, y + at(b, c) * GS], B = [x + at(d, c) * GS, y + GS], Lp = [x, y + at(a, d) * GS];
            const seg = (p, q) => { ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); };
            switch (code) {
              case 1: case 14: seg(Lp, B); break;
              case 2: case 13: seg(B, R); break;
              case 3: case 12: seg(Lp, R); break;
              case 4: case 11: seg(T, R); break;
              case 6: case 9: seg(T, B); break;
              case 7: case 8: seg(Lp, T); break;
              case 5: seg(Lp, T); seg(B, R); break;
              case 10: seg(T, R); seg(Lp, B); break;
            }
          }
        }
      };
      ctx.lineCap = "round";
      contour(ISO * 1.9); // the inner membrane, over the cortex edge
      stroke(ui.stroke("fine", 1.2), mix(S.cortex, C.ink, 0.28));
      contour(ISO);
      stroke(ui.stroke("bold", 3), INK);

      // ---- vesicles, in every living cell ----
      cells.forEach((c, ci) => {
        const vis = c.w * (c.b === 1 ? 1 - gone : 1);
        if (vis < 0.05) return;
        S.ves.forEach((v, k) => {
          if (ci > 0 && k % 2) return;
          const a = v.a + (t / D) * TAU * v.sp * (k % 2 ? 1 : -1);
          ctx.beginPath(); ctx.arc(c.x + Math.cos(a) * c.R * v.d * 0.82, c.y + Math.sin(a) * c.R * v.d * 0.82, v.s * (c.R / RM), 0, TAU);
          ctx.fillStyle = h.alpha(S.dark ? "#ffffff" : C.ink, 0.1 * vis); ctx.fill();
        });
      });

      // ---- organelles: tables ----
      const table = (x, y, k, j, o) => {
        // o: { ghost 0..1 (dashed reference), change 0..1, alpha }
        const extra = 14 * o.change;
        const w = TW * k, hh = (TH + extra) * k, rad = ui.radius("sm", 6) * k;
        ctx.save();
        ctx.globalAlpha = o.alpha;
        ctx.translate(x - w / 2, y - hh / 2);
        const base = mix(S.tcol[j], S.changed, o.change);
        const solid = 1 - o.ghost;
        ctx.fillStyle = h.alpha(base, 0.28 + 0.72 * solid);
        ctx.beginPath(); ctx.roundRect(0, 0, w, hh, rad); ctx.fill();
        if (o.ghost > 0.5) ctx.setLineDash([4 * k, 3.5 * k]);
        stroke(ui.stroke("regular", 1.6), INK);
        ctx.setLineDash([]);
        // header and rows
        ctx.fillStyle = h.alpha(mix(base, C.ink, 0.22), 0.3 + 0.7 * solid);
        ctx.beginPath(); ctx.roundRect(0, 0, w, 17 * k, [rad, rad, 0, 0]); ctx.fill();
        ctx.fillStyle = h.alpha(S.dark ? C.paper : C.ink, 0.55 + 0.45 * solid);
        ctx.font = S.tableFont; ctx.textBaseline = "middle";
        ctx.save(); ctx.translate(7 * k, 9 * k); ctx.scale(k, k); ctx.fillText(S.tables[j], 0, 0); ctx.restore();
        ctx.beginPath();
        const rows = 3 + (o.change > 0.02 ? 1 : 0);
        for (let rw = 0; rw < rows; rw++) {
          const ry = (17 + 10 + rw * 11) * k;
          if (ry > hh - 4 * k) break;
          const len = (rw === 3 ? 0.55 : [0.72, 0.5, 0.62][rw]) * (w - 14 * k);
          ctx.moveTo(7 * k, ry); ctx.lineTo(7 * k + len, ry);
        }
        stroke(ui.stroke("regular", 2) * k, h.alpha(mix(base, C.ink, 0.45), 0.4 + 0.6 * solid));
        if (o.change > 0.02) { // the new column: an accent bar on the last row
          ctx.beginPath(); ctx.moveTo(7 * k, (17 + 10 + 33) * k); ctx.lineTo(7 * k + (w - 14 * k) * 0.55 * o.change, (17 + 10 + 33) * k);
          stroke(ui.stroke("bold", 3) * k, C.accentInk || C.ink);
        }
        ctx.restore();
        return [x + w / 2, y - hh / 2];
      };
      const slot = (c, j) => { const k = c.R / RM; return [c.x + OFFS[j][0] * k, c.y + OFFS[j][1] * k + bob(j + 3) * 0.4]; };
      const main = cells[0];
      let chipAt = null;
      // main's own tables; its changed table takes the column once the branch has merged
      S.tables.forEach((_, j) => { const [x, y] = slot(main, j); table(x, y, 1, j, { ghost: 0, change: j === S.changeJ ? merged : 0, alpha: 1 }); });
      // references being copied into the buds, then riding with them
      if (live) {
        cells.slice(1).forEach((c) => {
          const b = c.b;
          const appear = tw(t, SPLIT - 0.05, 0.35, "soft");
          let alpha = appear * (b === 1 ? 1 - clamp(gone * 1.6) : 1);
          if (alpha < 0.01) return;
          S.tables.forEach((_, j) => {
            let [x, y] = slot(c, j);
            let k = c.R / RM;
            const isChange = b === 0 && j === S.changeJ;
            let a = alpha;
            if (b === 0 && back > 0) {
              // coming home: each table glides onto its twin in main
              const [mx, my] = slot(main, j), e = ease.inOut(clamp((back - 0.35) / 0.65));
              x = lerp(x, mx, e); y = lerp(y, my, e); k = lerp(k, 1, e);
              a *= 1 - clamp((back - 0.78) / 0.22);
            }
            const tip = table(x, y, k, j, { ghost: isChange ? 1 - tinker : 1, change: isChange ? tinker : 0, alpha: a });
            if (isChange && a > 0.01) chipAt = [tip[0], tip[1], a * tinker];
          });
        });
      }
      // the discarded branch breaks into bubbles that rise and fade
      if (gone > 0 && gone < 1 && cells[2]) {
        const c = cells[2], tg = TARGET[1];
        S.bubbles.forEach((bb) => {
          const u = clamp((t - DISCARD - bb.dl) / 1.2);
          if (u <= 0 || u >= 1) return;
          ctx.beginPath(); ctx.arc(tg[0] + Math.cos(bb.a) * (bb.d + 30 * u), tg[1] + Math.sin(bb.a) * bb.d * 0.8 - bb.up * u, bb.s * (1 - u * 0.5), 0, TAU);
          ctx.fillStyle = h.alpha(S.cortex, (1 - u) * 0.9); ctx.fill(); stroke(ui.stroke("fine", 1.2), h.alpha(INK, (1 - u) * 0.7));
        });
        void c;
      }
      // after the merge the chip sits on main's table
      if (merged > 0.01) { const [x, y] = slot(main, S.changeJ); chipAt = [x + TW / 2, y - (TH + 14 * merged) / 2, merged * labelsIn]; }
      if (chipAt) {
        S.chip.style.opacity = chipAt[2].toFixed(3);
        S.chip.style.transform = `translate(${(chipAt[0] - 18).toFixed(1)}px, ${(chipAt[1] - 12).toFixed(1)}px)`;
      } else S.chip.style.opacity = 0;

      // ---- tags follow their cells ----
      const place = (node, c, a) => { node.style.opacity = a.toFixed(3); node.style.transform = `translate(${c.x.toFixed(1)}px, ${(c.y - c.R - 22).toFixed(1)}px) translate(-50%, -100%)`; };
      place(S.mainTag, main, 1);
      S.tags.forEach((tag, b) => {
        const c = cells[b + 1];
        if (!c) { tag.node.style.opacity = 0; return; }
        // alive, the tag rides on its cell; once merged or discarded it stays where the branch was, as history
        const a = tw(t, SPLIT + 0.45, 0.4, "snappy");
        const past = b === 1 ? tw(t, DISCARD + 0.3, 0.5, "soft") : tw(t, MERGE + 0.2, 0.7, "soft");
        const rest = { x: TARGET[b][0], y: TARGET[b][1], R: b === 1 ? -74 : 12 }; // fix/login's tag drops below its cross
        const at = { x: lerp(c.x, rest.x, past), y: lerp(c.y, rest.y, past), R: lerp(c.R, rest.R, past) };
        place(tag.node, at, a * (1 - 0.45 * past) * (past > 0 ? (1 - tw(t, RESET, 0.6, "inOut")) : 1));
        tag.node.classList.toggle("past", past > 0.5);
        tag.node.classList.toggle("struck", b === 1 && past > 0.5);
        tag.note.style.display = past > 0 ? "" : "none";
        tag.note.style.opacity = past.toFixed(3);
      });
      // ---- the log ----
      const secs = clamp(t - SPLIT, 0, S.content.branchSeconds ?? 0.8);
      h.text(S.lBranch.s, S.branchTpl.replace("{s}", secs.toFixed(1)));
      const show = (ln, at) => { const a = tw(t, at, 0.4, "snappy") * labelsIn; ln.n.style.opacity = a.toFixed(3); ln.n.style.transform = `translateY(${((1 - a) * 8).toFixed(1)}px)`; };
      show(S.lBranch, SPLIT);
      show(S.lChange, TINKER + 0.3);
      show(S.lDiscard, DISCARD + 0.4);
      show(S.lMerge, MERGE + MERGE_DUR - 0.2);
    },
  });
})();
