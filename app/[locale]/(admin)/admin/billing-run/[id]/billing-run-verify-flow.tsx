"use client";

/**
 * BillingRunVerifyFlow — guided slip-verify combo for `/admin/billing-run/[id]`
 * (owner 2026-07-23 "ทุกเลนตรวจสลิปใช้แพทเทินเดียวกับ /admin/wallet/[id] · ต้อง
 *  นำพาไปจบที่ใบเสร็จ · reject ให้ครบจบสมบูรณ์").
 *
 * Replaces the old bespoke "ตรวจสลิป 3 ขั้น ก่อนออกใบเสร็จ" 3-<div> tracker + the
 * scattered round-1/settle/reject button blocks with the SAME guided 2-page
 * pattern the wallet <ApproveRejectForm> / yuan <YuanVerifyFlow> use:
 *
 *   PAGE-1 (issued · สลิป pending · ยังไม่ผ่านรอบ 1) — "ขั้นที่ 1 · ตรวจสลิป ·
 *     วันโอน · รายการซ้ำ" — bill total + WHT note + dup preview + ✓ ตรวจสลิป รอบ 1.
 *     ปฏิเสธ reachable here too (a fake/duplicate/wrong-amount slip shouldn't
 *     require passing round-1 first · mirrors the wallet page-1 RejectSlipInline).
 *   PAGE-2 (issued · ผ่านรอบ 1 แล้ว · หรือ ไม่มีสลิป pending) — "ขั้นที่ 2 ·
 *     ตรวจเอกสาร (เลขบิล + หัก ณ ที่จ่าย) → อนุมัติตัดจ่าย · ออกใบเสร็จ" — this lane's
 *     step-2 = bill-no + WHT (NOT receipt-no) · G7 no-slip "ชำระนอกระบบ" ack ·
 *     ReceiptDocNoEditor · payment fields · ตรวจสลิปซ้ำ (dup ack) · settle + reject.
 *   SUCCESS POPUP after settle — the wallet/yuan pattern: fixed overlay ·
 *     role=dialog · NEVER closes on outside click · a MUST-CLICK "🧾 เปิดใบเสร็จ"
 *     that opens the auto-issued ใบเสร็จ (owner "ต้องนำพาไปจบที่ใบเสร็จ").
 *   PAID → the ↩ ย้อนการรับชำระ CTA rendered in the SAME styled reject/unwind
 *     panel (so "reject → จบ" reads as one story, not two disconnected controls).
 *
 * ⚠️ UI-ONLY refactor — the server actions + their args are IDENTICAL to what
 * BillingRunActions called (actions/admin/billing-run.ts untouched):
 *   round-1 = reviewBillingRunSlipRound1({ invoiceId })
 *   settle  = markBillingRunPaid({ invoiceId, paymentMethod, paymentReference,
 *             paidAt, paidAtTime, overrideRid?, offlineConfirmed, offlineReason })
 *             — already auto-issues the ใบเสร็จ + advances forwarder 5→6 +
 *             credit-settles. Returns { receiptRid?, receiptWarning? }.
 *   reject  = rejectBillingRunSlip({ invoiceId, reason })   (pre-settle slip flip)
 *   reverse = adminReverseBillingRunPaid({ invoiceId, reason })  (paid-only unwind)
 *   ensure  = ensureBillingRunReceipt({ invoiceId })  → { receiptId } (the SAME
 *             read/ensure action the header "ออก/พิมพ์ใบเสร็จ" button uses; it
 *             resolves the NUMERIC receipt id the settle only returns as a rID
 *             string, then routes to /admin/accounting/forwarder-invoice/{id}).
 *
 * REJECT = preset <RejectReasonPicker> ("ห้ามพิมพ์ · กดเลือก" · owner 2026-06-27)
 * — the SAME shared component the wallet combo enforces (was a free-text textarea).
 *
 * NOTE on the success popup timing: unlike the yuan flow (which is mounted
 * unconditionally so it can refresh() immediately) this component lives inside
 * BillingRunActions' status-branched render, so it uses REFRESH-ON-DISMISS —
 * the popup shows without an immediate refresh (which would unmount it as the
 * bill flips issued→paid), and refreshes only when the user picks "อยู่หน้านี้ต่อ".
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Loader2, Undo2 } from "lucide-react";
import { RejectReasonPicker } from "@/components/admin/reject-reason-picker";
import { ReceiptDocNoEditor } from "@/components/admin/receipt-doc-no-editor";
import {
  markBillingRunPaid,
  reviewBillingRunSlipRound1,
  rejectBillingRunSlip,
  adminReverseBillingRunPaid,
  ensureBillingRunReceipt,
} from "@/actions/admin/billing-run";

type DupWarning = { id: number; doc_no: string; total_thb: number; paid_at: string | null };

type Props = {
  invoiceId: number;
  docNo: string;
  /** issued = the guided verify combo · paid = the ↩ reverse continuation. */
  status: "issued" | "paid";
  customerId: string;
  totalThb: number;
  /** ยอดชำระสุทธิ (หลังหัก WHT) — บุคคล = totalThb · นิติ = totalThb − wht. */
  netPayable: number;
  /** หัก ณ ที่จ่าย 1% (0 = บุคคลธรรมดา / ไม่เข้าเกณฑ์). */
  whtAmount: number;
  isJuristic: boolean;
  /** null=ยังไม่แนบ · pending=รอตรวจ · verified · rejected */
  slipStatus: string | null;
  /** A4 round-1 stamp (null = ยังไม่ตรวจรอบ 1). */
  slipReviewedAt: string | null;
  /** Step-3 ตรวจสลิปซ้ำ — OTHER already-paid bills, same customer + same total. */
  dupWarnings: DupWarning[];
};

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm " +
  "focus:outline-none focus:ring-2 focus:ring-primary-500/50";

function thbFmt(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** เวลาปัจจุบันแบบ 24 ชม "HH:mm" — default ของช่องเวลารับชำระ (เหมือนหน้า wallet). */
function nowHHmm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function BillingRunVerifyFlow(props: Props) {
  const {
    invoiceId, docNo, status, customerId,
    totalThb, netPayable, whtAmount, isJuristic,
    slipStatus, slipReviewedAt, dupWarnings,
  } = props;

  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // ── settle form state (moved 1:1 from BillingRunActions — same fields/defaults) ──
  const [paymentMethod, setPaymentMethod] =
    useState<"bank_transfer" | "cheque" | "wallet" | "other">("bank_transfer");
  const [paymentRef, setPaymentRef] = useState("");
  const [paidAt, setPaidAt] = useState(isoToday());
  const [paidAtTime, setPaidAtTime] = useState(nowHHmm());
  // STEP-2 doc-number panel: null = keep the auto-mint suggestion · string = hand-picked.
  const [overrideRid, setOverrideRid] = useState<string | null>(null);
  // G7 no-slip "ชำระนอกระบบ (ยืนยันจบการ)" ack + reason.
  const [offlineAck, setOfflineAck] = useState(false);
  const [offlineReason, setOfflineReason] = useState("");
  // Step-3 ตรวจสลิปซ้ำ (เวียนเทียน) ack — gates the settle when a dup exists.
  const [dupAck, setDupAck] = useState(false);

  // reject (issued · pre-settle) — preset picker (task parity with wallet).
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // ↩ reverse (paid · post-settle unwind).
  const [reverseMode, setReverseMode] = useState(false);
  const [reverseReason, setReverseReason] = useState("");
  const [reverseDone, setReverseDone] = useState<string | null>(null);

  // Post-settle success popup — carries the settle outcome for the onward step.
  const [success, setSuccess] = useState<{ receiptRid?: string; receiptWarning?: string } | null>(null);
  const [popupErr, setPopupErr] = useState<string | null>(null);

  const hasPendingSlip = slipStatus === "pending";
  const round1Done = !!slipReviewedAt;
  const round1Pending = hasPendingSlip && !round1Done; // ต้องตรวจรอบ 1 ก่อนตัดจ่าย
  const hasDup = dupWarnings.length > 0;

  // ── round-1 (page-1) ──────────────────────────────────────────────
  function reviewRound1() {
    setErr(null);
    startTransition(async () => {
      const res = await reviewBillingRunSlipRound1({ invoiceId });
      if (res.ok) router.refresh();
      else setErr(res.error);
    });
  }

  // ── settle (page-2) — gates + args preserved 1:1; only the OK path now
  //    opens the success popup instead of an inline msg ────────────────
  function onMarkPaid(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    // ขั้น 3 — ตรวจสลิปซ้ำ (เวียนเทียน): ต้องกดยอมรับความเสี่ยงก่อน (§0f).
    if (hasDup && !dupAck) {
      setErr(
        `⚠️ พบใบวางบิลที่จ่ายแล้ว ยอดตรงกัน (${dupWarnings.map((d) => d.doc_no).join(", ")}) — กรุณาติ๊กยืนยัน "ตรวจสลิปซ้ำแล้ว" ก่อนออกใบเสร็จ`,
      );
      return;
    }

    // G7 — no-slip bill: require the "ชำระนอกระบบ (ยืนยันจบการ)" ack + reason first.
    if (!hasPendingSlip && (!offlineAck || offlineReason.trim().length < 3)) {
      setErr(
        'บิลนี้ไม่มีสลิป — กรุณาติ๊ก "ชำระนอกระบบ (ยืนยันจบการ)" + ระบุเหตุผล (อย่างน้อย 3 ตัวอักษร) ก่อนตัดจ่าย',
      );
      return;
    }

    const verb = hasPendingSlip ? "อนุมัติ + ตัดจ่าย (รอบ 2)" : "บันทึกการรับชำระ";
    const dupNote = hasDup
      ? `\n\n⚠️ เตือน: พบใบที่จ่ายแล้วยอดตรงกัน (${dupWarnings.map((d) => d.doc_no).join(", ")}) — ยืนยันว่าตรวจสลิปซ้ำแล้ว?`
      : "";
    if (!window.confirm(`${verb} ${docNo} จำนวน ฿${thbFmt(totalThb)}?${dupNote}`)) return;

    startTransition(async () => {
      const res = await markBillingRunPaid({
        invoiceId,
        paymentMethod,
        paymentReference: paymentRef,
        paidAt,
        paidAtTime,
        overrideRid: overrideRid ?? undefined,
        offlineConfirmed: offlineAck,
        offlineReason: offlineReason.trim(),
      });
      if (res.ok) {
        // จบลูป (owner 2026-07-23) — popup เด้ง + นำพาไปออกใบเสร็จ. REFRESH-ON-DISMISS:
        // ไม่ refresh ตอนนี้ (จะทำให้ flow unmount ตอนบิล issued→paid แล้ว popup หาย);
        // refresh เมื่อผู้ใช้กด "อยู่หน้านี้ต่อ".
        setPopupErr(null);
        setSuccess({ receiptRid: res.data?.receiptRid, receiptWarning: res.data?.receiptWarning });
      } else {
        setErr(res.error);
      }
    });
  }

  // ── reject slip (issued · pre-settle) — preset picker ──────────────
  function rejectSlip() {
    setErr(null);
    if (!rejectReason.trim()) {
      setErr("กรุณาเลือกเหตุผลที่ปฏิเสธสลิป");
      return;
    }
    if (rejectReason.trim().length < 3) {
      setErr("เหตุผลสั้นเกินไป");
      return;
    }
    startTransition(async () => {
      const res = await rejectBillingRunSlip({ invoiceId, reason: rejectReason.trim() });
      if (res.ok) {
        router.refresh(); // slip → 'rejected' · เซลแนบสลิปใหม่ได้ → server re-render
        setRejectMode(false);
        setRejectReason("");
      } else {
        setErr(res.error);
      }
    });
  }

  // ── ↩ reverse (paid · post-settle unwind) — same action + args ─────
  function onReverse() {
    const reason = reverseReason.trim();
    setErr(null);
    if (reason.length < 3) {
      setErr("เหตุผลที่ย้อนต้องอย่างน้อย 3 ตัวอักษร");
      return;
    }
    if (
      !window.confirm(
        `↩ ย้อนการรับชำระ ${docNo}?\n\nระบบจะ: ถอยบิลเป็น "ออกแล้ว (ยังไม่ชำระ)" · ถอยออเดอร์กลับ รอชำระเงิน (5) · คืนวงเงินเครดิต (ถ้ามี) · ยกเลิกใบเสร็จอัตโนมัติ\n\nเหตุผล: ${reason}`,
      )
    )
      return;
    startTransition(async () => {
      const res = await adminReverseBillingRunPaid({ invoiceId, reason });
      if (res.ok && res.data) {
        const d = res.data;
        setReverseDone(
          `↩ ย้อนการรับชำระแล้ว · ถอยออเดอร์ ${d.revertedForwarders} รายการ${d.creditRestored > 0 ? ` · คืนเครดิต ${d.creditRestored} รายการ` : ""}${d.receiptVoided ? ` · ยกเลิกใบเสร็จ ${d.receiptVoided}` : ""}`,
        );
        router.refresh();
      } else {
        setErr(res.ok ? "ไม่สามารถย้อนได้" : res.error);
      }
    });
  }

  // ── success popup: open the auto-issued ใบเสร็จ (resolve NUMERIC id via the
  //    same ensure action the header receipt button uses) ───────────────
  function openReceipt() {
    setPopupErr(null);
    startTransition(async () => {
      const res = await ensureBillingRunReceipt({ invoiceId });
      if (res.ok && res.data) {
        router.push(`/admin/accounting/forwarder-invoice/${res.data.receiptId}`);
      } else {
        setPopupErr(res.ok ? "ไม่พบข้อมูลใบเสร็จ" : res.error);
      }
    });
  }

  // ── the shared reject panel (issued) — preset RejectReasonPicker ────
  const rejectPanel = rejectMode ? (
    <div className="space-y-2 rounded-xl border border-red-300 bg-red-50 p-3 dark:bg-red-500/5">
      <p className="text-xs font-bold text-red-900 dark:text-foreground">
        ปฏิเสธสลิป — ถอยสถานะให้เซลแนบสลิปใหม่
      </p>
      <p className="text-[11px] text-red-800 dark:text-muted">
        ใช้เมื่อสลิปที่แนบมา <b>ปลอม · ซ้ำ · หรือไม่ตรงยอด</b> — สลิปจะถูกปฏิเสธและเข้าคิว
        ให้เซลแนบสลิปใหม่
      </p>
      <p className="text-xs font-bold text-red-900 dark:text-foreground">เลือกเหตุผลที่ปฏิเสธ (กดเลือก · จำเป็น)</p>
      <RejectReasonPicker kind="deposit" onChange={setRejectReason} disabled={pending} />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={rejectSlip}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {pending ? (
            <><Loader2 className="h-3 w-3 animate-spin" /> กำลังปฏิเสธ…</>
          ) : (
            "✓ ยืนยันปฏิเสธสลิป"
          )}
        </button>
        <button
          type="button"
          onClick={() => { setRejectMode(false); setRejectReason(""); setErr(null); }}
          disabled={pending}
          className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs hover:bg-surface-alt dark:bg-transparent"
        >
          ปิด
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div className="space-y-3">
      {/* ✅ Post-settle popup (wallet/yuan pattern) — must-click, NEVER closes on
          outside click. Primary = the onward step (🧾 เปิดใบเสร็จ). */}
      {success && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl border border-emerald-200 bg-white p-5 text-center shadow-2xl dark:bg-surface">
            <div className={`mx-auto mb-2 flex size-12 items-center justify-center rounded-full text-2xl ${success.receiptWarning ? "bg-amber-100" : "bg-emerald-100"}`}>
              {success.receiptWarning ? "⚠️" : "✅"}
            </div>
            <p className="text-base font-bold text-foreground">
              {success.receiptWarning ? "ตัดจ่ายแล้ว · กำลังออกใบเสร็จ" : "ตรวจสลิปสำเร็จ · ตัดจ่ายเรียบร้อย"}
            </p>
            <p className="mt-1 text-xs text-muted">
              {success.receiptWarning
                ? "ระบบยังออกใบเสร็จไม่สำเร็จตอนตัดจ่าย — กด ‘เปิดใบเสร็จ’ เพื่อออกและเปิดใบเสร็จ"
                : success.receiptRid
                  ? `ระบบออกใบเสร็จ ${success.receiptRid} ให้อัตโนมัติแล้ว`
                  : "ระบบออกใบเสร็จให้อัตโนมัติแล้ว"}
            </p>
            {popupErr && (
              <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700">{popupErr}</p>
            )}
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={openReceipt}
                disabled={pending}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50 ${success.receiptWarning ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
              >
                {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> กำลังเปิด…</> : "🧾 เปิดใบเสร็จ"}
              </button>
              <button
                type="button"
                onClick={() => router.push("/admin/billing-run")}
                className="inline-flex items-center justify-center rounded-lg border border-primary-300 bg-primary-50 px-3 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-100"
              >
                ดูใบวางบิลทั้งหมด →
              </button>
              <button
                type="button"
                onClick={() => { setSuccess(null); router.refresh(); }}
                className="inline-flex items-center justify-center rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-foreground hover:bg-surface-alt dark:bg-transparent"
              >
                อยู่หน้านี้ต่อ
              </button>
            </div>
          </div>
        </div>
      )}

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {err}
        </div>
      )}

      {/* ══════════ ISSUED — the guided verify combo ══════════ */}
      {status === "issued" && (
        <>
          {/* ── PAGE-1 · ขั้นที่ 1 (สลิป pending · ยังไม่ผ่านรอบ 1) ── */}
          {round1Pending && (
            <div className="space-y-2 rounded-xl border border-sky-300 bg-sky-50/60 p-3 dark:bg-sky-50/5">
              <p className="text-sm font-semibold text-sky-900 dark:text-foreground">
                ขั้นที่ 1 · ตรวจสลิป · วันโอน · รายการซ้ำ
              </p>
              <p className="text-[11px] text-sky-800 dark:text-muted">
                เทียบสลิปลูกค้า (ด้านบน) กับยอดที่ต้องชำระ + วันเวลาโอน แล้วกดผ่านรอบ 1
                จึงจะไปขั้นตรวจเอกสาร + อนุมัติ ตัดจ่าย (รอบ 2)
              </p>

              <div className="space-y-1 rounded-lg border border-border bg-white p-3 dark:bg-surface">
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-muted">เลขบิล</span>
                  <span className="font-mono">{docNo}</span>
                </div>
                {whtAmount > 0 && (
                  <>
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="text-muted">ยอดรวม</span>
                      <span className="font-mono">฿{thbFmt(totalThb)}</span>
                    </div>
                    <div className="flex justify-between gap-3 text-sm text-red-700">
                      <span>หัก ณ ที่จ่าย 1%</span>
                      <span className="font-mono">− ฿{thbFmt(whtAmount)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between gap-3 border-t border-border pt-1 text-sm">
                  <span className="font-semibold text-foreground">ยอดที่ต้องตรงสลิป</span>
                  <span className="font-mono text-base font-bold text-foreground">฿{thbFmt(whtAmount > 0 ? netPayable : totalThb)}</span>
                </div>
              </div>

              {hasDup && (
                <p className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-800">
                  ⚠️ พบใบที่จ่ายแล้วยอดตรงกัน {dupWarnings.length} รายการ ({dupWarnings.map((d) => d.doc_no).join(", ")}) — ตรวจว่าไม่ใช่สลิปเวียนเทียนก่อนผ่านรอบ 1
                </p>
              )}

              <button
                type="button"
                onClick={reviewRound1}
                disabled={pending}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {pending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> กำลังบันทึก…</>
                ) : (
                  "✓ ตรวจสลิป รอบ 1 — ยืนยันยอดและวันโอนตรงสลิป"
                )}
              </button>

              {/* ปฏิเสธได้ตั้งแต่หน้า 1 — สลิปปลอม/ซ้ำ/ไม่ตรงยอด ไม่ต้องผ่านรอบ 1 ก่อน */}
              <div className="border-t border-dashed border-border pt-2">
                <button
                  type="button"
                  onClick={() => { setRejectMode(true); setErr(null); }}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-500 bg-white px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50 dark:bg-transparent"
                >
                  <XCircle className="h-4 w-4" /> ปฏิเสธสลิป (ปลอม · ซ้ำ · ไม่ตรงยอด)
                </button>
              </div>

              {rejectPanel}
            </div>
          )}

          {/* ── PAGE-2 · ขั้นที่ 2 (ผ่านรอบ 1 แล้ว · หรือ ไม่มีสลิป pending) ── */}
          {!round1Pending && (
            <div className="space-y-2 rounded-xl border border-emerald-300 bg-emerald-50/50 p-3 dark:bg-emerald-50/5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-emerald-900 dark:text-foreground">
                  ขั้นที่ 2 · ตรวจเอกสาร → อนุมัติ ตัดจ่าย · ออกใบเสร็จ
                </p>
                {hasPendingSlip && (
                  <span className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                    ✓ ตรวจสลิป รอบ 1 แล้ว
                  </span>
                )}
              </div>

              {/* step-② semantic (bill-no + WHT · NOT receipt-no) — kept from the old tracker */}
              <div className="rounded-lg border border-emerald-200 bg-white/70 px-3 py-2 text-[12px] dark:bg-surface">
                <div className="font-semibold text-foreground">📄 ตรวจเอกสาร · เลขบิล + หัก ณ ที่จ่าย</div>
                <div className="mt-0.5 space-y-0.5 text-[11px]">
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

              <form onSubmit={onMarkPaid} className="space-y-3">
                {/* G7 — no-slip settle gate: ชำระนอกระบบ ack + reason */}
                {!hasPendingSlip && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2 dark:bg-amber-500/5">
                    <label className="flex items-start gap-2 text-[13px] text-amber-900 dark:text-foreground">
                      <input
                        type="checkbox"
                        checked={offlineAck}
                        onChange={(e) => setOfflineAck(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-amber-600"
                      />
                      <span className="font-semibold">ชำระนอกระบบ (ยืนยันจบการ) — บิลนี้ไม่มีสลิปในระบบ · ยืนยันว่าได้รับชำระจริงแล้ว</span>
                    </label>
                    <textarea
                      value={offlineReason}
                      onChange={(e) => setOfflineReason(e.target.value)}
                      rows={2}
                      className={inputCls}
                      placeholder="เหตุผล/ช่องทางการรับชำระ (เช่น 'โอนเข้าบัญชีบริษัท ยืนยันจากบัญชี', 'เงินสด') · อย่างน้อย 3 ตัวอักษร"
                    />
                  </div>
                )}

                {/* ตรวจสลิปซ้ำ (เวียนเทียน) — dup ack gates the settle */}
                {hasDup && (
                  <div className="rounded-xl border border-red-300 bg-red-50 p-3 space-y-1.5 text-[11px] text-red-800 dark:bg-red-500/5">
                    <div className="font-semibold">⚠️ ตรวจสลิปซ้ำ — พบใบวางบิลที่จ่ายแล้ว ยอดตรงกัน (ลูกค้า {customerId}) · อาจเป็นสลิปเวียนเทียน:</div>
                    <ul className="space-y-0.5">
                      {dupWarnings.map((d) => (
                        <li key={d.id}>• <span className="font-mono font-semibold">{d.doc_no}</span> · ฿{thbFmt(d.total_thb)}</li>
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
                )}

                {/* STEP-2 doc-number panel (ออกเลขที่ใบเสร็จ) before ตัดจ่าย */}
                <ReceiptDocNoEditor
                  key={`${customerId}:${paidAt ?? ""}`}
                  userid={customerId}
                  dateSlipIso={paidAt}
                  onOverrideRidChange={setOverrideRid}
                  disabled={pending}
                />

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

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="submit"
                    disabled={
                      pending ||
                      (hasDup && !dupAck) ||
                      (!hasPendingSlip && (!offlineAck || offlineReason.trim().length < 3))
                    }
                    title={
                      hasDup && !dupAck
                        ? "ติ๊กยืนยัน ‘ตรวจสลิปซ้ำแล้ว’ ก่อน"
                        : !hasPendingSlip && (!offlineAck || offlineReason.trim().length < 3)
                          ? "ติ๊กยืนยัน ‘ชำระนอกระบบ (ยืนยันจบการ)’ + ระบุเหตุผลก่อน"
                          : undefined
                    }
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {pending ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> กำลังบันทึก…</>
                    ) : (
                      <><CheckCircle2 className="h-4 w-4" /> {hasPendingSlip ? "อนุมัติ + ตัดจ่าย · ออกใบเสร็จ" : "ออกใบเสร็จ · บันทึกการรับชำระ"}</>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRejectMode(true); setErr(null); }}
                    disabled={pending || !hasPendingSlip}
                    title={!hasPendingSlip ? "ไม่มีสลิปรอตรวจให้ปฏิเสธ" : undefined}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-500 bg-white px-3 py-2.5 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50 dark:bg-transparent"
                  >
                    <XCircle className="h-4 w-4" /> ปฏิเสธสลิป
                  </button>
                </div>
              </form>

              {rejectPanel}
            </div>
          )}
        </>
      )}

      {/* ══════════ PAID — ↩ ย้อนการรับชำระ (the reject/unwind story, continued) ══════════ */}
      {status === "paid" && (
        <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50/60 p-3 dark:bg-amber-500/5">
          <p className="text-sm font-semibold text-amber-900 dark:text-foreground">
            ↩ ย้อนการรับชำระ (ตีกลับหลังตัดจ่าย · เพื่อแก้ไข/วางบิลใหม่รวมกับรายการอื่น)
          </p>
          <p className="text-[11px] text-amber-800 dark:text-muted">
            ระบบจะ: ถอยบิลเป็น &ldquo;ออกแล้ว (ยังไม่ชำระ)&rdquo; · ถอยออเดอร์ 6→5 · คืนวงเงินเครดิต (ถ้ามี) ·
            ยกเลิกใบเสร็จที่ออกอัตโนมัติ — จากนั้นกด &ldquo;ยกเลิกใบวางบิล&rdquo; ต่อได้เลย
          </p>

          {reverseDone ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-medium text-emerald-700">{reverseDone}</p>
          ) : !reverseMode ? (
            <button
              type="button"
              onClick={() => { setReverseMode(true); setErr(null); }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500 bg-white px-3 py-2 text-sm font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-50 dark:bg-transparent"
            >
              <Undo2 className="h-4 w-4" /> ↩ ย้อนการรับชำระ
            </button>
          ) : (
            <div className="space-y-2">
              <input
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
                placeholder="เหตุผลที่ย้อน (อย่างน้อย 3 ตัวอักษร)"
                className={inputCls + " !py-2 text-[13px]"}
                disabled={pending}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending || reverseReason.trim().length < 3}
                  onClick={onReverse}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-[13px] font-bold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {pending ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> กำลังย้อน…</> : "↩ ยืนยันย้อนการรับชำระ"}
                </button>
                <button
                  type="button"
                  onClick={() => { setReverseMode(false); setReverseReason(""); setErr(null); }}
                  disabled={pending}
                  className="rounded-lg border border-border bg-white px-3 py-2 text-[13px] hover:bg-surface-alt dark:bg-transparent"
                >
                  ปิด
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
