"use server";

/**
 * V-E1.1 · adminSearchCustomers — the search backend for the
 * `<CustomerPicker>` combobox (components/admin/customer-picker.tsx).
 *
 * Surfaces top-N customer profiles matching a free-text query against
 * member_code, first_name, last_name, company_name, phone, email.  Reuses
 * the same `.or()` ilike pattern the customers list page uses
 * (app/[locale]/(admin)/admin/customers/page.tsx L33).
 *
 * Admin-only: requireAdmin([ops, sales_admin, accounting]) — matches the
 * customers-page gate (PII surface).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export interface CustomerPickerRow {
  id: string;                // profile_id UUID — what the picker yields
  member_code: string | null;
  account_type: "personal" | "juristic" | null;
  status: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  phone: string | null;
  email: string | null;
}

export type AdminSearchCustomersResult =
  | { ok: true; data: { rows: CustomerPickerRow[] } }
  | { ok: false; error: string };

const MAX_LIMIT = 20;
const DEFAULT_LIMIT = 10;

export async function adminSearchCustomers(
  input: { q: string; limit?: number },
): Promise<AdminSearchCustomersResult> {
  // Auth gate — same role set as the customers list (a PII surface).
  try {
    await requireAdmin(["ops", "sales_admin", "accounting"]);
  } catch {
    return { ok: false, error: "forbidden" };
  }

  const q = (input.q ?? "").trim();
  if (q.length < 2) {
    // Too short to be useful — return empty (the picker shows a hint).
    return { ok: true, data: { rows: [] } };
  }
  if (q.length > 64) {
    return { ok: false, error: "query_too_long" };
  }

  const limit = Math.min(
    Math.max(1, Math.floor(input.limit ?? DEFAULT_LIMIT)),
    MAX_LIMIT,
  );

  // Escape Postgres ILIKE wildcards a user might type so they cannot
  // craft a pathological pattern. Backslash + % + _ all neutralised.
  const escaped = q.replace(/[\\%_]/g, (m) => "\\" + m);
  const pat = `%${escaped}%`;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select(
      "id, member_code, account_type, status, first_name, last_name, company_name, phone, email",
    )
    // Same OR pattern as the customers list page.
    .or(
      `member_code.ilike.${pat},phone.ilike.${pat},email.ilike.${pat},first_name.ilike.${pat},last_name.ilike.${pat},company_name.ilike.${pat}`,
    )
    // Surface active customers first; the picker is most often used for
    // active ones. Within group, newest first (the just-registered case).
    .order("status", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    data: {
      rows: (data ?? []) as CustomerPickerRow[],
    },
  };
}
