import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

export default async function AdminHRPage() {
  await requireAdmin();
  const admin = createAdminClient();

  // Active admin users grouped by role — basic HR roster
  const { data: adminRows } = await admin
    .from("admins")
    .select(`
      profile_id, role, is_active, granted_at,
      profile:profiles!profile_id ( member_code, first_name, last_name, phone, email ),
      contact:admin_contact_extras!profile_id ( display_name, direct_phone, department, section )
    `)
    .eq("is_active", true);

  type Profile = { member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null; email: string | null };
  type Contact = { display_name: string | null; direct_phone: string | null; department: string | null; section: string | null };
  type Row = {
    profile_id: string; role: string; granted_at: string;
    profile: Profile | Profile[] | null;
    contact: Contact | Contact[] | null;
  };

  // Group by department (from admin_contact_extras)
  const byDept = new Map<string, Row[]>();
  for (const r of (adminRows ?? []) as Row[]) {
    const c = Array.isArray(r.contact) ? r.contact[0] : r.contact;
    const dept = c?.department ?? "(ไม่ระบุฝ่าย)";
    (byDept.get(dept) ?? byDept.set(dept, []).get(dept)!).push(r);
  }

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · CARGO &amp; FREIGHT</p>
        <h1 className="mt-1 text-2xl font-bold">👥 ฝ่ายทรัพยากรบุคคล</h1>
        <p className="mt-1 text-sm text-muted">ข้อมูลพนักงาน admin ทั้งหมดในระบบ จัดกลุ่มตามฝ่าย</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/admin/admins" className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600">
          + เพิ่ม / แก้สิทธิ์ admin
        </Link>
      </div>

      {byDept.size === 0 ? (
        <p className="text-sm text-muted">ยังไม่มี admin ในระบบ</p>
      ) : (
        Array.from(byDept.entries()).map(([dept, rows]) => (
          <section key={dept} className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-surface-alt/50 border-b border-border">
              <h2 className="font-bold text-sm">{dept} ({rows.length})</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2">โปรไฟล์</th>
                  <th className="px-4 py-2">บัตรเซลล์</th>
                  <th className="px-4 py-2">Role</th>
                  <th className="px-4 py-2">วันที่เริ่ม</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const p = Array.isArray(r.profile) ? r.profile[0] : r.profile;
                  const c = Array.isArray(r.contact) ? r.contact[0] : r.contact;
                  return (
                    <tr key={`${r.profile_id}-${r.role}`} className="border-t border-border">
                      <td className="px-4 py-2 text-xs">
                        <div className="font-mono">{p?.member_code ?? "—"}</div>
                        <div>{p?.first_name} {p?.last_name}</div>
                        <div className="text-muted">📞 {p?.phone ?? "—"} · {p?.email ?? "—"}</div>
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {c?.display_name && <div className="font-medium">{c.display_name}</div>}
                        {c?.direct_phone && <div className="text-muted">📞 {c.direct_phone}</div>}
                        {c?.section && <div className="text-muted">{c.section}</div>}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <span className="rounded-full bg-primary-50 text-primary-700 border border-primary-200 px-2 py-0.5 text-[10px] font-medium">
                          {r.role}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-muted">{new Date(r.granted_at).toLocaleDateString("th-TH")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ))
      )}

      <div className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted">
        ฟีเจอร์ HR เพิ่มเติม: บันทึกเวลาเข้างาน (TAS), วันลา, สลิปเงินเดือน, จัดการตำแหน่งและฝ่าย — เพิ่มในเฟสถัดไป (Phase G+)
      </div>
    </main>
  );
}
