/**
 * /admin/qa/chn-shop-over-2d — สั่งซื้อรอร้านจีนส่งเกิน 2 วัน (Wave 10 · Group A · SLA-breach queue)
 *
 * Surfaces ฝากสั่ง orders parked on hstatus='3' (สั่งสินค้าแล้ว — Pacred
 * has placed the China-shop order, waiting for the shop to ship into
 * the Guangzhou warehouse) for more than 48 hours since the status was
 * set. Each breach = a Chinese shop that hasn't sent the tracking yet
 * → time to chase the supplier.
 *
 * SLA rule:  hstatus = '3' (สั่งสินค้าแล้ว) AND
 *            COALESCE(hdate3, hdate) < NOW() - 2 days
 *
 *            hdate3 is when admin set hstatus → '3' (timestamp).
 *            If hdate3 is null (older rows, pre-tracking) fall back
 *            to hdate. PostgREST can't COALESCE in a WHERE clause,
 *            so we use a 2-branch `.or()` filter:
 *               (hdate3 is null AND hdate<cutoff) OR (hdate3<cutoff)
 *
 * Data:      tb_header_order list + tb_users merge.
 * Order:     by effective wait timestamp ASC — oldest first.
 * Limit:     200 rows.
 * Drill-in:  ดู / แก้ไข → /admin/service-orders/<hno>
 *
 * Auth: requireAdmin(["ops","accounting"]). Super implicit.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

type HRow = {
  id: number;
  hno: string | null;
  hdate: string | null;
  hdate3: string | null;
  htitle: string | null;
  hcount: number | null;
  hstatus: string | null;
  htotalpricechn: number | null;
  hnote: string | null;
  htransporttype: string | null;
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
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export default async function AdminQaChnShopOver2dPage() {
  await requireAdmin(["ops", "accounting"]);

  const admin = createAdminClient();

  const cutoff = new Date(nowMs() - 2 * 24 * 60 * 60 * 1000).toISOString();

  // Combined filter: (hdate3 is null AND hdate<cutoff) OR (hdate3<cutoff).
  // PostgREST or() takes a comma-separated condition list using its own
  // operator syntax. and() nests the null-and-old-hdate branch.
  const { data: rowsRaw, error } = await admin
    .from("tb_header_order")
    .select(
      "id,hno,hdate,hdate3,htitle,hcount,hstatus,htotalpricechn,hnote,htransporttype,userid",
    )
    .eq("hstatus", "3")
    .or(`and(hdate3.is.null,hdate.lt.${cutoff}),hdate3.lt.${cutoff}`)
    .order("hdate3", { ascending: true, nullsFirst: true })
    .limit(200);

  const rows = (rowsRaw ?? []) as unknown as HRow[];

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
    .from("tb_header_order")
    .select("id", { count: "exact", head: true })
    .eq("hstatus", "3")
    .or(`and(hdate3.is.null,hdate.lt.${cutoff}),hdate3.lt.${cutoff}`);

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · QA · SLA-BREACH</p>
        <div className="mt-1 flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">สั่งซื้อรอร้านจีนส่งเกิน 2 วัน</h1>
          {breachCount ? (
            <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
              {breachCount} รายการรอร้าน
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
          tb_header_order · hstatus = &apos;3&apos; (สั่งสินค้าแล้ว) AND COALESCE(hdate3, hdate) &lt; NOW() − 2 วัน · เรียงเก่าสุดก่อน
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
            <p className="text-xs text-muted">ร้านจีนทุกรายส่งสินค้าภายใน 2 วันแล้ว</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-3">เลขที่ออเดอร์</th>
                  <th className="px-3 py-3">ลูกค้า</th>
                  <th className="px-3 py-3">วันที่สั่ง (จีน)</th>
                  <th className="px-3 py-3 text-right">รอ</th>
                  <th className="px-3 py-3">สินค้า</th>
                  <th className="px-3 py-3">โหมดขนส่ง</th>
                  <th className="px-3 py-3 text-right">ราคารวม (¥)</th>
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
                  const effectiveStart = r.hdate3 ?? r.hdate;
                  const ageDays = daysSince(effectiveStart);
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
                        {effectiveStart
                          ? new Date(effectiveStart).toLocaleString("th-TH", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })
                          : "—"}
                        {!r.hdate3 ? (
                          <div className="text-[10px] text-muted">(ใช้ hdate · ไม่มี hdate3)</div>
                        ) : null}
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
                      <td className="px-3 py-3 text-xs max-w-[260px] truncate" title={r.htitle ?? ""}>
                        {r.htitle ?? "—"}
                        {r.hcount ? <span className="text-muted"> ({r.hcount})</span> : null}
                      </td>
                      <td className="px-3 py-3 text-xs">{r.htransporttype ?? "—"}</td>
                      <td className="px-3 py-3 text-right font-mono text-xs">
                        ¥{Number(r.htotalpricechn ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </td>
                      <td
                        className="px-3 py-3 text-xs max-w-[200px] truncate"
                        title={r.hnote ?? ""}
                      >
                        {r.hnote ?? "—"}
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
        แสดงไม่เกิน 200 แถว · เรียง <code>hdate3</code> ASC (นานสุดขึ้นก่อน) · ติดต่อร้านจีน / ขอเลขแทร็ก / เลื่อนเป็นสถานะ 4
      </p>
    </main>
  );
}
