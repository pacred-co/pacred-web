/**
 * actions/admin/earn-trigger-tb-user-sales.ts — P1-5 earn-trigger
 *
 * Per ADR-0019 D-B (`docs/decisions/0019-customer-backend-arch-decisions-2026-05-30.md`)
 * + master gap audit P1-5 (`docs/research/legacy-gap-2026-05-30/_MASTER.md`)
 * + cust-07 P0-2 (`docs/research/legacy-gap-2026-05-30/cust-07-sales.md`)
 * + master-fidelity Tier-C #5 (`docs/audit/master-fidelity-2026-05-30-evening.md` L127).
 *
 * Legacy reference — `pcs-admin/forwarder.php` L1354-1389 / L1656-1696 (and
 * the parallel path in `forwarder-driver/takePhoto.php` → driver-deliver):
 * when a forwarder row transitions to `fstatus='7'` (ส่งสำเร็จ · delivered),
 * the legacy admin code looks up the customer's `tb_users.coid` and — for
 * any of the 4 hardcoded VIP teams (THADA.VIP / SIN.VIP / OOAEOM.VIP / SWAN)
 * — INSERTs a row into `tb_user_sales` that the team-leader can later see
 * on `/sales/report` and withdraw as commission. The legacy dedups by
 * `SELECT IDF … WHERE IDF='$ID'` so re-flipping the same forwarder doesn't
 * accrue twice.
 *
 * Pacred has the READ side (`/sales/*` reads `tb_user_sales` → `tb_forwarder`
 * → `tb_users.coid` faithfully) but ZERO WRITE side — verified by
 * `Grep -rln 'from.*tb_user_sales.*insert' actions/` = empty. The 4 partner
 * agents earn nothing on new deliveries; `/sales` stale-divulges over time.
 *
 * This file is the backend-only helper that fills the gap. It:
 *
 *   1. SELECTs the eligible `tb_forwarder` rows by id (only the 5 columns we
 *      need: id, fno, userid, fdatestatus7).
 *   2. Bulk-resolves the customers' `tb_users.coid` (one round-trip for the
 *      whole batch — driver-deliver paths only ever pass 1 id; the bulk
 *      forwarder action passes N).
 *   3. For each forwarder whose customer's `coid` is in the 4-VIP whitelist,
 *      SELECT-or-INSERT a row into `tb_user_sales`:
 *
 *        useridmain  = the customer's coid (= the team — e.g. "THADA.VIP")
 *        userid      = the customer's userid (e.g. "PR1234")
 *        idf         = the tb_forwarder.id (the legacy dedup key)
 *        date        = the forwarder's fdatestatus7 (when delivery completed)
 *                       OR now() if fdatestatus7 isn't set yet
 *        usstatus    = '1' (ยังไม่เบิกจ่าย — the entry status)
 *
 *   4. Idempotency key = `idf` alone (matches legacy `SELECT IDF … WHERE IDF='$ID'`
 *      dedup) — if a row already exists for the forwarder, skip.
 *
 * What this file does NOT do (deferred to P1-3 / P1-4 / Path-A withdraw work):
 *   - No commission math (1% / 3% / WHT / min ฿1,000) — that runs at WITHDRAW
 *     time on the legacy `getListForwarder.php` → `add` POST, NOT at earn time.
 *     The earn row stores no money — just the (team, customer, forwarder) link.
 *   - No `tb_user_sales_admin_pay` / `tb_user_sales_pay` writes — those are
 *     the withdraw-batch tables, written at withdraw step.
 *
 * This file is SERVER-ONLY (no "use server"; no client-callable exports).
 * Callers are the two flip-to-7 paths in `actions/admin/*`:
 *
 *   1. actions/admin/forwarders.ts::adminBulkUpdateForwarderTbStatus
 *      — bulk admin status-flip from the list-bar.
 *   2. actions/admin/driver-work.ts::transitionItemStatus(action='deliver')
 *      — driver mobile "ส่งสำเร็จ" → fstatus auto-flip.
 *
 * Failure mode: best-effort. The status-flip MUST NOT roll back if the
 * earn-trigger fails (DB blip, partial write). The earn-trigger logs the
 * failure and returns; the original flip already succeeded.
 *
 * Schema citations (supabase/migrations/0081_pcs_legacy_schema.sql):
 *   • tb_user_sales       L5705-5712  — 6 columns: id (bigint PK, autoinc),
 *                                       usstatus (varchar(1)),
 *                                       date (timestamp), useridmain (varchar(10)),
 *                                       userid (varchar(10)), idf (bigint)
 *   • tb_forwarder        L1598-…     — id, fno, userid, fstatus, fdatestatus7
 *   • tb_users            L5828-…     — userid (varchar(10)), coid (varchar(10),
 *                                       default 'PCS')
 *
 * The 4 hardcoded VIP `coid` values (verified against
 * `app/[locale]/(protected)/sales/team-map.ts` + `register/page.tsx` L33-34
 * + cust-07 P0-2 + forwarders-fidelity P0-5):
 *   THADA.VIP   (member PCS888 / PR888  · urlRecom THADA)
 *   SIN.VIP     (members PCS352/PCS2000 / PR352/PR2000 · urlRecom SIN/THADA)
 *   OOAEOM.VIP  (member PCS2678 / PR2678 · urlRecom OOAEOM)
 *   SWAN        (member PCS4155 / PR4155 · urlRecom SWAN — note: no ".VIP" suffix)
 *
 * Server-only by convention — this file lives under actions/admin/ and is
 * only ever called from "use server" sibling files (forwarders.ts +
 * driver-work.ts). It has NO "use server" directive of its own (it exports
 * a helper function, not a client-callable action) and NO `import
 * "server-only"` runtime guard — the latter is omitted so the unit test
 * (which runs under `tsx` without Next's bundler) can import the helper
 * directly. Same pragmatic pattern as lib/admin/momo-raw-helpers.ts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

// ────────────────────────────────────────────────────────────
// The 4 hardcoded VIP `coid` values that accrue commission.
// ────────────────────────────────────────────────────────────
// Sourced from app/[locale]/(protected)/sales/team-map.ts (the legacy
// userIDMain derivation transcribed 1:1) + the register page recom→coid
// mapping (e.g. `?recom=THADA` → `coID='THADA.VIP'`).
//
// IMPORTANT: SWAN has NO ".VIP" suffix in legacy — it's literally "SWAN".
// The other three are "<NAME>.VIP". This matches `team-map.ts` L46-54.
export const VIP_COID_WHITELIST: readonly string[] = [
  "THADA.VIP",
  "SIN.VIP",
  "OOAEOM.VIP",
  "SWAN",
] as const;

export type VipCoid = (typeof VIP_COID_WHITELIST)[number];

/** Strict checker — used by the loop + the tests. */
export function isVipCoid(coid: string | null | undefined): coid is VipCoid {
  if (coid == null) return false;
  return (VIP_COID_WHITELIST as readonly string[]).includes(coid);
}

// ────────────────────────────────────────────────────────────
// Internal types
// ────────────────────────────────────────────────────────────
type ForwarderRow = {
  id: number;
  /** legacy userid e.g. "PR1234" — joins tb_users.userid */
  userid: string | null;
  /** delivery timestamp; null if upstream didn't set it (we fall back to now). */
  fdatestatus7: string | null;
};

type UserRow = {
  userid: string;
  coid: string;
};

type ExistingSalesRow = {
  idf: number;
};

/** The result envelope — surfaced for audit + structured logging by callers. */
export type EarnTriggerResult = {
  /** Rows actually INSERTed into tb_user_sales this call. */
  inserted: number;
  /** Rows skipped — already had a tb_user_sales row OR coid not VIP. */
  skipped: number;
  /**
   * Non-fatal errors collected while processing. Caller logs but does NOT
   * surface to UI — earn-trigger is best-effort.
   */
  errors: string[];
};

// ────────────────────────────────────────────────────────────
// Main entry point
// ────────────────────────────────────────────────────────────
/**
 * INSERT a `tb_user_sales` row for each of the given `forwarder_id`s whose
 * customer's `tb_users.coid` matches one of the 4 hardcoded VIP teams.
 *
 * Idempotent: if a row already exists for `(idf=<forwarder_id>)`, skip.
 * Audit-friendly: returns `{ inserted, skipped, errors }`.
 *
 * Callers MUST treat the return value as advisory ONLY — a non-empty
 * `errors` array does NOT mean the calling fstatus flip should roll back.
 * Earn-trigger failure is logged and accepted.
 *
 * @param admin       The service-role SupabaseClient (createAdminClient()).
 * @param forwarderIds tb_forwarder.id values that JUST flipped to fstatus='7'.
 *                     Empty array → no-op return ({inserted:0, skipped:0}).
 */
export async function fireUserSalesEarnTriggerOnDelivery(
  admin: SupabaseClient,
  forwarderIds: number[],
): Promise<EarnTriggerResult> {
  const result: EarnTriggerResult = { inserted: 0, skipped: 0, errors: [] };
  if (forwarderIds.length === 0) return result;

  // De-dup the input list — guard against callers accidentally passing the
  // same id twice in the same batch.
  const ids = [...new Set(forwarderIds)];

  // ── 1. Load the eligible tb_forwarder rows ─────────────────────────
  // Only need 3 columns: id, userid (to join tb_users), fdatestatus7 (the
  // event timestamp we want on tb_user_sales.date).
  const { data: fwdRaw, error: fwdErr } = await admin
    .from("tb_forwarder")
    .select("id, userid, fdatestatus7")
    .in("id", ids);
  if (fwdErr) {
    result.errors.push(`tb_forwarder lookup failed: ${fwdErr.message}`);
    return result;
  }
  const forwarders = (fwdRaw ?? []) as unknown as ForwarderRow[];
  if (forwarders.length === 0) {
    // No rows found — caller passed ids that don't exist. Treat as skip.
    result.skipped = ids.length;
    return result;
  }

  // ── 2. Bulk-resolve customer coid via tb_users ─────────────────────
  const customerIds = [
    ...new Set(forwarders.map((f) => f.userid).filter((u): u is string => !!u)),
  ];
  const coidByUserid = new Map<string, string>();
  if (customerIds.length > 0) {
    const { data: usersRaw, error: usersErr } = await admin
      .from("tb_users")
      // tb_users columns are camelCase on prod+dev; alias to keep the UserRow reads.
      .select("userid:userID, coid:coID")
      .in("userID", customerIds);
    if (usersErr) {
      result.errors.push(`tb_users lookup failed: ${usersErr.message}`);
      return result;
    }
    for (const u of (usersRaw ?? []) as unknown as UserRow[]) {
      coidByUserid.set(u.userid, u.coid);
    }
  }

  // ── 3. Pre-check idempotency in bulk (one round-trip) ──────────────
  // Legacy dedup key is `idf` alone (`SELECT IDF … WHERE IDF='$ID'`).
  const eligibleIds = forwarders
    .filter((f) => f.userid != null && isVipCoid(coidByUserid.get(f.userid)))
    .map((f) => f.id);

  const alreadyEarned = new Set<number>();
  if (eligibleIds.length > 0) {
    const { data: existingRaw, error: existingErr } = await admin
      .from("tb_user_sales")
      .select("idf")
      .in("idf", eligibleIds);
    if (existingErr) {
      result.errors.push(`tb_user_sales lookup failed: ${existingErr.message}`);
      return result;
    }
    for (const r of (existingRaw ?? []) as unknown as ExistingSalesRow[]) {
      alreadyEarned.add(r.idf);
    }
  }

  // ── 4. Build the INSERT batch ──────────────────────────────────────
  // The legacy date column is `tb_user_sales.date` (timestamp); we use the
  // forwarder's fdatestatus7 when present — the moment delivery completed —
  // and fall back to NOW() if the caller hasn't stamped it yet (defensive;
  // both flip paths DO set fdatestatus7 in the same UPDATE).
  const nowIso = new Date().toISOString();
  type InsertRow = {
    useridmain: string;
    userid: string;
    idf: number;
    date: string;
    usstatus: string;
  };
  const toInsert: InsertRow[] = [];
  for (const f of forwarders) {
    // Filter chain — every reject increments skipped.
    if (!f.userid) {
      result.skipped += 1;
      continue;
    }
    const coid = coidByUserid.get(f.userid);
    if (!isVipCoid(coid)) {
      result.skipped += 1;
      continue;
    }
    if (alreadyEarned.has(f.id)) {
      // Idempotent skip — row already exists for this forwarder.
      result.skipped += 1;
      continue;
    }
    toInsert.push({
      useridmain: coid,            // the VIP team (e.g. "THADA.VIP")
      userid:     f.userid,         // the customer (e.g. "PR1234")
      idf:        f.id,
      date:       f.fdatestatus7 ?? nowIso,
      usstatus:   "1",              // ยังไม่เบิกจ่าย
    });
  }

  // ── 5. INSERT the new rows ─────────────────────────────────────────
  if (toInsert.length > 0) {
    const { error: insErr } = await admin
      .from("tb_user_sales")
      .insert(toInsert);
    if (insErr) {
      // Don't double-count toInsert.length as skipped — leave the count
      // honest (they were eligible but the INSERT failed at the row level).
      // 0183 backstop — ux_tb_user_sales_idf rejects a concurrent earn-trigger
      // (two flip-to-7 paths racing on the same forwarder) that slipped past
      // the bulk idempotency pre-check (220-232) with a raw Postgres 23505.
      // Record a friendly message instead of the raw error.
      result.errors.push(
        insErr.code === "23505"
          ? "คอมมิชชั่นรายการนี้ถูกบันทึกไปแล้ว"
          : `tb_user_sales insert failed: ${insErr.message}`,
      );
      return result;
    }
    result.inserted = toInsert.length;
  }

  return result;
}
