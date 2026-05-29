"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { createYuanPayment } from "@/actions/payment";
import { uploadSlip } from "@/lib/storage-upload";
import { Wallet as WalletIcon, Plus } from "lucide-react";
import { trackPlaceOrder } from "@/lib/analytics";

const inputCls = "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

type Props = {
  rate: number;
  rateUpdatedAt: string;
  walletBalance: number;
  customerName?: string;
};

export function YuanPaymentForm({ rate, rateUpdatedAt, walletBalance, customerName }: Props) {
  const t = useTranslations("payment");
  const router = useRouter();
  const [channel, setChannel] = useState<"alipay" | "wechat" | "bank">("alipay");
  const [recipientDetail, setRecipientDetail] = useState("");
  const [yuan, setYuan] = useState("");
  const [paidViaWallet, setPaidViaWallet] = useState(false);
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
            <p className="text-sm font-semibold opacity-90">{customerName || "ลูกค้า Pacred"}</p>
            <p className="text-xs opacity-80 mt-0.5">กระเป๋าสตางค์ (บาท)</p>
            <p className="font-mono text-4xl sm:text-5xl font-black mt-1 leading-none">
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
            เรท: <b className="font-mono">1 ¥ = ฿{rate.toFixed(4)}</b>
            <span className="ml-2 opacity-70">(อัพเดท {new Date(rateUpdatedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })})</span>
          </p>
          <Link
            href="/wallet/deposit"
            className="inline-flex items-center gap-1 rounded-full bg-white text-amber-700 px-3 py-1 text-xs font-bold hover:bg-white/90"
          >
            <Plus className="w-3.5 h-3.5" /> เติมเงินเข้ากระเป๋า
          </Link>
        </div>
      </div>

      {/* Reference number strip */}
      <div className="text-right">
        <span className="text-[11px] text-muted">เลขฝากจ่าย:</span>{" "}
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
            1 หยวน = <b className="font-mono">{rate.toFixed(2)}</b> บาท
          </p>
          <div className="mt-1 flex items-baseline justify-end gap-2">
            <span className="text-xs text-muted">ยอดเงินที่ต้องชำระ:</span>
            <span className="font-mono text-3xl font-bold text-red-600">
              ฿{thb.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
            </span>
          </div>
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
        <button
          type="submit"
          disabled={pending || thb <= 0}
          className={`inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 text-white font-bold text-base px-6 py-3 shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:hover:shadow-lg ${thb > 0 && !pending ? "animate-pulse" : ""}`}
        >
          {pending ? "กำลังบันทึก..." : `✅ ยืนยันสั่งฝากชำระ${thb > 0 ? ` ฿${thb.toLocaleString("th-TH", { minimumFractionDigits: 2 })}` : ""}`}
        </button>
      </div>
    </form>
  );
}
