"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminAddTrackingEvent, adminSetShipmentStatus } from "@/actions/admin/warehouse";

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

const EVENT_PRESETS = [
  { value: "scan_receive", label: "รับเข้าโกดัง", suggestStatus: "received_cn" as const },
  { value: "scan_pack",    label: "บรรจุลงตู้",   suggestStatus: "packed_cn" as const },
  { value: "scan_seal",    label: "ปิดตู้",       suggestStatus: "sealed_in_container" as const },
  { value: "scan_depart",  label: "ออกจากต้นทาง", suggestStatus: "in_transit" as const },
  { value: "scan_arrive",  label: "ถึงปลายทาง",   suggestStatus: "arrived_th" as const },
  { value: "scan_unload",  label: "ขนลงจากตู้",   suggestStatus: "unloaded" as const },
  { value: "scan_deliver", label: "ส่งให้ลูกค้า", suggestStatus: "delivered" as const },
];

/**
 * Scan-event recorder for an individual shipment inside a container.
 *
 * Workflow: admin selects shipment → picks preset event → optionally
 * adds location/note → submits → action appends event AND (if a status
 * mapping exists) flips the shipment.status forward.
 */
export function ScanEventForm({
  shipmentId,
  shipmentCode,
}: {
  shipmentId: string;
  shipmentCode: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [event, setEvent] = useState(EVENT_PRESETS[0].value);
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [autoStatus, setAutoStatus] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null); setErr(null);
    startTransition(async () => {
      // 1) Append event to timeline
      const res = await adminAddTrackingEvent({
        shipment_id: shipmentId,
        event,
        location:    location.trim() || undefined,
        note:        note.trim() || undefined,
      });
      if (!res.ok) { setErr(res.error); return; }

      // 2) If preset has a suggested status + admin opted in, flip status
      const preset = EVENT_PRESETS.find((p) => p.value === event);
      if (autoStatus && preset?.suggestStatus) {
        const sRes = await adminSetShipmentStatus({
          shipment_id: shipmentId,
          status:      preset.suggestStatus,
        });
        if (!sRes.ok) {
          setErr(`บันทึก scan แล้วแต่เปลี่ยนสถานะไม่สำเร็จ: ${sRes.error}`);
          return;
        }
      }

      setMsg(`บันทึก scan สำเร็จ${autoStatus && preset?.suggestStatus ? " + เปลี่ยนสถานะ" : ""}`);
      setLocation("");
      setNote("");
      router.refresh();
      setTimeout(() => setMsg(null), 4000);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2 border-t border-border pt-3 mt-2">
      {msg && <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700">{msg}</div>}
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}
      <p className="text-xs font-medium text-muted">บันทึก scan สำหรับ <span className="font-mono">{shipmentCode}</span></p>
      <div className="grid sm:grid-cols-3 gap-2">
        <select
          value={event}
          onChange={(e) => setEvent(e.target.value)}
          className={inputCls + " sm:col-span-1"}
          disabled={pending}
        >
          {EVENT_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className={inputCls + " sm:col-span-1"}
          placeholder="สถานที่ (optional)"
          disabled={pending}
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={inputCls + " sm:col-span-1"}
          placeholder="หมายเหตุ (optional)"
          disabled={pending}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={autoStatus}
            onChange={(e) => setAutoStatus(e.target.checked)}
            disabled={pending}
            className="size-4 cursor-pointer accent-primary-500"
          />
          เปลี่ยนสถานะ shipment อัตโนมัติตาม event
        </label>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "กำลังบันทึก..." : "📍 บันทึก scan"}
        </Button>
      </div>
    </form>
  );
}
