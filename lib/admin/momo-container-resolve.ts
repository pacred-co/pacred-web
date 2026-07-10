/**
 * Resolve a MOMO routing-batch placeholder cabinet (e.g. "PR20260530-SEA01"
 * / "MO20260523-EK01" / "PCS20260528-SEA01") → the REAL shipping info carried
 * for the trackings inside it: the real container code (container_batch_no, e.g.
 * "GZS260601-1"), the sack number (เลขกระสอบ · momo_sack_no, e.g. "CBX260523-EK01"),
 * and the sea-departure / Thailand-arrival dates (etd / eta).
 *
 * WHY this exists (report-cnt #4 · owner 2026-06-19/20):
 *  - report-cnt groups tb_forwarder by `fcabinetnumber`. For MOMO parcels whose
 *    container hasn't CLOSED yet, the cron writes a synthetic routing-batch ID
 *    (the "SEA0x" placeholder) into fcabinetnumber — NOT a real container. The
 *    propagate cron later replaces it with the real `container_batch_no` once the
 *    container closes (lib/integrations/momo-isolated/propagate.ts). Until then,
 *    staff see a cryptic placeholder.
 *  - The REAL container + sack live on `momo_import_tracks`, keyed by the
 *    placeholder via `momo_container_no` (= the same SEA0x value). So we look
 *    them up by the placeholder and show the real container, or fall back to the
 *    sack number while the container is still open.
 *
 * ETD/ETA PRECEDENCE (owner: "ยึดของแต้ม (iTAM) เป็นหลัก, MOMO มาเทียบ"):
 *  - PRIMARY = แต้ม's packing-list ETD/ETA, persisted per-container in
 *    `taem_container_etd_eta` (migration 0195) by the reconcile apply path
 *    (actions/admin/taem-reconcile.ts). Keyed by the SAME container code report-cnt
 *    groups by (real GZS… or the SEA0x placeholder) → covers BOTH closed + open
 *    containers (the MOMO lookup below only covered placeholders).
 *  - FALLBACK = MOMO's `momo_container_details.etd_cn_kodang / estimate_date` (the
 *    Container Closed sync · migration 0120), used only when แต้ม has none for that
 *    container. MOMO is "ชอบมั่ว" so it never overrides แต้ม. (NOT momo_import_tracks
 *    — that per-tracking endpoint never carries dates; reading it for etd/eta was a
 *    dead read that left the report blank · ภูม 2026-06-20.)
 *  - `momoEtd`/`momoEta` are kept separately so the UI can show MOMO's value as a
 *    compare note when it disagrees with แต้ม.
 *
 * Read-only. No money path. Takes the admin client as a param (no server-only
 * runtime dep → unit-testable resolver).
 */

import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/** A MOMO routing-batch placeholder: PR/MO/PCS + 8-digit date + -SEA/EK/AIR + 2-digit. */
const MOMO_ROUTING_RX = /^(PR|MO|PCS)\d{8}-(SEA|EK|AIR)\d{2}$/i;

/** True when a cabinet code is a synthetic MOMO routing-batch placeholder, not a real container. */
export function isMomoRoutingPlaceholder(cabinet: string | null | undefined): boolean {
  return !!cabinet && MOMO_ROUTING_RX.test(cabinet.trim());
}

/** Per-cabinet resolved shipping info. All fields may be null when no source has them yet. */
export type MomoContainerInfo = {
  /** Real container code from momo_import_tracks.container_batch_no (e.g. "GZS260601-1"). */
  realContainer: string | null;
  /** Sack number (เลขกระสอบ) from momo_import_tracks.momo_sack_no (e.g. "CBX260523-EK01"). */
  sackNo: string | null;
  /** ETD shown to staff — แต้ม-primary, MOMO-fallback (date string yyyy-mm-dd | null). */
  etd: string | null;
  /** ETA shown to staff — แต้ม-primary, MOMO-fallback (date string yyyy-mm-dd | null). */
  eta: string | null;
  /** Which source the displayed etd/eta came from ("taem" | "momo" | null when both null). */
  etdSource: "taem" | "momo" | null;
  etaSource: "taem" | "momo" | null;
  /** MOMO's own etd/eta (kept for a compare note when it disagrees with แต้ม). */
  momoEtd: string | null;
  momoEta: string | null;
};

type ImportTrackRow = {
  momo_container_no: string | null;
  container_batch_no: string | null;
  momo_sack_no: string | null;
  momo_tracking_no?: string | null;
  etd: string | null;
  eta: string | null;
};

type TaemEtdEtaRow = {
  container_no: string | null;
  etd: string | null;
  eta: string | null;
};

/**
 * A row from `momo_container_details` (migration 0120) — the MOMO "Container
 * Closed" sync explodes `raw.container_details` into this table (one row per
 * closed container · keyed by the 3 MOMO identifiers). This is the REAL MOMO
 * ETD/ETA source: ETD = etd_cn_kodang (เรือออกจากจีน) · ETA = estimate_date
 * (ถึงไทยโดยประมาณ · eta_th_kodang is usually NULL). The old momo_import_tracks.
 * etd/eta read was a DEAD READ — that per-tracking endpoint never carries dates
 * (ภูม 2026-06-20: the sync page showed ETD/ETA but report-cnt didn't, because
 * the data lives here, not on momo_import_tracks).
 */
type ContainerDetailRow = {
  momo_container_ref: string | null;
  container_batch_no: string | null;
  real_container_no: string | null;
  etd_cn_kodang: string | null;
  estimate_date: string | null;
  eta_th_kodang: string | null;
};

/** Normalize a timestamptz/date value to yyyy-mm-dd for display (UI shows date only). */
function dateOnly(v: string | null): string | null {
  if (!v) return null;
  const s = String(v).trim();
  return s === "" ? null : s.slice(0, 10);
}

/**
 * Pure — fold momo_import_tracks rows into the MOMO half of MomoContainerInfo per
 * placeholder cabinet (keyed on momo_container_no). Keeps the FIRST non-empty value
 * per field (the trackings in one container share a container/sack/etd/eta). MOMO's
 * etd/eta land in momoEtd/momoEta (fallback layer · merged with แต้ม below).
 */
export function foldMomoContainerInfo(
  rows: ImportTrackRow[],
): Record<string, MomoContainerInfo> {
  const out: Record<string, MomoContainerInfo> = {};
  for (const r of rows) {
    const key = r.momo_container_no?.trim();
    if (!key) continue;
    const info = (out[key] ??= {
      realContainer: null, sackNo: null,
      etd: null, eta: null, etdSource: null, etaSource: null,
      momoEtd: null, momoEta: null,
    });
    if (!info.realContainer && r.container_batch_no?.trim()) info.realContainer = r.container_batch_no.trim();
    if (!info.sackNo && r.momo_sack_no?.trim()) info.sackNo = r.momo_sack_no.trim();
    if (!info.momoEtd && r.etd) info.momoEtd = dateOnly(r.etd);
    if (!info.momoEta && r.eta) info.momoEta = dateOnly(r.eta);
  }
  return out;
}

/**
 * Pure — set the MOMO etd/eta (the FALLBACK layer) from `momo_container_details`
 * (the REAL MOMO source · see ContainerDetailRow). For each detail row, match its
 * container code (any of container_batch_no / momo_container_ref / real_container_no)
 * to a cabinet code report-cnt groups by, and set that cabinet's momoEtd/momoEta:
 *   ETD = etd_cn_kodang  ·  ETA = estimate_date ?? eta_th_kodang
 * (estimate_date = "ถึงไทยโดยประมาณ" · eta_th_kodang is usually NULL). Overrides the
 * dead momo_import_tracks etd/eta (always NULL). แต้ม still wins over this in
 * mergeTaemEtdEta. Cabinets only in momo_container_details get a fresh info entry.
 */
export function mergeContainerDetailsEtdEta(
  base: Record<string, MomoContainerInfo>,
  cdRows: ContainerDetailRow[],
  cabCodes: string[],
): Record<string, MomoContainerInfo> {
  const out: Record<string, MomoContainerInfo> = { ...base };
  const cabSet = new Set(cabCodes.map((c) => c.trim()).filter(Boolean));
  for (const r of cdRows) {
    const etd = dateOnly(r.etd_cn_kodang);
    const eta = dateOnly(r.estimate_date) ?? dateOnly(r.eta_th_kodang);
    if (!etd && !eta) continue;
    // A detail row may match more than one cabinet code (rare) — set all.
    for (const code of [r.container_batch_no, r.momo_container_ref, r.real_container_no]) {
      const k = code?.trim();
      if (!k || !cabSet.has(k)) continue;
      const info = (out[k] ??= {
        realContainer: null, sackNo: null,
        etd: null, eta: null, etdSource: null, etaSource: null,
        momoEtd: null, momoEta: null,
      });
      if (etd) info.momoEtd = etd;   // momo_container_details is authoritative over
      if (eta) info.momoEta = eta;   // the (null) momo_import_tracks etd/eta
    }
  }
  return out;
}

/**
 * Pure — merge the แต้ม per-container etd/eta (PRIMARY) into a base map (which may
 * already carry MOMO's container/sack + momoEtd/momoEta). For each cabinet:
 *   displayed etd = taem.etd ?? momo.etd  (source flagged accordingly)
 * แต้ม never gets clobbered by MOMO. Cabinets that exist ONLY in the แต้ม map (real
 * closed containers with no MOMO placeholder row) get a fresh info entry.
 */
export function mergeTaemEtdEta(
  base: Record<string, MomoContainerInfo>,
  taemRows: TaemEtdEtaRow[],
): Record<string, MomoContainerInfo> {
  const out: Record<string, MomoContainerInfo> = { ...base };
  for (const t of taemRows) {
    const key = t.container_no?.trim();
    if (!key) continue;
    const info = (out[key] ??= {
      realContainer: null, sackNo: null,
      etd: null, eta: null, etdSource: null, etaSource: null,
      momoEtd: null, momoEta: null,
    });
    if (t.etd) { info.etd = dateOnly(t.etd); info.etdSource = "taem"; }
    if (t.eta) { info.eta = dateOnly(t.eta); info.etaSource = "taem"; }
  }
  // Fill the FALLBACK from MOMO wherever แต้ม didn't provide a value.
  for (const info of Object.values(out)) {
    if (info.etd == null && info.momoEtd != null) { info.etd = info.momoEtd; info.etdSource = "momo"; }
    if (info.eta == null && info.momoEta != null) { info.eta = info.momoEta; info.etaSource = "momo"; }
  }
  return out;
}

/**
 * Batch-resolve real container / sack + ETD/ETA (แต้ม-primary · MOMO-fallback) for
 * a list of cabinet codes.
 *  - MOMO `momo_import_tracks` lookup → container/sack/momoEtd/momoEta, but ONLY for
 *    the routing-batch placeholders (real container codes don't exist as
 *    momo_container_no, and need no container/sack resolution).
 *  - แต้ม `taem_container_etd_eta` lookup → ETD/ETA for ALL cabinet codes (real GZS…
 *    AND placeholders), so a CLOSED container (real code in fcabinetnumber) still
 *    shows ETD/ETA — the MOMO lookup alone could not.
 * Each source fails soft (returns its half empty) so the UI always degrades to the
 * placeholder / "—". Two round-trips.
 */
export async function resolveMomoContainerInfo(
  admin: AdminClient,
  cabinetCodes: string[],
  /**
   * The tracking numbers STILL under each cabinet (keyed by fcabinetnumber ·
   * report-cnt already computes this as `tracksByCab`). When supplied, a
   * placeholder's real container is resolved from ONLY these trackings' MOMO rows
   * — see the block comment below. Omit (unit tests / other callers) → falls back
   * to the whole-batch resolution (the pre-2026-07-10 behaviour).
   */
  trackingsByCab?: Record<string, string[]>,
): Promise<Record<string, MomoContainerInfo>> {
  const allCabs = Array.from(new Set(cabinetCodes.map((c) => c.trim()).filter(Boolean)));
  const placeholders = allCabs.filter((c) => isMomoRoutingPlaceholder(c));

  // ── MOMO layer (container/sack/momoEtd/momoEta) — placeholders only ──
  //
  // 🔴 DUPLICATE-CONTAINER FIX (ภูม 2026-07-10 · "ตู้ GZE260704-1 ซ้ำ 2 แถว").
  // Resolve a placeholder's REAL container from ONLY the trackings STILL under
  // that placeholder in tb_forwarder (trackingsByCab), NOT the whole MOMO routing
  // batch. WHY: one MOMO routing batch (e.g. PR20260701-EK01) is closed into
  // SEVERAL real containers, per-tracking + progressively. The propagate cron
  // (momo-isolated/propagate.ts) moves each parcel OUT of the placeholder the
  // moment its OWN tracking gets a real container_batch_no. So a parcel STILL under
  // a placeholder is one MOMO has NOT assigned a container to yet (its own
  // tracking's container_batch_no is NULL · verified on prod: 0 placeholder rows
  // have an own-tracking real container). The OLD fold read the batch's WHOLE
  // momo_container_no set and "borrowed" the FIRST non-null container from a parcel
  // that had already moved out → the genuinely-pending parcels masqueraded as that
  // real container → a FALSE duplicate row (placeholder-shown-as-real + the real
  // container's own row). Querying by the under-placeholder trackings resolves each
  // placeholder to ITS OWN parcels only → NULL while pending → the row shows the
  // placeholder (รอเลขตู้จริง), no duplicate. Auto-heals: once MOMO assigns the
  // container, propagate rewrites fcabinetnumber → the parcels join the real row.
  let base: Record<string, MomoContainerInfo> = {};
  if (placeholders.length > 0) {
    const placeholderSet = new Set(placeholders);
    // Own trackings = every tracking under a placeholder cabinet (deduped). null
    // signals "no per-cabinet trackings supplied" → whole-batch fallback.
    const ownTrackings = trackingsByCab
      ? Array.from(new Set(
          placeholders.flatMap((c) => (trackingsByCab[c] ?? []).map((t) => t.trim()).filter(Boolean)),
        ))
      : null;
    let query = admin
      .from("momo_import_tracks")
      .select("momo_container_no, container_batch_no, momo_sack_no, momo_tracking_no, etd, eta")
      .limit(50_000);
    query = ownTrackings != null
      // Restrict to the parcels STILL under a placeholder (["__none__"] guards an
      // empty list so .in() doesn't degrade to "match everything").
      ? query.in("momo_tracking_no", ownTrackings.length > 0 ? ownTrackings : ["__none__"])
      : query.in("momo_container_no", placeholders);
    const { data, error } = await query;
    if (error) {
      console.error("[resolveMomoContainerInfo · momo] failed", { code: error.code, message: error.message });
    } else {
      // When queried by tracking, keep only rows whose container_no is one of OUR
      // placeholders (a reassigned tracking's row may carry a real container_no →
      // not ours to fold under a placeholder key).
      const rows = ((data ?? []) as ImportTrackRow[]).filter(
        (r) => ownTrackings == null
          || (r.momo_container_no != null && placeholderSet.has(r.momo_container_no.trim())),
      );
      base = foldMomoContainerInfo(rows);
    }
  }

  // ── momo_container_details layer (the REAL MOMO etd/eta · 0120) — ALL codes ──
  // The Container Closed sync persists ETD_CN_KODANG / ESTIMATE_DATE here (keyed by
  // container_batch_no / momo_container_ref / real_container_no) — NOT on
  // momo_import_tracks (which is per-tracking + etd/eta always NULL). This is the
  // MOMO fallback the report shows when แต้ม hasn't sent a packing list.
  if (allCabs.length > 0) {
    // Match the cabinet code against the 2 columns it can be: container_batch_no
    // (real GZS… code · the closed-container case · most report-cnt rows) or
    // momo_container_ref (the SEA0x placeholder · open containers). Per-column
    // `.in()` is robust (no fragile PostgREST `.or()` string); the table is one
    // row per closed container. mergeContainerDetailsEtdEta only applies rows whose
    // code is in allCabs, so over-fetch is harmless.
    const cdRows: ContainerDetailRow[] = [];
    for (const col of ["container_batch_no", "momo_container_ref"] as const) {
      const { data, error } = await admin
        .from("momo_container_details")
        .select("momo_container_ref, container_batch_no, real_container_no, etd_cn_kodang, estimate_date, eta_th_kodang")
        .in(col, allCabs)
        .limit(50_000);
      if (error) {
        // momo_container_details may not exist on an env where 0120 isn't applied → fail soft.
        console.error("[resolveMomoContainerInfo · momo_container_details] failed", { code: error.code, message: error.message, col });
        continue;
      }
      if (data) cdRows.push(...(data as ContainerDetailRow[]));
    }
    base = mergeContainerDetailsEtdEta(base, cdRows, allCabs);
  }

  // ── แต้ม layer (ETD/ETA · AUTHORITATIVE) — ALL cabinet codes ──
  let taemRows: TaemEtdEtaRow[] = [];
  if (allCabs.length > 0) {
    const { data, error } = await admin
      .from("taem_container_etd_eta")
      .select("container_no, etd, eta")
      .in("container_no", allCabs)
      .limit(50_000);
    if (error) {
      // taem_container_etd_eta may not exist yet on an env where 0195 isn't applied
      // → fail soft (the report just shows MOMO's etd/eta or "—").
      console.error("[resolveMomoContainerInfo · taem] failed", { code: error.code, message: error.message });
    } else {
      taemRows = (data ?? []) as TaemEtdEtaRow[];
    }
  }

  return mergeTaemEtdEta(base, taemRows);
}
