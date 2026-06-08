"use server";

/**
 * Customer tags (CRM depth · 2026-06-08).
 *
 * A genuinely-missing CRM primitive: sales/CS tag a customer with arbitrary
 * labels (a starter vocab AXELRA/big-PCS/VIP/เคลียร์/แอร์ + any free-text).
 * Doubles as the AXELRA-vs-PCS lead-source marker the gap analysis flagged
 * (legacy has no per-customer source field).
 *
 * Backed by `customer_tag` (migration 0154 · 1 isolated table · NO FK to tb_* ·
 * RLS service-role-only · mirror 0133/0141). Keyed by `userid` = tb_users.userID
 * (the PR code).
 *
 * Surfaced via <TagChips userid=...> on /admin/leads rows, the /admin/crm
 * customer-360 panel, and /admin/customers/[id].
 *
 * RBAC: super/sales_admin/sales/ops so reps self-serve (same staff who work
 * the call-queue). Reads/writes use createAdminClient (RLS-bypass · server-only)
 * via withAdmin; the (admin) layout + requireAdmin gate auth/PII.
 *
 * §0c (AGENTS.md): EVERY supabase query destructures `{ data, error }`.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, type AdminActionResult } from "./common";
import { getAdminLegacyId } from "@/lib/admin/default-queue-filter-server";
import type { CustomerTag } from "./customer-tags-types";

// The staff who self-serve tags (mirror /admin/leads RBAC + accounting, since
// the customer-detail page where <TagChips> renders gates ops/sales_admin/
// accounting — an accounting admin must be able to read/write tags there too).
const ROLES = ["super", "sales_admin", "sales", "ops", "accounting"] as const;

const MAX_TAG_LEN = 40;

function normUserid(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase();
}

/** Normalise a tag: trim + collapse inner whitespace + cap length. */
function normTag(raw: string | null | undefined): string {
  return (raw ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_TAG_LEN);
}

/** All tags for one customer (newest-first). */
export async function getTags(
  userid: string,
): Promise<AdminActionResult<CustomerTag[]>> {
  const uid = normUserid(userid);
  if (!uid) return { ok: false, error: "missing_userid" };

  return withAdmin([...ROLES], async () => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("customer_tag")
      .select("id, userid, tag, created_by, created_at")
      .eq("userid", uid)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[customer_tag getTags] failed", { code: error.code, message: error.message, userid: uid });
      return { ok: false, error: `query_failed: ${error.message}` };
    }
    return { ok: true, data: (data ?? []) as unknown as CustomerTag[] };
  });
}

/**
 * Bulk tag lookup for a list of customers (the /admin/leads list). Returns a
 * map userid → tag-string[] so the table can render chips per row in one query.
 * Empty input → empty map (no query).
 */
export async function getTagsBulk(
  userids: string[],
): Promise<AdminActionResult<Record<string, string[]>>> {
  const ids = Array.from(
    new Set((userids ?? []).map(normUserid).filter(Boolean)),
  );
  if (ids.length === 0) return { ok: true, data: {} };

  return withAdmin([...ROLES], async () => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("customer_tag")
      .select("userid, tag, created_at")
      .in("userid", ids)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[customer_tag getTagsBulk] failed", { code: error.code, message: error.message });
      return { ok: false, error: `query_failed: ${error.message}` };
    }
    const map: Record<string, string[]> = {};
    for (const r of (data ?? []) as { userid: string; tag: string }[]) {
      const uid = (r.userid ?? "").trim();
      if (!uid) continue;
      (map[uid] ??= []).push(r.tag);
    }
    return { ok: true, data: map };
  });
}

/**
 * Add a tag to a customer. Idempotent — the unique(userid, tag) index makes a
 * duplicate add a no-op (we upsert with ignoreDuplicates). Returns the full
 * refreshed tag list so the client can re-render without a round-trip.
 */
export async function addTag(
  userid: string,
  tag: string,
): Promise<AdminActionResult<CustomerTag[]>> {
  const uid = normUserid(userid);
  const t = normTag(tag);
  if (!uid) return { ok: false, error: "missing_userid" };
  if (!t) return { ok: false, error: "missing_tag" };

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();
    const createdBy = (await getAdminLegacyId(adminId)) ?? adminId;

    // Upsert — duplicate (userid, tag) is ignored (idempotent add).
    const { error: insErr } = await admin
      .from("customer_tag")
      .upsert({ userid: uid, tag: t, created_by: createdBy }, { onConflict: "userid,tag", ignoreDuplicates: true });
    if (insErr) {
      console.error("[customer_tag addTag] failed", { code: insErr.code, message: insErr.message, userid: uid });
      return { ok: false, error: `insert_failed: ${insErr.message}` };
    }

    // Return the refreshed list.
    const { data, error: readErr } = await admin
      .from("customer_tag")
      .select("id, userid, tag, created_by, created_at")
      .eq("userid", uid)
      .order("created_at", { ascending: false });
    if (readErr) {
      console.error("[customer_tag addTag re-read] failed", { code: readErr.code, message: readErr.message });
      // The write succeeded — degrade to ok with no list rather than failing.
      return { ok: true, data: [] };
    }

    revalidatePath("/admin/crm");
    revalidatePath("/admin/leads");
    revalidatePath(`/admin/customers/${uid}`);
    return { ok: true, data: (data ?? []) as unknown as CustomerTag[] };
  });
}

/**
 * Remove a tag from a customer. Returns the refreshed list. Removing a tag that
 * isn't present is a harmless no-op.
 */
export async function removeTag(
  userid: string,
  tag: string,
): Promise<AdminActionResult<CustomerTag[]>> {
  const uid = normUserid(userid);
  const t = normTag(tag);
  if (!uid) return { ok: false, error: "missing_userid" };
  if (!t) return { ok: false, error: "missing_tag" };

  return withAdmin([...ROLES], async () => {
    const admin = createAdminClient();
    const { error: delErr } = await admin
      .from("customer_tag")
      .delete()
      .eq("userid", uid)
      .eq("tag", t);
    if (delErr) {
      console.error("[customer_tag removeTag] failed", { code: delErr.code, message: delErr.message, userid: uid });
      return { ok: false, error: `delete_failed: ${delErr.message}` };
    }

    const { data, error: readErr } = await admin
      .from("customer_tag")
      .select("id, userid, tag, created_by, created_at")
      .eq("userid", uid)
      .order("created_at", { ascending: false });
    if (readErr) {
      console.error("[customer_tag removeTag re-read] failed", { code: readErr.code, message: readErr.message });
      return { ok: true, data: [] };
    }

    revalidatePath("/admin/crm");
    revalidatePath("/admin/leads");
    revalidatePath(`/admin/customers/${uid}`);
    return { ok: true, data: (data ?? []) as unknown as CustomerTag[] };
  });
}
