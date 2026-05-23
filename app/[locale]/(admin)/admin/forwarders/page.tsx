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
import { requireAdmin } from "@/lib/auth/require-admin";
import { ForwardersTable } from "./forwarders-table";
import { ForwardersSearchBar } from "./search-bar";
import { Suspense } from "react";
import { PageTopMenubar, type MenubarItem } from "@/components/admin/page-top-menubar";
import { resolveLegacyUrlMap } from "@/lib/storage/legacy-resolver";
import { calcForwarderOutstanding } from "@/lib/forwarder/outstanding";

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
      { label: "รวมบิลสินค้า",            href: "/admin/forwarders/combine-bill" },
      { label: "ประวัติเข้าโกดังไทย",     href: "/admin/forwarders/warehouse-history" },
      { label: "มอบงานคนขับ",            href: "/admin/drivers" },
      // Wave 7.3 (2026-05-22): wired 2 orphan container-cost pages per
      // ภูม decision in page-inventory-2026-05-21-night.md §🔴 DEAD.
      { label: "ต้นทุนตู้",                href: "/admin/accounting/container-costs" },
      { label: "เช็คต้นทุนตู้ (Sheet)",    href: "/admin/forwarders/container-cost-check" },
    ],
  },
  {
    label: "บาร์โค้ด",
    children: [
      { label: "ทั้งหมด", href: "/admin/barcode" },
      { label: "driver", href: "/admin/barcode/driver" },
    ],
  },
  {
    label: "ค้นหา",
    children: [
      { label: "รหัสเดียว",    href: "/admin/forwarders?focus=search" },
      { label: "หลายรหัส",     href: "/admin/forwarders/bulk-search" },
    ],
  },
];

// Sidebar `?segment=` chip — label-only (Wave-B P0.5 pattern); no SQL
// filter applied. Keep the keys in sync with the sidebar dropdown.
// TODO: legacy `tb_forwarder` has no cargo-vs-freight or FCL-vs-LCL
// explicit column. Flagging cargo-vs-freight is Phase C (or needs a
// schema extension column on tb_forwarder).
const SEGMENT_LABEL: Record<string, string> = {
  "cargo-fcl":     "Cargo · FCL",
  "cargo-lcl":     "Cargo · LCL",
  "freight-fcl":   "Freight · FCL",
  "freight-lcl":   "Freight · LCL",
  "freight-truck": "Freight · รถ",
  "freight-sea":   "Freight · เรือ",
  "freight-air":   "Freight · แอร์",
};

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

// Warehouse name (fwarehousename char(1))
const WAREHOUSE_LABEL: Record<string, string> = {
  "1": "แสง", "2": "CTT", "3": "MK", "4": "MX",
  "5": "JMF", "6": "GOGO", "7": "Cargo Center", "8": "MOMO",
};

type SearchParams = {
  status?: string;      // 1..7, 6.1, c, p — legacy 10-tab filter
  q?: string;           // single-line keyword search
  q_multi?: string;     // U2-5: multi-line bulk tracking search
  date_from?: string;
  date_to?: string;
  segment?: string;     // DEPRECATED — kept for old bookmark links (cargo-fcl etc.)
  service?: string;     // 2026-05-21 segmented control · 'cargo' | 'freight' — label-only
  container?: string;   // 2026-05-21 segmented control · 'fcl' | 'lcl' — label-only
  mode?: string;        // transport mode chip ('1'/'2'/'3')
  create?: string;      // Wave 11 — 'user'|'system'|'admin' (legacy ?create=)
};

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
};

type RawUserRow = {
  userid: string;
  username: string | null;
  userlastname: string | null;
  usertel: string | null;
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
  customer: { userid: string; name: string; phone: string } | null;
};

export default async function AdminForwardersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  // W-1 (gap-admin H-1): page-level role gate. Lists every customer's
  // import orders + prices via createAdminClient (RLS-bypass) — ops
  // (runs the orders) + accounting (bills them).
  await requireAdmin(["ops", "accounting"]);

  const sp = await searchParams;
  const admin = createAdminClient();

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
      "ftransportpricechnthb,priceother,fdiscount,fusercompany,adminidkey",
    )
    .order("fdate", { ascending: false, nullsFirst: false })
    .limit(300);

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
    const { data: driverItemRows } = await admin
      .from("tb_forwarder_driver_item")
      .select("fid")
      .eq("fdistatus", "");
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

  const { data: forwarderRows, error: forwarderErr } = await q;
  let raw = (forwarderRows ?? []) as unknown as RawForwarderRow[];

  // 6 vs 6.1 post-fetch split (driver-in-progress set was loaded above).
  if (sp.status === "6" && driverInProgressIds) {
    raw = raw.filter((r) => !driverInProgressIds!.has(Number(r.id)));
  } else if (sp.status === "6.1" && driverInProgressIds) {
    raw = raw.filter((r) => driverInProgressIds!.has(Number(r.id)));
  }

  // ─── 2nd query: tb_users for customer name/phone ──────────────────────
  const uniqueUserIds = Array.from(new Set(raw.map((r) => r.userid).filter(Boolean)));
  let usersByUserId = new Map<string, RawUserRow>();
  if (uniqueUserIds.length > 0) {
    const { data: userRows } = await admin
      .from("tb_users")
      .select("userid,username,userlastname,usertel")
      .in("userid", uniqueUserIds);
    usersByUserId = new Map(
      ((userRows ?? []) as unknown as RawUserRow[]).map((u) => [u.userid, u]),
    );
  }

  // Shape into our Row type for the table.
  let rows: Row[] = raw.map((r) => {
    const user = usersByUserId.get(r.userid);
    const name = user
      ? `${user.username ?? ""} ${user.userlastname ?? ""}`.trim()
      : "";
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
      customer: user
        ? {
            userid: user.userid,
            name,
            phone: user.usertel ?? "",
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
  // We run these in parallel; each returns the global count for that
  // status code (independent of the keyword filter so badges are stable).
  const counts = await loadStatusCounts(admin);

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

  // ภูม brief 2026-05-20 ค่ำ — segment chip (label-only · Wave-B P0.5).
  const segmentLabel = sp.segment && SEGMENT_LABEL[sp.segment] ? SEGMENT_LABEL[sp.segment] : null;

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
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN</p>
          <h1 className="mt-1 text-2xl font-bold">
            ฝากนำเข้า{headerSuffix ? ` · ${headerSuffix}` : ""}
          </h1>
          <p className="text-sm text-muted mt-0.5">
            {rows.length.toLocaleString("th-TH")} รายการ (จากทั้งหมด {counts.total.toLocaleString("th-TH")})
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
          <span className="opacity-75">⏳ Wave 12: "+ เพิ่มรายการให้ลูกค้า" form ·
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

      {/* Table */}
      <ForwardersTable
        rows={rows}
        statusLabel={STATUS_LABEL}
        modeLabel={MODE_LABEL}
        warehouseLabel={WAREHOUSE_LABEL}
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
async function loadStatusCounts(admin: ReturnType<typeof createAdminClient>) {
  async function countFstatus(value: string): Promise<number> {
    const r = await admin
      .from("tb_forwarder")
      .select("id", { count: "exact", head: true })
      .eq("fstatus", value);
    return r.count ?? 0;
  }
  async function countCredit(): Promise<number> {
    const r = await admin
      .from("tb_forwarder")
      .select("id", { count: "exact", head: true })
      .eq("fcredit", "1");
    return r.count ?? 0;
  }
  async function countTotal(): Promise<number> {
    const r = await admin
      .from("tb_forwarder")
      .select("id", { count: "exact", head: true });
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
