"use server";

/**
 * V-E1.1 · adminSearchCustomers — the search backend for the
 * `<CustomerPicker>` combobox (components/admin/customer-picker.tsx).
 *
 * Surfaces top-N customers matching a free-text query against the legacy
 * member code (`userid`), name (`username` / `userlastname`), and phone
 * (`usertel`).
 *
 * D1 Wave-2 (_SYNTHESIS §7.1 / §7.4): re-pointed from the rebuilt-era
 * `profiles` table (~3 rows) to the migrated legacy `tb_users` table
 * (~8,898 PCS customers). The `CustomerPickerRow` shape is preserved so
 * the picker component + its consumers compile unchanged — `id` now
 * carries the legacy `userid` (the `PR<n>` member code, the legacy
 * identity), `account_type` is derived from `usercompany`, `status`
 * from the `useractive` / `userstatus` flags.
 *
 * Admin-only: requireAdmin([ops, sales_admin, accounting]) — matches the
 * customers-page gate (PII surface).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export interface CustomerPickerRow {
  ID: string;                // legacy `userid` (PR<n> member code) — what the picker yields
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

/** Legacy `tb_users` row shape — the subset this search reads. */
interface LegacyUserRow {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userCompany: string | null;
  userTel: string | null;
  userEmail: string | null;
  userActive: string | null;
  userStatus: string | null;
}

/** Derive the rebuilt-era status string from the legacy flags.
 *  P1-17 (ADR-0019 D-C transitional): migrated pending = '', native pending = '0'.
 *  Until เดฟ P1-16 flips register-write '0'→'', BOTH count as incomplete. */
function deriveStatus(u: LegacyUserRow): string {
  if (u.userStatus === "0") return "suspended";
  if (u.userActive === "0" || u.userActive === "") return "incomplete";
  return "active";
}

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

  // Escape Postgres ILIKE wildcards (+ the `,` that delimits .or() terms)
  // a user might type so they cannot craft a pathological pattern.
  const escaped = q.replace(/[\\%_,]/g, (m) => "\\" + m);
  const pat = `%${escaped}%`;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_users")
    .select(
      "userID, userName, userLastName, userCompany, userTel, userEmail, userActive, userStatus",
    )
    // Search the legacy member code (userID), name, and phone columns.
    .or(
      `userID.ilike.${pat},userTel.ilike.${pat},userEmail.ilike.${pat},userName.ilike.${pat},userLastName.ilike.${pat}`,
    )
    // Newest registrations first (the just-registered case is the most
    // common picker use). tb_users has no equivalent of profiles.status
    // ordering, so a single sort key on the registration timestamp.
    .order("userRegistered", { ascending: false })
    .limit(limit);

  if (error) {
    return { ok: false, error: error.message };
  }

  const rows: CustomerPickerRow[] = ((data ?? []) as unknown as LegacyUserRow[]).map((u) => ({
    ID:           u.userID,
    member_code:  u.userID,
    account_type: u.userCompany === "1" ? "juristic" : "personal",
    status:       deriveStatus(u),
    first_name:   u.userName,
    last_name:    u.userLastName,
    // Legacy tb_users has no company-name column on the user row — the
    // juristic name lives in a separate corporate table not in scope
    // here; the picker falls back to first/last name when this is null.
    company_name: null,
    phone:        u.userTel,
    email:        u.userEmail,
  }));

  return {
    ok: true,
    data: { rows },
  };
}
