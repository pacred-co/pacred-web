"use client";

/**
 * ShopOrderPayButton + modal — ADR-0028. The customer pays a ฝากสั่งซื้อ order
 * by company QR + slip (one flow), mirroring the forwarder pay-modal.
 *
 * 2026-06-21 (owner: "ถอดกระเป๋าออกทุกจุด") — the wallet is fully removed from the
 * pay loop: NO wallet-discount, NO pay-from-wallet. Every payment = see amount +
 * QR → attach slip → accounting verifies → ตัดจ่าย (slip type='8', wallet delta 0).
 * `walletBalance` is kept as an optional (ignored) prop so existing call-sites don't
 * break; it is no longer used.
 */

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { QrCode, UploadCloud, CheckCircle2, Loader2, X } from "lucide-react";
import { confirm } from "@/components/ui/confirm";
import { getForwarderPaymentQr } from "@/actions/forwarder";
import {
  uploadShopOrderSlip,
  submitShopOrderSlipPayment,
} from "@/actions/service-order";

const fmt = (n: number) =>
  n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ShopOrderPayButton({
  hNo,
  totalThb,
}: {
  hNo: string;
  totalThb: number;
  /** @deprecated wallet removed 2026-06-21 — kept optional so call-sites don't break. */
  walletBalance?: number | null;
}) {
  const t = useTranslations("shopOrderPayModal");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<{ dataUrl: string; promptPayId: string } | null>(null);
  const [qrErr, setQrErr] = useState<string | null>(null);
  const [slipPath, setSlipPath] = useState<string | null>(null);
  const [slipName, setSlipName] = useState<string>("");
  const [slipDate, setSlipDate] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Fetch the company QR for the FULL bill (wallet removed → no remainder math).
  useEffect(() => {
    if (!open) return;
    if (qr) return;
    let alive = true;
    (async () => {
      const r = await getForwarderPaymentQr(totalThb);
      if (!alive) return;
      if (r.ok && r.data) {
        setQr({ dataUrl: r.data.dataUrl, promptPayId: r.data.promptPayId });
        setQrErr(null);
      } else setQrErr(t("qrError"));
    })();
    return () => {
      alive = false;
    };
  }, [open, totalThb, qr, t]);

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
    // §0f — confirm before the irreversible submit (sends the slip for review).
    if (!(await confirm(t("submitPaymentConfirm", { hNo })))) return;
    setErr(null);
    setSubmitting(true);
    const r = await submitShopOrderSlipPayment(hNo, {
      slipPath,
      slipDate: slipDate || undefined,
    });
    setSubmitting(false);
    if (r.ok) {
      setDone(true);
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
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white dark:bg-gray-900 p-5 shadow-lg">
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

                {/* Company QR — customer scans + types the amount themselves. Swap
                    point for an amount-encoded QR is centralized in lib/promptpay.ts. */}
                <div className="mt-4 flex flex-col items-center">
                  <p className="mb-1 text-[13px] text-gray-500">{t("scanToPay", { amount: fmt(totalThb) })}</p>
                  {qr ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qr.dataUrl} alt="QR ชำระเงิน" className="h-48 w-48 rounded-xl border border-gray-200" />
                      <p className="mt-2 text-[13px] text-gray-500">บัญชี: <span className="font-semibold text-gray-700 dark:text-gray-200">{qr.promptPayId}</span></p>
                    </>
                  ) : qrErr ? (
                    <p className="text-[13px] text-amber-600">{qrErr}</p>
                  ) : (
                    <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
                  )}
                  <div className="mt-3 w-full rounded-2xl bg-gray-50 dark:bg-gray-800 px-4 py-3 text-center">
                    <p className="text-[14px] font-semibold text-gray-800 dark:text-gray-100">บัญชี: 225-2-91144-0</p>
                    <p className="mt-0.5 text-[13px] text-gray-600 dark:text-gray-300">บจก. แพคเรด (ประเทศไทย) · ธนาคารกสิกรไทย</p>
                  </div>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-gray-500 text-center">
                    สแกน QR แล้วกรอกจำนวนเงินที่ต้องชำระเอง → โอนแล้วแนบสลิป (ทีมงานตรวจสอบ)
                  </p>
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
                  {t("confirmPayment")}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
