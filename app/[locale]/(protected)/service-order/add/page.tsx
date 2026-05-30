import { redirect } from "next/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWalletAvailableBalance } from "@/lib/wallet/balance";
import { Link } from "@/i18n/navigation";
import { legacyMemberUrl } from "@/lib/legacy-image";
import {
  BulkActionsProvider,
  BulkCancelButton,
  BulkPayBar,
  RowCancelButton,
  RowCheckbox,
} from "./service-order-bulk-actions";
// D1 fidelity §4 — the link-paste product search panel. Closes the
// "shops.php had a paste-a-link search box; Pacred only had manual
// entry" gap called out in docs/research/d1-fidelity-customer.md §4.
// Rendered above the order list so the customer's first instinct on
// arriving at /service-order/add is the legacy "paste a 1688/taobao
// link" workflow, not the order-history table.
import { LinkPasteSearch } from "./link-paste-search";

/**
 * รายการฝากสั่งซื้อสินค้า — `/service-order/add` route.
 *
 * A FAITHFUL 1:1 TRANSCRIPTION of the legacy PCS Cargo
 * `member/shops.php` default branch — the `if(!isset($_GET['page']) ||
 * $_GET['page']=='add')` block at lines 7-1468 (D1 / ADR-0017 · the
 * faithful-port transcription · runbook
 * `docs/runbook/faithful-port-transcription.md`).
 *
 * This route co-exists with `/service-order` (`service-order/page.tsx`)
 * which transcribes the same `?page` unset / `?page=add` view — the
 * legacy app reaches the SAME server-side branch via either
 * `/shops/` (no `?page`) OR `/shops/?page=add`, so both Pacred URLs
 * render the same listing markup faithfully. The `?page=detail` branch
 * (shops.php L1469+) is a separate Next.js sub-route
 * (`service-order/[hNo]/page.tsx`) and is not transcribed here.
 *
 * `shops.php` source structure transcribed here:
 *   - POST handlers (NOT reproduced — see PURE-READ NOTE)
 *     - addOrder branch                                    (L7-244)
 *     - paymentOrder branch                                (L246-438)
 *     - orderCancelAll branch                              (L440-460)
 *   - <title> + page-CSS <link>s + inline <style>          (L462-691)
 *   - .app-content.content > .content-wrapper
 *     - .content-header > breadcrumb                       (L700-711)
 *     - .content-body.pr110
 *       - juristic-pending gate (tb_corporate)             (L755-758, L1088-1092)
 *       - <section> > .card.border-black
 *         - header row (title + "สั่งสินค้าเพิ่ม" btn)    (L760-782)
 *         - status-tab counters (8 COUNT queries)          (L783-895)
 *         - the order <table id="myTable"> / empty state   (L898-1047)
 *         - print btn-group + b-pay bottom bar             (L1049-1081)
 *   - DataTables + select/cancel jQuery wiring             (L1101-1367)
 *   - SweetAlert flash payloads (sSave/sPay/sCan/eWallet…) (L1369-1466)
 *
 * Data — every `shops.php` mysqli query transcribed 1:1 to the ported
 * legacy `tb_*` schema (Supabase). `tb_*` is RLS-locked to service_role,
 * so reads go through the admin client; the join key is
 * `tb_*.userid === profile.member_code` (the customer's "PR<n>" code).
 *
 * Rebrand DONE: legacy `PCS<n>` member codes + "PCS Cargo" brand →
 * `PR<n>` + Pacred.
 *
 * ── PURE-READ NOTE (runbook rule) ────────────────────────────
 * `shops.php` performs INSERT/UPDATE only inside `$_POST` branches
 * (`addOrder` L8 · `paymentOrder` L246 · `orderCancelAll` L440) — those
 * never fire on a GET render, so they are not reproduced. The legacy
 * `include/header.php` L75-84 ALSO runs a render-time UPDATE that
 * auto-expires every order whose `hdatepayment < NOW()` to `hstatus='6'`
 * — that is a side-effect on page view. Per the runbook a Server
 * Component render MUST be a pure read, so that mutation is NOT
 * reproduced here. TODO(server-action): port the auto-expire to a cron
 * + the three POST handlers to `actions/orders.ts`:
 *   - addOrder      (L8-244)   → actions/orders.ts::createServiceOrder
 *   - paymentOrder  (L246-438) → actions/orders.ts::payServiceOrders
 *   - orderCancelAll(L440-460) → actions/orders.ts::cancelServiceOrders
 *
 * ── UNWIRED INTERACTIONS (flagged, not invented) ─────────────
 * The legacy page is heavily jQuery + DataTables driven:
 *   - DataTables init (sort / responsive / row-checkboxes)  L1189+
 *   - per-row "ยกเลิกออเดอร์" → AJAX cancelOrder.php         L1117-1151
 *   - "ชำระเงิน" multi-select pay → AJAX getListPay.php      L1255-1267
 *   - "ยกเลิกออเดอร์รายการที่เลือก" → AJAX getList.php       L1269-1281
 *   - the b-pay bottom bar live total → AJAX calPrice.php    L1327-1338
 *   - SweetAlert post-action toasts                          L1369-1466
 * The visible markup is transcribed 1:1 (classes kept so the CSS is
 * identical at rest). The jQuery/AJAX behaviour is NOT reproduced —
 * TODO(server-action): wire each AJAX endpoint to the matching Server
 * Action above + a thin "use client" shim for the row-checkbox state.
 */

export const dynamic = "force-dynamic";

// ── Legacy helper: numberLimit() — member/include/function.php L10-13.
// Caps a tab counter at "99+".
function numberLimit(limit: number): string {
  return limit > 99 ? "99+" : String(limit);
}

// ── Legacy helper: statusOrderBadgeAll() — function.php L493-503.
// The order-status badge + status icon (used in the "สถานะ" column).
// The shop-N.png icons were legacy `pcscargo.co.th/member/assets/images/
// icon/shop/`; now resolved via the Supabase mirror (ภูม upload 2026-05-24,
// see lib/legacy-image.ts). Customer-visible — NEVER hardcode pcscargo.co.th.
const SHOP_STATUS_BADGE: Record<
  string,
  { label: string; cls: string; icon?: string }
> = {
  "1": { label: "รอดำเนินการ", cls: "badge-warning", icon: legacyMemberUrl("assets/images/icon/shop/shop-1.png") },
  "2": { label: "รอชำระเงิน", cls: "badge-danger", icon: legacyMemberUrl("assets/images/icon/shop/shop-2.png") },
  "3": { label: "สั่งสินค้า", cls: "badge-info", icon: legacyMemberUrl("assets/images/icon/shop/shop-3.png") },
  "4": { label: "รอร้านจีนจัดส่ง", cls: "badge-primary", icon: legacyMemberUrl("assets/images/icon/shop/shop-4.png") },
  "5": { label: "สำเร็จ", cls: "badge-success", icon: legacyMemberUrl("assets/images/icon/shop/shop-5.png") },
  "6": { label: "ยกเลิกออเดอร์", cls: "badge-danger" },
};

function StatusBadgeAll({ hStatus }: { hStatus: string }) {
  const s = SHOP_STATUS_BADGE[hStatus];
  if (!s) return null;
  return (
    <>
      <span className={`font-13 badge ${s.cls} badge-pill`}>{s.label}</span>
      {s.icon && (
        <>
          <br />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="img-fluid" style={{ maxHeight: "40px", padding: "4px" }} src={s.icon} alt="" />
        </>
      )}
    </>
  );
}

// ── Legacy helper: statusOrderBadgeAllM() — function.php L504-514.
// The mobile variant — identical except no <br/> before the icon.
function StatusBadgeAllM({ hStatus }: { hStatus: string }) {
  const s = SHOP_STATUS_BADGE[hStatus];
  if (!s) return null;
  return (
    <>
      <span className={`font-13 badge ${s.cls} badge-pill`}>{s.label}</span>
      {s.icon && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="img-fluid" style={{ maxHeight: "40px", padding: "4px" }} src={s.icon} alt="" />
      )}
    </>
  );
}

// ── Legacy SQL date formatters — DATE_FORMAT(hDate,'%d/%m/%Y %T'),
// DATE(hDate), TIME(hDate) — reproduced as plain string helpers so the
// rendered cells match the MySQL output exactly.
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function parseDT(s: string | null): Date | null {
  if (!s) return null;
  // tb_header_order.hdate is "timestamp without time zone" — treat the
  // stored wall-clock value literally (no tz shift), like MySQL.
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  return new Date(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    Number(m[4]), Number(m[5]), Number(m[6]),
  );
}
// MySQL DATE(x) → 'YYYY-MM-DD'
function fmtDate(s: string | null): string {
  const d = parseDT(s);
  return d ? `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` : "";
}
// MySQL TIME(x) → 'HH:MM:SS'
function fmtTime(s: string | null): string {
  const d = parseDT(s);
  return d ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}` : "";
}
// MySQL DATE_FORMAT(x,'%d/%m/%Y %T') → 'DD/MM/YYYY HH:MM:SS'
function fmtDMYHMS(s: string | null): string {
  const d = parseDT(s);
  if (!d) return "";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}
// PHP number_format($n,2) — thousands separator + 2 decimals.
function numberFormat2(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type HeaderOrderRow = {
  hno: string;
  hstatus: string;
  hdate: string | null;
  hdatepayment: string | null;
  hcover: string | null;
  htitle: string | null;
  hcount: number | null;
  htotalpricechn: number | null;
  hrate: number | null;
  hshippingchn: number | null;
  hshippingservice: number | null;
  hnoteuser: string | null;
  hnote: string | null;
};

export default async function ServiceOrderAddPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; hNo?: string }>;
}) {
  // header.php L9-72 — the legacy auth gate. Pacred's protected layout
  // already enforces login; resolve the customer's profile here.
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;

  const admin = createAdminClient();
  // $userID — the customer's member code (legacy PCS#### → PR####).
  const userID = profile.member_code ?? "";

  // shops.php L904 — $_GET['q'] = preg_replace("/[^a-z\d]/i", '', q)
  const sp = await searchParams;
  const q = (sp.q ?? "").replace(/[^a-z\d]/gi, "");
  const hNoAnchor = sp.hNo ?? "";

  // ── shops.php L756-758 — เช็คนิติบุคคล: a juristic customer whose
  // corporate record is still pending (corporateStatus=1 → num_rows>0)
  // sees the "waiting for approval" message instead of the screen.
  //   SELECT ID FROM tb_corporate WHERE userID='$userID' AND corporateStatus=1
  const { data: corpRows, error: corpRowsErr } = await admin
    .from("tb_corporate")
    .select("id")
    .eq("userid", userID)
    .eq("corporatestatus", "1");
  if (corpRowsErr) {
    console.error(`[tb_corporate list] failed`, { code: corpRowsErr.code, message: corpRowsErr.message });
  }
  const corporatePending = (corpRows?.length ?? 0) > 0;

  // ── shops.php L784-839 — the 8 status counters (one COUNT per status).
  // Transcribed as PostgREST head:true count queries.
  const countQuery = (status?: string) => {
    let qb = admin
      .from("tb_header_order")
      .select("id", { count: "exact", head: true })
      .eq("userid", userID);
    if (status) qb = qb.eq("hstatus", status);
    return qb;
  };
  // tb_settings.rsdefault — the live yuan exchange rate. Fed into the
  // LinkPasteSearch panel so the ฿ conversion next to the fetched
  // product price matches what the rest of the page chrome shows.
  // Wrapped into the same Promise.all so it's free latency-wise.
  const [cAll, cF1, cF2, cF3, cF4, cF5, cF6, settingsRes] = await Promise.all([
    countQuery(),
    countQuery("1"),
    countQuery("2"),
    countQuery("3"),
    countQuery("4"),
    countQuery("5"),
    countQuery("6"),
    admin
      .from("tb_settings")
      .select("rsdefault")
      .eq("id", 1)
      .maybeSingle<{ rsdefault: number | string | null }>(),
  ]);
  const countStatusAll = cAll.count ?? 0;
  const countStatusF1 = cF1.count ?? 0;
  const countStatusF2 = cF2.count ?? 0;
  const countStatusF3 = cF3.count ?? 0;
  const countStatusF4 = cF4.count ?? 0;
  const countStatusF5 = cF5.count ?? 0;
  const countStatusF6 = cF6.count ?? 0;
  // 5.0 fallback matches the legacy `$rsDefault=5.0` default
  // (calculateCart.php L86 + several other call sites) when the
  // tb_settings row is missing / corrupt — keeps the converter
  // still rendering a sensible ฿ estimate instead of 0.00.
  const rsDefault = Number(settingsRes.data?.rsdefault ?? 5.0);

  // header.php L102 — $countShops2 = orders with hStatus=2 (รอชำระเงิน).
  // Drives the b-pay bottom bar visibility.
  const countShops2 = countStatusF2;

  // ── shops.php L902-917 — the main list query.
  //   SELECT hNoteUser,hNote,hDate,hShippingService,hShippingCHN,hCover,
  //          hTitle,hStatus,hNo,hCount,hTotalPriceCHN,hRate,hDatePayment
  //   FROM tb_header_order WHERE userID=$userID [AND hStatus=$q];
  let listQuery = admin
    .from("tb_header_order")
    .select(
      "hno, hstatus, hdate, hdatepayment, hcover, htitle, hcount, htotalpricechn, hrate, hshippingchn, hshippingservice, hnoteuser, hnote",
    )
    .eq("userid", userID);
  if (["1", "2", "3", "4", "5", "6"].includes(q)) {
    listQuery = listQuery.eq("hstatus", q);
  }
  const { data: rowsData, error: rowsDataErr } = await listQuery;
  if (rowsDataErr) {
    console.error(`[tb_header_order list] failed`, { code: rowsDataErr.code, message: rowsDataErr.message });
  }
  const rows: HeaderOrderRow[] = (rowsData ?? []) as HeaderOrderRow[];

  // ── shops.php L1095-1097 — chProhNo(): looks up tb_promotion for each
  // order's promo badge. The legacy runs one query per row; here all
  // promo rows for the customer's orders are fetched once and mapped.
  const orderHnos = rows.map((r) => r.hno);
  let promoMap = new Map<string, number>();
  if (orderHnos.length > 0) {
    const { data: promoRows, error: promoRowsErr } = await admin
      .from("tb_promotion")
      .select("promoid, hno")
      .in("hno", orderHnos);
    if (promoRowsErr) {
      console.error(`[tb_promotion list] failed`, { code: promoRowsErr.code, message: promoRowsErr.message });
    }
    promoMap = new Map(
      (promoRows ?? []).map((p: { promoid: number; hno: string }) => [p.hno, p.promoid]),
    );
  }

  // ── Multi-select interaction support (wired to actions/service-order.ts) ──
  // Pre-compute per-row totals + the wallet-balance precheck so the
  // client-side b-pay bar can show a live total + a fail-fast shortfall
  // banner without an extra round-trip. The matching server-side checks
  // re-verify ownership / balance inside payServiceOrderFromWallet, so
  // these numbers are display-only (not the security boundary).
  const totalsMap = new Map<string, number>(
    rows.map((r) => [
      r.hno,
      (Number(r.htotalpricechn ?? 0) + Number(r.hshippingchn ?? 0)) *
        Number(r.hrate ?? 0) +
        Number(r.hshippingservice ?? 0),
    ]),
  );
  const payableHNos = rows.filter((r) => r.hstatus === "2").map((r) => r.hno);
  const supabaseRLS = await createClient();
  const walletBalance =
    (await getWalletAvailableBalance(supabaseRLS, data.user.id)) ?? 0;

  return (
    <div className="pcs-legacy">
      {/* Legacy PCS stylesheet — kept ONLY for the residual hook classes the
          client islands + ProBadge still reference. The page chrome below is
          a Tailwind rebuild (เดฟ 2026-05-30 · ปอน: "rebuild chrome เป็น
          tailwind ห้ามแตะ relation/ฟังก์ชั่น"). All hrefs / ids / names /
          form action+method / data-* / hook classes preserved verbatim so the
          BulkActions client wiring + the print <form> still trigger exactly as
          before. Modal-free page (this route has no Bootstrap modals). */}
      <link rel="stylesheet" href="/legacy/pcs/shops.css" />
      {/* shops.php L462 — <title>; rebranded PCS Cargo → Pacred. */}
      <title>รายการฝากสั่งซื้อสินค้า | Pacred</title>

      {/* BEGIN: Content — shops.php L695. Wrapped in `.pcs-content-pad` so the
          (protected) layout's desktop padding (sidebar + FloatingTabs
          clearance) kicks in automatically. */}
      <div className="pcs-content-pad w-full px-3 md:px-6 pt-3 pb-[200px] md:py-6 md:pb-24">
        {/* shops.php L700-711 — breadcrumb */}
        <nav className="mb-3 text-xs md:text-sm text-muted" aria-label="breadcrumb">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/dashboard" className="hover:text-foreground transition-colors">
                <span className="menu-home">หน้าแรก</span>
              </Link>
            </li>
            <li aria-hidden className="text-border">/</li>
            <li className="text-foreground font-medium">รายการฝากสั่งซื้อสินค้า</li>
          </ol>
        </nav>

        <div className="content-body">
            {corporatePending ? (
              // shops.php L1090 — juristic-pending message.
              <div className="mx-auto max-w-[670px] mt-16 md:mt-24 text-center">
                <h2 className="rounded-2xl bg-red-600 text-white px-4 py-6 text-base md:text-lg font-bold leading-relaxed shadow-md">
                  รอเจ้าหน้าที่ดำเนิน อนุมัติการเป็นนิติบุคคล ภายใน 24 ชม. <br /> (ยกเว้นวันอาทิตย์และวันหยุดนักขัตฤกษ์)
                </h2>
              </div>
            ) : (
              <section>
                {/* D1 fidelity §4 — link-paste product search.
                    Placed ABOVE the order list because the legacy
                    `shops.php` led with this exact box and the iconic
                    PCS workflow is "paste link → see product → add to
                    cart". The order-list (below) is what the customer
                    sees AFTER they've placed orders.  See
                    docs/research/d1-fidelity-customer.md §4 +
                    actions/product-search.ts header. */}
                <div className="mb-3">
                  <LinkPasteSearch rsDefault={rsDefault} />
                </div>
                <div>
                  <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
                      {/* shops.php L764-782 — header row */}
                      <div className="border-b border-border px-3 py-2.5 md:px-4 md:py-3 flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
                        <h3 className="flex items-center gap-2 text-base md:text-lg font-bold text-foreground">
                          <span className="font-30 ft-shopping-cart"></span> รายการฝากสั่งซื้อสินค้า
                        </h3>
                        {/* shops.php L773 — legacy href `cart/add`
                            (the add-to-cart screen, cart.php?page=add).
                            Routed to the equivalent Pacred cart route. */}
                        <Link
                          href="/cart"
                          className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-bold transition-colors"
                        >
                          <i className="ft-plus"></i>
                          <span>สั่งสินค้าเพิ่ม</span>
                        </Link>
                      </div>

                      {/* shops.php L841-896 — status-tab counters */}
                      <div className="px-3 py-3 md:px-4 md:py-4">
                          <h4 className="text-sm md:text-base font-bold text-foreground mb-2.5">
                            สถานะรายการ
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            <Link
                              href="/service-order"
                              aria-current={q === "" ? "page" : undefined}
                              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs md:text-sm font-medium border transition-colors ${
                                q === ""
                                  ? "bg-red-600 text-white border-red-600 shadow-sm"
                                  : "bg-surface-alt/60 hover:bg-surface-alt text-foreground border-border"
                              }`}
                            >
                              <span>ทั้งหมด</span>
                              {countStatusAll > 0 && (
                                <span className={`pcs-badge-pill inline-flex items-center justify-center min-w-[22px] h-5 rounded-full text-[10px] font-bold px-1.5 ${q === "" ? "bg-white/25 text-white" : "bg-sky-100 text-sky-700"}`}>
                                  {numberLimit(countStatusAll)}
                                </span>
                              )}
                            </Link>
                            <Link
                              href="/service-order?q=1"
                              aria-current={q === "1" ? "page" : undefined}
                              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs md:text-sm font-medium border transition-colors ${
                                q === "1"
                                  ? "bg-red-600 text-white border-red-600 shadow-sm"
                                  : "bg-surface-alt/60 hover:bg-surface-alt text-foreground border-border"
                              }`}
                            >
                              <span>รอดำเนินการ</span>
                              {countStatusF1 > 0 && (
                                <span className={`pcs-badge-pill inline-flex items-center justify-center min-w-[22px] h-5 rounded-full text-[10px] font-bold px-1.5 ${q === "1" ? "bg-white/25 text-white" : "bg-amber-100 text-amber-700"}`}>
                                  {numberLimit(countStatusF1)}
                                </span>
                              )}
                            </Link>
                            <Link
                              href="/service-order?q=2"
                              aria-current={q === "2" ? "page" : undefined}
                              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs md:text-sm font-medium border transition-colors ${
                                q === "2"
                                  ? "bg-red-600 text-white border-red-600 shadow-sm"
                                  : "bg-surface-alt/60 hover:bg-surface-alt text-foreground border-border"
                              }`}
                            >
                              <span>รอชำระเงิน</span>
                              {countStatusF2 > 0 && (
                                <span className={`pcs-badge-pill inline-flex items-center justify-center min-w-[22px] h-5 rounded-full text-[10px] font-bold px-1.5 ${q === "2" ? "bg-white/25 text-white" : "bg-red-100 text-red-700"}`}>
                                  {numberLimit(countStatusF2)}
                                </span>
                              )}
                            </Link>
                            <Link
                              href="/service-order?q=3"
                              aria-current={q === "3" ? "page" : undefined}
                              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs md:text-sm font-medium border transition-colors ${
                                q === "3"
                                  ? "bg-red-600 text-white border-red-600 shadow-sm"
                                  : "bg-surface-alt/60 hover:bg-surface-alt text-foreground border-border"
                              }`}
                            >
                              <span>สั่งสินค้า</span>
                              {countStatusF3 > 0 && (
                                <span className={`pcs-badge-pill inline-flex items-center justify-center min-w-[22px] h-5 rounded-full text-[10px] font-bold px-1.5 ${q === "3" ? "bg-white/25 text-white" : "bg-amber-100 text-amber-700"}`}>
                                  {numberLimit(countStatusF3)}
                                </span>
                              )}
                            </Link>
                            <Link
                              href="/service-order?q=4"
                              aria-current={q === "4" ? "page" : undefined}
                              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs md:text-sm font-medium border transition-colors ${
                                q === "4"
                                  ? "bg-red-600 text-white border-red-600 shadow-sm"
                                  : "bg-surface-alt/60 hover:bg-surface-alt text-foreground border-border"
                              }`}
                            >
                              <span>รอร้านจีนจัดส่ง</span>
                              {countStatusF4 > 0 && (
                                <span className={`pcs-badge-pill inline-flex items-center justify-center min-w-[22px] h-5 rounded-full text-[10px] font-bold px-1.5 ${q === "4" ? "bg-white/25 text-white" : "bg-amber-100 text-amber-700"}`}>
                                  {numberLimit(countStatusF4)}
                                </span>
                              )}
                            </Link>
                            <Link
                              href="/service-order?q=5"
                              aria-current={q === "5" ? "page" : undefined}
                              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs md:text-sm font-medium border transition-colors ${
                                q === "5"
                                  ? "bg-red-600 text-white border-red-600 shadow-sm"
                                  : "bg-surface-alt/60 hover:bg-surface-alt text-foreground border-border"
                              }`}
                            >
                              <span>สำเร็จ</span>
                              {countStatusF5 > 0 && (
                                <span className={`pcs-badge-pill inline-flex items-center justify-center min-w-[22px] h-5 rounded-full text-[10px] font-bold px-1.5 ${q === "5" ? "bg-white/25 text-white" : "bg-emerald-100 text-emerald-700"}`}>
                                  {numberLimit(countStatusF5)}
                                </span>
                              )}
                            </Link>
                            <Link
                              href="/service-order?q=6"
                              aria-current={q === "6" ? "page" : undefined}
                              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs md:text-sm font-medium border transition-colors ${
                                q === "6"
                                  ? "bg-red-600 text-white border-red-600 shadow-sm"
                                  : "bg-surface-alt/60 hover:bg-surface-alt text-foreground border-border"
                              }`}
                            >
                              <span>ออเดอร์ที่ยกเลิก</span>
                              {countStatusF6 > 0 && (
                                <span className={`pcs-badge-pill inline-flex items-center justify-center min-w-[22px] h-5 rounded-full text-[10px] font-bold px-1.5 ${q === "6" ? "bg-white/25 text-white" : "bg-slate-200 text-slate-700"}`}>
                                  {numberLimit(countStatusF6)}
                                </span>
                              )}
                            </Link>
                          </div>
                          <hr className="my-3 border-t border-dashed border-border" />

                          {/* shops.php L898-1081 — the order table + b-pay bar.
                              Wrapped in <BulkActionsProvider> so row checkboxes,
                              the bulk-cancel button, and the b-pay bottom bar
                              share selection state (matches the legacy
                              DataTables + jQuery wiring at L1101-1367 — one
                              global $('.dt-checkboxes') namespace). */}
                          <BulkActionsProvider
                            payableHNos={payableHNos}
                            totals={totalsMap}
                          >
                          <div>
                            {/* shops.php L899 — <form action="printShop/" method="GET">.
                                printShop is now transcribed to the Pacred
                                route /service-order/print; the form posts
                                there (method=GET, default-locale path). The
                                bulk-cancel + bulk-pay interactions wire up
                                via the wrapping <BulkActionsProvider>; the
                                form retains the print-receipt / print-invoice
                                submit buttons (no checkbox shim needed for
                                those — they submit the q filter). */}
                            <form id="frm-example" action="/service-order/print" method="GET">
                              {countStatusAll > 0 ? (
                                rows.length > 0 ? (
                                  <>
                                    {countShops2 > 0 && (
                                      <div className="text-center md:text-left">
                                        <div style={{ position: "relative" }} className="btn-pay-pc"></div>
                                      </div>
                                    )}
                                    <div className="text-center md:text-left mb-2">
                                      <BulkCancelButton
                                        cancellableHNos={rows
                                          .filter((r) => Number(r.hstatus) <= 2)
                                          .map((r) => r.hno)}
                                      />
                                    </div>
                                    {/* ── Desktop: full table (md+). shops.php L898
                                        DataTables grid; the `none`-class columns
                                        were the legacy responsive hides — here the
                                        whole table is desktop-only, and a card list
                                        below (md:hidden) is the mobile view. ── */}
                                    <div className="hidden md:block overflow-x-auto rounded-xl border border-border">
                                      <table
                                        id="myTable"
                                        className="dataTable w-full text-sm border-collapse"
                                      >
                                        <thead>
                                          <tr className="bg-surface-alt/70 text-center text-xs font-bold text-muted">
                                            {/* Checkbox column — legacy DataTables
                                                auto-added it via the responsive
                                                plugin (L1189+). Visible only for
                                                rows where bulk-cancel or bulk-pay
                                                applies (hstatus <= 2). */}
                                            <th className="all px-2 py-2.5 border-b border-border" style={{ width: "32px" }}></th>
                                            <th className="all add-text-all px-3 py-2.5 border-b border-border">ID</th>
                                            <th className="none px-3 py-2.5 border-b border-border">วันที่สร้าง</th>
                                            <th className="none px-3 py-2.5 border-b border-border">ออเดอร์เลขที่</th>
                                            <th className="all px-3 py-2.5 border-b border-border text-left">ข้อมูลสินค้า</th>
                                            <th className="none px-3 py-2.5 border-b border-border">สถานะ</th>
                                            <th className="none px-3 py-2.5 border-b border-border">ราคา (บาท)</th>
                                            <th className="none px-3 py-2.5 border-b border-border">ตัวเลือก</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {rows.map((row) => {
                                            // shops.php L963-964 / L998-1000 — price math
                                            const pricePayNum =
                                              (Number(row.htotalpricechn ?? 0) + Number(row.hshippingchn ?? 0)) *
                                                Number(row.hrate ?? 0) +
                                              Number(row.hshippingservice ?? 0);
                                            const pricePay = numberFormat2(pricePayNum);

                                            // shops.php L969-978 — hCover URL resolution
                                            let hCover: string;
                                            const cover = row.hcover ?? "";
                                            if (/https|http/m.test(cover)) {
                                              const cleaned = cover
                                                .replace("?x-oss-process=style/alsy", "")
                                                .replace("?x-oss-process=style/tbsy", "")
                                                .replace("_250x250.jpg", "");
                                              hCover = cleaned + "_150x150.jpg";
                                            } else if (cover !== "") {
                                              hCover = legacyMemberUrl(`images/shops/${cover}`);
                                            } else {
                                              hCover = "/legacy/pcs/shops/default.png";
                                            }
                                            const promoId = promoMap.get(row.hno);
                                            return (
                                              <tr
                                                key={row.hno}
                                                {...(hNoAnchor && hNoAnchor === row.hno
                                                  ? { className: "anchor bg-red-50 dark:bg-red-950/30", id: row.hno }
                                                  : { className: "even:bg-surface-alt/30" })}
                                              >
                                                {/* col 0 — row checkbox (legacy
                                                    DataTables auto-injected; gated
                                                    on hstatus<=2 — the legacy
                                                    bulk-cancel + bulk-pay scope). */}
                                                <td className="text-center align-top px-2 py-3 border-b border-border" style={{ width: "32px" }}>
                                                  <RowCheckbox
                                                    hNo={row.hno}
                                                    selectable={Number(row.hstatus) <= 2}
                                                  />
                                                </td>
                                                {/* col 1 — ID */}
                                                <td className="text-center align-top px-3 py-3 border-b border-border tr1 notranslate font-medium">{row.hno}</td>
                                                {/* col 2 — วันที่สร้าง */}
                                                <td className="text-center align-top px-3 py-3 border-b border-border text-xs text-muted whitespace-nowrap">
                                                  {fmtDate(row.hdate)}
                                                  <br />
                                                  {fmtTime(row.hdate)} น.
                                                </td>
                                                {/* col 3 — ออเดอร์เลขที่.
                                                    Legacy linked to pcscargo.co.th/member/shops/detail/{hno}/
                                                    — rewritten to the internal Pacred route
                                                    /service-order/{hno} so the customer stays inside
                                                    Pacred (no bounce to the legacy site). */}
                                                <td className="align-top px-3 py-3 border-b border-border notranslate">
                                                  <Link
                                                    href={`/service-order/${row.hno}`}
                                                    className="text-info"
                                                  >
                                                    {row.hno}
                                                  </Link>{" "}
                                                  <ProBadge promoId={promoId} />
                                                </td>
                                                {/* col 4 — ข้อมูลสินค้า */}
                                                <td className="align-top px-3 py-3 border-b border-border">
                                                  <div className="d-block d-sm-none">
                                                    วันที่สร้าง :{" "}
                                                    <span className="font-12">{fmtDMYHMS(row.hdate)}</span>
                                                    <br />
                                                    เลขที่ออเดอร์ :{" "}
                                                    <Link
                                                      href={`/service-order/${row.hno}`}
                                                      className="text-info"
                                                    >
                                                      {row.hno}
                                                    </Link>{" "}
                                                    <ProBadge promoId={promoId} />
                                                    <br />
                                                    สถานะ : <StatusBadgeAllM hStatus={row.hstatus} />
                                                    <br />
                                                    ราคา : <span className="text-danger">{pricePay}</span> บาท
                                                  </div>
                                                  <div className="float-right ml-2">
                                                    <a
                                                      className="image-popup-vertical-fit el-link"
                                                      href={hCover.replace("_150x150.jpg", "")}
                                                    >
                                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                                      <img className="rounded-lg border border-border" src={hCover} width={60} alt="" />
                                                    </a>
                                                  </div>
                                                  <Link
                                                    href={`/service-order/${row.hno}`}
                                                    className="text-info font-medium"
                                                  >
                                                    {row.htitle}
                                                    {Number(row.hcount ?? 0) > 1 &&
                                                      ` และอีก ${Math.round(Number(row.hcount) - 1)} รายการ`}
                                                  </Link>
                                                  {row.hstatus === "2" && (
                                                    <>
                                                      <br />
                                                      กรุณาชำระเงินก่อน{" "}
                                                      <span className="text-danger">{fmtDMYHMS(row.hdatepayment)}</span>{" "}
                                                      น.
                                                    </>
                                                  )}
                                                  {row.hnoteuser === "2" && (
                                                    <div className="mt-1 rounded-md bg-red-600 text-white text-xs px-2 py-1">
                                                      หมายเหตุ : {row.hnote}
                                                    </div>
                                                  )}
                                                </td>
                                                {/* col 5 — สถานะ */}
                                                <td className="text-center align-top px-3 py-3 border-b border-border">
                                                  <StatusBadgeAll hStatus={row.hstatus} />
                                                </td>
                                                {/* col 6 — ราคา (บาท) */}
                                                <td className="text-right align-top px-3 py-3 border-b border-border font-medium whitespace-nowrap">{pricePay}</td>
                                                {/* col 7 — ตัวเลือก */}
                                                <td className="text-center align-top px-3 py-3 border-b border-border">
                                                  <div className="flex flex-col items-stretch gap-1.5 min-w-[120px]">
                                                  {Number(row.hstatus) <= 2 && (
                                                    // shops.php L1005 — onclick deleteOrder(hNo)
                                                    // → AJAX cancelOrder.php. Now wired to
                                                    // actions/service-order.ts::cancelServiceOrder
                                                    // via the <RowCancelButton> client shim.
                                                    <RowCancelButton hNo={row.hno} />
                                                  )}
                                                  <Link href={`/service-order/${row.hno}`}>
                                                    <p className="block rounded-lg border border-emerald-600 text-emerald-700 hover:bg-emerald-50 text-xs font-bold px-3 py-1.5 text-center transition-colors">
                                                      ดูรายละเอียด
                                                    </p>
                                                  </Link>
                                                  {row.hstatus === "2" && (
                                                      <Link
                                                        href={`/service-order/${row.hno}?pay=true`}
                                                      >
                                                        <p className="flex items-center justify-center gap-1 rounded-lg border border-sky-600 text-sky-700 hover:bg-sky-50 text-xs font-bold px-3 py-1.5 text-center transition-colors">
                                                          <i className="mdi mdi-check-circle-outline"></i> ชำระเงิน
                                                        </p>
                                                      </Link>
                                                  )}
                                                  {/* shops.php L1012 — "พิมพ์ใบเสร็จ"
                                                      → the transcribed print route
                                                      (?print=1 = the receipt). */}
                                                  {row.hstatus === "5" && (
                                                    <Link
                                                      href={`/service-order/print?print=1&id=${row.hno}`}
                                                      target="_blank"
                                                    >
                                                      <p className="block rounded-lg border border-indigo-500 text-indigo-600 hover:bg-indigo-50 text-xs font-bold px-3 py-1.5 text-center transition-colors">
                                                        พิมพ์ใบเสร็จ
                                                      </p>
                                                    </Link>
                                                  )}
                                                  {/* shops.php L1015 — "พิมพ์ใบแจ้งหนี้"
                                                      → the transcribed print route
                                                      (?print=2 = the invoice). */}
                                                  {Number(row.hstatus) > 1 && Number(row.hstatus) < 6 && (
                                                    <Link
                                                      href={`/service-order/print?print=2&id=${row.hno}`}
                                                      target="_blank"
                                                    >
                                                      <p className="block rounded-lg border border-red-500 text-red-600 hover:bg-red-50 text-xs font-bold px-3 py-1.5 text-center transition-colors">
                                                        พิมพ์ใบแจ้งหนี้
                                                      </p>
                                                    </Link>
                                                  )}
                                                  </div>
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>

                                    {/* ── Mobile: card list (below md). Mirrors the
                                        legacy `d-block d-sm-none` summary block —
                                        same data, same hrefs / ids / hook classes,
                                        no horizontal scroll at 360px. ── */}
                                    <div className="md:hidden space-y-3">
                                      {rows.map((row) => {
                                        // shops.php L963-964 / L998-1000 — price math
                                        const pricePayNum =
                                          (Number(row.htotalpricechn ?? 0) + Number(row.hshippingchn ?? 0)) *
                                            Number(row.hrate ?? 0) +
                                          Number(row.hshippingservice ?? 0);
                                        const pricePay = numberFormat2(pricePayNum);

                                        // shops.php L969-978 — hCover URL resolution
                                        let hCover: string;
                                        const cover = row.hcover ?? "";
                                        if (/https|http/m.test(cover)) {
                                          const cleaned = cover
                                            .replace("?x-oss-process=style/alsy", "")
                                            .replace("?x-oss-process=style/tbsy", "")
                                            .replace("_250x250.jpg", "");
                                          hCover = cleaned + "_150x150.jpg";
                                        } else if (cover !== "") {
                                          hCover = legacyMemberUrl(`images/shops/${cover}`);
                                        } else {
                                          hCover = "/legacy/pcs/shops/default.png";
                                        }
                                        const promoId = promoMap.get(row.hno);
                                        return (
                                          <div
                                            key={row.hno}
                                            className={`rounded-2xl border bg-white dark:bg-surface shadow-sm p-3 ${
                                              hNoAnchor && hNoAnchor === row.hno
                                                ? "border-red-400 ring-2 ring-red-500/30"
                                                : "border-border"
                                            }`}
                                          >
                                            <div className="flex gap-3">
                                              <a
                                                className="image-popup-vertical-fit el-link shrink-0"
                                                href={hCover.replace("_150x150.jpg", "")}
                                              >
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img className="rounded-lg border border-border" src={hCover} width={64} alt="" />
                                              </a>
                                              <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-2">
                                                  <span className="notranslate text-xs text-muted">#{row.hno}</span>
                                                  <StatusBadgeAllM hStatus={row.hstatus} />
                                                </div>
                                                <Link
                                                  href={`/service-order/${row.hno}`}
                                                  className="text-info font-medium block mt-0.5 line-clamp-2"
                                                >
                                                  {row.htitle}
                                                  {Number(row.hcount ?? 0) > 1 &&
                                                    ` และอีก ${Math.round(Number(row.hcount) - 1)} รายการ`}
                                                </Link>
                                                <div className="mt-1 text-xs text-muted">
                                                  วันที่สร้าง :{" "}
                                                  <span className="notranslate">{fmtDMYHMS(row.hdate)}</span>
                                                </div>
                                                <div className="mt-0.5 text-sm">
                                                  ราคา : <span className="text-danger font-bold">{pricePay}</span> บาท
                                                </div>
                                                <div className="mt-1">
                                                  <ProBadge promoId={promoId} />
                                                </div>
                                              </div>
                                            </div>
                                            {row.hstatus === "2" && (
                                              <div className="mt-2 text-xs">
                                                กรุณาชำระเงินก่อน{" "}
                                                <span className="text-danger">{fmtDMYHMS(row.hdatepayment)}</span>{" "}
                                                น.
                                              </div>
                                            )}
                                            {row.hnoteuser === "2" && (
                                              <div className="mt-2 rounded-md bg-red-600 text-white text-xs px-2 py-1">
                                                หมายเหตุ : {row.hnote}
                                              </div>
                                            )}
                                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                              {Number(row.hstatus) <= 2 && (
                                                <RowCancelButton hNo={row.hno} />
                                              )}
                                              <Link href={`/service-order/${row.hno}`} className="flex-1 min-w-[120px]">
                                                <p className="block rounded-lg border border-emerald-600 text-emerald-700 text-xs font-bold px-3 py-2 text-center min-h-[40px] leading-6">
                                                  ดูรายละเอียด
                                                </p>
                                              </Link>
                                              {row.hstatus === "2" && (
                                                <Link href={`/service-order/${row.hno}?pay=true`} className="flex-1 min-w-[120px]">
                                                  <p className="flex items-center justify-center gap-1 rounded-lg border border-sky-600 text-sky-700 text-xs font-bold px-3 py-2 text-center min-h-[40px]">
                                                    <i className="mdi mdi-check-circle-outline"></i> ชำระเงิน
                                                  </p>
                                                </Link>
                                              )}
                                              {row.hstatus === "5" && (
                                                <Link
                                                  href={`/service-order/print?print=1&id=${row.hno}`}
                                                  target="_blank"
                                                  className="flex-1 min-w-[120px]"
                                                >
                                                  <p className="block rounded-lg border border-indigo-500 text-indigo-600 text-xs font-bold px-3 py-2 text-center min-h-[40px] leading-6">
                                                    พิมพ์ใบเสร็จ
                                                  </p>
                                                </Link>
                                              )}
                                              {Number(row.hstatus) > 1 && Number(row.hstatus) < 6 && (
                                                <Link
                                                  href={`/service-order/print?print=2&id=${row.hno}`}
                                                  target="_blank"
                                                  className="flex-1 min-w-[120px]"
                                                >
                                                  <p className="block rounded-lg border border-red-500 text-red-600 text-xs font-bold px-3 py-2 text-center min-h-[40px] leading-6">
                                                    พิมพ์ใบแจ้งหนี้
                                                  </p>
                                                </Link>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </>
                                ) : (
                                  // shops.php L1022-1029 — filtered query empty
                                  <div className="text-center py-8">
                                    <h4 className="text-base md:text-lg font-bold text-foreground mb-3">คุณยังไม่มีข้อมูลฝากสั่งซื้อ</h4>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img className="mx-auto max-w-[240px] w-full h-auto" src="/legacy/pcs/shop-2-300x300.png" alt="" />
                                  </div>
                                )
                              ) : (
                                // shops.php L1034-1047 — no orders at all
                                <div className="text-center py-8">
                                  <Link href="/cart" className="inline-block">
                                    <h4 className="text-base md:text-lg font-bold text-foreground mb-3">คุณยังไม่มีรายการฝากสั่งซื้อ</h4>
                                    <div className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-bold transition-colors">
                                      <i className="ft-plus"></i>
                                      <span>สั่งสินค้าเพิ่ม</span>
                                    </div>
                                  </Link>
                                  <div className="mt-4">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img className="mx-auto max-w-[240px] w-full h-auto" src="/legacy/pcs/shop-2-300x300.png" alt="" />
                                  </div>
                                </div>
                              )}

                              {/* shops.php L1049-1056 — the print btn-group
                                  (shown only on filtered tabs except q=1/q=6) */}
                              {q !== "" && q !== "1" && q !== "6" && (
                                <div
                                  className={`btn-group ${q === "2" ? "t" : ""} fixed left-1/2 -translate-x-1/2 md:left-auto md:translate-x-0 flex gap-2`}
                                  role="group"
                                  aria-label="Basic example"
                                  style={{ position: "fixed", bottom: "20px", zIndex: 999 }}
                                >
                                  <button
                                    type="submit"
                                    className="bg-red-600 hover:bg-red-700 text-white rounded-lg px-4 py-2 text-sm font-bold shadow-lg transition-colors"
                                    name="print"
                                    value="2"
                                  >
                                    พิมพ์ใบแจ้งหนี้
                                  </button>
                                  {q === "5" && (
                                    <button
                                      type="submit"
                                      className="bg-red-600 hover:bg-red-700 text-white rounded-lg px-4 py-2 text-sm font-bold shadow-lg transition-colors"
                                      name="print"
                                      value="1"
                                    >
                                      พิมพ์ใบเสร็จสินค้า
                                    </button>
                                  )}
                                </div>
                              )}
                            </form>
                          </div>

                          {/* shops.php L1059-1081 — the b-pay bottom bar.
                              `#select` → legacy AJAX getListPay.php →
                              POST `paymentOrder` (L246-438). Now wired to
                              actions/service-order.ts::payServiceOrderFromWallet
                              via the <BulkPayBar> client shim (wallet-
                              sufficient branch, matches legacy L281-326);
                              the legacy slip-upload top-up branch (L328-430)
                              is out of scope on this view — customers with
                              insufficient balance see an inline shortfall
                              banner pointing at the wallet top-up flow,
                              same as `pay-from-wallet-button.tsx`. */}
                          <div>
                            {countShops2 > 0 && (q === "" || q === "2") && (
                              <BulkPayBar walletBalance={walletBalance} />
                            )}
                          </div>
                          </BulkActionsProvider>
                      </div>
                  </div>
                </div>
              </section>
            )}
          </div>
          {/* shops.php L1094-1096 — AJAX target containers */}
          <div id="list-pay-data"></div>
          <div id="list-pay-data2"></div>
          <div id="resulte"></div>
      </div>
      {/* END: Content */}
    </div>
  );
}

/**
 * Transcribes the legacy `chProhNo()` helper (function.php L1095-1183):
 * renders the promotion badge next to an order number based on the
 * `tb_promotion.promoid` for that order. The legacy `switch` has cases
 * 1-77 (no case 53) + a `default:` of empty — reproduced 1:1.
 *
 * Branding `PCS` → `PR`: the legacy promo links resolved from
 * `basePath.'../'` = `https://pcscargo.co.th/<slug>` — REWRITTEN to the
 * Pacred `/services/import-china?ref=<slug>` landing per pcs-scrub-plan
 * so the customer stays inside Pacred. Original slug is preserved as
 * the `?ref=` query string for analytics + future Pacred-hosted promo
 * page resolution.
 */
function ProBadge({ promoId }: { promoId: number | undefined }) {
  if (promoId == null) return null;
  // function.php L1102-1107 — cases 1-6 are PLAIN badges (no link).
  const PLAIN: Record<number, string> = {
    1: "Pro 3.15",
    2: "Pro 4.4",
    3: "Pro 4.25",
    4: "Pro 5.5",
    5: "Pro 5.15",
    6: "Pro 6.6",
  };
  // function.php L1108-1177 — cases 7-77 (no 53) are LINKED badges.
  // Legacy `basePath.'../'` resolved to `https://pcscargo.co.th/` —
  // REWRITTEN to the Pacred /services/import-china landing per
  // pcs-scrub-plan so the customer stays inside Pacred. The original
  // promo slug is preserved as a `?ref=` query string for analytics +
  // future Pacred-hosted promo page resolution.
  const B = "/services/import-china?ref=";
  const LINKED: Record<number, { label: string; title: string; href: string }> = {
    7: { label: "Pro 6.25", title: "เรท 5.39 และ ขนส่ง 5%", href: `${B}โปรโมชัน-6-25` },
    8: { label: "Pro 7.7", title: "เรท 5.42", href: `${B}โปรโมชัน-7-7` },
    9: { label: "Pro 7.25", title: "เรท 5.54 และ ขนส่ง 3%", href: `${B}โปรโมชัน-7-25` },
    10: { label: "Pro 8.8", title: "เรท 5.57", href: `${B}โปรโมชัน-8-8` },
    11: { label: "Pro 8.25", title: "เรท 5.49 และขนส่ง 3%", href: `${B}โปรโมชัน-8-25` },
    12: { label: "Pro 9.9", title: "เรท 5.49", href: `${B}โปรโมชัน-9-9` },
    13: { label: "Pro Survey", title: "เรท 5.49", href: `${B}โปรโมชัน-9-16` },
    14: { label: "Pro 10.10", title: "เรท 5.48", href: `${B}โปรโมชัน-10-10` },
    15: { label: "Pro 10.25", title: "เรท 5.49 ขนส่ง 3%", href: `${B}โปรโมชัน-10-25` },
    16: { label: "Pro 11.11", title: "เรท 5.47 ขนส่ง -11 บาท", href: `${B}โปรโมชัน-11-11` },
    17: { label: "Pro 11.25", title: "เรท 5.44", href: `${B}โปรโมชัน/โปรโมชัน-11-25` },
    18: { label: "Pro 12.12", title: "เรท 5.22", href: `${B}โปรโมชัน/โปรโมชัน-12-12` },
    19: { label: "Pro Valentine", title: "เรท 5.10", href: `${B}โปรโมชัน/โปรโมชัน-วาเลนไทน์` },
    20: { label: "Pro 3.3", title: "เรท 5.18", href: `${B}โปรโมชัน/โปรโมชัน-2023-3-3/` },
    21: { label: "Pro Songkran", title: "เรท 5.15", href: `${B}โปรโมชัน/โปรโมชัน-songkran-2023/` },
    22: { label: "Pro เลือกตั้ง", title: "เรท 5.18", href: `${B}โปรโมชัน/โปรโมชัน-เลือกตั้ง-2566/` },
    23: { label: "Pro Surveyนี้ โอเคมั๊ย", title: "เรท 5.10", href: `${B}โปรโมชัน/โปรโมชัน-survey-นี้-โอเคมั๊ย/` },
    24: { label: "Pride month 06", title: "เรท 5.06", href: `${B}โปรโมชัน/โปรโมชัน-pride-month-2023-06/` },
    25: { label: "Pro 7.7", title: "เรท 5.06", href: `${B}โปรโมชัน/โปรโมชัน-2023-7-7/` },
    26: { label: "Pro แซงทางโค้ง", title: "เรท 5.05", href: `${B}โปรโมชัน/โปรโมชัน-2023-7-โปรดี/` },
    27: { label: "Happy Mother’s Day", title: "เรท 5.04", href: `${B}โปรโมชัน/2023-08-happy-mother-day/` },
    28: { label: "ไม่ต้องทุบกระปุก", title: "เรท 5.04", href: `${B}โปรโมชัน/2023-08-ไม่ต้องทุบกระปุกช้อป/` },
    29: { label: "3 Year Anniversary", title: "เรท 5.04", href: `${B}โปรโมชัน/pcs-3-year-anniversary/` },
    30: { label: "Oh! My Ghost", title: "เรท 5.17", href: `${B}โปรโมชัน/pcs-oh-my-ghost-2023/` },
    31: { label: "ล่าท้าเรทหยวน", title: "เรท 5.15", href: `${B}โปรโมชัน/challeng-yuan-rate-10-2023/` },
    32: { label: "สุขลันตลิ่ง", title: "เรท 5.14", href: `${B}โปรโมชัน/สุขลันตลิ่ง-2023/` },
    33: { label: "สุขสันต์วันปีใหม่", title: "เรท 5.15", href: `${B}โปรโมชัน/สุขสันต์วันปีใหม่จาก-pcs-cargo/` },
    34: { label: "ซินเจียยู่อี่", title: "เรท 5.12", href: `${B}โปรโมชัน/ซินเจียยู่อี่-2024/` },
    35: { label: "ช้อปฉลองปีมังกร", title: "เรท 5.14", href: `${B}โปรโมชัน/ช้อปฉลองปีมังกร-2024/` },
    36: { label: "Happy March", title: "เรท 5.17", href: `${B}โปรโมชัน/มีนานี้-สต๊อกสินค้าไว้ร/` },
    37: { label: "สงกรานต์ 2024", title: "เรท 5.15", href: `${B}โปรโมชัน/สงกรานต์-2024/` },
    38: { label: "End of month 04/2024", title: "เรท 5.18", href: `${B}โปรโมชัน/endofmonth-04-2024/` },
    39: { label: "5.5 Double Day/", title: "เรท 5.20", href: `${B}โปรโมชัน/2024-5-5-double-day/` },
    40: { label: "May Day", title: "เรท 5.22", href: `${B}โปรโมชัน/2024-may-day/` },
    41: { label: "Late May", title: "เรท 5.20", href: `${B}โปรโมชัน/late-may-2024-05/` },
    42: { label: "MID YEAR", title: "เรท 5.22", href: `${B}โปรโมชัน/mid-year-2024-06/` },
    43: { label: "BYE BYE JUNE", title: "เรท 5.22", href: `${B}โปรโมชัน/bye-bye-june-2024/` },
    44: { label: "LUCK DAY SPACIAL", title: "เรท 5.22", href: `${B}โปรโมชัน/luck-day-spacial-2024/` },
    45: { label: "JULY JUMBO SALE", title: "เรท 5.20", href: `${B}โปรโมชัน/july-jumbo-sale-7-24/` },
    46: { label: "8.8 Aug", title: "เรท 5.15", href: `${B}โปรโมชัน/8-8-august-attraction-sale-2024/` },
    47: { label: "Final Aug", title: "เรท 5.10", href: `${B}โปรโมชัน/final-august-flash-sale-2024/` },
    48: { label: "9.9 Double Day", title: "เรท 5.05", href: `${B}โปรโมชัน/9-9-double-day/` },
    49: { label: "October Save", title: "เรท 4.95", href: `${B}โปรโมชัน/2024-10-october-save-เวอร์/` },
    50: { label: "Fright Night", title: "เรท 4.94", href: `${B}โปรโมชัน/fright-night-special-2024/` },
    51: { label: "พฤศจิกาพาเซฟ", title: "เรท 4.97", href: `${B}โปรโมชัน/พฤศจิกาพาเซฟ-2024/` },
    52: { label: "NOVEMBER Super Pro", title: "เรท 5.02", href: `${B}โปรโมชัน/november-super-pro-2024/` },
    54: { label: "SANTAS SURPRIESALE", title: "เรท 4.93", href: `${B}โปรโมชัน/santas-surprisesale-2024/` },
    55: { label: "โปรโมชั่นนำเข้าสินค้าจากจีน", title: "เรท 4.89", href: `${B}โปรโมชัน/โปรโมชั่นนำเข้าจีน/` },
    56: { label: "February Fever Sale", title: "เรท 4.87", href: `${B}โปรโมชัน/february-fever-sale-2025/` },
    57: { label: "March madness", title: "เรท 4.85", href: `${B}โปรโมชัน/march-madness-2025/` },
    58: { label: "MEGA YUAN MARCH", title: "เรท 4.87", href: `${B}โปรโมชัน/mega-yuan-march-2025/` },
    59: { label: "MARCH YUAN DEAL", title: "เรท 4.85", href: `${B}โปรโมชัน/march-yuan-deal-2025/` },
    60: { label: "นำเข้าสินค้าจากจีน", title: "เรท 4.85", href: `${B}โปรโมชัน/โปรนำเข้าสินค้าจีน-4-2025/` },
    61: { label: "นำเข้าสินค้าจากจีน", title: "เรท 4.89", href: `${B}โปรโมชัน/โปรนำเข้าสินค้าจีน-5-5-2025/` },
    62: { label: "นำเข้าสินค้าจากจีน", title: "เรท 4.79", href: `${B}โปรโมชัน/โปรนำเข้าสินค้าจีน-19-5-2025/` },
    63: { label: "นำเข้าสินค้าจากจีน", title: "เรท 4.77", href: `${B}โปรโมชัน/โปรนำเข้าสินค้าจีน-6-6-2025/` },
    64: { label: "นำเข้าสินค้าจากจีน", title: "เรท 4.75", href: `${B}โปรโมชัน/โปรโมชันกลางปี-2025/` },
    65: { label: "โปรโมชัน 7.7", title: "เรท 4.75", href: `${B}โปรโมชัน/โปรโมชัน-2025-7-7/` },
    66: { label: "โปรโมชัน 8.8", title: "เรท 4.72", href: `${B}โปรโมชัน/นำเข้าจีน082025/` },
    67: { label: "โปรโมชันกลางเดือน", title: "เรท 4.73", href: `${B}โปรโมชัน/นำเข้าจีน18082025/` },
    68: { label: "โปรโมชัน 9.9", title: "เรท 4.71", href: `${B}โปรโมชัน/นำเข้าจีน09092025/` },
    69: { label: "โปรโมชัน 9.22", title: "เรท 4.72", href: `${B}โปรโมชัน/นำเข้าจีน09222025/` },
    70: { label: "โปรโมชัน 10.10", title: "เรท 4.73", href: `${B}โปรโมชัน/นำเข้าจีน10102025/` },
    71: { label: "โปรโมชันนำเข้าจีน", title: "เรท 4.79", href: `${B}โปรโมชัน/นำเข้าจีน21102025/` },
    72: { label: "โปรโมชัน 11.11", title: "เรท 4.79", href: `${B}โปรโมชัน/นำเข้าจีน11112025/` },
    73: { label: "โปรโมชัน 25.11", title: "เรท 4.78", href: `${B}โปรโมชัน/นำเข้าจีน25112025/` },
    74: { label: "โปรโมชัน 12.12", title: "เรท 4.78", href: `${B}โปรโมชัน/นำเข้าจีน251212/` },
    75: { label: "โปรโมชัน 12.17", title: "เรท 4.76", href: `${B}โปรโมชัน/นำเข้าจีน251217/` },
    76: { label: "โปรโมชัน 1.20", title: "เรท 4.75", href: `${B}โปรโมชัน/นำเข้าจีน260120/` },
    77: { label: "โปรโมชัน 3.3", title: "เรท 4.70", href: `${B}โปรโมชัน/นำเข้าจีน260303/` },
  };
  // The legacy prepends a leading space to $text (' <span ...>'); the
  // JSX caller already inserts a `{" "}` before <ProBadge/>.
  if (PLAIN[promoId]) {
    return <span className="badge badge-vip badge-pill">{PLAIN[promoId]}</span>;
  }
  const linked = LINKED[promoId];
  if (linked) {
    return (
      <a href={linked.href} target="_blank" rel="noopener noreferrer">
        <span className="badge badge-vip badge-pill" title={linked.title}>
          {linked.label}
        </span>
      </a>
    );
  }
  // function.php L1178-1179 — default: empty.
  return null;
}
