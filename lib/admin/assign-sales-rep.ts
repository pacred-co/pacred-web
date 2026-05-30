/**
 * Sales-rep auto-assignment — the "fewest customers owned" round-robin.
 *
 * Extracted 2026-05-31 (P1-15) from actions/admin/customers.ts so BOTH the
 * register path (lib/auth/legacy-bridge-tb-users.ts) and the approve path
 * (actions/admin/customers.ts → approveCustomer) can share it.
 *
 * WHY register-time (P1-15 · gap master): legacy `check-otp-register.php`
 * L60-95 assigns `tb_users.adminIDSale` the moment the customer signs up —
 * so every new lead is already OWNED by a sales rep ("ทีมเซลล์จะโทรหา").
 * Pacred used to assign only at admin-approval time, leaving fresh leads
 * rep-less for the whole pending window. The bridge now assigns at register;
 * approveCustomer only assigns if the register-time pick was empty (no rep
 * available then), and never re-assigns an already-owned customer.
 *
 * Algorithm note (intentional divergence, documented): legacy used a strict
 * sequential round-robin (the NEXT admin after the previous signup's rep).
 * Pacred uses "fewest-owned wins" — same goal (even distribution), fairer to
 * newer reps, and naturally self-balancing. The load-bearing requirement
 * (every lead carries a rep at signup) is identical.
 *
 * Server-only — reads the Pacred admin model (`admins` + `admin_contact_extras`)
 * and counts `tb_users.adminIDSale`. Returns the legacy varchar the column
 * stores (`admin_contact_extras.legacy_admin_id`), or null when no active
 * sales rep with a legacy id is available (Pacred-native admins with a NULL
 * legacy_admin_id can't own legacy tb_users rows).
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

const SCOPE = "assignSalesRep";

/**
 * Pick the least-loaded sales rep (sales / sales_admin / super) — the one
 * currently owning the fewest active customer rows in `tb_users.adminIDSale`.
 * Returns the rep's legacy_admin_id string, or null when none is available.
 */
export async function pickLeastLoadedSalesRep(
  admin: SupabaseClient,
): Promise<string | null> {
  // Step 1 — enumerate active sales reps (or super) with a non-null
  // legacy_admin_id (= bridge value the legacy column accepts).
  const { data: roles, error: rolesErr } = await admin
    .from("admins")
    .select("profile_id, role, is_active")
    .in("role", ["sales", "sales_admin", "super"])
    .eq("is_active", true);
  if (rolesErr) {
    logger.warn(SCOPE, "admins lookup for auto-assign failed", { reason: rolesErr.message });
    return null;
  }
  const profileIds = (roles ?? [])
    .map((r) => (r as { profile_id: string }).profile_id)
    .filter(Boolean);
  if (profileIds.length === 0) return null;

  const { data: extras, error: extrasErr } = await admin
    .from("admin_contact_extras")
    .select("profile_id, legacy_admin_id, ended_at, suspended_at")
    .in("profile_id", profileIds);
  if (extrasErr) {
    logger.warn(SCOPE, "admin_contact_extras lookup for auto-assign failed", { reason: extrasErr.message });
    return null;
  }
  const candidateIds: string[] = [];
  for (const e of (extras ?? [])) {
    const row = e as {
      legacy_admin_id: string | null;
      ended_at: string | null;
      suspended_at: string | null;
    };
    if (!row.legacy_admin_id) continue;
    if (row.ended_at) continue;          // permanently left
    if (row.suspended_at) continue;      // temporarily paused
    candidateIds.push(row.legacy_admin_id);
  }
  if (candidateIds.length === 0) return null;

  // Step 2 — count current customer load per legacy_admin_id (only
  // currently-owned, active customers). One query + client-side group
  // (PostgREST has no GROUP BY in standard select).
  const { data: owned, error: ownedErr } = await admin
    .from("tb_users")
    .select("adminIDSale")
    .in("adminIDSale", candidateIds)
    .eq("userActive", "1")
    .eq("userStatus", "1");
  if (ownedErr) {
    logger.warn(SCOPE, "tb_users load count for auto-assign failed", { reason: ownedErr.message });
    // Fall through to the first candidate — better than no assignment.
    return candidateIds[0] ?? null;
  }

  const counts = new Map<string, number>();
  for (const id of candidateIds) counts.set(id, 0);
  for (const r of (owned ?? [])) {
    const sale = (r as { adminIDSale: string | null }).adminIDSale;
    if (!sale) continue;
    counts.set(sale, (counts.get(sale) ?? 0) + 1);
  }

  // Tie-broken by insertion order (the admin list order) — deterministic
  // enough for round-robin semantics; "fewest wins" balances over time.
  let winner: string | null = null;
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
