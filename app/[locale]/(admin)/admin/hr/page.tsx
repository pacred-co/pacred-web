import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

export default async function AdminHRPage() {
  await requireAdmin();
  const admin = createAdminClient();

  // Active admin users grouped by department.
  // Wave 22 — split into 2 queries + JS merge. admins and admin_contact_extras
  // both FK to profiles but NOT to each other → PostgREST cross-embed fails
  // PGRST200. profile via profiles!profile_id works (direct FK).
  const { data: adminRows, error: adminRowsErr } = await admin
    .from("admins")
    .select(`
      profile_id, role, is_active, granted_at,
      profile:profiles!profile_id ( member_code, first_name, last_name, phone, email )
    `)
    .eq("is_active", true);
  if (adminRowsErr) {
    console.error(`[admins list] failed`, { code: adminRowsErr.code, message: adminRowsErr.message });
  }

  type Profile = { member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null; email: string | null };
  type Contact = { profile_id: string; display_name: string | null; direct_phone: string | null; department: string | null; section: string | null };
  type Row = {
    profile_id: string; role: string; granted_at: string;
    profile: Profile | Profile[] | null;
    contact: Contact | null;
  };

  const profileIds = [...new Set((adminRows ?? []).map((r) => (r as { profile_id: string }).profile_id))];

  // Fetch contact extras for the matched profiles
  let contactsMap = new Map<string, Contact>();
  if (profileIds.length > 0) {
    const { data: contactsRows, error: contactsErr } = await admin
      .from("admin_contact_extras")
      .select("profile_id, display_name, direct_phone, department, section")
      .in("profile_id", profileIds);
    if (contactsErr) {
      console.error(`[hr contact_extras] failed`, contactsErr);
    } else {
      contactsMap = new Map(
        (contactsRows ?? []).map((c) => [(c as Contact).profile_id, c as Contact]),
      );
    }
  }

  // Merge contact onto each row + group by department.
  const mergedRows: Row[] = ((adminRows ?? []) as Array<Omit<Row, "contact">>).map((r) => ({
    ...r,
    contact: contactsMap.get(r.profile_id) ?? null,
  }));

  const byDept = new Map<string, Row[]>();
  for (const r of mergedRows) {
    const dept = r.contact?.department ?? "(ไม่ระบุฝ่าย)";
    (byDept.get(dept) ?? byDept.set(dept, []).get(dept)!).push(r);
  }

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · CARGO &amp; FREIGHT</p>
        <h1 className="mt-1 text-2xl font-bold">👥 ฝ่ายทรัพยากรบุคคล</h1>
        <p className="mt-1 text-sm text-muted">ข้อมูลพนักงาน admin ทั้งหมดในระบบ จัดกลุ่มตามฝ่าย</p>
      </div>

      {/* HR sub-modules quick links — Phase 1 ships org chart, others coming */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/admin/hr/org-chart"
          className="group flex items-start gap-3 rounded-2xl border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-white p-4 hover:shadow-md transition-shadow"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500 text-white text-lg shrink-0">🌳</div>
          <div className="min-w-0">
            <p className="font-bold text-foreground">ผังองค์กรแบบภาพ</p>
            <p className="text-xs text-muted mt-0.5">Tree view · CEO → Directors → Sections → Positions</p>
          </div>
        </Link>
        <Link
          href="/admin/hr/org-table"
          className="group flex items-start gap-3 rounded-2xl border-2 border-cyan-200 bg-gradient-to-br from-cyan-50 to-white p-4 hover:shadow-md transition-shadow"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500 text-white text-lg shrink-0">📋</div>
          <div className="min-w-0">
            <p className="font-bold text-foreground">ผังองค์กรแบบตาราง</p>
            <p className="text-xs text-muted mt-0.5">ทุก position พร้อม quota + ผู้นั่งปัจจุบัน</p>
          </div>
        </Link>
        <Link
          href="/admin/admins"
          className="group flex items-start gap-3 rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 hover:shadow-md transition-shadow"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500 text-white text-lg shrink-0">📇</div>
          <div className="min-w-0">
            <p className="font-bold text-foreground">รายชื่อพนักงานทั้งหมด</p>
            <p className="text-xs text-muted mt-0.5">Datatable · ทั้งหมด · ทำงาน · พักงาน · ค้นหา</p>
          </div>
        </Link>
        <Link
          href="/admin/admins"
          className="group flex items-start gap-3 rounded-2xl border-2 border-primary-200 bg-gradient-to-br from-primary-50 to-white p-4 hover:shadow-md transition-shadow"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-500 text-white text-lg shrink-0">👤</div>
          <div className="min-w-0">
            <p className="font-bold text-foreground">เพิ่ม / แก้สิทธิ์ Admin</p>
            <p className="text-xs text-muted mt-0.5">RBAC role + contact extras</p>
          </div>
        </Link>
        <Link
          href="/admin/hr/recruitment"
          className="group flex items-start gap-3 rounded-2xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 hover:shadow-md transition-shadow"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500 text-white text-lg shrink-0">📝</div>
          <div className="min-w-0">
            <p className="font-bold text-foreground">สรรหา / รับสมัครงาน</p>
            <p className="text-xs text-muted mt-0.5">ลงประกาศ · รับใบสมัคร · นัดสัมภาษณ์ · รับเข้าทำงาน</p>
          </div>
        </Link>
        <Link
          href="/admin/hr/attendance"
          className="group flex items-start gap-3 rounded-2xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white p-4 hover:shadow-md transition-shadow"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500 text-white text-lg shrink-0">⏰</div>
          <div className="min-w-0">
            <p className="font-bold text-foreground">เข้างาน / ลา</p>
            <p className="text-xs text-muted mt-0.5">TAS · clock-in/out · กรอกขาด-ลา · นับชั่วโมงงาน</p>
          </div>
        </Link>
        <Link
          href="/admin/hr/training"
          className="group flex items-start gap-3 rounded-2xl border-2 border-cyan-200 bg-gradient-to-br from-cyan-50 to-white p-4 hover:shadow-md transition-shadow"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500 text-white text-lg shrink-0">🎓</div>
          <div className="min-w-0">
            <p className="font-bold text-foreground">หลักสูตรอบรม</p>
            <p className="text-xs text-muted mt-0.5">Training · enrollment + completion tracking</p>
          </div>
        </Link>
        <Link
          href="/admin/hr/policies"
          className="group flex items-start gap-3 rounded-2xl border-2 border-pink-200 bg-gradient-to-br from-pink-50 to-white p-4 hover:shadow-md transition-shadow"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-pink-500 text-white text-lg shrink-0">📜</div>
          <div className="min-w-0">
            <p className="font-bold text-foreground">นโยบายบริษัท</p>
            <p className="text-xs text-muted mt-0.5">Policy library + พนักงานกดรับทราบ</p>
          </div>
        </Link>
        <Link
          href="/admin/hr/audit"
          className="group flex items-start gap-3 rounded-2xl border-2 border-red-200 bg-gradient-to-br from-red-50 to-white p-4 hover:shadow-md transition-shadow"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500 text-white text-lg shrink-0">📋</div>
          <div className="min-w-0">
            <p className="font-bold text-foreground">ออดิทพนักงาน</p>
            <p className="text-xs text-muted mt-0.5">ชมเชย · ตักเตือน · โทษวินัย · ประเมินผล</p>
          </div>
        </Link>
      </div>

      <div className="border-t border-border pt-4 mt-2">
        <h2 className="text-base font-bold text-foreground mb-3">Admin ที่มีสิทธิ์ในระบบ ({Array.from(byDept.values()).reduce((s, r) => s + r.length, 0)} คน)</h2>
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
