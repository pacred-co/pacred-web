/**
 * V-G5.1 — org_contacts read helper.
 *
 * The V-G5 admin UI (/admin/settings/contacts) lets owners populate
 * `org_contacts` table with email/phone/LINE/social/address rows. This
 * helper is the customer-side read layer.
 *
 * V1 design: pure additive helper. Pages can call this to enrich their
 * hardcoded contact info with DB rows (e.g. "show extra emails grouped
 * by department"). Falls back to empty array on DB error / missing
 * table — caller's hardcoded site.ts constants remain the source of
 * truth until V-G5.1.1 fully migrates each page.
 *
 * Reads ALL rows for a kind via service_role (admin client) to bypass
 * the public-read-active-only RLS — caller is responsible for filtering
 * is_active=true if they want public-visible only.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { OrgContactKind } from "@/lib/validators/org-contact";

export type OrgContactRow = {
  id:             string;
  kind:           OrgContactKind;
  label:          string;
  value:          string;
  department:     string | null;
  is_active:      boolean;
  display_order:  number;
  notes:          string | null;
};

/**
 * Fetch active org contacts for a given kind, ordered by display_order.
 * Returns empty array on any error / missing table.
 *
 * Caller pattern:
 *   const dbEmails = await getOrgContacts("email");
 *   // ...render hardcoded site.ts emails first, then dbEmails appended
 */
export async function getOrgContacts(kind: OrgContactKind): Promise<OrgContactRow[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("org_contacts")
      .select("id, kind, label, value, department, is_active, display_order, notes")
      .eq("kind", kind)
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("label", { ascending: true });
    if (error || !data) return [];
    return data as OrgContactRow[];
  } catch {
    return [];
  }
}

/**
 * Fetch all kinds in one query — useful for the contact-us page that
 * wants everything at once.
 */
export async function getAllOrgContacts(): Promise<Record<OrgContactKind, OrgContactRow[]>> {
  const empty: Record<OrgContactKind, OrgContactRow[]> = {
    domain: [], email: [], line_oa: [], phone: [],
    wechat: [], social: [], address: [],
  };
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("org_contacts")
      .select("id, kind, label, value, department, is_active, display_order, notes")
      .eq("is_active", true)
      .order("kind", { ascending: true })
      .order("display_order", { ascending: true });
    if (error || !data) return empty;
    const grouped = { ...empty };
    for (const row of data as OrgContactRow[]) {
      if (grouped[row.kind]) grouped[row.kind].push(row);
    }
    return grouped;
  } catch {
    return empty;
  }
}
