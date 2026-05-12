"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { createDeposit, getDepositQr } from "@/actions/wallet";
import { uploadSlip } from "@/lib/storage-upload";

const inputCls = "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

type Step = "amount" | "pay" | "done";

export function DepositForm() {
  const t = useTranslations("wallet");
  const router = useRouter();
  const [step, setStep] = useState<Step>("amount");
  const [amount, setAmount] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [slipPath, setSlipPath] = useState<string | null>(null);
  const [slipDate, setSlipDate] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onGenerateQr() {
    setError(null);
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError(t("amountInvalid"));
      return;
    }
    startTransition(async () => {
      const res = await getDepositQr(amt);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setQr(res.data!.dataUrl);
      setStep("pay");
    });
  }

  async function onSlipFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const res = await uploadSlip(file, "deposit");
    if (res.ok) {
      setSlipPath(res.path);
    } else {
      setError(res.error);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!slipPath) {
      setError(t("slipRequired"));
      return;
    }
    startTransition(async () => {
      const res = await createDeposit({
        amount:    Number(amount),
        slip_url:  slipPath,
        slip_date: slipDate || undefined,
        note:      note || undefined,
      });
      if (res.ok) {
        setStep("done");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  if (step === "done") {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center space-y-4">
        <h2 className="text-xl font-bold text-green-800">{t("depositSubmittedTitle")}</h2>
        <p className="text-sm text-green-700">{t("depositSubmittedSubtitle")}</p>
        <div className="flex justify-center gap-2">
          <Button type="button" variant="outline" onClick={() => router.push("/wallet/history")}>
            {t("viewHistory")}
          </Button>
          <Button type="button" onClick={() => { setStep("amount"); setAmount(""); setQr(null); setSlipPath(null); setSlipDate(""); setNote(""); }}>
            {t("depositAgain")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {step === "amount" && (
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-foreground">{t("step1Title")}</h2>
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t("amountLabel")}</span>
            <input
              type="number"
              min="1"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={inputCls}
              placeholder="0.00"
              autoFocus
            />
            <span className="block text-xs text-muted">{t("amountHint")}</span>
          </label>
          <div className="flex justify-end">
            <Button type="button" onClick={onGenerateQr} disabled={pending || !amount}>
              {pending ? t("generating") : t("generateQr")}
            </Button>
          </div>
        </div>
      )}

      {step === "pay" && qr && (
        <>
          <div className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">{t("step2Title")}</h2>
              <button
                type="button"
                onClick={() => { setStep("amount"); setQr(null); }}
                className="text-sm text-primary-500 hover:underline"
              >
                {t("changeAmount")}
              </button>
            </div>
            <p className="text-sm text-muted">{t("payInstruction", { amount })}</p>
            <div className="flex justify-center py-4">
              <div className="rounded-xl border border-border bg-white p-3">
                <Image src={qr} alt="PromptPay QR" width={256} height={256} unoptimized />
              </div>
            </div>
            <p className="text-center text-xs text-muted">{t("qrFooter")}</p>
          </div>

          <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-foreground">{t("step3Title")}</h2>

            <label className="block space-y-1">
              <span className="text-sm font-medium">{t("slipLabel")}<span className="text-red-600 ml-0.5">*</span></span>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={onSlipFile}
                className="block w-full text-sm"
              />
              {slipPath && <span className="block text-xs text-green-700">{t("slipUploaded")}</span>}
            </label>

            <label className="block space-y-1">
              <span className="text-sm font-medium">{t("slipDateLabel")}</span>
              <input
                type="datetime-local"
                value={slipDate}
                onChange={(e) => setSlipDate(e.target.value)}
                className={inputCls}
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm font-medium">{t("noteLabel")}</span>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className={inputCls}
              />
            </label>

            <div className="flex justify-end">
              <Button type="submit" disabled={pending || !slipPath}>
                {pending ? t("submitting") : t("submitDeposit")}
              </Button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
