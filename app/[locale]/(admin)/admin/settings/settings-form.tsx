"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminUpdateSettings } from "@/actions/admin/settings";

const inputCls = "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

type Props = {
  service_fee: number;
  juristic_discount_threshold: number;
  juristic_discount_pct: number;
  qc_fee_per_item: number;
  crate_fee_base: number;
  free_shipping_enabled: boolean;
  free_shipping_threshold: number | null;
};

export function SettingsForm(initial: Props) {
  const router = useRouter();
  const [serviceFee,    setServiceFee]    = useState(String(initial.service_fee));
  const [jurThresh,     setJurThresh]     = useState(String(initial.juristic_discount_threshold));
  const [jurPctPct,     setJurPctPct]     = useState((initial.juristic_discount_pct * 100).toFixed(2));   // shown as percent
  const [qcFee,         setQcFee]         = useState(String(initial.qc_fee_per_item));
  const [crateFee,      setCrateFee]      = useState(String(initial.crate_fee_base));
  const [freeShipEn,    setFreeShipEn]    = useState(initial.free_shipping_enabled);
  const [freeShipMin,   setFreeShipMin]   = useState(initial.free_shipping_threshold != null ? String(initial.free_shipping_threshold) : "");
  const [error, setError] = useState<string | null>(null);
  const [msg,   setMsg]   = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setMsg(null);

    const parsedJurPct = Number(jurPctPct);
    if (!Number.isFinite(parsedJurPct) || parsedJurPct < 0 || parsedJurPct > 100) {
      setError("ส่วนลดนิติบุคคล % ต้องอยู่ระหว่าง 0-100");
      return;
    }

    submitWith(false);
  }

  // V-A4: shared submit path that supports the "confirm unusual rate"
  // bypass. First call sends without the flag; if server rejects with
  // suspicious-change error, UI prompts user → submitWith(true) retries.
  function submitWith(confirmUnusualRate: boolean) {
    startTransition(async () => {
      const res = await adminUpdateSettings({
        service_fee:                 Number(serviceFee) || 0,
        juristic_discount_threshold: Number(jurThresh) || 0,
        juristic_discount_pct:       (Number(jurPctPct) || 0) / 100,
        qc_fee_per_item:             Number(qcFee) || 0,
        crate_fee_base:              Number(crateFee) || 0,
        free_shipping_enabled:       freeShipEn,
        free_shipping_threshold:     freeShipMin ? Number(freeShipMin) : null,
        ...(confirmUnusualRate ? { confirm_unusual_rate: true } : {}),
      });
      if (res.ok) {
        setMsg(confirmUnusualRate ? "บันทึกแล้ว (bypass สั่งพิสูจน์การเปลี่ยนค่า)" : "บันทึกแล้ว");
        router.refresh();
        setTimeout(() => setMsg(null), 4000);
      } else {
        // V-A4: detect the suspicious-change rejection → ask user to confirm
        if (res.error.includes("ตรวจพบการเปลี่ยนค่าผิดปกติ") && !confirmUnusualRate) {
          if (window.confirm(
            `${res.error}\n\nยืนยันว่าตั้งใจเปลี่ยนค่าตามนี้จริง?`,
          )) {
            submitWith(true);
          }
          return;
        }
        setError(res.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm space-y-4 max-w-2xl">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {msg   && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{msg}</div>}

      <Group title="ค่าธรรมเนียม">
        <Field label="ค่าบริการ Pacred ต่อออเดอร์ (บาท)" hint="default 50 บาท">
          <input type="number" min="0" step="0.01" value={serviceFee} onChange={(e) => setServiceFee(e.target.value)} className={inputCls} required />
        </Field>
        <Field label="ค่า QC ต่อชิ้น (บาท)">
          <input type="number" min="0" step="0.01" value={qcFee} onChange={(e) => setQcFee(e.target.value)} className={inputCls} required />
        </Field>
        <Field label="ค่าตีลังไม้ตั้งต้น (บาท)">
          <input type="number" min="0" step="0.01" value={crateFee} onChange={(e) => setCrateFee(e.target.value)} className={inputCls} required />
        </Field>
      </Group>

      <Group title="ส่วนลดนิติบุคคล">
        <Field label="ยอดขั้นต่ำที่ได้ส่วนลด (บาท)">
          <input type="number" min="0" step="0.01" value={jurThresh} onChange={(e) => setJurThresh(e.target.value)} className={inputCls} required />
        </Field>
        <Field label="% ส่วนลด" hint="เช่น 1 = 1% (เก็บใน DB เป็น 0.01)">
          <input type="number" min="0" max="100" step="0.01" value={jurPctPct} onChange={(e) => setJurPctPct(e.target.value)} className={inputCls} required />
        </Field>
      </Group>

      <Group title="ส่งฟรี">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={freeShipEn} onChange={(e) => setFreeShipEn(e.target.checked)} />
          <span>เปิดใช้งานโปรส่งฟรี (BKK + 5 จังหวัดปริมณฑล)</span>
        </label>
        <Field label="ยอดขั้นต่ำของส่งฟรี (บาท, ถ้าไม่มีเว้นว่าง)">
          <input type="number" min="0" step="0.01" value={freeShipMin} onChange={(e) => setFreeShipMin(e.target.value)} className={inputCls} placeholder="ไม่จำกัด" />
        </Field>
      </Group>

      <div className="flex justify-end pt-2 border-t border-border">
        <Button type="submit" disabled={pending}>
          {pending ? "กำลังบันทึก..." : "บันทึก"}
        </Button>
      </div>
    </form>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold text-foreground">{title}</h3>
      {children}
    </div>
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
