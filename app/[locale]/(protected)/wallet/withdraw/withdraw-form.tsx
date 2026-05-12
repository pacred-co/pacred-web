"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { createWithdraw } from "@/actions/wallet";

const inputCls = "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

type Props = { balance: number };

export function WithdrawForm({ balance }: Props) {
  const t = useTranslations("wallet");
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [bank, setBank] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError(t("amountInvalid"));
      return;
    }
    if (amt > balance) {
      setError(t("amountExceedsBalance"));
      return;
    }
    startTransition(async () => {
      const res = await createWithdraw({
        amount:         amt,
        bank_name:      bank,
        account_name:   accountName,
        account_number: accountNumber,
        note:           note || undefined,
      });
      if (res.ok) {
        setDone(true);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center space-y-3">
        <h2 className="text-xl font-bold text-green-800">{t("withdrawSubmittedTitle")}</h2>
        <p className="text-sm text-green-700">{t("withdrawSubmittedSubtitle")}</p>
        <div className="flex justify-center gap-2">
          <Button type="button" variant="outline" onClick={() => router.push("/wallet/history")}>
            {t("viewHistory")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <label className="block space-y-1">
        <span className="text-sm font-medium">{t("amountLabel")}<span className="text-red-600 ml-0.5">*</span></span>
        <input
          type="number"
          min="1"
          step="0.01"
          max={balance}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={inputCls}
          required
        />
        <span className="block text-xs text-muted">
          {t("withdrawMaxHint", { max: balance.toLocaleString("th-TH", { minimumFractionDigits: 2 }) })}
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm font-medium">{t("bankLabel")}<span className="text-red-600 ml-0.5">*</span></span>
          <input value={bank} onChange={(e) => setBank(e.target.value)} className={inputCls} required placeholder={t("bankPlaceholder")} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">{t("accountNameLabel")}<span className="text-red-600 ml-0.5">*</span></span>
          <input value={accountName} onChange={(e) => setAccountName(e.target.value)} className={inputCls} required />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium">{t("accountNumberLabel")}<span className="text-red-600 ml-0.5">*</span></span>
        <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className={inputCls} required />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">{t("noteLabel")}</span>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
      </label>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !amount}>
          {pending ? t("submitting") : t("submitWithdraw")}
        </Button>
      </div>
    </form>
  );
}
