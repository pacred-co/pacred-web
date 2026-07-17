/**
 * /admin/qa/pay-shop-over-1d — รอชำระสินค้าเกิน 1 วัน (Wave 10 · Group A · SLA-breach queue)
 *
 * Surfaces tb_header_order rows where the customer has been parked on
 * hstatus='2' (รอชำระเงิน) for more than 24 hours. Each breach = a
 * customer at risk of giving up + the wallet topup never landing.
 *
 * Faithful-port lens (D1 / ADR-0017): the legacy menu-QAAndQC.php hub
 * lists this queue but legacy renders it as a sub-tab of the global
 * report-shops.php. Pacred surfaces it as a dedicated /admin/qa/<slug>
 * page so operators can hit it directly + ack each row, matching the
 * cleaner Pacred ops pattern (mirrors /admin/forwarder-action queues).
 *
 * SLA rule:  hstatus = '2' (รอชำระเงิน) AND hdate < NOW() - 1 day
 * Data:      tb_header_order list + tb_users merge (2-query pattern,
 *            same as /admin/yuan-payments + /admin/wallet because
 *            PostgREST FK auto-join is unreliable on the legacy schema).
 * Order:     hdate ASC — oldest-overdue surface first (operator triage).
 * Limit:     200 rows (matches sibling list pages).
 * Drill-in:  ดู / แก้ไข → /admin/service-orders/<hno>
 *
 * Auth: requireAdmin(["ops","accounting","super"]) — money-adjacent
 *       triage; mirrors the page-level gate the wallet/yuan-payments
 *       pages already enforce. Super is implicit in requireAdmin.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { parsePage, pageRange, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { CustomerCodeLink } from "@/components/admin/customer-code-link";
import { CsvButton, type CsvCol, type CsvRow } from "@/components/admin/csv-button";
import { resolveBillingIdentity, fetchCorporateNameMap, corpRowFromName } from "@/lib/admin/customer-identity";
import { exportQaPayShopOver1dAll } from "@/actions/admin/export/qa-pay-shop-over-1d";

export const dynamic = "force-dynamic";

type HRow = {
  id: number;
  hno: string | null;
  hdate: string | null;
  hdatepayment: string | null;
  htitle: string | null;
  hcover: string | null;
  hcount: number | null;
  hstatus: string | null;
  htotalpricechn: number | null;
  htotalpriceuser: number | null;
  hrate: number | null;
  userid: string | null;
};

type URow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
  userCompany: string | null;
};

/** ms since epoch · helper because Next 16 / React 19 `react-hooks/purity`
 *  flags raw Date.now() calls inside Server Component render bodies. */
function nowMs(): number {
  return Date.now();
}

/** Floor of (now − iso) in days; 0 when iso is null/invalid. */
function daysSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((nowMs() - new Date(iso).getTime()) / 86_400_000);
}

export default async function AdminQaPayShopOver1dPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin(["ops", "accounting"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  const page = parsePage(sp.page);
  const { from, to } = pageRange(page);

  // SLA cutoff: 24h ago, ISO string. tb_header_order.hdate is a timestamp.
  const cutoff = new Date(nowMs() - 24 * 60 * 60 * 1000).toISOString();

  const { data: rowsRaw, error, count: breachCount } = await admin
    .from("tb_header_order")
    .select(
      "id,hno,hdate,hdatepayment,htitle,hcover,hcount,hstatus,htotalpricechn,htotalpriceuser,hrate,userid",
      { count: "exact" },
    )
    .eq("hstatus", "2")
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

  // CSV columns mirror the <thead> labels (Thai). "จัดการ" (drill-in link) is omitted.
  const csvCols: CsvCol[] = [
    { key: "hno", label: "เลขที่ออเดอร์" },
    { key: "userid", label: "รหัสลูกค้า" },
    { key: "customer", label: "ลูกค้า" },
    { key: "tel", label: "เบอร์โทร" },
    { key: "hdate", label: "วันที่สร้าง" },
    { key: "age_days", label: "รออายุ (วัน)" },
    { key: "htitle", label: "สินค้า" },
    { key: "hcount", label: "จำนวน" },
    { key: "total_cny", label: "ราคารวม (¥)" },
    { key: "total_thb", label: "ราคารวม (THB)" },
  ];

  // Map the on-screen (paginated) rows → flat CsvRow[] for "⬇ CSV หน้านี้".
  const csvRows: CsvRow[] = rows.map((r) => {
    const u = r.userid ? userMap.get(r.userid) : undefined;
    const customerName = customerNameOf(u, r.userid);
    return {
      hno: r.hno ?? "",
      userid: r.userid ?? "",
      customer: customerName,
      tel: u?.userTel ?? "",
      hdate: r.hdate ? r.hdate.slice(0, 10) : "",
      age_days: daysSince(r.hdate),
      htitle: r.htitle ?? "",
      hcount: r.hcount ?? 0,
      total_cny: Number(r.htotalpricechn ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      total_thb: Number(r.htotalpriceuser ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    };
  });

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · QA · SLA-BREACH</p>
        <div className="mt-1 flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">รอชำระสินค้าเกิน 1 วัน</h1>
          {breachCount ? (
            <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
              {breachCount} รายการเกินกำหนด
            </span>
          ) : (
            <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
              ทันเวลา
            </span>
          )}
          <Link href="/admin/qa" className="text-xs text-primary-600 hover:underline">
            ← กลับหน้า QA
          </Link>
          <div className="ml-auto">
            <CsvButton
              rows={csvRows}
              cols={csvCols}
              filename="qa-pay-shop-over-1d.csv"
              fetchAll={async () => {
                "use server";
                return exportQaPayShopOver1dAll();
              }}
            />
          </div>
        </div>
        <p className="text-xs text-muted mt-1">
          tb_header_order · hstatus = &apos;2&apos; (รอชำระเงิน) AND hdate &lt; NOW() − 1 วัน · เรียงเก่าสุดก่อน
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
            <p className="text-xs text-muted">ลูกค้าทุกคนชำระเงินภายใน 1 วันแล้ว</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-3">เลขที่ออเดอร์</th>
                  <th className="px-3 py-3">ลูกค้า</th>
                  <th className="px-3 py-3">วันที่สร้าง</th>
                  <th className="px-3 py-3 text-right">รออายุ</th>
                  <th className="px-3 py-3">สินค้า</th>
                  <th className="px-3 py-3 text-right">ราคารวม (¥)</th>
                  <th className="px-3 py-3 text-right">ราคารวม (THB)</th>
                  <th className="px-3 py-3">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const u = r.userid ? userMap.get(r.userid) : undefined;
                  const customerName = customerNameOf(u, r.userid) || "—";
                  const ageDays = daysSince(r.hdate);
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
                            ageDays >= 7
                              ? "bg-red-100 text-red-700 border-red-200"
                              : ageDays >= 3
                                ? "bg-orange-100 text-orange-700 border-orange-200"
                                : "bg-yellow-100 text-yellow-700 border-yellow-200"
                          }`}
                        >
                          {ageDays} วัน
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs max-w-[260px] truncate" title={r.htitle ?? ""}>
                        {r.htitle ?? "—"}
                        {r.hcount ? <span className="text-muted"> ({r.hcount})</span> : null}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs">
                        ¥{Number(r.htotalpricechn ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs">
                        ฿{Number(r.htotalpriceuser ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                        {r.hrate ? <div className="text-muted text-[11px]">@ {Number(r.hrate).toFixed(2)}</div> : null}
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
        basePath="/admin/qa/pay-shop-over-1d"
      />

      <p className="text-[11px] text-muted">
        เรียง <code>hdate</code> ASC (เก่าสุด/เลทสุดขึ้นก่อน) · กดเข้าหน้ารายละเอียดเพื่อตามลูกค้า / ยกเลิกออเดอร์
      </p>
    </main>
  );
}
