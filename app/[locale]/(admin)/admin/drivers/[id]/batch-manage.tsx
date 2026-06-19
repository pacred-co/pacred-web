"use client";

/**
 * Batch-level edit controls (ops/super/warehouse) — the full "แก้ไข / อัพเดท /
 * เริ่มใหม่ / แก้ได้ทุกจุด" toolbar the owner asked for (2026-06-19).
 *
 * Replaces the delete-only <BatchActions>. Exposes, per batch state:
 *   - OPEN (fdstatus='1'): ขยายเวลา (updateBatchEndtime) · เปลี่ยนคนขับ
 *     (reassignBatchDriver, only before any delivery) · ยกเลิกรอบ
 *     (deleteDriverBatch, only before any delivery)
 *   - CLOSED (fdstatus='2'/'3'): เริ่มรอบใหม่ (reopenDriverBatch)
 *
 * Every mutate goes through a confirm dialog (§0f) and refreshes the page on
 * success so the header/badges re-render from the DB (no stale UI).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Clock, UserCog, RotateCcw, Save, X } from "lucide-react";
import { confirm } from "@/components/ui/confirm";
import {
  deleteDriverBatch,
  updateBatchEndtime,
  reassignBatchDriver,
  reopenDriverBatch,
  removeItemFromBatch,
} from "@/actions/admin/driver-batches";

type Driver = { code: string; name: string };
type Hours = 17 | 24 | 30;
type ActionResult = { ok: boolean; error?: string };

export function BatchManage({
  batchId,
  fdstatus,
  deliveredCount,
  currentDriverCode,
  drivers,
}: {
  batchId: number;
  fdstatus: string;
  deliveredCount: number;
  currentDriverCode: string | null;
  drivers: Driver[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [panel, setPanel] = useState<null | "time" | "driver">(null);
  const [hours, setHours] = useState<Hours>(17);
  const [driverCode, setDriverCode] = useState<string>("");

  function run(fn: () => Promise<ActionResult>) {
    setErr(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setPanel(null);
        router.refresh();
      } else {
        setErr(res.error ?? "เกิดข้อผิดพลาด");
      }
    });
  }

  const open = fdstatus === "1";
  const closed = fdstatus === "2" || fdstatus === "3";
  const canMutateOpen = open && deliveredCount === 0;

  const pill = "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium disabled:opacity-60";

  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      {open && (
        <button
          type="button"
          onClick={() => { setErr(null); setPanel(panel === "time" ? null : "time"); }}
          disabled={pending}
          className={`${pill} bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100`}
        >
          <Clock className="h-3.5 w-3.5" /> ขยายเวลา
        </button>
      )}

      {canMutateOpen && drivers.length > 0 && (
        <button
          type="button"
          onClick={() => { setErr(null); setPanel(panel === "driver" ? null : "driver"); }}
          disabled={pending}
          className={`${pill} bg-violet-50 border border-violet-200 text-violet-700 hover:bg-violet-100`}
        >
          <UserCog className="h-3.5 w-3.5" /> เปลี่ยนคนขับ
        </button>
      )}

      {closed && (
        <button
          type="button"
          onClick={async () => {
            const ok = await confirm(`เริ่มรอบ #${batchId} ใหม่? — รายการที่ส่งไม่สำเร็จจะถูกรีเซ็ตให้ส่งอีกครั้ง`);
            if (ok) run(() => reopenDriverBatch({ batchId, endTimeHours: 17 }));
          }}
          disabled={pending}
          className={`${pill} bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100`}
        >
          <RotateCcw className="h-3.5 w-3.5" /> {pending ? "กำลังเปิด..." : "เริ่มรอบใหม่"}
        </button>
      )}

      {canMutateOpen && (
        <button
          type="button"
          onClick={async () => {
            const ok = await confirm(`ลบรอบ #${batchId} นี้? — ใช้ได้เฉพาะรอบที่ยังไม่มีรายการส่งสำเร็จ`);
            if (ok) run(() => deleteDriverBatch({ batchId }));
          }}
          disabled={pending}
          className={`${pill} bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100`}
        >
          <Trash2 className="h-3.5 w-3.5" /> {pending ? "กำลังลบ..." : "ยกเลิกรอบ"}
        </button>
      )}

      {/* Inline panel — ขยายเวลา */}
      {panel === "time" && (
        <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50/60 px-2.5 py-1.5">
          <span className="text-xs text-sky-800">กำหนดส่งภายใน</span>
          <select
            value={hours}
            onChange={(e) => setHours(Number(e.target.value) as Hours)}
            className="rounded-md border border-sky-300 bg-white px-2 py-1 text-xs"
          >
            <option value={17}>17 ชม.</option>
            <option value={24}>24 ชม.</option>
            <option value={30}>30 ชม.</option>
          </select>
          <button
            type="button"
            onClick={() => run(() => updateBatchEndtime({ batchId, endTimeHours: hours }))}
            disabled={pending}
            className={`${pill} bg-sky-600 text-white hover:bg-sky-700`}
          >
            <Save className="h-3.5 w-3.5" /> {pending ? "..." : "บันทึก"}
          </button>
          <button type="button" onClick={() => setPanel(null)} className="text-sky-700 hover:text-sky-900">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Inline panel — เปลี่ยนคนขับ */}
      {panel === "driver" && (
        <div className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50/60 px-2.5 py-1.5">
          <span className="text-xs text-violet-800">ย้ายไปคนขับ</span>
          <select
            value={driverCode}
            onChange={(e) => setDriverCode(e.target.value)}
            className="rounded-md border border-violet-300 bg-white px-2 py-1 text-xs max-w-[200px]"
          >
            <option value="">— เลือกคนขับ —</option>
            {drivers
              .filter((d) => d.code.toLowerCase() !== (currentDriverCode ?? "").toLowerCase())
              .map((d) => (
                <option key={d.code} value={d.code}>{d.name} ({d.code})</option>
              ))}
          </select>
          <button
            type="button"
            disabled={pending || !driverCode}
            onClick={async () => {
              const ok = await confirm(`ย้ายรอบ #${batchId} ไปคนขับ ${driverCode}?`);
              if (ok) run(() => reassignBatchDriver({ batchId, driverMemberCode: driverCode }));
            }}
            className={`${pill} bg-violet-600 text-white hover:bg-violet-700`}
          >
            <UserCog className="h-3.5 w-3.5" /> {pending ? "..." : "ย้ายงาน"}
          </button>
          <button type="button" onClick={() => setPanel(null)} className="text-violet-700 hover:text-violet-900">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {err && <span className="text-xs text-rose-700">{err}</span>}
    </div>
  );
}

/**
 * Per-stop "ลบออกจากรอบ" button — drops one forwarder row from the run.
 * Hidden once that stop is delivered. ops/super/warehouse only (rendered
 * conditionally by the parent).
 */
export function RemoveItemButton({
  itemId,
  fNo,
  delivered,
}: {
  itemId: number;
  fNo: string;
  delivered: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (delivered) return null;

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          const ok = await confirm(`ลบ ${fNo} ออกจากรอบนี้? — รายการจะกลับไปสถานะเตรียมส่ง พร้อมจัดรอบใหม่`);
          if (!ok) return;
          setErr(null);
          startTransition(async () => {
            const res = await removeItemFromBatch({ itemId });
            if (res.ok) router.refresh();
            else setErr(res.error ?? "ลบไม่สำเร็จ");
          });
        }}
        className="inline-flex items-center gap-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-600 px-1.5 py-0.5 text-[10px] hover:bg-rose-100 disabled:opacity-60"
        title="ลบรายการนี้ออกจากรอบจัดส่ง"
      >
        <Trash2 className="h-3 w-3" /> {pending ? "..." : "ลบออก"}
      </button>
      {err && <span className="text-[10px] text-rose-700">{err}</span>}
    </span>
  );
}
