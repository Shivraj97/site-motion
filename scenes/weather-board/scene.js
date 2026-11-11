// @vendor three-full three-kit
/* weather-board: reliability shown as weather (WebGL fragment shader + DOM).
 * A status map of regions sits over a live sky. A storm cell builds over one region: noise clouds,
 * rain and two lightning flashes, all in the token colours. The region degrades, traffic reroutes to a
 * neighbour, and the storm clears with no failed requests. Every shader term is a function of t: the
 * cloud field drifts around a circle in noise space (one lap per loop) and the storm's strength is an
 * envelope that is 0 at both ends, so the loop is seamless and nothing pops.
 */
(function () {
  const D = 12, W = 1600, H = 900;
  const FRAG = `
precision highp float;
uniform vec2 uRes; uniform float uLoop; uniform float uStorm; uniform float uFlash; uniform vec2 uCell;
uniform vec3 uPaper; uniform vec3 uCloud; uniform vec3 uDark; uniform vec3 uRain; uniform vec3 uGrid;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float n = dot(i, vec3(1.0, 57.0, 113.0));
  vec4 a = fract(sin(vec4(n, n + 1.0, n + 57.0, n + 58.0)) * 43758.5453);
  vec4 b = fract(sin(vec4(n + 113.0, n + 114.0, n + 170.0, n + 171.0)) * 43758.5453);
  vec4 m = mix(a, b, f.z);
  return mix(mix(m.x, m.y, f.x), mix(m.z, m.w, f.x), f.y);
}
float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
void main() {
  vec2 uv = gl_FragCoord.xy / uRes; vec2 p = uv * vec2(uRes.x / uRes.y, 1.0);
  // the map: a faint dot grid on paper
  vec2 g = fract(gl_FragCoord.xy / 26.0) - 0.5;
  vec3 col = mix(uPaper, uGrid, smoothstep(0.09, 0.0, length(g)) * 0.7);
  // clouds: fbm whose third coordinate travels round a circle, so the field returns to itself each loop
  vec3 q = vec3(p * 2.2 + vec2(uLoop * 0.25, 0.0), 0.0) + vec3(cos(uLoop) * 1.3, sin(uLoop) * 1.3, sin(uLoop) * 0.9);
  float c = fbm(q);
  // the storm cell: a soft disc around the affected region, scaled by the storm envelope
  float d = length((uv - uCell) * vec2(uRes.x / uRes.y, 1.0));
  float cell = smoothstep(0.55, 0.05, d) * uStorm;
  float cloud = smoothstep(0.42, 0.75, c + cell * 0.55) * clamp(cell * 1.6, 0.0, 1.0);
  float core = smoothstep(0.62, 0.9, c + cell * 0.4) * cell;
  col = mix(col, uCloud, cloud * 0.85);
  col = mix(col, uDark, core * 0.75);
  // rain: thin slanted streaks under the cloud; their phase advances a whole number of cycles per loop
  vec2 r = vec2(gl_FragCoord.x + gl_FragCoord.y * 0.25, gl_FragCoord.y);
  float lane = floor(r.x / 7.0);
  float drop = fract(r.y / 90.0 + hash(vec2(lane, 1.0)) + uLoop / 6.2831853 * 12.0);
  float streak = smoothstep(0.0, 0.04, drop) * smoothstep(0.22, 0.04, drop) * step(0.55, hash(vec2(lane, 7.0)));
  streak *= smoothstep(0.5, 1.0, abs(fract(r.x / 7.0) - 0.5) * 2.0 < 0.18 ? 1.0 : 0.0);
  col = mix(col, uRain, streak * cloud * 0.55);
  // lightning lifts the cloud cores; the flash rides an envelope with its own attack and decay
  col = mix(col, vec3(1.0), uFlash * core * 0.65);
  // ordered dither so the gradients don't band in 8-bit video
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

  SiteMotion.scene({
    width: W,
    height: H,
    loop: 0,
    duration: D,
    still: 4.6,
    setup({ root, content, tokens, h }) {
      const { el, mix } = h;
      const T = SM3.THREE, C = tokens.color;
      root.classList.add("wb");
      const exporting = document.documentElement.classList.contains("sm-exporting");
      const canvas = el("canvas", "wb-canvas", root);
      const renderer = SM3.renderer(canvas, { width: W, height: H, background: C.paper, exporting });
      renderer.toneMapping = T.NoToneMapping;
      const dpr = renderer.getPixelRatio();
      const col = (hex) => new T.Color(hex);
      const target = content.regions.findIndex((r) => r.id === content.storm.region);
      const cols = content.columns ?? 3;
      const box = { x: 660, y: 160, w: 860, h: 600 };
      const tileW = box.w / cols, rowsN = Math.ceil(content.regions.length / cols), tileH = box.h / rowsN;
      const cx = box.x + ((target % cols) + 0.5) * tileW, cy = box.y + (Math.floor(target / cols) + 0.5) * tileH;
      const uniforms = {
        uRes: { value: new T.Vector2(W * dpr, H * dpr) },
        uLoop: { value: 0 }, uStorm: { value: 0 }, uFlash: { value: 0 },
        uCell: { value: new T.Vector2(cx / W + 0.05, 1 - cy / H) }, // nudged right so the clouds keep off the headline
        uPaper: { value: col(C.paper) }, uCloud: { value: col(mix(C.paper, C.ink, 0.3)) },
        uDark: { value: col(mix(C.paper, C.ink, 0.5)) }, uRain: { value: col(mix(C.paper, C.ink, 0.7)) },
        uGrid: { value: col(mix(C.paper, C.ink, 0.2)) },
      };
      const scene = new T.Scene();
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      scene.add(new T.Mesh(new T.PlaneGeometry(2, 2), new T.ShaderMaterial({ uniforms, vertexShader: "void main(){ gl_Position = vec4(position, 1.0); }", fragmentShader: FRAG })));

      // the board: one tile per region
      const tiles = content.regions.map((r, i) => {
        const t = el("div", "wb-tile", root);
        Object.assign(t.style, { left: box.x + (i % cols) * tileW + 8 + "px", top: box.y + Math.floor(i / cols) * tileH + 8 + "px", width: tileW - 16 + "px", height: tileH - 16 + "px" });
        const head = el("div", "wb-row", t);
        el("span", "wb-name", head, r.id);
        const pill = el("span", "wb-pill", head, "Operational");
        el("div", "wb-city", t, r.city || "");
        const meta = el("div", "wb-meta", t);
        const lat = el("span", "", meta, "");
        const load = el("span", "wb-load", meta);
        const bar = el("i", "", load);
        return { t, pill, lat, bar, r };
      });
      const neighbour = content.regions.findIndex((r) => r.id === content.storm.reroute);
      const arrow = el("div", "wb-arrow", root, `→ rerouting to ${content.storm.reroute}`);
      const n = tiles[neighbour];
      Object.assign(arrow.style, { left: parseFloat(tiles[target].t.style.left) + "px", top: parseFloat(tiles[target].t.style.top) + tileH - 4 + "px" });
      const copy = el("div", "wb-copy", root);
      el("div", "wb-eyebrow", copy, content.eyebrow || "");
      el("div", "wb-h", copy, content.heading || "");
      el("div", "wb-sub", copy, content.sub || "");
      const stats = el("div", "wb-stats", root);
      const s1 = el("div", "", stats); const up = el("b", "", s1, content.uptime || "99.99%"); el("span", "", s1, "uptime, 90 days");
      const s2 = el("div", "", stats); const failed = el("b", "", s2, "0"); el("span", "", s2, "failed requests");
      void up; void n;
      return { renderer, scene, camera, uniforms, tiles, target, neighbour, arrow, failed, storm: content.storm };
    },

    render(t, S, h) {
      const { tw, span, clamp } = h;
      const st = S.storm;
      // storm strength: builds from `at`, holds, and clears by `clear`; 0 at both ends of the loop
      const storm = span(t, st.at, st.clear, 1.6, 1.8);
      // two lightning flashes, each a fast attack and slower decay (never a hard on/off)
      const flash = (st.flashes || []).reduce((m, ft) => Math.max(m, t < ft ? 0 : Math.exp(-(t - ft) * 9) * clamp((t - ft) / 0.03)), 0);
      S.uniforms.uLoop.value = (t / D) * Math.PI * 2;
      S.uniforms.uStorm.value = storm;
      S.uniforms.uFlash.value = flash;
      S.renderer.render(S.scene, S.camera);

      // the board's story: degraded while the storm is strong, traffic rerouted, then recovered
      const degraded = storm > 0.35, rerouted = t > st.at + 1.0 && storm > 0.15, recovered = t > st.clear - 0.4 && t < D - 0.6;
      S.tiles.forEach((tile, i) => {
        let status = "Operational", kind = "ok";
        if (i === S.target) { if (degraded) { status = "Degraded"; kind = "warn"; } else if (recovered) { status = "Recovered ✓"; kind = "ok"; } }
        if (tile.pill.textContent !== status) tile.pill.textContent = status;
        tile.pill.dataset.kind = kind;
        // latency from the region's base, rising with the storm on the target only
        const base = tile.r.p95 ?? 40;
        const lat = Math.round(base + (i === S.target ? storm * 180 : 0));
        tile.lat.textContent = `p95 ${lat} ms`;
        const load = (tile.r.load ?? 0.4) + (i === S.neighbour ? storm * 0.45 : 0) - (i === S.target ? storm * 0.35 : 0);
        tile.bar.style.transform = `scaleX(${clamp(load).toFixed(3)})`;
        tile.t.style.setProperty("--alert", i === S.target ? storm.toFixed(3) : "0");
      });
      S.arrow.style.opacity = (rerouted ? Math.min(1, storm * 2) : 0).toFixed(3);
      S.failed.textContent = "0";
    },
  });
})();
