/**
 * Public receipt page (ภูม flag round 8 · point 4) — `/r/[token]`.
 *
 * The login-free surface a customer reaches by scanning the QR on their printed
 * ใบเสร็จ. NO auth: the `[token]` is an unguessable HMAC capability link
 * (`{id}-{32hex}`, see `lib/receipt/receipt-token.ts`) so the receipt id stays
 * non-enumerable while the holder of the printed paper can open their own
 * document directly — exactly how Peak exposes a public document.
 *
 * Renders BYTE-IDENTICALLY to the admin print page: same `<ReceiptPaper>`, same
 * money figures from `loadReceiptDocument()`. The only differences here are the
 * absence of admin chrome (no breadcrumb / print-status / backfill banner) and
 * the public "จัดการเอกสาร" toolbar (download / print / fit / login / locale).
 */

import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { SITE_URL } from "@/components/seo/site";
import { ReceiptPaper } from "@/components/receipt/receipt-paper";
import { loadReceiptDocument } from "@/lib/receipt/load-receipt-document";
import { verifyReceiptToken } from "@/lib/receipt/receipt-token";
import PublicReceiptToolbar from "./public-receipt-toolbar";
import ReceiptWhtCertGate from "./receipt-wht-cert-gate";

export const dynamic = "force-dynamic";

// A money document must never be indexed.
export const metadata = {
  title: "ใบเสร็จรับเงิน — Pacred",
  robots: { index: false, follow: false },
};

export default async function PublicReceiptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Capability gate: a valid HMAC token resolves to a receipt id; anything
  // malformed / forged / tampered → 404 (no enumeration, no info leak).
  const id = verifyReceiptToken(token);
  if (id === null) notFound();

  const doc = await loadReceiptDocument(id);
  if (!doc) notFound();

  // Self-url QR (the printed paper re-encodes this same public page).
  const qrDataUrl = await QRCode.toDataURL(`${SITE_URL}/r/${token}`, {
    width:  160,
    margin: 0,
    color:  { dark: "#111827", light: "#FFFFFF" },
  });

  // 50-ทวิ cert PROMPT (migration 0173 · ภูม 2026-06-10 · un-blocked 2026-06-14).
  //
  // ❗ The legacy PCS receipt NEVER blocked the customer print on a WHT cert —
  // verified against the legacy PHP receipt (pcs-admin/create-f-receipt.php +
  // exampleReceiptF.php · zero wht/cert/50ทวิ gate; the only redirect there is
  // a login auth-check). Blocking the print was a Pacred-only addition that
  // created a chicken-and-egg: a juristic customer needs the RECEIPT in hand to
  // *issue* their 1% หัก-ณ-ที่จ่าย (50 ทวิ), but we were withholding the receipt
  // until the cert arrived — backwards.
  //
  // Fix: the receipt is ALWAYS viewable + printable. We KEEP the cert as a
  // NON-BLOCKING nudge (upload still offered, the admin cert-chase status stays
  // an AR signal — see actions/receipt-wht-cert.ts + load-receipt-document.ts
  // `whtCert`), but it no longer locks print/download.
  //
  // `doc.whtCert.locked` is still computed (= corporate WHT receipt whose cert
  // isn't yet approved/waived) — we now use it ONLY to decide whether to OFFER
  // the upload prompt, never to lock the document.
  const showCertPrompt = doc.whtCert.locked;
  const certStatus = doc.whtCert.status === "pending" ? "pending" : "none";

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <div className="px-2 pt-4 sm:px-4">
        {showCertPrompt && <ReceiptWhtCertGate token={token} status={certStatus} />}
      </div>

      {/* `id` is the toggle target for the toolbar's เต็มจอ/กระดาษ (.receipt-fit).
          Ships WITH `receipt-fit` so the A4 paper fits a phone on first paint
          (no horizontal scroll, no flash) — the toolbar toggles it off for
          true "paper" view. On desktop fit caps at 210mm, so it looks the same. */}
      <div id="publicReceiptDoc" className="receipt-fit mx-auto max-w-5xl px-2 py-4 sm:px-4">
        <ReceiptPaper pages={doc.pages} qrDataUrl={qrDataUrl} {...doc.commonProps} />
      </div>

      {/* No `printLocked` — the receipt is always printable (legacy never gated
          the print on the cert; the cert prompt above is a non-blocking nudge). */}
      <PublicReceiptToolbar />
    </div>
  );
}
