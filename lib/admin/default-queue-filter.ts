/**
 * G6 — Default queue filters per role for Pacred admin list pages.
 *
 * Legacy `pcs-admin/header.php` + each page's per-role landing dispatch
 * pre-applied a `?q=N` filter so a staffer who clicked their sidebar
 * link landed on THEIR queue — not a raw "every row in the database"
 * list. Pacred currently dumps the whole list to everyone; warehouse
 * staff opening `/admin/forwarders` see all 8,898 rows including
 * accounting-only "ถึงไทย/รอชำระ" instead of their own
 * "กำลังส่งมาไทย" queue.
 *
 * This module is the SOT for those defaults. Each admin list page
 * server-component should call `getDefaultFilter(pathname, role)` and,
 * when it returns a non-null `URLSearchParams`, `redirect()` with the
 * query applied — but ONLY when the user lands on the page WITHOUT
 * any of their own query params (so any explicit override is honored).
 *
 * Source map per page · role table — extracted from:
 *   - docs/research/legacy-deep-dive/04-staff-workflow-by-role.md §3 + §6
 *   - docs/research/legacy-deep-dive/_SYNTHESIS.md §3 G6
 *   - Each page's current `?q=` / `?status=` URL keys
 *
 * Design choice — RETURN VALUE shape:
 *   - URLSearchParams (with at least one key set) → caller redirects with `?<params>`
 *   - null → caller renders the full list (current behaviour preserved)
 *
 * Why URLSearchParams + not a {key: value} object?
 *   Pacred admin pages use heterogeneous URL keys (`?status=1` on
 *   /admin/forwarders, `?q=1` on /admin/cnt-hs, `?view=tx&status=1`
 *   on /admin/wallet, `?adminidsale=admin_pop` on /admin/customers).
 *   URLSearchParams is the lingua-franca for redirect builders — each
 *   caller just appends `?${params.toString()}` to its base path.
 *
 * Test coverage — see `default-queue-filter.test.ts` (pure-function;
 * no DB / no env vars · runs in `pnpm test:unit`).
 */

import type { AdminRole } from "@/lib/auth/require-admin";

// ────────────────────────────────────────────────────────────────────
// Page → role → default filter matrix
// ────────────────────────────────────────────────────────────────────
//
// `super` is the "all access" role — it ALWAYS sees the unfiltered
// list (the executive view). For every other role, the matrix below
// is the default landing filter; falls back to null (= no filter) when
// no role-specific default is set.
//
// Roles not listed under a page → no default (= show all).

/**
 * Pages we apply defaults to. Pathname literal — match against the
 * incoming pathname stripped of locale prefix (e.g. `/admin/forwarders`,
 * not `/th/admin/forwarders`).
 */
export type FilterablePage =
  | "/admin/forwarders"
  | "/admin/forwarder-check"
  | "/admin/cnt-hs"
  | "/admin/customers"
  | "/admin/wallet";

/**
 * Universal escape-hatch query key. When present on a clean landing,
 * the helper falls through and renders the unfiltered list — without
 * this, clicking "ดูทั้งหมด" would loop back to the role-default queue.
 *
 * The pages don't have to read or honor `nofilter` — it's purely a
 * marker the helper recognises. Drop it from any other UI link so the
 * URL stays clean.
 */
export const NOFILTER_PARAM = "nofilter" as const;

/**
 * `legacyAdminId` is optional context — only `/admin/customers` uses it
 * (to filter by `?adminidsale=<id>` so a sales_admin lands on their
 * own customer book). The helper degrades to `null` for sales_admin
 * if no legacyAdminId is supplied — better to show all than to dump
 * an empty list with a wrong filter that confuses the staffer.
 */
export type DefaultFilterContext = {
  legacyAdminId?: string | null;
};

/**
 * `super` always returns null (unfiltered view).
 * Other roles → page-specific default per the matrix.
 *
 * Returns a `URLSearchParams` with at least one key set, OR null if
 * no default applies. Caller must check `result !== null` before
 * issuing the redirect.
 */
export function getDefaultFilter(
  page: FilterablePage,
  role: AdminRole,
  ctx: DefaultFilterContext = {},
): URLSearchParams | null {
  // `super` = executive view → never auto-filter (matches legacy CEO
  // landing which loaded the full list).
  if (role === "super") return null;

  switch (page) {
    case "/admin/forwarders":
      return forwardersFilter(role);
    case "/admin/forwarder-check":
      return forwarderCheckFilter(role);
    case "/admin/cnt-hs":
      return cntHsFilter(role);
    case "/admin/customers":
      return customersFilter(role, ctx.legacyAdminId ?? null);
    case "/admin/wallet":
      return walletFilter(role);
    default:
      return null;
  }
}

// ────────────────────────────────────────────────────────────────────
// /admin/forwarders — fStatus tabs (?status=1..7,6.1,c,p)
// ────────────────────────────────────────────────────────────────────
// Legacy 10-tab strip (forwarder.php L575-653):
//   1  รอเข้าโกดังจีน         (Sales / interpreter / QA follow-up)
//   2  ถึงโกดังจีนแล้ว        (informational · between stages)
//   3  กำลังส่งมาไทย          (Warehouse waiting-for-arrival)
//   4  ถึงไทยแล้ว              (Accounting bill-prep)
//   5  รอชำระเงิน              (Accounting payment-follow-up)
//   6  เตรียมส่ง                (Warehouse driver-assign)
//
// Role → default per docs/research/legacy-deep-dive/04-staff-workflow-by-role.md §3.
function forwardersFilter(role: AdminRole): URLSearchParams | null {
  const sp = new URLSearchParams();
  switch (role) {
    case "warehouse":
      // กำลังส่งมาไทย — their wait queue (legacy Warehouse landing).
      sp.set("status", "3");
      return sp;
    case "accounting":
      // ถึงไทยแล้ว — ready-to-bill (legacy Accounting landing for
      // forwarder list · billing pipeline entry).
      sp.set("status", "4");
      return sp;
    case "sales":
    case "sales_admin":
    case "interpreter":
    case "qa":
      // รอเข้าโกดังจีน — newest orders awaiting fulfilment.
      // Sales/interpreter follow up customer pings; QA chases overdue.
      sp.set("status", "1");
      return sp;
    default:
      return null;
  }
}

// ────────────────────────────────────────────────────────────────────
// /admin/forwarder-check — bulk-bill queue (?q=,c,n)
// ────────────────────────────────────────────────────────────────────
// The queue is ALREADY filtered to status=4 server-side (every row
// here is awaiting billing). The only role-level default we apply is
// the credit/normal tab split:
//   ''  ทั้งหมด          (default · no filter)
//   c   จ่ายแบบเครดิต
//   n   จ่ายแบบปกติ
// Accounting/super land on the full queue (they bill both); no
// per-role default beyond that.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- role kept in signature for matrix-uniformity + future per-role tweaks
function forwarderCheckFilter(_role: AdminRole): URLSearchParams | null {
  // No per-role override — the page itself is the role's queue.
  return null;
}

// ────────────────────────────────────────────────────────────────────
// /admin/cnt-hs — container-payment ledger (?q=1,2)
// ────────────────────────────────────────────────────────────────────
// Legacy tabs:
//   ''  ทั้งหมด          (Accounting + QA review)
//   1   รอดำเนินการ      (CSPurchasing-initiated · awaiting approval)
//   2   สำเร็จแล้ว        (historical)
//
// Role landing (per §3 / §4):
//   - interpreter (CSPurchasing) → ?q=1 (their pending initiations)
//   - accounting / qa / super    → show all (review queue)
function cntHsFilter(role: AdminRole): URLSearchParams | null {
  const sp = new URLSearchParams();
  if (role === "interpreter") {
    sp.set("q", "1");
    return sp;
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────
// /admin/customers — customer list
// ────────────────────────────────────────────────────────────────────
// Legacy: sales reps land on THEIR book (tb_users.adminIDSale = self).
// Pacred currently shows everyone the full list. The page's `q` param
// is the keyword search, so we use a distinct key `adminidsale` to set
// the rep filter — page must read it (already exists in the URL space
// via the customer-transfer flow).
//
// For Phase 1 launch we wire a single role:
//   - sales_admin → ?adminidsale=<their legacy_admin_id>
//
// `sales` (Staff tier) intentionally falls through to "no default"
// because they typically work the team book under a sales_admin;
// scoping them to "self-only" would hide team coverage. Manager-tier
// (`sales_admin`) is the one that lands on their book.
//
// Falls back to null when the admin has no `legacy_admin_id` set
// (= Pacred-native admin · no PCS bridge). Better to show all than
// to dump empty filtered list.
function customersFilter(
  role: AdminRole,
  legacyAdminId: string | null,
): URLSearchParams | null {
  if (role !== "sales_admin") return null;
  if (!legacyAdminId) return null;
  const sp = new URLSearchParams();
  sp.set("adminidsale", legacyAdminId);
  return sp;
}

// ────────────────────────────────────────────────────────────────────
// /admin/wallet — balance view (default) vs tx view
// ────────────────────────────────────────────────────────────────────
// Legacy wallet.php had Accounting landing on the pending-slip queue
// (`?page=deposit` with status=1). Pacred made the per-customer
// balance summary the default to match the page's primary use case
// ("PR3963 มียอดเท่าไร?" — Wave 15 P0-1).
//
// For G6 we land Accounting on the pending-topup tx queue so the
// slip-review backlog is visible on open; super/ops land on the
// balance view (default).
function walletFilter(role: AdminRole): URLSearchParams | null {
  if (role !== "accounting") return null;
  const sp = new URLSearchParams();
  sp.set("view", "tx");
  sp.set("status", "1");
  return sp;
}

// ────────────────────────────────────────────────────────────────────
// Helpers — exported for tests + reuse by `actions/admin/*.ts`
// ────────────────────────────────────────────────────────────────────

/**
 * Resolve the "primary" role for filter purposes — same priority
 * order as `lib/admin/dashboards/pick-primary-role.ts` for dashboard
 * variant selection (so a multi-role admin's default queue matches
 * their dashboard variant, not a random other role).
 *
 * Priority (most-focused wins): super > accounting > warehouse >
 * sales_admin > driver > interpreter > qa > sales > ops.
 *
 * Pure (no I/O) — safe to call from a Server Component without
 * dragging in `cache()` indirection.
 */
const FILTER_ROLE_PRIORITY: AdminRole[] = [
  "super",
  "accounting",
  "warehouse",
  "sales_admin",
  "driver",
  "interpreter",
  "qa",
  "sales",
  "ops",
];

export function pickFilterRole(roles: AdminRole[]): AdminRole | null {
  for (const r of FILTER_ROLE_PRIORITY) {
    if (roles.includes(r)) return r;
  }
  // Freight-only admin (no Cargo role): no Cargo-list default.
  return null;
}

/**
 * True when the page has NO incoming filter params we would override.
 * Caller passes the parsed SearchParams keys — if ANY of the "filter"
 * keys we manage is present, we leave the URL alone (= respect user
 * choice). Keys that aren't filters (locale, focus, etc.) don't block
 * the redirect.
 *
 * Per page: the set of keys this helper might set OR the page might
 * already have set by the user. If we add a new role-default key in
 * future, add it here too.
 */
const KEYS_PER_PAGE: Record<FilterablePage, readonly string[]> = {
  "/admin/forwarders":     ["status", "q", "q_multi", "date_from", "date_to", "mode", "create", "all", "service", "container", "segment"],
  "/admin/forwarder-check": ["q"],
  "/admin/cnt-hs":          ["q", "search", "offset"],
  "/admin/customers":       ["q", "type", "group", "segment", "adminidsale"],
  "/admin/wallet":          ["view", "kind", "status", "q"],
};

export function isCleanLanding(
  page: FilterablePage,
  searchParamKeys: Iterable<string>,
): boolean {
  const managed = new Set(KEYS_PER_PAGE[page]);
  for (const k of searchParamKeys) {
    if (k === NOFILTER_PARAM) return false;  // Universal escape hatch
    if (managed.has(k)) return false;
  }
  return true;
}

/**
 * Build the redirect target URL for a page+filter, OR null if no
 * default applies / the user already passed filter params.
 *
 * Combines: clean-landing check + role pick + filter lookup + URL
 * assembly. Returns a path string suitable for `redirect(...)` from
 * `next/navigation`.
 *
 * Usage in a Server Component (admin list page):
 *
 *   const { roles } = await requireAdmin(["..."]);
 *   const sp = await searchParams;
 *   const redirectTo = await buildDefaultLandingRedirect(
 *     "/admin/forwarders",
 *     roles,
 *     sp,
 *     { legacyAdminId: legacyId },  // optional, only needed for /customers
 *   );
 *   if (redirectTo) redirect(redirectTo);
 *
 * Returns null when:
 *   - User already has any managed param in the URL (= explicit choice)
 *   - Role has no default for this page
 *   - `super` (= unfiltered executive view)
 */
export function buildDefaultLandingRedirect(
  page: FilterablePage,
  roles: AdminRole[],
  searchParams: Record<string, unknown>,
  ctx: DefaultFilterContext = {},
): string | null {
  if (!isCleanLanding(page, Object.keys(searchParams))) return null;
  const role = pickFilterRole(roles);
  if (!role) return null;
  const params = getDefaultFilter(page, role, ctx);
  if (!params) return null;
  const qs = params.toString();
  if (!qs) return null;
  return `${page}?${qs}`;
}
