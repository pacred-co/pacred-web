/**
 * /admin/accounting/receipts/[rid] — receipt DETAIL (read-only) (2026-05-30 sitting-B)
 *
 * ── PURPOSE ───────────────────────────────────────────────────────
 * Companion to the new PEAK-style list at /admin/accounting/receipts.
 * Read-only detail view that shows everything needed to verify a receipt
 * before printing or referring a customer to it. Print itself routes to
 * the existing Wave 29 mPDF-faithful page at
 * `/admin/accounting/forwarder-invoice/[id]` (with the proven 2-page
 * ต้นฉบับ+สำเนา layout · sin-wandee signature · WHT calc).
 *
 * ── ROUTE PARAM ──────────────────────────────────────────────────
 * `[rid]` accepts either the business id (e.g. `FRG2605-00220`) OR the
 * numeric `tb_receipt.id`. Resolution lives in
 * `actions/admin/accounting-receipts.ts:getReceiptDetailByRid`.
 *
 * ── DATA SOURCE ──────────────────────────────────────────────────
 * Reads `tb_receipt` (0081 L4132) + `tb_receipt_item` (0081 L4275) +
 * `tb_forwarder` per line + `tb_users` for header. All inside
 * `getReceiptDetailByRid`. Returns null → notFound() (no silent 404 on
 * a transient db error per AGENTS.md §0c).
 *
 * ── ROLES ────────────────────────────────────────────────────────
 * Guard inside the action (super | accounting).
 */

import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  getReceiptDetailByRid,
  type ReceiptDetail,
} from "@/actions/admin/accounting-receipts";
import { Printer, ChevronLeft } from "lucide-react";

export const dynamic = "force-dynamic";

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

const RSTATUS_CFG: Record<string, { label: string; chip: string }> = {
  "1": { label: "ออกแล้ว (จ่ายแล้ว)", chip: "bg-emerald-100 text-emerald-800 border border-emerald-300" },
  "2": { label: "ยกเลิก",              chip: "bg-red-100 text-red-800 border border-red-300" },
  "3": { label: "รอชำระเงิน",          chip: "bg-amber-100 text-amber-800 border border-amber-300" },
  "0": { label: "ร่าง",                chip: "bg-slate-100 text-slate-700 border border-slate-300" },
};

function rstatusCfg(rstatus: string) {
  return RSTATUS_CFG[rstatus] ?? {
    label: rstatus,
    chip:  "bg-slate-100 text-slate-700 border border-slate-300",
  };
}

function fmtThb(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function toNumber(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function customerHeaderName(d: ReceiptDetail): string {
  if (d.isCorporate && d.recompname) return d.recompname;
  if (d.customer) {
    const name = [d.customer.userName, d.customer.userLastName].filter(Boolean).join(" ").trim();
    if (name) return name;
  }
  return d.userid;
}

// ────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────

export default async function ReceiptDetailPage({
  params,
}: {
  params: Promise<{ rid: string }>;
}) {
  await requireAdmin(["super", "accounting"]);

  const { rid } = await params;
  const detail = await getReceiptDetailByRid(decodeURIComponent(rid));
  if (!detail) notFound();

  const cfg = rstatusCfg(detail.rstatus);
  const headerName = customerHeaderName(detail);
  const refOrderHref = detail.items.length === 1
    ? `/admin/forwarders/${detail.items[0].fid}`
    : undefined;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-6 space-y-5">
        {/* ── Breadcrumb ── */}
        <nav className="text-xs text-slate-500">
          <Link href="/admin" className="hover:text-indigo-700">หน้าแรก</Link>
          <span className="mx-1">/</span>
          <Link href="/admin/accounting" className="hover:text-indigo-700">บัญชี</Link>
          <span className="mx-1">/</span>
          <Link href="/admin/accounting/receipts" className="hover:text-indigo-700">ใบเสร็จรับเงิน</Link>
          <span className="mx-1">/</span>
          <span className="text-slate-700">{detail.rid}</span>
        </nav>

        {/* ── Header bar ── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-slate-900">ใบเสร็จรับเงิน {detail.rid}</h1>
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cfg.chip}`}>
                {cfg.label}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              ออกเมื่อ {fmtDate(detail.issuedate ?? detail.rdate ?? detail.rdatecreate)}
              {detail.documentissuer && <> · โดย <b>{detail.documentissuer}</b></>}
              {detail.statusprint === "1" && <> · พิมพ์แล้ว</>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/accounting/receipts"
              className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-primary-700"
            >
              <ChevronLeft className="size-4" />
              กลับไปรายการ
            </Link>
            {/* "พิมพ์" — hand off to the proven Wave 29 mPDF-faithful page.
                /admin/accounting/forwarder-invoice/[id] runs the
                statusprint='1' stamp via PrintButton + window.print(). */}
            <Link
              href={`/admin/accounting/forwarder-invoice/${detail.id}`}
              className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary-700"
            >
              <Printer className="size-4" />
              พิมพ์ใบเสร็จ
            </Link>
          </div>
        </div>

        {/* ── Header card — receipt + customer summary ── */}
        <section className="grid md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-2">
            <h2 className="text-sm font-semibold text-slate-700 border-b border-slate-100 pb-1.5 mb-2">
              ข้อมูลเอกสาร
            </h2>
            <Row label="เลขที่ใบเสร็จ"  value={<span className="font-mono">{detail.rid}</span>} />
            <Row label="เลขอ้างอิง"     value={detail.refid && detail.refid.trim() ? <span className="font-mono text-xs">{detail.refid}</span> : "—"} />
            <Row label="วันที่ออก"      value={fmtDate(detail.issuedate ?? detail.rdate)} />
            <Row label="วันที่สร้าง"    value={fmtDate(detail.rdatecreate)} />
            <Row label="ประเภทลูกค้า"   value={detail.isCorporate ? "นิติบุคคล (FRC)" : "บุคคลธรรมดา (FRG)"} />
            <Row label="ผู้ออกเอกสาร"   value={detail.documentissuer ?? detail.adminid ?? "—"} />
            <Row label="ผู้อนุมัติ"      value={detail.documentapprover ?? "—"} />
            <Row label="พิมพ์แล้ว"      value={detail.statusprint === "1" ? "ใช่" : "ยังไม่พิมพ์"} />
            {refOrderHref && (
              <Row
                label="อ้างอิงงาน"
                value={
                  <Link href={refOrderHref} className="text-primary-700 hover:underline font-mono">
                    {detail.items[0].ftrackingchn ?? `#${detail.items[0].fid}`}
                  </Link>
                }
              />
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-2">
            <h2 className="text-sm font-semibold text-slate-700 border-b border-slate-100 pb-1.5 mb-2">
              ลูกค้า
            </h2>
            <Row label="ชื่อ"           value={<span className="font-medium">{headerName}</span>} />
            <Row label="รหัสสมาชิก"     value={<span className="font-mono">{detail.userid}</span>} />
            {detail.customer?.userTel && <Row label="โทร"  value={detail.customer.userTel} />}
            {detail.customer?.userEmail && <Row label="อีเมล" value={detail.customer.userEmail} />}
            <Row label="เลขผู้เสียภาษี"  value={detail.recompnumber && detail.recompnumber.trim() ? <span className="font-mono">{detail.recompnumber}</span> : "—"} />
            <Row label="ชื่อในใบเสร็จ"  value={detail.recompname ?? "—"} />
            <Row label="ที่อยู่ออกใบเสร็จ"
                 value={detail.recompaddress && detail.recompaddress.trim()
                   ? <span className="whitespace-pre-line text-sm">{detail.recompaddress}</span>
                   : "—"} />
          </div>
        </section>

        {/* ── Totals card (VAT + WHT breakdown) ── */}
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-700 border-b border-slate-100 pb-1.5 mb-3">
            ยอดเงิน
          </h2>
          <div className="grid sm:grid-cols-3 gap-3">
            <Stat label="มูลค่ารวมก่อนหัก WHT" value={`฿${fmtThb(detail.totalBeforeWithholding)}`} />
            <Stat
              label={detail.applyJuristic1Pct ? "WHT หัก (1% นิติบุคคล)" : "WHT"}
              value={detail.whtAmount > 0 ? `฿${fmtThb(detail.whtAmount)}` : "—"}
              tone="muted"
            />
            <Stat label="ยอดรับสุทธิ" value={`฿${fmtThb(detail.ramount)}`} tone="primary" />
          </div>
          {/* VAT note. tb_receipt does NOT store VAT (Pacred receipts are
              "ใบเสร็จรับเงิน · ไม่ใช่ใบกำกับภาษี" per legacy printReceipt.php
              disclaimer; VAT lives on the future tax-invoice path). Surface
              this so accounting doesn't assume a 7% line is hidden. */}
          <p className="mt-3 text-xs text-slate-500">
            หมายเหตุ: เอกสารนี้เป็น &ldquo;ใบเสร็จรับเงิน&rdquo; (ไม่ใช่ใบกำกับภาษี) — VAT 7% ไม่ได้ถูกแยกในเอกสารชนิดนี้
            {detail.isCorporate && detail.totalBeforeWithholding >= 1000 && (
              <> · WHT 1% ถูกหักโดยอัตโนมัติเมื่อยอดก่อนหัก ≥ 1,000 บาท (กฎภาษีไทย)</>
            )}
          </p>
        </section>

        {/* ── Line items table ── */}
        <section className="rounded-lg border border-slate-200 bg-white overflow-x-auto scrollbar-x-visible">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left font-medium">#</th>
                <th className="px-3 py-2 text-left font-medium">งาน (forwarder)</th>
                <th className="px-3 py-2 text-left font-medium">Tracking China</th>
                <th className="px-3 py-2 text-left font-medium">ตู้ (cabinet)</th>
                <th className="px-3 py-2 text-right font-medium">น้ำหนัก (kg)</th>
                <th className="px-3 py-2 text-right font-medium">ปริมาตร (m³)</th>
                <th className="px-3 py-2 text-right font-medium">มูลค่า (บาท)</th>
              </tr>
            </thead>
            <tbody>
              {detail.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-12 text-center text-slate-500">
                    ไม่พบรายการ (tb_receipt_item ว่างเปล่า)
                  </td>
                </tr>
              ) : (
                detail.items.map((it, idx) => (
                  <tr key={it.itemId} className="border-t border-slate-100 hover:bg-slate-50/80">
                    <td className="px-3 py-2 text-slate-500">{idx + 1}</td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/forwarders/${it.fid}`}
                        className="text-primary-700 hover:underline font-mono"
                      >
                        #{it.fid}
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{it.ftrackingchn ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{it.fcabinetnumber ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {it.fweight != null ? fmtThb(toNumber(it.fweight)) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {it.fvolume != null ? fmtThb(toNumber(it.fvolume)) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      ฿{fmtThb(it.perRowRaw)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {detail.items.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-sm">
                  <td colSpan={6} className="px-3 py-2.5 text-right text-slate-600">
                    รวม {detail.items.length.toLocaleString()} รายการ
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    ฿{fmtThb(detail.items.reduce((s, it) => s + it.perRowRaw, 0))}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </section>

        {/* ── Bottom note for cancelled receipts ── */}
        {detail.rstatus === "2" && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
            <b>ใบเสร็จนี้ถูกยกเลิก</b> — เลข rid ยังคงอยู่ในระบบเพื่อ audit · ไม่ควรนำไปใช้กับลูกค้า
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Tiny presentational helpers (hoisted — React 19 react-compiler rule
// forbids nested component definitions inside the page render).
// ────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start text-sm gap-3">
      <div className="w-36 shrink-0 text-slate-500">{label}</div>
      <div className="flex-1 text-slate-800">{value}</div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "muted" | "primary";
}) {
  const valueClass =
    tone === "primary" ? "text-primary-700"
    : tone === "muted" ? "text-slate-500"
    : "text-slate-900";
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}
