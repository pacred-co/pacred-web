import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import CartRowActions, { CartRowRemove } from "./cart-row-actions";
import CartSubmitButton from "./cart-submit-button";

/**
 * Admin > "รถเข็นสินค้า" — a FAITHFUL 1:1 TRANSCRIPTION of the
 * legacy PCS Cargo admin `pcs-admin/cart.php` default view
 * (the `if(!isset($_POST['..']))` branch — L139-590), per
 * D1 / ADR-0017 + the faithful-port transcription runbook
 * (`docs/runbook/faithful-port-transcription.md` §8 — admin pattern).
 *
 * The legacy `cart.php` is the admin-side shopping cart for
 * 1688/Taobao/Tmall/Shops China e-commerce purchases — CS staff
 * use this to add items to a customer's cart on their behalf
 * (typically when the customer can't navigate the Chinese sites)
 * and then submit the cart as a real order against `tb_h_shop`.
 *
 * Per ภูม Q3 + the audit sidebar-pairing rule ("ทุก sidebar =
 * own page"), this is its OWN page (NOT a customer-cart
 * impersonation view). The sidebar link
 * `lib/admin/sidebar-menu.ts` ("รถเข็นแอดมิน") already points
 * at `/admin/service-orders/cart` — this transcription replaces
 * the redirect-stub that sat there.
 *
 * The JSX below is the exact HTML structure `cart.php` renders —
 * same Bootstrap-4 markup, same elements, same labels (Thai
 * hardcoded), same column order. The visual identity comes from
 * the legacy admin CSS, brought in verbatim as the static
 * `.pcs-legacy`-scoped `public/legacy/pcs/admin/admin-base.css`
 * (the shared admin chrome — established by the admin-table pilot)
 * and `public/legacy/pcs/admin/cart.css` (the page-specific
 * inline `<style>` block from cart.php L148-346), both loaded
 * via plain `<link rel="stylesheet">` so they bypass the app's
 * Tailwind v4 / PostCSS pipeline (the rule da4cd79 set).
 *
 * `cart.php` source structure transcribed here:
 *   - Title bar            cart.php L140
 *   - Search-bar header    cart.php L361-377 (URL paste box + the
 *                          two yellow CTAs "เพิ่มในตระกร้าแอดมินแบบกำหนดเอง"
 *                          + "เพิ่มในตระกร้าลูกค้า")
 *   - Card header          cart.php L386-405 (page heading w/ cart-count
 *                          out of 100 + "สั่งสินค้าเพิ่ม" CTA)
 *   - Customer-search row  cart.php L408-419 (the userID input box that
 *                          lets CS view another customer's cart)
 *   - Column labels        cart.php L424-432 (ลำดับ · รูปสินค้า ·
 *                          รายละเอียดสินค้า · ราคาต่อชิ้น · จำนวน ·
 *                          แอคชั่น · ราคารวม)
 *   - Product rows         cart.php L435-499 (grouped by cProvider →
 *                          cNameShop, with the 8-column product strip
 *                          rendered per row)
 *   - Shipping form        cart.php L502-565 (coID + userID dropdowns +
 *                          hShipBy dropdown + transportType dropdown +
 *                          totals strip with subtotal/exchange/grand-total)
 *
 * Data — every `cart.php` mysqli query transcribed 1:1 to the ported
 * legacy `tb_*` schema (Supabase, migration 0081). `tb_*` is
 * RLS-locked to service_role, so reads go through the admin client.
 *   - $countCart      → COUNT(*) FROM tb_cart WHERE userid='$adminID'
 *                       (cart.php L10-17 — drives the "X/100" badge)
 *   - $rsDefault      → SELECT rsdefault FROM tb_settings WHERE id=1
 *                       (cart.php L352-355 — the THB/CNY rate)
 *   - DISTINCT(cProvider) → grouping key 1 — the 1688/Taobao/Tmall/Shops
 *                       provider header (cart.php L436)
 *   - DISTINCT(cNameShop) → grouping key 2 within each provider — the
 *                       per-shop sub-header (cart.php L451)
 *   - tb_cart rows    → SELECT * FROM tb_cart WHERE userid=? AND
 *                       cprovider=? AND cnameshop=? (cart.php L466)
 *   - tb_co coID list → for the ประเภทสมาชิก dropdown (cart.php L510)
 *
 * Auth — runbook §3 says keep the Pacred auth chain. The legacy
 * gate (header.php) is "any admin can view cart". The CS purchasing
 * + sales staff use this daily, plus ops for ad-hoc fixes. The V3
 * RBAC closest match = `super` (CEO/ITDT cover-all) + `ops`
 * (purchasing manager) + `sales_admin` (CS+sales).
 *
 * URL filter (legacy: AJAX-rendered via include/pages/cart/listCart.php
 * driven by the `#userID3` input box) — exposed as a search param on
 * this Next.js route so the customer-search flow works statically:
 *   ?userID=PR123  → show that customer's cart instead of the admin's own
 *   (none)         → show the current admin's own cart
 * This faithfully reproduces the legacy intent (CS staff types a
 * customer ID and the cart re-renders for that customer); the legacy's
 * AJAX form becomes a regular GET form, no JS required.
 *
 * Current-admin's legacy adminID — the legacy `$_COOKIE["pcs_admin_adminID"]`
 * is the staff member's `tb_admin.adminid` string code (e.g. "admin_jeen").
 * Pacred V3 RBAC stores admins by Supabase auth UUID (`public.admins.profile_id`),
 * not by the legacy `adminid` — we bridge by looking up the current user's
 * email in `tb_admin.adminemail` to resolve the legacy adminid. If the
 * lookup fails (Pacred-native admin without a legacy mirror row), the
 * cart renders empty — matching the legacy "ไม่มีพบสินค้าในรถเข็น" view.
 *
 * Rebrand: legacy `PCS Cargo` window title → `PR Cargo`; the legacy
 * "PCS เหมาๆ" / "PCS Express" / "รับเองโกดัง PCS กทม" carrier-name
 * options inside the บริษัทขนส่ง dropdown stay literal (those are
 * borrowed-API service-name labels — the PCS-scrub stays
 * API-switchover-gated per CLAUDE.md / ADR-0017, NOT a
 * faithful-port concern; "branding text + member codes only").
 *
 * Not transcribed (deliberate · documented for the pilot):
 *   - The `addCart` POST handler (cart.php L3-62) — staff add-item flow
 *     with image upload to `images/shops/`. Becomes a Server Action on
 *     the sibling `/admin/service-orders/cart/add` pilot (the sister
 *     route that the brief defers).
 *   - The `addCartURL` POST handler (cart.php L63-111) — add-by-URL flow.
 *     Same deferral.
 *   - The `addCartUser` POST handler (cart.php L112-138) — add-to-customer
 *     flow. Same deferral.
 *   - The "ยืนยันการสั่งซื้อ" form submit (cart.php L433 / L561) — POSTs to
 *     `pcs-admin/shops/?addOrder=…` to convert the cart into a real
 *     `tb_h_shop` order. The button is rendered faithfully but the action
 *     is a follow-up pilot (sister to the customer-side `(protected)/shops/`
 *     order-confirm flow).
 *   - The jQuery quantity-edit + `removeItem(ID)` AJAX (cart.php L706-810)
 *     — line-item mutations. Server Actions in a follow-up.
 *   - The cascading `coID → userID → hShipBy → selectPCS` AJAX dropdowns
 *     (cart.php L656-699) — kept as static `<select>`s so the chrome looks
 *     identical at rest; functional cascade is a follow-up (small Pacred
 *     React client component on this page).
 *   - The Google Translate widget (cart.php L390 — `#google_translate_element`)
 *     — slot left empty; legacy loads the Google Translate JS in the
 *     all-script include. Vendor JS staging is a sitewide follow-up.
 *   - The SweetAlert toasts after mutations (cart.php L816-867) — deferred
 *     with the Server Actions.
 *   - The dropify/slick/magnific-popup/touchspin plugin chrome
 *     (cart.php L142-147) — pulled by the add-item form; not needed by the
 *     read-only list view.
 */

export const dynamic = "force-dynamic";

// ============================================================================
// Inline transcription of pcs-admin/include/function.php helper functions —
// these are pure functions that turn integer codes into display strings.
// Kept inline (not extracted to lib/) because this is a pilot; the
// lift-to-`lib/` happens after a few admin pilots show the repeated callers.
// ============================================================================

/** Legacy `nameProvider($cProvider)` — function.php L105-114. */
function nameProvider(c: string | null | undefined): string {
  switch (c) {
    case "1": return "1688";
    case "2": return "Taobao";
    case "3": return "Tmall";
    case "4": return "Shops";
    case "5": return "Nice";
    default:  return c ?? "";
  }
}

/** Legacy PHP `number_format($n, 2)` — produces "1,234.56" thousand-grouped.
 *  Used at cart.php L484/L493 for the per-item + line totals. */
function numberFormat2(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  if (Number.isNaN(v)) return "0.00";
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Legacy PHP `number_format($n)` (no fractional digits) — used at L389
 *  for the "X/100 รายการ" cart-count badge. */
function numberFormat0(n: number): string {
  return n.toLocaleString("en-US");
}

/** Legacy `optionHShipByCart($conn)` — function.php L411-464.
 *  Renders the carrier-select dropdown. Returns the *array* form so the
 *  caller can decide whether to expose PCSF (depends on tb_settings.freeshipping=1).
 *
 *  KEPT VERBATIM — these are the borrowed-API carrier names recorded in the
 *  legacy data; the PCS-scrub stays API-switchover-gated (CLAUDE.md /
 *  ADR-0017) and is not a faithful-port concern. */
type CarrierOpt = { value: string; label: string };
function optionHShipByCart(freeShippingEnabled: boolean): CarrierOpt[] {
  const opts: CarrierOpt[] = [];
  if (freeShippingEnabled) opts.push({ value: "PCSF", label: "PCS เหมาๆ (50บ.)" });
  opts.push({ value: "PCS",  label: "รับเองโกดัง PCS กทม" });
  opts.push({ value: "2",    label: "Flash Express" });
  opts.push({ value: "3",    label: "J.K. เอ็กซ์เพรส" });
  opts.push({ value: "21",   label: "นิ่มซี่เส็งขนส่ง 1988" });
  opts.push({ value: "5",    label: "Nim Express" });
  opts.push({ value: "6",    label: "S & J ขนส่งด่วนสุพรรณบุรี" });
  opts.push({ value: "7",    label: "SB สมใจขนส่ง" });
  opts.push({ value: "9",    label: "เคพีเอ็น (2017)" });
  opts.push({ value: "10",   label: "เฟิร์ส เอ็กเพรส ขนส่ง" });
  opts.push({ value: "11",   label: "ไปรษณีย์ไทย" });
  opts.push({ value: "12",   label: "จันทร์สว่างขนส่ง" });
  opts.push({ value: "13",   label: "ธนามัย ขนส่งด่วน" });
  opts.push({ value: "14",   label: "บุญอนันต์ขนส่ง" });
  opts.push({ value: "15",   label: "พี.เจ. ด่วนอีสาน ขนส่ง" });
  opts.push({ value: "16",   label: "มะม่วงขนส่ง" });
  opts.push({ value: "17",   label: "วันชนะ แอนด์ วันณิสา ขนส่ง" });
  opts.push({ value: "18",   label: "สมพงษ์อุบลรัตน์ ขนส่ง" });
  opts.push({ value: "19",   label: "อาร์.ซี.อาร์ เพลส (r.c.r. place)" });
  opts.push({ value: "20",   label: "ตองสอง ขนส่ง" });
  opts.push({ value: "22",   label: "ธนาไพศาล ขนส่ง" });
  opts.push({ value: "23",   label: "PL ขนส่งด่วน" });
  opts.push({ value: "24",   label: "J&T Express" });
  opts.push({ value: "25",   label: "มังกรทองขนส่ง 2019" });
  opts.push({ value: "26",   label: "PM ชลบุรี ขนส่งด่วน" });
  opts.push({ value: "27",   label: "ทรัพย์ปรีชา" });
  opts.push({ value: "28",   label: "พัฒนาเอ็กซ์เพลส" });
  opts.push({ value: "29",   label: "หาดใหญ่ทัวร์" });
  opts.push({ value: "30",   label: "หาดใหญ่ โอ.พี. 2012" });
  opts.push({ value: "31",   label: "อาร์.ซี.เอ็กซเพรส" });
  opts.push({ value: "32",   label: "สี่สหาย" });
  opts.push({ value: "33",   label: "แพปลา​สมบัติ​วัฒนา" });
  opts.push({ value: "34",   label: "ทวีทรัพย์ระยอง" });
  opts.push({ value: "35",   label: "ศิริสมบูรณ์" });
  opts.push({ value: "36",   label: "นิวสอง อัศวินขนส่ง" });
  opts.push({ value: "37",   label: "โชคสถาพรขนส่ง" });
  opts.push({ value: "38",   label: "ทรัพย์สมบูรณ์ถาวร" });
  opts.push({ value: "39",   label: "MNB Transport" });
  opts.push({ value: "40",   label: "หจก.โชคพูลทรัพย์ขนส่ง 2014" });
  opts.push({ value: "41",   label: "สิรินครขนส่ง" });
  opts.push({ value: "42",   label: "พาณิชย์การขนส่ง KSD" });
  opts.push({ value: "43",   label: "นวรรณขนส่ง" });
  opts.push({ value: "44",   label: "กุญชรมณี ขนส่ง" });
  opts.push({ value: "45",   label: "เอ็มพอร์ท โลจิสติกส์" });
  opts.push({ value: "46",   label: "ซี.เอ็น.ทรานสปอร์ต" });
  return opts;
}

// ============================================================================
// Row shape — the relevant subset of tb_cart (migration 0081 L877-890).
// Lowercased per the legacy schema dump (Postgres folded the camelCase
// MySQL names to lowercase on load).
// ============================================================================

type CartRow = {
  id: number;
  cdetails: string;
  curl: string;
  ctitle: string;
  cnameshop: string;
  cprovider: string;   // '1'=1688 '2'=Taobao '3'=Tmall '4'=Shops '5'=Nice
  cimages: string;
  cprice: number;
  camount: number;
  ccolor: string;
  csize: string;
  userid: string;      // the customer's PR<n> code (or admin's adminid when admin-owned)
};

type CoRow = { coid: string };

type SP = { userID?: string };

export default async function AdminCartPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  // Legacy gate (header.php — any logged-in admin can view cart).
  // CS purchasing + sales use this daily; ops cover-all + super sweep
  // for ad-hoc fixes. Closest V3 RBAC union = super + ops + sales_admin.
  const { user } = await requireAdmin(["super", "ops", "sales_admin"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // ── Resolve the "current admin's legacy adminid" ─────────────────
  // Legacy `$_COOKIE["pcs_admin_adminID"]` = `tb_admin.adminid` string
  // code (e.g. "admin_jeen"). Pacred stores admins by Supabase auth
  // UUID — bridge by email → tb_admin.adminemail. If no mirror row
  // (Pacred-native admin), the lookup is "" and the default-cart
  // query returns no rows = the legacy empty-cart view.
  let myLegacyAdminId = "";
  if (user.email) {
    const { data: adminRow } = await admin
      .from("tb_admin")
      .select("adminid")
      .eq("adminemail", user.email)
      .maybeSingle<{ adminid: string }>();
    myLegacyAdminId = adminRow?.adminid ?? "";
  }

  // The legacy default-view filter is `userID = $adminID`; the
  // search-box AJAX swaps it to `userID = $_POST['userID']`.
  // Pacred exposes the latter via ?userID=… (faithful intent, no JS).
  const viewingCustomer = sp.userID && sp.userID.trim() !== "";
  const targetUserId = viewingCustomer ? sp.userID!.trim() : myLegacyAdminId;

  // ── tb_settings.rsdefault — the THB/CNY exchange rate ───────────
  //   SELECT rsdefault FROM tb_settings WHERE id=1 (cart.php L352-355)
  // Also reads freeshipping=1 to gate the "PCS เหมาๆ" carrier option
  // (function.php L413-417).
  const settingsRes = await admin
    .from("tb_settings")
    .select("rsdefault, freeshipping")
    .eq("id", 1)
    .maybeSingle<{ rsdefault: number; freeshipping: string }>();
  const rsDefault = settingsRes.data?.rsdefault ?? 0;
  const freeShippingEnabled = settingsRes.data?.freeshipping === "1";

  // ── tb_cart rows for the target user ────────────────────────────
  //   SELECT * FROM tb_cart WHERE userid=$targetUserId (cart.php L466)
  // The legacy renders nested loops:
  //   DISTINCT(cprovider) → DISTINCT(cnameshop) → row.
  // We do ONE query for all the rows and group in JS — identical
  // output, fewer round-trips.
  let cartRes: { data: CartRow[] | null } = { data: [] };
  if (targetUserId) {
    const res = await admin
      .from("tb_cart")
      .select("id, cdetails, curl, ctitle, cnameshop, cprovider, cimages, cprice, camount, ccolor, csize, userid")
      .eq("userid", targetUserId)
      .order("cprovider", { ascending: true })
      .order("cnameshop", { ascending: true })
      .order("id", { ascending: true });
    cartRes = { data: (res.data ?? []) as unknown as CartRow[] };
  }
  const cartRows: CartRow[] = cartRes.data ?? [];
  const countCart = cartRows.length;

  // Group: cprovider → cnameshop → rows[]
  type ShopGroup = { cnameshop: string; rows: CartRow[] };
  type ProviderGroup = { cprovider: string; shops: ShopGroup[] };
  const providers: ProviderGroup[] = [];
  for (const r of cartRows) {
    let pg = providers.find((p) => p.cprovider === r.cprovider);
    if (!pg) {
      pg = { cprovider: r.cprovider, shops: [] };
      providers.push(pg);
    }
    let sg = pg.shops.find((s) => s.cnameshop === r.cnameshop);
    if (!sg) {
      sg = { cnameshop: r.cnameshop, rows: [] };
      pg.shops.push(sg);
    }
    sg.rows.push(r);
  }

  // ── tb_co list — the ประเภทสมาชิก (organization-code) dropdown ─
  //   SELECT coID FROM tb_co ORDER BY coID ASC  (cart.php L510)
  const coRes = await admin
    .from("tb_co")
    .select("coid")
    .order("coid", { ascending: true });
  const coRows: CoRow[] = (coRes.data ?? []) as unknown as CoRow[];

  // Carrier dropdown (function.php optionHShipByCart) — gated by
  // tb_settings.freeshipping (only show PCSF when freeshipping=1).
  const carrierOpts = optionHShipByCart(freeShippingEnabled);

  // Row-numbering counter that walks the flattened grouping —
  // mirrors the legacy `$noRow++` (cart.php L441 / L473).
  let noRow = 1;

  // Cart-image URL resolver — cart.php L476-477 has the same branching:
  //   cprovider<4   && cimages!='' → cimages (already a fully-qualified URL,
  //                                            scraped from 1688/Taobao/Tmall)
  //   cprovider==4  && cimages=='' → '/images/shops/default.png'
  //   cprovider==4  && cimages!='' → '/images/shops/<cimages>'
  // Migrated images live under /legacy/pcs/admin/images/shops/ (the
  // customer-images Phase A backfill is pending the Supabase Pro upgrade;
  // the default.png ships as the visual fallback until then).
  function resolveImageUrl(row: CartRow): string {
    const isLocal = row.cprovider === "4";
    if (!isLocal && row.cimages) return row.cimages;
    if (isLocal && !row.cimages) return "/legacy/pcs/admin/images/shops/default.png";
    if (isLocal && row.cimages)  return `/legacy/pcs/admin/images/shops/${row.cimages}`;
    return "/legacy/pcs/admin/images/shops/default.png";
  }

  return (
    <div className="pcs-legacy">
      {/* Legacy admin chrome + page-specific CSS — both served as
          static /public/ assets so they bypass Tailwind / PostCSS. */}
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />
      <link rel="stylesheet" href="/legacy/pcs/admin/cart.css" />

      {/* BEGIN: Content — cart.php L358 */}
      <div id="focus-search"></div>
      <div className="app-content content">
        {/* Search-bar header (cart.php L361-377) — the URL paste box
            for adding 1688/Taobao items. Submits as GET to the
            existing /admin/search route. */}
        <div id="fixed-top-body" className="row pt-1 bg-white">
          <div className="col-md-6 offset-md-3 align-self-center text-center">
            <div className="mb-1">
              <h3>ค้นหาสินค้าจากเว็บไซต์ชั้นนำจากจีน </h3>
              <div>
                <Link
                  href={{ pathname: "/admin/search", query: { product: "custom" } }}
                  className="font-14 btn btn-info btn-sm btn-rounded"
                >
                  เพิ่มในตระกร้าแอดมินแบบกำหนดเอง กรณีเว็บอื่นๆ
                </Link>
                {" "}
                <Link
                  href={{ pathname: "/admin/search", query: { product: "custom2" } }}
                  className="font-14 btn btn-success btn-sm btn-rounded"
                >
                  เพิ่มในตระกร้าลูกค้า กรณีลิงก์ไม่ขึ้น
                </Link>
              </div>
            </div>
          </div>
          <div className="col-md-6 offset-md-3 filtered-list-search pl-2 pr-2 pb-2">
            <form
              className="form-inline my-lg-0 justify-content-center"
              method="GET"
              action="/admin/search"
            >
              <div className="w-100">
                <input
                  type="text"
                  name="url"
                  className="w-100 form-control product-search br-30"
                  id="input-search"
                  placeholder="วางลิงก์สินค้าจากเว็บไซต์จีน..."
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

        <div className="content-overlay"></div>
        <div className="content-wrapper">
          <div className="content-body">
            {/* Basic Carousel start — cart.php L382 */}
            <section id="basic-carousel">
              <div className="row">
                <div className="col-md-12 col-sm-12">
                  <div className="card">
                    {/* ── Card header (cart.php L386-405) ── */}
                    <div className="p-1 row">
                      <div className="content-header-left col-md-6 col-12">
                        <div className="text-center text-md-left">
                          <h3 className="text-center text-md-left">
                            <span className="font-18 mdi mdi-cart-outline"></span>
                            รถเข็นสินค้าของฉัน {numberFormat0(countCart)}/100 รายการ
                          </h3>
                          <span className="pt-1" id="google_translate_element"></span>
                        </div>
                      </div>
                      <div className="content-header-right col-md-6 col-12">
                        <div className="float-md-right">
                          <div className="text-center text-md-right">
                            <Link href="/admin/service-orders/cart/add">
                              <button
                                className="btn btn-sm btn-circle btn-success text-white"
                                type="button"
                              >
                                <i className="ft-plus"></i>
                              </button>
                              <span className="font-normal text-dark"> สั่งสินค้าเพิ่ม</span>
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="card-content">
                      <div className="card-body m-0 pt-0">
                        {/* ── Customer-search row (cart.php L408-419) ──
                            The legacy AJAX swaps `.data-shopping-cart` on
                            submit; Pacred uses a GET form to ?userID=…
                            for a faithful SSR equivalent (no JS required).
                            Result is identical: typing a customer ID +
                            submitting reloads the cart for that customer. */}
                        <form method="GET" action="/admin/service-orders/cart">
                          <div className="row">
                            <div className="col-md-4">
                              <div className="mb-1">
                                <span className="" id="userID3-label">
                                  รหัสสมาชิก (ใช้เฉพาะเมื่อต้องการดูตระกร้าสินค้าลูกค้า){" "}
                                </span>{" "}
                                <input
                                  className=""
                                  id="userID3"
                                  name="userID"
                                  type="text"
                                  placeholder="รหัสสมาชิก"
                                  defaultValue={viewingCustomer ? sp.userID : ""}
                                />
                                <button
                                  className="btn btn-main"
                                  id="listCart"
                                  style={{ padding: "0.4rem 0.4rem" }}
                                  type="submit"
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="20"
                                    height="20"
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
                            </div>
                            <div className="col-md-8">
                              <div className="row">
                                <div id="scriptFullname2" style={{ display: "contents" }}></div>
                              </div>
                            </div>
                          </div>
                        </form>

                        {/* ── Shopping-cart product grid (cart.php L421-579) ── */}
                        <div className="row">
                          <div className="col-md-12">
                            <div className="shopping-cart">
                              {/* Column labels (cart.php L424-432) */}
                              <div className="column-labels box-shadow">
                                <label className="product-count">ลำดับ</label>
                                <label className="product-image">รูปสินค้า</label>
                                <label className="product-details">รายละเอียดสินค้า</label>
                                <label className="product-price">ราคาต่อชิ้น</label>
                                <label className="product-quantity">จำนวน</label>
                                <label className="product-removal">แอคชั่น</label>
                                <label className="product-line-price">ราคารวม</label>
                              </div>

                              {/* Cart form (cart.php L433-567) — wraps the
                                  product rows + the shipping form. Submits
                                  to /admin/shops to convert the cart into
                                  an order; the addOrder Server Action is a
                                  follow-up. */}
                              {providers.length > 0 ? (
                                <form
                                  className="form-horizontal"
                                  method="POST"
                                  action="/admin/shops"
                                  autoComplete="off"
                                >
                                  <div className="data-shopping-cart">
                                    {providers.map((pg) => (
                                      <div key={`p-${pg.cprovider}`}>
                                        {/* Provider header (cart.php L447-449) */}
                                        <div className="text-center bg-2e8 box-shadow2">
                                          <h5 className="p-1">
                                            <b>{nameProvider(pg.cprovider)}</b>
                                          </h5>
                                        </div>
                                        {pg.shops.map((sg) => (
                                          <div key={`p-${pg.cprovider}-s-${sg.cnameshop}`}>
                                            {/* Shop name header (cart.php L462-464) */}
                                            <div className="text-center bg-light box-shadow2">
                                              <h5 className="p-2">
                                                <b>ชื่อร้าน : {sg.cnameshop}</b>
                                              </h5>
                                            </div>
                                            {sg.rows.map((row) => {
                                              const imgUrl = resolveImageUrl(row);
                                              const linePrice = numberFormat2(row.cprice * row.camount);
                                              const idx = noRow++;
                                              const titleText = row.ctitle && row.ctitle.trim() !== ""
                                                ? row.ctitle : row.curl;
                                              return (
                                                <div className="product" key={`r-${row.id}`}>
                                                  <input type="hidden" name="ID[]" defaultValue={row.id} />
                                                  {/* 1 — ลำดับ */}
                                                  <div className="product-count text-center">{idx}</div>
                                                  {/* 2 — รูปสินค้า */}
                                                  <div className="product-image">
                                                    <a
                                                      className="image-popup-vertical-fit el-link"
                                                      href={imgUrl}
                                                    >
                                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                                      <img
                                                        className="img-fluid"
                                                        src={imgUrl}
                                                        alt={titleText}
                                                      />
                                                    </a>
                                                  </div>
                                                  {/* 3 — รายละเอียดสินค้า */}
                                                  <div className="product-details">
                                                    <div className="product-title">
                                                      <a
                                                        href={row.curl}
                                                        className="text-info"
                                                        target="_blank"
                                                        rel="noreferrer"
                                                      >
                                                        {titleText}
                                                      </a>
                                                    </div>
                                                    <p className="mb-0">
                                                      <b>
                                                        <span>{row.ccolor}</span> : <span>{row.csize}</span>
                                                      </b>
                                                    </p>
                                                    <p className="product-description">
                                                      <b>หมายเหตุ :</b> {row.cdetails}
                                                    </p>
                                                  </div>
                                                  {/* 4 — ราคาต่อชิ้น (Yuan, prefixed by ::before content) */}
                                                  <div className="product-price">
                                                    {numberFormat2(row.cprice)}
                                                  </div>
                                                  {/* 5 — จำนวน + 6 — แอคชั่น (remove)
                                                      Both wired to Server Actions via
                                                      client islands. Same legacy column
                                                      wrappers + child classes so the
                                                      `public/legacy/pcs/admin/cart.css`
                                                      float-grid layout is preserved. The
                                                      qty <input> keeps name="cAmount[]"
                                                      so the surrounding addOrder form
                                                      still submits its values legacy-style. */}
                                                  <div className="product-quantity">
                                                    <CartRowActions
                                                      cartId={row.id}
                                                      initialQty={row.camount}
                                                    />
                                                  </div>
                                                  <div className="product-removal">
                                                    <CartRowRemove cartId={row.id} />
                                                  </div>
                                                  {/* 7 — ราคารวม */}
                                                  <div className="product-line-price">{linePrice}</div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        ))}
                                      </div>
                                    ))}

                                    {/* ── Shipping + totals strip (cart.php L502-565) ── */}
                                    <div className="border-cart p-1">
                                      <div className="row align-content-end">
                                        {/* Left column — shipping form */}
                                        <div className="col-md-6">
                                          <h4 className="text-center">ข้อมูลการจัดส่ง</h4>
                                          <div className="mb-1">
                                            <label className="form-control-label" htmlFor="coID">
                                              ประเภทสมาชิก{" "}
                                              <span
                                                className="badge badge-pill badge-secondary"
                                                data-toggle="tooltip"
                                                data-placement="top"
                                                title="สามารถพิมข้อความเพื่อค้นหาคำที่ต้องการได้"
                                              >
                                                ?
                                              </span>
                                            </label>
                                            <select
                                              id="coID"
                                              className="form-control form-control-lg"
                                              name="coID"
                                              required
                                              defaultValue=""
                                            >
                                              <option value="" disabled>
                                                กรุณาเลือกประเภทสมาชิก...
                                              </option>
                                              {coRows.map((co) => (
                                                <option key={co.coid} value={co.coid}>
                                                  {co.coid}
                                                </option>
                                              ))}
                                            </select>
                                          </div>
                                          <div className="mb-1">
                                            <label className="form-control-label" htmlFor="userID">
                                              รหัสสมาชิก{" "}
                                              <span
                                                className="badge badge-pill badge-secondary"
                                                data-toggle="tooltip"
                                                data-placement="top"
                                                title="สามารถพิมข้อความเพื่อค้นหาคำที่ต้องการได้"
                                              >
                                                ?
                                              </span>
                                            </label>
                                            <div id="userID"></div>
                                          </div>
                                          <div className="mb-1">
                                            <label className="form-control-label" htmlFor="hShipBy">
                                              บริษัทขนส่ง
                                            </label>
                                            <select
                                              className="form-control"
                                              name="hShipBy"
                                              id="hShipBy"
                                              required
                                              defaultValue=""
                                            >
                                              <option value="" disabled>
                                                กรุณาเลือกบริษัทขนส่ง
                                              </option>
                                              {carrierOpts.map((opt) => (
                                                <option key={opt.value} value={opt.value}>
                                                  {opt.label}
                                                </option>
                                              ))}
                                            </select>
                                          </div>
                                          <div id="selectPCS"></div>
                                          <div id="selectPCS2"></div>
                                          <hr />
                                          <label className="form-control-label" htmlFor="hTransportType">
                                            เลือกรูปแบบการขนส่งระหว่างประเทศจีน-ไทย
                                          </label>
                                          <div className="form-group">
                                            <select
                                              id="transportType"
                                              className="form-control"
                                              name="hTransportType"
                                              required
                                              defaultValue="1"
                                            >
                                              <option value="1">
                                                ขนส่งทางรถ (ใช้เวลาประมาณ 5-7 วัน)
                                              </option>
                                              <option value="2">
                                                ขนส่งทางเรือ (ใช้เวลาประมาณ 12-16 วัน)
                                              </option>
                                            </select>
                                          </div>
                                        </div>

                                        {/* Right column — totals summary (cart.php L543-563) */}
                                        <div className="col-md-6">
                                          <h4 className="text-center">สรุปรายการสั่งซื้อ</h4>
                                          <hr />
                                          <div className="totals">
                                            <div className="totals-item">
                                              <label>ราคารวมหยวนจีน</label>
                                              <div className="totals-value" id="cart-subtotal">
                                                {numberFormat2(
                                                  cartRows.reduce(
                                                    (acc, r) => acc + r.cprice * r.camount,
                                                    0,
                                                  ),
                                                )}
                                              </div>
                                            </div>
                                            <div className="totals-item">
                                              <label>อัตราแลกเปลี่ยน</label>
                                              <div className="totals-value4" id="rsDefault">
                                                {rsDefault}
                                              </div>
                                            </div>
                                            <div className="totals-item totals-item-total">
                                              <label>ราคารวมบาทไทย</label>
                                              <b>
                                                <div
                                                  className="totals-value2 font-18 text-danger"
                                                  id="cart-total"
                                                >
                                                  {numberFormat2(
                                                    cartRows.reduce(
                                                      (acc, r) => acc + r.cprice * r.camount,
                                                      0,
                                                    ) * Number(rsDefault),
                                                  )}
                                                </div>
                                              </b>
                                            </div>
                                          </div>
                                          <div className="text-right">
                                            <CartSubmitButton cartOwnerUserid={targetUserId} />
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </form>
                              ) : (
                                /* Empty-cart fallback (cart.php L568-575) */
                                <div className="text-center bg-light box-shadow2">
                                  <h5 className="p-1">
                                    <b>ไม่มีพบสินค้าในรถเข็น</b>
                                  </h5>
                                  <h5 className="pb-1">
                                    <Link
                                      className="text-info"
                                      href="/admin/service-orders/cart/add"
                                    >
                                      เพิ่มสินค้า
                                    </Link>
                                  </h5>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
            {/* Basic Carousel end */}
          </div>
        </div>
      </div>
      {/* END: Content */}
    </div>
  );
}
