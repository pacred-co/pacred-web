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
 *   4. raw.user_group MUST match tb_users.userCompany class — PR group
 *      (individual) ↔ userCompany!="1"; AIGA (company) ↔ userCompany="1".
 *      A mismatch means MOMO mis-tagged the row → skip → admin reviews.
 *   5. No live tb_forwarder row already exists with this tracking
 *      (any non-zero fstatus) — prevents duplicates from a parallel
 *      manual /review commit landing the same tracking.
 *   6. Customer hasn't hit the per-day auto-commit cap (default 30 rows)
 *      — a spike for one customer is usually MOMO mis-tagging a batch.
 *   7. Raw metrics are within plausibility caps (weight ≤ 10,000kg ·
 *      cbm ≤ 200) — anything beyond signals unit confusion in partner data.
 *   8. Sane defaults applied:
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
 * Safety-net layering (see docs/runbook/momo-autocommit-activation.md):
 *   - Predicates 4-7 live as PURE functions in `auto-commit-momo-safety.ts`
 *     (unit-tested · stable reason codes for audit + LINE alerts).
 *   - When per-run rejection-rate exceeds 50% (and sample ≥ 10), the cron
 *     pings the staff LINE group + logs WARN — signal that MOMO data
 *     quality dropped, admin should sample /review before next cron tick.
 *
 * @see actions/admin/momo-commit.ts        — the canonical commit action
 * @see lib/admin/auto-commit-momo-safety.ts — pure safety predicates
 * @see lib/admin/commit-momo-row-core.ts   — auth-agnostic commit body
 * @see docs/research/legacy-accounting-reality-2026-05-30.md §4
 * @see docs/runbook/momo-autocommit-activation.md
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
import { extractMetricsFromMomoRaw } from "@/lib/admin/momo-raw-helpers";
import {
  checkUserGroupMatchesCompany,
  checkNotDuplicateTracking,
  checkUnderDailyPerUserCap,
  checkPlausibleMetrics,
  shouldAlertOnRejectionRate,
  todayIsoDateUtc,
  type SafetyReason,
  type SafetyDecision,
} from "@/lib/admin/auto-commit-momo-safety";
import { notifyStaffGroup } from "@/lib/notifications/staff-group";
import { logger } from "@/lib/logger";

const SCOPE = "auto-commit-momo";

export type AutoCommitOutcome =
  | "committed"
  | "skipped_no_userid"
  | "skipped_unknown_user"
  | "skipped_user_company_mismatch"
  | "skipped_duplicate_tracking"
  | "skipped_daily_per_user_cap"
  | "skipped_implausible_weight"
  | "skipped_implausible_volume"
  | "failed";

export type AutoCommitMomoResult = {
  /** Total uncommitted rows scanned. */
  scanned: number;
  /** Eligible rows attempted (passed ALL safety predicates). */
  attempted: number;
  /** Successfully committed → tb_forwarder rows. */
  succeeded: number;
  /** Failed despite being eligible (DB error / unique-constraint / etc.). */
  failed: number;
  /** Skipped by ANY safety predicate (admin needs to review). */
  skipped: number;
  /** Rejection-rate (skipped+failed)/scanned for this run, 0..1. */
  rejectionRate: number;
  /** True when shouldAlertOnRejectionRate fired (LINE staff ping sent). */
  alerted: boolean;
  /** Per-row outcomes — for the cron's summary log. */
  perRow: Array<{
    rowId: string;
    momoTrackingNo: string | null;
    guessedUserId: string | null;
    outcome: AutoCommitOutcome;
    reason?: SafetyReason;
    forwarderId?: number;
    error?: string;
  }>;
};

/** Map a SafetyDecision (failure) → the AutoCommitOutcome it triggers. */
function outcomeForReason(reason: SafetyReason): AutoCommitOutcome {
  switch (reason) {
    case "no_guessed_userid":          return "skipped_no_userid";
    case "unknown_user":               return "skipped_unknown_user";
    case "user_company_mismatch":      return "skipped_user_company_mismatch";
    case "duplicate_tracking":         return "skipped_duplicate_tracking";
    case "duplicate_already_committed": return "skipped_duplicate_tracking";
    case "daily_per_user_cap":         return "skipped_daily_per_user_cap";
    case "implausible_weight":         return "skipped_implausible_weight";
    case "implausible_volume":         return "skipped_implausible_volume";
  }
}

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
    scanned:       0,
    attempted:     0,
    succeeded:     0,
    failed:        0,
    skipped:       0,
    rejectionRate: 0,
    alerted:       false,
    perRow:        [],
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

  // 2. Collect candidates with raw, user_group, weight/cbm — these feed
  //    the per-row safety predicates below. One pass through the rows.
  type Candidate = {
    rowId:          string;
    momoTrackingNo: string | null;
    guessedUserId:  string | null;
    userGroup:      string | null;
    weightKg:       number;
    cbm:            number;
  };
  const candidates: Candidate[] = [];
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
    const metrics = extractMetricsFromMomoRaw(raw);
    candidates.push({
      rowId:          row.id as string,
      momoTrackingNo: row.momo_tracking_no ?? null,
      guessedUserId,
      userGroup,
      weightKg:       metrics.weight,
      cbm:            metrics.cbm,
    });
  }

  // 3. Batch-fetch tb_users (userID, userCompany) for guessed ids — one
  //    round-trip instead of N. Map for O(1) lookup.
  const userIds = [
    ...new Set(candidates.map((c) => c.guessedUserId).filter((u): u is string => !!u)),
  ];
  const userCompanyByUserId = new Map<string, string | null>();
  if (userIds.length > 0) {
    const { data: validRows, error: usrErr } = await admin
      .from("tb_users")
      .select("userID, userCompany")
      .in("userID", userIds);
    if (usrErr) {
      console.error("[autoCommitEligibleMomoRows] tb_users lookup failed", {
        code: usrErr.code,
        message: usrErr.message,
      });
    } else {
      for (const r of (validRows ?? []) as Array<{ userID: string; userCompany: string | null }>) {
        userCompanyByUserId.set(r.userID, r.userCompany);
      }
    }
  }

  // 4. Batch-fetch existing tb_forwarder rows with these tracking-nos —
  //    duplicate-prevention. Map tracking_no → fstatus.
  const trackingNos = [
    ...new Set(candidates.map((c) => c.momoTrackingNo).filter((t): t is string => !!t)),
  ];
  const existingForwarderByTracking = new Map<string, string | null>();
  if (trackingNos.length > 0) {
    const { data: fwdRows, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("ftrackingchn, fstatus")
      .in("ftrackingchn", trackingNos);
    if (fwdErr) {
      console.error("[autoCommitEligibleMomoRows] tb_forwarder dup-lookup failed", {
        code: fwdErr.code,
        message: fwdErr.message,
      });
    } else {
      for (const r of (fwdRows ?? []) as Array<{ ftrackingchn: string | null; fstatus: string | null }>) {
        if (r.ftrackingchn) {
          // If multiple rows exist, keep the highest non-zero fstatus
          // (the "most-live" row) for the duplicate decision.
          const prev = existingForwarderByTracking.get(r.ftrackingchn);
          const next = r.fstatus ?? null;
          if (prev == null || prev === "0" || prev === "") {
            existingForwarderByTracking.set(r.ftrackingchn, next);
          }
        }
      }
    }
  }

  // 5. Batch-fetch today's auto-commit count per candidate user — daily
  //    per-user cap. Cron-created rows are stamped adminid="momo-cron"
  //    (see commit-momo-row-core.ts → commitMomoRowSystem).
  const todayDate = todayIsoDateUtc();
  const todayCommitsByUserId = new Map<string, number>();
  if (userIds.length > 0) {
    // `gte("fdate", todayDate)` covers anything stamped today UTC. fdate
    // is written as a timestamptz (nowIso) so this is a half-open range
    // [todayDate, ∞) — fine for a daily cap because tomorrow's cron uses
    // tomorrow's todayDate.
    const { data: todayRows, error: todayErr } = await admin
      .from("tb_forwarder")
      .select("userid")
      .eq("adminid", "momo-cron")
      .gte("fdate", todayDate)
      .in("userid", userIds);
    if (todayErr) {
      console.error("[autoCommitEligibleMomoRows] daily-cap lookup failed", {
        code: todayErr.code,
        message: todayErr.message,
      });
    } else {
      for (const r of (todayRows ?? []) as Array<{ userid: string | null }>) {
        if (r.userid) {
          todayCommitsByUserId.set(r.userid, (todayCommitsByUserId.get(r.userid) ?? 0) + 1);
        }
      }
    }
  }

  /** Run all safety predicates for one candidate; return ok or first failure. */
  function evaluate(c: Candidate): SafetyDecision {
    if (!c.guessedUserId) {
      return { ok: false, reason: "no_guessed_userid" };
    }
    if (!userCompanyByUserId.has(c.guessedUserId)) {
      return { ok: false, reason: "unknown_user" };
    }
    const groupCheck = checkUserGroupMatchesCompany(
      c.userGroup,
      userCompanyByUserId.get(c.guessedUserId) ?? null,
    );
    if (!groupCheck.ok) return groupCheck;
    const dupCheck = checkNotDuplicateTracking(
      c.momoTrackingNo ? existingForwarderByTracking.get(c.momoTrackingNo) ?? null : null,
    );
    if (!dupCheck.ok) return dupCheck;
    const capCheck = checkUnderDailyPerUserCap(
      todayCommitsByUserId.get(c.guessedUserId) ?? 0,
    );
    if (!capCheck.ok) return capCheck;
    const metricsCheck = checkPlausibleMetrics(c.weightKg, c.cbm);
    if (!metricsCheck.ok) return metricsCheck;
    return { ok: true };
  }

  // 6. For each row, decide outcome
  for (const c of candidates) {
    const decision = evaluate(c);
    if (!decision.ok) {
      result.skipped++;
      const outcome = outcomeForReason(decision.reason);
      result.perRow.push({
        rowId:          c.rowId,
        momoTrackingNo: c.momoTrackingNo,
        guessedUserId:  c.guessedUserId,
        outcome,
        reason:         decision.reason,
        error:          decision.detail,
      });
      // Optimistic per-user cap update — if we proceeded to commit one for
      // this user later in the same batch, count it against today's cap.
      // (Skips don't increment.)
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
        rowId:         c.rowId,
        userID:        c.guessedUserId as string,
        fShipBy:       "PCS",
        fProductsType: "1",
      });
      if (res.ok) {
        result.succeeded++;
        result.perRow.push({
          rowId:          c.rowId,
          momoTrackingNo: c.momoTrackingNo,
          guessedUserId:  c.guessedUserId,
          outcome:        "committed",
          forwarderId:    res.data?.forwarderId,
        });
        // Update the per-user counter so further rows in THIS batch
        // hit the cap correctly (otherwise a batch could over-commit
        // one user above the cap before the next cron tick).
        if (c.guessedUserId) {
          todayCommitsByUserId.set(
            c.guessedUserId,
            (todayCommitsByUserId.get(c.guessedUserId) ?? 0) + 1,
          );
        }
      } else {
        result.failed++;
        result.perRow.push({
          rowId:          c.rowId,
          momoTrackingNo: c.momoTrackingNo,
          guessedUserId:  c.guessedUserId,
          outcome:        "failed",
          error:          res.error,
        });
      }
    } catch (err) {
      // Hard throw — typically the withAdmin guard rejecting because
      // the cron has no admin session. Treat as failed so admin can
      // investigate. We don't crash the cron — every row is independent.
      result.failed++;
      result.perRow.push({
        rowId:          c.rowId,
        momoTrackingNo: c.momoTrackingNo,
        guessedUserId:  c.guessedUserId,
        outcome:        "failed",
        error:          err instanceof Error ? err.message : "unknown",
      });
    }
  }

  // 7. Compute rejection-rate + maybe alert.
  const rejected      = result.skipped + result.failed;
  result.rejectionRate = result.scanned > 0 ? Math.min(1, rejected / result.scanned) : 0;
  if (shouldAlertOnRejectionRate(result.scanned, result.skipped, result.failed)) {
    logger.warn(SCOPE, "high rejection rate — MOMO data quality may have dropped", {
      scanned:       result.scanned,
      skipped:       result.skipped,
      failed:        result.failed,
      rejectionRate: result.rejectionRate,
    });
    // Best-effort LINE ping to staff — never throws, no-op when group/token
    // is unconfigured. The cron summary (admin/system/crons) is the
    // durable record; the LINE ping is the "look at /review NOW" nudge.
    const pct = Math.round(result.rejectionRate * 100);
    void notifyStaffGroup(
      `⚠️ MOMO auto-commit rejection rate สูงผิดปกติ\n` +
      `รอบนี้ ${rejected}/${result.scanned} rows ถูกข้าม (${pct}%)\n` +
      `ตรวจสอบ /admin/api-forwarder-momo/review เพื่อหาสาเหตุ`,
      {
        url:      "/admin/api-forwarder-momo/review",
        urlLabel: "ดู review queue",
        title:    "MOMO auto-commit — health alert",
      },
    );
    result.alerted = true;
  }

  return result;
}
