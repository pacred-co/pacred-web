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
 * ── 2026-06-02 — LEGACY model (owner decision) ────────────────────────────
 * The pool is now the LEGACY `tb_admin` table, NOT the rebuilt Pacred
 * `admins` + `admin_contact_extras` model. The rebuilt tables are EMPTY on
 * prod (the 13-admin recreate · ADR-0022 never happened), so the old code
 * always returned null → no lead was ever auto-assigned.
 *
 * The sales pool = `tb_admin` WHERE adminStatusA='1' (active staff) AND
 * adminStatusSale='1' (flagged as a sales rep) — i.e. พี (`admin_pee`) +
 * เมย์ (`admin_may`) once provisioned. The picked `tb_admin.adminID` is what
 * legacy `tb_users.adminIDSale` already stores (see getSalesRepContactForUserid
 * in lib/admin/sales-rep-contact.ts, which resolves the rep from exactly that
 * column), so the value round-trips cleanly into the register success popup.
 *
 * Algorithm note (intentional divergence, documented): legacy used a strict
 * sequential round-robin (the NEXT admin after the previous signup's rep).
 * Pacred uses "fewest-owned wins" — same goal (even distribution), fairer to
 * newer reps, and naturally self-balancing. The load-bearing requirement
 * (every lead carries a rep at signup) is identical.
 *
 * NEVER returns null: when the pool is empty the lead must STILL be owned, so
 * we fall back to the central rep (`CENTRAL_SALES_ADMIN_ID` = "admin_center")
 * — a provisioned tb_admin row ops watches; a real rep re-assigns later.
 *
 * Server-only — reads `tb_admin` (camelCase per migration 0113) + counts
 * `tb_users.adminIDSale`.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { CENTRAL_SALES_ADMIN_ID } from "@/lib/admin/sales-rep-central";

const SCOPE = "assignSalesRep";

/**
 * Pick the least-loaded sales rep — the active sales `tb_admin` currently
 * owning the fewest active customer rows in `tb_users.adminIDSale`.
 *
 * Returns the rep's `tb_admin.adminID` string. NEVER null: when no active
 * sales rep exists, returns `CENTRAL_SALES_ADMIN_ID` so the lead is still
 * owned by the central rep (ops re-assigns later).
 */
export async function pickLeastLoadedSalesRep(
  admin: SupabaseClient,
): Promise<string> {
  // Step 1 — enumerate the active sales pool from the LEGACY tb_admin table.
  // adminStatusA='1' = active staff · adminStatusSale='1' = is-a-sales-rep.
  // (tb_admin is camelCase + quoted per migration 0113.)
  const { data: reps, error: repsErr } = await admin
    .from("tb_admin")
    .select("adminID")
    .eq("adminStatusA", "1")
    .eq("adminStatusSale", "1");
  if (repsErr) {
    logger.warn(SCOPE, "tb_admin sales-pool lookup for auto-assign failed", { reason: repsErr.message });
    // Pool unknown → still own the lead via the central rep (never null).
    return CENTRAL_SALES_ADMIN_ID;
  }

  // Preserve list order (the tb_admin row order) for deterministic tie-breaks.
  const candidateIds: string[] = [];
  for (const r of (reps ?? [])) {
    const id = (r as { adminID: string | null }).adminID?.trim();
    if (id) candidateIds.push(id);
  }
  if (candidateIds.length === 0) {
    // No provisioned sales rep yet (พี/เมย์ not created) — fall back to the
    // central rep so the lead is owned, not orphaned.
    logger.info(SCOPE, "no active sales rep in tb_admin — falling back to central rep", {
      central: CENTRAL_SALES_ADMIN_ID,
    });
    return CENTRAL_SALES_ADMIN_ID;
  }

  // Step 2 — count current customer load per adminID (only currently-owned,
  // active customers). One query + client-side group (PostgREST has no
  // GROUP BY in standard select).
  const { data: owned, error: ownedErr } = await admin
    .from("tb_users")
    .select("adminIDSale")
    .in("adminIDSale", candidateIds)
    .eq("userActive", "1")
    .eq("userStatus", "1");
  if (ownedErr) {
    logger.warn(SCOPE, "tb_users load count for auto-assign failed", { reason: ownedErr.message });
    // Fall through to the first candidate — better than no assignment.
    return candidateIds[0]!;
  }

  const counts = new Map<string, number>();
  for (const id of candidateIds) counts.set(id, 0);
  for (const r of (owned ?? [])) {
    const sale = (r as { adminIDSale: string | null }).adminIDSale;
    if (!sale) continue;
    counts.set(sale, (counts.get(sale) ?? 0) + 1);
  }

  // Tie-broken by insertion order (the tb_admin list order) — deterministic
  // enough for round-robin semantics; "fewest wins" balances over time.
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
