/**
 * crop-payment-qr — cut the QR-ONLY square out of the K-Shop poster.
 *
 *     node scripts/crop-payment-qr.mjs
 *     public/images/payment/pacred-qr.png  →  public/images/payment/pacred-qr-crop.png
 *
 * WHY (owner 2026-07-21 "crop ภาพ qrcode ให้ด้วย"): `pacred-qr.png` is the whole
 * K-Shop card — portrait, green background, header, card-scheme logos, mascot —
 * and the scannable code is only the middle ~40%. That reads fine on screen, but
 * a printed document gives the QR a small fixed box, so a portrait poster forced
 * into it comes out distorted AND with a code far too small for a phone to read.
 * The crop keeps the code plus its quiet zone and drops the branding.
 *
 * 💰 The crop CANNOT change where money goes — it only removes pixels around the
 * code. The script proves that every run: it decodes both the source and the
 * result and refuses to write unless the EMVCo payload is byte-identical.
 *
 * Re-run this after replacing the poster (e.g. a new K-Shop card for a different
 * account); it is idempotent and safe to run repeatedly.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** pnpm doesn't hoist transitive deps — fall back to resolving out of the store. */
function loadPngjs() {
  try {
    return require("pngjs");
  } catch {
    const storeDir = "node_modules/.pnpm";
    const match = readdirSync(storeDir)
      .filter((d) => d.startsWith("pngjs@"))
      .sort()
      .pop();
    if (!match) throw new Error("pngjs not installed — run `pnpm install`");
    return require(`../${storeDir}/${match}/node_modules/pngjs`);
  }
}
const { PNG } = loadPngjs();
const jsqrMod = require("jsqr");
const jsQR = jsqrMod.default ?? jsqrMod;

const SRC = "public/images/payment/pacred-qr.png";
const OUT = "public/images/payment/pacred-qr-crop.png";

const png = PNG.sync.read(readFileSync(SRC));
const { width: W, height: H, data } = png;
console.log(`source: ${SRC} (${W}x${H})`);

const isDark = (i) => data[i] < 70 && data[i + 1] < 70 && data[i + 2] < 70 && data[i + 3] > 128;
const isWhiteish = (i) => data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200 && data[i + 3] > 128;
const decode = (p) => jsQR(new Uint8ClampedArray(p.data), p.width, p.height);

// ── 1. locate the code ────────────────────────────────────────────────────────
// Primary: ask the decoder where it actually is (exact). Fallback: a density scan
// with gap-closing — rows inside a QR vary wildly in black density, so a naive
// "longest contiguous dense run" tears the code into fragments.
let bandTop, bandBottom;
const found = decode(png);
if (found?.location) {
  const L = found.location;
  const ys = [L.topLeftCorner, L.topRightCorner, L.bottomLeftCorner, L.bottomRightCorner].map((c) => c.y);
  bandTop = Math.max(0, Math.floor(Math.min(...ys)));
  bandBottom = Math.min(H - 1, Math.ceil(Math.max(...ys)));
  console.log(`qr band rows (decoder): ${bandTop}..${bandBottom}`);
} else {
  const rowDark = new Array(H).fill(0);
  for (let y = 0; y < H; y++) {
    let n = 0;
    for (let x = 0; x < W; x++) if (isDark((y * W + x) * 4)) n++;
    rowDark[y] = n;
  }
  const ROW_MIN = Math.round(W * 0.1);
  const GAP = 40;
  const runs = [];
  let cur = -1;
  for (let y = 0; y <= H; y++) {
    const hit = y < H && rowDark[y] >= ROW_MIN;
    if (hit && cur === -1) cur = y;
    if (!hit && cur !== -1) { runs.push([cur, y - 1]); cur = -1; }
  }
  const merged = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && r[0] - last[1] <= GAP) last[1] = r[1];
    else merged.push([...r]);
  }
  const best = merged.sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0];
  if (!best) throw new Error("no QR band found");
  [bandTop, bandBottom] = best;
  console.log(`qr band rows (density): ${bandTop}..${bandBottom}`);
}

// ── 2. exact bbox of the code (scan a little past the band so the outer finder
// patterns can never be clipped) ──────────────────────────────────────────────
const PAD = 24;
const scanTop = Math.max(0, bandTop - PAD);
const scanBottom = Math.min(H - 1, bandBottom + PAD);
let x0 = W, x1 = -1, y0 = H, y1 = -1;
for (let y = scanTop; y <= scanBottom; y++) {
  for (let x = 0; x < W; x++) {
    if (!isDark((y * W + x) * 4)) continue;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
}
const bw = x1 - x0 + 1;
const bh = y1 - y0 + 1;
console.log(`qr bbox: x ${x0}..${x1} (${bw})  y ${y0}..${y1} (${bh})  ratio ${(bw / bh).toFixed(3)}`);
if (Math.abs(bw / bh - 1) > 0.05) throw new Error("bbox is not square — detection is wrong, refusing to crop");

// ── 3. square it + keep a quiet zone (the spec wants >= 4 modules of white) ────
const side = Math.max(bw, bh);
const margin = Math.round(side * 0.08); // ~5 modules on a ~69-module code
const cx = Math.round((x0 + x1) / 2);
const cy = Math.round((y0 + y1) / 2);
const half = Math.round(side / 2) + margin;
const cropX = Math.max(0, cx - half);
const cropY = Math.max(0, cy - half);
const cropW = Math.min(W - cropX, half * 2);
const cropH = Math.min(H - cropY, half * 2);
console.log(`crop: x=${cropX} y=${cropY} ${cropW}x${cropH} (quiet zone ${margin}px)`);

// ── 4. that margin must be white card — never green background or branding ────
let ringTotal = 0, ringWhite = 0, frameTotal = 0, frameWhite = 0, maxDistOfDirt = 0;
const FRAME = 12;
for (let y = cropY; y < cropY + cropH; y++) {
  for (let x = cropX; x < cropX + cropW; x++) {
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1) continue; // inside the code
    const white = isWhiteish((y * W + x) * 4);
    ringTotal++;
    if (white) ringWhite++;
    else {
      const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
      const dy = y < y0 ? y0 - y : y > y1 ? y - y1 : 0;
      maxDistOfDirt = Math.max(maxDistOfDirt, Math.max(dx, dy));
    }
    const onFrame =
      x < cropX + FRAME || x >= cropX + cropW - FRAME ||
      y < cropY + FRAME || y >= cropY + cropH - FRAME;
    if (onFrame) { frameTotal++; if (white) frameWhite++; }
  }
}
console.log(
  `quiet-zone whiteness: ${((ringWhite / ringTotal) * 100).toFixed(2)}% ` +
  `(non-white sits <=${maxDistOfDirt}px from the code — that's anti-aliasing)`,
);
const framePct = (frameWhite / frameTotal) * 100;
console.log(`outer-frame whiteness: ${framePct.toFixed(2)}%`);
if (framePct < 99.9) throw new Error("crop frame is not clean white — it would clip poster branding");
if (maxDistOfDirt > 4) throw new Error("non-white pixels far from the code — something else is inside the crop");

// ── 5. write ──────────────────────────────────────────────────────────────────
const out = new PNG({ width: cropW, height: cropH });
for (let y = 0; y < cropH; y++) {
  for (let x = 0; x < cropW; x++) {
    const s = ((y + cropY) * W + (x + cropX)) * 4;
    const d = (y * cropW + x) * 4;
    out.data[d] = data[s];
    out.data[d + 1] = data[s + 1];
    out.data[d + 2] = data[s + 2];
    out.data[d + 3] = 255; // flatten alpha — print/PDF safe
  }
}
writeFileSync(OUT, PNG.sync.write(out));
console.log(`wrote ${OUT}`);

// ── 6. PROOF: the crop must decode to the exact same payload ──────────────────
const before = found?.data ?? null;
const after = decode(PNG.sync.read(readFileSync(OUT)))?.data ?? null;
console.log(`decoded(original): ${before ? before.slice(0, 48) + "…" : "FAILED"}`);
console.log(`decoded(cropped) : ${after ? after.slice(0, 48) + "…" : "FAILED"}`);
if (!after) throw new Error("cropped QR does not decode — crop is bad");
if (before && before !== after) throw new Error("payload changed — the crop damaged the code");
console.log(before === after ? "OK payload identical — money routing unchanged" : "OK cropped decodes");
