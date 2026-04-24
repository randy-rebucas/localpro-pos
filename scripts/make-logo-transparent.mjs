/**
 * One-off: remove outer white padding from circular logo PNG via edge flood-fill.
 * Interior white (e.g. wordmark) stays opaque — it is not connected to the image border.
 */
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const inputPath = join(__dirname, '../public/brand/1pos-logo.png');

function isOuterBackground(r, g, b) {
  const lum = (r + g + b) / 3;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max - min;
  // Near-white / light gray (page background), not saturated teal or dark navy
  return lum >= 210 && sat < 55;
}

async function main() {
  const buf = readFileSync(inputPath);
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const stride = 4;
  const idx = (x, y) => (y * w + x) * stride;
  const visited = new Uint8Array(w * h);
  const queue = [];

  const push = (x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const p = y * w + x;
    if (visited[p]) return;
    const i = idx(x, y);
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    if (!isOuterBackground(r, g, b)) return;
    visited[p] = 1;
    queue.push(x, y);
  };

  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }

  while (queue.length) {
    const y = queue.pop();
    const x = queue.pop();
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  const out = Buffer.from(data);
  for (let p = 0; p < w * h; p++) {
    if (!visited[p]) continue;
    const i = p * stride;
    out[i] = 0;
    out[i + 1] = 0;
    out[i + 2] = 0;
    out[i + 3] = 0;
  }
  for (let i = 0; i < out.length; i += stride) {
    if (out[i + 3] === 0) out[i] = out[i + 1] = out[i + 2] = 0;
  }

  const png = await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .png({ compressionLevel: 9, effort: 10 })
    .toBuffer();
  writeFileSync(inputPath, png);
  console.log('Wrote transparent outer background:', inputPath, `${w}x${h}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
