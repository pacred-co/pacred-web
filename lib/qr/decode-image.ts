/**
 * Client-side QR decode — read the payment QR out of an uploaded image.
 *
 * Owner 2026-07-08 (ฝากโอนหยวน): when the admin/customer attaches the payee's
 * Alipay/WeChat 收款码, decode the QR in the browser so the channel + a machine
 * reference auto-fill (the admin reviews before saving · they can't type Chinese).
 *
 * Browser-only (uses createImageBitmap + <canvas>) → import from "use client"
 * components ONLY. PDF/unsupported → null (can't rasterise client-side).
 *
 * NOTE: this decodes the QR's machine payload (an Alipay/WeChat URL/token). The
 * human-readable Chinese shop name printed on the image is NOT in the QR — that
 * needs an image OCR / vision step (separate · owner-gated on a vision API key).
 */

import jsQR from "jsqr";

export type QrChannel = "alipay" | "wechat" | null;
export type QrDecodeResult = { text: string; channel: QrChannel } | null;

export function detectQrChannel(text: string): QrChannel {
  const t = text.toLowerCase();
  if (t.includes("alipay") || t.includes("alipays:") || t.includes("qr.alipay")) return "alipay";
  if (
    t.includes("wxp://") ||
    t.includes("weixin") ||
    t.includes("wechat") ||
    t.includes("wxpay") ||
    t.includes("wx.tenpay") ||
    t.includes("w+f2f")
  ) {
    return "wechat";
  }
  return null;
}

export async function decodeQrFromFile(file: File): Promise<QrDecodeResult> {
  if (typeof window === "undefined") return null;
  if (!file.type.startsWith("image/")) return null; // PDF etc. — can't rasterise here

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  try {
    const canvas = document.createElement("canvas");
    // Cap the working size — huge phone photos are slow to scan + jsQR doesn't
    // need full resolution to find the finder patterns.
    const MAX = 1400;
    const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" });
    if (!code?.data) return null;
    return { text: code.data, channel: detectQrChannel(code.data) };
  } finally {
    bitmap.close?.();
  }
}
