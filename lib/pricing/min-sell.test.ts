import assert from "node:assert";
import {
  getMinSellAdvisory,
  effectiveMinSell,
  DEFAULT_MIN_SELL_FLOORS,
  type MinSellFloors,
} from "./min-sell";
// KG sell-floor default (owner 2026-07-03 · รถ 17 · เรือ 7). Imported from the
// NON-server-only constants module (lib/admin/sell-floor-config.ts is
// `server-only`, so it can't be imported in a plain tsx unit test — the
// projection + block predicate are re-derived here from the same constants the
// resolver + hard-block use).
import {
  COST_FLOOR,
  KG_FLOOR_DEFAULT,
  type ProductId,
  type TransportId,
  type WarehouseId,
} from "@/lib/admin/customer-rate-tables";

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

// ── KG sell-floor default (รถ 17 · เรือ 7) — owner 2026-07-03 ────────────────
// The KG floor is now a DB-overridable default (pricing.sell_rate_floor_kg), but
// the DEFAULT / fallback source is KG_FLOOR_DEFAULT (flat per transport, shared
// both warehouses). We assert the default values + that the per-customer save
// hard-block predicate (from actions/admin/customer-rate.ts) blocks a below-floor
// KG rate and allows an at/above one — grandfathering an unchanged legacy cell.
// (sell-floor-config.ts is `server-only` → can't import here; the projection +
// predicate are the same pure logic re-derived from the same constant.)

t("KG_FLOOR_DEFAULT is flat 17 (รถ) / 7 (เรือ) for all 4 products", () => {
  for (const p of ["1", "2", "3", "4"] as ProductId[]) {
    assert.equal(KG_FLOOR_DEFAULT["1"][p], 17, `รถ product ${p}`);
    assert.equal(KG_FLOOR_DEFAULT["2"][p], 7, `เรือ product ${p}`);
  }
});

t("COST_FLOOR KG default = 17/7 · same both warehouses", () => {
  for (const wh of ["1", "2"] as WarehouseId[]) {
    for (const p of ["1", "2", "3", "4"] as ProductId[]) {
      assert.equal(COST_FLOOR[wh].kg["1"][p], 17, `wh ${wh} รถ product ${p}`);
      assert.equal(COST_FLOOR[wh].kg["2"][p], 7, `wh ${wh} เรือ product ${p}`);
    }
  }
});

// The exact hard-block predicate from customer-rate.ts (KG side): a NEWLY-set
// (entered !== existing) below-floor rkg blocks; an unchanged legacy value is
// grandfathered; 0 is never below (= "ไม่คิดตามหน่วยนี้").
function kgBlocked(
  wh: WarehouseId,
  t: TransportId,
  p: ProductId,
  entered: number,
  existing: number | null,
): boolean {
  const kgFloor = COST_FLOOR[wh].kg[t][p]; // resolved-default source
  if (!(entered > 0 && kgFloor != null && entered < kgFloor)) return false;
  // grandfather: unchanged legacy below-floor cell does not block
  return !(existing != null && existing === entered);
}

t("KG floor 17 (รถ) blocks a below-floor new save (16 < 17)", () => {
  assert.equal(kgBlocked("1", "1", "1", 16, null), true);
});

t("KG floor 7 (เรือ) blocks a below-floor new save (5 < 7)", () => {
  assert.equal(kgBlocked("2", "2", "1", 5, null), true);
});

t("KG rate AT floor allowed (รถ 17 = 17 → not blocked)", () => {
  assert.equal(kgBlocked("1", "1", "1", 17, null), false);
});

t("KG rate ABOVE floor allowed (เรือ 10 > 7 → not blocked)", () => {
  assert.equal(kgBlocked("2", "2", "1", 10, null), false);
});

t("KG 0 never below floor (= ไม่คิดตามน้ำหนัก)", () => {
  assert.equal(kgBlocked("1", "1", "1", 0, null), false);
});

t("KG grandfather: unchanged legacy below-floor cell does NOT block (15==15)", () => {
  // an old customer at ฿15/kg รถ (below the new 17 floor) — an unrelated save
  // that leaves it unchanged must not be blocked (กันงานหาย).
  assert.equal(kgBlocked("1", "1", "1", 15, 15), false);
});

t("KG grandfather off: CHANGING an existing below-floor cell to another below-floor value blocks", () => {
  // was ฿15, now ฿14 — a NEW below-floor value → blocked.
  assert.equal(kgBlocked("1", "1", "1", 14, 15), true);
});

console.log(`✓ min-sell — ${pass} passed`);
