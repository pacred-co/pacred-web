/**
 * pay-method.test.ts — carrier → ต้นทาง/ปลายทาง derivation.
 * Owner พี่ป๊อป 2026-07-21: pay-at-origin (own-fleet + Flash/J&T/ไปรษณีย์) → ต้นทาง "1";
 * everything else → ปลายทาง "2" (COD). Locked by carrier (no manual per-row toggle).
 * Run: tsx lib/forwarder/pay-method.test.ts
 */
import assert from "node:assert";
import {
  derivePayMethod,
  derivePayMethodForDelivery,
  enforceCodDomesticZero,
  isPayAtOriginCarrier,
} from "./pay-method";

let pass = 0;
function t(name: string, fn: () => void) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

console.log("pay-method.test.ts");

// ── Own-fleet carriers → '1' (ต้นทาง · Pacred prepays) ──────────────────────
t("PCS self-pickup → '1'", () => assert.strictEqual(derivePayMethod("PCS"), "1"));
t("PCSF (เหมาๆ legacy) → '1'", () => assert.strictEqual(derivePayMethod("PCSF"), "1"));
t("PRF (เหมาๆ rebrand) → '1'", () => assert.strictEqual(derivePayMethod("PRF"), "1"));
t("PCSE (Express) → '1'", () => assert.strictEqual(derivePayMethod("PCSE"), "1"));
t("PRE (Express rebrand) → '1'", () => assert.strictEqual(derivePayMethod("PRE"), "1"));

// ── The 3 national couriers Pacred PREPAYS → '1' (ต้นทาง · owner พี่ป๊อป 2026-07-21)
t("Flash (2) → '1' (ต้นทาง · Pacred prepays)", () => assert.strictEqual(derivePayMethod("2"), "1"));
t("J&T (24) → '1' (ต้นทาง · Pacred prepays)", () => assert.strictEqual(derivePayMethod("24"), "1"));
t("ไปรษณีย์ไทย (11) → '1' (ต้นทาง · Pacred prepays)", () => assert.strictEqual(derivePayMethod("11"), "1"));

// ── ที่เหลือ ขนส่งเอกชน (regional/private) → '2' (ปลายทาง / COD) ────────────
t("Kerry (4) → '2' (ปลายทาง)", () => assert.strictEqual(derivePayMethod("4"), "2"));
t("Nim (5) → '2' (ปลายทาง)", () => assert.strictEqual(derivePayMethod("5"), "2"));
t("ธนามัย (13) → '2'", () => assert.strictEqual(derivePayMethod("13"), "2"));
t("free-text private name → '2'", () => assert.strictEqual(derivePayMethod("สมใจสาย4"), "2"));

// ── Empty / unknown → '2' default (not pay-at-origin) ───────────────────────
t("null → '2' default", () => assert.strictEqual(derivePayMethod(null), "2"));
t("undefined → '2' default", () => assert.strictEqual(derivePayMethod(undefined), "2"));
t("'' → '2' default", () => assert.strictEqual(derivePayMethod(""), "2"));

// ── Whitespace trim (cart/forwarder may pass padded values) ─────────────────
t("' PCS ' (padded own-fleet) → '1' via trim", () => assert.strictEqual(derivePayMethod(" PCS "), "1"));
t("' 2 ' (padded Flash) → '1' via trim", () => assert.strictEqual(derivePayMethod(" 2 "), "1"));
t("' 4 ' (padded Kerry) → '2' via trim", () => assert.strictEqual(derivePayMethod(" 4 "), "2"));

// ── isPayAtOriginCarrier = own-fleet + Flash/J&T/ไปรษณีย์ ────────────────────
t("isPayAtOriginCarrier('PCS') true", () => assert.strictEqual(isPayAtOriginCarrier("PCS"), true));
t("isPayAtOriginCarrier('PRF') true (เหมาๆ rebrand)", () => assert.strictEqual(isPayAtOriginCarrier("PRF"), true));
t("isPayAtOriginCarrier('PRE') true (express rebrand)", () => assert.strictEqual(isPayAtOriginCarrier("PRE"), true));
t("isPayAtOriginCarrier('2' Flash) TRUE (national · prepays)", () => assert.strictEqual(isPayAtOriginCarrier("2"), true));
t("isPayAtOriginCarrier('24' J&T) TRUE", () => assert.strictEqual(isPayAtOriginCarrier("24"), true));
t("isPayAtOriginCarrier('11' ไปรษณีย์) TRUE", () => assert.strictEqual(isPayAtOriginCarrier("11"), true));
t("isPayAtOriginCarrier('4' Kerry) false", () => assert.strictEqual(isPayAtOriginCarrier("4"), false));
t("isPayAtOriginCarrier('5' Nim) false", () => assert.strictEqual(isPayAtOriginCarrier("5"), false));
t("isPayAtOriginCarrier(null) false", () => assert.strictEqual(isPayAtOriginCarrier(null), false));
t("isPayAtOriginCarrier('') false", () => assert.strictEqual(isPayAtOriginCarrier(""), false));

// ── derivePayMethodForDelivery — pay-at-origin → '1', ที่เหลือ → '2', empty → '1'
// Owner พี่ป๊อป 2026-07-21: carrier-based (zone not read). "50000"=เชียงใหม่ · "10240"=กทม.
t("Flash (2) → '1' ต้นทาง (national · prepays)", () =>
  assert.strictEqual(derivePayMethodForDelivery("2", { zip: "50000" }), "1"));
t("J&T (24) → '1' ต้นทาง", () =>
  assert.strictEqual(derivePayMethodForDelivery("24", { zip: "10240" }), "1"));
t("ไปรษณีย์ (11) → '1' ต้นทาง", () =>
  assert.strictEqual(derivePayMethodForDelivery("11", { zip: "50000" }), "1"));
t("Kerry (4) → '2' ปลายทาง", () =>
  assert.strictEqual(derivePayMethodForDelivery("4", { zip: "50000" }), "2"));
t("Nim (5) → '2' ปลายทาง", () =>
  assert.strictEqual(derivePayMethodForDelivery("5", { zip: "50000" }), "2"));
t("PCSE (own-fleet) → '1' ต้นทาง", () =>
  assert.strictEqual(derivePayMethodForDelivery("PCSE", { zip: "50000" }), "1"));
t("PCS self-pickup → '1'", () =>
  assert.strictEqual(derivePayMethodForDelivery("PCS", { zip: "50000" }), "1"));
t("PRF เหมาๆ → '1' (own-fleet)", () =>
  assert.strictEqual(derivePayMethodForDelivery("PRF", { zip: "10240" }), "1"));
t("no carrier chosen (null) → '1' ต้นทาง default (no COD yet)", () =>
  assert.strictEqual(derivePayMethodForDelivery(null, {}), "1"));
t("empty carrier '' → '1' ต้นทาง default", () =>
  assert.strictEqual(derivePayMethodForDelivery("", { zip: "50000" }), "1"));

// ── enforceCodDomesticZero — the CARRIER LOCK (owner พี่ป๊อป 2026-07-21) ──────
// pay-at-origin ⇒ '1' (ค่าส่งไทยคงไว้) · ที่เหลือ ⇒ '2' (ค่าส่งไทย = 0) · locked.
t("Flash ต้นทาง — keeps ค่าส่งไทย ฿311", () => {
  const r = enforceCodDomesticZero({ fShipBy: "2", payMethod: "1", transportPrice: 311 });
  assert.strictEqual(r.payMethod, "1");
  assert.strictEqual(r.transportPrice, 311);
});
t("J&T ต้นทาง — keeps ค่าส่งไทย ฿150", () => {
  const r = enforceCodDomesticZero({ fShipBy: "24", payMethod: "1", transportPrice: 150 });
  assert.strictEqual(r.payMethod, "1");
  assert.strictEqual(r.transportPrice, 150);
});
t("ไปรษณีย์ ต้นทาง — keeps ค่าส่งไทย ฿60", () => {
  const r = enforceCodDomesticZero({ fShipBy: "11", transportPrice: 60 });
  assert.strictEqual(r.payMethod, "1");
  assert.strictEqual(r.transportPrice, 60);
});
t("Kerry LOCKED ปลายทาง — even if caller wants '1', forced '2' + ค่าส่งไทย 0", () => {
  const r = enforceCodDomesticZero({ fShipBy: "4", payMethod: "1", transportPrice: 311 });
  assert.strictEqual(r.payMethod, "2");
  assert.strictEqual(r.transportPrice, 0);
  assert.strictEqual(r.changed, true);
});
t("Nim ปลายทาง — ค่าส่งไทย zeroed", () => {
  const r = enforceCodDomesticZero({ fShipBy: "5", payMethod: "2", transportPrice: 200 });
  assert.strictEqual(r.payMethod, "2");
  assert.strictEqual(r.transportPrice, 0);
});
t("own-fleet เหมาๆ (PRF) LOCKED ต้นทาง — even if caller wants COD '2', forced '1'", () => {
  const r = enforceCodDomesticZero({ fShipBy: "PRF", payMethod: "2", transportPrice: 100 });
  assert.strictEqual(r.payMethod, "1");
  assert.strictEqual(r.transportPrice, 100);
  assert.strictEqual(r.changed, true);
});
t("PCS รับเองโกดัง LOCKED ต้นทาง", () => {
  const r = enforceCodDomesticZero({ fShipBy: "PCS", payMethod: "1", transportPrice: 0 });
  assert.strictEqual(r.payMethod, "1");
  assert.strictEqual(r.changed, false);
});
t("empty carrier — keeps caller's '2'", () => {
  const r = enforceCodDomesticZero({ fShipBy: "", payMethod: "2", transportPrice: 50 });
  assert.strictEqual(r.payMethod, "2");
  assert.strictEqual(r.transportPrice, 0);
});
t("empty carrier + no pay → default '1'", () => {
  const r = enforceCodDomesticZero({ fShipBy: null, payMethod: null, transportPrice: 0 });
  assert.strictEqual(r.payMethod, "1");
});
t("NaN transportPrice → 0 (Flash ต้นทาง, price coerces to 0)", () => {
  const r = enforceCodDomesticZero({ fShipBy: "2", payMethod: "1", transportPrice: "abc" });
  assert.strictEqual(r.payMethod, "1");
  assert.strictEqual(r.transportPrice, 0);
});

console.log(`\n  ${pass} passed · 0 failed\n`);
