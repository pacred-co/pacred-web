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
import { MAO_FLAT_FEE, MAO_CARRIER_CODE } from "./mao-fee";

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
    // PCS Express — near-zone PCS truck, manual amount.
    options.push({ carrier: "PCSE", label: "PCS Express (กรอกค่าส่งเอง)", cost: 0, payMethod: "1", forceCod: false, manual: true, note: "รถบริษัทส่ง พื้นที่ใกล้" });
  }

  options.push(SELF_PICKUP);
  return { zone, options };
}

export const DOMESTIC_ZONE_LABEL: Record<DomesticZone, string> = {
  self_pickup: "รับเองที่โกดัง",
  maomao: "ในเขตเหมาๆ (กทม.-ปริมณฑล)",
  upcountry: "นอกเขต / ต่างจังหวัด",
};
