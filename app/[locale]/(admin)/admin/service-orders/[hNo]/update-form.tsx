"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminUpdateServiceOrder } from "@/actions/admin/service-orders";
// adminMarkServiceOrderPaid REMOVED 2026-06-02 §0e — dead-twin Potemkin trap.
// The live mark-paid path is <MarkPaidTbForm> (mark-paid-tb-form.tsx),
// mounted in legacy-view.tsx L289-293 → adminMarkServiceOrderPaidTb writes
// the real tb_wallet/tb_wallet_hs/tb_header_order trio.

const inputCls = "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

const STATUS_FLOW = [
  { value: "pending",              label: "รอดำเนินการ" },
  { value: "awaiting_payment",     label: "รอชำระเงิน" },
  { value: "ordered",              label: "สั่งแล้ว" },
  { value: "awaiting_chn_dispatch",label: "รอจีนจัดส่ง" },
  { value: "completed",            label: "สำเร็จ" },
] as const;

// `totalThb` is accepted (both mounts still pass it) but no longer read here —
// the mark-paid amount + debit now lives entirely in the adjacent
// <MarkPaidTbForm> after the dead adminMarkServiceOrderPaid path was removed.
export function AdminServiceOrderUpdateForm({ hNo, status, note_admin }: { hNo: string; status: string; note_admin: string | null; totalThb?: number }) {
  const router = useRouter();
  const [st, setSt]   = useState(status);
  const [note, setNote] = useState(note_admin ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const currentIdx = STATUS_FLOW.findIndex((s) => s.value === st);
  const nextStatus = currentIdx >= 0 && currentIdx < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentIdx + 1] : null;

  // V-A2: rollback detection (cancelled excluded from lifecycle order)
  function isRollbackAttempt(from: string, to: string): boolean {
    if (from === to) return false;
    if (to === "cancelled" || from === "cancelled") return false;
    const fi = STATUS_FLOW.findIndex((s) => s.value === from);
    const ti = STATUS_FLOW.findIndex((s) => s.value === to);
    return fi >= 0 && ti >= 0 && ti < fi;
  }

  function quickSet(value: string) {
    setMsg(null); setError(null);
    let rollbackReason: string | undefined = undefined;
    if (isRollbackAttempt(st, value)) {
      const r = window.prompt(
        `กำลังย้อนสถานะจาก "${st}" → "${value}".\nระบุเหตุผล (≥3 ตัว) — ลูกค้าจะเห็นเหตุผลในการแจ้งเตือน:`,
      );
      if (r == null) return;
      if (r.trim().length < 3) { setError("เหตุผลต้องอย่างน้อย 3 ตัวอักษร"); return; }
      rollbackReason = r.trim();
    }
    startTransition(async () => {
      const res = await adminUpdateServiceOrder({
        h_no: hNo,
        status: value as Parameters<typeof adminUpdateServiceOrder>[0]["status"],
        rollback_reason: rollbackReason,
      });
      if (res.ok) {
        setSt(value);
        setMsg(rollbackReason
          ? "↩️ ย้อนสถานะแล้ว — ลูกค้าได้รับแจ้งเตือนพร้อมเหตุผล"
          : "อัพเดทสถานะแล้ว — ลูกค้าได้รับการแจ้งเตือน");
        router.refresh();
        setTimeout(() => setMsg(null), 5000);
      } else setError(res.error);
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null); setError(null);

    // V-A2: rollback against the saved-state status (prop)
    let rollbackReason: string | undefined = undefined;
    if (isRollbackAttempt(status, st)) {
      const r = window.prompt(
        `กำลังย้อนสถานะจาก "${status}" → "${st}".\nระบุเหตุผล (≥3 ตัว) — ลูกค้าจะเห็นเหตุผลในการแจ้งเตือน:`,
      );
      if (r == null) return;
      if (r.trim().length < 3) { setError("เหตุผลต้องอย่างน้อย 3 ตัวอักษร"); return; }
      rollbackReason = r.trim();
    }

    startTransition(async () => {
      const res = await adminUpdateServiceOrder({
        h_no: hNo,
        status: st as Parameters<typeof adminUpdateServiceOrder>[0]["status"],
        note_admin: note,
        rollback_reason: rollbackReason,
      });
      if (res.ok) {
        setMsg(rollbackReason
          ? "↩️ ย้อนสถานะ + บันทึกแล้ว — ลูกค้าได้รับแจ้งเตือนพร้อมเหตุผล"
          : "บันทึกแล้ว");
        router.refresh();
        setTimeout(() => setMsg(null), 5000);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
      <h3 className="font-bold text-sm">อัพเดทสถานะ</h3>
      {msg && <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700">{msg}</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</div>}

      {/* Mark-paid lives in the adjacent <MarkPaidTbForm> (mark-paid-tb-form.tsx
          → adminMarkServiceOrderPaidTb, writes the live tb_wallet/tb_wallet_hs/
          tb_header_order trio). The old block here called adminMarkServiceOrderPaid
          which read the 0-row rebuilt `service_orders` → `not_found` for every
          real order (Potemkin dead-read · §0e). Removed so each order shows
          ONE working "บันทึกชำระ" button. */}

      {/* Quick workflow */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted">เปลี่ยนสถานะด่วน</p>
        <div className="flex flex-wrap gap-2">
          {nextStatus && (
            <button type="button" onClick={() => quickSet(nextStatus.value)} disabled={pending}
              className="rounded-lg bg-primary-500 text-white px-3 py-1.5 text-xs font-medium hover:bg-primary-600 disabled:opacity-50">
              → {nextStatus.label}
            </button>
          )}
          {st !== "cancelled" && (
            <button type="button" onClick={() => quickSet("cancelled")} disabled={pending}
              className="rounded-lg border border-red-200 text-red-600 px-3 py-1.5 text-xs hover:bg-red-50 disabled:opacity-50">
              ❌ ยกเลิก
            </button>
          )}
        </div>
        <div className="flex gap-1 flex-wrap">
          {STATUS_FLOW.map((s, i) => (
            <span key={s.value} className={`text-[10px] px-2 py-0.5 rounded-full border ${
              s.value === st
                ? "bg-primary-500 text-white border-primary-500"
                : i < currentIdx
                  ? "bg-surface-alt text-muted border-border line-through"
                  : "text-muted border-border"
            }`}>{s.label}</span>
          ))}
        </div>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium">สถานะ (แก้ตรง)</span>
        <select value={st} onChange={(e) => setSt(e.target.value)} className={inputCls}>
          <option value="pending">รอดำเนินการ</option>
          <option value="awaiting_payment">รอชำระเงิน</option>
          <option value="ordered">สั่งสินค้าแล้ว</option>
          <option value="awaiting_chn_dispatch">รอจีนจัดส่ง</option>
          <option value="completed">สำเร็จ</option>
          <option value="cancelled">ยกเลิก</option>
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium">หมายเหตุ (admin)</span>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
      </label>
      <Button type="submit" fullWidth disabled={pending}>{pending ? "กำลังบันทึก..." : "บันทึก (status + note)"}</Button>
    </form>
  );
}
