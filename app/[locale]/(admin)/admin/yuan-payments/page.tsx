/**
 * /admin/yuan-payments — รายการฝากโอนหยวน (faithful port · Wave 7.1 · 2026-05-21 night)
 *
 * ภูม flagged 2026-05-21 night: "หน้าฝากโอนนี้ไม่เห็นมีรายการอะไรเลย แต่พอ
 * /822 ตามแกบอกถึงมีข้อมูลมาให้". Root cause: the original list read the
 * rebuilt `yuan_payments` table which is empty on prod (the real ~1,460
 * payments live in `tb_payment` after the D1 pivot). Rewritten to read
 * tb_payment directly + join tb_users by userid (same 2-query merge
 * pattern as `/admin/forwarders` since PostgREST FK auto-join is unreliable
 * across the legacy schema).
 *
 * The matching `/admin/yuan-payments/[id]` (shipped Wave 7) already reads
 * tb_payment — so dashboard ดู/แก้ไข row clicks already worked. This rewrite
 * just fixes the LIST so staff can see + filter.
 *
 * Wave 8 backlog: bulk-approve bar + slip-transferred-at editor +
 * refund-slip flow + admin-initiated payment form (the redirected
 * `new/page.tsx` stub is the entry).
 *
 * Verified prod schema 2026-05-21 via REST: tb_payment(id, paydate,
 *   paydeposit, paystatus, paytype, paydetail, payyuan, payrate, paythb,
 *   paythbcost, payprofitthb, paydateadmin, userid, adminid, adminidupdate,
 *   imagesslip, imagesslipadmin).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  "1": "รอตรวจสอบ",
  "2": "อนุมัติแล้ว",
  "3": "ปฏิเสธ",
};
const STATUS_CLS: Record<string, string> = {
  "1": "bg-yellow-100 text-yellow-700 border-yellow-200",
  "2": "bg-green-100 text-green-700 border-green-200",
  "3": "bg-red-100 text-red-700 border-red-200",
};
const PAYTYPE_LABEL: Record<string, string> = {
  "1": "Alipay",
  "2": "Wechat",
  "3": "Union",
  "4": "USDT",
};

const STATUS_TABS: { key: string | null; label: string }[] = [
  { key: null, label: "ทั้งหมด" },
  { key: "1",  label: "รอตรวจ" },
  { key: "2",  label: "อนุมัติ" },
  { key: "3",  label: "ปฏิเสธ" },
];

type PaymentRow = {
  id: number;
  paydate: string | null;
  paystatus: string | null;
  paytype: string | null;
  paydetail: string | null;
  payyuan: number | null;
  payrate: number | null;
  paythb: number | null;
  payprofitthb: number | null;
  paydateadmin: string | null;
  userid: string | null;
  adminid: string | null;
  imagesslip: string | null;
};

type URow = {
  userid: string;
  username: string | null;
  userlastname: string | null;
  usertel: string | null;
};

type SP = { status?: string; q?: string };

export default async function AdminYuanPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  // W-1 (gap-admin H-1): page-level role gate. Exposes customer slip +
  // recipient details via createAdminClient (RLS-bypass) — accounting + ops
  // (super implicit).
  await requireAdmin(["ops", "accounting"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  let q = admin
    .from("tb_payment")
    .select(
      "id,paydate,paystatus,paytype,paydetail,payyuan,payrate,paythb,payprofitthb,paydateadmin,userid,adminid,imagesslip",
    )
    .order("paydate", { ascending: false })
    .limit(200);

  if (sp.status && /^[123]$/.test(sp.status)) q = q.eq("paystatus", sp.status);
  if (sp.q) {
    // search by userid (e.g. PR3963) or by tb_payment.id (numeric)
    const term = sp.q.trim();
    if (/^\d+$/.test(term)) q = q.eq("id", Number(term));
    else q = q.eq("userid", term.toUpperCase());
  }

  const { data: rowsRaw, error } = await q;
  const rows = (rowsRaw ?? []) as unknown as PaymentRow[];

  // 2nd query — merge customer names from tb_users
  const userIds = Array.from(new Set(rows.map((r) => r.userid).filter(Boolean))) as string[];
  let userMap = new Map<string, URow>();
  if (userIds.length > 0) {
    const { data: usersRaw } = await admin
      .from("tb_users")
      .select("userid,username,userlastname,usertel")
      .in("userid", userIds);
    userMap = new Map(((usersRaw ?? []) as unknown as URow[]).map((u) => [u.userid, u]));
  }

  // Pending count for the page header chip
  const { count: pendingCount } = await admin
    .from("tb_payment")
    .select("id", { count: "exact", head: true })
    .eq("paystatus", "1");

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN</p>
          <div className="mt-1 flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">ฝากโอนหยวน</h1>
            {pendingCount ? (
              <span className="rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-medium text-yellow-700">
                {pendingCount} รอตรวจ
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted mt-1">
            Wave 7.1 · อ่านจาก tb_payment · approve/reject bulk + slip-time editor → Wave 8
          </p>
        </div>
        <Link
          href="/admin/yuan-payments/new"
          className="rounded-md border border-primary-500 bg-primary-500 px-3 py-2 text-xs text-white hover:bg-primary-600"
        >
          + เพิ่มรายการ
        </Link>
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {STATUS_TABS.map((t) => {
          const isActive = (t.key ?? "") === (sp.status ?? "");
          const href = t.key ? `/admin/yuan-payments?status=${t.key}` : `/admin/yuan-payments`;
          return (
            <Link
              key={t.label}
              href={href}
              className={
                "px-3 py-1.5 text-xs rounded-t-md border-b-2 -mb-px " +
                (isActive
                  ? "border-primary-600 text-primary-600 font-semibold"
                  : "border-transparent text-muted hover:text-foreground")
              }
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* Search box */}
      <form className="flex gap-2 flex-wrap" action="/admin/yuan-payments">
        {sp.status ? <input type="hidden" name="status" value={sp.status} /> : null}
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="ค้นหา รหัสลูกค้า (PR…) / หมายเลข payment"
          className="rounded-lg border border-border px-3 py-2 text-sm w-72"
        />
        <button type="submit" className="rounded-lg bg-primary-500 text-white px-4 text-sm">
          ค้นหา
        </button>
      </form>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          โหลดข้อมูลไม่สำเร็จ: {error.message}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่มีรายการ</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-3">วันที่สร้าง</th>
                  <th className="px-3 py-3">ลูกค้า</th>
                  <th className="px-3 py-3">ช่องทาง</th>
                  <th className="px-3 py-3 text-right">หยวน</th>
                  <th className="px-3 py-3 text-right">บาท</th>
                  <th className="px-3 py-3 text-right">กำไร</th>
                  <th className="px-3 py-3">สถานะ</th>
                  <th className="px-3 py-3">สลิป</th>
                  <th className="px-3 py-3">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const u = r.userid ? userMap.get(r.userid) : undefined;
                  const status = r.paystatus ?? "1";
                  const customerName = u
                    ? `${u.username ?? ""} ${u.userlastname ?? ""}`.trim() || r.userid
                    : r.userid ?? "—";
                  return (
                    <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                      <td className="px-3 py-3 text-xs whitespace-nowrap">
                        {r.paydate
                          ? new Date(r.paydate).toLocaleString("th-TH", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })
                          : "—"}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <div className="font-mono">{r.userid ?? "—"}</div>
                        <div>{customerName}</div>
                        {u?.usertel ? <div className="text-muted">{u.usertel}</div> : null}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {PAYTYPE_LABEL[r.paytype ?? ""] ?? r.paytype ?? "—"}
                        {r.paydetail ? (
                          <div className="text-muted text-[10px] max-w-[160px] truncate" title={r.paydetail}>
                            {r.paydetail}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs">
                        ¥
                        {Number(r.payyuan ?? 0).toLocaleString("th-TH", {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs">
                        ฿
                        {Number(r.paythb ?? 0).toLocaleString("th-TH", {
                          minimumFractionDigits: 2,
                        })}
                        <div className="text-muted text-[10px]">
                          @ {Number(r.payrate ?? 0).toFixed(2)}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs">
                        {r.payprofitthb !== null
                          ? `฿${Number(r.payprofitthb).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`
                          : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                            STATUS_CLS[status] ?? "bg-gray-100 text-gray-600 border-gray-200"
                          }`}
                        >
                          {STATUS_LABEL[status] ?? `status ${status}`}
                        </span>
                        {r.paydateadmin ? (
                          <div className="text-muted text-[10px] mt-1">
                            {new Date(r.paydateadmin).toLocaleDateString("th-TH")}
                            {r.adminid ? ` · ${r.adminid}` : ""}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {r.imagesslip ? (
                          <a
                            href={r.imagesslip}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary-600 hover:underline"
                          >
                            ดู
                          </a>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <Link
                          href={`/admin/yuan-payments/${r.id}`}
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

      <p className="text-[11px] text-muted">
        แสดงไม่เกิน 200 แถวต่อหน้า (ใช้ค้นหา / ตัวกรองด้านบนเพื่อกรองเพิ่ม)
      </p>
    </main>
  );
}
