/**
 * /admin/accounting/ap/[id] — AP disbursement DETAIL (shop-order-style).
 *
 * Spec §4.2: order-context header (SHIPMENT · customer · QO · lane · entity),
 * the disbursement line, the source Pacred account (3-account SOT) + the payee
 * account, the two slips + WHT cert, and the request→approve→transfer→receipt
 * timeline. READ-only in Slice 1 (no mutate action — the request/approve write
 * path + the pay-flip are Slice 2, bannered).
 *
 * Auth — finance-only: accounting + super + ultra (RLS mirror mig 0239).
 */

import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { AccountingMenubar } from "@/components/admin/accounting-menubar";
import { PageHeader } from "@/components/admin/page-header";
import { SlipImage } from "@/components/admin/slip-image";
import { getSignedBucketUrl } from "@/lib/storage/upload";

import { formatThaiDateTime } from "@/lib/utils/thai-datetime";
import {
  getApDisbursement,
  resolveApSourceAccount,
  rowNetAmount,
  AP_LANE_LABEL,
  AP_ENTITY_LABEL,
  AP_CATEGORY_LABEL,
  AP_CATEGORY_TONE,
  AP_TRANSFER_STATUS,
  AP_RECEIPT_STATUS,
} from "@/lib/admin/ap-disbursement";
import { ApDetailActions } from "./ap-detail-actions";

export const dynamic = "force-dynamic";

function fmt2(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function ApDisbursementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin(["accounting"]); // super + ultra admitted via isGodRole

  const { id } = await params;
  const admin = createAdminClient();
  const { row, error } = await getApDisbursement(admin, id);

  if (error) {
    return (
      <>
        <AccountingMenubar activeHref="/admin/accounting/ap" />
        <main className="p-6 lg:p-8">
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            โหลดรายละเอียดไม่สำเร็จ: {error}
          </div>
        </main>
      </>
    );
  }
  if (!row) notFound();

  const cat = AP_CATEGORY_LABEL[row.category];
  const catTone = AP_CATEGORY_TONE[row.category];
  const tstat = AP_TRANSFER_STATUS[row.transfer_status];
  const rstat = AP_RECEIPT_STATUS[row.receipt_status];
  const net = rowNetAmount(row);
  const sourceAcc = resolveApSourceAccount(row);

  // Slip lives in the private bucket 'disbursement-receipts' — sign it for the
  // admin's session (null → SlipImage renders the missing-file fallback).
  const slipUrl = row.transfer_slip_path
    ? await getSignedBucketUrl("disbursement-receipts", row.transfer_slip_path)
    : null;

  return (
    <>
      <AccountingMenubar activeHref="/admin/accounting/ap" />
      <main className="space-y-5 p-6 lg:p-8">
        <PageHeader
          eyebrow="ADMIN · ACCOUNTING · AP"
          title={row.item_label || "(ไม่มีชื่อรายการ)"}
          subtitle={
            <span className="flex flex-wrap items-center gap-1.5">
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${catTone}`}>
                {cat}
              </span>
              <span className="rounded-full border border-black/10 bg-white px-2 py-0.5 text-[11px] text-gray-600">
                {AP_LANE_LABEL[row.lane]}
              </span>
              <span className="rounded-full border border-black/10 bg-white px-2 py-0.5 text-[11px] text-gray-500">
                {AP_ENTITY_LABEL[row.entity]}
              </span>
            </span>
          }
          actions={
            <Link
              href="/admin/accounting/ap"
              className="rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              ← กลับรายการ
            </Link>
          }
        />

        {/* Slice-2 register note — the pay-flip here is a REGISTER only. */}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[13px] leading-relaxed text-amber-800">
          การกด "โอนแล้ว" ในหน้านี้เป็นการ{" "}
          <span className="font-semibold">บันทึกว่าโอนออกนอกระบบแล้ว (register)</span> —
          เงินโอนออกทางธนาคารจริงแล้ว สลิปคือหลักฐาน ระบบไม่ได้ตัดเงินในแอป.
          มี guard แบบ atomic-claim (เหมือน markShopDisbursementPaid) กันการกดซ้ำ/แข่งกัน.
        </div>

        {row.is_customer_named_receipt && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-[13px] font-medium text-amber-800">
            ⚠️ เงินทดรองจ่าย · <span className="font-semibold">ใบเสร็จชื่อลูกค้า</span> — เป็น pass-through
            ห้ามบันทึกเป็นรายได้/กำไรของ Pacred
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          {/* ── order-context header (SHIPMENT · customer · QO) ── */}
          <section className="rounded-xl border border-black/10 bg-white p-4 lg:col-span-2">
            <h2 className="mb-3 text-sm font-semibold text-foreground">ข้อมูลงาน (SHIPMENT)</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
              <Field label="SHIPMENT" value={row.shipment_no} mono />
              <Field label="รหัสลูกค้า" value={row.customer_id} mono />
              <Field label="ชื่อในไลน์/ใบวางแจ้งหนี้" value={row.line_name} />
              <Field label="QUOTATION (QO)" value={row.quotation_no} mono />
              <Field label="INVOICE (IV)" value={row.invoice_no} mono />
              <Field label="ใบเสร็จ (RT)" value={row.receipt_no} mono />
              <Field label="เลขคอนเทนเนอร์" value={row.container_no} mono />
              <Field label="หมวดบัญชี (OPEX)" value={row.expense_category} />
            </dl>
            {row.note && (
              <div className="mt-3 rounded-lg bg-gray-50 p-3 text-[13px] text-gray-600">
                📝 {row.note}
              </div>
            )}
          </section>

          {/* ── money summary ── */}
          <section className="rounded-xl border border-black/10 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">ยอดเงิน</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-gray-500">ยอดเบิก</dt>
                <dd className="font-mono font-semibold">฿{fmt2(row.amount_withdraw)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-gray-500">ยอดคืน</dt>
                <dd className="font-mono">฿{fmt2(row.amount_refund)}</dd>
              </div>
              <div className="flex items-center justify-between border-t border-black/5 pt-2">
                <dt className="font-medium text-gray-600">สุทธิ (เบิก − คืน)</dt>
                <dd className="font-mono text-lg font-bold text-primary-700">
                  {net < 0 ? `คืน ฿${fmt2(Math.abs(net))}` : `฿${fmt2(net)}`}
                </dd>
              </div>
              {(row.amount_gross || row.wht_pct || row.wht_cert_no) && (
                <div className="mt-2 rounded-lg bg-gray-50 p-2.5 text-[13px] text-gray-600">
                  <div className="font-medium text-gray-500">หัก ณ ที่จ่าย (ภงด.53)</div>
                  {row.amount_gross != null && <div>ฐาน gross: ฿{fmt2(row.amount_gross)}</div>}
                  {row.wht_pct != null && <div>อัตราหัก: {row.wht_pct}%</div>}
                  {row.wht_cert_no && <div>ใบหัก: {row.wht_cert_no}</div>}
                </div>
              )}
            </dl>
          </section>
        </div>

        {/* ── accounts (source Pacred + payee) ── */}
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-black/10 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              บัญชีที่จ่ายออก (Pacred · source)
            </h2>
            {sourceAcc ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <Field label="เลน" value={sourceAcc.label} />
                <Field label="ธนาคาร" value={sourceAcc.bankName} />
                <Field label="ชื่อบัญชี" value={sourceAcc.accountName} />
                <Field label="เลขบัญชี" value={sourceAcc.accountNo} mono />
                {!row.source_account_key && (
                  <div className="col-span-2 text-[11px] italic text-gray-400">
                    * อนุมานจากเลน (ยังไม่ได้เลือกบัญชี) — กรุณาเลือกบัญชีจริงในเฟส 2
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-sm text-gray-400">— ยังไม่ระบุ —</p>
            )}
          </section>

          <section className="rounded-xl border border-black/10 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              บัญชีผู้รับเงิน (payee · outflow leg)
            </h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Field label="ชื่อบัญชี" value={row.payee_name} />
              <Field label="ธนาคาร" value={row.payee_bank} />
              <Field label="เลขบัญชี" value={row.payee_account_no} mono />
              <Field label="ช่องทาง" value={row.pay_channel} />
            </dl>
          </section>
        </div>

        {/* ── status axes + timeline ── */}
        <section className="rounded-xl border border-black/10 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-foreground">สถานะ + ไทม์ไลน์</h2>
          <div className="mb-4 flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1 text-[13px] font-medium ${tstat.tone}`}>
              สถานะโอนเงิน: {tstat.label}
            </span>
            <span className={`rounded-full border px-3 py-1 text-[13px] font-medium ${rstat.tone}`}>
              ตามใบเสร็จ: {rstat.label}
            </span>
          </div>
          <ol className="space-y-2 text-[13px] text-gray-600">
            <TimelineStep
              label="ขอเบิก"
              done={Boolean(row.requested_at)}
              when={row.requested_at}
            />
            <TimelineStep
              label="อนุมัติ"
              done={Boolean(row.approved_at)}
              when={row.approved_at}
            />
            <TimelineStep
              label="โอนแล้ว (เฟส 2)"
              done={row.transfer_status === "transferred"}
              when={row.transferred_at}
            />
          </ol>
        </section>

        {/* ── write controls (Slice 2 · confirm-before-mutate) ── */}
        <ApDetailActions
          id={row.id}
          transferStatus={row.transfer_status}
          receiptStatus={row.receipt_status}
          netAmount={net}
          itemLabel={row.item_label || "(ไม่มีชื่อรายการ)"}
        />

        {/* ── slips ── */}
        {slipUrl && (
          <section className="rounded-xl border border-black/10 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">สลิปการโอน</h2>
            <a href={slipUrl} target="_blank" rel="noreferrer">
              <SlipImage
                src={slipUrl}
                alt="สลิปการโอน"
                className="max-w-md rounded-lg border border-black/10"
              />
            </a>
          </section>
        )}
      </main>
    </>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] text-gray-400">{label}</dt>
      <dd className={`text-sm text-foreground ${mono ? "font-mono" : ""}`}>{value || "—"}</dd>
    </div>
  );
}

function TimelineStep({
  label,
  done,
  when,
}: {
  label: string;
  done: boolean;
  when: string | null;
}) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${
          done ? "bg-green-500" : "bg-gray-200"
        }`}
      />
      <span className={done ? "font-medium text-foreground" : "text-gray-400"}>{label}</span>
      {when && <span className="text-[11px] text-gray-400">· {formatThaiDateTime(when)}</span>}
    </li>
  );
}
