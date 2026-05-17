import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { AddTeamLeaderForm } from "./add-form";
import { TeamLeaderRowActions } from "./row-actions";

export default async function AdminTeamLeadersPage() {
  // W-1 (gap-admin H-1): page-level role gate. Manages team leaders +
  // commission % (sales-money config) via createAdminClient
  // (RLS-bypass) — accounting + sales_admin (super implicit).
  await requireAdmin(["accounting", "sales_admin"]);

  const admin = createAdminClient();

  const [{ data: leaders }, { data: groups }] = await Promise.all([
    admin.from("team_leaders")
      .select(`
        id, team_code, commission_pct, is_active, created_at,
        profile:profiles!profile_id ( member_code, first_name, last_name, phone )
      `)
      .order("created_at", { ascending: false }),
    admin.from("customer_groups").select("code, name, is_active").eq("is_active", true).order("code"),
  ]);

  type Profile = { member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null };
  type Row = NonNullable<typeof leaders>[number] & { profile: Profile | Profile[] | null };
  const rows = ((leaders ?? []) as Row[]).map((r) => ({
    ...r,
    profile_row: Array.isArray(r.profile) ? r.profile[0] ?? null : r.profile,
  }));

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN</p>
          <h1 className="mt-1 text-2xl font-bold">ทีมขาย — Team Leaders</h1>
          <p className="mt-1 text-sm text-muted">หัวหน้าทีมที่ได้รับค่าคอมจากออเดอร์ของลูกค้าในกลุ่ม customer_group ตน</p>
        </div>
        <Link
          href="/admin/forwarder-sales"
          className="rounded-lg border border-primary-200 bg-primary-50 px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-100"
        >
          📊 รายงานค่าคอมฝากนำเข้า →
        </Link>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          {rows.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted">ยังไม่มีหัวหน้าทีม — เพิ่มทางขวา</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">ทีม</th>
                  <th className="px-4 py-3">หัวหน้า</th>
                  <th className="px-4 py-3 text-right">ค่าคอม %</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">การจัดการ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="px-4 py-3 font-mono text-xs">{r.team_code}</td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-mono">{r.profile_row?.member_code ?? "—"}</div>
                      <div>{r.profile_row?.first_name} {r.profile_row?.last_name}</div>
                      <div className="text-muted">{r.profile_row?.phone}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{(r.commission_pct * 100).toFixed(2)}%</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                        r.is_active ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-600 border-gray-200"
                      }`}>
                        {r.is_active ? "ใช้งาน" : "ปิดใช้งาน"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <TeamLeaderRowActions id={r.id} isActive={r.is_active} commissionPct={r.commission_pct} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <AddTeamLeaderForm groups={groups ?? []} />
      </div>
    </main>
  );
}
