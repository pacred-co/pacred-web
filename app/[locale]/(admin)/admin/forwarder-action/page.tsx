/**
 * /admin/forwarder-action?action=… — 9 audit queues
 *
 * Faithful port stub for legacy `member/pcs-admin/forwarder-action.php`
 * (1192 LOC). 9 audit queues, each with a different `fNote`/`fCover`/
 * `fCabinetNumber`/`fShipBy`/`fCredit` condition driving the result set.
 *
 * Wave 1 (this commit) — stub:
 *   - Reads `tb_forwarder` with the legacy condition for the requested
 *     action; shows count + first 200 rows as a "raw audit" table.
 *   - No edit/action buttons yet — those land in Wave 2 (rowwise edit,
 *     remote-area bulk apply, note-thread, credit override).
 *
 * Legacy SQL conditions (verbatim from forwarder-action.php L162-188):
 *   - Note               → fNote<>''
 *   - notPhoto           → fCover='' AND fStatus>1 AND fDate>2022-01-15
 *   - notPortage         → fTransportPrice=0 OR fShipBy='PCSE'
 *   - notContainer       → fCabinetNumber='' AND fDate>2022-01-15
 *   - NotDateContainerClose → fDateContainerClose IS NULL
 *   - NotShipFree*       → ZIP-code list join (deferred to Wave 2)
 *   - fCreditError       → fCredit='1' AND fCreditDate<NOW()
 *   - NoteShop           → join into tb_shop (deferred — Wave 2)
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { TopMenuReport } from "@/components/admin/top-menu-report";
import { Link } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

type SP = { action?: string; q?: string };

const ACTION_LABEL: Record<string, string> = {
  Note: "หมายเหตุนำเข้า",
  NoteShop: "หมายเหตุสั่งซื้อ",
  notPhoto: "ไม่ได้ถ่ายสินค้า",
  notPortage: "ไม่ใส่ค่าขนส่ง",
  notContainer: "ไม่ใส่เบอร์ตู้",
  NotDateContainerClose: "ไม่ใส่วันที่ปิดตู้",
  NotShipFree: "ไม่เลือกขนส่งฟรี",
  NotShipFreeError: "เลือกขนส่งฟรีผิด",
  fCreditError: "เครดิตเกินกำหนด",
};

const ACTION_CONDITION: Record<string, string> = {
  Note: "AND fnote <> '' AND fnote IS NOT NULL",
  notPhoto: "AND fcover = '' AND fstatus > 1 AND fdate > 2022-01-15",
  notPortage: "AND ftransportprice = 0 AND fdate > 2022-01-15",
  notContainer: "AND fcabinetnumber = '' AND fdate > 2022-01-15",
  NotDateContainerClose: "AND fdatecontainerclose IS NULL AND fdate > 2022-01-15",
  fCreditError: "AND fcredit = '1' AND fcreditdate < NOW()",
};

export default async function AdminForwarderActionPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin(["super", "ops", "accounting", "warehouse"]);
  const sp = await searchParams;
  const action = sp.action ?? "";
  const label = ACTION_LABEL[action];

  if (!action || !label) {
    return (
      <>
        <TopMenuReport activeHref={`/admin/forwarder-action`} />
        <main className="p-6 lg:p-8">
          <h1 className="text-2xl font-bold">forwarder-action</h1>
          <p className="text-sm text-muted mt-2">
            กรุณาเลือกหัวข้อจากเมนูด้านบน (9 audit queues)
          </p>
        </main>
      </>
    );
  }

  const admin = createAdminClient();

  // Apply legacy condition by action key
  let q = admin
    .from("tb_forwarder")
    .select("id,fdate,fcabinetnumber,ftrackingchn,fstatus,fnote,fcover,fwarehousename,ftotalprice")
    .limit(200)
    .order("fdate", { ascending: false });

  const cutoff = "2022-01-15 00:00:00";
  if (action === "Note") {
    q = q.not("fnote", "is", null).neq("fnote", "");
  } else if (action === "notPhoto") {
    q = q.eq("fcover", "").gt("fstatus", "1").gte("fdate", cutoff);
  } else if (action === "notPortage") {
    q = q.eq("ftransportprice", 0).gte("fdate", cutoff);
  } else if (action === "notContainer") {
    q = q.eq("fcabinetnumber", "").gte("fdate", cutoff);
  } else if (action === "NotDateContainerClose") {
    q = q.is("fdatecontainerclose", null).gte("fdate", cutoff);
  } else if (action === "fCreditError") {
    q = q.eq("fcredit", "1").lt("fcreditdate", new Date().toISOString());
  }
  // NoteShop / NotShipFree* — Wave 2 (need tb_shop join + ZIP list)

  const fStatusQ = sp.q;
  if (fStatusQ) q = q.eq("fstatus", fStatusQ);

  const { data: rows, error } = await q;

  return (
    <>
      <TopMenuReport activeHref={`/admin/forwarder-action?action=${action}`} />
      <main className="p-4 lg:p-6 space-y-4">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · AUDIT</p>
          <h1 className="mt-1 text-2xl font-bold">{label}</h1>
          <p className="mt-1 text-xs text-muted">
            Legacy condition: <code className="rounded bg-surface-alt px-1 py-0.5">{ACTION_CONDITION[action] ?? "TBD (Wave 2)"}</code>
          </p>
        </div>

        {(action === "NoteShop" || action === "NotShipFree" || action === "NotShipFreeError") && (
          <div className="rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
            ⚠️ คิวนี้ต้องการการ join `tb_shop` หรือ ZIP-code list เพิ่ม — Wave 2 (อยู่ระหว่างพอร์ต)
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            โหลดข้อมูลไม่สำเร็จ: {error.message}
          </div>
        )}

        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          {!rows || rows.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted">ไม่มีรายการในคิวนี้</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-surface-alt/50 text-[10px] uppercase text-muted">
                  <tr>
                    <th className="px-2 py-2 text-left">ID</th>
                    <th className="px-2 py-2 text-left">วันที่</th>
                    <th className="px-2 py-2 text-left">เบอร์ตู้</th>
                    <th className="px-2 py-2 text-left">tracking จีน</th>
                    <th className="px-2 py-2 text-center">สถานะ</th>
                    <th className="px-2 py-2 text-left">หมายเหตุ</th>
                    <th className="px-2 py-2 text-right">ราคา</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id as number} className="border-t border-border">
                      <td className="px-2 py-2 font-mono">{r.id as number}</td>
                      <td className="px-2 py-2">{r.fdate ? String(r.fdate).slice(0, 10) : "-"}</td>
                      <td className="px-2 py-2 font-mono">{(r.fcabinetnumber as string) || "-"}</td>
                      <td className="px-2 py-2 font-mono">{(r.ftrackingchn as string) || "-"}</td>
                      <td className="px-2 py-2 text-center">{r.fstatus as string}</td>
                      <td className="px-2 py-2 max-w-[280px] truncate" title={(r.fnote as string) ?? ""}>{(r.fnote as string) ?? "-"}</td>
                      <td className="px-2 py-2 text-right">{Number(r.ftotalprice ?? 0).toFixed(2)}</td>
                      <td className="px-2 py-2">
                        <Link href={`/admin/forwarders?q=${r.id as number}`} className="text-primary-600 hover:underline text-[11px]">
                          ดู
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-[11px] text-muted">
          (Wave 1 stub — แสดงไม่เกิน 200 แถว · edit buttons + ZIP-list rules + tb_shop join → Wave 2)
        </p>
      </main>
    </>
  );
}
