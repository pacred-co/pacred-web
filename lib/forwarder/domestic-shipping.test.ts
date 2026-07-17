import assert from "node:assert/strict";
import {
  classifyDomesticZone,
  domesticShippingOptions,
  isThShippingCostRequired,
  isThShippingCostMissing,
  codBaseTrackings,
  resolveAutoThShippingFill,
  resolveThShippingAutoPrice,
  diagnoseThShippingBlock,
} from "./domestic-shipping";
import { MAO_FLAT_FEE, MAO_CARRIER_CODE } from "./mao-fee";
import { getPrivateCarrierOptionsForProvince } from "@/lib/cart/ship-by-eligibility";

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
// (province supplied: 2026-07-14 the ขนส่งเอกชน options are CLOSED to the owner's workbook and
//  derived from the delivery PROVINCE — no province → no private courier, by design.)
{
  const { options } = domesticShippingOptions({
    addressID: "123", zip: "74130", province: "สมุทรสาคร", amphoe: "กระทุ่มแบน",
    weightKg: 104, width: 55, length: 44, height: 31,
  });
  assert.ok(!options.some((o) => o.carrier === "2"), "single 104kg parcel exceeds Flash 50kg cap → Flash omitted");
  assert.ok(options.some((o) => o.carrier === "24"), "manual J&T still offered when Flash unavailable");
}

// ── CLOSED LIST (owner 2026-07-14) ────────────────────────────────────────────
// ไปรษณีย์ไทย (11) is NOT in the owner's workbook → must never be offered again.
{
  const { options } = domesticShippingOptions({
    addressID: "123", zip: "74130", province: "สมุทรสาคร", amphoe: "กระทุ่มแบน", weightKg: 13,
  });
  assert.ok(!options.some((o) => o.carrier === "11"), "ไปรษณีย์ไทย (11) is retired — never offered");
  const allowed = new Set(getPrivateCarrierOptionsForProvince("สมุทรสาคร").map((c) => c.id));
  for (const o of options) {
    if (o.carrier === "PCS" || o.carrier === "PCSE" || o.carrier === "PCSF") continue;
    assert.ok(allowed.has(o.carrier), `${o.carrier} must be a workbook courier for สมุทรสาคร`);
  }
}
{
  // no province → no ขนส่งเอกชน at all (empty-state, never a free list)
  const { options } = domesticShippingOptions({ addressID: "123", zip: "74130", weightKg: 13 });
  const privates = options.filter((o) => !["PCS", "PCSE", "PCSF", "2"].includes(o.carrier));
  assert.equal(privates.length, 0, "unknown province → no ขนส่งเอกชน offered");
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
  // B1 (2026-07-13) — เหมาๆ (PRF/PCSF): the ฿100 is a per-shipment batch fee carried by
  // the mao anchor (not this row's ftransportprice), so a เหมาๆ ฿0 row is LEGIT · not required.
  assert.equal(isThShippingCostRequired("PRF"), false, "B1: เหมาๆ PRF → ฿0 legit (฿100 rides the anchor) · not required");
  assert.equal(isThShippingCostRequired("PCSF"), false, "B1: เหมาๆ PCSF (legacy) → not required");
  assert.equal(isThShippingCostRequired("2"), true, "Flash → TH cost required");
  assert.equal(isThShippingCostRequired("24"), true, "J&T → TH cost required");
  assert.equal(isThShippingCostRequired(""), true, "unset carrier → TH cost still owed (leg applies)");
  assert.equal(isThShippingCostRequired(null), true, "null carrier → TH cost required");

  // missing predicate — required AND ฿0/empty
  // B1 (2026-07-13) — เหมาๆ ฿0 is NOT missing (the ฿100 rides the once-per-shipment anchor;
  // requiring it here would double-bill + false-trip the "ห้ามลืมค่าส่งไทย" gate).
  assert.equal(isThShippingCostMissing({ fshipby: "PRF", ftransportprice: 0 }), false, "B1: เหมาๆ ฿0 → not missing");
  assert.equal(isThShippingCostMissing({ fshipby: "PRF", ftransportprice: null }), false, "B1: เหมาๆ null → not missing");
  assert.equal(isThShippingCostMissing({ fshipby: "PCSF", ftransportprice: "" }), false, "B1: เหมาๆ PCSF '' → not missing");
  assert.equal(isThShippingCostMissing({ fshipby: "2", ftransportprice: -5 }), true, "negative cost (Flash) → missing");
  assert.equal(isThShippingCostMissing({ fshipby: "PRF", ftransportprice: 100 }), false, "เหมาๆ ฿100 → not missing");
  // owner 2026-07-13: ปลายทาง/COD (paymethod '2') → ฿0 ถูกต้อง (เอกชนเก็บปลายทาง) → ไม่ missing / ไม่ lock
  assert.equal(isThShippingCostRequired("2", "2"), false, "Flash + COD ปลายทาง → ฿0 ok, not required");
  assert.equal(isThShippingCostMissing({ fshipby: "2", ftransportprice: 0, payMethod: "2" }), false, "COD ปลายทาง ฿0 → not missing");
  assert.equal(isThShippingCostMissing({ fshipby: "2", ftransportprice: 0, payMethod: "1" }), true, "ต้นทาง ฿0 → still missing");
  assert.equal(isThShippingCostMissing({ fshipby: "2", ftransportprice: "350.50" }), false, "Flash string cost → filled");
  // self-pickup is NEVER missing regardless of cost
  assert.equal(isThShippingCostMissing({ fshipby: "PCS", ftransportprice: 0 }), false, "self-pickup ฿0 → not missing (exempt)");
  assert.equal(isThShippingCostMissing({ fshipby: "PCS", ftransportprice: null }), false, "self-pickup null → not missing (exempt)");
  // unset carrier + ฿0 → missing (must resolve)
  assert.equal(isThShippingCostMissing({ fshipby: "", ftransportprice: 0 }), true, "unset carrier ฿0 → missing");

  // shipment-level COD (ภูม 2026-07-13) — a box-split sibling that kept paymethod='1'
  // must NOT be flagged when its shipment (base tracking) is COD.
  assert.equal(
    isThShippingCostMissing({ fshipby: "2", ftransportprice: 0, payMethod: "1", shipmentIsCod: true }),
    false,
    "ต้นทาง sibling ฿0 but shipment is COD → not missing (exempt)",
  );
  assert.equal(
    isThShippingCostMissing({ fshipby: "2", ftransportprice: 0, payMethod: "1", shipmentIsCod: false }),
    true,
    "ต้นทาง ฿0 · shipment NOT COD → still missing (genuine origin-paid gate stays)",
  );

  // codBaseTrackings — the real prod case: base '2' (COD) + sibling '1' → base is in the set.
  {
    const cod = codBaseTrackings([
      { ftrackingchn: "KY984284755", paymethod: "2" },       // base = COD
      { ftrackingchn: "KY984284755-2/2", paymethod: "1" },   // sibling kept ต้นทาง
      { ftrackingchn: "ZZ999", paymethod: "1" },              // unrelated ต้นทาง shipment
    ]);
    assert.ok(cod.has("KY984284755"), "COD base tracking is captured");
    assert.equal(cod.has("ZZ999"), false, "a non-COD shipment is NOT in the set");
    // sibling resolves to the same base → exempt; the unrelated ต้นทาง ฿0 stays missing.
    assert.equal(
      isThShippingCostMissing({ fshipby: "2", ftransportprice: 0, payMethod: "1", shipmentIsCod: cod.has("KY984284755") }),
      false,
      "COD sibling exempt via codBaseTrackings",
    );
    assert.equal(
      isThShippingCostMissing({ fshipby: "2", ftransportprice: 0, payMethod: "1", shipmentIsCod: cod.has("ZZ999") }),
      true,
      "unrelated ต้นทาง ฿0 still gated",
    );
  }
}

// ── #7 resolveAutoThShippingFill — auto-fill ค่าส่งไทย (owner 2026-07-08) ──
{
  // already has a cost → null (never overwrite)
  assert.equal(
    resolveAutoThShippingFill({ fshipby: "PRF", ftransportprice: 100, zip: "10110", weightKg: 13 }),
    null, "existing cost > 0 → no auto-fill",
  );
  assert.equal(
    resolveAutoThShippingFill({ fshipby: "2", ftransportprice: "350.50", zip: "50000", weightKg: 5 }),
    null, "existing string cost → no auto-fill",
  );
  // self-pickup → null (฿0 legit)
  assert.equal(
    resolveAutoThShippingFill({ fshipby: "PCS", ftransportprice: 0, zip: "10110", weightKg: 13 }),
    null, "self-pickup → no auto-fill",
  );
  // in-zone (maomao) + ฿0 → เหมาๆ PRF · ฿0 · ต้นทาง (B1: the ฿100 rides the anchor, NOT ftransportprice)
  {
    const fill = resolveAutoThShippingFill({ fshipby: "", ftransportprice: 0, zip: "10110", weightKg: 13 });
    assert.ok(fill, "in-zone ฿0 → auto-fills (a PRF-zero row)");
    assert.equal(fill!.carrier, MAO_CARRIER_CODE, "in-zone → เหมาๆ PRF");
    assert.equal(fill!.cost, 0, "B1: in-zone เหมาๆ auto-fills ฿0 (฿100 rides the once-per-shipment anchor)");
    assert.equal(fill!.payMethod, "1", "เหมาๆ → ต้นทาง");
    assert.equal(fill!.zone, "maomao");
  }
  // ── owner 2026-07-13: upcountry external Flash-priced, but ONLY when fully measured ──
  {
    const fill = resolveAutoThShippingFill({ fshipby: "2", ftransportprice: 0, zip: "50000", weightKg: 13, sizeCm: 180, province: "เชียงใหม่" });
    assert.ok(fill, "upcountry external ฿0 + measured (kg+dims) → auto-fills (Flash + margin)");
    assert.equal(fill!.carrier, "2", "upcountry external → Flash carrier '2'");
    // owner 2026-07-18 — ANY ขนส่งเอกชน → ปลายทาง '2' COD (supersedes the 2026-07-09
    // ต้นทาง default; the quoted rate is RECORDED in ftransportprice · the COD gate
    // keeps it off the Pacred bill while paymethod stays '2').
    assert.equal(fill!.payMethod, "2", "owner 2026-07-18: ขนส่งเอกชน → ปลายทาง '2' (COD)");
    assert.equal(fill!.zone, "upcountry");
    assert.ok(fill!.cost > MAO_FLAT_FEE, "13kg/180cm upcountry Flash+margin > ฿100");
    assert.equal(fill!.cost, resolveThShippingAutoPrice({ zip: "50000", kg: 13, sizeCm: 180 }),
      "fill cost == the Flash+margin helper");
  }
  // owner 2026-07-13: weight-only (no dims measured) → NO fake fill — force measurement.
  assert.equal(
    resolveAutoThShippingFill({ fshipby: "2", ftransportprice: 0, zip: "50000", weightKg: 13, province: "เชียงใหม่" }),
    null, "weight-only (no dims) → no auto-fill · force measure (owner: no fake ฿50)",
  );
  // own-fleet เหมาๆ carrier (PRF/PCSF) upcountry → PRF · ฿0 · ต้นทาง (never Flash-priced · ฿100 on the anchor)
  {
    const fill = resolveAutoThShippingFill({ fshipby: "PRF", ftransportprice: 0, zip: "50000", weightKg: 20 });
    assert.ok(fill, "own-fleet PRF upcountry → auto-fills (a PRF-zero row)");
    assert.equal(fill!.carrier, MAO_CARRIER_CODE, "own-fleet → เหมาๆ PRF");
    assert.equal(fill!.cost, 0, "B1: own-fleet เหมาๆ → ฿0 (฿100 rides the anchor, not Flash)");
    assert.equal(fill!.payMethod, "1", "own-fleet → ต้นทาง");
  }
  // PCSE express → null (Pacred truck, operator sets the amount · gate stays backstop)
  assert.equal(
    resolveAutoThShippingFill({ fshipby: "PCSE", ftransportprice: 0, zip: "50000", weightKg: 20 }),
    null, "PCSE express → no auto-fill (operator-set amount)",
  );
  // over Flash's 50kg/280cm cap (even measured) → NO fake fill (freight/manual · owner 2026-07-13)
  assert.equal(
    resolveAutoThShippingFill({ fshipby: "2", ftransportprice: 0, zip: "50000", weightKg: 104, sizeCm: 200 }),
    null, "over 50kg → no auto-fill (manual · not a ฿50 parcel)",
  );
  // no address / no weight → NO fake fill (force manual · the ฿0 gate catches it)
  assert.equal(
    resolveAutoThShippingFill({ fshipby: "", ftransportprice: 0, zip: null, province: null }),
    null, "unresolvable external → no auto-fill (gate forces the real cost)",
  );
  // in-zone auto-fill is weight-agnostic (เหมาๆ) — works even with no weight (PRF-zero row)
  {
    const fill = resolveAutoThShippingFill({ fshipby: "", ftransportprice: 0, zip: "10250" });
    assert.ok(fill, "in-zone no weight → still auto-fills (เหมาๆ PRF)");
    assert.equal(fill!.cost, 0, "B1: in-zone เหมาๆ → ฿0 (฿100 on the anchor)");
  }
}

// ── resolveThShippingAutoPrice — REAL Flash cost + margin, or null (owner 2026-07-13) ──
{
  // measured ตจว 13kg + 180cm girth: max(kg ฿155, size ฿290)=290 · +15% = round(333.5)=334
  assert.equal(resolveThShippingAutoPrice({ zip: "50000", kg: 13, sizeCm: 180 }), Math.round(290 * 1.15), "measured ตจว Flash+margin");
  // BKK column — same measured parcel (10120 in BKK_ZIPS)
  assert.equal(resolveThShippingAutoPrice({ zip: "10120", kg: 13, sizeCm: 180 }), Math.round(290 * 1.15), "BKK column Flash+margin");
  // NOT fully measured → null (no fake floor · force measure)
  assert.equal(resolveThShippingAutoPrice({ zip: "50000", kg: 13 }), null, "no dims → null");
  assert.equal(resolveThShippingAutoPrice({ zip: "50000", kg: 0, sizeCm: 180 }), null, "no weight → null");
  assert.equal(resolveThShippingAutoPrice({ zip: "50000", kg: 0, sizeCm: 0 }), null, "nothing measured → null");
  // over Flash's cap → null (freight/manual)
  assert.equal(resolveThShippingAutoPrice({ zip: "50000", kg: 104, sizeCm: 200 }), null, "over 50kg → null");
  assert.equal(resolveThShippingAutoPrice({ zip: "10230", kg: 10, sizeCm: 310 }), null, "over 280cm → null");
  // remote-area zip adds +50 before margin (both measured)
  {
    const base = resolveThShippingAutoPrice({ zip: "50000", kg: 13, sizeCm: 180 })!; // ตจว, no surcharge
    const remote = resolveThShippingAutoPrice({ zip: "20120", kg: 13, sizeCm: 180 })!; // remote-area zip (+50)
    assert.ok(remote > base, "remote-area zip adds surcharge");
  }
}

// ────────────────────────────────────────────────────────────────────────
// diagnoseThShippingBlock — "ทำไมแจ้งชำระไม่ได้" (owner 2026-07-17 · ผิดพลาด 8)
// ────────────────────────────────────────────────────────────────────────
{
  // แถวจริงบน prod ที่ทำให้ owner เห็น "ผิดพลาด 8" — ต้องบอกเหตุผลได้ถูกตัว.

  // #52162 PR043 — เลือก Flash แล้ว · มี zip · แต่ dims 0x0x0 → ขาดแค่ "วัดขนาด"
  {
    const d = diagnoseThShippingBlock({ fshipby: "2", zip: "63110", weightKg: 16, sizeCm: 0 });
    assert.deepEqual(d.missing, ["dimensions"], "#52162 → ยังไม่วัดขนาด");
    assert.ok(d.reason.includes("วัดขนาด"), "reason พูดถึงการวัดขนาด");
    assert.ok(d.nextAction.includes("โกดัง"), "nextAction ชี้ไปที่โกดัง");
  }

  // #52163 PR043 — Flash · ไม่มี zip · ไม่ได้วัด → ต้องรายงาน **ทั้งสองอย่าง**
  // (ของเดิม short-circuit ที่ dims อย่างเดียว → CS ใส่ที่อยู่แล้วก็ยังตัน = ติดวนลูป)
  {
    const d = diagnoseThShippingBlock({ fshipby: "2", zip: "", weightKg: 8, sizeCm: 0 });
    assert.deepEqual(d.missing, ["address", "dimensions"], "#52163 → ขาดทั้งที่อยู่ + ขนาด");
    assert.ok(d.reason.includes("ที่อยู่") && d.reason.includes("ขนาด"), "reason แจงครบทั้ง 2");
  }

  // #52194/#52197 PR067 — ไม่เลือกขนส่ง · ไม่มี zip · ไม่ได้วัด (มีแต่น้ำหนักมั่ว)
  {
    const d = diagnoseThShippingBlock({ fshipby: "", zip: "", weightKg: 10741.5, sizeCm: 0 });
    assert.deepEqual(d.missing, ["carrier", "address", "dimensions"], "PR067 → ขาด 3 อย่าง");
  }

  // วัดครบ + มีที่อยู่ + เลือกขนส่ง แต่เกินพิสัย Flash → ต้องกรอกค่าส่งเอง
  {
    const d = diagnoseThShippingBlock({ fshipby: "2", zip: "50000", weightKg: 104, sizeCm: 200 });
    assert.deepEqual(d.missing, ["over_limit"], "เกิน 50 กก. → over_limit");
    assert.ok(d.nextAction.includes("กรอกค่าส่ง"), "บอกให้กรอกเอง");
  }

  // PRE Express — ระบบคิดให้ไม่ได้ ไม่ว่าที่อยู่/ขนาดจะครบหรือไม่
  {
    const d = diagnoseThShippingBlock({ fshipby: "PCSE", zip: "", weightKg: 0, sizeCm: 0 });
    assert.deepEqual(d.missing, ["manual_carrier"], "PCSE → manual เสมอ");
  }

  // ไม่ชั่งน้ำหนัก (วัดขนาดแล้ว)
  {
    const d = diagnoseThShippingBlock({ fshipby: "2", zip: "50000", weightKg: 0, sizeCm: 180 });
    assert.deepEqual(d.missing, ["weight"], "ขาดน้ำหนักอย่างเดียว");
  }

  // ทุกเคสต้องมี reason + nextAction ที่ไม่ว่าง — error ต้องพูดความจริงเสมอ
  // ([[wrong-error-message-hides-real-block]])
  for (const args of [
    { fshipby: "2", zip: "63110", weightKg: 16, sizeCm: 0 },
    { fshipby: "", zip: "", weightKg: 0, sizeCm: 0 },
    { fshipby: "PCSE", zip: "10120", weightKg: 5, sizeCm: 60 },
    { fshipby: "24", zip: "50000", weightKg: 104, sizeCm: 200 },
  ]) {
    const d = diagnoseThShippingBlock(args);
    assert.ok(d.missing.length > 0, "ต้องระบุอย่างน้อย 1 สาเหตุเสมอ");
    assert.ok(d.reason.trim().length > 0, "reason ต้องไม่ว่าง");
    assert.ok(d.nextAction.trim().length > 0, "nextAction ต้องไม่ว่าง");
  }
}

console.log("domestic-shipping.test.ts — all assertions passed");
