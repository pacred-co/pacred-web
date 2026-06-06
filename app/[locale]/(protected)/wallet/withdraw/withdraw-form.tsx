"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
// 2026-06-05 (E2E audit · §0f confirm-before-mutate) — withdraw debits
// tb_wallet.wallettotal IMMEDIATELY on submit (wallet-tb.ts:199). Without
// confirm, fat-finger click = real money leaves account. Add modal gate.
import { confirm } from "@/components/ui/confirm";
// ADR-0018 §D-2 rule 1 + §D-3 #4 (2026-05-30 · P0-7): the live withdraw
// submit now writes the LEGACY SOT (tb_wallet + tb_wallet_hs) via
// submitWithdrawRequest. The old createWithdraw wrote the rebuilt
// `wallet_transactions` (empty on prod) → migrated customers' requests were
// invisible to admin. createWithdraw is now a TOMBSTONE (see actions/wallet.ts).
import { submitWithdrawRequest } from "@/actions/wallet-tb";
import { Banknote, User, Hash } from "lucide-react";
import { trackWalletWithdrawRequest } from "@/lib/analytics";

const MIN_AMOUNT = 25;
const FEE_THRESHOLD = 500;
const FEE_AMOUNT = 25;

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

  const amt = Number(amount);
  const fee = useMemo(() => (Number.isFinite(amt) && amt > 0 && amt < FEE_THRESHOLD) ? FEE_AMOUNT : 0, [amt]);
  const net = Number.isFinite(amt) && amt > 0 ? Math.max(0, amt - fee) : 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError(t("amountInvalid"));
      return;
    }
    if (amt < MIN_AMOUNT) {
      setError(t("minWithdrawError", { amount: MIN_AMOUNT }));
      return;
    }
    if (amt > balance) {
      setError(t("amountExceedsBalance"));
      return;
    }
    // §0f confirm-before-mutate — withdraw debits wallet immediately on submit.
    // Show clear summary so customer can't fat-finger the wrong bank/amount.
    const ok = await confirm(
      t("confirmWithdrawAmount", { amount: amt.toLocaleString("th-TH", { minimumFractionDigits: 2 }) }) + "\n" +
      `${fee > 0 ? t("confirmWithdrawFee", { fee: fee.toFixed(2), threshold: FEE_THRESHOLD }) + "\n" : ""}` +
      t("confirmWithdrawNet", { amount: net.toLocaleString("th-TH", { minimumFractionDigits: 2 }) }) + "\n\n" +
      t("confirmWithdrawBank", { bank }) + "\n" +
      t("confirmWithdrawName", { name: accountName }) + "\n" +
      t("confirmWithdrawNumber", { number: accountNumber }) + "\n\n" +
      t("confirmWithdrawWarning"),
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await submitWithdrawRequest({
        amount:         amt,
        bank_name:      bank,
        account_name:   accountName,
        account_number: accountNumber,
        note:           note || undefined,
      });
      if (res.ok) {
        trackWalletWithdrawRequest(amt);
        setDone(true);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-5 text-center space-y-3">
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
    <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-white dark:bg-surface p-4 sm:p-5 shadow-sm space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Amount */}
      <label className="block space-y-1">
        <span className="text-sm font-medium">{t("amountToWithdrawLabel")}<span className="text-red-600 ml-0.5">*</span></span>
        <div className="relative">
          <input
            type="number"
            min={MIN_AMOUNT}
            step="0.01"
            max={balance}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${inputCls} text-lg font-mono font-bold pr-12`}
            required
            placeholder="0.00"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-base font-bold text-muted">฿</span>
        </div>
        <span className="block text-xs text-muted">
          {t("withdrawableLabel")} <b className="font-mono text-foreground">฿{balance.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</b>
          {" · "}{t("minLabel")} <b>฿{MIN_AMOUNT}</b>
        </span>
      </label>

      {/* Live fee + net preview */}
      {amt > 0 && (
        <div className="rounded-xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">{t("withdrawAmountLabel")}</span>
            <span className="font-mono">฿{amt.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">{t("feeLabel")} {fee > 0 ? t("feeBelowThreshold", { threshold: FEE_THRESHOLD }) : t("feeWaived")}</span>
            <span className="font-mono text-red-600">−฿{fee.toFixed(2)}</span>
          </div>
          <hr className="border-amber-200" />
          <div className="flex justify-between items-baseline">
            <span className="text-xs text-muted">{t("netReceiveLabel")}</span>
            <span className="font-mono text-lg font-bold text-emerald-600">
              ฿{net.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}

      {/* Bank details */}
      <div className="space-y-3 rounded-xl border border-border bg-surface-alt/30 p-4">
        <h3 className="font-bold text-sm flex items-center gap-2"><Banknote className="w-4 h-4 text-primary-600" /> {t("destinationAccount")}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium">{t("bankLabel")}<span className="text-red-600 ml-0.5">*</span></span>
            <input value={bank} onChange={(e) => setBank(e.target.value)} className={inputCls} required placeholder={t("bankFieldPlaceholder")} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium flex items-center gap-1"><User className="w-3 h-3" /> {t("accountNameLabel")}<span className="text-red-600">*</span></span>
            <input value={accountName} onChange={(e) => setAccountName(e.target.value)} className={inputCls} required placeholder={t("accountNamePlaceholder")} />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-medium flex items-center gap-1"><Hash className="w-3 h-3" /> {t("accountNumberLabel")}<span className="text-red-600">*</span></span>
          <input
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value.replace(/[^0-9-]/g, ""))}
            className={`${inputCls} font-mono`}
            required
            placeholder="xxx-x-xxxxx-x"
            inputMode="numeric"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium">{t("noteOptionalLabel")}</span>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder={t("notePlaceholder")} />
        </label>
      </div>

      <button
        type="submit"
        disabled={pending || !amount || amt < MIN_AMOUNT || amt > balance}
        className={`w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 text-white font-bold text-sm px-5 py-2.5 shadow-sm hover:shadow-md transition-all disabled:opacity-50`}
      >
        {pending ? t("submittingRequest") : `💸 ${t("confirmWithdrawButton")}${net > 0 ? ` ฿${net.toLocaleString("th-TH", { minimumFractionDigits: 2 })}` : ""}`}
      </button>
    </form>
  );
}
