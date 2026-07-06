import assert from "node:assert/strict";
import {
  classifyDomesticZone,
  domesticShippingOptions,
  isThShippingCostRequired,
  isThShippingCostMissing,
} from "./domestic-shipping";
import { MAO_FLAT_FEE, MAO_CARRIER_CODE } from "./mao-fee";

// ── zone classification ──
assert.equal(classifyDomesticZone({ addressID: "PCS", zip: "10110" }), "self_pickup", "PCS = self-pickup regardless of zip");
assert.equal(classifyDomesticZone({ addressID: "123", zip: "10110" }), "maomao", "BKK 10110 = เหมาๆ zone");
assert.equal(classifyDomesticZone({ addressID: "123", zip: "74130" }), "upcountry", "สมุทรสาคร 74130 (อ้อมน้อย) = OUT of เหมาๆ zone");
assert.equal(classifyDomesticZone({ addressID: "123", zip: "50000" }), "upcountry", "เชียงใหม่ = upcountry");

// ── เหมาๆ in-zone: PRF ฿100 flat · ต้นทาง · not COD ──
{
  const { zone, options } = domesticShippingOptions({ addressID: "123", zip: "10110", weightKg: 13 });
  assert.equal(zone, "maomao");
  const mao = options[0];
  assert.equal(mao.carrier, MAO_CARRIER_CODE, "first option = PRF เหมาๆ");
  assert.equal(mao.cost, MAO_FLAT_FEE, "เหมาๆ = flat ฿100 (no weight)");
  assert.equal(mao.payMethod, "1", "เหมาๆ = ต้นทาง");
  assert.equal(mao.forceCod, false);
  assert.ok(options.some((o) => o.carrier === "PCS"), "self-pickup always offered");
}

// ── upcountry: Flash by weight (auto) + FORCE COD ──
{
  const { zone, options } = domesticShippingOptions({
    addressID: "123", zip: "74130", province: "สมุทรสาคร", amphoe: "กระทุ่มแบน",
    weightKg: 13, width: 50, length: 37, height: 26,
  });
  assert.equal(zone, "upcountry");
  const flash = options.find((o) => o.carrier === "2");
  assert.ok(flash, "Flash offered upcountry");
  assert.ok(flash!.cost > 0, "Flash cost computed by weight");
  assert.equal(flash!.payMethod, "2", "upcountry Flash = ปลายทาง (COD)");
  assert.equal(flash!.forceCod, true, "upcountry FORCES COD (owner: บังคับเก็บปลายทาง)");
  // every non-self-pickup upcountry option is COD
  for (const o of options) {
    if (o.carrier === "PCS" || o.carrier === "PCSE") continue;
    assert.equal(o.payMethod, "2", `${o.carrier} upcountry must be COD`);
    assert.equal(o.forceCod, true, `${o.carrier} upcountry must force COD`);
  }
  // manual carriers (J&T / ไปรษณีย์) have 0 auto-cost
  const jt = options.find((o) => o.carrier === "24");
  assert.ok(jt && jt.manual && jt.cost === 0, "J&T = manual cost");
  assert.ok(options.some((o) => o.carrier === "PCS"), "self-pickup always offered");
}

// ── self-pickup only ──
{
  const { zone, options } = domesticShippingOptions({ addressID: "PCS" });
  assert.equal(zone, "self_pickup");
  assert.equal(options.length, 1);
  assert.equal(options[0].cost, 0);
}

// ── upcountry MULTI-PARCEL (MOMO -N/M boxes): Flash summed PER PARCEL ──
// Mirrors the 2026-06-26 bug: a MOMO order's หัวบิล row has 0 weight, so the
// fee was ฿25 (min); the real 6 boxes (each ≤50kg) must each be priced + summed.
{
  const parcels = Array.from({ length: 6 }, () => ({ weightKg: 17, width: 55, length: 44, height: 31 }));
  const { options } = domesticShippingOptions({
    addressID: "123", zip: "74130", province: "สมุทรสาคร", amphoe: "กระทุ่มแบน", parcels,
  });
  const flash = options.find((o) => o.carrier === "2");
  assert.ok(flash, "multi-parcel Flash offered");
  assert.ok(flash!.cost > 0, "multi-parcel Flash cost > 0 (summed per box)");
  const single = domesticShippingOptions({
    addressID: "123", zip: "74130", parcels: [{ weightKg: 17, width: 55, length: 44, height: 31 }],
  }).options.find((o) => o.carrier === "2");
  assert.ok(single && single.cost > 0, "single-box Flash offered");
  assert.ok(Math.abs(flash!.cost - single!.cost * 6) < 0.01, "6 boxes = 6× the single-box Flash price (per-parcel sum)");
  assert.ok(flash!.label.includes("6 กล่อง"), "label shows box count for multi-parcel");
  assert.ok(flash!.label.includes("102"), "label shows total kg (6×17=102)");
}

// ── a single combined >50kg parcel trips Flash's 50kg cap → Flash omitted ──
{
  const { options } = domesticShippingOptions({
    addressID: "123", zip: "74130", weightKg: 104, width: 55, length: 44, height: 31,
  });
  assert.ok(!options.some((o) => o.carrier === "2"), "single 104kg parcel exceeds Flash 50kg cap → Flash omitted");
  assert.ok(options.some((o) => o.carrier === "24"), "manual J&T still offered when Flash unavailable");
}

// ── any one box >50kg in the parcel set → Flash omitted (can't auto-quote) ──
{
  const { options } = domesticShippingOptions({
    addressID: "123", zip: "74130",
    parcels: [{ weightKg: 17, width: 55, length: 44, height: 31 }, { weightKg: 60, width: 55, length: 44, height: 31 }],
  });
  assert.ok(!options.some((o) => o.carrier === "2"), "a 60kg box in the set → Flash omitted (over cap)");
}

// ── ค่าส่งไทย "ห้ามลืม" gate (pop-spec #3) ──
{
  // required predicate — self-pickup ("PCS", any case) is the ONLY exempt carrier
  assert.equal(isThShippingCostRequired("PCS"), false, "PCS self-pickup → no TH cost required");
  assert.equal(isThShippingCostRequired("pcs"), false, "self-pickup case-insensitive");
  assert.equal(isThShippingCostRequired(" PCS "), false, "self-pickup trims");
  assert.equal(isThShippingCostRequired("PRF"), true, "เหมาๆ → TH cost required");
  assert.equal(isThShippingCostRequired("2"), true, "Flash → TH cost required");
  assert.equal(isThShippingCostRequired("24"), true, "J&T → TH cost required");
  assert.equal(isThShippingCostRequired(""), true, "unset carrier → TH cost still owed (leg applies)");
  assert.equal(isThShippingCostRequired(null), true, "null carrier → TH cost required");

  // missing predicate — required AND ฿0/empty
  assert.equal(isThShippingCostMissing({ fshipby: "PRF", ftransportprice: 0 }), true, "เหมาๆ ฿0 → missing");
  assert.equal(isThShippingCostMissing({ fshipby: "PRF", ftransportprice: null }), true, "เหมาๆ null → missing");
  assert.equal(isThShippingCostMissing({ fshipby: "PRF", ftransportprice: "" }), true, "เหมาๆ '' → missing");
  assert.equal(isThShippingCostMissing({ fshipby: "2", ftransportprice: -5 }), true, "negative cost → missing");
  assert.equal(isThShippingCostMissing({ fshipby: "PRF", ftransportprice: 100 }), false, "เหมาๆ ฿100 → filled");
  assert.equal(isThShippingCostMissing({ fshipby: "2", ftransportprice: "350.50" }), false, "Flash string cost → filled");
  // self-pickup is NEVER missing regardless of cost
  assert.equal(isThShippingCostMissing({ fshipby: "PCS", ftransportprice: 0 }), false, "self-pickup ฿0 → not missing (exempt)");
  assert.equal(isThShippingCostMissing({ fshipby: "PCS", ftransportprice: null }), false, "self-pickup null → not missing (exempt)");
  // unset carrier + ฿0 → missing (must resolve)
  assert.equal(isThShippingCostMissing({ fshipby: "", ftransportprice: 0 }), true, "unset carrier ฿0 → missing");
}

console.log("domestic-shipping.test.ts — all assertions passed");
