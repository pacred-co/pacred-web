/**
 * ════════════════════════════════════════════════════════════════════════
 * Re-sweep A2 #28 — DEFAULT FORWARDER-COST MATRIX EDITOR gate.
 *
 * Asserts the `adminSetTbSettingsForwarderCosts` editor for the 144 cost
 * columns + master config on `tb_settings` (id=1):
 *   (1) the carrier registry builds EXACTLY the 144 cost columns that exist
 *       on prod tb_settings — no miss, no extra (so the UI grid + the writer
 *       agree with reality, and a write never 400s on a typo'd column name);
 *   (2) the input schema's allow-list REJECTS an unknown cost column;
 *   (3) the cost-cell range guard REJECTS an out-of-band value;
 *   (4) the master cost-rate range guard REJECTS an out-of-[2,8] hratecost*;
 *   (5) the action's exported signature is compile-pinned (drift → tsc break).
 *
 * SAFETY — it NEVER mutates tb_settings.
 * --------------------------------------
 * tb_settings has a single real prod row (id=1) holding live cost config. A
 * write test here would corrupt production pricing. So this gate is
 * READ-ONLY + pure-logic: it SELECTs the live column set and validates the
 * schema in-process. It does NOT invoke the action (which needs a Next
 * request scope: withAdmin → requireAdmin → cookies); instead it
 *   • COMPILE-pins the action signature via `import type` + `satisfies`, and
 *   • re-validates the SAME zod schema shape the action uses by exercising the
 *     model's allow-list + range constants directly.
 *
 * RUN (opt-in · needs a live DB · NOT in test:unit):
 *     pnpm tsx --env-file=.env.local actions/admin/tb-settings-cost.test.ts
 * ════════════════════════════════════════════════════════════════════════
 */

import { z } from "zod";
import {
  ALL_COST_COLUMNS,
  ALL_COST_COLUMNS_SET,
  CARRIERS,
  PRODUCT_TYPES,
  CITY_VARIANTS,
  TRANSPORTS,
  MASTER_NUMERIC_COLUMNS,
  COST_RATE_MIN,
  COST_RATE_MAX,
  COST_CELL_MIN,
  COST_CELL_MAX,
  costColumn,
} from "@/app/[locale]/(admin)/admin/settings/forwarder-costs/costs-model";

// COMPILE-TIME CONTRACT PIN — `import type` is erased at runtime (no
// "use server" side effects), yet breaks the build if the signature drifts.
import type {
  adminSetTbSettingsForwarderCosts,
  SetTbSettingsForwarderCostsInput,
} from "./tb-settings";

type _PinFn = typeof adminSetTbSettingsForwarderCosts;
const _pin = (fn: _PinFn) =>
  fn satisfies (
    input: SetTbSettingsForwarderCostsInput,
  ) => Promise<{ ok: true; data?: { updated: string[] } } | { ok: false; error: string }>;
void _pin;

// ── Tiny assert harness (matches the repo's tsx test convention) ──────────
let passed = 0;
let failed = 0;
function assert(cond: boolean, label: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
  }
}

// Re-create the SAME schema shape the action uses, so we exercise the exact
// validation logic (allow-list + range bands sourced from the shared model).
const costRecord = z
  .record(z.string(), z.number())
  .refine((rec) => Object.keys(rec).every((k) => ALL_COST_COLUMNS_SET.has(k)))
  .refine((rec) =>
    Object.values(rec).every(
      (v) => Number.isFinite(v) && v >= COST_CELL_MIN && v <= COST_CELL_MAX,
    ),
  );

async function main() {
  console.log("── A2 #28 forwarder-cost matrix editor gate ──");

  // ── (1) registry completeness ──────────────────────────────────────────
  console.log("\n[1] carrier registry builds the right column set");
  assert(ALL_COST_COLUMNS.length === 144, `144 cost columns built (got ${ALL_COST_COLUMNS.length})`);
  assert(
    ALL_COST_COLUMNS.length === new Set(ALL_COST_COLUMNS).size,
    "no duplicate column names",
  );
  assert(
    CARRIERS.length === 9 &&
      TRANSPORTS.length === 2 &&
      PRODUCT_TYPES.length === 4 &&
      CITY_VARIANTS.length === 2,
    "registry dims = 9 carriers × 2 transports × 4 types × 2 cities",
  );
  assert(
    costColumn("car", 1, "", "") === "fcostcar1default",
    "CTT truck general gz = fcostcar1default",
  );
  assert(
    costColumn("ship", 3, "mxcargo", "2") === "fcostship3defaultmxcargo2",
    "MX sea FDA yiwu = fcostship3defaultmxcargo2",
  );
  assert(
    ALL_COST_COLUMNS.every((c) => /^fcost(car|ship)[1-4]default[a-z]*2?$/.test(c)),
    "every built column matches the lowercase fcost… pattern",
  );

  // ── (2)+(3) schema validation (pure, no DB) ──────────────────────────────
  console.log("\n[2] allow-list rejects unknown column · accepts a real one");
  assert(costRecord.safeParse({ fcostcar1default: 5400 }).success, "accepts a known column");
  assert(
    !costRecord.safeParse({ fCostCar1Default: 5400 }).success,
    "rejects camelCase (not a prod column)",
  );
  assert(
    !costRecord.safeParse({ fcostcar9default: 5400 }).success,
    "rejects out-of-range index fcostcar9default",
  );
  assert(
    !costRecord.safeParse({ dropme: 1, fcostcar1default: 5400 }).success,
    "rejects a payload containing ANY unknown key",
  );

  console.log("\n[3] cost-cell range guard");
  assert(costRecord.safeParse({ fcostcar1default: 0 }).success, `0 allowed (min=${COST_CELL_MIN})`);
  assert(
    costRecord.safeParse({ fcostcar1default: COST_CELL_MAX }).success,
    `max ${COST_CELL_MAX} allowed`,
  );
  assert(
    !costRecord.safeParse({ fcostcar1default: COST_CELL_MAX + 1 }).success,
    "rejects above-max (stray extra digit)",
  );
  assert(
    !costRecord.safeParse({ fcostcar1default: -1 }).success,
    "rejects negative",
  );

  // ── (4) master cost-rate band sanity ─────────────────────────────────────
  console.log("\n[4] master cost-rate guard band");
  assert(MASTER_NUMERIC_COLUMNS.map((m) => m.col).includes("hratecostdefault"), "hratecostdefault is a master col");
  assert(MASTER_NUMERIC_COLUMNS.map((m) => m.col).includes("hratecostsale"), "hratecostsale is a master col");
  assert(COST_RATE_MIN === 2.0 && COST_RATE_MAX === 8.0, "rate band [2.0, 8.0]");
  const inBand = (v: number) => v >= COST_RATE_MIN && v <= COST_RATE_MAX;
  assert(inBand(4.84) && !inBand(48.4) && !inBand(0.484), "4.84 ok · 48.4/0.484 blocked");

  // ── (5) LIVE read-only: registry vs prod tb_settings ─────────────────────
  console.log("\n[5] built columns ALL exist on prod tb_settings (read-only)");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Canonical env name only (audit:env enforces .env.example parity — the
  // SUPABASE_SERVICE_ROLE / SUPABASE_SERVICE_KEY fallbacks tripped it).
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn("  ⚠ SKIP live check — no SUPABASE env (pass --env-file=.env.local)");
  } else {
    const res = await fetch(`${url}/rest/v1/tb_settings?id=eq.1&select=*`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    assert(res.ok, `tb_settings fetch ok (HTTP ${res.status})`);
    const rows = (await res.json()) as Record<string, unknown>[];
    assert(rows.length === 1, "tb_settings row id=1 exists");
    if (rows[0]) {
      const live = new Set(Object.keys(rows[0]));
      const missing = ALL_COST_COLUMNS.filter((c) => !live.has(c));
      assert(missing.length === 0, `all 144 built columns present on prod (missing: ${missing.length})`);
      for (const m of MASTER_NUMERIC_COLUMNS) {
        assert(live.has(m.col), `master col ${m.col} present on prod`);
      }
      assert(live.has("numberpaymemt"), "numberpaymemt present on prod");
      assert(live.has("freeshipping"), "freeshipping present on prod");
    }
  }

  console.log(`\n── RESULT: ${passed} passed / ${failed} failed ──`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
