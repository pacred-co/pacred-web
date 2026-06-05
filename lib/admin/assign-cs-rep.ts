/**
 * CS auto-assignment — the "fewest customers owned" round-robin (a verbatim
 * mirror of lib/admin/assign-sales-rep.ts, for the per-customer CS slot).
 *
 * Owner 2026-06-05: each customer gets their own CS (who follows the customer's
 * order status), assigned at register exactly like the sales rep — so every new
 * lead is already owned by BOTH a เซล and a CS.
 *
 * Pool = LEGACY `tb_admin` WHERE adminStatusA='1' (active) AND adminStatusCS='1'
 * (flagged CS · migration 0141), counting `tb_users.adminIDCS`. Mirrors the
 * sales model (the rebuilt `admins` table is empty on prod). NEVER returns null:
 * an empty pool falls back to `CENTRAL_CS_ADMIN_ID` (= พลอย `admin_ploy`).
 *
 * Algorithm = "fewest-owned wins" (same as sales) — even distribution, fairer to
 * newer CS, self-balancing. Server-only — camelCase columns per migration 0113/0141.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { CENTRAL_CS_ADMIN_ID } from "@/lib/admin/cs-rep-central";

const SCOPE = "assignCsRep";

/**
 * Pick the least-loaded CS — the active CS `tb_admin` currently owning the
 * fewest active customer rows in `tb_users.adminIDCS`. Returns the CS's
 * `tb_admin.adminID`. NEVER null: empty pool → `CENTRAL_CS_ADMIN_ID`.
 */
export async function pickLeastLoadedCsRep(
  admin: SupabaseClient,
): Promise<string> {
  // Step 1 — the active CS pool from the LEGACY tb_admin table.
  // adminStatusA='1' = active staff · adminStatusCS='1' = is-a-CS (migration 0141).
  const { data: reps, error: repsErr } = await admin
    .from("tb_admin")
    .select("adminID")
    .eq("adminStatusA", "1")
    .eq("adminStatusCS", "1");
  if (repsErr) {
    logger.warn(SCOPE, "tb_admin CS-pool lookup for auto-assign failed", { reason: repsErr.message });
    return CENTRAL_CS_ADMIN_ID;
  }

  const candidateIds: string[] = [];
  for (const r of (reps ?? [])) {
    const id = (r as { adminID: string | null }).adminID?.trim();
    if (id) candidateIds.push(id);
  }
  if (candidateIds.length === 0) {
    logger.info(SCOPE, "no active CS in tb_admin — falling back to central CS", {
      central: CENTRAL_CS_ADMIN_ID,
    });
    return CENTRAL_CS_ADMIN_ID;
  }

  // Step 2 — count current customer load per adminID (active customers only).
  const { data: owned, error: ownedErr } = await admin
    .from("tb_users")
    .select("adminIDCS")
    .in("adminIDCS", candidateIds)
    .eq("userActive", "1")
    .eq("userStatus", "1");
  if (ownedErr) {
    logger.warn(SCOPE, "tb_users CS-load count for auto-assign failed", { reason: ownedErr.message });
    return candidateIds[0]!;
  }

  const counts = new Map<string, number>();
  for (const id of candidateIds) counts.set(id, 0);
  for (const r of (owned ?? [])) {
    const cs = (r as { adminIDCS: string | null }).adminIDCS;
    if (!cs) continue;
    counts.set(cs, (counts.get(cs) ?? 0) + 1);
  }

  let winner = candidateIds[0]!;
  let winnerCount = Number.POSITIVE_INFINITY;
  for (const id of candidateIds) {
    const c = counts.get(id) ?? 0;
    if (c < winnerCount) {
      winnerCount = c;
      winner = id;
    }
  }
  return winner;
}
