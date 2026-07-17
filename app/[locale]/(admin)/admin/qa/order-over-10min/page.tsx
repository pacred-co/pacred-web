/**
 * /admin/qa/order-over-10min — สั่งซื้อรอเกิน 10 นาที (Wave 10 · Group A · SLA-breach queue)
 *
 * Surfaces brand-new ฝากสั่ง orders parked on hstatus='1' (รอดำเนินการ —
 * customer submitted, admin hasn't acted) for more than 10 minutes.
 * Tightest SLA in the QA hub — measures "how fast does the team respond
 * to a fresh order". Each breach = a customer watching the dashboard
 * waiting for the order to move into ราคาสรุป + payment-due state.
 *
 * SLA rule:  hstatus = '1' (รอดำเนินการ) AND hdate < NOW() - 10 minutes
 * Data:      tb_header_order list + tb_users merge.
 * Order:     hdate ASC — oldest-overdue first.
 * Limit:     200 rows.
 * Drill-in:  ดู / แก้ไข → /admin/service-orders/<hno>
 *
 * NB: The "10 minutes" rule is deliberately tight — it makes the breach
 * obvious even on a Sunday and lets the team gate working hours by
 * silencing/sorting this queue. (The legacy QA hub doc lists the same
 * threshold — see /admin/qa/page.tsx QA_QUEUES.)
 *
 * Auth: requireAdmin(["ops","accounting"]). Super implicit.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { parsePage, pageRange, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { CustomerCodeLink } from "@/components/admin/customer-code-link";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { resolveBillingIdentity, fetchCorporateNameMap, corpRowFromName } from "@/lib/admin/customer-identity";
import { exportQaOrderOver10MinAll } from "@/actions/admin/export/qa-order-over-10min";

const CSV_COLS = [
  { key: "hno", label: "เลขที่ออเดอร์" },
  { key: "userid", label: "รหัสลูกค้า" },
  { key: "customer", label: "ลูกค้า" },
  { key: "tel", label: "เบอร์โทร" },
  { key: "hdate", label: "วันที่สร้าง" },
  { key: "age", label: "รอ" },
  { key: "htitle", label: "สินค้า" },
  { key: "hcount", label: "จำนวน" },
  { key: "htransporttype", label: "โหมดขนส่ง" },
  { key: "htotalpricechn", label: "ราคารวม (¥)" },
  { key: "hnoteuser", label: "หมายเหตุลูกค้า" },
];

export const dynamic = "force-dynamic";

type HRow = {
  id: number;
  hno: string | null;
  hdate: string | null;
  htitle: string | null;
  hcount: number | null;
  hstatus: string | null;
  htotalpricechn: number | null;
  hnote: string | null;
  hnoteuser: string | null;
  htransporttype: string | null;
  userid: string | null;
};

type URow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
  userCompany: string | null;
};

/** Helpers — wrap Date.now() so Next 16 / React 19 `react-hooks/purity`
 *  doesn't flag the call inside the Server Component render body. */
function nowMs(): number {
  return Date.now();
}
function minutesSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
}

export default async function AdminQaOrderOver10MinPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin(["ops", "accounting"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  const page = parsePage(sp.page);
  const { from, to } = pageRange(page);

  const cutoff = new Date(nowMs() - 10 * 60 * 1000).toISOString();

  const { data: rowsRaw, error, count: breachCount } = await admin
    .from("tb_header_order")
    .select(
      "id,hno,hdate,htitle,hcount,hstatus,htotalpricechn,hnote,hnoteuser,htransporttype,userid",
      { count: "exact" },
    )
    .eq("hstatus", "1")
    .lt("hdate", cutoff)
    .order("hdate", { ascending: true })
    .range(from, to);

  const rows = (rowsRaw ?? []) as unknown as HRow[];

  const userIds = Array.from(new Set(rows.map((r) => r.userid).filter(Boolean))) as string[];
  let userMap = new Map<string, URow>();
  const corpNames = await fetchCorporateNameMap(admin, userIds);
  if (userIds.length > 0) {
    const { data: usersRaw, error: usersRawErr } = await admin
      .from("tb_users")
      .select("userID,userName,userLastName,userTel,userCompany")
      .in("userID", userIds);
    if (usersRawErr) {
      console.error(`[tb_users list] failed`, { code: usersRawErr.code, message: usersRawErr.message });
    }
    userMap = new Map(((usersRaw ?? []) as unknown as URow[]).map((u) => [u.userID, u]));
  }
  // นิติบุคคล → company name (not the contact person) · display-only. Falls
  // back to the userid when the customer row/name is missing.
  const customerNameOf = (u: URow | undefined, uid: string | null | undefined): string =>
    (u
      ? resolveBillingIdentity({
          userCompany: u.userCompany,
          userName: u.userName,
          userLastName: u.userLastName,
          corp: corpRowFromName(corpNames.get(u.userID)),
        }).name
      : "") || (uid ?? "");

  // Map the on-screen (paginated) rows → flat CsvRow[] mirroring the <thead>.
  const csvRows: CsvRow[] = rows.map((r) => {
    const u = r.userid ? userMap.get(r.userid) : undefined;
    const customerName = customerNameOf(u, r.userid);
    const ageMin = minutesSince(r.hdate);
    const ageLabel =
      ageMin >= 60 * 24
        ? `${Math.floor(ageMin / (60 * 24))} วัน`
        : ageMin >= 60
          ? `${Math.floor(ageMin / 60)} ชม.`
          : `${ageMin} นาที`;
    return {
      hno: r.hno ?? "",
      userid: r.userid ?? "",
      customer: customerName,
      tel: u?.userTel ?? "",
      hdate: (r.hdate ?? "").slice(0, 10),
      age: ageLabel,
      htitle: r.htitle ?? "",
      hcount: r.hcount ?? "",
      htransporttype: r.htransporttype ?? "",
      htotalpricechn: Number(r.htotalpricechn ?? 0).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      hnoteuser: r.hnoteuser ?? "",
    };
  });

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · QA · SLA-BREACH</p>
        <div className="mt-1 flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">สั่งซื้อรอเกิน 10 นาที</h1>
          {breachCount ? (
            <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
              {breachCount} รายการรอตอบ
            </span>
          ) : (
            <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
              ทุกออเดอร์ตอบทันเวลา
            </span>
          )}
          <Link href="/admin/qa" className="text-xs text-primary-600 hover:underline">
            ← กลับหน้า QA
          </Link>
          <div className="ml-auto">
            <CsvButton
              rows={csvRows}
              cols={CSV_COLS}
              filename="qa-สั่งซื้อรอเกิน10นาที.csv"
              fetchAll={async () => {
                "use server";
                return exportQaOrderOver10MinAll();
              }}
            />
          </div>
        </div>
        <p className="text-xs text-muted mt-1">
          tb_header_order · hstatus = &apos;1&apos; (รอดำเนินการ) AND hdate &lt; NOW() − 10 นาที · เรียงเก่าสุดก่อน
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
            <p className="text-sm font-medium text-foreground">ไม่มีรายการ — ทุกอย่างทันเวลา!</p>
            <p className="text-xs text-muted">ทีมตอบออเดอร์ใหม่ทุกอันภายใน 10 นาที</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-3">เลขที่ออเดอร์</th>
                  <th className="px-3 py-3">ลูกค้า</th>
                  <th className="px-3 py-3">วันที่สร้าง</th>
                  <th className="px-3 py-3 text-right">รอ</th>
                  <th className="px-3 py-3">สินค้า</th>
                  <th className="px-3 py-3">โหมดขนส่ง</th>
                  <th className="px-3 py-3 text-right">ราคารวม (¥)</th>
                  <th className="px-3 py-3">หมายเหตุลูกค้า</th>
                  <th className="px-3 py-3">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const u = r.userid ? userMap.get(r.userid) : undefined;
                  const customerName = customerNameOf(u, r.userid) || "—";
                  const ageMin = minutesSince(r.hdate);
                  const ageLabel =
                    ageMin >= 60 * 24
                      ? `${Math.floor(ageMin / (60 * 24))} วัน`
                      : ageMin >= 60
                        ? `${Math.floor(ageMin / 60)} ชม.`
                        : `${ageMin} นาที`;
                  return (
                    <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                      <td className="px-3 py-3 font-mono text-xs">
                        {r.hno ? (
                          <Link
                            href={`/admin/service-orders/${encodeURIComponent(r.hno)}`}
                            className="text-primary-600 hover:underline"
                          >
                            {r.hno}
                          </Link>
                        ) : (
                          <span>—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <CustomerCodeLink code={r.userid} />
                        <div>{customerName}</div>
                        {u?.userTel ? <div className="text-muted">{u.userTel}</div> : null}
                      </td>
                      <td className="px-3 py-3 text-xs whitespace-nowrap">
                        {r.hdate
                          ? new Date(r.hdate).toLocaleString("th-TH", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })
                          : "—"}
                      </td>
                      <td className="px-3 py-3 text-right text-xs">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                            ageMin >= 60 * 24
                              ? "bg-red-100 text-red-700 border-red-200"
                              : ageMin >= 60
                                ? "bg-orange-100 text-orange-700 border-orange-200"
                                : "bg-yellow-100 text-yellow-700 border-yellow-200"
                          }`}
                        >
                          {ageLabel}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs max-w-[260px] truncate" title={r.htitle ?? ""}>
                        {r.htitle ?? "—"}
                        {r.hcount ? <span className="text-muted"> ({r.hcount})</span> : null}
                      </td>
                      <td className="px-3 py-3 text-xs">{r.htransporttype ?? "—"}</td>
                      <td className="px-3 py-3 text-right font-mono text-xs">
                        ¥{Number(r.htotalpricechn ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </td>
                      <td
                        className="px-3 py-3 text-xs max-w-[240px] truncate"
                        title={r.hnoteuser ?? ""}
                      >
                        {r.hnoteuser ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {r.hno ? (
                          <Link
                            href={`/admin/service-orders/${encodeURIComponent(r.hno)}`}
                            className="text-primary-600 hover:underline"
                          >
                            ดู / แก้ไข
                          </Link>
                        ) : null}
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
        basePath="/admin/qa/order-over-10min"
        params={{}}
      />

      <p className="text-[11px] text-muted">
        เรียง <code>hdate</code> ASC (รอมานานสุดขึ้นก่อน) · ตอบลูกค้าให้เร็ว → สรุปราคา → เลื่อนสถานะเป็น 2
      </p>
    </main>
  );
}
