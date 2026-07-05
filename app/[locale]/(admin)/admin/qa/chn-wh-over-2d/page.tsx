/**
 * /admin/qa/chn-wh-over-2d — รอเข้าโกดังจีนเกิน 2 วัน (Wave 10 Group B · SLA-breach queue)
 *
 * Lists tb_forwarder rows with fstatus='1' (รอเข้าโกดังจีน) that haven't moved
 * to the next status in > 2 days from creation (fdate). Legacy `menu-QAAndQC.php`
 * SLA-breach surface — one of 10 alert queues in the QA hub. Read-only audit
 * view; staff drill into /admin/forwarders/[id] to act on the row.
 *
 * Pattern source: /admin/forwarder-action (9-queue SLA audit) +
 * /admin/yuan-payments (status chips + 2-query tb_users merge).
 *
 * fstatus taxonomy (verified prod 2026-05-23):
 *   1=รอเข้าโกดังจีน · 2=ถึงโกดังจีน · 3=กำลังส่งมาไทย · 4=ถึงไทยแล้ว ·
 *   5=รอชำระ · 6=เตรียมส่ง · 7=ส่งแล้ว · 99=สถานะพิเศษ
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { nowMs, cutoffIsoDaysAgo } from "@/lib/datetime-helpers";
import { parsePage, pageRange, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { CsvButton, type CsvRow, type CsvCol } from "@/components/admin/csv-button";
import { resolveBillingIdentity, fetchCorporateNameMap, corpRowFromName } from "@/lib/admin/customer-identity";
import { exportQaChnWhOver2dAll } from "@/actions/admin/export/qa-chn-wh-over-2d";

export const dynamic = "force-dynamic";

type FwdRow = {
  id: number;
  fdate: string | null;
  fstatus: string | null;
  fcabinetnumber: string | null;
  ftrackingchn: string | null;
  ftrackingth: string | null;
  fidorco: string | null;
  fwarehousechina: string | null;
  ftransporttype: string | null;
  fweight: number | null;
  fvolume: number | null;
  fnote: string | null;
  userid: string | null;
};

type URow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
  userCompany: string | null;
};

const WAREHOUSE_LABEL: Record<string, string> = {
  "1": "Yiwu",
  "2": "Guangzhou",
};

const TRANSPORT_LABEL: Record<string, string> = {
  "1": "รถ",
  "2": "เรือ",
  "3": "แอร์",
};

// CSV columns — Thai labels mirror the <thead> 1:1 (plus userid for export use).
const CSV_COLS: CsvCol[] = [
  { key: "id", label: "ID" },
  { key: "fdate", label: "วันที่สร้าง" },
  { key: "days_waiting", label: "รอมา (วัน)" },
  { key: "userid", label: "รหัสลูกค้า" },
  { key: "customer", label: "ลูกค้า" },
  { key: "tel", label: "เบอร์โทร" },
  { key: "warehouse", label: "โกดังจีน" },
  { key: "transport", label: "ขนส่ง" },
  { key: "tracking_chn", label: "tracking จีน" },
  { key: "cabinet", label: "เบอร์ตู้" },
  { key: "weight", label: "น้ำหนัก" },
  { key: "volume", label: "cbm" },
  { key: "note", label: "หมายเหตุ" },
];

export default async function ChnWhOver2dPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin(["ops", "accounting", "super"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  const page = parsePage(sp.page);
  const { from, to } = pageRange(page);

  // SLA cutoff — 2 days ago (rows created earlier than this AND still in
  // fstatus='1' have breached the "expected to enter China warehouse
  // within 2 days" SLA).
  const cutoff = cutoffIsoDaysAgo(2);

  // Exact total count via count:"exact" on the windowed query — accurate
  // even when > 200 breaches (was rows.length, capped at 200, Wave 10 fix).
  const { data: rowsRaw, error, count: breachCount } = await admin
    .from("tb_forwarder")
    .select(
      "id,fdate,fstatus,fcabinetnumber,ftrackingchn,ftrackingth,fidorco," +
        "fwarehousechina,ftransporttype,fweight,fvolume,fnote,userid",
      { count: "exact" },
    )
    .eq("fstatus", "1")
    .lt("fdate", cutoff)
    .order("fdate", { ascending: true })
    .range(from, to);

  const rows = (rowsRaw ?? []) as unknown as FwdRow[];

  // 2nd query: tb_users merge for customer name + phone
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

  const now = nowMs();

  // On-screen rows → flat CsvRow[] for the "CSV หน้านี้" button (same mapping
  // as the export-all action so the two CSVs are column-identical).
  const csvRows: CsvRow[] = rows.map((r) => {
    const u = r.userid ? userMap.get(r.userid) : undefined;
    const customerName = customerNameOf(u, r.userid);
    const daysWaiting = r.fdate
      ? Math.floor((now - new Date(r.fdate).getTime()) / (24 * 60 * 60 * 1000))
      : 0;
    return {
      id: r.id,
      fdate: r.fdate ? String(r.fdate).slice(0, 10) : "",
      days_waiting: daysWaiting,
      userid: r.userid ?? "",
      customer: customerName,
      tel: u?.userTel ?? "",
      warehouse: WAREHOUSE_LABEL[r.fwarehousechina ?? ""] ?? r.fwarehousechina ?? "",
      transport: TRANSPORT_LABEL[r.ftransporttype ?? ""] ?? "",
      tracking_chn: r.ftrackingchn ?? "",
      cabinet: r.fcabinetnumber ?? "",
      weight: r.fweight ? `${Number(r.fweight).toFixed(1)} kg` : "",
      volume: r.fvolume ? `${Number(r.fvolume).toFixed(3)} cbm` : "",
      note: r.fnote ?? "",
    } satisfies CsvRow;
  });

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · QA · SLA</p>
        <div className="mt-1 flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">รอเข้าโกดังจีนเกิน 2 วัน</h1>
          <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
            {breachCount ?? rows.length} รายการ
          </span>
          <Link
            href="/admin/qa"
            className="text-xs text-primary-600 hover:underline"
          >
            ← กลับ QA hub
          </Link>
          <div className="ml-auto">
            <CsvButton
              rows={csvRows}
              cols={CSV_COLS}
              filename="qa-รอเข้าโกดังจีนเกิน2วัน.csv"
              fetchAll={async () => {
                "use server";
                return exportQaChnWhOver2dAll();
              }}
            />
          </div>
        </div>
        <p className="mt-1 text-xs text-muted">
          tb_forwarder · fstatus=&apos;1&apos; (รอเข้าโกดังจีน) AND fdate &lt; NOW() − 2 วัน ·
          เรียงเก่าสุดก่อน · จำกัด 200 แถว
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
            <p className="text-sm font-medium text-foreground">ไม่มีรายการค้างเกิน SLA</p>
            <p className="text-xs text-muted">ทุกรายการเข้าโกดังจีนภายใน 2 วันแล้ว</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-surface-alt/50 text-left text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-2 py-2">ID</th>
                  <th className="px-2 py-2">วันที่สร้าง</th>
                  <th className="px-2 py-2">รอมา</th>
                  <th className="px-2 py-2">ลูกค้า</th>
                  <th className="px-2 py-2">โกดังจีน</th>
                  <th className="px-2 py-2">ขนส่ง</th>
                  <th className="px-2 py-2">tracking จีน</th>
                  <th className="px-2 py-2">เบอร์ตู้</th>
                  <th className="px-2 py-2 text-right">น้ำหนัก/cbm</th>
                  <th className="px-2 py-2">หมายเหตุ</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const u = r.userid ? userMap.get(r.userid) : undefined;
                  const customerName = customerNameOf(u, r.userid) || "—";
                  const daysWaiting = r.fdate
                    ? Math.floor((now - new Date(r.fdate).getTime()) / (24 * 60 * 60 * 1000))
                    : 0;
                  const severity =
                    daysWaiting >= 7 ? "bg-red-100 text-red-700 border-red-200"
                    : daysWaiting >= 4 ? "bg-orange-100 text-orange-700 border-orange-200"
                    : "bg-yellow-100 text-yellow-700 border-yellow-200";
                  return (
                    <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                      <td className="px-2 py-2 font-mono">{r.id}</td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {r.fdate ? String(r.fdate).slice(0, 10) : "—"}
                      </td>
                      <td className="px-2 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${severity}`}>
                          {daysWaiting} วัน
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <div className="font-mono text-[11px]">{r.userid ?? "—"}</div>
                        <div>{customerName}</div>
                        {u?.userTel ? <div className="text-muted text-[11px]">{u.userTel}</div> : null}
                      </td>
                      <td className="px-2 py-2">{WAREHOUSE_LABEL[r.fwarehousechina ?? ""] ?? r.fwarehousechina ?? "—"}</td>
                      <td className="px-2 py-2">{TRANSPORT_LABEL[r.ftransporttype ?? ""] ?? "—"}</td>
                      <td className="px-2 py-2 font-mono">{r.ftrackingchn || "—"}</td>
                      <td className="px-2 py-2 font-mono">{r.fcabinetnumber || "—"}</td>
                      <td className="px-2 py-2 text-right font-mono text-[11px]">
                        {r.fweight ? `${Number(r.fweight).toFixed(1)} kg` : "—"}
                        {r.fvolume ? <div className="text-muted text-[11px]">{Number(r.fvolume).toFixed(3)} cbm</div> : null}
                      </td>
                      <td className="px-2 py-2 max-w-[200px] truncate" title={r.fnote ?? ""}>
                        {r.fnote || "—"}
                      </td>
                      <td className="px-2 py-2">
                        <Link
                          href={`/admin/forwarders?q=${r.id}`}
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
        basePath="/admin/qa/chn-wh-over-2d"
        params={{}}
      />

      <p className="text-[11px] text-muted">
        Wave 10 Group B · SLA-breach audit · drill-in → /admin/forwarders
      </p>
    </main>
  );
}
