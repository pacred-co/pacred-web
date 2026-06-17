"use client";

/**
 * <PerTrackingEditorClient> — the per-แทรคกิง dimension/price editor
 * (owner ภูม 2026-06-18: "ตัวกรอกล่างต้องมีหลายแถวตามแทค + รายละเอียด/จำนวนกล่อง ·
 *  แต่ละแทคขนาดต่างกัน มันคิดเงินต่างกัน").
 *
 * The legacy single-row form (<AdminForwarderEditForm>) only ever persisted ONE
 * row — a split parcel's other trackings were unsaved drafts. This renders ONE
 * editable row PER sibling tracking (each carrying its own tb_forwarder id) so a
 * pricer can fill each box's real dimensions + adders, and "บันทึกทุกแถว" persists
 * EVERY row by calling the existing audited per-row action
 * (adminUpdateForwarderDimensions) once per tracking — no new money-write path.
 *
 * The two rate toggles (คิดราคาแบบกำหนดเอง · คิดค่าเทียบแบบกำหนดเอง) are ORDER-level
 * (shared across all rows), matching the legacy update.php override block; they
 * are applied to every row's save. รายละเอียด + จำนวนกล่อง are read-only labels so
 * the pricer knows which tracking each input row belongs to.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminUpdateForwarderDimensions } from "@/actions/admin/forwarders-edit";

export type PerTrackingRow = {
  id: number;
  tracking: string;
  detail: string;
  boxes: number;
  weight: number;
  width: number;
  length: number;
  height: number;
  cbm: number;
  productType: "1" | "2" | "3" | "4";
  warehouseChina: "1" | "2";
  warehouseName: "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8";
  fTransportPrice: number;        // ค่าขนส่งในไทย
  fDiscount: number;              // ส่วนลด
  fTransportPriceChnThb: number;  // ค่าจีน+ ภายหลัง
  priceOther: number;             // ค่าอื่นๆ
  fShippingService: number;       // ค่าบริการ
};

type Props = {
  rows: PerTrackingRow[];
  customRateInit: "0" | "1";
  customRateKgInit: number;
  customRateCbmInit: number;
  customComparisonInit: "0" | "1";
  customComparisonValueInit: number;
};

const WAREHOUSE_CHINA = [
  { v: "1", label: "กวางโจว" }, { v: "2", label: "อี้อู" },
] as const;
const WAREHOUSE_TH = [
  { v: "1", label: "แสง" }, { v: "2", label: "CTT" }, { v: "3", label: "MK" }, { v: "4", label: "MX" },
  { v: "5", label: "JMF" }, { v: "6", label: "GOGO" }, { v: "7", label: "Cargo Center" }, { v: "8", label: "MOMO" },
] as const;
const PRODUCT_TYPES = [
  { v: "1", label: "ทั่วไป" }, { v: "2", label: "มอก." }, { v: "3", label: "อย." }, { v: "4", label: "พิเศษ" },
] as const;

// (W × L × H) / 1,000,000 (cm³ → m³) · 5-dp — the legacy CBM formula.
function cbmFromDims(w: number, l: number, h: number): number {
  return Math.round(((w * l * h) / 1_000_000) * 100_000) / 100_000;
}

const CELL = "h-9 w-full min-w-[68px] rounded-md border border-border bg-white dark:bg-surface px-2 text-sm font-mono text-right focus:border-primary-600 focus:outline-none disabled:bg-slate-50";
const SEL = "h-9 w-full min-w-[88px] rounded-md border border-border bg-white dark:bg-surface px-1.5 text-sm focus:border-primary-600 focus:outline-none disabled:bg-slate-50";
const TH = "px-2 py-1.5 text-[11px] font-semibold text-muted whitespace-nowrap border-r border-border";

export function PerTrackingEditorClient({
  rows: rowsInit,
  customRateInit,
  customRateKgInit,
  customRateCbmInit,
  customComparisonInit,
  customComparisonValueInit,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Per-row recomputed price (keyed by tb_forwarder id) — surfaced after save so
  // the pricer SEES that each tracking priced on its OWN dims (owner ภูม: "ถ้า
  // แต่ละแทคมีขนาดต่างกัน มันจะคิดผิด" → the proof is a different ฿ per row).
  type RowResult = { grandTotal: number; basis: "kg" | "cbm"; frefrate: number };
  const [results, setResults] = useState<Record<number, RowResult>>({});

  // ── ORDER-level shared toggles ──
  const [customRate, setCustomRate] = useState<"0" | "1">(customRateInit);
  const [customRateKg, setCustomRateKg] = useState<string>(String(customRateKgInit));
  const [customRateCbm, setCustomRateCbm] = useState<string>(String(customRateCbmInit));
  const [customComparison, setCustomComparison] = useState<"0" | "1">(customComparisonInit);
  const [comparisonValue, setComparisonValue] = useState<string>(String(customComparisonValueInit));

  // ── per-tracking rows (string-valued for free typing) ──
  type RowState = {
    id: number; tracking: string; detail: string; boxes: number;
    productType: PerTrackingRow["productType"];
    warehouseChina: PerTrackingRow["warehouseChina"];
    warehouseName: PerTrackingRow["warehouseName"];
    weight: string; width: string; length: string; height: string; cbm: string;
    fTransportPrice: string; fDiscount: string; fTransportPriceChnThb: string;
    priceOther: string; fShippingService: string;
  };
  const [rows, setRows] = useState<RowState[]>(() =>
    rowsInit.map((r) => ({
      id: r.id, tracking: r.tracking, detail: r.detail, boxes: r.boxes,
      productType: r.productType, warehouseChina: r.warehouseChina, warehouseName: r.warehouseName,
      weight: String(r.weight), width: String(r.width), length: String(r.length),
      height: String(r.height), cbm: String(r.cbm),
      fTransportPrice: String(r.fTransportPrice), fDiscount: String(r.fDiscount),
      fTransportPriceChnThb: String(r.fTransportPriceChnThb), priceOther: String(r.priceOther),
      fShippingService: String(r.fShippingService),
    })),
  );

  function patch(idx: number, p: Partial<RowState>) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...p } : r)));
  }
  // typing W/L/H auto-fills CBM (last edit wins — typing CBM directly overrides).
  function patchDim(idx: number, key: "width" | "length" | "height", v: string) {
    setRows((rs) =>
      rs.map((r, i) => {
        if (i !== idx) return r;
        const next = { ...r, [key]: v };
        next.cbm = String(
          cbmFromDims(parseFloat(next.width) || 0, parseFloat(next.length) || 0, parseFloat(next.height) || 0),
        );
        return next;
      }),
    );
  }

  async function onSaveAll() {
    setError(null);
    setSuccess(null);
    setResults({});
    for (const r of rows) {
      if (
        (parseFloat(r.weight) || 0) < 0 || (parseFloat(r.width) || 0) < 0 ||
        (parseFloat(r.length) || 0) < 0 || (parseFloat(r.height) || 0) < 0
      ) {
        setError(`แทค ${r.tracking}: ค่าทุกช่องต้อง ≥ 0`);
        return;
      }
    }

    startTransition(async () => {
      const fails: string[] = [];
      const nextResults: Record<number, RowResult> = {};
      for (const r of rows) {
        const res = await adminUpdateForwarderDimensions({
          fNo: String(r.id),
          weightKg: parseFloat(r.weight) || 0,
          widthCm: parseFloat(r.width) || 0,
          lengthCm: parseFloat(r.length) || 0,
          heightCm: parseFloat(r.height) || 0,
          volumeCbm: parseFloat(r.cbm) || 0,
          productType: r.productType,
          // items:[] — matches the legacy detail-page form (crate edited elsewhere).
          items: [],
          // ORDER-level shared rate toggles (applied to every row).
          customRate,
          customRateKg: parseFloat(customRateKg) || 0,
          customRateCbm: parseFloat(customRateCbm) || 0,
          customComparison,
          userComparisonValue: parseFloat(comparisonValue) || 0,
          // per-row adders.
          fDiscount: parseFloat(r.fDiscount) || 0,
          fTransportPriceChnThb: parseFloat(r.fTransportPriceChnThb) || 0,
          priceOther: parseFloat(r.priceOther) || 0,
          fTransportPrice: parseFloat(r.fTransportPrice) || 0,
          fShippingService: parseFloat(r.fShippingService) || 0,
          fWarehouseChina: r.warehouseChina,
          fWarehouseName: r.warehouseName,
        });
        if (!res.ok) {
          fails.push(`แทค ${r.tracking}: ${res.error}`);
        } else if (res.data) {
          nextResults[r.id] = {
            grandTotal: res.data.grandTotal,
            basis: res.data.basis,
            frefrate: res.data.frefrate,
          };
        }
      }
      setResults(nextResults);
      if (fails.length > 0) {
        setError(`บันทึกไม่สำเร็จ ${fails.length}/${rows.length} แถว — ${fails[0]}`);
        return;
      }
      setSuccess(`✓ บันทึกสำเร็จทั้ง ${rows.length} แทรคกิง — คำนวณราคาขายใหม่ให้แต่ละแทคแล้ว`);
      router.refresh();
      setTimeout(() => setSuccess(null), 6000);
    });
  }

  return (
    <div className="space-y-3">
      {/* ── ORDER-level rate toggles (shared) ── */}
      <div className="grid gap-2.5 sm:grid-cols-2">
        <div className={`rounded-lg border p-2.5 ${customRate === "1" ? "border-red-300 bg-red-50/40" : "border-border bg-surface-alt/30"}`}>
          <label className="flex cursor-pointer items-center gap-2 select-none">
            <input type="checkbox" checked={customRate === "1"} onChange={(e) => setCustomRate(e.target.checked ? "1" : "0")} disabled={pending} className="h-4 w-4 rounded border-border text-primary-600 focus:ring-primary-500" />
            <span className={`text-sm font-medium ${customRate === "1" ? "text-red-700" : "text-foreground"}`}>คิดราคาแบบกำหนดเอง</span>
          </label>
          {customRate === "1" ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="space-y-0.5"><span className="block text-[11px] text-muted">เรท ฿/กก.</span>
                <input type="number" min={0} step="0.01" value={customRateKg} onChange={(e) => setCustomRateKg(e.target.value)} disabled={pending} className={CELL} /></label>
              <label className="space-y-0.5"><span className="block text-[11px] text-muted">เรท ฿/CBM</span>
                <input type="number" min={0} step="0.01" value={customRateCbm} onChange={(e) => setCustomRateCbm(e.target.value)} disabled={pending} className={CELL} /></label>
            </div>
          ) : <p className="mt-1 text-[10px] text-muted">ปิด = เรทระบบ · เปิด = กำหนดเรท กก./CBM เอง (ใช้ทุกแทค)</p>}
        </div>
        <div className={`rounded-lg border p-2.5 ${customComparison === "1" ? "border-amber-300 bg-amber-50/40" : "border-border bg-surface-alt/30"}`}>
          <label className="flex cursor-pointer items-center gap-2 select-none">
            <input type="checkbox" checked={customComparison === "1"} onChange={(e) => setCustomComparison(e.target.checked ? "1" : "0")} disabled={pending} className="h-4 w-4 rounded border-border text-amber-600 focus:ring-amber-500" />
            <span className={`text-sm font-medium ${customComparison === "1" ? "text-amber-700" : "text-foreground"}`}>คิดค่าเทียบแบบกำหนดเอง</span>
          </label>
          {customComparison === "1" ? (
            <label className="mt-2 block max-w-[180px] space-y-0.5"><span className="block text-[11px] text-muted">ค่าเทียบ (1 คิว = N กก.)</span>
              <input type="number" min={0} step="1" value={comparisonValue} onChange={(e) => setComparisonValue(e.target.value)} disabled={pending} className={CELL} /></label>
          ) : <p className="mt-1 text-[10px] text-muted">ปิด = ค่าเทียบลูกค้า · เปิด = กำหนดเอง (ใช้ทุกแทค)</p>}
        </div>
      </div>

      {/* ── per-tracking rows ── */}
      <div className="overflow-x-auto scrollbar-x-visible rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt/50 uppercase tracking-wide">
            <tr>
              <th className={`${TH} text-left`}>รายละเอียด</th>
              <th className={TH}>กล่อง</th>
              <th className={TH}>โกดังจีน</th>
              <th className={TH}>โกดังไทย</th>
              <th className={TH}>ประเภท</th>
              <th className={TH}>น้ำหนัก</th>
              <th className={TH}>กว้าง</th>
              <th className={TH}>ยาว</th>
              <th className={TH}>สูง</th>
              <th className={`${TH} text-red-600`}>CBM</th>
              <th className={`${TH} text-red-600`}>ค่าขนส่งไทย</th>
              <th className={TH}>ส่วนลด</th>
              <th className={TH}>ค่าจีน+</th>
              <th className={TH}>ค่าอื่นๆ</th>
              <th className={TH}>ค่าบริการ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={r.id} className="border-t border-border align-top [&>td]:px-1.5 [&>td]:py-1.5 [&>td]:border-r [&>td]:border-border">
                <td className="min-w-[170px] max-w-[260px] text-left">
                  <div className="font-mono text-[11px] font-medium break-words">{r.tracking || "—"}</div>
                  {r.detail && r.detail !== r.tracking && <div className="text-[10px] text-muted break-words">{r.detail}</div>}
                  {results[r.id] && (
                    <div className="mt-1 inline-flex items-center gap-1 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                      ✓ ฿{results[r.id].grandTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      <span className="text-green-600/70">· คิดตาม{results[r.id].basis === "cbm" ? "ปริมาตร" : "น้ำหนัก"}</span>
                    </div>
                  )}
                </td>
                <td className="text-center font-mono text-xs text-muted">{r.boxes}</td>
                <td><select value={r.warehouseChina} onChange={(e) => patch(idx, { warehouseChina: e.target.value as RowState["warehouseChina"] })} disabled={pending} className={SEL}>{WAREHOUSE_CHINA.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}</select></td>
                <td><select value={r.warehouseName} onChange={(e) => patch(idx, { warehouseName: e.target.value as RowState["warehouseName"] })} disabled={pending} className={SEL}>{WAREHOUSE_TH.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}</select></td>
                <td><select value={r.productType} onChange={(e) => patch(idx, { productType: e.target.value as RowState["productType"] })} disabled={pending} className={SEL}>{PRODUCT_TYPES.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}</select></td>
                <td><input type="number" min={0} step="0.01" value={r.weight} onChange={(e) => patch(idx, { weight: e.target.value })} disabled={pending} className={CELL} placeholder="0.00" /></td>
                <td><input type="number" min={0} step="0.01" value={r.width} onChange={(e) => patchDim(idx, "width", e.target.value)} disabled={pending} className={CELL} placeholder="0" /></td>
                <td><input type="number" min={0} step="0.01" value={r.length} onChange={(e) => patchDim(idx, "length", e.target.value)} disabled={pending} className={CELL} placeholder="0" /></td>
                <td><input type="number" min={0} step="0.01" value={r.height} onChange={(e) => patchDim(idx, "height", e.target.value)} disabled={pending} className={CELL} placeholder="0" /></td>
                <td><input type="number" min={0} step="0.00001" value={r.cbm} onChange={(e) => patch(idx, { cbm: e.target.value })} disabled={pending} className={CELL} placeholder="0.00000" /></td>
                <td><input type="number" min={0} step="0.01" value={r.fTransportPrice} onChange={(e) => patch(idx, { fTransportPrice: e.target.value })} disabled={pending} className={CELL} placeholder="0.00" /></td>
                <td><input type="number" min={0} step="0.01" value={r.fDiscount} onChange={(e) => patch(idx, { fDiscount: e.target.value })} disabled={pending} className={CELL} placeholder="0.00" /></td>
                <td><input type="number" min={0} step="0.01" value={r.fTransportPriceChnThb} onChange={(e) => patch(idx, { fTransportPriceChnThb: e.target.value })} disabled={pending} className={CELL} placeholder="0.00" /></td>
                <td><input type="number" min={0} step="0.01" value={r.priceOther} onChange={(e) => patch(idx, { priceOther: e.target.value })} disabled={pending} className={CELL} placeholder="0.00" /></td>
                <td><input type="number" min={0} step="0.01" value={r.fShippingService} onChange={(e) => patch(idx, { fShippingService: e.target.value })} disabled={pending} className={CELL} placeholder="0.00" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted">⚠️ กรอกขนาด/ราคาของแต่ละแทรคกิง แล้วกด “บันทึกทุกแถว” · ระบบคำนวณราคาขายใหม่ให้แต่ละแทคตอนบันทึก (ต้นทุน/ค่าเทียบ จาก server)</p>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">⚠ {error}</div>}
      {success && <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">{success}</div>}

      <button type="button" onClick={onSaveAll} disabled={pending} className="rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed">
        {pending ? "กำลังบันทึก..." : `บันทึกทุกแถว (${rows.length} แทรคกิง)`}
      </button>
    </div>
  );
}
