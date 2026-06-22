"use client";

/**
 * ใบเสนอราคา tab — cargo LCL quotation (owner ปอน 2026-06-21, simplified v3).
 *
 * Two modes, clean UI:
 *  • 📋 เทียบเรท (default) — new customers don't know CBM/KG yet, so this just
 *    COMPARES the rates side-by-side (กว่างโจว/อี้อู × รถ/เรือ) for the chosen
 *    package + conditions → a ready-to-send quotation, no numbers needed.
 *  • 🧮 คำนวณราคา — when CBM/KG are known: density (ค่าเทียบ) billing → a Peak
 *    line-item quote with VAT/WHT totals.
 * นิติบุคคล toggle → หัก ณ ที่จ่าย 1% auto. อี้อู·รถ +600 is folded into the rate
 * (5,500), not a condition. Pacred logo. Pure client, no DB write (prod-safe).
 */

import { useMemo, useState, type ReactNode } from "react";
import { Copy, Printer, Check, Calculator, LayoutList } from "lucide-react";
import {
  CONTACT, SOCIAL, ADDRESSES, BANK, SITE_LEGAL_NAME_TH, SITE_LEGAL_NAME, TAX_ID,
} from "@/components/seo/site";
import { calcFreight, calcQuoteTotals, round2 } from "@/lib/quote/cargo-quote-calc";
import {
  CARGO_PROMO_PACKAGES, CUSTOMS_ADDON, DEFAULT_COMPARISON, MIN_CHARGE, MODE_LABEL,
  MODE_KEYS, QUOTE_HEADER, QUOTE_HOW_TO, QUOTE_NOTES, WAREHOUSE_KEYS, WAREHOUSE_LABEL,
  rateFor, type CargoPromoPackage, type PackageRate, type QuoteMode, type WarehouseKey,
} from "@/lib/quote/cargo-promo-packages";

const LOGO = "/images/pacred-logo-red.png";
const JURISTIC_WHT = 0.01;
const SELLER = {
  nameTh: SITE_LEGAL_NAME_TH, nameEn: SITE_LEGAL_NAME, address: ADDRESSES.office.full,
  taxId: TAX_ID, phone: CONTACT.phoneCompanyDisplay, email: CONTACT.email,
};

const THB = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const BAHT = (n: number) => n.toLocaleString("th-TH");
const QTY = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 3 });

type View = "compare" | "calc";
type DisplayLine = { desc: string; qtyLabel: string; price: number; amount: number; vat: boolean; whtApplicable: boolean };
type CompareRow = { warehouse: string; isYiwu: boolean; truck: PackageRate; ship: PackageRate };

type QuoteModel = {
  view: View;
  refNo: string; dateLabel: string; validUntil: string;
  buyerName: string; buyerTaxId: string; buyerAddress: string; buyerPhone: string;
  salesName: string; salesTel: string;
  packageLabel: string; juristic: boolean;
  compareRows: CompareRow[];
  routeLabel: string; density: number | null; basisLabel: string; comparison: number;
  lines: DisplayLine[]; totals: ReturnType<typeof calcQuoteTotals>;
  showCustomsInfo: boolean;
  conditions: string[]; notes: string[]; extraNote: string;
};

const pad = (n: number) => (n < 10 ? `0${n}` : String(n));

export function QuoteTab({ customerName, userid, comparisonValue = 0 }: { customerName: string; userid: string; comparisonValue?: number }) {
  const [view, setView] = useState<View>("compare");
  const [pkgId, setPkgId] = useState(CARGO_PROMO_PACKAGES[0].id);
  const [licensed, setLicensed] = useState(false);
  const [juristic, setJuristic] = useState(false);

  // calc-mode inputs
  const [warehouse, setWarehouse] = useState<WarehouseKey>("guangzhou");
  const [mode, setMode] = useState<QuoteMode>("truck");
  const [cbm, setCbm] = useState("");
  const [kg, setKg] = useState("");
  const [comparison, setComparison] = useState(String(comparisonValue > 0 ? comparisonValue : DEFAULT_COMPARISON));
  const [customs, setCustoms] = useState<Set<number>>(new Set());
  const [issueTax, setIssueTax] = useState(true);
  const [showCustomsInfo, setShowCustomsInfo] = useState(false);

  const pkg = useMemo<CargoPromoPackage>(() => CARGO_PROMO_PACKAGES.find((p) => p.id === pkgId) ?? CARGO_PROMO_PACKAGES[0], [pkgId]);
  const hasLicensed = !!pkg.licensedRates;
  const effLicensed = licensed && hasLicensed;
  const eff = useMemo(() => rateFor(pkg, effLicensed, warehouse, mode), [pkg, effLicensed, warehouse, mode]);

  // editable rate (calc mode), seeded from the folded rate
  const [ratePerCbm, setRatePerCbm] = useState(String(eff.cbm));
  const [ratePerKg, setRatePerKg] = useState(String(eff.kg));
  // Re-seed the editable rate when package/warehouse/mode/licensed changes —
  // adjust state DURING render (React's recommended pattern), not a
  // setState-in-effect (which triggers cascading renders).
  const rateKey = `${pkg.id}|${effLicensed}|${warehouse}|${mode}`;
  const [prevRateKey, setPrevRateKey] = useState(rateKey);
  if (rateKey !== prevRateKey) {
    setPrevRateKey(rateKey);
    setRatePerCbm(String(eff.cbm));
    setRatePerKg(String(eff.kg));
  }

  // doc / buyer (advanced)
  const today = useMemo(() => new Date(), []);
  const ymd = `${today.getFullYear()}${pad(today.getMonth() + 1)}${pad(today.getDate())}`;
  const [refNo, setRefNo] = useState(`QT-${userid}-${ymd}`);
  const [validUntil, setValidUntil] = useState(() => { const d = new Date(today); d.setDate(d.getDate() + 7); return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }); });
  const [buyerName, setBuyerName] = useState(customerName || "");
  const [buyerTaxId, setBuyerTaxId] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [salesName, setSalesName] = useState("");
  const [salesTel, setSalesTel] = useState("");
  const [extraNote, setExtraNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const num = (s: string) => { const n = parseFloat(s.replace(/,/g, "").trim()); return Number.isFinite(n) && n >= 0 ? n : 0; };

  const freight = useMemo(() => calcFreight({
    cbm: num(cbm), kg: num(kg), comparison: num(comparison),
    ratePerCbm: num(ratePerCbm), ratePerKg: num(ratePerKg),
    yiwuTruckSurchargePerCbm: 0, isYiwuTruck: false, minCharge: MIN_CHARGE, // surcharge folded into the rate
  }), [cbm, kg, comparison, ratePerCbm, ratePerKg]);

  const model: QuoteModel = useMemo(() => {
    const compareRows: CompareRow[] = WAREHOUSE_KEYS.map((w) => ({
      warehouse: WAREHOUSE_LABEL[w], isYiwu: w === "yiwu",
      truck: rateFor(pkg, effLicensed, w, "truck"), ship: rateFor(pkg, effLicensed, w, "ship"),
    }));

    const lines: DisplayLine[] = [];
    if (view === "calc" && (num(cbm) > 0 || num(kg) > 0)) {
      const basisTxt = freight.basis === "kg" ? "น้ำหนัก KG" : "ปริมาตร CBM";
      lines.push({
        desc: `ค่าขนส่งนำเข้า LCL จีน-ไทย · ${WAREHOUSE_LABEL[warehouse]} · ${MODE_LABEL[mode]} · คิดตาม${basisTxt}`,
        qtyLabel: `${QTY(freight.chargeableQty)} ${freight.basis === "kg" ? "กก." : "คิว"}`,
        price: freight.rateUsed, amount: freight.freightBeforeSurcharge, vat: issueTax, whtApplicable: true,
      });
      const topUp = freight.freightTotal > 0 ? round2(freight.freightTotal - freight.freightBeforeSurcharge) : 0;
      if (topUp > 0) lines.push({ desc: `ปรับเป็นค่าขั้นต่ำ ${MIN_CHARGE} บาท / shipment`, qtyLabel: "-", price: topUp, amount: topUp, vat: issueTax, whtApplicable: true });
      for (const i of [...customs].sort((a, b) => a - b)) {
        const c = CUSTOMS_ADDON.costs[i];
        if (!c) continue;
        lines.push({ desc: c.label, qtyLabel: c.note ?? "1", price: c.amount, amount: c.amount, vat: issueTax && c.vat, whtApplicable: c.vat });
      }
    }
    const whtRate = juristic ? JURISTIC_WHT : 0;
    const totals = calcQuoteTotals(lines.map((l) => ({ label: l.desc, amount: l.amount, vat: l.vat, whtApplicable: l.whtApplicable })), whtRate);

    return {
      view, refNo, dateLabel: today.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" }), validUntil,
      buyerName, buyerTaxId, buyerAddress, buyerPhone, salesName, salesTel,
      packageLabel: `แพ็คเกจที่ ${pkg.no}: ${pkg.name}${effLicensed ? " · สินค้าลิขสิทธิ์" : ""}`,
      juristic, compareRows,
      routeLabel: `${WAREHOUSE_LABEL[warehouse]} · ${MODE_LABEL[mode]}`,
      density: freight.density, basisLabel: freight.basis === "kg" ? "น้ำหนัก (KG)" : "ปริมาตร (CBM)",
      comparison: num(comparison) > 0 ? num(comparison) : DEFAULT_COMPARISON,
      lines, totals, showCustomsInfo,
      conditions: pkg.conditions, notes: QUOTE_NOTES, extraNote: extraNote.trim(),
    };
  }, [view, pkg, effLicensed, warehouse, mode, cbm, kg, comparison, freight, customs, issueTax, juristic,
    refNo, validUntil, buyerName, buyerTaxId, buyerAddress, buyerPhone, salesName, salesTel, extraNote, today, showCustomsInfo]);

  const calcEmpty = view === "calc" && model.lines.length === 0;

  async function copyText() {
    try { await navigator.clipboard.writeText(buildQuoteText(model)); setActionMsg(null); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setCopied(false); setActionMsg("คัดลอกไม่สำเร็จ — ลองแคปการ์ดด้านล่างแทน"); }
  }
  function printQuote() {
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) { setActionMsg("เบราว์เซอร์บล็อก popup — อนุญาต popup แล้วลองใหม่ หรือแคป/คัดลอกการ์ดด้านล่างแทน"); return; }
    setActionMsg(null);
    w.document.write(buildPrintHtml(model));
    w.document.close();
    w.focus();
  }

  const seg = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors ${active ? "bg-primary-600 text-white" : "text-muted hover:bg-surface-alt"}`;
  const inputCls = "w-full rounded-md border border-border px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500";
  const selectCls = "rounded-md border border-border bg-white dark:bg-surface px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary-500/40";

  return (
    <div className="space-y-3 text-sm">
      {/* Mode toggle + juristic */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border p-0.5 bg-surface-alt/40">
          <button type="button" onClick={() => setView("compare")} className={seg(view === "compare")}><LayoutList className="w-3.5 h-3.5" /> เทียบเรท</button>
          <button type="button" onClick={() => setView("calc")} className={seg(view === "calc")}><Calculator className="w-3.5 h-3.5" /> คำนวณราคา</button>
        </div>
        <label className="inline-flex items-center gap-1.5 text-[12px] ml-auto">
          <input type="checkbox" checked={juristic} onChange={(e) => setJuristic(e.target.checked)} className="accent-primary-600" />
          ลูกค้านิติบุคคล (หัก ณ ที่จ่าย 1%)
        </label>
      </div>

      {/* Package — dropdown (keeps the panel compact) */}
      <label className="flex items-center gap-2">
        <span className="text-[12px] font-semibold text-foreground whitespace-nowrap">แพ็คเกจ:</span>
        <select value={pkgId} onChange={(e) => setPkgId(e.target.value)} className={`flex-1 ${selectCls}`}>
          {CARGO_PROMO_PACKAGES.map((p) => (
            <option key={p.id} value={p.id}>แพ็คเกจที่ {p.no}: {p.name}</option>
          ))}
        </select>
      </label>

      {hasLicensed && (
        <label className="inline-flex items-center gap-1.5 text-[12px]">
          <input type="checkbox" checked={licensed} onChange={(e) => setLicensed(e.target.checked)} className="accent-primary-600" /> เรทสินค้าลิขสิทธิ์
        </label>
      )}

      {/* Calc-mode inputs */}
      {view === "calc" && (
        <div className="rounded-xl border border-border bg-surface-alt/30 p-3 space-y-2.5">
          <div className="flex flex-wrap items-center gap-3 text-[12px]">
            <label className="flex items-center gap-1.5"><span className="font-semibold">โกดัง:</span>
              <select value={warehouse} onChange={(e) => setWarehouse(e.target.value as WarehouseKey)} className={selectCls}>
                {WAREHOUSE_KEYS.map((w) => <option key={w} value={w}>{WAREHOUSE_LABEL[w]}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1.5"><span className="font-semibold">ขนส่ง:</span>
              <select value={mode} onChange={(e) => setMode(e.target.value as QuoteMode)} className={selectCls}>
                {MODE_KEYS.map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="block"><span className="block text-[11px] text-muted mb-0.5">ปริมาตร CBM</span><input type="text" inputMode="decimal" value={cbm} onChange={(e) => setCbm(e.target.value)} placeholder="0" className={inputCls} /></label>
            <label className="block"><span className="block text-[11px] text-muted mb-0.5">น้ำหนัก KG</span><input type="text" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="0" className={inputCls} /></label>
            <label className="block"><span className="block text-[11px] text-muted mb-0.5">ค่าเทียบ กก./คิว</span><input type="text" inputMode="decimal" value={comparison} onChange={(e) => setComparison(e.target.value)} className={inputCls} /></label>
          </div>
          <div className="rounded-lg border border-primary-200 bg-primary-50/60 px-3 py-2 text-[12px] flex flex-wrap items-center gap-x-4 gap-y-1">
            {model.density != null
              ? <span>ความหนาแน่น <b>{QTY(round2(model.density))}</b> กก./คิว → บิลตาม <b>{model.basisLabel}</b> (เรท {BAHT(num(ratePerCbm))}/คิว · {BAHT(num(ratePerKg))}/กก.)</span>
              : <span className="text-muted">กรอก CBM + KG เพื่อคำนวณ · เรท {BAHT(num(ratePerCbm))}/คิว · {BAHT(num(ratePerKg))}/กก.</span>}
            <span className="ml-auto font-bold text-primary-700">ค่าขนส่ง ฿{THB(freight.freightTotal)}</span>
          </div>
        </div>
      )}

      {/* Advanced (collapsed — keeps the main UI clean) */}
      <details className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-2">
        <summary className="cursor-pointer text-[12px] font-semibold text-foreground">ตัวเลือกเพิ่มเติม (เรท · บริการใบขน · VAT · ข้อมูลเอกสาร)</summary>
        <div className="mt-2 space-y-3">
          {view === "calc" && (
            <div className="flex flex-wrap items-end gap-3">
              <label className="block"><span className="block text-[11px] text-muted mb-0.5">เรท บาท/คิว</span><input type="text" inputMode="decimal" value={ratePerCbm} onChange={(e) => setRatePerCbm(e.target.value)} className="w-24 rounded-md border border-border px-2 py-1 text-right font-mono text-[13px]" /></label>
              <label className="block"><span className="block text-[11px] text-muted mb-0.5">เรท บาท/กก.</span><input type="text" inputMode="decimal" value={ratePerKg} onChange={(e) => setRatePerKg(e.target.value)} className="w-24 rounded-md border border-border px-2 py-1 text-right font-mono text-[13px]" /></label>
              <label className="inline-flex items-center gap-1.5 text-[12px] mb-1"><input type="checkbox" checked={issueTax} onChange={(e) => setIssueTax(e.target.checked)} className="accent-primary-600" /> ออกใบกำกับ (VAT 7%)</label>
            </div>
          )}
          <div>
            <label className="inline-flex items-center gap-1.5 text-[12px] font-semibold">
              <input type="checkbox" checked={showCustomsInfo} onChange={(e) => setShowCustomsInfo(e.target.checked)} className="accent-primary-600" /> แสดง/แนบ บริการเสริมใบขน
            </label>
            {view === "calc" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 mt-1">
                {CUSTOMS_ADDON.costs.map((c, i) => (
                  <label key={i} className="inline-flex items-center gap-1.5 text-[12px]">
                    <input type="checkbox" checked={customs.has(i)} onChange={(e) => setCustoms((prev) => { const n = new Set(prev); if (e.target.checked) n.add(i); else n.delete(i); return n; })} className="accent-primary-600" />
                    {c.label} <span className="text-muted">฿{c.amount.toLocaleString()}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Field label="เลขที่เอกสาร" v={refNo} on={setRefNo} cls={inputCls} />
            <Field label="ใช้ได้ถึง" v={validUntil} on={setValidUntil} cls={inputCls} />
            <Field label="ชื่อลูกค้า / บริษัท" v={buyerName} on={setBuyerName} cls={inputCls} />
            <Field label="เลขผู้เสียภาษีลูกค้า" v={buyerTaxId} on={setBuyerTaxId} cls={inputCls} />
            <Field label="ที่อยู่ลูกค้า" v={buyerAddress} on={setBuyerAddress} cls={inputCls} />
            <Field label="โทรลูกค้า" v={buyerPhone} on={setBuyerPhone} cls={inputCls} />
            <Field label="ผู้ติดต่อ (Sale)" v={salesName} on={setSalesName} cls={inputCls} />
            <Field label="โทร Sale" v={salesTel} on={setSalesTel} cls={inputCls} />
          </div>
          <label className="block"><span className="block text-[12px] font-semibold mb-1">หมายเหตุเพิ่มเติม</span><textarea value={extraNote} onChange={(e) => setExtraNote(e.target.value)} rows={2} placeholder="เช่น โปรพิเศษ / เงื่อนไขเฉพาะลูกค้ารายนี้" className={inputCls} /></label>
        </div>
      </details>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted">แคปการ์ดด้านล่าง หรือกดปุ่มเพื่อคัดลอก/พิมพ์เป็นไฟล์ส่งลูกค้า</p>
        <div className="flex gap-2">
          <button type="button" onClick={copyText} disabled={calcEmpty} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium hover:bg-surface-alt disabled:opacity-50">
            {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}{copied ? "คัดลอกแล้ว" : "คัดลอกเป็นข้อความ"}
          </button>
          <button type="button" onClick={printQuote} disabled={calcEmpty} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 text-white px-3 py-1.5 text-[12px] font-semibold hover:bg-primary-700 disabled:opacity-50">
            <Printer className="w-3.5 h-3.5" /> พิมพ์ / บันทึก PDF
          </button>
        </div>
      </div>
      {actionMsg && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">{actionMsg}</div>}

      {calcEmpty ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800">กรอกปริมาตร/น้ำหนัก หรือเลือกบริการเสริม เพื่อสร้างใบเสนอราคา</div>
      ) : (
        <QuoteCard model={model} />
      )}
    </div>
  );
}

function Field({ label, v, on, cls }: { label: string; v: string; on: (s: string) => void; cls: string }) {
  return <label className="block"><span className="block text-[11px] text-muted mb-0.5">{label}</span><input type="text" value={v} onChange={(e) => on(e.target.value)} className={cls} /></label>;
}

// ── Peak-style quotation card ─────────────────────────────────────────────
function QuoteCard({ model }: { model: QuoteModel }) {
  const t = model.totals;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b-2 border-primary-600">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO} alt="Pacred" className="h-9 w-auto" />
        <div className="text-right">
          <div className="text-xl font-black text-primary-700">ใบเสนอราคา</div>
          <div className="text-[11px] text-slate-400">Quotation</div>
        </div>
      </div>

      <div className="p-3 sm:p-5 space-y-3 text-[12px]">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-lg border border-slate-200 p-2.5 leading-relaxed">
            <p className="font-bold text-slate-800">ผู้ขาย</p>
            <p>{SELLER.nameTh}</p>
            <p className="text-slate-500">{SELLER.address}</p>
            <p className="text-slate-500 font-mono">เลขภาษี {SELLER.taxId}</p>
            <p className="text-slate-500">โทร {SELLER.phone} · {SELLER.email}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-2.5 leading-relaxed">
            <div className="grid grid-cols-[auto_1fr] gap-x-2">
              <span className="text-slate-500">เลขที่</span><span className="font-bold text-primary-700">{model.refNo}</span>
              <span className="text-slate-500">วันที่</span><span>{model.dateLabel}</span>
              <span className="text-slate-500">ใช้ได้ถึง</span><span>{model.validUntil}</span>
              <span className="text-slate-500">ลูกค้า</span><span className="font-semibold">{model.buyerName || "—"}{model.juristic ? " (นิติบุคคล)" : ""}</span>
              {(model.buyerPhone || model.salesName) && <><span className="text-slate-500">ติดต่อ</span><span>{model.salesName || "—"} {model.salesTel ? `· ${model.salesTel}` : ""}</span></>}
            </div>
          </div>
        </div>

        <p className="text-[11px] font-semibold text-primary-700">{model.packageLabel}</p>

        {model.view === "compare" ? <CompareTable model={model} /> : <LineItems model={model} t={t} />}

        {/* Customs add-on info (compare-mode list / calc shows it as line items already) */}
        {model.view === "compare" && model.showCustomsInfo && (
          <div className="rounded-lg border border-slate-200 p-3 space-y-1.5">
            <p className="text-[12px] font-bold">📦 {CUSTOMS_ADDON.title}</p>
            <table className="w-full text-[11.5px]">
              <tbody>
                {CUSTOMS_ADDON.costs.map((c, i) => (
                  <tr key={i} className="border-t border-slate-100"><td className="py-1">{c.label}</td><td className="py-1 text-right font-mono font-semibold whitespace-nowrap">฿{BAHT(c.amount)}</td><td className="py-1 pl-2 text-[11px] text-slate-400 whitespace-nowrap">{c.note}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="text-[12px] font-bold text-primary-700">✅ {CUSTOMS_ADDON.summary}</p>
          </div>
        )}

        {model.juristic && (
          <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-[12px] text-blue-900">
            ลูกค้านิติบุคคล — <b>หัก ณ ที่จ่าย 1%</b> จากค่าบริการ{model.view === "calc" ? " (คำนวณในยอดสุทธิแล้ว)" : ""}
          </div>
        )}

        {model.conditions.length > 0 && <Section title="เงื่อนไขแพ็คเกจ">{model.conditions.map((c, i) => <li key={i}>{c}</li>)}</Section>}
        <Section title="📌 หมายเหตุ">{model.notes.map((n, i) => <li key={i}>{n}</li>)}</Section>
        <Section title="วิธีการใช้บริการ">{QUOTE_HOW_TO.map((s, i) => <li key={i}>{s.text}{s.link && <span className="ml-1 text-primary-600 break-all">{s.link}</span>}</li>)}</Section>
        {model.extraNote && <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-900 whitespace-pre-wrap">{model.extraNote}</div>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-slate-200 pt-3 text-[11px] text-slate-600">
          <div><p className="font-bold text-slate-800">💳 ชำระเงิน</p><p>{BANK.name} ({BANK.accountType})</p><p className="font-mono font-bold">{BANK.accountNumber}</p><p>{BANK.accountName}</p></div>
          <div className="sm:text-right flex flex-col gap-0.5"><span>📞 CS {CONTACT.phoneCsDisplay} · ☎️ {SELLER.phone}</span><span>✉️ {SELLER.email}</span><span className="text-primary-600">LINE: {SOCIAL.line}</span></div>
        </div>
      </div>
    </div>
  );
}

function CompareTable({ model }: { model: QuoteModel }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <table className="w-full text-[11px] sm:text-[12px]">
        <thead className="bg-slate-800 text-white text-[11px]">
          <tr><th className="px-2 sm:px-3 py-1.5 text-left font-semibold">โกดัง</th><th className="px-2 sm:px-3 py-1.5 text-left font-semibold">ทางรถ 🚛</th><th className="px-2 sm:px-3 py-1.5 text-left font-semibold">ทางเรือ 🚢</th></tr>
        </thead>
        <tbody>
          {model.compareRows.map((r, i) => (
            <tr key={i} className="border-t border-slate-100 align-top">
              <td className="px-2 sm:px-3 py-2 font-semibold whitespace-nowrap">{r.warehouse}</td>
              <td className="px-2 sm:px-3 py-2"><RateCell r={r.truck} extraDays={r.isYiwu ? "+2–3 วัน" : undefined} /></td>
              <td className="px-2 sm:px-3 py-2"><RateCell r={r.ship} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RateCell({ r, extraDays }: { r: PackageRate; extraDays?: string }) {
  return (
    <div>
      <div className="font-mono font-bold text-primary-700">฿{BAHT(r.cbm)}<span className="text-[11px] font-normal text-slate-500">/คิว</span></div>
      <div className="font-mono text-[11px]">฿{BAHT(r.kg)}<span className="text-[11px] text-slate-500">/กก.</span></div>
      <div className="text-[11px] text-slate-500">{r.days}{extraDays ? ` ${extraDays}` : ""}</div>
    </div>
  );
}

function LineItems({ model, t }: { model: QuoteModel; t: QuoteModel["totals"] }) {
  return (
    <>
      <p className="text-[11px] text-slate-500">{model.routeLabel}{model.density != null ? ` · คิดตาม ${model.basisLabel}` : ""}</p>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-[11px] sm:text-[12px]">
          <thead className="bg-slate-800 text-white text-[11px]">
            <tr><th className="px-2 sm:px-2.5 py-1.5 text-left font-semibold">รายการ</th><th className="px-1.5 sm:px-2 py-1.5 text-right font-semibold whitespace-nowrap">จำนวน</th><th className="hidden sm:table-cell px-2 py-1.5 text-right font-semibold">ราคา/หน่วย</th><th className="px-2 sm:px-2.5 py-1.5 text-right font-semibold">จำนวนเงิน</th><th className="px-1 sm:px-1.5 py-1.5 text-center font-semibold">VAT</th></tr>
          </thead>
          <tbody>
            {model.lines.map((l, i) => (
              <tr key={i} className="border-t border-slate-100 align-top">
                <td className="px-2 sm:px-2.5 py-1.5">{i + 1}. {l.desc}</td>
                <td className="px-1.5 sm:px-2 py-1.5 text-right text-slate-500 whitespace-nowrap">{l.qtyLabel}</td>
                <td className="hidden sm:table-cell px-2 py-1.5 text-right font-mono">{THB(l.price)}</td>
                <td className="px-2 sm:px-2.5 py-1.5 text-right font-mono font-semibold">{THB(l.amount)}</td>
                <td className="px-1 sm:px-1.5 py-1.5 text-center text-[11px] text-slate-400">{l.vat ? "7%" : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <table className="text-[12px] w-full sm:w-auto sm:min-w-[260px]">
          <tbody>
            <Row label="มูลค่าไม่มี/ยกเว้นภาษี" v={t.subtotalNoVat} />
            <Row label="มูลค่าที่คำนวณภาษี" v={t.subtotalVat} />
            <Row label="ภาษีมูลค่าเพิ่ม 7%" v={t.vatAmount} />
            <tr className="border-t border-slate-300"><td className="px-2 py-1.5 font-bold">รวมเป็นเงิน</td><td className="px-2 py-1.5 text-right font-mono font-black text-primary-700 text-[15px]">฿{THB(t.grandTotal)}</td></tr>
            {t.whtAmount > 0 && <Row label="หัก ณ ที่จ่าย 1%" v={-t.whtAmount} />}
            {t.whtAmount > 0 && <tr className="bg-slate-800 text-white"><td className="px-2 py-1.5 font-bold">ยอดชำระสุทธิ</td><td className="px-2 py-1.5 text-right font-mono font-black text-[15px]">฿{THB(t.netPayable)}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Row({ label, v }: { label: string; v: number }) {
  return <tr><td className="px-2 py-1 text-slate-500">{label}</td><td className="px-2 py-1 text-right font-mono">{THB(v)}</td></tr>;
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return <div><p className="text-[12px] font-bold text-slate-900 mb-1">{title}</p><ul className="list-disc pl-5 text-[12px] text-slate-700 space-y-0.5">{children}</ul></div>;
}

// ── plain text (คัดลอก) ───────────────────────────────────────────────────
function buildQuoteText(m: QuoteModel): string {
  const L: string[] = [];
  L.push(`🚛🚢 ${QUOTE_HEADER}`);
  L.push(`ใบเสนอราคา — PACRED (${m.refNo}) · วันที่ ${m.dateLabel} · ใช้ได้ถึง ${m.validUntil}`);
  L.push(`เรียน: ${m.buyerName || "ลูกค้า"}${m.juristic ? " (นิติบุคคล)" : ""}`);
  L.push(m.packageLabel);
  L.push("");
  if (m.view === "compare") {
    L.push("เทียบราคา (บาท/คิว · บาท/กก. · ระยะเวลา):");
    m.compareRows.forEach((r) => {
      L.push(` • ${r.warehouse} · รถ ฿${BAHT(r.truck.cbm)}/คิว ฿${BAHT(r.truck.kg)}/กก. (${r.truck.days}${r.isYiwu ? " +2–3 วัน" : ""})`);
      L.push(`            เรือ ฿${BAHT(r.ship.cbm)}/คิว ฿${BAHT(r.ship.kg)}/กก. (${r.ship.days})`);
    });
    if (m.showCustomsInfo) {
      L.push("");
      L.push(`📦 ${CUSTOMS_ADDON.title}`);
      CUSTOMS_ADDON.costs.forEach((c) => L.push(` • ${c.label}: ฿${BAHT(c.amount)} ${c.note ?? ""}`.trimEnd()));
      L.push(` ✅ ${CUSTOMS_ADDON.summary}`);
    }
  } else {
    if (m.density != null) L.push(`ความหนาแน่น ${QTY(round2(m.density))} กก./คิว (ค่าเทียบ ${m.comparison}) → บิลตาม ${m.basisLabel}`);
    m.lines.forEach((l, i) => L.push(`${i + 1}. ${l.desc} [${l.qtyLabel} × ฿${THB(l.price)}] = ฿${THB(l.amount)}${l.vat ? " (VAT)" : ""}`));
    L.push("");
    L.push(`รวมเป็นเงิน ฿${THB(m.totals.grandTotal)}`);
    if (m.totals.whtAmount > 0) { L.push(`หัก ณ ที่จ่าย 1% ฿${THB(m.totals.whtAmount)}`); L.push(`ยอดชำระสุทธิ ฿${THB(m.totals.netPayable)}`); }
  }
  if (m.juristic && m.view === "compare") L.push("• ลูกค้านิติบุคคล: หัก ณ ที่จ่าย 1% จากค่าบริการ");
  if (m.conditions.length) { L.push(""); L.push("เงื่อนไขแพ็คเกจ:"); m.conditions.forEach((c) => L.push(` • ${c}`)); }
  L.push("");
  L.push("📌 หมายเหตุ:");
  m.notes.forEach((n) => L.push(` • ${n}`));
  if (m.extraNote) { L.push(""); L.push(m.extraNote); }
  L.push("");
  L.push(`💳 ${BANK.name} (${BANK.accountType}) ${BANK.accountNumber} · ${BANK.accountName}`);
  L.push(`📞 CS ${CONTACT.phoneCsDisplay} · ☎️ ${SELLER.phone} · ✉️ ${SELLER.email} · LINE ${SOCIAL.line}`);
  return L.join("\n");
}

// ── Peak A4 print HTML ────────────────────────────────────────────────────
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function buildPrintHtml(m: QuoteModel): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const t = m.totals;
  const li = (items: string[]) => items.map((i) => `<li>${esc(i)}</li>`).join("");

  let body = "";
  if (m.view === "compare") {
    const rows = m.compareRows
      .map((r) => `<tr><td class="b">${esc(r.warehouse)}</td>
        <td>${BAHT(r.truck.cbm)}<small>/คิว</small> · ${BAHT(r.truck.kg)}<small>/กก.</small><br><span class="mut">${esc(r.truck.days)}${r.isYiwu ? " +2–3 วัน" : ""}</span></td>
        <td>${BAHT(r.ship.cbm)}<small>/คิว</small> · ${BAHT(r.ship.kg)}<small>/กก.</small><br><span class="mut">${esc(r.ship.days)}</span></td></tr>`)
      .join("");
    body = `<table class="items"><thead><tr><th>โกดัง</th><th>ทางรถ 🚛</th><th>ทางเรือ 🚢</th></tr></thead><tbody>${rows}</tbody></table>`;
    if (m.showCustomsInfo) {
      body += `<div class="box" style="margin-top:8px"><p class="b">📦 ${esc(CUSTOMS_ADDON.title)}</p><table class="cost">${CUSTOMS_ADDON.costs.map((c) => `<tr><td>${esc(c.label)}</td><td class="r b">${BAHT(c.amount)}</td><td class="mut">${esc(c.note ?? "")}</td></tr>`).join("")}</table><p class="b red">✅ ${esc(CUSTOMS_ADDON.summary)}</p></div>`;
    }
  } else {
    const rows = m.lines.map((l, i) => `<tr><td>${i + 1}. ${esc(l.desc)}</td><td class="c">${esc(l.qtyLabel)}</td><td class="r">${THB(l.price)}</td><td class="r b">${THB(l.amount)}</td><td class="c mut">${l.vat ? "7%" : "-"}</td></tr>`).join("");
    const whtRows = t.whtAmount > 0 ? `<tr><td>หัก ณ ที่จ่าย 1%</td><td class="r">${THB(t.whtAmount)}</td></tr><tr class="net"><td>ยอดชำระสุทธิ</td><td class="r">${THB(t.netPayable)} บาท</td></tr>` : "";
    body = `<div class="mut" style="font-size:9px;margin-bottom:4px">${esc(m.routeLabel)}${m.density != null ? ` · ความหนาแน่น ${QTY(round2(m.density))} กก./คิว → บิลตาม ${esc(m.basisLabel)}` : ""}</div>
      <table class="items"><thead><tr><th>รายการ</th><th class="c" style="width:80px">จำนวน</th><th class="r" style="width:80px">ราคา/หน่วย</th><th class="r" style="width:90px">จำนวนเงิน</th><th class="c" style="width:34px">VAT</th></tr></thead><tbody>${rows}</tbody></table>
      <table class="sum"><tr><td class="mut">มูลค่าไม่มี/ยกเว้นภาษี</td><td class="r">${THB(t.subtotalNoVat)}</td></tr>
        <tr><td class="mut">มูลค่าที่คำนวณภาษี</td><td class="r">${THB(t.subtotalVat)}</td></tr>
        <tr><td class="mut">ภาษีมูลค่าเพิ่ม 7%</td><td class="r">${THB(t.vatAmount)}</td></tr>
        <tr class="gt"><td>รวมเป็นเงิน</td><td class="r">${THB(t.grandTotal)} บาท</td></tr>${whtRows}</table>`;
  }

  const juristicNote = m.juristic ? `<div class="blue">ลูกค้านิติบุคคล — หัก ณ ที่จ่าย 1% จากค่าบริการ${m.view === "calc" ? " (คำนวณในยอดสุทธิแล้ว)" : ""}</div>` : "";
  const conditions = m.conditions.length ? `<p class="h">เงื่อนไขแพ็คเกจ</p><ul>${li(m.conditions)}</ul>` : "";
  const howTo = `<p class="h">วิธีการใช้บริการ</p><ul>${QUOTE_HOW_TO.map((s) => `<li>${esc(s.text)}${s.link ? ` <span class="lk">${esc(s.link)}</span>` : ""}</li>`).join("")}</ul>`;
  const extra = m.extraNote ? `<div class="amber">${esc(m.extraNote)}</div>` : "";

  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ใบเสนอราคา ${esc(m.refNo)}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0;font-family:'Sarabun','Prompt',sans-serif}
body{font-size:11px;color:#1a1a1a;padding:24px}.doc{max-width:760px;margin:0 auto}
.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #b30000;padding-bottom:10px;margin-bottom:12px}
.top img{height:44px}.ti{font-size:22px;font-weight:800;color:#b30000;text-align:right}.bs{font-size:9px;color:#666}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px}
.box{border:0.5px solid #ccc;border-radius:4px;padding:7px 9px;line-height:1.5}.box .t{font-weight:700;color:#333}
.mut{color:#777}.mono{font-family:monospace}.b{font-weight:700}.r{text-align:right}.c{text-align:center}.red{color:#b30000}
table{width:100%;border-collapse:collapse}small{font-size:8px;color:#777}
.items{margin:6px 0;font-size:10.5px}.items th{background:#1a1a1a;color:#fff;padding:5px 8px;text-align:left;font-size:9.5px}.items td{border:0.5px solid #ddd;padding:5px 8px;vertical-align:top}
.cost td{padding:4px 0;border-top:0.5px solid #eee;font-size:10px}
.sum{width:300px;margin-left:auto;font-size:11px;margin-top:6px}.sum td{padding:4px 8px;border:0.5px solid #eee}
.sum .gt td{border-top:1px solid #999;font-weight:800;color:#b30000;font-size:14px}.sum .net td{background:#1a1a1a;color:#fff;font-weight:800;font-size:13px}
.h{font-size:11px;font-weight:800;margin:10px 0 3px}ul{padding-left:18px;margin:3px 0}li{margin:1.5px 0}.lk{color:#b30000}
.amber{background:#fffbeb;border:0.5px solid #fde68a;border-radius:4px;padding:7px 9px;margin:8px 0;white-space:pre-wrap}
.blue{background:#eff6ff;border:0.5px solid #bfdbfe;border-radius:4px;padding:6px 9px;margin:8px 0;font-weight:600}
.pay{display:grid;grid-template-columns:1fr 1fr;gap:10px;border-top:1px solid #eee;margin-top:10px;padding-top:8px;font-size:10px;color:#555}
.sign{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:14px}.sign .s{border:0.5px solid #ccc;border-radius:4px;min-height:54px;padding:5px;text-align:center;font-size:8px;color:#888;display:flex;flex-direction:column;justify-content:flex-end}
@page{size:A4;margin:12mm}@media print{body{padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body><div class="doc">
  <div class="top"><img src="${origin}${LOGO}" alt="Pacred"><div><div class="ti">ใบเสนอราคา</div><div class="bs r">Quotation</div></div></div>
  <div class="grid">
    <div class="box"><div class="t">ผู้ขาย</div>${esc(SELLER.nameTh)}<br><span class="mut">${esc(SELLER.address)}</span><br><span class="mut mono">เลขภาษี ${esc(SELLER.taxId)}</span><br><span class="mut">โทร ${esc(SELLER.phone)} · ${esc(SELLER.email)}</span></div>
    <div class="box"><table><tr><td class="mut" style="width:34%">เลขที่</td><td class="b" style="color:#b30000">${esc(m.refNo)}</td></tr>
      <tr><td class="mut">วันที่</td><td>${esc(m.dateLabel)}</td></tr><tr><td class="mut">ใช้ได้ถึง</td><td>${esc(m.validUntil)}</td></tr>
      <tr><td class="mut">ลูกค้า</td><td class="b">${esc(m.buyerName || "—")}${m.juristic ? " (นิติบุคคล)" : ""}</td></tr>
      <tr><td class="mut">ติดต่อ</td><td>${esc(m.salesName || "—")} ${m.salesTel ? "· " + esc(m.salesTel) : ""}</td></tr></table></div>
  </div>
  <div class="mut" style="font-size:10px;font-weight:700;color:#b30000;margin-bottom:4px">${esc(m.packageLabel)}</div>
  ${body}
  ${juristicNote}
  ${conditions}
  <p class="h">📌 หมายเหตุ</p><ul>${li(m.notes)}</ul>
  ${howTo}
  ${extra}
  <div class="pay"><div><b>💳 ชำระเงิน</b><br>${esc(BANK.name)} (${esc(BANK.accountType)})<br><span class="mono b">${esc(BANK.accountNumber)}</span><br>${esc(BANK.accountName)}</div>
    <div class="r">📞 CS ${esc(CONTACT.phoneCsDisplay)} · ☎️ ${esc(SELLER.phone)}<br>✉️ ${esc(SELLER.email)}<br><span class="lk">LINE ${esc(SOCIAL.line)}</span></div></div>
  <div class="sign"><div class="s">ผู้ออกเอกสาร<br>(ผู้ขาย)</div><div class="s">ผู้อนุมัติ<br>(ผู้ขาย)</div><div class="s">ผู้รับเอกสาร<br>(ลูกค้า)</div></div>
</div>
<script>(function(){var p=false;function go(){if(p)return;p=true;window.focus();window.print();}if(document.fonts&&document.fonts.ready){document.fonts.ready.then(go);}setTimeout(go,1200);})();</script>
</body></html>`;
}
