/* loom--hero: a jacquard loom weaves the product's name from the tools' threads (Canvas 2D).
 * The parent weaves a plain twill. Here a row of jacquard hooks lifts the warp by a bitmap of the
 * product's name (a built-in 5x7 pixel font): inside a letter the cloth is warp-faced, so the tools'
 * colours show; outside it is weft-faced, a pale twill ground. The letters emerge at the fell and scroll
 * down into a wide cloth. Rows per loop are a whole multiple of every repeat (twill 4, shuttle 2, the
 * name's repeat), and the weaving speed is a smooth periodic curve that slows as the name is centred.
 */
(function () {
  const D = 14, W = 1600, H = 900, STILL = 7;

  // 5x7 pixel font: seven rows of five, top to bottom
  const FONT = {
    A: "01110 10001 10001 11111 10001 10001 10001", B: "11110 10001 10001 11110 10001 10001 11110",
    C: "01110 10001 10000 10000 10000 10001 01110", D: "11110 10001 10001 10001 10001 10001 11110",
    E: "11111 10000 10000 11110 10000 10000 11111", F: "11111 10000 10000 11110 10000 10000 10000",
    G: "01110 10001 10000 10111 10001 10001 01111", H: "10001 10001 10001 11111 10001 10001 10001",
    I: "01110 00100 00100 00100 00100 00100 01110", J: "00111 00010 00010 00010 00010 10010 01100",
    K: "10001 10010 10100 11000 10100 10010 10001", L: "10000 10000 10000 10000 10000 10000 11111",
    M: "10001 11011 10101 10101 10001 10001 10001", N: "10001 10001 11001 10101 10011 10001 10001",
    O: "01110 10001 10001 10001 10001 10001 01110", P: "11110 10001 10001 11110 10000 10000 10000",
    Q: "01110 10001 10001 10001 10101 10010 01101", R: "11110 10001 10001 11110 10100 10010 10001",
    S: "01111 10000 10000 01110 00001 00001 11110", T: "11111 00100 00100 00100 00100 00100 00100",
    U: "10001 10001 10001 10001 10001 10001 01110", V: "10001 10001 10001 10001 10001 01010 00100",
    W: "10001 10001 10001 10101 10101 10101 01010", X: "10001 10001 01010 00100 01010 10001 10001",
    Y: "10001 10001 01010 00100 00100 00100 00100", Z: "11111 00001 00010 00100 01000 10000 11111",
    0: "01110 10001 10011 10101 11001 10001 01110", 1: "00100 01100 00100 00100 00100 00100 01110",
    2: "01110 10001 00001 00010 00100 01000 11111", 3: "11111 00010 00100 00010 00001 10001 01110",
    4: "00010 00110 01010 10010 11111 00010 00010", 5: "11111 10000 11110 00001 00001 10001 01110",
    6: "00110 01000 10000 11110 10001 10001 01110", 7: "11111 00001 00010 00100 01000 01000 01000",
    8: "01110 10001 10001 01110 10001 10001 01110", 9: "01110 10001 10001 01111 00001 00010 01100",
    " ": "00000 00000 00000 00000 00000 00000 00000",
  };
  const glyph = (ch) => (FONT[ch] || FONT[" "]).split(" ");
  const mod = (a, b) => ((a % b) + b) % b;

  SiteMotion.scene({
    width: W,
    height: H,
    loop: 0,
    duration: D,
    still: STILL,
    setup({ root, content, tokens, h }) {
      const { el, mix } = h;
      const C = tokens.color, pal = tokens.palette;
      root.classList.add("lmh");
      const canvas = el("canvas", "lmh-canvas", root);
      const copy = el("div", "lmh-copy", root);
      el("div", "lmh-eyebrow", copy, content.eyebrow || "");
      el("div", "lmh-h", copy, content.heading || "");
      el("div", "lmh-sub", root, content.sub || "");
      const exporting = document.documentElement.classList.contains("sm-exporting");
      const dpr = exporting ? 1 : Math.min(2, window.devicePixelRatio || 1);
      canvas.width = W * dpr; canvas.height = H * dpr;
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);

      // the name: up to 10 characters of A-Z, 0-9 and space
      const name = String(content.name || "ONE").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").slice(0, 10);
      const cols = name.length * 6 - 1; // five pixels per letter and one between

      // geometry: a wide loom, the cloth window below the fell filling the frame
      const threads = content.threads;
      const left = 160, right = 1440;
      // enough warp threads that every font pixel is at least two threads wide, in whole bands per tool
      const per = Math.ceil(Math.max(128, Math.ceil((cols * 2) / 0.9)) / threads.length);
      const n = per * threads.length;
      const gap = (right - left) / n;
      const spoolY = 246, hookY = 286, fell = 370, beam = 850;
      const ROW = content.rowHeight ?? 10;
      const PERIOD = 4; // twill repeats every 4 rows
      // the name's repeat (its height plus spacing) rounded up to a whole number of twill and shuttle repeats
      let R = content.repeat ?? 48;
      R = Math.ceil(R / PERIOD) * PERIOD;
      const rowsPerLoop = R; // one name per loop: a whole multiple of the twill (4), the shuttle (2) and the name (R)

      // font pixel size: q warp threads wide, p rows tall
      const q = Math.max(1, Math.floor((n * 0.9) / cols));
      const p = Math.max(2, Math.min(5, Math.round(((q * gap) / ROW) * 0.85), Math.floor((R - 8) / 7)));
      const Hn = 7 * p;
      const x0 = Math.floor((n - cols * q) / 2);
      // centre the name in the cloth window at the still: row r sits at k = whole - r, and whole(still) = R/2
      const visible = Math.round((beam - fell) / ROW);
      const rStart = Math.round(R / 2 - (visible - 1) / 2) - Math.floor(Hn / 2);
      // the jacquard card: for each row of the repeat, which warp threads belong to a letter
      const glyphs = [...name].map(glyph);
      const card = [];
      for (let j = 0; j < R; j++) {
        const line = new Uint8Array(n);
        if (j < Hn) {
          const fy = 6 - Math.floor(j / p); // the bottom of the letters is woven first
          for (let i = 0; i < n; i++) {
            const cx = i - x0;
            if (cx < 0 || cx >= cols * q) continue;
            const col = Math.floor(cx / q), gx = col % 6;
            if (gx < 5 && glyphs[Math.floor(col / 6)][fy][gx] === "1") line[i] = 1;
          }
        }
        card.push(line);
      }
      const figure = (i, r) => card[mod(r - rStart, R)][i] === 1;

      const toolColour = (g) => (threads[g].colour ? C[threads[g].colour] || threads[g].colour : pal[g % pal.length]);
      // the ground weft is the yarn that contrasts with the tools' colours: a dark cloth under light threads
      // (pastel palettes), a pale one under dark threads, whichever the theme's palette needs
      const lum = (c) => { const v = parseInt(String(c).slice(1, 7), 16); return (0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255; };
      const lightEnd = lum(C.paper) > lum(C.ink) ? C.paper : C.ink, darkEnd = lightEnd === C.paper ? C.ink : C.paper;
      const toolLum = threads.reduce((a, _, g) => a + lum(toolColour(g)), 0) / threads.length;
      const darkCloth = toolLum > 0.45;
      const weft = darkCloth ? mix(darkEnd, lightEnd, 0.08) : mix(lightEnd, darkEnd, 0.06);
      const warp = [], warpFig = [], weftFig = [], warpGround = [], warpDim = [];
      for (let i = 0; i < n; i++) {
        const c = toolColour(Math.floor(i / per));
        warp.push(c);
        warpFig.push(mix(c, darkCloth ? lightEnd : darkEnd, 0.12)); // the letters: the tools' colours, a touch brighter
        warpGround.push(mix(c, weft, 0.74)); // short ground floats: a quiet twill in the tools' colours
        warpDim.push(mix(c, C.paper, 0.45)); // lowered warp above the fell
        weftFig.push(mix(warpFig[i], weft, 0.55)); // inside a letter the weft barely shows between floats
      }
      const labels = threads.map((th, g) => {
        const chip = el("div", "lmh-spool", root, th.name);
        chip.style.left = left + (g * per + per / 2) * gap + "px";
        chip.style.top = spoolY - 58 + "px";
        chip.style.setProperty("--c", toolColour(g));
        return chip;
      });
      return { ctx, warpFig, darkCloth, lightEnd, threads, per, left, right, n, gap, spoolY, hookY, fell, beam, ROW, PERIOD, R, rowsPerLoop, visible, figure, weft, weftFig, warp, warpGround, warpDim, labels, C, mix };
    },

    render(t, S, h) {
      const { ctx, left, right, n, gap, spoolY, hookY, fell, beam, ROW, PERIOD, rowsPerLoop, C, mix } = S;
      ctx.clearRect(0, 0, W, H);
      // progress in rows: a smooth periodic speed that eases almost to a stop as the name is centred (the
      // still) and picks up between names. rows(D) - rows(0) is exactly rowsPerLoop, and the speed curve is
      // periodic, so the cloth is registered and moving the same way across the seam.
      const A = 0.78;
      const rows = (rowsPerLoop * t) / D - ((A * rowsPerLoop) / (2 * Math.PI)) * Math.sin((2 * Math.PI * (t - STILL)) / D);
      const whole = Math.floor(rows + 1e-9), part = Math.max(0, rows - whole);
      const scroll = part * ROW;
      const next = whole + 1; // the row being woven now

      // loom frame: two uprights
      ctx.fillStyle = mix(C.paper, C.ink, 0.08);
      ctx.fillRect(left - 46, spoolY - 10, 14, beam - spoolY + 40);
      ctx.fillRect(right + 32, spoolY - 10, 14, beam - spoolY + 40);

      // jacquard hooks lift the threads the card marks for this row; the lift eases in as the row changes
      const k = h.ease.snappy(h.clamp(part / 0.3, 0, 1));
      for (let i = 0; i < n; i++) {
        const x = left + (i + 0.5) * gap;
        const lift = h.lerp(S.figure(i, whole) ? 1 : 0, S.figure(i, next) ? 1 : 0, k);
        // the warp from spool to fell: lifted threads full colour and nearer, lowered ones pale
        ctx.strokeStyle = lift > 0.5 ? S.warp[i] : S.warpDim[i];
        ctx.lineWidth = gap * (0.36 + 0.2 * lift);
        ctx.beginPath(); ctx.moveTo(x, spoolY + 12); ctx.lineTo(x, fell); ctx.stroke();
        // the hook: a small block on the thread that rises when it lifts
        ctx.fillStyle = lift > 0.5 ? C.ink : mix(C.paper, C.ink, 0.3);
        ctx.fillRect(x - gap * 0.32, hookY - 9 * lift - 4, gap * 0.64, 8);
      }
      // one spool per tool, its band of threads running down from it
      for (let g = 0; g < S.threads.length; g++) {
        const cx = left + (g * S.per + S.per / 2) * gap;
        ctx.fillStyle = S.warp[g * S.per];
        ctx.beginPath(); ctx.roundRect(cx - S.per * gap * 0.46, spoolY - 4, S.per * gap * 0.92, 18, 9); ctx.fill(); // sm-native: a spool is a pill
      }
      // the reed swings forward as each row is beaten in
      const beat = Math.pow(Math.sin(part * Math.PI), 6);
      const reedY = fell - 36 + beat * 22;
      ctx.fillStyle = mix(C.paper, C.ink, 0.22);
      ctx.fillRect(left - 30, reedY - 5, right - left + 60, 10);

      // cloth: newest row at the fell, scrolling down to the beam. Inside a letter the warp floats over
      // three of four wefts (warp-faced, the tools' colours); outside, over one of four (a pale ground),
      // the two twills running opposite ways so the letters' edges read crisply.
      ctx.save();
      ctx.beginPath(); ctx.rect(left - 24, fell, right - left + 48, beam - fell); ctx.clip();
      for (let kk = -1; kk < S.visible + 1; kk++) {
        const r = whole - kk;
        const y = fell + kk * ROW + scroll;
        ctx.fillStyle = S.weft;
        ctx.fillRect(left - 20, y, right - left + 40, ROW);
        for (let i = 0; i < n; i++) {
          const x = left + i * gap;
          if (S.figure(i, r)) {
            ctx.fillStyle = mod(i - r, PERIOD) !== 0 ? S.warpFig[i] : S.weftFig[i];
            ctx.fillRect(x, y, gap, ROW);
          } else if (mod(i + r, PERIOD) === 0) {
            ctx.fillStyle = S.warpGround[i];
            ctx.fillRect(x + gap * 0.04, y, gap * 0.92, ROW);
          }
        }
        ctx.fillStyle = S.darkCloth ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)";
        ctx.fillRect(left - 20, y + ROW - 0.5, right - left + 40, 0.5);
      }
      // selvedges: the cloth's finished edges
      ctx.fillStyle = mix(C.paper, C.ink, 0.28);
      ctx.fillRect(left - 24, fell, 4, beam - fell);
      ctx.fillRect(right + 20, fell, 4, beam - fell);
      ctx.restore();

      // the weft being laid now, and the shuttle carrying it
      const dir = whole % 2 === 0 ? 1 : -1;
      const e = part < 0.8 ? h.ease.inOut(part / 0.8) : 1;
      const sx = dir > 0 ? h.lerp(left - 60, right + 60, e) : h.lerp(right + 60, left - 60, e);
      ctx.strokeStyle = S.weft;
      ctx.lineWidth = 4; // sm-native: the weft is yarn: its thickness is physical
      ctx.beginPath(); ctx.moveTo(dir > 0 ? left - 60 : right + 60, fell - 8); ctx.lineTo(sx, fell - 8); ctx.stroke();
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
      ctx.beginPath(); ctx.roundRect(left - 40, beam - 6, right - left + 80, 20, 10); ctx.fill(); // sm-native: a beam is a rounded bar

      // the shuttle lights each tool's label as it passes; all of them stay lit while the name is held
      const hold = h.clamp(1 - Math.abs(t - STILL) / 1.6, 0, 1);
      S.labels.forEach((chip, g) => {
        const bx = left + (g * S.per + S.per / 2) * gap;
        const on = Math.max(0.4, 1 - Math.abs(sx - bx) / 180, h.ease.soft(hold));
        chip.style.setProperty("--on", on.toFixed(3));
      });
    },
  });
})();
