/**
 * /admin/qa/ownerless-goods — สินค้าไม่มีเจ้าของ (Wave 10 Group B · SLA-breach queue)
 *
 * Lists tb_forwarder rows with fstatus='4' (ถึงไทยแล้ว) where userid is null
 * or empty — physical goods sitting in the Thailand warehouse with no
 * customer attached. Real money risk: storage rent + lost goods + customer
 * complaints when their package "disappears" because it was scanned in
 * without a userid link.
 *
 * Pattern source: /admin/forwarder-action (9-queue SLA audit) +
 * /admin/yuan-payments (status chips + 2-query tb_users merge — though
 * here we expect 0 user rows since the whole point is "no owner").
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

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

const WAREHOUSE_LABEL: Record<string, string> = {
  "1": "Yiwu",
  "2": "Guangzhou",
};

const TRANSPORT_LABEL: Record<string, string> = {
  "1": "รถ",
  "2": "เรือ",
  "3": "แอร์",
};

export default async function OwnerlessGoodsPage() {
  await requireAdmin(["ops", "accounting", "super"]);

  const admin = createAdminClient();

  // PostgREST `.or()` can't express "userid IS NULL OR userid = ''" in
  // one filter cleanly without breaking type-safe column references.
  // Fetch fstatus='4' rows with empty userid, then merge with the null
  // case via a 2nd query — cheap, both subsets are small.
  // Wave 10 bug-fix 2026-05-23: add 2 separate exact counts (one per
  // sub-query) — the previous {rows.length} display capped at 200.
  // Total breach = count where userid IS NULL OR userid = ''.
  const [emptyRes, nullRes, emptyCntRes, nullCntRes] = await Promise.all([
    admin
      .from("tb_forwarder")
      .select(
        "id,fdate,fdatestatus4,fstatus,fcabinetnumber,ftrackingchn,ftrackingth," +
          "fwarehousechina,ftransporttype,fweight,fvolume,ftotalprice,fnote,userid",
      )
      .eq("fstatus", "4")
      .eq("userid", "")
      .order("fdate", { ascending: true })
      .limit(100),
    admin
      .from("tb_forwarder")
      .select(
        "id,fdate,fdatestatus4,fstatus,fcabinetnumber,ftrackingchn,ftrackingth," +
          "fwarehousechina,ftransporttype,fweight,fvolume,ftotalprice,fnote,userid",
      )
      .eq("fstatus", "4")
      .is("userid", null)
      .order("fdate", { ascending: true })
      .limit(100),
    admin
      .from("tb_forwarder")
      .select("id", { count: "exact", head: true })
      .eq("fstatus", "4")
      .eq("userid", ""),
    admin
      .from("tb_forwarder")
      .select("id", { count: "exact", head: true })
      .eq("fstatus", "4")
      .is("userid", null),
  ]);
  const breachCount = (emptyCntRes.count ?? 0) + (nullCntRes.count ?? 0);

  const error = emptyRes.error ?? nullRes.error;
  const rows = [
    ...((emptyRes.data ?? []) as unknown as FwdRow[]),
    ...((nullRes.data ?? []) as unknown as FwdRow[]),
  ]
    .sort((a, b) => {
      const ad = a.fdate ? new Date(a.fdate).getTime() : 0;
      const bd = b.fdate ? new Date(b.fdate).getTime() : 0;
      return ad - bd;
    })
    .slice(0, 200);

  const now = Date.now();

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · QA · SLA</p>
        <div className="mt-1 flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">สินค้าไม่มีเจ้าของ</h1>
          <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
            {breachCount || rows.length} รายการ
          </span>
          <Link href="/admin/qa" className="text-xs text-primary-600 hover:underline">
            ← กลับ QA hub
          </Link>
        </div>
        <p className="mt-1 text-xs text-muted">
          tb_forwarder · fstatus=&apos;4&apos; (ถึงไทยแล้ว) AND (userid IS NULL หรือ userid = &apos;&apos;) ·
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
            <p className="text-sm font-medium text-foreground">ไม่มีสินค้าไร้เจ้าของในโกดังไทย</p>
            <p className="text-xs text-muted">รายการ fstatus=&apos;4&apos; ทุกแถวมี userid ครบ</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-surface-alt/50 text-left text-[10px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-2 py-2">ID</th>
                  <th className="px-2 py-2">วันที่สร้าง</th>
                  <th className="px-2 py-2">ถึงไทย</th>
                  <th className="px-2 py-2">นานแล้ว</th>
                  <th className="px-2 py-2">tracking จีน</th>
                  <th className="px-2 py-2">tracking ไทย</th>
                  <th className="px-2 py-2">เบอร์ตู้</th>
                  <th className="px-2 py-2">จาก</th>
                  <th className="px-2 py-2">ขนส่ง</th>
                  <th className="px-2 py-2 text-right">น้ำหนัก/cbm</th>
                  <th className="px-2 py-2">หมายเหตุ</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const arrivedAt = r.fdatestatus4;
                  const daysSinceArrival = arrivedAt
                    ? Math.floor((now - new Date(arrivedAt).getTime()) / (24 * 60 * 60 * 1000))
                    : null;
                  const severity =
                    daysSinceArrival === null ? "bg-gray-100 text-gray-700 border-gray-200"
                    : daysSinceArrival >= 14 ? "bg-red-100 text-red-700 border-red-200"
                    : daysSinceArrival >= 7 ? "bg-orange-100 text-orange-700 border-orange-200"
                    : "bg-yellow-100 text-yellow-700 border-yellow-200";
                  return (
                    <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                      <td className="px-2 py-2 font-mono">{r.id}</td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {r.fdate ? String(r.fdate).slice(0, 10) : "—"}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {arrivedAt ? String(arrivedAt).slice(0, 10) : "—"}
                      </td>
                      <td className="px-2 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${severity}`}>
                          {daysSinceArrival !== null ? `${daysSinceArrival} วัน` : "—"}
                        </span>
                      </td>
                      <td className="px-2 py-2 font-mono">{r.ftrackingchn || "—"}</td>
                      <td className="px-2 py-2 font-mono">{r.ftrackingth || "—"}</td>
                      <td className="px-2 py-2 font-mono">{r.fcabinetnumber || "—"}</td>
                      <td className="px-2 py-2">{WAREHOUSE_LABEL[r.fwarehousechina ?? ""] ?? r.fwarehousechina ?? "—"}</td>
                      <td className="px-2 py-2">{TRANSPORT_LABEL[r.ftransporttype ?? ""] ?? "—"}</td>
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
      </div>

      <p className="text-[11px] text-muted">
        Wave 10 Group B · SLA-breach audit · drill-in → /admin/forwarders เพื่อกำหนด userid
      </p>
    </main>
  );
}
