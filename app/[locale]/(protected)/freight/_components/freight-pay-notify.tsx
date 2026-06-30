"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Landmark, Copy, Check, MessageCircle, ShieldCheck } from "lucide-react";
import type { PacredBankAccount } from "@/lib/payment/bank-accounts";

/**
 * <FreightPayNotify> — "แจ้งชำระเงิน" panel for a freight shipment.
 *
 * The destination ACCOUNT is resolved on the server via
 * `resolvePaymentAccount()` (lib/payment/bank-accounts SOT) and passed in here.
 * Freight → SERVICE account (PromptPay นิติ, no VAT) UNLESS the job issues a
 * ใบกำกับภาษี → TRADING account (+VAT 7%). This component only DISPLAYS where
 * to pay + lets the customer copy the number + send a "โอนแล้ว" notice to the
 * Pacred LINE OA. It performs NO money mutation (recording the payment is an
 * admin step) — so there is nothing to gate beyond a confirm on the notify.
 *
 * §0f: the "แจ้งโอนแล้ว" button confirms before it fires (กันลั่น).
 */
export function FreightPayNotify({
  account,
  outstandingThb,
  jobNo,
  lineOaUrl,
}: {
  account: PacredBankAccount;
  outstandingThb: number;
  jobNo: string;
  lineOaUrl: string;
}) {
  const t = useTranslations("customerFreight");
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const copyAccount = async () => {
    try {
      await navigator.clipboard.writeText(account.accountNo.replace(/-/g, ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable — the number is still visible to read off */
    }
  };

  const thb = (n: number) =>
    "฿" + Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });

  return (
    <section className="rounded-2xl border-2 border-primary-200 bg-primary-50/40 p-5 space-y-3">
      <h2 className="font-bold text-sm inline-flex items-center gap-2 text-primary-800">
        <Landmark className="h-4 w-4" /> {t("payHeading")}
      </h2>

      {outstandingThb > 0 && (
        <p className="text-sm text-foreground">
          {t("payOutstanding")}{" "}
          <span className="font-mono font-bold text-primary-700">{thb(outstandingThb)}</span>
        </p>
      )}

      {/* Destination account card (resolved by the SOT). */}
      <div className="rounded-xl border border-border bg-white p-4 space-y-1.5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted">
          {t("payToAccount")} · {account.label}
        </p>
        <p className="text-sm font-semibold text-foreground">
          {account.bankName} ({account.accountType})
        </p>
        <div className="flex items-center gap-2">
          <span className="font-mono text-lg font-bold tracking-wide text-primary-700">
            {account.accountNo}
          </span>
          <button
            type="button"
            onClick={copyAccount}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-2 py-1 text-[11px] font-medium hover:bg-surface-alt"
          >
            {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
            {copied ? t("payCopied") : t("payCopy")}
          </button>
        </div>
        <p className="text-xs text-muted">{account.accountName}</p>
        {account.channel === "promptpay" && account.promptPayId && (
          <p className="text-xs text-muted">
            PromptPay (นิติ): <span className="font-mono">{account.promptPayId}</span>
          </p>
        )}
        {account.issuesTaxInvoice ? (
          <p className="mt-1 inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-700">
            <ShieldCheck className="h-3 w-3" /> {t("payTaxInvoiceVat")}
          </p>
        ) : (
          <p className="mt-1 text-[11px] text-muted">{t("payNoTaxInvoice")}</p>
        )}
      </div>

      <p className="text-[11px] text-muted">{t("payInstruction")}</p>

      {/* Notify CTA — confirm before opening LINE OA (§0f กันลั่น). */}
      {confirming ? (
        <div className="rounded-lg border border-green-300 bg-green-50 p-3 space-y-2">
          <p className="text-xs text-green-900">{t("payConfirmPrompt", { jobNo })}</p>
          <div className="flex gap-2">
            <a
              href={lineOaUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setConfirming(false)}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-xs font-bold text-white hover:bg-green-700"
            >
              <MessageCircle className="h-4 w-4" /> {t("payConfirmYes")}
            </a>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-border bg-white px-3 py-2 text-xs font-medium hover:bg-surface-alt"
            >
              {t("payConfirmCancel")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-green-700 sm:w-auto"
        >
          <MessageCircle className="h-4 w-4" /> {t("payNotifyButton")}
        </button>
      )}
    </section>
  );
}
