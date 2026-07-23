/**
 * /admin/billing-run/[id]/print — Peak-styled printable ใบวางบิล (R-2)
 *
 * 2026-06-10 ภูม flag: "ฟอร์มใบวางบิลเอาแบบ peak ที่เราทำ" — the bill now renders
 * via <BillingRunPaper> (components/billing-run/billing-run-paper.tsx), which
 * mirrors the Peak ใบเสร็จ design (logo / 28px title / orange meta-box /
 * 11-col cargo table / highlight box / certified row + QR + stamp). ต้นฉบับ +
 * สำเนา, A4 portrait, browser Cmd-P.
 *
 * WHT 1% + net are computed by getInvoiceDetail (lib/billing/wht.ts). The QR
 * opens the customer-side bill page.
 */

import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getInvoiceDetail } from "@/actions/admin/billing-run";
import { readThaiBaht } from "@/lib/utils/thai-number";
import { SITE_URL, ADDRESSES } from "@/components/seo/site";
import { BillingRunPaper, type BillingRunPaperRow } from "@/components/billing-run/billing-run-paper";
import { BILL_ROWS_PER_PAGE } from "@/lib/receipt/rows-per-page";
import { signBillToken } from "@/lib/receipt/receipt-token";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

// Bill-only pagination: BILL_ROWS_PER_PAGE (=24, the bill footer is smaller than the
// receipt's, so a ≤24-row bill = 1 ต้นฉบับ + 1 สำเนา; see lib/receipt/rows-per-page.ts).
// MUST match the public /b/[token] page — same value or the same bill paginates
// differently on each surface. The last page still keeps the summary block (flex-grow
// on the items box pushes it to the bottom, so a short bill's summary sits at the
// page bottom, not mid-page).
const ROWS_PER_PAGE = BILL_ROWS_PER_PAGE;

export default async function BillingRunPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Phase 2 ops-workflow audit unlock 2026-06-05 — Doc roles print billing docs.
  await requireAdmin(["super", "accounting", "ops", "freight_export_doc", "freight_import_doc"]);
  const { id } = await params;
  const invoiceId = Number(id);
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) notFound();

  const res = await getInvoiceDetail(invoiceId);
  if (!res.ok) {
    if (res.error === "not_found") notFound();
    throw new Error(res.error);
  }
  const { header, items } = res.data!;

  const rows: BillingRunPaperRow[] = items.map((it, idx) => ({
    no:          idx + 1,
    fid:         String(it.forwarder_id),
    tracking:    it.forwarder?.ftrackingchn ?? "",
    productType: it.forwarder?.product_type ?? "",
    cabinet:     it.forwarder?.cabinet ?? "",
    transport:   it.forwarder?.transport ?? "",
    rateBasis:   it.forwarder?.rate_basis ?? "",
    rate:        it.forwarder?.rate ?? 0,
    famount:     it.forwarder?.famount ?? 0,
    fweight:     it.forwarder?.fweight ?? 0,
    dimsDisplay: it.forwarder?.dimsDisplay ?? "",
    fvolume:     it.forwarder?.fvolume ?? 0,
    freight:     it.forwarder?.freight ?? 0,
    amount:      it.amount_thb,
  }));

  // อ้างอิง — เลขออเดอร์ฝากนำเข้าที่บิลนี้ครอบ (owner 2026-07-18 · mirror ใบเสร็จ).
  // ย่อเมื่อมีหลายรายการ ("#a, #b … (+N)") กันล้นกล่อง meta.
  const orderNos = Array.from(new Set(items.map((it) => it.forwarder_id)));
  const referenceOrder =
    orderNos.length <= 6
      ? orderNos.map((n) => `#${n}`).join(", ")
      : `${orderNos.slice(0, 5).map((n) => `#${n}`).join(", ")} …(+${orderNos.length - 5})`;

  // Chunk the rows into pages of ROWS_PER_PAGE so a long bill lays out across
  // A4 pages (the summary renders only on the last page). The summary money on
  // the paper stays the FULL-bill total (header.* below) — the pages only
  // carry the item-row subset, never a re-summed total.
  const pageCount = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
  const pages = Array.from({ length: pageCount }, (_, p) => ({
    pageNumber: p + 1,
    rows: rows.slice(p * ROWS_PER_PAGE, (p + 1) * ROWS_PER_PAGE),
  }));

  // The QR now opens the LOGIN-FREE public bill page `/b/{token}` (mirrors the
  // receipt's `/r/{token}`). The token is an unguessable HMAC capability link so
  // a scanning customer opens their own bill without logging in (the old URL
  // `/billing-run/{id}` was a login-gated protected route → landed on /login).
  const qrDataUrl = await QRCode.toDataURL(`${SITE_URL}/b/${signBillToken(invoiceId)}`, {
    margin: 1,
    width: 240,
  });

  return (
    <>
      <title>{`พิมพ์ใบวางบิล ${header.doc_no} | PR Admin`}</title>

      <div className="no-print bg-gray-100 p-4 text-center print:hidden">
        <PrintButton />
        <span className="ml-3 text-xs text-gray-600">
          กดปุ่ม &quot;พิมพ์&quot; หรือ Cmd+P / Ctrl+P — เลือกขนาด A4 portrait
        </span>
      </div>

      <BillingRunPaper
        docNo={header.doc_no}
        referenceOrder={referenceOrder}
        issuerAddress={ADDRESSES.office.full}
        dateIssued={header.date_issued}
        dateDue={header.is_credit ? header.date_due : null}
        buyerName={header.buyer_name || header.userid}
        buyerTaxId={header.buyer_tax_id}
        buyerAddress={header.buyer_address}
        deliveryAddress={header.delivery_address}
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
    </>
  );
}
