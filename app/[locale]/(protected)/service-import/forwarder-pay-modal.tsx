"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Upload } from "lucide-react";
import {
  calculateForwarderTotal,
  getForwarderPaymentQr,
  submitForwarderPayment,
  uploadForwarderSlip,
} from "@/actions/forwarder";
import { confirm } from "@/components/ui/confirm";
import type { ForwarderRow } from "./forwarder-row-view";
import { serviceAccountFor } from "@/lib/services/service-catalog";
import { modeFromPref } from "@/lib/tax/tax-doc-mode";
import { PayDestination } from "@/components/payment/pay-destination";

/**
 * `#list-payment2` — the multi-bill forwarder payment modal. Tailwind
 * rebuild (เดฟ 2026-05-27 — ปอน: "rebuild css เป็น tailwind ให้หน่อย
 * แต่ฟังก์ชั่น relation ต้องกดเหมือนเดิม"). Was a faithful 1:1 of the
 * legacy `member/include/pages/index/getListPayForwarder.php` Bootstrap-4
 * modal; now rendered as a clean React-controlled dialog with Tailwind
 * styling.
 *
 * Contract preserved (NO relations / Server Actions / state-hooks
 * changed):
 *   · id="list-payment2" kept on the dialog (legacy targeting).
 *   · `name="imagesSlip"` kept on the slip <input> (legacy form contract).
 *   · QR pull (`getForwarderPaymentQr`), slip upload (`uploadForwarderSlip`),
 *     submit (`submitForwarderPayment`) Server Actions unchanged.
 *   · `useEffect` QR fetch on amount change unchanged.
 *   · `window.confirm` gate before submit unchanged (legacy `confirm()`
 *     guard in getListPayForwarder.php L450).
 *   · `router.refresh()` after success unchanged (re-renders the list).
 *
 * Modal is React-controlled (NOT Bootstrap data-toggle) — `open` /
 * `onClose` from the parent <ForwarderInteractivity>. Backdrop click
 * + close button + cancel button + ESC all close the dialog.
 */

// PHP `number_format($n, 2)` — 2 decimals, comma thousands separator.
function numberFormat2(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// COD (paymethod='2') → the courier collects the Thai domestic leg (ftransportprice)
// at the door, so it is NOT part of the Pacred bill/QR. Every server surface
// (computeForwarderCollectTotal · submitForwarderPayment · outstanding ·
// computeForwarderDebitBatch · auto-issue-receipt) already drops it; the modal
// must match or the customer double-pays (QR upfront + courier at door).
function domesticLegOf(row: ForwarderRow): number {
  return Number(row.paymethod) === 2 ? 0 : row.ftransportprice;
}

// getListPayForwarder.php L116 — per-row total (before bill-level adjust).
function perRowTotal(row: ForwarderRow): number {
  return (
    row.ftotalprice +
    domesticLegOf(row) +
    row.fpriceupdate +
    row.fshippingservice +
    row.pricecrate +
    row.ftransportpricechnthb +
    row.priceother -
    row.fdiscount
  );
}

// All non-import, non-discount charges rolled into one "ค่าอื่นๆ" column
// (TH transport · price-adjust · shipping service · crate · CHN→TH transport ·
// other). `ftotalprice` (the import rate) and `fdiscount` get their own columns.
function otherCharges(row: ForwarderRow): number {
  return (
    domesticLegOf(row) +
    row.fpriceupdate +
    row.fshippingservice +
    row.pricecrate +
    row.ftransportpricechnthb +
    row.priceother
  );
}

// Product-type code → i18n key (forwarder.php nameProductsType: 1=ทั่วไป
// 2=มอก. 3=อย. 4=พิเศษ). Unknown/empty → null (no label shown).
function productTypeKey(v: string | null | undefined): string | null {
  switch (v) {
    case "1": return "productGeneral";
    case "2": return "productTisi";
    case "3": return "productFda";
    case "4": return "productSpecial";
    default:  return null;
  }
}

export type ForwarderPayModalProps = {
  /** Selected forwarder rows. */
  rows: ForwarderRow[];
  /** Whether the customer is a juristic account — drives the 1% WHT line. */
  isJuristic: boolean;
  /** Open/close — owned by <ForwarderInteractivity>. */
  open: boolean;
  onClose: () => void;
};

export function ForwarderPayModal({
  rows,
  open,
  onClose,
}: ForwarderPayModalProps) {
  const router = useRouter();
  const t = useTranslations("forwarderPayModal");

  const quoteRequestKey = useMemo(
    () => JSON.stringify(
      [...rows]
        .sort((a, b) => a.id - b.id)
        .map((row) => [
          row.id,
          row.paymethod,
          row.fshipby,
          row.ftotalprice,
          row.ftransportprice,
          row.fpriceupdate,
          row.fshippingservice,
          row.pricecrate,
          row.ftransportpricechnthb,
          row.priceother,
          row.fdiscount,
          row.ftrackingchn,
          row.fcabinetnumber,
          row.tax_doc_pref,
        ]),
    ),
    [rows],
  );

  const documentModes = useMemo(
    () => Array.from(new Set(rows.map((row) => modeFromPref(row.tax_doc_pref)))),
    [rows],
  );
  const taxDirectPayBlocked = documentModes.some((mode) => mode !== "none");

  type Quote = Extract<Awaited<ReturnType<typeof calculateForwarderTotal>>, { ok: true }>;
  const [quoteState, setQuoteState] = useState<{ key: string; quote: Quote } | null>(null);
  const [quoteErrorState, setQuoteErrorState] = useState<{ key: string; error: string } | null>(null);

  // The browser renders the exact server quote that submit + admin approval
  // replay. Keep the key beside the response so a stale promise can never show
  // the previous shipment's QR/amount while a new modal is opening.
  useEffect(() => {
    if (!open || rows.length === 0 || taxDirectPayBlocked) return;
    let cancelled = false;
    void calculateForwarderTotal({ ids: rows.map((row) => row.id) }).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setQuoteState({ key: quoteRequestKey, quote: res });
        setQuoteErrorState(null);
      } else {
        setQuoteErrorState({ key: quoteRequestKey, error: res.error });
      }
    });
    return () => { cancelled = true; };
  }, [open, quoteRequestKey, rows, taxDirectPayBlocked]);

  const serverQuote = quoteState?.key === quoteRequestKey ? quoteState.quote : null;
  const serverQuoteError = quoteErrorState?.key === quoteRequestKey ? quoteErrorState.error : null;
  const serverQuoteErrorMessage = serverQuoteError === "corporate_billing_profile_incomplete"
    || serverQuoteError === "billing_profile_incomplete"
    ? "ข้อมูลสำหรับออกเอกสารยังไม่ครบ (ชื่อ · เลขผู้เสียภาษีกรณีนิติบุคคล · ที่อยู่) กรุณาบันทึกข้อมูลก่อนชำระ"
    : serverQuoteError;
  const quoteLineById = useMemo(
    () => new Map((serverQuote?.lines ?? []).map((line) => [Number(line.id), line])),
    [serverQuote],
  );
  const bill = {
    totalPriceAll: serverQuote?.grossRaw ?? 0,
    totalNiTi: serverQuote?.whtRaw ?? 0,
    payAmount: serverQuote?.priceRaw ?? 0,
  };

  // ── pay-destination routing (service-catalog serviceAccountFor → 3-account SOT) ──
  // owner 2026-07-07 v2: a cargo-import (ฝากนำเข้าคาร์โก้) balance routes to the
  // LOGISTICS account (225-2-91144-0 · Thai-QR) — cargo import = งานขนส่งผ่านบริษัท
  // เฟรทเจ้าอื่น (freight + เหมาๆ + ค่าขนส่งในไทยรวมกัน). A ใบกำกับ choice on ANY selected
  // row overrides → TRADING (232-1-07669-9 · +VAT 7%). Resolved through
  // serviceAccountFor("import_cargo") so it follows the lane SOT. DISPLAY-ONLY — the
  // slip-upload + submitForwarderPayment path is untouched.
  const anyTaxInvoice = useMemo(
    () => rows.some((r) => modeFromPref(r.tax_doc_pref) === "tax_invoice"),
    [rows],
  );
  const payAccount = useMemo(
    () => serviceAccountFor("import_cargo", { issuesTaxInvoice: anyTaxInvoice }),
    [anyTaxInvoice],
  );

  // ── VAT — only the TRADING (ใบกำกับ) lane charges the customer output VAT 7%
  //    on top of the bill. SERVICE/LOGISTICS collect the base amount (no VAT
  //    line). This is the amount shown, QR-encoded, and hinted in <PayDestination>.
  const payAmountFinal = bill.payAmount;

  // ── PromptPay QR (SERVICE lane only — the account number now comes from the
  //    3-account SOT resolved in `payAccount`, not from the QR response). ──
  const [qrState, setQrState] = useState<{ amountSatang: number; dataUrl: string } | null>(null);
  const [qrErrorState, setQrErrorState] = useState<{ amountSatang: number; error: string } | null>(null);
  const payAmountSatang = Math.round(payAmountFinal * 100);
  const qrDataUrl = qrState?.amountSatang === payAmountSatang ? qrState.dataUrl : null;
  const qrError = qrErrorState?.amountSatang === payAmountSatang ? qrErrorState.error : null;

  useEffect(() => {
    if (payAmountFinal <= 0 || taxDirectPayBlocked) return;
    const requestedSatang = Math.round(payAmountFinal * 100);
    let cancelled = false;
    void getForwarderPaymentQr(payAmountFinal).then((res) => {
      if (cancelled) return;
      if (res.ok && res.data) {
        setQrState({ amountSatang: requestedSatang, dataUrl: res.data.dataUrl });
        setQrErrorState(null);
      } else {
        const code = res.ok ? null : res.error;
        setQrState(null);
        setQrErrorState({
          amountSatang: requestedSatang,
          error: code === "promptpay_not_configured"
            ? t("qrErrorNotConfigured")
            : t("qrErrorGeneric"),
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [payAmountFinal, taxDirectPayBlocked, t]);

  // ── slip upload ──
  const [slipPath, setSlipPath] = useState<string | null>(null);
  const [slipUploading, setSlipUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadSeq = useRef(0);

  const closeModal = useCallback(() => {
    // This component can stay mounted between openings (notably the detail
    // page). Never let a completed state or the previous physical slip leak
    // into the next payment attempt.
    uploadSeq.current += 1;
    setSlipPath(null);
    setSlipUploading(false);
    setError(null);
    setDone(false);
    setQuoteState(null);
    setQuoteErrorState(null);
    setQrState(null);
    setQrErrorState(null);
    if (fileRef.current) fileRef.current.value = "";
    onClose();
  }, [onClose]);

  function goToPendingPayments() {
    closeModal();
    router.push("/service-import/pending");
  }

  async function onSlipChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const seq = ++uploadSeq.current;
    setError(null);
    setSlipUploading(true);
    const fd = new FormData();
    fd.append("slip", file);
    const res = await uploadForwarderSlip(fd);
    if (seq !== uploadSeq.current) return;
    setSlipUploading(false);
    if (res.ok && res.data) {
      setSlipPath(res.data.path);
    } else {
      setSlipPath(null);
      setError(res.ok ? t("slipUploadFailed") : res.error);
    }
  }

  async function onConfirm() {
    if (rows.length === 0) return;
    if (taxDirectPayBlocked) {
      setError("รายการที่ขอใบกำกับภาษี/ใบขนยังไม่เปิดรับชำระตรง กรุณาติดต่อฝ่ายบัญชีเพื่อออกยอดเอกสารที่ถูกต้อง");
      return;
    }
    if (!serverQuote) {
      setError(serverQuoteErrorMessage ? `คำนวณยอดไม่สำเร็จ: ${serverQuoteErrorMessage}` : "กำลังคำนวณยอดจากระบบ กรุณารอสักครู่");
      return;
    }
    if (!slipPath) {
      setError(t("errorSlipRequired"));
      return;
    }
    const ok = await confirm(
      t("confirmBeforePay"),
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await submitForwarderPayment({
        ids: rows.map((r) => r.id),
        slipPath,
        quoteKey: serverQuote.quoteKey,
      });
      if (res.ok) {
        setDone(true);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  // ESC key close
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeModal();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closeModal]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop — backdrop click does NOT close (owner 2026-07-05) */}
      <div
        className="fixed inset-0 z-[1050] bg-black/50 backdrop-blur-sm animate-in fade-in"
        aria-hidden
      />
      {/* Dialog */}
      <div
        id="list-payment2"
        className="fixed inset-0 z-[1051] overflow-y-auto p-3 md:p-6 flex items-start md:items-center justify-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="list-payment2-title"
      >
        <div
          className="relative w-full max-w-3xl bg-white dark:bg-surface rounded-2xl shadow-2xl border border-border overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-surface-alt/40">
            <h4 id="list-payment2-title" className="text-base md:text-lg font-bold text-foreground">
              {t("title")}
            </h4>
            <button
              type="button"
              onClick={closeModal}
              aria-label={t("close")}
              className="shrink-0 inline-flex w-8 h-8 items-center justify-center rounded-full text-muted hover:bg-surface-alt hover:text-foreground transition-colors text-xl leading-none"
            >
              ×
            </button>
          </header>

          {/* Body */}
          <div className="px-4 py-4 max-h-[80vh] overflow-y-auto space-y-3">
            {done ? (
              // Success state
              <div className="py-6 text-center space-y-4">
                <div className="inline-flex w-14 h-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-3xl">
                  ✓
                </div>
                <h4 className="text-lg font-bold text-emerald-700">
                  {t("successTitle")}
                </h4>
                <p className="text-sm text-muted">
                  {t("successDesc", { count: rows.length })}
                </p>
                <ol className="mx-auto grid max-w-xl gap-2 text-left text-xs sm:grid-cols-3" aria-label="ขั้นตอนหลังแจ้งชำระ">
                  <li className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-900">
                    <span className="font-black">1 · ส่งหลักฐานแล้ว ✓</span>
                    <span className="mt-0.5 block">รวม {rows.length} งานไว้ในการจ่ายเดียว</span>
                  </li>
                  <li className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950">
                    <span className="font-black">2 · รอตรวจสลิป</span>
                    <span className="mt-0.5 block">ฝ่ายบัญชีตรวจยอดรวมทั้งกลุ่ม</span>
                  </li>
                  <li className="rounded-xl border border-border bg-surface-alt/40 px-3 py-2 text-muted">
                    <span className="font-black text-foreground">3 · รับใบเสร็จ</span>
                    <span className="mt-0.5 block">ออก 1 ใบ ครบทุกงานหลังอนุมัติ</span>
                  </li>
                </ol>
                <div className="flex flex-wrap justify-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={goToPendingPayments}
                    className="inline-flex items-center justify-center rounded-full bg-red-600 text-white px-5 py-2 text-sm font-bold hover:bg-red-700 active:scale-[0.98] transition-all"
                  >
                    ดูสถานะการตรวจสลิป →
                  </button>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="inline-flex items-center justify-center rounded-full border border-border bg-white px-5 py-2 text-sm font-bold text-foreground hover:bg-surface-alt dark:bg-surface"
                  >
                    {t("close")}
                  </button>
                </div>
              </div>
            ) : rows.length === 0 ? (
              <div className="py-8 text-center">
                <h4 className="text-lg font-bold text-red-600">
                  {t("emptyTitle")}
                </h4>
              </div>
            ) : (
              <>
                {/* Layout (ปอน 2026-06-08): items header → invoice table → red
                    grand-total bar → QR (moved down to sit under the total) →
                    slip upload. Shared modal — /service-import + /payment-due. */}

                {/* Header — "มี N รายการ" */}
                <div className="flex items-center justify-between">
                  <h5 className="text-sm md:text-base font-bold text-red-600">
                    {t("itemsToPay", { count: rows.length })}
                  </h5>
                </div>

                {/* Error message */}
                {error && (
                  <div className="rounded-lg bg-red-600 text-white px-3 py-2 text-sm">
                    {error}
                  </div>
                )}

                {taxDirectPayBlocked && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                    <p className="font-bold">ยังไม่เปิดรับชำระตรงสำหรับรายการที่ขอใบกำกับภาษี/ใบขน</p>
                    <p className="mt-1 text-xs leading-relaxed">
                      ระบบหยุดไว้ก่อนสร้าง QR เพราะยอด VAT/WHT และบัญชีรับเงินต้องตรงกับเอกสารทุกจุด · กรุณาติดต่อฝ่ายบัญชีให้ออกยอดเอกสารก่อนโอน
                    </p>
                  </div>
                )}

                {!taxDirectPayBlocked && !serverQuote && (
                  <div className={`rounded-lg border px-3 py-2 text-sm ${
                    serverQuoteError
                      ? "border-red-300 bg-red-50 text-red-800"
                      : "border-sky-200 bg-sky-50 text-sky-800"
                  }`}>
                    {serverQuoteErrorMessage
                      ? `คำนวณยอดจากระบบไม่สำเร็จ: ${serverQuoteErrorMessage}`
                      : "กำลังคำนวณยอดจริงจากระบบ… QR และปุ่มยืนยันจะเปิดเมื่อยอดพร้อม"}
                  </div>
                )}

                {/* Itemized invoice table — per-order detail breakdown. ONE
                    responsive table: abbreviated headers on mobile
                    (CTN/KG/CBM/Rate/Other/Disc/Price) so all columns stay as a
                    table, full Thai headers on desktop (ปอน 2026-06-09: "ในมือถือ
                    ให้เป็นตัวย่อจะได้แสดงเป็นตาราง"). Wrapped in overflow-x-auto +
                    min-width so very narrow phones scroll the money columns into
                    view rather than wrapping them. */}
                <div className="overflow-x-auto scrollbar-x-visible rounded-xl border border-border">
                  <div className="min-w-[460px]">
                    {/* Column header — abbreviated (mobile) / full (desktop) */}
                    <div className="grid grid-cols-[1.3fr_repeat(7,minmax(0,1fr))] items-center gap-x-1.5 bg-surface-alt/60 px-3 py-2 text-[11px] md:text-[11px] font-bold uppercase tracking-wide text-muted md:gap-x-2">
                      <span>{t("colOrderTrack")}</span>
                      <span className="text-right">
                        <span className="md:hidden">CTN</span>
                        <span className="hidden md:inline">{t("colBoxes")}</span>
                      </span>
                      <span className="text-right">
                        <span className="md:hidden">KG</span>
                        <span className="hidden md:inline">{t("colWeight")}</span>
                      </span>
                      <span className="text-right">
                        <span className="md:hidden">CBM</span>
                        <span className="hidden md:inline">{t("colVolume")}</span>
                      </span>
                      <span className="text-right">
                        <span className="md:hidden">Rate</span>
                        <span className="hidden md:inline">{t("colImportRate")}</span>
                      </span>
                      <span className="text-right">
                        <span className="md:hidden">Other</span>
                        <span className="hidden md:inline">{t("colOtherCharges")}</span>
                      </span>
                      <span className="text-right">
                        <span className="md:hidden">Disc</span>
                        <span className="hidden md:inline">{t("lineDiscount")}</span>
                      </span>
                      <span className="text-right">
                        <span className="md:hidden">Price</span>
                        <span className="hidden md:inline">{t("colServicePrice")}</span>
                      </span>
                    </div>
                    {rows.map((row) => {
                      const quoteLine = quoteLineById.get(row.id);
                      const rowTotal = quoteLine?.price ?? perRowTotal(row);
                      const other = quoteLine
                        ? quoteLine.otherCharges + quoteLine.maoFee
                        : otherCharges(row);
                      const ptKey = productTypeKey(row.fproductstype);
                      const ptLabel = ptKey ? t(ptKey) : null;
                      const trackingChn =
                        row.ftrackingchn2 && row.ftrackingchn2 !== ""
                          ? row.ftrackingchn2
                          : row.ftrackingchn;
                      return (
                        <div
                          key={row.id}
                          className={`grid grid-cols-[1.3fr_repeat(7,minmax(0,1fr))] items-center gap-x-1.5 border-t border-border px-3 py-2 md:gap-x-2 ${
                            row.fcredit === "1" ? "bg-red-50/50" : ""
                          }`}
                        >
                          {/* Order no. + tracking + product type */}
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="text-[12px] md:text-[13px] font-bold text-red-600 notranslate">
                                #{row.id}
                              </span>
                              {row.fcredit === "1" && (
                                <span className="inline-flex shrink-0 items-center rounded-full bg-red-100 text-red-700 text-[11px] font-bold px-1.5 py-0.5">
                                  {t("creditItem")}
                                </span>
                              )}
                              {ptLabel && (
                                <span className="inline-flex shrink-0 items-center rounded-full border border-border bg-surface-alt text-muted text-[11px] font-semibold px-1.5 py-0.5">
                                  {ptLabel}
                                </span>
                              )}
                            </div>
                            <div className="truncate font-mono text-[11px] text-muted md:text-[10.5px]">
                              {trackingChn}
                            </div>
                          </div>
                          {/* CTN — จำนวนกล่อง */}
                          <div className="text-right text-[11px] tabular-nums text-foreground/80 md:text-[11px]">
                            {row.famount > 0 ? row.famount : "—"}
                          </div>
                          {/* KG — น้ำหนัก */}
                          <div className="text-right text-[11px] tabular-nums text-foreground/80 md:text-[11px]">
                            {row.fweight > 0 ? numberFormat2(row.fweight) : "—"}
                          </div>
                          {/* CBM — ปริมาตรรวม */}
                          <div className="text-right text-[11px] tabular-nums text-foreground/80 md:text-[11px]">
                            {row.fvolume > 0 ? numberFormat2(row.fvolume) : "—"}
                          </div>
                          {/* Rate — เรทนำเข้า */}
                          <div className="text-right text-[11px] tabular-nums text-muted md:text-[11px]">
                            {row.ftotalprice > 0 ? numberFormat2(row.ftotalprice) : "—"}
                          </div>
                          {/* Other — ค่าอื่นๆ */}
                          <div className="text-right text-[11px] tabular-nums text-muted md:text-[11px]">
                            {other > 0 ? numberFormat2(other) : "—"}
                          </div>
                          {/* Disc — ส่วนลด */}
                          <div className="text-right text-[11px] tabular-nums text-muted md:text-[11px]">
                            {row.fdiscount > 0 ? `-${numberFormat2(row.fdiscount)}` : "—"}
                          </div>
                          {/* Price — ราคา (per-order net, sums to grand total) */}
                          <div className="text-right text-[11px] font-black tabular-nums text-red-600 md:text-[12px]">
                            {numberFormat2(rowTotal)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {!taxDirectPayBlocked && serverQuote && (
                  <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
                    <p className="font-black">ข้อมูลที่จะบันทึกลงใบเสร็จของกลุ่มนี้</p>
                    <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-[8rem_1fr]">
                      <dt className="font-semibold text-sky-700">ชื่อ</dt>
                      <dd className="font-medium">{serverQuote.billingIdentity.name}</dd>
                      <dt className="font-semibold text-sky-700">เลขผู้เสียภาษี</dt>
                      <dd>{serverQuote.billingIdentity.taxId || "—"}</dd>
                      <dt className="font-semibold text-sky-700">ที่อยู่</dt>
                      <dd>{serverQuote.billingIdentity.address}</dd>
                    </dl>
                    <p className="mt-2 text-[11px] text-sky-700">
                      ระบบจะตรึงข้อมูลชุดนี้พร้อมยอดชำระ เพื่อให้หน้าตรวจสลิปและใบเสร็จตรงกัน
                    </p>
                  </div>
                )}

                {/* Summary bar — RED invoice summary (ปอน 2026-06-08): สรุปยอด →
                    ยอดรวมค่าใช้จ่าย · ภาษีหัก ณ ที่จ่าย (อัตรา) · ยอดชำระสุทธิ, with
                    dotted leaders for the formal-invoice read. WHT is the legacy
                    1% juristic rule (getListPayForwarder.php) — shows "1%" when
                    withheld, otherwise "ไม่หัก". Any PCSF flat fee is already
                    rolled into totalPriceAll (ยอดรวมค่าใช้จ่าย). */}
                {!taxDirectPayBlocked && serverQuote && (
                <div className="rounded-xl bg-gradient-to-br from-red-600 to-red-700 text-white px-4 py-3.5 shadow-md shadow-red-600/25">
                  <h5 className="mb-2.5 text-sm font-black">{t("summaryHeading")}</h5>
                  <div className="space-y-2">
                    {/* ยอดรวมค่าใช้จ่าย */}
                    <div className="flex items-baseline gap-2 text-[13px]">
                      <span className="shrink-0 opacity-90">{t("summaryCharges")}</span>
                      <span aria-hidden className="flex-1 self-center border-b border-dotted border-white/30" />
                      <span className="shrink-0 tabular-nums font-semibold">
                        {numberFormat2(bill.totalPriceAll)}{" "}
                        <span className="text-[11px] font-normal opacity-90">{t("baht")}</span>
                      </span>
                    </div>
                    {/* ภาษีหัก ณ ที่จ่าย */}
                    <div className="flex items-baseline gap-2 text-[13px]">
                      <span className="shrink-0 opacity-90">
                        {t("summaryWhtLabel")}{" "}
                        <span className="inline-flex items-center rounded-full bg-white/20 px-1.5 py-0.5 text-[11px] font-bold align-middle">
                          {bill.totalNiTi > 0 ? "1%" : t("summaryWhtNone")}
                        </span>
                      </span>
                      <span aria-hidden className="flex-1 self-center border-b border-dotted border-white/30" />
                      <span className="shrink-0 tabular-nums font-semibold">
                        {bill.totalNiTi > 0 ? `-${numberFormat2(bill.totalNiTi)}` : numberFormat2(0)}{" "}
                        <span className="text-[11px] font-normal opacity-90">{t("baht")}</span>
                      </span>
                    </div>
                    {/* ยอดชำระสุทธิ */}
                    <div className="flex items-baseline gap-2 border-t border-white/25 pt-2.5">
                      <span className="shrink-0 text-sm font-bold">{t("summaryNetPay")}</span>
                      <span aria-hidden className="flex-1" />
                      <span className="shrink-0 text-2xl md:text-3xl font-black tabular-nums totalPriceAll">
                        {numberFormat2(payAmountFinal)}{" "}
                        <span className="text-sm font-normal opacity-90">{t("baht")}</span>
                      </span>
                    </div>
                  </div>
                </div>
                )}

                {/* QR + destination account — routed by the 3-account SOT
                    (lib/payment/bank-accounts.ts). The fetched `qrDataUrl` is the
                    SERVICE PromptPay QR, so it's only shown when the resolved
                    destination IS the SERVICE lane; the LOGISTICS/TRADING lanes
                    render their own static K-Shop PNG inside <PayDestination>.
                    DISPLAY-ONLY — slip/record path unchanged. (ปอน 2026-06-08:
                    "เอาก้อน QR ย้ายลงมาต่อแถบแดง".) */}
                {!taxDirectPayBlocked && serverQuote && (
                <div className="rounded-xl bg-white border border-border px-4 py-4 text-center">
                  {payAccount.channel === "promptpay" && (
                    <div
                      id="qrcode"
                      className="mx-auto"
                      style={{ width: 250, height: 250 }}
                    >
                      {qrDataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={qrDataUrl}
                          width={250}
                          height={250}
                          alt="PromptPay QR"
                          className="rounded-lg"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-muted px-4 text-center">
                          {qrError ?? t("qrGenerating")}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="mt-2 text-base font-bold text-red-600">
                    {t("amountLabel")}{" "}
                    <span id="amount-show" className="tabular-nums">
                      {numberFormat2(payAmountFinal)} {t("baht")}
                    </span>
                  </div>

                  {/* Destination account block — resolved by doc-mode (SOT). For
                      the SERVICE lane the fetched PromptPay amount-QR is passed in
                      (exact total encoded); the account number is always shown for
                      manual transfer. TRADING shows +VAT 7% inline. */}
                  <PayDestination
                    account={payAccount}
                    amountThb={payAmountFinal}
                    serviceQrDataUrl={payAccount.channel === "promptpay" ? qrDataUrl : null}
                    className="mt-3"
                  />

                  {/* One-line instruction — scan, type amount, attach slip */}
                  <p className="mt-2 text-xs leading-relaxed text-muted">
                    {t("scanInstruction")}
                  </p>
                </div>
                )}

                {/* Slip upload — the FINAL required step, pinned to the bottom
                    as a big OBVIOUS dropzone so it's unmistakable that a slip
                    must be attached (ปอน 2026-06-06: "เอาสลิปลงข้างล่าง · ทำให้
                    ชัดๆ ว่าต้องอัปไฟล์ ดูง่ายๆ"). Logic unchanged — the real
                    <input name="imagesSlip"> is kept (legacy contract) and just
                    visually hidden behind the styled dropzone label. */}
                {!taxDirectPayBlocked && serverQuote && (
                <div className="rounded-xl border border-border bg-white dark:bg-surface px-4 py-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-foreground">
                      {t("attachSlipTitle")}
                    </span>
                    <span className="text-red-600 font-black">*</span>
                    {!slipPath && !slipUploading && (
                      <span className="ml-auto inline-flex items-center rounded-full bg-red-100 text-red-700 text-[10.5px] font-bold px-2 py-0.5">
                        {t("slipRequiredBadge")}
                      </span>
                    )}
                  </div>

                  {/* Real input kept (id/name="imagesSlip" = legacy contract)
                      but visually hidden — the big label below is the dropzone. */}
                  <input
                    ref={fileRef}
                    id="imagesSlip"
                    type="file"
                    name="imagesSlip"
                    accept="image/*"
                    onChange={onSlipChange}
                    className="sr-only"
                  />
                  <label
                    htmlFor="imagesSlip"
                    className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors ${
                      slipUploading
                        ? "border-amber-300 bg-amber-50/50"
                        : slipPath
                          ? "border-emerald-400 bg-emerald-50/50 hover:bg-emerald-50"
                          : "border-red-300 bg-red-50/40 hover:bg-red-50"
                    }`}
                  >
                    {slipUploading ? (
                      <>
                        <span className="text-3xl">⏳</span>
                        <span className="text-sm font-bold text-amber-700">
                          {t("slipUploading")}
                        </span>
                      </>
                    ) : slipPath ? (
                      <>
                        <span className="grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-600 text-2xl">
                          ✓
                        </span>
                        <span className="text-sm font-black text-emerald-700">
                          {t("slipAttached")}
                        </span>
                        <span className="text-xs font-medium text-muted">
                          {t("slipTapToChange")}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="grid h-12 w-12 place-items-center rounded-full bg-red-100 text-red-600">
                          <Upload className="h-6 w-6" strokeWidth={2.2} />
                        </span>
                        <span className="text-sm font-black text-red-700">
                          {t("slipTapToAttach")}
                        </span>
                        <span className="text-xs font-medium text-muted">
                          {t("slipHint")}
                        </span>
                      </>
                    )}
                  </label>
                </div>
                )}
              </>
            )}
          </div>

          {/* Footer — only render when not in done/empty state */}
          {!done && rows.length > 0 && (
            <footer className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-surface-alt/30">
              <button
                type="button"
                onClick={closeModal}
                className="inline-flex items-center justify-center rounded-full border border-border bg-white dark:bg-surface text-foreground px-4 py-2 text-sm font-bold hover:bg-surface-alt active:scale-[0.98] transition-all"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={pending || slipUploading || !slipPath || !serverQuote || taxDirectPayBlocked}
                className={`inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-bold transition-all ${
                  pending || slipUploading || !slipPath || !serverQuote || taxDirectPayBlocked
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                    : "bg-red-600 text-white hover:bg-red-700 active:scale-[0.98] shadow-md shadow-red-600/25"
                }`}
              >
                {pending
                  ? t("saving")
                  : taxDirectPayBlocked
                    ? "ติดต่อฝ่ายบัญชีเพื่อออกยอด"
                    : !serverQuote
                      ? "กำลังคำนวณยอด…"
                      : t("confirm")}
              </button>
            </footer>
          )}
        </div>
      </div>
    </>
  );
}
