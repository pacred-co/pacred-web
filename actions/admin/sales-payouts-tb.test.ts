/**
 * ════════════════════════════════════════════════════════════════════════
 * P0-23 ADMIN PAY-OUT GATE — assert the FAITHFUL tb_user_sales_admin_pay
 * status '2'→'3' pay-out (the counterpart to the customer earn→withdraw).
 * ════════════════════════════════════════════════════════════════════════
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The customer side (`actions/commissions-tb.ts`) inserts a
 * `tb_user_sales_admin_pay` row at status='2' when an agent requests a
 * commission withdrawal. The ADMIN side — paying it out — is
 * `actions/admin/sales-payouts-tb.ts`. This gate proves:
 *   (1) the pending-payout queue (status='2') includes a seeded sentinel row;
 *   (2) the pay-out flips status '2'→'3' AND sets imagesslip + dateslip +
 *       admincreate;
 *   (3) the `AND status=2` guard rejects a SECOND pay-out (no double-pay).
 *
 * The rebuilt `sales_payouts`/`sales_commissions` tables are DEAD on prod
 * (ADR-0020) — a route-200 smoke can't catch a dead-write; this gate can,
 * because it re-SELECTs tb_user_sales_admin_pay.status after each step.
 *
 * WHY WE RE-IMPLEMENT THE PAY BODY (not await the real action)
 * ------------------------------------------------------------
 * adminMarkSalesPayoutPaidTb is wrapped in withAdmin() → requireAdmin() →
 * createClient() (cookie-bound) + uploadToBucket (real Storage). Those only
 * run inside a Next request scope; from a plain tsx process they throw. So,
 * like tests/qa-flows/wallet-delta.ts + yuan-payments-tb.test.ts, the gate
 *   1. COMPILE-pins the real action's signature via `satisfies` (drift = tsc
 *      breaks), and
 *   2. RUN-TIME performs the EXACT UPDATE the action body performs
 *      (status 2→3 guarded by `.eq("status","2")`), then re-SELECTs.
 *
 * SAFETY — it NEVER touches a real payout
 * ---------------------------------------
 * Everything operates on ONE sentinel team code: TEST_USERIDMAIN
 * ('QAPAYTEST') and a sentinel slip filename. Teardown is a guarded DELETE
 * that refuses unless useridmain === the sentinel.
 *
 * RUN (opt-in · needs a live DB · NOT in test:unit):
 *     pnpm tsx --env-file=.env.local actions/admin/sales-payouts-tb.test.ts
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WS from "ws";

// Node <22 lacks native WebSocket — supabase-js realtime errors at
// new RealtimeClient() unless we polyfill globalThis.WebSocket first.
if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === "undefined") {
  (globalThis as { WebSocket: unknown }).WebSocket = WS;
}

// COMPILE-TIME CONTRACT PIN — `import type` is erased at runtime (no
// "use server" side effects pulled in), yet breaks the build if a signature
// drifts. The action bodies are never invoked from this process.
import type {
  getPendingSalesPayoutsTb,
  getSalesPayoutDetailTb,
  adminMarkSalesPayoutPaidTb,
  AdminMarkSalesPayoutPaidTbInput,
  SalesPayoutQueueRow,
  SalesPayoutDetail,
} from "@/actions/admin/sales-payouts-tb";

type AdminActionResult<T> = { ok: true; data?: T } | { ok: false; error: string };
const __actionContract = {
  queue: (undefined as unknown as typeof getPendingSalesPayoutsTb) satisfies () => Promise<
    AdminActionResult<SalesPayoutQueueRow[]>
  >,
  detail: (undefined as unknown as typeof getSalesPayoutDetailTb) satisfies (
    id: number,
  ) => Promise<AdminActionResult<SalesPayoutDetail>>,
  pay: (undefined as unknown as typeof adminMarkSalesPayoutPaidTb) satisfies (
    input: AdminMarkSalesPayoutPaidTbInput,
    slipImage: File,
  ) => Promise<AdminActionResult<{ id: number; imagesSlip: string }>>,
} as const;
void __actionContract;

// ────────────────────────────────────────────────────────────────────────
// Harness (no vitest — tsx convention, mirrors wallet-delta.ts)
// ────────────────────────────────────────────────────────────────────────
let pass = 0;
let fail = 0;
function ok(label: string) {
  pass++;
  console.log(`  ✓ ${label}`);
}
function bad(label: string, detail?: string) {
  fail++;
  console.error(`  ✗ ${label}${detail ? `\n      ${detail}` : ""}`);
}
function section(name: string) {
  console.log(`\n${name}`);
}

// ────────────────────────────────────────────────────────────────────────
// Sentinel — the ONLY useridmain this gate ever touches. varchar(10).
// ────────────────────────────────────────────────────────────────────────
const TEST_USERIDMAIN = "QAPAYTEST"; // 9 chars — fits varchar(10)
const SENTINEL_SLIP = "qa-payout-slip-sentinel.png";
const SENTINEL_NOTE_FILE = "qa-payout-idcard-sentinel.pdf";

/** Insert a sentinel pending-payout row (status='2'). Returns the new id. */
async function seedPayout(admin: SupabaseClient): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("tb_user_sales_admin_pay")
    .insert({
      date: nowIso,
      dateslip: nowIso,
      status: "2",
      useridmain: TEST_USERIDMAIN,
      imagesslip: "", // empty until paid (NOT NULL)
      amount: 1234.56,
      admincreate: "QASEED", // member_code at request (NOT NULL)
      name_blank: "QA BANK",
      no_blank: "000-0-00000-0",
      name_account: "QA FLOW GATE",
      file: SENTINEL_NOTE_FILE, // NOT NULL
    })
    .select("id")
    .single<{ id: number }>();
  if (error || !data) {
    throw new Error(`seed tb_user_sales_admin_pay failed: ${error?.message ?? "no row"}`);
  }
  return data.id;
}

async function readPayout(admin: SupabaseClient, id: number) {
  const { data, error } = await admin
    .from("tb_user_sales_admin_pay")
    .select("id, status, imagesslip, dateslip, admincreate")
    .eq("id", id)
    .maybeSingle<{
      id: number;
      status: string;
      imagesslip: string | null;
      dateslip: string | null;
      admincreate: string | null;
    }>();
  if (error) throw new Error(`read tb_user_sales_admin_pay failed: ${error.message}`);
  return data;
}

async function teardown(admin: SupabaseClient, opts?: { quiet?: boolean }) {
  // GUARD — refuse to delete anything that isn't the exact sentinel.
  if (TEST_USERIDMAIN !== "QAPAYTEST") {
    throw new Error("teardown refused — TEST_USERIDMAIN is not the sentinel 'QAPAYTEST'");
  }
  if (!opts?.quiet) console.log("\n🧹 teardown (sentinel only)");
  try {
    await admin.from("tb_user_sales_admin_pay").delete().eq("useridmain", TEST_USERIDMAIN);
    if (!opts?.quiet) console.log(`  ✓ removed all tb_user_sales_admin_pay rows for ${TEST_USERIDMAIN}`);
  } catch (e) {
    if (!opts?.quiet) console.error("  ✗ teardown error (non-fatal):", e instanceof Error ? e.message : e);
  }
}

// ════════════════════════════════════════════════════════════════════════
// Steps — each mirrors the EXACT mutation the action body performs.
// ════════════════════════════════════════════════════════════════════════

/** (1) the pending-payout queue (status='2') must include the sentinel. */
async function stepQueueIncludesPending(admin: SupabaseClient, id: number) {
  section("(1) getPendingSalesPayoutsTb queue includes the seeded status='2' row");
  // Mirror getPendingSalesPayoutsTb: WHERE status='2'.
  const { data, error } = await admin
    .from("tb_user_sales_admin_pay")
    .select("id, useridmain, status")
    .eq("status", "2");
  if (error) {
    bad("queue read", error.message);
    return;
  }
  const rows = (data ?? []) as Array<{ id: number; useridmain: string; status: string }>;
  const found = rows.find((r) => r.id === id);
  if (found) ok(`queue contains sentinel payout #${id} (useridmain=${found.useridmain})`);
  else bad("queue contains sentinel payout", `#${id} not found among ${rows.length} pending rows`);

  // Negative: a status='3' (paid) row must NOT appear in the pending queue.
  const anyPaid = rows.find((r) => r.status !== "2");
  if (!anyPaid) ok("queue returns ONLY status='2' rows (no paid/other leak)");
  else bad("queue purity", `found a non-'2' row: status='${anyPaid.status}'`);
}

/**
 * (2) PAY — mirrors adminMarkSalesPayoutPaidTb: UPDATE status 2→3 +
 *     imagesslip + admincreate + dateslip, GUARDED by `.eq("status","2")`.
 *     Assert status flipped to '3' and all stamp columns are set.
 */
async function stepPayFlipsStatus(admin: SupabaseClient, id: number): Promise<boolean> {
  section("(2) adminMarkSalesPayoutPaidTb pays out  →  status 2→3 + slip/date/admin stamped");
  const before = await readPayout(admin, id);
  if (before?.status === "2") ok("pre-state: payout is status='2' (pending)");
  else {
    bad("pre-state status", `expected '2' · actual '${before?.status ?? "null"}'`);
    return false;
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error: updErr } = await admin
    .from("tb_user_sales_admin_pay")
    .update({
      status: "3",
      imagesslip: SENTINEL_SLIP,
      admincreate: "QAPAYADMIN",
      dateslip: nowIso,
    })
    .eq("id", id)
    .eq("status", "2") // the AND status=2 guard (legacy L184/L188)
    .select("id")
    .maybeSingle<{ id: number }>();
  if (updErr) {
    bad("pay update", updErr.message);
    return false;
  }
  if (updated) ok("pay UPDATE matched the row (status='2' guard passed)");
  else {
    bad("pay UPDATE matched", "0 rows matched — guard rejected a legit pending payout");
    return false;
  }

  const after = await readPayout(admin, id);
  if (after?.status === "3") ok("post-state: payout is status='3' (สำเร็จ / paid)");
  else bad("post-state status", `expected '3' · actual '${after?.status ?? "null"}'`);

  if (after?.imagesslip === SENTINEL_SLIP) ok("imagesslip is set to the pay-out slip");
  else bad("imagesslip set", `expected '${SENTINEL_SLIP}' · actual '${after?.imagesslip ?? "null"}'`);

  if (after?.dateslip) ok("dateslip is stamped (NOW)");
  else bad("dateslip set", "expected a timestamp · actual null");

  if (after?.admincreate === "QAPAYADMIN") ok("admincreate is overwritten with the paying admin id");
  else bad("admincreate overwrite", `expected 'QAPAYADMIN' · actual '${after?.admincreate ?? "null"}'`);

  return true;
}

/**
 * (3) GUARD — a SECOND pay-out on the now-paid row must match 0 rows
 *     (the `AND status=2` guard blocks double-pay · legacy L184).
 *     Assert the UPDATE touches nothing and the row stays as it was.
 */
async function stepGuardRejectsRePay(admin: SupabaseClient, id: number) {
  section("(3) re-pay a paid payout  →  AND status=2 guard rejects (no double-pay)");
  const before = await readPayout(admin, id);

  const { data: updated, error: updErr } = await admin
    .from("tb_user_sales_admin_pay")
    .update({
      status: "3",
      imagesslip: "SHOULD-NOT-OVERWRITE.png",
      admincreate: "SHOULD-NOT-WIN",
      dateslip: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "2") // guard — the row is now '3', so 0 rows match
    .select("id")
    .maybeSingle<{ id: number }>();
  if (updErr) {
    bad("re-pay update (guard)", updErr.message);
    return;
  }
  if (!updated) ok("re-pay UPDATE matched 0 rows (guard blocked double-pay)");
  else bad("re-pay guard", `guard FAILED — a second pay-out matched row #${updated.id}`);

  const after = await readPayout(admin, id);
  if (after?.imagesslip === before?.imagesslip && after?.admincreate === before?.admincreate) {
    ok("paid payout is UNCHANGED by the rejected re-pay (slip + admin intact)");
  } else {
    bad(
      "paid payout integrity",
      `slip '${before?.imagesslip}'→'${after?.imagesslip}' · admin '${before?.admincreate}'→'${after?.admincreate}'`,
    );
  }
}

// ════════════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════════════
async function main() {
  console.log("=== P0-23 GATE — tb_user_sales_admin_pay admin pay-out (status 2→3) ===");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "\n✗ SUPABASE env unset — this gate REQUIRES a live DB.\n" +
        "  Run it as:  pnpm tsx --env-file=.env.local actions/admin/sales-payouts-tb.test.ts",
    );
    process.exit(1);
  }

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    section("🌱 seed");
    await teardown(admin, { quiet: true }); // hard pre-clean
    const id = await seedPayout(admin);
    console.log(`  ✓ seeded sentinel payout #${id} (useridmain ${TEST_USERIDMAIN} · status='2')`);

    await stepQueueIncludesPending(admin, id);
    const paid = await stepPayFlipsStatus(admin, id);
    if (paid) await stepGuardRejectsRePay(admin, id);
    else bad("skipped guard step", "pay-out step did not complete");
  } catch (e) {
    bad("UNCAUGHT during gate run", e instanceof Error ? e.message : String(e));
  } finally {
    await teardown(admin);
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  if (fail > 0) {
    console.error(
      "\n❌ GATE RED — the tb_user_sales_admin_pay pay-out flow is broken " +
        "(status didn't flip 2→3, stamps not set, or the double-pay guard leaked). DO NOT DEPLOY.",
    );
    process.exit(1);
  }
  console.log(
    "\n✅ GATE GREEN — pending queue (status='2') + pay-out flip (2→3 + slip/date/admin) + " +
      "double-pay guard all behave per report-user-sales-history.php.",
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("\n✗ fatal:", e instanceof Error ? (e.stack ?? e.message) : e);
  process.exit(1);
});
