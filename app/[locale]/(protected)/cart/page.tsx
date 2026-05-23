import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADDRESSES } from "@/components/seo/site";
import {
  CartInteractivity,
  type CartInteractiveProvider,
} from "./cart-interactivity";

/**
 * Customer shopping-cart screen for the ฝากสั่งซื้อ (China shop-order)
 * flow — a FAITHFUL 1:1 TRANSCRIPTION of the legacy PCS Cargo
 * `member/cart.php` (D1 / ADR-0017 · faithful-port transcription ·
 * runbook `docs/runbook/faithful-port-transcription.md`).
 *
 * This is a transcription, NOT a reinterpretation. The JSX below is
 * the exact HTML markup `cart.php` renders for its `<!-- BEGIN:
 * Content -->` body (cart.php L424-755) — same Bootstrap-4 elements,
 * same class names, same Thai labels, same order. The Thai text is
 * hardcoded exactly as the PHP has it (legacy hardcodes Thai →
 * faithful = hardcoded; this screen does NOT use next-intl). The
 * visual identity comes from the legacy CSS, brought in verbatim as
 * the static `.pcs-legacy`-scoped `public/legacy/pcs/cart.css`
 * (= assets/css/cart.css + the cart.php inline <style> block + the
 * BS4 grid/card/modal subset the markup uses), loaded via a plain
 * <link> so it bypasses Tailwind/PostCSS.
 *
 * ── Scope — the navbar + sidebar are app-shell chrome ────────
 * cart.php L181-422 renders the global header navbar + left
 * sidebar (the same `include/header.php` chrome every member page
 * carries). Following the `menu.php` pilot (which likewise did NOT
 * transcribe the navbar/sidebar — the protected `layout.tsx` owns
 * app-shell chrome), this file transcribes ONLY the page-unique
 * `<!-- BEGIN: Content -->` body. The legacy nav/sidebar is a
 * cross-cutting include, not part of this screen's transcription.
 *
 * ── Data — every cart.php SQL query transcribed 1:1 to `tb_*` ─
 * `tb_*` is RLS-locked to service_role → reads go through the
 * admin client. Join key: `tb_*.userid === profile.member_code`
 * (the customer's "PR<n>" code). Queries transcribed:
 *   - $rsDefault    → tb_settings.rsdefault  WHERE ID=1      (cart.php L142-145)
 *   - $userAddressID / $userTransportType / $userShipBy / $userPayMethod
 *                   → tb_users (useraddressid, usertransporttype,
 *                     usershipby, userpaymethod)             (cart.php L146-153)
 *   - $userShipBy fallback → tb_forwarder.fshipby
 *                     ORDER BY ID DESC                       (cart.php L154-161)
 *   - $countCart    → COUNT(ID) FROM tb_cart                 (cart.php L163-170)
 *   - address block → tb_address (addressID + the CONCAT fullAddress)
 *                     / tb_address_main fallback             (cart.php L441-499)
 *   - cart rows     → DISTINCT(cProvider) → DISTINCT(cNameShop)
 *                     → SELECT * FROM tb_cart                (cart.php L522-586)
 *
 * Rebrand DONE: legacy `PCS<n>` member codes + `PCS` brand → `PR<n>` +
 * `PR` / Pacred. Legacy hardcoded phone "02-055-6063" and the
 * warehouse address are copied verbatim (borrowed-API / company
 * facts — not scrubbed per runbook §3).
 *
 * ── FLAGGED — not strictly 1:1 (documented, never silently diverged) ──
 *   1. Cart-mutation jQuery + AJAX endpoints are NOT wired. cart.php
 *      ships a large client-side script block (cart.php L788-1143):
 *        - `calculateCart.php` / `recalculateCart()`     — live subtotal/total
 *        - `deleteItem.php`  (the `.remove-product` trash button)
 *        - `updateQuantity.php` (the per-row quantity `<input>`)
 *        - `option-address-thai.php` (the เปลี่ยนที่อยู่ modal)
 *        - `api-shipBy.php` / `checkPCSMaoMao.php`  (the #selectShipBy
 *          slot + the PCS-เหมาๆ promotion popup)
 *      These are jQuery `$.ajax` POSTs to legacy PHP endpoints. A
 *      Server Component render must stay a PURE READ — it cannot run
 *      jQuery, and re-wiring 6 AJAX proxies is non-trivial. The
 *      visible cart surface (rows, totals shell, address block,
 *      transport/crate radios, promotion cards, modal) is rendered
 *      1:1; the interactive behaviour is left unwired. The totals
 *      values (`#cart-subtotal`, `#cart-total`) render EMPTY exactly
 *      as the legacy screen shows them before its AJAX returns.
 *   2. The two top POST handlers (`addCart` / `addCartURL`,
 *      cart.php L3-109) INSERT into tb_cart. A render-time INSERT is
 *      a mutation — NOT performed here (Next.js disallows mutations
 *      during render). Cart-add belongs to the /cart/add screen +
 *      a Server Action; this screen is the read-only cart view.
 *   3. `proValentine` / the time-boxed 3.3 promotion (cart.php L667)
 *      is a date-window check — reproduced as a server-side date
 *      compare so the conditional promotion card matches legacy.
 *   4. The `#pro-maomao` promotion modal renders 1:1 in its hidden
 *      default state; legacy reveals it via jQuery `.modal("show")`
 *      (part of FLAG 1) — left hidden.
 *   5. Legacy raster assets are referenced at `/legacy/pcs/…` (NOT
 *      copied here — listed in the transcription report for the
 *      integrator to stage). The shop-empty illustration legacy
 *      pulls from the WordPress uploads dir is referenced at
 *      `/legacy/pcs/shop-2-300x300.png`.
 */

// Server Components reading cookies/auth under a layout must be dynamic.
export const dynamic = "force-dynamic";

// cart.php L17 / L76 — cart capacity cap: countFor = 151 - countCart.
// Kept for parity (the legacy add-flow uses it; the read view does not).
const CART_CAPACITY = 151;

// "รับเองที่โกดัง" (self pick-up) — wired to Pacred's TH receiving warehouse
// (ADDRESSES.warehouseTh — สมุทรสาคร). Legacy PCS hardcoded a Bangkok address;
// under D1 the actual Pacred warehouse is in Samut Sakhon (the canonical SOT).
const PCS_WAREHOUSE_ADDRESS = `รับเองที่โกดัง Pacred · ${ADDRESSES.warehouseTh.full}`;
// Map URL pending — when พี่ป๊อปส่ง Google Maps pin for the Samut Sakhon
// warehouse, drop it here (replaces the legacy PCS map link). Empty string
// hides the "ดูแผนที่" CTA via the && short-circuit in the template.
const PCS_WAREHOUSE_MAP_URL = "";

type CartRow = {
  id: number;
  cdetails: string | null;
  curl: string | null;
  ctitle: string | null;
  cnameshop: string | null;
  cprovider: string | null;
  cimages: string | null;
  cprice: number | null;
  camount: number | null;
  ccolor: string | null;
  csize: string | null;
  userid: string | null;
};

/**
 * Transcribes the legacy `imgProvider()` helper
 * (`member/include/function.php` L35-44): maps the `cProvider`
 * code (1/2/3/4/5) to the provider logo `<img>` (or the literal
 * text "Shops" for provider 4). Returns the relative legacy asset
 * path; the PHP basePath is replaced by the `/legacy/pcs/` static
 * mount. Provider 4 → plain text, mirroring the PHP `switch`.
 */
function imgProvider(cProvider: string | null): {
  kind: "img" | "text";
  src?: string;
  text?: string;
} {
  switch (cProvider) {
    case "1":
      return { kind: "img", src: "/legacy/pcs/shops/1688-logo.png" };
    case "2":
      return { kind: "img", src: "/legacy/pcs/shops/taobao-logo.png" };
    case "3":
      return { kind: "img", src: "/legacy/pcs/shops/tmall-logo.png" };
    case "5":
      return { kind: "img", src: "/legacy/pcs/shops/nice-logo.png" };
    case "4":
    default:
      return { kind: "text", text: "Shops" };
  }
}

/**
 * Transcribes the legacy `convertIMGCHN($url,$size)` helper
 * (`member/include/function.php` L1414-1437): resolves a stored
 * `cImages` value to a displayable URL. Empty → the default
 * placeholder; an absolute URL is kept (with the OSS-style query
 * params stripped) and the `$size` suffix appended unless it is a
 * pcscargo.co.th URL; a bare filename → the `images/shops/` dir.
 * The PHP basePath maps to the `/legacy/pcs/` static mount.
 */
function convertIMGCHN(url: string | null, size: string): string {
  if (!url || url === "") {
    return "/legacy/pcs/images/shops/default.png";
  }
  const u = url
    .split("?x-oss-process=style/alsy")
    .join("")
    .split("?x-oss-process=style/tbsy")
    .join("")
    .split("_250x250.jpg")
    .join("");
  if (u.includes("/")) {
    if (/pcscargo\.co\.th/.test(u)) {
      return u;
    }
    return u + size;
  }
  return "/legacy/pcs/images/shops/" + u;
}

export default async function CartPage() {
  // header.php L9-72: a logged-out visitor is redirected to /login.
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;

  const admin = createAdminClient();
  // $userID — the customer member code; legacy PCS#### is rebranded PR####.
  const userID = profile.member_code ?? "";

  // ── Transcribed queries ──────────────────────────────────────
  // cart.php L142-145: SELECT rsDefault FROM tb_settings WHERE ID=1
  // cart.php L146-153: SELECT userAddressID, userTransportType,
  //   userShipBy, userPayMethod FROM tb_users WHERE userID=…
  // cart.php L163-170: SELECT COUNT(ID) FROM tb_cart WHERE userID=…
  const [settingsRes, userRowRes, cartCountRes] = await Promise.all([
    admin
      .from("tb_settings")
      .select("rsdefault")
      .eq("id", 1)
      .maybeSingle<{ rsdefault: number }>(),
    admin
      .from("tb_users")
      .select("useraddressid, usertransporttype, usershipby, userpaymethod")
      .eq("userid", userID)
      .maybeSingle<{
        useraddressid: string | null;
        usertransporttype: string | null;
        usershipby: string | null;
        userpaymethod: string | null;
      }>(),
    admin
      .from("tb_cart")
      .select("id", { count: "exact", head: true })
      .eq("userid", userID),
  ]);

  const rsDefault = Number(settingsRes.data?.rsdefault ?? 0);
  const userAddressID = userRowRes.data?.useraddressid ?? "";
  // cart.php L150-151: $userTransportType is read then forced to 2.
  // Typed `number` (not the literal 2) so the legacy `=== 1` radio
  // checks below stay as faithful transcribed comparisons.
  const userTransportType: number = 2;
  let userShipBy = userRowRes.data?.usershipby ?? "";
  // cart.php L163-170: $countCart from the COUNT(ID) query.
  const countCart = cartCountRes.count ?? 0;

  // cart.php L154-161: when userShipBy is blank, fall back to the
  //   customer's most-recent tb_forwarder.fShipBy (ORDER BY ID DESC).
  if (userShipBy === "") {
    const { data: fwdRow } = await admin
      .from("tb_forwarder")
      .select("fshipby")
      .eq("userid", userID)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle<{ fshipby: string | null }>();
    if (fwdRow?.fshipby) {
      userShipBy = fwdRow.fshipby;
    }
  }
  // userShipBy participates in the legacy JS (PCSF promo branch);
  // referenced here so the value is computed exactly as legacy.
  void userShipBy;

  // ── Address block (cart.php L441-499) ───────────────────────
  // Only resolved when there are cart items (the whole address card
  // is wrapped in `if($countCart>0)`).
  const addressBlock = countCart > 0
    ? await resolveAddressBlock(admin, userID, userAddressID)
    : null;

  // ── Cart rows, grouped provider → shop (cart.php L522-586) ───
  // cart.php L523: SELECT DISTINCT(cProvider) … GROUP BY cProvider
  // Then per provider: DISTINCT(cNameShop) … then SELECT * per
  //   (provider, shop). PostgREST cannot express the legacy nested
  //   DISTINCT loop in one call, so the rows are fetched once and
  //   grouped in code — same shape the PHP renders.
  const { data: cartRowsData } = await admin
    .from("tb_cart")
    .select(
      "id, cdetails, curl, ctitle, cnameshop, cprovider, cimages, cprice, camount, ccolor, csize, userid",
    )
    .eq("userid", userID);
  const cartRows = (cartRowsData ?? []) as CartRow[];

  // Build the provider → shop → rows grouping. cart.php iterates
  // DISTINCT cProvider in result order, then DISTINCT cNameShop per
  // provider in result order. `noRow` is the running 1-based index
  // printed in each `.product-count` cell (cart.php L560).
  const providers: string[] = [];
  for (const row of cartRows) {
    const p = row.cprovider ?? "";
    if (!providers.includes(p)) providers.push(p);
  }
  let noRow = 1;
  const groupedProviders = providers.map((providerCode) => {
    const providerRows = cartRows.filter(
      (r) => (r.cprovider ?? "") === providerCode,
    );
    const shops: string[] = [];
    for (const row of providerRows) {
      const s = row.cnameshop ?? "";
      if (!shops.includes(s)) shops.push(s);
    }
    const groupedShops = shops.map((shopName) => {
      const shopRows = providerRows.filter(
        (r) => (r.cnameshop ?? "") === shopName,
      );
      return {
        shopName,
        rows: shopRows.map((r) => ({ row: r, count: noRow++ })),
      };
    });
    return { providerCode, shops: groupedShops };
  });
  // cart.php L841 — $('#countID').html(noRow-1); the total row count.
  const totalRowCount = noRow - 1;

  // ── Build the serializable tree passed to <CartInteractivity> ──
  // The client component owns the cart-list rendering + the order-
  // summary card, so it needs the same pre-grouped tree but with the
  // SSR-computed `imgProvider()` / `convertIMGCHN()` resolutions
  // baked in (those helpers reference legacy paths the server holds
  // canonical knowledge of). Producing the resolved props here keeps
  // the client component free of legacy URL guessing.
  const interactiveProviders: CartInteractiveProvider[] =
    groupedProviders.map((p) => ({
      providerCode: p.providerCode,
      providerImg: imgProvider(p.providerCode).kind === "img"
        ? {
            kind: "img" as const,
            src: imgProvider(p.providerCode).src ?? "",
          }
        : {
            kind: "text" as const,
            text: imgProvider(p.providerCode).text ?? "",
          },
      shops: p.shops.map((s) => ({
        shopName: s.shopName,
        rows: s.rows.map(({ row, count }) => ({
          id: row.id,
          cdetails: row.cdetails,
          curl: row.curl,
          ctitle: row.ctitle,
          cnameshop: row.cnameshop,
          cprovider: row.cprovider,
          cimages: row.cimages,
          cprice: Number(row.cprice ?? 0),
          camount: Number(row.camount ?? 0),
          ccolor: row.ccolor,
          csize: row.csize,
          imageThumbUrl: convertIMGCHN(row.cimages, "_80x80.jpg"),
          imageFullUrl: convertIMGCHN(row.cimages, ""),
          providerImg:
            imgProvider(row.cprovider).kind === "img"
              ? {
                  kind: "img" as const,
                  src: imgProvider(row.cprovider).src ?? "",
                }
              : {
                  kind: "text" as const,
                  text: imgProvider(row.cprovider).text ?? "",
                },
          count,
        })),
      })),
    }));

  // cart.php L667 — the time-boxed 3.3 promotion window check.
  const now = new Date();
  const promo33Active =
    now >= new Date("2026-03-04T00:00:01") &&
    now <= new Date("2026-03-06T23:59:59");

  return (
    <div className="pcs-legacy">
      {/* Legacy PCS stylesheet — static public/ asset, loaded via a
          plain <link> so it bypasses Tailwind/PostCSS. */}
      <link rel="stylesheet" href="/legacy/pcs/cart.css" />

      {/* BEGIN: Content — cart.php L424 */}
      <div id="focus-search"></div>
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          <div className="content-body pr110">
            <section>
              {/* cart.php L431 — the cart form (POST → shops/ on submit) */}
              <form
                className="form-horizontal p-0 m-0 cart-form"
                method="POST"
                action="/service-order"
                autoComplete="off"
              >
                <div className="row">
                  <div className="col-12">
                    {/* ── Thai delivery-address card — cart.php L434-509 ──
                        (only rendered when there are cart items) */}
                    {countCart > 0 && (
                      <div className="ele-address-thai box-shadow mb-2">
                        <div className="top-address-thai"></div>
                        <div className="p-1">
                          <h3 className="text-color mb-1">
                            <span className="fa fa-map"></span> ที่อยู่ในการจัดส่งในไทย{" "}
                            <i className="flag-icon flag-icon-th"></i>
                          </h3>
                          <div className="address-select">
                            {addressBlock?.mode === "saved" && (
                              <>
                                <input
                                  type="text"
                                  name="addressID"
                                  id="addressIDMain"
                                  defaultValue={addressBlock.addressID}
                                  required={true}
                                />
                                <span className="address-select-now">
                                  {addressBlock.fullAddress}
                                  <span className="box-lastaddress">
                                    {addressBlock.lastAddressLabel}
                                  </span>
                                </span>
                                <span className="btn-change-address-thai cursor-pointer">
                                  เปลี่ยนที่อยู่
                                </span>
                              </>
                            )}
                            {addressBlock?.mode === "warehouse-saved" && (
                              <>
                                <input
                                  type="text"
                                  name="addressID"
                                  id="addressIDMain"
                                  defaultValue="PCS"
                                  required={true}
                                />
                                <span className="address-select-now">
                                  {PCS_WAREHOUSE_ADDRESS}
                                  <span className="box-lastaddress">
                                    ที่อยู่ล่าสุดที่เคยสั่ง
                                  </span>
                                  <span className="ml-1 btn-add-address-thai cursor-pointer">
                                    เปลี่ยนที่อยู่
                                  </span>
                                  {PCS_WAREHOUSE_MAP_URL && (
                                    <div>
                                      <a
                                        href={PCS_WAREHOUSE_MAP_URL}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-info"
                                      >
                                        <i className="fa fa-map"></i> ดูแผนที่โกดัง Pacred
                                        ในไทย
                                      </a>
                                    </div>
                                  )}
                                </span>
                              </>
                            )}
                            {addressBlock?.mode === "warehouse-default" && (
                              <>
                                <input
                                  type="text"
                                  name="addressID"
                                  id="addressIDMain"
                                  defaultValue="PCS"
                                  required={true}
                                />
                                <span className="address-select-now">
                                  {PCS_WAREHOUSE_ADDRESS}
                                  {PCS_WAREHOUSE_MAP_URL && (
                                    <a
                                      href={PCS_WAREHOUSE_MAP_URL}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-info"
                                    >
                                      <i className="fa fa-map"></i> ดูแผนที่โกดัง Pacred
                                      ในไทย
                                    </a>
                                  )}
                                </span>
                                <span className="btn-change-address-thai cursor-pointer">
                                  เปลี่ยนที่อยู่
                                </span>
                              </>
                            )}
                            {addressBlock?.mode === "none" && (
                              <>
                                <input
                                  type="text"
                                  name="addressID"
                                  id="addressIDMain"
                                  defaultValue=""
                                  required={true}
                                />
                                <span className="address-select-now"></span>
                                <span className="btn-add-address-thai cursor-pointer">
                                  เพิ่มที่อยู่ หรือ เลือกรับเองโกดัง Pacred กทม
                                </span>
                              </>
                            )}
                          </div>
                          <div className="shipBy-select pt-1 mb-05">
                            <div id="selectShipBy"></div>
                          </div>
                          <div className="text-danger font-0_85rem">
                            หมายเหตุ : หากพื้นที่นอกเขตขนส่งของ Pacred
                            ทางบริษัทจะเก็บเงินปลายทางเท่านั้น{" "}
                            <a href="/services/import-china" target="_blank" rel="noreferrer">
                              (เช็คพื้นที่ได้ที่นี่)
                            </a>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── Shopping-cart item list — cart.php L510-600 ──
                        Empty-cart state renders SSR (no interactivity
                        needed); when rows exist, the rendering + the
                        promo + order-summary card are delegated to
                        the `<CartInteractivity>` client component so
                        checkboxes, the per-row quantity, the live
                        totals, and the "เลือกทั้งหมด" toggle drive
                        state. cart.php L510-600 / L652-727. */}
                    {cartRows.length > 0 ? (
                      <CartInteractivity
                        groupedProviders={interactiveProviders}
                        totalRowCount={totalRowCount}
                        initialRsDefault={rsDefault}
                        promo33Active={promo33Active}
                        shippingCard={
                          <div className="ele-addressCHN-cart box-shadow mb-1 p-1">
                            <h3 className="text-color">
                              <span className="fa fa-map"></span> การขนส่งจากจีนมาไทย{" "}
                              <i className="flag-icon flag-icon-ch"></i>
                            </h3>
                            <div className="row">
                              <div className="col-md-6">
                                <label
                                  className="form-control-label mb-0 font-1_2rem"
                                  htmlFor="hTransportType"
                                >
                                  รูปแบบการขนส่งจีน-ไทย
                                </label>
                                <div className="row">
                                  <div className="col-md-6">
                                    <fieldset
                                      className="border-checkbox-transportType border-checkbox cursor-pointer box-shadow"
                                      data-for="transportType-ek"
                                    >
                                      <input
                                        type="radio"
                                        className="radio-custom radio-custom-transportType cursor-pointer"
                                        name="hTransportType"
                                        value="1"
                                        id="transportType-ek"
                                        defaultChecked={userTransportType === 1}
                                      />
                                      <label
                                        htmlFor="transportType-ek"
                                        className="cursor-pointer radio-custom-label"
                                      >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          className="img-fluid"
                                          src="/legacy/pcs/theme/transport-car-v3.png"
                                          style={{ maxHeight: "35px" }}
                                          alt=""
                                        />
                                        ทางรถ (EK) 5-7 วัน
                                      </label>
                                    </fieldset>
                                  </div>
                                  <div className="col-md-6">
                                    <fieldset
                                      className="border-checkbox-transportType border-checkbox cursor-pointer"
                                      data-for="transportType-sea"
                                    >
                                      <input
                                        type="radio"
                                        className="radio-custom radio-custom-transportType cursor-pointer"
                                        name="hTransportType"
                                        value="2"
                                        id="transportType-sea"
                                        defaultChecked={userTransportType !== 1}
                                      />
                                      <label
                                        htmlFor="transportType-sea"
                                        className="cursor-pointer radio-custom-label"
                                      >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          className="img-fluid"
                                          src="/legacy/pcs/theme/transport-sea-v3.png"
                                          style={{ maxHeight: "35px" }}
                                          alt=""
                                        />
                                        ทางเรือ (SEA) 12-16 วัน
                                      </label>
                                    </fieldset>
                                  </div>
                                </div>
                              </div>
                              <div className="col-md-6">
                                <label
                                  className="form-control-label mb-0 font-1_2rem"
                                  htmlFor="hTransportType"
                                >
                                  การตีลังไม้สินค้า
                                </label>
                                <div className="row">
                                  <div className="col-md-6">
                                    <fieldset
                                      className="border-checkbox-crate border-checkbox cursor-pointer active box-shadow"
                                      data-for="crate-1"
                                    >
                                      <input
                                        type="radio"
                                        className="radio-custom radio-custom-crate cursor-pointer"
                                        name="crate"
                                        value="2"
                                        id="crate-1"
                                        defaultChecked
                                      />
                                      <label
                                        htmlFor="crate-1"
                                        className="cursor-pointer radio-custom-label"
                                      >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          className="img-fluid"
                                          src="/legacy/pcs/theme/uncrate-v3.png"
                                          style={{ maxHeight: "35px" }}
                                          alt=""
                                        />
                                        ไม่ตีลังไม้
                                      </label>
                                    </fieldset>
                                  </div>
                                  <div className="col-md-6">
                                    <fieldset
                                      className="border-checkbox-crate border-checkbox cursor-pointer"
                                      data-for="crate-2"
                                    >
                                      <input
                                        type="radio"
                                        className="radio-custom radio-custom-crate cursor-pointer"
                                        name="crate"
                                        value="1"
                                        id="crate-2"
                                      />
                                      <label
                                        htmlFor="crate-2"
                                        className="cursor-pointer radio-custom-label"
                                      >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          className="img-fluid"
                                          src="/legacy/pcs/theme/crate-v3.png"
                                          style={{ maxHeight: "35px" }}
                                          alt=""
                                        />
                                        ตีลังไม้ (มีค่าบริการ)
                                      </label>
                                    </fieldset>
                                  </div>
                                  <div className="col-md-12 p05">
                                    <span className="text-danger font-0_85rem">
                                      **หากต้องการตีลังไม้สินค้าบางร้าน
                                      ให้ทำการเลือกสั่งออเดอร์แยกรายการกัน
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        }
                      />
                    ) : (
                      // cart.php L588-597 — the empty-cart card.
                      <div className="ele-shopping-cart mb-2">
                        <div className="shopping-cart">
                          {/* cart.php L512-521 — the column-label header row */}
                          <div className="ele-item-3 column-labels">
                            <label className="product-check">
                              <input
                                type="checkbox"
                                name="checkAll"
                                className="dt-checkboxes check-all"
                                value="all"
                              />
                            </label>
                            <label className="product-count"></label>
                            <label className="product-image"></label>
                            <label className="product-details">รายละเอียดสินค้า</label>
                            <label className="product-price">ราคาต่อชิ้น</label>
                            <label className="product-quantity">จำนวน</label>
                            <label className="product-removal">ตัวเลือก</label>
                            <label className="product-line-price">ราคารวม</label>
                          </div>
                          <div className="text-center bg-light box-shadow2">
                            <h5 className="p-1">
                              <b>ไม่มีพบสินค้าในรถเข็น</b>
                            </h5>
                            <div className="text-center">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                className="img-fluid"
                                src="/legacy/pcs/shop-2-300x300.png"
                                alt=""
                              />
                            </div>
                            <h5 className="pb-1">
                              <Link className="text-info" href="/service-order/add">
                                เพิ่มสินค้า
                              </Link>
                            </h5>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* The legacy cart-list / shipping-card /
                        price-card markup (cart.php L510-727) is now
                        owned by the <CartInteractivity> client
                        component above — interactivity that the
                        legacy ran via jQuery is now React state,
                        backed by the calculateCartTotal Server Action
                        in actions/cart.ts. */}
                    {/* (legacy ele-addressCHN-cart + ele-price-cart
                        markup deleted — now rendered by the
                        <CartInteractivity> client component above) */}
                  </div>
                </div>
              </form>
            </section>
          </div>
        </div>
      </div>
      {/* cart.php L736 — the address-option AJAX slot */}
      <div id="option-address-thai"></div>
      {/* cart.php L737-754 — the PCS-เหมาๆ promotion modal.
          Renders 1:1 in its hidden default state; legacy reveals it
          via jQuery `.modal("show")` (FLAGGED — jQuery not wired). */}
      <div
        id="pro-maomao"
        className="modal fade in"
        tabIndex={-1}
        role="dialog"
        aria-hidden="true"
      >
        <div className="pcs-notify modal-dialog modal-sm">
          <div
            className="modal-content modal-content-pcs"
            style={{ backgroundColor: "unset" }}
          >
            <div className="modal-header">
              <span className="text-white font-1_7rem">
                คุณได้รับสิทธิ์ร่วมโปรโมชัน Pacred เหมา ๆ{" "}
              </span>
              <button
                type="button"
                className="close text-white"
                data-dismiss="modal"
                aria-hidden="true"
                style={{
                  opacity: 1,
                  border: "2px solid",
                  borderRadius: "20px",
                }}
              >
                <i
                  className="la la-close text-white"
                  style={{ fontSize: "1.5rem" }}
                ></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="bg-pro-valentine">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/legacy/pcs/theme/free50-3.png"
                  className="img-fluid"
                  alt=""
                />
              </div>
              <div
                className="modal-footer text-center"
                style={{ display: "inherit" }}
              >
                <span
                  className="btn btn-main round btn-min-width animate__animated animate__infinite animate__headShake cursor-pointer"
                  id="btn-getMaoMao"
                >
                  รับโปรโมชัน เหมา ๆ
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* END: Content — cart.php L755 */}
      {/* cart.php L756-759 — preload <img width=0> hints for the
          promotion modal assets. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/legacy/pcs/theme/btn-form-pro-valentine+maomao.png"
        width={0}
        alt=""
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/legacy/pcs/theme/free50-3.png" width={0} alt="" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/legacy/pcs/theme/bg-form-pro-valentine+maomao.png"
        width={0}
        alt=""
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/legacy/pcs/theme/bg-form-pro-valentine.png" width={0} alt="" />
      {/* cart.php L841 — #countID running total + the cart-capacity
          cap; both computed exactly as legacy and kept here so the
          values participate identically. */}
      <span
        hidden
        data-total-rows={totalRowCount}
        data-cart-capacity={CART_CAPACITY}
        data-count-cart={countCart}
      />
    </div>
  );
}

/**
 * Resolves the Thai delivery-address block — transcribes the legacy
 * cart.php L441-499 branching:
 *
 *   1. tb_address rows for this user with addressStatus='1' exist?
 *      a. and the row matching $userAddressID exists → "saved" (the
 *         CONCAT fullAddress + the ที่อยู่ล่าสุด / ที่อยู่หลัก label).
 *      b. else, the tb_address_main ⋈ tb_address fallback (unless
 *         $userAddressID == 'PCS') → also "saved".
 *      c. else → the warehouse pickup default ("warehouse-default").
 *   2. no tb_address rows:
 *      a. $userAddressID == 'PCS' → "warehouse-saved" (warehouse +
 *         the ที่อยู่ล่าสุด label).
 *      b. else → "none" (the bare เพิ่มที่อยู่ prompt).
 *
 * The CONCAT fullAddress mirrors cart.php L445 / L455 verbatim.
 */
async function resolveAddressBlock(
  admin: ReturnType<typeof createAdminClient>,
  userID: string,
  userAddressID: string,
): Promise<
  | {
      mode: "saved";
      addressID: string;
      fullAddress: string;
      lastAddressLabel: string;
    }
  | { mode: "warehouse-saved" }
  | { mode: "warehouse-default" }
  | { mode: "none" }
> {
  // cart.php L441-442: SELECT addressID FROM tb_address
  //   WHERE userID=… AND addressStatus='1'
  const { data: anyAddr } = await admin
    .from("tb_address")
    .select("addressid")
    .eq("userid", userID)
    .eq("addressstatus", "1");
  const hasAddress = (anyAddr ?? []).length > 0;

  // Build the legacy CONCAT(...) AS fullAddress string from a row.
  const buildFullAddress = (r: AddressRow): string =>
    `${r.addressname} ${r.addresslastname} | ${r.addressno} ตำบล/แขวง ${r.addresssubdistrict} อำเภอ/เขต ${r.addressdistrict} จังหวัด ${r.addressprovince} ${r.addresszipcode} โทร. ${r.addresstel}, ${r.addresstel2 ?? ""}`;

  if (hasAddress) {
    // cart.php L445-446: the row matching $userAddressID.
    const { data: matchRow } = await admin
      .from("tb_address")
      .select(
        "addressid, addressname, addresslastname, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode, addresstel, addresstel2",
      )
      .eq("userid", userID)
      .eq("addressstatus", "1")
      .eq("addressid", userAddressID)
      .maybeSingle<AddressRow>();

    if (matchRow) {
      // cart.php L452 — the label: legacy `if($userAddressID!=''
      //   || $userAddressID!='PCS')` is always true, so it always
      //   prints "ที่อยู่ล่าสุดที่เคยสั่ง" — reproduced verbatim.
      return {
        mode: "saved",
        addressID: String(matchRow.addressid),
        fullAddress: buildFullAddress(matchRow),
        lastAddressLabel: "ที่อยู่ล่าสุดที่เคยสั่ง",
      };
    }

    // cart.php L454-465: the tb_address_main ⋈ tb_address fallback.
    if (userAddressID !== "PCS") {
      const { data: mainRow } = await admin
        .from("tb_address_main")
        .select("addressid")
        .eq("userid", userID)
        .maybeSingle<{ addressid: number }>();
      if (mainRow) {
        const { data: mainAddr } = await admin
          .from("tb_address")
          .select(
            "addressid, addressname, addresslastname, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode, addresstel, addresstel2",
          )
          .eq("addressid", mainRow.addressid)
          .eq("addressstatus", "1")
          .maybeSingle<AddressRow>();
        if (mainAddr) {
          // cart.php L465 — label: `if($userAddressID!='')` →
          //   ที่อยู่ล่าสุด, else ที่อยู่หลัก.
          return {
            mode: "saved",
            addressID: String(mainAddr.addressid),
            fullAddress: buildFullAddress(mainAddr),
            lastAddressLabel:
              userAddressID !== ""
                ? "ที่อยู่ล่าสุดที่เคยสั่ง"
                : "ที่อยู่หลัก",
          };
        }
      }
    }
    // cart.php L467-473 — warehouse pickup default.
    return { mode: "warehouse-default" };
  }

  // cart.php L481-498 — no tb_address rows.
  if (userAddressID === "PCS") {
    return { mode: "warehouse-saved" };
  }
  return { mode: "none" };
}

type AddressRow = {
  addressid: number;
  addressname: string | null;
  addresslastname: string | null;
  addressno: string | null;
  addresssubdistrict: string | null;
  addressdistrict: string | null;
  addressprovince: string | null;
  addresszipcode: string | null;
  addresstel: string | null;
  addresstel2: string | null;
};
