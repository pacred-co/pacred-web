import { requireAdmin } from "@/lib/auth/require-admin";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { getSidebarCounts } from "@/actions/admin/sidebar-counts";
import { AdminSidebar } from "@/components/sections/admin-sidebar";

/**
 * Layout for /admin/* routes. Gates access to admin profiles; non-admins
 * get a 404 (notFound) so the route appears invisible to customers.
 *
 * D1 Phase B: the sidebar is now a per-role hand-built menu with
 * live-count badges (faithful to legacy PCS — `docs/research/
 * d1-fidelity-admin.md` §1). The badge counts + the admin display name
 * are resolved here (Server Component) and passed into <AdminSidebar>.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { roles } = await requireAdmin();

  // Fetch the sidebar badge counts + the signed-in admin's display name
  // in parallel — both feed the per-role sidebar chrome.
  const [counts, withProfile] = await Promise.all([
    getSidebarCounts(),
    getCurrentUserWithProfile(),
  ]);

  const profile = withProfile?.profile ?? null;
  const adminLabel =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() ||
    profile?.member_code ||
    withProfile?.user.email ||
    "Admin";

  // V-ADM1 (เดฟ brief 2026-05-16): admin chrome inherits the public/customer
  // body background — the radial red-cloud gradient defined in
  // app/globals.css `body { … }`. Outer wrapper + content panel both stay
  // transparent so the gradient shows through. The sidebar keeps its own
  // solid dark background for contrast.
  // Layout fix 2026-05-25 (ภูม flagged): main wrapper was expanding beyond
  // viewport because flex children default to `min-width:auto` (content-based).
  // With wide intrinsic content (4-col stat cards + 14-tab strip), main grew
  // > viewport-256px → stat cards + tabs clipped on the right at <1920px screens.
  // Fix: add `min-w-0` so flex child can shrink, + `overflow-x-hidden` so any
  // wider child clips cleanly instead of expanding main. Inner overflow-x-auto
  // wrappers (tab strips, tables) now activate horizontal scroll correctly.
  return (
    <div className="min-h-screen flex text-foreground">
      <AdminSidebar roles={roles} counts={counts} adminLabel={adminLabel} adminAvatar={profile?.avatar_url ?? null} />
      <div className="flex-1 lg:ml-64 min-h-screen min-w-0 overflow-x-hidden">
        {children}
      </div>
    </div>
  );
}
