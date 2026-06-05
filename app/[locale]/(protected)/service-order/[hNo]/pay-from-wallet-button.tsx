"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { confirm } from "@/components/ui/confirm";
import { payServiceOrderFromWallet } from "@/actions/service-order";

/**
 * Customer pay-from-wallet button — closes the cargo loop self-service.
 *
 * Shown only when order.status='awaiting_payment'.
 *
 * If wallet balance >= total: primary button "ชำระจาก wallet" with confirm
 * prompt → calls payServiceOrderFromWallet → router.refresh() on success.
 *
 * If balance < total: shows a friendly hint with shortfall amount; the
 * existing "ฝากเงิน" link in the page handles top-up.
 *
 * Idempotent on the server — double-click is safe (already_paid path).
 */
type Props = {
  hNo:           string;
  totalThb:      number;
  totalThbRaw?:  number | null;   // full-precision reference (null if equals rounded)
  walletBalance: number;          // main bucket balance (THB)
};

export function PayFromWalletButton({ hNo, totalThb, totalThbRaw, walletBalance }: Props) {
  const t = useTranslations("serviceOrder");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg]     = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 2026-06-05 (ภูม flag) — rounding tolerance · legacy PHP used `round_up(x,2)`
  // for the order total but the wallet wallettotal is stored as Math.round*100
  // → can differ by ≤1 satang (e.g. wallet ฿176.53 vs total ฿176.54). Without
  // tolerance the customer sees NO pay button at all · ภูม "ไม่มีให้กดชำระเลย".
  const ROUNDING_TOLERANCE_THB = 0.01;
  const sufficient = walletBalance + ROUNDING_TOLERANCE_THB >= totalThb;
  const totalFmt   = totalThb.toLocaleString("th-TH",  { minimumFractionDigits: 2 });
  const rawFmt     = totalThbRaw != null
    ? totalThbRaw.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
    : null;
  // Used to label both the button + confirm — round + raw together.
  const totalDual  = rawFmt ? `${totalFmt} (฿${rawFmt})` : totalFmt;
  const balanceFmt = walletBalance.toLocaleString("th-TH", { minimumFractionDigits: 2 });
  const shortfall  = sufficient ? 0 : totalThb - walletBalance;
  const shortFmt   = shortfall.toLocaleString("th-TH", { minimumFractionDigits: 2 });

  if (!sufficient) {
    return (
      <div className="space-y-1">
        <p className="text-xs text-yellow-800">
          {t("payInsufficientHint", { balance: balanceFmt, shortfall: shortFmt })}
        </p>
        {rawFmt && (
          <p className="text-[11px] text-yellow-700/80">
            <span className="font-mono">฿{totalFmt}</span> = ปัดขึ้นจากยอดจริง <span className="font-mono">฿{rawFmt}</span> · โอนตามยอดหลักได้เลย
          </p>
        )}
      </div>
    );
  }

  async function onPay() {
    if (!(await confirm(t("payFromWalletConfirm", { total: totalDual })))) return;
    setMsg(null);
    setError(null);
    startTransition(async () => {
      const res = await payServiceOrderFromWallet(hNo);
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
