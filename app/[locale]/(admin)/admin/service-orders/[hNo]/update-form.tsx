"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminUpdateServiceOrder } from "@/actions/admin/service-orders";

const inputCls = "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

export function AdminServiceOrderUpdateForm({ hNo, status, note_admin }: { hNo: string; status: string; note_admin: string | null }) {
  const router = useRouter();
  const [st, setSt]   = useState(status);
  const [note, setNote] = useState(note_admin ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
      <label className="block space-y-1">
        <span className="text-xs font-medium">สถานะ</span>
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
      <Button type="submit" fullWidth disabled={pending}>{pending ? "กำลังบันทึก..." : "บันทึก"}</Button>
    </form>
  );
}
