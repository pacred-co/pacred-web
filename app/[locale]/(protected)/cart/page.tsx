import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADDRESSES } from "@/components/seo/site";
import {
  getShipByOptionsForAddress,
  isMaomaoEligibleForAddress,
} from "@/lib/cart/ship-by-eligibility";
import {
  CartInteractivity,
  type CartInteractiveProvider,
} from "./cart-interactivity";
import {
  CartAddressShipBy,
  type CartAddressOption,
  type ShipByOption,
} from "./cart-address-shipby";

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
 *   1. Cart-mutation jQuery + AJAX endpoints — most are now ported:
 *        - `calculateCart.php` / `recalculateCart()`     ✅ wired (Sprint-2 — Server Action + recompute)
 *        - `deleteItem.php`  (.remove-product)            ✅ wired
 *        - `updateQuantity.php` (per-row quantity input)  ✅ wired
 *        - `option-address-thai.php` (เปลี่ยนที่อยู่ modal) ✅ Sprint-10 P1.3 — SSR prop list + reveal-on-click
 *        - `api-shipBy.php` (#selectShipBy)                ✅ Sprint-10 P1.3 — SSR-rendered per-address `<option>` map
 *        - `checkPCSMaoMao.php` (PCS-เหมาๆ popup gate)     ✅ Sprint-10 P1.3 — SSR-computed eligibility per address
 *      The three address/ship-by/promo endpoints are now zero-AJAX:
 *      the Server Component pre-computes the address list +
 *      `shipByByAddress` + `maomaoByAddress` keyed by addressID, and
 *      <CartAddressShipBy> filters on the user's selection client-side.
 *      No AJAX roundtrip on every address change. See
 *      `lib/cart/ship-by-eligibility.ts` for the eligibility port.
 *   2. The two top POST handlers (`addCart` / `addCartURL`,
 *      cart.php L3-109) INSERT into tb_cart. A render-time INSERT is
 *      a mutation — NOT performed here (Next.js disallows mutations
 *      during render). Cart-add belongs to the /cart/add screen +
 *      a Server Action; this screen is the read-only cart view.
 *   3. `proValentine` / the time-boxed 3.3 promotion (cart.php L667)
 *      is a date-window check — reproduced as a server-side date
 *      compare so the conditional promotion card matches legacy.
 *   4. The `#pro-maomao` promotion modal is now wired through
 *      <CartAddressShipBy> — auto-reveals when the selected address
 *      is in the BKK metro ZIP allowlist, and `รับโปรโมชัน` accepts
 *      the promo + bridges to <CartInteractivity> via a
 *      `cart-maomao-accepted` window event (the cleanest way to keep
 *      the two client islands coupled without a parent wrapper).
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
/**
 * Build the legacy `CONCAT(addressName,' ',…) AS fullAddress` string
 * from a `tb_address` row — used by both `resolveAddressBlock` and
 * the address-list resolution for the เปลี่ยนที่อยู่ modal. Verbatim
 * with cart.php's CONCAT (L445 + L62 + L86 + L116 across the legacy
 * queries — all produce the same shape).
 */
function buildFullAddressFromRow(r: AddressRow): string {
  return `${r.addressname} ${r.addresslastname} | ${r.addressno} ตำบล/แขวง ${r.addresssubdistrict} อำเภอ/เขต ${r.addressdistrict} จังหวัด ${r.addressprovince} ${r.addresszipcode} โทร. ${r.addresstel}, ${r.addresstel2 ?? ""}`;
}

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
  // userShipBy threaded into <CartAddressShipBy> — drives the
  // default selection of `#hShipBy` + the PCSF promo branch
  // (cart.php L1132-1141).

  // ── Address block (cart.php L441-499) ───────────────────────
  // Only resolved when there are cart items (the whole address card
  // is wrapped in `if($countCart>0)`).
  const addressBlock = countCart > 0
    ? await resolveAddressBlock(admin, userID, userAddressID)
    : null;

  // ── All addresses (for the เปลี่ยนที่อยู่ modal — cart.php's
  //   option-address-thai.php) + per-address shipBy/maomao maps.
  //   Server-rendered ONCE; the client filters on selection so the
  //   legacy `getShipBy` / `checkPCSMaoMao` AJAX roundtrips are
  //   eliminated.
  const addressOptions: CartAddressOption[] = [];
  const shipByByAddress: Record<string, ShipByOption[]> = {};
  const maomaoByAddress: Record<string, boolean> = {};
  if (countCart > 0) {
    const { data: allAddrRows } = await admin
      .from("tb_address")
      .select(
        "addressid, addressname, addresslastname, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode, addresstel, addresstel2",
      )
      .eq("userid", userID)
      .eq("addressstatus", "1")
      .order("addressid", { ascending: false })
      .returns<AddressRow[]>();
    for (const r of allAddrRows ?? []) {
      const id = String(r.addressid);
      addressOptions.push({
        addressID:   id,
        fullAddress: buildFullAddressFromRow(r),
        zip:         r.addresszipcode ?? "",
        province:    r.addressprovince ?? "",
        amphoe:      r.addressdistrict ?? "",
      });
      shipByByAddress[id] = getShipByOptionsForAddress({
        zip:      r.addresszipcode,
        province: r.addressprovince,
        amphoe:   r.addressdistrict,
        userID,
      });
      maomaoByAddress[id] = isMaomaoEligibleForAddress({
        addressID: id,
        zip:       r.addresszipcode,
      });
    }
    // 'PCS' warehouse pickup is always present + always non-maomao
    // (matches checkPCSMaoMao.php — when addressID==='PCS' → proF=2).
    shipByByAddress["PCS"] = [];
    maomaoByAddress["PCS"] = false;
  }

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
                        (only rendered when there are cart items).
                        Address selection / ship-by select / maomao
                        popup are wired in <CartAddressShipBy> (a Client
                        Component). The three legacy AJAX endpoints
                        `option-address-thai.php` / `api-shipBy.php` /
                        `checkPCSMaoMao.php` are replaced by the
                        SSR-computed `addressOptions` + `shipByByAddress`
                        + `maomaoByAddress` props — no AJAX. */}
                    {countCart > 0 && addressBlock && (
                      <CartAddressShipBy
                        initialAddressBlock={addressBlock}
                        addresses={addressOptions}
                        shipByByAddress={shipByByAddress}
                        maomaoByAddress={maomaoByAddress}
                        userShipBy={userShipBy}
                        warehouseAddress={PCS_WAREHOUSE_ADDRESS}
                        warehouseMapUrl={PCS_WAREHOUSE_MAP_URL}
                      />
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
                        memberCode={userID}
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
      {/* cart.php L736 — the address-option AJAX slot + L737-754 the
          PCS-เหมาๆ promotion modal both now rendered by
          <CartAddressShipBy> above. Those legacy `<div>` containers
          are intentionally dropped: the equivalent reactive markup
          ships inside the Client component along with the wiring. */}
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
        fullAddress: buildFullAddressFromRow(matchRow),
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
            fullAddress: buildFullAddressFromRow(mainAddr),
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
