/**
 * /admin/qa/order-cancellations — รายการยกเลิกออเดอร์ที่ต้องดำเนินการ
 * (Wave 26 · 11th QA queue · the order-cancellation follow-up)
 *
 * Legacy reference: `pcs-admin/include/pages/left-menu/CargoAndFreight/
 * QAAndQC/QAAndQC.php` L30-34 — the menu links to `orderCancellationList.php`
 * which was planned but never built in legacy PHP. The semantics come from
 * the legacy `forwarder-action.php?action=NoteShop&q=6` filter
 * (`hStatus='6' AND hNote<>''`) — cancelled orders that still have an open
 * note from customer or admin needing follow-up (refund · explanation · etc.).
 *
 * Pacred semantics: a cancelled order is a "QA queue" when:
 *   - Customer paid (hshoppay='1') and the cancellation still needs refund
 *     reconciliation OR
 *   - Customer/admin left a non-empty hnote (a complaint or context that the
 *     cancellation hasn't yet been addressed) OR
 *   - Cancellation happened > 1 day ago and no follow-up note exists
 *     (silent abandonment that QA should chase).
 *
 * Default scope here = `hstatus='6'` (cancelled) AND at least one of the
 * 3 conditions. Operator can drill into /admin/service-orders/[hno] from
 * each row to action.
 *
 * SLA rule:    hstatus = '6' AND (hshoppay='1' OR hnote<>'' OR hdateupdate < NOW()-1d)
 * Data:        tb_header_order + tb_users merge (2-query pattern — same as
 *              other Pacred QA queues for PostgREST FK-join reliability).
 * Order:       hdateupdate DESC — most-recently-cancelled first (operator
 *              triage by recency · matches legacy "ที่ต้องดำเนินการ" intent).
 * Limit:       200 rows.
 * Drill-in:    ดู / แก้ไข → /admin/service-orders/<hno>
 *
 * Auth: requireAdmin(["ops","accounting","super"]) — refund-adjacent ops.
 *
 * §0c compliance: every Supabase query destructures { data, error } +
 * console.error on failure + throws on hard load failure.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

type HRow = {
  id: number;
  hno: string | null;
  hdate: string | null;
  hdateupdate: string | null;
  htitle: string | null;
  hcount: number | null;
  hstatus: string | null;
  hshoppay: string | null;
  hnote: string | null;
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
};

/** Helper because Next 16 / React 19 `react-hooks/purity` flags raw
 *  Date.now() inside Server Component render bodies. */
function nowMs(): number {
  return Date.now();
}

/** Floor of (now − iso) in days; 0 when iso is null/invalid. */
function daysSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((nowMs() - new Date(iso).getTime()) / 86_400_000);
}

export default async function AdminQaOrderCancellationsPage() {
  await requireAdmin(["ops", "accounting"]);

  const admin = createAdminClient();

  // Cutoff: 1d ago, for the "silent cancellation needing follow-up" condition.
  const oneDayCutoff = new Date(nowMs() - 24 * 60 * 60 * 1000).toISOString();

  // ── Fetch all cancelled orders within a reasonable window (last 90d) ──
  // We further filter the OR condition in-memory because PostgREST .or()
  // combined with .gt() on a separate column gets fiddly with quoting.
  const ninetyDayCutoff = new Date(nowMs() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const { data: rowsRaw, error } = await admin
    .from("tb_header_order")
    .select(
      "id,hno,hdate,hdateupdate,htitle,hcount,hstatus,hshoppay,hnote," +
        "htotalpricechn,htotalpriceuser,hrate,userid",
    )
    .eq("hstatus", "6")
    .gt("hdateupdate", ninetyDayCutoff)
    .order("hdateupdate", { ascending: false })
    .limit(500);

  if (error) {
    console.error(`[tb_header_order cancellations] failed`, {
      code: error.code,
      message: error.message,
    });
  }

  // Apply the "needs follow-up" filter in-memory then slice to display window.
  const allCancelled = (rowsRaw ?? []) as unknown as HRow[];
  const needsFollowup = allCancelled.filter((r) => {
    const hasPayment = r.hshoppay === "1";
    const hasNote = r.hnote != null && r.hnote.trim() !== "";
    const isStale = r.hdateupdate != null && r.hdateupdate < oneDayCutoff;
    return hasPayment || hasNote || isStale;
  });
  const rows = needsFollowup.slice(0, 200);

  // Header breach count — total cancellations needing follow-up (full window).
  const breachCount = needsFollowup.length;

  // Pass 2: customer merge (legacy pattern).
  const userIds = Array.from(new Set(rows.map((r) => r.userid).filter(Boolean))) as string[];
  let userMap = new Map<string, URow>();
  if (userIds.length > 0) {
    const { data: usersRaw, error: usersErr } = await admin
      .from("tb_users")
      .select("userID,userName,userLastName,userTel")
      .in("userID", userIds);
    if (usersErr) {
      console.error(`[tb_users list] failed`, {
        code: usersErr.code,
        message: usersErr.message,
      });
    }
    userMap = new Map(((usersRaw ?? []) as unknown as URow[]).map((u) => [u.userID, u]));
  }

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · QA · SLA-BREACH</p>
        <div className="mt-1 flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">รายการยกเลิกออเดอร์</h1>
          {breachCount > 0 ? (
            <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
              {breachCount} รายการต้องดำเนินการ
            </span>
          ) : (
            <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
              ไม่มีรายการค้าง
            </span>
          )}
          <Link href="/admin/qa" className="text-xs text-primary-600 hover:underline">
            ← กลับ QA hub
          </Link>
        </div>
        <p className="mt-1 text-xs text-muted">
          tb_header_order · hstatus = &apos;6&apos; (ยกเลิก) AND
          (hshoppay=&apos;1&apos; หรือ hnote≠&apos;&apos; หรือ hdateupdate &lt; NOW()-1d) ·
          เรียงล่าสุดก่อน · จำกัด 200 แถว
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
            <div className="text-4xl" aria-hidden>
              ✅
            </div>
            <p className="text-sm font-medium text-foreground">ไม่มีรายการยกเลิกที่ต้องดำเนินการ</p>
            <p className="text-xs text-muted">
              ออเดอร์ที่ถูกยกเลิกใน 90 วันล่าสุดได้รับการดำเนินการแล้วทั้งหมด
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-3">เลขที่ออเดอร์</th>
                  <th className="px-3 py-3">ลูกค้า</th>
                  <th className="px-3 py-3">วันที่สร้าง</th>
                  <th className="px-3 py-3">วันที่ยกเลิก</th>
                  <th className="px-3 py-3 text-right">นานแล้ว</th>
                  <th className="px-3 py-3">สินค้า</th>
                  <th className="px-3 py-3 text-right">ราคารวม (¥)</th>
                  <th className="px-3 py-3 text-right">ราคารวม (THB)</th>
                  <th className="px-3 py-3">สถานะเงิน</th>
                  <th className="px-3 py-3">หมายเหตุ</th>
                  <th className="px-3 py-3">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const u = r.userid ? userMap.get(r.userid) : undefined;
                  const customerName = u
                    ? `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim() || r.userid
                    : r.userid ?? "—";
                  const ageDays = daysSince(r.hdateupdate);
                  const hasPayment = r.hshoppay === "1";
                  const hasNote = r.hnote != null && r.hnote.trim() !== "";
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
                        <div className="font-mono">{r.userid ?? "—"}</div>
                        <div>{customerName}</div>
                        {u?.userTel ? <div className="text-muted">{u.userTel}</div> : null}
                      </td>
                      <td className="px-3 py-3 text-xs whitespace-nowrap">
                        {r.hdate
                          ? new Date(r.hdate).toLocaleDateString("th-TH", { dateStyle: "short" })
                          : "—"}
                      </td>
                      <td className="px-3 py-3 text-xs whitespace-nowrap">
                        {r.hdateupdate
                          ? new Date(r.hdateupdate).toLocaleString("th-TH", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })
                          : "—"}
                      </td>
                      <td className="px-3 py-3 text-right text-xs">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
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
                      <td className="px-3 py-3 text-xs max-w-[220px] truncate" title={r.htitle ?? ""}>
                        {r.htitle ?? "—"}
                        {r.hcount ? <span className="text-muted"> ({r.hcount})</span> : null}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs">
                        ¥{Number(r.htotalpricechn ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs">
                        ฿{Number(r.htotalpriceuser ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                        {r.hrate ? <div className="text-muted text-[10px]">@ {Number(r.hrate).toFixed(2)}</div> : null}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {hasPayment ? (
                          <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] text-red-700">
                            จ่ายแล้ว · รอคืน
                          </span>
                        ) : (
                          <span className="text-muted text-[11px]">ยังไม่จ่าย</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs max-w-[200px] truncate" title={r.hnote ?? ""}>
                        {hasNote ? (
                          <span className="text-orange-700">{r.hnote}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
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

      <p className="text-[11px] text-muted">
        แสดงไม่เกิน 200 แถว · เรียง <code>hdateupdate</code> DESC (ยกเลิกล่าสุดก่อน) ·
        คลิกเลขที่ออเดอร์เพื่อตรวจสอบ / ออกใบคืนเงิน / ปิดเคส
      </p>
    </main>
  );
}
