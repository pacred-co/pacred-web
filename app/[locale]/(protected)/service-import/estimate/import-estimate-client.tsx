"use client";

/**
 * Customer import price ESTIMATOR (owner 2026-06-04 — "เพิ่มให้เลือก ทางรถ/เรือ/แอร์
 * + ตีลัง · ราคาควรเปลี่ยน"). Live recalc as the customer types dimensions / picks
 * a transport mode / toggles crate. Calls the customer-safe action
 * getCustomerImportEstimate (which reuses the verified rate engine + strips all
 * internal margin/floor/tier data). This is GUIDANCE — the real price is computed
 * by the warehouse after the goods are measured (stated clearly in the UI).
 *
 * Pacred Tailwind design (AGENTS.md §0a). Mobile-first.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { Truck, Ship, Plane, Package, Calculator, Sparkles } from "lucide-react";
import {
  getCustomerImportEstimate,
  type CustomerEstimateMode,
} from "@/actions/forwarder-quote";

const WAREHOUSES = [
  { id: "1", label: "กวางโจว (Guangzhou)" },
  { id: "2", label: "อี้อู (Yiwu)" },
] as const;

const PRODUCT_TYPES = [
  { id: "1", label: "ทั่วไป" },
  { id: "2", label: "มอก." },
  { id: "3", label: "อย." },
  { id: "4", label: "พิเศษ" },
] as const;

const BASES = [
  { id: "auto", label: "อัตโนมัติ (ราคาสูงสุด)" },
  { id: "kg", label: "คิดตามน้ำหนัก (กก.)" },
  { id: "cbm", label: "คิดตามปริมาตร (คิว)" },
] as const;

const MODE_ICON: Record<string, typeof Truck> = { "1": Truck, "2": Ship, "3": Plane };

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ImportEstimateClient() {
  const [warehouse, setWarehouse] = useState<"1" | "2">("1");
  const [productType, setProductType] = useState<"1" | "2" | "3" | "4">("1");
  const [basis, setBasis] = useState<"auto" | "kg" | "cbm">("auto");
  // Dimensions: either W×L×H (cm) → auto CBM, or direct CBM.
  const [w, setW] = useState("");
  const [l, setL] = useState("");
  const [h, setH] = useState("");
  const [directCbm, setDirectCbm] = useState("");
  const [weight, setWeight] = useState("");
  const [crate, setCrate] = useState(false);
  const [crateThb, setCrateThb] = useState("300");

  const [pending, startTransition] = useTransition();
  const [modes, setModes] = useState<CustomerEstimateMode[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Derived CBM: prefer direct CBM, else from W×L×H (cm³ → m³).
  const cbm = useMemo(() => {
    const dc = parseFloat(directCbm);
    if (Number.isFinite(dc) && dc > 0) return dc;
    const W = parseFloat(w), L = parseFloat(l), H = parseFloat(h);
    if (Number.isFinite(W) && Number.isFinite(L) && Number.isFinite(H) && W > 0 && L > 0 && H > 0) {
      return Math.round((W * L * H) / 1_000_000 * 1000) / 1000;
    }
    return 0;
  }, [w, l, h, directCbm]);

  const weightKg = useMemo(() => {
    const x = parseFloat(weight);
    return Number.isFinite(x) && x > 0 ? x : 0;
  }, [weight]);

  // Live recalc — debounced — whenever any pricing input changes. ALL
  // setState lives inside the (deferred) timeout callback — never synchronous
  // in the effect body (react-hooks: avoids the cascading-render error).
  useEffect(() => {
    const t = setTimeout(() => {
      if (weightKg <= 0 && cbm <= 0) {
        setModes(null);
        setError(null);
        return;
      }
      startTransition(async () => {
        const res = await getCustomerImportEstimate({
          warehouse,
          productType,
          basis,
          weightKg,
          volumeCbm: cbm,
          crate,
          crateThb: crate ? (parseFloat(crateThb) || 0) : 0,
        });
        if (!res.ok) { setError(res.error); setModes(null); return; }
        setError(null);
        setModes(res.modes);
      });
    }, 400);
    return () => clearTimeout(t);
  }, [warehouse, productType, basis, weightKg, cbm, crate, crateThb]);

  const inputCls = "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100";
  const labelCls = "mb-1 block text-xs font-semibold text-muted";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* ── Inputs ── */}
      <div className="rounded-2xl border border-border bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>โกดังต้นทาง</label>
            <select className={inputCls} value={warehouse} onChange={(e) => setWarehouse(e.target.value as "1" | "2")}>
              {WAREHOUSES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>ประเภทสินค้า</label>
            <select className={inputCls} value={productType} onChange={(e) => setProductType(e.target.value as "1"|"2"|"3"|"4")}>
              {PRODUCT_TYPES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls}>น้ำหนักรวม (กก.)</label>
          <input className={inputCls} inputMode="decimal" placeholder="เช่น 25" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </div>

        <div>
          <label className={labelCls}>ขนาดพัสดุ (ซม.) — กว้าง × ยาว × สูง → คำนวณคิวอัตโนมัติ</label>
          <div className="grid grid-cols-3 gap-2">
            <input className={inputCls} inputMode="decimal" placeholder="กว้าง" value={w} onChange={(e) => setW(e.target.value)} />
            <input className={inputCls} inputMode="decimal" placeholder="ยาว" value={l} onChange={(e) => setL(e.target.value)} />
            <input className={inputCls} inputMode="decimal" placeholder="สูง" value={h} onChange={(e) => setH(e.target.value)} />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-muted">หรือกรอกคิวตรงๆ:</span>
            <input className={`${inputCls} max-w-[120px]`} inputMode="decimal" placeholder="คิว (CBM)" value={directCbm} onChange={(e) => setDirectCbm(e.target.value)} />
            {cbm > 0 && <span className="text-xs font-bold text-primary-600">= {cbm} คิว</span>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>วิธีคิดราคา</label>
            <select className={inputCls} value={basis} onChange={(e) => setBasis(e.target.value as "auto"|"kg"|"cbm")}>
              {BASES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>ตีลังไม้</label>
            <div className="flex items-center gap-2 pt-1.5">
              <button
                type="button"
                onClick={() => setCrate((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                  crate ? "border-primary-500 bg-primary-50 text-primary-700" : "border-border bg-white text-muted"
                }`}
              >
                <Package className="h-3.5 w-3.5" /> {crate ? "ตีลังไม้" : "ไม่ตีลัง"}
              </button>
              {crate && (
                <input className={`${inputCls} max-w-[100px] py-1.5`} inputMode="decimal" value={crateThb} onChange={(e) => setCrateThb(e.target.value)} aria-label="ค่าตีลัง" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Result ── */}
      <div className="rounded-2xl border border-border bg-gradient-to-br from-rose-50/40 via-white to-white p-4 shadow-sm">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-foreground">
          <Calculator className="h-4 w-4 text-primary-600" /> ราคาประเมินขนส่งจีน→ไทย
        </h3>
        <p className="mb-3 text-[11px] text-muted">
          เปลี่ยนตัวเลือก ราคาจะคำนวณใหม่อัตโนมัติ · <b>เป็นราคาประเมินเท่านั้น</b> — ราคาจริงคำนวณหลังชั่ง/วัดจริงที่โกดัง
        </p>

        {weightKg <= 0 && cbm <= 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface/40 px-4 py-8 text-center text-sm text-muted">
            กรอกน้ำหนัก หรือ ขนาดพัสดุ เพื่อดูราคาประเมิน
          </div>
        ) : error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div>
        ) : (
          <div className={`space-y-2 transition-opacity ${pending ? "opacity-50" : ""}`}>
            {(modes ?? []).map((m) => {
              const Icon = MODE_ICON[m.transport] ?? Truck;
              const isCheapest = modes != null && !m.comingSoon && m.hasRate &&
                m.grandTotal === Math.min(...modes.filter((x) => x.hasRate && !x.comingSoon).map((x) => x.grandTotal));
              return (
                <div key={m.transport} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                  m.comingSoon ? "border-border bg-surface/30 opacity-60"
                  : isCheapest ? "border-emerald-300 bg-emerald-50/50" : "border-border bg-white"
                }`}>
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                    <Icon className="h-4.5 w-4.5" strokeWidth={2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-foreground">{m.label}</span>
                      {m.comingSoon && <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-bold text-neutral-600">เร็วๆ นี้</span>}
                      {isCheapest && <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700"><Sparkles className="h-2.5 w-2.5" />คุ้มสุด</span>}
                    </div>
                    {!m.comingSoon && m.hasRate ? (
                      <div className="text-[11px] text-muted">
                        เรท {fmt(m.unitRate)}/{m.basisUsed === "kg" ? "กก." : "คิว"} × {fmt(m.billableValue)} {m.basisUsed === "kg" ? "กก." : "คิว"}
                        {m.crateThb > 0 ? ` + ตีลัง ${fmt(m.crateThb)}` : ""}
                      </div>
                    ) : m.comingSoon ? (
                      <div className="text-[11px] text-muted">ยังไม่เปิดให้บริการ</div>
                    ) : (
                      <div className="text-[11px] text-amber-700">ยังไม่มีเรทสำหรับเส้นทางนี้ — สอบถามทีมงาน</div>
                    )}
                  </div>
                  {!m.comingSoon && m.hasRate && (
                    <div className="text-right">
                      <div className="text-base font-black text-primary-600">฿{fmt(m.grandTotal)}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
