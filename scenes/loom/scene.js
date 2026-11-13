/* loom: integrations woven into one fabric (Canvas 2D).
 * Each integration is a warp thread running down from its labelled spool. A shuttle carries the weft
 * across, row after row, over and under in a twill, and the woven cloth (in the brand's colours) rolls
 * down onto a beam labelled with the product. The cloth scrolls continuously: the number of rows woven
 * per loop is a whole multiple of the pattern's period, so the loop has no reset and no seam.
 */
(function () {
  const D = 12, W = 1600, H = 900;
  SiteMotion.scene({
    width: W,
    height: H,
    loop: 0,
    duration: D,
    still: 6,
    setup({ root, content, tokens, h }) {
      const { el, mix } = h;
      const C = tokens.color, pal = tokens.palette;
      root.classList.add("lm");
      const copy = el("div", "lm-copy", root);
      el("div", "lm-eyebrow", copy, content.eyebrow || "");
      el("div", "lm-h", copy, content.heading || "");
      el("div", "lm-sub", copy, content.sub || "");
      const canvas = el("canvas", "lm-canvas", root);
      const exporting = document.documentElement.classList.contains("sm-exporting");
      const dpr = exporting ? 1 : Math.min(2, window.devicePixelRatio || 1);
      canvas.width = W * dpr; canvas.height = H * dpr;
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);

      // geometry: warp threads across the loom, the weaving line (fell), the cloth below it
      const threads = content.threads;
      const per = content.perTool ?? 6; // each tool is a band of fine warp threads
      const left = 720, right = 1480, n = threads.length * per;
      const gap = (right - left) / n;
      const top = 150, fell = 470, beam = 800;
      const ROW = content.rowHeight ?? 14;
      const PERIOD = 4; // twill repeats every 4 rows
      // rows per loop must be a whole number of every repeat in the cloth: the twill (4), the shuttle's
      // direction (2) and the weft colour stripe (16), or the pattern jumps at the seam
      const rowsPerLoop = 16 * (content.cycles ?? 3);
      // weft: mostly a quiet neutral so the tools' colours carry the pattern, with an accent stripe
      const weftColours = [mix(C.paper, C.ink, 0.18), mix(C.paper, C.ink, 0.34), C.accent];
      const toolColour = (g) => threads[g].colour ? C[threads[g].colour] || threads[g].colour : pal[g % pal.length];
      const warpColour = (i) => toolColour(Math.floor(i / per));
      // labels sit in two staggered rows so each can be read at full size; a thread leads down from each to its spool
      const CHIP_H = 34;
      const chipTop = (g) => top - 78 - (g % 2) * 48;
      const labels = threads.map((th, g) => {
        const chip = el("div", "lm-spool", root, th.name);
        chip.style.left = left + (g * per + per / 2) * gap + "px";
        chip.style.top = chipTop(g) + "px";
        chip.style.setProperty("--c", toolColour(g));
        return chip;
      });
      const beamLabel = el("div", "lm-beam", root, content.product || "");
      Object.assign(beamLabel.style, { left: left - 30 + "px", width: right - left + 60 + "px", top: beam + 6 + "px" });
      return { ctx, threads, per, left, right, n, gap, top, fell, beam, ROW, PERIOD, rowsPerLoop, weftColours, warpColour, labels, C, mix, chipTop, CHIP_H };
    },

    render(t, S, h) {
      const { ctx, left, right, n, gap, top, fell, beam, ROW, PERIOD, rowsPerLoop, C, mix } = S;
      ctx.clearRect(0, 0, W, H);
      // progress in rows: continuous, so the shuttle position and the cloth scroll come from one number
      const rows = (t / D) * rowsPerLoop;
      const whole = Math.floor(rows), part = rows - whole;
      const scroll = part * ROW; // the cloth moves down one row per pass

      // loom frame: two uprights and the breast beam
      ctx.fillStyle = mix(C.paper, C.ink, 0.08);
      ctx.fillRect(left - 46, top - 10, 14, beam - top + 40);
      ctx.fillRect(right + 32, top - 10, 14, beam - top + 40);
      // warp threads from spool to fell (above the cloth they are bare and taut)
      for (let i = 0; i < n; i++) {
        const x = left + (i + 0.5) * gap;
        ctx.strokeStyle = S.warpColour(i);
        ctx.lineWidth = gap * 0.42;
        ctx.beginPath(); ctx.moveTo(x, top + 12); ctx.lineTo(x, fell); ctx.stroke();
      }
      // one spool per tool, the band's threads fanning out from it, and a lead thread up to its label
      for (let g = 0; g < S.threads.length; g++) {
        const cx = left + (g * S.per + S.per / 2) * gap;
        ctx.strokeStyle = S.warpColour(g * S.per);
        ctx.lineWidth = h.ui.stroke("regular", 2);
        ctx.beginPath(); ctx.moveTo(cx, S.chipTop(g) + S.CHIP_H); ctx.lineTo(cx, top - 4); ctx.stroke();
        ctx.fillStyle = S.warpColour(g * S.per);
        ctx.beginPath(); ctx.roundRect(cx - S.per * gap * 0.45, top - 4, S.per * gap * 0.9, 18, 9); ctx.fill();
      }
      // the reed: a comb the threads pass through, swinging forward as each row is beaten in
      const beat = Math.pow(Math.sin(part * Math.PI), 6);
      const reedY = fell - 40 + beat * 26;
      ctx.fillStyle = mix(C.paper, C.ink, 0.18);
      ctx.fillRect(left - 30, reedY - 5, right - left + 60, 10);

      // cloth: rows below the fell, newest at the top, scrolling down toward the beam
      ctx.save();
      ctx.beginPath(); ctx.rect(left - 24, fell, right - left + 48, beam - fell); ctx.clip();
      const visible = Math.ceil((beam - fell) / ROW) + 2;
      for (let k = 0; k < visible; k++) {
        const r = whole - k; // absolute row index (pattern uses it, so it stays registered as it scrolls)
        const y = fell + k * ROW + scroll;
        const m = ((r % 16) + 16) % 16;
        const weft = S.weftColours[m === 7 || m === 8 ? 2 : m < 8 ? 0 : 1]; // light, dark, and a two-row accent stripe
        // weft across the whole width first, then warp floats on top where the twill puts warp over
        ctx.fillStyle = weft;
        ctx.fillRect(left - 20, y, right - left + 40, ROW);
        for (let i = 0; i < n; i++) {
          const over = (((i + r) % PERIOD) + PERIOD) % PERIOD < 2; // 2/2 twill: diagonal ribs
          if (over) {
            ctx.fillStyle = S.warpColour(i);
            ctx.fillRect(left + i * gap + gap * 0.04, y, gap * 0.92, ROW);
          }
        }
        // a faint shadow line between rows gives the cloth texture
        ctx.fillStyle = "rgba(0,0,0,0.05)";
        ctx.fillRect(left - 20, y + ROW - 0.5, right - left + 40, 0.5);
      }
      ctx.restore();
      // the weft being laid now: a thread from the left edge to the shuttle, on the fell line
      const dir = whole % 2 === 0 ? 1 : -1;
      const ease = part < 0.8 ? h.ease.inOut(part / 0.8) : 1;
      const sx = dir > 0 ? h.lerp(left - 60, right + 60, ease) : h.lerp(right + 60, left - 60, ease);
      const nm = (((whole + 1) % 16) + 16) % 16;
      ctx.strokeStyle = S.weftColours[nm === 7 || nm === 8 ? 2 : nm < 8 ? 0 : 1];
      ctx.lineWidth = 4; // sm-native: the weft is yarn: its thickness is physical
      ctx.beginPath(); ctx.moveTo(dir > 0 ? left - 60 : right + 60, fell - 8); ctx.lineTo(sx, fell - 8); ctx.stroke();
      // the shuttle: a pointed boat that carries the weft
      ctx.save();
      ctx.translate(sx, fell - 8);
      ctx.scale(dir, 1);
      ctx.fillStyle = C.ink;
      ctx.beginPath(); ctx.moveTo(30, 0); ctx.quadraticCurveTo(10, -14, -30, -9); ctx.lineTo(-30, 9); ctx.quadraticCurveTo(10, 14, 30, 0); ctx.fill();
      ctx.fillStyle = mix(C.ink, C.paper, 0.35);
      ctx.fillRect(-14, -4, 18, 8);
      ctx.restore();
      // breast beam: the cloth rolls onto it
      ctx.fillStyle = C.ink;
      ctx.beginPath(); ctx.roundRect(left - 40, beam - 6, right - left + 80, 20, 10); ctx.fill();
      // spool labels pulse when their thread is floated over (on top) in the row being woven
      // the shuttle lights each tool's label as it passes that band
      S.labels.forEach((chip, g) => {
        const bx = left + (g * S.per + S.per / 2) * gap;
        chip.style.setProperty("--on", Math.max(0.35, 1 - Math.abs(sx - bx) / 160).toFixed(3));
      });
    },
  });
})();
