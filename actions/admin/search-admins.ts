"use server";

/**
 * IC-1 · searchAdminsForMention — the search backend for the @-mention
 * autocomplete in `<WorkItemThread>` (components/admin/work-item-thread.tsx).
 *
 * Surfaces top-N active admin staff matching a free-text query against
 * member_code, first_name, last_name, company_name.  Mirrors
 * actions/admin/search-customers.ts shape; reads `admins` joined to
 * `profiles` and filters `is_active = true`.
 *
 * Admin-only: requireAdmin (any role) — this is a staff-internal surface
 * (any admin can @mention any other admin).  The role gate is "is admin",
 * not a role-list, because the chat thread is org-wide.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export interface AdminPickerRow {
  /** profile_id UUID — the value handed to PostMessageInput.mentionedAdminIds. */
  id:           string;
  /** Joined admins.role (the dept hint shown in the dropdown). */
  role:         string | null;
  member_code:  string | null;
  first_name:   string | null;
  last_name:    string | null;
  display_name: string | null;
}

export type SearchAdminsResult =
  | { ok: true; data: { rows: AdminPickerRow[] } }
  | { ok: false; error: string };

const MAX_LIMIT = 20;
const DEFAULT_LIMIT = 10;

export async function searchAdminsForMention(
  input: { q: string; limit?: number },
): Promise<SearchAdminsResult> {
  // Auth gate — any active admin can @mention any other.
  try {
    await requireAdmin();
  } catch {
    return { ok: false, error: "forbidden" };
  }

  const q = (input.q ?? "").trim();
  if (q.length < 1) {
    // Empty/very-short query: return top active admins (the empty-dropdown
    // case — useful when the user opens @ with no further typing yet).
    return await listTopActiveAdmins(DEFAULT_LIMIT);
  }
  if (q.length > 64) {
    return { ok: false, error: "query_too_long" };
  }

  const limit = Math.min(
    Math.max(1, Math.floor(input.limit ?? DEFAULT_LIMIT)),
    MAX_LIMIT,
  );

  // Escape Postgres ILIKE wildcards so a user cannot craft a pathological
  // pattern.  Backslash + % + _ all neutralised.
  const escaped = q.replace(/[\\%_]/g, (m) => "\\" + m);
  const pat = `%${escaped}%`;

  const admin = createAdminClient();

  // Two-step: 1) admins (gate on is_active) → 2) join profiles by .in() to
  // search the name columns.  Single-shot .or() against the joined columns
  // is awkward in supabase-js — splitting keeps the SQL legible.
  const { data: activeAdmins, error: adminsErr } = await admin
    .from("admins")
    .select("profile_id, role")
    .eq("is_active", true);

  if (adminsErr) {
    return { ok: false, error: adminsErr.message };
  }
  if (!activeAdmins || activeAdmins.length === 0) {
    return { ok: true, data: { rows: [] } };
  }

  const profileIds = activeAdmins.map((a) => a.profile_id as string);
  const roleByPid: Record<string, string> = {};
  for (const a of activeAdmins) roleByPid[a.profile_id as string] = a.role as string;

  const { data: profiles, error: profErr } = await admin
    .from("profiles")
    .select("id, member_code, first_name, last_name, display_name")
    .in("id", profileIds)
    .or(
      `member_code.ilike.${pat},first_name.ilike.${pat},last_name.ilike.${pat},display_name.ilike.${pat}`,
    )
    .order("display_name", { ascending: true, nullsFirst: false })
    .limit(limit);

  if (profErr) {
    return { ok: false, error: profErr.message };
  }

  const rows: AdminPickerRow[] = (profiles ?? []).map((p) => ({
    id:           p.id as string,
    role:         roleByPid[p.id as string] ?? null,
    member_code:  (p.member_code as string | null) ?? null,
    first_name:   (p.first_name as string | null) ?? null,
    last_name:    (p.last_name as string | null) ?? null,
    display_name: (p.display_name as string | null) ?? null,
  }));

  return { ok: true, data: { rows } };
}

/** Convenience for the empty-input case — top N active admins by display_name. */
async function listTopActiveAdmins(limit: number): Promise<SearchAdminsResult> {
  const admin = createAdminClient();
  const { data: activeAdmins, error: adminsErr } = await admin
    .from("admins")
    .select("profile_id, role")
    .eq("is_active", true);

  if (adminsErr) return { ok: false, error: adminsErr.message };
  if (!activeAdmins || activeAdmins.length === 0) {
    return { ok: true, data: { rows: [] } };
  }
  const profileIds = activeAdmins.map((a) => a.profile_id as string);
  const roleByPid: Record<string, string> = {};
  for (const a of activeAdmins) roleByPid[a.profile_id as string] = a.role as string;

  const { data: profiles, error: profErr } = await admin
    .from("profiles")
    .select("id, member_code, first_name, last_name, display_name")
    .in("id", profileIds)
    .order("display_name", { ascending: true, nullsFirst: false })
    .limit(limit);

  if (profErr) return { ok: false, error: profErr.message };

  const rows: AdminPickerRow[] = (profiles ?? []).map((p) => ({
    id:           p.id as string,
    role:         roleByPid[p.id as string] ?? null,
    member_code:  (p.member_code as string | null) ?? null,
    first_name:   (p.first_name as string | null) ?? null,
    last_name:    (p.last_name as string | null) ?? null,
    display_name: (p.display_name as string | null) ?? null,
  }));

  return { ok: true, data: { rows } };
}
