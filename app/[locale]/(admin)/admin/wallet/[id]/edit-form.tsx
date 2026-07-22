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

import { useState, useEffect, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Calendar, CheckCircle2, XCircle, Loader2, Pencil } from "lucide-react";
import { RejectReasonPicker } from "@/components/admin/reject-reason-picker";
import { DateTime24Field } from "@/components/admin/datetime-24-field";
import { ReceiptDocNoEditor } from "@/components/admin/receipt-doc-no-editor";
import { adminUpdateWalletHsDateSlip } from "@/actions/admin/wallet-trans";
import { adminBulkApproveWalletHs } from "@/actions/admin/tb-bulk";
import { adminUpdateWalletHsPendingAmount } from "@/actions/admin/wallet-hs";
// ADR-0018 D-3 #2 + MS-1 fix (2026-05-30): repointed approve/reject from
// `wallet-trans.ts` (no paydeposit cascade) → `wallet-hs.ts` (cascade-aware
// per D-2 rule 3). The dateslip edit stays in `wallet-trans.ts` since it's
// unaffected by the paydeposit cascade.
import {
  adminApproveWalletDeposit,
  adminRejectWalletDeposit,
  adminRejectWalletSlipGroup,
  adminReviewSlipRound1,
  // P1-25/26 (ADR-0018 D-2 rule 1 + rule 3 ¶3-4): customer-withdraw (type='3')
  // approve = no balance change · reject = refund the held money. The detail
  // page renders ONE <ApproveRejectForm> for every pending tb_wallet_hs row;
  // it dispatches deposit-vs-withdraw on the `kind` prop below.
  adminApproveWithdraw,
  adminRejectWithdraw,
  // ตรวจสลิปซ้ำสด (owner 2026-07-15): กรอกวันที่ → เช็คซ้ำ → กดบันทึกไม่ได้ถ้าซ้ำ.
  checkSlipDuplicatePreview,
  type SlipDuplicateMatch,
} from "@/actions/admin/wallet-hs";

// ────────────────────────────────────────────────────────────
// <EditDateSlipForm>
// ────────────────────────────────────────────────────────────

export function EditDateSlipForm({
  id,
  initialDateSlip,
  showLabel = "แก้ไขเวลา",
  needsRound1 = false,
  reviewedAt = null,
}: {
  id: number;
  initialDateSlip: string | null;
  showLabel?: string;
  /**
   * A4 STEP-1 fold (2026-07-07): for a customer payment slip (type 1/4/8) the
   * date panel IS the round-1 review — saving the transfer date + dup-check is
   * one continuous flow that also stamps `reviewed_at` (adminReviewSlipRound1),
   * so the approve (round-2) unlocks without a separate "ตรวจสลิป รอบ 1" button.
   */
  needsRound1?: boolean;
  /** The round-1 stamp (null = not yet reviewed). */
  reviewedAt?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<boolean>(!initialDateSlip);
  const [value, setValue] = useState<string>(toLocalInput(initialDateSlip));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // ตรวจสลิปซ้ำสด (owner 2026-07-15): พอกรอกวันที่โอน → เช็คว่าสลิป (วัน+ยอด+ลูกค้า)
  // ซ้ำในระบบไหม → ถ้าซ้ำ กดบันทึกไม่ได้ + โชว์รายการที่ซ้ำ (วันเวลา/ชื่อ/ยอด).
  // แค่ preview เตือนหน้าจอ (read-only) — gate จริงยังอยู่ที่ round-2 (findDuplicateSlips).
  const [dupMatches, setDupMatches] = useState<SlipDuplicateMatch[]>([]);
  const [dupChecking, setDupChecking] = useState(false);
  const [confirmDupOpen, setConfirmDupOpen] = useState(false); // popup ยืนยันเมื่อพบซ้ำ

  useEffect(() => {
    let alive = true;
    // ทุก setState อยู่ใน timeout (async) — เลี่ยง setState ตรงๆ ใน effect (cascading render).
    // เปิด+มีวัน → debounce 400ms แล้วเช็คซ้ำ · ไม่งั้น → เคลียร์ทันที (0ms).
    const t = window.setTimeout(() => {
      if (!alive) return;
      if (!open || !value) {
        setDupMatches([]);
        setDupChecking(false);
        return;
      }
      setDupChecking(true);
      checkSlipDuplicatePreview({ id, dateslipIso: value })
        .then((res) => {
          if (!alive) return;
          setDupChecking(false);
          setDupMatches(res.ok && res.data ? res.data.matches : []);
        })
        .catch(() => {
          if (!alive) return;
          setDupChecking(false);
          setDupMatches([]);
        });
    }, open && value ? 400 : 0);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [value, id, open]);
  const hasDup = dupMatches.length > 0;

  const round1Pending = needsRound1 && !reviewedAt;

  // บันทึกจริง — เขียนวันที่โอน + ผ่านรอบ 1 (best-effort stamp). เรียกได้ทั้งกรณี
  // ไม่ซ้ำ (กดบันทึกตรงๆ) และกรณีซ้ำแล้ว admin กด "ดำเนินการต่อ" ใน popup.
  function doSave() {
    setConfirmDupOpen(false);
    setError(null);
    startTransition(async () => {
      const res = await adminUpdateWalletHsDateSlip({ id, dateslip: value });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // STEP-1 fold: กรอกวันที่โอน → ตรวจรายการซ้ำ → ผ่านรอบ 1 = ต่อเนื่องขั้นเดียว.
      // ต้องผ่านรอบ 1 สำเร็จก่อน จึงจะไปหน้าออกใบเสร็จ (รอบ 2). ถ้ารอบ 1 พลาด →
      // โชว์เหตุผล (ไม่ค้างเงียบๆ) แล้วไม่ refresh (คงหน้าเดิมให้ลองใหม่).
      if (needsRound1) {
        const r1 = await adminReviewSlipRound1({ id });
        if (!r1.ok) {
          setError(r1.error);
          return;
        }
      }
      setOpen(false);
      router.refresh(); // reviewed_at ถูก stamp → server re-render → หน้าออกใบเสร็จ (รอบ 2)
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!value) {
      setError("กรุณาเลือกวันที่");
      return;
    }
    // พบสลิปซ้ำ → ไม่บล็อกทันที · เปิด popup แจ้ง + ถาม "ดำเนินการต่อ?" (owner 2026-07-15)
    if (hasDup) {
      setConfirmDupOpen(true);
      return;
    }
    doSave();
  }

  // Confirm round-1 WITHOUT re-editing the date (a row that already has a
  // transfer date but hasn't been round-1 reviewed yet). Keeps STEP-1 self-
  // contained on this left pane.
  function confirmRound1() {
    setError(null);
    startTransition(async () => {
      const res = await adminReviewSlipRound1({ id });
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <div className="mt-2 space-y-2">
      {!open && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline"
          >
            <Calendar className="h-3.5 w-3.5" /> {showLabel}
          </button>
          {round1Pending && (
            <button
              type="button"
              onClick={confirmRound1}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {pending ? "กำลังบันทึก…" : "✓ ตรวจสลิป รอบ 1 (ยืนยันวันที่โอนถูกต้อง)"}
            </button>
          )}
          {needsRound1 && reviewedAt && (
            <span className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
              ✓ ตรวจสลิป รอบ 1 แล้ว
            </span>
          )}
        </div>
      )}
      {round1Pending && !open && (
        <p className="text-[11px] text-sky-800">
          ขั้นที่ 1 — ยืนยันวันที่โอน + ตรวจรายการซ้ำ (รอบ 1) ก่อน จึงจะกดอนุมัติ + ตัดจ่าย (รอบ 2) ได้
        </p>
      )}
      {open && (
        /* Legacy shape (ปอน 2026-07-15): a flat block — solid-red warning bar,
           then the field, then the actions right-aligned. No amber card. */
        <form onSubmit={onSubmit} className="mt-2 space-y-2">
          <p className="rounded bg-[#FF4961] px-2 py-1 text-[15px] font-semibold text-white">
            *กรุณากรอกวันให้ตรงกับสลิป มิฉะนั้น ระบบรายการใกล้เคียงจะไม่ทำงาน [รูปแบบวัน (ปี ค.ศ./เดือน/วัน)]
          </p>
          {/* ภูม 2026-06-30 — 24 ชม. (เลิก AM/PM ที่พนักงานงง). Chrome ไม่ honor lang
              บน datetime-local → ใช้ DateTime24Field (date + เลือก ชม./นาที 00–23). */}
          <DateTime24Field
            value={value}
            onChange={setValue}
            max={toLocalInput(new Date().toISOString()).split("T")[0]}
          />
          {/* ตรวจสลิปซ้ำสด — ถ้าซ้ำ กดบันทึกไม่ได้ (owner 2026-07-15) */}
          {dupChecking && value ? (
            <p className="inline-flex items-center gap-1 text-[11px] text-muted">
              <Loader2 className="h-3 w-3 animate-spin" /> กำลังตรวจสลิปซ้ำในระบบ…
            </p>
          ) : null}
          {error && (
            <p className="text-[11px] text-red-700">{error}</p>
          )}
          {/* legacy: actions right-aligned · ยกเลิก as plain text · save in red */}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => { setOpen(false); setError(null); setValue(toLocalInput(initialDateSlip)); }}
              disabled={pending}
              className="rounded-lg px-3 py-2.5 text-sm text-muted hover:text-foreground hover:underline disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={pending || dupChecking}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-600 disabled:opacity-50"
            >
              {pending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> กำลังบันทึก…</>
              ) : (
                needsRound1 ? "บันทึกวันที่โอน · ตรวจซ้ำ · ผ่านรอบ 1" : "บันทึกวันที่โอน และตรวจสอบรายการซ้ำ"
              )}
            </button>
          </div>
        </form>
      )}

      {/* popup ยืนยันเมื่อพบสลิปซ้ำ (owner 2026-07-15) — แจ้งรายการซ้ำ + ถาม "ดำเนินการต่อ?" */}
      {confirmDupOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
              onClick={() => setConfirmDupOpen(false)}
            >
              <div
                className="w-[min(460px,94vw)] rounded-2xl bg-white p-4 shadow-2xl dark:bg-surface"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-base font-bold text-red-700">⚠️ พบสลิปซ้ำ {dupMatches.length} รายการ</p>
                <p className="mt-1 text-xs text-muted">
                  มีรายการต่อไปนี้ที่วัน + ยอดตรงกับสลิปนี้ — คุณต้องการดำเนินการต่อหรือไม่?
                </p>
                <div className="mt-2 max-h-52 space-y-1 overflow-y-auto">
                  {dupMatches.map((m) => (
                    <div
                      key={m.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-900"
                    >
                      <span>วันที่/เวลา: <b className="font-mono">{fmtDupStamp(m.dateSlip)}</b></span>
                      <span>ชื่อ: <b>{m.name}</b></span>
                      <span>ยอด: <b className="font-mono">{m.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</b></span>
                      <a
                        href={`/admin/wallet/${m.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto font-mono font-semibold text-red-700 underline hover:text-red-800"
                      >
                        #{m.id} →
                      </a>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDupOpen(false)}
                    disabled={pending}
                    className="rounded-lg px-3 py-2 text-sm text-muted hover:text-foreground hover:underline disabled:opacity-50"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    onClick={doSave}
                    disabled={pending}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary-500 px-4 py-2 text-sm font-bold text-white hover:bg-primary-600 disabled:opacity-50"
                  >
                    {pending ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> กำลังบันทึก…</>
                    ) : (
                      "ดำเนินการต่อ · บันทึก · ผ่านรอบ 1"
                    )}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// <RejectSlipInline> — ตีกลับสลิปลูกค้า on PAGE 1 (owner 2026-07-16)
//
// "ยกเลิกสลิปลูกค้า = ตีกลับสลิป = ถอยสถานะ กลับไปให้จ่ายใหม่" — for a slip that
// is FAKE / DUPLICATE / doesn't match the amount.
//
// Before this, the round-1 date step (page 1: needsRound1 && !reviewedAt)
// rendered NO reject affordance — the <ApproveRejectForm> "ปฏิเสธรายการ" only
// appears on page 2 (AFTER round-1). So an admin who immediately spotted a bad
// slip had to pass round-1 first just to reach the reject. This exposes the
// SAME canonical reject (adminRejectWalletDeposit) right on page 1.
//
// MONEY-SAFE: this adds NO new money logic — it calls the existing, tested
// reject action, which for a เติม-แล้วจ่าย topup (type='1') unwinds the cascade
// (order → รอชำระเงิน · refund wallet + cashback) and for a DIRECT slip
// (type='4'/'8') is a bare flip to '3' (the order was never advanced past
// fStatus='5', so the customer can re-submit a new slip immediately).
// ────────────────────────────────────────────────────────────

export function RejectSlipInline({ id, groupIds = [id] }: { id: number; groupIds?: number[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "reject">("idle");
  const [reason, setReason] = useState<string>("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function reject() {
    setError(null);
    // ห้ามพิมพ์ · กดเลือก (owner 2026-06-27) — a preset reason is required so
    // the "why" stays systematic/groupable on the row's note.
    if (!reason.trim()) {
      setError("กรุณาเลือกเหตุผลที่ตีกลับสลิป");
      return;
    }
    if (reason.trim().length < 3) {
      setError("เหตุผลสั้นเกินไป");
      return;
    }
    startTransition(async () => {
      const res = groupIds.length > 1
        ? await adminRejectWalletSlipGroup({ ids: groupIds, reason: reason.trim() })
        : await adminRejectWalletDeposit({ id, reason: reason.trim() });
      if (res.ok) {
        router.refresh(); // slip → '3' · order rolled back → server re-renders
        setMode("idle");
        setReason("");
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="mt-3 border-t border-dashed border-border pt-3">
      {mode === "idle" ? (
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => { setMode("reject"); setError(null); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-500 bg-white px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50"
          >
            <XCircle className="h-4 w-4" /> ตีกลับสลิป (ปฏิเสธ · ให้ลูกค้าจ่ายใหม่)
          </button>
          <p className="text-[11px] text-muted">
            ใช้เมื่อสลิปที่แนบมา <b>ปลอม · ซ้ำ · หรือไม่ตรงยอด</b> — ระบบจะถอยสถานะกลับไป
            &lsquo;รอชำระเงิน&rsquo; ให้ลูกค้าโอนใหม่
          </p>
        </div>
      ) : (
        <div className="space-y-2 rounded-xl border border-red-300 bg-red-50 p-3">
          <p className="text-xs font-bold text-red-900">
            ตีกลับสลิปลูกค้า — ถอยสถานะกลับไปให้ลูกค้าโอนใหม่
          </p>
          <p className="text-[11px] text-red-800">
            เมื่อยืนยัน: สลิปนี้จะถูก <b>ปฏิเสธ</b> และออเดอร์จะกลับไปสถานะ
            <b> &lsquo;รอชำระเงิน&rsquo;</b> ให้ลูกค้าโอนใหม่ได้ (กรณี &lsquo;เติม-แล้วจ่าย&rsquo;
            ระบบจะถอยรายการที่เกี่ยวข้อง + คืนเงินเข้ากระเป๋าให้อัตโนมัติ)
          </p>
          <p className="text-xs font-bold text-red-900">เลือกเหตุผลที่ตีกลับ (กดเลือก · จำเป็น)</p>
          <RejectReasonPicker kind="deposit" onChange={setReason} disabled={pending} />
          {error && <p className="text-[11px] text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={reject}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {pending ? (
                <><Loader2 className="h-3 w-3 animate-spin" /> กำลังตีกลับ…</>
              ) : (
                "✓ ยืนยันตีกลับสลิป (ให้จ่ายใหม่)"
              )}
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
  groupIds = [id],
  hasDateSlip,
  kind = "deposit",
  hasDuplicate = false,
  needsRound1 = false,
  reviewedAt = null,
  receiptContext = null,
  showRound1Banner = true,
}: {
  id: number;
  /** Exact-slip direct-payment rows settled together as one review job. */
  groupIds?: number[];
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
  /**
   * STEP-2 doc-number panel (2026-07-07). When this deposit slip issues a
   * ใบเสร็จ at approve (a ฝากนำเข้า DIRECT forwarder-slip · type='4'), pass the
   * receipt context so accounting can see/edit the receipt เลขที่ + live dup-check
   * before it's minted. Absent → no panel (the row issues no receipt at approve).
   */
  receiptContext?: { fid: number; userid: string; dateSlipIso: string | null } | null;
  /**
   * 2-screen split (owner 2026-07-15): when the round-1 status is already shown by
   * a separate date-panel header above, suppress this form's own round-1 banner to
   * avoid a duplicate "✓ ตรวจสลิป รอบ 1 แล้ว". Default true (single-screen).
   */
  showRound1Banner?: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "reject">("idle");
  const [reason, setReason] = useState<string>("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // null = keep the auto-mint suggestion (receipt เลขที่ minted MAX+1 at settle);
  // string = accounting hand-picked the เลขที่ (passed as overrideRid).
  const [overrideRid, setOverrideRid] = useState<string | null>(null);

  const isWithdraw = kind === "withdraw";
  // Round-1 is pending when the row needs it + hasn't been reviewed yet.
  // STEP-1 fold (2026-07-07): round-1 is now confirmed on the LEFT date panel
  // (<EditDateSlipForm> · "บันทึกวันที่โอน · ตรวจซ้ำ · ผ่านรอบ 1"), NOT a separate
  // button here — so while round-1 is pending the approve is simply DISABLED with a
  // hint pointing left, instead of swapping in a "ตรวจสลิป รอบ 1" button.
  const round1Pending = !isWithdraw && needsRound1 && !reviewedAt;

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
        : groupIds.length > 1
          ? await adminBulkApproveWalletHs({ ids: groupIds, overrideRid: overrideRid ?? undefined })
          : await adminApproveWalletDeposit({
            id,
            acknowledgeDuplicate,
            // STEP-2: pass the hand-picked receipt เลขที่ (null → auto-mint MAX+1).
            overrideRid: overrideRid ?? undefined,
          });
      if (res.ok) {
        if (groupIds.length > 1 && "data" in res && res.data && "failed" in res.data && res.data.failed > 0) {
          setError(`ดำเนินการกลุ่มไม่ครบ: ${res.data.errors[0] ?? "กรุณารีเฟรชและตรวจสอบ"}`);
          router.refresh();
          return;
        }
        // จบลูป (owner 2026-07-15): a receipt-issuing DIRECT slip → หลังยืนยัน + สร้าง
        // ใบเสร็จแล้ว พาไปหน้าประวัติใบเสร็จ (ที่ใบเสร็จเพิ่งออกไปอยู่). อื่นๆ (topup /
        // withdraw · ไม่ออกใบเสร็จ) → refresh อยู่หน้าเดิม แสดงสถานะ "ทำรายการแล้ว".
        if (!isWithdraw && receiptContext) {
          const receiptIds = groupIds.length > 1 && "data" in res && res.data && "receiptIds" in res.data
            ? res.data.receiptIds
            : groupIds.length === 1 && "data" in res && res.data && "receiptId" in res.data && res.data.receiptId
              ? [res.data.receiptId]
              : [];
          router.push(receiptIds.length === 1
            ? `/admin/accounting/forwarder-invoice/${receiptIds[0]}`
            : "/admin/accounting/receipts");
        } else {
          router.refresh();
        }
      } else {
        setError(res.error);
      }
    });
  }

  function reject() {
    setError(null);
    // ห้ามพิมพ์ · กดเลือก (owner 2026-06-27): a reason is now REQUIRED + comes
    // from the preset picker (or the "อื่นๆ" custom text), so every rejection
    // carries a systematic, groupable reason on the row's note.
    if (!reason.trim()) {
      setError("กรุณาเลือกเหตุผลที่ปฏิเสธ");
      return;
    }
    if (reason.trim().length < 3) {
      setError("เหตุผลสั้นเกินไป");
      return;
    }
    startTransition(async () => {
      // ADR-0018 D-3 #2 + MS-1: param `reason` maps to tb_wallet_hs.note.
      // Withdraw reject ALSO refunds the held money (rule 3 ¶4) — that's
      // handled server-side in adminRejectWithdraw.
      const res = isWithdraw
        ? await adminRejectWithdraw({ id, reason: reason.trim() || undefined })
        : groupIds.length > 1
          ? await adminRejectWalletSlipGroup({ ids: groupIds, reason: reason.trim() })
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
      {isWithdraw && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          ตรวจบัญชีปลายทาง + จำนวนเงินทางด้านซ้ายก่อน. กด ‘ยืนยันจ่ายเงิน’ เมื่อโอนเข้าบัญชีลูกค้าแล้ว (ยอดถูกหักจากกระเป๋าตั้งแต่ลูกค้ากดถอน) · กด ‘ปฏิเสธ’ เพื่อคืนเงินเข้ากระเป๋า
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {mode === "idle" && (
        <>
          {/* A4 — show the 2 rounds explicitly (owner 2026-06-21). STEP-1 fold: round-1
              is confirmed on the LEFT date panel; the approve here is round-2. When
              round-1 is still pending the banner points left + the approve is disabled. */}
          {!isWithdraw && needsRound1 && showRound1Banner && (
            <div className={`rounded-lg border px-3 py-1.5 text-[11px] mb-2 ${reviewedAt ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-sky-200 bg-sky-50 text-sky-800"}`}>
              {reviewedAt ? "✓ ตรวจสลิป รอบ 1 แล้ว — กดอนุมัติ + ตัดจ่าย (รอบ 2) ได้เลย" : "ขั้นที่ 1: ยืนยันวันที่โอน + ตรวจซ้ำ (รอบ 1) ที่ช่อง ‘วันเวลาที่โอนในสลิป’ ด้านบนก่อน แล้วจึงอนุมัติ + ตัดจ่าย (รอบ 2)"}
            </div>
          )}
          {/* STEP-2 — doc-number panel (ออกเลขที่ใบเสร็จ) for a receipt-issuing slip. */}
          {!isWithdraw && receiptContext && (
            <div className="mb-2">
              <ReceiptDocNoEditor
                fid={receiptContext.fid}
                userid={receiptContext.userid}
                dateSlipIso={receiptContext.dateSlipIso}
                onOverrideRidChange={setOverrideRid}
                disabled={pending}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={approve}
              disabled={pending || round1Pending}
              title={round1Pending ? "ยืนยันวันที่โอน + ตรวจซ้ำ (รอบ 1) ที่ช่อง ‘วันเวลาที่โอนในสลิป’ ด้านบนก่อน" : undefined}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
            >
              {pending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> {isWithdraw ? "กำลังจ่าย…" : "กำลังอนุมัติ…"}</>
              ) : (
                <><CheckCircle2 className="h-4 w-4" /> {isWithdraw ? "ยืนยันจ่ายเงิน" : receiptContext ? "ยืนยันทำรายการ พร้อมสร้างใบเสร็จตามข้อมูลข้างต้น" : (needsRound1 ? "อนุมัติ + ตัดจ่าย (รอบ 2)" : "ยืนยันทำรายการ")}</>
              )}
            </button>
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
          {/* แก้ไขแทนการปฏิเสธ (owner 2026-06-27): for a deposit slip, most
              "ปฏิเสธ" cases are really just a wrong amount/date — fixable inline
              on the LEFT pane without bouncing the customer to re-upload. Point
              the admin there first; reject only when the slip is truly unusable. */}
          {!isWithdraw && (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-900">
              💡 ถ้าแค่ <b>วันที่</b> ไม่ตรงเล็กน้อย — กด
              &lsquo;แก้ไขเวลา&rsquo; (ด้านบน) แล้วกด <b>อนุมัติ</b> ได้เลย
              <b>ไม่ต้อง</b>ให้ลูกค้าทำสลิปใหม่ · ปฏิเสธเฉพาะเมื่อสลิปใช้ไม่ได้จริง
            </div>
          )}
          <p className="text-xs font-bold text-red-900">
            เลือกเหตุผลที่ปฏิเสธ (กดเลือก · จำเป็น)
            {isWithdraw ? " · เมื่อปฏิเสธ ระบบจะคืนเงินเข้ากระเป๋าลูกค้าอัตโนมัติ" : ""}
          </p>
          <RejectReasonPicker
            kind={isWithdraw ? "withdraw" : "deposit"}
            onChange={setReason}
            disabled={pending}
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

/** Duplicate-slip stamp: `2026-07-15 09:33` (Gregorian, minute) for the dup list. */
function fmtDupStamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
