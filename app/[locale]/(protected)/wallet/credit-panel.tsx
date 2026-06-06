"use client";

// U4-2 · Customer credit-line panel (renders on /wallet/history)
//   - Shows limit / outstanding / available headroom + terms
//   - "ชำระยอดค้างเครดิต" button → confirm modal → calls
//     customerPayCreditFromWallet (server action). On success the
//     router refresh re-reads the view + the wallet balance.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CreditCard, AlertTriangle, CheckCircle2 } from "lucide-react";
import { customerPayCreditFromWallet, type CustomerCreditState } from "@/actions/credit";

type Props = {
  credit:        CustomerCreditState;
  walletBalance: number;
};

export function CreditLinePanel({ credit, walletBalance }: Props) {
  const router = useRouter();
  const t = useTranslations("wallet");
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok,  setOk]  = useState<string | null>(null);

  // Customer not enrolled → render nothing (the wallet history page
  // also gates rendering on credit_limit_thb > 0, but defence in
  // depth helps if this component is reused elsewhere).
  if (Number(credit.credit_limit_thb) <= 0) return null;

  const outstanding = Number(credit.outstanding_thb);
  const limit       = Number(credit.credit_limit_thb);
  const available   = Number(credit.available_credit_thb);
  const owedPct     = limit > 0 ? Math.min(100, Math.max(0, (outstanding / limit) * 100)) : 0;
  const overLimit   = available < 0;

  // The pay action settles the lower of outstanding or wallet
  // balance. If wallet < outstanding we surface "partial" cue so
  // the customer knows what'll happen before they click.
  const settleAmount = Math.min(outstanding, walletBalance);
  const partial      = walletBalance > 0 && walletBalance < outstanding;
  const canPay       = settleAmount > 0;

  function doPay() {
    setErr(null); setOk(null);
    startTransition(async () => {
      // Explicitly cap to the wallet balance — if the customer's
      // outstanding > wallet, we settle what they can afford.
      // Passing undefined would let the action default to full
      // outstanding which then fails the wallet_insufficient check.
      const res = await customerPayCreditFromWallet(
        partial ? { amount_thb: settleAmount } : undefined,
      );
      if (res.ok) {
        setOk(
          res.data?.already_settled
            ? t("creditAlreadySettled")
            : t("creditPaidToast", {
                paid: (res.data?.amount_paid_thb ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 }),
                remaining: (res.data?.new_outstanding_thb ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 }),
              }),
        );
        setConfirmOpen(false);
        router.refresh();
        setTimeout(() => setOk(null), 5000);
      } else {
        setErr(res.error ?? t("genericError"));
      }
    });
  }

  return (
    <div className="rounded-2xl border-2 border-blue-300/40 bg-gradient-to-br from-blue-50 to-blue-100/40 dark:from-blue-950/30 dark:to-blue-900/20 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-blue-700" />
          <h3 className="font-bold text-base text-blue-900 dark:text-blue-100">
            {t("creditLineTitle")}
          </h3>
        </div>
        <span className="text-[10px] font-mono uppercase text-blue-700/60">
          {t("creditTermsDays", { days: credit.credit_terms_days })}
        </span>
      </div>

      <div className="mt-4 grid sm:grid-cols-3 gap-3">
        <div>
          <p className="text-[10px] font-semibold text-blue-700/80">{t("creditLimitTotal")}</p>
          <p className="mt-0.5 text-lg font-bold font-mono text-blue-900">
            ฿{limit.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-red-700/80">{t("creditOutstanding")}</p>
          <p className="mt-0.5 text-lg font-bold font-mono text-red-700">
            ฿{outstanding.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-emerald-700/80">{t("creditRemaining")}</p>
          <p className={`mt-0.5 text-lg font-bold font-mono ${overLimit ? "text-red-700" : "text-emerald-700"}`}>
            ฿{available.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      <div className="mt-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-blue-100">
          <div
            className={`h-full ${owedPct >= 90 ? "bg-red-500" : owedPct >= 60 ? "bg-amber-500" : "bg-blue-500"}`}
            style={{ width: `${owedPct}%` }}
          />
        </div>
        <p className="mt-1 text-[10px] text-blue-700/70">
          {t("creditUsedPct", { pct: owedPct.toFixed(0) })}
        </p>
      </div>

      {overLimit && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-2.5 text-xs text-red-800">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <p>{t("creditOverLimitWarning")}</p>
        </div>
      )}

      {ok  && <div className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 p-2.5 text-xs text-emerald-800 flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />{ok}</div>}
      {err && <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-2.5 text-xs text-red-800 flex items-start gap-2"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{err}</div>}

      {outstanding > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {canPay ? (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 text-white px-5 py-2 text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
              disabled={pending}
            >
              <CreditCard className="w-4 h-4" />
              {t("payCreditBtn")} {partial ? t("payCreditPartialSuffix", { amount: settleAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 }) }) : t("payCreditFullSuffix", { amount: outstanding.toLocaleString("th-TH", { minimumFractionDigits: 2 }) })}
            </button>
          ) : (
            <p className="text-xs text-muted">
              {t("payCreditInsufficient")}
            </p>
          )}
          {partial && (
            <span className="text-[10px] text-amber-700 bg-amber-100 rounded-full px-2 py-0.5 font-medium">
              {t("payCreditPartialBadge")}
            </span>
          )}
        </div>
      )}

      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={() => !pending && setConfirmOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-base font-bold">{t("confirmPayTitle")}</h4>
            <p className="mt-2 text-sm text-muted">
              {t.rich("confirmPayBody", {
                amount: settleAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 }),
                remaining: (walletBalance - settleAmount).toLocaleString("th-TH", { minimumFractionDigits: 2 }),
                b: (chunks) => <span className="font-mono font-bold text-foreground">{chunks}</span>,
              })}
            </p>
            {partial && (
              <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded p-2">
                {t("confirmPayPartial", { remaining: (outstanding - settleAmount).toLocaleString("th-TH", { minimumFractionDigits: 2 }) })}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={pending}
                className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={doPay}
                disabled={pending}
                className="rounded-lg bg-blue-600 text-white px-3 py-1.5 text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
              >
                {pending ? t("payingInProgress") : t("confirmPayBtn")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
