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

import { useMemo, useState } from "react";
import { Copy, Printer, Check, Calculator, LayoutList, Link2 } from "lucide-react";
import { calcFreight, calcQuoteTotals, round2 } from "@/lib/quote/cargo-quote-calc";
import {
  CARGO_PROMO_PACKAGES, CUSTOMS_ADDON, DEFAULT_COMPARISON, MIN_CHARGE, MODE_LABEL,
  MODE_KEYS, QUOTE_NOTES, WAREHOUSE_KEYS, WAREHOUSE_LABEL,
  rateFor, type CargoPromoPackage, type QuoteMode, type WarehouseKey,
} from "@/lib/quote/cargo-promo-packages";
// Shared render + serializers — the admin card AND the public /q/[token] page
// render byte-identically from the same QuoteModel (mirrors receipt-paper.tsx).
import {
  QuoteCard, buildQuoteText, buildPrintHtml,
  type QuoteModel, type View, type DisplayLine, type CompareRow,
} from "@/components/quote/quote-paper";
import { saveQuotationForShare } from "@/actions/admin/save-quotation";

const JURISTIC_WHT = 0.01;

const THB = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const BAHT = (n: number) => n.toLocaleString("th-TH");
const QTY = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 3 });

const pad = (n: number) => (n < 10 ? `0${n}` : String(n));

export function QuoteTab({
  customerName,
  userid,
  comparisonValue = 0,
  buyerTaxId: buyerTaxIdInit = "",
  buyerAddress: buyerAddressInit = "",
  buyerIsJuristic = false,
  buyerPhone: buyerPhoneInit = "",
}: {
  customerName: string;
  userid: string;
  comparisonValue?: number;
  /** Registered corporate tax id (juristic) — seeds the buyer block (default ''). */
  buyerTaxId?: string;
  /** Registered company address (juristic) — seeds the buyer block (default ''). */
  buyerAddress?: string;
  /** True = juristic → the นิติบุคคล/WHT-1% toggle + buyer defaults start filled. */
  buyerIsJuristic?: boolean;
  /** Customer phone — seeds the buyer phone (default ''). */
  buyerPhone?: string;
}) {
  const [view, setView] = useState<View>("compare");
  const [pkgId, setPkgId] = useState(CARGO_PROMO_PACKAGES[0].id);
  const [licensed, setLicensed] = useState(false);
  // Juristic default from the resolved customer identity (was hardcoded false →
  // the rep had to know + tick it). Admin can still toggle.
  const [juristic, setJuristic] = useState(buyerIsJuristic);

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
  // Buyer block seeded from the resolved billing identity: for a juristic
  // customer `customerName` is already the COMPANY name, and the tax id +
  // registered address are pre-filled (were blank → rep typed them by hand).
  const [buyerName, setBuyerName] = useState(customerName || "");
  const [buyerTaxId, setBuyerTaxId] = useState(buyerTaxIdInit);
  const [buyerAddress, setBuyerAddress] = useState(buyerAddressInit);
  const [buyerPhone, setBuyerPhone] = useState(buyerPhoneInit);
  const [salesName, setSalesName] = useState("");
  const [salesTel, setSalesTel] = useState("");
  const [extraNote, setExtraNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  // public share-link state (mirror of `copied` — the link is the receipt /r/[token] twin)
  const [linking, setLinking] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

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
      view, refNo, customerCode: userid, dateLabel: today.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" }), validUntil,
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
    refNo, validUntil, buyerName, buyerTaxId, buyerAddress, buyerPhone, salesName, salesTel, extraNote, today, userid, showCustomsInfo]);

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

  // Persist the current quotation snapshot → get a public share-link the sales
  // rep sends to the customer (who opens /q/[token] WITHOUT login). Mirrors how
  // the receipt /r/[token] link works: the saved row's id is wrapped in an
  // unguessable HMAC token; the public page re-renders the STORED payload.
  async function shareLink() {
    setLinking(true);
    setActionMsg(null);
    try {
      const res = await saveQuotationForShare({ userid, refNo: model.refNo, payload: model });
      if (!res.ok || !res.data?.token) {
        setActionMsg(res.ok ? "สร้างลิงก์ไม่สำเร็จ" : `สร้างลิงก์ไม่สำเร็จ — ${res.error}`);
        return;
      }
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const url = `${origin}/q/${res.data.token}`;
      setShareUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2500);
      } catch {
        // Clipboard blocked — still show the URL so the rep can copy it manually.
        setActionMsg("คัดลอกลิงก์อัตโนมัติไม่ได้ — คัดลอกลิงก์ด้านล่างด้วยมือ");
      }
    } catch {
      setActionMsg("สร้างลิงก์ไม่สำเร็จ — ลองใหม่อีกครั้ง");
    } finally {
      setLinking(false);
    }
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
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={copyText} disabled={calcEmpty} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium hover:bg-surface-alt disabled:opacity-50">
            {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}{copied ? "คัดลอกแล้ว" : "คัดลอกเป็นข้อความ"}
          </button>
          <button type="button" onClick={shareLink} disabled={calcEmpty || linking} className="inline-flex items-center gap-1.5 rounded-lg border border-primary-300 bg-primary-50 text-primary-700 px-3 py-1.5 text-[12px] font-semibold hover:bg-primary-100 disabled:opacity-50">
            {linkCopied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Link2 className="w-3.5 h-3.5" />}
            {linking ? "กำลังสร้างลิงก์…" : linkCopied ? "คัดลอกลิงก์แล้ว" : "คัดลอกลิงก์ให้ลูกค้า"}
          </button>
          <button type="button" onClick={printQuote} disabled={calcEmpty} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 text-white px-3 py-1.5 text-[12px] font-semibold hover:bg-primary-700 disabled:opacity-50">
            <Printer className="w-3.5 h-3.5" /> พิมพ์ / บันทึก PDF
          </button>
        </div>
      </div>
      {shareUrl && (
        <div className="rounded-lg border border-primary-200 bg-primary-50/60 px-3 py-2 text-[12px] text-primary-900 flex flex-wrap items-center gap-2">
          <span className="font-semibold whitespace-nowrap">🔗 ลิงก์ให้ลูกค้า (เปิดดูได้โดยไม่ต้องล็อกอิน):</span>
          <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="font-mono break-all underline hover:text-primary-700">{shareUrl}</a>
        </div>
      )}
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

// ── QuoteCard + buildQuoteText + buildPrintHtml → extracted to
//    components/quote/quote-paper.tsx (shared with the public /q/[token] page).
