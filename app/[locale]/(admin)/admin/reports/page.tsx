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
  weight_kg: number; volume_cbm: number; total_price: number; tracking_chn: string | null;
  tracking_th: string | null; created_at: string; profile: Profile;
};
type SRow = {
  id: string; h_no: string; status: string; title: string | null;
  item_count: number; total_thb: number; payment_due_at: string | null; created_at: string; profile: Profile;
};
type YRow = {
  id: string; channel: string | null; recipient_detail: string | null; yuan_amount: number;
  exchange_rate: number; thb_amount: number; paid_via_wallet: boolean; status: string; created_at: string; profile: Profile;
};
type WRow = {
  id: string; kind: string; amount: number; status: string;
  bank_name: string | null; account_name: string | null; note: string | null; created_at: string; profile: Profile;
};
type PayoutRow = {
  id: string; amount_total: number; bank_name: string | null; account_name: string | null;
  account_number: string | null; status: string; requested_at: string; paid_at: string | null;
  team_code: string | null; team_profile: Profile;
};

function normP(p: Profile | Profile[] | null): Profile {
  if (!p) return null;
  return Array.isArray(p) ? (p[0] ?? null) : p;
}
function thb(n: number) {
  return "฿" + Math.abs(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
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
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  in_transit: "bg-indigo-50 text-indigo-700 border-indigo-200",
  awaiting_chn_dispatch: "bg-indigo-50 text-indigo-700 border-indigo-200",
  arrived_thailand: "bg-purple-50 text-purple-700 border-purple-200",
  out_for_delivery: "bg-orange-50 text-orange-700 border-orange-200",
  delivered: "bg-green-50 text-green-700 border-green-200",
  completed: "bg-green-50 text-green-700 border-green-200",
  paid: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-gray-50 text-gray-600 border-gray-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  refunded: "bg-gray-50 text-gray-600 border-gray-200",
};
const STATUS_LABEL: Record<string, string> = {
  pending_payment: "รอชำระ", pending: "รอ", awaiting_payment: "รอชำระ",
  shipped_china: "ออกจีน", ordered: "สั่งแล้ว", processing: "กำลังโอน", approved: "อนุมัติ",
  in_transit: "กลางทาง", awaiting_chn_dispatch: "รอจัดส่ง",
  arrived_thailand: "ถึงไทย", out_for_delivery: "ส่ง",
  delivered: "สำเร็จ", completed: "สำเร็จ", paid: "โอนแล้ว",
  cancelled: "ยกเลิก", rejected: "ปฏิเสธ", failed: "ล้มเหลว", refunded: "คืนเงิน",
};
const KIND_LABEL: Record<string, string> = {
  deposit: "เติมเงิน", withdraw: "ถอนเงิน", refund: "คืนเงิน", adjustment: "ปรับยอด",
  order_payment: "ชำระฝากสั่ง", order_top_up: "เติม+ชำระฝากสั่ง",
  import_payment: "ชำระฝากนำเข้า", import_top_up: "เติม+ชำระฝากนำเข้า",
  yuan_payment: "ชำระฝากโอนหยวน",
  cashback_earn: "ได้รับ cashback", cashback_redeem: "ใช้ cashback",
};

const TABS = [
  { key: "forwarder", label: "ฝากนำเข้า" },
  { key: "shop",      label: "ฝากสั่งซื้อ" },
  { key: "yuan",      label: "ฝากโอนหยวน" },
  { key: "sales",     label: "ทีมขาย (payouts)" },
  { key: "payment",   label: "การชำระเงิน" },
];

// Module-scope helpers — keep React Compiler happy + avoid unbound names
function nDaysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}
function monthStartIso(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

type SP = { tab?: string; date_from?: string; date_to?: string };

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp       = await searchParams;
  const tab      = sp.tab ?? "forwarder";
  const dateFrom = sp.date_from;
  const dateTo   = sp.date_to;
  const admin    = createAdminClient();

  // ── fetch ───────────────────────────────────────────────────────────────────

  let forwarderRows: FRow[]  = [];
  let shopRows: SRow[]       = [];
  let yuanRows: YRow[]       = [];
  let payoutRows: PayoutRow[] = [];
  let walletRows: WRow[]     = [];

  let tabTotal = 0, tabCount = 0;
  let statusBreakdown: Record<string, number> = {};

  if (tab === "forwarder") {
    let q = admin
      .from("forwarders")
      .select(`id, f_no, status, source_warehouse, transport_type,
        weight_kg, volume_cbm, total_price, tracking_chn, tracking_th, created_at,
        profile:profiles!profile_id ( member_code, first_name, last_name, phone )`)
      .order("created_at", { ascending: false })
      .limit(500);
    if (dateFrom) q = q.gte("created_at", dateFrom);
    if (dateTo)   q = q.lte("created_at", dateTo + "T23:59:59");
    const { data } = await q;
    type Raw = Omit<FRow, "profile"> & { profile: Profile | Profile[] | null };
    forwarderRows = ((data ?? []) as Raw[]).map((r) => ({ ...r, profile: normP(r.profile) }));
    tabCount  = forwarderRows.length;
    tabTotal  = forwarderRows.reduce((s, r) => s + Number(r.total_price ?? 0), 0);
    statusBreakdown = forwarderRows.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1; return acc;
    }, {});

  } else if (tab === "shop") {
    let q = admin
      .from("service_orders")
      .select(`id, h_no, status, title, item_count, total_thb, payment_due_at, created_at,
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
    statusBreakdown = shopRows.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1; return acc;
    }, {});

  } else if (tab === "yuan") {
    let q = admin
      .from("yuan_payments")
      .select(`id, channel, recipient_detail, yuan_amount, exchange_rate, thb_amount, paid_via_wallet, status, created_at,
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
    statusBreakdown = yuanRows.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1; return acc;
    }, {});

  } else if (tab === "sales") {
    let q = admin
      .from("sales_payouts")
      .select(`id, amount_total, bank_name, account_name, account_number, status, requested_at, paid_at,
        team_leader:team_leaders!team_leader_id (
          team_code,
          profile:profiles!profile_id ( member_code, first_name, last_name, phone )
        )`)
      .order("requested_at", { ascending: false })
      .limit(500);
    const dateCol = "requested_at";
    if (dateFrom) q = q.gte(dateCol, dateFrom);
    if (dateTo)   q = q.lte(dateCol, dateTo + "T23:59:59");
    const { data } = await q;
    type TlShape = { team_code: string; profile: Profile | Profile[] | null };
    type RawRow = {
      id: string; amount_total: number; bank_name: string | null; account_name: string | null;
      account_number: string | null; status: string; requested_at: string; paid_at: string | null;
      team_leader: TlShape | TlShape[] | null;
    };
    payoutRows = ((data ?? []) as RawRow[]).map((r) => {
      const tl = Array.isArray(r.team_leader) ? r.team_leader[0] ?? null : r.team_leader;
      return {
        id: r.id, amount_total: r.amount_total, bank_name: r.bank_name,
        account_name: r.account_name, account_number: r.account_number,
        status: r.status, requested_at: r.requested_at, paid_at: r.paid_at,
        team_code: tl?.team_code ?? null,
        team_profile: tl ? normP(tl.profile) : null,
      };
    });
    tabCount = payoutRows.length;
    tabTotal = payoutRows.filter(r => r.status === "paid").reduce((s, r) => s + Number(r.amount_total ?? 0), 0);
    statusBreakdown = payoutRows.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1; return acc;
    }, {});

  } else if (tab === "payment") {
    let q = admin
      .from("wallet_transactions")
      .select(`id, kind, amount, status, bank_name, account_name, note, created_at,
        profile:profiles!profile_id ( member_code, first_name, last_name, phone )`)
      .order("created_at", { ascending: false })
      .limit(500);
    if (dateFrom) q = q.gte("created_at", dateFrom);
    if (dateTo)   q = q.lte("created_at", dateTo + "T23:59:59");
    const { data } = await q;
    type Raw = Omit<WRow, "profile"> & { profile: Profile | Profile[] | null };
    walletRows = ((data ?? []) as Raw[]).map((r) => ({ ...r, profile: normP(r.profile) }));
    tabCount = walletRows.length;
    const inflow  = walletRows.filter(r => r.amount > 0 && r.status === "completed").reduce((s, r) => s + Number(r.amount), 0);
    const outflow = walletRows.filter(r => r.amount < 0 && r.status === "completed").reduce((s, r) => s + Math.abs(Number(r.amount)), 0);
    tabTotal = inflow - outflow;
    statusBreakdown = walletRows.reduce<Record<string, number>>((acc, r) => {
      acc[r.kind] = (acc[r.kind] ?? 0) + 1; return acc;
    }, {});
  }

  // ── CSV ─────────────────────────────────────────────────────────────────────

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
    trackingCHN: r.tracking_chn ?? "",
    trackingTH: r.tracking_th ?? "",
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
    หมดเขต: r.payment_due_at ? new Date(r.payment_due_at).toLocaleDateString("th-TH") : "",
  }));

  const yuanCsv: CsvRow[] = yuanRows.map((r) => ({
    รหัสสมาชิก: r.profile?.member_code ?? "",
    ชื่อ: profileName(r.profile),
    เบอร์: r.profile?.phone ?? "",
    ช่องทาง: r.channel ?? "",
    ปลายทาง: r.recipient_detail ?? "",
    หยวน: r.yuan_amount,
    อัตรา: r.exchange_rate,
    บาท: r.thb_amount,
    จากกระเป๋า: r.paid_via_wallet ? "ใช่" : "ไม่",
    สถานะ: STATUS_LABEL[r.status] ?? r.status,
    วันที่: new Date(r.created_at).toLocaleDateString("th-TH"),
  }));

  const salesCsv: CsvRow[] = payoutRows.map((r) => ({
    ทีม: r.team_code ?? "",
    รหัสหัวหน้าทีม: r.team_profile?.member_code ?? "",
    ชื่อหัวหน้าทีม: profileName(r.team_profile),
    เบอร์: r.team_profile?.phone ?? "",
    ยอดเบิก: r.amount_total,
    ธนาคาร: r.bank_name ?? "",
    ชื่อบัญชี: r.account_name ?? "",
    เลขบัญชี: r.account_number ?? "",
    สถานะ: STATUS_LABEL[r.status] ?? r.status,
    วันที่ขอ: new Date(r.requested_at).toLocaleDateString("th-TH"),
    วันที่โอน: r.paid_at ? new Date(r.paid_at).toLocaleDateString("th-TH") : "",
  }));

  const paymentCsv: CsvRow[] = walletRows.map((r) => ({
    รหัสสมาชิก: r.profile?.member_code ?? "",
    ชื่อ: profileName(r.profile),
    เบอร์: r.profile?.phone ?? "",
    ประเภท: KIND_LABEL[r.kind] ?? r.kind,
    จำนวน: r.amount,
    ธนาคาร: r.bank_name ?? "",
    ชื่อบัญชี: r.account_name ?? "",
    หมายเหตุ: r.note ?? "",
    สถานะ: STATUS_LABEL[r.status] ?? r.status,
    วันที่: new Date(r.created_at).toLocaleString("th-TH"),
  }));

  const activeCsv =
    tab === "forwarder" ? forwarderCsv :
    tab === "shop"      ? shopCsv :
    tab === "yuan"      ? yuanCsv :
    tab === "sales"     ? salesCsv :
    paymentCsv;

  const csvFilename = `report_${tab}_${dateFrom ?? "all"}_${dateTo ?? "all"}.csv`;

  // V-B1 self-serve report counts — surfaced as quick-link cards below
  const [
    pendingPaymentsCnt, creditPendingCnt, containersAwaitingThCnt, debtorsCnt,
    refundsLast30Cnt,   monthlyOrdersCnt,
  ] = await Promise.all([
    admin.from("forwarders").select("*", { count: "exact", head: true }).eq("status", "pending_payment"),
    admin.from("forwarders").select("*", { count: "exact", head: true }).in("status", ["shipped_china", "in_transit", "arrived_thailand", "out_for_delivery", "delivered"]),
    admin.from("cargo_containers").select("*", { count: "exact", head: true }).in("status", ["packing", "sealed", "in_transit", "arrived", "unloading"]),
    admin.from("wallet").select("*", { count: "exact", head: true }).or("balance.lt.0,credit_balance.lt.0"),
    admin.from("wallet_transactions").select("*", { count: "exact", head: true }).eq("kind", "refund").eq("status", "completed").gte("created_at", nDaysAgoIso(30)),
    admin.from("forwarders").select("*", { count: "exact", head: true }).gte("created_at", monthStartIso()),
  ]);
  // Note: creditPendingCnt is a coarse upper-bound (shipped+ count); the
  // /admin/reports/credit-pending page does the precise no-payment filter.

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* V-B1 quick-link cards — at-a-glance operational health */}
      <section className="rounded-2xl border border-border bg-surface-alt/30 p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-bold text-sm">📋 รีพอร์ตเฉพาะกิจ</h2>
          <span className="text-[10px] text-muted">เปิดดูรายชื่อ + ดาวน์โหลด CSV</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <QuickCard href="/admin/reports/pending-payments"        label="รอชำระเงิน"         count={pendingPaymentsCnt.count ?? 0} />
          <QuickCard href="/admin/reports/credit-pending"          label="เครดิตค้างนำเข้า*" count={creditPendingCnt.count ?? 0}    note="≈ shipped+" />
          <QuickCard href="/admin/reports/containers-awaiting-th"  label="ตู้รอเข้าไทย"        count={containersAwaitingThCnt.count ?? 0} />
          <QuickCard href="/admin/reports/debtors"                 label="ลูกค้าติดหนี้"      count={debtorsCnt.count ?? 0}          highlight />
          <QuickCard href="/admin/reports/refunds"                 label="คืนเงิน 30 วัน"      count={refundsLast30Cnt.count ?? 0} />
          <QuickCard href="/admin/reports/monthly-orders"          label="ออเดอร์เดือนนี้"     count={monthlyOrdersCnt.count ?? 0} />
        </div>
      </section>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN</p>
          <h1 className="mt-1 text-2xl font-bold">รายงาน</h1>
          {(dateFrom || dateTo) && (
            <p className="text-sm text-muted mt-0.5">
              {dateFrom ? new Date(dateFrom).toLocaleDateString("th-TH") : "ทั้งหมด"}
              {" — "}
              {dateTo ? new Date(dateTo).toLocaleDateString("th-TH") : "ปัจจุบัน"}
            </p>
          )}
        </div>
        <CsvButton
          rows={activeCsv}
          cols={Object.keys(activeCsv[0] ?? {}).map((k) => ({ key: k, label: k }))}
          filename={csvFilename}
        />
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
              href={`/admin/reports?${params}`}
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

      {/* Stats + status breakdown */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="รายการทั้งหมด" value={String(tabCount)} />
        {tab !== "payment" && (
          <StatCard
            label={tab === "forwarder" ? "มูลค่ารวม" : tab === "shop" ? "ยอดรวม" : tab === "yuan" ? "รวมบาท" : "โอนแล้วรวม"}
            value={thb(tabTotal)}
            tone="green"
          />
        )}
        {tab === "payment" && (
          <StatCard label="ยอดสุทธิ (เข้า - ออก)" value={thb(tabTotal)} tone={tabTotal >= 0 ? "green" : "red"} />
        )}
        {Object.entries(statusBreakdown).slice(0, 2).map(([s, n]) => (
          <StatCard key={s} label={KIND_LABEL[s] ?? STATUS_LABEL[s] ?? s} value={String(n)} />
        ))}
      </div>

      {/* Status breakdown chips */}
      {Object.keys(statusBreakdown).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(statusBreakdown).map(([s, n]) => (
            <span key={s} className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_BADGE[s] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
              {KIND_LABEL[s] ?? STATUS_LABEL[s] ?? s}: {n}
            </span>
          ))}
        </div>
      )}

      {/* ── Forwarder tab ─────────────────────────────────────────────── */}
      {tab === "forwarder" && (
        <DataTable
          headers={["เลขที่", "ลูกค้า", "คลัง/ขนส่ง", "น้ำหนัก/CBM", "ราคา", "Tracking", "สถานะ", "วันที่"]}
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
              <td className="px-4 py-3 text-xs">
                {r.tracking_th  && <div>TH: {r.tracking_th}</div>}
                {r.tracking_chn && <div>CN: {r.tracking_chn}</div>}
                {!r.tracking_th && !r.tracking_chn && <span className="text-muted">—</span>}
              </td>
              <td className="px-4 py-3"><StatusBadge s={r.status} /></td>
              <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{new Date(r.created_at).toLocaleDateString("th-TH")}</td>
            </tr>
          ))}
        </DataTable>
      )}

      {/* ── Shop tab ──────────────────────────────────────────────────── */}
      {tab === "shop" && (
        <DataTable
          headers={["เลขที่", "ลูกค้า", "รายการ", "ชิ้น", "ยอด", "สถานะ", "หมดเขต", "วันที่"]}
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
              <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                {r.payment_due_at ? new Date(r.payment_due_at).toLocaleDateString("th-TH") : "—"}
              </td>
              <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{new Date(r.created_at).toLocaleDateString("th-TH")}</td>
            </tr>
          ))}
        </DataTable>
      )}

      {/* ── Yuan tab ──────────────────────────────────────────────────── */}
      {tab === "yuan" && (
        <DataTable
          headers={["ลูกค้า", "ช่องทาง", "ปลายทาง", "หยวน", "อัตรา", "บาท", "วิธีชำระ", "สถานะ", "วันที่"]}
          empty={yuanRows.length === 0}
        >
          {yuanRows.map((r) => (
            <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30 align-top">
              <td className="px-4 py-3 text-xs">
                <div className="font-mono">{r.profile?.member_code ?? "—"}</div>
                <div>{profileName(r.profile)}</div>
                <div className="text-muted">{r.profile?.phone}</div>
              </td>
              <td className="px-4 py-3 text-xs">{r.channel ?? "—"}</td>
              <td className="px-4 py-3 text-xs max-w-[160px] text-muted">{r.recipient_detail ?? "—"}</td>
              <td className="px-4 py-3 text-right font-mono">¥{Number(r.yuan_amount).toFixed(2)}</td>
              <td className="px-4 py-3 text-right text-xs text-muted">{Number(r.exchange_rate).toFixed(4)}</td>
              <td className="px-4 py-3 text-right font-mono text-xs">{thb(r.thb_amount)}</td>
              <td className="px-4 py-3 text-xs">
                {r.paid_via_wallet
                  ? <span className="rounded-full bg-blue-50 border border-blue-200 text-blue-700 px-2 py-0.5 text-[10px]">กระเป๋า</span>
                  : <span className="text-muted">สลิป</span>
                }
              </td>
              <td className="px-4 py-3"><StatusBadge s={r.status} /></td>
              <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{new Date(r.created_at).toLocaleDateString("th-TH")}</td>
            </tr>
          ))}
        </DataTable>
      )}

      {/* ── Sales tab ─────────────────────────────────────────────────── */}
      {tab === "sales" && (
        <DataTable
          headers={["วันที่ขอ", "ทีม", "หัวหน้าทีม", "ยอดเบิก", "บัญชีรับโอน", "สถานะ", "วันที่โอน"]}
          empty={payoutRows.length === 0}
        >
          {payoutRows.map((r) => (
            <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30 align-top">
              <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{new Date(r.requested_at).toLocaleDateString("th-TH")}</td>
              <td className="px-4 py-3 text-xs font-mono">{r.team_code ?? "—"}</td>
              <td className="px-4 py-3 text-xs">
                <div className="font-mono">{r.team_profile?.member_code ?? "—"}</div>
                <div>{profileName(r.team_profile)}</div>
                <div className="text-muted">{r.team_profile?.phone}</div>
              </td>
              <td className="px-4 py-3 text-right font-mono font-bold">
                {thb(r.amount_total)}
              </td>
              <td className="px-4 py-3 text-xs">
                <div>{r.bank_name}</div>
                <div className="text-muted">{r.account_name}</div>
                <div className="font-mono text-[10px] text-muted">{r.account_number}</div>
              </td>
              <td className="px-4 py-3"><StatusBadge s={r.status} /></td>
              <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                {r.paid_at ? new Date(r.paid_at).toLocaleDateString("th-TH") : "—"}
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      {/* ── Payment tab ───────────────────────────────────────────────── */}
      {tab === "payment" && (
        <DataTable
          headers={["วันที่", "ลูกค้า", "ประเภท", "จำนวน", "บัญชี/หมายเหตุ", "สถานะ"]}
          empty={walletRows.length === 0}
        >
          {walletRows.map((r) => (
            <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30 align-top">
              <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{new Date(r.created_at).toLocaleString("th-TH")}</td>
              <td className="px-4 py-3 text-xs">
                <div className="font-mono">{r.profile?.member_code ?? "—"}</div>
                <div>{profileName(r.profile)}</div>
                <div className="text-muted">{r.profile?.phone}</div>
              </td>
              <td className="px-4 py-3 text-xs">{KIND_LABEL[r.kind] ?? r.kind}</td>
              <td className={`px-4 py-3 text-right font-mono ${r.amount < 0 ? "text-red-700" : "text-green-700"}`}>
                {r.amount > 0 ? "+" : ""}{Number(r.amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </td>
              <td className="px-4 py-3 text-xs text-muted">
                {r.bank_name    && <div>{r.bank_name} {r.account_name}</div>}
                {r.note         && <div>📝 {r.note}</div>}
              </td>
              <td className="px-4 py-3"><StatusBadge s={r.status} /></td>
            </tr>
          ))}
        </DataTable>
      )}
    </main>
  );
}

// ── Shared sub-components ───────────────────────────────────────────────────

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "green" | "red" }) {
  const color = tone === "green" ? "text-green-700" : tone === "red" ? "text-red-700" : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-xl font-bold font-mono ${color}`}>{value}</p>
    </div>
  );
}

// V-B1 quick-link card (mini stat card with link to the focused report)
function QuickCard({ href, label, count, note, highlight }: { href: string; label: string; count: number; note?: string; highlight?: boolean }) {
  const isHot = highlight && count > 0;
  return (
    <Link
      href={href}
      className={`block rounded-xl border p-3 transition hover:shadow-sm ${
        isHot ? "border-red-200 bg-red-50 hover:bg-red-100"
              : "border-border bg-white dark:bg-surface hover:bg-surface-alt"
      }`}
    >
      <p className={`text-2xl font-bold font-mono ${isHot ? "text-red-700" : "text-foreground"}`}>{count}</p>
      <p className="text-[11px] font-medium text-muted mt-0.5">{label}</p>
      {note && <p className="text-[9px] text-muted mt-0.5">{note}</p>}
    </Link>
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
                  <th key={h} className="px-4 py-3">{h}</th>
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
