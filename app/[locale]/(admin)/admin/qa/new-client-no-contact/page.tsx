/**
 * /admin/qa/new-client-no-contact — ไม่ติดต่อลูกค้าใหม่เกิน 2 วัน (Wave 10 Group B · SLA-breach queue)
 *
 * Lists tb_users rows that registered in the last 30 days (useractive='1')
 * but have never logged in (userlastlogin IS NULL) OR last logged in > 2
 * days ago. Surfaces new customer leads that the sales team hasn't followed
 * up on — the lifeblood of the inbound funnel.
 *
 * Only this queue reads tb_users directly (the brief notes: "skip 2nd query
 * for new-client-no-contact since that page already queries tb_users").
 *
 * Pattern source: /admin/forwarder-action (9-queue SLA audit) +
 * /admin/yuan-payments (status chips + customer rendering).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { nowMs, cutoffIsoDaysAgo } from "@/lib/datetime-helpers";
import { parsePage, pageRange, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { exportQaNewClientNoContactAll } from "@/actions/admin/export/qa-new-client-no-contact";

export const dynamic = "force-dynamic";

type URow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
  userEmail: string | null;
  userRegistered: string | null;
  userLastLogin: string | null;
  userActive: string | null;
  adminIDSale: string | null;
  userCompany: string | null;
};

export default async function NewClientNoContactPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin(["ops", "accounting", "super"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  const page = parsePage(sp.page);
  const { from, to } = pageRange(page);

  // Filters:
  //   useractive='1' (active accounts; excludes pending/disabled)
  //   userregistered > NOW() - 30 days (focus on new prospects, not old churners)
  //   (userlastlogin IS NULL OR userlastlogin < NOW() - 2 days)
  //
  // PostgREST can't express the OR cleanly when combined with the .gt()
  // userregistered filter — fetch all 30-day-window active users, then
  // filter the "no recent login" subset post-fetch. Cheap because the
  // monthly intake fits comfortably in 500-row chunks for now.
  const registerCutoff = cutoffIsoDaysAgo(30);
  const loginCutoff = cutoffIsoDaysAgo(2);

  // 2026-05-28 B-4 P0 fix: tb_users cols are camelCase quoted post-batch-1
  // (migration 0113). Lowercase selects/filters return PGRST 42703 +
  // silently rendered "no results" → SLA queue invisible to sales. The
  // .or() syntax needs quoted identifiers ("userLastLogin") because the
  // raw filter string is fed straight to PostgREST as the column name.
  // count:"exact" on the windowed query — accurate even when > 200 breaches
  // (Wave 10 bug-fix 2026-05-23 · same pattern across QA queues).
  const { data: rowsRaw, error, count: breachCount } = await admin
    .from("tb_users")
    .select(
      "userID,userName,userLastName,userTel,userEmail,userRegistered," +
        "userLastLogin,userActive,adminIDSale,userCompany",
      { count: "exact" },
    )
    .eq("userActive", "1")
    .gt("userRegistered", registerCutoff)
    .or(`userLastLogin.is.null,userLastLogin.lt.${loginCutoff}`)
    .order("userRegistered", { ascending: true })
    .range(from, to);

  const rows = (rowsRaw ?? []) as unknown as URow[];

  const now = nowMs();

  // CSV columns mirror the <thead> labels 1:1 (skip the empty action column).
  const csvCols = [
    { key: "userID", label: "รหัส" },
    { key: "userRegistered", label: "สมัครเมื่อ" },
    { key: "daysSinceReg", label: "นานแล้ว" },
    { key: "fullName", label: "ชื่อ-สกุล" },
    { key: "userTel", label: "เบอร์" },
    { key: "userEmail", label: "อีเมล" },
    { key: "customerType", label: "ประเภท" },
    { key: "lastLogin", label: "login ครั้งล่าสุด" },
    { key: "adminIDSale", label: "เซลส์ดูแล" },
  ];

  // On-screen (paginated) rows → flat CsvRow[] (same mapping as the table).
  const csvRows: CsvRow[] = rows.map((u) => {
    const fullName = `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim() || "—";
    const daysSinceReg = u.userRegistered
      ? Math.floor((now - new Date(u.userRegistered).getTime()) / (24 * 60 * 60 * 1000))
      : 0;
    return {
      userID: u.userID,
      userRegistered: u.userRegistered ? String(u.userRegistered).slice(0, 10) : "—",
      daysSinceReg: `${daysSinceReg} วัน`,
      fullName,
      userTel: u.userTel || "—",
      userEmail: u.userEmail || "—",
      customerType: u.userCompany === "1" ? "นิติบุคคล" : "บุคคล",
      lastLogin: u.userLastLogin ? String(u.userLastLogin).slice(0, 10) : "ไม่เคย login",
      adminIDSale: u.adminIDSale || "—",
    };
  });

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · QA · SLA</p>
        <div className="mt-1 flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">ไม่ติดต่อลูกค้าใหม่เกิน 2 วัน</h1>
          <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
            {breachCount ?? rows.length} รายการ
          </span>
          <Link href="/admin/qa" className="text-xs text-primary-600 hover:underline">
            ← กลับ QA hub
          </Link>
          <div className="ml-auto">
            <CsvButton
              rows={csvRows}
              cols={csvCols}
              filename="qa-new-client-no-contact.csv"
              fetchAll={async () => {
                "use server";
                return exportQaNewClientNoContactAll();
              }}
            />
          </div>
        </div>
        <p className="mt-1 text-xs text-muted">
          tb_users · useractive=&apos;1&apos; AND userregistered &gt; NOW() − 30 วัน AND
          (userlastlogin IS NULL หรือ userlastlogin &lt; NOW() − 2 วัน) ·
          เรียงสมัครเก่าสุดก่อน · จำกัด 200 แถว
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          โหลดข้อมูลไม่สำเร็จ: {error.message}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <div className="text-4xl" aria-hidden>✅</div>
            <p className="text-sm font-medium text-foreground">ทุกลูกค้าใหม่ติดต่อแล้ว</p>
            <p className="text-xs text-muted">ลูกค้าใหม่ทั้งหมดใน 30 วันมีการเข้าใช้งานล่าสุดภายใน 2 วัน</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-surface-alt/50 text-left text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-2 py-2">รหัส</th>
                  <th className="px-2 py-2">สมัครเมื่อ</th>
                  <th className="px-2 py-2">นานแล้ว</th>
                  <th className="px-2 py-2">ชื่อ-สกุล</th>
                  <th className="px-2 py-2">เบอร์</th>
                  <th className="px-2 py-2">อีเมล</th>
                  <th className="px-2 py-2">ประเภท</th>
                  <th className="px-2 py-2">login ครั้งล่าสุด</th>
                  <th className="px-2 py-2">เซลส์ดูแล</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => {
                  const fullName =
                    `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim() || "—";
                  const daysSinceReg = u.userRegistered
                    ? Math.floor((now - new Date(u.userRegistered).getTime()) / (24 * 60 * 60 * 1000))
                    : 0;
                  const severity =
                    daysSinceReg >= 14 ? "bg-red-100 text-red-700 border-red-200"
                    : daysSinceReg >= 7 ? "bg-orange-100 text-orange-700 border-orange-200"
                    : "bg-yellow-100 text-yellow-700 border-yellow-200";
                  const lastLoginLabel = u.userLastLogin
                    ? new Date(u.userLastLogin).toLocaleDateString("th-TH")
                    : "ไม่เคย login";
                  return (
                    <tr key={u.userID} className="border-t border-border hover:bg-surface-alt/30">
                      <td className="px-2 py-2 font-mono">{u.userID}</td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {u.userRegistered ? String(u.userRegistered).slice(0, 10) : "—"}
                      </td>
                      <td className="px-2 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${severity}`}>
                          {daysSinceReg} วัน
                        </span>
                      </td>
                      <td className="px-2 py-2">{fullName}</td>
                      <td className="px-2 py-2 font-mono">{u.userTel || "—"}</td>
                      <td className="px-2 py-2 max-w-[180px] truncate" title={u.userEmail ?? ""}>
                        {u.userEmail || "—"}
                      </td>
                      <td className="px-2 py-2">
                        {u.userCompany === "1" ? (
                          <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">
                            นิติบุคคล
                          </span>
                        ) : (
                          <span className="text-muted text-[11px]">บุคคล</span>
                        )}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {u.userLastLogin ? (
                          <span>{lastLoginLabel}</span>
                        ) : (
                          <span className="text-red-600 font-medium">{lastLoginLabel}</span>
                        )}
                      </td>
                      <td className="px-2 py-2 font-mono">{u.adminIDSale || "—"}</td>
                      <td className="px-2 py-2">
                        <Link
                          href={`/admin/customers?q=${u.userID}`}
                          className="text-primary-600 hover:underline text-[11px]"
                        >
                          ดู
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination
        page={page}
        pageSize={DEFAULT_PAGE_SIZE}
        total={breachCount ?? 0}
        basePath="/admin/qa/new-client-no-contact"
        params={{}}
      />

      <p className="text-[11px] text-muted">
        Wave 10 Group B · SLA-breach audit · drill-in → /admin/customers เพื่อกำหนดเซลส์ + ติดต่อ
      </p>
    </main>
  );
}
