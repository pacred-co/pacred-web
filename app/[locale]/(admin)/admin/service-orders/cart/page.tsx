import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import CartRowActions, { CartRowRemove } from "./cart-row-actions";
import CartSubmitButton from "./cart-submit-button";

/**
 * Admin > "รถเข็นสินค้า" — CS staff add-to-customer-cart surface.
 *
 * Wave 23 P1 #11.b (2026-05-27 ค่ำ · Agent E): full Tailwind rewrite —
 * dropped `.pcs-legacy` scope + Bootstrap-4 chrome per AGENTS.md §0a.
 * Logic / data flow unchanged from the faithful-port version:
 *   - Reads `tb_cart` for the target user (admin's own cart by default,
 *     or ?userID=PR123 to view a customer's cart)
 *   - Reads `tb_settings.rsdefault` (THB/CNY rate) + `freeshipping`
 *   - Reads `tb_co.coid` for the ประเภทสมาชิก dropdown
 *   - Submit POSTs to /admin/shops (addOrder action — separate pilot)
 *   - Per-row qty/remove wired via existing CartRowActions/CartRowRemove
 *     client islands (unchanged)
 *   - Cart owner resolved via tb_admin.adminemail = current user email
 *
 * RBAC: super + ops + sales_admin (CS purchasing + sales daily users).
 */

export const dynamic = "force-dynamic";

// ============================================================================
// Helpers — same pure formatters as before, now Tailwind-friendly.
// ============================================================================

function nameProvider(c: string | null | undefined): string {
  switch (c) {
    case "1": return "1688";
    case "2": return "Taobao";
    case "3": return "Tmall";
    case "4": return "Shops";
    case "5": return "Nice";
    default:  return c ?? "—";
  }
}

function numberFormat2(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  if (Number.isNaN(v)) return "0.00";
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function numberFormat0(n: number): string {
  return n.toLocaleString("en-US");
}

type CarrierOpt = { value: string; label: string };
function optionHShipByCart(freeShippingEnabled: boolean): CarrierOpt[] {
  // KEPT VERBATIM — borrowed-API carrier names (PCS-scrub stays API-gated).
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

type CartRow = {
  id: number;
  cdetails: string;
  curl: string;
  ctitle: string;
  cnameshop: string;
  cprovider: string;
  cimages: string;
  cprice: number;
  camount: number;
  ccolor: string;
  csize: string;
  userid: string;
};

type CoRow = { coID: string };
type SP = { userID?: string };

export default async function AdminCartPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const { user } = await requireAdmin(["super", "ops", "sales_admin"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // Resolve current admin's legacy adminid (cart owner default).
  let myLegacyAdminId = "";
  if (user.email) {
    const { data: adminRow, error: adminRowErr } = await admin
      .from("tb_admin")
      .select("adminID")
      .eq("adminEmail", user.email)
      .maybeSingle<{ adminID: string }>();
    if (adminRowErr) {
      console.error(`[tb_admin lookup] failed`, { code: adminRowErr.code, message: adminRowErr.message });
    }
    myLegacyAdminId = adminRow?.adminID ?? "";
  }

  const viewingCustomer = sp.userID && sp.userID.trim() !== "";
  const targetUserId = viewingCustomer ? sp.userID!.trim() : myLegacyAdminId;

  // tb_settings — exchange rate + free-shipping flag.
  const { data: settingsData, error: settingsErr } = await admin
    .from("tb_settings")
    .select("rsdefault, freeshipping")
    .eq("id", 1)
    .maybeSingle<{ rsdefault: number; freeshipping: string }>();
  if (settingsErr) {
    console.error(`[tb_settings lookup] failed`, { code: settingsErr.code, message: settingsErr.message });
  }
  const rsDefault = settingsData?.rsdefault ?? 0;
  const freeShippingEnabled = settingsData?.freeshipping === "1";

  // tb_cart rows for target user.
  let cartRows: CartRow[] = [];
  if (targetUserId) {
    const { data, error } = await admin
      .from("tb_cart")
      .select("id, cdetails, curl, ctitle, cnameshop, cprovider, cimages, cprice, camount, ccolor, csize, userid")
      .eq("userid", targetUserId)
      .order("cprovider", { ascending: true })
      .order("cnameshop", { ascending: true })
      .order("id", { ascending: true });
    if (error) {
      console.error(`[tb_cart list] failed`, { code: error.code, message: error.message });
    }
    cartRows = (data ?? []) as unknown as CartRow[];
  }
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

  // tb_co dropdown options.
  const { data: coData, error: coErr } = await admin
    .from("tb_co")
    .select("coID")
    .order("coID", { ascending: true });
  if (coErr) {
    console.error(`[tb_co list] failed`, { code: coErr.code, message: coErr.message });
  }
  const coRows: CoRow[] = (coData ?? []) as unknown as CoRow[];

  const carrierOpts = optionHShipByCart(freeShippingEnabled);

  // Totals.
  const subtotalYuan = cartRows.reduce((acc, r) => acc + r.cprice * r.camount, 0);
  const totalThb = subtotalYuan * Number(rsDefault);

  // Cart-image URL resolver — unchanged.
  function resolveImageUrl(row: CartRow): string {
    const isLocal = row.cprovider === "4";
    if (!isLocal && row.cimages) return row.cimages;
    if (isLocal && !row.cimages) return "/legacy/pcs/admin/images/shops/default.png";
    if (isLocal && row.cimages)  return `/legacy/pcs/admin/images/shops/${row.cimages}`;
    return "/legacy/pcs/admin/images/shops/default.png";
  }

  let noRow = 1;

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN</p>
          <h1 className="mt-1 text-2xl font-bold">
            รถเข็นสินค้า
            {viewingCustomer && (
              <span className="ml-2 text-sm text-muted font-normal">
                — ของลูกค้า{" "}
                <span className="font-mono text-primary-600">{sp.userID}</span>
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {numberFormat0(countCart)}/100 รายการ
            {targetUserId && (
              <>
                {" "}· เจ้าของ <code className="rounded bg-surface-alt px-1 text-xs">{targetUserId}</code>
              </>
            )}
          </p>
        </div>
        <nav aria-label="breadcrumb" className="text-xs text-muted flex gap-1.5 items-center">
          <Link href="/admin" className="hover:text-primary-600">หน้าแรก</Link>
          <span>/</span>
          <Link href="/admin/service-orders" className="hover:text-primary-600">ฝากสั่งสินค้า</Link>
          <span>/</span>
          <span className="text-foreground">รถเข็น</span>
        </nav>
      </div>

      {/* Top actions strip — single CTA into /cart/add (which hosts the
          link-paste search with TAMIT variant picker + the manual entry form
          fallback for "กรณีลิงก์ไม่ขึ้น"). Wave 24 #188 cleanup: removed the
          3 dead surfaces that used to live here (URL search form → /admin/search,
          + 2 chip Links → /admin/search?product=custom|custom2) — `/admin/search`
          is the keyword china-search hub, NOT a cart-add surface, so every click
          dumped the admin out of the cart context with stale-URL artefacts
          (Next router intercepts left the URL bar showing /cart while body
          rendered /admin/search). The /cart/add panel covers all 3 jobs:
          paste-link search, "เพิ่มเอง (กรณีลิงก์ไม่ขึ้น)" manual form, and
          customer-cart owner selection. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
        <p className="text-xs text-muted">
          วาง URL จาก 1688 / Taobao / Tmall ระบบจะดึง <strong>รูป · ชื่อสินค้า · ตัวเลือกสี/ขนาด · ราคา ¥</strong> มาให้อัตโนมัติ — หรือกรอกเองได้กรณีลิงก์ไม่ขึ้น
        </p>
        <Link
          href="/admin/service-orders/cart/add"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 text-white px-4 py-2 text-sm font-semibold hover:bg-primary-700 whitespace-nowrap"
        >
          + เพิ่มสินค้าในรถเข็น
        </Link>
      </div>

      {/* Customer-search row */}
      <form
        method="GET"
        action="/admin/service-orders/cart"
        className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm flex flex-wrap items-end gap-3"
      >
        <div className="flex-1 min-w-[240px]">
          <label htmlFor="userID3" className="block text-xs font-medium text-muted mb-1.5">
            รหัสสมาชิก{" "}
            <span className="opacity-60">(ใช้เฉพาะเมื่อต้องการดูตระกร้าสินค้าลูกค้า)</span>
          </label>
          <input
            id="userID3"
            name="userID"
            type="text"
            placeholder="PR123"
            defaultValue={viewingCustomer ? sp.userID : ""}
            className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm font-mono"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-primary-600 text-white px-4 py-2 text-sm font-medium hover:bg-primary-700"
        >
          ดูรถเข็นของลูกค้า
        </button>
        {viewingCustomer && (
          <Link
            href="/admin/service-orders/cart"
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-alt"
          >
            กลับสู่รถเข็นของฉัน
          </Link>
        )}
      </form>

      {/* Main cart panel */}
      {providers.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-12 text-center shadow-sm">
          <p className="text-sm text-muted mb-2">ไม่มีพบสินค้าในรถเข็น</p>
          <Link
            href="/admin/service-orders/cart/add"
            className="inline-flex items-center gap-1 rounded-lg bg-primary-600 text-white px-4 py-2 text-sm font-medium hover:bg-primary-700"
          >
            + เพิ่มสินค้า
          </Link>
        </div>
      ) : (
        <form
          method="POST"
          action="/admin/shops"
          autoComplete="off"
          className="space-y-5"
        >
          {/* Cart items grouped by provider → shop */}
          <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
            {/* Column header */}
            <div className="hidden md:grid grid-cols-12 gap-3 border-b border-border bg-surface-alt/50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">
              <div className="col-span-1">#</div>
              <div className="col-span-2">รูปสินค้า</div>
              <div className="col-span-4">รายละเอียดสินค้า</div>
              <div className="col-span-1 text-right">ราคา ¥</div>
              <div className="col-span-2 text-center">จำนวน</div>
              <div className="col-span-1 text-center">ลบ</div>
              <div className="col-span-1 text-right">รวม ¥</div>
            </div>

            {providers.map((pg) => (
              <div key={`p-${pg.cprovider}`}>
                {/* Provider header */}
                <div className="border-b border-border bg-blue-50 px-4 py-2">
                  <h3 className="text-sm font-bold text-blue-900">{nameProvider(pg.cprovider)}</h3>
                </div>
                {pg.shops.map((sg) => (
                  <div key={`p-${pg.cprovider}-s-${sg.cnameshop}`}>
                    {/* Shop subheader */}
                    <div className="border-b border-border bg-surface-alt/30 px-4 py-2">
                      <p className="text-xs font-medium text-muted">
                        ชื่อร้าน: <span className="text-foreground">{sg.cnameshop || "—"}</span>
                      </p>
                    </div>
                    {sg.rows.map((row) => {
                      const imgUrl = resolveImageUrl(row);
                      const linePrice = numberFormat2(row.cprice * row.camount);
                      const idx = noRow++;
                      const titleText = row.ctitle && row.ctitle.trim() !== ""
                        ? row.ctitle : row.curl;
                      return (
                        <div
                          key={`r-${row.id}`}
                          className="grid grid-cols-2 md:grid-cols-12 gap-3 items-center border-b border-border px-4 py-3 hover:bg-surface-alt/20"
                        >
                          <input type="hidden" name="ID[]" defaultValue={row.id} />
                          {/* # */}
                          <div className="md:col-span-1 text-xs text-muted font-mono">
                            <span className="md:hidden font-medium text-foreground">ลำดับ: </span>
                            {idx}
                          </div>
                          {/* Image */}
                          <div className="md:col-span-2">
                            <a href={imgUrl} target="_blank" rel="noreferrer" className="block">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={imgUrl}
                                alt={titleText}
                                className="w-full max-w-[120px] rounded-lg border border-border object-cover"
                              />
                            </a>
                          </div>
                          {/* Details */}
                          <div className="md:col-span-4 col-span-2 text-xs space-y-1">
                            <a
                              href={row.curl}
                              target="_blank"
                              rel="noreferrer"
                              className="block font-medium text-primary-600 hover:underline line-clamp-2"
                            >
                              {titleText}
                            </a>
                            {(row.ccolor || row.csize) && (
                              <p className="text-muted">
                                {row.ccolor && <span>สี: {row.ccolor}</span>}
                                {row.ccolor && row.csize && <span> · </span>}
                                {row.csize && <span>ขนาด: {row.csize}</span>}
                              </p>
                            )}
                            {row.cdetails && (
                              <p className="text-muted text-[11px]">
                                <span className="font-medium">หมายเหตุ:</span> {row.cdetails}
                              </p>
                            )}
                          </div>
                          {/* Price */}
                          <div className="md:col-span-1 text-xs md:text-right font-mono">
                            <span className="md:hidden text-muted">ราคา: </span>
                            ¥{numberFormat2(row.cprice)}
                          </div>
                          {/* Qty */}
                          <div className="md:col-span-2 md:text-center">
                            <CartRowActions cartId={row.id} initialQty={row.camount} />
                          </div>
                          {/* Remove */}
                          <div className="md:col-span-1 md:text-center">
                            <CartRowRemove cartId={row.id} />
                          </div>
                          {/* Line total */}
                          <div className="md:col-span-1 text-xs md:text-right font-mono font-semibold">
                            <span className="md:hidden text-muted">รวม: </span>
                            ¥{linePrice}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Shipping + totals strip */}
          <div className="grid md:grid-cols-2 gap-5">
            {/* Left: shipping form */}
            <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
              <h3 className="text-lg font-semibold mb-4">ข้อมูลการจัดส่ง</h3>
              <div className="space-y-3">
                <div>
                  <label htmlFor="coID" className="block text-xs font-medium text-muted mb-1.5">
                    ประเภทสมาชิก <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="coID"
                    name="coID"
                    required
                    defaultValue=""
                    className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm"
                  >
                    <option value="" disabled>
                      กรุณาเลือกประเภทสมาชิก...
                    </option>
                    {coRows.map((co) => (
                      <option key={co.coID} value={co.coID}>
                        {co.coID}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="userID" className="block text-xs font-medium text-muted mb-1.5">
                    รหัสสมาชิก (ผู้รับสินค้า) <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="userID"
                    name="userID"
                    type="text"
                    required
                    defaultValue={targetUserId}
                    placeholder="PR123"
                    className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="hShipBy" className="block text-xs font-medium text-muted mb-1.5">
                    บริษัทขนส่ง <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="hShipBy"
                    name="hShipBy"
                    required
                    defaultValue=""
                    className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm"
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
                <div>
                  <label htmlFor="hTransportType" className="block text-xs font-medium text-muted mb-1.5">
                    รูปแบบการขนส่งระหว่างประเทศ จีน–ไทย
                  </label>
                  <select
                    id="hTransportType"
                    name="hTransportType"
                    required
                    defaultValue="1"
                    className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm"
                  >
                    <option value="1">ขนส่งทางรถ (ใช้เวลาประมาณ 5-7 วัน)</option>
                    <option value="2">ขนส่งทางเรือ (ใช้เวลาประมาณ 12-16 วัน)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Right: totals summary */}
            <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm flex flex-col">
              <h3 className="text-lg font-semibold mb-4">สรุปรายการสั่งซื้อ</h3>
              <div className="space-y-3 flex-1">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted">ราคารวมหยวนจีน</span>
                  <span className="font-mono font-medium">¥{numberFormat2(subtotalYuan)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted">อัตราแลกเปลี่ยน</span>
                  <span className="font-mono">{rsDefault}</span>
                </div>
                <div className="border-t border-border pt-3 flex justify-between items-center">
                  <span className="font-semibold">ราคารวมบาทไทย</span>
                  <span className="font-mono font-bold text-xl text-primary-600">
                    ฿{numberFormat2(totalThb)}
                  </span>
                </div>
              </div>
              <div className="mt-5 flex justify-end">
                <CartSubmitButton cartOwnerUserid={targetUserId} />
              </div>
            </div>
          </div>
        </form>
      )}
    </main>
  );
}
