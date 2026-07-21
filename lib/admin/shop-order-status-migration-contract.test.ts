import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL("../../supabase/migrations/0268_shop_order_import_single_spine.sql", import.meta.url),
  "utf8",
);

function includes(fragment: string, message: string): void {
  assert.equal(sql.includes(fragment), true, message);
}

includes("WHEN COUNT(*) = 0 THEN '4'", "empty orders must never complete");
includes("regexp_split_to_table(rs.tracking_bag, '[,，]')", "comma tracking bags must be tokenised");
includes("public.shop_tracking_base(f.ftrackingchn)", "forwarder links must use the split-box base");
includes("bool_and(ts.arrived)", "every active row in a tracking family must arrive");
includes("expected_split_total", "an explicit -N/M family must have complete index coverage");
includes("btrim(COALESCE(f.userid, '')) = t.userid", "fallback tracking must be member-scoped");
includes("f.fstatus <> '99'", "cancelled forwarders must not advance an order");
includes("hdate5 = CASE WHEN target = '5' THEN now()", "completion must stamp hdate5");
includes("AFTER INSERT OR DELETE OR UPDATE OF", "forwarder rollback/delete must re-derive status");
includes("DROP TRIGGER IF EXISTS trg_advance_shop_on_tracking_keyed", "the duplicate 0264 trigger must be removed");
includes("SELECT public.apply_shop_order_status(target_hno)", "the 0264 compatibility API must delegate to the canonical writer");
includes("CREATE OR REPLACE FUNCTION public.get_linked_shop_forwarders", "member/admin reads must share one link spine");

assert.equal(
  /IF\s+NEW\.fstatus[\s\S]+?IN\s*\(\s*'1'\s*,\s*'99'\s*\)\s+THEN\s+RETURN/i.test(sql),
  false,
  "pending/cancelled updates must not early-return before down-correction",
);

console.log("✓ migration 0268 contract: one status/link spine · rollback-safe · user-scoped");
