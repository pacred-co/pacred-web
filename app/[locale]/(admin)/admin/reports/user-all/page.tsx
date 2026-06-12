/**
 * /admin/reports/user-all — รายงานการใช้บริการของลูกค้า · ยอดรวมทุกบริการ
 *
 * Faithful port of legacy `pcs-admin/report-user-all.php` (read from disk per
 * AGENTS §0a/§0b). Per-customer roll-up across the three cargo services:
 *   - ฝากสั่งซื้อ (shop)   → tb_header_order SUM(htotalpriceuser) WHERE hstatus<>6
 *   - ฝากนำเข้า (import)   → tb_forwarder    SUM(ftotalprice)
 *   - ฝากโอน (yuan)        → tb_payment      SUM(paythb)
 *   - รวมทุกบริการ         = sum of the three
 * plus each service's last-activity date (legacy ...วันที่ล่าสุด columns).
 *
 * Legacy "ลักษณะข้อมูล" toggle:
 *   type=1 (จำนวนเงิน · default) → SUM of the amount columns
 *   type=2 (ปริมาณออเดอร์)        → COUNT of orders per service
 * Legacy date filters:
 *   - "วันที่สร้างออเดอร์" (order-create window) filters the 3 service queries
 *   - "วันที่สมัครสมาชิก"  (signup window) filters which customers are listed
 *
 * READ-ONLY report. No writes to any money/status table. The legacy page also
 * had an inline "userNote" edit form — intentionally NOT ported here (this is a
 * read-only report surface; notes are edited from the customer profile).
 *
 * §0c: every Supabase read destructures { data, error } + console.error; one
 * failed query degrades that column to 0 rather than 500-ing the whole page.
 */
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { CsvButton } from "@/components/admin/csv-button";
import { nowDate } from "@/lib/datetime-helpers";
import {
  shopUserLabel,
  channelUserLabel,
  thb,
  intFmt,
  foldByUser,
  emptyBucket,
} from "./_lib/aggregate";

export const dynamic = "force-dynamic";

// ── Date helpers ─────────────────────────────────────────────────────────────

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysAgo(n: number): string {
  const d = nowDate();
  d.setDate(d.getDate() - n);
  return ymd(d);
}

function parseDate(raw: string | undefined): string | null {
  if (!raw) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

// ── Source-row shapes ────────────────────────────────────────────────────────

type ShopRow = { userid: string | null; htotalpriceuser: number | string | null; hdate: string | null };
type ForRow = { userid: string | null; ftotalprice: number | string | null; fdate: string | null };
type PayRow = { userid: string | null; paythb: number | string | null; paydate: string | null };

type UserRow = {
  userid: string | null;
  username: string | null;
  userlastname: string | null;
  userstatus: string | null;
  userregistered: string | null;
  usertel: string | null;
  useremail: string | null;
  coid: string | null;
  shopuser: string | null;
  channel: string | null;
  adminidsale: string | null;
};

type SP = {
  type?: string; // "1" amount (default) | "2" count
  orderFrom?: string;
  orderTo?: string;
  signupFrom?: string;
  signupTo?: string;
  all?: string; // "1" = ignore order-date window (legacy historyTableAll)
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function UserAllReport({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin(["super", "ops", "accounting", "sales_admin"]);
  const sp = await searchParams;

  const type = sp.type === "2" ? "2" : "1"; // 1 = จำนวนเงิน, 2 = ปริมาณออเดอร์
  const showCount = type === "2";

  // Order-create window (defaults: last 60 days, matching legacy default).
  const orderFrom = parseDate(sp.orderFrom) ?? daysAgo(60);
  const orderTo = parseDate(sp.orderTo) ?? ymd(nowDate());
  const ignoreOrderWindow = sp.all === "1";

  // Signup window (defaults: last 45 days, matching legacy default).
  const signupFrom = parseDate(sp.signupFrom) ?? daysAgo(45);
  const signupTo = parseDate(sp.signupTo) ?? ymd(nowDate());

  const admin = createAdminClient();

  // ── 1) Customers in the signup window (the row set) ───────────────────────
  const usersQ = admin
    .from("tb_users")
    .select(
      "userid, username, userlastname, userstatus, userregistered, usertel, useremail, coid, shopuser, channel, adminidsale",
    )
    .gte("userregistered", `${signupFrom} 00:00:00`)
    .lte("userregistered", `${signupTo} 23:59:59`)
    .order("userregistered", { ascending: false, nullsFirst: false })
    .limit(5000);

  const { data: usersData, error: usersErr } = await usersQ;
  if (usersErr) {
    console.error("[user-all] tb_users read failed", {
      code: usersErr.code,
      message: usersErr.message,
      details: usersErr.details,
    });
  }
  const users = (usersData ?? []) as UserRow[];

  // ── 2) Per-service aggregates (filtered by the order-create window) ───────
  const applyOrderWindow = !ignoreOrderWindow;

  // ฝากสั่งซื้อ — tb_header_order, exclude hstatus=6 (cancelled, per legacy).
  let shopQ = admin.from("tb_header_order").select("userid, htotalpriceuser, hdate").neq("hstatus", "6");
  if (applyOrderWindow) {
    shopQ = shopQ.gte("hdate", `${orderFrom} 00:00:00`).lte("hdate", `${orderTo} 23:59:59`);
  }
  const { data: shopData, error: shopErr } = await shopQ.limit(100000);
  if (shopErr) console.error("[user-all] tb_header_order read failed", { message: shopErr.message });

  // ฝากนำเข้า — tb_forwarder.
  let forQ = admin.from("tb_forwarder").select("userid, ftotalprice, fdate");
  if (applyOrderWindow) {
    forQ = forQ.gte("fdate", `${orderFrom} 00:00:00`).lte("fdate", `${orderTo} 23:59:59`);
  }
  const { data: forData, error: forErr } = await forQ.limit(100000);
  if (forErr) console.error("[user-all] tb_forwarder read failed", { message: forErr.message });

  // ฝากโอน — tb_payment.
  let payQ = admin.from("tb_payment").select("userid, paythb, paydate");
  if (applyOrderWindow) {
    payQ = payQ.gte("paydate", `${orderFrom} 00:00:00`).lte("paydate", `${orderTo} 23:59:59`);
  }
  const { data: payData, error: payErr } = await payQ.limit(100000);
  if (payErr) console.error("[user-all] tb_payment read failed", { message: payErr.message });

  const shopBuckets = foldByUser(
    ((shopData ?? []) as ShopRow[]).map((r) => ({ userid: r.userid, amount: r.htotalpriceuser, date: r.hdate })),
  );
  const forBuckets = foldByUser(
    ((forData ?? []) as ForRow[]).map((r) => ({ userid: r.userid, amount: r.ftotalprice, date: r.fdate })),
  );
  const payBuckets = foldByUser(
    ((payData ?? []) as PayRow[]).map((r) => ({ userid: r.userid, amount: r.paythb, date: r.paydate })),
  );

  // ── 3) Build per-customer rows ────────────────────────────────────────────
  const rows = users.map((u) => {
    const uid = u.userid ?? "";
    const shop = shopBuckets.get(uid) ?? emptyBucket();
    const imp = forBuckets.get(uid) ?? emptyBucket();
    const pay = payBuckets.get(uid) ?? emptyBucket();
    const shopVal = showCount ? shop.count : shop.amount;
    const impVal = showCount ? imp.count : imp.amount;
    const payVal = showCount ? pay.count : pay.amount;
    const total = shopVal + impVal + payVal;
    const used = shop.count > 0 || imp.count > 0 || pay.count > 0;
    return { u, uid, shop, imp, pay, shopVal, impVal, payVal, total, used };
  });

  // Sort: customers who used a service first (highest total), then the rest.
  rows.sort((a, b) => Number(b.used) - Number(a.used) || b.total - a.total);

  // ── Grand totals (across all listed customers) ────────────────────────────
  const totals = rows.reduce(
    (acc, r) => {
      acc.shopVal += r.shopVal;
      acc.impVal += r.impVal;
      acc.payVal += r.payVal;
      acc.total += r.total;
      acc.usedCount += r.used ? 1 : 0;
      return acc;
    },
    { shopVal: 0, impVal: 0, payVal: 0, total: 0, usedCount: 0 },
  );

  const fmt = (n: number) => (showCount ? intFmt(n) : thb(n));

  // ── CSV ───────────────────────────────────────────────────────────────────
  const csvRows = rows.map((r) => ({
    userid: r.uid,
    fullname: `${r.u.username ?? ""} ${r.u.userlastname ?? ""}`.trim(),
    registered: r.u.userregistered ?? "",
    shopUser: shopUserLabel(r.u.shopuser),
    channel: channelUserLabel(r.u.channel),
    sale: r.u.adminidsale ?? "",
    shop: r.shopVal,
    shopLast: r.shop.lastDate ?? "",
    import: r.impVal,
    importLast: r.imp.lastDate ?? "",
    yuan: r.payVal,
    yuanLast: r.pay.lastDate ?? "",
    total: r.total,
    used: r.used ? "ใช้งานแล้ว" : "",
  }));
  const csvCols = [
    { key: "userid", label: "รหัสสมาชิก" },
    { key: "fullname", label: "ชื่อ-นามสกุล" },
    { key: "registered", label: "วันที่สมัคร" },
    { key: "shopUser", label: "ซื้อสินค้าเพื่อ" },
    { key: "channel", label: "รู้จักเราจาก" },
    { key: "sale", label: "เซลล์" },
    { key: "shop", label: showCount ? "ฝากสั่งซื้อ (รายการ)" : "ฝากสั่งซื้อ (บาท)" },
    { key: "shopLast", label: "ฝากสั่งซื้อล่าสุด" },
    { key: "import", label: showCount ? "ฝากนำเข้า (รายการ)" : "ฝากนำเข้า (บาท)" },
    { key: "importLast", label: "ฝากนำเข้าล่าสุด" },
    { key: "yuan", label: showCount ? "ฝากโอน (รายการ)" : "ฝากโอน (บาท)" },
    { key: "yuanLast", label: "ฝากโอนล่าสุด" },
    { key: "total", label: showCount ? "รวมทุกบริการ (รายการ)" : "รวมทุกบริการ (บาท)" },
    { key: "used", label: "ใช้งานแล้ว" },
  ];

  const anyErr = usersErr || shopErr || forErr || payErr;

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · รายงาน</p>
          <h1 className="mt-1 text-2xl font-bold">การใช้บริการของลูกค้า · ยอดรวมทุกบริการ</h1>
          <p className="mt-1 text-sm text-muted">
            ยอดต่อรหัสลูกค้า รวม ฝากสั่งซื้อ + ฝากนำเข้า + ฝากโอน · กรองตามวันที่สร้างออเดอร์ และวันที่สมัครสมาชิก
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/reports/sales-group"
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt"
          >
            ยอดขายตามรหัส →
          </Link>
          <Link href="/admin/reports" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
            ← กลับรีพอร์ตหลัก
          </Link>
        </div>
      </div>

      {/* Result banner */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        ลักษณะข้อมูล: <span className="font-semibold">{showCount ? "ปริมาณออเดอร์" : "จำนวนเงิน"}</span>
        {" · "}
        วันที่สร้างออเดอร์:{" "}
        <span className="font-semibold">{ignoreOrderWindow ? "ทั้งหมด" : `${orderFrom} ถึง ${orderTo}`}</span>
        {" · "}
        วันที่สมัคร: <span className="font-semibold">{signupFrom} ถึง {signupTo}</span>
        {" · "}
        ลูกค้า <span className="font-semibold">{intFmt(rows.length)}</span> ราย (ใช้บริการ {intFmt(totals.usedCount)})
      </div>

      {/* Filter form (GET) */}
      <form
        method="GET"
        action="/admin/reports/user-all"
        className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm space-y-3"
      >
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label htmlFor="type" className="block text-xs text-muted mb-1">ลักษณะข้อมูล</label>
            <select
              id="type"
              name="type"
              defaultValue={type}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            >
              <option value="1">จำนวนเงิน</option>
              <option value="2">ปริมาณออเดอร์</option>
            </select>
          </div>
          <div>
            <label htmlFor="orderFrom" className="block text-xs text-muted mb-1">สร้างออเดอร์ ตั้งแต่</label>
            <input
              id="orderFrom"
              type="date"
              name="orderFrom"
              defaultValue={orderFrom}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            />
          </div>
          <div>
            <label htmlFor="orderTo" className="block text-xs text-muted mb-1">สร้างออเดอร์ ถึง</label>
            <input
              id="orderTo"
              type="date"
              name="orderTo"
              defaultValue={orderTo}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            />
          </div>
          <div>
            <label htmlFor="signupFrom" className="block text-xs text-muted mb-1">สมัครสมาชิก ตั้งแต่</label>
            <input
              id="signupFrom"
              type="date"
              name="signupFrom"
              defaultValue={signupFrom}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            />
          </div>
          <div>
            <label htmlFor="signupTo" className="block text-xs text-muted mb-1">สมัครสมาชิก ถึง</label>
            <input
              id="signupTo"
              type="date"
              name="signupTo"
              defaultValue={signupTo}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" name="all" value="1" defaultChecked={ignoreOrderWindow} className="rounded border-border" />
              ไม่จำกัดช่วงสร้างออเดอร์ (ทั้งหมด)
            </label>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <button
            type="submit"
            className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600"
          >
            ค้นหาข้อมูล
          </button>
          <CsvButton rows={csvRows} cols={csvCols} filename={`user-all-${signupFrom}-to-${signupTo}.csv`} />
        </div>
      </form>

      {/* Error banner (soft-fail) */}
      {anyErr && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-semibold">อ่านข้อมูลบางส่วนไม่สำเร็จ — คอลัมน์ที่ผิดพลาดจะแสดงเป็น 0</p>
          <p className="mt-1 text-xs text-red-700">ตรวจสอบ log ของเซิร์ฟเวอร์เพื่อดูรายละเอียด query ที่ล้มเหลว</p>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid sm:grid-cols-4 gap-3">
        <Card label={showCount ? "ฝากสั่งซื้อ (รายการ)" : "ฝากสั่งซื้อ (บาท)"} value={fmt(totals.shopVal)} />
        <Card label={showCount ? "ฝากนำเข้า (รายการ)" : "ฝากนำเข้า (บาท)"} value={fmt(totals.impVal)} />
        <Card label={showCount ? "ฝากโอน (รายการ)" : "ฝากโอน (บาท)"} value={fmt(totals.payVal)} />
        <Card label={showCount ? "รวมทุกบริการ (รายการ)" : "รวมทุกบริการ (บาท)"} value={fmt(totals.total)} highlight />
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่พบลูกค้าในช่วงวันที่สมัครนี้</p>
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-3">รหัส / ชื่อ</th>
                  <th className="px-3 py-3">สมัคร · ซื้อเพื่อ · รู้จักจาก</th>
                  <th className="px-3 py-3 text-right">ฝากสั่งซื้อ</th>
                  <th className="px-3 py-3">ล่าสุด</th>
                  <th className="px-3 py-3 text-right">ฝากนำเข้า</th>
                  <th className="px-3 py-3">ล่าสุด</th>
                  <th className="px-3 py-3 text-right">ฝากโอน</th>
                  <th className="px-3 py-3">ล่าสุด</th>
                  <th className="px-3 py-3 text-right">รวมทุกบริการ</th>
                  <th className="px-3 py-3">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.uid} className="border-t border-border hover:bg-surface-alt/30 align-top">
                    <td className="px-3 py-3 text-xs">
                      <Link
                        href={`/admin/customers/${encodeURIComponent(r.uid)}`}
                        className="font-mono text-primary-600 hover:underline"
                      >
                        {r.uid}
                      </Link>
                      {r.u.userstatus === "0" && (
                        <span className="ml-1 text-[10px] text-red-600">(ถูกลบ)</span>
                      )}
                      <div className="mt-0.5 text-muted">
                        {`${r.u.username ?? ""} ${r.u.userlastname ?? ""}`.trim() || "—"}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[11px] text-muted">
                      <div>{r.u.userregistered ?? "—"}</div>
                      <div>{shopUserLabel(r.u.shopuser)}</div>
                      <div>{channelUserLabel(r.u.channel)}</div>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs">{fmt(r.shopVal)}</td>
                    <td className="px-3 py-3 text-[11px] text-muted">{r.shop.lastDate ?? "—"}</td>
                    <td className="px-3 py-3 text-right font-mono text-xs">{fmt(r.impVal)}</td>
                    <td className="px-3 py-3 text-[11px] text-muted">{r.imp.lastDate ?? "—"}</td>
                    <td className="px-3 py-3 text-right font-mono text-xs">{fmt(r.payVal)}</td>
                    <td className="px-3 py-3 text-[11px] text-muted">{r.pay.lastDate ?? "—"}</td>
                    <td className="px-3 py-3 text-right font-mono text-xs font-semibold text-red-700">{fmt(r.total)}</td>
                    <td className="px-3 py-3 text-[11px]">
                      {r.used ? <span className="text-emerald-600">ใช้งานแล้ว</span> : <span className="text-muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-surface-alt/50 font-semibold">
                <tr className="border-t border-border">
                  <td className="px-3 py-3 text-xs" colSpan={2}>รวมทั้งหมด ({intFmt(rows.length)} ราย)</td>
                  <td className="px-3 py-3 text-right font-mono text-xs">{fmt(totals.shopVal)}</td>
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3 text-right font-mono text-xs">{fmt(totals.impVal)}</td>
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3 text-right font-mono text-xs">{fmt(totals.payVal)}</td>
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3 text-right font-mono text-xs text-red-700">{fmt(totals.total)}</td>
                  <td className="px-3 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted">
        ค่าเริ่มต้น = สมัคร 45 วันล่าสุด · สร้างออเดอร์ 60 วันล่าสุด · ฝากสั่งซื้อไม่นับ hstatus 6 (ยกเลิก) ตามระบบเดิม ·
        กดรหัสลูกค้าเพื่อดูโปรไฟล์
      </p>
    </main>
  );
}

function Card({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border bg-white dark:bg-surface p-4 shadow-sm ${highlight ? "border-red-200" : "border-border"}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold font-mono ${highlight ? "text-red-700" : ""}`}>{value}</p>
    </div>
  );
}
