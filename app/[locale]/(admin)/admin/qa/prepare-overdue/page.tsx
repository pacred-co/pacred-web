/**
 * /admin/qa/prepare-overdue — เตรียมส่งเกินกำหนด (Wave 10 Group B · SLA-breach queue)
 *
 * Lists tb_forwarder rows with fstatus='4' (ถึงไทยแล้ว) where fdatestatus4
 * is older than 3 days — goods that arrived in Thailand but never moved on
 * to fstatus='6' (เตรียมส่ง) or fstatus='7' (ส่งแล้ว) within the 3-day
 * preparation SLA. Different from `ownerless-goods` — these have an owner;
 * the issue is the prep step (weighing / labelling / driver dispatch) is
 * stuck.
 *
 * Pattern source: /admin/forwarder-action (9-queue SLA audit) +
 * /admin/yuan-payments (status chips + 2-query tb_users merge).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { nowMs, cutoffIsoDaysAgo } from "@/lib/datetime-helpers";
import { parsePage, pageRange, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { CustomerCodeLink } from "@/components/admin/customer-code-link";
import { CsvButton, type CsvCol, type CsvRow } from "@/components/admin/csv-button";
import { resolveBillingIdentity, fetchCorporateNameMap, corpRowFromName } from "@/lib/admin/customer-identity";
import { exportQaPrepareOverdueAll } from "@/actions/admin/export/qa-prepare-overdue";

export const dynamic = "force-dynamic";

const CSV_COLS: CsvCol[] = [
  { key: "id", label: "ID" },
  { key: "arrived", label: "ถึงไทยเมื่อ" },
  { key: "days_waiting", label: "ค้างมา (วัน)" },
  { key: "userid", label: "รหัสลูกค้า" },
  { key: "customer", label: "ลูกค้า" },
  { key: "phone", label: "เบอร์โทร" },
  { key: "tracking_th", label: "tracking ไทย" },
  { key: "cabinet", label: "เบอร์ตู้" },
  { key: "warehouse", label: "จาก" },
  { key: "transport", label: "ขนส่ง" },
  { key: "weight", label: "น้ำหนัก" },
  { key: "volume", label: "cbm" },
  { key: "price", label: "ราคา" },
  { key: "note", label: "หมายเหตุ" },
];

type FwdRow = {
  id: number;
  fdate: string | null;
  fdatestatus4: string | null;
  fstatus: string | null;
  fcabinetnumber: string | null;
  ftrackingchn: string | null;
  ftrackingth: string | null;
  fwarehousechina: string | null;
  ftransporttype: string | null;
  fweight: number | null;
  fvolume: number | null;
  ftotalprice: number | null;
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

export default async function PrepareOverduePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin(["ops", "accounting", "super"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  const page = parsePage(sp.page);
  const { from, to } = pageRange(page);

  // 3-day prep SLA: rows arrived (fstatus='4') more than 3 days ago and
  // still haven't moved to '6' (เตรียมส่ง) or '7' (ส่งแล้ว) — since this
  // query already filters fstatus='4', "still pending prep" = the natural
  // result set.
  const cutoff = cutoffIsoDaysAgo(3);

  // Exact total via count:"exact" on the same query — Wave 10 bug-fix
  // 2026-05-23 (was using rows.length).
  const { data: rowsRaw, error, count: breachCount } = await admin
    .from("tb_forwarder")
    .select(
      "id,fdate,fdatestatus4,fstatus,fcabinetnumber,ftrackingchn,ftrackingth," +
        "fwarehousechina,ftransporttype,fweight,fvolume,ftotalprice,fnote,userid",
      { count: "exact" },
    )
    .eq("fstatus", "4")
    .lt("fdatestatus4", cutoff)
    .order("fdatestatus4", { ascending: true })
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

  // On-screen rows → flat CsvRow[] (mirrors the <thead> + the export action).
  const csvRows: CsvRow[] = rows.map((r) => {
    const u = r.userid ? userMap.get(r.userid) : undefined;
    const customerName = customerNameOf(u, r.userid);
    const daysWaiting = r.fdatestatus4
      ? Math.floor((now - new Date(r.fdatestatus4).getTime()) / (24 * 60 * 60 * 1000))
      : 0;
    return {
      id: r.id,
      arrived: r.fdatestatus4 ? String(r.fdatestatus4).slice(0, 10) : "",
      days_waiting: daysWaiting,
      userid: r.userid ?? "",
      customer: customerName,
      phone: u?.userTel ?? "",
      tracking_th: r.ftrackingth ?? "",
      cabinet: r.fcabinetnumber ?? "",
      warehouse: WAREHOUSE_LABEL[r.fwarehousechina ?? ""] ?? r.fwarehousechina ?? "",
      transport: TRANSPORT_LABEL[r.ftransporttype ?? ""] ?? "",
      weight: r.fweight != null ? `${Number(r.fweight).toFixed(1)} kg` : "",
      volume: r.fvolume != null ? `${Number(r.fvolume).toFixed(3)} cbm` : "",
      price: Number(r.ftotalprice ?? 0).toLocaleString("th-TH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      note: r.fnote ?? "",
    };
  });

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · QA · SLA</p>
        <div className="mt-1 flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">เตรียมส่งเกินกำหนด</h1>
          <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
            {breachCount ?? rows.length} รายการ
          </span>
          <Link href="/admin/qa" className="text-xs text-primary-600 hover:underline">
            ← กลับ QA hub
          </Link>
          <div className="ml-auto">
            <CsvButton
              rows={csvRows}
              cols={CSV_COLS}
              filename="qa-prepare-overdue.csv"
              fetchAll={async () => {
                "use server";
                return exportQaPrepareOverdueAll();
              }}
            />
          </div>
        </div>
        <p className="mt-1 text-xs text-muted">
          tb_forwarder · fstatus=&apos;4&apos; (ถึงไทยแล้ว) AND fdatestatus4 &lt; NOW() − 3 วัน
          (ยังไม่ย้ายไป &apos;6&apos; เตรียมส่ง หรือ &apos;7&apos; ส่งแล้ว) · เรียงเก่าสุดก่อน
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
            <p className="text-sm font-medium text-foreground">ไม่มีรายการเตรียมส่งเกินกำหนด</p>
            <p className="text-xs text-muted">ทุกรายการที่ถึงไทยจัดเตรียมส่งภายใน 3 วันแล้ว</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-surface-alt/50 text-left text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-2 py-2">ID</th>
                  <th className="px-2 py-2">ถึงไทยเมื่อ</th>
                  <th className="px-2 py-2">ค้างมา</th>
                  <th className="px-2 py-2">ลูกค้า</th>
                  <th className="px-2 py-2">tracking ไทย</th>
                  <th className="px-2 py-2">เบอร์ตู้</th>
                  <th className="px-2 py-2">จาก</th>
                  <th className="px-2 py-2">ขนส่ง</th>
                  <th className="px-2 py-2 text-right">น้ำหนัก/cbm</th>
                  <th className="px-2 py-2 text-right">ราคา</th>
                  <th className="px-2 py-2">หมายเหตุ</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const u = r.userid ? userMap.get(r.userid) : undefined;
                  const customerName = customerNameOf(u, r.userid) || "—";
                  const daysWaiting = r.fdatestatus4
                    ? Math.floor((now - new Date(r.fdatestatus4).getTime()) / (24 * 60 * 60 * 1000))
                    : 0;
                  const severity =
                    daysWaiting >= 10 ? "bg-red-100 text-red-700 border-red-200"
                    : daysWaiting >= 5 ? "bg-orange-100 text-orange-700 border-orange-200"
                    : "bg-yellow-100 text-yellow-700 border-yellow-200";
                  return (
                    <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                      <td className="px-2 py-2 font-mono">{r.id}</td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {r.fdatestatus4 ? String(r.fdatestatus4).slice(0, 10) : "—"}
                      </td>
                      <td className="px-2 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${severity}`}>
                          {daysWaiting} วัน
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <CustomerCodeLink code={r.userid} className="text-[11px]" />
                        <div>{customerName}</div>
                        {u?.userTel ? <div className="text-muted text-[11px]">{u.userTel}</div> : null}
                      </td>
                      <td className="px-2 py-2 font-mono">{r.ftrackingth || "—"}</td>
                      <td className="px-2 py-2 font-mono">{r.fcabinetnumber || "—"}</td>
                      <td className="px-2 py-2">{WAREHOUSE_LABEL[r.fwarehousechina ?? ""] ?? r.fwarehousechina ?? "—"}</td>
                      <td className="px-2 py-2">{TRANSPORT_LABEL[r.ftransporttype ?? ""] ?? "—"}</td>
                      <td className="px-2 py-2 text-right font-mono text-[11px]">
                        {r.fweight ? `${Number(r.fweight).toFixed(1)} kg` : "—"}
                        {r.fvolume ? <div className="text-muted text-[11px]">{Number(r.fvolume).toFixed(3)} cbm</div> : null}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-[11px]">
                        ฿{Number(r.ftotalprice ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-2 py-2 max-w-[180px] truncate" title={r.fnote ?? ""}>
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
        basePath="/admin/qa/prepare-overdue"
      />

      <p className="text-[11px] text-muted">
        Wave 10 Group B · SLA-breach audit · drill-in → /admin/forwarders เพื่อเปลี่ยน fstatus
      </p>
    </main>
  );
}
