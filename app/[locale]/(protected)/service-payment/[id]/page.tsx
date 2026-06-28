/**
 * Customer-side yuan-payment detail page (U4-3b).
 *
 * The listing at `/service-payment` shows everything inline in a table,
 * which is fine for at-a-glance status — but ฝากโอน (juristic) customers
 * now need a "ออกใบกำกับภาษี" button per completed transfer. The button
 * lives on a per-row detail page rather than the table itself so the
 * existing list UX stays untouched.
 *
 * Linked from the table via /service-payment/[id] — `id` is the legacy
 * `tb_payment.id` (a positive integer). `getYuanPayment` is scoped to
 * the auth user's `tb_payment.userid = profile.member_code` so
 * customers can only see their OWN row; admins use the dedicated
 * /admin/yuan-payments tools.
 *
 * F2 fix (2026-05-29): when `createYuanPayment` was repointed off the
 * rebuilt `yuan_payments` table onto legacy `tb_payment` (so the list
 * and admin pages can see the row at all), this detail page had to
 * follow. The `YuanPayment` shape is the same friendly type — only the
 * underlying row is now `tb_payment` and the foreign profile lookup is
 * the auth user (we already have it via getCurrentUserWithProfile).
 */

import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getYuanPayment } from "@/actions/payment";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { getMyTaxInvoiceForOrder } from "@/actions/tax-invoices";
import { TaxInvoiceRequestPanel } from "@/components/tax-invoice-request-panel";
import { isShopYuanTaxInvoiceEnabled } from "@/lib/tax/shop-yuan-flag";
import { Explain } from "@/components/ui/tooltip";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  pending:    "bg-amber-50 text-amber-700 border-amber-200",
  completed:  "bg-green-50 text-green-700 border-green-200",
  failed:     "bg-red-50 text-red-700 border-red-200",
};
// payStatus → display-label translation key (the map key is the stable status id).
const STATUS_LABEL_KEY: Record<string, string> = {
  pending:    "detailStatusPending",
  completed:  "detailStatusCompleted",
  failed:     "detailStatusFailed",
};
// channel → display label. alipay/wechat are brand names (not translated); bank
// resolves to a translation key for the Thai label.
const CHANNEL_LABEL: Record<string, string> = {
  alipay: "Alipay",
  wechat: "WeChat",
};

export default async function YuanPaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("payment");
  const res = await getYuanPayment(id);
  if (!res.ok || !res.data) notFound();
  const yp = res.data;

  // Resolve display labels (the map keys / yp.* values stay data; only labels translate).
  const statusLabel = STATUS_LABEL_KEY[yp.status]
    ? t(STATUS_LABEL_KEY[yp.status])
    : yp.status;
  const channelLabel =
    yp.channel === "bank"
      ? t("detailChannelBank")
      : (CHANNEL_LABEL[yp.channel] ?? yp.channel);

  // U4-3b: tax-invoice eligibility — must be completed + customer has tax_id.
  // The auth user IS the customer who owns yp (getYuanPayment scopes by
  // member_code), so we read profile + corporate by the signed-in
  // user.id rather than by an explicit join key on the legacy row.
  const userData = await getCurrentUserWithProfile();
  if (!userData?.user) notFound();
  const userId = userData.user.id;

  const supabase = await createClient();
  const [taxInv, profileRow, corporateRow] = await Promise.all([
    getMyTaxInvoiceForOrder("yuan_payment", String(yp.id)),
    supabase.from("profiles").select("first_name, last_name, account_type, tax_id").eq("id", userId).maybeSingle<{
      first_name: string | null; last_name: string | null;
      account_type: "personal" | "juristic" | null;
      tax_id: string | null;
    }>(),
    supabase.from("corporate").select("company_name, company_address, tax_id").eq("profile_id", userId).maybeSingle<{
      company_name: string | null; company_address: string | null; tax_id: string | null;
    }>(),
  ]);
  if (profileRow.error) {
    console.error(`[profiles lookup] failed`, { code: profileRow.error.code, message: profileRow.error.message });
  }
  if (corporateRow.error) {
    console.error(`[corporate lookup] failed`, { code: corporateRow.error.code, message: corporateRow.error.message });
  }
  const existingInvoice = taxInv.ok ? taxInv.data : null;
  const profile = profileRow.data;
  const corp    = corporateRow.data;

  // 0152 LIVE-GATE — yuan ใบกำกับ/ใบขน is LIVE only when the flag is ON;
  // otherwise the panel keeps the "coming soon" (deferred) banner.
  const shopYuanTaxLive = await isShopYuanTaxInvoiceEnabled();

  const buyerTaxId   = (corp?.tax_id ?? profile?.tax_id ?? "").replace(/\D/g, "");
  const isEligible   = buyerTaxId.length === 13 && yp.status === "completed";
  const defaultName  =
    corp?.company_name ??
    `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim();
  const defaultAddr  = corp?.company_address ?? "";

  return (
    <>
      <main className="mx-auto w-full max-w-[900px] px-4 py-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-600">{t("detailKicker")}</p>
            <h1 className="mt-1 text-2xl font-bold font-mono text-foreground">#{yp.id}</h1>
            <p className="text-xs text-muted mt-1">
              {t("detailCreatedAt", { date: new Date(yp.created_at).toLocaleString("th-TH") })}
              {yp.paydateadmin && (
                <> · {t("detailReviewedAt", { date: new Date(yp.paydateadmin).toLocaleString("th-TH") })}</>
              )}
            </p>
          </div>
          <Link href="/service-payment" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
            {t("backToListArrow")}
          </Link>
        </div>

        {/* Summary card */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${STATUS_BADGE[yp.status] ?? ""}`}>
              {statusLabel}
              <Explain
                className="ml-1"
                def="สถานะการชำระ — รอดำเนินการ = ทีมงานกำลังตรวจสลิป · สำเร็จ = โอนให้คู่ค้าจีนเรียบร้อย · ไม่สำเร็จ = มีปัญหา ติดต่อทีมงาน"
              />
            </span>
            <span className="text-sm text-muted">{t("detailChannelLabel")} <strong className="text-foreground">{channelLabel}</strong></span>
            {yp.paid_via_wallet && (
              <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[11px]">💳 {t("detailPaidViaWallet")}</span>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-border p-3">
              <p className="text-[11px] uppercase tracking-widest text-muted">{t("detailAmountCny")}</p>
              <p className="mt-1 text-xl font-bold font-mono">¥{Number(yp.yuan_amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
              <p className="text-[11px] text-muted">@ ฿{Number(yp.exchange_rate).toFixed(4)} / ¥</p>
            </div>
            <div className="rounded-lg border border-primary-200 bg-primary-50/40 p-3">
              <p className="text-[11px] uppercase tracking-widest text-primary-700">
                <Explain
                  label={t("detailAmountThb")}
                  def="ยอดบาท = จำนวนหยวน × เรท ณ ตอนสร้างรายการ — ยอดเงินที่คุณโอนเข้าบัญชีบริษัทสำหรับรายการนี้"
                />
              </p>
              <p className="mt-1 text-xl font-bold font-mono text-primary-700">฿{Number(yp.thb_amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
            </div>
          </div>

          <div>
            <p className="text-xs text-muted">{t("detailRecipient")}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{yp.recipient_detail || "—"}</p>
          </div>

          {yp.slip_url && (
            <span className="inline-flex items-center gap-1">
              <a
                href={yp.slip_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 px-3 py-1.5 text-xs font-semibold hover:bg-blue-100"
              >
                👁 {t("detailViewSlip")}
              </a>
              <Explain def="สลิป = รูปหลักฐานการโอนเงินที่คุณแนบไว้ — กดเพื่อเปิดดูภาพเต็ม" />
            </span>
          )}
        </section>

        {/* U4-3b: tax-invoice request panel */}
        {yp.status === "completed" ? (
          <TaxInvoiceRequestPanel
            orderType="yuan_payment"
            orderId={String(yp.id)}
            defaults={{
              name:    defaultName || "",
              address: defaultAddr,
              taxId:   buyerTaxId,
            }}
            existing={existingInvoice}
            eligible={isEligible}
            /* 0152 — yuan ใบกำกับ/ใบขน is LIVE when the flag is on; deferred when off. */
            deferred={!shopYuanTaxLive}
          />
        ) : (
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
            <h3 className="font-bold text-amber-900 mb-1">{t("detailTaxInvoiceTitle")}</h3>
            <p className="text-xs text-amber-800">
              {t.rich("detailTaxInvoiceNote", {
                status: statusLabel,
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
          </section>
        )}
      </main>
    </>
  );
}
