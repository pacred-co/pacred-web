/**
 * resolve-active-rep — DISPLAY-time fallback for a RETIRED sales rep.
 *
 * A customer's assigned sales rep is stored in `tb_users.adminIDSale` (a legacy
 * `tb_admin.adminID`, keyed by login-id). When that rep RETIRES
 * (`tb_admin.adminStatusA='0'`, or the sales flag `adminStatusSale='0'`), the
 * customer must NOT keep seeing the retired person on their screens — the rep
 * should DISPLAY as the central sales line (ทีมขายส่วนกลาง · Pacred). This
 * helper decides which rep to DISPLAY.
 *
 * DISPLAY / RESOLUTION ONLY — the stored `adminIDSale` is NEVER rewritten here
 * (a real reassign is a separate deliberate action). The fallback fires ONLY
 * when the assigned rep is retired/inactive or empty; an active rep is returned
 * unchanged (zero change for active reps). Touches NO money / status /
 * commission (commission accrues on the stored `adminIDSale`, untouched).
 *
 * Owner directive 2026-07-09: a retired rep hands off to the CENTRAL sales line
 * everywhere (front + back). This supersedes the earlier 2026-07-02 "hand off
 * to the first still-active rep" substitute (sales-rep-contact.ts, now aligned
 * to this central rule so all rep-display surfaces agree).
 *
 * Front + back share this ONE helper so the fallback never drifts between
 * surfaces (customer sidebar / profile / dashboard / invoice + the admin
 * customer detail).
 *
 * The ACTIVE set = `tb_admin` WHERE adminStatusA='1' AND adminStatusSale='1'
 * (the SAME source `listSalesAdmins` / `getActiveSalesReps` use — so a legacy
 * `adminIDSale` id lines up).
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { CENTRAL_SALES_ADMIN_ID } from "./sales-rep-central";

/** Display label for the central sales line (shown when a retired rep falls
 *  back). Fuller cards render this; the compact sidebar keeps "ส่วนกลาง". */
export const CENTRAL_SALES_LABEL = "ทีมขายส่วนกลาง (Pacred)";
/** Compact central display name (sidebar / badge). */
export const CENTRAL_SALES_NICKNAME = "ส่วนกลาง";
/** Central sales phone line (02-421-3325) — not a personal rep. */
export const CENTRAL_SALES_TEL = "02-421-3325";

const SCOPE = "resolve-active-rep";

export type ResolvedSalesRep = {
  /** adminID to DISPLAY — the assigned rep if active, else the central line. */
  adminID: string;
  /** True when the assigned rep was retired/empty → central line substituted. */
  isCentral: boolean;
  /** Display label — "" for an active assigned rep (the caller renders the
   *  rep's real name), `CENTRAL_SALES_LABEL` when central. */
  label: string;
};

/**
 * Pure resolution: given the customer's assigned rep id + the set of ACTIVE
 * sales-rep adminIDs, return the rep to DISPLAY. An active assigned rep →
 * itself; a retired / unknown / empty rep → the central sales line.
 *
 * Pure (no I/O) so it's trivially unit-testable and can be reused on any
 * surface that already has the active set in hand (e.g. the admin customer
 * detail, which loads the active sales admins for its picker).
 */
export function resolveActiveSalesRep(
  adminIDSale: string | null | undefined,
  opts: { activeIds: ReadonlySet<string> },
): ResolvedSalesRep {
  const id = adminIDSale?.trim();
  if (id && opts.activeIds.has(id)) {
    return { adminID: id, isCentral: false, label: "" };
  }
  return {
    adminID: CENTRAL_SALES_ADMIN_ID,
    isCentral: true,
    label: CENTRAL_SALES_LABEL,
  };
}

/**
 * Server helper — load the ACTIVE sales-rep adminID set once
 * (`tb_admin` WHERE adminStatusA='1' AND adminStatusSale='1'). Same source as
 * `listSalesAdmins` / `getActiveSalesReps`. Returns an EMPTY set on error
 * (never throws) so a caller degrades gracefully — pair it with a per-surface
 * guard when "everything → central on a transient read error" would be worse
 * than showing the stored rep.
 */
export async function loadActiveSalesRepIds(): Promise<Set<string>> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_admin")
    .select("adminID")
    .eq("adminStatusA", "1")
    .eq("adminStatusSale", "1")
    .limit(1000);
  if (error) {
    logger.warn(SCOPE, "active sales-rep id set lookup failed", {
      reason: error.message,
    });
    return new Set<string>();
  }
  const set = new Set<string>();
  for (const r of (data ?? []) as { adminID: string | null }[]) {
    const id = r.adminID?.trim();
    if (id) set.add(id);
  }
  return set;
}
