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
import { requireAdmin, isGodRole } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { CustomerCodeLink } from "@/components/admin/customer-code-link";
import { Clock } from "lucide-react";
import { parsePage, pageRange, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { CsvButton, type CsvCol, type CsvRow } from "@/components/admin/csv-button";
import { exportCustomersPendingAll } from "@/actions/admin/export/customers-pending";
import { TbCustomerBulkBar, TbCustomerRowCheckbox, TbCustomerRejectButton } from "./tb-bulk-bar";
import { getCrmReps, getCrmCsReps } from "@/actions/admin/crm";
import type { CrmRep, CrmCsRep } from "@/lib/admin/crm-types";
import {
  fetchCorporateNameMap,
  resolveBillingIdentity,
  corpRowFromName,
} from "@/lib/admin/customer-identity";
import { AssignRepCell } from "./assign-rep-cell";

export const dynamic = "force-dynamic";

// Senior roles allowed to (re)assign the owning sales/CS rep — mirrors
// ROUTING_ROLES in actions/admin/crm.ts (the actions enforce this server-side;
// we gate the UI to match so non-senior roles see a read-only hint).
const ASSIGN_ROLES = ["manager", "sales_admin"];

type Row = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
  userEmail: string | null;
  userCompany: string | null;
  userRegistered: string | null;
  userActive: string | null;
  adminIDSale: string | null;
  adminIDCS: string | null;
};

export default async function AdminCustomersPendingPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  // W-1 (gap-admin H-1/H-7): role-pin (was bare requireAdmin() — only
  // proved "some admin"). Pending-customer queue lists customer PII.
  const { roles } = await requireAdmin(["ops", "sales_admin", "accounting"]);
  // super is implicit in requireAdmin (bypasses the role list) but won't
  // appear in `roles`; treat it as always-allowed to assign.
  const canAssign = isGodRole(roles) || roles.some((r) => ASSIGN_ROLES.includes(r));

  const sp = await searchParams;
  const page = parsePage(sp.page);
  const { from, to } = pageRange(page);

  const admin = createAdminClient();
  const { data: customers, count, error: customersErr } = await admin
    .from("tb_users")
    .select(
      "userID,userName,userLastName,userTel,userEmail,userCompany,userRegistered,userActive,adminIDSale,adminIDCS",
      { count: "exact" },
    )
    // P1-17 (ADR-0019 D-C transitional): legacy migrated pending = userActive='',
    // native pending = '0'. Until เดฟ P1-16 flips register-write '0'→'', accept
    // BOTH so the queue catches every pending row in one filter.
    .in("userActive", ["", "0"])
    .order("userRegistered", { ascending: false })
    .range(from, to);
  if (customersErr) {
    console.error(`[tb_users list] failed`, { code: customersErr.code, message: customersErr.message });
  }

  const rows = ((customers ?? []) as Row[]);
  const total = count ?? 0;

  // นิติบุคคล → company name (the "ชื่อ / บริษัท" column); else the person. The
  // corp row exists from signup even while approval is pending. One batched .in().
  const corpNames = await fetchCorporateNameMap(admin, rows.map((r) => r.userID));
  const displayName = (c: Row): string =>
    resolveBillingIdentity({
      userCompany: c.userCompany,
      userName: c.userName,
      userLastName: c.userLastName,
      corp: corpRowFromName(corpNames.get(c.userID)),
    }).name;

  // Assignable sales + CS pools — loaded ONCE here, passed to each row's
  // AssignRepCell (reuses the CRM actions; no new assignment logic). Only
  // fetched when the operator can actually assign (saves 2 queries otherwise).
  let reps: CrmRep[] = [];
  let csReps: CrmCsRep[] = [];
  let repsGateNote: string | null = null;
  let csGateNote: string | null = null;
  if (canAssign && rows.length > 0) {
    const [repsRes, csRes] = await Promise.all([getCrmReps(), getCrmCsReps()]);
    if (repsRes.ok && repsRes.data) {
      reps = repsRes.data.reps;
      repsGateNote = repsRes.data.gateNote;
    }
    if (csRes.ok && csRes.data) {
      csReps = csRes.data.reps;
      csGateNote = csRes.data.gateNote;
    }
  }

  // CSV export — columns mirror the <thead> 1:1 (รหัสสมาชิก / ชื่อ-บริษัท /
  // เบอร์โทร / อีเมล / ประเภท / วันที่สมัคร). The "จัดการ" column is action-only.
  const csvCols: CsvCol[] = [
    { key: "userID", label: "รหัสสมาชิก" },
    { key: "name", label: "ชื่อ / บริษัท" },
    { key: "tel", label: "เบอร์โทร" },
    { key: "email", label: "อีเมล" },
    { key: "type", label: "ประเภท" },
    { key: "registered", label: "วันที่สมัคร" },
  ];
  const csvRows: CsvRow[] = rows.map((c) => ({
    userID: c.userID,
    name: displayName(c) || "—",
    tel: c.userTel ?? "—",
    email: c.userEmail || "—",
    type: c.userCompany === "1" ? "นิติบุคคล" : "บุคคล",
    registered: c.userRegistered ? c.userRegistered.slice(0, 10) : "—",
  }));

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
              สมาชิกที่สมัครใหม่ผ่าน Pacred · รอการอนุมัติ · กดอนุมัติแล้วระบบจะส่ง SMS ต้อนรับ + จับคู่เซลให้อัตโนมัติ
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <CsvButton
            rows={csvRows}
            cols={csvCols}
            filename="customers-pending.csv"
            fetchAll={async () => {
              "use server";
              return exportCustomersPendingAll();
            }}
          />
          <span className="rounded-full border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-3 py-1 text-sm font-semibold text-amber-700 dark:text-amber-400">
            {total} รายการ
          </span>
        </div>
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
                  ผู้ดูแล (เซล / CS)
                </th>
                <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide">
                  จัดการ
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm text-muted">
                    ไม่มีสมาชิกรอ Approve · ทุกรายอนุมัติเรียบร้อย
                  </td>
                </tr>
              )}
              {rows.map((c) => {
                const isJuristic = c.userCompany === "1";
                // "ชื่อ / บริษัท": company name for นิติบุคคล, else the person.
                const personalName = displayName(c) || "—";
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
                    <td className="px-4 py-3"><CustomerCodeLink code={c.userID} className="text-xs" /></td>
                    <td className="px-4 py-3 font-medium text-foreground max-w-[200px] truncate">
                      {personalName}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {c.userTel ? (
                        // One-tap call-back ("โทรกลับ") for sales — owner directive.
                        <a
                          href={`tel:${c.userTel.replace(/[^\d+]/g, "")}`}
                          className="inline-flex items-center gap-1 text-primary-600 hover:underline"
                          title={`โทรกลับ ${c.userTel}`}
                        >
                          📞 {c.userTel}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
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
                    <td className="px-4 py-3 align-top">
                      <AssignRepCell
                        userid={c.userID}
                        currentRepLegacyId={c.adminIDSale?.trim() || null}
                        currentCsAdminId={c.adminIDCS?.trim() || null}
                        reps={reps}
                        csReps={csReps}
                        repsGateNote={repsGateNote}
                        csGateNote={csGateNote}
                        canAssign={canAssign}
                      />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Link
                          href={`/admin/customers/${c.userID}`}
                          className="text-primary-600 hover:underline text-xs"
                        >
                          ดูรายละเอียด →
                        </Link>
                        <TbCustomerRejectButton userid={c.userID} name={personalName} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination
        page={page}
        pageSize={DEFAULT_PAGE_SIZE}
        total={total}
        basePath="/admin/customers/pending"
      />
    </main>
  );
}
