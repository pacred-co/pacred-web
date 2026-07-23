"use client";

/**
 * Slip-upload + notify + cancel client island for /admin/billing-run/[id].
 *
 * Per AGENTS.md §0e — only renders the action panels when the underlying
 * server action can actually do something (status='issued'). Paid/cancelled
 * invoices show an info banner instead so staff don't see a "บันทึก" button
 * that no-ops.
 *
 * ภูม 2026-06-30 — slip flow รวมเป็นแบบเดียวกับหน้า wallet (A4 ตรวจ 2 รอบ):
 *   • SALES (หรือทุก role บนหน้านี้) แนบสลิป (ได้หลายรูป) → slip_status='pending'
 *     → โผล่ในคิว "ชำระเงิน" (dashboard) ให้บัญชี.
 *
 * owner 2026-07-23 — the slip-VERIFY itself (ตรวจสลิป รอบ 1 → อนุมัติ ตัดจ่าย →
 * ออกใบเสร็จ → ปฏิเสธสลิป) + the paid-state ↩ ย้อนการรับชำระ now live in the shared
 * guided combo <BillingRunVerifyFlow> — the SAME UI/flow as /admin/wallet/[id]
 * และ /admin/yuan-payments/[id] (page-1 ตรวจสลิป รอบ 1 · page-2 อนุมัติ ตัดจ่าย ·
 * success popup นำพาไปออกใบเสร็จ · reject = preset picker). This island keeps only
 * the surrounding concerns: แนบสลิป · แจ้งเตือนลูกค้า · ยกเลิกใบวางบิล.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelBillingRunInvoice,
  sendBillingRunNotification,
  uploadBillingRunSlip,
} from "@/actions/admin/billing-run";
import { uploadSlip } from "@/lib/storage-upload";
import { SlipImage } from "@/components/admin/slip-image";
import { BillingRunVerifyFlow } from "./billing-run-verify-flow";

type Props = {
  invoiceId: number;
  docNo: string;
  status: "issued" | "paid" | "cancelled";
  totalThb: number;
  /** ยอดชำระสุทธิ (หลังหัก WHT) — บุคคล = totalThb · นิติ = totalThb − wht. */
  netPayable: number;
  /** หัก ณ ที่จ่าย 1% (0 = บุคคลธรรมดา / ไม่เข้าเกณฑ์). */
  whtAmount: number;
  /** true = นิติบุคคล (หัก ณ ที่จ่าย 1%). */
  isJuristic: boolean;
  customerId: string;
  /** true = viewer is accounting/super → may settle (ตัดจ่าย). Sales = false. */
  canSettle: boolean;
  /** Signed URLs of ALL attached slips (multi · service-role signed so any admin can view). */
  slipSignedUrls: string[];
  /** null=ยังไม่แนบ · pending=รอบัญชีตรวจ · verified=ยืนยันแล้ว · rejected=ถูกปฏิเสธ */
  slipStatus: string | null;
  /** A4 2-round: round-1 review stamp (null = ยังไม่ตรวจรอบ 1). */
  slipReviewedAt: string | null;
  slipUploadedBy: string | null;
  slipUploadedAt: string | null;
  /**
   * Step-3 "ตรวจสลิปซ้ำ" — OTHER already-paid bills for the same customer + same
   * total (possible เวียนเทียน). DISPLAY-only; drives an extra confirm, never
   * blocks the gated settle action.
   */
  dupWarnings: Array<{ id: number; doc_no: string; total_thb: number; paid_at: string | null }>;
};

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm " +
  "focus:outline-none focus:ring-2 focus:ring-primary-500/50";

/** Pure given the iso string (deterministic) — safe in render. */
function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

export function BillingRunActions({
  invoiceId, docNo, status, totalThb, netPayable, whtAmount, isJuristic, customerId,
  canSettle, slipSignedUrls, slipStatus, slipReviewedAt, slipUploadedBy, slipUploadedAt,
  dupWarnings,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [cancelReason, setCancelReason] = useState("");
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  // Slip upload (multi)
  const fileRef = useRef<HTMLInputElement>(null);
  const [slipBusy, setSlipBusy] = useState(false);

  const hasPendingSlip = slipStatus === "pending";

  async function onSlipPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg(null);
    setSlipBusy(true);
    try {
      const up = await uploadSlip(file, "billing_run");
      if (!up.ok) {
        setMsg({ kind: "err", text: up.error });
        return;
      }
      const res = await uploadBillingRunSlip({ invoiceId, slipPath: up.path });
      if (res.ok) {
        setMsg({ kind: "ok", text: "✓ แนบสลิปแล้ว — รอบัญชีตรวจสลิป รอบ 1 + ตัดจ่าย" });
        router.refresh();
      } else {
        setMsg({ kind: "err", text: res.error });
      }
    } finally {
      setSlipBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // Multi-slip gallery (each thumbnail opens the full slip on click).
  const slipGallery = slipSignedUrls.length > 0 ? (
    <div className="flex flex-wrap gap-2">
      {slipSignedUrls.map((url, i) => (
        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
          <SlipImage
            src={url}
            alt={`สลิป ${docNo} #${i + 1}`}
            pdfMode="tile"
            className="h-24 w-24 rounded-lg border border-border object-cover"
          />
        </a>
      ))}
    </div>
  ) : null;

  if (status === "paid") {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
        <p className="text-sm text-emerald-800 font-medium">
          ✓ ใบวางบิลนี้ได้รับชำระแล้ว · ดูประวัติด้านบน
        </p>
        {slipSignedUrls.length > 0 && (
          <div className="space-y-2">
            {slipGallery}
            <div className="text-[12px] text-emerald-700">
              <div className="font-semibold">สลิปที่ยืนยันแล้ว ({slipSignedUrls.length} รูป)</div>
              <div>แนบโดย {slipUploadedBy ?? "—"} · {fmtDateTime(slipUploadedAt)}</div>
            </div>
          </div>
        )}
        {/* ↩ ย้อนการรับชำระ (owner 2026-07-16 "ยกเลิกเอกสารแล้วสถานะต้องถอยเป็นเส้นตรง" ·
            owner 2026-07-23 "reject → จบ ต้องเป็น flow เดียว") — the reject/unwind story,
            continued in the SAME guided combo the issued state uses. */}
        {canSettle && (
          <BillingRunVerifyFlow
            invoiceId={invoiceId}
            docNo={docNo}
            status="paid"
            customerId={customerId}
            totalThb={totalThb}
            netPayable={netPayable}
            whtAmount={whtAmount}
            isJuristic={isJuristic}
            slipStatus={slipStatus}
            slipReviewedAt={slipReviewedAt}
            dupWarnings={dupWarnings}
          />
        )}
      </section>
    );
  }
  if (status === "cancelled") {
    return (
      <section className="rounded-2xl border border-stone-200 bg-stone-50/40 p-4">
        <p className="text-sm text-stone-700 font-medium">
          ✕ ใบวางบิลนี้ถูกยกเลิกแล้ว
        </p>
      </section>
    );
  }

  function onSendNotification() {
    setMsg(null);
    startTransition(async () => {
      const res = await sendBillingRunNotification({
        invoiceId,
        channel: "both",
      });
      if (res.ok) {
        setMsg({
          kind: "ok",
          text: res.data?.sent
            ? `✓ ส่งเตือนลูกค้าแล้ว (${res.data.channel})`
            : `📝 ${res.data?.channel} (ลูกค้าไม่มี LINE/email)`,
        });
      } else {
        setMsg({ kind: "err", text: res.error });
      }
    });
  }

  function onCancel() {
    if (cancelReason.trim().length < 3) {
      setMsg({ kind: "err", text: "เหตุผลยกเลิกต้องอย่างน้อย 3 ตัวอักษร" });
      return;
    }
    startTransition(async () => {
      const res = await cancelBillingRunInvoice({
        invoiceId,
        cancelReason: cancelReason.trim(),
      });
      if (res.ok) {
        setMsg({ kind: "ok", text: "✕ ยกเลิกใบวางบิลแล้ว" });
        setShowCancelDialog(false);
        router.refresh();
      } else {
        setMsg({ kind: "err", text: res.error });
      }
    });
  }

  // Slip status pill (pending / rejected / none)
  const slipPill =
    slipStatus === "pending" ? (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
        ⏳ รอบัญชีตรวจสลิป
      </span>
    ) : slipStatus === "rejected" ? (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
        ✕ สลิปถูกปฏิเสธ — แนบใหม่
      </span>
    ) : null;

  // status === "issued"
  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-4">
      <h3 className="font-bold text-sm">ดำเนินการ</h3>

      {msg && (
        <div className={`rounded-lg p-2.5 text-sm border ${msg.kind === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
          {msg.text}
        </div>
      )}

      {/* SLIP — เซลแนบ (หลายรูปได้) → บัญชีตรวจ */}
      <div className="rounded-xl border border-violet-200 bg-violet-50/30 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-medium text-sm text-violet-900">📎 สลิปการชำระเงิน</h4>
          {slipPill}
        </div>

        {slipGallery}

        <div className="space-y-1">
          <p className="text-[11px] text-violet-800">
            เซลแนบสลิปที่ลูกค้าโอนมา (แนบได้หลายรูป · รูปภาพ หรือ PDF · ไม่เกิน 5 MB) → เข้าคิวให้บัญชีตรวจสลิป + ตัดจ่าย
            {slipUploadedAt ? <> · ล่าสุด {fmtDateTime(slipUploadedAt)} โดย {slipUploadedBy ?? "—"}</> : null}
          </p>
          <label className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 cursor-pointer disabled:opacity-50">
            <span>{slipBusy ? "กำลังอัปโหลด…" : slipSignedUrls.length > 0 ? "📎 แนบสลิปเพิ่ม" : "📎 แนบสลิป"}</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={onSlipPicked}
              disabled={slipBusy}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* ตรวจสลิป (รอบ 1) → ตัดจ่าย (รอบ 2) → ออกใบเสร็จ → ปฏิเสธ — the guided combo
          (same UI/flow as /admin/wallet/[id]) · ACCOUNTING only (canSettle). */}
      {canSettle ? (
        <BillingRunVerifyFlow
          invoiceId={invoiceId}
          docNo={docNo}
          status="issued"
          customerId={customerId}
          totalThb={totalThb}
          netPayable={netPayable}
          whtAmount={whtAmount}
          isJuristic={isJuristic}
          slipStatus={slipStatus}
          slipReviewedAt={slipReviewedAt}
          dupWarnings={dupWarnings}
        />
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
          <h4 className="font-medium text-sm text-amber-800">🔒 รอบัญชีตรวจสลิป + ตัดจ่าย</h4>
          <p className="text-[12px] text-amber-700 mt-1">
            การตรวจสลิป (รอบ 1) + อนุมัติ ตัดจ่าย (รอบ 2) เป็นหน้าที่ของฝ่ายบัญชี ·
            {hasPendingSlip
              ? " สลิปที่แนบแล้วเข้าคิว ‘ชำระเงิน’ ให้บัญชีตรวจเรียบร้อย"
              : " แนบสลิปด้านบนก่อน แล้วบัญชีจะตรวจ + ตัดจ่าย"}
          </p>
        </div>
      )}

      {/* Send notification to customer (LINE/email) */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-4 space-y-2">
        <h4 className="font-medium text-sm text-blue-800">📨 แจ้งเตือนลูกค้า</h4>
        <p className="text-xs text-muted">
          ส่งแจ้งเตือนผ่าน LINE OA (ถ้าลูกค้าผูกแล้ว) หรือ Email · เนื้อหาจะปรับเป็น &quot;เลยกำหนด&quot; โดยอัตโนมัติถ้าครบกำหนดแล้ว
        </p>
        <button
          type="button"
          onClick={onSendNotification}
          disabled={pending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "กำลังส่ง..." : "📨 ส่งแจ้งเตือน"}
        </button>
      </div>

      {/* Cancel — accounting/super only (matches the settle gate) */}
      {canSettle && (!showCancelDialog ? (
        <button
          type="button"
          onClick={() => setShowCancelDialog(true)}
          className="text-xs text-red-600 hover:text-red-700 hover:underline underline-offset-2"
        >
          🗑 ยกเลิกใบวางบิลนี้
        </button>
      ) : (
        <div className="rounded-xl border border-red-200 bg-red-50/30 p-4 space-y-3">
          <h4 className="font-medium text-sm text-red-800">✕ ยกเลิกใบวางบิล</h4>
          <p className="text-xs text-muted">
            ลูกค้า {customerId} จะไม่ต้องจ่ายเงินตามใบนี้ · รายการฝากนำเข้าทั้งหมดที่ถูกผูกจะกลับมาออกใบใหม่ได้
          </p>
          <label>
            <span className="block text-xs font-medium text-muted mb-1">เหตุผลยกเลิก <span className="text-red-500">*</span></span>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              required
              className={inputCls}
              placeholder="เช่น 'ลูกค้าขอแก้ไขรายการ', 'ออกเลขผิด', 'ต้องรวมกับใบอื่น'"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={pending || cancelReason.trim().length < 3}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {pending ? "กำลังยกเลิก..." : "ยืนยันยกเลิก"}
            </button>
            <button
              type="button"
              onClick={() => { setShowCancelDialog(false); setCancelReason(""); }}
              className="rounded-lg border border-border bg-white dark:bg-surface px-4 py-2 text-sm hover:bg-surface-alt"
            >
              ปิด
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
