"use server";

/**
 * Export-all (CSV) for /admin/hr/org-table — the Pacred org-chart-as-a-table
 * (one row per org POSITION, with branch/section context, quota vs filled per
 * kind, and the list of current holders).
 *
 * The page (app/[locale]/(admin)/admin/hr/org-table/page.tsx) loads the FULL
 * org tree with no filters and no pagination:
 *   org_branches   ORDER BY sort_order
 *   org_sections   ORDER BY sort_order
 *   org_positions  ORDER BY sort_order
 *   org_assignments WHERE ended_at IS NULL  (+ profiles join for the holder name)
 * then renders one <tr> per position. This action re-runs those EXACT four
 * queries unpaginated (capped at EXPORT_CAP) and emits one CSV row per position,
 * mirroring the page's <thead> columns 1:1, then writes an admin_export_log
 * audit row (owner directive 2026-06-07).
 *
 * DRIFT-FREE: identical queries / ordering / active-assignment filter / kind
 * tallies as the page. The page has no filters, so there are no filter args.
 *
 * RBAC matches the page: requireAdmin() (any admin role).
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";

const EXPORT_CAP = 10000;

type Branch = { id: string; name: string; color_tone: string };
type Section = { id: string; branch_id: string; name: string };
type Position = {
  id: string;
  section_id: string;
  slug: string;
  name: string;
  quota_employee: number;
  quota_internship: number;
  quota_partner: number;
};
type ProfileLite = {
  member_code: string | null;
  first_name: string | null;
  last_name: string | null;
};
type Assignment = {
  position_id: string;
  kind: "employee" | "internship" | "partner";
  profile: ProfileLite | ProfileLite[] | null;
};

/** Flatten the holder list into one cell mirroring the page's "ผู้นั่งตำแหน่งปัจจุบัน". */
function holderText(fills: Array<{ profile: ProfileLite | null; kind: string }>): string {
  if (fills.length === 0) return "— ยังไม่มีคน —";
  return fills
    .map((a) => {
      const code = a.profile?.member_code ?? "—";
      const name = `${a.profile?.first_name ?? ""} ${a.profile?.last_name ?? ""}`.trim();
      return `${code} ${name} (${a.kind})`.trim();
    })
    .join(" · ");
}

/**
 * Export the entire org table (one row per position) as CSV rows for the
 * "⬇ CSV ทั้งหมด" button. Re-runs the page's exact queries, unpaginated.
 * Writes an admin_export_log audit row.
 */
export async function exportHrOrgTableAll(): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  await requireAdmin();
  const admin = createAdminClient();

  const [branchesRes, sectionsRes, positionsRes, assignmentsRes] = await Promise.all([
    admin.from("org_branches").select("id, name, color_tone").order("sort_order").range(0, EXPORT_CAP),
    admin.from("org_sections").select("id, branch_id, name").order("sort_order").range(0, EXPORT_CAP),
    admin
      .from("org_positions")
      .select("id, section_id, slug, name, quota_employee, quota_internship, quota_partner")
      .order("sort_order")
      .range(0, EXPORT_CAP),
    admin
      .from("org_assignments")
      .select(`position_id, kind, profile:profiles!profile_id ( member_code, first_name, last_name )`)
      .is("ended_at", null)
      .range(0, EXPORT_CAP),
  ]);

  if (branchesRes.error) console.error("[exportHrOrgTableAll org_branches]", branchesRes.error.message);
  if (sectionsRes.error) console.error("[exportHrOrgTableAll org_sections]", sectionsRes.error.message);
  if (positionsRes.error) console.error("[exportHrOrgTableAll org_positions]", positionsRes.error.message);
  if (assignmentsRes.error) console.error("[exportHrOrgTableAll org_assignments]", assignmentsRes.error.message);

  const branches = (branchesRes.data ?? []) as unknown as Branch[];
  const sections = (sectionsRes.data ?? []) as unknown as Section[];
  const positions = (positionsRes.data ?? []) as unknown as Position[];
  const assignments = ((assignmentsRes.data ?? []) as unknown as Assignment[]).map((a) => ({
    position_id: a.position_id,
    kind: a.kind,
    profile: Array.isArray(a.profile) ? (a.profile[0] ?? null) : a.profile,
  }));

  const branchById = new Map(branches.map((b) => [b.id, b]));
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const fillsByPosition = new Map<string, Array<{ profile: ProfileLite | null; kind: string }>>();
  for (const a of assignments) {
    if (!fillsByPosition.has(a.position_id)) fillsByPosition.set(a.position_id, []);
    fillsByPosition.get(a.position_id)!.push({ profile: a.profile, kind: a.kind });
  }

  const truncated = positions.length > EXPORT_CAP;
  const capped = truncated ? positions.slice(0, EXPORT_CAP) : positions;

  const rows: CsvRow[] = capped.map((p) => {
    const sec = sectionById.get(p.section_id);
    const br = sec ? branchById.get(sec.branch_id) : undefined;
    const fills = fillsByPosition.get(p.id) ?? [];
    const e = fills.filter((a) => a.kind === "employee").length;
    const i = fills.filter((a) => a.kind === "internship").length;
    const pa = fills.filter((a) => a.kind === "partner").length;
    return {
      branch: br?.name ?? "—",
      section: sec?.name ?? "—",
      position: p.name,
      slug: p.slug,
      employee: `${e} / ${p.quota_employee}`,
      internship: `${i} / ${p.quota_internship}`,
      partner: `${pa} / ${p.quota_partner}`,
      holders: holderText(fills),
    } satisfies CsvRow;
  });

  await logAdminExport({
    dataset: "hr-org-table",
    filters: {},
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
