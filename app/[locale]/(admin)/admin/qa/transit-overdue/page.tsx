/**
 * /admin/qa/transit-overdue — กำลังมาไทยเกินกำหนด (Wave 10 Group B · SLA-breach queue)
 *
 * Lists tb_forwarder rows with fstatus='3' (กำลังส่งมาไทย) that have been in
 * transit too long. Heuristic: rows where fdate3 (timestamp when status moved
 * to '3') is older than 7 days. Falls back to fdate (creation date) if
 * fdate3 is null — covers legacy rows that pre-date the status-timestamp
 * tracking.
 *
 * NB: legacy `transit-overdue` uses per-container ETA (rows in tb_cnt with
 * cntDateETA — the proper container model). The 7-day cutoff here is a
 * heuristic — Wave 11 will join tb_cnt for the real ETA-vs-NOW check.
 *
 * Pattern source: /admin/forwarder-action (9-queue SLA audit) +
 * /admin/yuan-payments (status chips + 2-query tb_users merge).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { nowMs, cutoffIsoDaysAgo } from "@/lib/datetime-helpers";
import { parsePage, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";

export const dynamic = "force-dynamic";

type FwdRow = {
  id: number;
  fdate: string | null;
  fdatestatus3: string | null;
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

export default async function TransitOverduePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin(["ops", "accounting", "super"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // 7-day SLA heuristic. Real per-container ETA join (tb_cnt.cntDateETA)
  // is Wave 11 follow-up. PostgREST can't do "fdate3 < cutoff OR (fdate3
  // IS NULL AND fdate < cutoff)" cleanly in one query, so we fetch all
  // fstatus='3' rows and filter post-fetch — the breaching subset is
  // small in practice (active transit is ~weeks of inventory).
  const cutoff = cutoffIsoDaysAgo(7);

  // Wave 10 bug-fix 2026-05-23: 2 separate exact counts (one per branch
  // of the (fdate3 OR fdate)-based fallback condition). Previous display
  // used rows.length which capped at 200.
  const [{ data: rowsRaw, error }, { count: countWithStatus3 }, { count: countNoStatus3 }] = await Promise.all([
    admin
      .from("tb_forwarder")
      .select(
        "id,fdate,fdatestatus3,fstatus,fcabinetnumber,ftrackingchn,ftrackingth," +
          "fwarehousechina,ftransporttype,fweight,fvolume,ftotalprice,fnote,userid",
      )
      .eq("fstatus", "3")
      .order("fdate", { ascending: true })
      .limit(500),
    admin
      .from("tb_forwarder")
      .select("id", { count: "exact", head: true })
      .eq("fstatus", "3")
      .not("fdatestatus3", "is", null)
      .lt("fdatestatus3", cutoff),
    admin
      .from("tb_forwarder")
      .select("id", { count: "exact", head: true })
      .eq("fstatus", "3")
      .is("fdatestatus3", null)
      .lt("fdate", cutoff),
  ]);
  const breachCount = (countWithStatus3 ?? 0) + (countNoStatus3 ?? 0);

  const all = (rowsRaw ?? []) as unknown as FwdRow[];

  // SLA filter: fdate3 < cutoff (if present) OR fdate < cutoff (fallback)
  const rows = all
    .filter((r) => {
      const transitStart = r.fdatestatus3 ?? r.fdate;
      if (!transitStart) return false;
      return new Date(transitStart).getTime() < new Date(cutoff).getTime();
    })
    .slice(0, 200);

  // PERF (2026-06-03): client-slice the displayed table (50/page). The
  // header breach chip stays full-set-correct (it uses the two exact counts
  // above); only the rendered window is paginated over the filtered `rows`.
  const page = parsePage(sp.page);
  const offset = (page - 1) * DEFAULT_PAGE_SIZE;
  const pageRows = rows.slice(offset, offset + DEFAULT_PAGE_SIZE);

  // 2nd query: tb_users merge
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

  const now = nowMs();

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · QA · SLA</p>
        <div className="mt-1 flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">กำลังมาไทยเกินกำหนด</h1>
          <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
            {breachCount || rows.length} รายการ
          </span>
          <Link href="/admin/qa" className="text-xs text-primary-600 hover:underline">
            ← กลับ QA hub
          </Link>
        </div>
        <p className="mt-1 text-xs text-muted">
          tb_forwarder · fstatus=&apos;3&apos; (กำลังส่งมาไทย) AND (fdate3 หรือ fdate) &lt; NOW() − 7 วัน ·
          เรียงเก่าสุดก่อน · จำกัด 200 แถว
        </p>
        <p className="mt-1 text-[10px] text-muted italic">
          NB: heuristic 7 วัน — Wave 11 จะ join tb_cnt.cntDateETA สำหรับ ETA ตู้จริง
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
            <p className="text-sm font-medium text-foreground">ไม่มีรายการ transit เกินกำหนด</p>
            <p className="text-xs text-muted">รายการกำลังมาไทยทั้งหมดยังอยู่ใน SLA 7 วัน</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-surface-alt/50 text-left text-[10px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-2 py-2">ID</th>
                  <th className="px-2 py-2">เริ่ม transit</th>
                  <th className="px-2 py-2">รอมา</th>
                  <th className="px-2 py-2">ลูกค้า</th>
                  <th className="px-2 py-2">จาก</th>
                  <th className="px-2 py-2">ขนส่ง</th>
                  <th className="px-2 py-2">tracking</th>
                  <th className="px-2 py-2">เบอร์ตู้</th>
                  <th className="px-2 py-2 text-right">น้ำหนัก/cbm</th>
                  <th className="px-2 py-2">หมายเหตุ</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const u = r.userid ? userMap.get(r.userid) : undefined;
                  const customerName = u
                    ? `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim() || r.userid
                    : r.userid ?? "—";
                  const transitStart = r.fdatestatus3 ?? r.fdate;
                  const daysInTransit = transitStart
                    ? Math.floor((now - new Date(transitStart).getTime()) / (24 * 60 * 60 * 1000))
                    : 0;
                  const severity =
                    daysInTransit >= 21 ? "bg-red-100 text-red-700 border-red-200"
                    : daysInTransit >= 14 ? "bg-orange-100 text-orange-700 border-orange-200"
                    : "bg-yellow-100 text-yellow-700 border-yellow-200";
                  return (
                    <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                      <td className="px-2 py-2 font-mono">{r.id}</td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {transitStart ? String(transitStart).slice(0, 10) : "—"}
                        {r.fdatestatus3 ? null : <div className="text-muted text-[10px]">(fallback fdate)</div>}
                      </td>
                      <td className="px-2 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${severity}`}>
                          {daysInTransit} วัน
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <div className="font-mono text-[11px]">{r.userid ?? "—"}</div>
                        <div>{customerName}</div>
                        {u?.userTel ? <div className="text-muted text-[10px]">{u.userTel}</div> : null}
                      </td>
                      <td className="px-2 py-2">{WAREHOUSE_LABEL[r.fwarehousechina ?? ""] ?? r.fwarehousechina ?? "—"}</td>
                      <td className="px-2 py-2">{TRANSPORT_LABEL[r.ftransporttype ?? ""] ?? "—"}</td>
                      <td className="px-2 py-2 font-mono">
                        {r.ftrackingth || r.ftrackingchn || "—"}
                      </td>
                      <td className="px-2 py-2 font-mono">{r.fcabinetnumber || "—"}</td>
                      <td className="px-2 py-2 text-right font-mono text-[11px]">
                        {r.fweight ? `${Number(r.fweight).toFixed(1)} kg` : "—"}
                        {r.fvolume ? <div className="text-muted text-[10px]">{Number(r.fvolume).toFixed(3)} cbm</div> : null}
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
        <Pagination
          page={page}
          pageSize={DEFAULT_PAGE_SIZE}
          total={rows.length}
          basePath="/admin/qa/transit-overdue"
        />
      </div>

      <p className="text-[11px] text-muted">
        Wave 10 Group B · SLA-breach audit · drill-in → /admin/forwarders
      </p>
    </main>
  );
}
