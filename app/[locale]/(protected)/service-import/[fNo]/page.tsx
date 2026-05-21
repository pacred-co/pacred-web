import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { getForwarderByNo } from "@/actions/forwarder";
import { createClient } from "@/lib/supabase/server";
import { PayFromWalletButton } from "./pay-from-wallet-button";
import { DeliveryAckPanel } from "@/components/delivery-ack-panel";
import { CostReconfirmPanel, type ReconfirmRow } from "@/components/cost-reconfirm-panel";

const STATUS_BADGE: Record<string, string> = {
  pending_payment:   "bg-yellow-50 text-yellow-700 border-yellow-200",
  shipped_china:     "bg-blue-50 text-blue-700 border-blue-200",
  in_transit:        "bg-indigo-50 text-indigo-700 border-indigo-200",
  arrived_thailand:  "bg-purple-50 text-purple-700 border-purple-200",
  out_for_delivery:  "bg-orange-50 text-orange-700 border-orange-200",
  delivered:         "bg-green-50 text-green-700 border-green-200",
  cancelled:         "bg-gray-50 text-gray-600 border-gray-200",
};

const TRANSPORT_ICON: Record<string, string> = {
  truck: "🚚", ship: "🚢", air: "✈️",
};

// Module-scope helper so React Compiler doesn't flag Date.now as impure-in-render.
function isFutureIso(iso: string): boolean {
  return new Date(iso).getTime() > Date.now();
}

export default async function ForwarderDetailPage({ params }: { params: Promise<{ fNo: string }> }) {
  const { fNo } = await params;
  const t = await getTranslations("forwarder");
  const res = await getForwarderByNo(fNo);
  if (!res.ok || !res.data) notFound();
  const f = res.data;

  const cover = f.images.find((i) => i.is_cover) ?? f.images[0];

  // Fetch main wallet balance only when relevant (status='pending_payment')
  // — closes the import loop by letting customer self-pay from balance.
  let walletBalance: number | null = null;
  if (f.status === "pending_payment") {
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

  // 0092: pending_reconfirm cost adjustments (>10% over preview gate).
  // RLS (fwd_cost_adj_self_read) scopes to the customer's own profile_id.
  // Empty array on miss → panel renders nothing.
  const sbAdj = await createClient();
  const { data: reconfirmRowsRaw } = await sbAdj
    .from("forwarder_cost_adjustments")
    .select("id, kind, amount_thb, note, preview_total_thb, cumulative_after_thb, reconfirm_required_at")
    .eq("forwarder_id", f.id)
    .eq("status", "pending_reconfirm")
    .order("reconfirm_required_at", { ascending: false })
    .returns<ReconfirmRow[]>();
  const reconfirmRows: ReconfirmRow[] = reconfirmRowsRaw ?? [];

  // 2026-05-21 Wave 3D — cargo spine retired (cargo_shipments / cargo_containers
  // dropped by migration 0090). Customer-visible container info now comes
  // from `forwarders.cabinet_number` directly (legacy `tb_forwarder.fCabinetNumber`
  // pattern). No live query needed; the cabinet code is already on `f`.
  // Phase-C: when a true multi-shipment-per-container view is needed, build a
  // GROUP BY view over `tb_forwarder` similar to /admin/report-cnt.
  const cargoShipments: Array<{
    id: string;
    shipment_code: string;
    status: string;
    box_count: number;
    received_box_count: number;
    container: { code: string | null; transport_mode: string | null; status: string; eta: string | null; close_at: string | null; carrier_container_no: string | null } | null;
  }> = [];

  return (
    <>
      <main className="mx-auto w-full max-w-[1100px] px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-500">{t("kicker")} · {t("detailTitle")}</p>
            <div className="mt-1 flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold font-mono text-foreground">{f.f_no}</h1>
              <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_BADGE[f.status]}`}>
                {t(`status.${f.status}` as Parameters<typeof t>[0])}
              </span>
              <span className="text-sm">{TRANSPORT_ICON[f.transport_type] ?? "📦"} {t(`transport.${f.transport_type}` as Parameters<typeof t>[0])}</span>
            </div>
            <p className="text-xs text-muted mt-1">{t("createdAt", { date: new Date(f.created_at).toLocaleString("th-TH") })}</p>
          </div>
          <div className="flex gap-2">
            <Link href={`/service-import/${f.f_no}/receipt`} target="_blank" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
              🖨 ดูใบแจ้งหนี้
            </Link>
            <Link href="/service-import" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
              ← {t("backToList")}
            </Link>
          </div>
        </div>

        {/* gap-customer G-C5: forwarding instruction recap.
            Shows during pre-arrival statuses — most LINE-chat-asked
            question is "ส่งของไปไหน + เขียน mark อะไร". Surface the
            answer right at the top of the order detail so customer
            doesn't have to navigate to /service-import/warehouse-addresses. */}
        {["pending_payment", "shipped_china", "in_transit"].includes(f.status) && (
          <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/70 p-5 space-y-3">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <p className="text-xs font-semibold tracking-widest text-amber-900">📦 วิธีส่งของจากจีนมาที่โกดัง</p>
                <h2 className="text-base font-bold text-amber-900 mt-0.5">ขั้นตอน + ที่อยู่</h2>
              </div>
              <Link href="/service-import/warehouse-addresses" className="text-xs rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-amber-900 hover:bg-amber-100">
                ดูที่อยู่โกดังเต็ม →
              </Link>
            </div>

            {/* Mark code — the one thing customer MUST write on every box */}
            <div className="rounded-xl bg-white border border-amber-200 p-3 space-y-1">
              <p className="text-[10px] uppercase font-semibold text-amber-700">เขียน mark นี้บนทุกกล่อง</p>
              <p className="font-mono text-lg font-bold text-amber-950 select-all">{f.f_no}</p>
              <p className="text-[11px] text-amber-800">
                เขียนตัวใหญ่ ชัดเจน บนกล่องทุกใบ — โกดังใช้ mark นี้จับคู่กับ order ของคุณ. <span className="font-medium">ห้ามตกหล่น</span> ไม่งั้นโกดังจะส่งของให้ไม่ได้.
              </p>
            </div>

            {/* Quick 4-step recap */}
            <ol className="text-xs space-y-1.5 text-amber-900 list-decimal list-inside">
              <li>นำสินค้าไปส่งที่โกดัง <span className="font-semibold">{f.source_warehouse === "yiwu" ? "อี้อู" : "กวางโจว"}</span> (ดูที่อยู่เต็มที่ปุ่มขวาบน)</li>
              <li>แจ้งโกดัง: ส่งให้บริษัท Pacred · ใส่ mark <span className="font-mono font-bold">{f.f_no}</span> ทุกกล่อง</li>
              <li>ถ่ายรูปใบรับของจากโกดัง ส่งเข้า LINE OA Pacred (ตัวช่วยติดตาม)</li>
              <li>รอ Pacred update status ใน order นี้ — เห็นใน “ติดตาม” หน้านี้</li>
            </ol>
          </div>
        )}

        {/* 0092 · >10%-over-preview RE-CONFIRM gate. Shown above the
            payment banner so the customer sees the surprise-bill warning
            BEFORE any "pay" CTA — surprise-billing is the exact thing
            this gate exists to prevent (BUSINESS_FLOW.md L85-87). */}
        {reconfirmRows.length > 0 && (
          <CostReconfirmPanel rows={reconfirmRows} />
        )}

        {/* U4-3a: delivery acknowledgement — green confirm card when delivered + not yet acked */}
        {f.status === "delivered" && !f.acknowledged_at && f.f_no && (
          <DeliveryAckPanel kind="forwarder" refNo={f.f_no} />
        )}

        {/* U4-3a: already-acked confirmation chip */}
        {f.acknowledged_at && (
          <div className="rounded-2xl border border-green-200 bg-green-50/60 p-4">
            <p className="text-sm font-semibold text-green-900">
              ✅ คุณยืนยันรับสินค้าครบถ้วนแล้ว
              <span className="ml-2 text-xs font-normal text-green-700">
                ({new Date(f.acknowledged_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })})
              </span>
            </p>
            {f.acknowledged_note && (
              <p className="mt-1 text-xs text-green-800">
                <span className="text-green-700">โน้ต:</span> {f.acknowledged_note}
              </p>
            )}
          </div>
        )}

        {/* Payment banner for pending */}
        {f.status === "pending_payment" && (
          <div className="rounded-2xl border border-yellow-300 bg-yellow-50 p-5 space-y-3">
            <div>
              <p className="text-sm font-semibold text-yellow-900">{t("payByBanner")}</p>
              <p className="text-2xl font-bold font-mono text-yellow-800 mt-1">
                ฿{Number(f.total_price).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </p>
            </div>

            {/* Primary pay action — wallet balance permitting */}
            {walletBalance !== null && f.f_no && (
              <PayFromWalletButton fNo={f.f_no} totalThb={Number(f.total_price)} walletBalance={walletBalance} />
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

        <div className="grid lg:grid-cols-[1fr_360px] gap-6">
          {/* LEFT: cover + items + photos */}
          <section className="space-y-4">
            {cover && (
              <div className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cover.image_path} alt="cover" className="w-full max-h-[400px] object-contain bg-surface-alt" />
              </div>
            )}

            <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
              <h2 className="font-bold mb-3">{t("dimensions")}</h2>
              <div className="grid grid-cols-4 gap-3 text-center">
                <Stat label="📦"        value={`${f.box_count}`} />
                <Stat label={t("weightShort")}    value={`${Number(f.weight_kg).toFixed(2)} kg`} />
                <Stat label={t("volumeShort")}    value={`${Number(f.volume_cbm).toFixed(3)} cbm`} />
                <Stat label={t("dimensionsShort")} value={`${Number(f.width_cm)}×${Number(f.length_cm)}×${Number(f.height_cm)} cm`} />
              </div>
            </div>

            {f.items.length > 0 && (
              <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <h2 className="font-bold">{t("itemsBreakdown")} ({f.items.length})</h2>
                </div>
                <ul className="divide-y divide-border">
                  {f.items.map((it) => (
                    <li key={it.id} className="px-5 py-3 text-sm flex items-center justify-between">
                      <div>
                        <p className="font-medium">{it.product_name}</p>
                        {it.product_tracking && (
                          <p className="text-[10px] font-mono text-muted">📦 {it.product_tracking}</p>
                        )}
                      </div>
                      <div className="text-right text-xs text-muted">
                        × {it.product_qty}
                        {it.weight_per_item_kg && (
                          <div>{Number(it.weight_per_item_kg).toFixed(2)} kg/box</div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {f.images.length > 1 && (
              <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
                <h2 className="font-bold mb-3">{t("additionalPhotos")}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {f.images.filter((i) => !i.is_cover).map((img) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={img.id} src={img.image_path} alt="" className="w-full aspect-square object-cover rounded-lg bg-surface-alt" />
                  ))}
                </div>
              </div>
            )}

            {f.detail && (
              <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
                <h3 className="font-bold text-sm mb-2">{t("detail")}</h3>
                <p className="text-sm whitespace-pre-wrap">{f.detail}</p>
              </div>
            )}
          </section>

          {/* RIGHT: summary + shipping + tracking */}
          <aside className="space-y-4">
            <div className="rounded-2xl border border-primary-200 bg-primary-50/40 p-5 shadow-sm">
              <h3 className="font-bold text-sm mb-3">{t("priceBreakdown")}</h3>
              <div className="space-y-1.5 text-sm">
                <Row label={t("transportSubtotal")} value={`฿${Number(f.transport_price).toFixed(2)}`} />
                <Row label={t("serviceFee")}        value={`฿${Number(f.service_fee).toFixed(2)}`} />
                {f.crate && <Row label={t("crateFee")} value={`฿${Number(f.crate_price).toFixed(2)}`} />}
                {f.qc && <Row label={t("qcFee")} value={`฿${Number(f.qc_price).toFixed(2)}`} />}
                {f.domestic_china_thb > 0    && <Row label={t("domesticChina")}    value={`฿${Number(f.domestic_china_thb).toFixed(2)}`} />}
                {f.thailand_delivery_thb > 0 && <Row label={t("thailandDelivery")} value={`฿${Number(f.thailand_delivery_thb).toFixed(2)}`} />}
                {f.other_price > 0           && <Row label={t("otherFee")}         value={`฿${Number(f.other_price).toFixed(2)}`} />}
                <hr className="border-primary-200" />
                <Row label={t("totalPrice")} value={`฿${Number(f.total_price).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`} bold />
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
              <h3 className="font-bold text-sm">{t("shipmentInfo")}</h3>
              <Meta label={t("sourceWarehouse")} value={f.source_warehouse === "yiwu" ? "อี้อู" : "กวางโจว"} />
              <Meta label={t("productTypeLabel")} value={t(`productType.${f.product_type}` as Parameters<typeof t>[0])} />
              <Meta label={t("rateBasis")}      value={f.rate_basis === "auto" ? t("rateBasisAuto") : (f.rate_basis === "kg" ? "kg" : "cbm")} />
              <Meta label={t("payMethod")}      value={f.pay_method === "origin" ? t("payMethodOrigin") : t("payMethodDestination")} />
            </div>

            <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-2">
              <h3 className="font-bold text-sm">{t("trackingTitle")}</h3>
              {f.tracking_chn && <Meta label="CN" value={f.tracking_chn} />}
              {f.tracking_chn2 && <Meta label="CN-2" value={f.tracking_chn2} />}
              {f.tracking_th && <Meta label="TH" value={f.tracking_th} />}
              {f.cabinet_number && <Meta label={t("cabinet")} value={f.cabinet_number} />}
              {!f.tracking_chn && !f.tracking_th && !f.cabinet_number && (
                <p className="text-xs text-muted">{t("noTrackingYet")}</p>
              )}
            </div>

            {/* Cargo spine: customer sees the container their shipment(s) are loaded in */}
            {cargoShipments.length > 0 && (
              <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
                <h3 className="font-bold text-sm">📦 ตู้คอนเทนเนอร์ที่บรรจุ</h3>
                <ul className="space-y-2">
                  {cargoShipments.map((s) => (
                    <li key={s.id} className="rounded-lg border border-border p-3 space-y-1">
                      <div className="flex items-start justify-between flex-wrap gap-2">
                        <div className="min-w-0">
                          <p className="font-mono text-xs">{s.shipment_code}</p>
                          {s.container?.code && (
                            <p className="text-xs">
                              ตู้: <span className="font-mono font-medium">{s.container.code}</span>
                              {s.container.transport_mode && (
                                <span className="ml-1">{TRANSPORT_ICON[s.container.transport_mode] ?? ""}</span>
                              )}
                            </p>
                          )}
                          {s.container?.carrier_container_no && (
                            <p className="text-[10px] text-muted">B/L: <span className="font-mono">{s.container.carrier_container_no}</span></p>
                          )}
                        </div>
                        <Link
                          href={`/shipments/${s.shipment_code}`}
                          className="rounded-lg border border-primary-200 bg-primary-50 px-2 py-1 text-[10px] text-primary-700 hover:bg-primary-100 shrink-0"
                        >
                          ดูไทม์ไลน์ →
                        </Link>
                      </div>
                      <p className="text-[10px] text-muted">
                        ได้รับแล้ว <span className={s.received_box_count >= s.box_count ? "text-green-700 font-medium" : ""}>{s.received_box_count}/{s.box_count}</span> กล่อง
                        {s.container?.eta && <> · ETA {new Date(s.container.eta).toLocaleDateString("th-TH")}</>}
                        {s.container?.close_at && isFutureIso(s.container.close_at) && (
                          <> · ตัดตู้ {new Date(s.container.close_at).toLocaleDateString("th-TH")}</>
                        )}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-2">
              <h3 className="font-bold text-sm">{t("sectionAddress")}</h3>
              <div className="text-sm space-y-1">
                <p className="font-medium">{f.ship_first_name} {f.ship_last_name}</p>
                <p className="text-xs text-muted">📞 {f.ship_phone}{f.ship_phone2 ? ` / ${f.ship_phone2}` : ""}</p>
                <p className="text-xs">
                  {f.ship_address_line} ต.{f.ship_sub_district} อ.{f.ship_district} จ.{f.ship_province} {f.ship_postal_code}
                </p>
                {f.ship_note && <p className="text-xs text-muted">📝 {f.ship_note}</p>}
              </div>
            </div>

            {f.note_user && (
              <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
                <h3 className="font-bold text-sm mb-2">{t("noteUser")}</h3>
                <p className="text-sm whitespace-pre-wrap">{f.note_user}</p>
              </div>
            )}
          </aside>
        </div>
      </main>
      <Footer />
    </>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${bold ? "font-bold text-base" : ""}`}>
      <span className={bold ? "" : "text-muted"}>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-medium font-mono text-xs">{value}</span>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="font-bold text-sm">{value}</p>
    </div>
  );
}
