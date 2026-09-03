// Generates placeholder Teams app icons (manifest/color.png,
// manifest/outline.png) with zero dependencies — just Node's built-in
// zlib for PNG's DEFLATE compression. Replace both with real branded
// artwork before publishing; see manifest/README.md.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/** pixelFn(x, y) -> [r, g, b, a] (0-255 each) */
function writePng(filePath, width, height, pixelFn) {
  const raw = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0; // no filter for this scanline
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y);
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
      raw[offset++] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const png = Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  fs.writeFileSync(filePath, png);
  console.log(`wrote ${filePath} (${width}x${height})`);
}

const outDir = path.join(__dirname, "..", "manifest");

// color.png (192x192): required to be fully opaque, shown as the app's
// main icon. Solid accent-color square with a lighter centered "gavel
// block" glyph standing in for real branding.
const ACCENT = [31, 35, 40]; // #1F2328, matches manifest.json accentColor
const GLYPH = [250, 249, 247]; // near-white
writePng(path.join(outDir, "color.png"), 192, 192, (x, y) => {
  const cx = 96, cy = 96;
  // Simple glyph: a horizontal bar (the "bench") + a vertical bar (the
  // "gavel handle") — crude but readable as a placeholder mark.
  const onBar = y >= 120 && y <= 138 && x >= 40 && x <= 152;
  const onHandle = x >= 88 && x <= 104 && y >= 48 && y <= 122;
  const onHead = Math.hypot(x - 96, y - 48) <= 22;
  if (onBar || onHandle || onHead) return [...GLYPH, 255];
  return [...ACCENT, 255];
});

// outline.png (32x32): must be mostly transparent, white-only silhouette
// (Teams recolors it). Simple circle outline as a placeholder.
writePng(path.join(outDir, "outline.png"), 32, 32, (x, y) => {
  const dist = Math.hypot(x - 15.5, y - 15.5);
  const onRing = dist >= 11 && dist <= 13.5;
  if (onRing) return [255, 255, 255, 255];
  return [255, 255, 255, 0];
});
