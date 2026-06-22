"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { customerCancelPendingWalletTx } from "@/actions/wallet";

/**
 * Customer self-cancel button for a pending deposit/withdraw row.
 *
 * Per gap-customer H-3: today a customer who typo'd an amount must call
 * admin to cancel. This 1-click button replaces that loop. The action
 * server-side double-checks ownership + status (race-guarded against
 * concurrent admin approval).
 */
export function CancelPendingButton({ txId, kind }: { txId: string; kind: string }) {
  const router = useRouter();
  const t = useTranslations("wallet");
  const [pending, startTransition] = useTransition();
  const [error, setError]   = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  function onClick() {
    setError(null);
    if (!confirm) {
      setConfirm(true);
      // Auto-clear confirm prompt after 6s if user doesn't follow through.
      setTimeout(() => setConfirm(false), 6000);
      return;
    }
    startTransition(async () => {
      const res = await customerCancelPendingWalletTx({ tx_id: txId });
      if (res.ok) {
        router.refresh();
      } else {
        setError(res.error);
        setConfirm(false);
      }
    });
  }

  const kindLabel = kind === "deposit" ? t("kind.deposit") : kind === "withdraw" ? t("kind.withdraw") : kind;

  return (
    <div className="mt-1 space-y-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={`text-[11px] rounded border px-2 py-0.5 transition ${
          confirm
            ? "border-red-500 bg-red-50 text-red-700 hover:bg-red-100"
            : "border-border bg-white text-muted hover:bg-surface-alt hover:text-foreground"
        } disabled:opacity-40`}
        title={confirm ? t("cancelConfirmHint") : t("cancelRowTitle", { kind: kindLabel })}
      >
        {pending ? "..." : confirm ? t("cancelConfirmBtn") : t("cancel")}
      </button>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
