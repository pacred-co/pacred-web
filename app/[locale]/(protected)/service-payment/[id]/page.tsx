/**
 * Customer-side yuan-payment detail page (U4-3b).
 *
 * The listing at `/service-payment` shows everything inline in a table,
 * which is fine for at-a-glance status — but ฝากโอน (juristic) customers
 * now need a "ออกใบกำกับภาษี" button per completed transfer. The button
 * lives on a per-row detail page rather than the table itself so the
 * existing list UX stays untouched.
 *
 * Linked from the table via /service-payment/[id]. The yuan_payments
 * getYuanPayment action is RLS-scoped — admins cannot use this surface
 * (their dedicated tool lives under /admin/yuan-payments).
 */

import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getYuanPayment } from "@/actions/payment";
import { getMyTaxInvoiceForOrder } from "@/actions/tax-invoices";
import { TaxInvoiceRequestPanel } from "@/components/tax-invoice-request-panel";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  pending:    "bg-amber-50 text-amber-700 border-amber-200",
  processing: "bg-blue-50 text-blue-700 border-blue-200",
  completed:  "bg-green-50 text-green-700 border-green-200",
  failed:     "bg-red-50 text-red-700 border-red-200",
  refunded:   "bg-gray-50 text-gray-600 border-gray-200",
};
const STATUS_LABEL: Record<string, string> = {
  pending:    "รอตรวจสอบ",
  processing: "กำลังโอน",
  completed:  "สำเร็จ",
  failed:     "ไม่สำเร็จ",
  refunded:   "คืนเงินแล้ว",
};
const CHANNEL_LABEL: Record<string, string> = {
  alipay: "Alipay",
  wechat: "WeChat",
  bank:   "ธนาคารจีน",
};

export default async function YuanPaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await getYuanPayment(id);
  if (!res.ok || !res.data) notFound();
  const yp = res.data;

  // U4-3b: tax-invoice eligibility — must be completed + customer has tax_id.
  // We pull the latest tax-invoice row (if any) + the customer's juristic
  // profile snapshot in parallel.
  const supabase = await createClient();
  const [taxInv, profileRow, corporateRow] = await Promise.all([
    getMyTaxInvoiceForOrder("yuan_payment", id),
    supabase.from("profiles").select("first_name, last_name, account_type, tax_id").eq("id", yp.profile_id).maybeSingle<{
      first_name: string | null; last_name: string | null;
      account_type: "personal" | "juristic" | null;
      tax_id: string | null;
    }>(),
    supabase.from("corporate").select("company_name, company_address, tax_id").eq("profile_id", yp.profile_id).maybeSingle<{
      company_name: string | null; company_address: string | null; tax_id: string | null;
    }>(),
  ]);
  const existingInvoice = taxInv.ok ? taxInv.data : null;
  const profile = profileRow.data;
  const corp    = corporateRow.data;

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
            <p className="text-xs font-semibold tracking-widest text-primary-600">ฝากโอนหยวน</p>
            <h1 className="mt-1 text-2xl font-bold font-mono text-foreground">{yp.id.slice(0, 8)}…</h1>
            <p className="text-xs text-muted mt-1">
              สร้างเมื่อ {new Date(yp.created_at).toLocaleString("th-TH")}
              {yp.executed_at && (
                <> · โอนเมื่อ {new Date(yp.executed_at).toLocaleString("th-TH")}</>
              )}
            </p>
          </div>
          <Link href="/service-payment" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
            ← กลับรายการ
          </Link>
        </div>

        {/* Summary card */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_BADGE[yp.status] ?? ""}`}>
              {STATUS_LABEL[yp.status] ?? yp.status}
            </span>
            <span className="text-sm text-muted">ช่องทาง: <strong className="text-foreground">{CHANNEL_LABEL[yp.channel] ?? yp.channel}</strong></span>
            {yp.paid_via_wallet && (
              <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[11px]">💳 ตัดจากกระเป๋า</span>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-border p-3">
              <p className="text-[10px] uppercase tracking-widest text-muted">ยอด CNY</p>
              <p className="mt-1 text-xl font-bold font-mono">¥{Number(yp.yuan_amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
              <p className="text-[10px] text-muted">@ ฿{Number(yp.exchange_rate).toFixed(4)} / ¥</p>
            </div>
            <div className="rounded-lg border border-primary-200 bg-primary-50/40 p-3">
              <p className="text-[10px] uppercase tracking-widest text-primary-700">ยอด THB ที่ตัด</p>
              <p className="mt-1 text-xl font-bold font-mono text-primary-700">฿{Number(yp.thb_amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
            </div>
          </div>

          <div>
            <p className="text-xs text-muted">ผู้รับ / รายละเอียด</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{yp.recipient_detail || "—"}</p>
          </div>

          {yp.slip_url && (
            <a
              href={yp.slip_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 px-3 py-1.5 text-xs font-semibold hover:bg-blue-100"
            >
              👁 ดูสลิป
            </a>
          )}
        </section>

        {/* U4-3b: tax-invoice request panel */}
        {yp.status === "completed" ? (
          <TaxInvoiceRequestPanel
            orderType="yuan_payment"
            orderId={yp.id}
            defaults={{
              name:    defaultName || "",
              address: defaultAddr,
              taxId:   buyerTaxId,
            }}
            existing={existingInvoice}
            eligible={isEligible}
          />
        ) : (
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
            <h3 className="font-bold text-amber-900 mb-1">ออกใบกำกับภาษีได้หลังการโอนสำเร็จ</h3>
            <p className="text-xs text-amber-800">
              รายการนี้สถานะ <strong>{STATUS_LABEL[yp.status] ?? yp.status}</strong> — ระบบจะเปิดปุ่ม &ldquo;ขอใบกำกับภาษี&rdquo; เมื่อทีมงานยืนยันโอนสำเร็จแล้ว
            </p>
          </section>
        )}
      </main>
    </>
  );
}
