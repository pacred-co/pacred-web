import { createAdminClient } from "@/lib/supabase/admin";
import { instrumentCron } from "@/lib/cron/instrument";
import { captureIncident } from "@/lib/observability/incident-store";
import {
  detectWalletAnomaly,
  compareOffendersWorstFirst,
  type Offender,
} from "@/lib/wallet/reconcile-anomaly";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/wallet-reconcile
 *
 * READ-ONLY wallet integrity scan. Detects wallets whose stored
 * `tb_wallet.wallettotal` is in an impossible / internally-inconsistent
 * state, and ALERTS (incident + structured console). It NEVER mutates
 * money — no write to `tb_wallet` or `tb_wallet_hs` anywhere in this file.
 *
 * ── Why this shape, and what it deliberately does NOT do ────────────────
 *
 * The owner model (ADR-0018 D-1/D-2 + actions/wallet-tb.ts + payment-tb.ts)
 * is that `tb_wallet.wallettotal` is the CANONICAL running balance, mutated
 * in place by each money action. There is NO code in the app that derives
 * an "expected balance = Σ credits − Σ debits" from the full `tb_wallet_hs`
 * ledger, and one cannot be invented safely because the ledger's timing is
 * asymmetric:
 *   - deposits / shop-pay / yuan-pay move money at status='2' (settled), but
 *   - a WITHDRAW debits wallettotal immediately at status='1' (the hold;
 *     actions/wallet-tb.ts L104-111). The later approve (1→2) moves NO money.
 * So `wallettotal ≠ Σ(only status='2' rows)`. A naive full-ledger re-sum
 * would false-alarm on every customer with a pending withdraw, and getting
 * the per-type signs/timing wrong across 8,898 customers is exactly the
 * trap this cron must not fall into. We therefore reconcile ONLY against
 * the one balance-derivation the app already owns + trusts — the spendable
 * reducer `sumAvailableBalance` (lib/wallet/balance.ts) — and flag only
 * UNAMBIGUOUS invariant violations that need no sign-rule inference:
 *
 *   1. stored < 0        — `wallettotal` is negative. A wallet balance can
 *                          never legitimately be below zero (canDebit gates
 *                          every customer debit on `walletTotal >= payTHB`).
 *                          This is a real money bug regardless of ledger.
 *   2. spendable < 0     — the pending-debit overhang exceeds the settled
 *                          balance: `wallettotal − Σ open-pending-debits < 0`.
 *                          This is the precise overdraw condition the app's
 *                          own migration-0064 guard exists to prevent, and
 *                          the value is computed by the REUSED authoritative
 *                          `sumAvailableBalance` (zero invented rules — its
 *                          DEBIT_TYPES {2,3,4,6,7} / CREDIT {1,5} map is the
 *                          single source of truth for legacy ledger signs).
 *
 * Either condition means staff must investigate by hand — never an auto-fix.
 *
 * ── Alerting ───────────────────────────────────────────────────────────
 * One structured `console.error` summary (count + top offenders) + ONE
 * `captureIncident` row (deduped by a STABLE fingerprint so daily re-runs
 * collapse into a single incident whose occurrence_count climbs, instead of
 * spamming one row per wallet or per day). On a clean run nothing is logged
 * as an error and no incident is written.
 *
 * ── Batching ───────────────────────────────────────────────────────────
 * tb_wallet has ~9k rows. We page through up to MAX_WALLETS_PER_RUN per
 * invocation; if the table is larger than that we LOG the cap explicitly
 * (status='partial', `capped:true`) — never a silent truncation.
 *
 * Schedule: daily 18:00 UTC (= 01:00 ICT) — off-peak. Wired into
 * vercel.json + lib/cron/registry.ts.
 *
 * Per AGENTS.md §0c — every Supabase query destructures `error`.
 */

// The anomaly predicate (stored<0 / spendable<0) + its 1-satang EPSILON
// + the worst-first comparator live in lib/wallet/reconcile-anomaly.ts so
// they are unit-tested; this handler only does the I/O around them.

// Per-run wallet cap. ~9k rows fit comfortably; the cap bounds memory + the
// PostgREST page size and is reported (never silent) when the base exceeds it.
const MAX_WALLETS_PER_RUN = 20_000;

// PostgREST default row ceiling is 1000 — page through tb_wallet explicitly.
const PAGE_SIZE = 1000;

// How many top offenders to surface in the console + incident body.
const TOP_N = 15;

type WalletRow = { userid: string; wallettotal: number | string | null };
type HsRow = { userid: string; amount: number | string; status: string | null; type: string | null };

export async function GET(request: Request) {
  return instrumentCron({
    cronPath: "/api/cron/wallet-reconcile",
    request,
    handler: async () => {
      const admin = createAdminClient();

      // ── 1) Page through tb_wallet (read-only) ──────────────────────────
      const wallets: WalletRow[] = [];
      let capped = false;
      for (let from = 0; from < MAX_WALLETS_PER_RUN; from += PAGE_SIZE) {
        const to = Math.min(from + PAGE_SIZE, MAX_WALLETS_PER_RUN) - 1;
        const { data, error } = await admin
          .from("tb_wallet")
          .select("userid, wallettotal")
          .order("userid", { ascending: true })
          .range(from, to);
        if (error) {
          logger.error("cron.wallet-reconcile", "tb_wallet page read failed", error, { from, to });
          return {
            status:     "failure" as const,
            error:      error.message,
            payload:    { ok: false, error: error.message, stage: "fetch_wallets", from },
            httpStatus: 500,
          };
        }
        const page = (data ?? []) as unknown as WalletRow[];
        wallets.push(...page);
        if (page.length < to - from + 1) break; // last page reached
        if (from + PAGE_SIZE >= MAX_WALLETS_PER_RUN) {
          // We hit the cap with a full final page → there may be more rows.
          capped = true;
        }
      }

      // Confirm whether the cap actually truncated the base (only if we
      // stopped exactly at the ceiling on a full page).
      if (capped) {
        logger.warn("cron.wallet-reconcile", "wallet scan hit per-run cap — base may be larger", {
          cap:     MAX_WALLETS_PER_RUN,
          scanned: wallets.length,
        });
      }

      const checked = wallets.length;
      console.log("[cron.wallet-reconcile] scanning", { checked, capped });

      if (checked === 0) {
        return {
          status:  "success" as const,
          summary: { checked: 0, drifted: 0, capped },
          payload: { ok: true, checked: 0, drifted: 0, capped },
        };
      }

      // ── 2) Batch-load OPEN pending rows (status='1') for the scanned
      //       userids, grouped per user. We over-fetch by status only and
      //       let the REUSED sumAvailableBalance reducer own the debit-type
      //       logic (its DEBIT_TYPES map is the single source of truth). ──
      const userIds = wallets.map((w) => w.userid).filter(Boolean);
      const pendingByUser = new Map<string, HsRow[]>();

      for (let i = 0; i < userIds.length; i += PAGE_SIZE) {
        const slice = userIds.slice(i, i + PAGE_SIZE);
        const { data, error } = await admin
          .from("tb_wallet_hs")
          .select("userid, amount, status, type")
          .in("userid", slice)
          .eq("status", "1");
        if (error) {
          logger.error("cron.wallet-reconcile", "tb_wallet_hs pending read failed", error, { batch: i });
          return {
            status:     "failure" as const,
            error:      error.message,
            payload:    { ok: false, error: error.message, stage: "fetch_pending", batch: i },
            httpStatus: 500,
          };
        }
        for (const row of (data ?? []) as unknown as HsRow[]) {
          const list = pendingByUser.get(row.userid) ?? [];
          list.push(row);
          pendingByUser.set(row.userid, list);
        }
      }

      // ── 3) Detect anomalies — UNAMBIGUOUS invariants only ──────────────
      // The predicate (rounding · EPSILON · the two invariants · the reused
      // sumAvailableBalance derivation) lives in detectWalletAnomaly, which
      // is unit-tested in lib/wallet/reconcile-anomaly.test.ts.
      const offenders: Offender[] = [];
      for (const w of wallets) {
        const pending = pendingByUser.get(w.userid) ?? [];
        const { stored, spendable, reasons } = detectWalletAnomaly(w.wallettotal, pending);
        if (reasons.length > 0) {
          offenders.push({ userid: w.userid, stored, spendable, reasons });
        }
      }

      const drifted = offenders.length;

      // Worst first — most negative stored balance, then most negative spendable.
      offenders.sort(compareOffendersWorstFirst);
      const top = offenders.slice(0, TOP_N);

      // ── 4) Alert (only when something is wrong) ────────────────────────
      if (drifted === 0) {
        logger.info("cron.wallet-reconcile", "clean run — no wallet anomalies", { checked, capped });
        return {
          status:  capped ? ("partial" as const) : ("success" as const),
          summary: { checked, drifted: 0, capped },
          payload: { ok: true, checked, drifted: 0, capped },
        };
      }

      const storedNeg  = offenders.filter((o) => o.reasons.includes("stored_negative")).length;
      const overdraft  = offenders.filter((o) => o.reasons.includes("pending_overdraft")).length;

      // Structured console alert (read by cron logs / Sentry breadcrumbs).
      console.error("[cron.wallet-reconcile] WALLET ANOMALIES DETECTED", {
        checked,
        drifted,
        stored_negative:   storedNeg,
        pending_overdraft: overdraft,
        capped,
        top: top.map((o) => ({
          userid:    o.userid,
          stored:    o.stored,
          spendable: o.spendable,
          reasons:   o.reasons,
        })),
      });

      // ONE deduped incident summarising the scan (NOT one per wallet). The
      // message is intentionally STABLE wording (no userids / counts / per-run
      // offender lines inline) so computeFingerprint collapses every daily run
      // into a single live incident whose occurrence_count climbs — embedding
      // the varying offender set / line count in `message` re-split it into a
      // fresh incident every run. The per-wallet detail lives in surface_meta
      // (`top`) + the structured console.error above. captureIncident never throws.
      const incident = await captureIncident({
        source:   "server",
        kind:     "server_error",
        severity: "high",
        route:    "/api/cron/wallet-reconcile",
        message:
          "Wallet reconciliation: stored tb_wallet.wallettotal is in an impossible/inconsistent state for one or more customers (negative balance and/or pending-debit overdraft). READ-ONLY scan — investigate by hand; do not auto-fix.",
        surfaceMeta: {
          checked,
          drifted,
          stored_negative:   storedNeg,
          pending_overdraft: overdraft,
          capped,
          // Cap the embedded detail so the row stays small.
          top: top.map((o) => ({ userid: o.userid, stored: o.stored, spendable: o.spendable, reasons: o.reasons })),
        },
      });

      logger.warn("cron.wallet-reconcile", "wallet anomalies flagged", {
        checked,
        drifted,
        stored_negative:   storedNeg,
        pending_overdraft: overdraft,
        capped,
        incident_id:       incident.id ?? null,
        incident_created:  incident.created ?? false,
      });

      return {
        status:  capped ? ("partial" as const) : ("success" as const),
        summary: {
          checked,
          drifted,
          stored_negative:   storedNeg,
          pending_overdraft: overdraft,
          capped,
          incident_created:  incident.created ?? false,
        },
        payload: {
          ok:                true,
          checked,
          drifted,
          stored_negative:   storedNeg,
          pending_overdraft: overdraft,
          capped,
          incident_id:       incident.id ?? null,
          top:               top.map((o) => ({ userid: o.userid, stored: o.stored, spendable: o.spendable, reasons: o.reasons })),
        },
      };
    },
  });
}
