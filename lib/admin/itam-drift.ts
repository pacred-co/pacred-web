/**
 * iTAM (แต้ม) ↔ tb_forwarder DRIFT classification — PURE, read-only.
 *
 * The MOMO API has been dropping 30-40% of warehouse-arrival records since
 * 16/06/26 (docs/research/taem-momo-containers-2026-06-29.md §2a), so iTAM's
 * packing-list (the TRUTH) carries trackings that either never reached
 * tb_forwarder at all, OR reached it as a bare ฿0 shell that never got its
 * measurements. This module classifies each iTAM line against the matched
 * tb_forwarder row so the read-only drift page can surface the gap + estimate
 * the under-charged freight.
 *
 * NOTHING here mutates. The freight estimate is DISPLAY-ONLY (a coarse figure
 * to size the gap) — the EXACT charge is re-derived by the audited reconcile's
 * computeAndFillForwarderImportRate when the human applies it. No price is ever
 * written from this module or the page that consumes it.
 *
 * SAFETY — pure · no DB · no IO · unit-testable.
 */

export type DriftClass =
  | "missing"          // no tb_forwarder row at all → needs CREATE before reconcile
  | "matched-zero"     // matched, non-billed, but fweight/fvolume = 0 → reconcile fills it
  | "matched-billed"   // matched but billed (fstatus 5/6/7) → locked, never written
  | "matched-ok";      // matched + already has measurements (no drift)

const BILLED = new Set(["5", "6", "7"]);

export type ItamLine = {
  container_no: string;
  base_tracking: string;
  member_code: string | null;
  item_type: string | null;
  total_parcel: number | null;
  total_wt_kg: number | null;
  total_vol_cbm: number | null;
  source_file: string | null;
};

export type FwdMatch = {
  id: number;
  ftrackingchn: string | null;
  fstatus: string | null;
  fweight: number | null;
  fvolume: number | null;
  fcabinetnumber: string | null;
  ftotalprice: number | null;
  userid: string | null;
} | null;

export type DriftRow = ItamLine & {
  cls: DriftClass;
  fid: number | null;
  fstatus: string | null;
  curWt: number | null;
  curVol: number | null;
  curCab: string | null;
  curPrice: number | null;
  /** display-only estimate of the freight this row would recover if backfilled. */
  estRecoverThb: number;
  /** true when this row currently bills ฿0 freight (the under-charged signal). */
  freightZero: boolean;
};

/**
 * Coarse, DISPLAY-ONLY freight estimate (THB) for the iTAM weight/CBM, mirroring
 * the dry-run doc's sizing: KG-basis ≈ ฿15/kg when KG/CBM > 250 (dense cargo),
 * else CBM-basis ≈ ฿5,000/CBM. This is NOT the real charge — the audited
 * reconcile re-derives the exact figure from the live rate card + per-order
 * ค่าเทียบ/manual override. Used only to size the recoverable gap on the page.
 */
export function estimateFreightThb(wtKg: number | null, volCbm: number | null): number {
  const wt = wtKg ?? 0;
  const vol = volCbm ?? 0;
  if (wt <= 0 && vol <= 0) return 0;
  const kgPerCbm = vol > 0 ? wt / vol : Infinity;
  const byKg = wt * 15;
  const byCbm = vol * 5000;
  // dense → KG basis; bulky → CBM basis (the ค่าเทียบ ≈ 250 bridge).
  const est = kgPerCbm > 250 ? byKg : byCbm;
  return Math.round(est);
}

/** Classify one iTAM line against its (possibly null) tb_forwarder match. */
export function classifyDriftRow(line: ItamLine, fwd: FwdMatch): DriftRow {
  const base = {
    ...line,
    fid: fwd?.id ?? null,
    fstatus: fwd?.fstatus ?? null,
    curWt: fwd?.fweight ?? null,
    curVol: fwd?.fvolume ?? null,
    curCab: fwd?.fcabinetnumber ?? null,
    curPrice: fwd?.ftotalprice ?? null,
  };
  const estRecoverThb = estimateFreightThb(line.total_wt_kg, line.total_vol_cbm);

  if (!fwd) {
    return { ...base, cls: "missing", estRecoverThb, freightZero: true };
  }
  const isBilled = BILLED.has(String(fwd.fstatus ?? ""));
  const freightZero = (fwd.ftotalprice ?? 0) <= 0;
  if (isBilled) {
    return { ...base, cls: "matched-billed", estRecoverThb: 0, freightZero };
  }
  const hasMeasure = (fwd.fweight ?? 0) > 0 && (fwd.fvolume ?? 0) > 0;
  if (!hasMeasure) {
    return { ...base, cls: "matched-zero", estRecoverThb, freightZero };
  }
  // matched + measured → no actionable drift (the recoverable estimate is 0).
  return { ...base, cls: "matched-ok", estRecoverThb: 0, freightZero };
}

export type ContainerGroup = {
  container_no: string;
  rows: DriftRow[];
  counts: { total: number; missing: number; matchedZero: number; matchedBilled: number; matchedOk: number };
  estRecoverThb: number;
  totalWtKg: number;
  totalVolCbm: number;
};

export type DriftSummary = {
  groups: ContainerGroup[];
  totals: {
    lines: number;
    missing: number;
    matchedZero: number;
    matchedBilled: number;
    matchedOk: number;
    estRecoverThb: number;
  };
  /** the §2b "PR drop victims" — missing rows with a PR (not PCS) code. */
  prDropVictims: DriftRow[];
};

const isPrCode = (code: string | null): boolean =>
  /^pr\s*\d/i.test((code ?? "").trim());

/** Build the per-container grouped drift summary from classified rows. */
export function summarizeDrift(rows: DriftRow[]): DriftSummary {
  const byContainer = new Map<string, DriftRow[]>();
  for (const r of rows) {
    if (!byContainer.has(r.container_no)) byContainer.set(r.container_no, []);
    byContainer.get(r.container_no)!.push(r);
  }
  const groups: ContainerGroup[] = Array.from(byContainer.entries())
    .map(([container_no, grp]) => {
      const counts = {
        total: grp.length,
        missing: grp.filter((r) => r.cls === "missing").length,
        matchedZero: grp.filter((r) => r.cls === "matched-zero").length,
        matchedBilled: grp.filter((r) => r.cls === "matched-billed").length,
        matchedOk: grp.filter((r) => r.cls === "matched-ok").length,
      };
      return {
        container_no,
        rows: grp,
        counts,
        estRecoverThb: grp.reduce((a, r) => a + r.estRecoverThb, 0),
        totalWtKg: grp.reduce((a, r) => a + (r.total_wt_kg ?? 0), 0),
        totalVolCbm: grp.reduce((a, r) => a + (r.total_vol_cbm ?? 0), 0),
      };
    })
    .sort((a, b) => a.container_no.localeCompare(b.container_no));

  const totals = {
    lines: rows.length,
    missing: rows.filter((r) => r.cls === "missing").length,
    matchedZero: rows.filter((r) => r.cls === "matched-zero").length,
    matchedBilled: rows.filter((r) => r.cls === "matched-billed").length,
    matchedOk: rows.filter((r) => r.cls === "matched-ok").length,
    estRecoverThb: rows.reduce((a, r) => a + r.estRecoverThb, 0),
  };

  const prDropVictims = rows
    .filter((r) => r.cls === "missing" && isPrCode(r.member_code))
    .sort((a, b) => a.container_no.localeCompare(b.container_no));

  return { groups, totals, prDropVictims };
}
