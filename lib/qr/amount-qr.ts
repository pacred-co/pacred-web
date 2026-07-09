/**
 * lib/qr/amount-qr.ts — build an amount-encoded QR from a STATIC merchant QR image.
 *
 * Owner 2026-07-09: the LOGISTICS/TRADING lanes serve a static K-Shop / Thai-QR
 * PNG/JPG with no amount. Here we (client-side) fetch that image, decode its EMVCo
 * payload (jsQR · lib/qr/decode-image.ts), inject the exact payable
 * (lib/payment/emvco-amount.ts), and render a NEW amount-QR data-url so the
 * customer scans → the total is pre-filled. On ANY failure → `null`, and the
 * caller (<PayDestination>) keeps showing the original static image (never a
 * wrong amount).
 *
 * Browser-only (fetch + createImageBitmap + canvas via decode-image) → import
 * from "use client" components ONLY. Successful results are memoised per
 * (imgUrl, amount) so a re-render doesn't re-decode.
 */

import QRCode from "qrcode";
import { decodeQrFromFile } from "./decode-image";
import { injectAmountIntoEmvco } from "@/lib/payment/emvco-amount";

// Cache SUCCESSES only — a transient fetch/decode failure can retry on re-render.
const cache = new Map<string, string>();

export async function buildAmountQrFromStaticImage(
  imgUrl: string,
  amountThb: number,
): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (!imgUrl) return null;
  if (!(Number.isFinite(amountThb) && amountThb > 0)) return null;

  const key = `${imgUrl}|${Math.round(amountThb * 100) / 100}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  try {
    const res = await fetch(imgUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    const file = new File([blob], "qr", { type: blob.type || "image/png" });

    const decoded = await decodeQrFromFile(file);
    if (!decoded?.text) return null;

    const injected = injectAmountIntoEmvco(decoded.text, amountThb);
    if (!injected) return null;

    const dataUrl = await QRCode.toDataURL(injected, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 512,
    });
    cache.set(key, dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
}
