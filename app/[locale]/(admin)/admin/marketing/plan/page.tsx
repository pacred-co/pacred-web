import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadMarketing } from "@/actions/admin/marketing-planner";
import { PageHeader } from "@/components/admin/page-header";
import { MarketingPlannerApp } from "@/components/marketing-planner/marketing-planner-app";
import type { PlannerUser } from "@/lib/marketing-planner/types";

// Auth-gated + reads the live staff list → force-dynamic (AGENTS §11).
export const dynamic = "force-dynamic";

/**
 * /admin/marketing/plan — "แผนการตลาด" = Content Marketing Planner (ปอน 2026-07-01).
 *
 * Full-loop content planning (strategy → plan → calendar → kanban → library →
 * measure). Plan/content/settings persist to localStorage (prototype, swap-DB-
 * ready via lib/marketing-planner/store.ts). Owners/team come from the REAL admin
 * accounts (queried below) — not an editable dropdown.
 */
async function loadStaff(): Promise<PlannerUser[]> {
  const admin = createAdminClient();
  const { data: grants, error } = await admin
    .from("admins")
    .select("profile_id, role, is_active")
    .eq("is_active", true);
  if (error) {
    console.error("[marketing/plan] staff load failed", { message: error.message });
    return [];
  }
  const ids = [...new Set((grants ?? []).map((g) => g.profile_id).filter((x): x is string => !!x))];
  if (!ids.length) return [];

  const [{ data: profs, error: pErr }, { data: extras }] = await Promise.all([
    admin.from("profiles").select("id, first_name, last_name, member_code, avatar_url").in("id", ids),
    admin.from("admin_contact_extras").select("profile_id, nickname, display_name").in("profile_id", ids),
  ]);
  if (pErr) {
    console.error("[marketing/plan] profiles load failed", { message: pErr.message });
    return [];
  }

  const roleByProfile = new Map<string, string>();
  for (const g of grants ?? []) if (g.profile_id && !roleByProfile.has(g.profile_id)) roleByProfile.set(g.profile_id, g.role);
  const extraByProfile = new Map((extras ?? []).map((e) => [e.profile_id, e]));

  return (profs ?? [])
    .map((p): PlannerUser => {
      const x = extraByProfile.get(p.id);
      const name = x?.nickname || x?.display_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || p.member_code || "(ไม่มีชื่อ)";
      return { id: p.id, name, role: roleByProfile.get(p.id), avatarUrl: p.avatar_url };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "th"));
}

export default async function MarketingPlanPage() {
  const { user } = await requireAdmin(["super", "ultra", "manager", "sales_admin", "sales", "ops"]);
  const [users, initial] = await Promise.all([loadStaff(), loadMarketing()]);

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-5">
      <PageHeader
        eyebrow="ADMIN · MARKETING"
        title="แผนการตลาด"
        subtitle="วางแผนคอนเทนต์ครบลูป — ตั้งค่า · วางแผน · ปฏิทิน · ทำงาน · แปะลิงก์ · วัดผล · สรุปผล"
      />
      <MarketingPlannerApp users={users} currentUserId={user.id} initial={initial} />
    </main>
  );
}
