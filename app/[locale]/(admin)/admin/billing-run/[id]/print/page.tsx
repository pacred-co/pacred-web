/**
 * /admin/billing-run/[id]/print — print-friendly ใบวางบิล (R-2)
 *
 * Renders an A4-portrait single-page print view of the invoice.
 * Customer can hand-print via browser Cmd-P (no @react-pdf dependency · the
 * inline @media print CSS handles page sizing).
 *
 * Future R-3: replace with @react-pdf for proper digital signature + 50-ทวิ
 * embed; current implementation is sufficient for staff-side delivery.
 */

import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getInvoiceDetail } from "@/actions/admin/billing-run";
import {
  SITE_NAME,
  SITE_URL,
  SITE_LEGAL_NAME_TH,
  TAX_ID,
  CONTACT,
  ADDRESSES,
} from "@/components/seo/site";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

function thbFmt(n: number): string {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default async function BillingRunPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Phase 2 ops-workflow audit unlock 2026-06-05 — Doc roles print billing
  // docs (`docs/research/ops-workflow-audit-2026-06-05.md` §28).
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

  return (
    <>
      <title>{`พิมพ์ใบวางบิล ${header.doc_no} | PR Admin`}</title>
      <style>{`
        @page { size: A4 portrait; margin: 12mm; }
        @media print {
          html, body { background: white; }
          .no-print { display: none !important; }
        }
        body { font-family: Prompt, sans-serif; color: #111; }
        .invoice-page {
          max-width: 210mm; min-height: 297mm; margin: 0 auto;
          padding: 14mm 12mm; background: white; color: #111;
          font-size: 12px; line-height: 1.5;
        }
        .invoice-page h1, .invoice-page h2, .invoice-page h3 { color: #111; }
        .invoice-page table { width: 100%; border-collapse: collapse; }
        .invoice-page th, .invoice-page td { padding: 4px 6px; border-bottom: 1px solid #eee; }
        .invoice-page th { background: #f7f7f7; text-align: left; font-weight: 600; }
        .invoice-page .right { text-align: right; }
        .invoice-page .center { text-align: center; }
        .invoice-page .totals { margin-top: 8px; }
        .invoice-page .totals tr td { border: 0; padding: 2px 4px; }
        .invoice-page .totals .grand { font-weight: bold; font-size: 14px; border-top: 2px solid #111; padding-top: 4px; }
      `}</style>

      <div className="no-print bg-gray-100 p-4 text-center print:hidden">
        <PrintButton />
        <span className="ml-3 text-xs text-gray-600">
          กดปุ่ม &quot;พิมพ์&quot; หรือ Cmd+P / Ctrl+P — เลือกขนาด A4 portrait
        </span>
      </div>

      <main className="invoice-page">
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "18px" }}>{SITE_LEGAL_NAME_TH}</h1>
            <div style={{ fontSize: "10px", color: "#666" }}>
              {ADDRESSES.office.full}<br />
              เลขประจำตัวผู้เสียภาษี: {TAX_ID}<br />
              โทร: {CONTACT.phoneCompanyDisplay} · {CONTACT.email}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <h2 style={{ margin: 0, fontSize: "20px" }}>ใบวางบิล</h2>
            <div style={{ fontSize: "11px", color: "#666" }}>BILLING-RUN INVOICE</div>
            <div style={{ marginTop: "8px", fontSize: "11px" }}>
              <div><strong>เลขที่:</strong> <span style={{ fontFamily: "monospace" }}>{header.doc_no}</span></div>
              <div><strong>วันที่ออก:</strong> {header.date_issued}</div>
              <div><strong>ครบกำหนด:</strong> {header.date_due}</div>
            </div>
          </div>
        </div>

        {/* Buyer */}
        <div style={{ border: "1px solid #ddd", borderRadius: "4px", padding: "8px 10px", marginBottom: "12px", fontSize: "11px" }}>
          <div style={{ fontWeight: 600, marginBottom: "4px" }}>เรียน / Customer</div>
          <div><strong>{header.buyer_name || header.userid}</strong> · รหัสสมาชิก {header.userid}</div>
          {header.is_juristic && header.buyer_tax_id && (
            <div>เลขประจำตัวผู้เสียภาษี: <span style={{ fontFamily: "monospace" }}>{header.buyer_tax_id}</span>{header.buyer_branch ? ` · สาขา: ${header.buyer_branch}` : ""}</div>
          )}
          {header.buyer_address && (
            <div style={{ color: "#444", marginTop: "2px" }}>{header.buyer_address}</div>
          )}
        </div>

        {/* Line items table */}
        <table>
          <thead>
            <tr>
              <th style={{ width: "8%" }}>ลำดับ</th>
              <th>เลขที่ออเดอร์</th>
              <th>รหัสพัสดุ</th>
              <th className="right">กล่อง</th>
              <th className="right">น้ำหนัก</th>
              <th className="right">CBM</th>
              <th className="right" style={{ width: "16%" }}>จำนวน (฿)</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={it.id}>
                <td className="center">{idx + 1}</td>
                <td>#{it.forwarder_id}</td>
                <td style={{ fontFamily: "monospace", fontSize: "10px" }}>{it.forwarder?.ftrackingchn ?? "—"}</td>
                <td className="right">{it.forwarder?.famount ?? "—"}</td>
                <td className="right">{it.forwarder?.fweight ?? "—"}</td>
                <td className="right">{it.forwarder?.fvolume ?? "—"}</td>
                <td className="right">{thbFmt(it.amount_thb)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "12px" }}>
          <table className="totals" style={{ width: "auto", minWidth: "280px" }}>
            <tbody>
              <tr><td>ค่าขนส่งรายการ</td><td className="right">{thbFmt(header.subtotal_thb)}</td></tr>
              <tr><td>+ ค่าขนส่งจีน</td><td className="right">{thbFmt(header.delivery_chn_thb)}</td></tr>
              <tr><td>+ ค่าขนส่งไทย</td><td className="right">{thbFmt(header.delivery_th_thb)}</td></tr>
              <tr><td>+ อื่นๆ</td><td className="right">{thbFmt(header.other_thb)}</td></tr>
              {header.discount_thb > 0 && (
                <tr><td>− ส่วนลด</td><td className="right">−{thbFmt(header.discount_thb)}</td></tr>
              )}
              {header.wht_amount > 0 ? (
                <>
                  <tr><td>รวมทั้งสิ้น (Total)</td><td className="right">{thbFmt(header.total_thb)}</td></tr>
                  <tr style={{ color: "#b91c1c" }}>
                    <td>หัก ณ ที่จ่าย 1% (ค่าขนส่ง)</td>
                    <td className="right">−{thbFmt(header.wht_amount)}</td>
                  </tr>
                  <tr className="grand"><td>ยอดชำระสุทธิ (Net payable)</td><td className="right">฿{thbFmt(header.net_payable)}</td></tr>
                </>
              ) : (
                <tr className="grand"><td>รวมทั้งสิ้น (Total)</td><td className="right">฿{thbFmt(header.total_thb)}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* WHT 50-ทวิ note — only when the juristic buyer withholds */}
        {header.wht_amount > 0 && (
          <div style={{ marginTop: "10px", fontSize: "10px", color: "#444", lineHeight: 1.5 }}>
            * ลูกค้าหักภาษี ณ ที่จ่าย 1% (ค่าขนส่ง) จำนวน ฿{thbFmt(header.wht_amount)} —
            กรุณาออกหนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) ในนาม{" "}
            <strong>{SITE_LEGAL_NAME_TH}</strong> เลขประจำตัวผู้เสียภาษี {TAX_ID}
          </div>
        )}

        {/* Note */}
        {header.note_for_customer && (
          <div style={{ marginTop: "16px", border: "1px solid #ddd", borderRadius: "4px", padding: "8px 10px", fontSize: "11px" }}>
            <div style={{ fontWeight: 600, marginBottom: "4px" }}>หมายเหตุ</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{header.note_for_customer}</div>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: "30px", paddingTop: "12px", borderTop: "1px solid #ddd", display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#666" }}>
          <div>เอกสารออกโดยระบบ {SITE_NAME} · {SITE_URL}</div>
          <div>หน้า 1/1</div>
        </div>

        <div style={{ marginTop: "40px", display: "flex", justifyContent: "space-around", textAlign: "center", fontSize: "11px" }}>
          <div style={{ width: "200px", borderTop: "1px solid #999", paddingTop: "4px" }}>
            ผู้ออกเอกสาร<br />
            <span style={{ color: "#999", fontSize: "10px" }}>({header.issued_by})</span>
          </div>
          <div style={{ width: "200px", borderTop: "1px solid #999", paddingTop: "4px" }}>
            ผู้รับเอกสาร<br />
            <span style={{ color: "#999", fontSize: "10px" }}>(ลูกค้า {header.userid})</span>
          </div>
        </div>
      </main>
    </>
  );
}
