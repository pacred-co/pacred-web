import { redirect } from "next/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { akucargoSearch } from "@/lib/china-search/akucargo";
import type { AkucargoPlatform } from "@/lib/china-search/akucargo-helpers";
import { convertProductUrlDetail, type ChinaProductDetail } from "@/lib/china-search";
import { SearchRecents } from "./search-recents";
import { SearchHistoryLogger } from "./search-history-logger";

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
 * Rebrand DONE: legacy `PCS` brand → `PR` (branding text) — search.php
 * has no `PCS<n>` member codes in its markup.
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
  const { data: settingsRow, error: settingsRowErr } = await admin
    .from("tb_settings")
    .select("rsdefault")
    .eq("id", 1)
    .maybeSingle<{ rsdefault: number }>();
  if (settingsRowErr) {
    console.error(`[tb_settings list] failed`, { code: settingsRowErr.code, message: settingsRowErr.message });
  }
  const rsDefault = Number(settingsRow?.rsdefault ?? 0);

  // The convertURLChinna() MODE decision (see classifyUrl note).
  const dataRe = classifyUrl(getURL);

  // ── MODE A — URL paste → fetch TAMIT detail + render ────────
  // Per ปอน 2026-05-28 ("ขอวิธีที่วางลิงก์แล้วเนื้อหามาแปลไทย
  // แปลงค่าให้ครบ"): wire the TAMIT product-detail call that the
  // legacy `dataAPI.php` did via jQuery AJAX. We now fetch it
  // server-side (no client AJAX needed in RSC) and pass to UrlPasteMode.
  if (!dataRe.search) {
    const detailResult = await convertProductUrlDetail(getURL);
    const detail = detailResult.available ? detailResult.detail : null;
    return (
      <UrlPasteMode
        srcWeb={dataRe.srcWeb}
        urlcut={dataRe.urlcut}
        rsDefault={rsDefault}
        detail={detail}
      />
    );
  }

  // ── MODE B — keyword search ─────────────────────────────────
  // search.php L302-333: provider=pcs branch queries tb_product
  // (Pacred-local product catalog). taobao / 1688 are wired below
  // through AkuCargo (P-52, Sprint-3 P2.2 — replaces the legacy
  // TAMIT keyword endpoint).
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
    const { data: rows, error: rowsErr } = await admin
      .from("tb_product")
      .select("id, pnameth, pimages, ppricepromo, pprice, purl")
      .ilike("pnameth", pNameTH)
      .range(offset, offset + RECORDS_PER_PAGE - 1);
    if (rowsErr) {
      console.error(`[tb_product list] failed`, { code: rowsErr.code, message: rowsErr.message });
    }
    products = (rows ?? []) as ProductRow[];
  } else {
    // Sprint-3 P2.2 — taobao / 1688 keyword search via AkuCargo
    // (P-52 canonical keyword backend; legacy TAMIT keyword endpoint
    // was retired). When AkuCargo errors (network / not_configured /
    // rate_limited) we fall back to the legacy `apiERROR2=1` empty
    // state so the page still renders without throwing.
    const platform: AkucargoPlatform = provider === "1688" ? "1688" : "taobao";
    const result = await akucargoSearch(getURL, pageno, platform);
    if (result.available) {
      products = result.hits.map((hit, idx) => ({
        // Synthetic id — AkuCargo returns no DB-style integer key. The
        // legacy front-end only uses `id` as the React/jQuery key, never
        // for a server roundtrip; index+1 is unique within the page.
        id:          idx + 1,
        pnameth:     hit.title,
        pimages:     hit.image_url ?? null,
        ppricepromo: null,           // AkuCargo has no promo-price axis
        pprice:      hit.price_cny ?? null,
        purl:        hit.url,
      }));
      // AkuCargo doesn't expose total-row count, only a has-more flag.
      // Best-effort totalPages = current + 1 when more pages exist;
      // collapses to `pageno` otherwise. The pager UI doesn't need a
      // precise total, just enough to render "next" while results exist.
      totalPages = result.has_more ? pageno + 1 : pageno;
    } else {
      // search.php L292-298: when $json['data'] is empty → apiERROR2=1.
      apiError2 = 1;
    }
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
      {/* Legacy PCS stylesheet — kept (hook classes product-search /
          pImages / pcs-tabs still referenced by legacy JS + CSS). The
          chrome below is a Tailwind rebuild; the stylesheet only backs
          the remaining hook classes. */}
      <link rel="stylesheet" href="/legacy/pcs/search.css" />

      {/* BEGIN: Content — search.php L29 (Tailwind rebuild · mobile-first).
          Wrapped in `.pcs-content-pad` so the (protected) layout's desktop
          padding (sidebar + FloatingTabs clearance) kicks in. */}
      <div className="pcs-content-pad w-full px-3 md:px-6 py-3 md:py-6">
        {/* search.php L212-257 — sticky search bar + provider tabs */}
        <div className="bg-white dark:bg-surface border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="p-3 md:p-4">
            <div
              className="menubar-search"
              id="menubar-search"
            >
              <form
                className="flex items-center gap-2"
                method="GET"
                action="/search"
              >
                <div className="relative flex-1 nav-search">
                  <input
                    type="text"
                    name="url"
                    defaultValue={getURL}
                    className="product-search w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:ring-2 focus:ring-red-500/30 focus:border-red-500 outline-none"
                    id="input-search"
                    placeholder="พิมค้นหาสั่งซื้อสินค้า+วางลิ้งสินค้า1688 เถาเปา แปลภาษาไทยทันที"
                  />
                </div>
                <button
                  className="shrink-0 inline-flex items-center justify-center rounded-lg bg-red-600 hover:bg-red-700 text-white h-10 w-10 transition-colors"
                  type="submit"
                  aria-label="ค้นหา"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="22"
                    height="22"
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
              </form>
              {/* Sprint-3 P2.1 — recent searches strip + a
                  fire-and-forget logger that closes the legacy
                  tb_history_key write that the SC port deferred.
                  Both live behind G8 (actions/search.ts +
                  migration 0102). */}
              <div className="mt-2">
                <SearchRecents />
                {getURL ? (
                  <SearchHistoryLogger
                    query={getURL}
                    source={dataRe.search ? "china-search.keyword" : "china-search.url"}
                    resultCount={dataRe.search ? products.length : null}
                  />
                ) : null}
              </div>
            </div>

            <div className="mt-3">
              <h4 className="text-sm md:text-base font-bold text-foreground flex flex-wrap items-center gap-2">
                <span>
                  ค้นหา : <span className="text-red-600">{getURL}</span>
                </span>
                <span className="text-muted font-normal">ตัวเลือกเพิ่มเติม</span>
                <select
                  name="order"
                  id="order"
                  className="rounded-lg border border-border bg-white dark:bg-surface px-2.5 py-1.5 text-sm text-foreground focus:ring-2 focus:ring-red-500/30 focus:border-red-500 outline-none"
                >
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

              <ul className="pcs-tabs mt-3 flex items-center gap-2 border-b border-border overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mb-px">
                <li className="taobao shrink-0">
                  <a
                    className="block px-3 py-2 border-b-2 border-transparent hover:border-red-500 transition-colors"
                    href={`?url=${encodeURIComponent(getURL)}&provider=taobao`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="h-7 w-auto"
                      src="/legacy/pcs/shops/tmall-taobao-logo.png"
                      alt=""
                    />
                  </a>
                </li>
                <li className="p1688 shrink-0">
                  <a
                    className="block px-3 py-2 border-b-2 border-transparent hover:border-red-500 transition-colors"
                    href={`?url=${encodeURIComponent(getURL)}&provider=1688`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="h-7 w-auto"
                      src="/legacy/pcs/shops/1688-logo-3.png"
                      alt=""
                    />
                  </a>
                </li>
                <li className="pcsshop shrink-0">
                  <a
                    className="block px-3 py-2 border-b-2 border-transparent hover:border-red-500 transition-colors"
                    href={`?url=${encodeURIComponent(getURL)}&provider=pcs`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="h-7 w-auto"
                      src="/legacy/pcs/shops/pcs-logo.png"
                      alt=""
                    />
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* search.php L258-360 — product grid + pagination (Tailwind) */}
        <div className="mt-3 md:mt-4">
          {provider !== "pcs" ? (
            // taobao / 1688 — AkuCargo result handled above; the
            // empty-state branch fires when AkuCargo returned no
            // hits OR errored (network / rate_limited /
            // not_configured), mirroring legacy search.php L292-298
            // ($apiERROR2=1).
            apiError2 === 1 ? (
              <div className="text-center py-10">
                <span className="text-red-600">
                  ไม่พบข้อมูล กรุณาลองค้นหาอีกครั้ง
                </span>
                <br />
                <button
                  type="button"
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-amber-400 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10 px-4 py-2 text-sm font-medium transition-colors"
                >
                  <i className="fas fa-undo-alt"></i> ค้นหาอีกครั้ง
                </button>
              </div>
            ) : null
          ) : (
            // search.php L315-332 — provider=pcs: tb_product rows.
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {products.map((row) => (
                <div key={row.id} className="item-product">
                  <a
                    href={`/search?url=${encodeURIComponent(row.purl ?? "")}`}
                    className="group block rounded-xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden hover:shadow-md transition-shadow"
                  >
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={row.pimages ?? ""}
                        className="pImages aspect-square object-cover w-full"
                        alt=""
                      />
                      <div className="jss text-pre absolute top-1.5 left-1.5 rounded-md bg-red-600 text-white text-[10px] font-medium px-1.5 py-0.5">
                        พรีออเดอร์
                      </div>
                    </div>
                    <div className="p-2 text-center">
                      <h5 className="name-product text-xs md:text-sm text-foreground line-clamp-2 min-h-[2.5rem]">
                        {countText(row.pnameth ?? "", 28)}
                      </h5>
                      <span className="block mt-1 text-red-600 font-semibold text-sm">
                        ราคา :{" "}
                        {numberFormat(Number(row.pprice ?? 0) * rsDefault)}฿
                      </span>
                    </div>
                  </a>
                </div>
              ))}
            </div>
          )}

          {/* search.php L336-358 — pagination */}
          <nav aria-label="Page navigation" className="mt-5">
            <ul className="flex flex-wrap items-center justify-center gap-1.5">
              <li>
                <a
                  className={`inline-flex items-center justify-center min-w-[40px] h-9 px-3 rounded-lg border border-border text-sm transition-colors ${
                    pageno <= 1
                      ? "text-muted pointer-events-none opacity-50"
                      : "text-foreground hover:bg-surface-alt"
                  }`}
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
              <li>
                <a
                  className="inline-flex items-center justify-center min-w-[40px] h-9 px-3 rounded-lg border border-red-600 bg-red-600 text-white text-sm font-semibold"
                  href={
                    pageno > 1
                      ? `?url=${encodeURIComponent(getURL)}&page=${pageno - 1}&provider=${provider}`
                      : `?url=${encodeURIComponent(getURL)}&page=1`
                  }
                >
                  {pageno > 1 ? pageno : "1"}
                </a>
              </li>
              <li>
                <a
                  className="inline-flex items-center justify-center min-w-[40px] h-9 px-3 rounded-lg border border-border text-foreground hover:bg-surface-alt text-sm transition-colors"
                  href={`?url=${encodeURIComponent(getURL)}&page=${pageno + 1}&provider=${provider}`}
                >
                  {pageno + 1}
                </a>
              </li>
              <li>
                <a
                  className="inline-flex items-center justify-center min-w-[40px] h-9 px-3 rounded-lg border border-border text-foreground hover:bg-surface-alt text-sm transition-colors"
                  href={`?url=${encodeURIComponent(getURL)}&page=${pageno + 2}&provider=${provider}`}
                >
                  {pageno + 2}
                </a>
              </li>
              <li className="hidden sm:block">
                <a
                  className="inline-flex items-center justify-center min-w-[40px] h-9 px-3 rounded-lg border border-border text-foreground hover:bg-surface-alt text-sm transition-colors"
                  href={`?url=${encodeURIComponent(getURL)}&page=${pageno + 3}&provider=${provider}`}
                >
                  {pageno + 3}
                </a>
              </li>
              <li className="hidden sm:block">
                <a
                  className="inline-flex items-center justify-center min-w-[40px] h-9 px-3 rounded-lg border border-border text-foreground hover:bg-surface-alt text-sm transition-colors"
                  href={`?url=${encodeURIComponent(getURL)}&page=${pageno + 4}&provider=${provider}`}
                >
                  {pageno + 4}
                </a>
              </li>
              <li>
                <a
                  className="inline-flex items-center justify-center min-w-[40px] h-9 px-3 rounded-lg border border-border text-foreground hover:bg-surface-alt text-sm transition-colors"
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
  detail,
}: {
  srcWeb: string | null;
  urlcut: string;
  rsDefault: number;
  detail: ChinaProductDetail | null;
}) {
  // Computed values from TAMIT detail (null when unavailable → render
  // skeleton state, matching legacy pre-AJAX shimmer behaviour).
  const title = detail?.title ?? "";
  const priceCny = detail?.promo_price_cny ?? detail?.base_price_cny ?? 0;
  const priceThb = priceCny * rsDefault;
  const shopName = detail?.shop_name ?? "";
  // Force https on image URLs. TAMIT/CDN sometimes return http:// and the
  // strict CSP (`img-src 'self' data: blob: https:`) drops those silently
  // → user sees broken image. Most China CDNs (alicdn / cbu01 / taobaocdn)
  // serve identical assets over https, so the upgrade is safe.
  const toHttps = (u: string | undefined): string | undefined =>
    u ? u.replace(/^http:\/\//i, "https://") : u;
  const mainImage = toHttps(detail?.main_image);
  const thumbs = (detail?.images ?? []).slice(0, 3).map(toHttps).filter((u): u is string => !!u);
  function fmt2(n: number): string {
    return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return (
    <div className="pcs-legacy">
      <link rel="stylesheet" href="/legacy/pcs/search.css" />

      {/* BEGIN: Content — search.php L29 (Tailwind rebuild · mobile-first) */}
      <div className="pcs-content-pad w-full px-3 md:px-6 py-3 md:py-6">
        {/* search.php L57-142 — product card (MODE A) */}
        <div className="data-pro-chinna bg-white dark:bg-surface border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="p-3 md:p-4">
            <form
              className=""
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
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="hidden md:block md:col-span-12">
                  <h2 className="text-lg font-bold text-foreground flex flex-wrap items-center gap-2 pb-0">
                    ผลการค้นหาจาก{" "}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={srcWeb ? `/legacy/pcs/shops/${srcWeb}` : ""}
                      height={50}
                      className="h-[50px] w-auto"
                      alt=""
                    />
                    <span className="text-sm font-normal text-muted" id="urlPro">
                      {" "}
                      URL :{" "}
                      <a
                        href={urlcut}
                        className="text-sky-600 hover:underline break-all"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {urlcut}
                      </a>
                    </span>
                  </h2>
                </div>
                <div className="md:col-span-4">
                  <div className="main">
                    <div className="slider slider-for">
                      {mainImage ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={mainImage}
                          alt={title || "product"}
                          className="procover w-full h-auto object-cover rounded-lg"
                        />
                      ) : (
                        <div className="pro-preload-effect procover aspect-square w-full rounded-lg"></div>
                      )}
                    </div>
                    <div className="slider slider-nav hidden md:block">
                      <div className="grid grid-cols-3 gap-2 pt-2">
                        {[0, 1, 2].map((i) => (
                          <div key={i}>
                            {thumbs[i] ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={thumbs[i]}
                                alt=""
                                className="w-full h-[100px] object-cover rounded-md"
                              />
                            ) : (
                              <div className="pro-preload-effect rounded-md" style={{ height: "100px" }}></div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="md:col-span-8">
                  <span
                    className="pb-1"
                    id="google_translate_element"
                  ></span>{" "}
                  <span className="inline md:hidden">
                    ผลการค้นหาจาก{" "}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={srcWeb ? `/legacy/pcs/shops/${srcWeb}` : ""}
                      width={50}
                      className="inline h-auto w-[50px] align-middle"
                      alt=""
                    />
                  </span>
                  <h4 className="text-base text-foreground pb-1">
                    ชื่อสินค้า :{" "}
                    {title ? (
                      <span className="title-pro font-semibold">{title}</span>
                    ) : (
                      <div className="title-pro pro-preload-effect"></div>
                    )}
                  </h4>
                  <div className="price-s rounded-lg bg-red-600 text-white px-3 py-2 flex flex-wrap items-baseline gap-x-2">
                    <span className="text-base">ราคาสินค้า : </span>
                    <span className="text-xl font-bold">
                      {priceCny > 0 ? `¥${fmt2(priceCny)}` : "¥"}
                    </span>
                    {priceCny > 0 && (
                      <span className="text-sm" style={{ opacity: 0.85 }}>
                        ≈ <b>{fmt2(priceThb)}</b> ฿
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2">
                    <div>
                      <div className="">
                        <h4 className="text-base text-foreground">
                          ชื่อร้าน :{" "}
                          <span id="nick">
                            {shopName ? (
                              <span className="font-semibold">{shopName}</span>
                            ) : (
                              <div className="nick-pro pro-preload-effect"></div>
                            )}
                          </span>
                        </h4>
                      </div>
                    </div>
                    <div>
                      <div className="">
                        <h4 className="text-base text-foreground">
                          ลิงค์สินค้า :{" "}
                          <a
                            className="text-sm"
                            href={urlcut}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <span className="inline-flex items-center gap-1 rounded-full bg-sky-500 text-white text-xs px-2 py-0.5">
                              <i className="fas fa-link"></i> ไปยังเว็บสินค้า
                            </span>{" "}
                          </a>
                        </h4>
                      </div>
                    </div>
                  </div>
                        {/* SKU axis selectors — render TAMIT's `sku_axes` if
                            available; otherwise show skeleton strips like
                            the legacy pre-AJAX state. The full sku-picker
                            with qty grid + price recompute lives at
                            /service-order/add (the proper place to commit);
                            here we just preview the option labels. */}
                        {detail?.sku_axes && detail.sku_axes.length > 0 ? (
                          <div style={{ marginTop: "8px" }}>
                            {detail.sku_axes.map((axis, ai) => (
                              <div key={ai} style={{ marginBottom: "8px" }}>
                                <h5 style={{ marginBottom: "4px", fontSize: "13px", color: "#666" }}>
                                  {axis.name}:
                                </h5>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                  {axis.values.slice(0, 12).map((v, vi) => (
                                    <span
                                      key={vi}
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "4px",
                                        padding: "4px 10px",
                                        borderRadius: "999px",
                                        border: "1px solid #e5e5e5",
                                        fontSize: "12px",
                                        background: "#fafafa",
                                      }}
                                    >
                                      {v.image && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={v.image} alt="" style={{ width: 18, height: 18, borderRadius: 4, objectFit: "cover" }} />
                                      )}
                                      {v.label}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <>
                            <div className="pro-preload-effect"></div>
                            <div className="pro-preload-effect"></div>
                            <div className="pro-preload-effect"></div>
                            <div className="pro-preload-effect"></div>
                          </>
                        )}
                  <hr className="my-3 border-t border-border" />
                  <div
                    className="border-total-product pay-c rounded-xl border border-border bg-surface-alt/50 dark:bg-surface-alt/30 p-3"
                    style={{ zIndex: 99 }}
                  >
                    <div className="grid grid-cols-12 items-center gap-y-2">
                      <div className="col-span-3 md:col-span-8 text-right">
                        <h4 className="text-base font-semibold text-foreground">ราคารวม</h4>
                      </div>
                      <div className="col-span-9 md:col-span-4 text-left md:text-right notranslate text-sm">
                        <span id="CHNTotal">{fmt2(priceCny)}</span>¥
                        <span className="">
                          &nbsp;x {rsDefault}฿/¥ ={" "}
                          <b id="THBtotal" className="text-red-600">
                            {fmt2(priceThb)}
                          </b>{" "}
                          ฿
                        </span>
                      </div>
                      <div className="col-span-3 md:col-span-8 text-right">
                        <h4 className="text-base font-semibold text-foreground">จำนวน </h4>
                      </div>
                      <div className="col-span-5 md:col-span-4 text-left md:text-right text-sm">
                        <span id="cAmount">0</span>
                        <b className="text-xs">
                          <span className="text-red-600">
                            {" "}
                            (ขั้นต่ำ{" "}
                            <span className="text-sm" id="minnum"></span>{" "}
                            ชิ้น)
                          </span>
                        </b>
                      </div>
                      <div className="col-span-4 md:col-span-12 self-end text-left md:text-right md:pt-1">
                        <button
                          type="submit"
                          id="btnCart"
                          className="btn-main inline-flex items-center gap-1.5 rounded-full bg-red-600 hover:bg-red-700 text-white text-sm px-4 py-2 transition-colors animate__animated animate__infinite animate__headShake"
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
      {/* END: Content */}
    </div>
  );
}
