/**
 * Wave 30 — auto-commit eligible MOMO rows after a cron sync.
 *
 * ภูม brief (2026-05-30): "อยากให้ระบบ pull MOMO ทุก N นาที + auto ลง
 * tb_forwarder ด้วย ไม่ต้องกด /review ทุก row". This helper is the
 * auto-commit step that runs RIGHT after `runMomoSync` completes.
 *
 * Eligibility rules (conservative — only commits HIGH CONFIDENCE rows):
 *
 *   1. committed_at IS NULL (not already committed)
 *   2. momo_tracking_no IS NOT NULL (otherwise nothing to insert)
 *   3. raw.user_group + raw.user_code → derive `guessedUserId` (e.g.
 *      "PR032"); MUST exist in tb_users.userID. If we can't find a
 *      matching customer, we DON'T guess — admin verifies at /review.
 *   4. Sane defaults applied:
 *      - fShipBy = "PCS"  (pickup at PCS warehouse — safe default)
 *      - fProductsType = "1" (ทั่วไป — same as legacy default)
 *
 * Rows that don't qualify stay at /review for admin to commit manually
 * via the existing `commitMomoRowToForwarder` action (Wave 26 G1).
 *
 * Why this is safer than auto-committing everything:
 *   - MOMO's user_group / user_code can be incomplete or wrong (the new
 *     MOMO partner doesn't always tag rows correctly).
 *   - Wrong commit → tb_forwarder row owned by the wrong customer → money
 *     bill goes to wrong person. Don't let cron cause that.
 *   - Conservative auto-commit + manual review for everything else is the
 *     legacy-faithful workflow (PCS เก่าใช้ updateAPI → manualUpdate ทั้ง
 *     2 steps manual — Pacred just adds an automation layer on top).
 *
 * @see actions/admin/momo-commit.ts — the canonical commit action
 * @see docs/research/legacy-accounting-reality-2026-05-30.md §4
 *
 * ✅ RESOLVED in Wave 30.5 (was a KNOWN LIMITATION in Wave 30 #2):
 *
 *   Previously this helper called `commitMomoRowToForwarder`, which is
 *   wrapped with `withAdmin(["super","ops","warehouse"])` → requires an
 *   admin session cookie. In cron context (NO session, just service-role)
 *   withAdmin threw `requireAdmin: no admin role`, so every eligible row
 *   was marked "failed" — cron pulled MOMO data but committed NOTHING.
 *
 *   The fix: the commit body was extracted into the auth-agnostic core
 *   `lib/admin/commit-momo-row-core.ts` as `commitMomoRowCore(ctx, input)`.
 *   The admin button resolves its ctx from the session inside withAdmin;
 *   this cron helper calls `commitMomoRowSystem` (a system ctx — no
 *   session, adminid="momo-cron", committed_by=null) which runs the SAME
 *   write path. So cron can now auto-commit eligible rows.
 *
 *   ⚠️ SAFETY GATE: the cron route (app/api/cron/momo-sync/route.ts) only
 *   invokes this helper when `process.env.MOMO_CRON_AUTOCOMMIT === "true"`.
 *   Default OFF = pull-only (fresh MOMO data every N min, admin still
 *   clicks /review to commit). Flip the env to ON once ภูม has eyeballed a
 *   sample of auto-committed rows. Money-path conservatism: a wrong commit
 *   bills the wrong customer, so we opt INTO automation, not out of it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { commitMomoRowSystem } from "@/lib/admin/commit-momo-row-core";

export type AutoCommitMomoResult = {
  /** Total uncommitted rows scanned. */
  scanned: number;
  /** Eligible rows attempted (passed guessedUserId + tb_users check). */
  attempted: number;
  /** Successfully committed → tb_forwarder rows. */
  succeeded: number;
  /** Failed despite being eligible (DB error / unique-constraint / etc.). */
  failed: number;
  /** Skipped — no guessedUserId OR not in tb_users (admin needs to review). */
  skipped: number;
  /** Per-row outcomes — for the cron's summary log. */
  perRow: Array<{
    rowId: string;
    momoTrackingNo: string | null;
    guessedUserId: string | null;
    outcome: "committed" | "skipped_no_userid" | "skipped_unknown_user" | "failed";
    forwarderId?: number;
    error?: string;
  }>;
};

/**
 * Scan uncommitted momo_import_tracks + auto-commit eligible rows.
 *
 * @param admin   service-role client (cron context — no admin user)
 * @param maxRows safety cap to avoid pathological 10k-row loops (default 100)
 */
export async function autoCommitEligibleMomoRows(
  admin: SupabaseClient,
  maxRows: number = 100,
): Promise<AutoCommitMomoResult> {
  const result: AutoCommitMomoResult = {
    scanned:   0,
    attempted: 0,
    succeeded: 0,
    failed:    0,
    skipped:   0,
    perRow:    [],
  };

  // 1. Fetch uncommitted rows (limit to maxRows)
  const { data: uncommitted, error: scanErr } = await admin
    .from("momo_import_tracks")
    .select("id, momo_tracking_no, momo_container_no, momo_user_code, momo_user_group, raw")
    .is("committed_at", null)
    .not("momo_tracking_no", "is", null)
    .order("last_synced_at", { ascending: false })
    .limit(maxRows);

  if (scanErr) {
    console.error("[autoCommitEligibleMomoRows] scan failed", {
      code: scanErr.code,
      message: scanErr.message,
    });
    return result;
  }

  result.scanned = uncommitted?.length ?? 0;
  if (result.scanned === 0) return result;

  // 2. Collect all candidate userIds in one batch → minimise tb_users
  //    round-trips. Build a Set of valid userIDs that exist on prod.
  const candidates: Array<{
    rowId: string;
    momoTrackingNo: string | null;
    guessedUserId: string | null;
  }> = [];
  for (const row of uncommitted ?? []) {
    const raw = row.raw as Record<string, unknown> | null;
    const userGroup =
      raw && typeof raw === "object" && typeof raw.user_group === "string"
        ? raw.user_group
        : (row.momo_user_group ?? null);
    const userCode =
      raw && typeof raw === "object" && typeof raw.user_code === "string"
        ? raw.user_code
        : (row.momo_user_code ?? null);
    const guessedUserId =
      userGroup && userCode ? `${userGroup}${userCode}` : null;
    candidates.push({
      rowId: row.id as string,
      momoTrackingNo: row.momo_tracking_no ?? null,
      guessedUserId,
    });
  }

  // Distinct userIds to verify in tb_users.
  const userIds = [
    ...new Set(candidates.map((c) => c.guessedUserId).filter((u): u is string => !!u)),
  ];
  let validUserIds = new Set<string>();
  if (userIds.length > 0) {
    const { data: validRows, error: usrErr } = await admin
      .from("tb_users")
      .select("userID")
      .in("userID", userIds);
    if (usrErr) {
      console.error("[autoCommitEligibleMomoRows] tb_users lookup failed", {
        code: usrErr.code,
        message: usrErr.message,
      });
    } else {
      validUserIds = new Set(
        (validRows ?? []).map((r) => (r as { userID: string }).userID),
      );
    }
  }

  // 3. For each row, decide outcome
  for (const c of candidates) {
    if (!c.guessedUserId) {
      result.skipped++;
      result.perRow.push({
        rowId: c.rowId,
        momoTrackingNo: c.momoTrackingNo,
        guessedUserId: null,
        outcome: "skipped_no_userid",
      });
      continue;
    }
    if (!validUserIds.has(c.guessedUserId)) {
      result.skipped++;
      result.perRow.push({
        rowId: c.rowId,
        momoTrackingNo: c.momoTrackingNo,
        guessedUserId: c.guessedUserId,
        outcome: "skipped_unknown_user",
      });
      continue;
    }

    // Eligible — attempt commit. We call `commitMomoRowSystem` (the
    // auth-agnostic core's cron entry point — Wave 30.5), so the EXACT
    // same write path runs whether an admin clicks "สร้างใหม่" manually
    // or cron fires automatically. It does NOT read a session, so unlike
    // the old `commitMomoRowToForwarder` (withAdmin gate, which failed
    // 7/7 here in Wave 30 #2) it works in the session-less cron context.
    // Created rows are stamped adminid="momo-cron" + committed_by=null so
    // they're identifiable as system-committed in tb_forwarder.
    result.attempted++;
    try {
      const res = await commitMomoRowSystem({
        rowId: c.rowId,
        userID: c.guessedUserId,
        fShipBy: "PCS",
        fProductsType: "1",
      });
      if (res.ok) {
        result.succeeded++;
        result.perRow.push({
          rowId: c.rowId,
          momoTrackingNo: c.momoTrackingNo,
          guessedUserId: c.guessedUserId,
          outcome: "committed",
          forwarderId: res.data?.forwarderId,
        });
      } else {
        result.failed++;
        result.perRow.push({
          rowId: c.rowId,
          momoTrackingNo: c.momoTrackingNo,
          guessedUserId: c.guessedUserId,
          outcome: "failed",
          error: res.error,
        });
      }
    } catch (err) {
      // Hard throw — typically the withAdmin guard rejecting because
      // the cron has no admin session. Treat as failed so admin can
      // investigate. We don't crash the cron — every row is independent.
      result.failed++;
      result.perRow.push({
        rowId: c.rowId,
        momoTrackingNo: c.momoTrackingNo,
        guessedUserId: c.guessedUserId,
        outcome: "failed",
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  return result;
}
