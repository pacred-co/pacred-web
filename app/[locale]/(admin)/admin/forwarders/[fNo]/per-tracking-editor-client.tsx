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

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { adminUpdateForwarderDimensions } from "@/actions/admin/forwarders-edit";
import {
  adminRenameForwarderTracking,
  adminResetForwarderFamilyFromSource,
} from "@/actions/admin/forwarder-identity";
import { MAO_FLAT_FEE } from "@/lib/forwarder/mao-fee";
import { validateComparisonPricePair } from "@/lib/forwarder/comparison-guard";
import { evaluateRateModeGuard } from "@/lib/forwarder/rate-mode-guard";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";

// PCS number formats — "51,480.00 บาท" + plain N-dp ("1287.00", "3.16171").
const baht = (n: number) => `${n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`;
const nf = (n: number, dp: number) => n.toLocaleString("th-TH", { minimumFractionDigits: dp, maximumFractionDigits: dp });

// Right-column summary row — PCS "label : value บาท".
function Sum({ label, value, negative }: { label: string; value: number; negative?: boolean }) {
  return (
    <p className="flex items-baseline justify-between gap-2">
      <span className="text-muted">{label} :</span>
      <span className={`font-mono tabular-nums ${negative ? "text-red-600" : "text-foreground"}`}>{negative ? "−" : ""}{baht(value)}</span>
    </p>
  );
}

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
  /** '1'-convention row → cbm is already the row TOTAL; else cbm is PER-BOX. */
  volumeIsTotal: boolean;
  productType: "1" | "2" | "3" | "4";
  warehouseChina: "1" | "2";
  warehouseName: "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
  fTransportPrice: number;        // ค่าขนส่งในไทย
  fDiscount: number;              // ส่วนลด
  fTransportPriceChnThb: number;  // ค่าจีน+ ภายหลัง
  priceOther: number;             // ค่าอื่นๆ
  fShippingService: number;       // ค่าบริการ
  priceCrate: number;             // ค่าตีลังไม้ (owner 2026-07-21 · PCS "ค่าตีลัง")
  /** row fstatus — identity fields (แทรคกิ้ง/กล่อง) lock on billed rows (≥6). */
  fstatus: string;
};

type Props = {
  rows: PerTrackingRow[];
  /** เหมาๆ (Pacred PRF) carrier → in-Thailand delivery is the flat ฿100 fee. */
  isMao?: boolean;
  customRateInit: "0" | "1";
  customRateKgInit: number;
  customRateCbmInit: number;
  customComparisonInit: "0" | "1";
  customComparisonValueInit: number;
  /** ภูม 2026-06-19 — everyone may set ค่าเทียบ EXCEPT warehouse staff. When false
   *  the ค่าเทียบ checkbox + input are read-only and seeded from the STORED value. */
  canEditComparison: boolean;
  // ── 2026-06-19 (#1 revise) — the customer's PROFILE/SYSTEM rate, resolved
  // SERVER-SIDE (the client can't reach the rate cards). Used to show the REAL
  // breakdown when the "คิดราคาแบบกำหนดเอง" toggle is OFF (was ฿0). ─────────────
  /** The system unit rate chosen by the waterfall (baht per kg OR per cbm). */
  profileRate?: number;
  /** Which basis the system rate priced on. */
  profileBasis?: "kg" | "cbm";
  /** Σ transportSubtotal across all trackings (the real "ระบบเลือก" amount). */
  profileTransportTotal?: number;
  /** True when no rate card matched the tuple — fall back to the "คำนวณตอนบันทึก" note. */
  profileRateMissing?: boolean;
  /** True once the server actually ran the resolver (vs no userid / empty rows). */
  profileResolved?: boolean;
  // ── 2026-06-20 (#1 refine · owner ภูม) — BOTH per-basis amounts so the
  // "คิดตามน้ำหนัก" line is no longer blank when CBM is the chosen basis. ───────
  /** Σ rowWeight×rowKgRate across trackings (the real คิดตามน้ำหนัก amount) · null = no kg card. */
  profileKgAmount?: number | null;
  /** Σ rowCbm×rowCbmRate across trackings (the real คิดตามปริมาตร amount) · null = no cbm card. */
  profileCbmAmount?: number | null;
  /** uniform kg unit rate to label "× rate" (null = rows differ → omit multiplier). */
  profileKgUnitRate?: number | null;
  /** uniform cbm unit rate to label "× rate" (null = rows differ → omit multiplier). */
  profileCbmUnitRate?: number | null;
  // ── Rate-mode guard (advisory · owner) — the transport mode decoded from the ตู้
  // name + the system ฿/CBM for that mode and the other mode. When the manual
  // "คิดราคาแบบกำหนดเอง" rate looks like the WRONG mode's number, the card shows an
  // amber warning. null → no warning (no ตู้ / air / rate unresolved). ────────────
  /** ตู้-derived transport mode (1=รถ · 2=เรือ · 3=อากาศ) · null = no ตู้/undecodable. */
  derivedMode?: "1" | "2" | "3" | null;
  /** System ฿/CBM for the derived mode. */
  modeExpectedCbmRate?: number | null;
  /** System ฿/CBM for the OTHER mode (null = air / none). */
  modeOtherCbmRate?: number | null;
  // ── หาค่าเทียบ line (ภูม 2026-07-10 · PCS ราคานำเข้า block) ──
  /** order KG/CBM ratio (Σweight ÷ Σcbm) resolved server-side · display fallback. */
  profileKgPerCbm?: number;
  /** the ค่าเทียบ threshold in effect (customer's value or system default 250). */
  profileComparisonValue?: number;
};

const WAREHOUSE_CHINA = [
  { v: "1", label: "กวางโจว" }, { v: "2", label: "อี้อู" },
] as const;
// owner 2026-07-19 "พาร์ทเนอร์ใช้แค่ MOMO+TTW · เจ้าอื่นเอาออก": the picker offers only
// the two live operators. 8=MOMO(กวางโจว) · 9=TTW(อี้อู). Historical rows on a retired
// code (1-7) still store fine; VALID_WH_TH keeps them valid — they just aren't offered.
const WAREHOUSE_TH = [
  { v: "8", label: "MOMO (กวางโจว)" }, { v: "9", label: "TTW (อี้อู)" },
] as const;
const PRODUCT_TYPES = [
  { v: "1", label: "ทั่วไป" }, { v: "2", label: "มอก." }, { v: "3", label: "อย." }, { v: "4", label: "พิเศษ" },
] as const;

// ภูม 2026-06-19 — ค่าเทียบ (1 คิว = N กก.) hard ceiling. Pacred policy: 1 CBM is
// never worth more than 350 kg of freight; a higher value would mis-bill. Everyone
// may set it EXCEPT warehouse staff (enforced where role is known).
const MAX_COMPARISON = 350;

// (W × L × H) / 1,000,000 (cm³ → m³) · 5-dp — the legacy CBM formula.
function cbmFromDims(w: number, l: number, h: number): number {
  return Math.round(((w * l * h) / 1_000_000) * 100_000) / 100_000;
}

const CELL = "h-9 w-full min-w-[68px] rounded-md border border-border bg-white dark:bg-surface px-2 text-sm font-mono text-right focus:border-primary-600 focus:outline-none disabled:bg-slate-50";
const SEL = "h-9 w-full min-w-[88px] rounded-md border border-border bg-white dark:bg-surface px-1.5 text-sm focus:border-primary-600 focus:outline-none disabled:bg-slate-50";
const TH = "px-2 py-1.5 text-[11px] font-semibold text-muted whitespace-nowrap border-r border-border";

export function PerTrackingEditorClient({
  rows: rowsInit,
  isMao = false,
  // customComparisonInit — no longer seeds the checkbox (default UNCHECKED · owner
  // 2026-07-06 locked-pair). Kept in Props for caller compatibility.
  canEditComparison,
  profileRate = 0,
  profileBasis = "cbm",
  profileTransportTotal = 0,
  profileRateMissing = false,
  profileResolved = false,
  profileKgAmount = null,
  profileCbmAmount = null,
  profileKgUnitRate = null,
  profileCbmUnitRate = null,
  derivedMode = null,
  modeExpectedCbmRate = null,
  modeOtherCbmRate = null,
  profileKgPerCbm = 0,
  profileComparisonValue = 0,
}: Props) {
  const router = useRouter();
  const { confirm, dialogs } = useConfirmDialogs();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Per-row recomputed price (keyed by tb_forwarder id) — surfaced after save so
  // the pricer SEES that each tracking priced on its OWN dims (owner ภูม: "ถ้า
  // แต่ละแทคมีขนาดต่างกัน มันจะคิดผิด" → the proof is a different ฿ per row).
  type RowResult = { grandTotal: number; basis: "kg" | "cbm"; frefrate: number };
  const [results, setResults] = useState<Record<number, RowResult>>({});

  // ── ORDER-level shared toggles ──
  // 2026-07-06 (owner) — BOTH override checkboxes now DEFAULT TO UNCHECKED so the
  // CORRECT auto-computed rate (the resolve-rate waterfall · ค่าเทียบ 250) is used
  // first; the seller ticks only when overriding. The two toggles are a LOCKED
  // PAIR: you cannot tick just one — ค่าเทียบ (comparison) must accompany a custom
  // sell price and vice-versa (enforced by the mirrored onChange below + the
  // both-or-neither validation in onSave + server-side). The input fields default
  // to 0 (the seller types only when a box is ticked); the billing D1 guard blocks
  // any ฿0-transport bill so an untyped-but-ticked box can't silently bill 0.
  const [customRate, setCustomRate] = useState<"0" | "1">("0");
  const [customRateKg, setCustomRateKg] = useState<string>("0");
  const [customRateCbm, setCustomRateCbm] = useState<string>("0");
  // ค่าเทียบ — default UNCHECKED too (locked-pair with custom price). Warehouse
  // staff still CANNOT edit it (the input/checkbox stay disabled via
  // !canEditComparison); with the default-off + locked mirror they simply never
  // reach an unpaired custom-price state through the UI.
  const [customComparison, setCustomComparison] = useState<"0" | "1">("0");
  const [comparisonValue, setComparisonValue] = useState<string>("0");

  // owner 2026-07-20 — merged-box auto-tick: typing ANY of the 3 values (เรทกก./
  // เรทCBM/ค่าเทียบ) ticks the box ON; clearing ALL THREE unticks it. Both flags
  // move together (the server's locked-pair guard is unchanged).
  const autoTickCustom = (kg: string, cbm: string, cmp: string) => {
    const any =
      (parseFloat(kg) || 0) > 0 || (parseFloat(cbm) || 0) > 0 || (parseFloat(cmp) || 0) > 0;
    setCustomRate(any ? "1" : "0");
    setCustomComparison(any ? "1" : "0");
  };

  // ── per-tracking rows (string-valued for free typing) ──
  type RowState = {
    id: number; tracking: string; detail: string; boxes: string; volumeIsTotal: boolean;
    productType: PerTrackingRow["productType"];
    warehouseChina: PerTrackingRow["warehouseChina"];
    warehouseName: PerTrackingRow["warehouseName"];
    weight: string; width: string; length: string; height: string; cbm: string;
    fTransportPrice: string; fDiscount: string; fTransportPriceChnThb: string;
    priceOther: string; fShippingService: string; priceCrate: string;
    fstatus: string;
  };
  const [rows, setRows] = useState<RowState[]>(() =>
    rowsInit.map((r) => ({
      id: r.id, tracking: r.tracking, detail: r.detail, boxes: String(r.boxes), volumeIsTotal: r.volumeIsTotal,
      productType: r.productType, warehouseChina: r.warehouseChina, warehouseName: r.warehouseName,
      weight: String(r.weight), width: String(r.width), length: String(r.length),
      height: String(r.height), cbm: String(r.cbm),
      fTransportPrice: String(r.fTransportPrice), fDiscount: String(r.fDiscount),
      fTransportPriceChnThb: String(r.fTransportPriceChnThb), priceOther: String(r.priceOther),
      fShippingService: String(r.fShippingService), priceCrate: String(r.priceCrate),
      fstatus: r.fstatus,
    })),
  );

  // ── 🔓 IDENTITY unlock (owner 2026-07-21 "แก้ เลขแทรคกิ้ง เลขชิปเม้น จำนวนกล่อง
  // ได้ · มี action กดก่อน 1 ชั้น กันมือลั่น/แมวเหยียบคีย์บอร์ด") ──
  // Locked by default: the tracking / เลขชิปเม้น / จำนวนกล่อง fields render read-only
  // until the staff explicitly unlocks (with a confirm). Billed rows (fstatus ≥ 6)
  // NEVER unlock (accounting owns them).
  const [unlocked, setUnlocked] = useState(false);
  const stripSuffix = (t: string) => t.replace(/-\d+(?:\/\d+)?$/, "");
  const initialBase = stripSuffix((rowsInit[0]?.tracking ?? "").trim());
  // per-row original tracking + suffix (for the เลขชิปเม้น base rename compose)
  const origTrackings = useMemo(() => rowsInit.map((r) => r.tracking.trim()), [rowsInit]);
  const origBoxes = useMemo(() => rowsInit.map((r) => r.boxes), [rowsInit]);
  const [baseInput, setBaseInput] = useState(initialBase);
  const rowIsBilled = (r: RowState) => {
    const s = parseInt(r.fstatus, 10);
    return Number.isFinite(s) && s >= 6;
  };
  // เลขชิปเม้น (ฐาน) rename — recompose every row's tracking as newBase + its
  // ORIGINAL suffix ("-2/3" …). Billed rows keep their tracking (server refuses too).
  function onBaseChange(v: string) {
    setBaseInput(v);
    setRows((rs) =>
      rs.map((r, i) => {
        if (rowIsBilled(r)) return r;
        const orig = origTrackings[i] ?? r.tracking;
        const suffix = orig.startsWith(initialBase) ? orig.slice(initialBase.length) : "";
        return { ...r, tracking: `${v.trim()}${suffix}` };
      }),
    );
  }

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

  // ── Live calc preview — faithful copy of the legacy PCS "ราคานำเข้าจีน-ไทย" box
  // (ภูม/พี่ป๊อป 2026-06-18: "ลอกให้เหมือน PCS เป๊ะ · อย่าดริฟ"). ONE box PER แทรคกิง
  // (PCS shows it per forwarder row), with the exact PCS lines: หาค่าเทียบ ÷ ·
  // คิดตามน้ำหนัก/ปริมาตร with the real numbers · ระบบเลือก · the right summary.
  //
  // 2026-06-19 (#1 revise · owner "เรท default profile ให้ดึงมา auto คำนวณมาเลย
  // แจงยอดเท่าไรเลย") — when "คิดราคาแบบกำหนดเอง" is OFF, the breakdown now shows the
  // REAL system/profile-rate numbers (resolved SERVER-SIDE, passed as profile*),
  // not ฿0. The chosen basis line shows the real Σ amount; the other shows "—"
  // (the server resolves only the winning basis). When ON, the typed rate is used
  // exactly as before. A null pKg/pCbm = "ไม่ทราบ" (render "—") for the non-chosen
  // basis under system pricing.
  const calc = useMemo(() => {
    const cr = customRate === "1";
    const rateKg = parseFloat(customRateKg) || 0;
    const rateCbm = parseFloat(customRateCbm) || 0;
    const comparisonOn = customComparison === "1";
    const threshold = parseFloat(comparisonValue) || 0;
    // ยอดรวมทุกแทค (PCS treats the order as one) — sum weight/cbm/adders.
    let w = 0, v = 0, chnThb = 0, service = 0, other = 0, thai = 0, discount = 0, crate = 0;
    for (const r of rows) {
      w += parseFloat(r.weight) || 0;
      // row-TOTAL CBM (famountcount rule) — the cbm INPUT is per-box on a
      // per-box-convention row; summing it raw made ค่าเทียบ = kg/Σper-box (e.g.
      // 261÷0.704 = 370 > 250) → the save flipped a bulky shipment to WEIGHT
      // pricing every time staff hit บันทึกขนาด (owner 2026-07-19 · the revert engine).
      v += (parseFloat(r.cbm) || 0) * (r.volumeIsTotal ? 1 : Math.max(parseInt(r.boxes, 10) || 0, 1));
      chnThb += parseFloat(r.fTransportPriceChnThb) || 0;
      service += parseFloat(r.fShippingService) || 0;
      other += parseFloat(r.priceOther) || 0;
      thai += parseFloat(r.fTransportPrice) || 0;
      discount += parseFloat(r.fDiscount) || 0;
      crate += parseFloat(r.priceCrate) || 0;
    }
    // เหมาๆ (Pacred PRF · owner 2026-06-23): in-Thailand delivery is the flat ฿100 fee.
    // Surface it even when the per-row fTransportPrice hasn't been stamped yet (the
    // save adds it) — max() so a row that already carries the ฿100 isn't doubled.
    if (isMao) thai = Math.max(thai, MAO_FLAT_FEE);
    const kgPerCbm = v !== 0 ? w / v : 0;

    // System/profile rate is usable when manual is OFF, the server ran the
    // resolver, AND a rate card matched (not missing). Then we display the SERVER
    // numbers (no client fabrication). Otherwise (manual OFF + no profile rate)
    // we keep the legacy ฿0 + "คำนวณตอนบันทึก" note.
    const useProfile = !cr && profileResolved && !profileRateMissing && profileRate > 0;

    // pKg / pCbm — null means "ไม่ทราบ" (render "—"). Under manual pricing both
    // are real (typed rate × qty). Under system pricing BOTH lines now show the
    // server-resolved per-basis amounts (owner ภูม 2026-06-20: "คิดตามน้ำหนัก
    // ต้องขึ้นด้วย · คิดตามคิวเป็น default") — a basis with no rate card stays null.
    let pKg: number | null;
    let pCbm: number | null;
    let pKgRate: number | null = null;  // unit rate to label "× rate" (system path)
    let pCbmRate: number | null = null;
    let byWeight: boolean;
    let transport: number;
    if (cr) {
      pKg = w * rateKg;     // whole-order reference: Σweight × rate
      pCbm = v * rateCbm;   // whole-order reference: Σcbm × rate
      if (comparisonOn) {
        // ค่าเทียบ forces ONE basis on the whole order → single-basis whole-order
        // total == the per-line sum on that basis, so this is already correct.
        byWeight = kgPerCbm > threshold;
        transport = byWeight ? pKg : pCbm;
      } else {
        // owner 2026-07-08: ค่าเทียบ 250 = SYSTEM DEFAULT (reverses the 2026-06-23
        // "default CBM"). Even a manual rate without the tick charges DENSE cargo
        // (KGPerCBM > 250) by weight — matching the server so the preview == the save.
        // Fall back to whichever basis has a rate when one is missing (avoid ฿0).
        const dense = kgPerCbm > 250;
        if (dense && rateKg > 0) {
          byWeight = true;
          transport = pKg;
        } else if (rateCbm > 0) {
          byWeight = false;
          transport = pCbm;
        } else {
          byWeight = true;
          transport = pKg;
        }
      }
    } else if (useProfile) {
      // BOTH amounts from the server (computed by the SAME engine the save runs).
      pKg = profileKgAmount;
      pCbm = profileCbmAmount;
      pKgRate = profileKgUnitRate;
      pCbmRate = profileCbmUnitRate;
      // The CHOSEN basis (CBM by default, per ค่าเทียบ) still drives the bill —
      // it's the only one that flows into "ราคารวมสุทธิ".
      byWeight = profileBasis === "kg";
      transport = profileTransportTotal;
    } else {
      pKg = 0;
      pCbm = 0;
      byWeight = comparisonOn ? kgPerCbm > threshold : false;
      transport = 0;
    }
    // ภูม 2026-07-01 — ค่านำเข้าจีน-ไทย ขั้นต่ำ 50 บาท: ของเบา/น้อยที่คำนวณต่ำกว่า 50
    // ยกเป็น 50 (ตรงกับ server floor FORWARDER_IMPORT_MIN_THB ใน resolveLiveForwarderRate
    // ที่ตอนบันทึกจะเขียน 50 → preview กับยอดที่ save ตรงกัน ไม่งง). floor เฉพาะเมื่อมี
    // ยอดจริง (>0) — ยอด 0 (ยังไม่คำนวณ/ไม่มีเรท) ไม่แตะ.
    if (transport > 0 && transport < 50) transport = 50;
    const subtotal = transport + chnThb + service + other + thai + crate;
    // หาค่าเทียบ line — the threshold in effect (custom ค่าเทียบ when ticked, else
    // the resolver's threshold = the customer's ค่าเทียบ or the system default 250).
    const compareThreshold = comparisonOn ? threshold : (profileComparisonValue || 250);
    return {
      cr, useProfile, profileRate, profileBasis,
      rateKg, rateCbm, comparisonOn, threshold, compareThreshold, count: rows.length,
      label: rows.length > 1 ? "รวมทุกแทรคกิง" : (rows[0]?.tracking || "—"),
      w, v, pKg, pCbm, pKgRate, pCbmRate, kgPerCbm, byWeight, transport, chnThb, service, other, thai, discount, crate, net: subtotal - discount,
    };
  }, [
    rows, isMao, customRate, customRateKg, customRateCbm, customComparison, comparisonValue,
    profileResolved, profileRateMissing, profileRate, profileBasis, profileTransportTotal,
    profileKgAmount, profileCbmAmount, profileKgUnitRate, profileCbmUnitRate, profileComparisonValue,
  ]);

  // ภูม 2026-07-01 — ONE save routine, TWO buttons:
  //   • advanceToPayment=true  → "บันทึก + ส่งไปรอชำระเงิน" (the pricer is ready to
  //     bill · legacy auto-advance ถึงไทยแล้ว(4)→รอชำระเงิน(5) when freight>0).
  //   • advanceToPayment=false → "บันทึกขนาด (ยังไม่ส่งรอชำระ)" (warehouse saves the
  //     measurements first · fstatus stays put · no billing). Same measurement +
  //     price-recompute write either way — only the status advance differs (the
  //     action gates it on the advanceToPayment flag it receives).
  async function onSave(advanceToPayment: boolean) {
    setError(null);
    setSuccess(null);
    for (const r of rows) {
      if (
        (parseFloat(r.weight) || 0) < 0 || (parseFloat(r.width) || 0) < 0 ||
        (parseFloat(r.length) || 0) < 0 || (parseFloat(r.height) || 0) < 0
      ) {
        setError(`แทค ${r.tracking}: ค่าทุกช่องต้อง ≥ 0`);
        return;
      }
    }
    // ค่าเทียบ ceiling — block a fat-finger that would mis-bill (ภูม 2026-06-19).
    const cmp = parseFloat(comparisonValue) || 0;
    if (customComparison === "1" && cmp > MAX_COMPARISON) {
      setError(`ค่าเทียบเกินเพดาน — 1 คิว ไม่เกิน ${MAX_COMPARISON} กก. (กรอก ${cmp})`);
      return;
    }
    // owner 2026-07-20 — merged box rule: ติ๊กแล้วต้องกรอกครบทั้ง 3 ค่า
    // (เรท ฿/กก. + เรท ฿/CBM + ค่าเทียบ) ไม่งั้นบันทึกไม่ได้.
    if (customRate === "1") {
      const kg = parseFloat(customRateKg) || 0;
      const cbmRate = parseFloat(customRateCbm) || 0;
      if (!(kg > 0) || !(cbmRate > 0) || !(cmp > 0)) {
        setError(
          "ติ๊ก “คิดราคา + ค่าเทียบ แบบกำหนดเอง” แล้ว ต้องกรอกครบทั้ง 3 ค่า — " +
          `เรท ฿/กก. (${kg || "ว่าง"}) · เรท ฿/CBM (${cbmRate || "ว่าง"}) · ค่าเทียบ (${cmp || "ว่าง"}) — ` +
          "หรือลบให้หมดทุกช่องเพื่อกลับไปใช้เรทระบบ",
        );
        return;
      }
    }
    // 2026-07-06 (owner) — LOCKED PAIR: "คิดราคาแบบกำหนดเอง" (custom sell price) และ
    // "คิดค่าเทียบแบบกำหนดเอง" (ค่าเทียบ) ต้องติ๊กพร้อมกัน หรือไม่ติ๊กทั้งคู่ — ห้ามติ๊ก
    // อันเดียว. ไม่ติ๊กทั้งคู่ = ใช้เรทระบบ (auto logic) · ติ๊กคู่ = กรอกราคาเอง + ค่าเทียบ.
    // Same pure rule the server enforces (lib/forwarder/comparison-guard).
    const pairErr = validateComparisonPricePair(customRate === "1", customComparison === "1", cmp);
    if (pairErr) {
      setError(pairErr);
      return;
    }

    // ── identity edits (unlock-gated · owner 2026-07-21) — collect the renames +
    // box-count changes so the confirm names them and the save applies them FIRST.
    const renames = unlocked
      ? rows
          .map((r, i) => ({ r, orig: origTrackings[i] ?? r.tracking }))
          .filter(({ r, orig }) => !rowIsBilled(r) && r.tracking.trim() !== "" && r.tracking.trim() !== orig)
      : [];
    const boxChanges = unlocked
      ? rows.filter((r, i) => !rowIsBilled(r) && (parseInt(r.boxes, 10) || 0) !== (origBoxes[i] ?? 0))
      : [];
    if (unlocked) {
      for (const r of rows) {
        const b = parseInt(r.boxes, 10);
        if (!Number.isFinite(b) || b < 0) {
          setError(`แทค ${r.tracking}: จำนวนกล่องต้องเป็นตัวเลข ≥ 0`);
          return;
        }
      }
      for (const { r } of renames) {
        if (r.tracking.trim().length < 3) {
          setError(`เลขแทรคกิ้ง "${r.tracking}" สั้นเกินไป`);
          return;
        }
      }
    }

    // §0f confirm-before-mutate — both saves get an explicit confirm so no one
    // ลั่นปุ่ม. The two prompts spell out the different consequence (advance vs stay).
    const identityNote =
      renames.length > 0 || boxChanges.length > 0
        ? ` (รวมแก้ข้อมูลหลัก: เปลี่ยนเลขแทรคกิ้ง ${renames.length} แถว · จำนวนกล่อง ${boxChanges.length} แถว)`
        : "";
    const ok = await confirm(
      advanceToPayment
        ? `ยืนยันบันทึกขนาด/ราคา ${rows.length} แทรคกิง แล้ว "ส่งไปรอชำระเงิน" (ออเดอร์ที่ตั้งเรทแล้วจะย้ายไปสถานะรอชำระเงิน) ?${identityNote}`
        : `ยืนยัน "บันทึก" ${rows.length} แทรคกิง — อัพเดตน้ำหนัก/ขนาด/CBM/ราคา (สถานะคงเดิม · การเก็บเงินไปกดที่รายงานตู้) ?${identityNote}`,
    );
    if (!ok) return;

    setResults({});
    startTransition(async () => {
      // ── 1. identity renames FIRST (per-row action w/ dup-guard) — a failed
      // rename aborts the whole save so staff resolves the duplicate first.
      for (const { r, orig } of renames) {
        const res = await adminRenameForwarderTracking({ fid: r.id, newTracking: r.tracking.trim() });
        if (!res.ok) {
          setError(`เปลี่ยนเลขแทรคกิ้ง ${orig} → ${r.tracking.trim()} ไม่สำเร็จ: ${res.error}`);
          return;
        }
      }
      const fails: string[] = [];
      const nextResults: Record<number, RowResult> = {};
      // ภูม 2026-06-25 — trackings whose save did NOT advance to รอชำระเงิน (freight=0).
      const notAdvanced: string[] = [];
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
          // ภูม 2026-07-01 — dims-only save opts OUT of the fstatus 4→5 advance.
          advanceToPayment,
          // ORDER-level shared rate toggles (applied to every row).
          customRate,
          customRateKg: parseFloat(customRateKg) || 0,
          customRateCbm: parseFloat(customRateCbm) || 0,
          customComparison,
          userComparisonValue: parseFloat(comparisonValue) || 0,
          // ค่าเทียบ on the ORDER TOTAL (ภูม 2026-06-18 "เทียบต่อจำนวนรวม กิโล/คิว") —
          // Σweight÷Σcbm of every tracking, so the KG-vs-CBM basis is decided ONCE
          // on the whole order (matching the preview box above), not per row.
          comparisonKgPerCbm: calc.v > 0 ? calc.kgPerCbm : undefined,
          // per-row adders.
          fDiscount: parseFloat(r.fDiscount) || 0,
          fTransportPriceChnThb: parseFloat(r.fTransportPriceChnThb) || 0,
          priceOther: parseFloat(r.priceOther) || 0,
          fTransportPrice: parseFloat(r.fTransportPrice) || 0,
          fShippingService: parseFloat(r.fShippingService) || 0,
          // ค่าตีลังไม้ per row (owner 2026-07-21 · PCS "ค่าตีลัง" column)
          priceCrate: parseFloat(r.priceCrate) || 0,
          // จำนวนกล่อง — only when unlocked + actually changed (identity edit);
          // the action re-prices on the corrected count in the same save.
          ...(unlocked && boxChanges.some((b) => b.id === r.id)
            ? { boxCount: parseInt(r.boxes, 10) || 0 }
            : {}),
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
          if (!res.data.advancedToFive) notAdvanced.push(r.tracking);
        }
      }
      setResults(nextResults);
      if (fails.length > 0) {
        setError(`บันทึกไม่สำเร็จ ${fails.length}/${rows.length} แถว — ${fails[0]}`);
        return;
      }
      // identity renames landed — hard-reload so the page (URL fetch, items table,
      // header) re-renders on the NEW tracking/base (a router.refresh alone can't
      // re-seed this client's useState rows).
      if (renames.length > 0) {
        setSuccess(`✓ บันทึกแล้ว (เปลี่ยนเลขแทรคกิ้ง ${renames.length} แถว) — กำลังโหลดหน้าใหม่…`);
        setTimeout(() => window.location.reload(), 900);
        return;
      }
      if (!advanceToPayment) {
        // DIMS-ONLY save — the pricer isn't billing yet. We deliberately kept
        // fstatus as-is; say so clearly so no one thinks it should have advanced.
        setSuccess(
          `✓ บันทึกแล้ว ${rows.length} แทรคกิง (สถานะคงเดิม) — ` +
          `การเก็บเงิน: รายงานตู้ → เพิ่มรายการตรวจสอบ → แจ้งเก็บเงินลูกค้า (ตาม loop)`,
        );
      } else if (notAdvanced.length > 0) {
        // The save auto-advances ถึงไทยแล้ว(4) → รอชำระเงิน(5) server-side — forward-only,
        // ONLY when the FREIGHT rate (ftotalprice) > 0 (ภูม 2026-06-25). A row whose rate
        // is still 0 (เซลยังไม่ตั้งเรท · เคสสร้างมือ) stays at "ถึงไทยแล้ว" — don't falsely
        // claim it moved to billing; tell the pricer to set the rate. router.refresh
        // re-renders the new status pill + the "สร้างใบวางบิล" button (fstatus 5/6).
        setSuccess(
          `✓ บันทึกขนาด/น้ำหนักแล้ว — แต่ ${notAdvanced.length}/${rows.length} แทรคกิงยังไม่ส่งไปรอชำระเงิน ` +
          `เพราะราคา/เรท ยังเป็น 0 (${notAdvanced.slice(0, 3).join(", ")}${notAdvanced.length > 3 ? "…" : ""}) — ` +
          `ตั้งเรทลูกค้า หรือใส่ราคาเอง (คิดราคาแบบกำหนดเอง) แล้วบันทึกอีกครั้ง`,
        );
      } else {
        setSuccess(`✓ บันทึกสำเร็จทั้ง ${rows.length} แทรคกิง — คำนวณราคาขายใหม่ + ส่งไปรอชำระเงินแล้ว 🧾`);
      }
      router.refresh();
      setTimeout(() => setSuccess(null), 8000);
    });
  }

  // ── ↺ Reset ค่าเริ่มต้นจากต้นทาง (owner 2026-07-21 "เผื่อพนักงานลั่น แก้จนพัง —
  // ดึงจาก MOMO Live · ถ้ามีแพคกิ้งลิสก็เชื่อแพคกิ้งลิส") — server action decides the
  // source (packing snapshot first, else MOMO Live via the audited reconcile brain),
  // touches UNBILLED rows only, then we hard-reload so every field re-seeds.
  async function onResetFromSource() {
    setError(null);
    setSuccess(null);
    const ok = await confirm(
      "↺ ดึงค่าเริ่มต้นจากต้นทาง — จำนวนกล่อง/น้ำหนัก/คิว/ขนาด จะถูกเขียนทับด้วยข้อมูลต้นทาง " +
      "(มีแพคกิ้งลิส = ใช้แพคกิ้งลิส · ไม่มี = MOMO Live) เฉพาะแถวที่ยังไม่เข้าคิวเก็บเงิน — ยืนยัน?",
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await adminResetForwarderFamilyFromSource({ fid: rows[0]?.id ?? 0 });
      if (!res.ok) {
        setError(`reset ไม่สำเร็จ: ${res.error}`);
        return;
      }
      const d = res.data!;
      const src = d.source === "packing" ? "แพคกิ้งลิส" : "MOMO Live";
      setSuccess(
        `✓ ดึงค่าเริ่มต้นจาก${src}แล้ว — อัพเดต ${d.updated} แถว · re-price ${d.repriced} แถว` +
        (d.skippedBilled > 0 ? ` · ข้ามแถวที่เข้าคิวเก็บเงิน ${d.skippedBilled} แถว` : "") +
        (d.warnings.length > 0 ? ` · ⚠ ${d.warnings[0]}` : "") +
        " — กำลังโหลดหน้าใหม่…",
      );
      setTimeout(() => window.location.reload(), 1400);
    });
  }

  // ── Rate-mode guard (advisory · owner) — warn (never block) when the manual
  // custom ฿/CBM looks like the WRONG transport mode's rate for this ตู้. Uses the
  // ตู้-derived mode + system rates resolved server-side. A warning only — it does
  // NOT gate onSave. Null when the override is off / no ตู้ / rate looks correct.
  const modeGuardWarn = useMemo(() => {
    if (customRate !== "1" || !derivedMode) return null;
    const g = evaluateRateModeGuard({
      derivedMode,
      typedCbmRate: parseFloat(customRateCbm) || 0,
      typedKgRate: parseFloat(customRateKg) || 0,
      expectedCbmRate: modeExpectedCbmRate ?? 0,
      otherModeCbmRate: modeOtherCbmRate ?? 0,
      expectedKgRate: 0,
      otherModeKgRate: 0,
    });
    return g.level === "mismatch" ? g.message : null;
  }, [customRate, customRateCbm, customRateKg, derivedMode, modeExpectedCbmRate, modeOtherCbmRate]);

  return (
    <div className="space-y-3">
      {/* ── ORDER-level rate toggles (shared · ใช้ทุกแทค) ──
          2026-06-18 (ภูม · พี่ป๊อป "ไม่ยืด/บวม" · PCS รูป2) — compact: narrow
          fixed-width inputs (was CELL = full-width → stretched) + inline flex +
          tight padding. */}
      {/* ── ONE merged box (owner 2026-07-20 "ย้ายค่าเทียบไปรวม box เดียวกับกรอบตั้งราคาขายใหม่
          · กรอกช่องใดช่องนึงติ๊กออโต้ · ลบหมดติ๊กหลุด · ติ๊กแล้วต้องครบทั้ง 3 ค่า") —
          เรท ฿/กก. + เรท ฿/CBM + ค่าเทียบ อยู่กรอบเดียว ติ๊กเดียว. The tick mirrors onto
          BOTH customRate + customComparison (the server's locked-pair guard unchanged). */}
      <div className={`rounded-lg border px-3 py-1.5 ${customRate === "1" ? "border-red-300 bg-red-50/40" : "border-border bg-surface-alt/30"}`}>
        <label className="flex cursor-pointer items-center gap-2 select-none">
          <input type="checkbox" checked={customRate === "1"}
            onChange={(e) => { const on = e.target.checked; setCustomRate(on ? "1" : "0"); setCustomComparison(on ? "1" : "0"); }}
            disabled={pending} className="h-4 w-4 rounded border-border text-primary-600 focus:ring-primary-500" />
          <span className={`text-[13px] font-medium ${customRate === "1" ? "text-red-700" : "text-foreground"}`}>คิดราคา + ค่าเทียบ แบบกำหนดเอง</span>
        </label>
        <div className="mt-1.5 flex flex-wrap items-end gap-2">
          <label className="block"><span className="block text-[11px] text-muted">เรท ฿/กก.</span>
            <input type="number" min={0} step="0.01" value={customRateKg}
              onChange={(e) => { setCustomRateKg(e.target.value); autoTickCustom(e.target.value, customRateCbm, comparisonValue); }}
              disabled={pending} placeholder="0" className="mt-0.5 w-24 rounded-md border border-border px-2 py-1 text-sm font-mono tabular-nums text-right outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200 disabled:opacity-60" /></label>
          <label className="block"><span className="block text-[11px] text-muted">เรท ฿/CBM</span>
            <input type="number" min={0} step="0.01" value={customRateCbm}
              onChange={(e) => { setCustomRateCbm(e.target.value); autoTickCustom(customRateKg, e.target.value, comparisonValue); }}
              disabled={pending} placeholder="0" className="mt-0.5 w-24 rounded-md border border-border px-2 py-1 text-sm font-mono tabular-nums text-right outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200 disabled:opacity-60" /></label>
          <label className="block"><span className="block text-[11px] text-muted">ค่าเทียบ (1 คิว = N กก. · ไม่เกิน {MAX_COMPARISON})</span>
            <input type="number" min={0} max={MAX_COMPARISON} step="1" value={comparisonValue}
              onChange={(e) => { setComparisonValue(e.target.value); autoTickCustom(customRateKg, customRateCbm, e.target.value); }}
              disabled={pending || !canEditComparison} placeholder="0" className="mt-0.5 w-28 rounded-md border border-border px-2 py-1 text-sm font-mono tabular-nums text-right outline-none focus:ring-2 focus:border-amber-500 focus:ring-amber-200 disabled:opacity-60" /></label>
        </div>
        <p className="mt-1 text-[11px] text-muted">
          กรอกช่องใดช่องหนึ่ง = ติ๊กให้อัตโนมัติ · ลบหมด = ติ๊กหลุด · ติ๊กแล้วต้องกรอก<b>ครบทั้ง 3 ค่า</b>ถึงบันทึกได้ ·
          ไม่ติ๊ก = เรทระบบ (ค่าเทียบ 250){!canEditComparison && " · 🔒 ค่าเทียบสงวนไว้ — พนักงานโกดังแก้ไม่ได้"}
        </p>
        {/* Rate-mode guard (advisory) — warns if the typed ฿/CBM looks like the
            WRONG transport mode's rate for this ตู้. A warning only · does NOT block. */}
        {modeGuardWarn && (
          <p className="mt-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">
            {modeGuardWarn}
          </p>
        )}
      </div>

      {/* ── 🔓 identity unlock + ↺ reset (owner 2026-07-21 · กันมือลั่น/แมวเหยียบคีย์บอร์ด) ── */}
      <div className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${unlocked ? "border-amber-300 bg-amber-50/50" : "border-border bg-surface-alt/30"}`}>
        {!unlocked ? (
          <button
            type="button"
            disabled={pending}
            onClick={async () => {
              const ok = await confirm(
                "🔓 ปลดล็อกแก้ไขข้อมูลหลัก — เลขแทรคกิ้ง · เลขชิปเม้น · จำนวนกล่อง จะแก้ได้โดยตรง " +
                "(กันมือลั่น 1 ชั้น) — ยืนยันปลดล็อก?",
              );
              if (ok) setUnlocked(true);
            }}
            className="rounded-md border border-border bg-white dark:bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-alt disabled:opacity-50"
          >
            🔒 แก้ไขข้อมูลหลัก (เลขแทรคกิ้ง · เลขชิปเม้น · จำนวนกล่อง)
          </button>
        ) : (
          <>
            <span className="text-xs font-semibold text-amber-700">🔓 ปลดล็อกแล้ว — แก้ในตารางแล้วกด “บันทึก”</span>
            <label className="flex items-center gap-1.5 text-xs">
              <span className="text-muted">เลขชิปเม้น (ฐาน):</span>
              <input
                type="text"
                value={baseInput}
                onChange={(e) => onBaseChange(e.target.value)}
                disabled={pending}
                className="h-8 w-48 rounded-md border border-amber-300 bg-white dark:bg-surface px-2 font-mono text-xs focus:border-amber-500 focus:outline-none"
              />
              <span className="text-[11px] text-muted">(เปลี่ยนแล้วเลขแทรคกิ้งทุกกล่องเปลี่ยนตาม -N/M เดิม)</span>
            </label>
            <button type="button" disabled={pending} onClick={() => { setUnlocked(false); setBaseInput(initialBase); setRows((rs) => rs.map((r, i) => ({ ...r, tracking: origTrackings[i] ?? r.tracking, boxes: String(origBoxes[i] ?? r.boxes) }))); }}
              className="rounded-md border border-border px-2.5 py-1 text-[11px] text-muted hover:bg-surface-alt">ยกเลิก/ล็อกคืน</button>
          </>
        )}
        <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
        <button
          type="button"
          disabled={pending}
          onClick={onResetFromSource}
          className="rounded-md border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-50"
        >
          ↺ ดึงค่าเริ่มต้นจากต้นทาง (แพคกิ้งลิสก่อน · ไม่มีใช้ MOMO Live)
        </button>
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
              <th className={TH}>ค่าตีลัง</th>
              <th className={TH}>ค่าจีน+</th>
              <th className={TH}>ค่าอื่นๆ</th>
              <th className={TH}>ค่าบริการ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={r.id} className="border-t border-border align-top [&>td]:px-1.5 [&>td]:py-1.5 [&>td]:border-r [&>td]:border-border">
                <td className="min-w-[170px] max-w-[260px] text-left">
                  {unlocked && !rowIsBilled(r) ? (
                    <input
                      type="text"
                      value={r.tracking}
                      onChange={(e) => patch(idx, { tracking: e.target.value })}
                      disabled={pending}
                      className="h-8 w-full rounded-md border border-amber-300 bg-amber-50/50 px-2 font-mono text-[11px] focus:border-amber-500 focus:outline-none"
                    />
                  ) : (
                    <div className="font-mono text-[11px] font-medium break-words">{r.tracking || "—"}{unlocked && rowIsBilled(r) && <span className="ml-1 text-[10px] text-muted">🔒 บิลแล้ว</span>}</div>
                  )}
                  {r.detail && r.detail !== r.tracking && <div className="text-[11px] text-muted break-words">{r.detail}</div>}
                  {results[r.id] && (
                    <div className="mt-1 inline-flex items-center gap-1 rounded bg-green-100 px-1.5 py-0.5 text-[11px] font-medium text-green-700">
                      ✓ ฿{results[r.id].grandTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      <span className="text-green-600/70">· คิดตาม{results[r.id].basis === "cbm" ? "ปริมาตร" : "น้ำหนัก"}</span>
                    </div>
                  )}
                </td>
                <td className="text-center font-mono text-xs text-muted">
                  {unlocked && !rowIsBilled(r) ? (
                    <input
                      type="number"
                      min={0}
                      step="1"
                      value={r.boxes}
                      onChange={(e) => patch(idx, { boxes: e.target.value })}
                      disabled={pending}
                      className="h-8 w-16 rounded-md border border-amber-300 bg-amber-50/50 px-1.5 text-center font-mono text-xs focus:border-amber-500 focus:outline-none"
                    />
                  ) : (
                    r.boxes
                  )}
                </td>
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
                <td><input type="number" min={0} step="0.01" value={r.priceCrate} onChange={(e) => patch(idx, { priceCrate: e.target.value })} disabled={pending} className={CELL} placeholder="0.00" /></td>
                <td><input type="number" min={0} step="0.01" value={r.fTransportPriceChnThb} onChange={(e) => patch(idx, { fTransportPriceChnThb: e.target.value })} disabled={pending} className={CELL} placeholder="0.00" /></td>
                <td><input type="number" min={0} step="0.01" value={r.priceOther} onChange={(e) => patch(idx, { priceOther: e.target.value })} disabled={pending} className={CELL} placeholder="0.00" /></td>
                <td><input type="number" min={0} step="0.01" value={r.fShippingService} onChange={(e) => patch(idx, { fShippingService: e.target.value })} disabled={pending} className={CELL} placeholder="0.00" /></td>
              </tr>
            ))}
          </tbody>
          {/* ── ยอดสรุปรวมท้ายตาราง (owner 2026-07-21 "ยอดสรุปข้างล่างก็ยังไม่มี" ·
              PCS report-cnt "รวม" row) — Σ over every editor row, live as staff types. */}
          <tfoot>
            <tr className="border-t-2 border-orange-300 bg-orange-50/70 font-semibold [&>td]:px-1.5 [&>td]:py-1.5 [&>td]:border-r [&>td]:border-border text-xs">
              <td className="text-left text-orange-800">รวม {rows.length} แทรคกิง</td>
              <td className="text-center font-mono tabular-nums">
                {rows.reduce((s, r) => s + (parseInt(r.boxes, 10) || 0), 0)}
              </td>
              <td colSpan={3} />
              <td className="text-right font-mono tabular-nums">{nf(calc.w, 2)}</td>
              <td colSpan={3} />
              <td className="text-right font-mono tabular-nums text-red-700">{nf(calc.v, 5)}</td>
              <td className="text-right font-mono tabular-nums">{nf(calc.thai, 2)}</td>
              <td className="text-right font-mono tabular-nums">{nf(calc.discount, 2)}</td>
              <td className="text-right font-mono tabular-nums">{nf(calc.crate, 2)}</td>
              <td className="text-right font-mono tabular-nums">{nf(calc.chnThb, 2)}</td>
              <td className="text-right font-mono tabular-nums">{nf(calc.other, 2)}</td>
              <td className="text-right font-mono tabular-nums">{nf(calc.service, 2)}</td>
            </tr>
            <tr className="bg-orange-100/70 [&>td]:px-1.5 [&>td]:py-1 text-[11px]">
              <td colSpan={16} className="text-right text-orange-900">
                ค่านำเข้าจีน-ไทย {baht(calc.transport)} + ค่าอื่นๆ ทั้งหมด − ส่วนลด = <b className="text-red-700 text-[13px]">รวมขาย {baht(calc.net)}</b>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── 🧮 ราคานำเข้าจีน-ไทย — ONE box, ยอดรวมทุกแทค (faithful PCS copy) ── */}
      <div className="rounded-xl border border-border bg-surface-alt/30 p-3">
        <div className="grid gap-4 sm:grid-cols-[1fr,240px]">
          {/* LEFT — rate calc (PCS lines, verbatim) */}
          <div className="space-y-1 text-xs font-mono tabular-nums">
            <p className="font-semibold text-foreground mb-1 font-sans">
              ราคานำเข้าจีน-ไทย : <span className="text-muted font-normal">{calc.label}{calc.count > 1 ? ` (${calc.count} แทค)` : ""}</span>
              {calc.cr && <span className="ml-1 text-[11px] text-red-600">· เรทแบบกำหนดเอง</span>}
              {/* 2026-06-19 (#1 revise) — system pricing now shows the customer's
                  PROFILE rate auto-pulled (no longer ฿0). */}
              {!calc.cr && calc.useProfile && <span className="ml-1 text-[11px] text-emerald-600">· เรทระบบ (โปรไฟล์ลูกค้า)</span>}
              {calc.comparisonOn && <span className="ml-1 text-[11px] text-amber-600">· คิดค่าเทียบแบบกำหนดเอง</span>}
            </p>
            {/* หาค่าเทียบ — ALWAYS shown (PCS ราคานำเข้า block · ภูม 2026-07-10). The
                KG/CBM ratio vs the threshold explains WHY weight-vs-volume was picked.
                Under system pricing the threshold = the customer's ค่าเทียบ (or 250);
                under a manual ค่าเทียบ = the typed value. Basis = the actual chosen one. */}
            {calc.v > 0 && (
              <p className="text-amber-700">
                หาค่าเทียบ {nf(calc.w, 2)}÷{nf(calc.v, 5)} = {nf(calc.kgPerCbm, 2)} (เกณฑ์ที่ตั้ง {nf(calc.compareThreshold, 0)} คิดตาม{calc.byWeight ? "น้ำหนัก" : "ปริมาตร"})
              </p>
            )}
            {/* คิดตามน้ำหนัก / ปริมาตร — BOTH lines show a real computed amount.
                Under manual pricing: typed rate × qty. Under system pricing: the
                server-resolved per-basis amount (CBM is the default chosen basis;
                the weight line is no longer blank · owner ภูม 2026-06-20). A basis
                with no rate card on any row → "—" for that line only. The "× rate"
                multiplier shows only when the unit rate is uniform across rows. */}
            <p>
              คิดตามน้ำหนัก {nf(calc.w, 2)}
              {calc.cr ? ` x ${nf(calc.rateKg, 0)}` : calc.useProfile && calc.pKgRate != null ? ` x ${nf(calc.pKgRate, 2)}` : ""}
              {" = "}
              <strong>{calc.pKg == null ? "—" : baht(calc.pKg)}</strong>
            </p>
            <p>
              คิดตามปริมาตร {nf(calc.v, 5)}
              {calc.cr ? ` x ${nf(calc.rateCbm, 2)}` : calc.useProfile && calc.pCbmRate != null ? ` x ${nf(calc.pCbmRate, 2)}` : ""}
              {" = "}
              <strong>{calc.pCbm == null ? "—" : baht(calc.pCbm)}</strong>
            </p>
            <p className="inline-flex items-center gap-1 rounded bg-red-100 text-red-700 px-2 py-0.5 text-[11px] font-medium mt-1">
              ระบบเลือก คิดตาม{calc.comparisonOn ? "ค่าเทียบ" : (calc.byWeight ? "น้ำหนัก (กิโล)" : "ปริมาตร (คิว)")} (รวมทุกแทค) → {baht(calc.transport)}
            </p>
            {/* Only fall back to the "คำนวณตอนบันทึก" note when system pricing
                couldn't resolve a profile rate (no rate card for the tuple). */}
            {!calc.cr && !calc.useProfile && <p className="text-[11px] text-amber-700 font-sans">* ใช้เรทระบบ — ราคาคำนวณจริงตอนกด “บันทึกทุกแถว”</p>}
          </div>
          {/* RIGHT — price summary (PCS labels, verbatim) */}
          <div className="rounded-lg border border-border bg-white dark:bg-surface p-3 space-y-0.5 text-[11px]">
            <Sum label="ค่านำเข้าจีน-ไทย" value={calc.transport} />
            <Sum label="ค่าขนส่งจีน+" value={calc.chnThb} />
            <Sum label="ค่าตีลังไม้" value={calc.crate} />
            <Sum label="ค่าบริการ" value={calc.service} />
            <Sum label="ค่าอื่นๆ CO" value={calc.other} />
            {isMao ? (
              <p className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-cyan-700">ค่าจัดส่งในไทย · ใช้บริการ Pacred เหมาๆ 🚚</span>
                <strong className="font-mono tabular-nums text-cyan-800">{baht(calc.thai)}</strong>
              </p>
            ) : (
              <Sum label="ค่าจัดส่งในไทย" value={calc.thai} />
            )}
            <Sum label="ส่วนลด" value={calc.discount} negative />
            <div className="border-t border-border pt-1 mt-1">
              <p className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-foreground">ราคารวมสุทธิ :</span>
                <strong className="text-red-600 text-sm font-mono tabular-nums">{baht(calc.net)}</strong>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* owner 2026-07-20 "มันต้องมีแค่ปุ่มเดียวคือ บันทึก — ให้ข้อมูลได้รับการอัพเดทเท่านั้น ·
          จะเก็บเงินไปกดที่ ตรวจรายการตู้ → ตรวจสอบรายการ → แจ้งเก็บเงิน ตาม loop · ลูกค้าไม่จ่าย
          = จ่ายแทนลูกค้า (เงินสด บุคคล/นิติ) · ลูกค้าเครดิต = ออกใบวางบิลตาม flow PCS" —
          the ส่งไปรอชำระ + ไปสร้างใบวางบิล buttons are REMOVED; save = data-only. */}
      <p className="text-[11px] text-muted">⚠️ กรอกขนาด/ราคาของแต่ละแทรคกิง แล้วกด “บันทึก” — เก็บ/อัพเดตข้อมูลเท่านั้น สถานะคงเดิม (ระบบคำนวณราคาขายใหม่ให้แต่ละแทคตอนบันทึก · ต้นทุน/ค่าเทียบ จาก server) · การเก็บเงิน: รายงานตู้ → เพิ่มรายการตรวจสอบ → แจ้งเก็บเงินลูกค้า</p>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">⚠ {error}</div>}
      {success && <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">{success}</div>}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => onSave(false)} disabled={pending} className="rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed">
          {pending ? "กำลังบันทึก..." : `💾 บันทึก (${rows.length} แทรคกิง)`}
        </button>
      </div>
      {dialogs}
    </div>
  );
}
