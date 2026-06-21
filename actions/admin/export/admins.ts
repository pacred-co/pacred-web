"use server";

/**
 * Export-all (CSV) for /admin/admins — the admin/staff directory.
 *
 * The page (app/[locale]/(admin)/admin/admins/page.tsx) reads the NEW shape:
 *   admins  JOIN  profiles  JOIN  admin_contact_extras
 * via 3 separate queries + JS merge (the 3 tables FK to profiles, not to each
 * other, so a PostgREST embed fails). It then:
 *   - filters `admins.is_active` by ?s (1=active · 2=inactive · all)
 *   - JS-filters by company (?c → admin_contact_extras.company enum)
 *   - JS-filters by employee_type (?type → admin_contact_extras.employee_type)
 *   - JS-filters by section (?position → free-text section match)
 *   - drops rows with no profile
 *
 * The admin directory is tiny (~15 rows), so the page already loads the full
 * list (no DB pagination). This action re-runs the EXACT same filtered query
 * chain unpaginated (capped at EXPORT_CAP) so the "⬇ CSV ทั้งหมด" button is
 * byte-identical to the on-screen list, then writes an admin_export_log audit
 * row (PII: staff names · emails · phones).
 *
 * RBAC matches the page: requireAdmin() (any admin role — same gate as the page).
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure capturing the active
 * filters.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";

// Safety cap for the "export all filtered" path.
const EXPORT_CAP = 10000;

// ── Label maps — mirror the page's display labels 1:1 ────────────────────────

function nameCompany(c: string | null | undefined): string {
  switch (c) {
    case "pacred-cargo":   return "Pacred Cargo";
    case "pacred-freight": return "Pacred Freight";
    case "pacred":         return "Pacred";
    default:               return "";
  }
}

function nameEmployeeType(t: string | null | undefined): string {
  switch (t) {
    case "full_time": return "พนักงานประจำ";
    case "probation": return "ทดลองงาน";
    case "intern":    return "เด็กฝึกงาน/สหกิจ";
    case "partner":   return "พาสเนอร์";
    case "contract":  return "สัญญาจ้าง";
    case "daily":     return "รายวัน";
    default:          return "";
  }
}

function nameRole(role: string): string {
  switch (role) {
    case "ultra":       return "Ultra Admin Z";
    case "super":       return "Super Admin";
    case "manager":     return "Cargo Manager";
    case "ops":         return "Ops";
    case "accounting":  return "Accounting";
    case "pricing":     return "Pricing";
    case "sales_admin": return "Sales Mgr (Cargo)";
    case "sales":       return "Sales (Cargo)";
    case "qa":          return "QA / QC";
    case "warehouse":   return "Warehouse";
    case "driver":      return "Driver";
    case "interpreter": return "ล่ามจีน";
    default:            return role.replace(/_/g, " ");
  }
}

// ── Filter param → enum mapping (identical to the page) ──────────────────────

function typeParamToEmployeeTypes(t: string | undefined): string[] | null {
  switch (t) {
    case "1":     return ["full_time"];
    case "2":     return ["probation"];
    case "3and4": return ["intern"];
    case "3":     return ["intern"];
    case "4":     return ["intern"];
    case "5":     return ["partner"];
    case "6":     return ["contract"];
    case "7":     return ["partner"];
    default:      return null;
  }
}

function companyParamToEnum(c: string | undefined): string | null {
  switch (c) {
    case "1": return "pacred-cargo";
    case "2": return "pacred-freight";
    case "3": return "pacred";
    default:  return null;
  }
}

/** Active filters the page passes through. */
export type AdminsExportFilter = {
  /** Status tab: "1" (active) · "2" (inactive) · "all" · undefined (default = all). */
  s?: string;
  /** Company filter param (1|2|3). */
  c?: string;
  /** Employee-type filter param. */
  type?: string;
  /** Section free-text filter. */
  position?: string;
};

type AdminGrant = {
  profile_id: string;
  role: string;
  is_active: boolean;
  granted_at: string | null;
  granted_by: string | null;
};

/**
 * Export the entire filtered admin directory (capped at EXPORT_CAP) as CSV rows
 * for the "⬇ CSV ทั้งหมด" button. Re-runs the page's exact filter chain
 * unpaginated, then writes an admin_export_log audit row.
 */
export async function exportAdminsAll(
  filter: AdminsExportFilter,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  // Same gate as the page (any admin role).
  await requireAdmin();

  const admin = createAdminClient();

  // ── Query 1 — ALL admin role grants (dedupe to one row per PERSON below,
  //    byte-identical to the page · per-PERSON status filter applied after the
  //    merge). granted_at desc so the most-recent active grant is the effective
  //    role picked at dedupe. ─────────────────────────────────────────────────
  const adminQ = admin
    .from("admins")
    .select("profile_id, role, is_active, granted_at, granted_by")
    .order("granted_at", { ascending: false, nullsFirst: false })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows

  const { data: grantsRaw, error: grantsErr } = await adminQ;
  if (grantsErr) {
    console.error("[exportAdminsAll admins] failed", {
      code: grantsErr.code,
      message: grantsErr.message,
    });
    return { rows: [], truncated: false };
  }

  const allGrants = (grantsRaw ?? []) as unknown as AdminGrant[];
  const truncated = allGrants.length > EXPORT_CAP;
  const adminGrants = truncated ? allGrants.slice(0, EXPORT_CAP) : allGrants;

  const profileIds = [...new Set(adminGrants.map((r) => r.profile_id))];

  // Filter inputs (same resolution as the page).
  const companyEnum = companyParamToEnum(filter.c);
  const typeEnums = typeParamToEmployeeTypes(filter.type);

  // ── Query 2 + 3 — profiles + extras (parallel) ─────────────────────────────
  const [profilesRes, extrasRes] = profileIds.length === 0
    ? [{ data: [], error: null }, { data: [], error: null }] as const
    : await Promise.all([
        admin.from("profiles")
          .select(
            "id, member_code, first_name, last_name, email, phone, employee_code, is_active",
          )
          .in("id", profileIds),
        admin.from("admin_contact_extras")
          .select(
            "profile_id, nickname, display_name, direct_phone, company, employee_type, " +
            "department, section, work_email, work_phone, suspended_at, ended_at",
          )
          .in("profile_id", profileIds),
      ]);

  if (profilesRes.error) {
    console.error("[exportAdminsAll profiles] failed", profilesRes.error.message);
    return { rows: [], truncated: false };
  }
  if (extrasRes.error) {
    console.error("[exportAdminsAll admin_contact_extras] failed", extrasRes.error.message);
    return { rows: [], truncated: false };
  }

  const profilesArr = (profilesRes.data ?? []) as unknown as Array<
    { id: string } & Record<string, unknown>
  >;
  const extrasArr = (extrasRes.data ?? []) as unknown as Array<
    { profile_id: string } & Record<string, unknown>
  >;
  const profilesMap = new Map(profilesArr.map((p) => [p.id, p]));
  const extrasMap = new Map(extrasArr.map((e) => [e.profile_id, e]));

  type Merged = {
    grant: AdminGrant;
    profile: Record<string, unknown> | null;
    extras: Record<string, unknown> | null;
  };

  let merged: Merged[] = adminGrants.map((g) => ({
    grant: g,
    profile: profilesMap.get(g.profile_id) ?? null,
    extras: extrasMap.get(g.profile_id) ?? null,
  }));

  // JS post-filters — byte-identical to the page.
  if (companyEnum) {
    merged = merged.filter((r) => (r.extras?.company as string | undefined) === companyEnum);
  }
  if (typeEnums && typeEnums.length > 0) {
    merged = merged.filter((r) => {
      const et = r.extras?.employee_type as string | null | undefined;
      return et != null && typeEnums.includes(et);
    });
  }
  if (filter.position) {
    const needle = filter.position.toLowerCase();
    merged = merged.filter((r) =>
      (r.extras?.section as string | undefined)?.toLowerCase().includes(needle) ?? false,
    );
  }

  // Drop rows with no profile (the stale-identity exclusion happens per-PERSON
  // below — profiles.is_active=false alone is NOT a reliable retired signal).
  merged = merged.filter((r) => r.profile !== null);

  // ── DEDUPE to ONE row per PERSON (byte-identical to the page) ───────────────
  // A person holds several (profile_id, role) grants; collapse to one — effective
  // grant = most-recent active (merged is granted_at desc), else most-recent; the
  // person is "active" iff any grant is active.
  const anyActive = new Map<string, boolean>();
  const effective = new Map<string, Merged>();
  for (const m of merged) {
    const pid = m.grant.profile_id;
    anyActive.set(pid, (anyActive.get(pid) ?? false) || m.grant.is_active);
    const cur = effective.get(pid);
    if (!cur) { effective.set(pid, m); continue; }
    if (!cur.grant.is_active && m.grant.is_active) effective.set(pid, m);
  }
  let people: Merged[] = [...effective.values()].map((m) => ({
    ...m,
    grant: { ...m.grant, is_active: anyActive.get(m.grant.profile_id) ?? m.grant.is_active },
  }));

  // Hide ONLY truly-stale identities: no active grant AND profiles.is_active=false
  // (e.g. the old dup PR034). A real admin with is_active=false but an active grant
  // (ก๊อต) stays; a genuinely-resigned staffer keeps is_active=true. (matches the page)
  people = people.filter(
    (m) => !(m.grant.is_active === false && (m.profile as { is_active?: boolean } | null)?.is_active === false),
  );

  // Person status filter — two buckets (matches the page's 2 tabs).
  const isResigned = (m: Merged) => !!m.extras?.ended_at || !m.grant.is_active;
  if (filter.s === "2")      people = people.filter((m) => isResigned(m));
  else if (filter.s === "1") people = people.filter((m) => !isResigned(m));
  // (no `s` → all people · matches the page's default-active is handled by the UI)

  // ── Map to CSV rows — columns mirror the <thead> 1:1 ───────────────────────
  const rows: CsvRow[] = people.map(({ grant, profile, extras }) => {
    const p = profile ?? {};
    const x = extras ?? {};
    const firstName = (p.first_name as string | null) ?? "";
    const lastName = (p.last_name as string | null) ?? "";
    const fullName = [firstName, lastName].filter(Boolean).join(" ") || "(ยังไม่มีชื่อ)";
    const nickname = (x.nickname as string | null) ?? (x.display_name as string | null) ?? "";
    const memberCode = (p.member_code as string | null) ?? "—";
    const legacyAdminId = x.legacy_admin_id as string | null | undefined;
    const email = p.email as string | null | undefined;
    const emailUser = email && email.endsWith("@pacred.co.th") ? email.split("@")[0] : null;
    const idCodeDisplay = legacyAdminId ?? emailUser ?? memberCode;

    const department = (x.department as string | null) ?? "";
    const section = (x.section as string | null) ?? "";
    const deptSection = [department, section].filter(Boolean).join(" / ");

    const personalEmail = (p.email as string | null) ?? "";
    const personalPhone = (p.phone as string | null) ?? (x.direct_phone as string | null) ?? "";
    const workEmail = (x.work_email as string | null) ?? "";
    const workPhone = (x.work_phone as string | null) ?? "";

    const isEnded = !!x.ended_at;
    const isSuspended = !!x.suspended_at;
    const isInactive = !grant.is_active;
    const statusLabel = isEnded
      ? "ลาออกแล้ว"
      : isSuspended
        ? "พักงานชั่วคราว"
        : isInactive
          ? "ปิดสิทธิ์"
          : "ทำงานอยู่";

    return {
      granted_at: grant.granted_at ? grant.granted_at.slice(0, 16).replace("T", " ") : "-",
      id_code: idCodeDisplay,
      employee_code: (p.employee_code as string | null) ?? "—",
      name: fullName,
      nickname: nickname || "-",
      role: nameRole(grant.role),
      company: nameCompany(x.company as string | null),
      type: nameEmployeeType(x.employee_type as string | null),
      dept_section: deptSection || "-",
      personal_email: personalEmail || "-",
      personal_phone: personalPhone || "-",
      work_email: workEmail || "-",
      work_phone: workPhone || "-",
      status: statusLabel,
    };
  });

  await logAdminExport({
    dataset: "admins",
    filters: {
      s: filter.s ?? null,
      c: filter.c ?? null,
      type: filter.type ?? null,
      position: filter.position ?? null,
    },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
