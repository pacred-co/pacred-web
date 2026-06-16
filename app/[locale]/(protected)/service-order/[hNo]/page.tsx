import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getServiceOrder } from "@/actions/service-order";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { legacyOrderStatusThai } from "@/lib/legacy-status-map";
import { loadCustomerAddressOptions } from "@/lib/legacy/customer-address-options";
import { CancelButton } from "./cancel-button";
import { ShopOrderPayButton } from "./shop-order-pay-modal";
import { ShopOrderEditShipByForm } from "./shop-order-edit-ship-by-form";
import { ShopOrderEditAddressForm } from "./shop-order-edit-address-form";

// Badge colours keyed by the legacy tb_header_order.hstatus code
// ('1'-'6' + '40' ถึงโกดังจีน · owner 2026-06-16 MOMO arrival).
const STATUS_BADGE: Record<string, string> = {
  "1": "bg-gray-50 text-gray-700 border-gray-200",     // รอดำเนินการ
  "2": "bg-yellow-50 text-yellow-700 border-yellow-200", // รอชำระเงิน
  "3": "bg-blue-50 text-blue-700 border-blue-200",     // สั่งสินค้า
  "4": "bg-indigo-50 text-indigo-700 border-indigo-200", // รอร้านจีนจัดส่ง
  "40": "bg-teal-50 text-teal-700 border-teal-200",    // ถึงโกดังจีน
  "5": "bg-green-50 text-green-700 border-green-200",   // สำเร็จ
  "6": "bg-red-50 text-red-700 border-red-200",        // ยกเลิก
};

const PROVIDER_LABEL: Record<string, string> = {
  "1688": "1688", taobao: "Taobao", tmall: "Tmall", shop: "Shop", nice: "Nice",
};

// Legacy `nameShipBy($hShipBy)` — function.php L91-143. Same carrier table the
// forwarder detail page uses; the customer-side <select> enumerates the full
// list (matching the Pacred forwarder edit-ship-by precedent — the legacy ZIP
// gating is a refinement deferred to keep both cargo edit flows consistent).
const NAME_SHIP_BY: Record<string, string> = {
  "1": "DHL Express", "2": "Flash Express", "3": "J.K. เอ็กซ์เพรส",
  "4": "Kerry Express", "5": "Nim Express", "6": "S & J ขนส่งด่วนสุพรรณบุรี",
  "7": "SB สมใจขนส่ง", "8": "SCG Express", "9": "เคพีเอ็น",
  "10": "เฟิร์ส เอ็กเพรส ขนส่ง", "11": "ไปรษณีย์ไทย", "12": "จันทร์สว่างขนส่ง",
  "13": "ธนามัย ขนส่งด่วน", "14": "บุญอนันต์ขนส่ง", "15": "พี.เจ. ด่วนอีสาน ขนส่ง",
  "16": "มะม่วงขนส่ง", "17": "วันชนะ แอนด์ วันณิสา ขนส่ง", "18": "สมพงษ์อุบลรัตน์ ขนส่ง",
  "19": "อาร์.ซี.อาร์ เพลส", "20": "ตองสอง ขนส่ง", "21": "นิ่มซี่เส็งขนส่ง 1988",
  "22": "ธนาไพศาล ขนส่ง", "23": "PL ขนส่งด่วน", "24": "J&T Express",
  "25": "มังกรทองขนส่ง 2019", "26": "PM ชลบุรี ขนส่งด่วน", "27": "ทรัพย์ปรีชา",
  "28": "พัฒนาเอ็กซ์เพลส", "29": "หาดใหญ่ทัวร์", "30": "หาดใหญ่ โอ.พี. 2012",
  "31": "อาร์.ซี.เอ็กซเพรส", "32": "สี่สหาย", "33": "แพปลา​สมบัติ​วัฒนา",
  "34": "ทวีทรัพย์ระยอง", "35": "ศิริสมบูรณ์", "36": "นิวสอง อัศวินขนส่ง",
  "37": "โชคสถาพรขนส่ง", "38": "ทรัพย์สมบูรณ์ถาวร", "39": "MNB Transport",
  "40": "หจก.โชคพูลทรัพย์ขนส่ง 2014", "41": "สิรินครขนส่ง", "42": "พาณิชย์การขนส่ง KSD",
  PCS: "รับเองโกดัง Pacred (สมุทรสาคร)", F: "บริษัทจัดหาให้อัตโนมัติ",
  PCSF: "Pacred เหมาเหมา", PCSE: "Pacred Express",
};
function nameShipBy(hShipBy: string | null): string {
  return NAME_SHIP_BY[hShipBy ?? ""] ?? "—";
}

export default async function ServiceOrderDetailPage({ params }: { params: Promise<{ hNo: string }> }) {
  const { hNo } = await params;
  const t = await getTranslations("serviceOrder");
  const res = await getServiceOrder(hNo);
  if (!res.ok || !res.data) notFound();
  const o = res.data;

  // D1 Phase-B Wave 2: o.status is the legacy tb_header_order.hstatus code.
  //   '1'=รอดำเนินการ '2'=รอชำระเงิน '3'=สั่งสินค้า '4'=รอร้านจีนจัดส่ง '5'=สำเร็จ '6'=ยกเลิก
  const canCancel = o.status === "1" || o.status === "2";
  const canPrintReceipt = o.status !== "1" && o.status !== "6";   // mirrors PHP printShop.php (status 2..5 only)
  const itemsTotalCny = o.items.reduce((s, it) => s + Number(it.price_cny) * Number(it.amount), 0);

  // shops.php L1679/L1701 — the customer may change carrier + delivery address
  // until the order is สำเร็จ ('5'). We additionally lock '6' (ยกเลิก / terminal).
  const canEditShipping = o.status !== "5" && o.status !== "6";
  const warehousePickup = o.ship_by === "PCS";

  // Resolve the member_code once (the tb_* join key) — used by BOTH the wallet
  // balance (รอชำระเงิน) and the address picker (when shipping is editable).
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) {
    console.error(`[service-order/[hNo] auth] failed`, { code: authErr.code, message: authErr.message });
  }
  let memberCode = "";
  if (user) {
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("member_code")
      .eq("id", user.id)
      .maybeSingle<{ member_code: string | null }>();
    if (profileErr) {
      console.error(`[service-order/[hNo] profiles] failed`, { code: profileErr.code, message: profileErr.message });
    }
    memberCode = profile?.member_code ?? "";
  }

  const admin = createAdminClient();

  // 2026-06-05 (ภูม flag — "โอนขาด เพราะ display 2dp ไม่ตรง raw") — compute the
  // FULL-PRECISION total alongside the rounded stored value (`o.total_thb` =
  // ceil(2dp) for safety). Show "(฿176.5344)" grey paren next to "฿176.54" so
  // the customer can see the un-rounded reference + transfer the rounded value
  // without guessing half-up (which is short by 0.01). Formula mirrors legacy
  // `(htotalpricechn + hshippingchn) × hrate + hshippingservice`. Returns null
  // if the rate isn't locked yet (rare race · hstatus='1') OR if raw === stored
  // (no info gain).
  function computeRawTotal(): number | null {
    const rate = Number(o.yuan_rate_locked ?? 0);
    if (!(rate > 0)) return null;
    const cnySubtotal = itemsTotalCny + Number(o.domestic_china_cny);
    const raw = cnySubtotal * rate + Number(o.service_fee);
    if (Math.abs(raw - Number(o.total_thb)) < 0.0001) return null;
    return raw;
  }
  const rawThb = computeRawTotal();
  const rawThbFmt = rawThb !== null
    ? rawThb.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
    : null;

  // Wallet balance — only when payable (hstatus='2' รอชำระเงิน). Closes the cargo
  // loop (customer self-pay from balance). Reads the ported legacy tb_wallet
  // (RLS-locked → admin client), keyed by the customer's member_code.
  let walletBalance: number | null = null;
  if (o.status === "2") {
    if (memberCode) {
      const { data: wallet, error: walletErr } = await admin
        .from("tb_wallet")
        .select("wallettotal")
        .eq("userid", memberCode)
        .maybeSingle<{ wallettotal: number }>();
      if (walletErr) {
        console.error(`[tb_wallet list] failed`, { code: walletErr.code, message: walletErr.message });
      }
      walletBalance = Number(wallet?.wallettotal ?? 0);
    } else {
      walletBalance = 0;
    }
  }

  // Address-picker options for the inline "แก้ไข ที่อยู่จัดส่ง" form — loaded only
  // when the customer can still change shipping AND it's not warehouse pickup.
  const addressOptions =
    canEditShipping && !warehousePickup && memberCode
      ? await loadCustomerAddressOptions(admin, memberCode)
      : [];

  return (
    <>
      <main className="mx-auto w-full max-w-[1100px] px-4 py-5 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-600">{t("kicker")} · {t("detailTitle")}</p>
            <div className="mt-1 flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold font-mono text-foreground">{o.h_no}</h1>
              <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_BADGE[o.status] ?? "bg-gray-50 text-gray-700 border-gray-200"}`}>
                {legacyOrderStatusThai(o.status)}
              </span>
            </div>
            <p className="text-xs text-muted mt-1">{t("createdAt", { date: new Date(o.created_at).toLocaleString("th-TH") })}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Link href="/service-order" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
              ← {t("backToList")}
            </Link>
            {canPrintReceipt && o.h_no && (
              // 2026-06-05 (ภูม flag) — switch from @react-pdf binary
              // (/api/pdf/shop-order/[hNo]) to legacy HTML print template
              // (/service-order/print) · same template as admin print ·
              // unified Pacred-branded receipt for customer + admin both.
              <a
                href={`/service-order/print?print=${o.status === "5" ? "1" : "2"}&id=${o.h_no}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
              >
                {o.status === "5" ? `📄 ${t("printReceipt")}` : `📄 ${t("printInvoice")}`}
              </a>
            )}
            {canCancel && <CancelButton hNo={o.h_no!} />}
          </div>
        </div>

        {/* Payment-due banner — legacy hstatus '2' = รอชำระเงิน */}
        {o.status === "2" && o.payment_due_at && (
          <div className="rounded-2xl border border-yellow-300 bg-yellow-50 p-5 space-y-3">
            <div>
              <p className="text-sm font-semibold text-yellow-900">{t("payByBanner")}</p>
              <p className="text-2xl font-bold font-mono text-yellow-800 mt-1">
                ฿{Number(o.total_thb).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                {rawThbFmt && (
                  <span className="ml-2 text-sm font-normal text-yellow-700/70">
                    (฿{rawThbFmt})
                  </span>
                )}
              </p>
              {rawThbFmt && (
                <p className="text-[11px] text-yellow-700/80 -mt-0.5">
                  {t("rawTotalHintPrefix")} <span className="font-mono">( )</span> {t("rawTotalHintSuffix")}
                </p>
              )}
              <p className="text-xs text-yellow-700 mt-1">{t("payBy", { date: new Date(o.payment_due_at).toLocaleString("th-TH") })}</p>
            </div>

            {/* ADR-0028 — pay by PromptPay QR + slip (no forced wallet top-up).
                The button's modal still offers wallet-pay as a SECONDARY option
                when the balance already covers the bill. */}
            {o.h_no && (
              <ShopOrderPayButton
                hNo={o.h_no}
                totalThb={Number(o.total_thb)}
                walletBalance={walletBalance}
              />
            )}

            {/* Wallet (cashback) — check balance/history only (no forced top-up) */}
            <div className="flex flex-wrap gap-2">
              <Link href="/wallet/history" className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium hover:bg-surface-alt">
                {t("checkWallet")}
              </Link>
            </div>
          </div>
        )}

        {/* 2-column main */}
        <div className="grid lg:grid-cols-[1fr_360px] gap-6">
          {/* LEFT: items */}
          <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="font-bold">{t("itemsTitle")} ({o.items.length})</h2>
            </div>
            {o.items.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted">{t("noItems")}</p>
            ) : (
              <ul className="divide-y divide-border">
                {o.items.map((it) => (
                  <li key={it.id} className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      {it.image_path ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.image_path} alt={it.title ?? ""} className="w-16 h-16 rounded-lg object-cover bg-surface-alt" />
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-surface-alt flex items-center justify-center text-[10px] text-muted">No img</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-sm line-clamp-2">{it.title ?? "—"}</p>
                          <span className="text-[10px] rounded-full bg-primary-50 text-primary-700 px-2 py-0.5 border border-primary-200 shrink-0">
                            {PROVIDER_LABEL[it.provider] ?? it.provider}
                          </span>
                        </div>
                        {it.shop_name && <p className="text-xs text-muted">🏪 {it.shop_name}</p>}
                        <p className="text-xs text-muted">
                          {it.color && <>🎨 {it.color}</>}
                          {it.size && <> · 📏 {it.size}</>}
                        </p>
                        {it.url && (
                          <a href={it.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-500 hover:underline truncate block">
                            🔗 {t("viewSource")}
                          </a>
                        )}
                        {it.tracking_number && (
                          <p className="text-[10px] mt-1 font-mono text-muted">📦 {it.tracking_number}</p>
                        )}
                        <div className="mt-1 flex items-baseline justify-between">
                          <span className="text-xs text-muted">¥{Number(it.price_cny).toFixed(2)} × {it.amount}</span>
                          <span className="font-mono font-medium text-sm">¥{(Number(it.price_cny) * Number(it.amount)).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                    {it.details && (
                      <p className="mt-2 text-xs text-muted pl-[76px]">📝 {it.details}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* RIGHT: summary + meta */}
          <aside className="space-y-4">
            <div className="rounded-2xl border border-primary-200 bg-primary-50/40 p-5 shadow-sm">
              <h3 className="font-bold text-sm mb-3">{t("orderSummary")}</h3>
              <div className="space-y-1.5 text-sm">
                <Row label={t("itemsSubtotal")} value={`¥${itemsTotalCny.toFixed(2)}`} />
                {o.yuan_rate_locked && (
                  <Row label={t("rate")} value={`฿${Number(o.yuan_rate_locked).toFixed(4)}/¥`} small />
                )}
                {o.domestic_china_cny > 0 && (
                  <Row label={t("chinaTransport")} value={`฿${Number(o.domestic_china_cny).toFixed(2)}`} />
                )}
                <Row label={t("serviceFee")} value={`฿${Number(o.service_fee).toFixed(2)}`} />
                <hr className="border-primary-200" />
                <Row
                  label={t("totalThb")}
                  value={`฿${Number(o.total_thb).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`}
                  subValue={rawThbFmt ? `(฿${rawThbFmt})` : undefined}
                  bold
                />
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
              <h3 className="font-bold text-sm">{t("shipmentInfo")}</h3>
              <Meta label={t("warehouseChina")} value={o.warehouse_china === "yiwu" ? t("warehouseYiwu") : t("warehouseGuangzhou")} />
              <Meta label={t("transportType")}  value={t(`transport.${o.transport_type}` as Parameters<typeof t>[0])} />
              {/* บริษัทขนส่ง (carrier) — inline-editable while not completed/cancelled
                  (shops.php L1673-1688 · update_hShipBy). */}
              <div className="text-sm">
                <span className="text-muted">{t("carrierCompany")}</span>
                <div className="mt-0.5 font-medium">
                  {canEditShipping && o.h_no ? (
                    <ShopOrderEditShipByForm
                      hNo={o.h_no}
                      currentShipBy={o.ship_by ?? ""}
                      currentLabel={nameShipBy(o.ship_by)}
                      options={Object.entries(NAME_SHIP_BY).map(([code, label]) => ({ code, label }))}
                      isEditable={canEditShipping}
                    />
                  ) : (
                    <>
                      {nameShipBy(o.ship_by)}
                      {o.status === "5" && (
                        <span className="block text-xs text-muted mt-0.5">
                          {t("carrierChangeHint")}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
              <Meta label={t("payMethod")}      value={o.pay_method === "origin" ? t("payMethodOrigin") : t("payMethodDestination")} />
              {o.crate && <Meta label={t("crate")} value="✓" />}
              {o.free_shipping && <Meta label={t("freeShipping")} value="✓" />}
            </div>

            <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-2">
              <h3 className="font-bold text-sm">{t("shippingAddress")}</h3>
              {o.ship_first_name ? (
                <div className="text-sm space-y-1">
                  <p className="font-medium">{o.ship_first_name} {o.ship_last_name}</p>
                  <p className="text-xs text-muted">📞 {o.ship_phone}{o.ship_phone2 ? ` / ${o.ship_phone2}` : ""}</p>
                  <p className="text-xs">
                    {o.ship_address_line} ต.{o.ship_sub_district} อ.{o.ship_district} จ.{o.ship_province} {o.ship_postal_code}
                  </p>
                  {o.ship_note && <p className="text-xs text-muted">📝 {o.ship_note}</p>}
                </div>
              ) : (
                <p className="text-xs text-muted">—</p>
              )}
              {/* แก้ไข ที่อยู่จัดส่ง (shops.php L1692-1759 · update_hAddress). The form
                  self-hides on warehouse pickup / locked status. */}
              {canEditShipping && o.h_no && (
                <ShopOrderEditAddressForm
                  hNo={o.h_no}
                  options={addressOptions}
                  isEditable={canEditShipping}
                  warehousePickup={warehousePickup}
                />
              )}
              {canEditShipping && warehousePickup && (
                <p className="text-xs text-muted">📦 {t("warehousePickupHint")}</p>
              )}
            </div>

            {o.note_user && (
              <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
                <h3 className="font-bold text-sm mb-2">{t("noteUser")}</h3>
                <p className="text-sm whitespace-pre-wrap">{o.note_user}</p>
              </div>
            )}
          </aside>
        </div>
      </main>
    </>
  );
}

function Row({ label, value, subValue, bold, small }: { label: string; value: string; subValue?: string; bold?: boolean; small?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${bold ? "font-bold text-base" : ""} ${small ? "text-xs text-muted" : ""}`}>
      <span className={bold ? "" : "text-muted"}>{label}</span>
      <span className="font-mono">
        {value}
        {subValue && <span className="ml-1.5 text-xs font-normal text-gray-500">{subValue}</span>}
      </span>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
