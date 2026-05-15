"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminUpdateServiceOrder, adminMarkServiceOrderPaid } from "@/actions/admin/service-orders";

const inputCls = "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

const STATUS_FLOW = [
  { value: "pending",              label: "รอดำเนินการ" },
  { value: "awaiting_payment",     label: "รอชำระเงิน" },
  { value: "ordered",              label: "สั่งแล้ว" },
  { value: "awaiting_chn_dispatch",label: "รอจีนจัดส่ง" },
  { value: "completed",            label: "สำเร็จ" },
] as const;

export function AdminServiceOrderUpdateForm({ hNo, status, note_admin, totalThb }: { hNo: string; status: string; note_admin: string | null; totalThb: number }) {
  const router = useRouter();
  const [st, setSt]   = useState(status);
  const [note, setNote] = useState(note_admin ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const currentIdx = STATUS_FLOW.findIndex((s) => s.value === st);
  const nextStatus = currentIdx >= 0 && currentIdx < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentIdx + 1] : null;

  function quickSet(value: string) {
    setMsg(null); setError(null);
    startTransition(async () => {
      const res = await adminUpdateServiceOrder({
        h_no: hNo,
        status: value as Parameters<typeof adminUpdateServiceOrder>[0]["status"],
      });
      if (res.ok) {
        setSt(value);
        setMsg("อัพเดทสถานะแล้ว — ลูกค้าได้รับการแจ้งเตือน");
        router.refresh();
        setTimeout(() => setMsg(null), 4000);
      } else setError(res.error);
    });
  }

  function markPaid(allowOverdraw: boolean) {
    setMsg(null); setError(null);
    startTransition(async () => {
      const res = await adminMarkServiceOrderPaid({
        h_no: hNo,
        allow_overdraw: allowOverdraw,
      });
      if (res.ok) {
        setSt("ordered");
        setMsg(
          res.data?.already_paid
            ? "ออเดอร์นี้ชำระไปแล้ว — เปลี่ยนสถานะให้แล้ว"
            : `ชำระสำเร็จ — หัก wallet ลูกค้า ฿${totalThb.toLocaleString()} แล้ว ลูกค้าได้รับการแจ้งเตือน`,
        );
        router.refresh();
        setTimeout(() => setMsg(null), 5000);
      } else setError(res.error);
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null); setError(null);
    startTransition(async () => {
      const res = await adminUpdateServiceOrder({
        h_no: hNo,
        status: st as Parameters<typeof adminUpdateServiceOrder>[0]["status"],
        note_admin: note,
      });
      if (res.ok) {
        setMsg("บันทึกแล้ว");
        router.refresh();
        setTimeout(() => setMsg(null), 4000);
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

      {/* T-P1: explicit "mark paid" — debits wallet + flips status atomically */}
      {(st === "pending" || st === "awaiting_payment") && (
        <div className="rounded-lg border border-primary-200 bg-primary-50/50 dark:bg-primary-950/20 p-3 space-y-2">
          <p className="text-xs font-medium">บันทึกการชำระเงิน (T-P1)</p>
          <p className="text-xs text-muted">
            ยอด ฿{totalThb.toLocaleString()} — กดเพื่อหัก wallet ลูกค้า + เปลี่ยนสถานะเป็น &ldquo;สั่งแล้ว&rdquo;
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => markPaid(false)}
              disabled={pending}
              className="rounded-lg bg-green-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-green-700 disabled:opacity-50"
            >
              💰 บันทึกชำระจาก wallet
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm("รับเงินสด/โอนตรงโดยไม่หัก wallet ใช่ไหม? (ใช้เมื่อลูกค้าโอนนอกระบบ)")) {
                  markPaid(true);
                }
              }}
              disabled={pending}
              className="rounded-lg border border-amber-300 text-amber-700 px-3 py-1.5 text-xs hover:bg-amber-50 disabled:opacity-50"
            >
              💵 รับเงินสด/นอกระบบ (override)
            </button>
          </div>
        </div>
      )}

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
