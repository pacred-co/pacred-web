import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CustomerRowActions } from "@/components/admin/customer-row-actions";
import { Clock } from "lucide-react";

/** Customers pending approval — profiles.status = 'incomplete'.
 *  Admin can approve (→ 'active') or open profile via the row actions.
 *  Counterpart to the all-customers list at /admin/customers. */
export default async function AdminCustomersPendingPage() {
  await requireAdmin();

  const admin = createAdminClient();
  const { data: customers, count } = await admin
    .from("profiles")
    .select(
      "id, member_code, first_name, last_name, phone, email, account_type, company_name, status, created_at",
      { count: "exact" },
    )
    .eq("status", "incomplete")
    .order("created_at", { ascending: false });

  type Row = {
    id: string;
    member_code: string | null;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    email: string | null;
    account_type: string;
    company_name: string | null;
    status: string;
    created_at: string;
  };
  const rows = (customers ?? []) as Row[];
  const total = count ?? 0;

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-900/20">
            <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · APPROVAL QUEUE</p>
            <h1 className="mt-0.5 text-2xl font-bold">รอ Approve</h1>
            <p className="text-sm text-muted">สมาชิกที่ยังไม่ครบข้อมูล รอการอนุมัติ</p>
          </div>
        </div>
        <span className="rounded-full border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-3 py-1 text-sm font-semibold text-amber-700 dark:text-amber-400">
          {total} รายการ
        </span>
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-alt/50 text-left">
                <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide">รหัสสมาชิก</th>
                <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide">ชื่อ / บริษัท</th>
                <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide">เบอร์โทร</th>
                <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide">อีเมล</th>
                <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide">ประเภท</th>
                <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide">วันที่สมัคร</th>
                <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted">
                    ไม่มีสมาชิกรอ Approve
                  </td>
                </tr>
              )}
              {rows.map((c) => {
                const personalName = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "—";
                const name = c.account_type === "juristic"
                  ? (c.company_name ?? personalName)
                  : personalName;
                const date = new Date(c.created_at).toLocaleDateString("th-TH", {
                  day: "numeric", month: "short", year: "2-digit",
                });
                return (
                  <tr key={c.id} className="hover:bg-surface-alt/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-muted">{c.member_code ?? "—"}</td>
                    <td className="px-4 py-3 font-medium text-foreground max-w-[200px] truncate">{name}</td>
                    <td className="px-4 py-3 text-muted">{c.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-muted max-w-[160px] truncate">{c.email ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        c.account_type === "juristic"
                          ? "bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400"
                          : "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                      }`}>
                        {c.account_type === "juristic" ? "นิติบุคคล" : "บุคคล"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted text-xs">{date}</td>
                    <td className="px-4 py-3">
                      <CustomerRowActions id={c.id} status={c.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
