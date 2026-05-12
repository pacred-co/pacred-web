"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { createYuanPayment } from "@/actions/payment";
import { uploadSlip } from "@/lib/storage-upload";

const inputCls = "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

type Props = {
  rate: number;
  rateUpdatedAt: string;
  walletBalance: number;
};

export function YuanPaymentForm({ rate, rateUpdatedAt, walletBalance }: Props) {
  const t = useTranslations("payment");
  const router = useRouter();
  const [channel, setChannel] = useState<"alipay" | "wechat" | "bank">("alipay");
  const [recipientDetail, setRecipientDetail] = useState("");
  const [yuan, setYuan] = useState("");
  const [paidViaWallet, setPaidViaWallet] = useState(false);
  const [slipPath, setSlipPath] = useState<string | null>(null);
  const [idDocPath, setIdDocPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; thb: number } | null>(null);
  const [pending, startTransition] = useTransition();

  const thb = useMemo(() => {
    const y = Number(yuan);
    if (!Number.isFinite(y) || y <= 0) return 0;
    return Math.round(y * rate * 100) / 100;
  }, [yuan, rate]);

  async function onSlipFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const res = await uploadSlip(file, "yuan_payment");
    if (res.ok) setSlipPath(res.path);
    else setError(res.error);
  }

  async function onIdDocFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const res = await uploadSlip(file, "id_doc");
    if (res.ok) setIdDocPath(res.path);
    else setError(res.error);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const y = Number(yuan);
    if (!Number.isFinite(y) || y <= 0) {
      setError(t("yuanInvalid"));
      return;
    }
    if (!paidViaWallet && !slipPath) {
      setError(t("slipRequired"));
      return;
    }
    if (paidViaWallet && thb > walletBalance) {
      setError(t("walletInsufficient"));
      return;
    }

    startTransition(async () => {
      const res = await createYuanPayment({
        channel,
        recipient_detail: recipientDetail,
        yuan_amount:      y,
        exchange_rate:    rate,
        paid_via_wallet:  paidViaWallet,
        slip_url:         slipPath ?? undefined,
        id_doc_url:       idDocPath ?? undefined,
      });
      if (res.ok && res.data) {
        setDone({ id: res.data.id, thb: res.data.thb_amount });
        router.refresh();
      } else if (!res.ok) {
        setError(res.error);
      }
    });
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center space-y-3">
        <h2 className="text-xl font-bold text-green-800">{t("submittedTitle")}</h2>
        <p className="text-sm text-green-700">
          {t("submittedSubtitle", { thb: done.thb.toLocaleString("th-TH", { minimumFractionDigits: 2 }) })}
        </p>
        <p className="text-xs text-green-700">ref: <span className="font-mono">{done.id.slice(0, 8)}</span></p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Rate banner */}
      <div className="rounded-2xl border border-primary-200 bg-primary-50/50 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-xs text-muted">{t("currentRate")}</p>
            <p className="text-2xl font-bold text-primary-700">
              1 CNY = ฿{rate.toFixed(4)}
            </p>
          </div>
          <p className="text-xs text-muted">
            {t("rateUpdatedAt", { date: new Date(rateUpdatedAt).toLocaleString("th-TH") })}
          </p>
        </div>
      </div>

      {/* Channel + recipient */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-bold text-foreground">{t("recipientSection")}</h2>
        <label className="block space-y-1">
          <span className="text-sm font-medium">{t("channelLabel")}<span className="text-red-600 ml-0.5">*</span></span>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as "alipay" | "wechat" | "bank")}
            className={inputCls}
          >
            <option value="alipay">Alipay (支付宝)</option>
            <option value="wechat">WeChat Pay (微信支付)</option>
            <option value="bank">{t("channelBank")}</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">{t("recipientDetailLabel")}<span className="text-red-600 ml-0.5">*</span></span>
          <textarea
            rows={4}
            value={recipientDetail}
            onChange={(e) => setRecipientDetail(e.target.value)}
            className={inputCls}
            placeholder={t("recipientDetailPlaceholder")}
            required
          />
          <span className="block text-xs text-muted">{t("recipientDetailHint")}</span>
        </label>
      </div>

      {/* Amount */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-bold text-foreground">{t("amountSection")}</h2>
        <label className="block space-y-1">
          <span className="text-sm font-medium">{t("yuanLabel")}<span className="text-red-600 ml-0.5">*</span></span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={yuan}
            onChange={(e) => setYuan(e.target.value)}
            className={inputCls}
            required
            placeholder="0.00"
          />
        </label>
        <div className="rounded-lg bg-surface-alt/50 p-3 text-center">
          <p className="text-xs text-muted">{t("thbEquivalent")}</p>
          <p className="text-2xl font-bold font-mono text-foreground">
            ฿{thb.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Payment method */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-bold text-foreground">{t("paymentSection")}</h2>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="radio"
            name="paymethod"
            checked={!paidViaWallet}
            onChange={() => setPaidViaWallet(false)}
            className="mt-1"
          />
          <div>
            <p className="font-medium">{t("paySlip")}</p>
            <p className="text-xs text-muted">{t("paySlipDesc")}</p>
          </div>
        </label>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="radio"
            name="paymethod"
            checked={paidViaWallet}
            onChange={() => setPaidViaWallet(true)}
            disabled={walletBalance < thb && thb > 0}
            className="mt-1"
          />
          <div>
            <p className="font-medium">{t("payWallet")}</p>
            <p className="text-xs text-muted">
              {t("payWalletDesc", { balance: walletBalance.toLocaleString("th-TH", { minimumFractionDigits: 2 }) })}
            </p>
          </div>
        </label>

        {!paidViaWallet && (
          <>
            <label className="block space-y-1">
              <span className="text-sm font-medium">{t("slipUploadLabel")}<span className="text-red-600 ml-0.5">*</span></span>
              <input type="file" accept="image/*,application/pdf" onChange={onSlipFile} className="block w-full text-sm" />
              {slipPath && <span className="block text-xs text-green-700">{t("slipUploaded")}</span>}
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">{t("idDocLabel")}</span>
              <input type="file" accept="image/*,application/pdf" onChange={onIdDocFile} className="block w-full text-sm" />
              <span className="block text-xs text-muted">{t("idDocHint")}</span>
              {idDocPath && <span className="block text-xs text-green-700">{t("idDocUploaded")}</span>}
            </label>
          </>
        )}
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || thb <= 0}>
          {pending ? t("submitting") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
