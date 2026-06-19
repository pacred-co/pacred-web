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
 *  - FALLBACK = MOMO's own `momo_import_tracks.etd/eta` (only when แต้ม has none for
 *    that container). MOMO is "ชอบมั่ว" so it never overrides แต้ม.
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
  etd: string | null;
  eta: string | null;
};

type TaemEtdEtaRow = {
  container_no: string | null;
  etd: string | null;
  eta: string | null;
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
): Promise<Record<string, MomoContainerInfo>> {
  const allCabs = Array.from(new Set(cabinetCodes.map((c) => c.trim()).filter(Boolean)));
  const placeholders = allCabs.filter((c) => isMomoRoutingPlaceholder(c));

  // ── MOMO layer (container/sack/momoEtd/momoEta) — placeholders only ──
  let base: Record<string, MomoContainerInfo> = {};
  if (placeholders.length > 0) {
    const { data, error } = await admin
      .from("momo_import_tracks")
      .select("momo_container_no, container_batch_no, momo_sack_no, etd, eta")
      .in("momo_container_no", placeholders)
      .limit(50_000);
    if (error) {
      console.error("[resolveMomoContainerInfo · momo] failed", { code: error.code, message: error.message });
    } else {
      base = foldMomoContainerInfo((data ?? []) as ImportTrackRow[]);
    }
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
