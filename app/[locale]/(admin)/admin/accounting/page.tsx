import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { Suspense } from "react";
import { AdminDateFilter } from "@/components/admin/date-filter";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";

type Profile = {
  member_code: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
} | null;

type FRow = {
  id: string; f_no: string; status: string; source_warehouse: string; transport_type: string;
  weight_kg: number; volume_cbm: number; total_price: number; created_at: string; profile: Profile;
};
type YRow = {
  id: string; channel: string | null; yuan_amount: number; exchange_rate: number;
  thb_amount: number; status: string; created_at: string; profile: Profile;
};
type SRow = {
  id: string; h_no: string; status: string; title: string | null;
  item_count: number; total_thb: number; created_at: string; profile: Profile;
};
type WRow = {
  id: string; kind: string; amount: number; status: string;
  bank_name: string | null; account_name: string | null; account_number: string | null;
  note: string | null; created_at: string; profile: Profile;
};

function normP(p: Profile | Profile[] | null): Profile {
  if (!p) return null;
  return Array.isArray(p) ? (p[0] ?? null) : p;
}
function sumCol(data: unknown[] | null, col: string): number {
  if (!data) return 0;
  return (data as Array<Record<string, number>>).reduce((s, r) => s + Math.abs(Number(r[col] ?? 0)), 0);
}
function thb(n: number) {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}
function profileName(p: Profile) {
  return [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "—";
}

const STATUS_BADGE: Record<string, string> = {
  pending_payment: "bg-yellow-50 text-yellow-700 border-yellow-200",
  pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
  awaiting_payment: "bg-yellow-50 text-yellow-700 border-yellow-200",
  shipped_china: "bg-blue-50 text-blue-700 border-blue-200",
  ordered: "bg-blue-50 text-blue-700 border-blue-200",
  processing: "bg-blue-50 text-blue-700 border-blue-200",
  in_transit: "bg-indigo-50 text-indigo-700 border-indigo-200",
  awaiting_chn_dispatch: "bg-indigo-50 text-indigo-700 border-indigo-200",
  arrived_thailand: "bg-purple-50 text-purple-700 border-purple-200",
  out_for_delivery: "bg-orange-50 text-orange-700 border-orange-200",
  delivered: "bg-green-50 text-green-700 border-green-200",
  completed: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-gray-50 text-gray-600 border-gray-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  refunded: "bg-gray-50 text-gray-600 border-gray-200",
};
const STATUS_LABEL: Record<string, string> = {
  pending_payment: "รอชำระ", pending: "รอ", awaiting_payment: "รอชำระ",
  shipped_china: "ออกจีน", ordered: "สั่งแล้ว", processing: "กำลังโอน",
  in_transit: "กลางทาง", awaiting_chn_dispatch: "รอจัดส่ง",
  arrived_thailand: "ถึงไทย", out_for_delivery: "ส่ง",
  delivered: "สำเร็จ", completed: "สำเร็จ",
  cancelled: "ยกเลิก", failed: "ล้มเหลว", refunded: "คืนเงิน",
};

const TABS = [
  { key: "summary",   label: "บัญชีรวม" },
  { key: "forwarder", label: "ฝากนำเข้า" },
  { key: "yuan",      label: "ฝากโอนหยวน" },
  { key: "shop",      label: "ฝากสั่งซื้อ" },
  { key: "topup",     label: "เติมเงิน" },
  { key: "withdraw",  label: "ถอนเงิน" },
  { key: "refund",    label: "คืนเงิน" },
];

type SP = { tab?: string; date_from?: string; date_to?: string };

export default async function AdminAccountingPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp       = await searchParams;
  const tab      = sp.tab ?? "summary";
  const dateFrom = sp.date_from;
  const dateTo   = sp.date_to;
  const admin    = createAdminClient();

  // ── fetch data per tab ──────────────────────────────────────────────────────

  let forwarderRows: FRow[] = [];
  let yuanRows: YRow[] = [];
  let shopRows: SRow[] = [];
  let walletRows: WRow[] = [];

  // summary-tab aggregate sums
  let sForwarder = 0, sYuan = 0, sShop = 0, sTopup = 0, sWithdraw = 0, sRefund = 0;
  // T-P5 owner-overview additions
  let sPrevNet = 0;          // total net revenue in the previous same-length window
  let nPendingDeposits = 0;  // count of pending wallet deposits (revenue waiting to land)
  let vAwaitingPayment = 0;  // baht value of service-orders in awaiting_payment status (revenue in flight)
  let vForwarderInFlight = 0;// baht value of forwarders not yet delivered (revenue in flight)
  let vYuanInProcess = 0;    // baht value of yuan_payments in pending+processing
  let nNewCustomers = 0;     // profiles created within current period
  let nActiveCustomers = 0;  // distinct profile_ids with any completed revenue tx in current period
  // other tabs: running totals computed after fetch
  let tabTotal = 0, tabCount = 0, tabPending = 0;
  let tabExtra = 0; // e.g. total weight for forwarder, total CNY for yuan

  if (tab === "summary") {
    const [fD, yD, sD, tD, wD, rD] = await Promise.all([
      (() => {
        let q = admin.from("forwarders").select("total_price").eq("status", "delivered");
        if (dateFrom) q = q.gte("created_at", dateFrom);
        if (dateTo)   q = q.lte("created_at", dateTo + "T23:59:59");
        return q;
      })(),
      (() => {
        let q = admin.from("yuan_payments").select("thb_amount").eq("status", "completed");
        if (dateFrom) q = q.gte("created_at", dateFrom);
        if (dateTo)   q = q.lte("created_at", dateTo + "T23:59:59");
        return q;
      })(),
      (() => {
        let q = admin.from("service_orders").select("total_thb").eq("status", "completed");
        if (dateFrom) q = q.gte("created_at", dateFrom);
        if (dateTo)   q = q.lte("created_at", dateTo + "T23:59:59");
        return q;
      })(),
      (() => {
        let q = admin.from("wallet_transactions").select("amount").eq("kind", "deposit").eq("status", "completed");
        if (dateFrom) q = q.gte("created_at", dateFrom);
        if (dateTo)   q = q.lte("created_at", dateTo + "T23:59:59");
        return q;
      })(),
      (() => {
        let q = admin.from("wallet_transactions").select("amount").eq("kind", "withdraw").eq("status", "completed");
        if (dateFrom) q = q.gte("created_at", dateFrom);
        if (dateTo)   q = q.lte("created_at", dateTo + "T23:59:59");
        return q;
      })(),
      (() => {
        let q = admin.from("wallet_transactions").select("amount").eq("kind", "refund").eq("status", "completed");
        if (dateFrom) q = q.gte("created_at", dateFrom);
        if (dateTo)   q = q.lte("created_at", dateTo + "T23:59:59");
        return q;
      })(),
    ]);
    sForwarder = sumCol(fD.data, "total_price");
    sYuan      = sumCol(yD.data, "thb_amount");
    sShop      = sumCol(sD.data, "total_thb");
    sTopup     = sumCol(tD.data, "amount");
    sWithdraw  = sumCol(wD.data, "amount");
    sRefund    = sumCol(rD.data, "amount");

    // T-P5 owner-overview: previous-period comparison + pending pipeline +
    // customer counts. All run in parallel; each query degrades to 0 if
    // dateFrom/dateTo aren't set (full-history view → no comparison).
    const sNetCurrent = sForwarder + sYuan + sShop;

    // Compute previous-period window (same length as current, immediately before).
    let prevFrom: string | undefined, prevTo: string | undefined;
    if (dateFrom && dateTo) {
      const cFrom = new Date(dateFrom);
      const cTo   = new Date(dateTo);
      const lenMs = cTo.getTime() - cFrom.getTime();
      if (lenMs > 0) {
        const pTo   = new Date(cFrom.getTime() - 1);                 // one ms before current window
        const pFrom = new Date(pTo.getTime() - lenMs);
        prevFrom = pFrom.toISOString().slice(0, 10);
        prevTo   = pTo.toISOString().slice(0, 10);
      }
    }

    const [prevF, prevY, prevS, pendDep, awaitPay, fwdInFlight, yuanInProc, newCust, activeCust] = await Promise.all([
      // PREV PERIOD revenue — only if both dates are set (else returns 0)
      prevFrom && prevTo
        ? admin.from("forwarders").select("total_price").eq("status", "delivered")
            .gte("created_at", prevFrom).lte("created_at", prevTo + "T23:59:59")
        : Promise.resolve({ data: [] as Array<{ total_price: number }> }),
      prevFrom && prevTo
        ? admin.from("yuan_payments").select("thb_amount").eq("status", "completed")
            .gte("created_at", prevFrom).lte("created_at", prevTo + "T23:59:59")
        : Promise.resolve({ data: [] as Array<{ thb_amount: number }> }),
      prevFrom && prevTo
        ? admin.from("service_orders").select("total_thb").eq("status", "completed")
            .gte("created_at", prevFrom).lte("created_at", prevTo + "T23:59:59")
        : Promise.resolve({ data: [] as Array<{ total_thb: number }> }),

      // PIPELINE — what's in flight that will become revenue (independent of date window)
      admin.from("wallet_transactions")
        .select("id", { count: "exact", head: true })
        .eq("kind", "deposit").eq("status", "pending"),
      admin.from("service_orders").select("total_thb").eq("status", "awaiting_payment"),
      admin.from("forwarders").select("total_price")
        .not("status", "in", "(delivered,cancelled)"),
      admin.from("yuan_payments").select("thb_amount").in("status", ["pending", "processing"]),

      // CUSTOMER COUNTS — gated on date window (else "all-time" doesn't make sense)
      (() => {
        let q = admin.from("profiles").select("id", { count: "exact", head: true })
          .eq("status", "active");
        if (dateFrom) q = q.gte("created_at", dateFrom);
        if (dateTo)   q = q.lte("created_at", dateTo + "T23:59:59");
        return q;
      })(),
      // active = distinct profile_ids that paid us anything in the window. Use
      // wallet_transactions as the join point — every revenue event lands a
      // wallet row.  amount<0 = customer paid us (debit).
      (() => {
        let q = admin.from("wallet_transactions")
          .select("profile_id")
          .eq("status", "completed")
          .lt("amount", 0);
        if (dateFrom) q = q.gte("created_at", dateFrom);
        if (dateTo)   q = q.lte("created_at", dateTo + "T23:59:59");
        return q;
      })(),
    ]);

    sPrevNet = sumCol(prevF.data, "total_price") + sumCol(prevY.data, "thb_amount") + sumCol(prevS.data, "total_thb");
    nPendingDeposits   = pendDep.count ?? 0;
    vAwaitingPayment   = sumCol(awaitPay.data, "total_thb");
    vForwarderInFlight = sumCol(fwdInFlight.data, "total_price");
    vYuanInProcess     = sumCol(yuanInProc.data, "thb_amount");
    nNewCustomers      = newCust.count ?? 0;
    nActiveCustomers   = new Set(((activeCust.data ?? []) as Array<{ profile_id: string }>).map((r) => r.profile_id)).size;

    // Stash for the render block (so we don't recompute or pass extra args).
    void sNetCurrent;
  } else if (tab === "forwarder") {
    let q = admin
      .from("forwarders")
      .select(`id, f_no, status, source_warehouse, transport_type, weight_kg, volume_cbm, total_price, created_at,
        profile:profiles!profile_id ( member_code, first_name, last_name, phone )`)
      .order("created_at", { ascending: false })
      .limit(500);
    if (dateFrom) q = q.gte("created_at", dateFrom);
    if (dateTo)   q = q.lte("created_at", dateTo + "T23:59:59");
    const { data } = await q;
    type Raw = Omit<FRow, "profile"> & { profile: Profile | Profile[] | null };
    forwarderRows = ((data ?? []) as Raw[]).map((r) => ({ ...r, profile: normP(r.profile) }));
    tabCount = forwarderRows.length;
    tabTotal = forwarderRows.reduce((s, r) => s + Number(r.total_price ?? 0), 0);
    tabExtra = forwarderRows.reduce((s, r) => s + Number(r.weight_kg ?? 0), 0);

  } else if (tab === "yuan") {
    let q = admin
      .from("yuan_payments")
      .select(`id, channel, yuan_amount, exchange_rate, thb_amount, status, created_at,
        profile:profiles!profile_id ( member_code, first_name, last_name, phone )`)
      .order("created_at", { ascending: false })
      .limit(500);
    if (dateFrom) q = q.gte("created_at", dateFrom);
    if (dateTo)   q = q.lte("created_at", dateTo + "T23:59:59");
    const { data } = await q;
    type Raw = Omit<YRow, "profile"> & { profile: Profile | Profile[] | null };
    yuanRows = ((data ?? []) as Raw[]).map((r) => ({ ...r, profile: normP(r.profile) }));
    tabCount = yuanRows.length;
    tabTotal = yuanRows.reduce((s, r) => s + Number(r.thb_amount ?? 0), 0);
    tabExtra = yuanRows.reduce((s, r) => s + Number(r.yuan_amount ?? 0), 0);

  } else if (tab === "shop") {
    let q = admin
      .from("service_orders")
      .select(`id, h_no, status, title, item_count, total_thb, created_at,
        profile:profiles!profile_id ( member_code, first_name, last_name, phone )`)
      .order("created_at", { ascending: false })
      .limit(500);
    if (dateFrom) q = q.gte("created_at", dateFrom);
    if (dateTo)   q = q.lte("created_at", dateTo + "T23:59:59");
    const { data } = await q;
    type Raw = Omit<SRow, "profile"> & { profile: Profile | Profile[] | null };
    shopRows = ((data ?? []) as Raw[]).map((r) => ({ ...r, profile: normP(r.profile) }));
    tabCount = shopRows.length;
    tabTotal = shopRows.reduce((s, r) => s + Number(r.total_thb ?? 0), 0);
    tabExtra = shopRows.reduce((s, r) => s + Number(r.item_count ?? 0), 0);

  } else if (tab === "topup" || tab === "withdraw" || tab === "refund") {
    const kind = tab === "topup" ? "deposit" : tab === "withdraw" ? "withdraw" : "refund";
    let q = admin
      .from("wallet_transactions")
      .select(`id, kind, amount, status, bank_name, account_name, account_number, note, created_at,
        profile:profiles!profile_id ( member_code, first_name, last_name, phone )`)
      .eq("kind", kind)
      .order("created_at", { ascending: false })
      .limit(500);
    if (dateFrom) q = q.gte("created_at", dateFrom);
    if (dateTo)   q = q.lte("created_at", dateTo + "T23:59:59");
    const { data } = await q;
    type Raw = Omit<WRow, "profile"> & { profile: Profile | Profile[] | null };
    walletRows = ((data ?? []) as Raw[]).map((r) => ({ ...r, profile: normP(r.profile) }));
    tabCount   = walletRows.length;
    tabPending = walletRows.filter((r) => r.status === "pending").length;
    tabTotal   = walletRows
      .filter((r) => r.status === "completed")
      .reduce((s, r) => s + Math.abs(Number(r.amount ?? 0)), 0);
  }

  // ── CSV data ────────────────────────────────────────────────────────────────

  const forwarderCsv: CsvRow[] = forwarderRows.map((r) => ({
    เลขที่: r.f_no,
    รหัสสมาชิก: r.profile?.member_code ?? "",
    ชื่อ: profileName(r.profile),
    เบอร์: r.profile?.phone ?? "",
    คลัง: r.source_warehouse,
    ขนส่ง: r.transport_type,
    น้ำหนักkg: r.weight_kg,
    ปริมาตรcbm: r.volume_cbm,
    ราคา: r.total_price,
    สถานะ: STATUS_LABEL[r.status] ?? r.status,
    วันที่: new Date(r.created_at).toLocaleDateString("th-TH"),
  }));

  const yuanCsv: CsvRow[] = yuanRows.map((r) => ({
    รหัสสมาชิก: r.profile?.member_code ?? "",
    ชื่อ: profileName(r.profile),
    เบอร์: r.profile?.phone ?? "",
    ช่องทาง: r.channel ?? "",
    หยวน: r.yuan_amount,
    อัตราแลกเปลี่ยน: r.exchange_rate,
    บาท: r.thb_amount,
    สถานะ: STATUS_LABEL[r.status] ?? r.status,
    วันที่: new Date(r.created_at).toLocaleDateString("th-TH"),
  }));

  const shopCsv: CsvRow[] = shopRows.map((r) => ({
    เลขที่: r.h_no,
    รหัสสมาชิก: r.profile?.member_code ?? "",
    ชื่อ: profileName(r.profile),
    เบอร์: r.profile?.phone ?? "",
    รายการ: r.title ?? "",
    ชิ้น: r.item_count,
    ยอด: r.total_thb,
    สถานะ: STATUS_LABEL[r.status] ?? r.status,
    วันที่: new Date(r.created_at).toLocaleDateString("th-TH"),
  }));

  const walletCsv: CsvRow[] = walletRows.map((r) => ({
    รหัสสมาชิก: r.profile?.member_code ?? "",
    ชื่อ: profileName(r.profile),
    เบอร์: r.profile?.phone ?? "",
    จำนวน: r.amount,
    ธนาคาร: r.bank_name ?? "",
    ชื่อบัญชี: r.account_name ?? "",
    เลขบัญชี: r.account_number ?? "",
    หมายเหตุ: r.note ?? "",
    สถานะ: STATUS_LABEL[r.status] ?? r.status,
    วันที่: new Date(r.created_at).toLocaleDateString("th-TH"),
  }));

  const csvFilename = `accounting_${tab}_${dateFrom ?? "all"}_${dateTo ?? "all"}.csv`;

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN</p>
          <h1 className="mt-1 text-2xl font-bold">ระบบบัญชี</h1>
          {(dateFrom || dateTo) && (
            <p className="text-sm text-muted mt-0.5">
              {dateFrom ? new Date(dateFrom).toLocaleDateString("th-TH") : "ทั้งหมด"}
              {" — "}
              {dateTo ? new Date(dateTo).toLocaleDateString("th-TH") : "ปัจจุบัน"}
            </p>
          )}
        </div>
        <Link
          href="/admin/accounting/closing"
          className="rounded-lg border border-primary-200 bg-primary-50 px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-100"
        >
          📋 ปิดงบฝากนำเข้ารายเดือน →
        </Link>
      </div>

      {/* Tab nav */}
      <div className="flex flex-wrap border-b border-border gap-0">
        {TABS.map((t) => {
          const params = new URLSearchParams();
          params.set("tab", t.key);
          if (dateFrom) params.set("date_from", dateFrom);
          if (dateTo)   params.set("date_to", dateTo);
          const active = tab === t.key;
          return (
            <Link
              key={t.key}
              href={`/admin/accounting?${params}`}
              className={`px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors whitespace-nowrap ${
                active
                  ? "border-primary-500 text-primary-600"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* Date filter */}
      <Suspense>
        <AdminDateFilter tab={tab} dateFrom={dateFrom} dateTo={dateTo} />
      </Suspense>

      {/* ── Summary tab ───────────────────────────────────────────────── */}
      {tab === "summary" && (
        <div className="space-y-4">
          {/* T-P5 owner-overview hero — net revenue big number + delta vs prev period */}
          <OwnerHero
            netCurrent={sForwarder + sYuan + sShop}
            netPrev={sPrevNet}
            hasComparison={Boolean(dateFrom && dateTo) && sPrevNet > 0}
          />

          {/* T-P5 pipeline cards — what's in flight (future revenue) */}
          <div>
            <h2 className="text-sm font-bold text-muted uppercase tracking-wider mb-2">
              💼 รายได้ที่กำลังจะเข้า (Pending pipeline)
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <PipelineCard
                label="Deposits รอตรวจสลิป"
                value={`${nPendingDeposits} รายการ`}
                hint="ลูกค้าโอนแล้ว รอ admin อนุมัติ"
                href="/admin/wallet?kind=deposit&status=pending"
                tone="yellow"
              />
              <PipelineCard
                label="ฝากสั่งรอชำระ"
                value={thb(vAwaitingPayment)}
                hint="ออเดอร์ที่ลูกค้ายังไม่จ่าย"
                href="/admin/service-orders?status=awaiting_payment"
                tone="yellow"
              />
              <PipelineCard
                label="ฝากนำเข้ายังไม่ส่งมอบ"
                value={thb(vForwarderInFlight)}
                hint="กำลังเดินทาง / รอชำระ / เคลียร์ด่าน"
                href="/admin/forwarders"
                tone="blue"
              />
              <PipelineCard
                label="ฝากโอนหยวนกำลังโอน"
                value={thb(vYuanInProcess)}
                hint="pending + processing"
                href="/admin/yuan-payments?status=pending"
                tone="blue"
              />
            </div>
          </div>

          {/* T-P5 customer counts — only meaningful if a date window is set */}
          {(dateFrom || dateTo) && (
            <div>
              <h2 className="text-sm font-bold text-muted uppercase tracking-wider mb-2">
                👥 ลูกค้าในช่วงนี้
              </h2>
              <div className="grid sm:grid-cols-2 gap-3">
                <PipelineCard
                  label="ลูกค้าใหม่ (สมัครในช่วงนี้)"
                  value={`${nNewCustomers} คน`}
                  hint="status=active, สมัครภายในช่วงเวลา"
                  href="/admin/customers"
                  tone="green"
                />
                <PipelineCard
                  label="ลูกค้าที่ใช้บริการ (จ่ายเงินจริง)"
                  value={`${nActiveCustomers} คน`}
                  hint="distinct profile ที่จ่ายเงิน Pacred ในช่วง"
                  href="/admin/customers"
                  tone="green"
                />
              </div>
            </div>
          )}

          {/* Existing breakdown cards — by revenue source */}
          <div>
            <h2 className="text-sm font-bold text-muted uppercase tracking-wider mb-2">
              📊 รายได้แยกประเภท
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <SumCard label="ฝากนำเข้า (ส่งมอบแล้ว)" value={sForwarder} tone="green" />
              <SumCard label="ฝากโอนหยวน (สำเร็จ)"   value={sYuan}      tone="green" />
              <SumCard label="ฝากสั่งซื้อ (สำเร็จ)"   value={sShop}      tone="green" />
              <SumCard label="เติมเงินรวม (อนุมัติ)"   value={sTopup}     tone="blue" />
              <SumCard label="ถอนเงินรวม (จ่ายแล้ว)"  value={sWithdraw}  tone="red" />
              <SumCard label="คืนเงินรวม (สำเร็จ)"     value={sRefund}    tone="red" />
            </div>
          </div>

          {/* Existing net-revenue card — kept as bottom recap */}
          <div className="rounded-2xl border border-primary-200 bg-primary-50 p-5">
            <p className="text-xs text-muted font-medium">รายรับสุทธิ (ฝากนำเข้า + ฝากโอน + ฝากสั่ง)</p>
            <p className="mt-1 text-3xl font-bold font-mono text-primary-700">
              {thb(sForwarder + sYuan + sShop)}
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl border border-border bg-white p-4 space-y-2">
              <p className="font-semibold text-muted uppercase tracking-wide text-[10px]">ลิงก์ด่วน</p>
              {[
                ["/admin/forwarders?status=delivered", "ฝากนำเข้าที่ส่งมอบแล้ว"],
                ["/admin/yuan-payments?status=completed", "ฝากโอนหยวนสำเร็จ"],
                ["/admin/service-orders?status=completed", "ฝากสั่งสำเร็จ"],
              ].map(([href, label]) => (
                <Link key={href} href={href} className="block text-primary-500 hover:underline">→ {label}</Link>
              ))}
            </div>
            <div className="rounded-xl border border-border bg-white p-4 space-y-2">
              <p className="font-semibold text-muted uppercase tracking-wide text-[10px]">กระเป๋าเงิน</p>
              {[
                ["/admin/wallet?kind=deposit&status=pending", "เติมเงินรอตรวจ"],
                ["/admin/wallet?kind=withdraw&status=pending", "ถอนเงินรอจ่าย"],
              ].map(([href, label]) => (
                <Link key={href} href={href} className="block text-primary-500 hover:underline">→ {label}</Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Forwarder tab ─────────────────────────────────────────────── */}
      {tab === "forwarder" && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <StatCard label="รายการทั้งหมด" value={String(tabCount)} />
            <StatCard label="น้ำหนักรวม"    value={`${tabExtra.toFixed(2)} kg`} />
            <StatCard label="รายรับรวม"     value={thb(tabTotal)} tone="green" />
          </div>
          <div className="flex justify-end">
            <CsvButton
              rows={forwarderCsv}
              cols={Object.keys(forwarderCsv[0] ?? {}).map((k) => ({ key: k, label: k }))}
              filename={csvFilename}
            />
          </div>
          <DataTable
            headers={["เลขที่", "ลูกค้า", "คลัง/ขนส่ง", "น้ำหนัก/CBM", "ราคา", "สถานะ", "วันที่"]}
            empty={forwarderRows.length === 0}
          >
            {forwarderRows.map((r) => (
              <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                <td className="px-4 py-3 font-mono text-xs">
                  <Link href={`/admin/forwarders/${r.f_no}`} className="text-primary-600 hover:underline">{r.f_no}</Link>
                </td>
                <td className="px-4 py-3 text-xs">
                  <div className="font-mono">{r.profile?.member_code ?? "—"}</div>
                  <div>{profileName(r.profile)}</div>
                  <div className="text-muted">{r.profile?.phone}</div>
                </td>
                <td className="px-4 py-3 text-xs">{r.source_warehouse} / {r.transport_type}</td>
                <td className="px-4 py-3 text-right text-xs">
                  {Number(r.weight_kg).toFixed(2)} kg<br />
                  <span className="text-muted">{Number(r.volume_cbm).toFixed(3)} cbm</span>
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs">{thb(r.total_price)}</td>
                <td className="px-4 py-3"><StatusBadge s={r.status} /></td>
                <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{new Date(r.created_at).toLocaleDateString("th-TH")}</td>
              </tr>
            ))}
          </DataTable>
        </div>
      )}

      {/* ── Yuan tab ──────────────────────────────────────────────────── */}
      {tab === "yuan" && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <StatCard label="รายการทั้งหมด"  value={String(tabCount)} />
            <StatCard label="รวมหยวน"        value={`¥${tabExtra.toFixed(2)}`} />
            <StatCard label="รวมบาท"          value={thb(tabTotal)} tone="green" />
          </div>
          <div className="flex justify-end">
            <CsvButton
              rows={yuanCsv}
              cols={Object.keys(yuanCsv[0] ?? {}).map((k) => ({ key: k, label: k }))}
              filename={csvFilename}
            />
          </div>
          <DataTable
            headers={["ลูกค้า", "ช่องทาง", "หยวน", "อัตรา", "บาท", "สถานะ", "วันที่"]}
            empty={yuanRows.length === 0}
          >
            {yuanRows.map((r) => (
              <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                <td className="px-4 py-3 text-xs">
                  <div className="font-mono">{r.profile?.member_code ?? "—"}</div>
                  <div>{profileName(r.profile)}</div>
                  <div className="text-muted">{r.profile?.phone}</div>
                </td>
                <td className="px-4 py-3 text-xs">{r.channel ?? "—"}</td>
                <td className="px-4 py-3 text-right font-mono">¥{Number(r.yuan_amount).toFixed(2)}</td>
                <td className="px-4 py-3 text-right text-xs text-muted">{Number(r.exchange_rate).toFixed(4)}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">{thb(r.thb_amount)}</td>
                <td className="px-4 py-3"><StatusBadge s={r.status} /></td>
                <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{new Date(r.created_at).toLocaleDateString("th-TH")}</td>
              </tr>
            ))}
          </DataTable>
        </div>
      )}

      {/* ── Shop tab ──────────────────────────────────────────────────── */}
      {tab === "shop" && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <StatCard label="รายการทั้งหมด" value={String(tabCount)} />
            <StatCard label="จำนวนชิ้นรวม"  value={`${tabExtra} ชิ้น`} />
            <StatCard label="ยอดรวม"        value={thb(tabTotal)} tone="green" />
          </div>
          <div className="flex justify-end">
            <CsvButton
              rows={shopCsv}
              cols={Object.keys(shopCsv[0] ?? {}).map((k) => ({ key: k, label: k }))}
              filename={csvFilename}
            />
          </div>
          <DataTable
            headers={["เลขที่", "ลูกค้า", "รายการ", "ชิ้น", "ยอด", "สถานะ", "วันที่"]}
            empty={shopRows.length === 0}
          >
            {shopRows.map((r) => (
              <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                <td className="px-4 py-3 font-mono text-xs">
                  <Link href={`/admin/service-orders/${r.h_no}`} className="text-primary-600 hover:underline">{r.h_no}</Link>
                </td>
                <td className="px-4 py-3 text-xs">
                  <div className="font-mono">{r.profile?.member_code ?? "—"}</div>
                  <div>{profileName(r.profile)}</div>
                  <div className="text-muted">{r.profile?.phone}</div>
                </td>
                <td className="px-4 py-3 text-xs">{r.title ?? "—"}</td>
                <td className="px-4 py-3 text-right text-xs">{r.item_count}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">{thb(r.total_thb)}</td>
                <td className="px-4 py-3"><StatusBadge s={r.status} /></td>
                <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{new Date(r.created_at).toLocaleDateString("th-TH")}</td>
              </tr>
            ))}
          </DataTable>
        </div>
      )}

      {/* ── Wallet tabs (topup / withdraw / refund) ────────────────────── */}
      {(tab === "topup" || tab === "withdraw" || tab === "refund") && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <StatCard label="รายการทั้งหมด"    value={String(tabCount)} />
            <StatCard label="รอดำเนินการ"      value={String(tabPending)} tone={tabPending > 0 ? "warn" : undefined} />
            <StatCard
              label={tab === "topup" ? "เติมรวม (อนุมัติ)" : tab === "withdraw" ? "ถอนรวม (จ่ายแล้ว)" : "คืนรวม (สำเร็จ)"}
              value={thb(tabTotal)}
              tone={tab === "topup" ? "green" : "red"}
            />
          </div>
          <div className="flex justify-end">
            <CsvButton
              rows={walletCsv}
              cols={Object.keys(walletCsv[0] ?? {}).map((k) => ({ key: k, label: k }))}
              filename={csvFilename}
            />
          </div>
          <DataTable
            headers={["ลูกค้า", "จำนวน (฿)", "บัญชี/หลักฐาน", "หมายเหตุ", "สถานะ", "วันที่"]}
            empty={walletRows.length === 0}
          >
            {walletRows.map((r) => (
              <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                <td className="px-4 py-3 text-xs">
                  <div className="font-mono">{r.profile?.member_code ?? "—"}</div>
                  <div>{profileName(r.profile)}</div>
                  <div className="text-muted">{r.profile?.phone}</div>
                </td>
                <td className={`px-4 py-3 text-right font-mono font-bold ${r.amount < 0 ? "text-red-700" : "text-green-700"}`}>
                  {r.amount > 0 ? "+" : ""}{Number(r.amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-xs space-y-0.5">
                  {r.bank_name    && <div>{r.bank_name}</div>}
                  {r.account_name && <div className="text-muted">{r.account_name}</div>}
                  {r.account_number && <div className="font-mono text-muted text-[10px]">{r.account_number}</div>}
                </td>
                <td className="px-4 py-3 text-xs text-muted">{r.note ?? "—"}</td>
                <td className="px-4 py-3"><StatusBadge s={r.status} /></td>
                <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{new Date(r.created_at).toLocaleString("th-TH")}</td>
              </tr>
            ))}
          </DataTable>
        </div>
      )}
    </main>
  );
}

// ── Shared sub-components ───────────────────────────────────────────────────

function SumCard({ label, value, tone = "green" }: { label: string; value: number; tone?: "green" | "blue" | "red" }) {
  const colors = { green: "text-green-700", blue: "text-blue-700", red: "text-red-700" }[tone];
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-xl font-bold font-mono ${colors}`}>
        ฿{value.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
      </p>
    </div>
  );
}

// T-P5: Hero "net revenue" card with comparison to previous same-length window.
// Falls back to a simpler card (no delta) if `hasComparison` is false — that
// happens when the date filter isn't a closed window (all-time view).
function OwnerHero({ netCurrent, netPrev, hasComparison }: { netCurrent: number; netPrev: number; hasComparison: boolean }) {
  const deltaAbs = netCurrent - netPrev;
  const deltaPct = netPrev > 0 ? ((netCurrent - netPrev) / netPrev) * 100 : null;
  const trendColor =
    !hasComparison      ? "text-muted"
    : deltaAbs > 0      ? "text-green-700"
    : deltaAbs < 0      ? "text-red-700"
    :                     "text-muted";
  const trendIcon =
    !hasComparison      ? ""
    : deltaAbs > 0      ? "↑"
    : deltaAbs < 0      ? "↓"
    :                     "→";

  return (
    <div className="rounded-3xl border border-primary-300 bg-gradient-to-br from-primary-50 to-white dark:from-primary-950/30 dark:to-surface p-6 shadow-md">
      <p className="text-xs font-semibold text-primary-700 uppercase tracking-widest">รายรับสุทธิ {hasComparison ? "ในช่วงที่เลือก" : "(ทั้งหมด)"}</p>
      <p className="mt-2 text-5xl font-bold font-mono text-primary-700">
        ฿{netCurrent.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
      </p>
      {hasComparison && (
        <p className={`mt-3 text-sm font-medium ${trendColor}`}>
          {trendIcon} {deltaAbs >= 0 ? "+" : ""}฿{deltaAbs.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
          {deltaPct !== null && (
            <> ({deltaAbs >= 0 ? "+" : ""}{deltaPct.toFixed(1)}%)</>
          )}
          <span className="text-muted font-normal"> เทียบช่วงเดียวกันก่อนหน้า (รวม ฿{netPrev.toLocaleString("th-TH", { minimumFractionDigits: 2 })})</span>
        </p>
      )}
      {!hasComparison && (
        <p className="mt-3 text-xs text-muted">
          เลือกช่วงเวลา (ทั้ง &ldquo;ตั้งแต่&rdquo; และ &ldquo;ถึง&rdquo;) เพื่อดูเทียบกับช่วงก่อนหน้า
        </p>
      )}
    </div>
  );
}

// T-P5: pipeline / quick-look card. value is a string so it can show
// counts ("12 รายการ") or money ("฿4,500.00") — owner shouldn't have to
// guess units.
function PipelineCard({
  label,
  value,
  hint,
  href,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  href: string;
  tone: "yellow" | "blue" | "green";
}) {
  const borderColor =
    tone === "yellow" ? "border-yellow-200"
    : tone === "blue" ? "border-blue-200"
    :                   "border-green-200";
  const valueColor =
    tone === "yellow" ? "text-yellow-700"
    : tone === "blue" ? "text-blue-700"
    :                   "text-green-700";
  return (
    <Link
      href={href}
      className={`rounded-2xl border ${borderColor} bg-white dark:bg-surface p-4 shadow-sm hover:shadow-md transition-shadow block`}
    >
      <p className="text-xs text-muted font-medium">{label}</p>
      <p className={`mt-1 text-lg font-bold font-mono ${valueColor}`}>{value}</p>
      <p className="mt-1 text-[11px] text-muted">{hint}</p>
    </Link>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "green" | "red" | "warn" }) {
  const color = tone === "green" ? "text-green-700" : tone === "red" ? "text-red-700" : tone === "warn" ? "text-yellow-700" : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold font-mono ${color}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ s }: { s: string }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[s] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
      {STATUS_LABEL[s] ?? s}
    </span>
  );
}

function DataTable({
  headers,
  children,
  empty,
}: {
  headers: string[];
  children: React.ReactNode;
  empty: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
      {empty ? (
        <p className="p-12 text-center text-sm text-muted">ไม่มีรายการที่ตรงกัน</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                {headers.map((h) => (
                  <th key={h} className={`px-4 py-3 ${h.startsWith("ราคา") || h.startsWith("ยอด") || h.startsWith("น้ำ") || h === "หยวน" || h === "อัตรา" || h === "บาท" || h === "ชิ้น" || h === "จำนวน (฿)" ? "text-right" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>{children}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
