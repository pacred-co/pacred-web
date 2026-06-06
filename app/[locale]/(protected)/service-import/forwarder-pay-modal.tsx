"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import {
  getForwarderPaymentQr,
  submitForwarderPayment,
  uploadForwarderSlip,
} from "@/actions/forwarder";
import { confirm } from "@/components/ui/confirm";
import type { ForwarderRow } from "./forwarder-row-view";

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

// Human-readable PromptPay id grouping.
function formatPromptPayId(id: string): string {
  const d = id.replace(/\D/g, "");
  if (d.length === 13) {
    return `${d[0]}-${d.slice(1, 5)}-${d.slice(5, 10)}-${d.slice(10, 12)}-${d[12]}`;
  }
  if (d.length === 10) {
    return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return id;
}

// getListPayForwarder.php L116 — per-row total (before bill-level adjust).
function perRowTotal(row: ForwarderRow): number {
  return (
    row.ftotalprice +
    row.ftransportprice +
    row.fpriceupdate +
    row.fshippingservice +
    row.pricecrate +
    row.ftransportpricechnthb +
    row.priceother -
    row.fdiscount
  );
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

// Single price-row line — used inside the per-row breakdown.
function PriceLine({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-3 py-1">
      <div className={`text-sm font-semibold text-right ${danger ? "text-red-600" : "text-muted"}`}>
        {label}
      </div>
      <div className={`text-sm font-semibold text-right tabular-nums ${danger ? "text-red-600" : "text-foreground"}`}>
        {value} <span className="text-xs text-muted">บาท</span>
      </div>
    </div>
  );
}

export function ForwarderPayModal({
  rows,
  isJuristic,
  open,
  onClose,
}: ForwarderPayModalProps) {
  const router = useRouter();

  // ── bill arithmetic — getListPayForwarder.php L96-247 ──
  const bill = useMemo(() => {
    let totalPriceAll = 0;
    for (const r of rows) totalPriceAll += perRowTotal(r);

    const countPricePCSF = rows.filter(
      (r) => r.fshipby === "PCSF" && r.ftransportprice === 0,
    ).length;
    const sumPricePCSF = countPricePCSF > 0 ? 50 : 0;
    totalPriceAll += sumPricePCSF;

    const totalNiTi =
      isJuristic && totalPriceAll >= 1000 ? totalPriceAll * 0.01 : 0;

    const payAmount = totalPriceAll - totalNiTi;

    return { totalPriceAll, sumPricePCSF, totalNiTi, payAmount };
  }, [rows, isJuristic]);

  // ── PromptPay QR ──
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [promptPayId, setPromptPayId] = useState<string | null>(null);

  useEffect(() => {
    if (bill.payAmount <= 0) return;
    let cancelled = false;
    void getForwarderPaymentQr(bill.payAmount).then((res) => {
      if (cancelled) return;
      if (res.ok && res.data) {
        setQrDataUrl(res.data.dataUrl);
        setPromptPayId(res.data.promptPayId);
        setQrError(null);
      } else {
        setQrDataUrl(null);
        setPromptPayId(null);
        const code = res.ok ? null : res.error;
        setQrError(
          code === "promptpay_not_configured"
            ? "ยังไม่ได้ตั้งค่าพร้อมเพย์ของบริษัท กรุณาติดต่อแอดมินเพื่อชำระเงิน"
            : "ไม่สามารถสร้าง QR ได้ กรุณาติดต่อแอดมิน",
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [bill.payAmount]);

  // ── slip upload ──
  const [slipPath, setSlipPath] = useState<string | null>(null);
  const [slipDate, setSlipDate] = useState("");
  const [slipUploading, setSlipUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  async function onSlipChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setSlipUploading(true);
    const fd = new FormData();
    fd.append("slip", file);
    const res = await uploadForwarderSlip(fd);
    setSlipUploading(false);
    if (res.ok && res.data) {
      setSlipPath(res.data.path);
    } else {
      setSlipPath(null);
      setError(res.ok ? "อัปโหลดสลิปไม่สำเร็จ" : res.error);
    }
  }

  async function onConfirm() {
    if (rows.length === 0) return;
    if (!slipPath) {
      setError("กรุณาแนบหลักฐานการโอน (สลิปรายการ)");
      return;
    }
    const ok = await confirm(
      "กรุณาตรวจสอบยอดเงินและสลิปก่อนยืนยันการชำระเงิน",
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await submitForwarderPayment({
        ids: rows.map((r) => r.id),
        slipPath,
        slipDate: slipDate || undefined,
      });
      if (res.ok) {
        setDone(true);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function copyText(value: string) {
    if (navigator.clipboard) void navigator.clipboard.writeText(value);
  }

  // ESC key close
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[1050] bg-black/50 backdrop-blur-sm animate-in fade-in"
        onClick={onClose}
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
          className="relative w-full max-w-[640px] bg-white dark:bg-surface rounded-2xl shadow-2xl border border-border overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-surface-alt/40">
            <h4 id="list-payment2-title" className="text-base md:text-lg font-bold text-foreground">
              ชำระเงินออเดอร์ฝากนำเข้าสินค้า
            </h4>
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิด"
              className="shrink-0 inline-flex w-8 h-8 items-center justify-center rounded-full text-muted hover:bg-surface-alt hover:text-foreground transition-colors text-xl leading-none"
            >
              ×
            </button>
          </header>

          {/* Body */}
          <div className="px-4 py-4 max-h-[80vh] overflow-y-auto space-y-3">
            {done ? (
              // Success state
              <div className="py-6 text-center space-y-3">
                <div className="inline-flex w-14 h-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-3xl">
                  ✓
                </div>
                <h4 className="text-lg font-bold text-emerald-700">
                  ส่งหลักฐานการชำระเงินเรียบร้อยแล้ว
                </h4>
                <p className="text-sm text-muted">
                  ระบบได้บันทึกรายการชำระเงิน {rows.length} รายการ
                  รอเจ้าหน้าที่ตรวจสอบสลิปและยืนยัน
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex items-center justify-center rounded-full bg-red-600 text-white px-5 py-2 text-sm font-bold hover:bg-red-700 active:scale-[0.98] transition-all"
                  >
                    ปิด
                  </button>
                </div>
              </div>
            ) : rows.length === 0 ? (
              <div className="py-8 text-center">
                <h4 className="text-lg font-bold text-red-600">
                  ไม่พบรายการที่ต้องชำระเงินกรุณาตรวจสอบ
                </h4>
              </div>
            ) : (
              <>
                {/* QR + amount pinned to the TOP so the customer can scan
                    immediately (owner 2026-06-04: "เอา qrcode ขึ้นบนสุด ทุกหน้า").
                    Shared modal — applies on /service-import + /payment-due. */}
                {/* Pay block — ยอดที่ต้องชำระจริง */}
                <div className="rounded-xl bg-gradient-to-br from-red-600 to-red-700 text-white px-4 py-3 shadow-md shadow-red-600/25">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-xs md:text-sm font-bold">
                      ยอดเงินที่ต้องชำระจริง
                    </span>
                    <span className="text-2xl md:text-3xl font-black tabular-nums totalPriceAll">
                      {numberFormat2(bill.payAmount)}{" "}
                      <span className="text-sm font-normal opacity-90">บาท</span>
                    </span>
                  </div>
                </div>

                {/* QR + PromptPay */}
                <div className="rounded-xl bg-white border border-border px-4 py-4 text-center">
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
                        {qrError ?? "กำลังสร้าง QR..."}
                      </div>
                    )}
                  </div>
                  <div className="mt-2 text-base font-bold text-red-600">
                    ยอดเงิน:{" "}
                    <span id="amount-show" className="tabular-nums">
                      {numberFormat2(bill.payAmount)} บาท
                    </span>
                  </div>
                  {promptPayId && (
                    <div className="mt-2 flex items-center justify-center gap-2 flex-wrap">
                      <span className="text-sm text-muted">พร้อมเพย์</span>
                      <span id="text-pp" className="font-mono text-lg font-bold text-foreground tabular-nums">
                        {formatPromptPayId(promptPayId)}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyText(promptPayId)}
                        className="inline-flex items-center rounded-full bg-surface-alt hover:bg-border text-foreground text-xs font-bold px-2.5 py-1 transition-colors"
                      >
                        📋 คัดลอก
                      </button>
                    </div>
                  )}
                </div>

                {/* Header — "มี N รายการ" */}
                <div className="flex items-center justify-between">
                  <h5 className="text-sm md:text-base font-bold text-red-600">
                    มี {rows.length} รายการที่ต้องชำระเงิน
                  </h5>
                </div>

                {/* Error message */}
                {error && (
                  <div className="rounded-lg bg-red-600 text-white px-3 py-2 text-sm">
                    {error}
                  </div>
                )}

                {/* Per-row itemized cards */}
                <div className="space-y-2.5">
                  {rows.map((row) => {
                    const rowTotal = perRowTotal(row);
                    const trackingChn =
                      row.ftrackingchn2 && row.ftrackingchn2 !== ""
                        ? row.ftrackingchn2
                        : row.ftrackingchn;
                    return (
                      <div
                        key={row.id}
                        className={`rounded-xl border ${
                          row.fcredit === "1"
                            ? "border-red-300 bg-red-50/60"
                            : "border-border bg-white dark:bg-surface"
                        } px-3 py-2.5`}
                      >
                        {row.fcredit === "1" && (
                          <div className="text-center text-[11px] font-bold text-red-700 mb-1">
                            ชำระรายการเครดิต
                          </div>
                        )}
                        <div className="text-center text-sm font-semibold mb-2">
                          เลขออเดอร์:{" "}
                          <span className="text-red-600">#{row.id}</span>{" "}
                          <span className="text-muted">·</span>{" "}
                          <span className="text-muted text-xs">Track:</span>{" "}
                          <span className="font-mono text-red-600">
                            {trackingChn}
                          </span>
                        </div>
                        <hr className="border-t border-dashed border-border mb-1" />
                        <div className="space-y-0">
                          <PriceLine label="ราคานำเข้าจีน-ไทย" value={numberFormat2(row.ftotalprice)} />
                          {row.pricecrate > 0 && (
                            <PriceLine label="ค่าตีลัง" value={numberFormat2(row.pricecrate)} />
                          )}
                          {row.ftransportpricechnthb > 0 && (
                            <PriceLine label="ค่าขนส่งในจีน" value={numberFormat2(row.ftransportpricechnthb)} />
                          )}
                          {row.fpriceupdate > 0 && (
                            <PriceLine label="เพิ่ม/ลด" value={numberFormat2(row.fpriceupdate)} />
                          )}
                          {row.fshippingservice > 0 && (
                            <PriceLine label="ค่าบริการขนส่ง" value={numberFormat2(row.fshippingservice)} />
                          )}
                          {row.ftransportprice > 0 && (
                            <PriceLine label="ค่าจัดส่งในไทย" value={numberFormat2(row.ftransportprice)} />
                          )}
                          {row.priceother > 0 && (
                            <PriceLine label="ค่าอื่นๆ" value={numberFormat2(row.priceother)} />
                          )}
                          {row.fdiscount > 0 && (
                            <PriceLine label="ส่วนลด" value={numberFormat2(row.fdiscount)} />
                          )}
                          <div className="border-t border-border mt-1 pt-1.5">
                            <div className="grid grid-cols-[1fr_auto] items-baseline gap-3">
                              <div className="text-sm font-bold text-right text-foreground">
                                ราคารวม:
                              </div>
                              <div className="text-base font-black text-right tabular-nums text-red-600">
                                {numberFormat2(rowTotal)}{" "}
                                <span className="text-xs text-muted font-normal">บาท</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Bill summary */}
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
                  <h5 className="text-sm font-bold text-amber-900 mb-2">
                    สรุปรายการทั้งหมด
                  </h5>
                  {bill.sumPricePCSF > 0 && (
                    <PriceLine
                      label="รวมบิล Pacred เหมาๆ"
                      value={numberFormat2(bill.sumPricePCSF)}
                    />
                  )}
                  <PriceLine
                    label="ยอดรวม"
                    value={numberFormat2(bill.totalPriceAll)}
                  />
                  {bill.totalNiTi > 0 && (
                    <PriceLine
                      label="LESS WITHHOLDING TAX 1%"
                      value={numberFormat2(bill.totalNiTi)}
                      danger
                    />
                  )}
                </div>

                {/* Slip upload — the FINAL required step, pinned to the bottom
                    as a big OBVIOUS dropzone so it's unmistakable that a slip
                    must be attached (ปอน 2026-06-06: "เอาสลิปลงข้างล่าง · ทำให้
                    ชัดๆ ว่าต้องอัปไฟล์ ดูง่ายๆ"). Logic unchanged — the real
                    <input name="imagesSlip"> is kept (legacy contract) and just
                    visually hidden behind the styled dropzone label. */}
                <div className="rounded-xl border border-border bg-white dark:bg-surface px-4 py-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-foreground">
                      แนบสลิปการโอนเพื่อยืนยัน
                    </span>
                    <span className="text-red-600 font-black">*</span>
                    {!slipPath && !slipUploading && (
                      <span className="ml-auto inline-flex items-center rounded-full bg-red-100 text-red-700 text-[10.5px] font-bold px-2 py-0.5">
                        ต้องแนบสลิป
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
                          กำลังอัปโหลดสลิป...
                        </span>
                      </>
                    ) : slipPath ? (
                      <>
                        <span className="grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-600 text-2xl">
                          ✓
                        </span>
                        <span className="text-sm font-black text-emerald-700">
                          แนบสลิปเรียบร้อยแล้ว
                        </span>
                        <span className="text-xs font-medium text-muted">
                          แตะอีกครั้งเพื่อเปลี่ยนรูปสลิป
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="grid h-12 w-12 place-items-center rounded-full bg-red-100 text-red-600">
                          <Upload className="h-6 w-6" strokeWidth={2.2} />
                        </span>
                        <span className="text-sm font-black text-red-700">
                          แตะที่นี่เพื่อแนบสลิปการโอน
                        </span>
                        <span className="text-xs font-medium text-muted">
                          ถ่ายรูปหรือเลือกรูปสลิป (รองรับ jpg, png)
                        </span>
                      </>
                    )}
                  </label>

                  {/* Transfer datetime — optional, sits under the dropzone */}
                  <div>
                    <label
                      htmlFor="slipDate"
                      className="block text-xs font-bold text-muted mb-1"
                    >
                      วันเวลาที่โอน{" "}
                      <span className="font-normal">(ไม่บังคับ)</span>
                    </label>
                    <input
                      id="slipDate"
                      type="datetime-local"
                      value={slipDate}
                      onChange={(e) => setSlipDate(e.target.value)}
                      className="block w-full rounded-lg border border-border bg-white dark:bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-300"
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer — only render when not in done/empty state */}
          {!done && rows.length > 0 && (
            <footer className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-surface-alt/30">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center rounded-full border border-border bg-white dark:bg-surface text-foreground px-4 py-2 text-sm font-bold hover:bg-surface-alt active:scale-[0.98] transition-all"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={pending || slipUploading || !slipPath}
                className={`inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-bold transition-all ${
                  pending || slipUploading || !slipPath
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                    : "bg-red-600 text-white hover:bg-red-700 active:scale-[0.98] shadow-md shadow-red-600/25"
                }`}
              >
                {pending ? "กำลังบันทึก..." : "ยืนยัน"}
              </button>
            </footer>
          )}
        </div>
      </div>
    </>
  );
}
