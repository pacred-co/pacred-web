/**
 * Resolve a MOMO routing-batch placeholder cabinet (e.g. "PR20260530-SEA01"
 * / "MO20260523-EK01" / "PCS20260528-SEA01") → the REAL shipping info MOMO
 * carries for the trackings inside it: the real container code
 * (container_batch_no, e.g. "GZS260601-1"), the sack number (เลขกระสอบ ·
 * momo_sack_no, e.g. "CBX260523-EK01"), and the sea-departure / Thailand-arrival
 * dates (etd / eta).
 *
 * WHY this exists (report-cnt #4 · owner 2026-06-19/20):
 *  - report-cnt groups tb_forwarder by `fcabinetnumber`. For MOMO parcels whose
 *    container hasn't CLOSED yet, the cron writes a synthetic routing-batch ID
 *    (the "SEA0x" placeholder) into fcabinetnumber — NOT a real container. The
 *    propagate cron later replaces it with the real `container_batch_no` once the
 *    container closes (lib/integrations/momo-isolated/propagate.ts). Until then,
 *    staff see a cryptic placeholder.
 *  - The REAL container + sack live on `momo_import_tracks`, keyed by the
 *    placeholder via `momo_container_no` (= the same SEA0x value). So we can look
 *    them up by the placeholder and show the real container, or fall back to the
 *    sack number while the container is still open.
 *
 * ⚠️ DATA NOTE (etd/eta) — as of 2026-06-20 the `etd`/`eta` columns on
 * momo_import_tracks are present in the schema (migration 0116) but 100% NULL in
 * prod: MOMO does not push them and the แต้ม reconcile feed
 * (lib/admin/taem-reconcile-parser.ts) does NOT yet parse the packing-list
 * etd/eta columns. This resolver reads them anyway so the report's ETD/ETA columns
 * auto-populate the day either source is wired — today they simply render "—".
 * The authoritative future source is แต้ม's packing list (Container Name · etd ·
 * eta · Trans · …); wiring it needs the parser + reconcile-import to capture etd/eta.
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

/** Per-cabinet resolved MOMO shipping info. All fields may be null when MOMO has none yet. */
export type MomoContainerInfo = {
  /** Real container code from momo_import_tracks.container_batch_no (e.g. "GZS260601-1"). */
  realContainer: string | null;
  /** Sack number (เลขกระสอบ) from momo_import_tracks.momo_sack_no (e.g. "CBX260523-EK01"). */
  sackNo: string | null;
  /** Estimated time of departure (sea departure from China). Currently always null in prod. */
  etd: string | null;
  /** Estimated time of arrival (arrival in Thailand). Currently always null in prod. */
  eta: string | null;
};

type ImportTrackRow = {
  momo_container_no: string | null;
  container_batch_no: string | null;
  momo_sack_no: string | null;
  etd: string | null;
  eta: string | null;
};

/**
 * Pure — fold momo_import_tracks rows into one MomoContainerInfo per placeholder
 * cabinet (keyed on momo_container_no). For each cabinet we keep the FIRST
 * non-empty value seen for each field (representative value; the trackings in one
 * container share a container/sack/etd/eta in practice).
 */
export function foldMomoContainerInfo(
  rows: ImportTrackRow[],
): Record<string, MomoContainerInfo> {
  const out: Record<string, MomoContainerInfo> = {};
  for (const r of rows) {
    const key = r.momo_container_no?.trim();
    if (!key) continue;
    const info = (out[key] ??= { realContainer: null, sackNo: null, etd: null, eta: null });
    if (!info.realContainer && r.container_batch_no?.trim()) info.realContainer = r.container_batch_no.trim();
    if (!info.sackNo && r.momo_sack_no?.trim()) info.sackNo = r.momo_sack_no.trim();
    if (!info.etd && r.etd) info.etd = r.etd;
    if (!info.eta && r.eta) info.eta = r.eta;
  }
  return out;
}

/**
 * Batch-resolve the real container / sack / etd / eta for a list of cabinet
 * codes. Only the MOMO routing-batch placeholders are looked up (real container
 * codes need no resolution + don't exist as momo_container_no). Returns {} on any
 * DB error (the UI degrades to the placeholder). One round-trip.
 */
export async function resolveMomoContainerInfo(
  admin: AdminClient,
  cabinetCodes: string[],
): Promise<Record<string, MomoContainerInfo>> {
  const placeholders = Array.from(
    new Set(cabinetCodes.filter((c) => isMomoRoutingPlaceholder(c)).map((c) => c.trim())),
  );
  if (placeholders.length === 0) return {};

  const { data, error } = await admin
    .from("momo_import_tracks")
    .select("momo_container_no, container_batch_no, momo_sack_no, etd, eta")
    .in("momo_container_no", placeholders)
    .limit(50_000);
  if (error) {
    console.error("[resolveMomoContainerInfo] failed", { code: error.code, message: error.message });
    return {};
  }

  return foldMomoContainerInfo((data ?? []) as ImportTrackRow[]);
}
