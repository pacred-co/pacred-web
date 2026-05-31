/**
 * /admin/reports — reports hub (faithful-port rewrite).
 *
 * Wave 20 P0-4 (2026-05-26): swap 4 of 5 tabs from the rebuilt-app tables
 * (forwarders / service_orders / yuan_payments / wallet_transactions —
 * EMPTY on prod) to the legacy `tb_*` tables loaded by Phase A migration.
 * The fifth tab (sales / sales_payouts) stays — it's Pacred-native.
 * Same surface: 5 tabs · date filter · CSV export · quick-link cards.
 *
 * Field map (rebuilt → legacy):
 *   forwarders.*                   → tb_forwarder.*
 *     id, f_no, status, source_warehouse, transport_type,
 *     weight_kg, volume_cbm, total_price, tracking_chn, tracking_th, created_at
 *     → id, [string](id), fstatus, fwarehousechina, ftransporttype,
 *       fweight, fvolume, ftotalprice, ftrackingchn, ftrackingth, fdate
 *   service_orders.*               → tb_header_order.*
 *     h_no, status, title, item_count, total_thb, payment_due_at, created_at
 *     → hno, hstatus '1'..'6', htitle, hcount, hcostallth/htotalpriceuser,
 *       hdatepayment, hdate
 *   yuan_payments.*                → tb_payment.*
 *     channel, recipient_detail, yuan_amount, exchange_rate, thb_amount,
 *     status, created_at
 *     → paytype, paydetail, payyuan, payrate, paythb,
 *       paystatus '1'/'2'/'3', paydate
 *     (NB: legacy tb_payment has no paid_via_wallet column — column dropped)
 *   wallet_transactions.*          → tb_wallet_hs.*
 *     kind (enum), amount, status, bank_name, account_name, note, created_at
 *     → type '1'..'7' (1=topup-user/2=topup-admin/3=withdraw/4=spend-fwd/
 *       5=admin-manual/6=spend-other/7=spend-other-2 per learnings/
 *       pacred-order-taxonomy + wallet/[id]/page.tsx header),
 *       amount, status '1'/'2'/'3', depositnamebank, nameuserbank, note, date
 *   profiles join (UUID FK)        → 2-pass tb_users.in("userid", [...]) merge
 *
 * §0c compliance: every Supabase query destructures { data, error } +
 * console.error on failure. Sums + counts don't throw on a single
 * failed query (one stale aggregate is preferable to a 500 hub).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { Suspense } from "react";
import { AdminDateFilter } from "@/components/admin/date-filter";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { PageTopMenubar, type MenubarItem } from "@/components/admin/page-top-menubar";
import {
  legacyOrderStatusThai,
  legacyForwarderStatusThai,
} from "@/lib/legacy-status-map";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────
// Page top-menubar — ภูม brief 2026-05-20 ค่ำ.
// Sidebar "ออกรายงาน" lands a single leaf here; the 8 report-type leaves
// the sidebar used to host now live in this horizontal menubar so the
// sidebar stays slim (Pacred-is-one-company pattern · matches
// /admin/customers + /admin/accounting/cargo pattern).
// ─────────────────────────────────────────────────────────────────────
const REPORTS_MENUBAR: MenubarItem[] = [
  { label: "หน้าหลัก", href: "/admin/reports" },
  {
    label: "ฝั่งบัญชี",
    children: [
      { label: "ฝากสั่ง",                   href: "/admin/reports/shop" },
      { label: "ฝากนำเข้า",                 href: "/admin/reports/forwarder" },
      { label: "ฝากชำระ",                   href: "/admin/reports/payment" },
      // Wave 23 P1 batch 3 (2026-05-27 · port report-shops-profit-pay.php)
      { label: "เบิกเงินส่วนแบ่งร้านค้า",   href: "/admin/reports/shops-profit-pay" },
    ],
  },
  // Theme B reachability (2026-05-31 · เดฟ · §0d): the 5 profit/analysis
  // reports read real tb_* now (P0-20) but were ORPHANS — no inbound link.
  // Wired into the menubar here so staff can reach them in ≤3 clicks.
  {
    label: "กำไร",
    children: [
      { label: "กำไรฝากนำเข้า", href: "/admin/reports/forwarder-profit" },
      { label: "กำไรฝากสั่งซื้อ", href: "/admin/reports/shops-profit" },
      { label: "กำไรฝากโอนหยวน", href: "/admin/reports/yuan-profit" },
    ],
  },
  {
    label: "การเข้าถึงระบบ",
    children: [
      { label: "เข้าใช้ระบบ",       href: "/admin/reports/system" },
      { label: "ยืนยัน OTP สำเร็จ", href: "/admin/reports/otp-success" },
    ],
  },
  {
    label: "ปริมาณ",
    children: [
      { label: "ฝากนำเข้า (volume)", href: "/admin/reports/forwarder-volume" },
      { label: "sales-by-rep",       href: "/admin/reports/sales-by-rep" },
      { label: "ยอดพนักงานขาย (รายเดือน)", href: "/admin/reports/sales-monthly" },
      // Wave 7.3 (2026-05-22): wired containers-hs orphan per ภูม decision
      // in page-inventory-2026-05-21-night.md §🔴 DEAD.
      { label: "ตู้ตาม HS code",      href: "/admin/reports/containers-hs" },
    ],
  },
  { label: "ลูกค้า", href: "/admin/reports/user-sales-history" },
  { label: "คนขับ", href: "/admin/driver-runs" },
];

// Profile (Pacred-native — used only by the sales/payouts tab which keeps
// reading sales_payouts → team_leaders → profiles).
type Profile = {
  member_code: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
} | null;

// Legacy user shape — tb_users keyed by userID text (PR12345 / PCS10843).
type LegacyUser = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
};

type FRow = {
  id: number; f_no: string; status: string; source_warehouse: string; transport_type: string;
  weight_kg: number; volume_cbm: number; total_price: number; tracking_chn: string | null;
  tracking_th: string | null; created_at: string; user: LegacyUser | null;
};
type SRow = {
  id: number; h_no: string; status: string; title: string | null;
  item_count: number; total_thb: number; payment_due_at: string | null; created_at: string; user: LegacyUser | null;
};
type YRow = {
  id: number; channel: string | null; recipient_detail: string | null; yuan_amount: number;
  exchange_rate: number; thb_amount: number; status: string; created_at: string; user: LegacyUser | null;
};
type WRow = {
  id: number; type: string; amount: number; status: string;
  bank_name: string | null; account_name: string | null; note: string | null; created_at: string; user: LegacyUser | null;
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
function userDisplayName(u: LegacyUser | null) {
  if (!u) return "—";
  return [u.userName, u.userLastName].filter(Boolean).join(" ") || "—";
}

/**
 * 2nd-query helper: batch-load tb_users rows for the userid set on the page,
 * return a Map for O(1) lookup. PostgREST cannot reliably auto-join the
 * legacy `tb_users` table (the FK is by `userid` text, not a true relational
 * FK), so we run the join in TS — same pattern as `/admin/forwarders/page.tsx`
 * Wave 3 P0 #1 and `/admin/accounting/page.tsx` Wave 20 P0-2.
 */
async function fetchUsersByUserId(
  admin: ReturnType<typeof createAdminClient>,
  userIds: string[],
): Promise<Map<string, LegacyUser>> {
  const map = new Map<string, LegacyUser>();
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return map;
  const { data, error } = await admin
    .from("tb_users")
    .select("userID, userName, userLastName, userTel")
    .in("userID", unique);
  if (error) {
    console.error(`[tb_users batch] failed`, { code: error.code, message: error.message });
    return map;
  }
  for (const u of (data ?? []) as LegacyUser[]) {
    map.set(u.userID, u);
  }
  return map;
}

// Sales-payout status (Pacred-native sales_payouts.status enum) — used by
// the sales tab. Order/forwarder/payment use the legacy maps below.
const PAYOUT_STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  paid: "bg-green-50 text-green-700 border-green-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-gray-50 text-gray-600 border-gray-200",
};
const PAYOUT_STATUS_LABEL: Record<string, string> = {
  pending: "รอ", approved: "อนุมัติ", paid: "โอนแล้ว",
  rejected: "ปฏิเสธ", cancelled: "ยกเลิก",
};

// Legacy single-char status palettes — keyed by tb_forwarder.fstatus,
// tb_header_order.hstatus, tb_payment.paystatus, tb_wallet_hs.status.
const FORWARDER_BADGE: Record<string, string> = {
  "1": "bg-blue-50 text-blue-700 border-blue-200",        // รอเข้าโกดังจีน
  "2": "bg-blue-50 text-blue-700 border-blue-200",        // ถึงโกดังจีน
  "3": "bg-indigo-50 text-indigo-700 border-indigo-200",  // กำลังส่งมาไทย
  "4": "bg-purple-50 text-purple-700 border-purple-200",  // ถึงไทย
  "5": "bg-yellow-50 text-yellow-700 border-yellow-200",  // รอชำระเงิน
  "6": "bg-orange-50 text-orange-700 border-orange-200",  // เตรียมส่ง
  "7": "bg-green-50 text-green-700 border-green-200",     // ส่งแล้ว
};
const ORDER_BADGE: Record<string, string> = {
  "1": "bg-yellow-50 text-yellow-700 border-yellow-200",  // รอดำเนินการ
  "2": "bg-yellow-50 text-yellow-700 border-yellow-200",  // รอชำระเงิน
  "3": "bg-blue-50 text-blue-700 border-blue-200",        // สั่งสินค้า
  "4": "bg-indigo-50 text-indigo-700 border-indigo-200",  // รอร้านจีนจัดส่ง
  "5": "bg-green-50 text-green-700 border-green-200",     // สำเร็จ
  "6": "bg-gray-50 text-gray-600 border-gray-200",        // ยกเลิก
};
// tb_payment.paystatus + tb_wallet_hs.status share the same numeric enum.
const PAYMENT_BADGE: Record<string, string> = {
  "1": "bg-yellow-50 text-yellow-700 border-yellow-200",  // รอ
  "2": "bg-green-50 text-green-700 border-green-200",     // สำเร็จ
  "3": "bg-red-50 text-red-700 border-red-200",           // ไม่สำเร็จ
};
const PAYMENT_LABEL: Record<string, string> = {
  "1": "รอ", "2": "สำเร็จ", "3": "ไม่สำเร็จ",
};

// tb_payment.paytype channel labels.
const PAYTYPE_LABEL: Record<string, string> = {
  "1": "Alipay",
  "2": "Wechat",
  "3": "Union",
  "4": "USDT",
};

// tb_forwarder.ftransporttype labels.
const TRANSPORT_LABEL: Record<string, string> = {
  "1": "รถ", "2": "เรือ", "3": "เครื่องบิน",
};

// tb_wallet_hs.type labels — per docs/learnings/pacred-order-taxonomy.md +
// wallet/[id]/page.tsx header (verified across 104,591 prod rows).
//   1: TOPUP-USER   (+ slip)    2: TOPUP-ADMIN  (no slip)
//   3: WITHDRAW     (+ slip)    4: SPEND-FORWARDER
//   5: ADMIN-MANUAL             6: SPEND-OTHER
//   7: SPEND-OTHER-2
const WALLET_TYPE_LABEL: Record<string, string> = {
  "1": "เติมเงิน",
  "2": "เติม (admin)",
  "3": "ถอนเงิน",
  "4": "ชำระฝากนำเข้า",
  "5": "ปรับยอด (admin)",
  "6": "ชำระอื่นๆ",
  "7": "ชำระอื่นๆ #2",
};

const TABS = [
  { key: "forwarder", label: "ฝากนำเข้า" },
  { key: "shop",      label: "ฝากสั่งซื้อ" },
  { key: "yuan",      label: "ฝากโอนหยวน" },
  { key: "sales",     label: "ทีมขาย (payouts)" },
  { key: "payment",   label: "การชำระเงิน" },
];

// Per-tab status breakdown label/badge resolvers. The "key" is the raw
// breakdown bucket key — for forwarder/shop/yuan/payment that's the legacy
// single-char status / type code; for sales it's the Pacred-native string
// enum (pending/paid/etc.). Centralised so the chips below the stat cards
// pick the right vocabulary per tab.
function breakdownLabelFor(tab: string, key: string): string {
  if (tab === "forwarder") return legacyForwarderStatusThai(key) || key;
  if (tab === "shop")      return legacyOrderStatusThai(key)     || key;
  if (tab === "yuan")      return PAYMENT_LABEL[key]             ?? key;
  if (tab === "sales")     return PAYOUT_STATUS_LABEL[key]       ?? key;
  if (tab === "payment")   return WALLET_TYPE_LABEL[key]         ?? `type ${key}`;
  return key;
}
function breakdownBadgeFor(tab: string, key: string): string {
  const fallback = "bg-gray-50 text-gray-600 border-gray-200";
  if (tab === "forwarder") return FORWARDER_BADGE[key]       ?? fallback;
  if (tab === "shop")      return ORDER_BADGE[key]           ?? fallback;
  if (tab === "yuan")      return PAYMENT_BADGE[key]         ?? fallback;
  if (tab === "sales")     return PAYOUT_STATUS_BADGE[key]   ?? fallback;
  // payment tab buckets by type — colour is informational rather than status,
  // so reuse a neutral palette differentiated by inflow/outflow.
  if (tab === "payment") {
    if (key === "1" || key === "2")                   return "bg-green-50 text-green-700 border-green-200";
    if (["3", "4", "5", "6", "7"].includes(key))      return "bg-red-50 text-red-700 border-red-200";
  }
  return fallback;
}

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
  // W-1 (gap-admin H-1): page-level role gate. This report hub exposes
  // bank names / account numbers / customer phone / all revenue via
  // createAdminClient (RLS-bypass) — every child report page already
  // gates on these roles; this index page was the missed one. Office
  // roles only; super implicit.
  await requireAdmin(["ops", "accounting", "sales_admin"]);

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
    // Legacy: tb_forwarder + 2-pass tb_users join.
    let q = admin
      .from("tb_forwarder")
      .select(
        "id, fstatus, fwarehousechina, ftransporttype, fweight, fvolume, " +
        "ftotalprice, ftrackingchn, ftrackingth, fdate, userid",
      )
      .order("fdate", { ascending: false, nullsFirst: false })
      .limit(500);
    if (dateFrom) q = q.gte("fdate", dateFrom);
    if (dateTo)   q = q.lte("fdate", dateTo + "T23:59:59");
    const { data, error } = await q;
    if (error) {
      console.error(`[tb_forwarder list] failed`, { code: error.code, message: error.message });
    }
    type Raw = {
      id: number; fstatus: string;
      fwarehousechina: string; ftransporttype: string;
      fweight: number | null; fvolume: number | null;
      ftotalprice: number | null;
      ftrackingchn: string | null; ftrackingth: string | null;
      fdate: string | null; userid: string;
    };
    const raw = (data ?? []) as unknown as Raw[];
    const usersByUserId = await fetchUsersByUserId(admin, raw.map((r) => r.userid));
    forwarderRows = raw.map((r) => ({
      id: r.id,
      f_no: String(r.id),                  // legacy displays the raw id as "ออเดอร์ #<id>"
      status: r.fstatus,
      source_warehouse: r.fwarehousechina,
      transport_type: r.ftransporttype,
      weight_kg: Number(r.fweight ?? 0),
      volume_cbm: Number(r.fvolume ?? 0),
      total_price: Number(r.ftotalprice ?? 0),
      tracking_chn: r.ftrackingchn,
      tracking_th: r.ftrackingth,
      created_at: r.fdate ?? "",
      user: usersByUserId.get(r.userid) ?? null,
    }));
    tabCount  = forwarderRows.length;
    tabTotal  = forwarderRows.reduce((s, r) => s + r.total_price, 0);
    statusBreakdown = forwarderRows.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1; return acc;
    }, {});

  } else if (tab === "shop") {
    // Legacy: tb_header_order + 2-pass tb_users join.
    // total = htotalpriceuser (preferred) ?? hcostallth — mirrors
    // /admin/service-orders/page.tsx Wave 20 logic.
    let q = admin
      .from("tb_header_order")
      .select(
        "id, hno, hstatus, htitle, hcount, hcostallth, htotalpriceuser, " +
        "hdate, hdatepayment, userid",
      )
      .order("hdate", { ascending: false })
      .limit(500);
    if (dateFrom) q = q.gte("hdate", dateFrom);
    if (dateTo)   q = q.lte("hdate", dateTo + "T23:59:59");
    const { data, error } = await q;
    if (error) {
      console.error(`[tb_header_order list] failed`, { code: error.code, message: error.message });
    }
    type Raw = {
      id: number; hno: string; hstatus: string;
      htitle: string | null; hcount: number | null;
      hcostallth: number | null; htotalpriceuser: number | null;
      hdate: string | null; hdatepayment: string | null;
      userid: string;
    };
    const raw = (data ?? []) as unknown as Raw[];
    const usersByUserId = await fetchUsersByUserId(admin, raw.map((r) => r.userid));
    shopRows = raw.map((r) => ({
      id: r.id,
      h_no: r.hno,
      status: r.hstatus,
      title: r.htitle,
      item_count: Number(r.hcount ?? 0),
      total_thb: Number(r.htotalpriceuser ?? r.hcostallth ?? 0),
      payment_due_at: r.hdatepayment,
      created_at: r.hdate ?? "",
      user: usersByUserId.get(r.userid) ?? null,
    }));
    tabCount = shopRows.length;
    tabTotal = shopRows.reduce((s, r) => s + r.total_thb, 0);
    statusBreakdown = shopRows.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1; return acc;
    }, {});

  } else if (tab === "yuan") {
    // Legacy: tb_payment + 2-pass tb_users join. NB: legacy schema has no
    // paid_via_wallet column — column was rebuilt-only and is dropped here.
    let q = admin
      .from("tb_payment")
      .select(
        "id, paytype, paydetail, payyuan, payrate, paythb, paystatus, paydate, userid",
      )
      .order("paydate", { ascending: false })
      .limit(500);
    if (dateFrom) q = q.gte("paydate", dateFrom);
    if (dateTo)   q = q.lte("paydate", dateTo + "T23:59:59");
    const { data, error } = await q;
    if (error) {
      console.error(`[tb_payment list] failed`, { code: error.code, message: error.message });
    }
    type Raw = {
      id: number; paytype: string | null; paydetail: string | null;
      payyuan: number | null; payrate: number | null; paythb: number | null;
      paystatus: string; paydate: string | null; userid: string;
    };
    const raw = (data ?? []) as unknown as Raw[];
    const usersByUserId = await fetchUsersByUserId(admin, raw.map((r) => r.userid));
    yuanRows = raw.map((r) => ({
      id: r.id,
      channel: r.paytype,
      recipient_detail: r.paydetail,
      yuan_amount: Number(r.payyuan ?? 0),
      exchange_rate: Number(r.payrate ?? 0),
      thb_amount: Number(r.paythb ?? 0),
      status: r.paystatus,
      created_at: r.paydate ?? "",
      user: usersByUserId.get(r.userid) ?? null,
    }));
    tabCount = yuanRows.length;
    tabTotal = yuanRows.reduce((s, r) => s + r.thb_amount, 0);
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
    const { data, error } = await q;
    if (error) {
      console.error(`[sales_payouts list] failed`, { code: error.code, message: error.message });
    }
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
    // Legacy: tb_wallet_hs + 2-pass tb_users join. Net = completed inflow
    // (type 1/2 topup) - completed outflow (type 3/4/5/6/7 withdraw + spend).
    // Legacy stores amount as positive always; direction comes from type.
    let q = admin
      .from("tb_wallet_hs")
      .select(
        "id, type, amount, status, depositnamebank, nameuserbank, note, date, userid",
      )
      .order("date", { ascending: false })
      .limit(500);
    if (dateFrom) q = q.gte("date", dateFrom);
    if (dateTo)   q = q.lte("date", dateTo + "T23:59:59");
    const { data, error } = await q;
    if (error) {
      console.error(`[tb_wallet_hs list] failed`, { code: error.code, message: error.message });
    }
    type Raw = {
      id: number; type: string;
      amount: number | null; status: string | null;
      depositnamebank: string | null; nameuserbank: string | null;
      note: string | null; date: string | null; userid: string;
    };
    const raw = (data ?? []) as unknown as Raw[];
    const usersByUserId = await fetchUsersByUserId(admin, raw.map((r) => r.userid));
    walletRows = raw.map((r) => ({
      id: r.id,
      type: r.type,
      amount: Number(r.amount ?? 0),
      status: r.status ?? "1",
      bank_name: r.depositnamebank,
      account_name: r.nameuserbank,
      note: r.note,
      created_at: r.date ?? "",
      user: usersByUserId.get(r.userid) ?? null,
    }));
    tabCount = walletRows.length;
    const inflowTypes = new Set(["1", "2"]);
    const outflowTypes = new Set(["3", "4", "5", "6", "7"]);
    const inflow  = walletRows.filter((r) => r.status === "2" && inflowTypes.has(r.type))
                              .reduce((s, r) => s + Math.abs(r.amount), 0);
    const outflow = walletRows.filter((r) => r.status === "2" && outflowTypes.has(r.type))
                              .reduce((s, r) => s + Math.abs(r.amount), 0);
    tabTotal = inflow - outflow;
    // statusBreakdown keyed by type (kind) — same as before but with legacy keys.
    statusBreakdown = walletRows.reduce<Record<string, number>>((acc, r) => {
      acc[r.type] = (acc[r.type] ?? 0) + 1; return acc;
    }, {});
  }

  // ── CSV ─────────────────────────────────────────────────────────────────────

  const forwarderCsv: CsvRow[] = forwarderRows.map((r) => ({
    เลขที่: r.f_no,
    รหัสสมาชิก: r.user?.userID ?? "",
    ชื่อ: userDisplayName(r.user),
    เบอร์: r.user?.userTel ?? "",
    คลัง: r.source_warehouse,
    ขนส่ง: TRANSPORT_LABEL[r.transport_type] ?? r.transport_type,
    น้ำหนักkg: r.weight_kg,
    ปริมาตรcbm: r.volume_cbm,
    ราคา: r.total_price,
    trackingCHN: r.tracking_chn ?? "",
    trackingTH: r.tracking_th ?? "",
    สถานะ: legacyForwarderStatusThai(r.status) || r.status,
    วันที่: r.created_at ? new Date(r.created_at).toLocaleDateString("th-TH") : "",
  }));

  const shopCsv: CsvRow[] = shopRows.map((r) => ({
    เลขที่: r.h_no,
    รหัสสมาชิก: r.user?.userID ?? "",
    ชื่อ: userDisplayName(r.user),
    เบอร์: r.user?.userTel ?? "",
    รายการ: r.title ?? "",
    ชิ้น: r.item_count,
    ยอด: r.total_thb,
    สถานะ: legacyOrderStatusThai(r.status) || r.status,
    วันที่: r.created_at ? new Date(r.created_at).toLocaleDateString("th-TH") : "",
    หมดเขต: r.payment_due_at ? new Date(r.payment_due_at).toLocaleDateString("th-TH") : "",
  }));

  const yuanCsv: CsvRow[] = yuanRows.map((r) => ({
    รหัสสมาชิก: r.user?.userID ?? "",
    ชื่อ: userDisplayName(r.user),
    เบอร์: r.user?.userTel ?? "",
    ช่องทาง: r.channel ? PAYTYPE_LABEL[r.channel] ?? r.channel : "",
    ปลายทาง: r.recipient_detail ?? "",
    หยวน: r.yuan_amount,
    อัตรา: r.exchange_rate,
    บาท: r.thb_amount,
    สถานะ: PAYMENT_LABEL[r.status] ?? r.status,
    วันที่: r.created_at ? new Date(r.created_at).toLocaleDateString("th-TH") : "",
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
    สถานะ: PAYOUT_STATUS_LABEL[r.status] ?? r.status,
    วันที่ขอ: new Date(r.requested_at).toLocaleDateString("th-TH"),
    วันที่โอน: r.paid_at ? new Date(r.paid_at).toLocaleDateString("th-TH") : "",
  }));

  const paymentCsv: CsvRow[] = walletRows.map((r) => ({
    รหัสสมาชิก: r.user?.userID ?? "",
    ชื่อ: userDisplayName(r.user),
    เบอร์: r.user?.userTel ?? "",
    ประเภท: WALLET_TYPE_LABEL[r.type] ?? `type ${r.type}`,
    จำนวน: r.amount,
    ธนาคาร: r.bank_name ?? "",
    ชื่อบัญชี: r.account_name ?? "",
    หมายเหตุ: r.note ?? "",
    สถานะ: PAYMENT_LABEL[r.status] ?? r.status,
    วันที่: r.created_at ? new Date(r.created_at).toLocaleString("th-TH") : "",
  }));

  const activeCsv =
    tab === "forwarder" ? forwarderCsv :
    tab === "shop"      ? shopCsv :
    tab === "yuan"      ? yuanCsv :
    tab === "sales"     ? salesCsv :
    paymentCsv;

  const csvFilename = `report_${tab}_${dateFrom ?? "all"}_${dateTo ?? "all"}.csv`;

  // V-B1 self-serve report counts — surfaced as quick-link cards below.
  // Wave 20 P0-4 (2026-05-26): legacy `tb_*` swap.
  //   pendingPaymentsCnt  = tb_forwarder.fstatus='5'                (รอชำระเงิน)
  //   creditPendingCnt    = tb_forwarder.fcredit='1'                (เครดิตสินค้า)
  //   containersAwaitingTh= distinct fcabinetnumber where fstatus<4 (pre-arrival)
  //   debtorsCnt          = tb_wallet.wallettotal < 0               (ลูกค้าติดหนี้)
  //   refundsLast30Cnt    = tb_wallet_hs.type='5' status='2' last 30d (admin-manual)
  //                         NB: legacy doesn't have a dedicated 'refund' type;
  //                         type=5 (ADMIN-MANUAL) is the closest match —
  //                         refunds in legacy are admin-manual wallet credits.
  //   monthlyOrdersCnt    = tb_forwarder.fdate >= monthStart
  //
  // V-G6 analytical card counts (Wave 23 P2 #16 — 2026-05-27 ค่ำ):
  // Headline numbers for the 4 analytical drill-down cards so the hub
  // feels alive (was hardcoded count={0} → staff thought reports were empty).
  // All soft-fail: any query error → card shows 0 + page still renders.
  //   vg6ForwarderVolumeCnt = tb_forwarder count · fdate ≥ 30d ·
  //                           fstatus IN ('5','6','7') (shipped/billing rows ·
  //                           proxy for "import volume" in the last 30d)
  //   vg6SalesByRepCnt      = distinct tb_users.adminidsale (= active sales-rep
  //                           userids assigned to at least one customer)
  //   vg6HsCodeRevenueCnt   = distinct container_hs_lines.hs_code in last 90d
  //                           (mirrors the report's default ?days=90 window)
  //   vg6UserSalesHistoryCnt = distinct tb_forwarder.userid with at least one
  //                            row fstatus IN ('6','7') in last 30d (active
  //                            buyers · mirrors counted-status gates used by
  //                            /admin/reports/user-sales-history)
  const [
    pendingPaymentsCnt, creditPendingCnt, containersAwaitingThCnt, debtorsCnt,
    refundsLast30Cnt,   monthlyOrdersCnt,
    vg6ForwarderVolumeCnt, vg6SalesByRepRaw, vg6HsCodeRevenueRaw, vg6UserSalesHistoryRaw,
  ] = await Promise.all([
    admin.from("tb_forwarder").select("id", { count: "exact", head: true }).eq("fstatus", "5"),
    admin.from("tb_forwarder").select("id", { count: "exact", head: true }).eq("fcredit", "1"),
    // tb_forwarder DISTINCT fcabinetnumber where fStatus<4 (pre-arrival)
    admin.from("tb_forwarder")
      .select("fcabinetnumber")
      .not("fcabinetnumber", "is", null).neq("fcabinetnumber", "").neq("fcabinetnumber", "0")
      .lt("fstatus", "4")
      .limit(50_000),
    admin.from("tb_wallet").select("userid", { count: "exact", head: true }).lt("wallettotal", 0),
    admin.from("tb_wallet_hs").select("id", { count: "exact", head: true })
      .eq("type", "5").eq("status", "2").gte("date", nDaysAgoIso(30)),
    admin.from("tb_forwarder").select("id", { count: "exact", head: true }).gte("fdate", monthStartIso()),
    // V-G6 #1 forwarder-volume — count shipped/billing rows in last 30d
    admin.from("tb_forwarder")
      .select("id", { count: "exact", head: true })
      .gte("fdate", nDaysAgoIso(30))
      .in("fstatus", ["5", "6", "7"]),
    // V-G6 #2 sales-by-rep — distinct adminIDSale from tb_users. PostgREST
    // can't COUNT DISTINCT, so pull the column + Set-dedupe in JS (cap
    // 50,000 rows — there are ~8,898 prod users so a single page suffices).
    admin.from("tb_users")
      .select("adminIDSale")
      .not("adminIDSale", "is", null).neq("adminIDSale", "")
      .limit(50_000),
    // V-G6 #3 hs-code-revenue — distinct HS codes used in last 90d. Same
    // Set-dedupe pattern (cap 20,000 lines mirrors the underlying report).
    admin.from("container_hs_lines")
      .select("hs_code")
      .not("hs_code", "is", null).neq("hs_code", "")
      .gte("created_at", nDaysAgoIso(90))
      .limit(20_000),
    // V-G6 #4 user-sales-history — distinct userid with fstatus IN ('6','7')
    // in last 30d (active buyers · mirrors gates in the underlying report).
    admin.from("tb_forwarder")
      .select("userid")
      .in("fstatus", ["6", "7"])
      .gte("fdate", nDaysAgoIso(30))
      .limit(50_000),
  ]);
  if (pendingPaymentsCnt.error)        console.error(`[reports pendingPaymentsCnt] failed`, { code: pendingPaymentsCnt.error.code, message: pendingPaymentsCnt.error.message });
  if (creditPendingCnt.error)          console.error(`[reports creditPendingCnt] failed`, { code: creditPendingCnt.error.code, message: creditPendingCnt.error.message });
  if (containersAwaitingThCnt.error)   console.error(`[reports containersAwaitingTh] failed`, { code: containersAwaitingThCnt.error.code, message: containersAwaitingThCnt.error.message });
  if (debtorsCnt.error)                console.error(`[reports debtorsCnt] failed`, { code: debtorsCnt.error.code, message: debtorsCnt.error.message });
  if (refundsLast30Cnt.error)          console.error(`[reports refundsLast30Cnt] failed`, { code: refundsLast30Cnt.error.code, message: refundsLast30Cnt.error.message });
  if (monthlyOrdersCnt.error)          console.error(`[reports monthlyOrdersCnt] failed`, { code: monthlyOrdersCnt.error.code, message: monthlyOrdersCnt.error.message });
  if (vg6ForwarderVolumeCnt.error)     console.error(`[reports vg6ForwarderVolumeCnt] failed`, { code: vg6ForwarderVolumeCnt.error.code, message: vg6ForwarderVolumeCnt.error.message });
  if (vg6SalesByRepRaw.error)          console.error(`[reports vg6SalesByRep] failed`, { code: vg6SalesByRepRaw.error.code, message: vg6SalesByRepRaw.error.message });
  if (vg6HsCodeRevenueRaw.error)       console.error(`[reports vg6HsCodeRevenue] failed`, { code: vg6HsCodeRevenueRaw.error.code, message: vg6HsCodeRevenueRaw.error.message });
  if (vg6UserSalesHistoryRaw.error)    console.error(`[reports vg6UserSalesHistory] failed`, { code: vg6UserSalesHistoryRaw.error.code, message: vg6UserSalesHistoryRaw.error.message });

  // V-G6 dedup pass — Set on the raw selects (only 3 of the 4 V-G6 cards
  // need it; #1 forwarder-volume has its count direct from count:exact).
  const vg6SalesByRepCnt = new Set(
    (vg6SalesByRepRaw.data ?? []).map((r) => (r as { adminIDSale: string }).adminIDSale),
  ).size;
  const vg6HsCodeRevenueCnt = new Set(
    (vg6HsCodeRevenueRaw.data ?? []).map((r) => (r as { hs_code: string }).hs_code),
  ).size;
  const vg6UserSalesHistoryCnt = new Set(
    (vg6UserSalesHistoryRaw.data ?? []).map((r) => (r as { userid: string }).userid),
  ).size;

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <PageTopMenubar items={REPORTS_MENUBAR} activeHref="/admin/reports" />
      <main className="p-6 lg:p-8 space-y-5">
      {/* V-B1 quick-link cards — at-a-glance operational health */}
      <section className="rounded-2xl border border-border bg-surface-alt/30 p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-bold text-sm">📋 รีพอร์ตเฉพาะกิจ (V-B1)</h2>
          <span className="text-[10px] text-muted">เปิดดูรายชื่อ + ดาวน์โหลด CSV</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <QuickCard href="/admin/reports/pending-payments"        label="รอชำระเงิน"         count={pendingPaymentsCnt.count ?? 0} />
          <QuickCard href="/admin/reports/credit-pending"          label="เครดิตค้างนำเข้า*" count={creditPendingCnt.count ?? 0}    note="≈ shipped+" />
          <QuickCard href="/admin/reports/containers-awaiting-th"  label="ตู้รอเข้าไทย"        count={new Set((containersAwaitingThCnt.data ?? []).map((r) => (r as { fcabinetnumber: string }).fcabinetnumber)).size} />
          <QuickCard href="/admin/reports/debtors"                 label="ลูกค้าติดหนี้"      count={debtorsCnt.count ?? 0}          highlight />
          <QuickCard href="/admin/reports/refunds"                 label="คืนเงิน 30 วัน"      count={refundsLast30Cnt.count ?? 0} />
          <QuickCard href="/admin/reports/monthly-orders"          label="ออเดอร์เดือนนี้"     count={monthlyOrdersCnt.count ?? 0} />
        </div>
      </section>

      {/* V-G6 analytical reports (additive — for accounting + sales planning) */}
      <section className="rounded-2xl border border-border bg-surface-alt/30 p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-bold text-sm">📊 รีพอร์ตวิเคราะห์ (V-G6)</h2>
          <span className="text-[10px] text-muted">aggregations + drill-down</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <QuickCard href="/admin/reports/forwarder-volume"        label="ปริมาณฝากนำเข้า"     count={vg6ForwarderVolumeCnt.count ?? 0} note="30 วัน · ส่งแล้ว+" />
          <QuickCard href="/admin/reports/sales-by-rep"            label="ยอดต่อ sales rep"     count={vg6SalesByRepCnt}                 note="เซลล์ที่มีลูกค้า" />
          <QuickCard href="/admin/reports/hs-code-revenue"         label="HS-code revenue"      count={vg6HsCodeRevenueCnt}              note="HS codes · 90 วัน" />
          <QuickCard href="/admin/reports/user-sales-history"      label="ประวัติยอด/ลูกค้า"   count={vg6UserSalesHistoryCnt}           note="ลูกค้าซื้อใน 30 วัน" />
        </div>
      </section>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN</p>
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
          <StatCard key={s} label={breakdownLabelFor(tab, s)} value={String(n)} />
        ))}
      </div>

      {/* Status breakdown chips */}
      {Object.keys(statusBreakdown).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(statusBreakdown).map(([s, n]) => (
            <span key={s} className={`rounded-full border px-3 py-1 text-xs font-medium ${breakdownBadgeFor(tab, s)}`}>
              {breakdownLabelFor(tab, s)}: {n}
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
                <Link href={`/admin/forwarders/${r.f_no}`} className="text-primary-600 hover:underline">#{r.f_no}</Link>
              </td>
              <td className="px-4 py-3 text-xs">
                <div className="font-mono">{r.user?.userID ?? "—"}</div>
                <div>{userDisplayName(r.user)}</div>
                <div className="text-muted">{r.user?.userTel ?? ""}</div>
              </td>
              <td className="px-4 py-3 text-xs">{r.source_warehouse} / {TRANSPORT_LABEL[r.transport_type] ?? r.transport_type}</td>
              <td className="px-4 py-3 text-right text-xs">
                {r.weight_kg.toFixed(2)} kg<br />
                <span className="text-muted">{r.volume_cbm.toFixed(3)} cbm</span>
              </td>
              <td className="px-4 py-3 text-right font-mono text-xs">{thb(r.total_price)}</td>
              <td className="px-4 py-3 text-xs">
                {r.tracking_th  && <div>TH: {r.tracking_th}</div>}
                {r.tracking_chn && <div>CN: {r.tracking_chn}</div>}
                {!r.tracking_th && !r.tracking_chn && <span className="text-muted">—</span>}
              </td>
              <td className="px-4 py-3"><ForwarderStatusBadge s={r.status} /></td>
              <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{r.created_at ? new Date(r.created_at).toLocaleDateString("th-TH") : "—"}</td>
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
                <div className="font-mono">{r.user?.userID ?? "—"}</div>
                <div>{userDisplayName(r.user)}</div>
                <div className="text-muted">{r.user?.userTel ?? ""}</div>
              </td>
              <td className="px-4 py-3 text-xs">{r.title ?? "—"}</td>
              <td className="px-4 py-3 text-right text-xs">{r.item_count}</td>
              <td className="px-4 py-3 text-right font-mono text-xs">{thb(r.total_thb)}</td>
              <td className="px-4 py-3"><OrderStatusBadge s={r.status} /></td>
              <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                {r.payment_due_at ? new Date(r.payment_due_at).toLocaleDateString("th-TH") : "—"}
              </td>
              <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{r.created_at ? new Date(r.created_at).toLocaleDateString("th-TH") : "—"}</td>
            </tr>
          ))}
        </DataTable>
      )}

      {/* ── Yuan tab ──────────────────────────────────────────────────── */}
      {/* NB: "วิธีชำระ" column removed — legacy tb_payment has no
          paid_via_wallet column (was rebuilt-only). */}
      {tab === "yuan" && (
        <DataTable
          headers={["ลูกค้า", "ช่องทาง", "ปลายทาง", "หยวน", "อัตรา", "บาท", "สถานะ", "วันที่"]}
          empty={yuanRows.length === 0}
        >
          {yuanRows.map((r) => (
            <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30 align-top">
              <td className="px-4 py-3 text-xs">
                <div className="font-mono">{r.user?.userID ?? "—"}</div>
                <div>{userDisplayName(r.user)}</div>
                <div className="text-muted">{r.user?.userTel ?? ""}</div>
              </td>
              <td className="px-4 py-3 text-xs">{r.channel ? PAYTYPE_LABEL[r.channel] ?? r.channel : "—"}</td>
              <td className="px-4 py-3 text-xs max-w-[160px] text-muted">{r.recipient_detail ?? "—"}</td>
              <td className="px-4 py-3 text-right font-mono">¥{r.yuan_amount.toFixed(2)}</td>
              <td className="px-4 py-3 text-right text-xs text-muted">{r.exchange_rate.toFixed(4)}</td>
              <td className="px-4 py-3 text-right font-mono text-xs">{thb(r.thb_amount)}</td>
              <td className="px-4 py-3"><PaymentStatusBadge s={r.status} /></td>
              <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{r.created_at ? new Date(r.created_at).toLocaleDateString("th-TH") : "—"}</td>
            </tr>
          ))}
        </DataTable>
      )}

      {/* ── Sales tab (Pacred-native sales_payouts — kept as-is) ─────── */}
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
              <td className="px-4 py-3"><PayoutStatusBadge s={r.status} /></td>
              <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                {r.paid_at ? new Date(r.paid_at).toLocaleDateString("th-TH") : "—"}
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      {/* ── Payment tab ───────────────────────────────────────────────── */}
      {/* Legacy stores tb_wallet_hs.amount as positive; the direction comes
          from `type`. Render outflow types (3/4/5/6/7) as negative for
          operator clarity — mirrors /admin/accounting/page.tsx Wave 20. */}
      {tab === "payment" && (
        <DataTable
          headers={["วันที่", "ลูกค้า", "ประเภท", "จำนวน", "บัญชี/หมายเหตุ", "สถานะ"]}
          empty={walletRows.length === 0}
        >
          {walletRows.map((r) => {
            const isOutflow = ["3", "4", "5", "6", "7"].includes(r.type);
            const renderedAmount = isOutflow ? -Math.abs(r.amount) : Math.abs(r.amount);
            return (
              <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30 align-top">
                <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{r.created_at ? new Date(r.created_at).toLocaleString("th-TH") : "—"}</td>
                <td className="px-4 py-3 text-xs">
                  <div className="font-mono">{r.user?.userID ?? "—"}</div>
                  <div>{userDisplayName(r.user)}</div>
                  <div className="text-muted">{r.user?.userTel ?? ""}</div>
                </td>
                <td className="px-4 py-3 text-xs">{WALLET_TYPE_LABEL[r.type] ?? `type ${r.type}`}</td>
                <td className={`px-4 py-3 text-right font-mono ${renderedAmount < 0 ? "text-red-700" : "text-green-700"}`}>
                  {renderedAmount > 0 ? "+" : ""}{renderedAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-xs text-muted">
                  {r.bank_name    && <div>{r.bank_name} {r.account_name ?? ""}</div>}
                  {r.note         && <div>📝 {r.note}</div>}
                </td>
                <td className="px-4 py-3"><PaymentStatusBadge s={r.status} /></td>
              </tr>
            );
          })}
        </DataTable>
      )}
    </main>
    </>
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

function ForwarderStatusBadge({ s }: { s: string }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${FORWARDER_BADGE[s] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
      {legacyForwarderStatusThai(s) || s}
    </span>
  );
}
function OrderStatusBadge({ s }: { s: string }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${ORDER_BADGE[s] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
      {legacyOrderStatusThai(s) || s}
    </span>
  );
}
function PaymentStatusBadge({ s }: { s: string }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${PAYMENT_BADGE[s] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
      {PAYMENT_LABEL[s] ?? s}
    </span>
  );
}
function PayoutStatusBadge({ s }: { s: string }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${PAYOUT_STATUS_BADGE[s] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
      {PAYOUT_STATUS_LABEL[s] ?? s}
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
