import { createAdminClient } from "@/lib/supabase/admin";
import { instrumentCron } from "@/lib/cron/instrument";
import { captureIncident } from "@/lib/observability/incident-store";
import {
  computeCreditDrift,
  compareDriftWorstFirst,
  type CreditOrderRow,
  type CreditOffender,
} from "@/lib/credit/reconcile-drift";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/credit-reconcile
 *
 * READ-ONLY credit-AR integrity scan. Port of the legacy
 * `reset-credit-forwarder.php` (mode=view only). It flags customers whose
 * stored `tb_credit.creditvalue` has DRIFTED from the live
 * Σ(per-order outstanding over fCredit='1') and ALERTS (incident + structured
 * console). It NEVER mutates money — no write to `tb_credit` anywhere in this
 * file (legacy's mode=update auto-write is owner-gated, deliberately omitted).
 *
 * ── The drift it detects ────────────────────────────────────────────────
 *
 *   expected = Σ calcForwarderOutstanding(order) over the user's fCredit='1' rows
 *   actual   = tb_credit.creditvalue (missing row ⇒ 0)
 *   delta    = expected − actual
 *
 * A real AR-drift means the running credit balance the customer is shown +
 * billed against no longer matches the orders still on credit. It arises when
 * a settle path debits/clears one side but not the other (the W4 paydown fix
 * 6d627d06 closed the customer-wallet path; this cron catches any residual or
 * future drift from other settle routes / direct admin edits).
 *
 * ── The 1% definitional difference vs legacy ────────────────────────────
 * Legacy's raw SUM does NOT apply the juristic 1% allowance; Pacred's canonical
 * `calcForwarderOutstanding` DOES (so this check matches the forwarders list,
 * the customer credit panel, and the wallet→credit paydown). For a juristic
 * customer `expected` here sits ~1% below what legacy's reset job would write.
 * Intentional — documented in lib/credit/reconcile-drift.ts.
 *
 * ── Alerting ───────────────────────────────────────────────────────────
 * One structured `console.error` summary (count + top offenders) + ONE
 * `captureIncident` row (deduped by a STABLE fingerprint so daily re-runs
 * collapse into a single incident whose occurrence_count climbs, instead of
 * spamming one row per customer or per day). On a clean run nothing is logged
 * as an error and no incident is written. Mirrors wallet-reconcile exactly.
 *
 * ── Batching ───────────────────────────────────────────────────────────
 * We page through every fCredit='1' forwarder row (PostgREST 1000-row pages),
 * group them per userid, then batch-load tb_credit.creditvalue for exactly the
 * affected userids. A user with NO fCredit='1' rows but a stale positive
 * creditvalue is the most common real drift, so we ALSO scan tb_credit rows
 * with creditvalue>0 whose userid had zero open credit orders (expected=0).
 *
 * Schedule: daily 18:10 UTC (= 01:10 ICT) — 10 min after wallet-reconcile,
 * off-peak. Wired into vercel.json + lib/cron/registry.ts.
 *
 * Per AGENTS.md §0c — every Supabase query destructures `error`.
 */

// The fields calcForwarderOutstanding needs from each fCredit='1' row.
const FORWARDER_COST_COLS =
  "userid, ftotalprice, ftransportprice, fpriceupdate, fshippingservice, pricecrate, ftransportpricechnthb, priceother, fdiscount, fusercompany";

// PostgREST default row ceiling is 1000 — page through explicitly.
const PAGE_SIZE = 1000;

// Bound the scan so a runaway query can't OOM the function. fCredit='1' is a
// small slice (24 real credit customers on prod 2026-06), so this is generous.
const MAX_CREDIT_ORDERS = 100_000;

// How many top offenders to surface in the console + incident body.
const TOP_N = 15;

type ForwarderCreditRow = CreditOrderRow & { userid: string };
type TbCreditRow = { userid: string; creditvalue: number | string | null };

export async function GET(request: Request) {
  return instrumentCron({
    cronPath: "/api/cron/credit-reconcile",
    request,
    handler: async () => {
      const admin = createAdminClient();

      // ── 1) Page through all fCredit='1' forwarder rows (read-only) ─────
      const ordersByUser = new Map<string, ForwarderCreditRow[]>();
      let capped = false;
      let scannedOrders = 0;
      for (let from = 0; from < MAX_CREDIT_ORDERS; from += PAGE_SIZE) {
        const to = Math.min(from + PAGE_SIZE, MAX_CREDIT_ORDERS) - 1;
        const { data, error } = await admin
          .from("tb_forwarder")
          .select(FORWARDER_COST_COLS)
          .eq("fcredit", "1")
          .order("userid", { ascending: true })
          .range(from, to);
        if (error) {
          logger.error("cron.credit-reconcile", "tb_forwarder credit page read failed", error, { from, to });
          return {
            status:     "failure" as const,
            error:      error.message,
            payload:    { ok: false, error: error.message, stage: "fetch_credit_orders", from },
            httpStatus: 500,
          };
        }
        const page = (data ?? []) as unknown as ForwarderCreditRow[];
        for (const row of page) {
          if (!row.userid) continue;
          const list = ordersByUser.get(row.userid) ?? [];
          list.push(row);
          ordersByUser.set(row.userid, list);
        }
        scannedOrders += page.length;
        if (page.length < to - from + 1) break; // last page reached
        if (from + PAGE_SIZE >= MAX_CREDIT_ORDERS) capped = true;
      }

      if (capped) {
        logger.warn("cron.credit-reconcile", "credit-order scan hit per-run cap — base may be larger", {
          cap:     MAX_CREDIT_ORDERS,
          scanned: scannedOrders,
        });
      }

      // ── 2) Page through tb_credit rows with creditvalue>0 — to catch the
      //       STALE case: a user who has a stored balance but ZERO open
      //       fCredit='1' orders (expected=0, actual>0 → drift). Build the
      //       full set of userids to evaluate = (has orders) ∪ (has stored). ─
      const storedByUser = new Map<string, number | string | null>();
      for (let from = 0; from < MAX_CREDIT_ORDERS; from += PAGE_SIZE) {
        const to = Math.min(from + PAGE_SIZE, MAX_CREDIT_ORDERS) - 1;
        const { data, error } = await admin
          .from("tb_credit")
          .select("userid, creditvalue")
          .gt("creditvalue", 0)
          .order("userid", { ascending: true })
          .range(from, to);
        if (error) {
          logger.error("cron.credit-reconcile", "tb_credit page read failed", error, { from, to });
          return {
            status:     "failure" as const,
            error:      error.message,
            payload:    { ok: false, error: error.message, stage: "fetch_stored_credit", from },
            httpStatus: 500,
          };
        }
        const page = (data ?? []) as unknown as TbCreditRow[];
        for (const row of page) {
          if (!row.userid) continue;
          storedByUser.set(row.userid, row.creditvalue);
        }
        if (page.length < to - from + 1) break;
      }

      // ── 3) For users WITH open orders but no stored>0 row, we still need
      //       their stored value (could be 0, or a stale exact-match row that
      //       the creditvalue>0 page already grabbed). Fetch the remainder. ─
      const missingStored = [...ordersByUser.keys()].filter((u) => !storedByUser.has(u));
      for (let i = 0; i < missingStored.length; i += PAGE_SIZE) {
        const slice = missingStored.slice(i, i + PAGE_SIZE);
        const { data, error } = await admin
          .from("tb_credit")
          .select("userid, creditvalue")
          .in("userid", slice);
        if (error) {
          logger.error("cron.credit-reconcile", "tb_credit batch read failed", error, { batch: i });
          return {
            status:     "failure" as const,
            error:      error.message,
            payload:    { ok: false, error: error.message, stage: "fetch_stored_batch", batch: i },
            httpStatus: 500,
          };
        }
        for (const row of (data ?? []) as unknown as TbCreditRow[]) {
          if (!row.userid) continue;
          storedByUser.set(row.userid, row.creditvalue);
        }
        // userids still absent ⇒ no tb_credit row ⇒ stored = 0 (handled below).
      }

      // ── 4) Evaluate drift over the union of userids ────────────────────
      const userIds = new Set<string>([...ordersByUser.keys(), ...storedByUser.keys()]);
      const checked = userIds.size;
      console.log("[cron.credit-reconcile] scanning", { checked, scannedOrders, capped });

      if (checked === 0) {
        return {
          status:  "success" as const,
          summary: { checked: 0, drifted: 0, capped },
          payload: { ok: true, checked: 0, drifted: 0, capped },
        };
      }

      const offenders: CreditOffender[] = [];
      for (const userid of userIds) {
        const orders = ordersByUser.get(userid) ?? [];
        const stored = storedByUser.has(userid) ? storedByUser.get(userid)! : 0;
        const d = computeCreditDrift(orders, stored);
        if (d.drifted) {
          offenders.push({
            userid,
            expected:   d.expected,
            actual:     d.actual,
            delta:      d.delta,
            orderCount: d.orderCount,
          });
        }
      }

      const drifted = offenders.length;

      // Worst first — largest absolute AR mismatch surfaces top.
      offenders.sort(compareDriftWorstFirst);
      const top = offenders.slice(0, TOP_N);

      // ── 5) Alert (only when something drifted) ─────────────────────────
      if (drifted === 0) {
        logger.info("cron.credit-reconcile", "clean run — no credit-AR drift", { checked, capped });
        return {
          status:  capped ? ("partial" as const) : ("success" as const),
          summary: { checked, drifted: 0, capped },
          payload: { ok: true, checked, drifted: 0, capped },
        };
      }

      // Structured console alert (read by cron logs / Sentry breadcrumbs).
      console.error("[cron.credit-reconcile] CREDIT-AR DRIFT DETECTED", {
        checked,
        drifted,
        capped,
        top: top.map((o) => ({
          userid:     o.userid,
          expected:   o.expected,
          actual:     o.actual,
          delta:      o.delta,
          orderCount: o.orderCount,
        })),
      });

      // ONE deduped incident summarising the scan (NOT one per customer). The
      // message is intentionally STABLE wording (no userids / counts inline) so
      // computeFingerprint collapses every daily run into a single live incident
      // whose occurrence_count climbs — the per-customer detail lives in
      // surface_meta + the console log. captureIncident never throws.
      const incidentLines = top.map(
        (o) =>
          `${o.userid}: expected=฿${o.expected.toFixed(2)} actual=฿${o.actual.toFixed(2)} delta=฿${o.delta.toFixed(2)} (${o.orderCount} orders)`,
      );
      const incident = await captureIncident({
        source:   "server",
        kind:     "server_error",
        severity: "high",
        route:    "/api/cron/credit-reconcile",
        message:
          "Credit reconciliation: stored tb_credit.creditvalue has drifted from the live Σ(per-order outstanding over fCredit='1') for one or more customers. READ-ONLY scan (port of reset-credit-forwarder.php mode=view) — investigate by hand; do not auto-fix.\n\n" +
          `Top offenders this run:\n${incidentLines.join("\n")}`,
        surfaceMeta: {
          checked,
          drifted,
          capped,
          // Cap the embedded detail so the row stays small.
          top: top.map((o) => ({
            userid:     o.userid,
            expected:   o.expected,
            actual:     o.actual,
            delta:      o.delta,
            orderCount: o.orderCount,
          })),
        },
      });

      logger.warn("cron.credit-reconcile", "credit-AR drift flagged", {
        checked,
        drifted,
        capped,
        incident_id:      incident.id ?? null,
        incident_created: incident.created ?? false,
      });

      return {
        status:  capped ? ("partial" as const) : ("success" as const),
        summary: {
          checked,
          drifted,
          capped,
          incident_created: incident.created ?? false,
        },
        payload: {
          ok:          true,
          checked,
          drifted,
          capped,
          incident_id: incident.id ?? null,
          top:         top.map((o) => ({
            userid:     o.userid,
            expected:   o.expected,
            actual:     o.actual,
            delta:      o.delta,
            orderCount: o.orderCount,
          })),
        },
      };
    },
  });
}
