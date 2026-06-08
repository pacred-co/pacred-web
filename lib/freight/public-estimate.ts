/**
 * PUBLIC, CUSTOMER-SAFE freight estimate — the DB-free core of
 * `actions/freight-quote.ts::getPublicFreightEstimate`. Extracted into a plain
 * module (NOT a "use server" file) so the input→engine-spec mapping AND the
 * customer-safe stripping can be unit-tested without pulling next/headers or a
 * Supabase client.
 *
 * ⚠️ CUSTOMER-SAFE contract — the returned object exposes ONLY the customer-
 * facing figures: per-line SELL label/amount + the VAT-inclusive total. It MUST
 * NEVER leak any internal from the engine: cost (`unitCost`/`cost`/
 * `subtotalCost`/`chinaFreightCostThb`), `profit`, the CEO margin cap
 * (`marginCapThb`/`marginExceedsCap`), the commission split, or the
 * `chinaCostPending` gross/net internal. Those are admin-only.
 *
 * When the engine can't price the request faithfully it degrades gracefully:
 * `precise:false` + empty lines so the wizard shows "ติดต่อทีมเพื่อราคาแม่นยำ"
 * instead of inventing a misleading number.
 */

import { composeFreightQuote } from "./rate-engine";
import type { Incoterm, TransportMode } from "@/lib/validators/freight-quote";
import type {
  RfqService, RfqTransport, RfqIncoterm, RfqLoadType, RfqContainerSize,
} from "@/lib/validators/freight-rfq";

export type PublicFreightEstimateInput = {
  service: RfqService;
  transport?: RfqTransport;
  incoterm?: RfqIncoterm;
  loadType?: RfqLoadType;
  containerSize?: RfqContainerSize;
  containerQty?: number;
  /** CBM volume (sea LCL / truck / air volumetric base). */
  cbm?: number;
  /** actual weight in kg (air). */
  weightKg?: number;
};

/** A single customer-facing line — label + SELL only. No cost, no margin. */
export type PublicFreightEstimateLine = { label: string; amountThb: number };

export type PublicFreightEstimateResult = {
  /** true → the engine priced it; the figures are the real engine numbers.
   *  false → can't price faithfully → wizard shows "ติดต่อทีมเพื่อราคาแม่นยำ". */
  precise: boolean;
  /** Why it isn't precise (customer-friendly Thai hint). null when precise. */
  reason: string | null;
  /** Customer-facing line items (freight/customs/transport SELL prices). */
  lines: PublicFreightEstimateLine[];
  /** Σ of `lines` before VAT. */
  subtotalThb: number;
  vatPct: number;
  vatThb: number;
  /** subtotal + VAT — the headline customer total. */
  totalThb: number;
};

const round2pub = (n: number) => Math.round(n * 100) / 100;

/** wizard transport + loadType → engine TransportMode (null = can't map). */
export function toEngineMode(
  transport: RfqTransport | undefined,
  loadType: RfqLoadType | undefined,
): TransportMode | null {
  if (transport === "air") return "air";
  if (transport === "sea") return loadType === "FCL" ? "sea_fcl" : "sea_lcl";
  // "truck" maps to the engine's "truck" mode, but that mode's freight rate is
  // 0 (a cross-border rate not yet modelled) → handled as not-precise below.
  if (transport === "truck") return "truck";
  return null;
}

/** Approx CBM for an FCL container size — used as the volumetric default when
 *  the customer didn't type a CBM (FCL pricing is per-container, not per-CBM,
 *  so this only feeds any volumetric line; engine FCL lines are per-container). */
export const FCL_APPROX_CBM: Record<RfqContainerSize, number> = {
  "20GP": 30, "40GP": 60, "40HC": 68, "45HC": 76,
};

/**
 * Pure core of `getPublicFreightEstimate` — maps the wizard input to an engine
 * spec, calls the pure `composeFreightQuote`, then strips to customer-safe
 * fields. No IO. The async action wrapper exists only to satisfy "use server".
 */
export function buildPublicFreightEstimate(
  input: PublicFreightEstimateInput,
): PublicFreightEstimateResult {
  const empty = (reason: string): PublicFreightEstimateResult => ({
    precise: false, reason, lines: [], subtotalThb: 0, vatPct: 7, vatThb: 0, totalThb: 0,
  });

  // The engine models the IMPORT freight waterfall only. Standalone customs /
  // clearance / non-doc / export are bespoke jobs → sales prices them.
  if (input.service !== "import") {
    return empty("งานนี้คิดราคาเฉพาะแต่ละเคส — กรอกข้อมูลด้านล่างให้ทีมเซลส์ตีราคาให้");
  }

  const mode = toEngineMode(input.transport, input.loadType);
  if (!mode) {
    return empty("เลือกรูปแบบการขนส่งก่อน เพื่อดูราคาประมาณการ");
  }
  if (mode === "truck") {
    // Cross-border truck rate is a per-route negotiation (not in the rate card).
    return empty("ค่าขนส่งทางรถข้ามแดนคิดตามเส้นทางจริง — ทีมเซลส์ยืนยันราคาให้");
  }

  const incoterm: Incoterm = (input.incoterm ?? "CIF") as Incoterm;
  const containers = Math.max(1, Math.floor(input.containerQty ?? 1));
  const cbmIn = Math.max(0, Number(input.cbm) || 0);
  const weightIn = Math.max(0, Number(input.weightKg) || 0);

  // Per-mode volume driver. Missing a required driver → ask the customer for it
  // rather than pricing on a fabricated volume.
  let cbm: number | undefined;
  let kgm: number | undefined;
  if (mode === "sea_lcl") {
    if (cbmIn <= 0) return empty("กรอกปริมาตร (CBM) เพื่อคำนวณราคาแชร์ตู้");
    cbm = cbmIn;
  } else if (mode === "air") {
    // chargeable kg = max(actual, volumetric = CBM × 167).
    const chargeable = Math.max(weightIn, cbmIn * 167);
    if (chargeable <= 0) return empty("กรอกน้ำหนัก (กก.) หรือ CBM เพื่อคำนวณราคาทางอากาศ");
    kgm = chargeable;
  } else if (mode === "sea_fcl") {
    // FCL freight is per-container; pass an approximate CBM only for any
    // volumetric line (the default rate card has none for FCL).
    cbm = input.containerSize ? FCL_APPROX_CBM[input.containerSize] : undefined;
  }

  let q;
  try {
    q = composeFreightQuote({
      mode,
      incoterm,
      deliveryTruck: "4W", // wizard doesn't collect truck size → sheet default
      tier: "regular",     // never expose tier choice to a public visitor
      cbm,
      kgm,
      containers,
    });
  } catch (err) {
    console.error("[buildPublicFreightEstimate] composeFreightQuote failed", err);
    return empty("คำนวณราคาไม่สำเร็จ — กรอกข้อมูลให้ทีมเซลส์ตีราคาให้");
  }

  // Map engine lines → customer-safe lines (SELL only; cost/profit stripped).
  const lines: PublicFreightEstimateLine[] = q.lines
    .filter((l) => l.sell > 0)
    .map((l) => ({ label: l.labelTh, amountThb: round2pub(l.sell) }));

  if (lines.length === 0) {
    return empty("กรอกข้อมูลสินค้าเพิ่มเพื่อดูราคาประมาณการ");
  }

  return {
    precise: true,
    reason: null,
    lines,
    subtotalThb: round2pub(q.subtotalSell),
    vatPct: q.vatPct,
    vatThb: round2pub(q.vat),
    totalThb: round2pub(q.total),
  };
}
