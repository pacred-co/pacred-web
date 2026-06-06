"use client";

/**
 * ShopOrderPayButton + modal — ADR-0028. The customer pays a ฝากสั่งซื้อ order
 * by PromptPay QR + slip (one flow), mirroring the forwarder pay-modal. No
 * forced wallet top-up.
 *
 * Phase 2: the customer may apply some of their WALLET (cashback) balance as a
 * discount ("หักจาก wallet เท่าไหร่ก็ใส่") — the QR + slip then cover only the
 * remainder. The wallet is debited at submit and refunded if the slip is
 * rejected (see actions/service-order.ts + actions/admin/wallet-trans.ts).
 */

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { QrCode, UploadCloud, CheckCircle2, Loader2, X, Wallet } from "lucide-react";
import { getForwarderPaymentQr } from "@/actions/forwarder";
import {
  uploadShopOrderSlip,
  submitShopOrderSlipPayment,
  payServiceOrderFromWallet,
} from "@/actions/service-order";

const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) =>
  n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ShopOrderPayButton({
  hNo,
  totalThb,
  walletBalance,
}: {
  hNo: string;
  totalThb: number;
  walletBalance: number | null;
}) {
  const t = useTranslations("shopOrderPayModal");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<{ dataUrl: string; promptPayId: string } | null>(null);
  const [qrErr, setQrErr] = useState<string | null>(null);
  const [qrFor, setQrFor] = useState<number>(0);
  const [slipPath, setSlipPath] = useState<string | null>(null);
  const [slipName, setSlipName] = useState<string>("");
  const [slipDate, setSlipDate] = useState<string>("");
  const [walletApplied, setWalletApplied] = useState<number>(0);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const wallet = Math.max(0, walletBalance ?? 0);
  // clamp the applied amount to [0, min(wallet, bill)]
  const applied = round2(Math.min(Math.max(0, walletApplied), wallet, totalThb));
  const remaining = round2(totalThb - applied);
  const fullWallet = remaining <= 0; // wallet covers the whole bill → no slip needed

  // Fetch the PromptPay QR for the REMAINING amount (re-fetch when it changes).
  useEffect(() => {
    if (!open || fullWallet) return;
    if (qr && qrFor === remaining) return;
    let alive = true;
    (async () => {
      const r = await getForwarderPaymentQr(remaining);
      if (!alive) return;
      if (r.ok && r.data) {
        setQr({ dataUrl: r.data.dataUrl, promptPayId: r.data.promptPayId });
        setQrFor(remaining);
        setQrErr(null);
      } else setQrErr(t("qrError"));
    })();
    return () => {
      alive = false;
    };
  }, [open, remaining, fullWallet, qr, qrFor]);

  async function onSlipChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    setUploading(true);
    const fd = new FormData();
    fd.append("slip", file);
    const r = await uploadShopOrderSlip(fd);
    setUploading(false);
    if (r.ok && r.data) {
      setSlipPath(r.data.path);
      setSlipName(file.name);
    } else {
      setErr(r.ok ? t("uploadFailed") : r.error);
      setSlipPath(null);
      setSlipName("");
    }
  }

  async function onSubmit() {
    if (!slipPath) {
      setErr(t("attachSlipFirst"));
      return;
    }
    setErr(null);
    setSubmitting(true);
    const r = await submitShopOrderSlipPayment(hNo, {
      slipPath,
      slipDate: slipDate || undefined,
      walletApplied: applied > 0 ? applied : undefined,
    });
    setSubmitting(false);
    if (r.ok) {
      setDone(true);
      router.refresh();
    } else {
      setErr(r.error);
    }
  }

  async function onPayWallet() {
    setErr(null);
    setSubmitting(true);
    const r = await payServiceOrderFromWallet(hNo);
    setSubmitting(false);
    if (r.ok) {
      setOpen(false);
      router.refresh();
    } else {
      setErr(r.error);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-3 text-[15px] font-semibold text-white shadow-sm transition hover:bg-primary-700"
      >
        <QrCode className="h-5 w-5" />
        {t("payScanQr")}
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white dark:bg-gray-900 p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[17px] font-bold text-gray-900 dark:text-white">
                {t("modalTitle", { hNo })}
              </h2>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("close")} className="rounded-full p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="h-5 w-5" />
              </button>
            </div>

            {done ? (
              <div className="flex flex-col items-center py-6 text-center">
                <CheckCircle2 className="h-14 w-14 text-green-600" />
                <p className="mt-3 text-[16px] font-bold text-gray-900 dark:text-white">{t("slipSentTitle")} 🎉</p>
                <p className="mt-1.5 text-[14px] text-gray-500">{t("slipSentSubtitle")}</p>
                <button type="button" onClick={() => setOpen(false)} className="mt-5 w-full rounded-2xl bg-primary-600 px-4 py-3 text-[15px] font-semibold text-white">
                  {t("ok")}
                </button>
              </div>
            ) : (
              <>
                <div className="rounded-2xl bg-gray-50 dark:bg-gray-800 px-4 py-3 text-center">
                  <p className="text-[13px] text-gray-500">{t("amountDue")}</p>
                  <p className="text-[24px] font-bold text-primary-700 dark:text-primary-400">฿{fmt(totalThb)}</p>
                </div>

                {/* Wallet discount — "หักจาก wallet เท่าไหร่ก็ใส่" */}
                {wallet > 0 && (
                  <div className="mt-3 rounded-2xl border border-gray-200 dark:border-gray-700 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-[14px] font-medium text-gray-700 dark:text-gray-200">
                        <Wallet className="h-4 w-4 text-primary-600" /> {t("walletUse")}
                      </span>
                      <span className="text-[13px] text-gray-500">{t("walletHave", { amount: fmt(wallet) })}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={Math.min(wallet, totalThb)}
                        step="0.01"
                        value={walletApplied || ""}
                        placeholder="0.00"
                        onChange={(e) => setWalletApplied(Number(e.target.value) || 0)}
                        className="w-32 rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-[15px]"
                      />
                      <button type="button" onClick={() => setWalletApplied(round2(Math.min(wallet, totalThb)))} className="rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-2 text-[12.5px] font-medium text-gray-600 dark:text-gray-300">
                        {t("walletMax")}
                      </button>
                      {applied > 0 && (
                        <button type="button" onClick={() => setWalletApplied(0)} className="text-[12.5px] text-gray-400 hover:text-gray-600">{t("walletClear")}</button>
                      )}
                    </div>
                    <p className="mt-2 text-[13px] text-gray-500">
                      {t("walletDeducted", { applied: fmt(applied) })} · <span className="font-semibold text-primary-700 dark:text-primary-400">{t("remainingToPay", { remaining: fmt(remaining) })}</span>
                    </p>
                  </div>
                )}

                {fullWallet ? (
                  /* Wallet covers the whole bill → pay fully from wallet, no slip */
                  <button
                    type="button"
                    onClick={onPayWallet}
                    disabled={submitting}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-600 px-4 py-[14px] text-[15px] font-semibold text-white disabled:opacity-50"
                  >
                    {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Wallet className="h-5 w-5" />}
                    {t("payFullFromWallet", { amount: fmt(totalThb) })}
                  </button>
                ) : (
                  <>
                    {/* PromptPay QR for the remaining */}
                    <div className="mt-4 flex flex-col items-center">
                      <p className="mb-1 text-[13px] text-gray-500">{t("scanToPay", { amount: fmt(remaining) })}</p>
                      {qr ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={qr.dataUrl} alt="PromptPay QR" className="h-48 w-48 rounded-xl border border-gray-200" />
                          <p className="mt-2 text-[13px] text-gray-500">PromptPay: <span className="font-semibold text-gray-700 dark:text-gray-200">{qr.promptPayId}</span></p>
                        </>
                      ) : qrErr ? (
                        <p className="text-[13px] text-amber-600">{qrErr}</p>
                      ) : (
                        <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
                      )}
                    </div>

                    {/* Slip upload */}
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        disabled={uploading}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700 px-4 py-3 text-[14px] font-medium text-gray-600 dark:text-gray-300 hover:border-primary-400"
                      >
                        {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <UploadCloud className="h-5 w-5" />}
                        {slipPath ? t("slipAttached", { name: slipName }) : t("attachSlip")}
                      </button>
                      <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={onSlipChange} className="hidden" />
                    </div>

                    <div className="mt-3">
                      <label className="text-[13px] text-gray-500">{t("transferDateTime")}</label>
                      <input
                        type="datetime-local"
                        value={slipDate}
                        onChange={(e) => setSlipDate(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-[14px]"
                      />
                    </div>

                    {err && <p className="mt-3 text-[13px] text-red-600">{err}</p>}

                    <button
                      type="button"
                      onClick={onSubmit}
                      disabled={submitting || uploading || !slipPath}
                      className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-600 px-4 py-[14px] text-[15px] font-semibold text-white disabled:opacity-50"
                    >
                      {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                      {applied > 0 ? t("confirmPaymentSplit", { applied: fmt(applied), remaining: fmt(remaining) }) : t("confirmPayment")}
                    </button>
                  </>
                )}
                {err && fullWallet && <p className="mt-3 text-[13px] text-red-600">{err}</p>}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
