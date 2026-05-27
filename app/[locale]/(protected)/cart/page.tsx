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
import {
  ShoppingCart,
  Plus,
  Truck,
  Ship,
  Package,
  PackageOpen,
} from "lucide-react";

/**
 * Customer shopping-cart screen for the ฝากสั่งซื้อ (China shop-order)
 * flow — Tailwind-rebuilt version (ปอน 2026-05-26).
 *
 * Replaces the legacy 1:1 Bootstrap-4 transcription of `member/cart.php`
 * with a clean Tailwind/Pacred-branded layout. All data queries against
 * the ported `tb_*` schema, all Thai labels, all form `name=` attributes,
 * all Server Action wiring, and all client-component props are preserved
 * VERBATIM — the contract with <CartInteractivity> and <CartAddressShipBy>
 * is unchanged, and the form still POSTs to `/service-order`.
 *
 * Faithful-port data lineage (cart.php → here):
 *   - $rsDefault          → tb_settings.rsdefault  WHERE ID=1      (cart.php L142-145)
 *   - $userAddressID etc. → tb_users (useraddressid, usertransporttype,
 *                            usershipby, userpaymethod)             (cart.php L146-153)
 *   - $userShipBy fallbk  → tb_forwarder.fshipby ORDER BY ID DESC   (cart.php L154-161)
 *   - $countCart          → COUNT(ID) FROM tb_cart                  (cart.php L163-170)
 *   - address block       → tb_address / tb_address_main fallback   (cart.php L441-499)
 *   - cart rows           → SELECT * FROM tb_cart + group by
 *                            provider→shop in code                  (cart.php L522-586)
 *
 * Brand: `PCS` → `PR` / Pacred; warehouse address from ADDRESSES.warehouseTh
 * (Samut Sakhon SOT). 3 legacy AJAX endpoints (option-address-thai.php /
 * api-shipBy.php / checkPCSMaoMao.php) remain pre-computed SSR-side and
 * filtered client-side — zero AJAX, same as the previous iteration.
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
 * Build the legacy `CONCAT(addressName,' ',…) AS fullAddress` string
 * from a `tb_address` row — used by both `resolveAddressBlock` and
 * the address-list resolution for the เปลี่ยนที่อยู่ modal. Verbatim
 * with cart.php's CONCAT (L445 + L62 + L86 + L116 across the legacy
 * queries — all produce the same shape).
 */
function buildFullAddressFromRow(r: AddressRow): string {
  return `${r.addressname} ${r.addresslastname} | ${r.addressno} ตำบล/แขวง ${r.addresssubdistrict} อำเภอ/เขต ${r.addressdistrict} จังหวัด ${r.addressprovince} ${r.addresszipcode} โทร. ${r.addresstel}, ${r.addresstel2 ?? ""}`;
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
    <>
      <title>ตะกร้าสินค้า | Pacred</title>

      <div className="pcs-content-pad w-full px-3 md:px-6 pt-4 pb-24 md:py-6 max-w-[1280px] mx-auto">
        {/* ── Header — title + add CTA ── */}
        <div className="flex items-start md:items-center justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] text-muted mb-1">
              <Link href="/dashboard" className="hover:text-foreground transition-colors">
                หน้าแรก
              </Link>
              <span>/</span>
              <span className="text-foreground font-medium">ตะกร้าสินค้า</span>
            </div>
            <h1 className="flex items-center gap-2 text-[20px] md:text-[26px] font-black tracking-tight text-foreground">
              <span className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center shadow-md shadow-primary-600/25">
                <ShoppingCart className="w-5 h-5" strokeWidth={2} />
              </span>
              ตะกร้าสินค้า
            </h1>
          </div>
          <Link
            href="/cart/add"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white text-[12.5px] md:text-[14px] font-bold px-3.5 md:px-4 py-2 md:py-2.5 shadow-lg shadow-primary-600/30 hover:shadow-primary-600/40 hover:-translate-y-0.5 transition-all"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            เพิ่มสินค้า
          </Link>
        </div>

        {/* cart.php L431 — the cart form (POST → /service-order on submit).
            Form `name` attributes are LOAD-BEARING — the addOrder handler
            in /service-order parses these fields. DO NOT rename. */}
        <form
          method="POST"
          action="/service-order"
          autoComplete="off"
          className="space-y-3"
        >
          {/* ── Thai delivery-address card — cart.php L434-509 ──
              (only rendered when there are cart items). Address selection
              / ship-by select / maomao popup live in <CartAddressShipBy>.
              The three legacy AJAX endpoints `option-address-thai.php` /
              `api-shipBy.php` / `checkPCSMaoMao.php` are replaced by the
              SSR-computed `addressOptions` + `shipByByAddress` +
              `maomaoByAddress` props — no AJAX. */}
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
              Empty-cart state renders SSR (no interactivity needed);
              when rows exist, the rendering + the promo + order-summary
              card are delegated to <CartInteractivity> (client). */}
          {cartRows.length > 0 ? (
            <CartInteractivity
              groupedProviders={interactiveProviders}
              totalRowCount={totalRowCount}
              initialRsDefault={rsDefault}
              promo33Active={promo33Active}
              memberCode={userID}
              shippingCard={
                <ShippingOptionsCard userTransportType={userTransportType} />
              }
            />
          ) : (
            <EmptyCartState />
          )}
        </form>

        {/* cart.php L841 — totalRowCount + cart-capacity carried as data
            so the server-side count stays inspectable for QA. */}
        <span
          hidden
          data-total-rows={totalRowCount}
          data-cart-capacity={CART_CAPACITY}
          data-count-cart={countCart}
        />
      </div>
    </>
  );
}

/* ─────────────────────────── EMPTY CART STATE ─────────────────────────── */
function EmptyCartState() {
  return (
    <div className="rounded-2xl bg-white border border-border p-8 md:p-12 text-center shadow-[0_4px_14px_rgba(0,0,0,0.04)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/legacy/pcs/shop-2-300x300.png"
        alt=""
        className="mx-auto w-40 h-40 md:w-52 md:h-52 object-contain opacity-70 mb-4"
      />
      <h3 className="text-[15px] md:text-[17px] font-bold text-foreground">
        ไม่มีพบสินค้าในรถเข็น
      </h3>
      <p className="mt-2 text-[12.5px] text-muted">
        เพิ่มสินค้าจากร้าน 1688 · Taobao · Tmall · Alibaba เพื่อเริ่มสั่งซื้อ
      </p>
      <Link
        href="/cart/add"
        className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white text-[13px] font-bold px-4 py-2 shadow-lg shadow-primary-600/30 hover:shadow-primary-600/40 hover:-translate-y-0.5 transition-all"
      >
        <Plus className="w-4 h-4" strokeWidth={2.5} />
        เพิ่มสินค้า
      </Link>
    </div>
  );
}

/* ─────────────────── SHIPPING-OPTIONS CARD (China → Thailand) ─────────────────── */
/**
 * cart.php L601-651 — the .ele-addressCHN-cart radio-card pair (transport
 * type EK/SEA + crate option). All `name=` + `value=` attributes preserved
 * verbatim so the form submit to /service-order carries the same fields.
 */
function ShippingOptionsCard({ userTransportType }: { userTransportType: number }) {
  return (
    <div className="rounded-2xl bg-white border border-border shadow-[0_4px_14px_rgba(0,0,0,0.04)] p-4 md:p-5">
      <h3 className="flex items-center gap-2 text-[15px] md:text-[16px] font-bold text-foreground mb-3">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-primary-50 text-primary-600">
          <Truck className="w-4 h-4" strokeWidth={2.2} />
        </span>
        การขนส่งจากจีนมาไทย
        <span className="inline-block w-5 h-3.5 rounded-sm overflow-hidden border border-border align-middle">
          {/* China flag — simple flag pip */}
          <span className="block w-full h-full bg-[#EE1C25]" aria-label="China" />
        </span>
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {/* ── Transport type — EK (รถ) / SEA (เรือ) ── */}
        <div>
          <label className="block text-[12.5px] font-bold text-muted mb-2">
            รูปแบบการขนส่งจีน-ไทย
          </label>
          <div className="grid grid-cols-2 gap-2">
            <RadioCard
              name="hTransportType"
              value="1"
              id="transportType-ek"
              defaultChecked={userTransportType === 1}
              icon={<Truck className="w-5 h-5" strokeWidth={2.2} />}
              title="ทางรถ (EK)"
              hint="5-7 วัน"
            />
            <RadioCard
              name="hTransportType"
              value="2"
              id="transportType-sea"
              defaultChecked={userTransportType !== 1}
              icon={<Ship className="w-5 h-5" strokeWidth={2.2} />}
              title="ทางเรือ (SEA)"
              hint="12-16 วัน"
            />
          </div>
        </div>

        {/* ── Crate option — ไม่ตีลังไม้ / ตีลังไม้ ── */}
        <div>
          <label className="block text-[12.5px] font-bold text-muted mb-2">
            การตีลังไม้สินค้า
          </label>
          <div className="grid grid-cols-2 gap-2">
            <RadioCard
              name="crate"
              value="2"
              id="crate-1"
              defaultChecked
              icon={<PackageOpen className="w-5 h-5" strokeWidth={2.2} />}
              title="ไม่ตีลังไม้"
              hint="ปกติ"
            />
            <RadioCard
              name="crate"
              value="1"
              id="crate-2"
              icon={<Package className="w-5 h-5" strokeWidth={2.2} />}
              title="ตีลังไม้"
              hint="มีค่าบริการ"
            />
          </div>
          <p className="mt-2 text-[11px] text-rose-600 leading-relaxed">
            ** หากต้องการตีลังไม้สินค้าบางร้าน ให้ทำการเลือกสั่งออเดอร์แยกรายการกัน
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Pill-style selectable radio card — pure CSS via the peer/checked-sibling
 * trick. The radio input is hidden but the label is the click target; when
 * checked, the label gets a brand-red ring + tint via `peer-checked:`.
 *
 * Each `<RadioCard>` is wrapped in its own container so the `peer-checked`
 * selector only looks at THIS pair's input (not a sibling pair's). Without
 * the wrapper, the second card's label would also tint when the first card
 * is checked, because `peer-checked:` uses the `~` sibling combinator.
 */
function RadioCard({
  name,
  value,
  id,
  defaultChecked,
  icon,
  title,
  hint,
}: {
  name: string;
  value: string;
  id: string;
  defaultChecked?: boolean;
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className="relative">
      <input
        type="radio"
        name={name}
        value={value}
        id={id}
        defaultChecked={defaultChecked}
        className="peer sr-only"
      />
      <label
        htmlFor={id}
        className="group cursor-pointer flex flex-col items-center gap-1.5 rounded-xl border border-border bg-white px-2.5 py-3 text-center transition-all hover:border-primary-300 hover:bg-rose-50/40 peer-checked:border-primary-500 peer-checked:bg-gradient-to-br peer-checked:from-rose-50 peer-checked:to-rose-100/60 peer-checked:ring-2 peer-checked:ring-primary-100 peer-checked:shadow-md peer-checked:shadow-primary-600/10 peer-checked:[&>.radio-icon]:bg-primary-600 peer-checked:[&>.radio-icon]:text-white"
      >
        <span className="radio-icon inline-flex items-center justify-center w-9 h-9 rounded-lg bg-primary-50 text-primary-600 transition-colors">
          {icon}
        </span>
        <span className="text-[12.5px] font-bold text-foreground leading-tight">{title}</span>
        <span className="text-[10.5px] text-muted leading-none">{hint}</span>
      </label>
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
