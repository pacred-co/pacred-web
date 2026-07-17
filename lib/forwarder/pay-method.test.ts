/**
 * pay-method.test.ts — carrier → ต้นทาง/ปลายทาง derivation.
 * Owner 2026-07-18: own-fleet → ต้นทาง "1"; ANY ขนส่งเอกชน → ปลายทาง "2" (COD).
 * Run: tsx lib/forwarder/pay-method.test.ts
 */
import assert from "node:assert";
import { derivePayMethod, derivePayMethodForDelivery, isPayAtOriginCarrier } from "./pay-method";

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

// ── ขนส่งเอกชน (private / third-party) → '2' (ปลายทาง / COD) ────────────────
// Owner 2026-07-18: Flash/J&T/ThaiPost are now ปลายทาง too (Pacred prepays only its OWN fleet).
t("Flash (2) → '2' (ปลายทาง · เอกชน)", () => assert.strictEqual(derivePayMethod("2"), "2"));
t("J&T (24) → '2' (ปลายทาง · เอกชน)", () => assert.strictEqual(derivePayMethod("24"), "2"));
t("ไปรษณีย์ไทย (11) → '2' (ปลายทาง · เอกชน)", () => assert.strictEqual(derivePayMethod("11"), "2"));
t("private carrier (5) → '2' (ปลายทาง)", () => assert.strictEqual(derivePayMethod("5"), "2"));
t("private carrier (13) → '2'", () => assert.strictEqual(derivePayMethod("13"), "2"));
t("free-text private name → '2'", () => assert.strictEqual(derivePayMethod("สมใจสาย4"), "2"));

// ── Empty / unknown → '2' default (not own-fleet) ───────────────────────────
t("null → '2' default", () => assert.strictEqual(derivePayMethod(null), "2"));
t("undefined → '2' default", () => assert.strictEqual(derivePayMethod(undefined), "2"));
t("'' → '2' default", () => assert.strictEqual(derivePayMethod(""), "2"));

// ── Whitespace trim (cart/forwarder may pass padded values) ─────────────────
t("' PCS ' (padded own-fleet) → '1' via trim", () => assert.strictEqual(derivePayMethod(" PCS "), "1"));
t("' 2 ' (padded Flash) → '2' via trim", () => assert.strictEqual(derivePayMethod(" 2 "), "2"));

// ── isPayAtOriginCarrier = own-fleet only ───────────────────────────────────
t("isPayAtOriginCarrier('PCS') true", () => assert.strictEqual(isPayAtOriginCarrier("PCS"), true));
t("isPayAtOriginCarrier('PRF') true (เหมาๆ rebrand)", () => assert.strictEqual(isPayAtOriginCarrier("PRF"), true));
t("isPayAtOriginCarrier('2' Flash) false (เอกชน)", () => assert.strictEqual(isPayAtOriginCarrier("2"), false));
t("isPayAtOriginCarrier('5') false", () => assert.strictEqual(isPayAtOriginCarrier("5"), false));
t("isPayAtOriginCarrier(null) false", () => assert.strictEqual(isPayAtOriginCarrier(null), false));

// ── derivePayMethodForDelivery — own-fleet/empty → '1', ขนส่งเอกชน → '2' ─────
// Owner 2026-07-18: carrier-based (zone no longer read). "50000"=เชียงใหม่ · "10240"=กทม.
t("Flash (2) → '2' ปลายทาง (เอกชน)", () =>
  assert.strictEqual(derivePayMethodForDelivery("2", { zip: "50000" }), "2"));
t("J&T (24) → '2' ปลายทาง", () =>
  assert.strictEqual(derivePayMethodForDelivery("24", { zip: "10240" }), "2"));
t("ไปรษณีย์ (11) → '2' ปลายทาง", () =>
  assert.strictEqual(derivePayMethodForDelivery("11", { zip: "50000" }), "2"));
t("private carrier (5) → '2' ปลายทาง", () =>
  assert.strictEqual(derivePayMethodForDelivery("5", { zip: "50000" }), "2"));
t("PCSE (own-fleet) → '1' ต้นทาง", () =>
  assert.strictEqual(derivePayMethodForDelivery("PCSE", { zip: "50000" }), "1"));
t("PCS self-pickup → '1'", () =>
  assert.strictEqual(derivePayMethodForDelivery("PCS", { zip: "50000" }), "1"));
t("PRF เหมาๆ → '1' (own-fleet)", () =>
  assert.strictEqual(derivePayMethodForDelivery("PRF", { zip: "10240" }), "1"));
t("self-pickup addressID='PCS' → '1'", () =>
  assert.strictEqual(derivePayMethodForDelivery("PCS", { addressID: "PCS", zip: "50000" }), "1"));
t("no carrier chosen (null) → '1' ต้นทาง default (no COD yet)", () =>
  assert.strictEqual(derivePayMethodForDelivery(null, {}), "1"));
t("empty carrier '' → '1' ต้นทาง default", () =>
  assert.strictEqual(derivePayMethodForDelivery("", { zip: "50000" }), "1"));

console.log(`\n  ${pass} passed · 0 failed\n`);
