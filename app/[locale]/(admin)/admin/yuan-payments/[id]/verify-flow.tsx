"use client";

/**
 * YuanVerifyFlow — guided slip-verify combo for `/admin/yuan-payments/[id]`
 * (owner 2026-07-23 "ทุกเลนตรวจสลิปใช้แพทเทินเดียวกับ /admin/wallet/[id]").
 *
 * Replaces the tiny-button row (`YuanPaymentActions` · ../actions-cell.tsx)
 * on the DETAIL page with the wallet [id] guided 2-page pattern:
 *
 *   PAGE-1 (pending · ยังไม่ผ่านรอบ 1) — "ขั้นที่ 1 · ตรวจสลิปกับยอดและวันโอน"
 *     amount comparison (payyuan × payrate = paythb) + ปุ่ม ✓ ตรวจสลิปรอบ 1.
 *     ปฏิเสธ reachable here too — a fake/duplicate slip shouldn't require
 *     passing round-1 first (mirrors the wallet page-1 RejectSlipInline).
 *   PAGE-2 (pending · ผ่านรอบ 1) — "ขั้นที่ 2 · อนุมัติ + ตัดจ่าย (รอบ 2)"
 *     approve + reject.
 *   SUCCESS POPUP after approve/reject — the wallet <ApproveRejectForm>
 *     pattern: fixed overlay · role=dialog · NEVER closes on outside click ·
 *     buttons navigate (ดูประวัติฝากโอน / อยู่หน้านี้ต่อ + refresh).
 *
 * ⚠️ UI-ONLY refactor — the server actions + their args are IDENTICAL to what
 * actions-cell.tsx called (actions/ untouched):
 *   round-1 = adminReviewYuanRound1({ id })
 *   approve = adminUpdateYuanPayment({ id, status: "completed", acknowledgeDuplicate? })
 *             (cost/rate captured server-side on the '2' flip — legacy
 *              hRateCostDefault port — nothing extra passed from here)
 *   reject  = adminUpdateYuanPayment({ id, status: "failed" })
 *             (NO wallet move — the wallet refund lane is the modal below)
 *   refund  = <YuanRefundModal> unchanged (uploadYuanRefundSlip →
 *             adminMarkYuanPaymentRefunded).
 * window.confirm() → useConfirmDialogs (components/ui/pacred-dialog · §0f
 * confirm-before-mutate with the consequence stated).
 *
 * NOTE: ฝากโอน mints NO tb_receipt — no label/popup here promises one
 * (the owner's dead-end rule from the wallet type-8 lane).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Loader2, Undo2 } from "lucide-react";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";
import { adminUpdateYuanPayment, adminReviewYuanRound1 } from "@/actions/admin/yuan-payments";
import { YuanRefundModal } from "../refund-modal";

type Props = {
  id: string;
  /** Pacred 5-state string (paystatusToPacred) — same shape the old actions-cell took. */
  status: string;
  yuanAmount: number;
  thbAmount: number;
  /** เรทฝากชำระ (payrate) — for the PAGE-1 ¥ × เรท = ฿ comparison. */
  payRate: number;
  memberCode: string | null;
  customerName: string;
  phone: string | null;
  paidViaWallet: boolean;
  /** A4 round-1 stamp (tb_payment.reviewed_at · null = not yet). */
  reviewedAt: string | null;
  /** จำนวนรายการใกล้เคียง (วันเดียวกัน + ยอดเท่ากัน) — จาก banner ฝั่ง server. */
  twinCount?: number;
};

const fmtThb = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
const fmtYuan = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2 });

/** `2026-07-23 14:05` — Gregorian to the minute (round-1 stamp display). */
function fmtStamp(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function YuanVerifyFlow(props: Props) {
  const {
    id, status, yuanAmount, thbAmount, payRate,
    paidViaWallet, reviewedAt, twinCount = 0,
  } = props;
  const router = useRouter();
  const { confirm, dialogs } = useConfirmDialogs();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);
  const [success, setSuccess] = useState<"approved" | "rejected" | null>(null);

  const isPending = status === "pending";
  const round1Done = Boolean(reviewedAt);
  // Same reachability as the old actions-cell (matches isYuanTransitionAllowed).
  const canRefund = status === "pending" || status === "processing" || status === "completed";

  const moneyLine = `¥${fmtYuan(yuanAmount)} (฿${fmtThb(thbAmount)})`;
  const customerLine = `[${props.memberCode ?? "—"}] ${props.customerName}`;
  // PAGE-1 comparison: ¥ × เรท should reproduce the stored ฿ (satang-rounded).
  const computedThb = Math.round(yuanAmount * payRate * 100) / 100;
  const thbMismatch = Math.abs(computedThb - thbAmount) > 0.01;

  // Round-2 status flip — SAME call shape as the old actions-cell `set()`:
  // first attempt sends acknowledgeDuplicate undefined; a server "อาจซ้ำ"
  // block re-asks via pacred confirm then retries with acknowledgeDuplicate.
  function fireStatus(newStatus: "completed" | "failed", opts?: { acknowledgeDuplicate?: boolean }) {
    setErr(null);
    startTransition(async () => {
      const res = await adminUpdateYuanPayment({
        id, status: newStatus, acknowledgeDuplicate: opts?.acknowledgeDuplicate,
      });
      if (res.ok) {
        router.refresh();
        setSuccess(newStatus === "completed" ? "approved" : "rejected");
        return;
      }
      // A5 ชั้น-1 dup-gate (owner 2026-06-21): same-customer/day/amount yuan slip
      // exists → the accountant eyeballs it + re-confirms to override.
      if (res.error?.includes("อาจซ้ำ") && !opts?.acknowledgeDuplicate) {
        if (await confirm(`${res.error}\n\nตรวจสอบแล้วยืนยันว่าไม่ใช่รายการซ้ำ — อนุมัติต่อ?`)) {
          fireStatus(newStatus, { acknowledgeDuplicate: true });
        }
        return;
      }
      setErr(res.error);
    });
  }

  async function reviewRound1() {
    setErr(null);
    const ok = await confirm(
      [
        "ตรวจสลิปรอบ 1 — ยืนยันว่า:",
        `• ยอดโอน ${moneyLine} ตรงกับสลิปลูกค้า`,
        "• วันเวลาโอนตรงกับสลิป",
        twinCount > 0
          ? `• ตรวจรายการใกล้เคียง ${twinCount} รายการ (กรอบแดงด้านบน) แล้วว่าไม่ใช่สลิปซ้ำ`
          : "• ไม่พบรายการใกล้เคียงวันเดียวกัน/ยอดเท่ากัน",
        "",
        "ผ่านรอบ 1 แล้ว จะไปขั้นอนุมัติ + ตัดจ่าย (รอบ 2)",
      ].join("\n"),
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await adminReviewYuanRound1({ id });
      if (res.ok) router.refresh();
      else setErr(res.error);
    });
  }

  async function approve() {
    setErr(null);
    const ok = await confirm(
      `อนุมัติ = ตัดจ่ายรายการฝากโอน ${moneyLine} ของ ${customerLine} · ระบบแจ้งผลลูกค้า (LINE/แจ้งเตือน)\n\nยืนยันอนุมัติ + ตัดจ่าย (รอบ 2)?`,
    );
    if (!ok) return;
    fireStatus("completed");
  }

  async function reject() {
    setErr(null);
    const ok = await confirm(
      [
        `ปฏิเสธรายการฝากโอน ${moneyLine} ของ ${customerLine}`,
        "",
        "ผลที่เกิด: รายการเป็นสถานะ 'ไม่สำเร็จ' · ระบบแจ้งผลลูกค้า",
        ...(paidViaWallet
          ? ["(รายการนี้ชำระจากกระเป๋า — การปฏิเสธไม่คืนเงินอัตโนมัติ · ถ้าต้องคืนเงินเข้ากระเป๋า ใช้ปุ่ม 'คืนเงิน + แนบสลิป')"]
          : []),
        "",
        "ยืนยันปฏิเสธ?",
      ].join("\n"),
    );
    if (!ok) return;
    fireStatus("failed");
  }

  return (
    <div className="space-y-3">
      {/* ✅ Post-verify popup (wallet <ApproveRejectForm> pattern) — must-click,
          NEVER closes on outside click. ฝากโอนไม่มีใบเสร็จ → nav = ประวัติ/อยู่ต่อ. */}
      {success && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className={`w-full max-w-sm rounded-2xl border bg-white p-5 text-center shadow-2xl dark:bg-surface ${
            success === "approved" ? "border-emerald-200" : "border-red-200"
          }`}>
            <div className={`mx-auto mb-2 flex size-12 items-center justify-center rounded-full text-2xl ${
              success === "approved" ? "bg-emerald-100" : "bg-red-100"
            }`}>
              {success === "approved" ? "✅" : "🚫"}
            </div>
            <p className="text-base font-bold text-foreground">
              {success === "approved"
                ? "ตรวจสลิปสำเร็จ — อนุมัติตัดจ่ายแล้ว"
                : "ปฏิเสธรายการแล้ว"}
            </p>
            <p className="mt-1 text-xs text-muted">
              {success === "approved"
                ? `ระบบตัดจ่ายรายการฝากโอน ${moneyLine} และแจ้งผลลูกค้าแล้ว`
                : "ระบบแจ้งผลลูกค้าแล้ว — ลูกค้าส่งรายการใหม่ได้"}
            </p>
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={() => router.push("/admin/yuan-payments")}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
              >
                ดูประวัติฝากโอน →
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

      {/* ── PAGE-1 · ขั้นที่ 1 (pending · ยังไม่ผ่านรอบ 1) ── */}
      {isPending && !round1Done && (
        <div className="space-y-2 rounded-xl border border-sky-300 bg-sky-50/60 p-3 dark:bg-sky-50/5">
          <p className="text-sm font-semibold text-sky-900 dark:text-foreground">
            ขั้นที่ 1 · ตรวจสลิปกับยอดและวันโอน
          </p>
          <p className="text-[11px] text-sky-800 dark:text-muted">
            เทียบสลิปลูกค้า (ด้านบน) กับยอดโอน + วันเวลาโอน แล้วกดผ่านรอบ 1
            จึงจะไปขั้นอนุมัติ + ตัดจ่าย (รอบ 2)
          </p>

          {/* ยอดที่ต้องตรงสลิป — the same figures the page shows, folded into one check */}
          <div className="space-y-1 rounded-lg border border-border bg-white p-3 dark:bg-surface">
            <div className="flex justify-between gap-3 text-sm">
              <span className="text-muted">จำนวนเงินหยวน</span>
              <span className="font-mono">¥{fmtYuan(yuanAmount)}</span>
            </div>
            <div className="flex justify-between gap-3 text-sm">
              <span className="text-muted">เรทฝากชำระ</span>
              <span className="font-mono">{payRate.toLocaleString(undefined, { minimumFractionDigits: 4 })} บาท/หยวน</span>
            </div>
            <div className="flex justify-between gap-3 text-sm">
              <span className="text-muted">คำนวณ ¥ × เรท</span>
              <span className="font-mono">฿{fmtThb(computedThb)}</span>
            </div>
            <div className="flex justify-between gap-3 border-t border-border pt-1 text-sm">
              <span className="font-semibold text-foreground">ยอดโอนที่ต้องตรงสลิป</span>
              <span className="font-mono text-base font-bold text-foreground">฿{fmtThb(thbAmount)}</span>
            </div>
            {thbMismatch && (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900">
                ⚠️ ยอดคำนวณ (฿{fmtThb(computedThb)}) ไม่ตรงกับยอดที่บันทึก (฿{fmtThb(thbAmount)}) — ตรวจเรท/ยอดก่อนผ่านรอบ 1
              </p>
            )}
          </div>

          {twinCount > 0 && (
            <p className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-800">
              ⚠️ มีรายการใกล้เคียง {twinCount} รายการ (กรอบแดงด้านบน) — ตรวจว่าไม่ใช่สลิปซ้ำก่อนผ่านรอบ 1
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
              "✓ ตรวจสลิปรอบ 1 — ยืนยันยอดและวันโอนตรงสลิป"
            )}
          </button>

          {/* ตีกลับได้ตั้งแต่หน้า 1 — สลิปปลอม/ซ้ำ/ไม่ตรงยอด ไม่ต้องผ่านรอบ 1 ก่อน */}
          <div className="border-t border-dashed border-border pt-2">
            <button
              type="button"
              onClick={reject}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-500 bg-white px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50 dark:bg-transparent"
            >
              <XCircle className="h-4 w-4" /> ปฏิเสธรายการ (สลิปปลอม · ซ้ำ · ไม่ตรงยอด)
            </button>
          </div>
        </div>
      )}

      {/* ── PAGE-2 · ขั้นที่ 2 (pending · ผ่านรอบ 1 แล้ว) ── */}
      {isPending && round1Done && (
        <div className="space-y-2 rounded-xl border border-emerald-300 bg-emerald-50/50 p-3 dark:bg-emerald-50/5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-emerald-900 dark:text-foreground">
              ขั้นที่ 2 · อนุมัติ + ตัดจ่าย (รอบ 2)
            </p>
            <span className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
              ✓ ตรวจสลิปรอบ 1 แล้ว{reviewedAt ? ` · ${fmtStamp(reviewedAt)}` : ""}
            </span>
          </div>
          <p className="text-[11px] text-emerald-900/80 dark:text-muted">
            อนุมัติ = ตัดจ่าย {moneyLine} + แจ้งผลลูกค้า · เรทต้นทุนถูกบันทึกอัตโนมัติตามเรทระบบ
            (แก้ได้ที่กรอบ &lsquo;สรุปรายการเงิน&rsquo;) — ฝากโอนไม่ออกใบเสร็จอัตโนมัติ
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={approve}
              disabled={pending}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
            >
              {pending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> กำลังอนุมัติ…</>
              ) : (
                <><CheckCircle2 className="h-4 w-4" /> อนุมัติ + ตัดจ่าย (รอบ 2)</>
              )}
            </button>
            <button
              type="button"
              onClick={reject}
              disabled={pending}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-500 bg-white px-3 py-2.5 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50 dark:bg-transparent"
            >
              <XCircle className="h-4 w-4" /> ปฏิเสธรายการ
            </button>
          </div>
        </div>
      )}

      {/* ── คืนเงิน + แนบสลิป — same reachability as before (pending/processing/completed) ── */}
      {canRefund && (
        <div className="space-y-1 border-t border-dashed border-border pt-2">
          <button
            type="button"
            onClick={() => setRefundOpen(true)}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-xs font-semibold text-foreground hover:bg-surface-alt disabled:opacity-50 dark:bg-transparent"
          >
            <Undo2 className="h-3.5 w-3.5" /> คืนเงิน + แนบสลิป
          </button>
          <p className="text-[11px] text-muted">
            ใช้เมื่อโอนเงินคืนลูกค้าแล้ว (ต้องแนบสลิปคืนเงิน)
            {paidViaWallet
              ? " · รายการนี้ชำระจากกระเป๋า — ระบบจะคืนเงินเข้ากระเป๋าให้อัตโนมัติ"
              : ""}
          </p>
        </div>
      )}

      {canRefund && (
        <YuanRefundModal
          open={refundOpen}
          onClose={() => setRefundOpen(false)}
          yuanPayment={{
            id,
            yuan_amount:     yuanAmount,
            thb_amount:      thbAmount,
            member_code:     props.memberCode ?? null,
            customer_name:   props.customerName || "—",
            phone:           props.phone ?? null,
            paid_via_wallet: paidViaWallet,
            status,
          }}
        />
      )}

      {/* pacred confirm dialogs mount (shared <dialog> the hook owns) */}
      {dialogs}
    </div>
  );
}
