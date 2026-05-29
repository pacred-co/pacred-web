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
 * ⚠️ KNOWN LIMITATION (Wave 30 #2 ship — to be fixed in Wave 30.5):
 *
 *   `commitMomoRowToForwarder` is wrapped with `withAdmin(["super",
 *   "ops", "warehouse"])` which requires an admin session cookie. When
 *   called from cron context (NO session, just service-role), withAdmin
 *   throws `requireAdmin: no admin role`. We catch the throw and mark
 *   the row as "failed" — net effect: cron pulls MOMO data but DOES NOT
 *   commit rows automatically. Admin still clicks /review to commit.
 *
 *   Fix path (Wave 30.5): extract the commit body from momo-commit.ts
 *   into `lib/admin/commit-momo-row-core.ts` taking `(admin, adminId,
 *   parsedInput)` as params; admin-gated `commitMomoRowToForwarder`
 *   wraps it with withAdmin, and a NEW `commitMomoRowSystem` calls it
 *   with adminId='momo-cron' for the cron path.
 *
 *   Why not done in this commit: extracting 380 LOC of commit logic
 *   needs careful 3-way coordination with the existing review-grid
 *   path; we ship the pull-only cron NOW (immediate value: ภูม sees
 *   fresh MOMO data every 10 min · no more clicking /sync manually)
 *   and follow up the auto-commit in a focused next-session pass.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { commitMomoRowToForwarder } from "@/actions/admin/momo-commit";

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

    // Eligible — attempt commit. We CALL the canonical action so the
    // exact same write path runs whether admin clicks manually or cron
    // fires automatically. If commitMomoRowToForwarder requires admin
    // auth (it does — withAdmin gate), the cron context will fail
    // because there is no admin session. We handle that fallthrough
    // below: if the action throws auth error, we mark as skipped, NOT
    // failed — the row stays at /review and admin commits manually.
    result.attempted++;
    try {
      const res = await commitMomoRowToForwarder({
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
