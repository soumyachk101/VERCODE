/**
 * make-og.mjs — generate the shared 1200x630 OG image (public/og.png).
 *
 * run: node src/scripts/make-og.mjs -> public/og.png
 *
 * The WP1 OG-image build task replaces this with the @vercel/og rendered
 * card (a per-slug card with the product mark + the headline). Until then
 * this script writes a real, valid PNG: a solid warm-ivory (#faf8f5)
 * 1200x630 8-bit RGB image, built programmatically (the PNG signature +
 * IHDR + a zlib-deflated IDAT + IEND, with the CRC32 computed per
 * chunk). No image library, no network, no font rendering.
 *
 * The bytes are written to apps/website/public/og.png.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WIDTH = 1200;
const HEIGHT = 630;
const RGB = [0xfa, 0xf8, 0xf5]; // #faf8f5 — the site's --ground token

// ---------------------------------------------------------------------------
// CRC32 (the PNG chunk checksum)
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------
// The chunk layout
// ---------------------------------------------------------------------------
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function buildPng(width, height, rgb) {
  // The raw scanlines: each row is a filter byte (0 = None) + the RGB pixels.
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter: None
    for (let x = 0; x < width; x += 1) {
      const p = rowStart + 1 + x * 3;
      raw[p] = rgb[0];
      raw[p + 1] = rgb[1];
      raw[p + 2] = rgb[2];
    }
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace: none

  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "..", "public");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "og.png");
const png = buildPng(WIDTH, HEIGHT, RGB);
writeFileSync(outPath, png);
console.log(`wrote ${outPath} (${png.length} bytes, ${WIDTH}x${HEIGHT})`);
