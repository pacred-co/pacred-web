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
import { resolvePaymentAccount, OUTPUT_VAT_RATE } from "@/lib/payment/bank-accounts";
import { modeFromPref } from "@/lib/tax/tax-doc-mode";
import { computeShopOrderTransferAmount } from "@/lib/service-order/payment-amount";
import { PayDestination } from "@/components/payment/pay-destination";
import { describeActionDispatchError } from "@/lib/observability/action-dispatch-error";
import { isNextControlFlowError } from "@/lib/observability/next-control-flow";
import { reportClientIncident } from "@/lib/observability/client-report";

const fmt = (n: number) =>
  n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ShopOrderPayButton({
  hNo,
  totalThb,
  taxDocPref,
}: {
  hNo: string;
  totalThb: number;
  /** tb_header_order.tax_doc_pref — 'tax_invoice' → TRADING (+VAT 7%); else
   *  SERVICE (ฝากสั่งซื้อ is goods value, not a domestic-delivery leg). DISPLAY
   *  ONLY: routes the shown destination, never the slip/record path. */
  taxDocPref?: string | null;
  /** @deprecated wallet removed 2026-06-21 — kept optional so call-sites don't break. */
  walletBalance?: number | null;
}) {
  const t = useTranslations("shopOrderPayModal");
  // 3-account SOT routing (lib/payment/bank-accounts.ts). ฝากสั่งซื้อ → not a
  // domestic-delivery leg; only a ใบกำกับ choice diverts to TRADING (+VAT 7%),
  // else SERVICE (PromptPay amount-QR for the exact total).
  const issuesTaxInvoice = modeFromPref(taxDocPref) === "tax_invoice";
  const account = resolvePaymentAccount({ issuesTaxInvoice });
  // TRADING lane charges the customer output VAT 7% on top of the bill; SERVICE
  // collects the base total. This VAT-inclusive amount is what's shown + QR-encoded.
  const payAmount = computeShopOrderTransferAmount(totalThb, taxDocPref);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // 🔴 stale-QR guard (คลาสเดียวกับที่ owner เจอใน ฝากโอนหยวน 2026-07-23): เก็บ QR
  // คู่กับ "ยอด (สตางค์)" ที่มันเข้ารหัสไว้ · โชว์เฉพาะเมื่อยอดตรงยอดปัจจุบัน → ถ้า
  // ยอดกลางเปลี่ยน (admin แก้ราคา) แล้วเปิด modal ใหม่โดยไม่ remount จะไม่โชว์ QR
  // ยอดเก่าให้ลูกค้าสแกนผิด (ระหว่างโหลดไม่โชว์ QR แทนที่จะโชว์ผิด).
  const payAmountSatang = Math.round(payAmount * 100);
  const [qr, setQr] = useState<{ amountSatang: number; dataUrl: string; promptPayId: string } | null>(null);
  const [qrErr, setQrErr] = useState<string | null>(null);
  const [slipPath, setSlipPath] = useState<string | null>(null);
  const [slipName, setSlipName] = useState<string>("");
  /** สลิปใบที่ 2+ — owner 2026-07-23: ลูกค้าโอนหลายครั้งให้ครบยอดใบเดียว (ทยอยโอน/ติดลิมิต
   *  ต่อครั้ง) แต่เดิมแนบได้ใบเดียว บัญชีเลยตรวจหลักฐานไม่ครบ. ใบหลักยังเป็น slipPath ตัวเดิม
   *  ไม่เปลี่ยนความหมาย · slip_paths (mig 0275) เก็บทุกใบ. */
  const [extraSlipPaths, setExtraSlipPaths] = useState<string[]>([]);
  const [slipDate, setSlipDate] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Fetch the company QR for the FULL bill (wallet removed → no remainder math).
  // Amount = VAT-inclusive when a tax invoice is chosen. getForwarderPaymentQr
  // returns the GENERATED SERVICE PromptPay amount-QR (exact total encoded).
  useEffect(() => {
    if (!open) return;
    // มี QR ที่ตรงยอดปัจจุบันแล้ว → ไม่ต้อง fetch ซ้ำ. ยอดเปลี่ยน (amountSatang ไม่ตรง)
    // → fetch ใหม่ (แทนที่จะค้าง QR ยอดเก่า).
    if (qr && qr.amountSatang === payAmountSatang) return;
    let alive = true;
    (async () => {
      const r = await getForwarderPaymentQr(payAmount);
      if (!alive) return;
      if (r.ok && r.data) {
        setQr({ amountSatang: payAmountSatang, dataUrl: r.data.dataUrl, promptPayId: r.data.promptPayId });
        setQrErr(null);
      } else setQrErr(t("qrError"));
    })();
    return () => {
      alive = false;
    };
  }, [open, payAmount, payAmountSatang, qr, t]);
  // โชว์ QR เฉพาะตัวที่เข้ารหัสยอดปัจจุบัน (กัน QR ยอดเก่าโผล่ระหว่างโหลดยอดใหม่).
  const qrToShow = qr && qr.amountSatang === payAmountSatang ? qr : null;

  async function onSlipChange(e: React.ChangeEvent<HTMLInputElement>) {
    // รองรับทั้งเลือกหลายไฟล์พร้อมกัน (multiple) และกด "แนบสลิปเพิ่ม" ทีละใบ.
    const files = Array.from(e.target.files ?? []);
    // เคลียร์ input เพื่อให้เลือกไฟล์ "ชื่อเดิม" ซ้ำได้ และแนบใบถัดไปได้ทันที
    e.target.value = "";
    if (files.length === 0) return;
    setErr(null);
    setUploading(true);
    // อ่านค่าปัจจุบันลง local (ปุ่มถูก disabled ระหว่างอัพ จึงไม่มีการเรียกซ้อน)
    let main = slipPath;
    let mainName = slipName;
    const extras = [...extraSlipPaths];
    for (const file of files) {
      // เพดาน 5 ใบ (ใบหลัก + 4)
      if (main && extras.length >= 4) break;
      const fd = new FormData();
      fd.append("slip", file);
      const r = await uploadShopOrderSlip(fd);
      if (r.ok && r.data) {
        const path = r.data.path;
        if (!main) {
          main = path;
          mainName = file.name;
        } else if (path !== main && !extras.includes(path)) {
          extras.push(path);
        }
      } else {
        setErr(r.ok ? t("uploadFailed") : r.error);
      }
    }
    setSlipPath(main);
    setSlipName(mainName);
    setExtraSlipPaths(extras);
    setUploading(false);
  }

  /** ถอดสลิปออกก่อนกดยืนยัน — ถอดใบหลักแล้วเลื่อนใบถัดไปขึ้นมาเป็นใบหลักแทน. */
  function removeSlip(path: string) {
    if (path === slipPath) {
      const [next, ...rest] = extraSlipPaths;
      setSlipPath(next ?? null);
      setSlipName(next ? (next.split("/").pop() ?? "") : "");
      setExtraSlipPaths(rest);
    } else {
      setExtraSlipPaths((cur) => cur.filter((p) => p !== path));
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
    // 🔴 คลาสเดียวกับ PR106 2026-07-27 ("กดยืนยันไม่ได้"): ไม่มี try/catch แล้ว
    // dispatch พัง = ปุ่มค้าง "กำลังส่ง" ตลอดกาล ไม่มีข้อความ ไม่มีใบใน incidents.
    // เงิน → ห้ามชวนกดซ้ำ (mutating:true).
    try {
      const r = await submitShopOrderSlipPayment(hNo, {
        slipPath,
        slipDate: slipDate || undefined,
        ...(extraSlipPaths.length > 0 ? { extraSlipPaths } : {}),
      });
      if (r.ok) {
        setDone(true);
        router.refresh();
      } else {
        setErr(r.error);
      }
    } catch (e) {
      if (isNextControlFlowError(e)) throw e;
      setErr(describeActionDispatchError(e, { mutating: true }));
      void reportClientIncident(e as Error);
    } finally {
      setSubmitting(false);
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
                  <p className="text-[24px] font-bold text-primary-700 dark:text-primary-400">฿{fmt(payAmount)}</p>
                  {issuesTaxInvoice && (
                    <p className="mt-0.5 text-[12px] text-gray-500">
                      รวม VAT {Math.round(OUTPUT_VAT_RATE * 100)}% (ฐาน ฿{fmt(totalThb)})
                    </p>
                  )}
                </div>

                {/* Company QR + the doc-mode-correct destination account. The
                    `getForwarderPaymentQr` QR is the SERVICE PromptPay QR, so it's
                    only passed into <PayDestination> for the SERVICE lane; the
                    LOGISTICS/TRADING lanes render their own static K-Shop PNG. The
                    account is resolved via the 3-account SOT (resolvePaymentAccount).
                    DISPLAY-ONLY — slip/record path unchanged. */}
                <div className="mt-4 flex flex-col items-center">
                  <p className="mb-1 text-[13px] text-gray-500">{t("scanToPay", { amount: fmt(payAmount) })}</p>
                  {!qrToShow && !qrErr && account.channel === "promptpay" && (
                    <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
                  )}
                  {qrErr && account.channel === "promptpay" && (
                    <p className="text-[13px] text-amber-600">{qrErr}</p>
                  )}
                  <PayDestination
                    account={account}
                    amountThb={payAmount}
                    serviceQrDataUrl={account.channel === "promptpay" ? qrToShow?.dataUrl ?? null : null}
                    className="mt-2 w-full"
                  />
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
                  <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple onChange={onSlipChange} className="hidden" />

                  {/* รายการสลิปที่แนบแล้ว + ปุ่มแนบเพิ่ม — owner 2026-07-23: โอนหลายครั้งต่อ
                      1 ใบเป็นเรื่องปกติ (ทยอยโอน/ติดลิมิตต่อครั้ง) → แนบได้สูงสุด 5 ใบ. */}
                  {slipPath && (
                    <div className="mt-2 space-y-2">
                      <ul className="space-y-1.5">
                        {[slipPath, ...extraSlipPaths].map((p, i) => (
                          <li
                            key={p}
                            className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2"
                          >
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-gray-700 dark:text-gray-200">
                              สลิปที่ {i + 1}
                              <span className="ml-1 font-normal text-gray-400">
                                · {p.split("/").pop()}
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={() => removeSlip(p)}
                              disabled={uploading}
                              className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              เอาออก
                            </button>
                          </li>
                        ))}
                      </ul>
                      {[slipPath, ...extraSlipPaths].length < 5 && (
                        <button
                          type="button"
                          onClick={() => fileRef.current?.click()}
                          disabled={uploading}
                          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-emerald-400 px-3 py-1.5 text-[12.5px] font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                        >
                          <UploadCloud className="h-4 w-4" />
                          แนบสลิปเพิ่ม (โอนหลายครั้ง)
                        </button>
                      )}
                      <p className="text-[11px] text-gray-400">
                        โอนหลายครั้งให้ครบยอดได้ — แนบให้ครบทุกใบ บัญชีจะได้ตรวจยอดรวมได้ (สูงสุด 5 ใบ)
                      </p>
                    </div>
                  )}
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
