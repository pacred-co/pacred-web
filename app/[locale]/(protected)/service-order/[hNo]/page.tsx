import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { getServiceOrder } from "@/actions/service-order";
import { createClient } from "@/lib/supabase/server";
import { CancelButton } from "./cancel-button";
import { PayFromWalletButton } from "./pay-from-wallet-button";
import { DeliveryAckPanel } from "@/components/delivery-ack-panel";

const STATUS_BADGE: Record<string, string> = {
  pending:               "bg-gray-50 text-gray-700 border-gray-200",
  awaiting_payment:      "bg-yellow-50 text-yellow-700 border-yellow-200",
  ordered:               "bg-blue-50 text-blue-700 border-blue-200",
  awaiting_chn_dispatch: "bg-indigo-50 text-indigo-700 border-indigo-200",
  completed:             "bg-green-50 text-green-700 border-green-200",
  cancelled:             "bg-red-50 text-red-700 border-red-200",
};

const PROVIDER_LABEL: Record<string, string> = {
  "1688": "1688", taobao: "Taobao", tmall: "Tmall", shop: "Shop", nice: "Nice",
};

export default async function ServiceOrderDetailPage({ params }: { params: Promise<{ hNo: string }> }) {
  const { hNo } = await params;
  const t = await getTranslations("serviceOrder");
  const res = await getServiceOrder(hNo);
  if (!res.ok || !res.data) notFound();
  const o = res.data;

  const canCancel = o.status === "pending" || o.status === "awaiting_payment";
  const canPrintReceipt = o.status !== "pending" && o.status !== "cancelled";   // mirrors PHP printShop.php (status 2..5 only)
  const itemsTotalCny = o.items.reduce((s, it) => s + Number(it.price_cny) * Number(it.amount), 0);

  // Fetch main wallet balance only when relevant (status='awaiting_payment')
  // — closes the cargo loop by letting customer self-pay from balance.
  let walletBalance: number | null = null;
  if (o.status === "awaiting_payment") {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: wallet } = await supabase
        .from("wallet")
        .select("balance")
        .eq("profile_id", user.id)
        .maybeSingle<{ balance: number }>();
      walletBalance = Number(wallet?.balance ?? 0);
    }
  }

  return (
    <>
      <main className="mx-auto w-full max-w-[1100px] px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-500">{t("kicker")} · {t("detailTitle")}</p>
            <div className="mt-1 flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold font-mono text-foreground">{o.h_no}</h1>
              <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_BADGE[o.status]}`}>
                {t(`status.${o.status}` as Parameters<typeof t>[0])}
              </span>
            </div>
            <p className="text-xs text-muted mt-1">{t("createdAt", { date: new Date(o.created_at).toLocaleString("th-TH") })}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Link href="/service-order" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
              ← {t("backToList")}
            </Link>
            {canPrintReceipt && o.h_no && (
              <a
                href={`/api/pdf/shop-order/${o.h_no}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
              >
                {o.status === "completed" ? "📄 ดาวน์โหลดใบเสร็จ PDF" : "📄 ดาวน์โหลดใบแจ้งหนี้ PDF"}
              </a>
            )}
            {canCancel && <CancelButton hNo={o.h_no!} />}
          </div>
        </div>

        {/* U4-3a: delivery acknowledgement — green confirm card when completed + not yet acked */}
        {o.status === "completed" && !o.acknowledged_at && o.h_no && (
          <DeliveryAckPanel kind="service_order" refNo={o.h_no} />
        )}

        {/* U4-3a: already-acked confirmation chip */}
        {o.acknowledged_at && (
          <div className="rounded-2xl border border-green-200 bg-green-50/60 p-4">
            <p className="text-sm font-semibold text-green-900">
              ✅ คุณยืนยันรับสินค้าครบถ้วนแล้ว
              <span className="ml-2 text-xs font-normal text-green-700">
                ({new Date(o.acknowledged_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })})
              </span>
            </p>
            {o.acknowledged_note && (
              <p className="mt-1 text-xs text-green-800">
                <span className="text-green-700">โน้ต:</span> {o.acknowledged_note}
              </p>
            )}
          </div>
        )}

        {/* Payment-due banner */}
        {o.status === "awaiting_payment" && o.payment_due_at && (
          <div className="rounded-2xl border border-yellow-300 bg-yellow-50 p-5 space-y-3">
            <div>
              <p className="text-sm font-semibold text-yellow-900">{t("payByBanner")}</p>
              <p className="text-2xl font-bold font-mono text-yellow-800 mt-1">
                ฿{Number(o.total_thb).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-yellow-700 mt-1">{t("payBy", { date: new Date(o.payment_due_at).toLocaleString("th-TH") })}</p>
            </div>

            {/* Primary pay action — wallet balance permitting */}
            {walletBalance !== null && o.h_no && (
              <PayFromWalletButton hNo={o.h_no} totalThb={Number(o.total_thb)} walletBalance={walletBalance} />
            )}

            {/* Fallback / wallet management links */}
            <div className="flex flex-wrap gap-2">
              <Link href="/wallet/deposit" className="rounded-lg bg-white border border-yellow-300 px-4 py-2 text-sm font-medium text-yellow-900 hover:bg-yellow-100">
                {t("payNowDeposit")}
              </Link>
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
                <Row label={t("totalThb")} value={`฿${Number(o.total_thb).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`} bold />
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
              <h3 className="font-bold text-sm">{t("shipmentInfo")}</h3>
              <Meta label={t("warehouseChina")} value={o.warehouse_china === "yiwu" ? "อี้อู" : "กวางโจว"} />
              <Meta label={t("transportType")}  value={t(`transport.${o.transport_type}` as Parameters<typeof t>[0])} />
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
      <Footer />
    </>
  );
}

function Row({ label, value, bold, small }: { label: string; value: string; bold?: boolean; small?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${bold ? "font-bold text-base" : ""} ${small ? "text-xs text-muted" : ""}`}>
      <span className={bold ? "" : "text-muted"}>{label}</span>
      <span className="font-mono">{value}</span>
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
