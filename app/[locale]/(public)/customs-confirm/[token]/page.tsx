/**
 * Public ใบขนพ่วง confirm page (#17) — `/customs-confirm/[token]`.
 *
 * The login-free surface a customer reaches from a LINE link (owner-confirmed:
 * customers may lack a portal login). NO auth — the `[token]` is the unguessable
 * v4-UUID `confirm_token` (122-bit random · partial-unique-indexed · mig 0236),
 * so the declaration stays non-enumerable while the holder of the link can review
 * the prepared documents + amount and เฟิมยอด (confirm) directly.
 *
 * Shows the amount breakdown the customer must agree to — มูลค่าสำแดง + อากร + VAT
 * (their customs liability, which WE collect + remit · pass-through · NOT a Pacred
 * VAT line) + ค่าบริการออกใบขน. On confirm → status='confirmed', after which
 * accounting may collect into the SERVICE account. Mirrors the shop-order pay UX
 * (amount card → destination account QR → action).
 *
 * Money-safe: this page READS the declaration by token + renders the SERVICE
 * destination via the 3-account SOT (resolvePaymentAccount). The customer's
 * confirm/reject (the only mutation) goes through actions/customs-confirm.ts and
 * only flips customer_confirm_status — never money.
 */

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePaymentAccount } from "@/lib/payment/bank-accounts";
import { buildServicePromptPayQrDataUrl } from "@/lib/promptpay";
import { CustomsConfirmClient } from "./customs-confirm-client";

export const dynamic = "force-dynamic";

// A money document must never be indexed.
export const metadata = {
  title: "ยืนยันใบขนสินค้า — Pacred",
  robots: { index: false, follow: false },
};

const fmt = (n: number) =>
  n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Decl = {
  id:                       string;
  declaration_no:           string | null;
  cargo_forwarder_id:       number | null;
  issue_in_customer_name:   boolean;
  consignee_name:           string | null;
  consignee_tax_id:         string | null;
  consignee_address:        string | null;
  service_fee_thb:          number | string | null;
  total_declared_value_thb: number | string | null;
  total_duty_thb:           number | string | null;
  total_vat_thb:            number | string | null;
  customer_confirm_status:  string | null;
  customer_confirmed_at:    string | null;
};

export default async function CustomsConfirmPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Token must be a UUID; resolve ONLY by confirm_token (no id, no enumeration).
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    notFound();
  }

  const admin = createAdminClient();
  const { data: decl, error } = await admin
    .from("customs_declarations")
    .select(
      "id, declaration_no, cargo_forwarder_id, issue_in_customer_name, " +
        "consignee_name, consignee_tax_id, consignee_address, service_fee_thb, " +
        "total_declared_value_thb, total_duty_thb, total_vat_thb, " +
        "customer_confirm_status, customer_confirmed_at",
    )
    .eq("confirm_token", token)
    .maybeSingle<Decl>();
  if (error) {
    console.error("[customs-confirm page lookup]", { code: error.code, message: error.message });
    throw new Error("ไม่สามารถโหลดข้อมูลใบขนได้ กรุณาลองใหม่");
  }
  // Missing token, a non-own-name decl, or a draft never sent → 404 (don't leak).
  if (!decl) notFound();
  if (!decl.issue_in_customer_name) notFound();
  if (decl.customer_confirm_status === "none") notFound();

  const serviceFee = Number(decl.service_fee_thb ?? 0);
  const declared   = Number(decl.total_declared_value_thb ?? 0);
  const duty       = Number(decl.total_duty_thb ?? 0);
  const vat        = Number(decl.total_vat_thb ?? 0);
  const collectable = serviceFee + duty + vat;

  // SERVICE destination (own-name ใบขน issues NO ใบกำกับ → SERVICE · pass-through).
  const account = resolvePaymentAccount({ issuesTaxInvoice: false });
  // SERVICE lane → GENERATE a PromptPay amount-QR for the exact collectable, paid
  // into the SERVICE นิติ account 0105564077716 (owner rule 2026-07-02 · not a
  // static K-Shop image). Built server-side (no auth, unlike getForwarderPaymentQr).
  const serviceQrDataUrl =
    account.channel === "promptpay" ? (await buildServicePromptPayQrDataUrl(collectable)) || null : null;

  const docTag = decl.declaration_no ?? decl.id.slice(0, 8);
  const status = (decl.customer_confirm_status ?? "sent") as "sent" | "confirmed" | "rejected";

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-4">
        <header>
          <p className="text-xs text-muted">ใบขนสินค้า (ออกในนามของท่าน)</p>
          <h1 className="text-xl font-bold">
            ยืนยันยอด <span className="font-mono">{docTag}</span>
          </h1>
        </header>

        {/* Consignee (ผู้นำเข้า = ลูกค้า) snapshot */}
        {(decl.consignee_name || decl.consignee_tax_id || decl.consignee_address) && (
          <section className="rounded-xl border border-border bg-surface-alt/40 p-3 text-xs space-y-0.5">
            <p className="font-semibold">ผู้นำเข้า (ในใบขน)</p>
            {decl.consignee_name && <p>{decl.consignee_name}</p>}
            {decl.consignee_tax_id && <p>เลขผู้เสียภาษี: <span className="font-mono">{decl.consignee_tax_id}</span></p>}
            {decl.consignee_address && <p className="text-muted whitespace-pre-wrap">{decl.consignee_address}</p>}
          </section>
        )}

        {/* Amount breakdown — the thing the customer confirms */}
        <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm">
          <table className="w-full">
            <tbody>
              <tr className="border-b border-amber-200/60">
                <td className="py-1.5 text-foreground">มูลค่าสำแดง</td>
                <td className="py-1.5 text-right font-mono tabular-nums">฿{fmt(declared)}</td>
              </tr>
              <tr className="border-b border-amber-200/60">
                <td className="py-1.5">อากรขาเข้า</td>
                <td className="py-1.5 text-right font-mono tabular-nums">฿{fmt(duty)}</td>
              </tr>
              <tr className="border-b border-amber-200/60">
                <td className="py-1.5">ภาษีมูลค่าเพิ่ม (VAT 7%)</td>
                <td className="py-1.5 text-right font-mono tabular-nums">฿{fmt(vat)}</td>
              </tr>
              <tr className="border-b border-amber-200/60">
                <td className="py-1.5">ค่าบริการออกใบขน</td>
                <td className="py-1.5 text-right font-mono tabular-nums">฿{fmt(serviceFee)}</td>
              </tr>
              <tr>
                <td className="py-2 font-bold">ยอดที่ต้องชำระ</td>
                <td className="py-2 text-right font-mono tabular-nums font-bold text-primary-700 text-base">
                  ฿{fmt(collectable)}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-1.5 text-[11px] text-muted">
            อากร + VAT เป็นภาษีศุลกากรของท่าน บริษัทเป็นผู้ดำเนินการชำระแทน (ส่งต่อให้กรมศุลกากร) ไม่ใช่ยอดของบริษัท
          </p>
        </section>

        {/* Confirm / reject + pay destination (client) */}
        <CustomsConfirmClient
          token={token}
          declarationId={decl.id}
          isCargo={decl.cargo_forwarder_id != null}
          status={status}
          confirmedAt={decl.customer_confirmed_at}
          account={account}
          collectable={collectable}
          serviceQrDataUrl={serviceQrDataUrl}
        />
      </div>

      <p className="mt-4 text-center text-[11px] text-muted">
        บริษัท แพคเรด (ประเทศไทย) จำกัด · หากมีข้อสงสัยติดต่อทีมงานทาง LINE
      </p>
    </main>
  );
}
