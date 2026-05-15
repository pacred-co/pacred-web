"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { payForwarderFromWallet } from "@/actions/forwarder";

/**
 * Customer pay-from-wallet button for forwarder (ฝากนำเข้า) — mirror of
 * the service-order pay button. Closes the import loop self-service.
 *
 * Shown only when forwarder.status='pending_payment'.
 *
 * Pattern:
 *   - balance >= total_price → primary button "ชำระจาก wallet" + confirm
 *   - balance <  total_price → friendly hint with shortfall; existing
 *     "ฝากเงิน" link in the page handles top-up
 *
 * Idempotent on the server — double-click is safe (already_paid path).
 */
type Props = {
  fNo:           string;
  totalThb:      number;
  walletBalance: number;
};

export function PayFromWalletButton({ fNo, totalThb, walletBalance }: Props) {
  const t = useTranslations("forwarder");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg]     = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sufficient = walletBalance >= totalThb;
  const totalFmt   = totalThb.toLocaleString("th-TH",     { minimumFractionDigits: 2 });
  const balanceFmt = walletBalance.toLocaleString("th-TH", { minimumFractionDigits: 2 });
  const shortfall  = sufficient ? 0 : totalThb - walletBalance;
  const shortFmt   = shortfall.toLocaleString("th-TH",    { minimumFractionDigits: 2 });

  if (!sufficient) {
    return (
      <p className="text-xs text-yellow-800">
        {t("payInsufficientHint", { balance: balanceFmt, shortfall: shortFmt })}
      </p>
    );
  }

  function onPay() {
    if (!confirm(t("payFromWalletConfirm", { total: totalFmt }))) return;
    setMsg(null);
    setError(null);
    startTransition(async () => {
      const res = await payForwarderFromWallet(fNo);
      if (res.ok) {
        setMsg(t("paySuccess", { amount: totalFmt }));
        router.refresh();
        setTimeout(() => setMsg(null), 5000);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        onClick={onPay}
        disabled={pending}
        size="lg"
        className="w-full sm:w-auto bg-primary-600 hover:bg-primary-700 text-white"
      >
        {pending ? t("paying") : `💰 ${t("payFromWallet")} (${t("payFromWalletBalance", { balance: balanceFmt })})`}
      </Button>
      {msg   && <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">{msg}</p>}
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
