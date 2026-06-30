// ════════════════════════════════════════════════════════════════════
// ใบขนพ่วง (#17) — token-scoped PUBLIC access to a declaration's PDFs.
//
// The customer reaches /customs-confirm/[token] from a LINE link (they may not
// have a portal login · owner-confirmed). The confirm page shows the amount
// breakdown inline — but the customer also needs to OPEN the actual prepared
// PDFs (ใบขน / Commercial Invoice / Packing List) before they เฟิมยอด.
//
// The 3 PDF routes (/api/customs-declaration/[id]{,/invoice,/packing-list})
// otherwise require a logged-in user (RLS read) → 401 for the logged-out
// customer reaching via the LINE link. This helper is the ONLY sanctioned way
// to bypass that login requirement, and ONLY when the supplied token proves
// the caller is the holder of THIS declaration's confirm link.
//
// SECURITY (load-bearing — this unlocks a money document over a public URL):
//   • The token must be a valid UUID (format-checked) — no enumeration of ids.
//   • The token must EXACTLY match the target declaration's confirm_token, so a
//     token only ever unlocks ITS OWN declaration's docs — never another id.
//   • The declaration must be an own-name ใบขนพ่วง (issue_in_customer_name=true)
//     that has been SENT to the customer (status ∈ {sent, confirmed}); a draft
//     never sent ('none') or a rejected/cancelled one stays locked.
//   • On ANY failure (bad token / id-mismatch / wrong status / not-own-name /
//     missing) the helper returns null → the caller serves 404 (not 403) so a
//     probe gets no enumeration signal.
//   • It only ever resolves the ONE declaration whose confirm_token matches; it
//     never lets a bare id select a row.
// ════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate a `?token=` against a declaration `id`. Returns `{ id }` of the
 * declaration ONLY when the token proves token-scoped access to that exact
 * declaration (own-name ใบขนพ่วง, sent/confirmed). Returns null otherwise —
 * the caller must then 404.
 *
 * @param admin    a service-role Supabase client (bypasses RLS — that's fine,
 *                 the token IS the authorization here)
 * @param id       the declaration id from the route path
 * @param rawToken the raw `?token=` query value (may be null/empty/garbage)
 */
export async function resolveDeclarationByConfirmToken(
  admin: SupabaseClient,
  id: string,
  rawToken: string | null | undefined,
): Promise<{ id: string } | null> {
  if (!rawToken || !UUID_RE.test(rawToken)) return null;

  const { data, error } = await admin
    .from("customs_declarations")
    .select("id, confirm_token, customer_confirm_status, issue_in_customer_name")
    .eq("confirm_token", rawToken)         // resolve BY token — never by a bare id
    .maybeSingle<{
      id: string;
      confirm_token: string | null;
      customer_confirm_status: string | null;
      issue_in_customer_name: boolean | null;
    }>();
  if (error) {
    console.error("[customs confirm-token access]", { code: error.code, message: error.message });
    return null;
  }
  if (!data) return null;

  // The token must unlock exactly the requested id, and only an own-name decl
  // that has been sent to (or confirmed by) the customer.
  if (data.id !== id) return null;
  if (data.issue_in_customer_name !== true) return null;
  if (data.customer_confirm_status !== "sent" && data.customer_confirm_status !== "confirmed") {
    return null;
  }

  return { id: data.id };
}
