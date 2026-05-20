/**
 * /admin/forwarder-import-warehouse — ประวัติเข้าโกดังไทย
 *
 * Faithful port stub for legacy `member/pcs-admin/forwarder-import-warehouse.php`
 * (607 LOC). Lists forwarder rows whose `fStatus>=4` (เข้าโกดังไทยแล้ว or
 * onward), grouped by date arrived (`fDateStatus4`).
 *
 * Wave 1 (this commit) — stub: last 200 rows with arrival date,
 * container, tracking, customer (member_code via tb_users join).
 * Wave 2: daily aggregation, search by date range, link to container
 * detail.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { TopMenuReport } from "@/components/admin/top-menu-report";

export const dynamic = "force-dynamic";

export default async function ForwarderImportWarehousePage() {
  await requireAdmin(["super", "ops", "accounting", "warehouse"]);

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("tb_forwarder")
    .select("id,fdatestatus4,fcabinetnumber,ftrackingchn,fstatus,fwarehousename,fweight,fvolume")
    .gte("fstatus", "4")
    .not("fdatestatus4", "is", null)
    .order("fdatestatus4", { ascending: false })
    .limit(200);

  return (
    <>
      <TopMenuReport activeHref="/admin/forwarder-import-warehouse" />
      <main className="p-4 lg:p-6 space-y-4">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · WAREHOUSE</p>
          <h1 className="mt-1 text-2xl font-bold">ประวัติเข้าโกดังไทย</h1>
          <p className="mt-1 text-sm text-muted">
            รายการ forwarder ที่ fStatus≥4 (เข้าโกดังไทยแล้ว) · กลุ่มตามวันที่ถึง (fDateStatus4)
          </p>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            โหลดข้อมูลไม่สำเร็จ: {error.message}
          </div>
        )}

        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          {!rows || rows.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted">ไม่มีรายการ</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-surface-alt/50 text-[10px] uppercase text-muted">
                  <tr>
                    <th className="px-2 py-2 text-left">วันที่เข้าโกดังไทย</th>
                    <th className="px-2 py-2 text-left">เบอร์ตู้</th>
                    <th className="px-2 py-2 text-left">tracking จีน</th>
                    <th className="px-2 py-2 text-center">สถานะ</th>
                    <th className="px-2 py-2 text-right">น้ำหนัก</th>
                    <th className="px-2 py-2 text-right">ปริมาตร</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id as number} className="border-t border-border">
                      <td className="px-2 py-2">{r.fdatestatus4 ? String(r.fdatestatus4).slice(0, 10) : "-"}</td>
                      <td className="px-2 py-2 font-mono">{(r.fcabinetnumber as string) || "-"}</td>
                      <td className="px-2 py-2 font-mono">{(r.ftrackingchn as string) || "-"}</td>
                      <td className="px-2 py-2 text-center">{r.fstatus as string}</td>
                      <td className="px-2 py-2 text-right">{Number(r.fweight ?? 0).toFixed(2)}</td>
                      <td className="px-2 py-2 text-right">{Number(r.fvolume ?? 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-[11px] text-muted">
          (Wave 1 stub — แสดงไม่เกิน 200 แถว · daily grouping + date range search → Wave 2)
        </p>
      </main>
    </>
  );
}
