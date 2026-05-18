import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { TosVersionsManager, type TosVersionRow } from "./tos-versions-manager";

/**
 * /admin/settings/tos-versions — V-G4.
 *
 * Super-only admin UI for creating + activating TOS versions.
 *
 * V-G4.1 ✅ — the customer-side gate (/(protected)/layout.tsx →
 * getActiveTosVersion) now reads the active row from this table.  An
 * `is_active` flip + a populated body_md goes live immediately at the
 * next protected-route render.  The lib/tos.ts CURRENT_TOS_VERSION
 * constant remains as a defensive fallback for DB-unreachable cases.
 */

export const dynamic = "force-dynamic";

type AcceptanceCount = { tos_version_id: string; count: number };

export default async function AdminTosVersionsPage() {
  await requireAdmin(["super"]);
  const admin = createAdminClient();

  const { data: versionsRaw } = await admin
    .from("tos_versions")
    .select("id, version_no, title, body_md, effective_from, applies_to, is_active, created_at, updated_at")
    .order("effective_from", { ascending: false });
  const versions = (versionsRaw ?? []) as TosVersionRow[];

  // Per-version acceptance counts (single aggregate query).
  const counts: Record<string, number> = {};
  if (versions.length > 0) {
    const ids = versions.map((v) => v.id);
    // Supabase doesn't support GROUP BY in select() — emulate via N counted requests
    // via .head + count (cheap, no payload). Acceptance counts are display-only.
    const tasks = ids.map(async (vid) => {
      const { count } = await admin
        .from("tos_acceptances")
        .select("*", { count: "exact", head: true })
        .eq("tos_version_id", vid);
      return { tos_version_id: vid, count: count ?? 0 } as AcceptanceCount;
    });
    const results = await Promise.all(tasks);
    for (const r of results) counts[r.tos_version_id] = r.count;
  }

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-5xl">
      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · SETTINGS</p>
        <h1 className="mt-1 text-2xl font-bold">จัดการเวอร์ชัน TOS (ข้อตกลงและเงื่อนไข)</h1>
        <p className="text-xs text-muted mt-1">
          เพิ่ม/แก้/เปิดใช้เวอร์ชัน TOS. <strong>Active = 1 row</strong> ที่ <code className="font-mono text-[10px]">is_active=true</code> —
          หน้า protected ของลูกค้าจะแสดง gate บังคับยอมรับเวอร์ชันนี้ทันทีในการ load หน้าครั้งถัดไป (V-G4.1 ✅).
        </p>
        <p className="text-xs mt-2">
          <Link href="/admin/settings" className="text-primary-600 hover:underline">← กลับหน้าตั้งค่า</Link>
        </p>
      </header>

      <TosVersionsManager versions={versions} acceptanceCounts={counts} />
    </main>
  );
}
