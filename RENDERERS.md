# Renderers: fitting any library to `render(t)`

site-motion has one contract: **`render(t)` draws the frame for time `t`, whatever came before.** That is what makes a scene play live *and* export frame-exact. Every library fits it in one of three ways:

| Pattern | When | How |
|---|---|---|
| **Pose from t** | the library just draws what you tell it | compute every position from `t`, then draw |
| **Seek** | the library has its own timeline | pause it, then set its time to `t` |
| **Bake** | the library simulates (state depends on the past) | step it once at a fixed rate in `setup`, record the frames, look them up in `render` |

Libraries are pinned in `vendor/` and inlined by naming them in the scene's first line: `// @vendor three p5 matter`. Add a library by dropping `vendor/<name>.min.js` (a UMD build that sets a global) into the folder.

## In the kit now (with a working scene each)

### Three.js: pose from t (an orbit hub, kept out of the public set)
- `SM3.renderer` gives `preserveDrawingBuffer: true` (without it the export can capture a blank canvas), sRGB output, and pixel ratio 1 when exporting (`min(2, devicePixelRatio)` live).
- Set every transform from `t` in `render`, then call `renderer.render(scene, camera)` once. Orbits are whole turns per loop (`turn = u · 2π`). Two tracks turning in opposite directions keep the composition changing without breaking the seam.
- **Don't let it look like dummy boxes.** The first orbit scene used plain lit cubes, a grey floor disc and floating DOM chips, and read as a placeholder. What fixed it:
  - rounded app tiles (`RoundedBoxGeometry`) with toon bands and an ink outline;
  - each tool's mark painted on its top face, so no label floats or collides;
  - a plinth and an inset face on the core, plus one small hero solid (a faceted gem);
  - contact shadows and faint orbital lanes instead of a floor;
  - links as instanced dots that leave from the tile edge facing the core and land on the core's rim on the same side, so the arcs keep to their own sectors and never tangle.
- `camera.setViewOffset(W, H, −dx, −dy, W, H)` moves the subject right of the copy without skewing the perspective, as `lookAt` off-centre would.
- Old vendor `three.min.js` (r149) only: keep linear output with token hex, or colours wash out. three-full (0.186) uses the sRGB default and converts hex correctly.
- Headless Chrome renders WebGL through SwiftShader (`--enable-unsafe-swiftshader`), so exports work without a GPU.

### p5.js: pose from t, redraw on demand (`scenes/signal-field`)
- Instance mode, with `p.noLoop()` in `setup`; `render(t)` stores `t` and calls `inst.redraw()`.
- Never integrate positions across frames. Write each one as a function of `t` (`x = ((t/D)·laps + phase) mod 1`).
- Loop-safe noise: sample time on a circle, `noise(x, cos(2πt/D)·r, sin(2πt/D)·r)`, so the noise at `t = D` equals the noise at `t = 0`. Set `p.noiseSeed` once.
- `pixelDensity(1)` when exporting.

### Matter.js: bake (`scenes/drop-pile`)
- Physics depends on every previous step, so `render` can't simulate. In `setup`, run `Engine.update(engine, 1000/60)` for `duration × 60` frames, adding bodies at their scheduled times and changing the world at scheduled events (the tray floor removed at `tipAt`), and record `[x, y, angle]` per body per frame into a `Float32Array`.
- `render(t)` reads frame `round(t × 60)`. Same `t`, same frame, every time.
- Bodies are drawn as DOM elements (or SVG) from the recorded poses, so they wear the brand's type and tokens. Matter is only the solver.
- Loops: physics doesn't return to its start on its own. End each cycle with an event that clears the stage (a floor that opens, a sweep), then fade anything left before the seam.
- Baking 12 s of 16 bodies takes well under a second. For hundreds of bodies, bake at build time instead and inline the track as JSON.

### Three.js with real models: pose from t + async setup (a glTF showcase and an extruded logo, kept out of the public set)
- `// @vendor three-full three-kit`: three.js 0.186.1 bundled with its loaders (`vendor-src/`, built with `bun build`), plus `window.SM3` helpers.
- `setup` is `async`: load the embedded GLB (`await SM3.loadGLB(h.asset(content.model))`) before returning. `__sm.ready` waits for it; export fails loudly if setup throws.
- Recolour every material to a flat toon material in token colours, add an inverted-hull ink outline, and use a true isometric orthographic camera. That makes a stock model look like part of the brand.
- Headless export launches Chrome with `--use-angle=swiftshader-webgl --enable-unsafe-swiftshader`: Chrome is removing the automatic software fallback, so without the flags WebGL gets no context.
- Models: CC0 only by default, `assets/models/*.glb`, provenance in `assets/LICENSES.json`. Sources and licence quotes are in `references/research/04-3d-assets.md`.

### Three.js built in code, no model file: pose from t (an isometric macro pad, kept out of the public set)
- Every object is a primitive from three-full: `RoundedBoxGeometry` keycaps and board, `TubeGeometry` arcs, toon materials from `SM3.toon`, outlines from `SM3.outline`. There is no licence question and no load wait.
- **Text on a 3D face** is a `CanvasTexture` painted in the token fonts on an unlit `MeshBasicMaterial` plane, so its ink is the exact token hex. `await document.fonts.load(...)` in `setup` *before* painting, or the texture bakes the fallback face.
- **Draw a curve on** with `geometry.setDrawRange(0, segments × radialSegments × 6)`. `TubeGeometry` indexes segment by segment, so the range grows from the start of the curve. A bead rides the head with `curve.getPoint(p)`.
- **Drops and presses** use a closed-form damped spring, `1 − e^(−kx)·cos(ωx)`, so any `t` can be seeked without integrating.
- **Placing an orthographic camera off-centre:** shift `camera.left/right` (and `top/bottom`), then `updateProjectionMatrix()`. Dollying does nothing in orthographic, and moving the object would break its isometric alignment.
- **Picking palette colours for state:** filter the palette in sRGB, not in three's linear `Color` values. Drop near-paper tints (they read as disabled) and tints of the accent (a resting key must never look lit).

### CSS 3D: pose from t (`scenes/css3d-stack`)
- An isometric view is `transform: rotateX(54.7356deg) rotateZ(-45deg)` on a `transform-style: preserve-3d` container, with no `perspective`. Boxes are a top face plus two side faces folded down with `rotateX(-90deg)` / `rotateY(90deg)`.
- `opacity` below 1 or a `filter` on a preserve-3d ancestor flattens it. Put those on leaf faces only.

## Next libraries, and how each would fit

| Library | Pattern | Recipe |
|---|---|---|
| **Theatre.js** | seek | Author keyframes visually in Theatre Studio, export the project state JSON, and ship it with `@theatre/core` only. In `render(t)`: `sheet.sequence.position = t`, then read the animated props into the scene. Its value is a **timeline editor for site-motion**: a designer drags keyframes and the export stays frame-exact. Core is ESM-only, so it needs an ESM-aware build step or a bundled UMD copy in `vendor/`. |
| **GSAP** | seek | Build one `gsap.timeline({ paused: true })` in `setup`; `render(t)` calls `tl.seek(t, false)`. Avoid `ScrollTrigger` in assets (scroll isn't time). Used by 3 of the 20 captured sites. |
| **Lottie** | seek | `lottie.loadAnimation({ autoplay: false, renderer: "svg" })`, then `anim.goToAndStop(t * fps, true)`. Recolour from tokens by rewriting the JSON's colour arrays before loading. 3 of 20 sites ship Lottie. |
| **Rive** | bake or seek | State machines are stateful, so advance from 0 with fixed steps (`artboard.advance(dt)`) to reach `t`, or use a linear animation and `animation.time = t`. Mintlify's hero uses Rive across 15 canvases. |
| **OGL / raw WebGL shaders** | pose from t | Pass `uTime = t` as a uniform; keep every periodic term a whole number of cycles per loop (`sin(2π·k·t/D)`). The lightest way to do gradients, grain and fluid backdrops. |
| **PixiJS** | pose from t | `app.ticker.stop()`, set sprites from `t`, then `app.renderer.render(app.stage)`. Good for thousands of 2D sprites. |
| **Rapier / Cannon (3D physics)** | bake | The Matter recipe, with poses for Three.js meshes. |

## What the 20 captured sites actually ship (November 2026)

Measured from loaded resources and DOM, not guessed:
- **Video** is the most common way to show motion: 13 of 20 sites embed `<video>` (craft.wild.as 10, heyo.is 7, equals.com 6). Pre-rendered loops are exactly what the exporter makes.
- **CSS and SVG animation** carry most of the rest: humblytics.com runs 287 web animations at once, primora.xyz 134.
- **Lottie** on 3 sites, **GSAP** on 3, **Lenis** smooth scroll on 4, **Rive** on 1 (Mintlify, 15 canvases).
- **Canvas or WebGL** on 7 sites; no site exposes Three.js, p5 or Matter by name (bundled code may hide them).
- Takeaway: ship **MP4/WebM plus a live HTML embed** first; WebGL is for the one hero that earns it.
