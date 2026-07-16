/**
 * pay-method.test.ts — carrier → ต้นทาง/ปลายทาง derivation (setPayMethodShip port).
 * Run: tsx lib/forwarder/pay-method.test.ts
 */
import assert from "node:assert";
import { derivePayMethod, derivePayMethodForDelivery, isPayAtOriginCarrier, PAY_AT_ORIGIN_CARRIERS } from "./pay-method";

let pass = 0;
function t(name: string, fn: () => void) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

console.log("pay-method.test.ts");

// ── Origin-billing carriers → '1' (ต้นทาง) ──────────────────────────────
t("Flash (2) → '1' (ต้นทาง)", () => assert.strictEqual(derivePayMethod("2"), "1"));
t("J&T (24) → '1' (ต้นทาง)", () => assert.strictEqual(derivePayMethod("24"), "1"));
t("ไปรษณีย์ไทย (11) → '1' — the GAP-2 faithfulness fix", () =>
  assert.strictEqual(derivePayMethod("11"), "1"));
t("PCS self-pickup → '1'", () => assert.strictEqual(derivePayMethod("PCS"), "1"));
t("PCSF (เหมาๆ promo) → '1'", () => assert.strictEqual(derivePayMethod("PCSF"), "1"));
t("PCSE (Express) → '1'", () => assert.strictEqual(derivePayMethod("PCSE"), "1"));

// ── Private destination carriers → '2' (ปลายทาง / COD) ──────────────────
t("private carrier (5) → '2' (ปลายทาง)", () => assert.strictEqual(derivePayMethod("5"), "2"));
t("private carrier (13) → '2'", () => assert.strictEqual(derivePayMethod("13"), "2"));

// ── Empty / unknown → '2' default (legacy fall-through) ──────────────────
t("null → '2' default", () => assert.strictEqual(derivePayMethod(null), "2"));
t("undefined → '2' default", () => assert.strictEqual(derivePayMethod(undefined), "2"));
t("'' → '2' default", () => assert.strictEqual(derivePayMethod(""), "2"));

// ── Whitespace trim (cart/forwarder may pass padded values) ─────────────
t("' 2 ' (padded Flash) → '1' via trim", () => assert.strictEqual(derivePayMethod(" 2 "), "1"));

// ── isPayAtOriginCarrier mirrors derivePayMethod ────────────────────────
t("isPayAtOriginCarrier('PCS') true", () => assert.strictEqual(isPayAtOriginCarrier("PCS"), true));
t("isPayAtOriginCarrier('PRF') true (เหมาๆ rebrand)", () => assert.strictEqual(isPayAtOriginCarrier("PRF"), true));
t("isPayAtOriginCarrier('5') false", () => assert.strictEqual(isPayAtOriginCarrier("5"), false));
t("isPayAtOriginCarrier(null) false", () => assert.strictEqual(isPayAtOriginCarrier(null), false));

// ── Set membership = the 6 legacy origin carriers + PRF (PCSF rebrand) = 7 ───────
t("PAY_AT_ORIGIN_CARRIERS has exactly 8 entries (incl. PRF/PRE)", () =>
  assert.strictEqual(PAY_AT_ORIGIN_CARRIERS.size, 8));

// ── derivePayMethodForDelivery — DEFAULT ต้นทาง "1" for ALL carriers/zones ───
// Owner 2026-07-09: the upcountry-external→COD auto-flip is REMOVED. The real Flash
// cost + margin is auto-filled + billed upfront; COD "2" is a MANUAL admin choice.
// "50000" = เชียงใหม่ (upcountry) · "10240" = กทม (free/maomao zone).
t("upcountry + Flash (2) → '1' ต้นทาง (COD auto-flip removed)", () =>
  assert.strictEqual(derivePayMethodForDelivery("2", { zip: "50000" }), "1"));
t("upcountry + J&T (24) → '1' ต้นทาง", () =>
  assert.strictEqual(derivePayMethodForDelivery("24", { zip: "50000" }), "1"));
t("upcountry + ไปรษณีย์ (11) → '1' ต้นทาง", () =>
  assert.strictEqual(derivePayMethodForDelivery("11", { zip: "50000" }), "1"));
t("upcountry + PCSE (own-fleet) → '1' ต้นทาง", () =>
  assert.strictEqual(derivePayMethodForDelivery("PCSE", { zip: "50000" }), "1"));
t("upcountry + PCS self-pickup → '1'", () =>
  assert.strictEqual(derivePayMethodForDelivery("PCS", { zip: "50000" }), "1"));
t("upcountry + PRF เหมาๆ → '1' (own-fleet)", () =>
  assert.strictEqual(derivePayMethodForDelivery("PRF", { zip: "50000" }), "1"));
t("BKK zip + Flash (2) → '1' ต้นทาง", () =>
  assert.strictEqual(derivePayMethodForDelivery("2", { zip: "10240" }), "1"));
t("maomao zip + PRF → '1'", () =>
  assert.strictEqual(derivePayMethodForDelivery("PRF", { zip: "10240" }), "1"));
t("self-pickup addressID='PCS' + upcountry zip → '1'", () =>
  assert.strictEqual(derivePayMethodForDelivery("PCS", { addressID: "PCS", zip: "50000" }), "1"));
t("upcountry + private carrier (5) → '1' ต้นทาง (COD is now manual-only)", () =>
  assert.strictEqual(derivePayMethodForDelivery("5", { zip: "50000" }), "1"));
t("null carrier + no address → '1' default", () =>
  assert.strictEqual(derivePayMethodForDelivery(null, {}), "1"));

console.log(`\n  ${pass} passed · 0 failed\n`);
