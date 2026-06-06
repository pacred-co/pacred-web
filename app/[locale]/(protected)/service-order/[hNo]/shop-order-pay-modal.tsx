"use client";

/**
 * ShopOrderPayButton + modal — ADR-0028. The customer pays a ฝากสั่งซื้อ order
 * by PromptPay QR + slip (one flow), mirroring the forwarder pay-modal. No
 * forced wallet top-up. Submitting records a PENDING tb_wallet_hs row (an admin
 * verifies the slip, then the order flips to paid).
 *
 * Wallet instant-pay is kept as a SECONDARY option only when the balance already
 * covers the bill ("ถ้ายอดถึง") — the wallet is otherwise a cashback store.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { QrCode, UploadCloud, CheckCircle2, Loader2, X, Wallet } from "lucide-react";
import { getForwarderPaymentQr } from "@/actions/forwarder";
import {
  uploadShopOrderSlip,
  submitShopOrderSlipPayment,
  payServiceOrderFromWallet,
} from "@/actions/service-order";

export function ShopOrderPayButton({
  hNo,
  totalThb,
  walletBalance,
}: {
  hNo: string;
  totalThb: number;
  walletBalance: number | null;
}) {
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

  const walletEnough =
    walletBalance !== null && walletBalance + 0.01 >= totalThb;

  // Fetch the PromptPay QR when the modal opens.
  useEffect(() => {
    if (!open || qr) return;
    let alive = true;
    (async () => {
      const r = await getForwarderPaymentQr(totalThb);
      if (!alive) return;
      if (r.ok && r.data) setQr({ dataUrl: r.data.dataUrl, promptPayId: r.data.promptPayId });
      else setQrErr("ไม่สามารถสร้าง QR ได้ — โอนตามเลขบัญชีแล้วแนบสลิปได้เลย");
    })();
    return () => {
      alive = false;
    };
  }, [open, qr, totalThb]);

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
      setErr(r.ok ? "อัปโหลดสลิปไม่สำเร็จ" : r.error);
      setSlipPath(null);
      setSlipName("");
    }
  }

  async function onSubmit() {
    if (!slipPath) {
      setErr("กรุณาแนบสลิปก่อนยืนยัน");
      return;
    }
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

  const fmt = (n: number) =>
    n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-3 text-[15px] font-semibold text-white shadow-sm transition hover:bg-primary-700"
      >
        <QrCode className="h-5 w-5" />
        ชำระเงิน — สแกน QR + แนบสลิป
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white dark:bg-gray-900 p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[17px] font-bold text-gray-900 dark:text-white">
                ชำระเงินฝากสั่งซื้อ #{hNo}
              </h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="ปิด" className="rounded-full p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="h-5 w-5" />
              </button>
            </div>

            {done ? (
              <div className="flex flex-col items-center py-6 text-center">
                <CheckCircle2 className="h-14 w-14 text-green-600" />
                <p className="mt-3 text-[16px] font-bold text-gray-900 dark:text-white">ส่งสลิปเรียบร้อย 🎉</p>
                <p className="mt-1.5 text-[14px] text-gray-500">ทีมงานกำลังตรวจสอบสลิป — ออเดอร์จะอัปเดตเป็น &quot;ชำระแล้ว&quot; หลังตรวจสอบ</p>
                <button type="button" onClick={() => setOpen(false)} className="mt-5 w-full rounded-2xl bg-primary-600 px-4 py-3 text-[15px] font-semibold text-white">
                  ตกลง
                </button>
              </div>
            ) : (
              <>
                <div className="rounded-2xl bg-gray-50 dark:bg-gray-800 px-4 py-3 text-center">
                  <p className="text-[13px] text-gray-500">ยอดที่ต้องชำระ</p>
                  <p className="text-[24px] font-bold text-primary-700 dark:text-primary-400">฿{fmt(totalThb)}</p>
                </div>

                {/* PromptPay QR */}
                <div className="mt-4 flex flex-col items-center">
                  {qr ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qr.dataUrl} alt="PromptPay QR" className="h-52 w-52 rounded-xl border border-gray-200" />
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
                    {slipPath ? `แนบแล้ว: ${slipName}` : "แนบสลิปการโอน (รูป/PDF)"}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={onSlipChange} className="hidden" />
                </div>

                {/* Slip date (optional) */}
                <div className="mt-3">
                  <label className="text-[13px] text-gray-500">วันเวลาที่โอน (ถ้ามี)</label>
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
                  ยืนยันการชำระเงิน
                </button>

                {/* Secondary: pay from wallet only if the balance already covers it */}
                {walletEnough && (
                  <button
                    type="button"
                    onClick={onPayWallet}
                    disabled={submitting}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 dark:border-gray-700 px-4 py-3 text-[14px] font-medium text-gray-700 dark:text-gray-200 disabled:opacity-50"
                  >
                    <Wallet className="h-4 w-4" />
                    หรือชำระจากกระเป๋าเงิน (฿{fmt(walletBalance!)})
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
