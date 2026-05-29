/**
 * /admin/service-orders — รายการฝากสั่งสินค้า (faithful port)
 *
 * Wave 26.2 (ภูม flag 2026-05-30 evening): brings the page from a
 * 7-column reading list (was 200-row hard cap · no actions · no sort ·
 * no date filter) to the same fidelity level as /admin/forwarders
 * Wave-11.
 *
 * Legacy source: `pcs-admin/shops.php` L237-555.
 *   - L237-265  — `?q=` tab dispatcher (1..6 status + datedrop default 90d)
 *   - L266      — GROUP BY hNo (deduplicates header rows for the table)
 *   - L290-345  — per-tab COUNT(ID) for the status badges
 *   - L411-555  — 9-column DataTables (ID · date · hno · userID ·
 *                product/title · price · status · update · actions)
 *   - L548-553  — fixed bulk-print bar (form submits checkbox-selected
 *                hNos to printShop)
 *
 * Per AGENTS.md §0a — steal the LOGIC + apply Pacred design.
 * Per AGENTS.md §0c — every Supabase query destructures `error`.
 *
 * URL contract — supports BOTH conventions (existing call sites are
 * mixed; this preserves all bookmarks + sidebar links):
 *   - ?q=1..6        — legacy numeric status (used by sidebar + the
 *                      menubar from Wave-20)
 *   - ?q=<keyword>   — keyword search (legacy `customers/[id]/legacy-view.tsx`
 *                      links here with `?q=PR10691`)
 *   - ?status=pending|awaiting_payment|ordered|awaiting_china_ship|
 *             completed|cancelled
 *                    — rebuilt-era enum key (used by /admin/page.tsx
 *                      cancelled card + /admin/qa/page.tsx + /admin/accounting)
 *   - ?search=<kw>   — explicit keyword (new in Wave 26.2; legacy didn't
 *                      have a separate search field — q was overloaded)
 *   - ?sort=&dir=    — server-side sort (new)
 *   - ?date_from=&date_to= — date range (new)
 *   - ?historyTableAll=1 — override default 90d window (legacy)
 *   - ?n=25|50|100|200 — page size (new)
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { PageTopMenubar, type MenubarItem } from "@/components/admin/page-top-menubar";
import { resolveLegacyUrlMap } from "@/lib/storage/legacy-resolver";
import { AdminDateFilter } from "@/components/admin/date-filter";
import { toLegacyOrderCode } from "@/lib/legacy-status-map";
import { ServiceOrdersTable, type ServiceOrderRow } from "./service-orders-table";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────
// Page top-menubar — kept from Wave 20 P0-bonus (2026-05-26 night).
// Sidebar "บริการฝากสั่งสินค้า" lands a single leaf here; status filters
// + cart actions + notes + search live in this horizontal menubar so
// the sidebar stays slim (matches /admin/forwarders pattern).
// ─────────────────────────────────────────────────────────────────────
const PURCHASING_MENUBAR: MenubarItem[] = [
  { label: "หน้าหลัก", href: "/admin/service-orders" },
  {
    label: "สถานะ",
    children: [
      { label: "ทั้งหมด",          href: "/admin/service-orders" },
      { label: "รอดำเนินการ",      href: "/admin/service-orders?q=1" },
      { label: "รอชำระเงิน",       href: "/admin/service-orders?q=2" },
      { label: "สั่งสินค้า",        href: "/admin/service-orders?q=3" },
      { label: "รอร้านจีนจัดส่ง",  href: "/admin/service-orders?q=4" },
      { label: "สำเร็จ",           href: "/admin/service-orders?q=5" },
      { label: "ยกเลิก",            href: "/admin/service-orders?q=6" },
    ],
  },
  {
    label: "งาน",
    children: [
      { label: "cart",                  href: "/admin/service-orders/cart" },
      { label: "เพิ่มสินค้าใน cart",     href: "/admin/service-orders/cart/add" },
      { label: "หมายเหตุฝากสั่ง",       href: "/admin/service-orders/notes" },
    ],
  },
];

// Legacy STATUS_LABEL — hstatus is char(1) "1".."6" (no "7").
const STATUS_LABEL: Record<string, string> = {
  "1": "รอดำเนินการ",
  "2": "รอชำระเงิน",
  "3": "สั่งสินค้า",
  "4": "รอร้านจีนจัดส่ง",
  "5": "สำเร็จ",
  "6": "ยกเลิก",
};

const STATUS_BADGE_COLOR: Record<string, string> = {
  "1": "bg-amber-100 text-amber-700 border-amber-200",
  "2": "bg-red-100 text-red-700 border-red-200",
  "3": "bg-blue-100 text-blue-700 border-blue-200",
  "4": "bg-indigo-100 text-indigo-700 border-indigo-200",
  "5": "bg-green-100 text-green-700 border-green-200",
  "6": "bg-gray-100 text-gray-600 border-gray-200",
};

type SortField = "id" | "hdate" | "hno" | "userid" | "price" | "hstatus" | "hdateupdate";

type SearchParams = {
  q?: string;                   // status (1..6) OR keyword — legacy convention
  status?: string;              // rebuilt-era enum key (pending..completed)
  date_from?: string;
  date_to?: string;
  historyTableAll?: string;     // "1" = ignore default 90d window
  search?: string;              // explicit keyword (new)
  sort?: string;
  dir?: "asc" | "desc";
  n?: string;                   // page size: 25|50|100|200
};

// Raw row shape from tb_header_order — the columns we read.
type RawHeaderOrder = {
  id: number;
  hno: string;
  hstatus: string;
  hdate: string | null;
  hdate2: string | null;
  hdate3: string | null;
  hdate4: string | null;
  hdate5: string | null;
  hdateupdate: string | null;
  hdatepayment: string | null;
  htitle: string | null;
  hcount: number | null;
  hcover: string | null;
  htotalpricechn: number | null;
  hshippingchn: number | null;
  hshippingservice: number | null;
  hrate: number | null;
  hnote: string | null;
  hnoteuser: string | null;
  hnoteuserread: string | null;
  hnotedate: string | null;
  hprintbill: string | null;
  hprintbill2: string | null;
  adminid: string | null;
  adminidcreate: string | null;
  adminidip: string | null;
  adminidupdate: string | null;
  userid: string;
};

// tb_users uses mixed-case columns (CLAUDE.md exception · userID/userName).
// Most other tb_* tables are lowercase post-port; tb_users + tb_admin keep
// the original camelCase from the PHP schema dump.
type RawUserRow = {
  userID:       string;
  userName:     string | null;
  userLastName: string | null;
  coID:         string | null;
  adminIDSale:  string | null;
};

type RawCorpRow = {
  userid: string;
};

export default async function AdminServiceOrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // W-1: page-level role gate. Lists every customer's shop orders —
  // CSPurchasing + accounting + ops need this view (legacy shops.php
  // gates on CEO / Manager / QAAndQC / Accounting / ITDT / CSPurchasing
  // / SaleCargo / Marketing per L528; we use the equivalent Pacred roles).
  await requireAdmin(["ops", "sales", "accounting"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // ── URL contract reconcile ──────────────────────────────────────────
  // `?q=1..6` (numeric) → status filter.
  // `?q=<text>` → keyword search.
  // `?status=<rebuilt-key>` → resolve to legacy code via toLegacyOrderCode.
  // `?search=<text>` → keyword (preferred new convention).
  const qParam = sp.q ?? "";
  const qIsStatus = /^[1-6]$/.test(qParam);
  const statusFromQ = qIsStatus ? qParam : undefined;
  const statusFromRebuiltKey = sp.status ? toLegacyOrderCode(sp.status) : undefined;
  const statusFilter = statusFromQ ?? statusFromRebuiltKey;

  // Keyword search — either ?search=, or ?q=<non-numeric>.
  const keywordRaw = sp.search ?? (qIsStatus ? undefined : qParam.trim() || undefined);
  const keyword = keywordRaw ? keywordRaw.trim() : undefined;

  // ── Date window — legacy default = 90 days back; ?historyTableAll=1
  // overrides to "all rows"; explicit ?date_from/?date_to overrides both.
  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setDate(defaultFrom.getDate() - 90);
  const defaultFromIso = defaultFrom.toISOString().slice(0, 10);
  const defaultToIso = today.toISOString().slice(0, 10);

  const showAll = sp.historyTableAll === "1";
  const effectiveFrom = sp.date_from ?? (showAll ? null : defaultFromIso);
  const effectiveTo = sp.date_to ?? (showAll ? null : defaultToIso);

  // Page-size — legacy "แสดง 10/25/50/100 รายการ" dropdown.
  const allowedPageSizes = [25, 50, 100, 200];
  const requestedN = parseInt(sp.n ?? "50", 10);
  const pageSize = allowedPageSizes.includes(requestedN) ? requestedN : 50;

  // ── Sort — server-side via ?sort=<field>&dir=<asc|desc> ───────────
  // Legacy DataTables init was client-side; we move sort to SQL so it
  // works on the unfiltered set (not just the 50-row page).
  const currentSort = (sp.sort as SortField) ?? "hdate";
  const currentDir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";

  // Map sort field → tb_header_order column. "price" sorts by
  // htotalpriceuser (closest scalar proxy; the legacy total is
  // (hTotalPriceCHN+hShippingCHN)*hRate+hShippingService computed at
  // render time, which isn't a single column we can ORDER BY).
  const SORT_COL: Record<SortField, string> = {
    id: "id",
    hdate: "hdate",
    hno: "hno",
    userid: "userid",
    price: "htotalpriceuser",
    hstatus: "hstatus",
    hdateupdate: "hdateupdate",
  };

  // ── Main query against tb_header_order ─────────────────────────────
  let q = admin
    .from("tb_header_order")
    .select(
      "id,hno,hstatus,hdate,hdate2,hdate3,hdate4,hdate5,hdateupdate," +
        "hdatepayment,htitle,hcount,hcover,htotalpricechn,hshippingchn," +
        "hshippingservice,hrate,hnote,hnoteuser,hnoteuserread,hnotedate," +
        "hprintbill,hprintbill2,adminid,adminidcreate,adminidip," +
        "adminidupdate,userid",
    )
    .order(SORT_COL[currentSort], { ascending: currentDir === "asc", nullsFirst: false })
    .limit(pageSize);

  if (statusFilter) {
    q = q.eq("hstatus", statusFilter);
  }

  // Date window
  if (effectiveFrom) q = q.gte("hdate", effectiveFrom);
  if (effectiveTo) q = q.lte("hdate", effectiveTo + "T23:59:59");

  // Keyword search — push down to PostgREST when possible
  // (matches hno OR htitle OR userid via the .or() predicate).
  if (keyword) {
    const escaped = keyword.replace(/[%,*()]/g, ""); // keep simple
    q = q.or(
      `hno.ilike.%${escaped}%,htitle.ilike.%${escaped}%,userid.ilike.%${escaped}%`,
    );
  }

  const { data: headerRows, error: headerErr } = await q;
  if (headerErr) {
    console.error("[/admin/service-orders] tb_header_order list failed", {
      code: headerErr.code,
      message: headerErr.message,
    });
  }
  const raw = (headerRows ?? []) as unknown as RawHeaderOrder[];

  // ── 2nd query: tb_users for customer name + VIP tier + sales rep ──
  const uniqueUserIds = Array.from(new Set(raw.map((r) => r.userid).filter(Boolean)));
  let usersByUserId = new Map<string, RawUserRow>();
  if (uniqueUserIds.length > 0) {
    const { data: userRows, error: userErr } = await admin
      .from("tb_users")
      .select("userID,userName,userLastName,coID,adminIDSale")
      .in("userID", uniqueUserIds);
    if (userErr) {
      console.error("[/admin/service-orders] tb_users join failed", {
        userIdCount: uniqueUserIds.length,
        error: userErr.message,
      });
    }
    usersByUserId = new Map(
      ((userRows ?? []) as unknown as RawUserRow[]).map((u) => [u.userID, u]),
    );
  }

  // ── 3rd query: tb_corporate to flag นิติบุคคล customers ──────────
  // (Legacy badgeVIP2 reads this — function.php L567-596.)
  let corporateUserIds = new Set<string>();
  if (uniqueUserIds.length > 0) {
    const { data: corpRows, error: corpErr } = await admin
      .from("tb_corporate")
      .select("userid")
      .in("userid", uniqueUserIds);
    if (corpErr) {
      console.error("[/admin/service-orders] tb_corporate join failed", {
        error: corpErr.message,
      });
    }
    corporateUserIds = new Set(
      ((corpRows ?? []) as unknown as RawCorpRow[]).map((c) => c.userid),
    );
  }

  // ── Resolve cover image URLs in parallel ─────────────────────────
  const coverMap = await resolveLegacyUrlMap(
    raw.map((r) => ({ id: r.id, filename: r.hcover })),
    "cover",
  );

  // ── Shape into ServiceOrderRow for the table ─────────────────────
  const rows: ServiceOrderRow[] = raw.map((r) => {
    const user = usersByUserId.get(r.userid);
    // tb_users uses camelCase columns (CLAUDE.md exception).
    const name = user
      ? `${user.userName ?? ""} ${user.userLastName ?? ""}`.trim() || null
      : null;
    const coid = user?.coID ?? null;
    const isVip = coid !== null && coid !== "" && coid !== "PCS";
    return {
      id: r.id,
      hno: r.hno,
      hstatus: r.hstatus,
      hdate: r.hdate,
      hdate2: r.hdate2,
      hdate3: r.hdate3,
      hdate4: r.hdate4,
      hdate5: r.hdate5,
      hdateupdate: r.hdateupdate,
      hdatepayment: r.hdatepayment,
      htitle: r.htitle,
      hcount: Number(r.hcount ?? 1),
      hcover: r.hcover,
      coverUrl: coverMap[String(r.id)] ?? null,
      htotalpricechn: Number(r.htotalpricechn ?? 0),
      hshippingchn: Number(r.hshippingchn ?? 0),
      hshippingservice: Number(r.hshippingservice ?? 0),
      hrate: Number(r.hrate ?? 0),
      hnote: r.hnote && r.hnote.trim() !== "" ? r.hnote : null,
      hnoteuser: r.hnoteuser,
      hnoteuserread: r.hnoteuserread,
      hnotedate: r.hnotedate,
      hprintbill: r.hprintbill,
      hprintbill2: r.hprintbill2,
      adminid: r.adminid,
      adminidcreate: r.adminidcreate,
      adminidip: r.adminidip,
      adminidupdate: r.adminidupdate,
      userid: r.userid,
      customerName: name,
      isVip,
      vipTier: isVip ? coid : null,
      isCorporate: corporateUserIds.has(r.userid),
      salesRep: user?.adminIDSale && user.adminIDSale !== "" ? user.adminIDSale : null,
    };
  });

  // ── Per-status counts (parallel HEAD queries · global · independent
  // of keyword/date filters so badges stay stable while user types). ─
  const counts = await loadStatusCounts(admin);

  const showUpdateDate = statusFilter === "3" || statusFilter === "4";

  // The status-filter tab strip (legacy "สถานะรายการ" · L350-401)
  const filterOpts: { v: string | undefined; l: string; n: number; cls: string }[] = [
    { v: undefined, l: "ทั้งหมด", n: counts.total, cls: "bg-cyan-100 text-cyan-700 border-cyan-200" },
    { v: "1", l: STATUS_LABEL["1"]!, n: counts.s1, cls: STATUS_BADGE_COLOR["1"]! },
    { v: "2", l: STATUS_LABEL["2"]!, n: counts.s2, cls: STATUS_BADGE_COLOR["2"]! },
    { v: "3", l: STATUS_LABEL["3"]!, n: counts.s3, cls: STATUS_BADGE_COLOR["3"]! },
    { v: "4", l: STATUS_LABEL["4"]!, n: counts.s4, cls: STATUS_BADGE_COLOR["4"]! },
    { v: "5", l: STATUS_LABEL["5"]!, n: counts.s5, cls: STATUS_BADGE_COLOR["5"]! },
    { v: "6", l: STATUS_LABEL["6"]!, n: counts.s6, cls: STATUS_BADGE_COLOR["6"]! },
  ];

  // Build a sort href that preserves all other filters but toggles the
  // direction when the same field is clicked again.
  function buildSortHref(field: SortField): string {
    const params = new URLSearchParams();
    params.set("sort", field);
    const newDir = currentSort === field && currentDir === "desc" ? "asc" : "desc";
    params.set("dir", newDir);
    if (statusFilter) params.set("q", statusFilter);
    if (sp.date_from) params.set("date_from", sp.date_from);
    if (sp.date_to) params.set("date_to", sp.date_to);
    if (sp.historyTableAll) params.set("historyTableAll", sp.historyTableAll);
    if (keyword) params.set("search", keyword);
    if (sp.n) params.set("n", sp.n);
    return `/admin/service-orders?${params.toString()}`;
  }

  // Build an href for status tabs that preserves filters
  function buildTabHref(qVal: string | undefined): string {
    const params = new URLSearchParams();
    if (qVal) params.set("q", qVal);
    if (sp.date_from) params.set("date_from", sp.date_from);
    if (sp.date_to) params.set("date_to", sp.date_to);
    if (sp.historyTableAll) params.set("historyTableAll", sp.historyTableAll);
    if (keyword) params.set("search", keyword);
    if (sp.n) params.set("n", sp.n);
    return `/admin/service-orders${params.size > 0 ? `?${params.toString()}` : ""}`;
  }

  function buildPageSizeHref(n: number): string {
    const params = new URLSearchParams();
    params.set("n", String(n));
    if (statusFilter) params.set("q", statusFilter);
    if (sp.date_from) params.set("date_from", sp.date_from);
    if (sp.date_to) params.set("date_to", sp.date_to);
    if (sp.historyTableAll) params.set("historyTableAll", sp.historyTableAll);
    if (keyword) params.set("search", keyword);
    return `/admin/service-orders?${params.toString()}`;
  }

  // Window-message text — legacy L270-273.
  const windowMessage = sp.date_from || sp.date_to
    ? `ผลลัพธ์การค้นหา ตั้งแต่วันที่: ${sp.date_from ?? defaultFromIso} ถึง ${sp.date_to ?? defaultToIso}`
    : showAll
    ? "ผลลัพธ์การค้นหา ทั้งหมด"
    : "ผลลัพธ์การค้นหาย้อนหลัง 90 วัน";

  return (
    <>
      <PageTopMenubar items={PURCHASING_MENUBAR} activeHref="/admin/service-orders" />
      <main className="p-6 lg:p-8 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN</p>
            <h1 className="mt-1 text-2xl font-bold">ฝากสั่งสินค้า</h1>
            <p className="text-sm text-muted mt-0.5">
              {rows.length.toLocaleString("th-TH")} รายการ (จากทั้งหมด{" "}
              {counts.total.toLocaleString("th-TH")})
            </p>
            <p className="text-xs text-red-600 mt-0.5">{windowMessage}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Legacy L279-285 — &ldquo;+ สั่งสินค้าให้ลูกค้า&rdquo; CTA → /cart/add */}
            <Link
              href="/admin/service-orders/cart/add"
              className="rounded-lg border border-green-500 bg-green-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-600"
            >
              + สั่งสินค้าให้ลูกค้า
            </Link>
          </div>
        </div>

        {/* Wave 26.2 status banner — proactive transparency per AGENTS.md §0a. */}
        <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2.5 text-xs text-amber-800 flex items-start gap-2">
          <span aria-hidden>ℹ️</span>
          <div className="flex-1">
            <span className="font-medium">Wave 26.2 status:</span>{" "}
            ✅ 7 status tabs with counts · date range filter · sort arrows · action button cluster ·
            cover image · VIP/นิติ/sale badges · bulk-print bar · keyword search ·
            page-size dropdown · &ldquo;ผ่านมา&rdquo; relative time ·{" "}
            <span className="opacity-75">
              ⏳ พิมพ์ใบเสร็จ/แจ้งหนี้ links to /service-order/print which pins to the
              logged-in customer&apos;s userID (admin-side print needs a separate
              route with admin auth · deferred — flagged for next session)
            </span>
          </div>
        </div>

        {headerErr && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            โหลดข้อมูลไม่สำเร็จ: {headerErr.message}
          </div>
        )}

        {/* Status tabs — legacy &ldquo;สถานะรายการ&rdquo; with COUNT badges */}
        <div>
          <h5 className="text-sm font-semibold mb-2">สถานะรายการ</h5>
          <div className="flex flex-wrap gap-2">
            {filterOpts.map((o) => {
              const href = buildTabHref(o.v);
              const active = (statusFilter ?? "") === (o.v ?? "");
              return (
                <Link
                  key={o.v ?? "all"}
                  href={href}
                  className={`rounded-full border px-3 py-1.5 text-xs whitespace-nowrap flex items-center gap-1.5 ${
                    active
                      ? "bg-primary-500 text-white border-primary-500 font-semibold"
                      : "bg-white border-border hover:bg-surface-alt"
                  }`}
                >
                  {o.l}
                  {o.n > 0 && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        active ? "bg-white/30 text-white" : o.cls
                      }`}
                    >
                      {o.n.toLocaleString("th-TH")}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Date-range picker + search + page-size · legacy L237-275 + L632 */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-3 lg:p-4 shadow-sm space-y-3">
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="text-[10px] text-muted block mb-1">วันที่สร้างออเดอร์</label>
              <AdminDateFilter
                tab={statusFilter}
                dateFrom={sp.date_from}
                dateTo={sp.date_to}
              />
            </div>
            {/* Page-size dropdown · legacy L632 + DataTables aLengthMenu */}
            <div>
              <label className="text-[10px] text-muted block mb-1">แสดง</label>
              <div className="flex gap-1">
                {allowedPageSizes.map((n) => (
                  <Link
                    key={n}
                    href={buildPageSizeHref(n)}
                    className={`rounded border px-2 py-1.5 text-xs ${
                      pageSize === n
                        ? "bg-primary-500 text-white border-primary-500"
                        : "bg-white border-border hover:bg-surface-alt"
                    }`}
                  >
                    {n}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Search form */}
          <form
            method="GET"
            action="/admin/service-orders"
            className="flex items-center gap-2 flex-wrap"
          >
            <input
              type="text"
              name="search"
              defaultValue={keyword ?? ""}
              placeholder="ค้นหา hno · userid · สินค้า..."
              className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-1.5 text-sm flex-1 min-w-[200px] focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            />
            {/* Preserve other filters via hidden inputs */}
            {statusFilter && <input type="hidden" name="q" value={statusFilter} />}
            {sp.date_from && <input type="hidden" name="date_from" value={sp.date_from} />}
            {sp.date_to && <input type="hidden" name="date_to" value={sp.date_to} />}
            {sp.n && <input type="hidden" name="n" value={sp.n} />}
            <button
              type="submit"
              className="rounded-lg bg-primary-500 text-white px-4 py-1.5 text-sm font-medium hover:bg-primary-600"
            >
              ค้นหา
            </button>
            {keyword && (
              <Link
                href={buildTabHref(statusFilter)}
                className="text-xs text-muted hover:text-foreground px-2 py-1.5"
              >
                ล้าง
              </Link>
            )}
            {!showAll && (
              <Link
                href={`/admin/service-orders?historyTableAll=1${statusFilter ? `&q=${statusFilter}` : ""}`}
                className="text-xs text-muted hover:text-foreground px-2 py-1.5 underline"
              >
                ดูทั้งหมด (ไม่จำกัด 90 วัน)
              </Link>
            )}
          </form>
        </div>

        {/* Table */}
        <ServiceOrdersTable
          rows={rows}
          showUpdateDate={showUpdateDate}
          currentSort={currentSort}
          currentDir={currentDir}
          buildSortHref={buildSortHref}
        />
      </main>
    </>
  );
}

/**
 * Per-status counts (parallel HEAD queries · global · independent of
 * keyword/date filters so badge counts stay stable while user types).
 *
 * Legacy did 7× `SELECT COUNT(ID) FROM tb_header_order WHERE hStatus='N'`
 * sequentially (L290-345). 7 parallel HEAD queries here.
 */
async function loadStatusCounts(admin: ReturnType<typeof createAdminClient>) {
  async function countStatus(value: string): Promise<number> {
    const r = await admin
      .from("tb_header_order")
      .select("id", { count: "exact", head: true })
      .eq("hstatus", value);
    return r.count ?? 0;
  }
  async function countTotal(): Promise<number> {
    const r = await admin
      .from("tb_header_order")
      .select("id", { count: "exact", head: true });
    return r.count ?? 0;
  }

  const [total, s1, s2, s3, s4, s5, s6] = await Promise.all([
    countTotal(),
    countStatus("1"),
    countStatus("2"),
    countStatus("3"),
    countStatus("4"),
    countStatus("5"),
    countStatus("6"),
  ]);

  return { total, s1, s2, s3, s4, s5, s6 };
}
