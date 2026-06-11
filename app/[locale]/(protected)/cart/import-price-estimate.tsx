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
  const hasDims = weightKg > 0 || cbm > 0;

  const inputCls =
    "w-full rounded-lg border border-border bg-white px-3 py-2 text-base focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100";
  const labelCls = "mb-1 block text-xs font-semibold text-muted";

  return (
    <div className="rounded-2xl border-2 border-primary-200 bg-gradient-to-br from-rose-50 via-white to-white shadow-md p-4 md:p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[15px] md:text-[17px] font-bold text-foreground">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-primary-600 text-white">
            <Calculator className="w-4 h-4" strokeWidth={2.2} />
          </span>
          ค่าขนส่งจีน → ไทย (ประมาณการ)
        </h3>
        {/* Clarify the money model (owner-confirmed: keep legacy — goods now, freight on arrival) */}
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800">
          💡 จ่ายตอนของถึงโกดังไทย
        </span>
      </div>
      <p className="mb-3 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-500" />
        <span>
          ค่าขนส่งนี้ <b className="text-foreground">แยกจากค่าสินค้าในตะกร้า</b> — เลือก <b>ทางรถ/ทางเรือ</b> + <b>ตีลังไม้</b> ด้านบน
          แล้วราคาจะเปลี่ยนตาม. <b>ราคาจริงคิดหลังโกดังชั่งน้ำหนัก/วัดขนาดจริง</b> และเรียกเก็บตอนของถึงโกดังไทย —
          ตัวเลขนี้ช่วยให้ประเมินก่อนตัดสินใจ
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

        {/* ── Result: prominent ทางรถ ↔ ทางเรือ comparison (both visible so the
            toggle effect is obvious — the mode matching the cart radio is ring-lit) ── */}
        <div className="rounded-xl border border-border bg-white p-3.5">
          {!hasDims ? (
            <div className="flex h-full min-h-[140px] items-center justify-center rounded-lg border border-dashed border-border bg-surface/40 px-4 py-6 text-center text-sm text-muted">
              กรอกน้ำหนัก (กก.) หรือ ปริมาตร (คิว) เพื่อดูราคาประเมิน
            </div>
          ) : error ? (
            <div className="flex h-full min-h-[140px] items-center rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {error}
            </div>
          ) : (
            <div className={`space-y-2.5 transition-opacity ${pending ? "opacity-50" : ""}`}>
              {/* 2-up: ทางรถ + ทางเรือ side by side; the one matching the cart's
                  hTransportType radio is highlighted ("เลือกอยู่"). */}
              <div className="grid grid-cols-2 gap-2">
                {(modes ?? [])
                  .filter((m) => !m.comingSoon)
                  .map((m) => {
                    const Icon = MODE_ICON[m.transport] ?? Truck;
                    const isSel = m.transport === transport;
                    return (
                      <div
                        key={m.transport}
                        className={`rounded-xl border p-3 text-center transition-all ${
                          isSel
                            ? "border-primary-400 bg-primary-50 ring-2 ring-primary-200"
                            : "border-border bg-surface/30"
                        }`}
                      >
                        <div className="mb-1 flex items-center justify-center gap-1.5">
                          <Icon className={`h-4 w-4 ${isSel ? "text-primary-600" : "text-muted"}`} strokeWidth={2.2} />
                          <span className={`text-[13px] font-bold ${isSel ? "text-primary-700" : "text-foreground"}`}>{m.label}</span>
                        </div>
                        {m.hasRate ? (
                          <div className={`text-xl font-black leading-tight ${isSel ? "text-primary-600" : "text-foreground"}`}>
                            ฿{fmt(m.grandTotal)}
                          </div>
                        ) : (
                          <div className="py-1 text-[11px] font-medium leading-tight text-amber-700">ยังไม่มีเรต<br />ติดต่อทีมงาน</div>
                        )}
                        {isSel && (
                          <span className="mt-1.5 inline-block rounded-full bg-primary-600 px-2 py-0.5 text-[10px] font-bold text-white">เลือกอยู่</span>
                        )}
                      </div>
                    );
                  })}
              </div>

              {/* Basis explainer for the selected mode (how the number was derived) */}
              {selected && selected.hasRate && (
                <div className="rounded-lg bg-surface/50 px-3 py-2 text-[11.5px] leading-relaxed text-muted">
                  <b className="text-foreground">{selected.transport === "1" ? "ทางรถ (EK)" : "ทางเรือ (SEA)"}</b> คิดตาม
                  {selected.basisUsed === "kg" ? "น้ำหนัก" : "ปริมาตร"} · {fmt(selected.unitRate)} ฿/
                  {selected.basisUsed === "kg" ? "กก." : "คิว"} × {fmt(selected.billableValue)}
                  {selected.basisUsed === "kg" ? " กก." : " คิว"}
                  {selected.crateThb > 0 ? ` + ตีลัง ${fmt(selected.crateThb)} ฿` : ""}
                  {" = "}<b className="text-primary-600">฿{fmt(selected.grandTotal)}</b>
                </div>
              )}

              {/* ทางอากาศ — coming soon */}
              {(modes ?? []).some((m) => m.comingSoon) && (
                <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted">
                  <Plane className="h-3.5 w-3.5" strokeWidth={2} />
                  ทางอากาศ — เปิดเร็วๆ นี้
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
