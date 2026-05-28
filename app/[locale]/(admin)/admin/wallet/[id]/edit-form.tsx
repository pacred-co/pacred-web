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
import { Calendar, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import {
  adminUpdateWalletHsDateSlip,
  adminApproveWalletHs,
  adminRejectWalletHs,
} from "@/actions/admin/wallet-trans";

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
// <ApproveRejectForm>
// ────────────────────────────────────────────────────────────

export function ApproveRejectForm({
  id,
  hasDateSlip,
}: {
  id: number;
  hasDateSlip: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "reject">("idle");
  const [reason, setReason] = useState<string>("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function approve() {
    setError(null);
    if (!hasDateSlip) {
      setError("กรุณากรอกวันที่ในสลิปก่อนอนุมัติ");
      return;
    }
    startTransition(async () => {
      const res = await adminApproveWalletHs({ id });
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
      const res = await adminRejectWalletHs({ id, note: reason.trim() || undefined });
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
        กรุณาตรวจสอบวันที่โอนทางด้านซ้ายกับวันที่ในสลิป พร้อมดูรายการใกล้เคียงด้านล่าง (ถ้ามี) ก่อนอนุมัติ
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {mode === "idle" && (
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
              <><CheckCircle2 className="h-4 w-4" /> ยืนยันทำรายการ</>
            )}
          </button>
          <button
            type="button"
            onClick={() => { setMode("reject"); setError(null); }}
            disabled={pending}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-500 bg-white px-3 py-2.5 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            <XCircle className="h-4 w-4" /> ปฏิเสธรายการ
          </button>
        </div>
      )}

      {mode === "reject" && (
        <div className="space-y-2 rounded-xl border border-red-300 bg-red-50 p-3">
          <p className="text-xs font-bold text-red-900">เหตุผลที่ปฏิเสธ (ตัวเลือก · ระบบจะบันทึกลง note)</p>
          <textarea
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs"
            placeholder="เช่น ยอดในสลิปไม่ตรง / สลิปอ่านไม่ออก / เลขที่อ้างอิงไม่ตรง"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={reject}
              disabled={pending}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {pending ? "กำลังปฏิเสธ…" : "✓ ยืนยันปฏิเสธ"}
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
