"use client";

/**
 * Wave 19 BUG #3 — Client-side widgets for `/admin/wallet/[id]`.
 *
 * Two cooperating widgets:
 *   1. <EditDateSlipForm> — collapsible "แก้ไขเวลา" panel that lets ops
 *      type/correct the "วันที่โอนในสลิป" of a pending topup. Required
 *      BEFORE the similar-tx detector can match against other rows. Maps
 *      to legacy form `updateDate` (PHP L132-140 of w-s-deposit-detail.php).
 *
 *   2. <ApproveRejectForm> — the right-pane action block when status='1'.
 *      Two buttons:
 *        ✓ ยืนยันทำรายการ (status='2' + credit wallettotal)
 *        ✗ ปฏิเสธรายการ (status='3' + optional reason textarea)
 *      Maps to legacy form `update`/`updateDate` block (PHP L292-485).
 *
 * Both call server actions in `actions/admin/wallet-trans.ts`. On success
 * we `router.refresh()` to re-render the server page with the new row state
 * (avoids stale client state vs. the server-fetched summary cards).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calendar, CheckCircle2, XCircle, Loader2, Pencil } from "lucide-react";
import { adminUpdateWalletHsDateSlip } from "@/actions/admin/wallet-trans";
import { adminUpdateWalletHsPendingAmount } from "@/actions/admin/wallet-hs";
// ADR-0018 D-3 #2 + MS-1 fix (2026-05-30): repointed approve/reject from
// `wallet-trans.ts` (no paydeposit cascade) → `wallet-hs.ts` (cascade-aware
// per D-2 rule 3). The dateslip edit stays in `wallet-trans.ts` since it's
// unaffected by the paydeposit cascade.
import {
  adminApproveWalletDeposit,
  adminRejectWalletDeposit,
  adminReviewSlipRound1,
  // P1-25/26 (ADR-0018 D-2 rule 1 + rule 3 ¶3-4): customer-withdraw (type='3')
  // approve = no balance change · reject = refund the held money. The detail
  // page renders ONE <ApproveRejectForm> for every pending tb_wallet_hs row;
  // it dispatches deposit-vs-withdraw on the `kind` prop below.
  adminApproveWithdraw,
  adminRejectWithdraw,
} from "@/actions/admin/wallet-hs";

// ────────────────────────────────────────────────────────────
// <EditDateSlipForm>
// ────────────────────────────────────────────────────────────

export function EditDateSlipForm({
  id,
  initialDateSlip,
  showLabel = "แก้ไขเวลา",
}: {
  id: number;
  initialDateSlip: string | null;
  showLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<boolean>(!initialDateSlip);
  const [value, setValue] = useState<string>(toLocalInput(initialDateSlip));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!value) {
      setError("กรุณาเลือกวันที่");
      return;
    }
    startTransition(async () => {
      const res = await adminUpdateWalletHsDateSlip({ id, dateslip: value });
      if (res.ok) {
        router.refresh();
        setOpen(false);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="mt-2">
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline"
        >
          <Calendar className="h-3.5 w-3.5" /> {showLabel}
        </button>
      )}
      {open && (
        <form onSubmit={onSubmit} className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
          <p className="text-[11px] font-semibold text-amber-900">
            กรอกวันที่ให้ตรงกับสลิป (รูปแบบ ปี ค.ศ./เดือน/วัน · มิฉะนั้นระบบจะไม่จับรายการใกล้เคียง)
          </p>
          <input
            type="datetime-local"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            max={toLocalInput(new Date().toISOString())}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
            required
          />
          {error && (
            <p className="text-[11px] text-red-700">{error}</p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-600 disabled:opacity-50"
            >
              {pending ? (
                <><Loader2 className="h-3 w-3 animate-spin" /> กำลังบันทึก…</>
              ) : (
                "บันทึกวันที่โอน และตรวจสอบรายการซ้ำ"
              )}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setError(null); setValue(toLocalInput(initialDateSlip)); }}
              disabled={pending}
              className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs hover:bg-surface-alt"
            >
              ยกเลิก
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// <EditAmountForm> — #6 (ภูม 2026-06-26)
//
// Lets the accountant CORRECT the slip amount while the row is still
// pending (status='1') — e.g. the customer typed 11,470.52 but the bank
// slip shows 11,470.51. Calls adminUpdateWalletHsPendingAmount, which is
// pending-only + refuses linked "เติม-แล้วจ่าย" topups (cascade-locked).
// §0f confirm-before-mutate: a window.confirm shows old → new before firing.
// ────────────────────────────────────────────────────────────

export function EditAmountForm({
  id,
  currentAmount,
}: {
  id: number;
  currentAmount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string>(String(currentAmount));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const next = Number(value);
    if (!Number.isFinite(next) || next <= 0) {
      setError("กรุณากรอกจำนวนเงินที่มากกว่า 0");
      return;
    }
    const rounded = Math.round(next * 100) / 100;
    if (Math.abs(rounded - currentAmount) < 0.005) {
      setError("จำนวนเงินใหม่ต้องไม่เท่ากับจำนวนเดิม");
      return;
    }
    // §0f confirm-before-mutate — show the exact old → new figures.
    if (
      !window.confirm(
        `แก้ไขจำนวนเงินของสลิปนี้?\n\nจาก  ฿${currentAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}\nเป็น ฿${rounded.toLocaleString("th-TH", { minimumFractionDigits: 2 })}\n\n(ระบบจะใช้จำนวนเงินใหม่นี้ตอนกดอนุมัติ + ตัดจ่าย)`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await adminUpdateWalletHsPendingAmount({ id, amount: rounded });
      if (res.ok) {
        router.refresh();
        setOpen(false);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="mt-2">
      {!open && (
        <button
          type="button"
          onClick={() => { setOpen(true); setValue(String(currentAmount)); setError(null); }}
          className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline"
        >
          <Pencil className="h-3.5 w-3.5" /> แก้ไขจำนวนเงิน (ให้ตรงสลิป)
        </button>
      )}
      {open && (
        <form onSubmit={onSubmit} className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
          <p className="text-[11px] font-semibold text-amber-900">
            แก้ไขจำนวนเงินให้ตรงกับสลิปจริง (แก้ได้เฉพาะตอน &lsquo;รอตรวจสอบ&rsquo; · ระบบจะใช้ยอดนี้ตอนตัดจ่าย)
          </p>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-mono"
            required
          />
          {error && <p className="text-[11px] text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-600 disabled:opacity-50"
            >
              {pending ? (
                <><Loader2 className="h-3 w-3 animate-spin" /> กำลังบันทึก…</>
              ) : (
                "บันทึกจำนวนเงินใหม่"
              )}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setError(null); setValue(String(currentAmount)); }}
              disabled={pending}
              className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs hover:bg-surface-alt"
            >
              ยกเลิก
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// <ApproveRejectForm>
// ────────────────────────────────────────────────────────────

export function ApproveRejectForm({
  id,
  hasDateSlip,
  kind = "deposit",
  hasDuplicate = false,
  needsRound1 = false,
  reviewedAt = null,
}: {
  id: number;
  hasDateSlip: boolean;
  /**
   * Which legacy tb_wallet_hs flow this row is:
   *   "deposit"  — type='1' top-up slip (approve credits wallet · reject no-op
   *                or cascade-refund). Dispatches to adminApproveWalletDeposit.
   *   "withdraw" — type='3' customer withdraw (approve = pay out, NO balance
   *                change · reject = refund the held money). Dispatches to
   *                adminApproveWithdraw. ADR-0018 D-2 rule 1 + rule 3 ¶3-4.
   */
  kind?: "deposit" | "withdraw";
  /**
   * The legacy verify "ชั้น 1" dup gate: a same-day same-amount slip exists.
   * When true the approve requires an explicit human confirm before it fires;
   * the server ALSO re-checks and blocks unless acknowledgeDuplicate=true.
   */
  hasDuplicate?: boolean;
  /**
   * A4 two-round verify (owner 2026-06-21): does this row's type require a
   * ROUND-1 review before the approve (round-2) may settle? (true for customer
   * payment slips: type 1/4/8.) `reviewedAt` = the round-1 stamp (null = not yet).
   */
  needsRound1?: boolean;
  reviewedAt?: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "reject">("idle");
  const [reason, setReason] = useState<string>("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isWithdraw = kind === "withdraw";
  // Round-1 is pending when the row needs it + hasn't been reviewed yet.
  const round1Pending = !isWithdraw && needsRound1 && !reviewedAt;

  function reviewRound1() {
    setError(null);
    if (!hasDateSlip) {
      setError("กรุณากรอกวันที่ในสลิปก่อนตรวจรอบ 1");
      return;
    }
    startTransition(async () => {
      const res = await adminReviewSlipRound1({ id });
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  function approve() {
    setError(null);
    // The slip-date gate only applies to deposit top-ups (the date must match
    // the bank slip before crediting). Withdraw approve = "confirm bank payout";
    // no incoming slip to match, so no gate.
    if (!isWithdraw && !hasDateSlip) {
      setError("กรุณากรอกวันที่ในสลิปก่อนอนุมัติ");
      return;
    }
    // ชั้น-1 dup gate (legacy w-s-deposit-detail.php): a same-day same-amount
    // slip exists → make the accountant explicitly confirm it's NOT a double
    // submission before the one-click approve credits the wallet. The server
    // re-runs the same check and blocks unless acknowledgeDuplicate is set.
    let acknowledgeDuplicate = false;
    if (!isWithdraw && hasDuplicate) {
      if (
        !window.confirm(
          "⚠️ พบสลิปที่อาจซ้ำ (วันโอนเดียวกัน ยอดเท่ากัน)\n\nตรวจสอบแล้วว่าไม่ใช่รายการซ้ำ และต้องการอนุมัติต่อใช่หรือไม่?",
        )
      ) {
        return;
      }
      acknowledgeDuplicate = true;
    }
    startTransition(async () => {
      const res = isWithdraw
        ? await adminApproveWithdraw({ id })
        : await adminApproveWalletDeposit({ id, acknowledgeDuplicate });
      if (res.ok) {
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function reject() {
    setError(null);
    if (reason.trim().length > 0 && reason.trim().length < 3) {
      setError("เหตุผลต้องมีอย่างน้อย 3 ตัวอักษร (หรือเว้นว่างไว้)");
      return;
    }
    startTransition(async () => {
      // ADR-0018 D-3 #2 + MS-1: param `reason` maps to tb_wallet_hs.note.
      // Withdraw reject ALSO refunds the held money (rule 3 ¶4) — that's
      // handled server-side in adminRejectWithdraw.
      const res = isWithdraw
        ? await adminRejectWithdraw({ id, reason: reason.trim() || undefined })
        : await adminRejectWalletDeposit({ id, reason: reason.trim() || undefined });
      if (res.ok) {
        router.refresh();
        setMode("idle");
        setReason("");
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
        {isWithdraw
          ? "ตรวจบัญชีปลายทาง + จำนวนเงินทางด้านซ้ายก่อน. กด ‘ยืนยันจ่ายเงิน’ เมื่อโอนเข้าบัญชีลูกค้าแล้ว (ยอดถูกหักจากกระเป๋าตั้งแต่ลูกค้ากดถอน) · กด ‘ปฏิเสธ’ เพื่อคืนเงินเข้ากระเป๋า"
          : "กรุณาตรวจสอบวันที่โอนทางด้านซ้ายกับวันที่ในสลิป พร้อมดูรายการใกล้เคียงด้านล่าง (ถ้ามี) ก่อนอนุมัติ"}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {mode === "idle" && (
        <>
          {/* A4 — show the 2 rounds explicitly (owner 2026-06-21). Round-1 done
              shows a green ✓ banner; the approve becomes the round-2 button. */}
          {!isWithdraw && needsRound1 && (
            <div className={`rounded-lg border px-3 py-1.5 text-[11px] mb-2 ${reviewedAt ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-sky-200 bg-sky-50 text-sky-800"}`}>
              {reviewedAt ? "✓ ตรวจสลิป รอบ 1 แล้ว — กดอนุมัติ + ตัดจ่าย (รอบ 2) ได้เลย" : "ขั้นที่ 1: ตรวจสลิป (รอบ 1) ก่อน แล้วจึงอนุมัติ + ตัดจ่าย (รอบ 2)"}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {round1Pending ? (
              <button
                type="button"
                onClick={reviewRound1}
                disabled={pending}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {pending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> กำลังบันทึก…</>
                ) : (
                  <><CheckCircle2 className="h-4 w-4" /> ตรวจสลิป รอบ 1</>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={approve}
                disabled={pending}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
              >
                {pending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> {isWithdraw ? "กำลังจ่าย…" : "กำลังอนุมัติ…"}</>
                ) : (
                  <><CheckCircle2 className="h-4 w-4" /> {isWithdraw ? "ยืนยันจ่ายเงิน" : (needsRound1 ? "อนุมัติ + ตัดจ่าย (รอบ 2)" : "ยืนยันทำรายการ")}</>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => { setMode("reject"); setError(null); }}
              disabled={pending}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-500 bg-white px-3 py-2.5 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" /> {isWithdraw ? "ปฏิเสธ + คืนเงิน" : "ปฏิเสธรายการ"}
            </button>
          </div>
        </>
      )}

      {mode === "reject" && (
        <div className="space-y-2 rounded-xl border border-red-300 bg-red-50 p-3">
          <p className="text-xs font-bold text-red-900">
            เหตุผลที่ปฏิเสธ (ตัวเลือก · ระบบจะบันทึกลง note)
            {isWithdraw ? " · เมื่อปฏิเสธ ระบบจะคืนเงินเข้ากระเป๋าลูกค้าอัตโนมัติ" : ""}
          </p>
          <textarea
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs"
            placeholder={isWithdraw
              ? "เช่น เอกสารบัญชีไม่ครบ / เลขบัญชีไม่ตรงชื่อ / ลูกค้าขอยกเลิก"
              : "เช่น ยอดในสลิปไม่ตรง / สลิปอ่านไม่ออก / เลขที่อ้างอิงไม่ตรง"}
            autoFocus
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={reject}
              disabled={pending}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {pending ? "กำลังปฏิเสธ…" : (isWithdraw ? "✓ ยืนยันปฏิเสธ + คืนเงิน" : "✓ ยืนยันปฏิเสธ")}
            </button>
            <button
              type="button"
              onClick={() => { setMode("idle"); setReason(""); setError(null); }}
              disabled={pending}
              className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs hover:bg-surface-alt"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────

/**
 * Convert an ISO timestamp (UTC from DB) to the `YYYY-MM-DDTHH:mm` shape
 * the native `<input type="datetime-local">` expects. Returns empty string
 * for null / invalid input.
 */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
