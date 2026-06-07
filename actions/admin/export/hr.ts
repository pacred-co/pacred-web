"use server";

/**
 * Export-all (CSV) for /admin/hr — the HR org listing of active admin users
 * grouped by department.
 *
 * The page (app/[locale]/(admin)/admin/hr/page.tsx) lists every `admins` row
 * with is_active=true, joined to profiles (member_code/name/phone/email) and
 * LEFT-merged with admin_contact_extras (display_name/direct_phone/department/
 * section). It groups the merged rows by department for display. There is NO
 * DB-level pagination and NO user filter beyond is_active=true — the page loads
 * the entire active-admin list at once.
 *
 * This action re-runs that EXACT same two-query merge, unpaginated (capped at
 * EXPORT_CAP), flattens each row to the on-screen columns, sorts by department
 * (mirroring the page's grouped display), and writes an admin_export_log audit
 * row (PII: staff names · phones · emails — owner directive 2026-06-07).
 *
 * DRIFT-FREE: same `.eq("is_active", true)` filter + same profiles join + same
 * admin_contact_extras merge as the page. The CSV columns mirror the page's
 * <thead> 1:1, plus the department column (the page renders department as the
 * section header rather than a cell, so it's surfaced here as its own column).
 *
 * RBAC matches the page: requireAdmin() (any admin role) — the page itself
 * gates with a bare requireAdmin().
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";

// Safety cap for the "export all" path.
const EXPORT_CAP = 10000;

type Profile = {
  member_code: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
};
type Contact = {
  profile_id: string;
  display_name: string | null;
  direct_phone: string | null;
  department: string | null;
  section: string | null;
};
type AdminRaw = {
  profile_id: string;
  role: string;
  is_active: boolean;
  granted_at: string;
  profile: Profile | Profile[] | null;
};

/**
 * Export the entire active-admin HR roster (capped at EXPORT_CAP) as CSV rows
 * for the "⬇ CSV ทั้งหมด" button. Reuses the page's exact filtered query
 * (is_active=true + the profiles join + the admin_contact_extras merge),
 * unpaginated. Writes an admin_export_log audit row.
 */
export async function exportHrAll(): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  // Same gate as the page (bare requireAdmin — any admin role).
  await requireAdmin();

  const admin = createAdminClient();

  // ── Pass 1: active admin rows + profile join (SAME as the page) ──────────
  const { data: adminRows, error: adminRowsErr } = await admin
    .from("admins")
    .select(`
      profile_id, role, is_active, granted_at,
      profile:profiles!profile_id ( member_code, first_name, last_name, phone, email )
    `)
    .eq("is_active", true)
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
  if (adminRowsErr) {
    console.error(`[exportHrAll admins] failed`, {
      code: adminRowsErr.code,
      message: adminRowsErr.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (adminRows ?? []) as unknown as AdminRaw[];
  const truncated = all.length > EXPORT_CAP;
  const adminList = truncated ? all.slice(0, EXPORT_CAP) : all;

  // ── Pass 2: admin_contact_extras for the matched profiles (SAME merge) ───
  const profileIds = [...new Set(adminList.map((r) => r.profile_id))];
  const contactsMap = new Map<string, Contact>();
  if (profileIds.length > 0) {
    const { data: contactsRows, error: contactsErr } = await admin
      .from("admin_contact_extras")
      .select("profile_id, display_name, direct_phone, department, section")
      .in("profile_id", profileIds);
    if (contactsErr) {
      console.error(`[exportHrAll contact_extras] failed`, {
        code: contactsErr.code,
        message: contactsErr.message,
      });
    } else {
      for (const c of (contactsRows ?? []) as unknown as Contact[]) {
        contactsMap.set(c.profile_id, c);
      }
    }
  }

  // Flatten each row → on-screen columns. Sort by department (mirrors the
  // page's grouped-by-department display), then by member_code for stability.
  const rows: CsvRow[] = adminList
    .map((r) => {
      const p = Array.isArray(r.profile) ? r.profile[0] : r.profile;
      const c = contactsMap.get(r.profile_id) ?? null;
      const dept = c?.department ?? "(ไม่ระบุฝ่าย)";
      const grantedDate = r.granted_at ? r.granted_at.slice(0, 10) : "";
      const row: CsvRow = {
        department: dept,
        member_code: p?.member_code ?? "",
        full_name: `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim(),
        phone: p?.phone ?? "",
        email: p?.email ?? "",
        display_name: c?.display_name ?? "",
        direct_phone: c?.direct_phone ?? "",
        section: c?.section ?? "",
        role: r.role,
        granted_at: grantedDate,
      };
      return row;
    })
    .sort((a, b) => {
      const da = String(a.department ?? "");
      const db = String(b.department ?? "");
      if (da !== db) return da.localeCompare(db, "th");
      return String(a.member_code ?? "").localeCompare(String(b.member_code ?? ""), "en");
    });

  await logAdminExport({
    dataset: "hr",
    filters: { is_active: true },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
