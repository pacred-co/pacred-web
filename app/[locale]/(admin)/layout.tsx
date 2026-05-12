import { requireAdmin } from "@/lib/auth/require-admin";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminNavbar } from "@/components/admin/admin-navbar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireAdmin();

  return (
    <div className="min-h-screen bg-[#F4F5F8] dark:bg-background">
      <AdminSidebar />
      <AdminNavbar profile={profile} />
      <main className="ml-60 pt-16 transition-[margin] duration-200">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
