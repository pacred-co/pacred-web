import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { NotificationsForm } from "./notifications-form";

/**
 * /admin/settings/notifications — per-admin notification preferences (P-15-followup).
 *
 * Most important toggle: daily_digest opt-in.  Sales daily digest cron
 * (/api/cron/sales-daily-digest, ships 17:05 daily) loops admins where
 *   role IN ('super', 'sales_admin')
 *     AND notify_channels.daily_digest = true
 * and pushes a per-admin LINE summary.  Without this UI an admin had
 * to flip the flag via Supabase Table Editor — non-discoverable.
 *
 * Page accessible to ANY admin role (the digest is opt-in even for
 * non-sales roles — they could enable it for visibility, the cron
 * gate filters by role separately).  The role-level filtering happens
 * in the cron, not here.
 */
export default async function AdminNotificationsSettingsPage() {
  const { user } = await requireAdmin();

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("notify_channels, member_code, first_name, last_name")
    .eq("id", user.id)
    .maybeSingle<{
      notify_channels: { line?: boolean; email?: boolean; daily_digest?: boolean } | null;
      member_code: string | null;
      first_name: string | null;
      last_name: string | null;
    }>();

  // Should always exist — admins are also profiles. Fall back to login
  // bounce for the rare timing race during initial signup.
  if (!profile) redirect("/login");

  // Look up the role badges so the page can show "you'll receive the
  // sales digest because you have role X" hint.
  const { data: adminRow } = await admin
    .from("admins")
    .select("roles")
    .eq("profile_id", user.id)
    .maybeSingle<{ roles: string[] }>();
  const roles = adminRow?.roles ?? [];

  const initial = {
    line:         profile.notify_channels?.line         ?? true,
    email:        profile.notify_channels?.email        ?? true,
    daily_digest: profile.notify_channels?.daily_digest ?? false,
  };

  return (
    <main className="p-6 lg:p-8 space-y-6 max-w-2xl">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN</p>
        <h1 className="mt-1 text-2xl font-bold">การแจ้งเตือนของฉัน</h1>
        <p className="mt-1 text-sm text-muted">
          ตั้งค่าช่องทางที่จะรับการแจ้งเตือนเป็นการส่วนตัว — ใช้กับ admin บัญชีนี้คนเดียว
          {profile.member_code ? ` (${profile.member_code})` : ""}
        </p>
        <p className="mt-2 text-xs text-muted">
          ← <Link href="/admin/settings" className="underline">กลับไปหน้าตั้งค่าระบบ</Link>
        </p>
      </div>

      <NotificationsForm initial={initial} adminRoles={roles} />
    </main>
  );
}
