/**
 * Pure helper for the แต้ม (iTAM) reconcile ETD/ETA persistence (report-cnt #4).
 *
 * Extracted from actions/admin/taem-reconcile.ts because a `"use server"` file may
 * only export async functions — a sync export there becomes a server-action ref +
 * isn't unit-testable. This module is server-only-dependency-free → tsx-runnable.
 */

/** The minimum a reconcile row needs for ETD/ETA collection. */
export type TaemEtdEtaInput = {
  /** แต้ม's own container code for this tracking (written onto fcabinetnumber). */
  taemContainer: string | null;
  /** The parcel's CURRENT Pacred cabinet (fallback key when แต้ม container is blank). */
  curCab: string | null;
  taemEtd: string | null;
  taemEta: string | null;
};

export type ContainerEtdEta = { container_no: string; etd: string | null; eta: string | null };

/**
 * Collect per-container ETD/ETA from the parsed แต้ม rows.
 *
 * The container KEY = the value report-cnt groups by (tb_forwarder.fCabinetNumber):
 *  - prefer แต้ม's own container (`taemContainer`, the value the reconcile also writes
 *    onto fcabinetnumber), so the etd/eta land under the same key the report reads;
 *  - else fall back to the parcel's CURRENT Pacred cabinet (`curCab`) — covers
 *    continuation rows whose แต้ม container cell is blank (they inherit the parent's),
 *    and rows where แต้ม has etd/eta but no fresh container.
 * Dedupe by container; the first non-null etd/eta wins (trackings in one container
 * share its etd/eta in practice). Only rows that actually carry an etd OR eta count.
 */
export function collectContainerEtdEta(rows: TaemEtdEtaInput[]): ContainerEtdEta[] {
  const byContainer = new Map<string, { etd: string | null; eta: string | null }>();
  for (const r of rows) {
    if (r.taemEtd == null && r.taemEta == null) continue; // nothing to store
    const key = (r.taemContainer ?? r.curCab ?? "").trim();
    if (!key) continue; // no resolvable container → can't key it to the report
    const cur = byContainer.get(key) ?? { etd: null, eta: null };
    if (cur.etd == null && r.taemEtd != null) cur.etd = r.taemEtd;
    if (cur.eta == null && r.taemEta != null) cur.eta = r.taemEta;
    byContainer.set(key, cur);
  }
  return Array.from(byContainer.entries()).map(([container_no, v]) => ({
    container_no,
    etd: v.etd,
    eta: v.eta,
  }));
}
