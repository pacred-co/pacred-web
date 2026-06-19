"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createYuanPayment } from "@/actions/payment";
import { uploadSlip } from "@/lib/storage-upload";
import { Wallet as WalletIcon } from "lucide-react";
import { StyledFileInput } from "@/components/ui/styled-file-input";
import { trackPlaceOrder } from "@/lib/analytics";
import { CartTaxDocPref, type TaxDocDefaults } from "../cart/cart-tax-doc-pref";

const inputCls = "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

type Props = {
  rate: number;
  rateUpdatedAt: string;
  walletBalance: number;
  customerName?: string;
  /** GAP 3 (2026-06-12) — tax-doc picker defaults (juristic id/name/address).
   *  When present, the form shows <CartTaxDocPref> so the ฝากโอน captures the
   *  customer's ใบกำกับ/ใบขน/ไม่รับเอกสาร choice (persisted to tb_payment.tax_doc_*). */
  taxDocDefaults?: TaxDocDefaults;
};

export function YuanPaymentForm({ rate, rateUpdatedAt, walletBalance, customerName, taxDocDefaults }: Props) {
  const t = useTranslations("payment");
  const tp = useTranslations("yuanPaymentExtra");
  const router = useRouter();
  const [channel, setChannel] = useState<"alipay" | "wechat" | "bank">("alipay");
  const [recipientDetail, setRecipientDetail] = useState("");
  const [yuan, setYuan] = useState("");
  const [slipPath, setSlipPath] = useState<string | null>(null);
  const [idDocPath, setIdDocPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: number; thb: number } | null>(null);
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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const y = Number(yuan);
    if (!Number.isFinite(y) || y <= 0) {
      setError(t("yuanInvalid"));
      return;
    }
    // 2026-06-19 (owner) — ฝากโอนหยวน = DIRECT-CUT: slip only, no wallet. The
    // customer transfers to the company account + attaches the slip; accounting
    // verifies (2 layers) → ตัดจ่าย. A slip is therefore always required.
    if (!slipPath) {
      setError(t("slipRequired"));
      return;
    }

    // GAP 3 — read <CartTaxDocPref>'s hidden inputs synchronously (the form is a
    // controlled-payload form, not a FormData submit — currentTarget is nulled
    // once the async transition runs, so capture it now).
    const fd = new FormData(e.currentTarget);
    const taxDocPref        = (fd.get("taxDocPref") as string | null) ?? undefined;
    const taxDocTaxId       = (fd.get("taxDocTaxId") as string | null) ?? undefined;
    const taxDocBillingName = (fd.get("taxDocBillingName") as string | null) ?? undefined;
    const taxDocAddress     = (fd.get("taxDocAddress") as string | null) ?? undefined;

    startTransition(async () => {
      // DIRECT-CUT: always the slip-paid lane (actions/payment.ts) → writes
      // tb_payment (paystatus='1' รอตรวจ, paydeposit='0') with NO wallet
      // movement. Admin/accounting verifies the slip + settles (paystatus→'2').
      const payload = {
        channel,
        recipient_detail: recipientDetail,
        yuan_amount:      y,
        exchange_rate:    rate,
        paid_via_wallet:  false,
        slip_url:         slipPath ?? undefined,
        id_doc_url:       idDocPath ?? undefined,
        taxDocPref,
        taxDocTaxId,
        taxDocBillingName,
        taxDocAddress,
      };
      const res = await createYuanPayment(payload);
      if (res.ok && res.data) {
        trackPlaceOrder("service_payment", res.data.thb_amount);
        setDone({ id: res.data.id, thb: res.data.thb_amount });
        router.refresh();
      } else if (!res.ok) {
        setError(res.error);
      }
    });
  }

  // PCS-style reference number for display (ephemeral, only used in UI).
  // useState init runs once at mount — random call is fine here, unlike
  // an in-render expression. Must be declared BEFORE the early return below
  // so the hook order is stable.
  const [refNo] = useState(() => {
    const now = new Date();
    const d = `${now.getFullYear().toString().slice(-2)}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    return `YP${d}-${Math.floor(Math.random() * 9000) + 1000}`;
  });

  if (done) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center space-y-3">
        <h2 className="text-xl font-bold text-green-800">{t("submittedTitle")}</h2>
        <p className="text-sm text-green-700">
          {t("submittedSubtitle", { thb: done.thb.toLocaleString("th-TH", { minimumFractionDigits: 2 }) })}
        </p>
        <p className="text-xs text-green-700">ref: <span className="font-mono">#{done.id}</span></p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* ── Wallet balance hero (PCS-style orange/yellow gradient) ── */}
      <div className="rounded-2xl border-2 border-amber-300/40 bg-gradient-to-br from-amber-400 to-orange-500 text-white p-5 shadow-md overflow-hidden relative">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold opacity-90">{customerName || t("defaultCustomerName")}</p>
            <p className="text-xs opacity-80 mt-0.5">{t("walletLabelBaht")}</p>
            <p className="font-mono text-2xl sm:text-3xl font-black mt-1 leading-none">
              {walletBalance.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="shrink-0 opacity-70">
            <WalletIcon className="w-14 h-14" />
          </div>
        </div>
        <div className="mt-4 h-1.5 w-full rounded-full bg-white/20">
          <div className="h-full w-full rounded-full bg-white/80" />
        </div>
        <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
          <p className="text-[11px] opacity-80">
            {t("rateLabel")} <b className="font-mono">1 ¥ = ฿{rate.toFixed(4)}</b>
            <span className="ml-2 opacity-70">{t("rateUpdatedTime", { time: new Date(rateUpdatedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) })}</span>
          </p>
          {/* 2026-06-19 (owner) — "เติมเงิน" (wallet top-up) removed platform-wide.
              ฝากโอนหยวน pays by slip directly (DIRECT-CUT), no wallet needed. */}
        </div>
      </div>

      {/* Reference number strip */}
      <div className="text-right">
        <span className="text-[11px] text-muted">{t("refNoLabel")}</span>{" "}
        <b className="font-mono text-red-600 text-sm">{refNo}</b>
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
          <div className="relative">
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={yuan}
              onChange={(e) => setYuan(e.target.value)}
              className={`${inputCls} text-2xl font-mono font-bold pr-12`}
              required
              placeholder="0.00"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xl font-bold text-muted">¥</span>
          </div>
        </label>

        {/* Live math display (PCS-style: "1 หยวน = X.XX บาท / ยอดเงินที่ต้องชำระ: Y.YY บาท") */}
        <div className="rounded-xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-4">
          <p className="text-right text-xs text-red-700">
            {t("oneYuanEquals")} <b className="font-mono">{rate.toFixed(2)}</b> {t("bahtUnit")}
          </p>
          <div className="mt-1 flex items-baseline justify-end gap-2">
            <span className="text-xs text-muted">{t("amountDue")}</span>
            <span className="font-mono text-3xl font-bold text-red-600">
              ฿{thb.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      {/* GAP 3 (2026-06-12) — tax-document choice for this ฝากโอน (ใบกำกับ / ใบขน
          / ไม่รับเอกสาร). Reuses <CartTaxDocPref> (same input names) → persists to
          tb_payment.tax_doc_* on submit. defaultMode="none" so a juristic customer
          is never hard-blocked from paying by incomplete billing (opt-in). */}
      {taxDocDefaults && <CartTaxDocPref defaults={taxDocDefaults} defaultMode="none" />}

      {/* Payment — slip only (2026-06-19 owner: ฝากโอนหยวน = DIRECT-CUT, no
          wallet. The customer transfers to the company account + attaches the
          slip; accounting verifies (2 layers) → ตัดจ่าย). */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-bold text-foreground">{t("paymentSection")}</h2>
        {/* Bank-account block — owner 2026-06-08: customers transfer to the
            company account, type the amount, attach slip (staff verify). No
            dynamic/amount-encoded PromptPay. */}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-1">
          <p className="text-sm font-bold text-foreground">โอนเข้าบัญชีบริษัท</p>
          <p className="text-sm text-foreground">
            บัญชี: <b className="font-mono">225-2-91144-0</b> · บจก. แพคเรด (ประเทศไทย) · ธนาคารกสิกรไทย
          </p>
          <p className="text-xs text-muted">
            โอนยอด <b>฿{thb.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</b> เข้าบัญชีด้านบน แล้วแนบสลิป (ทีมงานตรวจสอบ)
          </p>
        </div>
        <div className="space-y-1">
          <span className="text-sm font-medium">{t("slipUploadLabel")}<span className="text-red-600 ml-0.5">*</span></span>
          <StyledFileInput
            accept="image/*,application/pdf"
            onChange={onSlipFile}
            label={tp("slipAttachLabel")}
            selectedLabel={slipPath ? t("slipUploaded") : undefined}
          />
        </div>
        <div className="space-y-1">
          <span className="text-sm font-medium">{t("idDocLabel")}</span>
          <StyledFileInput
            accept="image/*,application/pdf"
            onChange={onIdDocFile}
            label={tp("idCardAttachLabel")}
            hint={t("idDocHint")}
            selectedLabel={idDocPath ? t("idDocUploaded") : undefined}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending || thb <= 0}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 text-white font-bold text-sm px-5 py-2.5 shadow-sm hover:shadow-md transition-all disabled:opacity-50"
        >
          {pending
            ? t("saving")
            : thb > 0
              ? `✅ ${t("confirmPaymentWithAmount", { amount: thb.toLocaleString("th-TH", { minimumFractionDigits: 2 }) })}`
              : `✅ ${t("confirmPayment")}`}
        </button>
      </div>
    </form>
  );
}
