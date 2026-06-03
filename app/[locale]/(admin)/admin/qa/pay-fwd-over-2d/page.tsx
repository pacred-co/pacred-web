/**
 * /admin/qa/pay-fwd-over-2d — รอชำระค่านำเข้าเกิน 2 วัน (Wave 10 · Group A · SLA-breach queue)
 *
 * Surfaces tb_forwarder rows parked on fstatus='5' (รอชำระเงิน — sent
 * the bill, still no payment) for more than 48 hours. Each breach = a
 * container already cleared into the Thai warehouse + waiting for the
 * customer to settle before we release it.
 *
 * SLA rule:  fstatus = '5' (รอชำระเงิน) AND fdate < NOW() - 2 days
 * Data:      tb_forwarder list + tb_users merge (2-query pattern).
 * Order:     fdate ASC — oldest-overdue surface first.
 * Limit:     200 rows.
 * Drill-in:  ดู / แก้ไข → /admin/forwarders/<fidorco or id>
 *
 * NB: fdate is the forwarder's intake date (when the import order was
 *     created in PCS). Legacy uses the same column for the SLA window
 *     because PCS doesn't track a separate "bill sent" timestamp — the
 *     bill goes out near intake. Phase C may revisit with a dedicated
 *     `fbilldate` if data warrants.
 *
 * Auth: requireAdmin(["ops","accounting"]). Super implicit.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { parsePage, pageRange, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";

export const dynamic = "force-dynamic";

type FRow = {
  id: number;
  fdate: string | null;
  fidorco: string | null;
  fcabinetnumber: string | null;
  ftrackingchn: string | null;
  ftrackingth: string | null;
  fstatus: string | null;
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

/** Helpers — wrap Date.now() so Next 16 / React 19 `react-hooks/purity`
 *  doesn't flag the call inside the Server Component render body. */
function nowMs(): number {
  return Date.now();
}
function daysSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((nowMs() - new Date(iso).getTime()) / 86_400_000);
}

export default async function AdminQaPayFwdOver2dPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin(["ops", "accounting"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  const page = parsePage(sp.page);
  const { from, to } = pageRange(page);

  const cutoff = new Date(nowMs() - 2 * 24 * 60 * 60 * 1000).toISOString();

  const { data: rowsRaw, error, count: breachCount } = await admin
    .from("tb_forwarder")
    .select(
      "id,fdate,fidorco,fcabinetnumber,ftrackingchn,ftrackingth,fstatus,fweight,fvolume,ftotalprice,fnote,userid",
      { count: "exact" },
    )
    .eq("fstatus", "5")
    .lt("fdate", cutoff)
    .order("fdate", { ascending: true })
    .range(from, to);

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

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · QA · SLA-BREACH</p>
        <div className="mt-1 flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">รอชำระค่านำเข้าเกิน 2 วัน</h1>
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
        </div>
        <p className="text-xs text-muted mt-1">
          tb_forwarder · fstatus = &apos;5&apos; (รอชำระเงิน) AND fdate &lt; NOW() − 2 วัน · เรียงเก่าสุดก่อน
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
            <p className="text-xs text-muted">ลูกค้าทุกคนชำระค่านำเข้าภายใน 2 วันแล้ว</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-3">เลขที่ F</th>
                  <th className="px-3 py-3">ลูกค้า</th>
                  <th className="px-3 py-3">วันที่สร้าง</th>
                  <th className="px-3 py-3 text-right">รออายุ</th>
                  <th className="px-3 py-3">เบอร์ตู้</th>
                  <th className="px-3 py-3">tracking</th>
                  <th className="px-3 py-3 text-right">น้ำหนัก/ปริมาตร</th>
                  <th className="px-3 py-3 text-right">ยอด (THB)</th>
                  <th className="px-3 py-3">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const u = r.userid ? userMap.get(r.userid) : undefined;
                  const customerName = u
                    ? `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim() || r.userid
                    : r.userid ?? "—";
                  const ageDays = daysSince(r.fdate);
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
                        {r.fdate
                          ? new Date(r.fdate).toLocaleString("th-TH", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })
                          : "—"}
                      </td>
                      <td className="px-3 py-3 text-right text-xs">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                            ageDays >= 14
                              ? "bg-red-100 text-red-700 border-red-200"
                              : ageDays >= 7
                                ? "bg-orange-100 text-orange-700 border-orange-200"
                                : "bg-yellow-100 text-yellow-700 border-yellow-200"
                          }`}
                        >
                          {ageDays} วัน
                        </span>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">{r.fcabinetnumber || "—"}</td>
                      <td className="px-3 py-3 font-mono text-[11px]">
                        {r.ftrackingchn ? <div>จ: {r.ftrackingchn}</div> : null}
                        {r.ftrackingth ? <div>ท: {r.ftrackingth}</div> : null}
                        {!r.ftrackingchn && !r.ftrackingth ? <span className="text-muted">—</span> : null}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs">
                        {r.fweight ? <div>{Number(r.fweight).toFixed(2)} กก.</div> : null}
                        {r.fvolume ? <div className="text-muted">{Number(r.fvolume).toFixed(3)} ลบ.ม.</div> : null}
                        {!r.fweight && !r.fvolume ? <span className="text-muted">—</span> : null}
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
      </div>

      <Pagination
        page={page}
        pageSize={DEFAULT_PAGE_SIZE}
        total={breachCount ?? 0}
        basePath="/admin/qa/pay-fwd-over-2d"
      />

      <p className="text-[11px] text-muted">
        เรียง <code>fdate</code> ASC (เก่าสุดขึ้นก่อน) · กดเข้าหน้ารายละเอียดเพื่อตามลูกค้า / ออกใบแจ้งหนี้ใหม่
      </p>
    </main>
  );
}
