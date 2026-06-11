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
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

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
    amount:    it.amount_thb,
  }));

  const qrDataUrl = await QRCode.toDataURL(`${SITE_URL}/billing-run/${invoiceId}`, {
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
        issuerAddress={ADDRESSES.office.full}
        dateIssued={header.date_issued}
        dateDue={header.date_due}
        buyerName={header.buyer_name || header.userid}
        buyerTaxId={header.buyer_tax_id}
        buyerAddress={header.buyer_address}
        isJuristic={header.is_juristic}
        subtotal={header.subtotal_thb}
        deliveryChn={header.delivery_chn_thb}
        deliveryTh={header.delivery_th_thb}
        other={header.other_thb}
        discount={header.discount_thb}
        total={header.total_thb}
        whtAmount={header.wht_amount}
        netPayable={header.net_payable}
        netThaiWord={readThaiBaht(header.net_payable)}
        note={header.note_for_customer}
        issuedBy={header.issued_by}
        items={rows}
        qrDataUrl={qrDataUrl}
      />
    </>
  );
}
