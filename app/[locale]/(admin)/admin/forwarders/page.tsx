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
import { resolveBillingIdentity } from "@/lib/admin/customer-identity";
import { Link } from "@/i18n/navigation";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { isPurchaserScoped, canReassignPurchaser } from "@/lib/admin/purchaser-scope";
import { getStafferWorkspaceRole } from "@/lib/admin/positions";
import { listActiveAdmins, type SalesAdminOption } from "@/actions/admin/customer-profile";
import { ForwardersTable } from "./forwarders-table";
import { ForwardersSearchBar } from "./search-bar";
import { Suspense } from "react";
import { PageTopMenubar, type MenubarItem } from "@/components/admin/page-top-menubar";
import { fstatusVivid, fstatusTabBadge } from "@/lib/admin/forwarder-status";
import { PageHeader } from "@/components/admin/page-header";
import { resolveLegacyUrlMap } from "@/lib/storage/legacy-resolver";
import { parsePage, pageRange, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { calcForwarderOutstanding, isForwarderPaid } from "@/lib/forwarder/outstanding";
import { filterCountableForwarderRows, baseTracking } from "@/lib/admin/momo-bill-header";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { buildDefaultLandingRedirect } from "@/lib/admin/default-queue-filter";
import { exportForwardersAll } from "@/actions/admin/export/forwarders";
import { Explain, GUIDE } from "@/components/ui/tooltip";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────
// Page top-menubar — ภูม brief 2026-05-20 ค่ำ. Updated to use the legacy
// `?status=` filter keys (was `?q=` which collided with the keyword
// search box). The 10 status tabs render below; this menubar is just
// quick-jumps + work / barcode / search shortcuts.
// ─────────────────────────────────────────────────────────────────────
// Built per-request so the actionable queues carry a prominent notification
// badge (เลขแจ้งเตือนเด่นๆ · 2026-06-14). รอชำระ (status 5) + เตรียมส่ง (status 6 ·
// the dispatch queue) are the staff-action queues; the counts bubble up to the
// "ตามประเภท" top item so they're visible without opening the menu.
function buildForwarderMenubar(c: { s5: number; s6: number }): MenubarItem[] {
  return [
  { label: "หน้าหลัก", href: "/admin/forwarders" },
  {
    label: "ตามประเภท",
    children: [
      { label: "ทั้งหมด",   href: "/admin/forwarders" },
      { label: "รอชำระเงิน", href: "/admin/forwarders?status=5", badge: c.s5 },
      { label: "เตรียมส่ง", href: "/admin/forwarders?status=6", badge: c.s6 },
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
      // 2026-06-30 (gap G7) — คิวพัสดุมีปัญหา (ของแตก/ไม่ใช่ของลูกค้า/ตู้ตีกลับ/ติดด่าน/PR สลับ).
      { label: "⚠️ พัสดุมีปัญหา",          href: "/admin/forwarders/exceptions" },
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
      // ภูม 2026-07-22 — ลบ "รหัสเดียว" (?focus=search) ทิ้ง · มันไม่ทำอะไร (ไม่มีตัวอ่าน
      // focus) · ช่องค้นหาเลขเดียวมีอยู่บนหน้าอยู่แล้ว. เหลือ "หลายรหัส" (bulk-search) ที่ใช้ได้.
      { label: "หลายรหัส",     href: "/admin/forwarders/bulk-search" },
    ],
  },
  ];
}

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

export type SearchParams = {
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
  nofilter?: string;    // clears the role default-queue redirect
  purchaser?: string;   // owner ④ — filter by assigned ผู้สั่งซื้อ (tb_admin.adminID)
  filter?: string;      // "note" = เฉพาะรายการที่มีหมายเหตุ (sidebar หมายเหตุนำเข้า)
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
  fwidth: number | null;
  flength: number | null;
  fheight: number | null;
  famount: number | null;
  famountcount: string | null;   // CBM-multiplier mode flag ('1' = fvolume is already total · ≠1 = per-box, ×boxes)
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
  paymethod: string | number | null;          // D1 — '2'=COD → exclude domestic leg from ยอดค้าง
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
  fcabinet_locked: boolean | null;    // #259 Option B — cabinet manual-lock flag
  tax_doc_pref: string | null;        // Lane B — ใบกำกับ/ใบขน/ไม่รับเอกสาร (mig 0127)
  // 2026-07-06 (ภูม · legacy fidelity) — extra list-cell fields (legacy forwarder.php)
  fshipby: string | null;             // TH-delivery carrier code · nameShipBy()
  fproductstype: string | null;       // product type · nameProductsType() 1-4
  adminidpurchaser: string | null;    // owner ④ — assigned ผู้สั่งซื้อ (tb_admin.adminID)
  // 2026-07-07 — credit-tab AR columns (legacy forwarder.php q=='c' L688-691)
  fdatestatus5: string | null;        // legacy fDateStatus5 · วันที่ให้เครดิต
  fcreditdate: string | null;         // legacy fCreditDate · วันที่ครบกำหนด
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
  userCreditValue: number | string | null;  // CUSTTAG — วงเงินเครดิต (THB)
  userCreditDate: number | string | null;   // CUSTTAG — เทอมเครดิต (วัน)
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
  amount_count_flag: string | null; // famountcount — CBM ×boxes mode ('1' = fvolume already total · DISPLAY ONLY, mirrors cbmTotal())
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
  // 2026-07-07 — credit-tab AR columns (legacy forwarder.php q=='c') · display only
  credit_date_granted: string | null; // legacy fdatestatus5 · วันที่ให้เครดิต
  credit_due_date: string | null;     // legacy fcreditdate · วันที่ครบกำหนด
  // 2026-07-07 — fstatus='6' + open driver item (fdistatus='') → กำลังจัดส่ง pill
  driverOpen: boolean;
  paydeposit: string | null;   // '1' = paid · null/'' = ยอดค้างชำระ remaining
  note: string | null;
  /** 2026-07-06 — legacy fproductstype · nameProductsType 1=ทั่วไป 2=มอก. 3=อย. 4=พิเศษ */
  products_type: string | null;
  /** 2026-07-06 — legacy fshipby · TH-delivery carrier code · nameShipBy label */
  ship_by: string | null;
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
  /** #259 Option B — true when admin has manually locked the cabinet number.
   * Partner syncs (MOMO/CTT) will not overwrite it while locked. */
  cabinet_locked: boolean;
  /** Lane B — the customer's tax-document choice (tb_forwarder.tax_doc_pref ·
   * raw 'tax_invoice'|'customs'|'receipt'|null). Rendered as <TaxDocBadge>. */
  tax_doc_pref: string | null;
  /** 2026-06-12 (พี่ป๊อป) — dimensions (cm) + MOMO CG_NO for the group
   * breakdown (mirrors forwarders-table.tsx Row). */
  width_cm: number | null;
  length_cm: number | null;
  height_cm: number | null;
  cg_no: string | null;
  // owner ④ (mig 0241) — assigned ผู้สั่งซื้อ (per-order).
  assigned_purchaser_id: string;          // tb_admin.adminID · "" = ยังไม่มอบหมาย
  assigned_purchaser_name: string | null; // resolved display name
  customer: {
    userid: string;
    name: string;
    /** Contact-person sub-line when name=company (juristic). "" otherwise. */
    contact_name: string;
    phone: string;
    // Wave 18-B — VIP/SVIP/SaleAdmin badge inputs
    coid: string;              // 'PCS'/'STAR'/'DIAMOND'/'CROWN'/etc
    is_svip: boolean;          // row in tb_rate_custom_cbm
    is_corporate: boolean;     // row in tb_corporate
    is_comparison: boolean;    // tb_users.usercomparison='1'
    is_juristic: boolean;      // tb_users.usercompany='1'
    credit_limit: number;      // CUSTTAG — tb_users.userCreditValue (วงเงิน · >0 = ลูกค้าเครดิต)
    credit_days: number;       // CUSTTAG — tb_users.userCreditDate (เทอม วัน)
    sale_admin: string | null; // tb_users.adminidsale
  } | null;
};

export default async function AdminForwardersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  // W-1 (gap-admin H-1): page-level role gate. Lists every customer's
  // import orders + prices via createAdminClient (RLS-bypass) — ops
  // (runs the orders) + accounting (bills them).
  // 2026-06-08 (ภูม warehouse-handoff readiness): added "warehouse" — the
  // legacy `pcs-admin/forwarder.php` list IS the warehouse role's daily
  // landing page (sidebar-menu.ts:1023-1027 menuWarehouse exposes it as the
  // forwarder.search + forwarder.listAll leaves). Without "warehouse" here
  // the page 404'd via requireAdmin's notFound() on any non-super warehouse
  // login — sidebar showed the link, click landed on 404.
  // 2026-07-06 (owner ④ · mig 0241) — `purchaser` + `purchaser_lead` reach this
  // list too. A `purchaser`-only viewer is HARD-SCOPED to their own assigned
  // orders (isPurchaserScoped); others see all + a ผู้สั่งซื้อ filter.
  const { user, roles } = await requireAdmin([
    "ops",
    "sales",
    "accounting",
    "warehouse",
    "purchaser",
    "purchaser_lead",
    // driver — sidebar ของคนขับโชว์ลิงก์ "หมายเหตุนำเข้า" (มาที่นี่ผ่าน ?filter=note)
    // ตาม legacy PCS ที่ warehouse/driver เห็นหน้าหมายเหตุนำเข้าได้ → ต้องเข้าถึงได้
    // ไม่งั้น notFound()=404 (owner 2026-07-24 · §0d reachability).
    "driver",
  ]);

  const sp = await searchParams;

  // ── Per-order purchaser scope (owner ④ · workspace-driven · mig 0242) ────
  // Purchaser work-function is assigned via the POSITION (workspace_role), not
  // the money-tier role — resolve the viewer's workspace once. user.id = profile id.
  const viewerWorkspaceRole = await getStafferWorkspaceRole(user.id);
  const purchaserScoped = isPurchaserScoped(viewerWorkspaceRole, roles);
  const canReassignPurchaserRole = canReassignPurchaser(viewerWorkspaceRole, roles);
  const admin0 = createAdminClient();
  const ownAdminId = await resolvePurchaserAdminId(admin0, user.email);
  let purchaserAdmins: SalesAdminOption[] = [];
  if (canReassignPurchaserRole) {
    const res = await listActiveAdmins();
    if (res.ok) purchaserAdmins = res.data?.rows ?? [];
  }
  const purchaserFilter = purchaserScoped ? undefined : sp.purchaser?.trim() || undefined;
  const purchaserScope = purchaserScoped ? ownAdminId : purchaserFilter ?? null;

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
  const page = parsePage(sp.page);

  // ─── Main fetch + shaping (extracted to fetchForwarderList) ───────────
  // The page-rendered window AND the "export ทั้งหมด" CSV path both run the
  // SAME filtered query via fetchForwarderList — guaranteeing the export
  // mirrors exactly what's on screen (only pagination differs). See the
  // function below + actions/admin/export/forwarders.ts.
  const { rows, totalForwarders, forwarderErr } = await fetchForwarderList(
    admin,
    sp,
    dateWindow,
    { page, purchaserScope },
  );

  // ─── Per-tab counts (head queries against tb_forwarder) ──────────────
  // We run these in parallel; each returns the count for that status
  // code (scoped to the SAME date window as the data query so the badges
  // reflect what's on screen · Wave 18-B fidelity backfill).
  const counts = await loadStatusCounts(admin, dateWindow, purchaserScope);

  // ภูม 2026-07-22 — นับ "ชิปเม้น" บนหน้านี้ (baseTracking+userid) ให้ตรงกับ badge ที่นับ
  // ชิปเม้น · กล่องแตก -N/M นับก้อนเดียว (เช่น 52643 4 แทรค = 1 ชิปเม้น).
  const pageShipmentCount = new Set(
    rows.map((r) => `${baseTracking(r.tracking_chn) ?? `_${r.id}`}|${(r.customer?.userid ?? "").trim()}`),
  ).size;

  const filterOpts: { v: string | undefined; l: string; n: number }[] = [
    { v: undefined, l: "ทั้งหมด", n: counts.total },
    { v: "1",   l: STATUS_LABEL["1"]!,   n: counts.s1 },
    { v: "2",   l: STATUS_LABEL["2"]!,   n: counts.s2 },
    { v: "3",   l: STATUS_LABEL["3"]!,   n: counts.s3 },
    { v: "4",   l: STATUS_LABEL["4"]!,   n: counts.s4 },
    { v: "5",   l: STATUS_LABEL["5"]!,   n: counts.s5 },
    { v: "6",   l: STATUS_LABEL["6"]!,   n: counts.s6 },
    { v: "6.1", l: STATUS_LABEL["6.1"]!, n: counts.s6driver },
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
  // note-mode (?filter=note) → หัวข้อ "หมายเหตุนำเข้า" + banner (ดูข้อความ ↓)
  const noteOnly = sp.filter === "note";
  const headerSuffix = [noteOnly ? "หมายเหตุ" : null, serviceLabel, containerLabel].filter(Boolean).join(" · ");

  return (
    <>
      <PageTopMenubar items={buildForwarderMenubar(counts)} activeHref="/admin/forwarders" />
      <main className="p-6 lg:p-8 space-y-5">
      {/* §0h — one consistent page-title hierarchy via <PageHeader>: red eyebrow →
          big bold H1 → muted subtitle (count + ดูทั้งหมด), action buttons on the
          right. Display-only swap; same content + behaviour as the prior ad-hoc
          <p>ADMIN</p><h1> markup. */}
      <PageHeader
        eyebrow="ADMIN · ฝากนำเข้า"
        title={`รายการนำเข้า${headerSuffix ? ` · ${headerSuffix}` : ""}`}
        subtitle={
          <>
            <span className="font-semibold text-foreground">{pageShipmentCount.toLocaleString("th-TH")}</span> ชิปเม้น
            {" "}(จากทั้งหมด {counts.total.toLocaleString("th-TH")})
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
          </>
        }
        actions={
          <>
            {noteOnly && (
              <Link
                href="/admin/forwarders"
                className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                title="กำลังกรองเฉพาะรายการที่มีหมายเหตุ — กดเพื่อดูทั้งหมด"
              >
                📝 เฉพาะที่มีหมายเหตุ · × ดูทั้งหมด
              </Link>
            )}
            <Link
              href="/admin/forwarders/bulk-search"
              className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium hover:bg-surface-alt"
            >
              🔍 ค้นหา tracking หลายเลข
            </Link>
            {/* Wave 11 — legacy "+ เพิ่มรายการให้ลูกค้า" (forwarder.php L758).
                Lands on the admin-initiated forwarder create flow ·
                currently /admin/forwarders/new = redirect to list ·
                full form is Wave 12 backlog (similar to wallet/add).
                2026-06-07 ภูม flag: เพิ่มปุ่ม bulk-add คู่กัน. */}
            <Link
              href="/admin/forwarders/new"
              className="rounded-lg border border-green-500 bg-green-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-600"
            >
              + เพิ่มรายการ (เดี่ยว)
            </Link>
            <Link
              href="/admin/forwarders/new-bulk"
              className="rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 inline-flex items-center gap-1"
            >
              📦 เพิ่มหลายรายการ
              <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[11px] font-medium">ใหม่</span>
            </Link>
          </>
        }
      />

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

      {/* 2026-06-09 (ภูม flag) — Advanced search MOVED DOWN to the same row
          as the CSV-export buttons (see the wrapper around <CsvButton> below).
          One row: search on the left, "CSV หน้านี้" + "CSV ทั้งหมด" on the
          right. Staff scan + filter + export in one glance. */}

      {/* owner ④ — ผู้สั่งซื้อ filter (non-scoped viewers only; a scoped
          purchaser is already locked to their own). GET form preserves the
          key filters via hidden inputs; "" = ทั้งหมด. */}
      {!purchaserScoped && canReassignPurchaserRole && purchaserAdmins.length > 0 && (
        <form method="GET" action="/admin/forwarders" className="flex items-center gap-2">
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          {sp.q && <input type="hidden" name="q" value={sp.q} />}
          {sp.create && <input type="hidden" name="create" value={sp.create} />}
          {sp.mode && <input type="hidden" name="mode" value={sp.mode} />}
          {sp.date_from && <input type="hidden" name="date_from" value={sp.date_from} />}
          {sp.date_to && <input type="hidden" name="date_to" value={sp.date_to} />}
          {sp.all && <input type="hidden" name="all" value={sp.all} />}
          <label className="text-[11px] text-muted">ผู้สั่งซื้อ:</label>
          <select
            name="purchaser"
            defaultValue={purchaserFilter ?? ""}
            aria-label="กรองตามผู้สั่งซื้อ"
            className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-xs"
          >
            <option value="">ผู้สั่งซื้อทั้งหมด</option>
            {purchaserAdmins.map((a) => (
              <option key={a.adminID} value={a.adminID}>
                {a.name}
                {a.nickname ? ` (${a.nickname})` : ""}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded border border-border bg-white px-2 py-1.5 text-xs hover:bg-surface-alt"
          >
            กรอง
          </button>
        </form>
      )}

      {forwarderErr && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          โหลดข้อมูลไม่สำเร็จ: {forwarderErr.message}
        </div>
      )}

      {/* 2026-06-09 (ภูม flag) — Wave 18-B duplicate date-range form REMOVED.
          ForwardersSearchBar above already owns date_from/date_to + ค้นหา;
          this form duplicated those fields. Escape hatches "กลับ 30 วัน" /
          "ค้นหาข้อมูลทั้งหมด" are preserved as compact links inside the chip
          immediately below — same behavior, no double UI. */}
      <form className="hidden" action="/admin/forwarders">
        {/* Preserve all other filter state across submit */}
        {sp.status    ? <input type="hidden" name="status"    value={sp.status} /> : null}
        {sp.q         ? <input type="hidden" name="q"         value={sp.q} /> : null}
        {sp.mode      ? <input type="hidden" name="mode"      value={sp.mode} /> : null}
        {sp.create    ? <input type="hidden" name="create"    value={sp.create} /> : null}
        {service      ? <input type="hidden" name="service"   value={service} /> : null}
        {container    ? <input type="hidden" name="container" value={container} /> : null}
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-muted">ตั้งแต่</span>
          <input
            type="date"
            name="date_from"
            defaultValue={sp.date_from ?? (dateWindow.isDefault ? dateWindow.from ?? "" : "")}
            className="rounded-lg border border-border px-3 py-2 text-xs"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-muted">ถึง</span>
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

      {/* Status filter tabs — legacy 10 tabs · owner 2026-06-23: เด่นๆ — bigger,
         bold, the ACTIVE tab takes its own VIVID status colour (same palette as the
         end-of-row pill) so the current queue reads at a glance. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-muted mr-0.5 inline-flex items-center gap-1">
          <Explain def="กรองรายการตามสถานะการเดินทาง/การเงิน — 1 รอเข้าโกดังจีน → 4 ถึงไทย → 5 รอชำระเงิน → 6 เตรียมส่ง → 7 ส่งแล้ว · เครดิต/พิเศษ = ลานพิเศษ" label="สถานะ:" />
        </span>
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
          const activeCls = o.v && /^[1-7]$/.test(o.v) ? fstatusVivid(o.v) : "bg-primary-600 text-white";
          // Every tab carries a COLOURED count pill (faithful to legacy PCS
          // pcs-badge-{color} · ภูม 2026-07-10). On the active (vivid-filled) tab
          // the pill turns translucent-white so it stays readable on the fill.
          const badgeCls = active ? "bg-white/25 text-white" : fstatusTabBadge(o.v);
          return (
            <Link key={o.v ?? "all"} href={href}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap transition ${
                active
                  ? `${activeCls} shadow-md ring-2 ring-black/10`
                  : "bg-white border border-border text-foreground hover:bg-surface-alt hover:border-primary-300"
              }`}>
              {o.l}
              <span className={`inline-flex min-w-[1.35rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none ${badgeCls}`}>
                {o.n.toLocaleString("th-TH")}
              </span>
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
          present (page-level gate already enforces super/ops/accounting).
          2026-06-09 (ภูม flag) — paired with the Advanced search bar in one
          row so staff have search + export in a single glance. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 min-w-[280px]">
          <Suspense>
            <ForwardersSearchBar />
          </Suspense>
        </div>
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
              r.customer?.is_svip ? "เรทเฉพาะตัว" : "",
              r.customer?.coid ?? "",
            ].filter(Boolean).join(" / "),
            sales_rep: r.customer?.sale_admin ?? "",
            amount_count: r.amount_count,
            weight_kg: r.weight_kg.toFixed(2),
            volume_cbm: r.volume_cbm.toFixed(4),
            total_price: r.total_price.toFixed(2),
            outstanding_thb: r.outstanding_thb.toFixed(2),
            // ชำระแล้ว label (2026-07-08 · display-only) — MUST stay byte-for-byte
            // identical to actions/admin/export/forwarders.ts L148: a slip-paid
            // row (fstatus 6/7 · paydeposit="") is paid too. LABEL ONLY.
            paydeposit: (r.paydeposit === "1" || Number(r.status) >= 6) ? "ชำระแล้ว" : "",
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
          fetchAll={async () => {
            "use server";
            // Export EVERY filtered row (all pages, capped) — reuses the page's
            // exact filtered query via fetchForwarderList({ exportAll: true })
            // and audits the PII/money walk-off in admin_export_log.
            return exportForwardersAll({
              status: sp.status,
              q: sp.q,
              q_multi: sp.q_multi,
              create: sp.create,
              mode: sp.mode,
              date_from: sp.date_from,
              date_to: sp.date_to,
              service,
              container,
              all: sp.all,
              // owner ④ — a scoped purchaser can't reach this action (404); a
              // non-scoped viewer's ?purchaser= filter is honored in the export.
              purchaser: purchaserFilter,
            });
          }}
          filename={`forwarders${sp.status ? `-status${sp.status}` : ""}${sp.mode ? `-mode${sp.mode}` : ""}${sp.q ? `-${sp.q}` : ""}-page${page}-${new Date().toISOString().slice(0, 10)}.csv`}
        />
      </div>

      {/* Table */}
      <ForwardersTable
        rows={rows}
        statusLabel={STATUS_LABEL}
        modeLabel={MODE_LABEL}
        currentStatus={sp.status}
        isUltra={roles.includes("ultra")}
        canReassignPurchaser={canReassignPurchaserRole}
        purchaserAdmins={purchaserAdmins}
      />

      {/* Wave 7 — per-page money-sum footer (faithful: legacy admin lists
          render Σ totals at the bottom of the table). Page-scoped — sums
          ONLY the rows fetched for the current page (`rows`), so it matches
          exactly what's on screen above. We sum the SAME per-row values the
          table renders: outstanding_thb (ยอดค้างชำระ · the table's money
          column · via calcForwarderOutstanding) + total_price (ราคารวม) +
          weight/boxes. Labeled "รวมหน้านี้" to be honest about the scope
          (this is NOT a full-table aggregate). */}
      {rows.length > 0 && (() => {
        // ภูม 2026-07-22 — Σ กล่อง/น้ำหนัก/เงิน คิดจาก "แถวที่นับได้" (ตัดหัวบิล MOMO ของ
        // ชิปเม้นที่แตกกล่อง เหมือนตารางด้านบน countableGroupMembers) ไม่งั้นกล่อง+น้ำหนักนับ
        // ซ้ำหัวบิล (6+6=12). money ปลอดภัยอยู่แล้ว (หัวบิล ftotalprice=0) แต่รวมในชุดเดียวกัน
        // เพื่อความสอดคล้อง. filter จัดกลุ่มด้วย (baseTracking, userid) เองแบบเดียวกับตาราง.
        const countable = filterCountableForwarderRows(rows, {
          tracking: (r) => r.tracking_chn,
          weight: (r) => r.weight_kg,
          userid: (r) => r.customer?.userid ?? "",
          money: (r) => r.total_price,
        });
        const sumOutstanding = countable.reduce((s, r) => s + (r.outstanding_thb || 0), 0);
        const sumTotalPrice = countable.reduce((s, r) => s + (r.total_price || 0), 0);
        const sumWeight = countable.reduce((s, r) => s + (r.weight_kg || 0), 0);
        const sumBoxes = countable.reduce((s, r) => s + (r.amount_count || 0), 0);
        return (
          <div className="rounded-lg border border-border bg-surface-alt/60 px-4 py-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm">
            <span className="font-medium text-muted">
              รวมหน้านี้ · {pageShipmentCount.toLocaleString("th-TH")} ชิปเม้น
              {sumBoxes > 0 && (
                <> · {sumBoxes.toLocaleString("th-TH")} กล่อง</>
              )}
              {sumWeight > 0 && (
                <> · {sumWeight.toLocaleString("th-TH", { maximumFractionDigits: 2 })} Kg</>
              )}
            </span>
            <span className="flex flex-wrap items-center gap-x-6 gap-y-1">
              <span className="text-muted">
                ราคารวม{" "}
                <strong className="text-foreground">
                  ฿{sumTotalPrice.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
              </span>
              <span className="text-muted inline-flex items-center gap-1">
                <Explain def={GUIDE.outstanding_net} label="ยอดค้างชำระ" />{" "}
                <strong className={sumOutstanding > 0 ? "text-red-600" : "text-foreground"}>
                  ฿{sumOutstanding.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
              </span>
            </span>
          </div>
        );
      })()}

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
 * Safety cap for the "export ทั้งหมด" CSV path (owner directive 2026-06-07).
 * 10,000 comfortably covers any single filtered slice (a status tab / date
 * window) while bounding the in-memory build + signed-URL resolve. When a
 * slice would exceed this the export flags `truncated` so the operator knows
 * to narrow the filter.
 */
export const FORWARDER_EXPORT_CAP = 10000;

/**
 * The ONE filtered fetch + row-shape used by BOTH the on-screen page window
 * and the "export ทั้งหมด" CSV path. Parameterise with `opts.page` for the
 * 50-row display window, or `opts.exportAll` for the full capped slice. Every
 * filter (date window · create tab · status 1..7/6/6.1/c/p · transport mode ·
 * keyword q / q_multi · customer-name prefetch) is IDENTICAL on both paths —
 * the only difference is the row window. This guarantees the export mirrors
 * exactly what the page shows (no drift).
 *
 * Note: `coverUrl` (signed Supabase URLs) is only resolved on the page-window
 * path — the CSV export does not emit cover images, so we skip that work when
 * `exportAll` is set.
 */
export async function fetchForwarderList(
  admin: ReturnType<typeof createAdminClient>,
  sp: SearchParams,
  dateWindow: { from: string | null; to: string | null; isDefault: boolean },
  // owner ④ — `purchaserScope` (a tb_admin.adminID or null) hard-filters the list
  // to that assigned purchaser's orders. null = no scope (see all).
  opts: { page?: number; exportAll?: boolean; purchaserScope?: string | null },
): Promise<{ rows: Row[]; totalForwarders: number; forwarderErr: { message: string } | null }> {
  const exportAll = opts.exportAll === true;
  const purchaserScope = opts.purchaserScope && opts.purchaserScope !== "" ? opts.purchaserScope : null;

  // ─── Pagination (2026-06-04) ──────────────────────────────────────────
  // This list has THREE post-fetch filters that shrink rows AFTER the DB
  // fetch: the 6-vs-6.1 driver-item split, and the q / q_multi keyword
  // filters (which also match the JS-joined customer name/phone). When any
  // of those is active a DB count:exact would over-count vs what's rendered,
  // so we client-slice (fetch the bounded filtered set + slice + total =
  // filtered length). On the common path (no search, status ≠ 6/6.1) there
  // is NO post-fetch shrink → we use the efficient DB count:exact + .range.
  const page = opts.page ?? 1;
  const { from, to } = pageRange(page);
  const hasPostFetchFilter = !!(sp.q || sp.q_multi || sp.status === "6" || sp.status === "6.1");

  // ?filter=note — "หมายเหตุนำเข้า" (sidebar). Faithful to legacy
  // forwarder-action.php?action=Note = the SAME rich forwarder list, filtered
  // to rows carrying a note (fnote). Owner 2026-07-24: the plain /forwarders/notes
  // page → reuse this full rich list instead.
  const noteOnly = sp.filter === "note";

  // ─── Main query against tb_forwarder ──────────────────────────────────
  // Note: PostgREST cannot reliably auto-join the legacy `tb_users` table
  // (the FK is by `userid` text not a true relational FK). We pull the
  // forwarder rows here, then fetch matching tb_users rows in a 2nd query.
  let q = admin
    .from("tb_forwarder")
    .select(
      "id,fdate,fstatus,ftransporttype,fwarehousechina,fwarehousename," +
      "fcabinetnumber,ftrackingchn,ftrackingth,fidorco,userid,fnote,fcover," +
      "fweight,fvolume,famount,famountcount,ftotalprice,fcosttotalprice," +
      // 2026-06-12 (พี่ป๊อป) — physical dimensions for the group breakdown (ก×ย×ส)
      "fwidth,flength,fheight," +
      "faddressname,faddresslastname,faddresszipcode,fcredit,fdetail," +
      // Wave 11 fidelity port — extra cols for the legacy 12-column layout
      "adminidcreator,reforder,fdatestatus2,fdatestatus3,fdatestatus4," +
      "fdateadminstatus,adminid,paydeposit," +
      // Wave 15 P0-3 — extra cols required by calcForwarderOutstanding()
      // (port of legacy calPriceForwarderMain · shows ยอดค้างชำระ in the list)
      // D1 (2026-07-13) — paymethod: a COD (ปลายทาง) row's ftransportprice is the
      // at-door leg the courier collects → EXCLUDE it from ยอดค้าง (no double-count).
      "fpriceupdate,ftransportprice,fshippingservice,pricecrate,paymethod," +
      "ftransportpricechnthb,priceother,fdiscount,fusercompany,adminidkey," +
      // Wave 18-B — 7-col fidelity backfill (print badges · car on/off ·
      // ETA base date · pallet code · all from legacy forwarder.php L575-653).
      "printstatus1,printstatus2,printstatus3,printstatus4," +
      "fstatuscaron,fstatuscaroff,fdatetothai,fpallet," +
      // #259 Option B — cabinet lock flag (mig 0150)
      "fcabinet_locked," +
      // 2026-06-11 (Lane B · doc-choice visibility) — the customer's tax-document
      // choice for the new "เอกสาร" column (idx_tb_forwarder_tax_doc_pref · 0127).
      "tax_doc_pref," +
      // 2026-07-06 (ภูม · legacy fidelity) — TH-delivery carrier (nameShipBy) +
      // product type (nameProductsType) for the list cells, like legacy
      // forwarder.php L622 (ประเภท) / L656 (nameShipBy above เลขพัสดุไทย).
      "fshipby,fproductstype," +
      // owner ④ (mig 0241) — assigned ผู้สั่งซื้อ (per-order).
      "adminidpurchaser," +
      // 2026-07-07 — credit-tab AR columns (legacy forwarder.php q=='c') · read-only.
      "fdatestatus5,fcreditdate",
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
  // ภูม 2026-07-22 — ค้นหา "หลายเลข" (q_multi · ปุ่มบน search-bar) ก็ต้องข้ามกรอบ 30 วัน
  // เหมือนค้นเลขเดียว (sp.q) — ไม่งั้นเลขที่เก่ากว่า 30 วันหาไม่เจอ (คืนค่าว่างเงียบๆ · บั๊ก
  // คลาสเดียวกับที่เคยแก้ให้ sp.q แต่ลืมต่อยอดมา q_multi).
  // note-mode ก็ข้ามกรอบ 30 วันเหมือนการค้นหา — หมายเหตุเก่ากว่า 30 วันต้องเห็นด้วย
  // (เหมือนหน้า /forwarders/notes เดิมที่ไม่จำกัดช่วงเวลา).
  const skipDateWindow = !!(
    (sp.q && sp.q.trim().length > 0) || (sp.q_multi && sp.q_multi.trim().length > 0) || noteOnly
  );
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
  // Compute the open-driver-item set on every view that could contain a
  // fstatus='6' row (so the per-row "กำลังจัดส่ง" pill + the 6.1 badge are
  // correct on the all/credit/search views too), skipping only the pure
  // single-status tabs that can't hold a '6' (1-5,7) and the '99' special
  // lane. This does NOT change the 6/6.1 filter logic below — it only widens
  // WHEN the set is populated.
  const needsDriverSet = sp.status !== "p" && !/^[1-57]$/.test(sp.status ?? "");
  if (needsDriverSet) {
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

  // note-mode — เฉพาะแถวที่มีหมายเหตุนำเข้า (fnote). neq. ตัดทั้ง NULL และ ''
  // (marker "ไม่มีหมายเหตุ" ของ legacy) ให้เอง.
  if (noteOnly) q = q.neq("fnote", "");

  // ── Per-order purchaser scope (owner ④) ─────────────────────────────────
  // A `purchaser`-only viewer is hard-scoped to their own assigned orders; a
  // non-scoped viewer may filter by ?purchaser=. Both resolve to purchaserScope.
  if (purchaserScope) q = q.eq("adminidpurchaser", purchaserScope);

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

  // Window the fetch:
  //   export-all → one capped page (FORWARDER_EXPORT_CAP rows, no .range());
  //   common page → DB .range() (one 50-row window);
  //   post-fetch-filter page → bounded cap, then JS-filter + slice below.
  // The post-fetch-filter path keeps its 2000-row scan cap on the page; for
  // export-all we raise the scan to the export cap so the full filtered set
  // is collected before the JS keyword/6.1 filter runs.
  if (exportAll) {
    q = q.limit(FORWARDER_EXPORT_CAP);
  } else if (hasPostFetchFilter) {
    q = q.limit(2000);
  } else {
    q = q.range(from, to);
  }

  const { data: forwarderRows, error: forwarderErrRaw, count: forwarderCount } = await q;
  const forwarderErr = forwarderErrRaw ? { message: forwarderErrRaw.message } : null;
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
  // Company name per juristic userid (2026-07-03) — the header/list shows the
  // COMPANY (was leaking the contact person). Same batched corp query, widened.
  const corpNameByUser = new Map<string, string>();
  if (uniqueUserIds.length > 0) {
    const [userRowsRes, svipRowsRes, corpRowsRes] = await Promise.all([
      admin
        .from("tb_users")
        .select(
          "userID,userName,userLastName,userTel,coID,userComparison,userCompany,userCreditValue,userCreditDate,adminIDSale",
        )
        .in("userID", uniqueUserIds),
      admin
        .from("tb_rate_custom_cbm")
        .select("userid")
        .in("userid", uniqueUserIds),
      admin
        .from("tb_corporate")
        .select("userid, corporatename, corporatenumber")
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
    const corpRows = (corpRowsRes.data ?? []) as unknown as {
      userid: string;
      corporatename: string | null;
    }[];
    corporateUserIds = new Set(corpRows.map((r) => r.userid).filter(Boolean));
    for (const c of corpRows) {
      const nm = (c.corporatename ?? "").trim();
      if (c.userid && nm) corpNameByUser.set(c.userid, nm);
    }
  }

  // ── owner ④ — resolve assigned-purchaser (ผู้สั่งซื้อ) names ──────────────
  const purchaserNameById = new Map<string, string>();
  const purchaserIds = Array.from(
    new Set(raw.map((r) => (r.adminidpurchaser ?? "").trim()).filter((v) => v !== "")),
  );
  if (purchaserIds.length > 0) {
    const { data: padminRows, error: padminErr } = await admin
      .from("tb_admin")
      .select("adminID, adminName, adminLastName, adminNickname")
      .in("adminID", purchaserIds);
    if (padminErr) {
      console.error("[forwarders purchaser-name join] failed", { error: padminErr.message });
    }
    for (const a of (padminRows ?? []) as unknown as Array<{
      adminID: string;
      adminName: string | null;
      adminLastName: string | null;
      adminNickname: string | null;
    }>) {
      const nm = `${a.adminName ?? ""} ${a.adminLastName ?? ""}`.trim() || a.adminNickname || a.adminID;
      if (a.adminID) purchaserNameById.set(a.adminID, nm);
    }
  }

  // Shape into our Row type for the table.
  let rows: Row[] = raw.map((r) => {
    const user = usersByUserId.get(r.userid);
    // Juristic-aware name via the shared SOT: COMPANY for a นิติบุคคล, else the
    // person (was leaking the contact person for a company). 2026-07-03.
    const corpName = corpNameByUser.get(r.userid) ?? null;
    const identity = resolveBillingIdentity({
      userCompany: user?.userCompany,
      userName: user?.userName,
      userLastName: user?.userLastName,
      corp: corpName
        ? { corporatename: corpName, corporatenumber: null, corporateaddress: null }
        : null,
    });
    const name = user ? identity.name : "";
    const contactName =
      identity.isJuristic && identity.personName && identity.personName !== identity.name
        ? identity.personName
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
      amount_count_flag: r.famountcount ?? null,
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
      // 2026-07-07 — credit-tab AR columns (read-only) + delivering flag.
      credit_date_granted: r.fdatestatus5 ?? null,
      credit_due_date: r.fcreditdate ?? null,
      driverOpen: driverInProgressIds?.has(Number(r.id)) ?? false,
      paydeposit: r.paydeposit,
      note: r.fnote,
      products_type: r.fproductstype,
      ship_by: r.fshipby,
      detail: r.fdetail,
      cover: r.fcover,
      coverUrl: null,            // filled in after the URL-resolve step below
      // Wave 15 P0-3 — outstanding balance computed from legacy formula.
      // ภูม 2026-07-22 — PAID = paydeposit='1' OR shipped/done (fstatus 6/7/8) UNLESS
      // it's a credit row (นิติ+เครดิต sits at fstatus 6 unpaid = real AR). A slip-paid
      // direct-cut row lands at 6/7 with paydeposit='' → without this it showed a fake
      // red "ยอดค้างชำระ" + inflated the footer AR (isForwarderPaid = same predicate as CSV).
      outstanding_thb: isForwarderPaid(r.paydeposit, r.fstatus, r.fcredit)
        ? 0
        : calcForwarderOutstanding(r),
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
      cabinet_locked: r.fcabinet_locked === true,
      tax_doc_pref: r.tax_doc_pref,
      // 2026-06-12 (พี่ป๊อป) — dimensions (cm) for the group breakdown; 0/null = ยังไม่วัด
      width_cm:  r.fwidth  != null && Number(r.fwidth)  > 0 ? Number(r.fwidth)  : null,
      length_cm: r.flength != null && Number(r.flength) > 0 ? Number(r.flength) : null,
      height_cm: r.fheight != null && Number(r.fheight) > 0 ? Number(r.fheight) : null,
      cg_no: null as string | null, // filled by the momo_import_tracks lookup below
      // owner ④ — assigned ผู้สั่งซื้อ (per-order).
      assigned_purchaser_id: (r.adminidpurchaser ?? "").trim(),
      assigned_purchaser_name:
        purchaserNameById.get((r.adminidpurchaser ?? "").trim()) ?? null,
      customer: user
        ? {
            userid: user.userID,
            name,
            contact_name: contactName,
            phone: user.userTel ?? "",
            coid: user.coID ?? "",
            is_svip: svipUserIds.has(user.userID),
            is_corporate: corporateUserIds.has(user.userID),
            is_comparison: user.userComparison === "1",
            is_juristic: user.userCompany === "1",
            credit_limit: Number(user.userCreditValue ?? 0),
            credit_days: Number(user.userCreditDate ?? 0),
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

  // ─── Export-all path: skip the page-slice + cover-URL resolve ──────────
  // The CSV export emits every filtered row (no cover images) → no .range
  // window, no signed-URL work. Total = the full filtered length.
  if (exportAll) {
    return { rows, totalForwarders: rows.length, forwarderErr };
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

  // ─── 2026-06-12 (พี่ป๊อป) — MOMO CG_NO for the group breakdown ──────────
  // CG_NO is NOT a tb_forwarder column — it lives in momo_import_tracks.raw
  // (the carrier sub-parcel id). The MOMO commit copies the carrier tracking
  // verbatim into ftrackingchn, so momo_tracking_no === ftrackingchn (an exact
  // join key). Bounded to the visible page's trackings · pulls only the
  // extracted string (raw->>CG_NO, not the whole blob) · best-effort (a
  // failure logs + leaves cg_no null → "—", never blocks the list).
  const cgTrackings = Array.from(
    new Set(rows.map((r) => r.tracking_chn).filter((t): t is string => !!t && t !== "-")),
  );
  if (cgTrackings.length > 0) {
    const { data: cgRows, error: cgErr } = await admin
      .from("momo_import_tracks")
      .select("momo_tracking_no, cg_no:raw->>CG_NO")
      .in("momo_tracking_no", cgTrackings);
    if (cgErr) {
      console.error("[forwarders cg_no lookup] failed", cgErr);
    } else if (cgRows && cgRows.length > 0) {
      const cgMap = new Map<string, string>();
      for (const c of cgRows as unknown as { momo_tracking_no: string | null; cg_no: string | null }[]) {
        if (c.momo_tracking_no && c.cg_no && c.cg_no.trim() !== "") {
          cgMap.set(c.momo_tracking_no, c.cg_no.trim());
        }
      }
      if (cgMap.size > 0) {
        rows = rows.map((r) => ({
          ...r,
          cg_no: r.tracking_chn ? cgMap.get(r.tracking_chn) ?? null : null,
        }));
      }
    }
  }

  return { rows, totalForwarders, forwarderErr };
}

/**
 * Per-status counts (parallel head queries · global · independent of
 * keyword/date filters so badge counts stay stable while user types).
 *
 * Legacy did `SELECT COUNT(ID), fStatus FROM tb_forwarder GROUP BY fStatus`
 * in a single query; PostgREST has no GROUP BY in select so we run
 * one head query per status. 9 parallel HEAD queries × ~50ms each.
 */
/**
 * Resolve the current admin's legacy `tb_admin.adminID` from their email — the
 * scope key for the per-order purchaser hard-scope (owner ④). "" when no legacy
 * mirror (a scoped purchaser then sees no orders, which is correct).
 */
async function resolvePurchaserAdminId(
  admin: ReturnType<typeof createAdminClient>,
  email: string | null,
): Promise<string> {
  if (!email) return "";
  const { data, error } = await admin
    .from("tb_admin")
    .select("adminID")
    .eq("adminEmail", email)
    .maybeSingle<{ adminID: string }>();
  if (error) {
    console.error("[/admin/forwarders resolvePurchaserAdminId] failed", {
      code: error.code,
      message: error.message,
    });
  }
  return data?.adminID ?? "";
}

async function loadStatusCounts(
  admin: ReturnType<typeof createAdminClient>,
  // ภูม 2026-07-22 — badge นับทั้งหมด (ไม่สนวันที่) · dateWindow ไม่ใช้แล้ว (กรองแค่ list)
  _dateWindow: { from: string | null; to: string | null; isDefault: boolean },
  purchaserScope?: string | null,
) {
  // owner ④ — when a purchaser scope is set, badge counts reflect ONLY that
  // purchaser's orders (so a scoped viewer's tabs match their scoped list).
  const scope = purchaserScope && purchaserScope !== "" ? purchaserScope : null;
  // ภูม/พี่ป๊อป 2026-07-22 — นับเป็น "ชิปเม้น" ไม่ใช่แทรคกิ้ง (owner "ต้องนับเป็น shipment").
  // ชิปเม้น = (baseTracking, userid) เดียวกัน → กล่องแตก -N/M นับเป็นก้อนเดียว (เช่น 52643 มี
  // 4 แทรค = 1 ชิปเม้น). ดึงแถวทั้งหมด (paginated · fetchAllRows กัน cap 1000) แล้วนับ distinct
  // ชิปเม้นต่อสถานะใน JS (แถวเบา 5 คอลัมน์). badge นับทั้งหมด (ไม่สนวันที่ · date กรองแค่ list).
  const { data: allRows, error: allErr } = await fetchAllRows<{
    id: number;
    ftrackingchn: string | null;
    userid: string | null;
    fstatus: string | null;
    fcredit: string | null;
  }>(() => {
    let q = admin
      .from("tb_forwarder")
      .select("id, ftrackingchn, userid, fstatus, fcredit")
      .order("id", { ascending: true });
    if (scope) q = q.eq("adminidpurchaser", scope);
    return q;
  });
  if (allErr) {
    console.error("[forwarders loadStatusCounts fetchAll] failed", {
      code: allErr.code, message: allErr.message,
    });
  }
  const shipRows = allRows ?? [];
  // ชิปเม้นคีย์ = baseTracking (ตัด -N/M) + userid · ไม่มี tracking → ยึด id (ยืนเดี่ยว).
  const shipKey = (r: { id: number; ftrackingchn: string | null; userid: string | null }) =>
    `${baseTracking(r.ftrackingchn) ?? `_${r.id}`}|${(r.userid ?? "").trim()}`;

  const perStatus = new Map<string, Set<string>>();
  const creditSet = new Set<string>();
  const allSet = new Set<string>();
  for (const r of shipRows) {
    const k = shipKey(r);
    allSet.add(k);
    const s = String(r.fstatus ?? "").trim();
    let set = perStatus.get(s);
    if (!set) { set = new Set<string>(); perStatus.set(s, set); }
    set.add(k);
    if (String(r.fcredit ?? "").trim() === "1") creditSet.add(k);
  }
  const cnt = (v: string) => perStatus.get(v)?.size ?? 0;

  // "กำลังจัดส่ง" (6.1) = ชิปเม้นสถานะ 6 ที่มีงานคนขับเปิด (fdistatus='') — distinct ชิปเม้น.
  let s6driver = 0;
  {
    const { data: di, error: diErr } = await admin
      .from("tb_forwarder_driver_item")
      .select("fid")
      .eq("fdistatus", "");
    if (diErr) {
      console.error("[forwarders] countDriverInProgress6 driver-item read failed", {
        code: diErr.code, message: diErr.message,
      });
    }
    const openFids = new Set(
      (di ?? [])
        .map((r) => Number((r as { fid: number | string }).fid))
        .filter((n) => Number.isFinite(n)),
    );
    if (openFids.size > 0) {
      const set6 = new Set<string>();
      for (const r of shipRows) {
        if (String(r.fstatus ?? "").trim() === "6" && openFids.has(r.id)) set6.add(shipKey(r));
      }
      s6driver = set6.size;
    }
  }

  return {
    total: allSet.size,
    s1: cnt("1"), s2: cnt("2"), s3: cnt("3"), s4: cnt("4"),
    s5: cnt("5"), s6: cnt("6"), s6driver, s7: cnt("7"),
    credit: creditSet.size, special: cnt("99"),
  };
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
