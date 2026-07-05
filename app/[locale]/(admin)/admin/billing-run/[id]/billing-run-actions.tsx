"use client";

/**
 * Mark-paid + cancel + SLIP client island for /admin/billing-run/[id].
 *
 * Per AGENTS.md §0e — only renders the action panels when the underlying
 * server action can actually do something (status='issued'). Paid/cancelled
 * invoices show an info banner instead so staff don't see a "บันทึก" button
 * that no-ops.
 *
 * ภูม 2026-06-30 — slip flow รวมเป็นแบบเดียวกับหน้า wallet (A4 ตรวจ 2 รอบ):
 *   • SALES (หรือทุก role บนหน้านี้) แนบสลิป (ได้หลายรูป) → slip_status='pending'
 *     → โผล่ในคิว "ชำระเงิน" (dashboard) ให้บัญชี.
 *   • บัญชี (canSettle) "ตรวจสลิป รอบ 1" → "อนุมัติ + ตัดจ่าย (รอบ 2)" / "ปฏิเสธสลิป".
 *     markBillingRunPaid บังคับว่าต้องตรวจรอบ 1 ก่อนถึงจะตัดจ่ายได้.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  markBillingRunPaid,
  cancelBillingRunInvoice,
  sendBillingRunNotification,
  uploadBillingRunSlip,
  reviewBillingRunSlipRound1,
  rejectBillingRunSlip,
} from "@/actions/admin/billing-run";
import { uploadSlip } from "@/lib/storage-upload";
import { SlipImage } from "@/components/admin/slip-image";

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

function thbFmt(n: number): string {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** เวลาปัจจุบันแบบ 24 ชม "HH:mm" (ไม่มี AM/PM) — default ของช่องเวลารับชำระ. */
function nowHHmm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

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

  const [paymentMethod, setPaymentMethod] =
    useState<"bank_transfer" | "cheque" | "wallet" | "other">("bank_transfer");
  const [paymentRef, setPaymentRef] = useState("");
  const [paidAt, setPaidAt] = useState(isoToday());
  // เวลาที่รับชำระ (24 ชม) — เหมือนหน้า wallet · default = เวลาปัจจุบัน
  const [paidAtTime, setPaidAtTime] = useState(nowHHmm());

  const [cancelReason, setCancelReason] = useState("");
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  // Slip upload (multi) + reject
  const fileRef = useRef<HTMLInputElement>(null);
  const [slipBusy, setSlipBusy] = useState(false);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const hasPendingSlip = slipStatus === "pending";
  const round1Done = !!slipReviewedAt;
  const round1Pending = hasPendingSlip && !round1Done; // ต้องตรวจรอบ 1 ก่อนตัดจ่าย

  // Step-3 ตรวจสลิปซ้ำ (เวียนเทียน) — ถ้าพบใบที่จ่ายแล้ว ยอดตรงกัน ลูกค้าคนเดียวกัน
  // ต้องยืนยันชัดเจนก่อนออกใบเสร็จ (markBillingRunPaid). DISPLAY-only.
  const hasDup = dupWarnings.length > 0;
  const [dupAck, setDupAck] = useState(false);

  // 3-step tracker state (ordered per owner spec §2):
  //   1) ตรวจยอด/เวลา/วันที่  = ตรวจสลิป รอบ 1 (reviewBillingRunSlipRound1)
  //   2) ออกเลขบิล (ห้ามซ้ำ · บุคคล=ปกติ · นิติ=หัก ณ ที่จ่าย 1%) — เลขบิลถูกออกตอน
  //      สร้างใบวางบิลแล้ว (docNo) → ขั้นนี้ = ยืนยัน/แสดง WHT ให้บัญชีเห็นชัด
  //   3) ตรวจสลิปซ้ำ → ออกใบเสร็จ (markBillingRunPaid)
  const step1Done = round1Done || !hasPendingSlip; // ไม่มีสลิป pending = ข้ามรอบ 1 (จ่ายนอกระบบ)
  const step1Active = round1Pending;
  const step2Active = step1Done && !step1Active;
  // ขั้น 3 เปิดเมื่อผ่านขั้น 1 (ตรวจสลิปแล้ว หรือ ไม่มีสลิป pending)
  const step3Active = step1Done;

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

  function onMarkPaid(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    // ขั้น 3 — ตรวจสลิปซ้ำ: ถ้าพบใบจ่ายแล้วยอดตรงกัน (เวียนเทียน) ต้องกดยอมรับ
    // ความเสี่ยงก่อน (checkbox) แล้วจึงยืนยันอีกชั้น (§0f confirm-before-mutate).
    if (hasDup && !dupAck) {
      setMsg({
        kind: "err",
        text: `⚠️ พบใบวางบิลที่จ่ายแล้ว ยอดตรงกัน (${dupWarnings.map((d) => d.doc_no).join(", ")}) — กรุณาติ๊กยืนยัน "ตรวจสลิปซ้ำแล้ว" ในขั้นที่ 3 ก่อนออกใบเสร็จ`,
      });
      return;
    }

    const verb = hasPendingSlip ? "อนุมัติ + ตัดจ่าย (รอบ 2)" : "บันทึกการรับชำระ";
    const dupNote = hasDup
      ? `\n\n⚠️ เตือน: พบใบที่จ่ายแล้วยอดตรงกัน (${dupWarnings.map((d) => d.doc_no).join(", ")}) — ยืนยันว่าตรวจสลิปซ้ำแล้ว?`
      : "";
    if (!confirm(`${verb} ${docNo} จำนวน ฿${thbFmt(totalThb)}?${dupNote}`)) return;

    startTransition(async () => {
      const res = await markBillingRunPaid({
        invoiceId,
        paymentMethod,
        paymentReference: paymentRef,
        paidAt,
        paidAtTime,
      });
      if (res.ok) {
        setMsg({ kind: "ok", text: "✓ บันทึกการรับชำระแล้ว" });
        router.refresh();
      } else {
        setMsg({ kind: "err", text: res.error });
      }
    });
  }

  function reviewRound1() {
    setMsg(null);
    startTransition(async () => {
      const res = await reviewBillingRunSlipRound1({ invoiceId });
      if (res.ok) {
        setMsg({ kind: "ok", text: "✓ ตรวจสลิป รอบ 1 แล้ว — กดอนุมัติ + ตัดจ่าย (รอบ 2) ได้เลย" });
        router.refresh();
      } else {
        setMsg({ kind: "err", text: res.error });
      }
    });
  }

  function rejectSlip() {
    if (rejectReason.trim().length < 3) {
      setMsg({ kind: "err", text: "เหตุผลปฏิเสธต้องอย่างน้อย 3 ตัวอักษร" });
      return;
    }
    startTransition(async () => {
      const res = await rejectBillingRunSlip({ invoiceId, reason: rejectReason.trim() });
      if (res.ok) {
        setMsg({ kind: "ok", text: "✕ ปฏิเสธสลิปแล้ว — เซลแนบสลิปใหม่ได้" });
        setRejectMode(false);
        setRejectReason("");
        router.refresh();
      } else {
        setMsg({ kind: "err", text: res.error });
      }
    });
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

      {/* ตรวจ 2 รอบ + ตัดจ่าย — ACCOUNTING only (canSettle) */}
      {canSettle ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4 space-y-3">
          {/* ── ขั้นตอนตรวจสลิป 3 ขั้น (owner spec §2) ─────────────────────── */}
          <div className="rounded-xl border border-emerald-200 bg-white/70 p-3 space-y-2.5">
            <h4 className="text-sm font-bold text-emerald-900">🧾 ตรวจสลิป 3 ขั้น ก่อนออกใบเสร็จ</h4>

            {/* ขั้น 1 — ตรวจยอด/เวลา/วันที่ (= ตรวจสลิป รอบ 1) */}
            <div className={`rounded-lg border px-3 py-2 text-[12px] ${step1Done ? "border-emerald-200 bg-emerald-50 text-emerald-800" : step1Active ? "border-sky-300 bg-sky-50 text-sky-800" : "border-border bg-surface-alt/40 text-muted"}`}>
              <div className="flex items-center gap-2 font-semibold">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold border border-current">
                  {step1Done ? "✓" : "1"}
                </span>
                <span>ขั้น 1 · ตรวจยอด / เวลา / วันที่</span>
              </div>
              <p className="mt-0.5 pl-7 text-[11px]">
                {!hasPendingSlip
                  ? "ไม่มีสลิปรอตรวจ (จ่ายนอกระบบ) — ข้ามไปบันทึกการรับชำระได้เลย"
                  : step1Done
                    ? `ตรวจสลิป รอบ 1 แล้ว${slipReviewedAt ? ` · ${fmtDateTime(slipReviewedAt)}` : ""}`
                    : "กด “ตรวจสลิป รอบ 1” ด้านล่าง เพื่อยืนยันยอด/เวลา/วันที่บนสลิป"}
              </p>
            </div>

            {/* ขั้น 2 — ออกเลขบิล (ห้ามซ้ำ) + WHT บุคคล/นิติ */}
            <div className={`rounded-lg border px-3 py-2 text-[12px] ${step2Active ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-border bg-surface-alt/40 text-muted"}`}>
              <div className="flex items-center gap-2 font-semibold">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold border border-current">2</span>
                <span>ขั้น 2 · เลขบิล (ไม่ซ้ำ) + หัก ณ ที่จ่าย</span>
              </div>
              <div className="mt-1 pl-7 space-y-0.5 text-[11px]">
                <div>เลขบิล: <span className="font-mono font-semibold">{docNo}</span> · ประเภท: <span className="font-semibold">{isJuristic ? "นิติบุคคล" : "บุคคลธรรมดา"}</span></div>
                {whtAmount > 0 ? (
                  <div className="text-red-700">
                    หัก ณ ที่จ่าย 1% = ฿{thbFmt(whtAmount)} → ยอดชำระสุทธิ <span className="font-semibold">฿{thbFmt(netPayable)}</span>
                    <span className="text-muted"> (จากยอดรวม ฿{thbFmt(totalThb)})</span>
                  </div>
                ) : (
                  <div>บุคคลธรรมดา — ไม่มีหัก ณ ที่จ่าย · ยอดชำระ <span className="font-semibold">฿{thbFmt(totalThb)}</span></div>
                )}
              </div>
            </div>

            {/* ขั้น 3 — ตรวจสลิปซ้ำ (เวียนเทียน) → ออกใบเสร็จ */}
            <div className={`rounded-lg border px-3 py-2 text-[12px] ${hasDup ? "border-red-300 bg-red-50 text-red-800" : step3Active ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-border bg-surface-alt/40 text-muted"}`}>
              <div className="flex items-center gap-2 font-semibold">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold border border-current">3</span>
                <span>ขั้น 3 · ตรวจสลิปซ้ำ → ออกใบเสร็จ</span>
              </div>
              {hasDup ? (
                <div className="mt-1 pl-7 space-y-1.5 text-[11px]">
                  <div className="font-semibold">⚠️ พบใบวางบิลที่จ่ายแล้ว ยอดตรงกัน (ลูกค้า {customerId}) — อาจเป็นสลิปเวียนเทียน:</div>
                  <ul className="space-y-0.5">
                    {dupWarnings.map((d) => (
                      <li key={d.id}>
                        • <span className="font-mono font-semibold">{d.doc_no}</span> · ฿{thbFmt(d.total_thb)}
                        {d.paid_at ? <> · จ่าย {fmtDateTime(d.paid_at)}</> : null}
                      </li>
                    ))}
                  </ul>
                  <label className="mt-1 flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dupAck}
                      onChange={(e) => setDupAck(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-red-600"
                    />
                    <span className="font-semibold">ตรวจสลิปซ้ำแล้ว — ยืนยันว่าไม่ใช่สลิปเวียนเทียน จึงออกใบเสร็จได้</span>
                  </label>
                </div>
              ) : (
                <p className="mt-0.5 pl-7 text-[11px]">
                  ไม่พบใบที่จ่ายแล้วยอดตรงกันของลูกค้ารายนี้ · กดออกใบเสร็จได้เลย (บันทึกการรับชำระด้านล่าง)
                </p>
              )}
            </div>
          </div>

          {round1Pending ? (
            /* รอบ 1: ตรวจสลิป / ปฏิเสธ (ยังตัดจ่ายไม่ได้) */
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={reviewRound1}
                disabled={pending}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {pending ? "กำลังบันทึก…" : "✓ ตรวจสลิป รอบ 1"}
              </button>
              <button
                type="button"
                onClick={() => { setRejectMode(true); setMsg(null); }}
                disabled={pending}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-500 bg-white px-3 py-2.5 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                ✕ ปฏิเสธสลิป
              </button>
            </div>
          ) : (
            /* รอบ 2 (หรือไม่มีสลิป): บันทึกการรับชำระ + ตัดจ่าย */
            <form onSubmit={onMarkPaid} className="space-y-3">
              <h4 className="font-medium text-sm text-emerald-800">
                ✓ บันทึกการรับชำระ {hasPendingSlip ? "(อนุมัติ + ตัดจ่าย · รอบ 2)" : ""}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <label>
                  <span className="block text-xs font-medium text-muted mb-1">วิธีการชำระ</span>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
                    className={inputCls}
                  >
                    <option value="bank_transfer">โอนเงินผ่านธนาคาร</option>
                    <option value="cheque">เช็ค</option>
                    <option value="wallet">หักจาก wallet</option>
                    <option value="other">อื่นๆ</option>
                  </select>
                </label>
                <label>
                  <span className="block text-xs font-medium text-muted mb-1">วันที่รับชำระ</span>
                  <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className={inputCls} />
                </label>
                <label>
                  {/* เวลาที่รับชำระ — 24 ชม (HH:mm · ไม่มี AM/PM) เหมือนหน้า wallet */}
                  <span className="block text-xs font-medium text-muted mb-1">เวลาที่รับชำระ (24 ชม)</span>
                  <input
                    type="time"
                    step={60}
                    value={paidAtTime}
                    onChange={(e) => setPaidAtTime(e.target.value)}
                    className={inputCls}
                    lang="en-GB"
                  />
                </label>
                <label>
                  <span className="block text-xs font-medium text-muted mb-1">หมายเลขอ้างอิง</span>
                  <input
                    type="text"
                    value={paymentRef}
                    onChange={(e) => setPaymentRef(e.target.value)}
                    placeholder="เลขอ้างอิงการโอน / เช็ค"
                    className={inputCls}
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={pending || (hasDup && !dupAck)}
                  title={hasDup && !dupAck ? "ติ๊กยืนยัน ‘ตรวจสลิปซ้ำแล้ว’ ในขั้นที่ 3 ก่อน" : undefined}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {pending ? "กำลังบันทึก..." : `${hasPendingSlip ? "อนุมัติ + ตัดจ่าย" : "ออกใบเสร็จ · บันทึกการรับชำระ"} ฿${thbFmt(totalThb)}`}
                </button>
                {hasPendingSlip && (
                  <button
                    type="button"
                    onClick={() => { setRejectMode(true); setMsg(null); }}
                    disabled={pending}
                    className="rounded-lg border border-red-500 bg-white px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    ✕ ปฏิเสธสลิป
                  </button>
                )}
              </div>
            </form>
          )}

          {/* ปฏิเสธสลิป — เหตุผล */}
          {rejectMode && (
            <div className="space-y-2 rounded-xl border border-red-300 bg-red-50 p-3">
              <span className="block text-xs font-medium text-red-800">เหตุผลที่ปฏิเสธสลิป <span className="text-red-500">*</span></span>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={2}
                className={inputCls}
                placeholder="เช่น 'สลิปไม่ชัด', 'ยอดไม่ตรง', 'โอนผิดบัญชี'"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={rejectSlip}
                  disabled={pending || rejectReason.trim().length < 3}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {pending ? "กำลังบันทึก..." : "ยืนยันปฏิเสธ"}
                </button>
                <button
                  type="button"
                  onClick={() => { setRejectMode(false); setRejectReason(""); }}
                  className="rounded-lg border border-border bg-white dark:bg-surface px-4 py-2 text-sm hover:bg-surface-alt"
                >
                  ปิด
                </button>
              </div>
            </div>
          )}
        </div>
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
