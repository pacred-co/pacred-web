import assert from "node:assert";
import {
  getMinSellAdvisory,
  effectiveMinSell,
  DEFAULT_MIN_SELL_FLOORS,
  type MinSellFloors,
} from "./min-sell";

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

// Helper: build a floors object with overrides.
const floors = (over: Partial<MinSellFloors> = {}): MinSellFloors => ({
  ...DEFAULT_MIN_SELL_FLOORS,
  ...over,
});

// ── effectiveMinSell ──────────────────────────────────────────────
t("effective floor = base + surcharge (กวางโจว · รถ = 2900)", () => {
  assert.equal(effectiveMinSell(floors(), "1", "1"), 2900);
});

t("effective floor adds sea surcharge (กวางโจว · เรือ = 2900+300)", () => {
  assert.equal(effectiveMinSell(floors(), "1", "2"), 3200);
});

t("effective floor for อี้อู · เรือ = 4900+300", () => {
  assert.equal(effectiveMinSell(floors(), "2", "2"), 5200);
});

t("effective floor 0 when disabled", () => {
  assert.equal(effectiveMinSell(floors({ enabled: false }), "1", "1"), 0);
});

t("unset warehouse / transport → 0 component (no NaN)", () => {
  const f = floors({ base: { "1": 0, "2": 0 }, surcharge: { "1": 0, "2": 0, "3": 0 } });
  assert.equal(effectiveMinSell(f, "1", "3"), 0);
});

// ── getMinSellAdvisory ────────────────────────────────────────────
t("quote at floor → ok, no message, no block", () => {
  const a = getMinSellAdvisory({ floors: floors(), warehouse: "1", transport: "1", quotedThb: 2900 });
  assert.equal(a.level, "ok");
  assert.equal(a.message, null);
  assert.equal(a.shortfallThb, 0);
  assert.equal(a.block, false);
  assert.equal(a.floorThb, 2900);
});

t("quote above floor → ok", () => {
  const a = getMinSellAdvisory({ floors: floors(), warehouse: "1", transport: "1", quotedThb: 5000 });
  assert.equal(a.level, "ok");
  assert.equal(a.message, null);
});

t("quote below floor → below, message, shortfall correct, warn (not block) by default", () => {
  const a = getMinSellAdvisory({ floors: floors(), warehouse: "1", transport: "1", quotedThb: 2500 });
  assert.equal(a.level, "below");
  assert.ok(a.message && a.message.includes("ต่ำกว่าราคาขายขั้นต่ำ"));
  assert.equal(a.shortfallThb, 400);
  assert.equal(a.block, false); // default policy = hard-warn, not block
});

t("below floor with block policy → block=true + ห้าม wording", () => {
  const a = getMinSellAdvisory({ floors: floors({ block: true }), warehouse: "2", transport: "2", quotedThb: 5000 });
  assert.equal(a.level, "below");          // floor = 4900+300 = 5200 > 5000
  assert.equal(a.shortfallThb, 200);
  assert.equal(a.block, true);
  assert.ok(a.message && a.message.includes("ห้ามเสนอราคาต่ำกว่านี้"));
});

t("sea route uses the surcharged floor (กวางโจว เรือ floor 3200)", () => {
  // 3000 is above the รถ floor (2900) but BELOW the เรือ floor (3200).
  const a = getMinSellAdvisory({ floors: floors(), warehouse: "1", transport: "2", quotedThb: 3000 });
  assert.equal(a.level, "below");
  assert.equal(a.floorThb, 3200);
  assert.equal(a.shortfallThb, 200);
  assert.ok(a.message && a.message.includes("ทางเรือ"));
});

t("disabled guardrail → always ok even if quote is tiny", () => {
  const a = getMinSellAdvisory({ floors: floors({ enabled: false }), warehouse: "1", transport: "1", quotedThb: 1 });
  assert.equal(a.level, "ok");
  assert.equal(a.floorThb, 0);
  assert.equal(a.block, false);
});

t("zero / non-finite quote → ok (nothing to evaluate · empty form)", () => {
  assert.equal(getMinSellAdvisory({ floors: floors(), warehouse: "1", transport: "1", quotedThb: 0 }).level, "ok");
  assert.equal(getMinSellAdvisory({ floors: floors(), warehouse: "1", transport: "1", quotedThb: null }).level, "ok");
  assert.equal(getMinSellAdvisory({ floors: floors(), warehouse: "1", transport: "1", quotedThb: NaN }).level, "ok");
});

t("string quote coerced (legacy varchar prices)", () => {
  const a = getMinSellAdvisory({ floors: floors(), warehouse: "1", transport: "1", quotedThb: "2500.50" });
  assert.equal(a.level, "below");
  assert.equal(a.quotedThb, 2500.5);
  assert.equal(a.shortfallThb, 399.5);
});

t("air transport label appears for transport=3", () => {
  const f = floors({ surcharge: { "1": 0, "2": 300, "3": 1000 } });
  const a = getMinSellAdvisory({ floors: f, warehouse: "1", transport: "3", quotedThb: 3000 });
  assert.equal(a.level, "below");        // floor = 2900 + 1000 = 3900
  assert.equal(a.floorThb, 3900);
  assert.ok(a.message && a.message.includes("ทางอากาศ"));
});

console.log(`✓ min-sell — ${pass} passed`);
