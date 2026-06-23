import { redirect } from "next/navigation";
import { requireAdmin, hasRole } from "@/lib/auth/require-admin";
import { verifyAdminSession } from "@/lib/auth/admin-session";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { getSidebarCounts } from "@/actions/admin/sidebar-counts";
import { AdminSidebar } from "@/components/sections/admin-sidebar";
import { CollapseAdminSidebar } from "@/components/sections/collapse-admin-sidebar";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { CostRevealProvider } from "@/components/admin/cost-reveal";
import { AdminHeaderNavProvider, AdminHeaderNavDisplay } from "@/components/admin/admin-header-nav";

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
  const { user, roles } = await requireAdmin();

  // 2026-06-19 (owner directive · พี่ป๊อป via ปอน) — the back-office is reachable
  // ONLY via the dedicated /admin/login entrance, which mints the `pacred_admin`
  // ticket. This is the AUTHORITATIVE gate: HMAC-verify the ticket against the
  // signed-in user. An admin who logged in through the normal /login holds NO
  // ticket → sent to the customer front-office. A forged cookie (faked presence
  // to slip past the proxy) fails the HMAC here. The proxy already redirects the
  // no-ticket case; this catches a forged ticket + is the real security boundary.
  if (!(await verifyAdminSession(user.id))) {
    redirect("/dashboard");
  }

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
  // Fix: add `min-w-0` so flex child can shrink, + `overflow-x-clip` so any
  // wider child clips cleanly instead of expanding main. Inner overflow-x-auto
  // wrappers (tab strips, tables) now activate horizontal scroll correctly.
  //
  // 2026-06-09 (ภูม flag "top menu sticky ไม่ทำงาน"): MUST be `overflow-x-clip`
  // (NOT `overflow-x-hidden`). Per CLAUDE.md conventions §styling:
  // "Overflow: use `overflow-x: clip` on root (not `hidden`) — `hidden`
  // breaks `sticky`." Any overflow value other than `visible` or `clip`
  // creates a scrolling context, and `position: sticky` children in that
  // wrapper resolve their containing block to THIS wrapper instead of the
  // window — which then never scrolls (height = min-h-screen = viewport),
  // so sticky never activates. `overflow-x: clip` clips without forming
  // a scroll context, which is what we want here.
  return (
    <AdminHeaderNavProvider>
    <div className="min-h-screen flex text-foreground">
      {/* 2026-06-10 (ปอน) — slim admin top bar, carries locale + theme controls
          on the right. Pages can inject their own nav items into the left side
          via <AdminHeaderNavInject> — items appear here via AdminHeaderNavDisplay.
          2026-06-11 (owner "ยก sidebar ทับ nav bar"): the sidebar is top-0
          z-[70] and COVERS this bar's left corner (the PR-ADMIN brand sits
          top-left). Hidden on print so it doesn't bleed into receipts/invoices. */}
      <header className="print:hidden fixed top-0 inset-x-0 z-[60] h-14 bg-[#B91C1C] flex items-center px-4 shadow-md">
        <AdminHeaderNavDisplay />
        <div className="ml-auto flex items-center gap-2">
          <LocaleSwitcher variant="on-primary" />
          <ThemeToggle variant="on-primary" />
        </div>
      </header>
      {/* 2026-06-09 ภูม flag round 4 (receipt-print artefacts): hide the
          sidebar on print so receipts/invoices/tax-invoices don't show admin
          chrome bleeding into the page. Side-effect-free for screen rendering. */}
      <div className="print:hidden">
        <AdminSidebar roles={roles} counts={counts} adminLabel={adminLabel} adminAvatar={profile?.avatar_url ?? null} />
        {/* 2026-06-13 (ปอน · owner "ทำให้ left sidebar responsive เหมือนหน้านำเข้าทุกหน้า"):
            collapse the desktop sidebar to a hover-expand icon rail on EVERY admin
            page (was page-scoped to /admin/forwarders/[fNo]). Lifted here so the
            rail + push-content behaviour applies platform-wide. Mobile (<lg) is
            unaffected — the sidebar stays an off-canvas drawer there. */}
        <CollapseAdminSidebar />
      </div>
      {/* Cost-reveal blur gate (owner ภูม 2026-06-16/17) — ต้นทุน blurred by
          default + revealed only after the PIN, resetting on a hard refresh /
          re-login (layout unmount). `bypass` = super/accounting/pricing (the
          cost-owner roles · hasRole treats super as always-allowed): they see
          cost PLAIN (no blur, no eye). Every other cost-seeing role gets the
          blur + PIN gate. */}
      <div className="admin-content flex-1 lg:ml-64 min-h-screen min-w-0 overflow-x-clip pt-14 print:pt-0 print:ml-0">
        <CostRevealProvider bypass={hasRole(roles, ["accounting", "pricing"])}>
          {children}
        </CostRevealProvider>
      </div>
    </div>
    </AdminHeaderNavProvider>
  );
}
