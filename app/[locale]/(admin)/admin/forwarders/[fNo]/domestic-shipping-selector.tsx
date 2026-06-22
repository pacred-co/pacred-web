"use client";

/**
 * <DomesticShippingSelector> — zone-aware in-Thailand delivery picker for the
 * forwarder billing UI (owner 2026-06-22: เหมาๆ in-zone · ต่างจังหวัด นอกเขต
 * บังคับเก็บปลายทาง · รับเอง). Options are computed SERVER-SIDE from the order's
 * delivery address (lib/forwarder/domestic-shipping) and passed in; the save
 * re-derives + validates them again (never trusts the client).
 *
 * confirm() runs BEFORE startTransition (the dialog-won't-open trap · 2026-06-22).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Truck, AlertTriangle, Check } from "lucide-react";
import { confirm } from "@/components/ui/confirm";
import { adminSetForwarderDomesticShipping } from "@/actions/admin/forwarder-domestic-ship";
import type { DomesticShipOption, DomesticZone } from "@/lib/forwarder/domestic-shipping";
import { DOMESTIC_ZONE_LABEL } from "@/lib/forwarder/domestic-shipping";

const ZONE_CHIP: Record<DomesticZone, string> = {
  maomao: "bg-emerald-100 text-emerald-700 border-emerald-300",
  upcountry: "bg-amber-100 text-amber-800 border-amber-300",
  self_pickup: "bg-slate-100 text-slate-700 border-slate-300",
};

function baht(n: number): string {
  return `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function DomesticShippingSelector({
  fId, zone, options, currentCarrier, addressText,
}: {
  fId: number;
  zone: DomesticZone;
  options: DomesticShipOption[];
  currentCarrier: string | null;
  addressText: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [picked, setPicked] = useState<string>(
    options.find((o) => o.carrier === currentCarrier)?.carrier ?? options[0]?.carrier ?? "",
  );
  const [manualCost, setManualCost] = useState<string>("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const sel = options.find((o) => o.carrier === picked);

  async function onSave() {
    setMsg(null);
    if (!sel) return;
    const cost = sel.manual ? parseFloat(manualCost) || 0 : sel.cost;
    if (sel.manual && cost <= 0 && sel.carrier !== "PCS") {
      setMsg({ ok: false, text: "กรอกค่าส่งสำหรับขนส่งนี้ก่อน (มากกว่า 0)" });
      return;
    }
    const codNote = sel.forceCod ? "\n\n⚠️ ต่างจังหวัด/นอกเขต — บังคับเก็บเงินปลายทาง (COD)" : "";
    const ok = await confirm(
      `บันทึกการจัดส่งในไทยของออเดอร์ #${fId}?\n\n` +
        `ขนส่ง: ${sel.label}\nค่าส่ง: ${baht(cost)}\nวิธีจ่าย: ${sel.forceCod || sel.payMethod === "2" ? "ปลายทาง (COD)" : "ต้นทาง"}${codNote}`,
      { title: "ยืนยันการจัดส่งในไทย", confirmLabel: "บันทึก", cancelLabel: "ยกเลิก" },
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await adminSetForwarderDomesticShipping({
        fId, carrier: sel.carrier, manualCost: sel.manual ? cost : undefined,
      });
      if (!res.ok) { setMsg({ ok: false, text: res.error ?? "บันทึกไม่สำเร็จ" }); return; }
      setMsg({ ok: true, text: `✓ บันทึกแล้ว — ${sel.label} · ${baht(res.data?.cost ?? cost)} · ${res.data?.payMethod === "2" ? "เก็บปลายทาง" : "ต้นทาง"}` });
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 sm:p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Truck className="h-5 w-5 text-primary-600" /> จัดส่งในไทย
        </h2>
        <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${ZONE_CHIP[zone]}`}>
          {DOMESTIC_ZONE_LABEL[zone]}
        </span>
      </div>
      <p className="text-[11px] text-muted">ปลายทาง: {addressText || "—"}</p>

      {zone === "upcountry" && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:bg-amber-950/30">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>อยู่นอกเขตเหมาๆ — ส่งผ่านขนส่งเอกชน คิดตามน้ำหนัก และ <strong>บังคับเก็บเงินปลายทาง (COD)</strong></span>
        </div>
      )}

      <div className="space-y-1.5">
        {options.map((o) => (
          <label
            key={o.carrier}
            className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
              picked === o.carrier ? "border-primary-400 bg-primary-50/50 dark:bg-primary-950/20" : "border-border hover:bg-surface-alt/40"
            }`}
          >
            <input type="radio" name="domestic-ship" value={o.carrier} checked={picked === o.carrier}
              onChange={() => { setPicked(o.carrier); setMsg(null); }} disabled={pending}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-foreground">{o.label}</span>
                {(o.forceCod || o.payMethod === "2") && (
                  <span className="rounded bg-rose-100 text-rose-700 border border-rose-300 px-1.5 py-0.5 text-[10px] font-bold">COD ปลายทาง</span>
                )}
                {o.carrier === currentCarrier && (
                  <span className="rounded bg-blue-100 text-blue-700 px-1.5 py-0.5 text-[10px]">ปัจจุบัน</span>
                )}
              </div>
              {o.note && <p className="text-[11px] text-muted">{o.note}</p>}
            </div>
            <div className="text-right shrink-0">
              {o.manual ? (
                <span className="text-[11px] text-muted">กรอกเอง</span>
              ) : (
                <span className="text-sm font-semibold text-foreground font-mono tabular-nums">{baht(o.cost)}</span>
              )}
            </div>
          </label>
        ))}
      </div>

      {sel?.manual && sel.carrier !== "PCS" && (
        <label className="block">
          <span className="block text-[11px] text-muted mb-0.5">ค่าส่ง (฿) — {sel.label}</span>
          <input type="number" min={0} step="0.01" value={manualCost} onChange={(e) => setManualCost(e.target.value)} disabled={pending}
            placeholder="0.00" className="w-32 rounded-md border border-border px-2 py-1 text-sm font-mono tabular-nums text-right outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200" />
        </label>
      )}

      <div className="flex items-center gap-2">
        <button type="button" onClick={onSave} disabled={pending || !sel}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
          <Check className="h-4 w-4" /> {pending ? "กำลังบันทึก..." : "บันทึกการจัดส่ง"}
        </button>
        {msg && (
          <span className={`text-[12px] ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</span>
        )}
      </div>
    </section>
  );
}
