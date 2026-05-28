/**
 * U1-3 · Arrival→billing gate — STUB (Wave 3 cleanup, 2026-05-20 ค่ำ).
 *
 * The gate originally read `forwarders.cargo_container_id` → `cargo_containers.status`
 * to block post-arrival wallet debits until the linked spine container was
 * `closed`. Under D1 Option A the cargo spine was retired in Wave 2 in
 * favour of the legacy `tb_forwarder` flow (faithful port of report-cnt.php).
 *
 * Until the legacy "ตัดตู้" workflow is faithfully ported in Phase C, the
 * gate is a no-op — it always returns `{ blocked: false }`. The 31% MOMO/PCS
 * CBM gap that motivated U1-3 still exists, but the gating logic must be
 * rebuilt on the `tb_forwarder` + `tb_cnt_item` shape (cnt-payment), not the
 * retired spine.
 *
 * Callers (`actions/forwarder.ts` wallet pay) still invoke this for forward
 * compatibility, but every call resolves to "not blocked" so customer
 * wallet-pay flows continue to work unchanged during the transition. Manual
 * staff oversight via /admin/report-cnt + tb_cnt is the interim gate.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CargoBillingGate =
  | { blocked: false }
  | {
      blocked: true;
      reason: "awaiting_container_close" | "no_container_linked" | "db_read_error";
      container_status?: string;
    };

/**
 * Returns whether wallet debit on this forwarder is blocked by the
 * arrival→billing gate. STUB — always returns `{ blocked: false }` because
 * the underlying cargo_containers table was retired in Wave 2. Real gating
 * resumes in Phase C when the legacy ตัดตู้ workflow lands.
 */
export async function getCargoBillingGate(
  _admin: SupabaseClient,
  _fNo: string,
): Promise<CargoBillingGate> {
  return { blocked: false };
}
