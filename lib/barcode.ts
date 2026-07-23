/**
 * Code128 barcode → inline SVG data URL — the LOCAL replacement for the legacy
 * `pcscargo.co.th/member/include/barcode.php?text=…&codetype=code128` PHP
 * generator (David S. Tufts' classic GD-PNG script).
 *
 * The legacy script is a *pure display utility*: it renders the `text` GET
 * param as a Code128 barcode PNG — no DB read, no business logic, no auth.
 * Pacred is splitting from pcscargo.co.th, so calling it at runtime is a brand
 * leak + a hard dependency on the legacy server. This renders the SAME
 * symbology (Code128, the legacy `codetype` default = subset B for alphanumeric
 * text) from the SAME value string, locally, with NO external request.
 *
 * Implementation: `bwip-js/node` → `toSVG` → base64 SVG data URL. bwip-js is
 * already a repo dependency (used by /admin/forwarders/print) — no new package,
 * no native canvas dep (Vercel-serverless safe). The output is a real,
 * scannable Code128 identical to what a warehouse scanner reads from the legacy
 * PNG (Code128 is the standard symbology; subset selection is purely an
 * encoding detail invisible to the scanner — the decoded value is identical).
 *
 * Legacy call site (admin + customer, identical params):
 *   include/barcode.php?text=<fTrackingCHN>&size=30&sizefactor=2
 *   → codetype defaults to "code128"; size = bar height; sizefactor = module width.
 *
 * Server-only (uses bwip-js/node + Buffer). Call from Server Components / route
 * handlers, never from a "use client" component.
 */
import bwipjs from "bwip-js/node";

/**
 * Which tracking strings get a barcode. The legacy gated on
 * `preg_match('/^[a-zA-Z0-9-]+$/i', text)` (alphanumeric/hyphen only) — but
 * many real PCS tracking codes carry a per-shipment split marker like
 * `DPK301890160035-1/2` (the `/` = part 2-of-2), which the legacy silently
 * dropped (ปอน 2026-06-10). Code128 subset B encodes `/` and `.` fine, so we
 * widen the gate to also allow `/` and `.` — the barcode now renders for those
 * codes and still scans to the exact value. Anything outside this set (spaces,
 * Thai text, …) is still skipped (renders as text only).
 */
export const CODE128_SAFE = /^[a-zA-Z0-9\-/.]+$/;

/**
 * Render `text` as a Code128 barcode and return an inline `data:image/svg+xml`
 * URL ready for `<img src=…>`. Returns `null` (never throws) when the text is
 * empty or unencodable, so a failed render degrades to "no barcode" rather than
 * 500-ing the page (the tracking number is rendered as text alongside anyway).
 *
 * @param text       the value to encode (e.g. a China tracking number)
 * @param includetext show the human-readable digits under the bars. Legacy did
 *                     NOT (`&print=true` was not passed) — default false.
 */
export function code128SvgDataUrl(
  text: string,
  includetext = false,
): string | null {
  const value = (text ?? "").trim();
  if (!value || !CODE128_SAFE.test(value)) return null;
  try {
    const svg = bwipjs.toSVG({
      bcid: "code128",
      text: value,
      scale: 2, // ≈ legacy sizefactor=2 (module width)
      height: 12, // bar height in mm-equivalents (≈ legacy size=30 px)
      includetext,
      textxalign: "center",
      textsize: 9,
    });
    return `data:image/svg+xml;base64,${Buffer.from(svg, "utf-8").toString("base64")}`;
  } catch (e) {
    console.error("[barcode] Code128 render failed", {
      text: value,
      message: (e as Error).message,
    });
    return null;
  }
}

/**
 * Render `text` as a QR code → inline `data:image/svg+xml` URL.
 *
 * Same bwip-js dependency as the Code128 helper above — NO new package, and
 * deliberately NOT the `qrcode` lib, which CLAUDE.md reserves for
 * `lib/promptpay.ts` (payment QRs must stay in one audited place; this is a
 * plain document reference, not money).
 *
 * Used by the ใบส่งสินค้า delivery slip, where the legacy PCS form carries a QR
 * in the top-right corner. QR has no charset restriction, so unlike Code128
 * there is no safe-pattern gate. Returns `null` on any failure so a bad render
 * degrades to "no QR" instead of 500-ing a printable document.
 */
export function qrSvgDataUrl(text: string, scale = 3): string | null {
  const value = (text ?? "").trim();
  if (!value) return null;
  try {
    const svg = bwipjs.toSVG({
      bcid: "qrcode",
      text: value,
      scale,
      // bwip-js defaults QR to error-correction level M (~15% recovery) —
      // enough for a printed page that may be folded or smudged. Not passed
      // explicitly: `eclevel` is absent from bwip-js's RenderOptions types.
    });
    return `data:image/svg+xml;base64,${Buffer.from(svg, "utf-8").toString("base64")}`;
  } catch (e) {
    console.error("[barcode] QR render failed", {
      text: value,
      message: (e as Error).message,
    });
    return null;
  }
}
