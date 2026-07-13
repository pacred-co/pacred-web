/**
 * domestic-shipping.ts — the zone-aware in-Thailand delivery resolver for the
 * forwarder billing UI (owner 2026-06-22: "แกะ legacy แล้วพัฒนาต่อยอดให้ครบ ·
 * ทั้งต่างจังหวัด · บังคับเก็บปลายทาง").
 *
 * Given a delivery address (zip/province/amphoe) + the parcel (kg + dims), it
 * classifies the ZONE and returns the eligible delivery OPTIONS with the correct
 * cost + pay method — the "เหมาๆ in-zone / ต่างจังหวัด out-of-zone / รับเอง" logic
 * the owner asked for, composed from the existing proven pieces:
 *   - เหมาๆ zone        → `isFreeShippingZip` (lib/bkk-zip · the legacy 65-zip set)
 *   - เหมาๆ fee/carrier → MAO_FLAT_FEE (฿100) · MAO_CARRIER_CODE (PRF · mao-fee.ts)
 *   - upcountry Flash   → `calPriceFlash` (lib/tools/flash-price · by weight+dims+zip,
 *                          incl. the +50 remote/tourist surcharge)
 *   - regional carriers → `resolveShipByCarriers` (lib/tools/thai-shipby-rules)
 *
 * THE RULES (faithful + the owner's extension):
 *   • self-pickup (addressID='PCS')      → PCS · ฿0 · ต้นทาง
 *   • IN the เหมาๆ zone                  → PRF เหมาๆ · ฿100 flat (no weight) · ต้นทาง
 *   • OUTSIDE (ต่างจังหวัด/นอกเขต)        → Flash by weight (auto cost) + J&T / ไปรษณีย์
 *                                          (manual cost) · **FORCE COD (ปลายทาง)**
 *   • self-pickup is always offered as a fallback everywhere.
 *
 * Pure + unit-testable (no DB). The caller passes the resolved address fields.
 */

import { isFreeShippingZip } from "@/lib/bkk-zip";
import { calPriceFlash } from "@/lib/tools/flash-price";
import { resolveShipByCarriers } from "@/lib/tools/thai-shipby-rules";
import { MAO_FLAT_FEE, MAO_CARRIER_CODE, isMaoCarrier } from "./mao-fee";

export type DomesticZone = "self_pickup" | "maomao" | "upcountry";

export type DomesticShipOption = {
  /** carrier code to store in tb_forwarder.fshipby */
  carrier: string;
  /** Thai display label */
  label: string;
  /** ค่าขนส่งในไทย (THB) — the ftransportprice contribution. 0 + manual=true → admin types it. */
  cost: number;
  /** '1' = ต้นทาง (prepaid) · '2' = ปลายทาง (COD) */
  payMethod: "1" | "2";
  /** true = upcountry → must collect at destination (owner: บังคับเก็บปลายทาง) */
  forceCod: boolean;
  /** true = no auto price (J&T / ไปรษณีย์ / PCS Express) → admin enters the cost */
  manual: boolean;
  /** short Thai hint (surcharge / how it's charged) */
  note?: string;
};

export type DomesticShipArgs = {
  addressID?: string | null;
  zip?: string | null;
  province?: string | null;
  amphoe?: string | null;
  weightKg?: number | null;
  width?: number | null;
  length?: number | null;
  height?: number | null;
  /**
   * Per-parcel weight+dims for a multi-box shipment (MOMO `-N/M` siblings).
   * Flash is then summed PER PARCEL — faithful to legacy (1 forwarder row = 1
   * parcel) AND necessary, because Flash rejects any single parcel >50kg
   * (calPriceFlash returns 0). A MOMO order of 6×17kg boxes works; the combined
   * 104kg would not. Falls back to the single weightKg/dims when absent.
   */
  parcels?: { weightKg: number; width: number; length: number; height: number }[];
};

const SELF_PICKUP: DomesticShipOption = {
  carrier: "PCS",
  label: "รับเองที่โกดัง (PCS)",
  cost: 0,
  payMethod: "1",
  forceCod: false,
  manual: false,
  note: "ลูกค้ามารับเอง ไม่มีค่าส่ง",
};

/** Classify the delivery zone from the address. */
export function classifyDomesticZone(args: Pick<DomesticShipArgs, "addressID" | "zip">): DomesticZone {
  if ((args.addressID ?? "").trim() === "PCS") return "self_pickup";
  if (isFreeShippingZip((args.zip ?? "").trim())) return "maomao";
  return "upcountry";
}

/**
 * Resolve the zone + the delivery options for the billing UI. The FIRST option is
 * the recommended default for the zone; self-pickup is always appended.
 */
export function domesticShippingOptions(args: DomesticShipArgs): { zone: DomesticZone; options: DomesticShipOption[] } {
  const zone = classifyDomesticZone(args);
  if (zone === "self_pickup") return { zone, options: [SELF_PICKUP] };

  const options: DomesticShipOption[] = [];

  if (zone === "maomao") {
    options.push({
      carrier: MAO_CARRIER_CODE, // PRF
      label: "เหมาๆ (กทม.-ปริมณฑล)",
      cost: MAO_FLAT_FEE, // ฿100
      payMethod: "1",
      forceCod: false,
      manual: false,
      note: "เหมาจ่าย ไม่คิดน้ำหนัก · รถบริษัทส่งเอง",
    });
  } else {
    // upcountry / out-of-zone → Flash by weight (auto) + manual carriers · FORCE COD.
    // Flash is computed PER PARCEL and summed: legacy is per-row (1 forwarder row
    // = 1 parcel), and Flash rejects any single parcel >50kg (returns 0). A MOMO
    // order passes each -N/M box via `parcels`; a normal one-box order falls back
    // to the single weightKg/dims. If ANY box exceeds Flash's cap → omit Flash
    // (staff picks a manual carrier instead).
    const zipTrim = (args.zip ?? "").trim();
    const parcels =
      args.parcels && args.parcels.length > 0
        ? args.parcels.map((p) => ({
            weightKg: Math.max(0, Number(p.weightKg) || 0),
            width: Math.max(0, Number(p.width) || 0),
            length: Math.max(0, Number(p.length) || 0),
            height: Math.max(0, Number(p.height) || 0),
          }))
        : [{
            weightKg: Math.max(0, Number(args.weightKg) || 0),
            width: Math.max(0, Number(args.width) || 0),
            length: Math.max(0, Number(args.length) || 0),
            height: Math.max(0, Number(args.height) || 0),
          }];
    let flashTotal = 0;
    let flashOk = true;
    let surcharge = false;
    let totalKg = 0;
    for (const p of parcels) {
      totalKg += p.weightKg;
      const f = calPriceFlash(1, "", zipTrim, p.width, p.length, p.height, p.weightKg, 0, 1);
      if (f.price <= 0) { flashOk = false; break; }
      flashTotal += f.price;
      if (f.remoteArea || f.touristArea) surcharge = true;
    }
    if (flashOk && flashTotal > 0) {
      options.push({
        carrier: "2", // Flash Express
        label: `Flash Express (${totalKg.toLocaleString("th-TH")} กก.${parcels.length > 1 ? ` · ${parcels.length} กล่อง` : ""})`,
        cost: flashTotal,
        payMethod: "2",
        forceCod: true,
        manual: false,
        note: surcharge ? "รวมพื้นที่ห่างไกล/ท่องเที่ยว +50 · เก็บปลายทาง" : "คิดตามน้ำหนัก/กล่อง · เก็บปลายทาง",
      });
    }
    // J&T + ไปรษณีย์ — manual cost (legacy shows them; price entered by staff).
    options.push({ carrier: "24", label: "J&T Express (กรอกค่าส่งเอง)", cost: 0, payMethod: "2", forceCod: true, manual: true, note: "เก็บปลายทาง" });
    options.push({ carrier: "11", label: "ไปรษณีย์ไทย (กรอกค่าส่งเอง)", cost: 0, payMethod: "2", forceCod: true, manual: true, note: "เก็บปลายทาง" });
    // any regional carriers the province/amphoe allows (manual cost).
    const regional = resolveShipByCarriers((args.province ?? "").trim(), (args.amphoe ?? "").trim());
    for (const c of regional) {
      if (c.id === "2" || c.id === "24" || c.id === "11") continue; // already added
      options.push({ carrier: c.id, label: `${c.name} (กรอกค่าส่งเอง)`, cost: 0, payMethod: "2", forceCod: true, manual: true, note: "เก็บปลายทาง" });
    }
    // PRE Express — near-zone Pacred truck, manual amount.
    options.push({ carrier: "PCSE", label: "PRE Express (กรอกค่าส่งเอง)", cost: 0, payMethod: "1", forceCod: false, manual: true, note: "รถบริษัทส่ง พื้นที่ใกล้" });
  }

  options.push(SELF_PICKUP);
  return { zone, options };
}

export const DOMESTIC_ZONE_LABEL: Record<DomesticZone, string> = {
  self_pickup: "รับเองที่โกดัง",
  maomao: "ในเขตเหมาๆ (กทม.-ปริมณฑล)",
  upcountry: "นอกเขต / ต่างจังหวัด",
};

// ────────────────────────────────────────────────────────────────────────
// ค่าส่งไทย "ห้ามลืม" gate — the TH-shipping-cost required predicate
// ────────────────────────────────────────────────────────────────────────
//
// พี่ป๊อป spec (pop-spec #3, owner-answered 2026-07-06): warehouse/CS must fill
// the in-Thailand delivery cost before a container is billed. This is the pure,
// testable "does this row still need a TH cost?" predicate the billing-run
// eligibility surface + create backstop use to FLAG (not silently under-charge)
// a row whose domestic leg cost was forgotten.
//
// A TH cost is REQUIRED whenever a domestic delivery leg applies — i.e. the row
// is NOT self-pickup ("PCS", ฿0 legitimate). It is NOT required for self-pickup.
// The cost is MISSING when required AND ftransportprice is ฿0/empty.
//
// Note: this is a MONEY-VALIDATION signal only — it changes NO pricing math. It
// never asserts what the cost SHOULD be (that's the auto-resolver
// `domesticShippingOptions` / the CS editor); it only asserts "still ฿0 where a
// leg applies → don't forget it".

/** Self-pickup carrier code — no domestic delivery leg, so ฿0 TH cost is legit. */
export const SELF_PICKUP_CARRIER = "PCS" as const;

/**
 * Does a domestic delivery leg apply to this row (→ a TH shipping cost is
 * expected before billing)? True unless the row is self-pickup ("PCS"). An
 * empty/unset fshipby also counts as "leg applies" — the carrier just isn't
 * decided yet, so the cost is still owed (and the warehouse/CS must resolve it).
 */
export function isThShippingCostRequired(
  fshipby: string | null | undefined,
  payMethod?: string | null | undefined,
): boolean {
  const s = (fshipby ?? "").trim().toUpperCase();
  if (s === SELF_PICKUP_CARRIER) return false; // รับเองที่โกดัง — ฿0 ถูกต้อง
  // owner 2026-07-13: ปลายทาง/COD (paymethod '2') — เอกชนเก็บค่าส่งปลายทางกับลูกค้าเอง →
  // Pacred ไม่เก็บค่าส่งไทย → ฿0 ถูกต้อง · ห้าม lock/บังคับกรอก.
  if ((payMethod ?? "").toString().trim() === "2") return false;
  return true;
}

/**
 * Is the TH shipping cost MISSING for this row — i.e. a domestic leg applies but
 * ftransportprice is still ฿0/empty (warehouse/CS forgot to fill it)? This is the
 * "ยังไม่กรอกค่าส่งไทย" flag the billing UI raises + the create backstop enforces.
 * Bad/negative numbers coerce to 0 (→ treated as missing).
 */
export function isThShippingCostMissing(args: {
  fshipby: string | null | undefined;
  ftransportprice: number | string | null | undefined;
  /** '2' = ปลายทาง/COD → ฿0 ถูกต้อง (เอกชนเก็บปลายทาง) → ไม่ถือว่าขาด (owner 2026-07-13). */
  payMethod?: string | null | undefined;
  /**
   * SHIPMENT-level COD flag (ภูม 2026-07-13 · บั๊ก COD กดออกบิลไม่ได้). COD =
   * "เอกชนเก็บปลายทาง" is a property of the ONE physical delivery/courier — so if
   * ANY row of the shipment (same base tracking) is COD, every sibling's ฿0 ค่าส่งไทย
   * is legit, even a box-split sibling that kept paymethod='1'. WHY needed: MOMO
   * box-split clones the base's paymethod onto siblings, but the COD '2' gets set on
   * the base row AFTER the split → siblings stay '1' → the per-row gate wrongly flagged
   * them (real prod: KY984284755 base 52309='2' COD but sibling 52315='2/2'='1' → บล็อก).
   * The caller computes this once per shipment via `codBaseTrackings`.
   */
  shipmentIsCod?: boolean;
}): boolean {
  if (args.shipmentIsCod === true) return false; // shipment is COD → ฿0 ค่าส่งไทย legit for every sibling
  if (!isThShippingCostRequired(args.fshipby, args.payMethod)) return false; // self-pickup / COD — ฿0 ok
  const cost = Number(args.ftransportprice);
  return !Number.isFinite(cost) || cost <= 0;
}

/**
 * Base-tracking set for the shipments that are COD (any row paymethod='2'). Used by
 * the billing gate to treat the WHOLE base-tracking group as COD-exempt — see the
 * `shipmentIsCod` note above. Strips the MOMO "-i/n" split suffix (same convention as
 * momo-bill-header `baseTracking`). Pure + testable.
 */
export function codBaseTrackings(
  rows: readonly { ftrackingchn: string | null | undefined; paymethod: string | null | undefined }[],
): Set<string> {
  const out = new Set<string>();
  for (const r of rows) {
    if ((r.paymethod ?? "").toString().trim() !== "2") continue;
    const base = (r.ftrackingchn ?? "").trim().replace(/-\d+(?:\/\d+)?$/, "");
    if (base) out.add(base);
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────
// ค่าส่งไทย AUTO-FILL — the "ตรวจตู้เสร็จ เก็บเงินได้เลย" resolver
// ────────────────────────────────────────────────────────────────────────
//
// พี่ป๊อป spec #7 (owner-answered 2026-07-08): "มันต้อง auto เลย — กดตรวจตู้เสร็จ
// ข้ามไปกดเก็บเงินลูกค้าเลย". Today the billing surface GATES on a ฿0 TH cost
// (isThShippingCostMissing flags it), forcing the operator to detour to the
// domestic-ship editor before they can bill → not continuous. This resolver
// computes the RECOMMENDED default cost from the order's own delivery address so
// the bill action can auto-fill it and the flow stays continuous.
//
// SAFE-BY-CONSTRUCTION (money):
//   • only fires when ftransportprice is still ฿0/empty (never overwrites a set cost)
//   • never touches a self-pickup row ("PCS", ฿0 legit)
//   • only auto-applies a DETERMINISTIC carrier — เหมาๆ ฿100 (in-zone) or Flash
//     (computed from weight+zip). A manual carrier (J&T/ไปรษณีย์) whose cost the
//     server can't know → returns null (the operator still types it · the gate
//     stays as the backstop). Address unresolvable → null (can't guess a zone).
//   • the address is the order's OWN faddress* (server-derived, never the client).

export type AutoThShippingFill = {
  carrier: string;       // fshipby to write
  cost: number;          // ftransportprice to write (THB)
  payMethod: "1" | "2";  // '1' ต้นทาง · '2' ปลายทาง(COD)
  zone: DomesticZone;
  label: string;         // for the UI toast ("เพิ่มค่าส่งไทย …")
};

/**
 * TH_SHIPPING_PROFIT_MARGIN — the % markup added on top of the REAL Flash cost for
 * the auto-filled ftransportprice. Owner 2026-07-09: "บวกกำไร 5-20 แล้วแต่ความ
 * เหมาะสม". 15 is a sensible default in that range; the auto value is a DEFAULT,
 * not a lock — the admin edits ftransportprice per carrier/discretion.
 */
export const TH_SHIPPING_PROFIT_MARGIN = 15;

/**
 * resolveThShippingAutoPrice — the REAL Flash cost + margin for a MEASURED parcel,
 * or `null` when Flash can't be quoted for real. Owner 2026-07-13.
 *
 * ⚠️ NO fake floor anymore. The old ฿50 floor (unmeasured / over-limit) produced a
 * number that ISN'T the real Flash price — the owner checked flash's site (~฿300+)
 * vs our ฿50/฿0. A real Flash quote needs the parcel FULLY MEASURED: both the girth
 * SIZE (dims w+l+h) AND the weight — Flash charges max(kg, size), so a bulky-light
 * parcel with only weight (no dims) under-quotes. So:
 *   • dims OR weight missing (size≤0 or kg≤0)  → null  (force measure)
 *   • over Flash's 50kg / 280cm cap (price 0)  → null  (freight/manual · not a ฿50 parcel)
 *   • else → the real Flash price (zip column · +50 remote/tourist) + margin%.
 * The caller must NOT auto-fill on null → the "ห้ามลืมค่าส่งไทย" ฿0 gate forces the
 * operator to measure + enter the real cost. Pure + testable.
 */
export function resolveThShippingAutoPrice(args: {
  zip?: string | null;
  kg?: number | null;
  sizeCm?: number | null;
}): number | null {
  const zip = (args.zip ?? "").trim();
  const kg = Math.max(0, Number(args.kg) || 0);
  const size = Math.max(0, Number(args.sizeCm) || 0);
  // Not fully measured → we cannot know the real Flash cost → don't invent one.
  if (size <= 0 || kg <= 0) return null;
  // Feed the whole girth into one dim so `w+l+h === size` (calPriceFlash sums them).
  const f = calPriceFlash(1, "", zip, size, 0, 0, kg, 0, 1);
  if (f.price <= 0) return null; // over 50kg / 280cm → Flash won't parcel-carry → manual
  const cost = f.price + (f.remoteArea ? 50 : 0) + (f.touristArea ? 50 : 0);
  return Math.round(cost * (1 + TH_SHIPPING_PROFIT_MARGIN / 100));
}

/**
 * Resolve the auto-fill ค่าส่งไทย for a forwarder row, or null when it can't /
 * shouldn't auto-fill (already set · self-pickup · PCSE express-manual).
 * Pure + testable — the server helper reads the row and applies this.
 *
 * Owner 2026-07-09 — the DEFAULT is now **ต้นทาง "1"** (the real Flash cost + margin
 * is billed upfront) for every case, and:
 *   • in-zone เหมาๆ (or an own-fleet เหมาๆ carrier PCSF/PRF) → flat ฿100 · ต้นทาง
 *     (weight-agnostic, collected by Pacred — NEVER Flash-priced).
 *   • PCSE express → null (Pacred truck, amount is operator-set · gate stays backstop).
 *   • external courier (Flash/J&T/others/unset) → Flash cost + TH_SHIPPING_PROFIT_MARGIN,
 *     stored under carrier "2" (Flash) · ต้นทาง · ฿50 floor when Flash can't quote.
 */
export function resolveAutoThShippingFill(args: {
  fshipby: string | null | undefined;
  ftransportprice: number | string | null | undefined;
  zip?: string | null;
  province?: string | null;
  amphoe?: string | null;
  weightKg?: number | null;
  sizeCm?: number | null;
  parcels?: DomesticShipArgs["parcels"];
}): AutoThShippingFill | null {
  // Already has a TH cost → leave it (never overwrite).
  const existing = Number(args.ftransportprice);
  if (Number.isFinite(existing) && existing > 0) return null;
  const carrier = (args.fshipby ?? "").trim().toUpperCase();
  // Self-pickup → ฿0 legit, nothing to auto-fill.
  if (carrier === SELF_PICKUP_CARRIER) return null;

  const zone = classifyDomesticZone({ addressID: null, zip: args.zip });

  // เหมาๆ — in-zone (กทม.-ปริมณฑล) OR an own-fleet เหมาๆ carrier (PCSF/PRF) → flat
  // ฿100, PREPAID ต้นทาง, collected by Pacred. Weight-agnostic · NEVER Flash-priced.
  if (zone === "maomao" || isMaoCarrier(carrier)) {
    return {
      carrier: MAO_CARRIER_CODE, // PRF เหมาๆ
      cost: MAO_FLAT_FEE,        // ฿100 flat
      payMethod: "1",            // ต้นทาง (prepaid)
      zone,
      label: `เหมาๆ (กทม.-ปริมณฑล) · ฿${MAO_FLAT_FEE.toLocaleString("th-TH")}`,
    };
  }

  // PCSE express (Pacred truck, near-zone) — amount is operator-set (needs CBM×rate)
  // → leave the "ห้ามลืมค่าส่งไทย" gate as the backstop, don't guess.
  if (carrier === "PCSE") return null;

  // External courier (Flash/J&T/others or unset) → Flash cost + margin (฿50 floor).
  // Stored under carrier "2" (Flash) — the deterministic auto-quote source. ต้นทาง:
  // the domestic leg is billed upfront (COD is a manual admin choice only now).
  const sizeCm =
    args.sizeCm != null && Number.isFinite(Number(args.sizeCm))
      ? Number(args.sizeCm)
      : 0;
  const cost = resolveThShippingAutoPrice({
    zip: args.zip,
    kg: args.weightKg,
    sizeCm,
  });
  // Owner 2026-07-13: can't get a REAL Flash quote (not fully measured / oversize) →
  // do NOT auto-fill a fake number. Return null → leave ฿0 → the "ห้ามลืมค่าส่งไทย"
  // gate forces the operator to measure the parcel + enter the real Flash cost.
  if (cost == null) return null;
  return {
    carrier: "2", // Flash Express (the auto-quoted external courier)
    cost,
    payMethod: "1", // ต้นทาง (prepaid · the real cost + margin is billed)
    zone,
    label: `Flash ${DOMESTIC_ZONE_LABEL[zone]} · ฿${cost.toLocaleString("th-TH")}`,
  };
}
