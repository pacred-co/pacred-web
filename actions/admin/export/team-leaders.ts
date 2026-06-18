"use server";

/**
 * Export-all (CSV) for /admin/team-leaders — the sales team-leader roster +
 * commission % config (gap-admin H-1).
 *
 * The page (app/[locale]/(admin)/admin/team-leaders/page.tsx) lists every
 * team_leaders row joined to the leader's profile (member_code / name / phone),
 * ordered by created_at DESC, with NO filter and NO pagination — it renders the
 * full list. This action re-runs that EXACT same query unpaginated (capped at
 * EXPORT_CAP) and writes an admin_export_log audit row (PII: leader name+phone ·
 * commission % is sales-money config).
 *
 * DRIFT-FREE: byte-identical select + join + order to the page:
 *   .select("id, team_code, commission_pct, is_active, created_at,
 *            profile:profiles!profile_id ( member_code, first_name, last_name, phone )")
 *   .order("created_at", { ascending: false })
 * The CSV columns mirror the page's <thead> 1:1.
 *
 * RBAC matches the page: super (implicit) + accounting + sales_admin.
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { canViewCostProfit } from "@/lib/admin/money-visibility";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";

// Safety cap for the "export all" path.
const EXPORT_CAP = 10000;

type Profile = {
  member_code: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
};

type LeaderRaw = {
  id: number | string;
  team_code: string | null;
  commission_pct: number | string | null;
  is_active: boolean | null;
  created_at: string | null;
  profile: Profile | Profile[] | null;
};

/**
 * Export the entire team-leader roster as CSV rows for the "⬇ CSV ทั้งหมด"
 * button. Reuses the page's exact query (same select + join + order),
 * unpaginated. Writes an admin_export_log audit row.
 */
export async function exportTeamLeadersAll(): Promise<{
  rows: CsvRow[];
  truncated: boolean;
}> {
  const { roles } = await requireAdmin(["accounting", "sales_admin"]);
  // Commission % = money-internal — omit from the export for non-cost viewers
  // (super + sales_admin included) per owner 2026-06-18.
  const showMoney = canViewCostProfit(roles);

  const admin = createAdminClient();

  const { data: leadersRaw, error } = await admin
    .from("team_leaders")
    .select(
      `
        id, team_code, commission_pct, is_active, created_at,
        profile:profiles!profile_id ( member_code, first_name, last_name, phone )
      `,
    )
    .order("created_at", { ascending: false })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
  if (error) {
    console.error(`[exportTeamLeadersAll team_leaders] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (leadersRaw ?? []) as unknown as LeaderRaw[];
  const truncated = all.length > EXPORT_CAP;
  const leaders = truncated ? all.slice(0, EXPORT_CAP) : all;

  const rows: CsvRow[] = leaders.map((r) => {
    const p = Array.isArray(r.profile) ? r.profile[0] ?? null : r.profile;
    const fullName = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim();
    const pct = Number(r.commission_pct ?? 0);
    return {
      team_code: r.team_code ?? "",
      member_code: p?.member_code ?? "",
      name: fullName,
      phone: p?.phone ?? "",
      ...(showMoney ? { commission_pct: `${(pct * 100).toFixed(2)}%` } : {}),
      status: r.is_active ? "ใช้งาน" : "ปิดใช้งาน",
      created_at: (r.created_at ?? "").slice(0, 10),
    };
  });

  await logAdminExport({
    dataset: "team-leaders",
    filters: {},
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
