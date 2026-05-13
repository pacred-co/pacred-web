import { requireAdmin } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";
import { Users, Package, ShoppingCart, CreditCard } from "lucide-react";

async function getStats() {
  const supabase = await createClient();
  const [
    { count: totalMembers },
    { count: pendingMembers },
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("status", "incomplete"),
  ]);
  return { totalMembers: totalMembers ?? 0, pendingMembers: pendingMembers ?? 0 };
}

export default async function AdminDashboardPage() {
  await requireAdmin();
  const { totalMembers, pendingMembers } = await getStats();

  const stats = [
    { label: "สมาชิกทั้งหมด", value: totalMembers.toLocaleString(), Icon: Users, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/20" },
    { label: "รอ Approve", value: pendingMembers.toLocaleString(), Icon: Users, color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-900/20" },
    { label: "รายการ Forwarder", value: "—", Icon: Package, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/20" },
    { label: "Shop Orders", value: "—", Icon: ShoppingCart, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-900/20" },
    { label: "ชำระเงิน (Yuan)", value: "—", Icon: CreditCard, color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/20" },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted mt-1">ภาพรวมระบบ Pacred Admin</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 mb-8">
        {stats.map(({ label, value, Icon, color, bg }) => (
          <div key={label} className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
            <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl ${bg}`}>
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="mt-1 text-xs text-muted">{label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-foreground">สมาชิกใหม่ล่าสุด</h2>
        <p className="text-sm text-muted">ยังไม่มีข้อมูล — เชื่อมต่อฐานข้อมูล forwarder/orders ในขั้นต่อไป</p>
      </div>
    </div>
  );
}
