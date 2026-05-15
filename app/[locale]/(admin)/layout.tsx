import { requireAdmin } from "@/lib/auth/require-admin";
import { AdminSidebar } from "@/components/sections/admin-sidebar";

/**
 * Layout for /admin/* routes. Gates access to admin profiles; non-admins
 * get a 404 (notFound) so the route appears invisible to customers.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { roles } = await requireAdmin();

  // V-ADM1 (เดฟ brief 2026-05-16): admin chrome inherits the public/customer
  // body background — the radial red-cloud gradient defined in
  // app/globals.css `body { … }`. Outer wrapper + content panel both stay
  // transparent so the gradient shows through. Sidebar keeps its solid
  // bg-white for contrast.
  return (
    <div className="min-h-screen flex text-foreground">
      <AdminSidebar roles={roles} />
      <div className="flex-1 lg:ml-64 min-h-screen">
        {children}
      </div>
    </div>
  );
}
