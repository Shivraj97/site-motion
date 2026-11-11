// Minimal PNG decoder for Chrome screenshots (no dependencies): 8-bit greyscale/RGB/RGBA, non-interlaced.
// decodePng(buffer) → { width, height, data } with data as RGBA bytes.
import { inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 }; // grey, RGB, grey+alpha, RGBA

export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG");
  let width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  const idat = [];
  for (let at = 8; at < buf.length; ) {
    const len = buf.readUInt32BE(at);
    const kind = buf.toString("latin1", at + 4, at + 8);
    const body = buf.subarray(at + 8, at + 8 + len);
    if (kind === "IHDR") { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; type = body[9]; interlace = body[12]; }
    else if (kind === "IDAT") idat.push(body);
    else if (kind === "IEND") break;
    at += 12 + len;
  }
  const ch = CHANNELS[type];
  if (depth !== 8 || !ch || interlace) throw new Error(`unsupported PNG (depth ${depth}, colour type ${type}, interlace ${interlace})`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * ch;
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1, out = y * stride, prev = out - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? px[out + x - ch] : 0;
      const b = y > 0 ? px[prev + x] : 0;
      const c = x >= ch && y > 0 ? px[prev + x - ch] : 0;
      let v = raw[src + x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[out + x] = v & 255;
    }
  }
  if (ch === 4) return { width, height, data: px };
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4, s = i * ch;
    if (ch === 3) { data[o] = px[s]; data[o + 1] = px[s + 1]; data[o + 2] = px[s + 2]; data[o + 3] = 255; }
    else { data[o] = data[o + 1] = data[o + 2] = px[s]; data[o + 3] = ch === 2 ? px[s + 1] : 255; }
  }
  return { width, height, data };
}
