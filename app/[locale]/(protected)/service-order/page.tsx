import { redirect } from "next/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";

/**
 * รายการฝากสั่งซื้อสินค้า — a FAITHFUL 1:1 TRANSCRIPTION of the legacy
 * PCS Cargo `member/shops.php` default view (D1 / ADR-0017 · the
 * faithful-port transcription · runbook
 * `docs/runbook/faithful-port-transcription.md`).
 *
 * This is a transcription, NOT a reinterpretation. The JSX below is the
 * exact HTML markup `shops.php` renders for `?page` unset / `?page=add`
 * (lines 692-1100) — same elements, same Bootstrap-4 class names, same
 * structure, same Thai labels, same order. The `?page=detail` branch
 * (shops.php L1469+) is a separate Next.js sub-route, not transcribed
 * here. The visual identity comes from the legacy CSS, brought in
 * verbatim as the static `.pcs-legacy`-scoped `public/legacy/pcs/shops.css`,
 * loaded via a plain `<link>` so it bypasses the app's Tailwind v4 /
 * PostCSS pipeline.
 *
 * `shops.php` source structure transcribed here:
 *   - <title> + page-CSS <link>s + inline <style>      (L462-691)
 *   - .app-content.content > .content-wrapper
 *     - .content-header > breadcrumb                   (L700-711)
 *     - .content-body.pr110
 *       - juristic-pending gate (tb_corporate)         (L755-758, L1088-1092)
 *       - <section> > .card.border-black
 *         - header row (title + "สั่งสินค้าเพิ่ม" btn) (L760-782)
 *         - status-tab counters (8 COUNT queries)      (L783-895)
 *         - the order <table id="myTable"> / empty st  (L898-1047)
 *         - print btn-group + b-pay bottom bar         (L1049-1081)
 *
 * Data — every `shops.php` mysqli query transcribed 1:1 to the ported
 * legacy `tb_*` schema (Supabase). `tb_*` is RLS-locked to service_role,
 * so reads go through the admin client; the join key is
 * `tb_*.userid === profile.member_code` (the customer's "PR<n>" code).
 *
 * Rebrand: legacy `PCS<n>` → `PR<n>` (member codes) + branding text only.
 *
 * ── PURE-READ NOTE (runbook rule) ────────────────────────────
 * `shops.php` performs INSERT/UPDATE only inside `$_POST` branches
 * (`addOrder` L8 · `paymentOrder` L246 · `orderCancelAll` L440) — those
 * never fire on a GET render, so they are not reproduced. The legacy
 * `include/header.php` L75-84 ALSO runs a render-time UPDATE that
 * auto-expires every order whose `hdatepayment < NOW()` to `hstatus='6'`
 * — that is a side-effect on page view. Per the runbook a Server
 * Component render MUST be a pure read, so that mutation is NOT
 * reproduced here (flagged in the agent report — needs a cron/Server
 * Action to stay faithful).
 *
 * ── UNWIRED INTERACTIONS (flagged, not invented) ─────────────
 * The legacy page is heavily jQuery + DataTables driven:
 *   - DataTables init (sort / responsive / row-checkboxes)  L1189+
 *   - per-row "ยกเลิกออเดอร์" → AJAX cancelOrder.php         L1117-1151
 *   - "ชำระเงิน" multi-select pay → AJAX getListPay.php      L1255-1267
 *   - "ยกเลิกออเดอร์รายการที่เลือก" → AJAX getList.php       L1269-1281
 *   - the b-pay bottom bar live total → AJAX calPrice.php    L1327-1338
 * The visible markup is transcribed 1:1 (classes kept so the CSS is
 * identical at rest). The jQuery/AJAX behaviour is NOT reproduced —
 * faithfully wiring it needs the ported endpoints + a client shim,
 * a follow-up task. The static surface matches the legacy.
 */

export const dynamic = "force-dynamic";

// ── Legacy helper: numberLimit() — member/include/function.php L10-13.
// Caps a tab counter at "99+".
function numberLimit(limit: number): string {
  return limit > 99 ? "99+" : String(limit);
}

// ── Legacy helper: statusOrderBadgeAll() — function.php L493-503.
// The order-status badge + status icon (used in the "สถานะ" column).
// The shop-N.png icons are referenced by the legacy absolute
// https://pcscargo.co.th/... URL exactly as the legacy does.
const SHOP_STATUS_BADGE: Record<
  string,
  { label: string; cls: string; icon?: string }
> = {
  "1": { label: "รอดำเนินการ", cls: "badge-warning", icon: "https://pcscargo.co.th/member/assets/images/icon/shop/shop-1.png" },
  "2": { label: "รอชำระเงิน", cls: "badge-danger", icon: "https://pcscargo.co.th/member/assets/images/icon/shop/shop-2.png" },
  "3": { label: "สั่งสินค้า", cls: "badge-info", icon: "https://pcscargo.co.th/member/assets/images/icon/shop/shop-3.png" },
  "4": { label: "รอร้านจีนจัดส่ง", cls: "badge-primary", icon: "https://pcscargo.co.th/member/assets/images/icon/shop/shop-4.png" },
  "5": { label: "สำเร็จ", cls: "badge-success", icon: "https://pcscargo.co.th/member/assets/images/icon/shop/shop-5.png" },
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

export default async function ServiceOrderPage({
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
  const { data: corpRows } = await admin
    .from("tb_corporate")
    .select("id")
    .eq("userid", userID)
    .eq("corporatestatus", "1");
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
  const [cAll, cF1, cF2, cF3, cF4, cF5, cF6] = await Promise.all([
    countQuery(),
    countQuery("1"),
    countQuery("2"),
    countQuery("3"),
    countQuery("4"),
    countQuery("5"),
    countQuery("6"),
  ]);
  const countStatusAll = cAll.count ?? 0;
  const countStatusF1 = cF1.count ?? 0;
  const countStatusF2 = cF2.count ?? 0;
  const countStatusF3 = cF3.count ?? 0;
  const countStatusF4 = cF4.count ?? 0;
  const countStatusF5 = cF5.count ?? 0;
  const countStatusF6 = cF6.count ?? 0;

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
  const { data: rowsData } = await listQuery;
  const rows: HeaderOrderRow[] = (rowsData ?? []) as HeaderOrderRow[];

  // ── shops.php L1095-1097 — chProhNo(): looks up tb_promotion for each
  // order's promo badge. The legacy runs one query per row; here all
  // promo rows for the customer's orders are fetched once and mapped.
  const orderHnos = rows.map((r) => r.hno);
  let promoMap = new Map<string, number>();
  if (orderHnos.length > 0) {
    const { data: promoRows } = await admin
      .from("tb_promotion")
      .select("promoid, hno")
      .in("hno", orderHnos);
    promoMap = new Map(
      (promoRows ?? []).map((p: { promoid: number; hno: string }) => [p.hno, p.promoid]),
    );
  }

  return (
    <div className="pcs-legacy">
      {/* Legacy PCS stylesheet — static public/ asset, loaded via a plain
          <link> so it bypasses the app's Tailwind/PostCSS pipeline. */}
      <link rel="stylesheet" href="/legacy/pcs/shops.css" />
      {/* shops.php L462 — <title>; rebranded PCS Cargo → PR Cargo. */}
      <title>รายการฝากสั่งซื้อสินค้า | PR Cargo</title>

      {/* BEGIN: Content — shops.php L695 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          {/* shops.php L700-711 — breadcrumb */}
          <div className="content-header row">
            <div className="content-header-left col-12">
              <div className="row breadcrumbs-top ">
                <div className="breadcrumb-wrapper col-12">
                  <ol className="breadcrumb ">
                    <li className="breadcrumb-item">
                      <Link href="/dashboard">
                        <span className="menu-home">หน้าแรก</span>
                      </Link>
                    </li>
                    <li className="breadcrumb-item active">รายการฝากสั่งซื้อสินค้า</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          <div className="content-body pr110">
            {corporatePending ? (
              // shops.php L1090 — juristic-pending message.
              <div className="text-center">
                <h2
                  style={{ maxWidth: "670px", margin: "auto", marginTop: "10%" }}
                  className="text-white bg-danger p-1"
                >
                  รอเจ้าหน้าที่ดำเนิน อนุมัติการเป็นนิติบุคคล ภายใน 24 ชม. <br /> (ยกเว้นวันอาทิตย์และวันหยุดนักขัตฤกษ์)
                </h2>
              </div>
            ) : (
              <section>
                <div className="row">
                  <div className="col-md-12 col-sm-12">
                    <div className="card border-black">
                      {/* shops.php L764-782 — header row */}
                      <div className="pb-0 pl-1 pr-1 row">
                        <div className="content-header-left col-md-6 col-12">
                          <div className="text-center text-md-left">
                            <h3 className="text-center text-md-left">
                              <span className="font-30 ft-shopping-cart"></span> รายการฝากสั่งซื้อสินค้า
                            </h3>
                          </div>
                        </div>
                        <div className="content-header-right col-md-6 col-12">
                          <div className="float-md-right">
                            <div className="text-center text-md-right">
                              {/* shops.php L773 — legacy href `cart/add`
                                  (the add-to-cart screen, cart.php?page=add).
                                  Routed to the equivalent Pacred add route. */}
                              <Link href="/service-order/add">
                                <button className="btn btn-sm btn-circle btn-success text-white">
                                  <i className="ft-plus"></i>
                                </button>
                                <span className="font-normal text-dark">สั่งสินค้าเพิ่ม</span>
                              </Link>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* shops.php L841-896 — status-tab counters */}
                      <div className="row">
                        <div className="col-md-12">
                          <div className="pb-0 pl-1 pr-1">
                            <h4 className="text-color">
                              <b>สถานะรายการ</b>
                            </h4>
                            <ul className="nav nav-tabs nav-underline pcs-tabs">
                              <li className="nav-item tab-sm-center">
                                <Link className="nav-link" href="/service-order">
                                  ทั้งหมด
                                  {countStatusAll > 0 && (
                                    <div className="pcs-badge2 badge-info pcs-badge-pill">
                                      {numberLimit(countStatusAll)}
                                    </div>
                                  )}
                                </Link>
                              </li>
                              <li className="nav-item tab-sm-center">
                                <Link className="nav-link" href="/service-order?q=1">
                                  รอดำเนินการ
                                  {countStatusF1 > 0 && (
                                    <div className="pcs-badge2 badge-warning pcs-badge-pill">
                                      {numberLimit(countStatusF1)}
                                    </div>
                                  )}
                                </Link>
                              </li>
                              <li className={`nav-item tab-sm-center ${q === "2" ? "active" : ""}`}>
                                <Link className={`nav-link ${q === "2" ? "active" : ""}`} href="/service-order?q=2">
                                  รอชำระเงิน
                                  {countStatusF2 > 0 && (
                                    <div className="pcs-badge2 badge-danger pcs-badge-pill">
                                      {numberLimit(countStatusF2)}
                                    </div>
                                  )}
                                </Link>
                              </li>
                              <li className="nav-item tab-sm-center">
                                <Link className="nav-link" href="/service-order?q=3">
                                  สั่งสินค้า
                                  {countStatusF3 > 0 && (
                                    <div className="pcs-badge2 badge-warning pcs-badge-pill">
                                      {numberLimit(countStatusF3)}
                                    </div>
                                  )}
                                </Link>
                              </li>
                              <li className="nav-item tab-sm-center">
                                <Link className="nav-link" href="/service-order?q=4">
                                  รอร้านจีนจัดส่ง
                                  {countStatusF4 > 0 && (
                                    <div className="pcs-badge2 badge-warning pcs-badge-pill">
                                      {numberLimit(countStatusF4)}
                                    </div>
                                  )}
                                </Link>
                              </li>
                              <li className="nav-item tab-sm-center">
                                <Link className="nav-link" href="/service-order?q=5">
                                  สำเร็จ
                                  {countStatusF5 > 0 && (
                                    <div className="pcs-badge2 badge-warning pcs-badge-pill">
                                      {numberLimit(countStatusF5)}
                                    </div>
                                  )}
                                </Link>
                              </li>
                              <li className="nav-item tab-sm-center">
                                <Link className="nav-link" href="/service-order?q=6">
                                  ออเดอร์ที่ยกเลิก
                                  {countStatusF6 > 0 && (
                                    <div className="pcs-badge2 badge-warning pcs-badge-pill">
                                      {numberLimit(countStatusF6)}
                                    </div>
                                  )}
                                </Link>
                              </li>
                            </ul>
                          </div>
                          <div className="hr-dashed"></div>

                          {/* shops.php L898-1058 — the order table / empty state */}
                          <div className="p-1 p-m-0">
                            {/* shops.php L899 — <form action="printShop/" method="GET">.
                                The printShop endpoint is not yet ported; the
                                form is kept 1:1 (jQuery appends selected-row
                                ids on submit — that wiring is a follow-up). */}
                            <form id="frm-example" action="https://pcscargo.co.th/member/printShop/" method="GET">
                              {countStatusAll > 0 ? (
                                rows.length > 0 ? (
                                  <>
                                    {countShops2 > 0 && (
                                      <div className="text-center text-md-left">
                                        <div style={{ position: "relative" }} className="btn-pay-pc"></div>
                                      </div>
                                    )}
                                    <div className="text-center text-md-left">
                                      <button
                                        type="button"
                                        className="btn btn-sm btn-danger waves-effect round"
                                        id="selectCancel"
                                      >
                                        ยกเลิกออเดอร์รายการที่เลือก
                                      </button>
                                    </div>
                                    <div className="table-responsive pt-1 p-1">
                                      <table
                                        id="myTable"
                                        className="table display table-bordered table-striped dataTable no-footer dtr-inline"
                                      >
                                        <thead className="">
                                          <tr className="text-center bg-danger2">
                                            <th className="all add-text-all">ID</th>
                                            <th className="none">วันที่สร้าง</th>
                                            <th className="none">ออเดอร์เลขที่</th>
                                            <th className="all">ข้อมูลสินค้า</th>
                                            <th className="none">สถานะ</th>
                                            <th className="none">ราคา (บาท)</th>
                                            <th className="none">ตัวเลือก</th>
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
                                              hCover = "https://pcscargo.co.th/member/images/shops/" + cover;
                                            } else {
                                              hCover = "/legacy/pcs/shops/default.png";
                                            }
                                            const promoId = promoMap.get(row.hno);
                                            return (
                                              <tr
                                                key={row.hno}
                                                {...(hNoAnchor && hNoAnchor === row.hno
                                                  ? { className: "bg-danger2 anchor", id: row.hno }
                                                  : {})}
                                              >
                                                {/* col 1 — ID */}
                                                <td className="text-center tr1 notranslate">{row.hno}</td>
                                                {/* col 2 — วันที่สร้าง */}
                                                <td className="text-center font-12">
                                                  {fmtDate(row.hdate)}
                                                  <br />
                                                  {fmtTime(row.hdate)} น.
                                                </td>
                                                {/* col 3 — ออเดอร์เลขที่ */}
                                                <td className="notranslate">
                                                  <a
                                                    href={`https://pcscargo.co.th/member/shops/detail/${row.hno}/`}
                                                    className="text-info"
                                                  >
                                                    {row.hno} <ProBadge promoId={promoId} />
                                                  </a>
                                                </td>
                                                {/* col 4 — ข้อมูลสินค้า */}
                                                <td>
                                                  <div className="d-block d-sm-none">
                                                    วันที่สร้าง :{" "}
                                                    <span className="font-12">{fmtDMYHMS(row.hdate)}</span>
                                                    <br />
                                                    เลขที่ออเดอร์ :{" "}
                                                    <a
                                                      href={`https://pcscargo.co.th/member/shops/detail/${row.hno}/`}
                                                      className="text-info"
                                                    >
                                                      {row.hno} <ProBadge promoId={promoId} />
                                                    </a>
                                                    <br />
                                                    สถานะ : <StatusBadgeAllM hStatus={row.hstatus} />
                                                    <br />
                                                    ราคา : <span className="text-danger">{pricePay}</span> บาท
                                                  </div>
                                                  <div className="float-right">
                                                    <a
                                                      className="image-popup-vertical-fit el-link"
                                                      href={hCover.replace("_150x150.jpg", "")}
                                                    >
                                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                                      <img className="img-fluid" src={hCover} width={60} alt="" />
                                                    </a>
                                                  </div>
                                                  <a
                                                    href={`https://pcscargo.co.th/member/shops/detail/${row.hno}/`}
                                                    className="text-info"
                                                  >
                                                    {row.htitle}
                                                    {Number(row.hcount ?? 0) > 1 &&
                                                      ` และอีก ${Math.round(Number(row.hcount) - 1)} รายการ`}
                                                  </a>
                                                  {row.hstatus === "2" && (
                                                    <>
                                                      <br />
                                                      กรุณาชำระเงินก่อน{" "}
                                                      <span className="text-danger">{fmtDMYHMS(row.hdatepayment)}</span>{" "}
                                                      น.
                                                    </>
                                                  )}
                                                  {row.hnoteuser === "2" && (
                                                    <div className="text-white bg-danger">
                                                      หมายเหตุ : {row.hnote}
                                                    </div>
                                                  )}
                                                </td>
                                                {/* col 5 — สถานะ */}
                                                <td className="text-center">
                                                  <StatusBadgeAll hStatus={row.hstatus} />
                                                </td>
                                                {/* col 6 — ราคา (บาท) */}
                                                <td className="text-right">{pricePay}</td>
                                                {/* col 7 — ตัวเลือก */}
                                                <td className="text-center">
                                                  {Number(row.hstatus) <= 2 && (
                                                    <a href="javascript:void(0)">
                                                      <p className="btn font-12 btn-danger btn-rounded btn-sm">
                                                        ยกเลิกออเดอร์
                                                      </p>
                                                    </a>
                                                  )}
                                                  <a href={`https://pcscargo.co.th/member/shops/detail/${row.hno}/`}>
                                                    <p className="btn font-12 btn-outline-success btn-rounded btn-sm">
                                                      {" "}
                                                      ดูรายละเอียด{" "}
                                                    </p>
                                                  </a>
                                                  {row.hstatus === "2" && (
                                                    <>
                                                      <br />
                                                      <a
                                                        href={`https://pcscargo.co.th/member/shops/detail/${row.hno}&pay=true/`}
                                                      >
                                                        <p className="btn font-12 btn-outline-info btn-rounded btn-sm">
                                                          {" "}
                                                          <i className="mdi mdi-check-circle-outline"></i> ชำระเงิน
                                                        </p>
                                                      </a>
                                                    </>
                                                  )}
                                                  {row.hstatus === "5" && (
                                                    <a
                                                      href={`https://pcscargo.co.th/member/printShop/?print=1&id%5B%5D=${row.hno}`}
                                                      target="_blank"
                                                    >
                                                      <p className="btn btn-outline-primary btn-sm btn-rounded">
                                                        {" "}
                                                        พิมพ์ใบเสร็จ
                                                      </p>
                                                    </a>
                                                  )}
                                                  {Number(row.hstatus) > 1 && Number(row.hstatus) < 6 && (
                                                    <a
                                                      href={`https://pcscargo.co.th/member/printShop/?print=2&id%5B%5D=${row.hno}`}
                                                      target="_blank"
                                                    >
                                                      <p className="btn btn-outline-danger btn-sm btn-rounded">
                                                        {" "}
                                                        พิมพ์ใบแจ้งหนี้
                                                      </p>
                                                    </a>
                                                  )}
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </>
                                ) : (
                                  // shops.php L1022-1029 — filtered query empty
                                  <div className="text-center">
                                    <h4 className="text-color-main">คุณยังไม่มีข้อมูลฝากสั่งซื้อ</h4>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img className="img-fluid" src="/legacy/pcs/shop-2-300x300.png" alt="" />
                                  </div>
                                )
                              ) : (
                                // shops.php L1034-1047 — no orders at all
                                <div className="text-center">
                                  <Link href="/service-order/add">
                                    <h4 className="text-color-main">คุณยังไม่มีรายการฝากสั่งซื้อ</h4>
                                    <div>
                                      <span className="btn btn-sm btn-circle btn-success text-white">
                                        <i className="ft-plus"></i>
                                      </span>
                                      <span className="font-normal text-dark">สั่งสินค้าเพิ่ม</span>
                                    </div>
                                  </Link>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img className="img-fluid" src="/legacy/pcs/shop-2-300x300.png" alt="" />
                                </div>
                              )}

                              {/* shops.php L1049-1056 — the print btn-group
                                  (shown only on filtered tabs except q=1/q=6) */}
                              {q !== "" && q !== "1" && q !== "6" && (
                                <div
                                  className={`btn-group ${q === "2" ? "t" : ""}`}
                                  role="group"
                                  aria-label="Basic example"
                                  style={{ position: "fixed", bottom: "20px", zIndex: 999 }}
                                >
                                  <button
                                    type="submit"
                                    className="btn btn-color-main round text-white"
                                    name="print"
                                    value="2"
                                  >
                                    พิมพ์ใบแจ้งหนี้
                                  </button>
                                  {q === "5" && (
                                    <button
                                      type="submit"
                                      className="btn btn-color-main round text-white"
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

                          {/* shops.php L1059-1081 — the b-pay bottom bar */}
                          <div className="p-1 p-m-0">
                            {countShops2 > 0 && (q === "" || q === "2") && (
                              <div
                                className="b-pay"
                                style={{ position: "fixed", bottom: "20px", zIndex: 999 }}
                              >
                                <div className="row">
                                  <div className="col-md-6 offset-md-3" style={{ marginLeft: "9%" }}>
                                    <div className="row">
                                      <div className="col-3 p-05 text-center">
                                        <input
                                          type="checkbox"
                                          className="dt-checkboxes check-all c6"
                                          defaultChecked
                                        />
                                        <br />
                                        เลือกทั้งหมด
                                      </div>
                                      <div className="col-6 p-05">
                                        จำนวนรายการ : <span className="countPay">00</span>
                                        <br />
                                        <b>
                                          ยอดชำระรวม : <span className="text-danger price-all">00000</span> บ.
                                        </b>
                                      </div>
                                      <div className="col-3 p-05 text-right">
                                        <button
                                          type="button"
                                          className="btn btn-color-main waves-effect round animate__animated animate__infinite animate__headShake"
                                          id="select"
                                        >
                                          ชำระเงิน
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
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
      </div>
      {/* END: Content */}
    </div>
  );
}

/**
 * Transcribes the legacy `chProhNo()` helper (function.php L1095+):
 * renders the promotion badge next to an order number based on the
 * `tb_promotion.promoid` for that order. Branding `PCS` → `PR` kept
 * (the legacy promo links point at the WordPress marketing site —
 * absolute pcscargo.co.th URLs, faithful, not scrubbed).
 */
function ProBadge({ promoId }: { promoId: number | undefined }) {
  if (promoId == null) return null;
  // function.php L1101-1125 — the promoID → badge map (subset 1-24
  // covers the promos present in the migrated tb_promotion data).
  const PLAIN: Record<number, string> = {
    1: "Pro 3.15",
    2: "Pro 4.4",
    3: "Pro 4.25",
    4: "Pro 5.5",
    5: "Pro 5.15",
    6: "Pro 6.6",
  };
  const LINKED: Record<number, { label: string; title: string; href: string }> = {
    7: { label: "Pro 6.25", title: "เรท 5.39 และ ขนส่ง 5%", href: "https://pcscargo.co.th/โปรโมชัน-6-25" },
    8: { label: "Pro 7.7", title: "เรท 5.42", href: "https://pcscargo.co.th/โปรโมชัน-7-7" },
    9: { label: "Pro 7.25", title: "เรท 5.54 และ ขนส่ง 3%", href: "https://pcscargo.co.th/โปรโมชัน-7-25" },
    10: { label: "Pro 8.8", title: "เรท 5.57", href: "https://pcscargo.co.th/โปรโมชัน-8-8" },
    11: { label: "Pro 8.25", title: "เรท 5.49 และขนส่ง 3%", href: "https://pcscargo.co.th/โปรโมชัน-8-25" },
    12: { label: "Pro 9.9", title: "เรท 5.49", href: "https://pcscargo.co.th/โปรโมชัน-9-9" },
    13: { label: "Pro Survey", title: "เรท 5.49", href: "https://pcscargo.co.th/โปรโมชัน-9-16" },
    14: { label: "Pro 10.10", title: "เรท 5.48", href: "https://pcscargo.co.th/โปรโมชัน-10-10" },
    15: { label: "Pro 10.25", title: "เรท 5.49 ขนส่ง 3%", href: "https://pcscargo.co.th/โปรโมชัน-10-25" },
    16: { label: "Pro 11.11", title: "เรท 5.47 ขนส่ง -11 บาท", href: "https://pcscargo.co.th/โปรโมชัน-11-11" },
    17: { label: "Pro 11.25", title: "เรท 5.44", href: "https://pcscargo.co.th/โปรโมชัน/โปรโมชัน-11-25" },
    18: { label: "Pro 12.12", title: "เรท 5.22", href: "https://pcscargo.co.th/โปรโมชัน/โปรโมชัน-12-12" },
    19: { label: "Pro Valentine", title: "เรท 5.10", href: "https://pcscargo.co.th/โปรโมชัน/โปรโมชัน-วาเลนไทน์" },
    20: { label: "Pro 3.3", title: "เรท 5.18", href: "https://pcscargo.co.th/โปรโมชัน/โปรโมชัน-2023-3-3/" },
    21: { label: "Pro Songkran", title: "เรท 5.15", href: "https://pcscargo.co.th/โปรโมชัน/โปรโมชัน-songkran-2023/" },
    22: { label: "Pro เลือกตั้ง", title: "เรท 5.18", href: "https://pcscargo.co.th/โปรโมชัน/โปรโมชัน-เลือกตั้ง-2566/" },
    23: { label: "Pro Surveyนี้ โอเคมั๊ย", title: "เรท 5.10", href: "https://pcscargo.co.th/โปรโมชัน/โปรโมชัน-survey-นี้-โอเคมั๊ย/" },
    24: { label: "Pride month 06", title: "เรท 5.06", href: "https://pcscargo.co.th/โปรโมชัน/โปรโมชัน-pride-month-2023-06/" },
  };
  if (PLAIN[promoId]) {
    return <span className="badge badge-vip badge-pill">{PLAIN[promoId]}</span>;
  }
  const linked = LINKED[promoId];
  if (linked) {
    return (
      <a href={linked.href} target="_blank">
        <span className="badge badge-vip badge-pill" title={linked.title}>
          {linked.label}
        </span>
      </a>
    );
  }
  return null;
}
