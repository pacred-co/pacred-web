"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminUpdateContainer } from "@/actions/admin/containers";

const inputCls = "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

type Props = {
  id: string;
  vendor_container_id: string | null;
  vessel:              string | null;
  carrier:             string | null;
  eta:                 string | null;
  note:                string | null;
};

export function ContainerEditForm(initial: Props) {
  const router = useRouter();
  const [vendor,  setVendor]  = useState(initial.vendor_container_id ?? "");
  const [vessel,  setVessel]  = useState(initial.vessel ?? "");
  const [carrier, setCarrier] = useState(initial.carrier ?? "");
  const [eta,     setEta]     = useState(initial.eta ?? "");
  const [note,    setNote]    = useState(initial.note ?? "");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setMsg(null);
    startTransition(async () => {
      const res = await adminUpdateContainer({
        id:                  initial.id,
        vendor_container_id: vendor,
        vessel,
        carrier,
        eta: eta || undefined,
        note,
      });
      if (res.ok) {
        setMsg("บันทึกแล้ว");
        router.refresh();
        setTimeout(() => setMsg(null), 3000);
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm space-y-3">
      <h3 className="font-bold text-sm">รายละเอียดตู้</h3>
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      {msg && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{msg}</div>}

      <Field label="เลขตู้จาก carrier (vendor_container_id)">
        <input value={vendor} onChange={(e) => setVendor(e.target.value)} className={inputCls} placeholder="MSCU-XXXX-1234" />
      </Field>
      <Field label="ชื่อเรือ/รถ (vessel)">
        <input value={vessel} onChange={(e) => setVessel(e.target.value)} className={inputCls} placeholder="MV PACRED EXPRESS" />
      </Field>
      <Field label="Carrier">
        <input value={carrier} onChange={(e) => setCarrier(e.target.value)} className={inputCls} placeholder="Maersk, COSCO, JMF, ..." />
      </Field>
      <Field label="ETA (วันที่คาดว่าถึงท่า)" hint="กดบันทึกแล้ว ETA จะอัปเดต — ลูกค้าจะเห็น 'อยู่ในตู้ X (ETA Y)' ใน /service-import">
        <input type="date" value={eta} onChange={(e) => setEta(e.target.value)} className={inputCls} />
      </Field>
      <Field label="หมายเหตุ">
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="ภายในสำหรับทีม ops" />
      </Field>

      <div className="flex justify-end pt-2 border-t border-border">
        <Button type="submit" disabled={pending}>{pending ? "กำลังบันทึก..." : "บันทึก"}</Button>
      </div>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-muted">{hint}</span>}
    </label>
  );
}
