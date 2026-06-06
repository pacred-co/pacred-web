"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { createDeposit, getDepositQr } from "@/actions/wallet";
import { uploadSlip } from "@/lib/storage-upload";
import { QrCode, Upload, CheckCircle2, RefreshCw } from "lucide-react";
import { trackWalletDeposit } from "@/lib/analytics";

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
        setError(QR_ERROR_MESSAGES[res.error] ?? t("qrFailedGeneric"));
        return;
      }
      setQr(res.data!.dataUrl);
      setStep("pay");
    });
  }

  const QR_ERROR_MESSAGES: Record<string, string> = {
    promptpay_not_configured: t("promptpayNotConfigured"),
    promptpay_invalid_amount: t("amountInvalid"),
    qr_failed: t("qrFailedGeneric"),
  };

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
        trackWalletDeposit(Number(amount));
        setStep("done");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  if (step === "done") {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-5 text-center space-y-3">
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

  const amt = Number(amount);

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Step indicator (PCS-style 3 dots) */}
      <div className="flex items-center justify-center gap-2 text-xs">
        <StepDot active={step === "amount"} done={step !== "amount"} num={1} label={t("stepEnterAmount")} />
        <span className={`h-0.5 w-8 ${step !== "amount" ? "bg-primary-500" : "bg-border"}`} />
        <StepDot active={step === "pay"} done={false} num={2} label={t("stepTransferAndSlip")} />
      </div>

      {step === "amount" && (
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary-500 text-white text-xs font-bold">1</span>
            {t("depositAmountHeading")}
          </h2>
          <label className="block space-y-1">
            <div className="relative">
              <input
                type="number"
                min="1"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={`${inputCls} text-lg font-mono font-bold pr-14 text-right`}
                placeholder="0.00"
                autoFocus
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-muted">฿</span>
            </div>
            <span className="block text-xs text-muted">{t("amountHint")}</span>
          </label>

          {/* Quick-fill chips */}
          <div className="flex flex-wrap gap-2">
            {[100, 500, 1000, 2000, 5000, 10000].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAmount(String(v))}
                className="rounded-full border border-border bg-surface-alt hover:bg-primary-50 hover:border-primary-300 hover:text-primary-700 text-xs font-mono font-bold px-3 py-1.5 transition-colors"
              >
                +฿{v.toLocaleString("th-TH")}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onGenerateQr}
            disabled={pending || !amount || amt <= 0}
            className={`w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 text-white font-bold text-sm px-5 py-2.5 shadow-sm hover:shadow-md transition-all disabled:opacity-50`}
          >
            <QrCode className="w-5 h-5" />
            {pending
              ? t("generatingQr")
              : amt > 0
                ? t("generateQrWithAmount", { amount: amt.toLocaleString("th-TH") })
                : t("generateQrPay")}
          </button>
        </div>
      )}

      {step === "pay" && qr && (
        <>
          {/* QR card */}
          <div className="rounded-2xl border-2 border-primary-200 bg-gradient-to-br from-primary-50/50 to-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary-500 text-white text-xs font-bold">2</span>
                {t("scanQrHeading")}
              </h2>
              <button
                type="button"
                onClick={() => { setStep("amount"); setQr(null); }}
                className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline"
              >
                <RefreshCw className="w-3 h-3" /> {t("editAmount")}
              </button>
            </div>

            <div className="rounded-xl bg-white border border-primary-100 p-4 text-center">
              <p className="text-xs text-muted">{t("destinationAccount")}</p>
              <p className="font-bold text-base">{t("companyName")}</p>
              <div className="my-4 inline-block rounded-xl border-2 border-primary-200 bg-white p-3 shadow-sm">
                <Image src={qr} alt="PromptPay QR" width={256} height={256} unoptimized />
              </div>
              <p className="text-xs text-muted">{t("amountToTransfer")}</p>
              <p className="font-mono text-lg font-bold text-red-600">฿{amt.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
              <p className="mt-2 text-[11px] text-muted">{t("qrFooter")}</p>
            </div>
          </div>

          {/* Slip upload form */}
          <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary-500 text-white text-xs font-bold">3</span>
              {t("attachProofHeading")}
            </h2>

            <label className="block">
              <span className="text-sm font-medium block mb-2">{t("transferSlipLabel")}<span className="text-red-600 ml-0.5">*</span></span>
              <div className={`relative rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
                slipPath
                  ? "border-emerald-300 bg-emerald-50/30"
                  : "border-border bg-surface-alt/30 hover:border-primary-300 hover:bg-primary-50/30"
              }`}>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={onSlipFile}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                {slipPath ? (
                  <div className="text-emerald-700">
                    <CheckCircle2 className="w-10 h-10 mx-auto" />
                    <p className="mt-2 font-bold text-sm">{t("slipUploadedCheck")}</p>
                    <p className="text-[11px] text-emerald-600 mt-1">{t("clickToChangeFile")}</p>
                  </div>
                ) : (
                  <div className="text-muted">
                    <Upload className="w-10 h-10 mx-auto" />
                    <p className="mt-2 font-bold text-sm text-foreground">{t("dragDropOrClick")}</p>
                    <p className="text-[11px] mt-1">{t("fileSupportHint")}</p>
                  </div>
                )}
              </div>
            </label>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-xs font-medium">{t("transferDateTime")}</span>
                <input
                  type="datetime-local"
                  value={slipDate}
                  onChange={(e) => setSlipDate(e.target.value)}
                  className={inputCls}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium">{t("noteOptional")}</span>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className={inputCls}
                  placeholder={t("notePlaceholder")}
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={pending || !slipPath}
              className={`w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-700 text-white font-bold text-sm px-5 py-2.5 shadow-sm hover:shadow-md transition-all disabled:opacity-50`}
            >
              {pending
                ? t("submitting")
                : t("confirmDepositWithAmount", { amount: amt.toLocaleString("th-TH", { minimumFractionDigits: 2 }) })}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

function StepDot({ num, label, active, done }: { num: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
        done    ? "bg-emerald-500 text-white" :
        active  ? "bg-primary-500 text-white" :
                  "bg-surface-alt text-muted"
      }`}>
        {done ? "✓" : num}
      </span>
      <span className={`${active || done ? "text-foreground font-medium" : "text-muted"}`}>{label}</span>
    </div>
  );
}
