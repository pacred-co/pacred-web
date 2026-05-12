"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminCreateContainer, adminUpdateContainer } from "@/actions/admin/containers";

const inputCls = "w-full rounded-lg border border-border bg-white dark:bg-surface px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500/50";

export function CreateContainerForm() {
  const router = useRouter();
  const [vendor, setVendor]       = useState("");
  const [vessel, setVessel]       = useState("");
  const [carrier, setCarrier]     = useState("");
  const [origin, setOrigin]       = useState<"guangzhou"|"yiwu"|"other">("guangzhou");
  const [transport, setTransport] = useState<"truck"|"ship"|"air">("ship");
  const [eta, setEta]             = useState("");
  const [note, setNote]           = useState("");
  const [error, setError]         = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await adminCreateContainer({
        vendor_container_id: vendor || undefined,
        vessel: vessel || undefined,
        carrier: carrier || undefined,
        origin_warehouse: origin,
        transport_type: transport,
        eta: eta || undefined,
        note: note || undefined,
      });
      if (res.ok) {
        setVendor(""); setVessel(""); setCarrier(""); setEta(""); setNote("");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-2">
      <h3 className="font-bold text-sm">เพิ่มตู้คอนเทนเนอร์</h3>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</div>}
      <input value={vendor} onChange={(e) => setVendor(e.target.value)} className={inputCls} placeholder="เลขตู้จาก carrier (vendor_container_id)" />
      <input value={vessel} onChange={(e) => setVessel(e.target.value)} className={inputCls} placeholder="ชื่อเรือ/รถ (vessel)" />
      <input value={carrier} onChange={(e) => setCarrier(e.target.value)} className={inputCls} placeholder="carrier (Maersk, COSCO, JMF, ...)" />
      <select value={origin} onChange={(e) => setOrigin(e.target.value as "guangzhou"|"yiwu"|"other")} className={inputCls}>
        <option value="guangzhou">โกดังต้นทาง: กวางโจว</option>
        <option value="yiwu">โกดังต้นทาง: อี้อู</option>
        <option value="other">โกดังต้นทาง: อื่นๆ</option>
      </select>
      <select value={transport} onChange={(e) => setTransport(e.target.value as "truck"|"ship"|"air")} className={inputCls}>
        <option value="truck">🚚 รถ</option>
        <option value="ship">🚢 เรือ</option>
        <option value="air">✈️ อากาศ</option>
      </select>
      <input type="date" value={eta} onChange={(e) => setEta(e.target.value)} className={inputCls} placeholder="ETA" />
      <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="หมายเหตุ" />
      <Button type="submit" fullWidth disabled={pending}>{pending ? "..." : "เพิ่มตู้"}</Button>
    </form>
  );
}

export function StatusActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const nextStatuses: Record<string, Array<{ to: string; label: string }>> = {
    preparing:        [{ to: "sealed", label: "ปิดตู้" }, { to: "cancelled", label: "ยกเลิก" }],
    sealed:           [{ to: "in_transit", label: "ออกเดินทาง" }],
    in_transit:       [{ to: "arrived_port", label: "ถึงท่า" }],
    arrived_port:     [{ to: "cleared_customs", label: "ผ่านศุลฯ" }],
    cleared_customs:  [{ to: "delivered", label: "ส่งมอบ" }],
    delivered:        [],
    cancelled:        [],
  };
  const options = nextStatuses[status] ?? [];

  function go(to: string) {
    startTransition(async () => {
      const res = await adminUpdateContainer({ id, status: to as "preparing"|"sealed"|"in_transit"|"arrived_port"|"cleared_customs"|"delivered"|"cancelled" });
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <Button key={o.to} size="sm" variant="outline" type="button" onClick={() => go(o.to)} disabled={pending}>
          {o.label}
        </Button>
      ))}
    </div>
  );
}
