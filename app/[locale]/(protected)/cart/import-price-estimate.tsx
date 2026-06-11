"use client";

/**
 * <ImportPriceEstimate> — Workstream A (cargo-acct-epic 2026-06-11 · A-pricing-cart.md).
 *
 * The owner's perceived bug: on /cart the customer toggles ทางรถ(EK)/ทางเรือ(SEA)
 * and ตีลังไม้/ไม่ตีลัง but the price never moves → they guess the transport cost
 * and pre-pay the wrong amount. The legacy cart never priced transport at cart time
 * either (admin sets the binding price after the warehouse weighs the goods —
 * faithful), so this island does NOT change the charge. It SURFACES the existing,
 * verified rate engine as a LIVE ADVISORY estimate right next to the toggles.
 *
 * REUSE, don't rebuild: it calls the customer-safe Server Action
 * `getCustomerImportEstimate` (actions/forwarder-quote.ts → resolveForwarderRate →
 * the live tb_rate_* cards). The pricing math runs server-side (rates are internal);
 * this client only owns the inputs + the 400ms debounce + render — mirroring the
 * working /service-import/estimate page (import-estimate-client.tsx L83-106) and the
 * legacy AJAX-on-change recompute (apiCalPrice.php / update.php calPriceKG).
 *
 * It reads the รถ/เรือ + ตีลัง choice from the EXISTING cart form radios
 * (input[name="hTransportType"] · input[name="crate"]) via change listeners — so it
 * reacts to the very toggles the customer touches, with no duplicate selectors.
 * Weight/CBM are collected here because the cart form has none (the customer often
 * doesn't know the weight yet → honest empty-state, never a fake ฿0).
 *
 * Text is inline Thai (cargo surfaces are Thai-first). Pacred Tailwind, mobile-first.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { Truck, Ship, Plane, Calculator, Info } from "lucide-react";
import {
  getCustomerImportEstimate,
  type CustomerEstimateMode,
} from "@/actions/forwarder-quote";

const MODE_ICON: Record<string, typeof Truck> = { "1": Truck, "2": Ship, "3": Plane };

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Read the currently-checked radio value for a given form-field name from the
 * enclosing document. Returns the fallback when nothing is checked yet.
 */
function checkedRadioValue(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const el = document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`);
  return el?.value ?? fallback;
}

export function ImportPriceEstimate() {
  // The customer's OWN inputs (the cart form has no weight/CBM).
  const [warehouse, setWarehouse] = useState<"1" | "2">("1");
  const [productType, setProductType] = useState<"1" | "2" | "3" | "4">("1");
  const [weight, setWeight] = useState("");
  const [directCbm, setDirectCbm] = useState("");
  const [w, setW] = useState("");
  const [l, setL] = useState("");
  const [h, setH] = useState("");

  // Mirrored from the existing cart radios (kept in sync by listeners below).
  // hTransportType: "1"=ทางรถ EK · "2"=ทางเรือ SEA. crate: "1"=ตีลัง · "2"=ไม่ตีลัง.
  const [transport, setTransport] = useState<"1" | "2">("2");
  const [crate, setCrate] = useState(false);
  // Advisory crate-fee default (฿300) — the binding crate fee is set by admin after
  // inspection; no per-customer input here (this is an estimate, not the charge).
  const [crateThb] = useState("300");

  const [pending, startTransition] = useTransition();
  const [modes, setModes] = useState<CustomerEstimateMode[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Bridge: subscribe to the existing cart form's transport/crate radios so the
  // estimate reacts to the toggles the customer actually touches. We attach to
  // the document (the radios live in the parent <form>, outside this subtree).
  useEffect(() => {
    function sync() {
      setTransport(checkedRadioValue("hTransportType", "2") === "1" ? "1" : "2");
      // crate radio: value "1" = ตีลังไม้ (on) · "2" = ไม่ตีลังไม้ (off).
      setCrate(checkedRadioValue("crate", "2") === "1");
    }
    sync(); // read initial checked state on mount
    function onChange(e: Event) {
      const target = e.target as HTMLElement | null;
      const name = target?.getAttribute?.("name");
      if (name === "hTransportType" || name === "crate") sync();
    }
    document.addEventListener("change", onChange);
    return () => document.removeEventListener("change", onChange);
  }, []);

  // Derived CBM: prefer direct CBM, else from W×L×H (cm³ → m³). Same as the
  // /service-import/estimate page so both surfaces agree.
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

  // Live recalc — debounced — whenever any pricing input or the bridged radios
  // change. All setState lives inside the deferred timeout (never synchronous in
  // the effect body — avoids the cascading-render warning, per the estimate page).
  useEffect(() => {
    const id = setTimeout(() => {
      if (weightKg <= 0 && cbm <= 0) {
        setModes(null);
        setError(null);
        return;
      }
      startTransition(async () => {
        const res = await getCustomerImportEstimate({
          warehouse,
          productType,
          basis: "auto", // legacy "ราคามากสุด" — bill by whichever is higher
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
    return () => clearTimeout(id);
    // `transport` is intentionally NOT a dep: the action returns ALL modes, so
    // flipping รถ/เรือ re-renders the highlighted mode via the `selected`
    // derivation below WITHOUT a redundant refetch. crate/crateThb DO refetch
    // (they change the returned per-mode totals).
  }, [warehouse, productType, weightKg, cbm, crate, crateThb]);

  // The mode that matches the customer's chosen transport radio (รถ/เรือ).
  const selected = modes?.find((m) => m.transport === transport) ?? null;
  const SelectedIcon = MODE_ICON[transport] ?? Ship;
  const hasDims = weightKg > 0 || cbm > 0;

  const inputCls =
    "w-full rounded-lg border border-border bg-white px-3 py-2 text-base focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100";
  const labelCls = "mb-1 block text-xs font-semibold text-muted";

  return (
    <div className="rounded-2xl border border-primary-100 bg-gradient-to-br from-rose-50/50 via-white to-white shadow-sm p-4 md:p-5">
      <h3 className="flex items-center gap-2 text-[15px] md:text-[16px] font-bold text-foreground mb-1">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-primary-50 text-primary-600">
          <Calculator className="w-4 h-4" strokeWidth={2.2} />
        </span>
        ราคาขนส่งจีน → ไทย (ประมาณการ)
      </h3>
      <p className="mb-3 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-500" />
        <span>
          กรอกน้ำหนัก/ปริมาตรเพื่อดูค่าขนส่งโดยประมาณตามโหมดที่เลือกด้านบน
          (<b>ทางรถ/ทางเรือ</b> · <b>ตีลังไม้</b>). <b>ราคาจริงคิดหลังโกดังชั่งน้ำหนัก/วัดขนาดสินค้า</b> —
          ตัวเลขนี้เป็นเพียงการประมาณการเพื่อช่วยวางแผน
        </span>
      </p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* ── Inputs ── */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>โกดังต้นทาง</label>
              <select className={inputCls} value={warehouse} onChange={(e) => setWarehouse(e.target.value as "1" | "2")}>
                <option value="1">กวางโจว</option>
                <option value="2">อี้อู</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>ประเภทสินค้า</label>
              <select className={inputCls} value={productType} onChange={(e) => setProductType(e.target.value as "1"|"2"|"3"|"4")}>
                <option value="1">ทั่วไป</option>
                <option value="2">มอก.</option>
                <option value="3">อย./น้ำยา</option>
                <option value="4">พิเศษ</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>น้ำหนักรวม (กก.)</label>
            <input className={inputCls} inputMode="decimal" placeholder="เช่น 25" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </div>

          <div>
            <label className={labelCls}>ขนาด ก × ย × ส (ซม.)</label>
            <div className="grid grid-cols-3 gap-2">
              <input className={inputCls} inputMode="decimal" placeholder="กว้าง" value={w} onChange={(e) => setW(e.target.value)} />
              <input className={inputCls} inputMode="decimal" placeholder="ยาว" value={l} onChange={(e) => setL(e.target.value)} />
              <input className={inputCls} inputMode="decimal" placeholder="สูง" value={h} onChange={(e) => setH(e.target.value)} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">หรือกรอกปริมาตร (คิว) โดยตรง</span>
              <input className={`${inputCls} max-w-[120px]`} inputMode="decimal" placeholder="คิว" value={directCbm} onChange={(e) => setDirectCbm(e.target.value)} />
              {cbm > 0 && <span className="text-xs font-bold text-primary-600">= {cbm} คิว</span>}
            </div>
          </div>
        </div>

        {/* ── Result (the price for the SELECTED transport mode) ── */}
        <div className="rounded-xl border border-border bg-white p-3.5">
          {!hasDims ? (
            <div className="flex h-full min-h-[120px] items-center justify-center rounded-lg border border-dashed border-border bg-surface/40 px-4 py-6 text-center text-sm text-muted">
              กรอกน้ำหนัก (กก.) หรือ ปริมาตร (คิว) เพื่อดูราคาประเมิน
            </div>
          ) : error ? (
            <div className="flex h-full min-h-[120px] items-center rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {error}
            </div>
          ) : (
            <div className={`space-y-2 transition-opacity ${pending ? "opacity-50" : ""}`}>
              {/* The selected mode — big number */}
              <div className="flex items-center gap-3 rounded-xl border border-primary-200 bg-primary-50/40 px-3 py-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary-100 text-primary-600">
                  <SelectedIcon className="h-5 w-5" strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-foreground">
                    {transport === "1" ? "ทางรถ (EK)" : "ทางเรือ (SEA)"}
                    <span className="ml-1.5 text-[11px] font-normal text-muted">โหมดที่เลือก</span>
                  </div>
                  {selected && selected.hasRate ? (
                    <div className="text-[11.5px] text-muted">
                      คิดตาม{selected.basisUsed === "kg" ? "น้ำหนัก" : "ปริมาตร"} ·{" "}
                      {fmt(selected.unitRate)} ฿/{selected.basisUsed === "kg" ? "กก." : "คิว"} ×{" "}
                      {fmt(selected.billableValue)}{selected.basisUsed === "kg" ? " กก." : " คิว"}
                      {selected.crateThb > 0 ? ` + ตีลัง ${fmt(selected.crateThb)} ฿` : ""}
                    </div>
                  ) : (
                    <div className="text-[11.5px] text-amber-700">ยังไม่มีเรตสำหรับเส้นทางนี้ — ติดต่อทีมงานเพื่อขอราคา</div>
                  )}
                </div>
                {selected && selected.hasRate && (
                  <div className="text-right">
                    <div className="text-lg font-black text-primary-600">฿{fmt(selected.grandTotal)}</div>
                    <div className="text-[10px] text-muted">ประมาณการ</div>
                  </div>
                )}
              </div>

              {/* The other modes — compact compare row so the toggle effect is visible */}
              <div className="grid grid-cols-1 gap-1.5">
                {(modes ?? [])
                  .filter((m) => m.transport !== transport)
                  .map((m) => {
                    const Icon = MODE_ICON[m.transport] ?? Truck;
                    return (
                      <div
                        key={m.transport}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                          m.comingSoon ? "border-border bg-surface/30 opacity-60" : "border-border bg-white"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5 text-muted" strokeWidth={2} />
                        <span className="flex-1 font-medium text-foreground">{m.label}</span>
                        {m.comingSoon ? (
                          <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-bold text-neutral-600">เร็วๆ นี้</span>
                        ) : m.hasRate ? (
                          <span className="font-bold text-foreground">฿{fmt(m.grandTotal)}</span>
                        ) : (
                          <span className="text-[10px] text-amber-700">ไม่มีเรต</span>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
