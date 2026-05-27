/**
 * /admin/reports/user-sales-history/[customer_id] — drill-in
 * (Wave 23 P1 batch 2-B Tailwind rewrite · 2026-05-27 ค่ำ).
 *
 * **Wave 23 P1 batch 2-B (2026-05-27 ค่ำ):** UI rewrite only — the
 * underlying tb_users + 4-way UNION (tb_forwarder + tb_header_order +
 * tb_payment + tb_wallet_hs) timeline + tb_wallet balance reads stay
 * intact. Replaces the .pcs-legacy / Bootstrap-4 / admin-base.css chrome
 * (~476 LOC) with the Pacred Tailwind v4 reports template (mirrors
 * `reports/payment/page.tsx` Wave 20 P1 batch 2-b).
 *
 * **Workflow preserved (per AGENTS §0a):** same logic, same data shape,
 * same status labels, same role gate (super + ops + accounting +
 * sales_admin), same lifetime aggregate gates (fstatus 6,7 / hstatus 5,6
 * / paystatus 3), same MAX_EVENTS = 100 cap. Only chrome moves
 * Bootstrap → Tailwind.
 *
 * **Legacy PHP reference:**
 *   `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\report-user-sales-history.php`
 *   — that legacy file serves a sales-rep commission payout flow
 *   (`tb_user_sales_admin_pay`). This Pacred slot is the V-G6 #4
 *   customer-cohort drill-in (replaces Wave 7.2 redirect to
 *   /admin/customers/[id], which only showed 10 rows per table without
 *   wallet activity). The URL is reused; the legacy commission flow
 *   lives elsewhere.
 *
 * **§0c compliance:** every Supabase query destructures { data, error },
 * logs + throws on load-bearing reads (tb_users lookup); soft-fails on
 * the 5 parallel timeline reads (one stale timeline tab preferable to
 * a 500 on the whole drill-in).
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const MAX_EVENTS = 100;

type URow = {
  userid: string;
  username: string | null;
  userlastname: string | null;
  usertel: string | null;
  useremail: string | null;
  userstatus: string | null;
  userregistered: string | null;
  userlastlogin: string | null;
  adminidsale: string | null;
  usercompany: string | null;
};

type FRow = {
  id: number;
  fdate: string | null;
  fstatus: string | null;
  fidorco: string | null;
  fdetail: string | null;
  ftotalprice: number | null;
  ftrackingth: string | null;
};
type HRow = {
  id: number;
  hdate: string | null;
  hstatus: string | null;
  hno: string | null;
  htitle: string | null;
  htotalpriceuser: number | null;
  hcount: number | null;
};
type PRow = {
  id: number;
  paydate: string | null;
  paystatus: string | null;
  payyuan: number | null;
  paythb: number | null;
  paydetail: string | null;
};
type WRow = {
  id: number;
  date: string | null;
  status: string | null;
  typenew: string | null;
  amount: number | null;
  note: string | null;
  reforder: string | null;
};
type WBalance = { wallettotal: number | null };

type EventKind = "forwarder" | "shop" | "yuan" | "wallet";

type TimelineEvent = {
  kind: EventKind;
  date: string;
  label: string;
  detail: string;
  amount_thb: number | null;
  status: string;
  href: string | null;
};

function thb(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "0.00";
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return `${String(iso).slice(0, 10)} ${String(iso).slice(11, 19)}`;
}

const F_STATUS_LABEL: Record<string, string> = {
  "1": "รอเข้าโกดังจีน",
  "2": "ถึงโกดังจีน",
  "3": "กำลังส่งมาไทย",
  "4": "ถึงไทย",
  "5": "รอชำระ",
  "6": "เตรียมส่ง",
  "7": "ส่งแล้ว",
};

const H_STATUS_LABEL: Record<string, string> = {
  "1": "รอดำเนินการ",
  "2": "รอชำระ",
  "3": "สั่งสินค้า",
  "4": "รอร้านจัดส่ง",
  "5": "สำเร็จ",
  "6": "ยกเลิก",
};

const P_STATUS_LABEL: Record<string, string> = {
  "1": "รอตรวจสอบ",
  "2": "กำลังโอน",
  "3": "สำเร็จ",
};

const W_TYPE_LABEL: Record<string, string> = {
  "1": "เติมเงิน",
  "2": "คืนเงิน",
  "3": "ชำระฝากสั่ง",
  "4": "ชำระฝากสั่งเติมเพิ่ม",
  "5": "ชำระฝากนำเข้า",
  "6": "ชำระฝากนำเข้าเติมเพิ่ม",
  "7": "ชำระฝากโอน",
};

const W_STATUS_LABEL: Record<string, string> = {
  "1": "รอดำเนินการ",
  "2": "สำเร็จ",
  "3": "ไม่สำเร็จ",
};

// Kind chip colour (matches Pacred status-chip pattern from payment/page.tsx)
const KIND_CLS: Record<EventKind, string> = {
  forwarder: "bg-blue-50 text-blue-700 border-blue-200",
  shop:      "bg-amber-50 text-amber-700 border-amber-200",
  yuan:      "bg-green-50 text-green-700 border-green-200",
  wallet:    "bg-gray-50 text-gray-700 border-gray-200",
};

const KIND_LABEL: Record<EventKind, string> = {
  forwarder: "ฝากนำเข้า",
  shop:      "ฝากสั่ง",
  yuan:      "ฝากโอน",
  wallet:    "Wallet",
};

export default async function UserSalesHistoryDrillIn({
  params,
}: {
  params: Promise<{ customer_id: string }>;
}) {
  await requireAdmin(["super", "ops", "accounting", "sales_admin"]);
  const { customer_id } = await params;
  const id = decodeURIComponent(customer_id);

  const admin = createAdminClient();

  const { data: userRaw, error: userRawErr } = await admin
    .from("tb_users")
    .select(
      "userid, username, userlastname, usertel, useremail, userstatus, userregistered, userlastlogin, adminidsale, usercompany",
    )
    .eq("userid", id)
    .maybeSingle();

  if (userRawErr) {
    console.error(`[tb_users lookup] failed`, {
      code: userRawErr.code, message: userRawErr.message, details: userRawErr.details, hint: userRawErr.hint,
    });
    throw new Error(`Failed to load tb_users (${userRawErr.code ?? "unknown"}): ${userRawErr.message}`);
  }
  if (!userRaw) notFound();
  const u = userRaw as unknown as URow;

  // Parallel fetch — newest first, plenty for the top-100 merge.
  // Soft-fail per query (timeline is best-effort drill-in, not a load-bearing dashboard).
  const [
    { data: fData, error: fErr },
    { data: hData, error: hErr },
    { data: pData, error: pErr },
    { data: wData, error: wErr },
    { data: walletBalRaw, error: walletBalErr },
  ] = await Promise.all([
    admin
      .from("tb_forwarder")
      .select("id, fdate, fstatus, fidorco, fdetail, ftotalprice, ftrackingth")
      .eq("userid", u.userid)
      .order("fdate", { ascending: false, nullsFirst: false })
      .limit(MAX_EVENTS),
    admin
      .from("tb_header_order")
      .select("id, hdate, hstatus, hno, htitle, htotalpriceuser, hcount")
      .eq("userid", u.userid)
      .order("hdate", { ascending: false, nullsFirst: false })
      .limit(MAX_EVENTS),
    admin
      .from("tb_payment")
      .select("id, paydate, paystatus, payyuan, paythb, paydetail")
      .eq("userid", u.userid)
      .order("paydate", { ascending: false, nullsFirst: false })
      .limit(MAX_EVENTS),
    admin
      .from("tb_wallet_hs")
      .select("id, date, status, typenew, amount, note, reforder")
      .eq("userid", u.userid)
      .order("date", { ascending: false, nullsFirst: false })
      .limit(MAX_EVENTS),
    admin
      .from("tb_wallet")
      .select("wallettotal")
      .eq("userid", u.userid)
      .maybeSingle(),
  ]);

  if (fErr) console.error(`[tb_forwarder timeline] failed`, { code: fErr.code, message: fErr.message });
  if (hErr) console.error(`[tb_header_order timeline] failed`, { code: hErr.code, message: hErr.message });
  if (pErr) console.error(`[tb_payment timeline] failed`, { code: pErr.code, message: pErr.message });
  if (wErr) console.error(`[tb_wallet_hs timeline] failed`, { code: wErr.code, message: wErr.message });
  if (walletBalErr) console.error(`[tb_wallet balance] failed`, { code: walletBalErr.code, message: walletBalErr.message });

  const fws = (fData ?? []) as unknown as FRow[];
  const hos = (hData ?? []) as unknown as HRow[];
  const pys = (pData ?? []) as unknown as PRow[];
  const wls = (wData ?? []) as unknown as WRow[];
  const walletBal = (walletBalRaw as unknown as WBalance | null) ?? null;

  // Union into timeline events
  const events: TimelineEvent[] = [];
  for (const r of fws) {
    if (!r.fdate) continue;
    events.push({
      kind: "forwarder",
      date: r.fdate,
      label: `ฝากนำเข้า ${r.fidorco ?? `#${r.id}`}`,
      detail: r.fdetail ?? (r.ftrackingth ? `Tracking TH: ${r.ftrackingth}` : "—"),
      amount_thb: r.ftotalprice !== null ? Number(r.ftotalprice) : null,
      status: F_STATUS_LABEL[r.fstatus ?? ""] ?? r.fstatus ?? "—",
      href: `/admin/forwarders/${encodeURIComponent(r.fidorco ?? String(r.id))}`,
    });
  }
  for (const r of hos) {
    if (!r.hdate) continue;
    events.push({
      kind: "shop",
      date: r.hdate,
      label: `ฝากสั่ง ${r.hno ?? `#${r.id}`}`,
      detail: r.htitle ?? (r.hcount ? `${r.hcount} รายการ` : "—"),
      amount_thb: r.htotalpriceuser !== null ? Number(r.htotalpriceuser) : null,
      status: H_STATUS_LABEL[r.hstatus ?? ""] ?? r.hstatus ?? "—",
      href: `/admin/service-orders/${encodeURIComponent(r.hno ?? String(r.id))}`,
    });
  }
  for (const r of pys) {
    if (!r.paydate) continue;
    events.push({
      kind: "yuan",
      date: r.paydate,
      label: `ฝากโอน #${r.id}`,
      detail: `${r.paydetail ?? "—"} · ¥${thb(Number(r.payyuan ?? 0))}`,
      amount_thb: r.paythb !== null ? Number(r.paythb) : null,
      status: P_STATUS_LABEL[r.paystatus ?? ""] ?? r.paystatus ?? "—",
      href: `/admin/yuan-payments?q=${encodeURIComponent(u.userid)}`,
    });
  }
  for (const r of wls) {
    if (!r.date) continue;
    events.push({
      kind: "wallet",
      date: r.date,
      label: `Wallet · ${W_TYPE_LABEL[r.typenew ?? ""] ?? r.typenew ?? "—"}`,
      detail: r.note ?? r.reforder ?? "—",
      amount_thb: r.amount !== null ? Number(r.amount) : null,
      status: W_STATUS_LABEL[r.status ?? ""] ?? r.status ?? "—",
      href: `/admin/wallet?userid=${encodeURIComponent(u.userid)}`,
    });
  }

  // Sort merged events DESC by date, cap at MAX_EVENTS
  events.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const timeline = events.slice(0, MAX_EVENTS);

  const fullname = `${u.username ?? ""} ${u.userlastname ?? ""}`.trim() || "—";
  const isJuristic = u.usercompany === "1";

  // Lifetime totals (same status gates as the list page · sales-by-rep view)
  const lifetimeForwarderRevenue = fws
    .filter((r) => r.fstatus === "6" || r.fstatus === "7")
    .reduce((s, r) => s + Number(r.ftotalprice ?? 0), 0);
  const lifetimeShopRevenue = hos
    .filter((r) => r.hstatus === "5" || r.hstatus === "6")
    .reduce((s, r) => s + Number(r.htotalpriceuser ?? 0), 0);
  const lifetimePaymentRevenue = pys
    .filter((r) => r.paystatus === "3")
    .reduce((s, r) => s + Number(r.paythb ?? 0), 0);
  const lifetimeTotal = lifetimeForwarderRevenue + lifetimeShopRevenue + lifetimePaymentRevenue;

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">
            ADMIN · รายงาน · ประวัติการขายต่อลูกค้า
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold">
            <span className="font-mono">{u.userid}</span>
            {isJuristic && (
              <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                นิติบุคคล
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-muted">
            ไทม์ไลน์ลูกค้าตลอดอายุ · UNION{" "}
            <span className="font-mono">tb_forwarder + tb_header_order + tb_payment + tb_wallet_hs</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/reports/user-sales-history"
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt"
          >
            ← กลับรายชื่อลูกค้า
          </Link>
          <Link
            href={`/admin/customers/${encodeURIComponent(u.userid)}`}
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt"
          >
            ดูโปรไฟล์ลูกค้า →
          </Link>
        </div>
      </div>

      {/* Customer summary card */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-base">{fullname}</p>
            <p className="text-xs text-muted">
              โทร:{" "}
              <span className="font-mono text-foreground">{u.usertel ?? "—"}</span>
              {" · "}อีเมล:{" "}
              <span className="font-mono text-foreground">{u.useremail ?? "—"}</span>
            </p>
            <p className="text-xs text-muted">
              สมัคร: <span className="text-foreground">{fmtDateTime(u.userregistered)}</span>
              {" · "}ล่าสุดล็อกอิน:{" "}
              <span className="text-foreground">{fmtDateTime(u.userlastlogin)}</span>
            </p>
            {u.adminidsale && (
              <p className="text-xs text-muted">
                เซลล์ผู้ดูแล:{" "}
                <Link
                  href={`/admin/admins/${encodeURIComponent(u.adminidsale)}`}
                  className="text-primary-600 hover:underline"
                >
                  {u.adminidsale}
                </Link>
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-surface-alt/30 p-3 text-center">
              <p className="text-[11px] text-muted">ยอดกระเป๋า (THB)</p>
              <p className="mt-1 text-xl font-bold font-mono">฿{thb(walletBal?.wallettotal ?? 0)}</p>
            </div>
            <div className="rounded-xl border border-green-200 bg-green-50/50 p-3 text-center">
              <p className="text-[11px] text-muted">รวมรายได้ตลอดอายุ (บาท)</p>
              <p className="mt-1 text-xl font-bold font-mono text-green-700">{thb(lifetimeTotal)}</p>
              <p className="mt-1 text-[10px] text-muted">
                นำเข้า {thb(lifetimeForwarderRevenue)} · สั่ง {thb(lifetimeShopRevenue)} · โอน{" "}
                {thb(lifetimePaymentRevenue)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div>
        <div className="mb-2 flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-base font-semibold">
            ไทม์ไลน์กิจกรรมล่าสุด{" "}
            <span className="ml-1 text-xs text-muted">
              ({timeline.length} / {MAX_EVENTS})
            </span>
          </h2>
          <p className="text-xs text-muted">เรียงตามวันที่ใหม่สุดก่อน · จำกัด {MAX_EVENTS} รายการล่าสุด</p>
        </div>

        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          {timeline.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted">ไม่พบกิจกรรมของลูกค้ารายนี้</p>
          ) : (
            <div className="overflow-x-auto scrollbar-x-visible">
              <table className="w-full text-sm">
                <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3">วันที่</th>
                    <th className="px-4 py-3">ประเภท</th>
                    <th className="px-4 py-3">รายการ</th>
                    <th className="px-4 py-3">รายละเอียด</th>
                    <th className="px-4 py-3">สถานะ</th>
                    <th className="px-4 py-3 text-right">จำนวน (บาท)</th>
                  </tr>
                </thead>
                <tbody>
                  {timeline.map((ev, idx) => (
                    <tr
                      key={`${ev.kind}-${idx}`}
                      className="border-t border-border hover:bg-surface-alt/30 align-top"
                    >
                      <td className="px-4 py-3 text-xs whitespace-nowrap text-muted">
                        {fmtDateTime(ev.date)}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] ${KIND_CLS[ev.kind]}`}
                        >
                          {KIND_LABEL[ev.kind]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {ev.href ? (
                          <Link href={ev.href} className="text-primary-600 hover:underline">
                            {ev.label}
                          </Link>
                        ) : (
                          ev.label
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted max-w-xs truncate" title={ev.detail}>
                        {ev.detail}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">{ev.status}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold whitespace-nowrap">
                        {ev.amount_thb !== null ? thb(ev.amount_thb) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
