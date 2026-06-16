"use server";

/**
 * Wave C BI · Theme 1 — Forwarder SLA / cycle-time intelligence (NEW report,
 * not a legacy port). The big audit (`docs/research/big-audit-2026-06-01/
 * 02-cargo-forwarder.md` §5 U-2) flagged this as the highest value-per-effort
 * data play: every `tb_forwarder` order already carries its full stage-arrival
 * timestamp trail (`fdate` → `fdatestatus2..7`), and almost nothing reads it in
 * aggregate. This computes true dwell time per lifecycle stage + a stuck-order
 * board (orders sitting at one stage past a threshold — the audit found 457
 * rows currently at fstatus=5 "รอชำระเงิน" = cash waiting).
 *
 * ── DATA SOURCE — tb_forwarder (LIVE legacy table · 47k rows · lowercase cols)
 * Confirmed columns (docs/research/big-audit-2026-06-01/02-cargo-forwarder.md
 * §1 + actions/admin/reports.ts getForwarderProfitReport):
 *   - fstatus       varchar  1..7,99  current lifecycle state
 *   - fdate         timestamp         creation (= entry into stage 1)
 *   - fdatestatus2  timestamp         entered stage 2 (ถึงโกดังจีนแล้ว)
 *   - fdatestatus3  timestamp         entered stage 3 (กำลังส่งมาไทย)
 *   - fdatestatus4  timestamp         entered stage 4 (ถึงไทยแล้ว)
 *   - fdatestatus5  timestamp         entered stage 5 (รอชำระเงิน)
 *   - fdatestatus6  timestamp         entered stage 6 (เตรียมส่ง)
 *   - fdatestatus7  timestamp         entered stage 7 (ส่งแล้ว)
 *   - userid        varchar(10)       joins tb_users.userID (camelCase post-0113)
 *
 * fstatus → stage label is the CANONICAL legacy map (lib/admin/forwarder-status.ts
 * FSTATUS_CFG · function.php statusForwarderBadge L879-892):
 *   1=รอเข้าโกดังจีน · 2=ถึงโกดังจีนแล้ว · 3=กำลังส่งมาไทย · 4=ถึงไทยแล้ว ·
 *   5=รอชำระเงิน · 6=เตรียมส่ง · 7=ส่งแล้ว.
 *
 * ── DWELL DEFINITION
 * The time an order SAT at stage N = (entered stage N+1) − (entered stage N).
 * The entry-time for stage N is:  N=1 → fdate ; N=2..7 → fdatestatusN.
 * So the six measurable dwells are:
 *   S1 (รอเข้าโกดังจีน)  = fdatestatus2 − fdate
 *   S2 (ถึงโกดังจีนแล้ว)  = fdatestatus3 − fdatestatus2
 *   S3 (กำลังส่งมาไทย)    = fdatestatus4 − fdatestatus3
 *   S4 (ถึงไทยแล้ว)        = fdatestatus5 − fdatestatus4
 *   S5 (รอชำระเงิน)        = fdatestatus6 − fdatestatus5
 *   S6 (เตรียมส่ง)         = fdatestatus7 − fdatestatus6
 * End-to-end cycle = fdatestatus7 − fdate (delivered orders only).
 *
 * Negative / absurd deltas (clock-skew rows · the known 2037/2027 date
 * corruption noted in CLAUDE.md) are discarded so they don't poison averages.
 *
 * ── STUCK ORDERS
 * An order is "stuck" if it is currently parked at a non-terminal stage
 * (fstatus 1..6 — 7 = delivered, 99 = shelved) and the time SINCE it entered
 * that stage exceeds a per-stage threshold (default 7 days). Days-stuck is
 * measured from the stage-entry timestamp to NOW.
 *
 * Read-only · createAdminClient (RLS-bypass) · capped pull + JS aggregate,
 * matching actions/admin/reports.ts (LIMIT 20k · PostgREST can't percentile).
 *
 * NB on "use server": this file is a server-action module → it may only export
 * async functions. All types are declared but NOT exported from here; the page
 * re-declares the row shapes it consumes. Constants that the page needs
 * (stage labels) live in the page itself to keep this file export-clean.
 */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logger } from "@/lib/logger";
import {
  type DateRange,
  dayStartIso,
  dayEndIso,
} from "@/lib/admin/reports/types";

type Ok<T>  = { ok: true; data: T };
type Err    = { ok: false; error: string };
type Result<T> = Ok<T> | Err;

// Same cap as actions/admin/reports.ts — tb_forwarder is ~47k rows; a 30-day
// window is well under 20k. We aggregate in JS (percentiles need it).
const LIMIT = 20_000;

const MS_PER_DAY = 86_400_000;

/**
 * Sanity bounds for a stage dwell, in days. A delta < 0 means the later
 * timestamp precedes the earlier one (clock skew / mis-stamp) → discard.
 * A delta > 730 days (2 years) is almost certainly the 2037/2027 corruption
 * (CLAUDE.md wave-29 note) → discard so it can't blow up an average.
 */
const MAX_PLAUSIBLE_DWELL_DAYS = 730;

/** Per-stage dwell statistics (the dwell table rows). */
type StageDwell = {
  /** Stage number "1".."6" (the FROM stage of the transition). */
  stage: string;
  /** Number of orders that completed this stage transition in-window. */
  count: number;
  /** Mean dwell time in days (2 dp). */
  avgDays: number;
  /** Median (p50) dwell in days (2 dp). */
  p50Days: number;
  /** 90th-percentile dwell in days (2 dp) — the "long tail" pain. */
  p90Days: number;
};

/** A single stuck order (the stuck-orders table rows). */
type StuckOrder = {
  /** Customer-facing order no. (legacy convention: PR + id). */
  fNo: string;
  /** id (stable React key). */
  id: number;
  /** Current fstatus "1".."6". */
  stage: string;
  /** Whole days the order has sat at the current stage. */
  daysStuck: number;
  /** "[member] name" or "—". */
  customer: string;
};

/** The full report payload the page renders. */
type ForwarderSlaReport = {
  /** Per-stage dwell stats, ordered S1..S6. */
  stages: StageDwell[];
  /** Stuck orders, worst-first (most days stuck). Capped to 300 for the UI. */
  stuck: StuckOrder[];
  /** End-to-end avg cycle time (days, 2 dp) over delivered orders in-window. */
  cycleAvgDays: number;
  /** End-to-end p90 cycle time (days, 2 dp). */
  cycleP90Days: number;
  /** Count of delivered orders that fed the end-to-end cycle stat. */
  deliveredCount: number;
  /** Total stuck-order count (before the 300-row UI cap). */
  stuckTotal: number;
  /** The stage "1".."6" with the worst average dwell (or "" if none). */
  slowestStage: string;
  /** That stage's avg dwell in days (0 if none). */
  slowestAvgDays: number;
  /** Threshold (days) used for the stuck list — echoed for the UI caption. */
  stuckThresholdDays: number;
};

// The six measurable stage transitions: { stage, fromKey, toKey }.
// fromKey "fdate" is the stage-1 entry; the rest are fdatestatusN.
const STAGE_TRANSITIONS: ReadonlyArray<{ stage: string; from: string; to: string }> = [
  { stage: "1", from: "fdate",        to: "fdatestatus2" },
  { stage: "2", from: "fdatestatus2", to: "fdatestatus3" },
  { stage: "3", from: "fdatestatus3", to: "fdatestatus4" },
  { stage: "4", from: "fdatestatus4", to: "fdatestatus5" },
  { stage: "5", from: "fdatestatus5", to: "fdatestatus6" },
  { stage: "6", from: "fdatestatus6", to: "fdatestatus7" },
];

// The stage-entry column for a currently-parked order at fstatus N (1..6).
const STAGE_ENTRY_COL: Record<string, string> = {
  "1": "fdate",
  "2": "fdatestatus2",
  "3": "fdatestatus3",
  "4": "fdatestatus4",
  "5": "fdatestatus5",
  "6": "fdatestatus6",
};

type ForwarderRow = {
  id: number;
  userid: string | null;
  fstatus: string | null;
  fdate: string | null;
  fdatestatus2: string | null;
  fdatestatus3: string | null;
  fdatestatus4: string | null;
  fdatestatus5: string | null;
  fdatestatus6: string | null;
  fdatestatus7: string | null;
};

/** Parse an ISO/Postgres timestamp → epoch ms, or null if unusable. */
function ts(v: string | null): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Dwell in days between two stage-entry timestamps, or null if implausible. */
function dwellDays(fromVal: string | null, toVal: string | null): number | null {
  const a = ts(fromVal);
  const b = ts(toVal);
  if (a === null || b === null) return null;
  const days = (b - a) / MS_PER_DAY;
  if (days < 0 || days > MAX_PLAUSIBLE_DWELL_DAYS) return null; // skew / corruption
  return days;
}

/** Percentile (linear interpolation) over an already-sorted ascending array. */
function percentile(sortedAsc: number[], p: number): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  if (n === 1) return sortedAsc[0];
  const rank = (p / 100) * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAsc[lo];
  const frac = rank - lo;
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * frac;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Build the forwarder SLA / cycle-time report.
 *
 * @param range  — date window keyed on `fdate` (creation), default last 30d
 *                 from the page's resolveDateRange.
 * @param stuckThresholdDays — an order parked at its current stage longer than
 *                 this many days is "stuck" (default 7).
 */
export async function getForwarderSlaReport(
  range: DateRange,
  stuckThresholdDays = 7,
): Promise<Result<ForwarderSlaReport>> {
  await requireAdmin(["super", "accounting"]);
  try {
    const admin = createAdminClient();

    // Pull every forwarder whose order was CREATED in-window (keyed on fdate,
    // mirroring getForwarderProfitReport). One capped pull; aggregate in JS.
    const { data, error } = await admin
      .from("tb_forwarder")
      .select(
        `id, userid, fstatus, fdate,
         fdatestatus2, fdatestatus3, fdatestatus4,
         fdatestatus5, fdatestatus6, fdatestatus7`,
      )
      .gte("fdate", dayStartIso(range.from))
      .lte("fdate", dayEndIso(range.to))
      .order("fdate", { ascending: false })
      .limit(LIMIT);

    if (error) {
      logger.error("reports", "forwarder-sla tb_forwarder query failed", error);
      return { ok: false, error: error.message };
    }

    const rows = (data ?? []) as unknown as ForwarderRow[];

    // ── 1) Per-stage dwell accumulation ──────────────────────────────────
    const stageSamples = new Map<string, number[]>();
    for (const t of STAGE_TRANSITIONS) stageSamples.set(t.stage, []);

    // ── 2) End-to-end cycle samples (delivered orders) ──────────────────
    const cycleSamples: number[] = [];

    for (const r of rows) {
      const cols: Record<string, string | null> = {
        fdate: r.fdate,
        fdatestatus2: r.fdatestatus2,
        fdatestatus3: r.fdatestatus3,
        fdatestatus4: r.fdatestatus4,
        fdatestatus5: r.fdatestatus5,
        fdatestatus6: r.fdatestatus6,
        fdatestatus7: r.fdatestatus7,
      };

      for (const t of STAGE_TRANSITIONS) {
        const d = dwellDays(cols[t.from], cols[t.to]);
        if (d !== null) stageSamples.get(t.stage)!.push(d);
      }

      const cycle = dwellDays(r.fdate, r.fdatestatus7);
      if (cycle !== null) cycleSamples.push(cycle);
    }

    const stages: StageDwell[] = STAGE_TRANSITIONS.map((t) => {
      const samples = stageSamples.get(t.stage)!.slice().sort((a, b) => a - b);
      const count = samples.length;
      const avg = count ? samples.reduce((s, v) => s + v, 0) / count : 0;
      return {
        stage: t.stage,
        count,
        avgDays: round2(avg),
        p50Days: round2(percentile(samples, 50)),
        p90Days: round2(percentile(samples, 90)),
      };
    });

    // Slowest stage = highest avg dwell among stages that actually have data.
    let slowestStage = "";
    let slowestAvgDays = 0;
    for (const s of stages) {
      if (s.count > 0 && s.avgDays > slowestAvgDays) {
        slowestAvgDays = s.avgDays;
        slowestStage = s.stage;
      }
    }

    const cycleSorted = cycleSamples.slice().sort((a, b) => a - b);
    const cycleAvgDays = cycleSorted.length
      ? round2(cycleSorted.reduce((s, v) => s + v, 0) / cycleSorted.length)
      : 0;
    const cycleP90Days = round2(percentile(cycleSorted, 90));

    // ── 3) Stuck orders — parked at a non-terminal stage past threshold ──
    const now = Date.now();
    const userids = new Set<string>();
    type StuckRaw = { id: number; userid: string | null; stage: string; daysStuck: number };
    const stuckRaw: StuckRaw[] = [];

    for (const r of rows) {
      const st = String(r.fstatus ?? "");
      const entryCol = STAGE_ENTRY_COL[st]; // only defined for "1".."6"
      if (!entryCol) continue;              // 7 (delivered) / 99 (shelved) / unknown → not stuck

      const cols: Record<string, string | null> = {
        fdate: r.fdate,
        fdatestatus2: r.fdatestatus2,
        fdatestatus3: r.fdatestatus3,
        fdatestatus4: r.fdatestatus4,
        fdatestatus5: r.fdatestatus5,
        fdatestatus6: r.fdatestatus6,
      };
      const enteredAt = ts(cols[entryCol]);
      if (enteredAt === null) continue;

      const days = (now - enteredAt) / MS_PER_DAY;
      if (days < 0 || days > MAX_PLAUSIBLE_DWELL_DAYS) continue; // future / corrupt
      if (days < stuckThresholdDays) continue;

      stuckRaw.push({ id: r.id, userid: r.userid, stage: st, daysStuck: Math.floor(days) });
      if (r.userid) userids.add(r.userid);
    }

    // Worst-first; the UI shows the top 300 (the count card shows the true total).
    stuckRaw.sort((a, b) => b.daysStuck - a.daysStuck);
    const stuckTotal = stuckRaw.length;
    const stuckTop = stuckRaw.slice(0, 300);

    // Resolve customer names for the displayed stuck rows only (tb_users is
    // camelCase: userID / userName / userLastName — see reports.ts).
    const displayedIds = Array.from(
      new Set(stuckTop.map((s) => s.userid).filter((u): u is string => Boolean(u))),
    );
    const userMap = new Map<string, string>();
    if (displayedIds.length > 0) {
      const { data: uRows, error: uErr } = await admin
        .from("tb_users")
        .select("userID, userName, userLastName")
        .in("userID", displayedIds)
        .limit(LIMIT);
      if (uErr) {
        logger.error("reports", "forwarder-sla tb_users lookup failed", uErr);
      }
      type URow = { userID: string; userName: string | null; userLastName: string | null };
      for (const u of (uRows ?? []) as unknown as URow[]) {
        const name = [u.userName, u.userLastName].filter(Boolean).join(" ");
        userMap.set(u.userID, name);
      }
    }

    const stuck: StuckOrder[] = stuckTop.map((s) => {
      const name = s.userid ? userMap.get(s.userid) : undefined;
      const code = s.userid ?? "";
      const customer = name
        ? `${code ? `[${code}] ` : ""}${name}`
        : (code || "—");
      return {
        id: s.id,
        fNo: `PR${s.id}`,
        stage: s.stage,
        daysStuck: s.daysStuck,
        customer,
      };
    });

    return {
      ok: true,
      data: {
        stages,
        stuck,
        cycleAvgDays,
        cycleP90Days,
        deliveredCount: cycleSorted.length,
        stuckTotal,
        slowestStage,
        slowestAvgDays,
        stuckThresholdDays,
      },
    };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    logger.error("reports", "forwarder-sla threw", err);
    return { ok: false, error: err.message };
  }
}
