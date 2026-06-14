/**
 * G5 — status-transition role gates for tb_forwarder.fstatus
 *
 * Legacy PCS Cargo hard-codes the owner role on every fstatus transition
 * (e.g. `if ($departmentKey == 'Warehouse')` around `forwarder-import-warehouse.php`'s
 * UPDATE → 4, or `if ($departmentKey == 'Accounting')` around `forwarder-check.php`'s
 * UPDATE → 5). Pacred had every admin role able to call every transition action
 * because the page-level `requireAdmin([...])` was a broad union of allowed
 * roles rather than a per-transition gate. That made it possible for, say,
 * a Warehouse staffer to fire the Accounting bulk-bill or for Sales to mark
 * an item delivered.
 *
 * This helper centralises the legacy matrix as a single function. Every
 * fstatus-mutating action consults `canFlipFstatus(role, from, to)` per row
 * (so bulk actions with mixed `from` states still behave correctly) and
 * refuses the write with `error: 'forbidden_transition'` when no role on
 * the caller is authorised. `super` and `manager` are global overrides per
 * synthesis §6 D6 + §4 matrix (Manager = co-founder/COO tier).
 *
 * Canonical source:
 *   - `docs/research/legacy-deep-dive/_SYNTHESIS.md` §3 G5 + §4 (matrix)
 *   - `docs/research/legacy-deep-dive/04-staff-workflow-by-role.md` §3
 *     (Cargo flow choreography table — owner role per transition)
 *   - `docs/research/legacy-deep-dive/03-fstatus-state-machine.md` §4
 *     (31 UPDATE call sites + their per-handler role gates)
 *
 * Design notes:
 *   - ADDITIVE only. The page-level `requireAdmin([...])` union stays in
 *     place — this helper is a row-level extra check, not a replacement.
 *   - Bulk actions: caller MUST call per row (the matrix is per from→to,
 *     not per action). A 99 row in a bulk needs both `super`/`manager`
 *     even if the rest of the bulk is a normal 4→5.
 *   - Driver mobile (6.1→7) is matched via `from='6'` because legacy stores
 *     fstatus='6' for both "เตรียมส่ง" AND the virtual "กำลังจัดส่ง" sub-state
 *     (the 6.1 is a tab-filter JOIN, not a column value — see synthesis §2
 *     and 03-fstatus-state-machine.md §3 ASCII diagram). The same is true
 *     here: 6.1→7 is enforced as 6→7 with the `driver` role.
 *   - The shelve/restore (→99 / 99→prev) gate maps to the synthesis matrix
 *     "super / manager only" entry.
 *   - For partner-API sync (→2/→3), this helper isn't called: those rows
 *     are INSERT-only at carrier upload time (see comments in
 *     `actions/admin/api-forwarder-manual.ts` and `actions/admin/carrier-manual.ts`).
 *     Their page-level `withAdmin([...])` gate already enforces
 *     warehouse+ops+super, which matches the matrix.
 */

import type { AdminRole } from "@/lib/auth/require-admin";

/**
 * The role-allowlist per (from, to) transition. Each entry's value is the
 * set of `AdminRole`s the legacy PHP hard-codes as the OWNER of that flip.
 * `super` and `manager` are NOT listed because they're global overrides
 * applied in `canFlipFstatus`.
 *
 * Key shape: `${from}->${to}`. Wildcard `*->99` and `99->*` use the literal
 * star — checked first in `canFlipFstatus` before the exact lookup.
 *
 * The "from" status `1` is the implicit insert-time default and isn't
 * a real transition origin (rows are CREATED at fstatus=1; the first
 * transition is 1→2 or 1→3). We still allow 1→2/1→3 for completeness in
 * case a row gets shifted by hand.
 */
const TRANSITION_OWNERS: Record<string, readonly AdminRole[]> = {
  // ── Cargo flow forward path ──────────────────────────────────────
  "1->2":   ["warehouse", "ops"],            // China warehouse confirms receipt (sync handler / manual)
  "1->3":   ["warehouse", "ops"],            // China warehouse + container sealed (sync handler / manual)
  "2->3":   ["warehouse", "ops"],            // Container sealed + leaving China
  "3->4":   ["warehouse"],                   // TH warehouse confirms receipt (barcode parity / relink)
  "4->5":   ["accounting"],                  // Bulk-bill — Accounting / Manager / CEO (manager handled by override)
  "5->6":   ["accounting"],                  // Wallet pay confirmed (system observer + admin manual)
  "6->7":   ["driver", "warehouse"],         // Driver delivered (mobile photo) / warehouse force-complete
  // ── Backward / skip variants (admin dropdown — legacy allows them) ──
  "2->1":   ["warehouse", "ops"],
  "3->1":   ["warehouse", "ops"],
  "3->2":   ["warehouse", "ops"],
  "4->1":   ["warehouse"],
  "4->2":   ["warehouse"],
  "4->3":   ["warehouse"],
  "5->1":   ["accounting"],
  "5->2":   ["accounting"],
  "5->3":   ["accounting"],
  "5->4":   ["accounting"],
  "6->1":   ["accounting"],
  "6->2":   ["accounting"],
  "6->3":   ["accounting"],
  // 6->4: a CREDIT order is flipped to fstatus=6 at credit-grant (faithful to
  // legacy forwarder.php:1431) — but its goods may still physically arrive in TH
  // AFTER that. The warehouse MUST be able to record that arrival (6→4 · stamps
  // fdatestatus4). Legacy's 3 arrival writers (forwarder.php:2231 ·
  // forwarder-import-warehouse.php:29 · gateway.php type=4) had NO from-status
  // guard and freely re-stamped 6→4; Pacred's matrix omitted warehouse/ops here,
  // which BLOCKED the arrival scan on every credit order (the 2026-06-14 prod
  // "คนงานแสกนไม่ได้"). Restore the legacy behavior.
  "6->4":   ["accounting", "warehouse", "ops"],
  "6->5":   ["accounting"],                  // wallet rejection rolls 6 → 5 (legacy wallet.php:542)
  "7->1":   [],                              // terminal — manager-only via override
  "7->2":   [],
  "7->3":   [],
  "7->4":   [],
  "7->5":   [],
  "7->6":   [],
} as const;

/** Roles that can flip ANY transition (legacy "super-user" + "manager" gates). */
const OVERRIDE_ROLES: readonly AdminRole[] = ["super", "manager"];

/**
 * Decide whether a single role is allowed to flip `from` → `to`.
 *
 * Rules:
 *   1. `super` and `manager` can do anything (incl. shelve / restore / terminal).
 *   2. Any `→ 99` (shelve) is super/manager only — same for `99 → *` (restore).
 *   3. Same-status (`from === to`) is a no-op — always allowed (the per-row code
 *      may still skip the write upstream; this just doesn't punish a degenerate
 *      call shape).
 *   4. Otherwise: consult `TRANSITION_OWNERS[from->to]`. Missing = denied.
 *
 * @param role  — one AdminRole on the caller's `admins` rows
 * @param from  — the row's current fstatus (string, e.g. "4")
 * @param to    — the desired fstatus (string, e.g. "5")
 * @returns true if `role` is on the legacy owner-list for this transition
 */
export function canFlipFstatus(
  role: AdminRole,
  from: string,
  to: string,
): boolean {
  // Rule 1 — super/manager override applies to every transition.
  if (OVERRIDE_ROLES.includes(role)) return true;

  // Rule 2 — shelve/restore is super/manager only (the OVERRIDE_ROLES above).
  // We hit Rule 1 earlier if the caller is super/manager; reaching here
  // means they are not, so any 99-involved transition is denied.
  if (to === "99" || from === "99") return false;

  // Rule 3 — no-op same status.
  if (from === to) return true;

  // Rule 4 — exact lookup.
  const allowed = TRANSITION_OWNERS[`${from}->${to}`];
  if (!allowed || allowed.length === 0) return false;
  return allowed.includes(role);
}

/**
 * Convenience: ANY of the caller's roles satisfies the gate.
 *
 * An admin can hold multiple `admins` rows (one per role); the legacy
 * gate is OR-of-roles ("if ($departmentKey=='Warehouse' || $departmentKey=='CEO' ...)").
 *
 * @param roles — every role on the caller's `admins` rows (typically from
 *                `requireAdmin()` or `getAdminRoles()`)
 * @param from  — the row's current fstatus
 * @param to    — the desired fstatus
 * @returns true if at least one role can flip this transition
 */
export function canAnyRoleFlipFstatus(
  roles: readonly AdminRole[],
  from: string,
  to: string,
): boolean {
  return roles.some((r) => canFlipFstatus(r, from, to));
}
