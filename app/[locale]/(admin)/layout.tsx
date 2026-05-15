import { requireAdmin } from "@/lib/auth/require-admin";
import { AdminSidebar } from "@/components/sections/admin-sidebar";

/**
 * Layout for /admin/* routes. Gates access to admin profiles; non-admins
 * get a 404 (notFound) so the route appears invisible to customers.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { roles } = await requireAdmin();

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <AdminSidebar roles={roles} />
      <div className="flex-1 lg:ml-64 bg-surface-alt/30 dark:bg-surface-alt/20 min-h-screen">
        {children}
      </div>
    </div>
  );
}
