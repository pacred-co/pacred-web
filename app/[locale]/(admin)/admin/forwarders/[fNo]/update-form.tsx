"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminUpdateForwarder, adminMarkForwarderPaid } from "@/actions/admin/forwarders";
import { confirm, prompt } from "@/components/ui/confirm";

const inputCls = "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

type Props = {
  fNo: string;
  status: string;
  totalPrice: number;       // for the mark-paid panel
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

  // T-P1 mirror: explicit "mark paid" — debits wallet + flips status atomically
  function markPaid(allowOverdraw: boolean) {
    setMsg(null); setError(null);
    startTransition(async () => {
      const res = await adminMarkForwarderPaid({
        f_no:           p.fNo,
        allow_overdraw: allowOverdraw,
      });
      if (res.ok) {
        setStatus("shipped_china");
        setMsg(
          res.data?.already_paid
            ? "ฝากนำเข้านี้ชำระไปแล้ว — เปลี่ยนสถานะให้เรียบร้อย"
            : `ชำระสำเร็จ — หัก wallet ลูกค้า ฿${p.totalPrice.toLocaleString()} แล้ว ลูกค้าได้รับการแจ้งเตือน`,
        );
        router.refresh();
        setTimeout(() => setMsg(null), 5000);
      } else setError(res.error);
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null); setError(null);

    // V-A2: detect rollback against the original prop status (DB truth at
    // page load). If rollback, prompt for reason before submit.
    let rollbackReason: string | undefined = undefined;
    if (isRollbackAttempt(p.status, status)) {
      const r = await prompt(
        `กำลังย้อนสถานะจาก "${p.status}" → "${status}".\nระบุเหตุผล (≥3 ตัว) — ลูกค้าจะเห็นเหตุผลในการแจ้งเตือน:`,
      );
      if (r == null) return;
      if (r.trim().length < 3) {
        setError("เหตุผลต้องอย่างน้อย 3 ตัวอักษร");
        return;
      }
      rollbackReason = r.trim();
    }

    startTransition(async () => {
      const res = await adminUpdateForwarder({
        f_no: p.fNo,
        status: status as Parameters<typeof adminUpdateForwarder>[0]["status"],
        tracking_chn: tChn,
        tracking_th:  tTh,
        cabinet_number: cabinet,
        partner_warehouse: (warehouse || undefined) as Parameters<typeof adminUpdateForwarder>[0]["partner_warehouse"],
        note_admin: note,
        rollback_reason: rollbackReason,
      });
      if (res.ok) {
        setMsg(rollbackReason
          ? "↩️ ย้อนสถานะ + บันทึกแล้ว — ลูกค้าได้รับแจ้งเตือนพร้อมเหตุผล"
          : "บันทึกแล้ว — ลูกค้าได้รับการแจ้งเตือนแล้ว");
        router.refresh();
        setTimeout(() => setMsg(null), 5000);
      } else {
        setError(res.error);
      }
    });
  }

  const STATUS_FLOW = [
    { value: "pending_payment",  label: "รอชำระเงิน" },
    { value: "shipped_china",    label: "ออกจากจีน" },
    { value: "in_transit",       label: "กลางทาง" },
    { value: "arrived_thailand", label: "เข้าโกดังไทย" },
    { value: "out_for_delivery", label: "จัดส่ง" },
    { value: "delivered",        label: "ส่งสำเร็จ" },
  ] as const;

  const currentIdx = STATUS_FLOW.findIndex((s) => s.value === status);
  const nextStatus = currentIdx >= 0 && currentIdx < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentIdx + 1] : null;

  // V-A2: detect if a status change goes backward in the lifecycle
  // (admin rolling back). Cancelled = its own path, not rollback.
  function isRollbackAttempt(from: string, to: string): boolean {
    if (from === to) return false;
    if (to === "cancelled" || from === "cancelled") return false;
    const fi = STATUS_FLOW.findIndex((s) => s.value === from);
    const ti = STATUS_FLOW.findIndex((s) => s.value === to);
    return fi >= 0 && ti >= 0 && ti < fi;
  }

  async function quickSet(value: string) {
    setMsg(null); setError(null);
    let rollbackReason: string | undefined = undefined;
    if (isRollbackAttempt(status, value)) {
      const r = await prompt(
        `กำลังย้อนสถานะจาก "${status}" → "${value}".\nระบุเหตุผล (≥3 ตัว) — ลูกค้าจะเห็นเหตุผลในการแจ้งเตือน:`,
      );
      if (r == null) return;             // user cancelled prompt
      if (r.trim().length < 3) {
        setError("เหตุผลต้องอย่างน้อย 3 ตัวอักษร");
        return;
      }
      rollbackReason = r.trim();
    }
    startTransition(async () => {
      const res = await adminUpdateForwarder({
        f_no: p.fNo,
        status: value as Parameters<typeof adminUpdateForwarder>[0]["status"],
        rollback_reason: rollbackReason,
      });
      if (res.ok) {
        setStatus(value);
        setMsg(rollbackReason
          ? `↩️ ย้อนสถานะแล้ว — ลูกค้าได้รับแจ้งเตือนพร้อมเหตุผล`
          : "อัพเดทสถานะแล้ว — ลูกค้าได้รับการแจ้งเตือน");
        router.refresh();
        setTimeout(() => setMsg(null), 5000);
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

      {/* T-P1 mirror: explicit "mark paid" panel — only shows when payment hasn't landed yet */}
      {status === "pending_payment" && (
        <div className="rounded-lg border border-primary-200 bg-primary-50/50 dark:bg-primary-950/20 p-3 space-y-2">
          <p className="text-xs font-medium">บันทึกการชำระเงิน</p>
          <p className="text-xs text-muted">
            ยอด ฿{p.totalPrice.toLocaleString()} — กดเพื่อหัก wallet ลูกค้า + เปลี่ยนสถานะเป็น &ldquo;ออกจากจีน&rdquo;
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                if (
                  confirm(
                    `ยืนยันหักเงิน ฿${p.totalPrice.toLocaleString()} จาก wallet ลูกค้า และเปลี่ยนสถานะเป็น “ออกจากจีน”?\nรายการนี้มีผลกับยอดเงินจริงของลูกค้า`,
                  )
                ) {
                  markPaid(false);
                }
              }}
              disabled={pending}
              className="rounded-lg bg-green-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-green-700 disabled:opacity-50"
            >
              💰 บันทึกชำระจาก wallet
            </button>
            <button
              type="button"
              onClick={async () => {
                if (await confirm("รับเงินสด/โอนตรงโดยไม่หัก wallet ใช่ไหม? (ใช้เมื่อลูกค้าโอนนอกระบบ)")) {
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

      {/* Quick workflow buttons */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted">เปลี่ยนสถานะด่วน</p>
        <div className="flex flex-wrap gap-2">
          {nextStatus && (
            <button type="button" onClick={() => quickSet(nextStatus.value)} disabled={pending}
              className="rounded-lg bg-primary-500 text-white px-3 py-1.5 text-xs font-medium hover:bg-primary-600 disabled:opacity-50">
              → {nextStatus.label}
            </button>
          )}
          {status !== "cancelled" && (
            <button type="button" onClick={() => quickSet("cancelled")} disabled={pending}
              className="rounded-lg border border-red-200 text-red-600 px-3 py-1.5 text-xs hover:bg-red-50 disabled:opacity-50">
              ❌ ยกเลิก
            </button>
          )}
        </div>
        <div className="flex gap-1 flex-wrap">
          {STATUS_FLOW.map((s, i) => (
            <span key={s.value} className={`text-[10px] px-2 py-0.5 rounded-full border ${
              s.value === status
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
