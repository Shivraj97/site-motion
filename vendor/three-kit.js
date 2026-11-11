/* three-kit: site-motion helpers on top of vendor/three-full.min.js (load it first: `// @vendor three-full three-kit`).
 * Everything here exists so 3D can wear a brand's design system: flat toon shading in token colours,
 * an ink outline, a soft contact shadow, a true isometric camera, embedded GLB models and extruded SVG marks.
 */
window.SM3 = (() => {
  const T = window.THREE;
  if (!T || !T.WebGLRenderer) throw new Error("three-kit needs vendor/three-full.min.js loaded first");

  // a renderer whose pixels can be screenshotted (preserveDrawingBuffer) at a fixed pixel ratio when exporting
  function renderer(canvas, { width, height, background = null, exporting = false } = {}) {
    const r = new T.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: background == null });
    r.setPixelRatio(exporting ? 1 : Math.min(2, window.devicePixelRatio || 1));
    r.setSize(width, height, false);
    r.outputColorSpace = T.SRGBColorSpace; // token hex colours are sRGB; three converts them to linear internally
    if (background != null) r.setClearColor(new T.Color(background), 1);
    return r;
  }

  // embedded GLB (a data: URL from h.asset) → parsed glTF; meshopt-compressed files decode too
  async function loadGLB(dataUrl) {
    const buf = await (await fetch(dataUrl)).arrayBuffer();
    const loader = new T.GLTFLoader();
    loader.setMeshoptDecoder(T.MeshoptDecoder);
    return loader.parseAsync(buf, "");
  }

  // a stepped light ramp for MeshToonMaterial: 2–4 flat bands read as illustration, not as a render
  const gradients = {};
  function toonGradient(steps = 3) {
    if (gradients[steps]) return gradients[steps];
    const data = new Uint8Array(steps * 4);
    for (let i = 0; i < steps; i++) { const v = Math.round(90 + (165 * i) / Math.max(1, steps - 1)); data.set([v, v, v, 255], i * 4); }
    const tex = new T.DataTexture(data, steps, 1, T.RGBAFormat);
    tex.minFilter = tex.magFilter = T.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return (gradients[steps] = tex);
  }
  const toon = (color, steps = 3) => new T.MeshToonMaterial({ color: new T.Color(color), gradientMap: toonGradient(steps) });

  // swap every material for a toon material in a brand colour; pick(mesh, oldMaterial, index) returns a hex
  function recolor(root, pick, steps = 3) {
    let i = 0;
    root.traverse((o) => {
      if (!o.isMesh) return;
      const old = o.material;
      o.material = Array.isArray(old) ? old.map((m) => toon(pick(o, m, i++), steps)) : toon(pick(o, old, i++), steps);
    });
    return root;
  }

  // ink outline by the inverted-hull method: a back-face copy pushed out along its normals
  function outline(root, color, thickness = 0.02) {
    const ink = new T.MeshBasicMaterial({ color: new T.Color(color), side: T.BackSide });
    ink.onBeforeCompile = (shader) => {
      shader.uniforms.uThick = { value: thickness };
      shader.vertexShader = "uniform float uThick;\n" + shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n transformed += normalize(normal) * uThick;");
    };
    const hulls = [];
    root.traverse((o) => { if (o.isMesh && !o.userData.isHull) hulls.push(o); });
    for (const mesh of hulls) {
      const hull = new T.Mesh(mesh.geometry, ink);
      hull.userData.isHull = true;
      hull.renderOrder = -1;
      mesh.add(hull);
    }
    return root;
  }

  // centre an object on the floor and scale it so its largest side equals `size`
  function fit(object, size = 1) {
    const box = new T.Box3().setFromObject(object);
    const dims = box.getSize(new T.Vector3());
    const k = size / Math.max(dims.x, dims.y, dims.z || 1e-6);
    object.scale.multiplyScalar(k);
    const b2 = new T.Box3().setFromObject(object);
    const c = b2.getCenter(new T.Vector3());
    object.position.sub(new T.Vector3(c.x, b2.min.y, c.z));
    return object;
  }

  // true isometric: azimuth 45°, elevation atan(1/√2) ≈ 35.264°, orthographic so parallel lines stay parallel
  function isoCamera(width, height, viewHeight = 4, { azimuth = 45, elevation = 35.264, distance = 20 } = {}) {
    const a = width / height;
    const cam = new T.OrthographicCamera((-viewHeight * a) / 2, (viewHeight * a) / 2, viewHeight / 2, -viewHeight / 2, 0.1, 200);
    const az = (azimuth * Math.PI) / 180, el = (elevation * Math.PI) / 180;
    cam.position.set(Math.sin(az) * Math.cos(el) * distance, Math.sin(el) * distance, Math.cos(az) * Math.cos(el) * distance);
    cam.lookAt(0, 0, 0);
    return cam;
  }

  // soft lights that keep toon bands readable: one key from above-front, a cool fill, a little ambient
  function studio(scene, { key = 1.6, fill = 0.5, ambient = 0.55 } = {}) {
    const k = new T.DirectionalLight(0xffffff, key); k.position.set(4, 8, 6); scene.add(k);
    const f = new T.DirectionalLight(0xdfe8ff, fill); f.position.set(-6, 3, -2); scene.add(f);
    scene.add(new T.AmbientLight(0xffffff, ambient));
    return { key: k, fill: f };
  }

  // a cheap soft shadow: a radial gradient on a floor quad (real shadow maps are slow in software WebGL)
  function contactShadow(size = 2, opacity = 0.28, color = "#000000") {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d"), grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, color); grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
    const m = new T.Mesh(new T.PlaneGeometry(size, size), new T.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.002;
    return m;
  }

  // an SVG mark → a 3D object: every filled path becomes an extruded shape (SVG y points down, so flip)
  function extrudeSVG(svgText, { depth = 20, bevel = 2, curveSegments = 24 } = {}) {
    const data = new T.SVGLoader().parse(svgText);
    const group = new T.Group();
    data.paths.forEach((path, i) => {
      const fill = path.userData?.style?.fill;
      if (fill === "none") return;
      for (const shape of T.SVGLoader.createShapes(path)) {
        const geo = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, curveSegments });
        const mesh = new T.Mesh(geo);
        mesh.userData.pathIndex = i;
        mesh.userData.svgFill = fill;
        group.add(mesh);
      }
    });
    group.scale.y = -1;
    const wrap = new T.Group();
    wrap.add(group);
    const box = new T.Box3().setFromObject(wrap), c = box.getCenter(new T.Vector3());
    group.position.sub(c); // centre: the offset is in the parent's space, so the flip doesn't matter
    return wrap;
  }

  return { THREE: T, renderer, loadGLB, toonGradient, toon, recolor, outline, fit, isoCamera, studio, contactShadow, extrudeSVG };
})();
