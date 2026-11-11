# 04 — 3D models for web assets: glTF, free CC0 sources, and when 2.5D is better

Track 4 of 5. Researched 2026-11-05 against three.js r187 ([npm `three@0.187.0`](https://www.npmjs.com/package/three)) and drei 10.7.9. Every download URL in the model table was checked with an HTTP HEAD request on that date. No model files were downloaded.

## 1. glTF 2.0 in one page

**Structure.** A glTF asset is a JSON tree of top-level arrays: scenes, nodes, cameras, meshes, accessors, buffer views, buffers, materials, textures, samplers, skins and animations ([glTF 2.0 spec §3.1](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#concepts)). An asset "MAY contain zero or more scenes", and every node listed in `scene.nodes` must be a root node ([§3.5](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#scenes)). A node holds the hierarchy and a local transform ([§3.7](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#nodes-and-hierarchy)). A mesh is "a collection of mesh primitives" ([§3.7.2](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#meshes)). Geometry bytes are reached through accessor → bufferView → buffer. The coordinate system is right-handed with +Y up, the front of an asset faces +Z, and "the units for all linear distances are meters" ([§3.4](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#coordinate-system-and-units)).

**Materials.** The core material is PBR metallic-roughness: `baseColorFactor`/`baseColorTexture`, `metallicFactor`, `roughnessFactor` and one packed `metallicRoughnessTexture`. That texture's "green channel contains roughness values and its blue channel contains metalness values" and it is linear. The base colour texture is sRGB-encoded ([§3.9.2](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#metallic-roughness-material)). Textures pair an image with a sampler, and the core format "supports only static 2D textures" ([§3.8](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#texture-data)).

**Animations.** Each channel targets a node and a path. "Valid path names are 'translation', 'rotation', 'scale', and 'weights'" (weights means morph targets). Samplers interpolate with `LINEAR`, `STEP` or `CUBICSPLINE` ([§3.11](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#animations)).

**.gltf vs .glb.** A `.gltf` is JSON with sidecar `.bin` and image files, or with them embedded as data URIs. A `.glb` packs everything into one little-endian binary: a 12-byte header whose magic is `0x46546C67` (ASCII "glTF"), then a JSON chunk and an optional BIN chunk, each 4-byte aligned. The media type is `model/gltf-binary` ([§4](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#glb-file-format-specification), [§4.4.3](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#chunks)). For site-motion, GLB is the right default: one fetch, one file to vendor next to the HTML.

### Compression

| Extension | What it compresses | three.js setup |
|---|---|---|
| [`KHR_draco_mesh_compression`](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_draco_mesh_compression/README.md) | Geometry only, using Google Draco (best ratio, slower decode) | `DRACOLoader` + WASM decoder |
| [`EXT_meshopt_compression`](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Vendor/EXT_meshopt_compression/README.md) | Any bufferView: geometry, morph targets, animation keyframes, instance transforms. Decodes at about 1 GB/s with WASM SIMD and stays gzip/Brotli-friendly | `MeshoptDecoder` |
| [`KHR_meshopt_compression`](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_meshopt_compression) | The Khronos successor to EXT_meshopt. Status: "Release Candidate". Version 0 of its bitstream is identical to the EXT version | `MeshoptDecoder` (listed as supported by GLTFLoader) |
| [`KHR_mesh_quantization`](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_mesh_quantization/README.md) | Stores attributes as 8- or 16-bit ints. The spec's example cuts a vertex from 48 to 20 bytes | none (core GLTFLoader) |
| [`KHR_texture_basisu`](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_texture_basisu/README.md) | KTX2 images with Basis Universal supercompression, transcoded on the GPU side. Smaller downloads and less GPU memory | `KTX2Loader` + basis transcoder |

**KHR_materials_* extensions that matter for asset scenes:**
- [`KHR_materials_unlit`](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_unlit/README.md) gives exact flat colour. GLTFLoader turns it into `MeshBasicMaterial` ([GLTFLoader.js source](https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/loaders/GLTFLoader.js)).
- [`KHR_materials_emissive_strength`](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_emissive_strength/README.md) lifts the [0,1] cap on emission, for glowing screens.
- [`KHR_materials_transmission`](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_transmission/README.md) is for glass and plastic. It is expensive, so avoid it under SwiftShader.
- Clearcoat, sheen, iridescence, ior, volume, specular, anisotropy and dispersion are also loaded ([GLTFLoader docs](https://threejs.org/docs/pages/GLTFLoader.html)).

`KHR_materials_variants` needs a separate plugin ([GLTFLoader docs](https://threejs.org/docs/pages/GLTFLoader.html)).

**Tooling.** The `gltf-transform optimize input.glb output.glb --compress draco --texture-compress webp` command handles the common cases ([glTF Transform CLI](https://gltf-transform.dev/cli)). It also has `palette`, `unlit`, `simplify`, `meshopt` and `join` transforms that suit flat brand assets. [gltfpack](https://meshoptimizer.org/gltf/) produced three.js's own meshopt+KTX2 example asset (`gltfpack -i … -o coffeemat.glb -cc -tc`, [webgl_loader_gltf_compressed](https://threejs.org/examples/webgl_loader_gltf_compressed.html)).

### three.js loader setup (r187)

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
// renderer.outputColorSpace defaults to THREE.SRGBColorSpace — leave it.

const draco = new DRACOLoader().setDecoderPath('./vendor/three/libs/draco/gltf/'); // vendor locally
const ktx2  = new KTX2Loader().setTranscoderPath('./vendor/three/libs/basis/').detectSupport(renderer);

const loader = new GLTFLoader()
  .setDRACOLoader(draco)
  .setKTX2Loader(ktx2)
  .setMeshoptDecoder(MeshoptDecoder);

const gltf = await loader.loadAsync('./assets/laptop.glb');
scene.add(gltf.scene);
```

Sources for this setup:
- [GLTFLoader docs](https://threejs.org/docs/pages/GLTFLoader.html) define `setDRACOLoader`, `setKTX2Loader` and `setMeshoptDecoder`. They say the Draco loader is "required for decoding assets compressed with the KHR_draco_mesh_compression extension".
- [DRACOLoader docs](https://threejs.org/docs/pages/DRACOLoader.html) say `setDecoderPath` "cannot be changed after decoding begins" and recommend reusing one instance.
- [KTX2Loader docs](https://threejs.org/docs/pages/KTX2Loader.html) say `detectSupport(renderer)` "must be called before loading a texture" and the default transcoder path is `examples/jsm/libs/basis`.
- The decoder files ship in the npm package. `examples/jsm/libs/draco/gltf/draco_decoder.wasm`, `examples/jsm/libs/basis/basis_transcoder.wasm` and `examples/jsm/libs/meshopt_decoder.module.js` all return 200 on [jsDelivr three@0.187.0](https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/libs/).

Vendor the decoders locally so video export never depends on a CDN.

**Colour management.**
- Since r152 `renderer.outputColorSpace` defaults to sRGB ([r152 colour-management post](https://discourse.threejs.org/t/updates-to-color-management-in-three-js-r152/50791); [WebGLRenderer.js](https://cdn.jsdelivr.net/npm/three@0.187.0/src/renderers/WebGLRenderer.js) sets `_outputColorSpace = SRGBColorSpace`).
- Colour textures (`map`, `emissiveMap`) must carry `texture.colorSpace = SRGBColorSpace`. Data textures (normal, roughness, gradient maps) stay `NoColorSpace` ([three.js manual: Color management](https://threejs.org/manual/#en/color-management); [MeshToonMaterial docs](https://threejs.org/docs/pages/MeshToonMaterial.html)).
- GLTFLoader does this for you: it assigns `baseColorTexture` with `SRGBColorSpace` and reads `baseColorFactor` as linear ([GLTFLoader.js source, `assignTexture(..., 'map', ..., SRGBColorSpace)`](https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/loaders/GLTFLoader.js)).
- For brand tokens, `Color` stores linear values, and "hexadecimals and CSS strings are converted to the working color space automatically" ([Color docs](https://threejs.org/docs/pages/Color.html)). So `material.color.set('#4F46E5')` straight from a token is correct.
- If you add an `EffectComposer`, finish with `OutputPass` so the sRGB conversion still happens ([manual](https://threejs.org/manual/#en/color-management)).

## 2. Making models match a flat brand design system

**Recolour by name.** Each glTF material and mesh name survives into `material.name` and `mesh.name`. Traverse once, map names to tokens, and swap in your own material:

```js
const tokens = { primary: '#4F46E5', surface: '#F4F4F5', ink: '#18181B', accent: '#F59E0B' };
const map = { metal: 'ink', screen: 'primary', plastic: 'surface', _default: 'surface' }; // per-model table
gltf.scene.traverse(o => {
  if (!o.isMesh) return;
  const key = map[o.material.name] ?? map[o.name] ?? map._default;
  o.material = new THREE.MeshToonMaterial({ color: tokens[key], gradientMap: toonRamp });
});
```

Log `o.name` and `o.material.name` on first load to build each model's table. Low-poly CC0 kits usually give each colour its own material, which makes this table short.

**Toon ramp.**
- [MeshToonMaterial](https://threejs.org/docs/pages/MeshToonMaterial.html) takes a `gradientMap`. The docs say "it's required to set Texture#minFilter and Texture#magFilter to NearestFilter", and the texture is non-colour data.
- The [webgl_materials_toon example](https://threejs.org/examples/webgl_materials_toon.html) builds a ramp as a `DataTexture(colors, colors.length, 1, THREE.RedFormat)`.
- A 3-step ramp (for example `[90, 180, 255]`) gives the two-tone flat-illustration look.

**Truly flat.**
- Use `MeshBasicMaterial`, or `KHR_materials_unlit` in the file, when the hex on screen must exactly equal the token. Any lit material shifts the value.
- `flatShading: true` on Standard, Lambert or Phong materials gives faceted low-poly shading without new geometry ([MeshStandardMaterial docs](https://threejs.org/docs/pages/MeshStandardMaterial.html)).

**Outlines, three ways:**
1. **Inverted hull.** [`OutlineEffect`](https://threejs.org/docs/pages/OutlineEffect.html) (`three/addons/effects/OutlineEffect.js`) re-renders every mesh with `side: BackSide` and vertices pushed out along the normal. Its `defaultThickness` is 0.003 ([source](https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/effects/OutlineEffect.js)). It is cheap, needs no post-processing and is deterministic, which makes it the best fit for SwiftShader. Note the docs say it is WebGLRenderer-only.
2. **Screen-space.** [`OutlinePass`](https://threejs.org/docs/pages/OutlinePass.html) (`three/addons/postprocessing/OutlinePass.js`) outlines `selectedObjects` through an `EffectComposer`. It has `edgeStrength` (default 3), `edgeThickness` and `edgeGlow`. It looks good for highlight states but costs extra render targets ([example](https://threejs.org/examples/webgl_postprocessing_outline.html)).
3. **Edge lines.** [`EdgesGeometry`](https://threejs.org/docs/pages/EdgesGeometry.html) plus `LineSegments` draws only edges whose face angle exceeds `thresholdAngle` (default 1°; use about 30° for hard edges). WebGL lines are 1px, so use `LineSegments2`/`LineMaterial` (`three/addons/lines/`) for thick strokes ([webgl_lines_fat](https://threejs.org/examples/webgl_lines_fat.html)).

**Isometric camera.**
- True isometric means rotating 45° about the vertical, then tilting by about 35.264°, which is exactly arcsin(1/√3) = arctan(1/√2) ([Isometric projection](https://en.wikipedia.org/wiki/Isometric_projection)).
- In three.js, put an [`OrthographicCamera`](https://threejs.org/docs/pages/OrthographicCamera.html) on the (1, 1, 1) diagonal. Its elevation is then atan(1/√2) = 35.264° and its azimuth 45°:

```js
const aspect = W / H, s = 4; // s = half-height of view in world units
const cam = new THREE.OrthographicCamera(-s * aspect, s * aspect, s, -s, 0.1, 100);
cam.position.set(10, 10, 10);   // true isometric (35.264° elev, 45° azimuth)
// cam.position.set(10, 10 * Math.tan(Math.PI / 6) * Math.SQRT2, 10); // 30° elev → "2:1 pixel-art" dimetric
cam.lookAt(0, 0, 0);
```

- With an orthographic camera at elevation *e* and azimuth 45°, ground-axis lines slope at sin(*e*). True isometric therefore gives 30° lines (slope 0.577), and *e* = 30° gives the game-art 2:1 slope of 0.5. That follows from the projection maths.
- Zoom with `cam.zoom` plus `updateProjectionMatrix()`, not by dollying, because orthographic size ignores distance ([OrthographicCamera docs](https://threejs.org/docs/pages/OrthographicCamera.html)).
- To fit a model, use `Box3.setFromObject(gltf.scene)` ([Box3](https://threejs.org/docs/pages/Box3.html)), then centre it and scale it to a fixed world height. This is the plain-three version of drei's `<Center>` and `<Bounds>`.

**Flat-look lighting.**
- **Toon:** one `DirectionalLight` (key, from upper left) plus `AmbientLight` or `HemisphereLight` at about 0.6–0.8. Keep the ramp at 2–3 steps and skip the environment map.
- **Soft-PBR "clay":** `RoomEnvironment` through `PMREMGenerator` as `scene.environment` ([RoomEnvironment docs](https://threejs.org/docs/pages/RoomEnvironment.html)). This is exactly what [webgl_loader_gltf_compressed](https://threejs.org/examples/webgl_loader_gltf_compressed.html) does. Set roughness to about 0.6–0.8 and metalness to 0.
- **Shadows:** a grounded contact shadow is a depth render from an orthographic camera under the object, blurred and applied to a plane ([webgl_shadow_contact](https://threejs.org/examples/webgl_shadow_contact.html)). For export, render it once (`frames = 1` in drei terms).

## 3. Free 3D model sources (licences checked on each source's own page)

| Source | Licence (quoted from own page) | Attribution | Formats | Programmatic access |
|---|---|---|---|---|
| **Kenney** | "all game assets on the asset pages are public domain licensed (CC0)… free to use them, even in commercial projects" ([kenney.nl/support](https://kenney.nl/support)) | "Attribution is not required". Do not use the Kenney logo | Zip packs per kit (e.g. [Furniture Kit](https://kenney.nl/assets/furniture-kit), 140 files, "Creative Commons CC0"). Formats are not listed on the page | The Download button is JS-initiated (`data-download-id`), so there is no stable direct URL. Kenney's 3D models are mirrored individually as GLB on Poly Pizza |
| **Quaternius** | "All models are under the CC0 License" ([quaternius.com/faq.html](https://quaternius.com/faq.html)) | "attribution is not necessary" | FAQ mentions .blend and FBX. GLB copies are on Poly Pizza | Pack pages on [quaternius.com](https://quaternius.com/); all-in-one via Patreon. Per-model GLBs via Poly Pizza |
| **Poly Haven** | "Our assets are all licensed as CC0" ([polyhaven.com/license](https://polyhaven.com/license)) | "You do not need to give credit". However, the **API** requires visible "Powered by Poly Haven"-style credit and a unique User-Agent ([polyhaven.com/our-api](https://polyhaven.com/our-api)) | glTF (separate .gltf + .bin + JPG), blend, fbx, usd, at 1k–8k | Free JSON API, no key: `GET https://api.polyhaven.com/assets?type=models` (521 models today) and `GET /files/{id}`. The 1k glTF for `classic_laptop` is a 7.5 KB .gltf plus about 2.2 MB of textures. These are photoreal scans, so they are heavy for flat brand work |
| **Poly Pizza** | Per model: the page shows the licence and links CC0 to [creativecommons.org/publicdomain/zero/1.0](https://creativecommons.org/publicdomain/zero/1.0/) or CC-BY to [/by/3.0](https://creativecommons.org/licenses/by/3.0/). ToS: "By downloading User Content… you agree to adhere to the terms of the Creative Commons license" ([poly.pizza/docs/tos](https://poly.pizza/docs/tos)) | CC0: none. CC-BY 3.0: credit the author. Many ex-Google-Poly models are CC-BY, so **filter on CC0** | GLB at `https://static.poly.pizza/<uuid>.glb`, served with `access-control-allow-origin: *` (checked) | Official [API v1.1](https://poly.pizza/docs/api/v1.1) (needs an account key; the docs page is JS-rendered and was not readable here). The ToS bans "automated means… to download data… other than through our currently available, published interfaces". Use the API or download by hand once, never scrape |
| **Khronos glTF-Sample-Assets** | Per asset. Each model's README has the credit, and the complete list is in [Models.md](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/Models.md). 80+ are fully "Creative Commons Zero v1.0 Universal" (e.g. Cube, Suzanne, Lantern, Water Bottle, Boom Box, Sheen Chair, Toy Car, Diffuse Transmission Teacup). Others are CC-BY 4.0 or carry trademark notices | CC0 ones: none. CC-BY: credit the listed owners | glTF, glTF-Binary, often Draco/KTX2/meshopt variants ([model-index.json](https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/model-index.json)) | Raw URLs: `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/<Name>/glTF-Binary/<Name>.glb`. Best used as **test fixtures** for loaders and extensions. They are PBR-textured and 4–6 MB (Teacup 4.8 MB, Plant 5.8 MB) |
| **Smithsonian Open Access 3D** | "License CC0" on the [AWS Open Data registry entry](https://registry.opendata.aws/smithsonian-open-access/), which notes over 2.8 million CC0 2-D and 3-D items released 2020-02-25. si.edu's own pages ([si.edu/openaccess](https://www.si.edu/openaccess)) return HTTP 403 to automated clients, so they were **not verified directly**. Check each item's usage field: not every 3D item is CC0 | None for CC0 items | Draco-compressed GLB at several qualities (Thumb, Low, …), flagged `"draco_compressed": true` | Keyless JSON: `https://3d-api.si.edu/api/v1.0/content/file/search?q=chair&file_type=glb` (checked; returns URIs). Museum scans of mostly historical objects, so not SaaS-like |
| **KayKit (Kay Lousberg)** | "Free for personal and commercial use, no attribution required. (CC0 Licensed)" ([Prototype Bits](https://kaylousberg.itch.io/prototype-bits)) | None | "Included files are .OBJ, .FBX and .GLTF" (varies per pack) | itch.io "name your own price" zips. No API |
| **ambientCG** (materials, some models) | "All ambientCG assets are provided under the Creative Commons CC0 1.0 Universal License" ([docs.ambientcg.com/license](https://docs.ambientcg.com/license/)) | "You don't need to give credit" | Mostly PBR texture sets | Site has an API (not evaluated) |

**pmndrs Market.** The [pmndrs/market](https://github.com/pmndrs/market) repo describes itself as "Download CC0 assets ready to use in your next 3D Project". It is not archived and had a commit on 2026-09-12. But its homepage `market.pmnd.rs` currently returns Vercel `DEPLOYMENT_NOT_FOUND` (HTTP 404, checked 2026-11-05). Treat it as **offline**: the repo exists, the site does not.

### Ten CC0 models for SaaS and website assets

All ten are low-poly GLBs on Poly Pizza, each tagged `"Licence":"CC0 1.0"` in the page data and linking [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Every GLB URL below answered **HTTP/2 200, `content-type: gltf-binary`** to a HEAD request on 2026-11-05. Sizes are from `content-length`. Triangle counts are from Poly Pizza's page metadata.

| # | Model (creator) | Source page | Licence | Direct GLB | Size | Tris |
|---|---|---|---|---|---|---|
| 1 | Laptop (Kenney) | [poly.pizza/m/GnbwSUiVty](https://poly.pizza/m/GnbwSUiVty) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) · [Kenney](https://kenney.nl/support) | https://static.poly.pizza/8190e659-7079-442f-9ed9-083f67b1746b.glb | 12.9 KB | 136 |
| 2 | Computer Screen / monitor (Kenney) | [poly.pizza/m/V5Qo141OcB](https://poly.pizza/m/V5Qo141OcB) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) · [Kenney](https://kenney.nl/support) | https://static.poly.pizza/2af0158d-c560-4b1a-92e3-b50a51149b16.glb | 12.9 KB | 144 |
| 3 | Phone (Quaternius) | [poly.pizza/m/k2kgBepoMU](https://poly.pizza/m/k2kgBepoMU) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) · [Quaternius](https://quaternius.com/faq.html) | https://static.poly.pizza/bb788859-3dca-4a80-b4da-f5f26e6148f6.glb | 15.2 KB | 224 |
| 4 | Computer Keyboard (Kenney) | [poly.pizza/m/vsqTUPFSw6](https://poly.pizza/m/vsqTUPFSw6) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) · [Kenney](https://kenney.nl/support) | https://static.poly.pizza/b5e7fa01-9e1b-4d5c-a894-8c1c01d19e2d.glb | 8.0 KB | 64 |
| 5 | Desk (Kenney) | [poly.pizza/m/6PbVkqPzEU](https://poly.pizza/m/6PbVkqPzEU) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) · [Kenney](https://kenney.nl/support) | https://static.poly.pizza/0716218b-3aae-48e6-8ddd-185cf7f7b7d7.glb | 23.9 KB | 352 |
| 6 | Office Chair (Quaternius) | [poly.pizza/m/UfKvrZBK6C](https://poly.pizza/m/UfKvrZBK6C) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) · [Quaternius](https://quaternius.com/faq.html) | https://static.poly.pizza/ac2301f3-af86-435a-885a-d8f1a32f9f76.glb | 115.8 KB | 2,116 |
| 7 | Houseplant (Quaternius) | [poly.pizza/m/bfLOqIV5uP](https://poly.pizza/m/bfLOqIV5uP) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) · [Quaternius](https://quaternius.com/faq.html) | https://static.poly.pizza/1683c0b1-4dd9-4d45-910e-cf3e46f163f5.glb | 16.6 KB | 449 |
| 8 | Mug (Kenney) | [poly.pizza/m/fis2ugeLbn](https://poly.pizza/m/fis2ugeLbn) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) · [Kenney](https://kenney.nl/support) | https://static.poly.pizza/5600ffdc-21d2-4e62-93e2-1b255738e43d.glb | 15.4 KB | 232 |
| 9 | Cardboard Box Closed / package (Kenney) | [poly.pizza/m/zv8NvYfT9B](https://poly.pizza/m/zv8NvYfT9B) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) · [Kenney](https://kenney.nl/support) | https://static.poly.pizza/4dd8687e-a34d-4688-84ce-4084dc797476.glb | 11.3 KB | 120 |
| 10 | Headphones (CreativeTrio) | [poly.pizza/m/PSsWSIAYIL](https://poly.pizza/m/PSsWSIAYIL) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (Poly Pizza tag only) | https://static.poly.pizza/b72a848f-b4c6-40fb-ada7-69c4c524bd27.glb | 42.8 KB | 472 |

**Alternates (CC0, checked):**
- Smartphone by smallbigsquare ([page](https://poly.pizza/m/4DRZmTs3jq), `https://static.poly.pizza/68a8586b-e540-431c-b42e-e3c6bc691e11.glb`, 19.1 KB, 200 OK)
- Kenney Cardboard Box Open (`/m/i1lr4yJFY0`), Kenney Desk Corner (`/m/LCfBX1FVJr`) and Quaternius Shelf Tall (`/m/TDgvIuorcX`), which can stand in for a server rack

No CC0 "server rack" turned up in the top results, so build one in code (§5). Also build the cube and abstract shapes in code rather than downloading them.

## 4. drei (pmndrs)

drei is "Useful helpers for @react-three/fiber" ([drei docs](https://drei.docs.pmnd.rs/getting-started/introduction)). Its components are React wrappers, so site-motion can't use them directly. It can copy the ideas. Plain-three.js equivalents:

| drei helper | What it does (docs) | Plain three.js equivalent |
|---|---|---|
| [Environment](https://drei.docs.pmnd.rs/staging/environment) | HDRI presets, or children rendered into a cube map, or ground-projected | `PMREMGenerator` + `environments/RoomEnvironment.js` ([docs](https://threejs.org/docs/pages/RoomEnvironment.html)); `loaders/HDRLoader.js` for .hdr; `objects/GroundedSkybox.js` for ground projection |
| [ContactShadows](https://drei.docs.pmnd.rs/staging/contact-shadows) | "A contact shadow implementation, facing upwards". `frames={1}` renders once for static objects | No module. Port [webgl_shadow_contact.html](https://threejs.org/examples/webgl_shadow_contact.html) (`MeshDepthMaterial` + `shaders/HorizontalBlurShader.js` / `VerticalBlurShader.js`), or use `ShadowMaterial` on a plane |
| [Center](https://drei.docs.pmnd.rs/staging/center) / [Bounds](https://drei.docs.pmnd.rs/staging/bounds) | Centre content via its Box3; fit and clip the camera, zooming for orthographic cameras | `Box3.setFromObject` + manual offset; set `camera.zoom` from box size. About 15 lines, no module |
| [RoundedBox](https://drei.docs.pmnd.rs/shapes/rounded-box) | "A box buffer geometry with rounded corners, done with extrusion" | `geometries/RoundedBoxGeometry.js` ([docs](https://threejs.org/docs/pages/RoundedBoxGeometry.html)) |
| [Outlines](https://drei.docs.pmnd.rs/abstractions/outlines) | "displays an inverted-hull outline" on mesh, skinnedMesh or instancedMesh | `effects/OutlineEffect.js` (whole scene, inverted hull) or a hand-rolled BackSide clone; `postprocessing/OutlinePass.js` for screen-space |
| [Float](https://drei.docs.pmnd.rs/staging/float) | "makes its contents float or hover" | No module. `position.y = A*sin(t*speed)` plus small rotation. Drive it from the frame clock, not wall time |
| [MeshTransmissionMaterial](https://drei.docs.pmnd.rs/shaders/mesh-transmission-material) | Extended transmission with its own buffer | Core `MeshPhysicalMaterial.transmission` ([docs](https://threejs.org/docs/pages/MeshPhysicalMaterial.html)). Costly; avoid in SwiftShader exports |

Model library: see pmndrs Market in §3 (repo alive, site offline).

## 5. Building 3D in code without model files

- **Logo extrusion.** `SVGLoader` parses SVG paths and `SVGLoader.createShapes(path)` returns `Shape`s ([SVGLoader docs](https://threejs.org/docs/pages/SVGLoader.html)). Feed them to [`ExtrudeGeometry`](https://threejs.org/docs/pages/ExtrudeGeometry.html) with `{ depth, bevelEnabled: true, bevelThickness, bevelSize }`; `bevelEnabled` defaults to true. SVG Y points down, so flip with `scale(1, -1, 1)` and centre with `geometry.center()`. See [webgl_loader_svg](https://threejs.org/examples/webgl_loader_svg.html) and [webgl_geometry_extrude_shapes](https://threejs.org/examples/webgl_geometry_extrude_shapes.html). Colour each path from `path.color`, or override it with brand tokens.
- **[`RoundedBoxGeometry`](https://threejs.org/docs/pages/RoundedBoxGeometry.html)** `(width, height, depth, segments = 2, radius)`. It is the basis for phones, cards, app tiles, buttons, keys and server-rack units.
- **[`LatheGeometry`](https://threejs.org/docs/pages/LatheGeometry.html)** `(points, segments = 12, phiStart, phiLength)` spins a 2D profile around Y. Use it for mugs, pots, coins and vases.
- **[`TubeGeometry`](https://threejs.org/docs/pages/TubeGeometry.html)** `(path, tubularSegments = 64, radius, radialSegments = 8, closed)` follows any `Curve`. Use it for cables, data-flow pipes and abstract ribbons.
- **[`mergeGeometries`](https://threejs.org/docs/pages/module-BufferGeometryUtils.html)** `(geometries, useGroups)` from `utils/BufferGeometryUtils.js` merges same-attribute geometries into one draw call. With `useGroups` it keeps per-part material groups, so you can keep one brand colour per part.
- **[`InstancedMesh`](https://threejs.org/docs/pages/InstancedMesh.html)** renders many copies of one geometry and material "with different world transformations" in one draw call. Use `setMatrixAt` and `setColorAt`, then flag `instanceMatrix.needsUpdate`. Good for grids of cubes, rack units, particles and data points ([webgl_instancing_performance](https://threejs.org/examples/webgl_instancing_performance.html)).

**Example: a server rack** is about 20 lines. Make one `RoundedBoxGeometry` shell, an `InstancedMesh` of 1U slabs, and a row of small emissive LED boxes coloured from tokens. It has no licence question, no file and no load wait.

## 6. 2.5D: CSS 3D transforms and isometric SVG

**CSS Transforms Level 2** (W3C Working Draft, 9 Nov 2021):
- **`perspective`** is "none | <length [0,∞]>", the distance to the centre of projection. `perspective-origin` moves the vanishing point ([§8](https://www.w3.org/TR/css-transforms-2/#perspective-property)).
- **`transform-style: flat | preserve-3d`** decides whether 3D-transformed children share the parent's 3D rendering context ([§7](https://www.w3.org/TR/css-transforms-2/#transform-style-property)). The default is flattening. Grouping properties (opacity, filters, clipping) force the used value back to `flat` ([§7.1](https://www.w3.org/TR/css-transforms-2/#grouping-property-values)). This is the classic "my cube went flat when I added `opacity`" bug.
- **`backface-visibility: hidden`** hides an element once it is flipped past 90° ([§10](https://www.w3.org/TR/css-transforms-2/#backface-visibility-property); [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/backface-visibility)).

The spec also notes that transformed elements "are not three-dimensional objects": they are flat planes sorted in 3D. That is the core limitation ([spec intro](https://www.w3.org/TR/css-transforms-2/); [MDN guide](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_transforms/Using_CSS_transforms)). An orthographic isometric plane in CSS is `transform: rotateX(54.736deg) rotateZ(45deg)` (90° − 35.264°) with no `perspective`. Use `rotateX(60deg)` for 2:1 dimetric.

**Isometric maths for SVG.** For world point (x, y, z) with z up, true isometric screen coordinates are `X = (x − y)·cos30°`, `Y = (x + y)·sin30° − z` ([Isometric projection](https://en.wikipedia.org/wiki/Isometric_projection): axes 120° apart). The face transforms for SVG `transform="matrix(a b c d e f)"` ([MDN](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/transform)) are:
- top: `matrix(0.866 0.5 -0.866 0.5 0 0)`
- left: `matrix(0.866 0.5 0 1 0 0)`
- right: `matrix(0.866 -0.5 0 1 0 0)`

For 2:1 pixel isometric, use the unit direction (2, 1)/√5, so replace 0.866/0.5 with 0.894/0.447. Shade the three faces with three tints of one token (for example 100% / 85% / 70% lightness). That gives the "lighting" a flat design system expects.

**When 2.5D beats WebGL:**
- **Crisp text and UI.** Real DOM/SVG text stays vector at any export resolution, selectable and translatable. In WebGL, text is a texture or geometry.
- **Accessibility.** DOM and SVG nodes are in the accessibility tree. A `<canvas>` is a bitmap whose only accessible content is the fallback you write inside it ([MDN canvas basic usage, fallback content](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Basic_usage)). Both should respect [`prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion).
- **File size and load.** An iso SVG scene is a few KB with no three.js (r187 `three.module.min.js` 392 KB + `three.core.min.js` 422 KB on [jsDelivr](https://cdn.jsdelivr.net/npm/three@0.187.0/build/), before gzip), no decoder WASM and no model fetch.
- **Video export determinism and no GPU.** Inference from the site-motion setup: CSS/SVG goes through Chrome's normal raster path. WebGL in headless Chrome runs on SwiftShader, a CPU rasteriser, so every lit, shadowed or post-processed frame costs CPU time, and precision paths can differ from a real GPU. Flat 2.5D removes that variable.

**When WebGL wins:**
- **Real lighting**: shading that changes as an object turns, soft shadows, reflections, transmission.
- **Many objects**: CSS 3D creates a compositing layer per plane and sorts planes, not pixels, so intersecting planes break. WebGL has a depth buffer and instancing.
- **True rotation of organic or curved shapes**: a laptop lid opening, a chair turning 360°, a plant. A CSS cube is six divs; a mug is not.
- **Imported assets**: anything from §3.

## Practical rules for site-motion

1. **GLB only, vendored.** Download each chosen GLB once, by hand or through the Poly Pizza API, never by scraping (the ToS forbids it). Store it next to the page under `assets/models/<slug>.glb` with a `LICENSE.txt` that records the source URL, author and "CC0 1.0". Never hotlink in export runs.
2. **CC0 only by default.** Check the licence on the model's own page, not the search grid. On Poly Pizza, 17 of the top 20 results for "laptop" and "monitor" were CC-BY 3.0. Allow CC-BY only with a credit string stored in the brand config.
3. **Prefer low-poly, untextured, under 50 KB and 2,500 triangles per model** (all ten picks qualify). These need no Draco or KTX2 at all. Wire up DRACO, KTX2 and Meshopt anyway with locally vendored decoders (`libs/draco/gltf/`, `libs/basis/`, `libs/meshopt_decoder.module.js`), so Smithsonian or Khronos assets also load.
4. **Recolour with a per-model name→token table.** Traverse on load, swap materials and log unknown names. Token hex goes straight into `Color.set()`; three.js converts sRGB to linear. Keep `outputColorSpace` at its sRGB default and use `NoToneMapping` when exact brand hex matters.
5. **Pick one look per scene.**
   - (a) **Flat:** `MeshBasicMaterial` + `EdgesGeometry` lines.
   - (b) **Toon:** `MeshToonMaterial` with a 3-step `NearestFilter` ramp + `OutlineEffect`.
   - (c) **Soft clay:** `MeshStandardMaterial` (roughness 0.7, metalness 0) + `RoomEnvironment` + baked contact shadow.
   Avoid `OutlinePass`, transmission and real-time shadow maps in SwiftShader exports.
6. **Camera:** `OrthographicCamera` at `(d, d, d)` for true isometric (35.264°/45°). Fit with `Box3`, zoom with `camera.zoom`. Use the same angles in any SVG/CSS layer so 2D and 3D elements share one grid.
7. **Animate from the frame clock** (`t = frame / fps`), not `performance.now()`, so Float-style bobbing and turntables are frame-exact in video export.
8. **Build primitives in code**: cubes, rounded tiles, server racks, extruded logos (`SVGLoader` → `ExtrudeGeometry`), lathe mugs and tube cables. Use `mergeGeometries` or `InstancedMesh` to keep draw calls low.
9. **Choose 2.5D (SVG/CSS) when** the asset is mostly text or UI, needs to be accessible or crawlable, must stay tiny, or only needs fixed-angle isometric blocks. **Choose WebGL when** it needs turning lighting, curved real objects, more than about 20 overlapping 3D pieces, or a full rotation.
10. **Use Khronos glTF-Sample-Assets as a regression suite** (CC0 ones such as Cube, Suzanne and the Compare* set) to test the loader and colour pipeline. Do not ship them as brand art.

## Sources

- Khronos: [glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html) · [KHR_draco_mesh_compression](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_draco_mesh_compression/README.md) · [EXT_meshopt_compression](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Vendor/EXT_meshopt_compression/README.md) · [KHR_meshopt_compression](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_meshopt_compression) · [KHR_mesh_quantization](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_mesh_quantization/README.md) · [KHR_texture_basisu](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_texture_basisu/README.md) · [KHR_materials_unlit](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_unlit/README.md) · [KHR_materials_emissive_strength](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_emissive_strength/README.md) · [KHR_materials_transmission](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_transmission/README.md) · [glTF-Sample-Assets](https://github.com/KhronosGroup/glTF-Sample-Assets) · [Models.md](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/Models.md)
- three.js: [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html) · [DRACOLoader](https://threejs.org/docs/pages/DRACOLoader.html) · [KTX2Loader](https://threejs.org/docs/pages/KTX2Loader.html) · [Color](https://threejs.org/docs/pages/Color.html) · [Color management manual](https://threejs.org/manual/#en/color-management) · [r152 colour management post](https://discourse.threejs.org/t/updates-to-color-management-in-three-js-r152/50791) · [MeshToonMaterial](https://threejs.org/docs/pages/MeshToonMaterial.html) · [MeshStandardMaterial](https://threejs.org/docs/pages/MeshStandardMaterial.html) · [MeshPhysicalMaterial](https://threejs.org/docs/pages/MeshPhysicalMaterial.html) · [OutlineEffect](https://threejs.org/docs/pages/OutlineEffect.html) · [OutlinePass](https://threejs.org/docs/pages/OutlinePass.html) · [EdgesGeometry](https://threejs.org/docs/pages/EdgesGeometry.html) · [OrthographicCamera](https://threejs.org/docs/pages/OrthographicCamera.html) · [Box3](https://threejs.org/docs/pages/Box3.html) · [RoomEnvironment](https://threejs.org/docs/pages/RoomEnvironment.html) · [SVGLoader](https://threejs.org/docs/pages/SVGLoader.html) · [ExtrudeGeometry](https://threejs.org/docs/pages/ExtrudeGeometry.html) · [RoundedBoxGeometry](https://threejs.org/docs/pages/RoundedBoxGeometry.html) · [LatheGeometry](https://threejs.org/docs/pages/LatheGeometry.html) · [TubeGeometry](https://threejs.org/docs/pages/TubeGeometry.html) · [BufferGeometryUtils](https://threejs.org/docs/pages/module-BufferGeometryUtils.html) · [InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html) · examples: [gltf_compressed](https://threejs.org/examples/webgl_loader_gltf_compressed.html), [materials_toon](https://threejs.org/examples/webgl_materials_toon.html), [postprocessing_outline](https://threejs.org/examples/webgl_postprocessing_outline.html), [shadow_contact](https://threejs.org/examples/webgl_shadow_contact.html), [loader_svg](https://threejs.org/examples/webgl_loader_svg.html), [extrude_shapes](https://threejs.org/examples/webgl_geometry_extrude_shapes.html), [lines_fat](https://threejs.org/examples/webgl_lines_fat.html), [instancing_performance](https://threejs.org/examples/webgl_instancing_performance.html) · [three@0.187.0 on jsDelivr](https://cdn.jsdelivr.net/npm/three@0.187.0/)
- Tools: [glTF Transform CLI](https://gltf-transform.dev/cli) · [gltfpack](https://meshoptimizer.org/gltf/)
- Model sources: [Kenney support/licence](https://kenney.nl/support) · [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit) · [Quaternius FAQ](https://quaternius.com/faq.html) · [Poly Haven licence](https://polyhaven.com/license) · [Poly Haven API](https://polyhaven.com/our-api) · [Poly Pizza ToS](https://poly.pizza/docs/tos) · [Poly Pizza API v1.1](https://poly.pizza/docs/api/v1.1) · [Smithsonian Open Access on AWS](https://registry.opendata.aws/smithsonian-open-access/) · [Smithsonian 3D API](https://3d-api.si.edu/api/v1.0/content/file/search) · [si.edu/openaccess](https://www.si.edu/openaccess) (403 to bots) · [KayKit Prototype Bits](https://kaylousberg.itch.io/prototype-bits) · [ambientCG licence](https://docs.ambientcg.com/license/) · [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- pmndrs: [drei introduction](https://drei.docs.pmnd.rs/getting-started/introduction) · [Environment](https://drei.docs.pmnd.rs/staging/environment) · [ContactShadows](https://drei.docs.pmnd.rs/staging/contact-shadows) · [Center](https://drei.docs.pmnd.rs/staging/center) · [Bounds](https://drei.docs.pmnd.rs/staging/bounds) · [RoundedBox](https://drei.docs.pmnd.rs/shapes/rounded-box) · [Outlines](https://drei.docs.pmnd.rs/abstractions/outlines) · [Float](https://drei.docs.pmnd.rs/staging/float) · [MeshTransmissionMaterial](https://drei.docs.pmnd.rs/shaders/mesh-transmission-material) · [pmndrs/market](https://github.com/pmndrs/market)
- CSS/SVG/maths: [W3C CSS Transforms Level 2](https://www.w3.org/TR/css-transforms-2/) · [MDN transform-style](https://developer.mozilla.org/en-US/docs/Web/CSS/transform-style) · [MDN backface-visibility](https://developer.mozilla.org/en-US/docs/Web/CSS/backface-visibility) · [MDN perspective](https://developer.mozilla.org/en-US/docs/Web/CSS/perspective) · [MDN Using CSS transforms](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_transforms/Using_CSS_transforms) · [MDN SVG transform](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/transform) · [MDN canvas fallback content](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Basic_usage) · [MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) · [Isometric projection](https://en.wikipedia.org/wiki/Isometric_projection)
