/**
 * /admin/customers/pending — สมาชิกที่ยังไม่ครบข้อมูล / รออนุมัติ
 *
 * Wave 7.2 (2026-05-21 night): rewritten from `profiles.status='incomplete'`
 * (rebuilt · empty) → `tb_users.userActive='0'` (legacy approval queue).
 *
 * In legacy PCS the queue is normally near-empty (most customers are
 * pre-approved on registration), but ops still need a place to see
 * pending registrations + juristic paperwork waiting on docs. Use the
 * same useractive='0' signal that `/admin/customers/page.tsx` uses for
 * its "incomplete" derived status.
 *
 * Wave 8 backlog: approve action (UPDATE tb_users SET useractive='1') +
 * juristic paperwork queue (separate `companycustomer='0'` filter).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { Clock } from "lucide-react";
import { TbCustomerBulkBar, TbCustomerRowCheckbox } from "./tb-bulk-bar";

export const dynamic = "force-dynamic";

type Row = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
  userEmail: string | null;
  userCompany: string | null;
  userRegistered: string | null;
  userActive: string | null;
};

export default async function AdminCustomersPendingPage() {
  // W-1 (gap-admin H-1/H-7): role-pin (was bare requireAdmin() — only
  // proved "some admin"). Pending-customer queue lists customer PII.
  await requireAdmin(["ops", "sales_admin", "accounting"]);

  const admin = createAdminClient();
  const { data: customers, count, error: customersErr } = await admin
    .from("tb_users")
    .select(
      "userid,username,userlastname,usertel,useremail,usercompany,userregistered,useractive",
      { count: "exact" },
    )
    .eq("userActive", "0")
    .order("userRegistered", { ascending: false })
    .limit(500);
  if (customersErr) {
    console.error(`[tb_users list] failed`, { code: customersErr.code, message: customersErr.message });
  }

  const rows = ((customers ?? []) as Row[]);
  const total = count ?? 0;

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-900/20">
            <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-600">
              ADMIN · APPROVAL QUEUE
            </p>
            <h1 className="mt-0.5 text-2xl font-bold">รอ Approve</h1>
            <p className="text-sm text-muted">
              สมาชิกที่ยังไม่ครบข้อมูล รอการอนุมัติ (tb_users.userActive=0) · Wave 7.2 read-only · approve button → Wave 8
            </p>
          </div>
        </div>
        <span className="rounded-full border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-3 py-1 text-sm font-semibold text-amber-700 dark:text-amber-400">
          {total} รายการ
        </span>
      </div>

      {/* Wave 8 Group A — sticky bulk-approve bar */}
      <TbCustomerBulkBar />

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-alt/50 text-left">
                <th className="px-2 py-3 w-8"></th>
                <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide">
                  รหัสสมาชิก
                </th>
                <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide">
                  ชื่อ / บริษัท
                </th>
                <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide">
                  เบอร์โทร
                </th>
                <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide">
                  อีเมล
                </th>
                <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide">
                  ประเภท
                </th>
                <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide">
                  วันที่สมัคร
                </th>
                <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide">
                  จัดการ
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted">
                    ไม่มีสมาชิกรอ Approve · ลูกค้าที่ลงทะเบียนใหม่ทุกราย ถูก approve อัตโนมัติ
                  </td>
                </tr>
              )}
              {rows.map((c) => {
                const isJuristic = c.userCompany === "1";
                const personalName = `${c.userName ?? ""} ${c.userLastName ?? ""}`.trim() || "—";
                const date = c.userRegistered
                  ? new Date(c.userRegistered).toLocaleDateString("th-TH", {
                      day: "numeric",
                      month: "short",
                      year: "2-digit",
                    })
                  : "—";
                return (
                  <tr key={c.userID} className="hover:bg-surface-alt/30 transition-colors">
                    <td className="px-2 py-3 w-8">
                      <TbCustomerRowCheckbox userid={c.userID} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">{c.userID}</td>
                    <td className="px-4 py-3 font-medium text-foreground max-w-[200px] truncate">
                      {personalName}
                    </td>
                    <td className="px-4 py-3 text-muted">{c.userTel ?? "—"}</td>
                    <td className="px-4 py-3 text-muted max-w-[160px] truncate">
                      {c.userEmail || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          isJuristic
                            ? "bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400"
                            : "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                        }`}
                      >
                        {isJuristic ? "นิติบุคคล" : "บุคคล"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted text-xs">{date}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/customers/${c.userID}`}
                        className="text-primary-600 hover:underline text-xs"
                      >
                        ดูรายละเอียด →
                      </Link>
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
