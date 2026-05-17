"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminCreateContainerCost } from "@/actions/admin/container-costs";

/**
 * U2-2: Create-rate-card form. Adds a new container_costs row.
 */

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ContainerCostForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [carrier, setCarrier]     = useState("");
  const [mode, setMode]           = useState<"truck" | "sea" | "air">("truck");
  const [origin, setOrigin]       = useState("");
  const [destination, setDest]    = useState("");
  const [containerType, setCType] = useState("");
  const [rateCbm, setRateCbm]     = useState("");
  const [rateKg, setRateKg]       = useState("");
  const [minCharge, setMinCharge] = useState("");
  const [fuelPct, setFuelPct]     = useState("");
  const [from, setFrom]           = useState(todayIso());
  const [to, setTo]               = useState("");
  const [source, setSource]       = useState<"manual" | "momo_api" | "partner_email">("manual");
  const [note, setNote]           = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null); setErr(null);

    const cbmN = rateCbm.trim() === "" ? null : Number(rateCbm);
    const kgN  = rateKg.trim()  === "" ? null : Number(rateKg);
    if (cbmN == null && kgN == null) {
      setErr("ระบุ rate / CBM หรือ rate / kg อย่างน้อย 1 อย่าง"); return;
    }
    if (cbmN != null && !Number.isFinite(cbmN)) { setErr("rate / CBM ไม่ใช่ตัวเลข"); return; }
    if (kgN  != null && !Number.isFinite(kgN))  { setErr("rate / kg ไม่ใช่ตัวเลข"); return; }

    const minN = minCharge.trim() === "" ? null : Number(minCharge);
    const fuelN = fuelPct.trim()  === "" ? null : Number(fuelPct);

    startTransition(async () => {
      const res = await adminCreateContainerCost({
        carrier_name:        carrier.trim(),
        transport_mode:      mode,
        origin:              origin.trim(),
        destination:         destination.trim(),
        container_type:      containerType.trim(),
        rate_per_cbm_thb:    cbmN,
        rate_per_kg_thb:     kgN,
        minimum_charge_thb:  minN,
        fuel_surcharge_pct:  fuelN,
        effective_from:      from,
        effective_to:        to || null,
        source,
        note:                note.trim() || undefined,
      });
      if (res.ok) {
        setMsg(`เพิ่ม rate card สำหรับ ${carrier} แล้ว`);
        setCarrier(""); setOrigin(""); setDest(""); setCType("");
        setRateCbm(""); setRateKg(""); setMinCharge(""); setFuelPct("");
        setNote(""); setTo("");
        router.refresh();
        setTimeout(() => setMsg(null), 4000);
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
      <h3 className="font-bold text-sm">+ เพิ่ม rate card</h3>
      <p className="text-[11px] text-muted">U2-2 · super + accounting</p>

      {msg && <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700">{msg}</div>}
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}

      <label className="block space-y-1">
        <span className="text-xs font-medium">carrier</span>
        <input
          value={carrier}
          onChange={(e) => setCarrier(e.target.value)}
          className={inputCls + " font-mono"}
          placeholder="MOMO / COSCO / TTP"
          required
          disabled={pending}
        />
      </label>

      <div className="grid grid-cols-3 gap-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium">mode</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as "truck" | "sea" | "air")}
            className={inputCls}
            disabled={pending}
            required
          >
            <option value="truck">🚚 รถ</option>
            <option value="sea">🚢 เรือ</option>
            <option value="air">✈️ air</option>
          </select>
        </label>
        <label className="block space-y-1 col-span-2">
          <span className="text-xs font-medium">container_type</span>
          <input
            value={containerType}
            onChange={(e) => setCType(e.target.value)}
            className={inputCls + " font-mono"}
            placeholder="40HQ / 20GP / truck-6w"
            required
            disabled={pending}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium">origin</span>
          <input
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            className={inputCls + " font-mono"}
            placeholder="CN-GZ"
            required
            disabled={pending}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium">destination</span>
          <input
            value={destination}
            onChange={(e) => setDest(e.target.value)}
            className={inputCls + " font-mono"}
            placeholder="TH-BKK"
            required
            disabled={pending}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium">rate / CBM (฿)</span>
          <input
            type="number" step="0.01" min="0"
            value={rateCbm}
            onChange={(e) => setRateCbm(e.target.value)}
            className={inputCls + " font-mono"}
            placeholder="ว่างได้ถ้าไม่มี"
            disabled={pending}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium">rate / kg (฿)</span>
          <input
            type="number" step="0.01" min="0"
            value={rateKg}
            onChange={(e) => setRateKg(e.target.value)}
            className={inputCls + " font-mono"}
            placeholder="ว่างได้ถ้าไม่มี"
            disabled={pending}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium">ขั้นต่ำ (฿)</span>
          <input
            type="number" step="0.01" min="0"
            value={minCharge}
            onChange={(e) => setMinCharge(e.target.value)}
            className={inputCls + " font-mono"}
            disabled={pending}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium">fuel surcharge (%)</span>
          <input
            type="number" step="0.01" min="0"
            value={fuelPct}
            onChange={(e) => setFuelPct(e.target.value)}
            className={inputCls + " font-mono"}
            disabled={pending}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium">ใช้ตั้งแต่</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={inputCls}
            required
            disabled={pending}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium">ใช้ถึง (optional)</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={inputCls}
            disabled={pending}
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium">แหล่งข้อมูล</span>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as "manual" | "momo_api" | "partner_email")}
          className={inputCls}
          disabled={pending}
        >
          <option value="manual">manual (กรอกเอง)</option>
          <option value="momo_api">momo_api</option>
          <option value="partner_email">partner_email</option>
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium">หมายเหตุ (optional)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={inputCls + " min-h-[50px]"}
          placeholder="เช่น ราคาที่ MOMO ยืนยันใน email 18/4/2026"
          disabled={pending}
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-primary-500 text-white px-3 py-2 text-sm font-medium hover:bg-primary-600 disabled:opacity-50"
      >
        {pending ? "กำลังบันทึก..." : "บันทึก rate card"}
      </button>
    </form>
  );
}
