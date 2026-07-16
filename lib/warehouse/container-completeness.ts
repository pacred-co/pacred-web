/**
 * Per-container completeness rollup — "ของมาครบมั้ย ตู้ต่อตู้".
 *
 * Phase 3 of the ops-workflow audit (`docs/research/ops-workflow-audit-
 * 2026-06-05.md` §30) — the warehouse team's headline ask. Pure data
 * aggregation: every `tb_forwarder` row in a container has an expected
 * parcel count (`famount`); when warehouse scans a parcel in, the matching
 * `tb_forwarder_import2` row's `fi2amount` bumps by 1. A container is
 * COMPLETE when every forwarder in it has scanned ≥ expected.
 *
 * Hot path is the list page (`/admin/report-cnt`) which renders ~30-50
 * containers per page — use `getContainerCompletenessBatch()` for that
 * (single round-trip via IN-list); the single-cabinet form is for the
 * detail page + the barcode-import hook's edge-transition check.
 *
 * Column casing (verified via REST OpenAPI 2026-06-08):
 *   - tb_forwarder            → ALL LOWERCASE (id, fcabinetnumber, famount, fstatus)
 *   - tb_forwarder_import2    → ALL LOWERCASE (fid, fi2amount)
 *   (tb_cnt + tb_cnt_item are camelCase but NOT used by this helper.)
 *
 * No money path. Read-only. Safe to ship.
 */

import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { filterCountableForwarderRows } from "@/lib/admin/momo-bill-header";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * The forwarder shape `summarise` needs. `ftrackingchn` + `fweight` + `userid`
 * are read ONLY to drop MOMO หัวบิล placeholders from the expected box count
 * (a bare zero-weight tracking with `-N/M` box siblings is a bill-open
 * placeholder, not a parcel to receive). See filterCountableForwarderRows.
 */
type FwForCompleteness = {
  id: number;
  famount: number | null;
  ftrackingchn: string | null;
  fweight: number | null;
  userid: string | null;
  /** SELL freight — the money signal for the หัวบิล drop (a เหมาๆ-only/aggregate
   *  bare base has ftotalprice=0 → dropped; a real priced anchor stays). */
  ftotalprice: number | string | null;
};

export type ContainerCompleteness = {
  /** Sum of expected parcel counts (`SUM(tb_forwarder.famount)` in this cabinet). */
  expected: number;
  /** Sum of scanned-in parcel counts (`SUM(tb_forwarder_import2.fi2amount)` for forwarders in this cabinet). */
  scanned: number;
  /** Number of forwarder rows in this cabinet. */
  forwardersTotal: number;
  /** Number of forwarders where fi2amount ≥ famount. */
  forwardersComplete: number;
  /**
   * Scanned / expected as a 0-100 percent (clamped). When `expected === 0`
   * we return 100 — vacuously complete (no expectation, nothing missing).
   */
  pct: number;
  /**
   * TRUE when EVERY forwarder in the cabinet has scanned ≥ expected.
   * Strictest definition — we don't trust `pct >= 100` alone because
   * one over-scanned row could mask another short row.
   */
  isComplete: boolean;
};

/** Empty-cabinet sentinel — used when there are no forwarders in the cabinet. */
const EMPTY: ContainerCompleteness = {
  expected: 0,
  scanned: 0,
  forwardersTotal: 0,
  forwardersComplete: 0,
  pct: 100,
  isComplete: true,
};

/**
 * Internal — turn raw rows into a Completeness summary.
 * Negatives are clamped to 0 (defensive; should never happen but
 * `fi2amount` is an int that could in theory be 0 or null).
 */
function summarise(
  forwardersRaw: Array<FwForCompleteness>,
  scans: Array<{ fid: number | null; fi2amount: number | null }>,
): ContainerCompleteness {
  // 2026-06-12 — drop MOMO หัวบิล placeholders so a split parcel's DECLARED
  // box count (e.g. 6 on the bare header) isn't summed on TOP of its 6 box
  // siblings → expected would be 12 vs 6 scanned and the cabinet could NEVER
  // read "ครบ". The header has no scan (it's not a physical parcel), so it
  // also wrongly kept forwardersComplete < forwardersTotal forever.
  const forwarders = filterCountableForwarderRows(forwardersRaw, {
    tracking: (f) => f.ftrackingchn,
    weight: (f) => f.fweight,
    userid: (f) => f.userid,
    // ftotalprice = SELL freight: an aggregate-weight bare base (owner #52559) carries 0 →
    // dropped from the expected box count (else expected double-counts its box siblings); a
    // real priced anchor carries >0 → kept (a physical parcel the warehouse must scan in).
    money: (f) => Number(f.ftotalprice ?? 0),
  });
  if (forwarders.length === 0) return EMPTY;

  // Sum scans per fid (a forwarder may have multiple import2 rows in legacy
  // edge cases — historically there's 1:1, but ROW-MOST-RECENT replaces +
  // sometimes orphan rows get re-linked, leaving 2 rows for the same fid).
  const scannedByFid = new Map<number, number>();
  for (const s of scans) {
    if (s.fid == null) continue;
    const prev = scannedByFid.get(s.fid) ?? 0;
    scannedByFid.set(s.fid, prev + Math.max(0, Number(s.fi2amount ?? 0)));
  }

  let expected = 0;
  let scanned = 0;
  let forwardersComplete = 0;
  for (const f of forwarders) {
    const exp = Math.max(0, Number(f.famount ?? 0));
    const got = scannedByFid.get(f.id) ?? 0;
    expected += exp;
    scanned += got;
    if (got >= exp) forwardersComplete += 1;
  }

  // pct: clamp to [0, 100]. When expected=0 (every row had famount=0/null)
  // the container is vacuously complete.
  const pct =
    expected === 0
      ? 100
      : Math.min(100, Math.max(0, Math.round((scanned / expected) * 100)));

  // Strict: every forwarder must be complete (defends against over-scan
  // on one row masking a short other row).
  const isComplete = forwardersComplete === forwarders.length;

  return {
    expected,
    scanned,
    forwardersTotal: forwarders.length,
    forwardersComplete,
    pct,
    isComplete,
  };
}

/**
 * Completeness rollup for ONE cabinet — used by the detail page banner
 * AND the barcode-import edge-transition check.
 *
 * Reads from tb_forwarder + tb_forwarder_import2 only. Returns the
 * EMPTY sentinel when the cabinet has no forwarders (vacuously complete).
 */
export async function getContainerCompleteness(
  admin: AdminClient,
  fcabinetnumber: string,
): Promise<ContainerCompleteness> {
  if (!fcabinetnumber) return EMPTY;

  const { data: fws, error: fwErr } = await admin
    .from("tb_forwarder")
    .select("id, famount, ftrackingchn, fweight, userid, ftotalprice")
    .eq("fcabinetnumber", fcabinetnumber)
    .limit(50_000);
  if (fwErr) {
    console.error(`[getContainerCompleteness tb_forwarder] failed`, {
      code: fwErr.code,
      message: fwErr.message,
      fcabinetnumber,
    });
    return EMPTY;
  }
  const forwarders = (fws ?? []) as Array<FwForCompleteness>;
  if (forwarders.length === 0) return EMPTY;

  const fwIds = forwarders.map((r) => r.id);
  const { data: scns, error: scnErr } = await admin
    .from("tb_forwarder_import2")
    .select("fid, fi2amount")
    .in("fid", fwIds);
  if (scnErr) {
    console.error(`[getContainerCompleteness tb_forwarder_import2] failed`, {
      code: scnErr.code,
      message: scnErr.message,
      fcabinetnumber,
    });
    // Treat as "nothing scanned" — surface the gap rather than crash.
    return summarise(forwarders, []);
  }
  const scans = (scns ?? []) as Array<{ fid: number | null; fi2amount: number | null }>;
  return summarise(forwarders, scans);
}

/**
 * Completeness rollup for MANY cabinets in ONE round-trip — used by the
 * list page (`/admin/report-cnt`) which renders ~30-50 cabinets per page.
 *
 * Hot-path discipline: NEVER loop `getContainerCompleteness()` for the
 * list page (50 RTTs · noticeable lag). This is two queries total:
 *   1. SELECT id, fcabinetnumber, famount FROM tb_forwarder WHERE fcabinetnumber IN (…)
 *   2. SELECT fid, fi2amount FROM tb_forwarder_import2 WHERE fid IN (… all fids …)
 *
 * Returns a Record keyed by cabinet → summary. Missing cabinets default
 * to the EMPTY sentinel (so the consumer can safely `result[cab] ?? EMPTY`).
 */
export async function getContainerCompletenessBatch(
  admin: AdminClient,
  cabinets: string[],
): Promise<Record<string, ContainerCompleteness>> {
  if (cabinets.length === 0) return {};

  // De-dupe + strip empties just in case the caller forgot.
  const uniqCabs = Array.from(new Set(cabinets.filter(Boolean)));
  if (uniqCabs.length === 0) return {};

  const { data: fws, error: fwErr } = await admin
    .from("tb_forwarder")
    .select("id, fcabinetnumber, famount, ftrackingchn, fweight, userid, ftotalprice")
    .in("fcabinetnumber", uniqCabs)
    .limit(100_000);
  if (fwErr) {
    console.error(`[getContainerCompletenessBatch tb_forwarder] failed`, {
      code: fwErr.code,
      message: fwErr.message,
      cabinetCount: uniqCabs.length,
    });
    // Empty everything on failure — UI degrades to "-" badges.
    return Object.fromEntries(uniqCabs.map((c) => [c, EMPTY]));
  }
  const forwarders = (fws ?? []) as Array<
    FwForCompleteness & { fcabinetnumber: string }
  >;

  // Group forwarders by cabinet (carry the tracking/weight/userid fields so
  // summarise can drop MOMO หัวบิล placeholders per-cabinet).
  const byCabinet = new Map<string, Array<FwForCompleteness>>();
  const allFids: number[] = [];
  for (const f of forwarders) {
    const key = f.fcabinetnumber;
    if (!key) continue;
    const member: FwForCompleteness = {
      id: f.id,
      famount: f.famount,
      ftrackingchn: f.ftrackingchn,
      fweight: f.fweight,
      userid: f.userid,
      ftotalprice: f.ftotalprice,
    };
    const arr = byCabinet.get(key);
    if (arr) arr.push(member);
    else byCabinet.set(key, [member]);
    allFids.push(f.id);
  }

  // ONE second query covering every fid across every cabinet
  let scans: Array<{ fid: number | null; fi2amount: number | null }> = [];
  if (allFids.length > 0) {
    const { data: scns, error: scnErr } = await admin
      .from("tb_forwarder_import2")
      .select("fid, fi2amount")
      .in("fid", allFids);
    if (scnErr) {
      console.error(`[getContainerCompletenessBatch tb_forwarder_import2] failed`, {
        code: scnErr.code,
        message: scnErr.message,
        fidCount: allFids.length,
      });
      // Treat as "nothing scanned" — surface the gap rather than crash.
    } else {
      scans = (scns ?? []) as Array<{ fid: number | null; fi2amount: number | null }>;
    }
  }

  // Split scans into per-cabinet buckets by fid lookup
  const cabinetForFid = new Map<number, string>();
  for (const f of forwarders) cabinetForFid.set(f.id, f.fcabinetnumber);

  const scansByCabinet = new Map<string, Array<{ fid: number | null; fi2amount: number | null }>>();
  for (const s of scans) {
    if (s.fid == null) continue;
    const cab = cabinetForFid.get(s.fid);
    if (!cab) continue;
    const arr = scansByCabinet.get(cab);
    if (arr) arr.push(s);
    else scansByCabinet.set(cab, [s]);
  }

  // Build the result
  const result: Record<string, ContainerCompleteness> = {};
  for (const cab of uniqCabs) {
    const fws = byCabinet.get(cab);
    if (!fws || fws.length === 0) {
      result[cab] = EMPTY;
      continue;
    }
    const scs = scansByCabinet.get(cab) ?? [];
    result[cab] = summarise(fws, scs);
  }
  return result;
}
