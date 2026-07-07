import assert from "node:assert";
import { evaluateRateModeGuard, MODE_LABEL_TH } from "./rate-mode-guard";

let pass = 0;
const t = (name: string, fn: () => void) => {
  try {
    fn();
    pass++;
  } catch (e) {
    console.error(`✗ ${name}`);
    throw e;
  }
};

// ── mismatch: sea container, typed the road rate (3300 vs expected 5300) ──
t("mismatch — เรือ container typed a road-looking rate (3300 vs 5300, other=3300)", () => {
  const g = evaluateRateModeGuard({
    derivedMode: "2",
    typedCbmRate: 3300,
    typedKgRate: 0,
    expectedCbmRate: 5300,
    otherModeCbmRate: 3300,
    expectedKgRate: 0,
    otherModeKgRate: 0,
  });
  assert.equal(g.level, "mismatch");
  assert.equal(g.derivedMode, "2");
  assert.equal(g.expectedCbmRate, 5300);
  assert.equal(g.typedCbmRate, 3300);
  assert.ok(g.message && g.message.includes(MODE_LABEL_TH["2"])); // "ทางเรือ"
  assert.ok(g.message && g.message.includes(MODE_LABEL_TH["1"])); // "ทางรถ" (the near mode)
});

// ── ok: correct rate for the derived mode ──
t("ok — correct เรือ rate typed (5300 vs 5300)", () => {
  const g = evaluateRateModeGuard({
    derivedMode: "2",
    typedCbmRate: 5300,
    typedKgRate: 0,
    expectedCbmRate: 5300,
    otherModeCbmRate: 3300,
    expectedKgRate: 0,
    otherModeKgRate: 0,
  });
  assert.equal(g.level, "ok");
  assert.equal(g.message, null);
});

// ── ok: a modest manual discount (still ≥90% of expected, NOT closer to other) ──
t("ok — small discount not near the other mode (5000 vs 5300, other 3300)", () => {
  const g = evaluateRateModeGuard({
    derivedMode: "2",
    typedCbmRate: 5000,
    typedKgRate: 0,
    expectedCbmRate: 5300,
    otherModeCbmRate: 3300,
    expectedKgRate: 0,
    otherModeKgRate: 0,
  });
  assert.equal(g.level, "ok"); // 5000 ≥ 5300*0.9 (4770) → not materially below
  assert.equal(g.message, null);
});

// ── ok: below expected but NOT closer to the other mode (abs check fails) ──
t("ok — below expected yet still closer to expected than to other (4000 vs 5300, other 500)", () => {
  const g = evaluateRateModeGuard({
    derivedMode: "2",
    typedCbmRate: 4000,      // below 90% of 5300 (4770)
    typedKgRate: 0,
    expectedCbmRate: 5300,
    otherModeCbmRate: 500,   // far away → |4000-500|=3500 > |4000-5300|=1300
    expectedKgRate: 0,
    otherModeKgRate: 0,
  });
  assert.equal(g.level, "ok");
  assert.equal(g.message, null);
});

// ── ok: no container/mode resolved → caller passes zero rates ──
t("ok — no rate cards resolved (all zeros, road)", () => {
  const g = evaluateRateModeGuard({
    derivedMode: "1",
    typedCbmRate: 3300,
    typedKgRate: 0,
    expectedCbmRate: 0,
    otherModeCbmRate: 0,
    expectedKgRate: 0,
    otherModeKgRate: 0,
  });
  assert.equal(g.level, "ok");
  assert.equal(g.message, null);
});

// ── ok: air has no other mode → never mismatches on CBM ──
t("ok — air (mode 3) with no other-mode rate", () => {
  const g = evaluateRateModeGuard({
    derivedMode: "3",
    typedCbmRate: 3300,
    typedKgRate: 0,
    expectedCbmRate: 9000,
    otherModeCbmRate: 0,     // air → caller supplies 0 (no other mode)
    expectedKgRate: 0,
    otherModeKgRate: 0,
  });
  assert.equal(g.level, "ok");
  assert.equal(g.message, null);
});

// ── KG basis: mismatch only when no CBM rates present ──
t("mismatch — KG basis wrong-mode when no CBM cards (17 vs expected 7, other 17)", () => {
  const g = evaluateRateModeGuard({
    derivedMode: "2",        // เรือ expects kg 7
    typedCbmRate: 0,
    typedKgRate: 17,
    expectedCbmRate: 0,
    otherModeCbmRate: 0,
    expectedKgRate: 7,
    otherModeKgRate: 17,     // รถ kg
  });
  assert.equal(g.level, "mismatch");
  assert.ok(g.message && g.message.includes("กก."));
});

// ── ok: typed CBM 0 while expected CBM present → not materially-below vector ──
t("ok — typed CBM 0 with expected present (empty custom field)", () => {
  const g = evaluateRateModeGuard({
    derivedMode: "1",
    typedCbmRate: 0,
    typedKgRate: 0,
    expectedCbmRate: 5000,
    otherModeCbmRate: 3000,
    expectedKgRate: 0,
    otherModeKgRate: 0,
  });
  assert.equal(g.level, "ok");
  assert.equal(g.message, null);
});

console.log(`✓ rate-mode-guard — ${pass} passed`);
