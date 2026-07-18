"use client";

/**
 * ใบเสนอราคา tab — cargo LCL quotation (owner ปอน 2026-06-21, simplified v3).
 *
 * Two modes, clean UI (2026-07-10 ปอน — the two doc-type NAMES were swapped:
 * the rate-comparison IS the price offer = ใบเสนอราคา; the specific line-item calc
 * is the assessment = ใบประเมินราคา. The `view` VALUES keep their content/payload):
 *  • 📋 ใบเสนอราคา (default · view=compare) — new customers don't know CBM/KG
 *    yet, so this just COMPARES the rates side-by-side (กว่างโจว/อี้อู × รถ/เรือ) for
 *    the chosen package + conditions → a ready-to-send price offer, no numbers needed.
 *  • 🧮 ใบประเมินราคา (view=calc) — when CBM/KG are known: density (ค่าเทียบ) billing → a Peak
 *    line-item assessment with VAT/WHT totals.
 * นิติบุคคล toggle → หัก ณ ที่จ่าย 1% auto. อี้อู·รถ +600 is folded into the rate
 * (5,500), not a condition. Pacred logo. Pure client, no DB write (prod-safe).
 */

import { useMemo, useState } from "react";
import { Copy, Printer, Check, Link2, RotateCcw, FileCheck2 } from "lucide-react";
import { calcFreight, calcQuoteTotals, round2 } from "@/lib/quote/cargo-quote-calc";
import {
  CARGO_PROMO_PACKAGES, CUSTOMS_ADDON, DEFAULT_COMPARISON, MIN_CHARGE, MODE_LABEL,
  MODE_KEYS, QUOTE_NOTES, WAREHOUSE_KEYS, WAREHOUSE_LABEL,
  rateFor, rateForVariant, type CargoPromoPackage, type QuoteMode, type WarehouseKey,
} from "@/lib/quote/cargo-promo-packages";
// Shared render + serializers — the admin card AND the public /q/[token] page
// render byte-identically from the same QuoteModel (mirrors receipt-paper.tsx).
import {
  buildQuoteText, buildPrintHtml, lockFdaCompareRows,
  type QuoteModel, type View, type DisplayLine, type CompareRow,
} from "@/components/quote/quote-paper";
import { EditableQuoteCard } from "@/components/quote/editable-quote-card";
import { saveQuotationForShare } from "@/actions/admin/save-quotation";
import { adminSaveCustomerRate } from "@/actions/admin/customer-rate";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";
import type { CustomerRateMatrix, ProductId, TransportId, WarehouseId } from "@/lib/admin/customer-rate-tables";
import type { QuoteDefaultGrid } from "@/lib/admin/quote-default-rates-shared";
import type { QuotePackage } from "@/lib/quote/quote-packages-shared";

const JURISTIC_WHT = 0.01;

// The 2 product-category groups shown in the quote's เทียบราคา (mirror the rate
// editor's RATE_ROWS): each row seeds from the customer's configured rate for its
// representative product, and — on write-back — sets BOTH products in the group.
const QUOTE_RATE_GROUPS: { category: string; products: ProductId[]; rep: ProductId }[] = [
  { category: "ทั่วไป · มอก.", products: ["1", "2"], rep: "1" },
  { category: "อย. · พิเศษ", products: ["3", "4"], rep: "3" },
];
const WH_KEY_TO_ID: Record<WarehouseKey, WarehouseId> = { guangzhou: "1", yiwu: "2" };

// อี้อู·ทางรถ ใช้เวลาเพิ่ม 2–3 วัน — พับเข้าช่วง "ระยะเวลา" เลย ไม่เขียน "+2–3" แยก
// (owner 2026-07-10). "5–7 วัน" → "7–10 วัน".
function foldExtraDays(days: string, addLo: number, addHi: number): string {
  const range = days.match(/(\d+)\s*[–-]\s*(\d+)/);
  if (range) {
    return days.replace(/\d+\s*[–-]\s*\d+/, `${parseInt(range[1], 10) + addLo}–${parseInt(range[2], 10) + addHi}`);
  }
  const single = days.match(/\d+/);
  if (single) {
    const n = parseInt(single[0], 10);
    return days.replace(/\d+/, `${n + addLo}–${n + addHi}`);
  }
  return days;
}

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
  matrix,
  generalDefaults,
  quotePackages,
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
  /** The customer's CONFIGURED rate matrix — the เทียบราคา table seeds from this
   *  (per product-category) so the quote shows the real rate, not promo defaults. */
  matrix?: CustomerRateMatrix;
  /** เรท default ใบเสนอราคา = เรททั่วไป tb_rate_g_* (global · หน้า "ตั้งเรทใบเสนอราคา"
   *  · owner ปอน 2026-07-17) — ชั้น default กลาง SVIP ▸ แพ็ก ▸ นี่ ▸ promo/FDA. */
  generalDefaults: QuoteDefaultGrid;
  /** แพ็กเกจใบเสนอราคา (data-driven · owner ปอน 2026-07-18) — dropdown + เรทพรีเซ็ต
   *  ชั้นระหว่าง SVIP ▸ นี่ ▸ ทั่วไป · เลือกแพ็ก = โชว์เรทแพ็ก · ไม่กระทบบิลจริง. */
  quotePackages: QuotePackage[];
}) {
  const [view, setView] = useState<View>("compare");
  // ประเภทบริการ — Cargo เปิดใช้อย่างเดียว · Freight/Clearance เทาไว้ (เร็วๆ นี้ · ปอน 2026-07-03)
  const [service, setService] = useState("cargo");
  const [pkgId, setPkgId] = useState(quotePackages[0]?.id ?? CARGO_PROMO_PACKAGES[0].id);
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
  // แพ็กเกจ config (data-driven) — เรทพรีเซ็ต + ชื่อ + เงื่อนไข + ระยะเวลา (owner ปอน 2026-07-18).
  const qpkg = useMemo<QuotePackage>(() => quotePackages.find((p) => p.id === pkgId) ?? quotePackages[0], [pkgId, quotePackages]);
  const pkgIndex = useMemo(() => { const i = quotePackages.findIndex((p) => p.id === pkgId); return i >= 0 ? i : 0; }, [pkgId, quotePackages]);
  const hasLicensed = !!pkg.licensedRates;
  const effLicensed = licensed && hasLicensed;
  const eff = useMemo(() => {
    const promoEff = rateFor(pkg, effLicensed, warehouse, mode);
    if (effLicensed) return promoEff; // ลิขสิทธิ์ = concept ของ promo (config package ไม่มี)
    const cell = qpkg.rates[WH_KEY_TO_ID[warehouse]][mode === "truck" ? "1" : "2"].general;
    return { cbm: cell.cbm > 0 ? cell.cbm : promoEff.cbm, kg: cell.kg > 0 ? cell.kg : promoEff.kg, days: promoEff.days };
  }, [pkg, qpkg, effLicensed, warehouse, mode]);

  // editable rate (calc mode), seeded from the folded rate
  const [ratePerCbm, setRatePerCbm] = useState(String(eff.cbm));
  const [ratePerKg, setRatePerKg] = useState(String(eff.kg));
  // Re-seed the editable rate when package/warehouse/mode/licensed changes —
  // adjust state DURING render (React's recommended pattern), not a
  // setState-in-effect (which triggers cascading renders).
  const rateKey = `${pkgId}|${effLicensed}|${warehouse}|${mode}`;
  const [prevRateKey, setPrevRateKey] = useState(rateKey);
  if (rateKey !== prevRateKey) {
    setPrevRateKey(rateKey);
    setRatePerCbm(String(eff.cbm));
    setRatePerKg(String(eff.kg));
  }

  // doc / buyer SEED values — the ใบเสนอราคา/ใบประเมิน card is now inline-editable,
  // so these only SEED the auto-model; the rep's inline edits live in `overrides`.
  const today = useMemo(() => new Date(), []);
  const ymd = `${today.getFullYear()}${pad(today.getMonth() + 1)}${pad(today.getDate())}`;
  const refNoSeed = `QT-${userid}-${ymd}`;
  const validUntilSeed = useMemo(() => { const d = new Date(today); d.setDate(d.getDate() + 7); return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }); }, [today]);
  // Buyer block seeded from the resolved billing identity: for a juristic
  // customer `customerName` is already the COMPANY name, and the tax id +
  // registered address are pre-filled.
  const buyerNameSeed = customerName || "";
  const [copied, setCopied] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  // "ออกเอกสาร" gate (ปอน 2026-07-04) — the export buttons + the share-link only
  // appear AFTER the rep issues the document, which persists ONE customer_quotations
  // row (= 1 ครั้ง in ประวัติ). Any later edit reverts to un-issued so what the rep
  // copies/prints/sends always matches the snapshot recorded in history.
  const [issued, setIssued] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const num = (s: string) => { const n = parseFloat(s.replace(/,/g, "").trim()); return Number.isFinite(n) && n >= 0 ? n : 0; };

  const freight = useMemo(() => calcFreight({
    cbm: num(cbm), kg: num(kg), comparison: num(comparison),
    ratePerCbm: num(ratePerCbm), ratePerKg: num(ratePerKg),
    yiwuTruckSurchargePerCbm: 0, isYiwuTruck: false, minCharge: MIN_CHARGE, // surcharge folded into the rate
  }), [cbm, kg, comparison, ratePerCbm, ratePerKg]);

  const autoModel: QuoteModel = useMemo(() => {
    // เทียบราคา — 2 category rows per warehouse (ทั่วไป·มอก. / อย.·พิเศษ), each seeded
    // from the customer's CONFIGURED rate (matrix) for its representative product,
    // falling back to the selected promo package's rate where none is configured.
    // "days" always comes from the promo package (not stored per-customer).
    // อย.·พิเศษ = ล็อกเรทเหมา FDA 7,600/6,600 (owner ปอน 2026-07-18) — override SVIP/แพ็ก/ทั่วไป.
    const compareRows: CompareRow[] = lockFdaCompareRows(WAREHOUSE_KEYS.flatMap((w) => {
      const whId = WH_KEY_TO_ID[w];
      const wh = matrix?.byWarehouse?.[whId];
      const gd = generalDefaults[whId]; // เรท default ใบเสนอราคา (tb_rate_g_* · ต่อทาง '1'รถ/'2'เรือ)
      return QUOTE_RATE_GROUPS.map((g) => {
        // ชั้น default: SVIP (matrix) ▸ เรททั่วไป (generalDefaults · หน้า "ตั้งเรทใบเสนอราคา"
        // = เรทบิลจริง tb_rate_g_*) ▸ promo/FDA hardcoded ต่อแพ็กเกจ (fallback สุดท้าย ·
        // อย.·พิเศษ รหัส 3–4 = เรทเหมา FDA 7,600/6,600 · owner ปอน 2026-07-17).
        const groupKey = g.rep === "3" ? "fda" : "general";
        const variant = g.rep === "3" ? "fda" : effLicensed ? "licensed" : "general";
        const promoTruck = rateForVariant(pkg, variant, w, "truck");
        const promoShip = rateForVariant(pkg, variant, w, "ship");
        // ชั้นแพ็ก (config · owner ปอน 2026-07-18): SVIP ▸ แพ็ก ▸ ทั่วไป ▸ promo · 0/ว่าง = ตกไปทั่วไป.
        const qTruck = qpkg.rates[whId]["1"][groupKey];
        const qShip = qpkg.rates[whId]["2"][groupKey];
        const qc = (v: number) => (v > 0 ? v : undefined);
        const truckDays = qpkg.days.truck || promoTruck.days;
        return {
          warehouse: WAREHOUSE_LABEL[w], isYiwu: w === "yiwu",
          category: g.category, warehouseId: whId, products: [...g.products],
          truck: {
            cbm: wh?.cbm["1"][g.rep] ?? qc(qTruck.cbm) ?? gd["1"][groupKey].cbm ?? promoTruck.cbm,
            kg: wh?.kg["1"][g.rep] ?? qc(qTruck.kg) ?? gd["1"][groupKey].kg ?? promoTruck.kg,
            // อี้อู·ทางรถ: fold the +2–3 transit days into the range (owner 2026-07-10).
            days: w === "yiwu" ? foldExtraDays(truckDays, 2, 3) : truckDays,
          },
          ship: {
            cbm: wh?.cbm["2"][g.rep] ?? qc(qShip.cbm) ?? gd["2"][groupKey].cbm ?? promoShip.cbm,
            kg: wh?.kg["2"][g.rep] ?? qc(qShip.kg) ?? gd["2"][groupKey].kg ?? promoShip.kg,
            days: qpkg.days.ship || promoShip.days,
          },
        };
      });
    }));

    const lines: DisplayLine[] = [];
    if (view === "calc" && (num(cbm) > 0 || num(kg) > 0)) {
      const basisTxt = freight.basis === "kg" ? "น้ำหนัก KG" : "ปริมาตร CBM";
      lines.push({
        desc: `ค่าขนส่งนำเข้า LCL จีน-ไทย · ${WAREHOUSE_LABEL[warehouse]} · ${MODE_LABEL[mode]} · คิดตาม${basisTxt}`,
        qtyLabel: `${QTY(freight.chargeableQty)} ${freight.basis === "kg" ? "กก." : "คิว"}`,
        price: freight.rateUsed, amount: freight.freightBeforeSurcharge, vat: issueTax, whtApplicable: true, discount: 0,
      });
      const topUp = freight.freightTotal > 0 ? round2(freight.freightTotal - freight.freightBeforeSurcharge) : 0;
      if (topUp > 0) lines.push({ desc: `ปรับเป็นค่าขั้นต่ำ ${MIN_CHARGE} บาท / shipment`, qtyLabel: "-", price: topUp, amount: topUp, vat: issueTax, whtApplicable: true, discount: 0 });
      for (const i of [...customs].sort((a, b) => a - b)) {
        const c = CUSTOMS_ADDON.costs[i];
        if (!c) continue;
        lines.push({ desc: c.label, qtyLabel: c.note ?? "1", price: c.amount, amount: c.amount, vat: issueTax && c.vat, whtApplicable: c.vat, discount: 0 });
      }
    }
    const whtRate = juristic ? JURISTIC_WHT : 0;
    const totals = calcQuoteTotals(lines.map((l) => ({ label: l.desc, amount: l.amount, vat: l.vat, whtApplicable: l.whtApplicable })), whtRate);

    return {
      view, service, refNo: refNoSeed, customerCode: userid, dateLabel: today.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" }), validUntil: validUntilSeed,
      buyerName: buyerNameSeed, buyerTaxId: buyerTaxIdInit, buyerAddress: buyerAddressInit, buyerPhone: buyerPhoneInit, salesName: "", salesTel: "",
      packageLabel: `แพ็คเกจที่ ${pkgIndex + 1}: ${qpkg.name}${effLicensed ? " · สินค้าลิขสิทธิ์" : ""}`,
      juristic, compareRows,
      routeLabel: `${WAREHOUSE_LABEL[warehouse]} · ${MODE_LABEL[mode]}${freight.density != null ? ` · คิดตาม ${freight.basis === "kg" ? "น้ำหนัก (KG)" : "ปริมาตร (CBM)"}` : ""}`,
      density: freight.density, basisLabel: freight.basis === "kg" ? "น้ำหนัก (KG)" : "ปริมาตร (CBM)",
      comparison: num(comparison) > 0 ? num(comparison) : DEFAULT_COMPARISON,
      lines, totals, showCustomsInfo,
      conditions: qpkg.conditions.length ? qpkg.conditions : pkg.conditions, notes: QUOTE_NOTES, extraNote: "",
    };
  }, [view, service, pkg, qpkg, pkgIndex, effLicensed, warehouse, mode, cbm, kg, comparison, freight, customs, issueTax, juristic,
    refNoSeed, validUntilSeed, buyerNameSeed, buyerTaxIdInit, buyerAddressInit, buyerPhoneInit, today, userid, showCustomsInfo, matrix, generalDefaults]);

  // The rep's inline edits — a field-level override merged over the auto-model.
  // Calc-derived fields (lines · compareRows · route · package · conditions) are
  // dropped when a calc INPUT changes so they regenerate; text edits (buyer ·
  // meta · notes) survive. (ปอน 2026-07-04 — PEAK-style editable ใบเสนอราคา.)
  const [overrides, setOverrides] = useState<Partial<QuoteModel>>({});
  const calcKey = `${view}|${pkgId}|${effLicensed}|${warehouse}|${mode}|${cbm}|${kg}|${comparison}|${[...customs].sort((a, b) => a - b).join(",")}|${issueTax}|${juristic}|${ratePerCbm}|${ratePerKg}|${showCustomsInfo}`;
  const [prevCalcKey, setPrevCalcKey] = useState(calcKey);
  if (calcKey !== prevCalcKey) {
    setPrevCalcKey(calcKey);
    setIssued(false); // changing a calc input means the issued snapshot is stale
    setOverrides((o) => {
      const next = { ...o };
      delete next.lines; delete next.compareRows; delete next.routeLabel;
      delete next.basisLabel; delete next.packageLabel; delete next.conditions;
      return next;
    });
  }

  // Effective model = seed ⊕ edits, with totals recomputed from the effective lines.
  const merged = { ...autoModel, ...overrides } as QuoteModel;
  const model: QuoteModel = {
    ...merged,
    totals: merged.view === "calc"
      ? calcQuoteTotals(merged.lines.map((l) => ({ label: l.desc, amount: l.amount, vat: l.vat, whtApplicable: l.whtApplicable })), juristic ? JURISTIC_WHT : 0)
      : merged.totals,
  };
  // An inline edit both records the override AND un-issues (the recorded snapshot
  // no longer matches the doc → the rep must re-issue to log/send the new version).
  const patchModel = (p: Partial<QuoteModel>) => { setOverrides((o) => ({ ...o, ...p })); setIssued(false); };
  const hasEdits = Object.keys(overrides).length > 0;

  // ── write-back: save the edited เทียบราคา rows into the customer's CONFIGURED
  // rate (tb_rate_custom_*) — explicit button + confirm (§0f · owner 2026-07-10).
  // Each category row sets BOTH its products (ทั่วไป·มอก. → 1,2 · อย.·พิเศษ → 3,4),
  // so the group ends up "ราคาเดียวกัน". Only the auto-seeded rows (carrying
  // warehouseId + products) write back; a manually-added row is skipped.
  const { confirm: confirmRate, dialogs: rateDialogs } = useConfirmDialogs();
  const [savingRates, setSavingRates] = useState(false);
  const [rateSaveMsg, setRateSaveMsg] = useState<string | null>(null);
  const whShortName = (w: WarehouseId) => (w === "1" ? "กวางโจว" : "อี้อู");

  /**
   * บันทึกเรทเทียบราคา → "เรทตั้งค่าลูกค้า" (เขียน tb_rate_custom_* · re-price ออเดอร์ที่ยังไม่ปิด).
   * คืน true เมื่อบันทึกครบ — ตัวเรียก (saveRateAndIssue) ใช้ตัดสินว่าจะออกเอกสารต่อไหม.
   */
  async function saveCompareToRates(): Promise<boolean> {
    setRateSaveMsg(null);
    const byWh = new Map<WarehouseId, CompareRow[]>();
    for (const r of model.compareRows) {
      if (!r.warehouseId || !r.products?.length) continue; // manually-added row → skip
      const wid = r.warehouseId as WarehouseId;
      byWh.set(wid, [...(byWh.get(wid) ?? []), r]);
    }
    if (byWh.size === 0) { setRateSaveMsg("ไม่มีแถวที่ผูกกับการตั้งค่า (แถวที่เพิ่มเองบันทึกกลับไม่ได้)"); return false; }
    const whNames = [...byWh.keys()].map(whShortName).join(" + ");
    // §0f confirm-before-mutate — ปุ่มเดียวทำ 2 อย่าง (owner ปอน 2026-07-14) → บอกให้ครบทั้งคู่
    const ok = await confirmRate(
      `บันทึกเรทเทียบราคานี้เข้า "เรทตั้งค่าลูกค้า" ${userid} (โกดัง ${whNames}) แล้วออก${docTitle}ต่อ? · ` +
      `ทั่วไป·มอก. และ อย.·พิเศษ จะถูกตั้งเป็นราคาเดียวกันในแต่ละกลุ่ม · ลูกค้ามีเรทเฉพาะตัว · ใช้กับออเดอร์ใหม่`,
    );
    if (!ok) return false;
    setSavingRates(true);
    try {
      const done: string[] = [];
      for (const [wid, rowsForWh] of byWh) {
        const cells: { t: TransportId; p: ProductId; rkg: number; rcbm: number }[] = [];
        for (const r of rowsForWh) {
          for (const p of (r.products as ProductId[])) {
            cells.push({ t: "1", p, rkg: r.truck.kg, rcbm: r.truck.cbm });
            cells.push({ t: "2", p, rkg: r.ship.kg, rcbm: r.ship.cbm });
          }
        }
        if (cells.length !== 8) { setRateSaveMsg(`โกดัง${whShortName(wid)}: ตารางไม่ครบ 2 กลุ่มสินค้า — เพิ่มให้ครบก่อนบันทึก`); return false; }
        const res = await adminSaveCustomerRate({ userid, sourceWarehouse: wid, cells });
        if (!res.ok) { setRateSaveMsg(`โกดัง${whShortName(wid)}: ${res.error}`); return false; }
        done.push(`${whShortName(wid)} ${res.data?.changed ?? 0} ช่อง${res.data?.created ? " (สร้างเรทเฉพาะตัว)" : ""}${res.data?.repriced ? ` · คิดราคาใหม่ ${res.data.repriced}` : ""}`);
      }
      setRateSaveMsg(`✓ บันทึกเข้าเรทลูกค้าแล้ว — ${done.join(" · ")}`);
      return true;
    } finally {
      setSavingRates(false);
    }
  }
  const docEmpty = model.view === "calc" ? model.lines.length === 0 : model.compareRows.length === 0;
  const docTitle = model.view === "calc" ? "ใบประเมินราคา" : "ใบเสนอราคา";
  /** โหมดเทียบราคาเท่านั้นที่บันทึกกลับเข้าเรทลูกค้าได้ (แถวผูกกับโกดัง/กลุ่มสินค้า) */
  const canSaveRates = view === "compare";
  /** ป้ายปุ่ม — ใช้ตัวเดียวกันทั้งปุ่มบน (ในตารางเทียบ) และปุ่มล่าง เพราะเป็นปุ่มเดียวกัน */
  const actionLabel = canSaveRates ? `บันทึกเรท + ออก${docTitle}` : `ออก${docTitle}`;

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
  // ออกเอกสาร — persist the current snapshot as ONE customer_quotations row (= 1
  // ครั้ง in ประวัติ) and reveal the export buttons. Does NOT auto-copy (that's the
  // separate คัดลอกลิงก์ button, which re-uses this URL → no double-count).
  async function issueQuote() {
    if (docEmpty || issuing) return;
    setIssuing(true);
    setActionMsg(null);
    try {
      const res = await saveQuotationForShare({ userid, refNo: model.refNo, payload: model });
      if (!res.ok || !res.data?.token) {
        setActionMsg(res.ok ? "ออกเอกสารไม่สำเร็จ" : `ออกเอกสารไม่สำเร็จ — ${res.error}`);
        return;
      }
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      setShareUrl(`${origin}/q/${res.data.token}`);
      setIssued(true);
    } catch {
      setActionMsg("ออกเอกสารไม่สำเร็จ — ลองใหม่อีกครั้ง");
    } finally {
      setIssuing(false);
    }
  }

  /**
   * ปุ่มเดียว 2 ตำแหน่ง (owner ปอน 2026-07-14: "ให้ปุ่มบันทึกเรท กับ ออกใบเสนอ เป็นปุ่มเดียวกัน ·
   * แยกเป็น 2 ปุ่มตำแหน่งเดิม แต่เป็นปุ่มเดียวกัน") — ปุ่มบนในตารางเทียบราคา กับ ปุ่มล่าง
   * เรียกตัวนี้ตัวเดียวกัน:
   *   โหมดเทียบราคา → บันทึกเข้าเรทลูกค้าก่อน (confirm) แล้วออกเอกสารต่อ
   *   โหมดคำนวณ (ไม่มีเรทให้บันทึก) → ออกเอกสารอย่างเดียวเหมือนเดิม
   * เรทบันทึกไม่ผ่าน/กดยกเลิก → ไม่ออกเอกสาร (กันเอกสารหลุดออกไปทั้งที่เรทยังไม่เข้า).
   */
  async function saveRateAndIssue() {
    if (docEmpty || issuing || savingRates) return;
    if (canSaveRates) {
      const saved = await saveCompareToRates();
      if (!saved) return;
    }
    await issueQuote();
  }

  // Copy the link of the ALREADY-issued snapshot (no re-save → not counted again).
  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    } catch {
      setActionMsg("คัดลอกลิงก์อัตโนมัติไม่ได้ — คัดลอกลิงก์ด้านล่างด้วยมือ");
    }
  }

  const inputCls = "w-full rounded-md border border-border px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500";
  const selectCls = "rounded-md border border-border bg-white dark:bg-surface px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary-500/40";

  return (
    <div className="space-y-3 text-sm">
      {/* Service type (Cargo live · Freight/Clearance เทาไว้) + mode select + juristic */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-2">
          <span className="text-[12px] font-semibold text-foreground whitespace-nowrap">บริการ:</span>
          <select value={service} onChange={(e) => setService(e.target.value)} className={selectCls}>
            <option value="cargo">Cargo</option>
            <option value="freight" disabled>Freight · เร็วๆ นี้</option>
            <option value="clearance" disabled>Clearance · เร็วๆ นี้</option>
          </select>
        </label>
        <label className="inline-flex items-center gap-2">
          <span className="text-[12px] font-semibold text-foreground whitespace-nowrap">รูปแบบ:</span>
          <select value={view} onChange={(e) => setView(e.target.value as View)} className={selectCls}>
            <option value="compare">ใบเสนอราคา</option>
            <option value="calc">ใบประเมินราคา</option>
          </select>
        </label>
        <label className="inline-flex items-center gap-1.5 text-[12px] ml-auto">
          <input type="checkbox" checked={juristic} onChange={(e) => setJuristic(e.target.checked)} className="accent-primary-600" />
          ลูกค้านิติบุคคล (หัก ณ ที่จ่าย 1%)
        </label>
      </div>

      {/* Package — dropdown (keeps the panel compact) */}
      <label className="flex items-center gap-2">
        <span className="text-[12px] font-semibold text-foreground whitespace-nowrap">แพ็คเกจ:</span>
        <select value={pkgId} onChange={(e) => setPkgId(e.target.value)} className={`flex-1 ${selectCls}`}>
          {quotePackages.map((p, i) => (
            <option key={p.id} value={p.id}>แพ็คเกจที่ {i + 1}: {p.name}</option>
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

      {/* Advanced (collapsed) — calc-engine settings only; the document text is
          edited inline on the card below (กดที่ข้อความบนใบได้เลย). */}
      <details className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-2">
        <summary className="cursor-pointer text-[12px] font-semibold text-foreground">ตัวเลือกการคำนวณ (เรท · บริการใบขน · VAT)</summary>
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
          <p className="rounded-md bg-surface-alt/40 px-2.5 py-1.5 text-[11px] text-muted">ℹ️ ข้อมูลเอกสาร (เลขที่ · วันที่ · ลูกค้า · ผู้ติดต่อ · รายการ · หมายเหตุ) แก้ไขได้โดย<b className="text-foreground">กดที่ข้อความบนใบด้านล่างได้เลย</b></p>
        </div>
      </details>

      {/* Actions — ปุ่มหลักชิดขวาเสมอ (ml-auto · justify-between เอาไม่อยู่ตอนบรรทัดตัด).
          ข้อความอธิบายวิธีใช้เอาออกแล้ว (owner ปอน 2026-07-14: "เกะกะ") — ปุ่มบอกตัวเองอยู่แล้ว. */}
      <div className="flex flex-wrap items-center gap-2">
        {hasEdits && (
          <button type="button" onClick={() => setOverrides({})} className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-100">
            <RotateCcw className="w-3 h-3" /> รีเซ็ตการแก้ไข
          </button>
        )}
        {!issued ? (
          <button type="button" onClick={saveRateAndIssue} disabled={docEmpty || issuing || savingRates}
            title={canSaveRates ? "บันทึกเรทที่แก้เข้าเรทลูกค้า แล้วออกเอกสารต่อ (ปุ่มเดียวกับในตารางเทียบราคา)" : undefined}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary-600 text-white px-4 py-2 text-[13px] font-bold shadow-sm hover:bg-primary-700 disabled:opacity-50">
            <FileCheck2 className="w-4 h-4" /> {savingRates ? "กำลังบันทึกเรท…" : issuing ? "กำลังออกเอกสาร…" : actionLabel}
          </button>
        ) : (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md border border-green-200 bg-green-50 px-2 py-1 text-[11px] font-semibold text-green-700">
              <Check className="w-3 h-3" /> ออก{docTitle}แล้ว · บันทึกในประวัติ
            </span>
            <button type="button" onClick={copyText} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium hover:bg-surface-alt">
              {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}{copied ? "คัดลอกแล้ว" : "คัดลอกเป็นข้อความ"}
            </button>
            <button type="button" onClick={copyLink} className="inline-flex items-center gap-1.5 rounded-lg border border-primary-300 bg-primary-50 text-primary-700 px-3 py-1.5 text-[12px] font-semibold hover:bg-primary-100">
              {linkCopied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Link2 className="w-3.5 h-3.5" />}
              {linkCopied ? "คัดลอกลิงก์แล้ว" : "คัดลอกลิงก์ให้ลูกค้า"}
            </button>
            <button type="button" onClick={printQuote} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 text-white px-3 py-1.5 text-[12px] font-semibold hover:bg-primary-700">
              <Printer className="w-3.5 h-3.5" /> พิมพ์ / บันทึก PDF
            </button>
          </div>
        )}
      </div>
      {issued && shareUrl && (
        <div className="rounded-lg border border-primary-200 bg-primary-50/60 px-3 py-2 text-[12px] text-primary-900 flex flex-wrap items-center gap-2">
          <span className="font-semibold whitespace-nowrap">🔗 ลิงก์ให้ลูกค้า (เปิดดูได้โดยไม่ต้องล็อกอิน):</span>
          <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="font-mono break-all underline hover:text-primary-700">{shareUrl}</a>
        </div>
      )}
      {actionMsg && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">{actionMsg}</div>}
      {rateSaveMsg && (
        <div className={`rounded-lg border px-3 py-2 text-[12px] ${rateSaveMsg.startsWith("✓") ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
          {rateSaveMsg}
        </div>
      )}

      {/* ปุ่มในตารางเทียบราคา = ปุ่มเดียวกับปุ่มล่าง (action เดียว · ป้ายเดียว) */}
      <EditableQuoteCard
        model={model}
        onChange={patchModel}
        onSaveToRates={canSaveRates ? saveRateAndIssue : undefined}
        saveToRatesLabel={actionLabel}
        savingToRates={savingRates || issuing}
      />
      {rateDialogs}
    </div>
  );
}

// ── QuoteCard + buildQuoteText + buildPrintHtml → extracted to
//    components/quote/quote-paper.tsx (shared with the public /q/[token] page).
