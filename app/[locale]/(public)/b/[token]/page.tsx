/**
 * Public billing-note page (ใบวางบิล) — `/b/[token]`.
 *
 * The login-free surface a customer reaches by scanning the QR on their printed
 * ใบวางบิล. Mirrors the public receipt page (`/r/[token]`) EXACTLY — the bill QR
 * used to point at `/billing-run/{id}`, a login-GATED (protected) route, so a
 * scanning customer landed on /login. Now the QR carries an unguessable HMAC
 * capability link (`{id}-{32hex}`, see `lib/receipt/receipt-token.ts` →
 * signBillToken / verifyBillToken) so the invoice id stays non-enumerable while
 * the holder of the printed paper opens their own bill directly — exactly how
 * the receipt does it, and how Peak exposes a public document.
 *
 * Renders BYTE-IDENTICALLY to the admin print page
 * (app/[locale]/(admin)/admin/billing-run/[id]/print/page.tsx): the SAME
 * <BillingRunPaper>, the SAME money figures from the SHARED loader
 * loadBillingRunDocument(). The only differences are the absence of admin chrome
 * (no print toolbar / breadcrumb) and the public "จัดการเอกสาร" toolbar.
 *
 * Security (mirrors the receipt, does NOT weaken):
 *   - the token is HMAC-signed + unguessable; a bad / tampered / wrong-type
 *     (a receipt token) token → notFound() (fail CLOSED, never renders a bill);
 *   - domain-separated so a receipt token can't be replayed as a bill token;
 *   - only the ONE invoice in the token is shown (no list, no raw id accepted);
 *   - noindex (a money document must never be indexed); force-dynamic.
 */

import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { SITE_URL, ADDRESSES } from "@/components/seo/site";
import { BillingRunPaper, type BillingRunPaperRow } from "@/components/billing-run/billing-run-paper";
import { loadBillingRunDocument } from "@/lib/billing/load-billing-run-document";
import { verifyBillToken } from "@/lib/receipt/receipt-token";
import { readThaiBaht } from "@/lib/utils/thai-number";
import { DOC_ROWS_PER_PAGE } from "@/lib/receipt/rows-per-page";
import PublicBillToolbar from "./public-bill-toolbar";

export const dynamic = "force-dynamic";

// A money document must never be indexed.
export const metadata = {
  title: "ใบวางบิล — Pacred",
  robots: { index: false, follow: false },
};

// Paginate identically to the admin print page (shared DOC_ROWS_PER_PAGE=13).
const ROWS_PER_PAGE = DOC_ROWS_PER_PAGE;

export default async function PublicBillPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Capability gate: a valid HMAC BILL token resolves to an invoice id; anything
  // malformed / forged / tampered / a receipt token → 404 (no enumeration, no
  // info leak, never renders a bill).
  const invoiceId = verifyBillToken(token);
  if (invoiceId === null) notFound();

  const doc = await loadBillingRunDocument(invoiceId);
  if (!doc) notFound();

  const { header, items } = doc;

  // Build the SAME rows the admin print page builds.
  const rows: BillingRunPaperRow[] = items.map((it, idx) => ({
    no:        idx + 1,
    fid:       String(it.forwarder_id),
    tracking:  it.forwarder?.ftrackingchn ?? "",
    cabinet:   it.forwarder?.cabinet ?? "",
    transport: it.forwarder?.transport ?? "",
    rateBasis: it.forwarder?.rate_basis ?? "",
    rate:      it.forwarder?.rate ?? 0,
    famount:   it.forwarder?.famount ?? 0,
    fweight:   it.forwarder?.fweight ?? 0,
    fvolume:   it.forwarder?.fvolume ?? 0,
    freight:   it.forwarder?.freight ?? 0,
    amount:    it.amount_thb,
  }));

  const pageCount = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
  const pages = Array.from({ length: pageCount }, (_, p) => ({
    pageNumber: p + 1,
    rows: rows.slice(p * ROWS_PER_PAGE, (p + 1) * ROWS_PER_PAGE),
  }));

  // Self-url QR (the printed paper re-encodes this same public page).
  const qrDataUrl = await QRCode.toDataURL(`${SITE_URL}/b/${token}`, {
    margin: 1,
    width: 240,
  });

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      {/* `id` is the toggle target for the toolbar's เต็มจอ/กระดาษ (.receipt-fit).
          Ships WITH `receipt-fit` so the A4 paper fits a phone on first paint. */}
      <div id="publicBillDoc" className="receipt-fit mx-auto max-w-5xl px-2 py-4 sm:px-4">
        <BillingRunPaper
          docNo={header.doc_no}
          issuerAddress={ADDRESSES.office.full}
          dateIssued={header.date_issued}
          dateDue={header.date_due}
          buyerName={header.buyer_name || header.userid}
          buyerTaxId={header.buyer_tax_id}
          buyerAddress={header.buyer_address}
          isJuristic={header.is_juristic}
          subtotal={header.subtotal_thb}
          maoFee={header.mao_fee_thb}
          deliveryChn={header.delivery_chn_thb}
          deliveryTh={header.delivery_th_thb}
          other={header.other_thb}
          discount={header.discount_thb}
          sumThaiShipping={header.sum_thai_shipping}
          sumChnPlus={header.sum_chn_plus}
          sumCrate={header.sum_crate}
          sumUpdate={header.sum_update}
          sumOtherRows={header.sum_other_rows}
          sumDiscountRows={header.sum_discount_rows}
          total={header.total_thb}
          whtAmount={header.wht_amount}
          netPayable={header.net_payable}
          netThaiWord={readThaiBaht(header.net_payable)}
          note={header.note_for_customer}
          issuedBy={header.issued_by}
          pages={pages}
          qrDataUrl={qrDataUrl}
        />
      </div>

      <PublicBillToolbar />
    </div>
  );
}
