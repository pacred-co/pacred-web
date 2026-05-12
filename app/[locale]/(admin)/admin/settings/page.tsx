import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Settings, Shield } from "lucide-react";

type AdminUser = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  created_at: string;
};

export default async function SettingsPage() {
  await requireAdmin();

  const admin = createAdminClient();
  const { data: admins } = await admin
    .from("profiles")
    .select("id, first_name, last_name, email, phone, role, created_at")
    .in("role", ["admin", "staff"])
    .order("created_at", { ascending: true });

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">ตั้งค่าระบบ</h1>
        <p className="text-sm text-muted mt-1">จัดการผู้ดูแลระบบและการตั้งค่าทั่วไป</p>
      </div>

      {/* Admin users */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Shield className="h-4 w-4 text-primary-600" />
          ผู้ดูแลระบบ ({admins?.length ?? 0} คน)
        </h2>
        <div className="space-y-2">
          {admins?.map((a: AdminUser) => {
            const name = `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() || a.email || a.phone || a.id.slice(0, 8);
            return (
              <div key={a.id} className="flex items-center justify-between rounded-xl border border-border bg-[#F8F9FB] dark:bg-surface-alt px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{name}</p>
                  <p className="text-xs text-muted mt-0.5">{a.email ?? a.phone ?? a.id}</p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  a.role === "admin"
                    ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
                    : "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                }`}>
                  {a.role === "admin" ? "Admin" : "Staff"}
                </span>
              </div>
            );
          })}
          {(!admins || admins.length === 0) && (
            <p className="text-sm text-muted py-4 text-center">ไม่พบข้อมูล</p>
          )}
        </div>

        <div className="mt-4 rounded-xl bg-[#F8F9FB] dark:bg-surface-alt border border-border p-4">
          <p className="text-xs font-semibold text-muted mb-1">วิธีเพิ่ม Admin / Staff</p>
          <p className="text-xs text-muted">รันคำสั่ง SQL ใน Supabase Dashboard:</p>
          <code className="mt-2 block rounded-lg bg-surface dark:bg-background p-3 text-xs font-mono text-foreground">
            {`update public.profiles\nset role = 'admin'\nwhere email = 'email@example.com';`}
          </code>
        </div>
      </div>
    </div>
  );
}
