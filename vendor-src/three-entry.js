// One browser bundle for site-motion: three.js core plus the addons scenes need.
// Rebuild with `bun install && bun run build` after changing the pinned version.
import * as CORE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
window.THREE = Object.assign({}, CORE, { GLTFLoader, SVGLoader, RoundedBoxGeometry, BufferGeometryUtils, MeshoptDecoder });
