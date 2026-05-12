"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminUpdateForwarder } from "@/actions/admin/forwarders";

const inputCls = "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

type Props = {
  fNo: string;
  status: string;
  tracking_chn: string | null;
  tracking_th: string | null;
  cabinet_number: string | null;
  partner_warehouse: string | null;
  note_admin: string | null;
};

export function AdminForwarderUpdateForm(p: Props) {
  const router = useRouter();
  const [status, setStatus]     = useState(p.status);
  const [tChn,   setTChn]       = useState(p.tracking_chn ?? "");
  const [tTh,    setTTh]        = useState(p.tracking_th ?? "");
  const [cabinet, setCabinet]   = useState(p.cabinet_number ?? "");
  const [warehouse, setWarehouse] = useState(p.partner_warehouse ?? "");
  const [note,   setNote]       = useState(p.note_admin ?? "");
  const [msg,    setMsg]        = useState<string | null>(null);
  const [error,  setError]      = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null); setError(null);
    startTransition(async () => {
      const res = await adminUpdateForwarder({
        f_no: p.fNo,
        status: status as Parameters<typeof adminUpdateForwarder>[0]["status"],
        tracking_chn: tChn,
        tracking_th:  tTh,
        cabinet_number: cabinet,
        partner_warehouse: (warehouse || undefined) as Parameters<typeof adminUpdateForwarder>[0]["partner_warehouse"],
        note_admin: note,
      });
      if (res.ok) {
        setMsg("บันทึกแล้ว — ลูกค้าได้รับการแจ้งเตือนแล้ว");
        router.refresh();
        setTimeout(() => setMsg(null), 4000);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-4">
      <h3 className="font-bold text-sm">อัพเดทสถานะ + เลข tracking</h3>

      {msg   && <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700">{msg}</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</div>}

      <label className="block space-y-1">
        <span className="text-xs font-medium">สถานะ</span>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
          <option value="pending_payment">รอชำระเงิน</option>
          <option value="shipped_china">ออกจากจีน</option>
          <option value="in_transit">ขนส่งกลางทาง</option>
          <option value="arrived_thailand">เข้าโกดังไทย</option>
          <option value="out_for_delivery">กำลังจัดส่ง</option>
          <option value="delivered">ส่งสำเร็จ</option>
          <option value="cancelled">ยกเลิก</option>
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium">โกดังพาร์ทเนอร์ (จีน)</span>
        <select value={warehouse} onChange={(e) => setWarehouse(e.target.value)} className={inputCls}>
          <option value="">—</option>
          <option value="sang">แสง</option>
          <option value="ctt">CTT</option>
          <option value="mk">MK</option>
          <option value="mx">MX</option>
          <option value="jmf">JMF</option>
        </select>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-xs font-medium">Tracking จีน</span>
          <input value={tChn} onChange={(e) => setTChn(e.target.value)} className={inputCls} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium">Tracking ไทย</span>
          <input value={tTh} onChange={(e) => setTTh(e.target.value)} className={inputCls} />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium">เลขตู้คอนเทนเนอร์</span>
        <input value={cabinet} onChange={(e) => setCabinet(e.target.value)} className={inputCls} />
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium">หมายเหตุ (admin)</span>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
      </label>

      <Button type="submit" fullWidth disabled={pending}>
        {pending ? "กำลังบันทึก..." : "บันทึก"}
      </Button>
    </form>
  );
}
