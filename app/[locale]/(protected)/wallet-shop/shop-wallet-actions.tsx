"use client";

/**
 * Client-side "Transfer from Personal" + "Request Withdraw" buttons
 * for the /wallet-shop page. Each opens its own simple modal.
 *
 * Kept deliberately minimal (no jQuery / Bootstrap modal dance — this
 * is a greenfield Pacred screen, mobile-first Tailwind). When the
 * admin payout console + saved-bank-accounts shipping later, the
 * withdraw modal will swap to a saved-account selector; for now it
 * uses inline bank fields (mirrors actions/wallet.ts's createWithdraw).
 *
 * State is local-only — on success we call `router.refresh()` so the
 * Server Component re-runs and the new pending row is shown. No
 * optimistic UI: a payout flow is the worst place to lie.
 */

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  transferFromPersonalToShopWallet,
  requestShopWalletWithdraw,
} from "@/actions/affiliate-shop-wallet";

type Strings = {
  transferFromPersonal:       string;
  requestWithdraw:            string;
  transferModalTitle:         string;
  transferAmountLabel:        string;
  transferAmountHint:         string;
  noteLabel:                  string;
  transferSubmit:             string;
  transferSuccess:            string;
  withdrawModalTitle:         string;
  withdrawAmountLabel:        string;
  withdrawMaxHint:            string;
  withdrawBankLabel:          string;
  withdrawBankPlaceholder:    string;
  withdrawAccountNameLabel:   string;
  withdrawAccountNumberLabel: string;
  withdrawSubmit:             string;
  withdrawSuccess:            string;
  cancel:                     string;
  close:                      string;
  submitting:                 string;
  amountInvalid:              string;
  amountExceedsAvailable:     string;
  genericError:               string;
};

type Props = {
  /** Shop-wallet available balance — for the withdraw cap. */
  available:     number;
  /** Personal-wallet main bucket available — for the transfer cap.
   *  In the foundation this is best-effort UX; the server is the
   *  source of truth. */
  mainAvailable: number;
  t:             Strings;
};

export function ShopWalletActions({ available, mainAvailable, t }: Props) {
  const [open, setOpen] = useState<null | "transfer" | "withdraw">(null);
  const close = () => setOpen(null);

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className="rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 active:scale-95 transition"
        onClick={() => setOpen("transfer")}
      >
        {t.transferFromPersonal}
      </button>
      <button
        type="button"
        className="rounded-xl border-2 border-primary-600 px-4 py-2.5 text-sm font-semibold text-primary-700 hover:bg-primary-50 active:scale-95 transition"
        onClick={() => setOpen("withdraw")}
      >
        {t.requestWithdraw}
      </button>

      {open === "transfer" && (
        <Modal onClose={close} title={t.transferModalTitle}>
          <TransferForm
            mainAvailable={mainAvailable}
            t={t}
            onDone={close}
          />
        </Modal>
      )}

      {open === "withdraw" && (
        <Modal onClose={close} title={t.withdrawModalTitle}>
          <WithdrawForm
            available={available}
            t={t}
            onDone={close}
          />
        </Modal>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Modal shell — mobile-first, Tailwind only, ESC + click-outside close.
// ────────────────────────────────────────────────────────────
function Modal({
  title,
  children,
  onClose,
}: {
  title:    string;
  children: React.ReactNode;
  onClose:  () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-white dark:bg-surface shadow-2xl border border-border max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-surface border-b border-border px-5 py-3 flex items-center justify-between">
          <h3 className="font-bold text-base">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 hover:bg-gray-100 dark:hover:bg-surface-alt text-muted"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Transfer form
// ────────────────────────────────────────────────────────────
function TransferForm({
  mainAvailable,
  t,
  onDone,
}: {
  mainAvailable: number;
  t:             Strings;
  onDone:        () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [amount,  setAmount]  = useState<string>("");
  const [note,    setNote]    = useState<string>("");
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const amtId = useId();
  const noteId = useId();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError(t.amountInvalid);
      return;
    }
    // Client-side cap — best-effort, server re-checks against the live
    // personal-wallet balance. Skip when the hint is missing/non-positive
    // (e.g. SC couldn't read the bucket).
    if (mainAvailable > 0 && amt > mainAvailable) {
      setError(t.amountExceedsAvailable);
      return;
    }
    startTransition(async () => {
      const res = await transferFromPersonalToShopWallet({
        amount: amt,
        note:   note.trim() || undefined,
      });
      if (!res.ok) {
        setError(res.error || t.genericError);
        return;
      }
      setSuccess(t.transferSuccess);
      router.refresh();
      // brief delay so the user sees the success banner before close
      setTimeout(onDone, 1200);
    });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div>
        <label htmlFor={amtId} className="block text-sm font-medium mb-1">
          {t.transferAmountLabel}
        </label>
        <input
          id={amtId}
          name="amount"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0.01"
          max="1000000"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-right font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="0.00"
          disabled={pending}
        />
        <p className="mt-1 text-xs text-muted">{t.transferAmountHint}</p>
      </div>
      <div>
        <label htmlFor={noteId} className="block text-sm font-medium mb-1">
          {t.noteLabel}
        </label>
        <input
          id={noteId}
          name="note"
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
          maxLength={500}
          disabled={pending}
        />
      </div>

      <FormFeedback error={error} success={success} />

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-alt"
          disabled={pending}
        >
          {t.cancel}
        </button>
        <button
          type="submit"
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          disabled={pending}
        >
          {pending ? t.submitting : t.transferSubmit}
        </button>
      </div>
    </form>
  );
}

// ────────────────────────────────────────────────────────────
// Withdraw form
// ────────────────────────────────────────────────────────────
function WithdrawForm({
  available,
  t,
  onDone,
}: {
  available: number;
  t:         Strings;
  onDone:    () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [amount,  setAmount]   = useState<string>("");
  const [bank,    setBank]     = useState<string>("");
  const [name,    setName]     = useState<string>("");
  const [number_, setNumber]   = useState<string>("");
  const [note,    setNote]     = useState<string>("");
  const [error,   setError]    = useState<string | null>(null);
  const [success, setSuccess]  = useState<string | null>(null);
  const amtId = useId();
  const noteId = useId();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError(t.amountInvalid);
      return;
    }
    if (amt > available) {
      setError(t.amountExceedsAvailable);
      return;
    }
    startTransition(async () => {
      const res = await requestShopWalletWithdraw({
        amount:         amt,
        bank_name:      bank.trim(),
        account_name:   name.trim(),
        account_number: number_.trim(),
        note:           note.trim() || undefined,
      });
      if (!res.ok) {
        setError(res.error || t.genericError);
        return;
      }
      setSuccess(t.withdrawSuccess);
      router.refresh();
      setTimeout(onDone, 1200);
    });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div>
        <label htmlFor={amtId} className="block text-sm font-medium mb-1">
          {t.withdrawAmountLabel}
        </label>
        <input
          id={amtId}
          name="amount"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0.01"
          max={Math.max(0.01, available)}
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-right font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="0.00"
          disabled={pending}
        />
        <p className="mt-1 text-xs text-muted">{t.withdrawMaxHint}</p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t.withdrawBankLabel}</label>
        <input
          type="text"
          required
          value={bank}
          onChange={(e) => setBank(e.target.value)}
          className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder={t.withdrawBankPlaceholder}
          maxLength={100}
          disabled={pending}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t.withdrawAccountNameLabel}</label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
          maxLength={200}
          disabled={pending}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t.withdrawAccountNumberLabel}</label>
        <input
          type="text"
          required
          value={number_}
          onChange={(e) => setNumber(e.target.value)}
          className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
          pattern="[\d\-]{8,20}"
          maxLength={20}
          disabled={pending}
        />
      </div>

      <div>
        <label htmlFor={noteId} className="block text-sm font-medium mb-1">
          {t.noteLabel}
        </label>
        <input
          id={noteId}
          name="note"
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
          maxLength={500}
          disabled={pending}
        />
      </div>

      <FormFeedback error={error} success={success} />

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-alt"
          disabled={pending}
        >
          {t.cancel}
        </button>
        <button
          type="submit"
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          disabled={pending}
        >
          {pending ? t.submitting : t.withdrawSubmit}
        </button>
      </div>
    </form>
  );
}

function FormFeedback({ error, success }: { error: string | null; success: string | null }) {
  if (error) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {error}
      </div>
    );
  }
  if (success) {
    return (
      <div role="status" className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
        {success}
      </div>
    );
  }
  return null;
}
