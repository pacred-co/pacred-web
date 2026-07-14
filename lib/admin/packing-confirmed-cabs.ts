import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A container counts as "packing-confirmed" (its กล่อง/น้ำหนัก basis is trusted for
 * billing · the ค่าส่ง/CBM SELL is settled) if it has EITHER:
 *   - a `container_packing_reconcile` stamp (mig 0245 · the reconcile flow), OR
 *   - a `momo_packing_upload` row (mig 0254 · the packing-list upload that the billing
 *     banner ITSELF tells staff to use: "อัพ packing list ที่ /admin/api-forwarder-momo/
 *     packing-upload ก่อน").
 *
 * `applyMomoPacking` writes BOTH, so they are normally in sync — but accepting EITHER
 * closes the two-table disconnect that false-blocked billing on a container that WAS
 * uploaded (owner 2026-07-14 "อัพแล้วยังบอกไม่อัพ"). Pure validation — never touches
 * pricing. Shared by the display gate (listEligibleForwarders) and the server gate
 * (createBillingRunInvoice) so both agree.
 */
export async function resolvePackingConfirmedCabs(
  admin: SupabaseClient,
  cabs: string[],
): Promise<Set<string>> {
  const set = new Set<string>();
  if (cabs.length === 0) return set;
  const [rec, up] = await Promise.all([
    admin.from("container_packing_reconcile").select("container_no").in("container_no", cabs),
    admin.from("momo_packing_upload").select("container_no").in("container_no", cabs),
  ]);
  if (rec.error) console.error("[resolvePackingConfirmedCabs reconcile] failed", { code: rec.error.code, message: rec.error.message });
  if (up.error) console.error("[resolvePackingConfirmedCabs upload] failed", { code: up.error.code, message: up.error.message });
  for (const r of (rec.data ?? []) as Array<{ container_no: string }>) set.add((r.container_no ?? "").trim());
  for (const r of (up.data ?? []) as Array<{ container_no: string }>) set.add((r.container_no ?? "").trim());
  set.delete("");
  return set;
}
