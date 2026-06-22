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
import { Truck, Ship, Plane, Package, Calculator, Sparkles, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  getCustomerImportEstimate,
  type CustomerEstimateMode,
} from "@/actions/forwarder-quote";

const WAREHOUSES = [
  { id: "1", labelKey: "warehouseGuangzhou" },
  { id: "2", labelKey: "warehouseYiwu" },
] as const;

const PRODUCT_TYPES = [
  { id: "1", labelKey: "productGeneral" },
  { id: "2", labelKey: "productTis" },
  { id: "3", labelKey: "productFda" },
  { id: "4", labelKey: "productSpecial" },
] as const;

const BASES = [
  { id: "auto", labelKey: "basisAuto" },
  { id: "kg", labelKey: "basisKg" },
  { id: "cbm", labelKey: "basisCbm" },
] as const;

const MODE_ICON: Record<string, typeof Truck> = { "1": Truck, "2": Ship, "3": Plane };

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmt0(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function ImportEstimateClient() {
  const t = useTranslations("importEstimate");
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
  const [docTier, setDocTier] = useState(false); // เปิดใบกำกับ/ใบขน → doc-tier discount

  const [pending, startTransition] = useTransition();
  const [modes, setModes] = useState<CustomerEstimateMode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [docDiscountCbm, setDocDiscountCbm] = useState(0);
  const [docTierApplied, setDocTierApplied] = useState(false);

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
          docTier,
        });
        if (!res.ok) { setError(res.error); setModes(null); return; }
        setError(null);
        setModes(res.modes);
        setDocDiscountCbm(res.docDiscountCbm);
        setDocTierApplied(res.docTierApplied);
      });
    }, 400);
    return () => clearTimeout(t);
  }, [warehouse, productType, basis, weightKg, cbm, crate, crateThb, docTier]);

  const inputCls = "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100";
  const labelCls = "mb-1 block text-xs font-semibold text-muted";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* ── Inputs ── */}
      <div className="rounded-2xl border border-border bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>{t("warehouseLabel")}</label>
            <select className={inputCls} value={warehouse} onChange={(e) => setWarehouse(e.target.value as "1" | "2")}>
              {WAREHOUSES.map((o) => <option key={o.id} value={o.id}>{t(o.labelKey)}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t("productTypeLabel")}</label>
            <select className={inputCls} value={productType} onChange={(e) => setProductType(e.target.value as "1"|"2"|"3"|"4")}>
              {PRODUCT_TYPES.map((o) => <option key={o.id} value={o.id}>{t(o.labelKey)}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls}>{t("weightLabel")}</label>
          <input className={inputCls} inputMode="decimal" placeholder={t("weightPlaceholder")} value={weight} onChange={(e) => setWeight(e.target.value)} />
        </div>

        <div>
          <label className={labelCls}>{t("dimensionsLabel")}</label>
          <div className="grid grid-cols-3 gap-2">
            <input className={inputCls} inputMode="decimal" placeholder={t("widthPlaceholder")} value={w} onChange={(e) => setW(e.target.value)} />
            <input className={inputCls} inputMode="decimal" placeholder={t("lengthPlaceholder")} value={l} onChange={(e) => setL(e.target.value)} />
            <input className={inputCls} inputMode="decimal" placeholder={t("heightPlaceholder")} value={h} onChange={(e) => setH(e.target.value)} />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-muted">{t("orEnterCbm")}</span>
            <input className={`${inputCls} max-w-[120px]`} inputMode="decimal" placeholder={t("cbmPlaceholder")} value={directCbm} onChange={(e) => setDirectCbm(e.target.value)} />
            {cbm > 0 && <span className="text-xs font-bold text-primary-600">{t("cbmEquals", { cbm })}</span>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>{t("basisLabel")}</label>
            <select className={inputCls} value={basis} onChange={(e) => setBasis(e.target.value as "auto"|"kg"|"cbm")}>
              {BASES.map((o) => <option key={o.id} value={o.id}>{t(o.labelKey)}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t("crateLabel")}</label>
            <div className="flex items-center gap-2 pt-1.5">
              <button
                type="button"
                onClick={() => setCrate((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                  crate ? "border-primary-500 bg-primary-50 text-primary-700" : "border-border bg-white text-muted"
                }`}
              >
                <Package className="h-3.5 w-3.5" /> {crate ? t("crateOn") : t("crateOff")}
              </button>
              {crate && (
                <input className={`${inputCls} max-w-[100px] py-1.5`} inputMode="decimal" value={crateThb} onChange={(e) => setCrateThb(e.target.value)} aria-label={t("crateCostAria")} />
              )}
            </div>
          </div>
        </div>

        {/* ── Doc-tier discount toggle (owner 2026-06-16) ── */}
        <div>
          <label className={labelCls}>{t("docTierLabel")}</label>
          <button
            type="button"
            onClick={() => setDocTier((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
              docTier ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-border bg-white text-muted"
            }`}
          >
            <FileText className="h-3.5 w-3.5" /> {docTier ? t("docTierOn") : t("docTierOff")}
          </button>
          {docDiscountCbm > 0 && (
            <p className={`mt-1.5 text-[11px] ${docTierApplied ? "text-emerald-700" : "text-muted"}`}>
              {docTierApplied
                ? t("docTierHintOn", { amount: fmt0(docDiscountCbm) })
                : t("docTierHintOff", { amount: fmt0(docDiscountCbm) })}
            </p>
          )}
        </div>
      </div>

      {/* ── Result ── */}
      <div className="rounded-2xl border border-border bg-gradient-to-br from-rose-50/40 via-white to-white p-4 shadow-sm">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-foreground">
          <Calculator className="h-4 w-4 text-primary-600" /> {t("resultTitle")}
        </h3>
        <p className="mb-3 text-[11px] text-muted">
          {t.rich("resultNote", { b: (chunks) => <b>{chunks}</b> })}
        </p>

        {weightKg <= 0 && cbm <= 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface/40 px-4 py-8 text-center text-sm text-muted">
            {t("emptyState")}
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
                      {m.comingSoon && <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[11px] font-bold text-neutral-600">{t("comingSoon")}</span>}
                      {isCheapest && <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700"><Sparkles className="h-2.5 w-2.5" />{t("cheapest")}</span>}
                      {m.docDiscountApplied > 0 && <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700"><FileText className="h-2.5 w-2.5" />{t("docDiscountBadge", { amount: fmt0(m.docDiscountApplied) })}</span>}
                    </div>
                    {!m.comingSoon && m.hasRate ? (
                      <div className="text-[11px] text-muted">
                        {t("rateLine", {
                          unitRate: fmt(m.unitRate),
                          unit: m.basisUsed === "kg" ? t("unitKg") : t("unitCbm"),
                          billableValue: fmt(m.billableValue),
                        })}
                        {m.crateThb > 0 ? t("rateCrateSuffix", { crateThb: fmt(m.crateThb) }) : ""}
                      </div>
                    ) : m.comingSoon ? (
                      <div className="text-[11px] text-muted">{t("notYetAvailable")}</div>
                    ) : (
                      <div className="text-[11px] text-amber-700">{t("noRate")}</div>
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
