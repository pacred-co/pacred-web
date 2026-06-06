/**
 * /admin/forwarders — รายการฝากนำเข้าสินค้า (faithful port)
 *
 * Wave 3 P0 #1 — rewritten 2026-05-21 to read the legacy `tb_forwarder`
 * table (loaded via migration 0081 · ~8,898 customers · all their import
 * orders). Previously this page read the rebuilt-from-scratch `forwarders`
 * table which is EMPTY on prod — staff saw "0 รายการ" and could not
 * answer customer phone calls about order status.
 *
 * Legacy source: `member/pcs-admin/forwarder.php` (2,661 LOC). Status
 * URL keys match the legacy 10-tab strip (`?status=1..7`, `6.1`, `c`, `p`):
 *   1  รอเข้าโกดังจีน        (fstatus='1')
 *   2  ถึงโกดังจีนแล้ว       (fstatus='2')
 *   3  กำลังส่งมาไทย         (fstatus='3')
 *   4  ถึงไทยแล้ว             (fstatus='4')
 *   5  รอชำระเงิน              (fstatus='5')
 *   6  เตรียมส่ง               (fstatus='6' AND no driver row)
 *   6.1 กำลังจัดส่ง            (fstatus='6' AND driver row exists with fdistatus='')
 *   7  ส่งแล้ว                  (fstatus='7')
 *   c  เครติดสินค้า            (fcredit='1')
 *   p  สถานะพิเศษ              (fstatus='99')
 *
 * Customer name comes from `tb_users` joined on `userid` (legacy text id
 * like `PCS10843`). PostgREST FK auto-join is unreliable across the
 * legacy schema, so we do a 2nd query with `.in("userid", ids)` and
 * merge in TS.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ForwardersTable } from "./forwarders-table";
import { ForwardersSearchBar } from "./search-bar";
import { Suspense } from "react";
import { PageTopMenubar, type MenubarItem } from "@/components/admin/page-top-menubar";
import { resolveLegacyUrlMap } from "@/lib/storage/legacy-resolver";
import { parsePage, pageRange, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { calcForwarderOutstanding } from "@/lib/forwarder/outstanding";
import { buildDefaultLandingRedirect } from "@/lib/admin/default-queue-filter";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────
// Page top-menubar — ภูม brief 2026-05-20 ค่ำ. Updated to use the legacy
// `?status=` filter keys (was `?q=` which collided with the keyword
// search box). The 10 status tabs render below; this menubar is just
// quick-jumps + work / barcode / search shortcuts.
// ─────────────────────────────────────────────────────────────────────
const FORWARDER_MENUBAR: MenubarItem[] = [
  { label: "หน้าหลัก", href: "/admin/forwarders" },
  {
    label: "ตามประเภท",
    children: [
      { label: "ทั้งหมด",   href: "/admin/forwarders" },
      { label: "เตรียมส่ง", href: "/admin/forwarders?status=6" },
      { label: "เครดิต",   href: "/admin/forwarders?status=c" },
      { label: "พิเศษ",    href: "/admin/forwarders?status=p" },
    ],
  },
  {
    label: "งาน",
    children: [
      // 2026-06-03 (ภูม flag · R-2 close-out): รวมบิลสินค้า + ใบวางบิล ย้ายไป
      // หมวด "ระบบบัญชี → รายรับ" ตาม PEAK pattern (acc-system-cargo.php).
      // เหตุผล: ใบวางบิล/รวมบิลสินค้า = เอกสารบัญชี (income surface) ไม่ใช่
      // operational งาน-โกดัง. PEAK เก็บใบวางบิลใต้ "รายรับ" — Pacred ทำตาม.
      // Kept the หมายเหตุ / มอบงาน / ต้นทุน leaves here (ops-flavor).
      { label: "ประวัติเข้าโกดังไทย",     href: "/admin/forwarders/warehouse-history" },
      // Wave 20 P1 (ภูม flag 2026-05-26): the dedicated หมายเหตุนำเข้า
      // page exists at /admin/forwarders/notes but was unreachable from
      // here; wired into งาน menu group beside the other ops surfaces.
      { label: "หมายเหตุนำเข้า",         href: "/admin/forwarders/notes" },
      { label: "มอบงานคนขับ",            href: "/admin/drivers" },
      // Wave 7.3 (2026-05-22): wired 2 orphan container-cost pages per
      // ภูม decision in page-inventory-2026-05-21-night.md §🔴 DEAD.
      { label: "ต้นทุนตู้",                href: "/admin/accounting/container-costs" },
      { label: "เช็คต้นทุนตู้ (Sheet)",    href: "/admin/forwarders/container-cost-check" },
    ],
  },
  // Wave 29 #214 (2026-05-30 · ภูม flag): removed "บาร์โค้ด" tab — both leaves
  // pointed at orphan redirects (/admin/barcode and /admin/barcode/driver are
  // now redirect stubs after Wave 29 #209 Agent F orphan cleanup) and the same
  // destination (/admin/barcode/driver/import) is exposed in the sidebar as a
  // top-level flat shortcut "บันทึกสินค้าเข้าโกดัง". Duplicate menubar entry
  // would only confuse warehouse staff who already know to look at the sidebar.
  {
    label: "ค้นหา",
    children: [
      { label: "รหัสเดียว",    href: "/admin/forwarders?focus=search" },
      { label: "หลายรหัส",     href: "/admin/forwarders/bulk-search" },
    ],
  },
];

// Legacy STATUS_LABEL — fStatus values (string in legacy too: char(2))
const STATUS_LABEL: Record<string, string> = {
  "1":   "รอเข้าโกดังจีน",
  "2":   "ถึงโกดังจีนแล้ว",
  "3":   "กำลังส่งมาไทย",
  "4":   "ถึงไทยแล้ว",
  "5":   "รอชำระเงิน",
  "6":   "เตรียมส่ง",
  "6.1": "กำลังจัดส่ง",
  "7":   "ส่งแล้ว",
  "c":   "เครติดสินค้า",
  "p":   "สถานะพิเศษ",
  "99":  "พิเศษ",
};

// Transport mode (ftransporttype char(1): '1'/'2'/'3')
const MODE_LABEL: Record<string, string> = {
  "1": "🚛 รถ",
  "2": "🚢 เรือ",
  "3": "✈️ เครื่องบิน",
};

type SearchParams = {
  status?: string;      // 1..7, 6.1, c, p — legacy 10-tab filter
  q?: string;           // single-line keyword search
  q_multi?: string;     // U2-5: multi-line bulk tracking search
  page?: string;        // server/client pagination (?page=N)
  date_from?: string;
  date_to?: string;
  segment?: string;     // DEPRECATED — kept for old bookmark links (cargo-fcl etc.)
  service?: string;     // 2026-05-21 segmented control · 'cargo' | 'freight' — label-only
  container?: string;   // 2026-05-21 segmented control · 'fcl' | 'lcl' — label-only
  mode?: string;        // transport mode chip ('1'/'2'/'3')
  create?: string;      // Wave 11 — 'user'|'system'|'admin' (legacy ?create=)
  all?: string;         // Wave 18-B — '1' = escape default 30-day window
};

// Wave 18-B — Default date window helpers (port of legacy `forwarder.php`
// L318-323: list defaults to last 30 days unless POST `historyTableAll` is
// set). Pacred currently loaded "newest 300 of all time" which buries
// today's รอเข้าโกดังจีน rows under months-old shipments. Mirrors the
// yuan-payments Wave 15 pattern.
//
// Rule: if neither `?date_from` nor `?date_to` is in the URL AND `?all=1`
// is absent → apply the 30-day default. `?all=1` is the escape hatch
// matching legacy's "ค้นหาข้อมูลทั้งหมด" button.
function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function resolveDateWindow(sp: SearchParams): {
  from: string | null;
  to: string | null;
  isDefault: boolean;
} {
  if (sp.all === "1") return { from: null, to: null, isDefault: false };
  if (sp.date_from || sp.date_to)
    return { from: sp.date_from ?? null, to: sp.date_to ?? null, isDefault: false };
  // Default 30-day window per legacy.
  return { from: isoDaysAgo(30), to: todayIsoDate(), isDefault: true };
}

// 2026-05-21 ภูม brief — Segmented Controls in head menu (NOT sidebar).
// Legacy tb_forwarder has NO explicit cargo/freight or FCL/LCL column —
// these are LABEL-ONLY filters for now; the SQL doesn't change. Real
// filter requires a derived expression or new column (Phase C).
const SERVICE_OPTIONS = [
  { v: undefined,  l: "ทั้งหมด"  },
  { v: "cargo",    l: "Cargo"   },
  { v: "freight",  l: "Freight" },
] as const;
const CONTAINER_OPTIONS = [
  { v: undefined, l: "ทั้งหมด" },
  { v: "fcl",     l: "FCL"     },
  { v: "lcl",     l: "LCL"     },
] as const;

type RawForwarderRow = {
  id: number;
  fdate: string | null;
  fstatus: string;
  ftransporttype: string;
  fwarehousechina: string;
  fwarehousename: string;
  fcabinetnumber: string | null;
  ftrackingchn: string | null;
  ftrackingth: string | null;
  fidorco: string | null;
  userid: string;
  fnote: string | null;
  fcover: string | null;
  fweight: number | null;
  fvolume: number | null;
  famount: number | null;
  ftotalprice: number | null;
  fcosttotalprice: number | null;
  faddressname: string | null;
  faddresslastname: string | null;
  faddresszipcode: string | null;
  fcredit: string | null;
  fdetail: string | null;
  // Wave 11 fidelity port — extra fields the legacy `forwarder.php` list shows
  adminidcreator: string | null;       // empty = customer · "admin_X" = admin-initiated
  reforder: string | null;             // non-empty = replicated by system (refOrder in PHP)
  fdatestatus2: string | null;         // เข้าโกดังจีน
  fdatestatus3: string | null;         // ออกโกดังจีน → กำลังส่งมาไทย
  fdatestatus4: string | null;         // ถึงไทย
  fdateadminstatus: string | null;     // last admin status update
  adminid: string | null;              // last admin who touched the row
  paydeposit: string | null;           // "1" = paid · null/empty = ยอดค้างชำระ
  // Wave 15 P0-3 — price-component columns required by calcForwarderOutstanding()
  fpriceupdate: number | null;
  ftransportprice: number | null;
  fshippingservice: string | number | null;  // legacy varchar
  pricecrate: number | null;
  ftransportpricechnthb: number | null;
  priceother: number | null;
  fdiscount: number | null;
  fusercompany: string | number | null;       // legacy varchar; '1' = juristic
  adminidkey: string | null;                   // admin who measured weight/CBM
  // Wave 18-B — 7-col fidelity backfill (legacy forwarder.php L575-580 + L595-609 + L651-653)
  printstatus1: string | null;        // "1" = พิมพ์แล้ว (badge #1)
  printstatus2: string | null;        // "1" = พิมพ์แล้ว (badge #2)
  printstatus3: string | null;        // "1" = พิมพ์แล้ว (badge #3)
  printstatus4: string | null;        // "1" = พิมพ์แล้ว (badge #4)
  fstatuscaron: string | null;        // "1" = ขึ้นรถแล้ว
  fstatuscaroff: string | null;       // "1" = ลงรถ
  fdatetothai: string | null;         // ETA base date · transport-type adds offset (±2/±4d)
  fpallet: string | null;             // warehouse pallet location code (e.g. "A-3")
};

type RawUserRow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
  // Wave 18-B — VIP/SVIP/SaleAdmin chips on the customer cell
  coID: string | null;            // 'PCS'/'STAR'/'DIAMOND'/'CROWN'/etc.
  userComparison: string | null;  // '1' = CPS (รคา่เทียบ)
  userCompany: string | null;     // '1' = นิติบุคคล
  adminIDSale: string | null;     // sale rep code · '' = ไม่ระบุ
};

export type Row = {
  id: number;                  // primary key · legacy displays as "ออเดอร์ #<id>"
  order_no: string;            // formatted "ออเดอร์ #<id>" string
  f_no_cargo: string | null;   // fidorco — Cargo API tracking (separate from order id)
  status: string;              // fstatus
  warehouse_china: string;     // fwarehousechina
  partner_warehouse: string;   // fwarehousename
  transport_type: string;      // ftransporttype
  amount_count: number;        // famount (number of boxes)
  weight_kg: number;
  volume_cbm: number;
  total_price: number;
  tracking_chn: string | null;
  tracking_th: string | null;
  cabinet_number: string | null;
  created_at: string;          // fdate (ISO)
  date_status2: string | null; // เข้าโกดังจีน (fdatestatus2)
  date_status3: string | null; // กำลังส่งมาไทย (fdatestatus3)
  date_status4: string | null; // ถึงไทย (fdatestatus4)
  date_admin_status: string | null; // last admin update
  admin_id_last: string | null;     // last admin who touched
  admin_creator: string | null;     // adminidcreator (empty=customer · set=admin-initiated)
  ref_order: string | null;         // reforder (set = system-replicated)
  fcredit: string;             // '1' = credit order
  paydeposit: string | null;   // '1' = paid · null/'' = ยอดค้างชำระ remaining
  note: string | null;
  detail: string | null;
  cover: string | null;        // product thumbnail filename (fcover) — bare
  coverUrl: string | null;     // Wave 13 — server-resolved signed Supabase URL
  /**
   * Wave 15 P0-3 — ยอดค้างชำระ (outstanding balance) in THB.
   * Computed via `calcForwarderOutstanding()` (port of legacy
   * `calPriceForwarderMain()`). Zero when paydeposit='1' (paid in full).
   */
  outstanding_thb: number;
  /**
   * Wave 15 P0-3 — admin who entered the dimensions/weight (`adminidkey`).
   * Shown next to weight/CBM so accounting knows who to ask if the
   * measurement looks off.
   */
  measured_by_admin: string | null;
  // Wave 18-B — 7-col fidelity backfill from fidelity-gap-2026-05-24.md.
  // All these mirror legacy forwarder.php L575-653 row chrome that operators
  // rely on to triage SLA + delivery state at-a-glance.
  print_status_1: boolean;     // legacy printstatus1='1' → "พิมพ์แล้ว #1"
  print_status_2: boolean;     // legacy printstatus2='1' → "พิมพ์แล้ว #2"
  print_status_3: boolean;     // legacy printstatus3='1' → "พิมพ์แล้ว #3"
  print_status_4: boolean;     // legacy printstatus4='1' → "พิมพ์แล้ว #4"
  car_on: boolean;             // legacy fstatuscaron='1' → ขึ้นรถแล้ว
  car_off: boolean;            // legacy fstatuscaroff='1' → ลงรถ
  eta_base: string | null;     // legacy fdatetothai · ETA range computed in client
  pallet: string | null;       // legacy fpallet · warehouse location chip
  customer: {
    userid: string;
    name: string;
    phone: string;
    // Wave 18-B — VIP/SVIP/SaleAdmin badge inputs
    coid: string;              // 'PCS'/'STAR'/'DIAMOND'/'CROWN'/etc
    is_svip: boolean;          // row in tb_rate_custom_cbm
    is_corporate: boolean;     // row in tb_corporate
    is_comparison: boolean;    // tb_users.usercomparison='1'
    is_juristic: boolean;      // tb_users.usercompany='1'
    sale_admin: string | null; // tb_users.adminidsale
  } | null;
};

export default async function AdminForwardersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  // W-1 (gap-admin H-1): page-level role gate. Lists every customer's
  // import orders + prices via createAdminClient (RLS-bypass) — ops
  // (runs the orders) + accounting (bills them).
  const { roles } = await requireAdmin(["ops", "accounting"]);

  const sp = await searchParams;

  // G6 — default queue filter per role. When a staffer lands on
  // /admin/forwarders without any filter params, redirect them into
  // their default queue (warehouse → status=3 · accounting → status=4
  // · sales/interpreter/qa → status=1). `super` + multi-filter URLs
  // fall through unchanged. Matrix lives in lib/admin/default-queue-filter.
  const defaultRedirect = buildDefaultLandingRedirect(
    "/admin/forwarders",
    roles,
    sp as Record<string, unknown>,
  );
  if (defaultRedirect) redirect(defaultRedirect);

  const admin = createAdminClient();

  // Wave 18-B — resolve default 30-day window (legacy parity ·
  // forwarder.php L318-323). Applied to the main query AND counts below
  // so badges align with what's on screen.
  const dateWindow = resolveDateWindow(sp);

  // ─── Pagination (2026-06-04) ──────────────────────────────────────────
  // This list has THREE post-fetch filters that shrink rows AFTER the DB
  // fetch: the 6-vs-6.1 driver-item split, and the q / q_multi keyword
  // filters (which also match the JS-joined customer name/phone). When any
  // of those is active a DB count:exact would over-count vs what's rendered,
  // so we client-slice (fetch the bounded filtered set + slice + total =
  // filtered length). On the common path (no search, status ≠ 6/6.1) there
  // is NO post-fetch shrink → we use the efficient DB count:exact + .range.
  const page = parsePage(sp.page);
  const { from, to } = pageRange(page);
  const hasPostFetchFilter = !!(sp.q || sp.q_multi || sp.status === "6" || sp.status === "6.1");

  // ─── Main query against tb_forwarder ──────────────────────────────────
  // Note: PostgREST cannot reliably auto-join the legacy `tb_users` table
  // (the FK is by `userid` text not a true relational FK). We pull the
  // forwarder rows here, then fetch matching tb_users rows in a 2nd query.
  let q = admin
    .from("tb_forwarder")
    .select(
      "id,fdate,fstatus,ftransporttype,fwarehousechina,fwarehousename," +
      "fcabinetnumber,ftrackingchn,ftrackingth,fidorco,userid,fnote,fcover," +
      "fweight,fvolume,famount,ftotalprice,fcosttotalprice," +
      "faddressname,faddresslastname,faddresszipcode,fcredit,fdetail," +
      // Wave 11 fidelity port — extra cols for the legacy 12-column layout
      "adminidcreator,reforder,fdatestatus2,fdatestatus3,fdatestatus4," +
      "fdateadminstatus,adminid,paydeposit," +
      // Wave 15 P0-3 — extra cols required by calcForwarderOutstanding()
      // (port of legacy calPriceForwarderMain · shows ยอดค้างชำระ in the list)
      "fpriceupdate,ftransportprice,fshippingservice,pricecrate," +
      "ftransportpricechnthb,priceother,fdiscount,fusercompany,adminidkey," +
      // Wave 18-B — 7-col fidelity backfill (print badges · car on/off ·
      // ETA base date · pallet code · all from legacy forwarder.php L575-653).
      "printstatus1,printstatus2,printstatus3,printstatus4," +
      "fstatuscaron,fstatuscaroff,fdatetothai,fpallet",
      // count:exact only on the common path (no post-fetch shrink) so the
      // pager total matches the rendered rows; the search/6.1 views compute
      // total from the JS-filtered length instead.
      hasPostFetchFilter ? undefined : { count: "exact" },
    )
    .order("fdate", { ascending: false, nullsFirst: false });

  // Wave 18-B — default-30-day window (escape via ?all=1) — applied to
  // both the data query and the per-tab counts below.
  // 🟠 ภูม #2 (2026-05-30): when a keyword search is active, BYPASS the
  // 30-day window. The search box is meant to find a customer/order/tracking
  // anywhere in history — limiting to the last 30 days is exactly what made
  // ภูม think the search "didn't work" (silent zero-results when the order
  // was from > 30 days ago).
  const skipDateWindow = !!(sp.q && sp.q.trim().length > 0);
  if (!skipDateWindow) {
    if (dateWindow.from) q = q.gte("fdate", dateWindow.from);
    if (dateWindow.to)   q = q.lte("fdate", dateWindow.to + "T23:59:59");
  }

  // Wave 11 — `create=` top-tab filter (legacy: ?create=user|system|admin).
  //   user   = customer-initiated (adminidcreator empty AND reforder empty)
  //   system = system-replicated (reforder non-empty)
  //   admin  = admin-initiated   (adminidcreator non-empty AND reforder empty)
  // Per sample data both fields default to "" (not NULL) on prod, so a
  // plain .eq("", "") + .neq is reliable. PostgREST .or() with empty
  // value didn't translate cleanly via supabase-js (returned unfiltered
  // rows in browser even though raw curl with `eq.` worked).
  if (sp.create === "user") {
    q = q.eq("adminidcreator", "").eq("reforder", "");
  } else if (sp.create === "system") {
    q = q.neq("reforder", "");
  } else if (sp.create === "admin") {
    q = q.neq("adminidcreator", "").eq("reforder", "");
  }

  // Status filter — legacy keys (1..7, 6.1, c, p).
  //
  // 6 vs 6.1 split (resolved 2026-05-21):
  //   tab "เตรียมส่ง" (status=6)   = fstatus='6' AND NOT in tb_forwarder_driver_item
  //                                  with fdistatus='' (legacy: "ยังไม่ขึ้นรถ" set)
  //   tab "กำลังจัดส่ง" (status=6.1) = fstatus='6' AND     in tb_forwarder_driver_item
  //                                  with fdistatus=''
  //
  // We resolve the 6.1 set via a 2nd query (PostgREST has no subquery
  // syntax). For the unfiltered + most-status views the 6.1 join is
  // skipped (saves a roundtrip on the common path).
  let driverInProgressIds: Set<number> | null = null;
  if (sp.status === "6" || sp.status === "6.1") {
    const { data: driverItemRows, error: driverItemRowsErr } = await admin
      .from("tb_forwarder_driver_item")
      .select("fid")
      .eq("fdistatus", "");
    if (driverItemRowsErr) {
      console.error(`[tb_forwarder_driver_item list] failed`, { code: driverItemRowsErr.code, message: driverItemRowsErr.message });
    }
    driverInProgressIds = new Set(
      (driverItemRows ?? []).map((r) => Number((r as { fid: number | string }).fid)),
    );
  }

  if (sp.status === "c") {
    q = q.eq("fcredit", "1");
  } else if (sp.status === "p") {
    q = q.eq("fstatus", "99");
  } else if (sp.status === "6") {
    q = q.eq("fstatus", "6");
    // เตรียมส่ง = NOT in driver_item with fdistatus='' (filtered post-fetch · see L~248)
  } else if (sp.status === "6.1") {
    q = q.eq("fstatus", "6");
    // กำลังจัดส่ง = IN driver_item with fdistatus='' (filtered post-fetch · see L~248)
  } else if (sp.status && /^[1-7]$/.test(sp.status)) {
    q = q.eq("fstatus", sp.status);
  }

  if (sp.mode && MODE_LABEL[sp.mode]) q = q.eq("ftransporttype", sp.mode);

  if (sp.date_from) q = q.gte("fdate", sp.date_from);
  if (sp.date_to)   q = q.lte("fdate", sp.date_to + "T23:59:59");

  // 🟠 ภูม #2 (2026-05-30): server-side keyword search across the fields ภูม
  // listed — รหัสลูกค้า (userid) · ออเดอร์ (id) · เลขพัสดุจีน (ftrackingchn +
  // ftrackingchn2) · เลขตู้ (fcabinetnumber) · plus bonus: customer name +
  // phone via a tb_users prefetch. Was previously a CLIENT-side filter
  // against only the rows in the current page → if the match wasn't on page
  // 1, you got silent zero-results (the bug ภูม flagged). PostgREST .or()
  // pushes the match to Postgres so it scans the entire table (paired with
  // the date-window bypass above + the 300-row cap → admin can see any
  // matching row across all of history).
  if (sp.q && sp.q.trim().length > 0) {
    const kw = sp.q.trim();
    // Escape PostgREST `or` reserved chars: `,` `(` `)` would break the
    // comma-separated tuple list. Replace with %25 placeholders (ilike
    // tolerates them as wildcards-against-wildcards).
    const safe = kw.replace(/[,()*]/g, "%");

    // Prefetch tb_users matching name OR phone OR userID → collect their
    // userIDs so we can ALSO match forwarder rows whose `userid` is one of
    // those. This lets ภูม type "John" or "0812345678" and find their
    // order, not just type the exact PR code.
    const { data: nameMatchedUsers, error: nameMatchErr } = await admin
      .from("tb_users")
      .select("userID")
      .or(
        [
          `userID.ilike.%${safe}%`,
          `userName.ilike.%${safe}%`,
          `userLastName.ilike.%${safe}%`,
          `userTel.ilike.%${safe}%`,
        ].join(","),
      )
      .limit(500);
    if (nameMatchErr) {
      console.error("[tb_users keyword prefetch] failed", {
        code: nameMatchErr.code,
        message: nameMatchErr.message,
      });
    }
    const matchedUserIds = (nameMatchedUsers ?? [])
      .map((u) => (u as { userID: string | null }).userID)
      .filter((u): u is string => !!u);

    const parts = [
      `userid.ilike.%${safe}%`,
      `ftrackingchn.ilike.%${safe}%`,
      `ftrackingchn2.ilike.%${safe}%`,
      `fcabinetnumber.ilike.%${safe}%`,
      `fidorco.ilike.%${safe}%`,
    ];
    // Numeric input → also match the integer id column (= "ออเดอร์").
    const asInt = /^\d+$/.test(safe) ? Number(safe) : null;
    if (asInt !== null && Number.isFinite(asInt)) {
      parts.unshift(`id.eq.${asInt}`);
    }
    // Name/phone matches → add `userid.in.(PR123,PR456,...)` to the OR.
    // Cap at 200 ids so the URL stays sane (the limit:500 above already
    // upper-bounds, but cap once more here as defense).
    if (matchedUserIds.length > 0) {
      const idsList = matchedUserIds.slice(0, 200).join(",");
      parts.push(`userid.in.(${idsList})`);
    }
    q = q.or(parts.join(","));
  }

  // Window the fetch: common path → DB .range() (one page); post-fetch-filter
  // path → bounded cap, then JS-filter + slice below (search/status-6 sets are
  // bounded, esp. with the date window / specific status).
  if (hasPostFetchFilter) {
    q = q.limit(2000);
  } else {
    q = q.range(from, to);
  }

  const { data: forwarderRows, error: forwarderErr, count: forwarderCount } = await q;
  let raw = (forwarderRows ?? []) as unknown as RawForwarderRow[];

  // 6 vs 6.1 post-fetch split (driver-in-progress set was loaded above).
  if (sp.status === "6" && driverInProgressIds) {
    raw = raw.filter((r) => !driverInProgressIds!.has(Number(r.id)));
  } else if (sp.status === "6.1" && driverInProgressIds) {
    raw = raw.filter((r) => driverInProgressIds!.has(Number(r.id)));
  }

  // ─── 2nd query: tb_users for customer name/phone (+ VIP/Sale chips) ───
  const uniqueUserIds = Array.from(new Set(raw.map((r) => r.userid).filter(Boolean)));
  let usersByUserId = new Map<string, RawUserRow>();
  // Wave 18-B — SVIP + นิติ sets (legacy badgeVIP3 + tb_corporate join).
  // SVIP membership = ≥1 row in tb_rate_custom_cbm with matching userid.
  // นิติ membership  = ≥1 row in tb_corporate with matching userid.
  let svipUserIds = new Set<string>();
  let corporateUserIds = new Set<string>();
  if (uniqueUserIds.length > 0) {
    const [userRowsRes, svipRowsRes, corpRowsRes] = await Promise.all([
      admin
        .from("tb_users")
        .select(
          "userID,userName,userLastName,userTel,coID,userComparison,userCompany,adminIDSale",
        )
        .in("userID", uniqueUserIds),
      admin
        .from("tb_rate_custom_cbm")
        .select("userid")
        .in("userid", uniqueUserIds),
      admin
        .from("tb_corporate")
        .select("userid")
        .in("userid", uniqueUserIds),
    ]);
    usersByUserId = new Map(
      ((userRowsRes.data ?? []) as unknown as RawUserRow[]).map((u) => [u.userID, u]),
    );
    svipUserIds = new Set(
      ((svipRowsRes.data ?? []) as unknown as { userid: string }[])
        .map((r) => r.userid)
        .filter(Boolean),
    );
    corporateUserIds = new Set(
      ((corpRowsRes.data ?? []) as unknown as { userid: string }[])
        .map((r) => r.userid)
        .filter(Boolean),
    );
  }

  // Shape into our Row type for the table.
  let rows: Row[] = raw.map((r) => {
    const user = usersByUserId.get(r.userid);
    const name = user
      ? `${user.userName ?? ""} ${user.userLastName ?? ""}`.trim()
      : "";
    // Wave 18-B — fpallet column is empty-string-by-default in legacy; treat
    // both null and "" as "no location set".
    const pallet = r.fpallet && r.fpallet.trim() !== "" ? r.fpallet.trim() : null;
    // Legacy uses '0000-00-00' as the "no ETA yet" sentinel; map to null.
    const eta = r.fdatetothai && r.fdatetothai !== "0000-00-00" ? r.fdatetothai : null;
    return {
      id: r.id,
      order_no: `ออเดอร์ #${r.id}`,           // Wave 11 — legacy display label
      f_no_cargo: r.fidorco,                  // Cargo API tracking (separate from order id)
      status: r.fstatus,
      warehouse_china: r.fwarehousechina,
      partner_warehouse: r.fwarehousename,
      transport_type: r.ftransporttype,
      amount_count: Number(r.famount ?? 0),
      weight_kg: Number(r.fweight ?? 0),
      volume_cbm: Number(r.fvolume ?? 0),
      total_price: Number(r.ftotalprice ?? 0),
      tracking_chn: r.ftrackingchn,
      tracking_th: r.ftrackingth,
      cabinet_number: r.fcabinetnumber,
      created_at: r.fdate ?? "",
      date_status2: r.fdatestatus2,
      date_status3: r.fdatestatus3,
      date_status4: r.fdatestatus4,
      date_admin_status: r.fdateadminstatus,
      admin_id_last: r.adminid,
      admin_creator: r.adminidcreator,
      ref_order: r.reforder,
      fcredit: r.fcredit ?? "0",
      paydeposit: r.paydeposit,
      note: r.fnote,
      detail: r.fdetail,
      cover: r.fcover,
      coverUrl: null,            // filled in after the URL-resolve step below
      // Wave 15 P0-3 — outstanding balance computed from legacy formula.
      // paydeposit='1' = paid in full → outstanding = 0; otherwise compute.
      outstanding_thb: r.paydeposit === "1" ? 0 : calcForwarderOutstanding(r),
      measured_by_admin: r.adminidkey ?? null,
      // Wave 18-B — 7-col fidelity backfill flags.
      print_status_1: r.printstatus1 === "1",
      print_status_2: r.printstatus2 === "1",
      print_status_3: r.printstatus3 === "1",
      print_status_4: r.printstatus4 === "1",
      car_on:  r.fstatuscaron  === "1",
      car_off: r.fstatuscaroff === "1",
      eta_base: eta,
      pallet,
      customer: user
        ? {
            userid: user.userID,
            name,
            phone: user.userTel ?? "",
            coid: user.coID ?? "",
            is_svip: svipUserIds.has(user.userID),
            is_corporate: corporateUserIds.has(user.userID),
            is_comparison: user.userComparison === "1",
            is_juristic: user.userCompany === "1",
            sale_admin:
              user.adminIDSale && user.adminIDSale.trim() !== ""
                ? user.adminIDSale.trim()
                : null,
          }
        : null,
    };
  });

  // ─── Client-side keyword filter across multiple fields ────────────────
  // q_multi (U2-5): multi-line bulk search — match if ANY line matches ANY field.
  // q       (legacy single): one keyword across all fields.
  if (sp.q_multi) {
    const lines = sp.q_multi
      .split(/\r?\n/)
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean);
    if (lines.length > 0) {
      rows = rows.filter((r) => {
        const fields = [
          String(r.id),
          (r.f_no_cargo ?? "").toLowerCase(),
          (r.tracking_chn ?? "").toLowerCase(),
          (r.tracking_th  ?? "").toLowerCase(),
          (r.customer?.userid ?? "").toLowerCase(),
          (r.cabinet_number ?? "").toLowerCase(),
        ];
        return lines.some((kw) => fields.some((f) => f.includes(kw)));
      });
    }
  } else if (sp.q) {
    const keyword = sp.q.toLowerCase();
    rows = rows.filter((r) =>
      String(r.id).includes(keyword) ||
      (r.f_no_cargo ?? "").toLowerCase().includes(keyword) ||
      (r.tracking_chn ?? "").toLowerCase().includes(keyword) ||
      (r.tracking_th  ?? "").toLowerCase().includes(keyword) ||
      (r.customer?.userid ?? "").toLowerCase().includes(keyword) ||
      (r.customer?.phone ?? "").includes(keyword) ||
      (r.customer?.name ?? "").toLowerCase().includes(keyword) ||
      (r.cabinet_number ?? "").toLowerCase().includes(keyword)
    );
  }

  // ─── Pagination total + window (2026-06-04) ──────────────────────────
  // Common path: rows are already the DB .range() window → total = the
  // count:exact. Post-fetch path: rows is the full JS-filtered set → total =
  // its length, and we slice the display window here (BEFORE the cover-URL
  // resolve below, so signed URLs are generated only for the visible page).
  const totalForwarders = hasPostFetchFilter ? rows.length : (forwarderCount ?? 0);
  if (hasPostFetchFilter) {
    rows = rows.slice(from, to + 1);
  }

  // ─── Wave 13 — resolve cover filenames to signed Supabase URLs ────────
  // `fcover` is a bare filename (e.g. "PR10691_67e0..._8c1735.jpg"). Legacy
  // covers live at `forwarder-covers/legacy-shops/<file>`; newer admin-
  // initiated uploads already use a bucket-relative path (`admin/...`).
  // Batch-resolve all in parallel — much faster than per-row await.
  const coverMap = await resolveLegacyUrlMap(
    rows.map((r) => ({ id: r.id, filename: r.cover })),
    "cover",
  );
  rows = rows.map((r) => ({ ...r, coverUrl: coverMap[String(r.id)] ?? null }));

  // ─── Per-tab counts (head queries against tb_forwarder) ──────────────
  // We run these in parallel; each returns the count for that status
  // code (scoped to the SAME date window as the data query so the badges
  // reflect what's on screen · Wave 18-B fidelity backfill).
  const counts = await loadStatusCounts(admin, dateWindow);

  const filterOpts: { v: string | undefined; l: string; n: number }[] = [
    { v: undefined, l: "ทั้งหมด", n: counts.total },
    { v: "1",   l: STATUS_LABEL["1"]!,   n: counts.s1 },
    { v: "2",   l: STATUS_LABEL["2"]!,   n: counts.s2 },
    { v: "3",   l: STATUS_LABEL["3"]!,   n: counts.s3 },
    { v: "4",   l: STATUS_LABEL["4"]!,   n: counts.s4 },
    { v: "5",   l: STATUS_LABEL["5"]!,   n: counts.s5 },
    { v: "6",   l: STATUS_LABEL["6"]!,   n: counts.s6 },
    { v: "6.1", l: STATUS_LABEL["6.1"]!, n: 0 },  // TODO: needs driver-item join
    { v: "7",   l: STATUS_LABEL["7"]!,   n: counts.s7 },
    { v: "c",   l: STATUS_LABEL["c"]!,   n: counts.credit },
    { v: "p",   l: STATUS_LABEL["p"]!,   n: counts.special },
  ];

  // 2026-05-21 ภูม brief — back-compat: if old `?segment=cargo-fcl` URL hit
  // is taken, split into the new dual-dimension `service` + `container`.
  let service = sp.service;
  let container = sp.container;
  if (!service && !container && sp.segment) {
    const parts = sp.segment.split("-");
    if (parts[0] === "cargo" || parts[0] === "freight") service = parts[0];
    if (parts[1] === "fcl" || parts[1] === "lcl") container = parts[1];
  }
  const serviceLabel = service === "cargo" ? "Cargo" : service === "freight" ? "Freight" : null;
  const containerLabel = container === "fcl" ? "FCL" : container === "lcl" ? "LCL" : null;
  const headerSuffix = [serviceLabel, containerLabel].filter(Boolean).join(" · ");

  return (
    <>
      <PageTopMenubar items={FORWARDER_MENUBAR} activeHref="/admin/forwarders" />
      <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN</p>
          <h1 className="mt-1 text-2xl font-bold">
            ฝากนำเข้า{headerSuffix ? ` · ${headerSuffix}` : ""}
          </h1>
          <p className="text-sm text-muted mt-0.5">
            {rows.length.toLocaleString("th-TH")} รายการ (จากทั้งหมด {counts.total.toLocaleString("th-TH")})
            {sp.status && (
              <>
                {" · "}
                <Link
                  href="/admin/forwarders?nofilter=1"
                  className="text-primary-600 hover:underline"
                  title="ล้างฟิลเตอร์เริ่มต้นตามบทบาท · แสดงรายการทั้งหมด"
                >
                  ดูทั้งหมด
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/admin/forwarders/bulk-search"
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium hover:bg-surface-alt"
          >
            🔍 ค้นหา tracking หลายเลข
          </Link>
          {/* Wave 11 — legacy "+ เพิ่มรายการให้ลูกค้า" (forwarder.php L758).
              Lands on the admin-initiated forwarder create flow ·
              currently /admin/forwarders/new = redirect to list ·
              full form is Wave 12 backlog (similar to wallet/add). */}
          <Link
            href="/admin/forwarders/new"
            className="rounded-lg border border-green-500 bg-green-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-600"
          >
            + เพิ่มรายการให้ลูกค้า
          </Link>
        </div>
      </div>

      {/* Wave 11 status banner — proactive transparency for ภูม.
          Per the 2026-05-23 design-philosophy learning: tell the operator
          which features are live vs deferred IN THE UI, don't make them
          discover by clicking. */}
      <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2.5 text-xs text-amber-800 flex items-start gap-2">
        <span aria-hidden>ℹ️</span>
        <div className="flex-1">
          <span className="font-medium">Wave 11 status:</span>{" "}
          ✅ 4 top tabs · 14-column legacy layout · ดู/อัปเดต links · product thumbnail ·
          source badges (users / admin_X / ระบบ) ·{" "}
          <span className="opacity-75">⏳ Wave 12: &ldquo;+ เพิ่มรายการให้ลูกค้า&rdquo; form ·
          slip upload (ต้อง Supabase Storage bucket จาก ก๊อต)</span>
        </div>
      </div>

      {/* Wave 11 — top tabs (4): ทั้งหมด · จากลูกค้า · จากระบบ · จากแอดมิน
          Legacy `forwarder.php` L267-280. Filter via ?create=. */}
      <div className="flex flex-wrap gap-0 border-b border-border -mx-1">
        {([
          { v: undefined, l: "ฝากนำเข้าทั้งหมด" },
          { v: "user",    l: "ฝากนำเข้าจากลูกค้า" },
          { v: "system",  l: "ฝากนำเข้าจากระบบ" },
          { v: "admin",   l: "ฝากนำเข้าจากแอดมิน" },
        ] as const).map((t) => {
          const params = new URLSearchParams();
          if (t.v) params.set("create", t.v);
          // preserve other filters across tab switches
          if (sp.status)    params.set("status", sp.status);
          if (sp.q)         params.set("q", sp.q);
          if (sp.date_from) params.set("date_from", sp.date_from);
          if (sp.date_to)   params.set("date_to", sp.date_to);
          if (sp.mode)      params.set("mode", sp.mode);
          if (service)      params.set("service", service);
          if (container)    params.set("container", container);
          if (sp.all)       params.set("all", sp.all);
          const href = `/admin/forwarders${params.size > 0 ? `?${params}` : ""}`;
          const active = (sp.create ?? "") === (t.v ?? "");
          return (
            <Link
              key={t.v ?? "all"}
              href={href}
              className={`mx-1 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? "border-primary-600 text-primary-700 bg-primary-50/50"
                  : "border-transparent text-muted hover:text-foreground hover:bg-surface-alt"
              }`}
            >
              {t.l}
            </Link>
          );
        })}
      </div>

      {/* Advanced search */}
      <Suspense>
        <ForwardersSearchBar />
      </Suspense>

      {forwarderErr && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          โหลดข้อมูลไม่สำเร็จ: {forwarderErr.message}
        </div>
      )}

      {/* Wave 18-B — Date-range filter (default last 30 days · matches
          legacy forwarder.php L318-323 "ผลลัพธ์การค้นหาย้อนหลัง 30 วัน").
          The `?all=1` escape hatch mirrors legacy's "ค้นหาข้อมูลทั้งหมด"
          button. Same pattern as `/admin/yuan-payments` (Wave 15 P0-2). */}
      <form className="flex gap-2 flex-wrap items-end" action="/admin/forwarders">
        {/* Preserve all other filter state across submit */}
        {sp.status    ? <input type="hidden" name="status"    value={sp.status} /> : null}
        {sp.q         ? <input type="hidden" name="q"         value={sp.q} /> : null}
        {sp.mode      ? <input type="hidden" name="mode"      value={sp.mode} /> : null}
        {sp.create    ? <input type="hidden" name="create"    value={sp.create} /> : null}
        {service      ? <input type="hidden" name="service"   value={service} /> : null}
        {container    ? <input type="hidden" name="container" value={container} /> : null}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-muted">ตั้งแต่</span>
          <input
            type="date"
            name="date_from"
            defaultValue={sp.date_from ?? (dateWindow.isDefault ? dateWindow.from ?? "" : "")}
            className="rounded-lg border border-border px-3 py-2 text-xs"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-muted">ถึง</span>
          <input
            type="date"
            name="date_to"
            defaultValue={sp.date_to ?? (dateWindow.isDefault ? dateWindow.to ?? "" : "")}
            className="rounded-lg border border-border px-3 py-2 text-xs"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-primary-500 text-white px-3 py-2 text-xs hover:bg-primary-600"
        >
          ค้นหาข้อมูล
        </button>
        {!dateWindow.isDefault && (
          <Link
            href="/admin/forwarders"
            className="rounded-lg border border-border bg-white text-foreground px-3 py-2 text-xs hover:bg-surface-alt self-end"
          >
            กลับ 30 วัน
          </Link>
        )}
        {dateWindow.isDefault && (
          <Link
            href="/admin/forwarders?all=1"
            className="rounded-lg border border-border bg-white text-foreground px-3 py-2 text-xs hover:bg-surface-alt self-end"
            title="แสดงทั้งหมด ไม่จำกัดช่วงวัน"
          >
            ค้นหาข้อมูลทั้งหมด
          </Link>
        )}
      </form>

      {/* Date-window status chip — explicit feedback for what's loaded.
          Mirrors legacy footer "ผลลัพธ์การค้นหา ..." (L352-355). */}
      <p className="text-[11px] text-muted">
        {dateWindow.isDefault ? (
          <>
            📅 แสดง <strong className="text-foreground">30 วันล่าสุด</strong> ({dateWindow.from} → {dateWindow.to}) ·{" "}
            <Link href="/admin/forwarders?all=1" className="text-primary-600 hover:underline">
              ค้นหาข้อมูลทั้งหมด
            </Link>
          </>
        ) : sp.all === "1" ? (
          <>
            📅 แสดง <strong className="text-foreground">ทั้งหมด</strong> ·{" "}
            <Link href="/admin/forwarders" className="text-primary-600 hover:underline">
              กลับ 30 วัน
            </Link>
          </>
        ) : (
          <>
            📅 ช่วง:{" "}
            <strong className="text-foreground">
              {dateWindow.from ?? "ตั้งแต่เริ่ม"} → {dateWindow.to ?? "ปัจจุบัน"}
            </strong>
          </>
        )}
      </p>

      {/* Segmented Control · ภูม brief 2026-05-21 — Cargo/Freight × FCL/LCL
          moved out of sidebar (4-leaf dropdown) into head-menu pills.
          Label-only filter for now (legacy tb_forwarder has no
          service/container columns). */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="text-muted font-medium">บริการ:</span>
        <SegmentedPills
          name="service"
          options={SERVICE_OPTIONS}
          current={service}
          sp={sp}
          serviceOverride={service}
          containerOverride={container}
        />
        <span className="text-muted font-medium ml-2">ตู้:</span>
        <SegmentedPills
          name="container"
          options={CONTAINER_OPTIONS}
          current={container}
          sp={sp}
          serviceOverride={service}
          containerOverride={container}
        />
      </div>

      {/* Status filter chips — legacy 10 tabs */}
      <div className="flex flex-wrap gap-2">
        {filterOpts.map((o) => {
          const params = new URLSearchParams();
          if (o.v)          params.set("status", o.v);
          if (sp.q)         params.set("q", sp.q);
          if (sp.date_from) params.set("date_from", sp.date_from);
          if (sp.date_to)   params.set("date_to", sp.date_to);
          if (sp.mode)      params.set("mode", sp.mode);
          if (service)      params.set("service", service);
          if (container)    params.set("container", container);
          if (sp.all)       params.set("all", sp.all);
          const href = `/admin/forwarders${params.size > 0 ? `?${params}` : ""}`;
          const active = (sp.status ?? "") === (o.v ?? "");
          return (
            <Link key={o.v ?? "all"} href={href}
              className={`rounded-full border px-3 py-1 text-xs whitespace-nowrap ${
                active ? "bg-primary-500 text-white border-primary-500" : "bg-white border-border hover:bg-surface-alt"
              }`}>
              {o.l} {o.n > 0 && <span className="ml-1 opacity-75">({o.n.toLocaleString("th-TH")})</span>}
            </Link>
          );
        })}
      </div>

      {/* Transport-mode chip strip — รถ/เรือ/แอร์ (ftransporttype 1/2/3) */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted font-medium">ขนส่ง:</span>
        {([undefined, "1", "2", "3"] as const).map((m) => {
          const params = new URLSearchParams();
          if (m)            params.set("mode", m);
          if (sp.status)    params.set("status", sp.status);
          if (sp.q)         params.set("q", sp.q);
          if (sp.date_from) params.set("date_from", sp.date_from);
          if (sp.date_to)   params.set("date_to", sp.date_to);
          if (service)      params.set("service", service);
          if (container)    params.set("container", container);
          if (sp.all)       params.set("all", sp.all);
          const href = `/admin/forwarders${params.size > 0 ? `?${params}` : ""}`;
          const active = (sp.mode ?? "") === (m ?? "");
          const label = m ? MODE_LABEL[m] : "ทุก mode";
          return (
            <Link key={m ?? "all"} href={href}
              className={`rounded-full border px-3 py-1 whitespace-nowrap ${
                active ? "bg-primary-500 text-white border-primary-500" : "bg-white border-border hover:bg-surface-alt"
              }`}>
              {label}
            </Link>
          );
        })}
      </div>

      {/* CSV export — current page (50 rows/page · honours all filters incl.
          status + mode + date window + service + container + keyword). The
          single biggest cargo surface; accounting + ops download per-status
          slices to hand to warehouse / driver / PEAK. Money cols always
          present (page-level gate already enforces super/ops/accounting). */}
      <div className="flex justify-end">
        <CsvButton
          rows={rows.map((r): CsvRow => ({
            id: r.id,
            f_no_cargo: r.f_no_cargo ?? "",
            status: STATUS_LABEL[r.status] ?? r.status,
            transport: MODE_LABEL[r.transport_type] ?? r.transport_type,
            warehouse_china: r.warehouse_china ?? "",
            partner_warehouse: r.partner_warehouse ?? "",
            cabinet: r.cabinet_number ?? "",
            tracking_chn: r.tracking_chn ?? "",
            tracking_th: r.tracking_th ?? "",
            userid: r.customer?.userid ?? "",
            customer: r.customer?.name ?? "",
            phone: r.customer?.phone ?? "",
            customer_flags: [
              r.customer?.is_juristic ? "นิติฯ" : "",
              r.customer?.is_corporate ? "นิติบุคคล" : "",
              r.customer?.is_svip ? "SVIP" : "",
              r.customer?.coid ?? "",
            ].filter(Boolean).join(" / "),
            sales_rep: r.customer?.sale_admin ?? "",
            amount_count: r.amount_count,
            weight_kg: r.weight_kg.toFixed(2),
            volume_cbm: r.volume_cbm.toFixed(4),
            total_price: r.total_price.toFixed(2),
            outstanding_thb: r.outstanding_thb.toFixed(2),
            paydeposit: r.paydeposit === "1" ? "ชำระแล้ว" : "",
            fcredit: r.fcredit === "1" ? "เครดิต" : "",
            created_at: r.created_at,
            date_status2: r.date_status2 ?? "",
            date_status3: r.date_status3 ?? "",
            date_status4: r.date_status4 ?? "",
            eta_base: r.eta_base ?? "",
            pallet: r.pallet ?? "",
            admin_id_last: r.admin_id_last ?? "",
            admin_creator: r.admin_creator ?? "",
            note: r.note ?? "",
          }))}
          cols={[
            { key: "id",                label: "Forwarder ID" },
            { key: "f_no_cargo",        label: "เลขที่ Cargo" },
            { key: "status",            label: "สถานะ" },
            { key: "transport",         label: "ขนส่ง" },
            { key: "warehouse_china",   label: "โกดังจีน" },
            { key: "partner_warehouse", label: "Partner Warehouse" },
            { key: "cabinet",           label: "หมายเลขตู้" },
            { key: "tracking_chn",      label: "Tracking จีน" },
            { key: "tracking_th",       label: "Tracking ไทย" },
            { key: "userid",            label: "รหัสลูกค้า" },
            { key: "customer",          label: "ชื่อลูกค้า" },
            { key: "phone",             label: "เบอร์โทร" },
            { key: "customer_flags",    label: "ประเภทลูกค้า" },
            { key: "sales_rep",         label: "เซลล์" },
            { key: "amount_count",      label: "จำนวน" },
            { key: "weight_kg",         label: "น้ำหนัก (KG)" },
            { key: "volume_cbm",        label: "ปริมาตร (CBM)" },
            { key: "total_price",       label: "ราคารวม (฿)" },
            { key: "outstanding_thb",   label: "ยอดค้างชำระ (฿)" },
            { key: "paydeposit",        label: "สถานะจ่ายมัดจำ" },
            { key: "fcredit",           label: "เครดิต" },
            { key: "created_at",        label: "วันที่สร้าง" },
            { key: "date_status2",      label: "ถึงโกดังจีน" },
            { key: "date_status3",      label: "ออกจากจีน" },
            { key: "date_status4",      label: "ถึงไทย" },
            { key: "eta_base",          label: "ETA ไทย" },
            { key: "pallet",            label: "Pallet" },
            { key: "admin_id_last",     label: "Admin ล่าสุด" },
            { key: "admin_creator",     label: "Admin สร้าง" },
            { key: "note",              label: "หมายเหตุ" },
          ]}
          filename={`forwarders${sp.status ? `-status${sp.status}` : ""}${sp.mode ? `-mode${sp.mode}` : ""}${sp.q ? `-${sp.q}` : ""}-page${page}-${new Date().toISOString().slice(0, 10)}.csv`}
        />
      </div>

      {/* Table */}
      <ForwardersTable
        rows={rows}
        statusLabel={STATUS_LABEL}
        modeLabel={MODE_LABEL}
        currentStatus={sp.status}
      />
      <Pagination
        page={page}
        pageSize={DEFAULT_PAGE_SIZE}
        total={totalForwarders}
        basePath="/admin/forwarders"
        params={{
          status: sp.status, q: sp.q, q_multi: sp.q_multi, create: sp.create,
          mode: sp.mode, date_from: sp.date_from, date_to: sp.date_to,
          service: sp.service, container: sp.container, all: sp.all,
        }}
      />
    </main>
    </>
  );
}

/**
 * Per-status counts (parallel head queries · global · independent of
 * keyword/date filters so badge counts stay stable while user types).
 *
 * Legacy did `SELECT COUNT(ID), fStatus FROM tb_forwarder GROUP BY fStatus`
 * in a single query; PostgREST has no GROUP BY in select so we run
 * one head query per status. 9 parallel HEAD queries × ~50ms each.
 */
async function loadStatusCounts(
  admin: ReturnType<typeof createAdminClient>,
  dateWindow: { from: string | null; to: string | null; isDefault: boolean },
) {
  // Wave 18-B — scope all count queries to the same date window the data
  // query uses, so badge numbers match what the user sees on screen.
  function applyDate<T extends { gte: (col: string, v: string) => T; lte: (col: string, v: string) => T }>(
    builder: T,
  ): T {
    let q = builder;
    if (dateWindow.from) q = q.gte("fdate", dateWindow.from);
    if (dateWindow.to)   q = q.lte("fdate", dateWindow.to + "T23:59:59");
    return q;
  }
  async function countFstatus(value: string): Promise<number> {
    const r = await applyDate(
      admin
        .from("tb_forwarder")
        .select("id", { count: "exact", head: true })
        .eq("fstatus", value),
    );
    return r.count ?? 0;
  }
  async function countCredit(): Promise<number> {
    const r = await applyDate(
      admin
        .from("tb_forwarder")
        .select("id", { count: "exact", head: true })
        .eq("fcredit", "1"),
    );
    return r.count ?? 0;
  }
  async function countTotal(): Promise<number> {
    const r = await applyDate(
      admin
        .from("tb_forwarder")
        .select("id", { count: "exact", head: true }),
    );
    return r.count ?? 0;
  }

  const [total, s1, s2, s3, s4, s5, s6, s7, credit, special] = await Promise.all([
    countTotal(),
    countFstatus("1"),
    countFstatus("2"),
    countFstatus("3"),
    countFstatus("4"),
    countFstatus("5"),
    countFstatus("6"),
    countFstatus("7"),
    countCredit(),
    countFstatus("99"),
  ]);

  return { total, s1, s2, s3, s4, s5, s6, s7, credit, special };
}

/** 2026-05-21 ภูม brief — Segmented Control component for service · container
 * pills. Renders an iOS-style pill group; one option active at a time.
 * Preserves all other URL params on navigation. */
function SegmentedPills({
  name,
  options,
  current,
  sp,
  serviceOverride,
  containerOverride,
}: {
  name: "service" | "container";
  options: ReadonlyArray<{ v: string | undefined; l: string }>;
  current: string | undefined;
  sp: SearchParams;
  serviceOverride: string | undefined;
  containerOverride: string | undefined;
}) {
  return (
    <div className="inline-flex rounded-full border border-border bg-white p-0.5 shadow-sm">
      {options.map((o) => {
        const params = new URLSearchParams();
        // Preserve current filter state EXCEPT for this dimension (override below).
        if (sp.status)    params.set("status", sp.status);
        if (sp.q)         params.set("q", sp.q);
        if (sp.date_from) params.set("date_from", sp.date_from);
        if (sp.date_to)   params.set("date_to", sp.date_to);
        if (sp.mode)      params.set("mode", sp.mode);
        if (sp.all)       params.set("all", sp.all);
        // Set both service + container — but override THIS dimension with o.v.
        const svc = name === "service"   ? o.v : serviceOverride;
        const con = name === "container" ? o.v : containerOverride;
        if (svc) params.set("service", svc);
        if (con) params.set("container", con);
        const href = `/admin/forwarders${params.size > 0 ? `?${params}` : ""}`;
        const active = (current ?? "") === (o.v ?? "");
        return (
          <Link
            key={o.v ?? "all"}
            href={href}
            className={`rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition ${
              active
                ? "bg-primary-500 text-white shadow"
                : "text-foreground hover:bg-surface-alt"
            }`}
          >
            {o.l}
          </Link>
        );
      })}
    </div>
  );
}
