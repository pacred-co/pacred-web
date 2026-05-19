import { redirect } from "next/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * China product search / search-results screen — a FAITHFUL 1:1
 * TRANSCRIPTION of the legacy PCS Cargo `member/search.php`
 * (D1 / ADR-0017 · faithful-port transcription · runbook
 * `docs/runbook/faithful-port-transcription.md`).
 *
 * This is a transcription, NOT a reinterpretation. The JSX below is the
 * exact HTML markup `search.php` renders — same Bootstrap-4 elements,
 * same class names, same Thai labels, same order. The visual identity
 * comes from the legacy CSS, brought in verbatim as the static
 * `.pcs-legacy`-scoped `public/legacy/pcs/search.css` (= the legacy
 * `assets/css/shop/shop-2023.css` + the BS4 subset the markup uses),
 * loaded via a plain <link> so it bypasses Tailwind/PostCSS.
 *
 * ── How legacy search.php branches ───────────────────────────
 * search.php takes the `?url=` query param and calls
 * convertURLChinna() (pcs-admin/include/functions.php) — a URL
 * classifier that decides between two render modes:
 *
 *   MODE A — URL paste  (`!$dataRe['search']`, search.php L54-142)
 *     The customer pasted a 1688 / taobao / tmall PRODUCT URL.
 *     search.php renders a SKELETON product card (`.data-pro-chinna`,
 *     `.pro-preload-effect` shimmer placeholders) and a jQuery
 *     `$.ajax` POST to `include/pages/search/dataAPI.php` fills it
 *     in client-side (search.php L386-395).
 *
 *   MODE B — keyword search  (`$dataRe['search']` truthy, L144-360)
 *     The customer searched by WORDS. search.php renders the
 *     sticky search bar + the provider tab strip (taobao / 1688 /
 *     pcs) + a product grid + pagination. The provider switch:
 *       - taobao / 1688  → external TAMIT API (curl, L169-208)
 *       - pcs            → SQL on `tb_product` (L302-333)
 *
 * ── What is wired 1:1 here, and what is FLAGGED ──────────────
 * The `provider=pcs` branch is the only DB-backed branch — it is
 * transcribed 1:1 to a Supabase `tb_product` query (see below).
 * The default route entry `/search?url=<word>` lands in MODE B;
 * with `&provider=pcs` it renders the real ported product grid.
 *
 * FLAGGED — not strictly 1:1 (documented, never silently diverged):
 *   1. convertURLChinna() — the ~700-line external-cURL URL
 *      classifier (calls tam-i-t.com / tamit-cloud.com) is NOT
 *      reproduced. MODE selection here uses a lightweight URL
 *      sniff (does `url` contain a 1688/taobao/tmall product
 *      domain). The legacy classifier additionally resolves short
 *      links via TAMIT — a borrowed-API call left unwired.
 *   2. MODE A skeleton-card fill — the jQuery `$.ajax` →
 *      `dataAPI.php` (a 48 KB external-API proxy) is NOT wired.
 *      The skeleton markup renders 1:1; the card stays in its
 *      shimmer-placeholder state (exactly what the legacy screen
 *      shows before the AJAX returns).
 *   3. MODE B `provider=taobao` / `provider=1688` — the external
 *      TAMIT search API (tamit-cloud.com) is NOT called. The tab
 *      strip + grid markup renders 1:1; the taobao/1688 grids show
 *      the legacy "ไม่พบข้อมูล" empty state (search.php L292-298).
 *      Only `provider=pcs` returns ported rows.
 *   These are borrowed-API integrations (TAMIT) — per the runbook
 *      §3 / pcs-scrub-plan they are NOT scrubbed and NOT re-wired
 *      in a port diff. The visible surface is faithful 1:1.
 *
 * ── Data — legacy search.php SQL transcribed 1:1 to `tb_*` ────
 * `tb_*` is RLS-locked to service_role → reads go through the
 * admin client.
 *   - $rsDefault       → tb_settings.rsdefault  WHERE id=1   (L24-27)
 *   - product COUNT    → tb_product  WHERE pnameth LIKE %url% (L307-309)
 *   - product page     → tb_product (id,pnameth,pimages,
 *                        ppricepromo,pprice,purl) LIKE %url%
 *                        LIMIT offset,24                      (L311-312)
 *   - tb_history_key INSERT (the search-log row, L370-372) is
 *     FLAGGED below — see the note at the INSERT site.
 *
 * Rebrand: legacy `PCS` → `PR` (branding text) — search.php has no
 * `PCS<n>` member codes in its markup.
 */

// search.php L305 — $no_of_records_per_page = 24
const RECORDS_PER_PAGE = 24;

type SearchParams = {
  url?: string;
  provider?: string;
  page?: string;
  order?: string;
};

type ProductRow = {
  id: number;
  pnameth: string | null;
  pimages: string | null;
  ppricepromo: number | null;
  pprice: number | null;
  purl: string | null;
};

/**
 * Transcribes the legacy `countText()` helper
 * (`member/include/function.php` L14-24): truncate `text` to `num`
 * UTF-8 characters and append "..." when it is longer.
 */
function countText(text: string, num: number): string {
  const chars = Array.from(text ?? "");
  if (chars.length >= num) {
    return chars.slice(0, num).join("") + "...";
  }
  return text ?? "";
}

/** number_format($n, 2) — the PHP money formatter search.php uses. */
function numberFormat(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Lightweight stand-in for the MODE decision convertURLChinna()
 * makes — search.php renders the skeleton product card (MODE A)
 * when `url` is a recognised 1688/taobao/tmall PRODUCT link, and
 * the keyword grid (MODE B) otherwise. The legacy classifier does
 * far more (short-link resolution via TAMIT, product-id parsing) —
 * that external work is FLAGGED above, not reproduced.
 */
function classifyUrl(url: string): {
  search: boolean;
  provider: "1688" | "taobao" | "tmall" | null;
  srcWeb: string | null;
  urlcut: string;
} {
  const u = (url ?? "").trim();
  const isLink = /^https?:\/\//i.test(u);
  if (isLink && u.includes("1688.com")) {
    return { search: false, provider: "1688", srcWeb: "1688-logo.png", urlcut: u };
  }
  if (isLink && (u.includes("taobao.com") || u.includes("m.tb.cn"))) {
    return { search: false, provider: "taobao", srcWeb: "taobao-logo.png", urlcut: u };
  }
  if (isLink && u.includes("tmall.com")) {
    return { search: false, provider: "tmall", srcWeb: "tmall-logo.png", urlcut: u };
  }
  // not a product URL → keyword search (MODE B)
  return { search: true, provider: null, srcWeb: null, urlcut: u };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // header.php L9-72: a logged-out visitor is redirected to /login.
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;

  const sp = await searchParams;
  // search.php L7 / L35: $key / $getURL = $_GET['url']
  const getURL = sp.url ?? "";
  // search.php L148-152: $pageno = $_GET['page'] ?? 1
  const pageno = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  // search.php L167-176: provider defaults to taobao when unset
  const provider = sp.provider ?? "taobao";

  const admin = createAdminClient();

  // search.php L24-27: SELECT rsDefault FROM tb_settings WHERE ID=1
  const { data: settingsRow } = await admin
    .from("tb_settings")
    .select("rsdefault")
    .eq("id", 1)
    .maybeSingle<{ rsdefault: number }>();
  const rsDefault = Number(settingsRow?.rsdefault ?? 0);

  // The convertURLChinna() MODE decision (see classifyUrl note).
  const dataRe = classifyUrl(getURL);

  // ── MODE A — URL paste → skeleton product card ──────────────
  if (!dataRe.search) {
    return (
      <UrlPasteMode srcWeb={dataRe.srcWeb} urlcut={dataRe.urlcut} rsDefault={rsDefault} />
    );
  }

  // ── MODE B — keyword search ─────────────────────────────────
  // search.php L302-333: provider=pcs branch queries tb_product.
  // taobao / 1688 use the external TAMIT API (FLAGGED — not wired);
  // for those providers the grid renders the legacy empty state.
  let products: ProductRow[] = [];
  let totalPages = 1;
  let apiError2 = 0; // search.php $apiERROR2 — 1 = "ไม่พบข้อมูล"

  if (provider === "pcs") {
    // search.php L304: $pNameTH = '%'.$_GET['url'].'%'
    const pNameTH = `%${getURL}%`;
    const offset = (pageno - 1) * RECORDS_PER_PAGE;

    // search.php L307-310: SELECT COUNT(*) FROM tb_product WHERE pNameTH LIKE …
    const { count: totalRows } = await admin
      .from("tb_product")
      .select("id", { count: "exact", head: true })
      .ilike("pnameth", pNameTH);
    totalPages = Math.ceil((totalRows ?? 0) / RECORDS_PER_PAGE) || 1;

    // search.php L311-312: SELECT … FROM tb_product WHERE pNameTH LIKE … LIMIT …
    const { data: rows } = await admin
      .from("tb_product")
      .select("id, pnameth, pimages, ppricepromo, pprice, purl")
      .ilike("pnameth", pNameTH)
      .range(offset, offset + RECORDS_PER_PAGE - 1);
    products = (rows ?? []) as ProductRow[];
  } else {
    // taobao / 1688 — external TAMIT API not wired (FLAGGED).
    // search.php L292-298: when $json['data'] is empty → apiERROR2=1.
    apiError2 = 1;
  }

  /*
   * search.php L370-372 — INSERT INTO tb_history_key (…). The legacy
   * screen logs every search into tb_history_key on each render.
   * FLAGGED: an INSERT side-effect on a GET render is intentionally
   * NOT performed here — a Server Component render must stay a pure
   * read (Next.js disallows mutations during render, and re-renders
   * would double-log). The search-log write belongs in a Server
   * Action / route handler. Faithful visible surface preserved;
   * the log-row side-effect is the one piece deliberately deferred.
   */

  return (
    <div className="pcs-legacy">
      {/* Legacy PCS stylesheet — static public/ asset, plain <link>
          so it bypasses the app's Tailwind/PostCSS pipeline. */}
      <link rel="stylesheet" href="/legacy/pcs/search.css" />

      {/* BEGIN: Content — search.php L29 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          <div className="content-body pr110">
            {/* search.php L212-257 — sticky search bar + provider tabs */}
            <div className="card-content bg-white">
              <div className="card-body pm05">
                <div className="sticky-search">
                  <div
                    className="row pcs-d-m menubar-search pt-05"
                    id="menubar-search"
                  >
                    <div className="col-1">
                      <div className="nav-icon">
                        <i className="ft-chevron-left"></i>
                      </div>
                    </div>
                    <div className="col-11">
                      <form
                        className="form-inline my-lg-0 justify-content-center"
                        method="GET"
                        action="/search"
                      >
                        <div className="w-100 nav-search">
                          <input
                            type="text"
                            name="url"
                            defaultValue={getURL}
                            className="w-100 form-control product-search br-15"
                            id="input-search"
                            placeholder="พิมค้นหาสั่งซื้อสินค้า+วางลิ้งสินค้า1688 เถาเปา แปลภาษาไทยทันที"
                          />
                          <button className="btn btn-main" type="submit">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="24"
                              height="24"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="feather feather-search"
                            >
                              <circle cx="11" cy="11" r="8"></circle>
                              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                            </svg>
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                </div>
                <div className="row ptm-3">
                  <div className="col-12 p-m-0">
                    <h4>
                      <b>
                        ค้นหา : <span className="text-color">{getURL}</span>
                      </b>
                      ตัวเลือกเพิ่มเติม
                      <select name="order" id="order">
                        <option className="order-new" value="new">
                          สินค้ามาใหม่
                        </option>
                        <option className="order-pop" value="pop">
                          กำลังเป็นที่นิยม
                        </option>
                        <option className="order-priceLow" value="priceLow">
                          ราคาจากต่ำไปสูง
                        </option>
                        <option
                          className="order-priceHeight"
                          value="priceHeight"
                        >
                          ราคาจากสูงไปต่ำ
                        </option>
                      </select>
                    </h4>
                  </div>
                  <div className="col-12 p-m-0">
                    <ul className="nav nav-tabs nav-underline pcs-tabs">
                      <li className="taobao nav-item tab-sm-center">
                        <a
                          className="nav-link"
                          href={`?url=${encodeURIComponent(getURL)}&provider=taobao`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            className="img-fluid"
                            src="/legacy/pcs/shops/tmall-taobao-logo.png"
                            alt=""
                          />
                        </a>
                      </li>
                      <li className="p1688 nav-item tab-sm-center">
                        <a
                          className="nav-link"
                          href={`?url=${encodeURIComponent(getURL)}&provider=1688`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            className="img-fluid"
                            src="/legacy/pcs/shops/1688-logo-3.png"
                            alt=""
                          />
                        </a>
                      </li>
                      <li className="pcsshop nav-item tab-sm-center">
                        <a
                          className="nav-link"
                          href={`?url=${encodeURIComponent(getURL)}&provider=pcs`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            className="img-fluid"
                            src="/legacy/pcs/shops/pcs-logo.png"
                            alt=""
                          />
                        </a>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* search.php L258-360 — product grid + pagination */}
            <div className="bg-white">
              <div className="row p-1">
                {provider !== "pcs" ? (
                  // taobao / 1688 — external TAMIT API not wired (FLAGGED).
                  // search.php L292-298 empty-data branch ($apiERROR2=1).
                  apiError2 === 1 ? (
                    <div className="col-12 text-center">
                      <span className="text-danger">
                        ไม่พบข้อมูล กรุณาลองค้นหาอีกครั้ง
                      </span>
                      <br />
                      <button
                        type="button"
                        className="btn waves-effect waves-light btn-rounded btn-outline-warning m-1"
                      >
                        <i className="fas fa-undo-alt"></i> ค้นหาอีกครั้ง
                      </button>
                    </div>
                  ) : null
                ) : (
                  // search.php L315-332 — provider=pcs: tb_product rows.
                  products.map((row) => (
                    <div
                      key={row.id}
                      className="col-6 col-md-2 text-center"
                    >
                      <div className="item-product">
                        <a href={`/search?url=${encodeURIComponent(row.purl ?? "")}`}>
                          <div>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={row.pimages ?? ""}
                              className="img-fluid pImages"
                              alt=""
                            />
                            <div className="jss text-pre">พรีออเดอร์</div>
                          </div>
                          <div className="text-center p-05">
                            <h5 className="name-product">
                              {countText(row.pnameth ?? "", 28)}
                            </h5>
                            <span className="text-color font-12rem">
                              ราคา :{" "}
                              {numberFormat(Number(row.pprice ?? 0) * rsDefault)}฿
                            </span>
                          </div>
                        </a>
                      </div>
                    </div>
                  ))
                )}

                {/* search.php L336-358 — pagination */}
                <div className="col-12">
                  <nav aria-label="Page navigation">
                    <ul className="pagination justify-content-center pagination-separate pagination-round pagination-flat">
                      <li className="page-item">
                        <a
                          className="page-link"
                          href={
                            pageno <= 1
                              ? "#"
                              : `?url=${encodeURIComponent(getURL)}&page=${pageno - 1}&provider=${provider}`
                          }
                          aria-label="Previous"
                        >
                          <span aria-hidden="true">ก่อนหน้า</span>
                          <span className="sr-only">Previous</span>
                        </a>
                      </li>
                      <li className="page-item active">
                        <a
                          className="page-link"
                          href={
                            pageno > 1
                              ? `?url=${encodeURIComponent(getURL)}&page=${pageno - 1}&provider=${provider}`
                              : `?url=${encodeURIComponent(getURL)}&page=1`
                          }
                        >
                          {pageno > 1 ? pageno : "1"}
                        </a>
                      </li>
                      <li className="page-item">
                        <a
                          className="page-link"
                          href={`?url=${encodeURIComponent(getURL)}&page=${pageno + 1}&provider=${provider}`}
                        >
                          {pageno + 1}
                        </a>
                      </li>
                      <li className="page-item">
                        <a
                          className="page-link"
                          href={`?url=${encodeURIComponent(getURL)}&page=${pageno + 2}&provider=${provider}`}
                        >
                          {pageno + 2}
                        </a>
                      </li>
                      <li className="page-item">
                        <a
                          className="page-link"
                          href={`?url=${encodeURIComponent(getURL)}&page=${pageno + 3}&provider=${provider}`}
                        >
                          {pageno + 3}
                        </a>
                      </li>
                      <li className="page-item">
                        <a
                          className="page-link"
                          href={`?url=${encodeURIComponent(getURL)}&page=${pageno + 4}&provider=${provider}`}
                        >
                          {pageno + 4}
                        </a>
                      </li>
                      <li className="page-item">
                        <a
                          className="page-link"
                          href={`?url=${encodeURIComponent(getURL)}&page=${pageno + 1}&provider=${provider}`}
                          aria-label="Next"
                        >
                          <span aria-hidden="true">ถัดไป</span>
                          <span className="sr-only">Next</span>
                        </a>
                      </li>
                    </ul>
                  </nav>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* END: Content */}
      {/* search.php totalPages is computed (L310) for the pcs branch;
          kept here so the value participates exactly as legacy. */}
      <span hidden data-total-pages={totalPages} data-user={profile.member_code ?? ""} />
    </div>
  );
}

/**
 * MODE A — the URL-paste skeleton product card (search.php L57-142).
 * Transcribed 1:1: the `.data-pro-chinna` wrapper + the
 * `.pro-preload-effect` shimmer placeholders + the hidden form.
 * The legacy jQuery `$.ajax` → `dataAPI.php` that fills this card
 * is a borrowed-API integration (TAMIT) — FLAGGED in the file
 * header, NOT wired. The card renders in its shimmer state, which
 * is exactly what the legacy screen shows before the AJAX returns.
 */
function UrlPasteMode({
  srcWeb,
  urlcut,
  rsDefault,
}: {
  srcWeb: string | null;
  urlcut: string;
  rsDefault: number;
}) {
  return (
    <div className="pcs-legacy">
      <link rel="stylesheet" href="/legacy/pcs/search.css" />

      {/* BEGIN: Content — search.php L29 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          <div className="content-body pr110">
            {/* search.php L57-142 — skeleton product card (MODE A) */}
            <div className="data-pro-chinna">
              <div className="card-content bg-white">
                <div className="card-body p05">
                  <form
                    className="form-horizontal"
                    method="POST"
                    autoComplete="off"
                    action=""
                  >
                    <input type="hidden" name="cURL" value="" />
                    <input type="hidden" name="cProvider" value="" />
                    <input
                      type="hidden"
                      name="cTitle"
                      id="cTitle"
                      value=""
                    />
                    <input type="hidden" name="cNameShop" value="" />
                    <div className="row bg-m-s">
                      <div className="col-12 pcs-d-pc">
                        <h2 className="pb-0">
                          ผลการค้นหาจาก{" "}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={srcWeb ? `/legacy/pcs/shops/${srcWeb}` : ""}
                            height={50}
                            alt=""
                          />
                          <span className="font-14" id="urlPro">
                            {" "}
                            URL :{" "}
                            <a
                              href={urlcut}
                              className="text-info"
                              target="_blank"
                              rel="noreferrer"
                            >
                              {urlcut}
                            </a>
                          </span>
                        </h2>
                      </div>
                      <div className="col-md-4 p-2 p-m-05-1">
                        <div className="main">
                          <div className="slider slider-for">
                            <div className="pro-preload-effect procover"></div>
                          </div>
                          <div className="slider slider-nav pcs-d-pc">
                            <div className="row pt-1">
                              <div className="col-md-4 p-1">
                                <div
                                  className="pro-preload-effect"
                                  style={{ height: "100px" }}
                                ></div>
                              </div>
                              <div className="col-md-4 p-1">
                                <div
                                  className="pro-preload-effect"
                                  style={{ height: "100px" }}
                                ></div>
                              </div>
                              <div className="col-md-4 p-1">
                                <div
                                  className="pro-preload-effect"
                                  style={{ height: "100px" }}
                                ></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="col-md-8">
                        <span
                          className="pb-1"
                          id="google_translate_element"
                        ></span>{" "}
                        <span className="pcs-d-ib-m">
                          ผลการค้นหาจาก{" "}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            style={{}}
                            src={srcWeb ? `/legacy/pcs/shops/${srcWeb}` : ""}
                            width={50}
                            alt=""
                          />
                        </span>
                        <h4 className="p-m-05 bg-white-m-b1 pb-1">
                          ชื่อสินค้า :{" "}
                          <div className="title-pro pro-preload-effect"></div>
                        </h4>
                        <div className="price-s bg-main">
                          <span className="font-18">ราคาสินค้า : </span>
                          <span className="display-7">¥</span>
                        </div>
                        <div className="row p-m-0 pt-05">
                          <div className="col-md-6">
                            <div className="p-m-05 bg-white-m-b1">
                              <h4>
                                ชื่อร้าน :{" "}
                                <span id="nick">
                                  <div className="nick-pro pro-preload-effect"></div>
                                </span>
                              </h4>
                            </div>
                          </div>
                          <div className="col-md-6">
                            <div
                              className="p-m-05 bg-white-m-b1"
                              style={{ marginTop: "2px" }}
                            >
                              <h4>
                                ลิงค์สินค้า :{" "}
                                <a
                                  className="font-14"
                                  href=""
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <span className="font-12 badge badge-info badge-pill">
                                    <i className="fas fa-link"></i> ไปยังเว็บสินค้า
                                  </span>{" "}
                                </a>
                              </h4>
                            </div>
                          </div>
                        </div>
                        <div className="pro-preload-effect"></div>
                        <div className="pro-preload-effect"></div>
                        <div className="pro-preload-effect"></div>
                        <div className="pro-preload-effect"></div>
                        <br />
                        <div className="row">
                          <div className="col-md-6">
                            <div className="pro-preload-effect"></div>
                            <div className="pro-preload-effect"></div>
                            <div className="pro-preload-effect"></div>
                          </div>
                          <div className="col-md-6">
                            <div className="pro-preload-effect"></div>
                            <div className="pro-preload-effect"></div>
                            <div className="pro-preload-effect"></div>
                          </div>
                        </div>
                        <hr />
                        <div
                          className="border-total-product p-1 p-m-05 pay-c"
                          style={{ zIndex: 99 }}
                        >
                          <div className="row">
                            <div className="col-3 col-md-8 text-right">
                              <h4>ราคารวม</h4>
                            </div>
                            <div className="col-9 col-md-4 text-left text-md-right notranslate">
                              <span id="CHNTotal">0.00</span>¥
                              <span className="">
                                &nbsp;x {rsDefault}฿/¥ ={" "}
                                <b id="THBtotal" className="text-danger">
                                  0.00
                                </b>{" "}
                                ฿
                              </span>
                            </div>
                            <div className="col-3 col-md-8 text-right">
                              <h4>จำนวน </h4>
                            </div>
                            <div className="col-5 col-md-4 text-left text-md-right ">
                              <span id="cAmount">0</span>
                              <b className="font-12">
                                <span className="text-danger">
                                  {" "}
                                  (ขั้นต่ำ{" "}
                                  <span className="font-14" id="minnum"></span>{" "}
                                  ชิ้น)
                                </span>
                              </b>
                            </div>
                            <div className="col-4 col-md-12 align-self-end text-left text-md-right pl-2">
                              <button
                                type="submit"
                                id="btnCart"
                                className="btn btn-sm btn-main btn-rounded animate__animated animate__infinite animate__headShake"
                                name="addCartURL"
                              >
                                <i className="ft-shopping-cart"></i> หยิบใส่รถเข็น
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* END: Content */}
    </div>
  );
}
