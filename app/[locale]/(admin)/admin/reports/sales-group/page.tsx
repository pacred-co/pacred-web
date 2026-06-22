/**
 * /admin/reports/sales-group — รายงานยอดขายรวมตามรหัส
 *
 * Faithful port of legacy `pcs-admin/report-sales-group-by-user.php` →
 * `include/pages/report-sales-group-by-user/home.php` (read from disk per
 * AGENTS §0a/§0b). Lists EVERY customer with their lifetime per-service
 * count + amount, grouped by customer code. The legacy status filters
 * (the discriminator vs the user-all report) are:
 *   - ฝากสั่งซื้อ (shop)  → tb_header_order SUM(htotalpriceuser), COUNT(hno)  WHERE hstatus<>6
 *   - ฝากนำเข้า (import)  → tb_forwarder    SUM(ftotalprice),    COUNT(id)    WHERE fstatus>5  (จบงานแล้ว)
 *   - ฝากโอน (yuan)       → tb_payment      SUM(paythb),         COUNT(id)    WHERE paystatus='2' (สำเร็จ)
 * No order-date window — these are lifetime sales totals. The signup-date
 * window (default = this month) filters WHICH customers are listed; an
 * "ทั้งหมด" option lists every customer ever.
 *
 * The legacy column order is preserved (count then amount per service, with
 * เซลล์ + รหัส + ชื่อ at the end). Customer-type filter (all / ทั่วไป /
 * นิติบุคคล) is ported via tb_users.usercompany ('1' = นิติบุคคล per the
 * register seed; '' / '0' = ทั่วไป).
 *
 * READ-ONLY report. No writes. §0c: every read destructures { data, error }.
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
} from "../user-all/_lib/aggregate";

export const dynamic = "force-dynamic";

// ── Date helpers ─────────────────────────────────────────────────────────────

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function firstDayOfThisMonth(): string {
  const d = nowDate();
  return ymd(new Date(d.getFullYear(), d.getMonth(), 1));
}

function lastDayOfThisMonth(): string {
  const d = nowDate();
  return ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

function parseDate(raw: string | undefined): string | null {
  if (!raw) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

// ── Source-row shapes ────────────────────────────────────────────────────────

type ShopRow = { userid: string | null; htotalpriceuser: number | string | null; hdate: string | null };
type ForRow = { userid: string | null; ftotalprice: number | string | null; fdate: string | null };
type PayRow = { userid: string | null; paythb: number | string | null; paydate: string | null };

// NOTE on table casing (verified live against prod 2026-06-22):
//   tb_users columns are camelCase (userID, userName, …) — a lowercase select
//   throws 42703 "column does not exist", which the page swallows → the report
//   renders permanently EMPTY. The three money tables (tb_header_order /
//   tb_forwarder / tb_payment) ARE lowercase (userid, htotalpriceuser, …),
//   so those reads + the foldByUser helper stay lowercase. Only tb_users is camelCase.
type UserRow = {
  userID: string | null;
  userName: string | null;
  userLastName: string | null;
  userCompany: string | null;
  userRegistered: string | null;
  shopUser: string | null;
  channel: string | null;
  adminIDSale: string | null;
};

type SP = {
  signupFrom?: string;
  signupTo?: string;
  userType?: string; // "all" | "1" general | "2" juristic
  all?: string; // "1" = list every customer ever (legacy dateAll)
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function SalesGroupReport({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin(["super", "ops", "accounting", "sales_admin"]);
  const sp = await searchParams;

  const signupFrom = parseDate(sp.signupFrom) ?? firstDayOfThisMonth();
  const signupTo = parseDate(sp.signupTo) ?? lastDayOfThisMonth();
  const listAll = sp.all === "1";
  const userType = sp.userType === "1" || sp.userType === "2" ? sp.userType : "all";

  const admin = createAdminClient();

  // ── 1) Customers (the row set) ────────────────────────────────────────────
  let usersQ = admin
    .from("tb_users")
    .select("userID, userName, userLastName, userCompany, userRegistered, shopUser, channel, adminIDSale")
    .order("userRegistered", { ascending: true, nullsFirst: false })
    .limit(10000);

  if (!listAll) {
    usersQ = usersQ
      .gte("userRegistered", `${signupFrom} 00:00:00`)
      .lte("userRegistered", `${signupTo} 23:59:59`);
  }
  // Customer-type filter: userCompany '1' = นิติบุคคล, else = ทั่วไป.
  if (userType === "2") usersQ = usersQ.eq("userCompany", "1");
  else if (userType === "1") usersQ = usersQ.neq("userCompany", "1");

  const { data: usersData, error: usersErr } = await usersQ;
  if (usersErr) {
    console.error("[sales-group] tb_users read failed", {
      code: usersErr.code,
      message: usersErr.message,
      details: usersErr.details,
    });
  }
  const users = (usersData ?? []) as UserRow[];

  // ── 2) Lifetime per-service aggregates (legacy status filters) ────────────
  // ฝากสั่งซื้อ — hstatus<>6.
  const { data: shopData, error: shopErr } = await admin
    .from("tb_header_order")
    .select("userid, htotalpriceuser, hdate")
    .neq("hstatus", "6")
    .limit(200000);
  if (shopErr) console.error("[sales-group] tb_header_order read failed", { message: shopErr.message });

  // ฝากนำเข้า — fstatus>5 (จบงานแล้ว). fstatus is stored as a string '1'..'7';
  // .gt with a string compares lexically and would mis-handle multi-digit, but
  // the enum is single-digit '0'..'9' so '5' < '6'/'7' holds correctly.
  const { data: forData, error: forErr } = await admin
    .from("tb_forwarder")
    .select("userid, ftotalprice, fdate")
    .gt("fstatus", "5")
    .limit(200000);
  if (forErr) console.error("[sales-group] tb_forwarder read failed", { message: forErr.message });

  // ฝากโอน — paystatus='2' (สำเร็จ).
  const { data: payData, error: payErr } = await admin
    .from("tb_payment")
    .select("userid, paythb, paydate")
    .eq("paystatus", "2")
    .limit(200000);
  if (payErr) console.error("[sales-group] tb_payment read failed", { message: payErr.message });

  const shopBuckets = foldByUser(
    ((shopData ?? []) as ShopRow[]).map((r) => ({ userid: r.userid, amount: r.htotalpriceuser, date: r.hdate })),
  );
  const forBuckets = foldByUser(
    ((forData ?? []) as ForRow[]).map((r) => ({ userid: r.userid, amount: r.ftotalprice, date: r.fdate })),
  );
  const payBuckets = foldByUser(
    ((payData ?? []) as PayRow[]).map((r) => ({ userid: r.userid, amount: r.paythb, date: r.paydate })),
  );

  // ── 3) Build per-customer rows (legacy column order) ──────────────────────
  const rows = users.map((u) => {
    const uid = u.userID ?? "";
    const shop = shopBuckets.get(uid) ?? emptyBucket();
    const imp = forBuckets.get(uid) ?? emptyBucket();
    const pay = payBuckets.get(uid) ?? emptyBucket();
    const total = shop.amount + imp.amount + pay.amount;
    return { u, uid, shop, imp, pay, total };
  });

  // Grand totals.
  const totals = rows.reduce(
    (acc, r) => {
      acc.shopCount += r.shop.count;
      acc.shopAmt += r.shop.amount;
      acc.impCount += r.imp.count;
      acc.impAmt += r.imp.amount;
      acc.payCount += r.pay.count;
      acc.payAmt += r.pay.amount;
      acc.total += r.total;
      return acc;
    },
    { shopCount: 0, shopAmt: 0, impCount: 0, impAmt: 0, payCount: 0, payAmt: 0, total: 0 },
  );

  // Result description (legacy $textResult).
  const userTypeLabel = userType === "1" ? "ลูกค้าทั่วไป" : userType === "2" ? "ลูกค้านิติบุคคล" : "ลูกค้าทั้งหมด";
  const windowLabel = listAll ? "วันที่สมัครทั้งหมด" : `สมัคร ${signupFrom} ถึง ${signupTo}`;

  // ── CSV ───────────────────────────────────────────────────────────────────
  const csvRows = rows.map((r) => ({
    registered: r.u.userRegistered ?? "",
    channel: channelUserLabel(r.u.channel),
    shopUser: shopUserLabel(r.u.shopUser),
    shopCount: r.shop.count,
    shopAmt: r.shop.amount,
    impCount: r.imp.count,
    impAmt: r.imp.amount,
    payCount: r.pay.count,
    payAmt: r.pay.amount,
    total: r.total,
    sale: r.u.adminIDSale ?? "",
    userid: r.uid,
    fullname: `${r.u.userName ?? ""} ${r.u.userLastName ?? ""}`.trim(),
  }));
  const csvCols = [
    { key: "registered", label: "วันที่สมัครสมาชิก" },
    { key: "channel", label: "ช่องทางที่รู้จักมา" },
    { key: "shopUser", label: "ซื้อไปทำไม" },
    { key: "shopCount", label: "จำนวนสั่งซื้อ" },
    { key: "shopAmt", label: "ยอดฝากสั่งซื้อ" },
    { key: "impCount", label: "จำนวนนำเข้า" },
    { key: "impAmt", label: "ยอดฝากนำเข้า" },
    { key: "payCount", label: "จำนวนโอนหยวน" },
    { key: "payAmt", label: "ยอดโอนหยวน" },
    { key: "total", label: "รวมทุกบริการ" },
    { key: "sale", label: "เซลล์ที่ดูแล" },
    { key: "userid", label: "รหัสสมาชิก" },
    { key: "fullname", label: "ชื่อ-นามสกุล/ชื่อบริษัท" },
  ];

  const anyErr = usersErr || shopErr || forErr || payErr;

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · รายงาน</p>
          <h1 className="mt-1 text-2xl font-bold">ยอดขายรวมตามรหัส</h1>
          <p className="mt-1 text-sm text-muted">
            ยอดขายสะสมต่อรหัสลูกค้า (ฝากสั่งซื้อ + ฝากนำเข้าที่จบงาน + ฝากโอนสำเร็จ) · กรองตามวันที่สมัคร + ประเภทลูกค้า
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/reports/user-all"
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt"
          >
            ← ยอดรวมทุกบริการ
          </Link>
          <Link href="/admin/reports" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
            กลับรีพอร์ตหลัก
          </Link>
        </div>
      </div>

      {/* Result banner */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        ผลลัพธ์: <span className="font-semibold">{windowLabel}</span>
        {" · "}
        <span className="font-semibold">{userTypeLabel}</span>
        {" · "}
        ลูกค้า <span className="font-semibold">{intFmt(rows.length)}</span> ราย
      </div>

      {/* Filter form (GET) */}
      <form
        method="GET"
        action="/admin/reports/sales-group"
        className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm space-y-3"
      >
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
          <div>
            <label htmlFor="userType" className="block text-xs text-muted mb-1">ประเภทลูกค้า</label>
            <select
              id="userType"
              name="userType"
              defaultValue={userType}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            >
              <option value="all">ทั้งหมด</option>
              <option value="1">ลูกค้าทั่วไป</option>
              <option value="2">ลูกค้านิติบุคคล</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" name="all" value="1" defaultChecked={listAll} className="rounded border-border" />
              ลูกค้าทั้งหมดในระบบ
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
          <CsvButton rows={csvRows} cols={csvCols} filename={`sales-group-${listAll ? "all" : `${signupFrom}-to-${signupTo}`}.csv`} />
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
        <Card label="ยอดฝากสั่งซื้อ (บาท)" value={thb(totals.shopAmt)} sub={`${intFmt(totals.shopCount)} รายการ`} />
        <Card label="ยอดฝากนำเข้า (บาท)" value={thb(totals.impAmt)} sub={`${intFmt(totals.impCount)} รายการ`} />
        <Card label="ยอดโอนหยวน (บาท)" value={thb(totals.payAmt)} sub={`${intFmt(totals.payCount)} รายการ`} />
        <Card label="รวมทุกบริการ (บาท)" value={thb(totals.total)} highlight />
      </div>

      {/* Table — legacy column order preserved */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่พบลูกค้าตามเงื่อนไขนี้</p>
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-3">วันที่สมัคร</th>
                  <th className="px-3 py-3">ช่องทาง / ซื้อเพื่อ</th>
                  <th className="px-3 py-3 text-right">จำนวน<br/>สั่งซื้อ</th>
                  <th className="px-3 py-3 text-right">ยอดฝากสั่งซื้อ</th>
                  <th className="px-3 py-3 text-right">จำนวน<br/>นำเข้า</th>
                  <th className="px-3 py-3 text-right">ยอดฝากนำเข้า</th>
                  <th className="px-3 py-3 text-right">จำนวน<br/>โอนหยวน</th>
                  <th className="px-3 py-3 text-right">ยอดโอนหยวน</th>
                  <th className="px-3 py-3 text-right">รวมทุกบริการ</th>
                  <th className="px-3 py-3">เซลล์</th>
                  <th className="px-3 py-3">รหัส / ชื่อ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.uid} className="border-t border-border hover:bg-surface-alt/30 align-top">
                    <td className="px-3 py-3 text-[11px] text-muted">{r.u.userRegistered ?? "—"}</td>
                    <td className="px-3 py-3 text-[11px] text-muted">
                      <div>{channelUserLabel(r.u.channel)}</div>
                      <div>{shopUserLabel(r.u.shopUser)}</div>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs">{intFmt(r.shop.count)}</td>
                    <td className="px-3 py-3 text-right font-mono text-xs">{thb(r.shop.amount)}</td>
                    <td className="px-3 py-3 text-right font-mono text-xs">{intFmt(r.imp.count)}</td>
                    <td className="px-3 py-3 text-right font-mono text-xs">{thb(r.imp.amount)}</td>
                    <td className="px-3 py-3 text-right font-mono text-xs">{intFmt(r.pay.count)}</td>
                    <td className="px-3 py-3 text-right font-mono text-xs">{thb(r.pay.amount)}</td>
                    <td className="px-3 py-3 text-right font-mono text-xs font-semibold text-red-700">{thb(r.total)}</td>
                    <td className="px-3 py-3 text-[11px] text-muted">{r.u.adminIDSale || "—"}</td>
                    <td className="px-3 py-3 text-xs">
                      <Link
                        href={`/admin/customers/${encodeURIComponent(r.uid)}`}
                        className="font-mono text-primary-600 hover:underline"
                      >
                        {r.uid}
                      </Link>
                      <div className="mt-0.5 text-muted">
                        {`${r.u.userName ?? ""} ${r.u.userLastName ?? ""}`.trim() || "—"}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-surface-alt/50 font-semibold">
                <tr className="border-t border-border">
                  <td className="px-3 py-3 text-xs" colSpan={2}>รวมทั้งหมด ({intFmt(rows.length)} ราย)</td>
                  <td className="px-3 py-3 text-right font-mono text-xs">{intFmt(totals.shopCount)}</td>
                  <td className="px-3 py-3 text-right font-mono text-xs">{thb(totals.shopAmt)}</td>
                  <td className="px-3 py-3 text-right font-mono text-xs">{intFmt(totals.impCount)}</td>
                  <td className="px-3 py-3 text-right font-mono text-xs">{thb(totals.impAmt)}</td>
                  <td className="px-3 py-3 text-right font-mono text-xs">{intFmt(totals.payCount)}</td>
                  <td className="px-3 py-3 text-right font-mono text-xs">{thb(totals.payAmt)}</td>
                  <td className="px-3 py-3 text-right font-mono text-xs text-red-700">{thb(totals.total)}</td>
                  <td className="px-3 py-3" colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted">
        ค่าเริ่มต้น = ลูกค้าที่สมัครเดือนนี้ · ยอดเป็นยอดสะสมตลอดอายุบัญชี · ฝากนำเข้านับเฉพาะ fstatus &gt; 5 (จบงาน) ·
        ฝากโอนนับเฉพาะ paystatus 2 (สำเร็จ) · ฝากสั่งซื้อไม่นับ hstatus 6 (ยกเลิก) ตามระบบเดิม
      </p>
    </main>
  );
}

function Card({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border bg-white dark:bg-surface p-4 shadow-sm ${highlight ? "border-red-200" : "border-border"}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold font-mono ${highlight ? "text-red-700" : ""}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted">{sub}</p>}
    </div>
  );
}
