import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { GrantForm, RowActions, ContactForm } from "./admin-actions";

const ROLE_LABEL: Record<string, string> = {
  super: "Super", ops: "Ops", accounting: "Accounting", sales_admin: "Sales Admin",
};
const ROLE_BADGE: Record<string, string> = {
  super:       "bg-red-50 text-red-700 border-red-200",
  ops:         "bg-blue-50 text-blue-700 border-blue-200",
  accounting:  "bg-green-50 text-green-700 border-green-200",
  sales_admin: "bg-purple-50 text-purple-700 border-purple-200",
};

export default async function AdminAdminsPage() {
  await requireAdmin(["super"]);                      // only super can manage admins
  const admin = createAdminClient();

  // Pull all admin rows + joined profile + contact extras
  const { data: adminRows } = await admin
    .from("admins")
    .select(`
      profile_id, role, granted_at, is_active,
      profile:profiles!profile_id ( member_code, first_name, last_name, phone, email, avatar_url ),
      contact:admin_contact_extras!profile_id ( display_name, direct_phone, department, section )
    `)
    .order("granted_at", { ascending: false });

  type Profile = { member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null; email: string | null; avatar_url: string | null };
  type Contact = { display_name: string | null; direct_phone: string | null; department: string | null; section: string | null };
  type Row = {
    profile_id: string; role: "super" | "ops" | "accounting" | "sales_admin";
    granted_at: string; is_active: boolean;
    profile: Profile | Profile[] | null;
    contact: Contact | Contact[] | null;
  };
  const rows = ((adminRows ?? []) as Row[]).map((r) => ({
    ...r,
    profile_one: Array.isArray(r.profile) ? r.profile[0] ?? null : r.profile,
    contact_one: Array.isArray(r.contact) ? r.contact[0] ?? null : r.contact,
  }));

  // Group by profile_id (so same person with 2 roles shows as 1 row + multi badges)
  const byProfile = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byProfile.get(r.profile_id) ?? [];
    arr.push(r);
    byProfile.set(r.profile_id, arr);
  }

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN</p>
        <h1 className="mt-1 text-2xl font-bold">จัดการ admin (super only)</h1>
        <p className="mt-1 text-sm text-muted">เพิ่มสิทธิ์ admin / ปิดสิทธิ์ / ตั้งชื่อแสดงสำหรับการ์ดเซลล์</p>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          {byProfile.size === 0 ? (
            <p className="p-12 text-center text-sm text-muted">ยังไม่มี admin อื่นนอกจากคุณ</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">โปรไฟล์</th>
                  <th className="px-4 py-3">บัตรเซลล์ (display)</th>
                  <th className="px-4 py-3">Roles</th>
                  <th className="px-4 py-3">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(byProfile.entries()).map(([profileId, entries]) => {
                  const first = entries[0];
                  const p = first.profile_one;
                  const c = first.contact_one;
                  return (
                    <tr key={profileId} className="border-t border-border align-top">
                      <td className="px-4 py-3 text-xs">
                        <div className="font-mono">{p?.member_code ?? "—"}</div>
                        <div className="font-medium text-foreground">{p?.first_name} {p?.last_name}</div>
                        <div className="text-muted">📞 {p?.phone ?? "—"}</div>
                        <div className="text-muted">{p?.email ?? "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {c?.display_name ? (
                          <>
                            <div className="font-medium">{c.display_name}</div>
                            {c.direct_phone && <div className="text-muted">📞 {c.direct_phone}</div>}
                            {c.department && <div className="text-muted">{c.department}{c.section ? ` / ${c.section}` : ""}</div>}
                          </>
                        ) : (
                          <div className="text-muted">ยังไม่ตั้ง</div>
                        )}
                        <ContactForm
                          profileId={profileId}
                          displayName={c?.display_name ?? null}
                          directPhone={c?.direct_phone ?? null}
                          department={c?.department ?? null}
                          section={c?.section ?? null}
                        />
                      </td>
                      <td className="px-4 py-3 text-xs space-y-1">
                        {entries.map((e) => (
                          <div key={e.role} className="flex items-center gap-2">
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${ROLE_BADGE[e.role]}`}>
                              {ROLE_LABEL[e.role]}
                            </span>
                            <RowActions profileId={profileId} role={e.role} isActive={e.is_active} />
                          </div>
                        ))}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {entries.every((e) => e.is_active) ? "✓ ใช้งาน" : "○ ปิดบางส่วน"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <GrantForm />
      </div>
    </main>
  );
}
