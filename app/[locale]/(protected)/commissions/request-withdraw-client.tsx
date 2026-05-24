"use client";

/**
 * G6 — affiliate withdraw modal (customer-side).
 *
 * Mounts as a CTA button + a centred modal. Submits to
 * `actions/commissions.ts: requestCommissionWithdraw`. Mobile-first:
 * the modal becomes a full-height sheet on <640px so it still works
 * at 360/390 px (per spec). Uses Pacred red (#B30000 = primary-600)
 * and Lucide icons per CLAUDE.md.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowDownToLine, Banknote, Hash, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requestCommissionWithdraw } from "@/actions/commissions";

type Props = {
  available: number;
  min:       number;
  max:       number;
  disabled:  boolean;
};

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm " +
  "focus:outline-none focus:ring-2 focus:ring-primary-500/50";

export function RequestWithdrawClient({ available, min, max, disabled }: Props) {
  const t = useTranslations("commissions");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [amount, setAmount] = useState<string>("");
  const [bank, setBank] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [note, setNote] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [successRef, setSuccessRef] = useState<{ ref: string; amount: number } | null>(null);

  const amt = Number(amount);

  function reset() {
    setAmount("");
    setBank("");
    setAccountName("");
    setAccountNumber("");
    setNote("");
    setError(null);
  }

  function close() {
    setOpen(false);
    setSuccessRef(null);
    reset();
  }

  function validate(): string | null {
    if (!Number.isFinite(amt) || amt <= 0)  return t("errorAmountInvalid");
    if (amt < min)                          return t("errorMinAmount", { min: min.toLocaleString() });
    if (amt > max)                          return t("errorMaxAmount", { max: max.toLocaleString() });
    if (amt > available)                    return t("errorAmountExceedsAvailable", { available: available.toLocaleString(undefined, { minimumFractionDigits: 2 }) });
    if (!bank.trim())                       return t("errorBankRequired");
    if (!accountName.trim())                return t("errorAccountNameRequired");
    if (!/^[\d\- ]{8,20}$/.test(accountNumber.trim())) return t("errorAccountNumberInvalid");
    return null;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const v = validate();
    if (v) { setError(v); return; }

    startTransition(async () => {
      const res = await requestCommissionWithdraw({
        amount:         amt,
        bank_name:      bank.trim(),
        account_name:   accountName.trim(),
        account_number: accountNumber.trim(),
        note:           note.trim() || undefined,
      });
      if (res.ok) {
        setSuccessRef({
          ref:    res.data?.payout_id ?? "—",
          amount: res.data?.amount_total ?? amt,
        });
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="primary"
        size="md"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-disabled={disabled}
      >
        <ArrowDownToLine className="w-4 h-4" />
        {t("requestWithdrawCta")}
      </Button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="commission-withdraw-modal-title"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50"
          onClick={close}
        >
          <div
            className="
              relative w-full sm:max-w-md
              rounded-t-2xl sm:rounded-2xl
              bg-white dark:bg-surface
              shadow-xl
              max-h-[90vh] overflow-y-auto
            "
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-white dark:bg-surface border-b border-border px-5 py-4 flex items-center justify-between">
              <div>
                <h2 id="commission-withdraw-modal-title" className="text-base font-bold text-foreground">
                  {t("modalTitle")}
                </h2>
                <p className="text-xs text-muted mt-0.5">{t("modalSubtitle")}</p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label={t("cancel")}
                className="rounded-lg p-1.5 text-muted hover:bg-surface-alt"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Success state */}
            {successRef ? (
              <div className="p-5 space-y-4 text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                  <ArrowDownToLine className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-foreground">{t("submittedTitle")}</h3>
                <p className="text-sm text-muted">
                  {t("submittedBody", {
                    ref:    successRef.ref.slice(0, 8),
                    amount: successRef.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }),
                  })}
                </p>
                <Button type="button" variant="primary" size="md" fullWidth onClick={close}>
                  {t("submittedClose")}
                </Button>
              </div>
            ) : (
              /* Form */
              <form onSubmit={onSubmit} className="p-5 space-y-4">
                {/* Amount */}
                <div>
                  <label htmlFor="commission-withdraw-amount" className="text-xs font-semibold text-foreground">
                    {t("amountLabel")}
                  </label>
                  <input
                    id="commission-withdraw-amount"
                    name="amount"
                    type="number"
                    inputMode="decimal"
                    min={min}
                    max={Math.min(max, available)}
                    step="0.01"
                    className={inputCls + " mt-1 font-mono"}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                  <p className="text-[11px] text-muted mt-1">
                    {t("amountHint", {
                      min:       min.toLocaleString(),
                      available: available.toLocaleString(undefined, { minimumFractionDigits: 2 }),
                    })}
                  </p>
                </div>

                {/* Bank */}
                <div>
                  <label htmlFor="commission-withdraw-bank" className="text-xs font-semibold text-foreground">
                    {t("bankLabel")}
                  </label>
                  <div className="relative mt-1">
                    <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                    <input
                      id="commission-withdraw-bank"
                      name="bank_name"
                      type="text"
                      className={inputCls + " pl-9"}
                      placeholder={t("bankPlaceholder")}
                      value={bank}
                      onChange={(e) => setBank(e.target.value)}
                      required
                      maxLength={100}
                    />
                  </div>
                </div>

                {/* Account name */}
                <div>
                  <label htmlFor="commission-withdraw-acct-name" className="text-xs font-semibold text-foreground">
                    {t("accountNameLabel")}
                  </label>
                  <div className="relative mt-1">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                    <input
                      id="commission-withdraw-acct-name"
                      name="account_name"
                      type="text"
                      className={inputCls + " pl-9"}
                      value={accountName}
                      onChange={(e) => setAccountName(e.target.value)}
                      required
                      maxLength={200}
                    />
                  </div>
                </div>

                {/* Account number */}
                <div>
                  <label htmlFor="commission-withdraw-acct-no" className="text-xs font-semibold text-foreground">
                    {t("accountNumberLabel")}
                  </label>
                  <div className="relative mt-1">
                    <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                    <input
                      id="commission-withdraw-acct-no"
                      name="account_number"
                      type="text"
                      inputMode="numeric"
                      className={inputCls + " pl-9 font-mono"}
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      required
                      maxLength={20}
                    />
                  </div>
                </div>

                {/* Note */}
                <div>
                  <label htmlFor="commission-withdraw-note" className="text-xs font-semibold text-foreground">
                    {t("noteLabel")}
                  </label>
                  <textarea
                    id="commission-withdraw-note"
                    name="note"
                    rows={2}
                    className={inputCls + " mt-1 resize-none"}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={500}
                  />
                </div>

                {error && (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {error}
                  </p>
                )}

                <div className="flex gap-2 pt-2">
                  <Button type="button" variant="outline" size="md" onClick={close} className="flex-1">
                    {t("cancel")}
                  </Button>
                  <Button type="submit" variant="primary" size="md" disabled={pending} className="flex-1">
                    {pending ? t("submitting") : t("submit")}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
