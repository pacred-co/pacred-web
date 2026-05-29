/**
 * Admin > "รายละเอียดใบแจ้งหนี้" — DETAIL + PRINT page
 *
 * Agent F3 · E2E LOOP FIX batch (2026-05-29).
 *
 * Reads tb_receipt by id, joins tb_receipt_item → tb_forwarder for line
 * items, joins tb_users for customer info, and renders a print-friendly
 * invoice view with a "พิมพ์ใบแจ้งหนี้" button (window.print() + @media
 * print CSS — NO React-PDF yet · per F3 brief Phase 2 will swap for the
 * Sarabun PDF pattern).
 */

import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { calcForwarderOutstanding } from "@/lib/forwarder/outstanding";
import { Printer } from "lucide-react";
import PrintButton from "./print-button";

export const dynamic = "force-dynamic";

type RawReceipt = {
  id: number;
  rid: string;
  refid: string | null;
  rdate: string | null;
  rdatecreate: string | null;
  issuedate: string | null;
  ramount: number | string | null;
  totalbeforewithholding: number | string | null;
  rstatus: string;
  userid: string;
  adminid: string | null;
  statusprint: string | null;
  rdateprint: string | null;
  corporatetype: string | null;
  recompnumber: string | null;
  recompname: string | null;
  recompaddress: string | null;
  documentissuer: string | null;
  documentapprover: string | null;
};

type RawReceiptItem = {
  id: number;
  rid: string;
  fid: number;
};

type RawForwarder = {
  id: number;
  userid: string;
  ftrackingchn: string | null;
  fcabinetnumber: string | null;
  famount: number | null;
  fweight: number | string | null;
  fvolume: number | string | null;
  fdate: string | null;
  // For calcForwarderOutstanding (per-row)
  ftotalprice: number | string | null;
  ftransportprice: number | string | null;
  fpriceupdate: number | string | null;
  fshippingservice: number | string | null;
  pricecrate: number | string | null;
  ftransportpricechnthb: number | string | null;
  priceother: number | string | null;
  fdiscount: number | string | null;
  fusercompany: number | string | null;
};

type RawUser = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
  userEmail: string | null;
};

const RSTATUS_LABEL: Record<string, { label: string; chip: string }> = {
  "1": { label: "จ่ายแล้ว",    chip: "bg-emerald-500 text-emerald-50" },
  "2": { label: "ยกเลิก",       chip: "bg-red-500 text-red-50" },
  "3": { label: "รอชำระเงิน",   chip: "bg-amber-400 text-amber-950" },
};

function fmtBaht(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });
}

function toNumber(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

export default async function ForwarderInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin(["super", "accounting"]);

  const { id: idStr } = await params;
  const receiptId = parseInt(idStr, 10);
  if (!Number.isFinite(receiptId) || receiptId <= 0) notFound();

  const admin = createAdminClient();

  // ── Receipt header ───────────────────────────────────────
  const { data: receiptData, error: rErr } = await admin
    .from("tb_receipt")
    .select(
      "id, rid, refid, rdate, rdatecreate, issuedate, ramount, totalbeforewithholding, " +
        "rstatus, userid, adminid, statusprint, rdateprint, corporatetype, " +
        "recompnumber, recompname, recompaddress, documentissuer, documentapprover",
    )
    .eq("id", receiptId)
    .maybeSingle<RawReceipt>();
  if (rErr) {
    console.error(`[tb_receipt read] failed`, { code: rErr.code, message: rErr.message });
    throw new Error(`Failed to load invoice: ${rErr.message}`);
  }
  if (!receiptData) notFound();
  const receipt = receiptData;

  // ── Items ────────────────────────────────────────────────
  const { data: itemRows, error: itemsErr } = await admin
    .from("tb_receipt_item")
    .select("id, rid, fid")
    .eq("rid", receipt.rid);
  if (itemsErr) {
    console.error(`[tb_receipt_item list] failed`, { code: itemsErr.code, message: itemsErr.message });
  }
  const items = (itemRows ?? []) as unknown as RawReceiptItem[];

  // ── Forwarder rows (line items) ──────────────────────────
  const fids = items.map((it) => it.fid);
  let forwarders: RawForwarder[] = [];
  if (fids.length > 0) {
    const { data: fwdRows, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select(
        "id, userid, ftrackingchn, fcabinetnumber, famount, fweight, fvolume, fdate, " +
          "ftotalprice, ftransportprice, fpriceupdate, fshippingservice, " +
          "pricecrate, ftransportpricechnthb, priceother, fdiscount, fusercompany",
      )
      .in("id", fids);
    if (fwdErr) {
      console.error(`[tb_forwarder list] failed`, { code: fwdErr.code, message: fwdErr.message });
    }
    forwarders = (fwdRows ?? []) as unknown as RawForwarder[];
  }
  const forwardersById = new Map(forwarders.map((f) => [f.id, f]));

  // ── Customer ─────────────────────────────────────────────
  const { data: userRow, error: userErr } = await admin
    .from("tb_users")
    .select("userID, userName, userLastName, userTel, userEmail")
    .eq("userID", receipt.userid)
    .maybeSingle<RawUser>();
  if (userErr) {
    console.error(`[tb_users read] failed`, { code: userErr.code, message: userErr.message });
  }

  const customerName = (() => {
    if (receipt.recompname && receipt.recompname.trim()) return receipt.recompname.trim();
    if (userRow) {
      const n = [userRow.userName, userRow.userLastName].filter(Boolean).join(" ").trim();
      return n || receipt.userid;
    }
    return receipt.userid;
  })();

  const totalAmount = toNumber(receipt.totalbeforewithholding) || toNumber(receipt.ramount);
  const status = RSTATUS_LABEL[receipt.rstatus] ?? { label: receipt.rstatus, chip: "bg-gray-300 text-gray-900" };
  const isCorporate = receipt.corporatetype === "1";

  return (
    <>
      {/* Print stylesheet — hides admin chrome, formats the invoice for A4 */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-page {
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
            max-width: 100% !important;
          }
          .print-section { page-break-inside: avoid; }
          @page { size: A4; margin: 12mm; }
        }
      `}</style>

      <div className="min-h-screen bg-slate-50 print:bg-white">
        <div className="mx-auto max-w-4xl px-4 py-6">
          {/* Breadcrumb + actions (hidden on print) */}
          <div className="no-print">
            <nav className="text-sm text-slate-500 mb-3">
              <Link href="/admin" className="hover:text-indigo-700">หน้าแรก</Link>
              <span className="mx-1">/</span>
              <Link href="/admin/accounting" className="hover:text-indigo-700">บัญชี</Link>
              <span className="mx-1">/</span>
              <Link href="/admin/accounting/forwarder-invoice" className="hover:text-indigo-700">
                ใบแจ้งหนี้ ฝากนำเข้า
              </Link>
              <span className="mx-1">/</span>
              <span className="text-slate-700">{receipt.rid}</span>
            </nav>

            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-semibold text-slate-900">
                    ใบแจ้งหนี้ {receipt.rid}
                  </h1>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${status.chip}`}>
                    {status.label}
                  </span>
                </div>
                <p className="text-sm text-slate-500 mt-1">
                  ออกเมื่อ {fmtDate(receipt.issuedate ?? receipt.rdatecreate)} โดย {receipt.documentissuer || receipt.adminid || "-"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/admin/accounting/forwarder-invoice"
                  className="text-sm text-slate-600 hover:text-indigo-700"
                >
                  ← กลับไปรายการ
                </Link>
                <PrintButton>
                  <Printer className="size-4" />
                  พิมพ์ใบแจ้งหนี้
                </PrintButton>
              </div>
            </div>
          </div>

          {/* Invoice document (printable) */}
          <div className="print-page bg-white rounded-lg border border-slate-200 shadow-sm p-8 print:p-0 print:border-0 print:shadow-none">
            {/* Header */}
            <div className="flex justify-between items-start pb-4 border-b border-slate-300 print-section">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Pacred (Thailand) Co., Ltd.</h2>
                <p className="text-sm text-slate-600 mt-1">บริษัท แพคเรด (ประเทศไทย) จำกัด</p>
                <p className="text-xs text-slate-500 mt-1">เลขประจำตัวผู้เสียภาษี 0105564077716</p>
              </div>
              <div className="text-right">
                <h3 className="text-xl font-bold text-slate-900">ใบแจ้งหนี้ / INVOICE</h3>
                <p className="text-sm text-slate-700 mt-1">
                  เลขที่: <span className="font-mono font-semibold">{receipt.rid}</span>
                </p>
                <p className="text-xs text-slate-600 mt-1">
                  วันที่ออก: {fmtDate(receipt.issuedate ?? receipt.rdatecreate)}
                </p>
              </div>
            </div>

            {/* Customer block */}
            <div className="grid grid-cols-2 gap-6 py-4 border-b border-slate-200 print-section">
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  ลูกค้า / BILL TO
                </h4>
                <p className="mt-2 text-sm font-medium text-slate-900">{customerName}</p>
                {isCorporate && receipt.recompnumber && (
                  <p className="text-xs text-slate-600 mt-0.5">
                    เลขผู้เสียภาษี: {receipt.recompnumber}
                  </p>
                )}
                <p className="text-xs text-slate-600 mt-0.5">รหัสสมาชิก: {receipt.userid}</p>
                {receipt.recompaddress && (
                  <p className="text-xs text-slate-600 mt-1 whitespace-pre-line">
                    {receipt.recompaddress}
                  </p>
                )}
                {userRow?.userTel && (
                  <p className="text-xs text-slate-600 mt-0.5">โทร. {userRow.userTel}</p>
                )}
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  ข้อมูลเอกสาร
                </h4>
                <dl className="mt-2 text-sm space-y-1">
                  <div className="flex justify-between">
                    <dt className="text-slate-600">เลขใบแจ้งหนี้:</dt>
                    <dd className="font-mono">{receipt.rid}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-600">วันที่ออก:</dt>
                    <dd>{fmtDate(receipt.issuedate ?? receipt.rdatecreate)}</dd>
                  </div>
                  {receipt.refid && receipt.refid.trim() && (
                    <div className="flex justify-between">
                      <dt className="text-slate-600">หมายเหตุ:</dt>
                      <dd className="text-right max-w-[14rem] break-words">{receipt.refid}</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-slate-600">ประเภท:</dt>
                    <dd>{isCorporate ? "นิติบุคคล" : "บุคคลธรรมดา"}</dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* Items */}
            <div className="py-4 print-section">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                รายการสินค้า / ITEMS
              </h4>
              <table className="w-full text-sm border-collapse">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-2 py-2 text-left border border-slate-300 text-xs">รายการ</th>
                    <th className="px-2 py-2 text-left border border-slate-300 text-xs">Tracking</th>
                    <th className="px-2 py-2 text-center border border-slate-300 text-xs">กล่อง</th>
                    <th className="px-2 py-2 text-right border border-slate-300 text-xs">น้ำหนัก</th>
                    <th className="px-2 py-2 text-right border border-slate-300 text-xs">ปริมาตร</th>
                    <th className="px-2 py-2 text-right border border-slate-300 text-xs">ยอด (฿)</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-2 py-6 text-center border border-slate-300 text-slate-500">
                        ไม่พบรายการ
                      </td>
                    </tr>
                  ) : (
                    items.map((it, idx) => {
                      const f = forwardersById.get(it.fid);
                      const lineAmount = f ? calcForwarderOutstanding(f) : 0;
                      return (
                        <tr key={it.id}>
                          <td className="px-2 py-2 border border-slate-300">
                            <div className="text-xs font-medium">บริการนำเข้า #{it.fid}</div>
                            <div className="text-xs text-slate-500">
                              {f?.fcabinetnumber ? `ตู้ ${f.fcabinetnumber}` : ""}
                              {f?.fdate ? ` · ${fmtDate(f.fdate)}` : ""}
                              {idx === 0 && items.length === 1 ? "" : ""}
                            </div>
                          </td>
                          <td className="px-2 py-2 border border-slate-300 text-xs">
                            {f?.ftrackingchn ?? "-"}
                          </td>
                          <td className="px-2 py-2 border border-slate-300 text-center tabular-nums">
                            {f?.famount ?? "-"}
                          </td>
                          <td className="px-2 py-2 border border-slate-300 text-right tabular-nums">
                            {f ? toNumber(f.fweight).toFixed(2) : "-"}
                          </td>
                          <td className="px-2 py-2 border border-slate-300 text-right tabular-nums">
                            {f ? toNumber(f.fvolume).toFixed(5) : "-"}
                          </td>
                          <td className="px-2 py-2 border border-slate-300 text-right font-medium tabular-nums">
                            ฿{fmtBaht(lineAmount)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end py-4 border-t border-slate-300 print-section">
              <div className="w-72 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-600">ยอดรวมก่อนหัก ณ ที่จ่าย:</dt>
                  <dd className="tabular-nums">
                    ฿{fmtBaht(toNumber(receipt.totalbeforewithholding))}
                  </dd>
                </div>
                <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-300">
                  <dt>ยอดที่ต้องชำระ:</dt>
                  <dd className="tabular-nums text-indigo-700">฿{fmtBaht(totalAmount)}</dd>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="grid grid-cols-2 gap-6 pt-8 print-section">
              <div className="text-center">
                <div className="border-t border-slate-400 pt-2 mt-12">
                  <p className="text-xs text-slate-600">ผู้ออกเอกสาร</p>
                  <p className="text-sm font-medium mt-0.5">
                    {receipt.documentissuer || receipt.adminid || "-"}
                  </p>
                </div>
              </div>
              <div className="text-center">
                <div className="border-t border-slate-400 pt-2 mt-12">
                  <p className="text-xs text-slate-600">ผู้อนุมัติ</p>
                  <p className="text-sm font-medium mt-0.5">
                    {receipt.documentapprover || "____________________"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Status banner (hidden on print) */}
          {receipt.rstatus === "3" && (
            <div className="no-print mt-4 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <strong>สถานะ: รอชำระเงิน</strong> — ลูกค้าจะได้รับแจ้งเตือนทาง LINE / อีเมล / SMS เมื่อระบบสร้างเอกสารเสร็จ
            </div>
          )}
          {receipt.rstatus === "1" && (
            <div className="no-print mt-4 rounded border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <strong>สถานะ: ชำระเงินแล้ว</strong>
            </div>
          )}
          {receipt.rstatus === "2" && (
            <div className="no-print mt-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
              <strong>สถานะ: ยกเลิก</strong>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
