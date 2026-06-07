/**
 * /admin/qa/credit-overdue — เครดิตเกินกำหนด (Wave 10 · Group A · SLA-breach queue)
 *
 * Surfaces tb_forwarder credit-line orders (fcredit='1') whose fcreditdate
 * (the agreed pay-back deadline) is in the past. Each breach = a customer
 * we extended credit to who has missed their settlement window.
 *
 * This is a direct port of the same condition powering legacy
 * forwarder-action.php fCreditError + the matching /admin/forwarder-action
 * "fCreditError" queue (kept) — surfaced here as a top-level SLA-breach
 * queue so an accountant can hit it from /admin/qa without drilling into
 * the catch-all forwarder-action menu.
 *
 * SLA rule:  fcredit = '1' (credit-line) AND fcreditdate < NOW()
 * Data:      tb_forwarder list + tb_users merge.
 * Order:     fcreditdate ASC — most-overdue first.
 * Limit:     200 rows.
 * Drill-in:  ดู / แก้ไข → /admin/forwarders/<fidorco or id>
 *
 * Auth: requireAdmin(["ops","accounting"]). Super implicit.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { parsePage, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { exportQaCreditOverdueAll } from "@/actions/admin/export/qa-credit-overdue";

export const dynamic = "force-dynamic";

type FRow = {
  id: number;
  fdate: string | null;
  fidorco: string | null;
  fcabinetnumber: string | null;
  fstatus: string | null;
  fcredit: string | null;
  fcreditdate: string | null;
  ftotalprice: number | null;
  fnote: string | null;
  userid: string | null;
};

type URow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
};

/** Helpers — wrap Date.now() so Next 16 / React 19 `react-hooks/purity`
 *  doesn't flag the call inside the Server Component render body. */
function nowIso(): string {
  return new Date(Date.now()).toISOString();
}
function daysSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

const STATUS_LABEL: Record<string, string> = {
  "1": "รอเข้าโกดังจีน",
  "2": "ถึงโกดังจีนแล้ว",
  "3": "กำลังส่งมาไทย",
  "4": "ถึงไทยแล้ว",
  "5": "รอชำระเงิน",
  "6": "เตรียมส่ง",
  "7": "ส่งแล้ว",
  "99": "พิเศษ",
};

export default async function AdminQaCreditOverduePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin(["ops", "accounting"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  const now = nowIso();

  const { data: rowsRaw, error } = await admin
    .from("tb_forwarder")
    .select(
      "id,fdate,fidorco,fcabinetnumber,fstatus,fcredit,fcreditdate,ftotalprice,fnote,userid",
    )
    .eq("fcredit", "1")
    .lt("fcreditdate", now)
    .order("fcreditdate", { ascending: true })
    .limit(200);

  const rows = (rowsRaw ?? []) as unknown as FRow[];

  const userIds = Array.from(new Set(rows.map((r) => r.userid).filter(Boolean))) as string[];
  let userMap = new Map<string, URow>();
  if (userIds.length > 0) {
    const { data: usersRaw, error: usersRawErr } = await admin
      .from("tb_users")
      .select("userID,userName,userLastName,userTel")
      .in("userID", userIds);
    if (usersRawErr) {
      console.error(`[tb_users list] failed`, { code: usersRawErr.code, message: usersRawErr.message });
    }
    userMap = new Map(((usersRaw ?? []) as unknown as URow[]).map((u) => [u.userID, u]));
  }

  const { count: breachCount } = await admin
    .from("tb_forwarder")
    .select("id", { count: "exact", head: true })
    .eq("fcredit", "1")
    .lt("fcreditdate", now);

  // Total exposure = sum of overdue ftotalprice (the money on the line)
  const totalExposure = rows.reduce((acc, r) => acc + Number(r.ftotalprice ?? 0), 0);

  // PERF (2026-06-03): paginate the DISPLAYED table (50/page). The exposure
  // sum + breach chip stay computed over the full fetched set; we only slice
  // the rows we render.
  const page = parsePage(sp.page);
  const offset = (page - 1) * DEFAULT_PAGE_SIZE;
  const pageRows = rows.slice(offset, offset + DEFAULT_PAGE_SIZE);

  // CSV: flatten the displayed page rows → flat {key:value}; cols mirror <thead>.
  const csvRows: CsvRow[] = pageRows.map((r) => {
    const u = r.userid ? userMap.get(r.userid) : undefined;
    const customerName = u
      ? `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim() || (r.userid ?? "")
      : (r.userid ?? "");
    return {
      fidorco: r.fidorco ?? `#${r.id}`,
      userid: r.userid ?? "",
      customer: customerName,
      tel: u?.userTel ?? "",
      fdate: r.fdate ? r.fdate.slice(0, 10) : "",
      fcreditdate: r.fcreditdate ? r.fcreditdate.slice(0, 10) : "",
      lateDays: daysSince(r.fcreditdate),
      fcabinetnumber: r.fcabinetnumber || "",
      status: STATUS_LABEL[r.fstatus ?? ""] ?? r.fstatus ?? "",
      ftotalprice: Number(r.ftotalprice ?? 0).toFixed(2),
    };
  });
  const csvCols = [
    { key: "fidorco", label: "เลขที่ F" },
    { key: "userid", label: "รหัสลูกค้า" },
    { key: "customer", label: "ลูกค้า" },
    { key: "tel", label: "เบอร์โทร" },
    { key: "fdate", label: "วันที่สร้าง" },
    { key: "fcreditdate", label: "ครบกำหนด" },
    { key: "lateDays", label: "เลทไป (วัน)" },
    { key: "fcabinetnumber", label: "เบอร์ตู้" },
    { key: "status", label: "สถานะ" },
    { key: "ftotalprice", label: "ยอด (THB)" },
  ];

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · QA · SLA-BREACH</p>
        <div className="mt-1 flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">เครดิตเกินกำหนด</h1>
          {breachCount ? (
            <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
              {breachCount} รายการเกินกำหนด
            </span>
          ) : (
            <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
              ทันเวลา
            </span>
          )}
          {totalExposure > 0 ? (
            <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700">
              เงินค้าง ≈ ฿{totalExposure.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          ) : null}
          <Link href="/admin/qa" className="text-xs text-primary-600 hover:underline">
            ← กลับหน้า QA
          </Link>
        </div>
        <p className="text-xs text-muted mt-1">
          tb_forwarder · fcredit = &apos;1&apos; AND fcreditdate &lt; NOW() · เรียงเก่าสุดก่อน
        </p>
        </div>
        <CsvButton
          rows={csvRows}
          cols={csvCols}
          filename={`qa-credit-overdue-${new Date().toISOString().slice(0, 10)}.csv`}
          fetchAll={async () => {
            "use server";
            return exportQaCreditOverdueAll();
          }}
        />
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
            <p className="text-xs text-muted">ลูกค้าเครดิตทุกคนชำระเงินภายในกำหนดแล้ว</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-3">เลขที่ F</th>
                  <th className="px-3 py-3">ลูกค้า</th>
                  <th className="px-3 py-3">วันที่สร้าง</th>
                  <th className="px-3 py-3">ครบกำหนด</th>
                  <th className="px-3 py-3 text-right">เลทไป</th>
                  <th className="px-3 py-3">เบอร์ตู้</th>
                  <th className="px-3 py-3">สถานะ</th>
                  <th className="px-3 py-3 text-right">ยอด (THB)</th>
                  <th className="px-3 py-3">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const u = r.userid ? userMap.get(r.userid) : undefined;
                  const customerName = u
                    ? `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim() || r.userid
                    : r.userid ?? "—";
                  const lateDays = daysSince(r.fcreditdate);
                  const drillKey = r.fidorco ?? String(r.id);
                  return (
                    <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                      <td className="px-3 py-3 font-mono text-xs">
                        <Link
                          href={`/admin/forwarders/${encodeURIComponent(drillKey)}`}
                          className="text-primary-600 hover:underline"
                        >
                          {r.fidorco ?? `#${r.id}`}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <div className="font-mono">{r.userid ?? "—"}</div>
                        <div>{customerName}</div>
                        {u?.userTel ? <div className="text-muted">{u.userTel}</div> : null}
                      </td>
                      <td className="px-3 py-3 text-xs whitespace-nowrap">
                        {r.fdate ? new Date(r.fdate).toLocaleDateString("th-TH") : "—"}
                      </td>
                      <td className="px-3 py-3 text-xs whitespace-nowrap text-red-700 font-medium">
                        {r.fcreditdate
                          ? new Date(r.fcreditdate).toLocaleDateString("th-TH")
                          : "—"}
                      </td>
                      <td className="px-3 py-3 text-right text-xs">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                            lateDays >= 30
                              ? "bg-red-100 text-red-700 border-red-200"
                              : lateDays >= 7
                                ? "bg-orange-100 text-orange-700 border-orange-200"
                                : "bg-yellow-100 text-yellow-700 border-yellow-200"
                          }`}
                        >
                          เลท {lateDays} วัน
                        </span>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">{r.fcabinetnumber || "—"}</td>
                      <td className="px-3 py-3 text-xs">
                        {STATUS_LABEL[r.fstatus ?? ""] ?? r.fstatus ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs">
                        ฿{Number(r.ftotalprice ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <Link
                          href={`/admin/forwarders/${encodeURIComponent(drillKey)}`}
                          className="text-primary-600 hover:underline"
                        >
                          ดู / แก้ไข
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={page}
          pageSize={DEFAULT_PAGE_SIZE}
          total={rows.length}
          basePath="/admin/qa/credit-overdue"
          params={{}}
        />
      </div>

      <p className="text-[11px] text-muted">
        เรียง <code>fcreditdate</code> ASC (เลทสุดขึ้นก่อน) · ตามลูกค้าทาง LINE / โทร / ตัดสินใจปรับเป็นไม่ใช่เครดิต
      </p>
    </main>
  );
}
