"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { ServiceOrderSummary } from "@/actions/service-order";
import {
  cancelServiceOrder,
  payServiceOrderFromWallet,
} from "@/actions/service-order";
import { confirm } from "@/components/ui/confirm";
// Shared, unit-tested bulk-pay helpers — same module the proven E10
// <ServiceOrderBulkActionsBar> on the main /service-order list uses, so the
// wallet pre-check + the loop summary can never drift between the two surfaces.
import {
  canCoverBulkPay,
  summariseLoopResults,
  type LoopOutcome,
} from "@/lib/service-order/bulk-eligibility";
import { Eye, Package, Printer, FileText, XCircle, Wallet } from "lucide-react";

// D1 Phase-B Wave 2: rows carry the legacy tb_header_order.hstatus code
// ('1'-'6'). Badge colours + the per-row action gates are keyed by code.
const STATUS_BADGE: Record<string, string> = {
  "1": "bg-gray-100 text-gray-700",      // รอดำเนินการ
  "2": "bg-amber-100 text-amber-700",    // รอชำระเงิน
  "3": "bg-blue-100 text-blue-700",      // สั่งสินค้า
  "4": "bg-indigo-100 text-indigo-700",  // รอร้านจีนจัดส่ง
  "40": "bg-teal-100 text-teal-700",     // ถึงโกดังจีน (owner 2026-06-16)
  "5": "bg-emerald-100 text-emerald-700", // สำเร็จ
  "6": "bg-red-100 text-red-700",        // ยกเลิก
};

// Legacy hstatus code ('1'-'6' + '40') → i18n status key under
// `serviceOrder.status.*`. The code is the canonical tb_header_order.hstatus
// value; only the display label is resolved via next-intl.
const STATUS_KEY: Record<string, string> = {
  "1": "pending",
  "2": "awaiting_payment",
  "3": "ordered",
  "4": "awaiting_chn_dispatch",
  "40": "arrived_china_warehouse", // owner 2026-06-16 · MOMO arrival
  "5": "completed",
  "6": "cancelled",
};

// Legacy shops.php gates the per-row actions on hStatus:
//  - cancel  : hStatus <= 2  ('1' รอดำเนินการ | '2' รอชำระเงิน)
//  - pay     : hStatus == 2  ('2' รอชำระเงิน)
//  - receipt : hStatus == 5  ('5' สำเร็จ)
//  - invoice : hStatus 2..5  ('2' .. '5' + '40' ถึงโกดังจีน is post-payment)
const CANCELLABLE: ServiceOrderSummary["status"][] = ["1", "2"];
const INVOICEABLE: ServiceOrderSummary["status"][] = ["2", "3", "4", "40", "5"];

export function ServiceOrderList({
  items,
  activeFilter = "all",
  walletBalance = 0,
}: {
  items: ServiceOrderSummary[];
  activeFilter?: string;
  /** Available wallet balance (THB) — gates the bulk pay-from-wallet button.
   *  The server action re-verifies balance per row, so this is display-only. */
  walletBalance?: number;
}) {
  const t = useTranslations("serviceOrder");
  const tp = useTranslations("pcsOrder");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Which bulk loop is in flight — drives the per-button spinner label so a
  // bulk-cancel doesn't show "กำลังชำระเงิน…" and vice-versa.
  const [bulkMode, setBulkMode] = useState<"idle" | "cancel" | "pay">("idle");
  // Result banner for the bulk pay-from-wallet loop (success / stopped-at).
  const [payBanner, setPayBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Selection drives the legacy bulk-cancel button + the sticky pay bar.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Only awaiting_payment rows feed the sticky "ชำระเงิน" bar (legacy: hStatus=='2').
  const payableRows = useMemo(
    () => items.filter((o) => o.status === "2" && o.h_no),
    [items],
  );
  const selectedPayable = useMemo(
    () => payableRows.filter((o) => o.h_no && selected.has(o.h_no)),
    [payableRows, selected],
  );
  const selectedCancellable = useMemo(
    () => items.filter((o) => o.h_no && selected.has(o.h_no) && CANCELLABLE.includes(o.status)),
    [items, selected],
  );
  const payTotal = useMemo(
    () => selectedPayable.reduce((s, o) => s + Number(o.total_thb), 0),
    [selectedPayable],
  );
  // Wallet pre-check — same helper the E10 bar uses. Disables the pay button +
  // drives the shortfall hint when the selection exceeds the wallet balance.
  const coverage = useMemo(
    () => canCoverBulkPay({ walletBalance, totalRequired: payTotal }),
    [walletBalance, payTotal],
  );

  function toggle(hNo: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(hNo)) next.delete(hNo); else next.add(hNo);
      return next;
    });
  }
  function toggleAllPayable() {
    setSelected((prev) => {
      const allOn = payableRows.every((o) => o.h_no && prev.has(o.h_no));
      const next = new Set(prev);
      payableRows.forEach((o) => {
        if (!o.h_no) return;
        if (allOn) next.delete(o.h_no); else next.add(o.h_no);
      });
      return next;
    });
  }

  async function onBulkCancel() {
    if (pending) return;
    const targets = selectedCancellable.map((o) => o.h_no).filter(Boolean) as string[];
    if (targets.length === 0) return;
    if (!(await confirm(tp("bulkCancelConfirm", { count: targets.length })))) return;
    setBulkMode("cancel");
    startTransition(async () => {
      await Promise.all(targets.map((hNo) => cancelServiceOrder(hNo)));
      setSelected(new Set());
      setBulkMode("idle");
      router.refresh();
    });
  }

  // ── BULK PAY-FROM-WALLET — parity with the proven E10
  // <ServiceOrderBulkActionsBar>: sequential `for...of` that STOPS ON FIRST
  // FAILURE (AGENTS.md §0e — never keep draining the wallet on a partial
  // failure), confirm-before-mutate (§0f), wallet pre-check, result banner.
  // ZERO new money logic — each row delegates to the existing
  // payServiceOrderFromWallet action, which re-verifies ownership / status /
  // balance / idempotency server-side per row.
  async function onBulkPay() {
    if (pending) return;
    const targets = selectedPayable.map((o) => o.h_no).filter(Boolean) as string[];
    if (targets.length === 0) return;
    if (!coverage.ok) {
      setPayBanner({
        kind: "err",
        text: t("walletInsufficient", {
          have: walletBalance.toLocaleString("th-TH", { minimumFractionDigits: 2 }),
          need: payTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 }),
          short: coverage.shortfall.toLocaleString("th-TH", { minimumFractionDigits: 2 }),
        }),
      });
      return;
    }
    if (
      !(await confirm(
        t("bulkPayConfirm", {
          count: targets.length,
          total: payTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 }),
        }),
      ))
    )
      return;
    setPayBanner(null);
    setBulkMode("pay");
    startTransition(async () => {
      const out: LoopOutcome[] = [];
      let stoppedAt: string | null = null;
      let stopReason: string | null = null;
      for (const hNo of targets) {
        const res = await payServiceOrderFromWallet(hNo);
        if (res.ok) {
          out.push({ ok: true, hno: hNo });
        } else {
          out.push({ ok: false, hno: hNo, error: res.error });
          stoppedAt = hNo;
          stopReason = res.error;
          break; // STOP — protect the wallet from continuing failures
        }
      }
      const summary = summariseLoopResults(out);
      if (summary.failed === 0) {
        setPayBanner({ kind: "ok", text: t("bulkPaySuccess", { count: summary.total }) });
        setSelected(new Set());
        setTimeout(() => setPayBanner(null), 4000);
      } else {
        setPayBanner({
          kind: "err",
          text: t("bulkPayStoppedAt", {
            hno: stoppedAt ?? "",
            reason: stopReason ?? "",
            ok: summary.ok,
            total: targets.length,
          }),
        });
      }
      setBulkMode("idle");
      // Refresh either way so successfully-paid rows leave the รอชำระเงิน view.
      router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-white dark:bg-surface p-6 text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-surface-alt text-muted">
          <Package className="w-7 h-7" />
        </div>
        <p className="mt-3 text-sm font-medium text-foreground">
          {activeFilter === "all" ? t("listEmpty") : tp("emptyFilter")}
        </p>
        <p className="mt-1 text-xs text-muted">{tp("emptyHint")}</p>
        <Link
          href="/cart/add"
          className="mt-4 inline-block rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-bold hover:bg-primary-600 shadow-sm"
        >
          + {t("addItem")}
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* Bulk-cancel — legacy "ยกเลิกออเดอร์รายการที่เลือก" */}
      {selectedCancellable.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-2.5">
          <span className="text-xs text-red-700">
            {tp("selectedCount", { count: selectedCancellable.length })}
          </span>
          <button
            type="button"
            onClick={onBulkCancel}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-full bg-red-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-red-700 disabled:opacity-50"
          >
            <XCircle className="w-3.5 h-3.5" />{" "}
            {pending && bulkMode === "cancel" ? t("cancelling") : tp("bulkCancel")}
          </button>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-3 py-3 w-[40px]"></th>
                <th className="px-4 py-3 w-[130px]">{t("colDate")}</th>
                <th className="px-4 py-3 w-[150px]">{tp("colOrderNo")}</th>
                <th className="px-4 py-3">{tp("colProduct")}</th>
                <th className="px-4 py-3 w-[130px]">{t("colStatus")}</th>
                <th className="px-4 py-3 text-right w-[120px]">{tp("colPriceThb")}</th>
                <th className="px-4 py-3 w-[150px]">{tp("colOptions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((o) => {
                const created = new Date(o.created_at);
                const selectable = !!o.h_no && (o.status === "2" || CANCELLABLE.includes(o.status));
                return (
                  <tr key={o.id} className="hover:bg-surface-alt/30 transition-colors">
                    <td className="px-3 py-3 align-top">
                      {selectable && o.h_no && (
                        <input
                          type="checkbox"
                          checked={selected.has(o.h_no)}
                          onChange={() => toggle(o.h_no as string)}
                          className="mt-0.5 accent-primary-600"
                          aria-label={tp("selectRow")}
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted whitespace-nowrap align-top">
                      <div>{created.toLocaleDateString("th-TH")}</div>
                      <div>{created.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} {tp("timeSuffix")}</div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      {o.h_no ? (
                        <Link href={`/service-order/${o.h_no}`} className="font-mono text-xs text-primary-600 hover:underline">
                          {o.h_no}
                        </Link>
                      ) : <span className="text-muted">—</span>}
                      {o.payment_due_at && o.status === "2" && (
                        <div className="mt-1 text-[11px] text-amber-700">
                          {t("payBy", { date: new Date(o.payment_due_at).toLocaleString("th-TH") })}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-start gap-3">
                        <div className="shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-surface-alt border border-border flex items-center justify-center">
                          {o.cover_image_path ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={o.cover_image_path} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Package className="w-6 h-6 text-muted" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm line-clamp-2 text-foreground">
                            {o.title ?? "—"}
                          </p>
                          <p className="text-[11px] text-muted mt-1">
                            {tp("itemCount", { count: o.item_count })}
                            {o.warehouse_china && <> · {o.warehouse_china === "yiwu" ? tp("warehouseYiwu") : tp("warehouseGuangzhou")}</>}
                            {o.ship_by && <> · {o.ship_by}</>}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[o.status] ?? "bg-gray-100 text-gray-700"}`}>
                        {STATUS_KEY[o.status] ? t(`status.${STATUS_KEY[o.status]}`) : o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono align-top">
                      <div className="text-sm font-bold text-red-600">
                        {Number(o.total_thb).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </div>
                      {o.yuan_rate_locked && (
                        <div className="text-[11px] text-muted">@ ฿{Number(o.yuan_rate_locked).toFixed(4)}/¥</div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {o.h_no && (
                        <div className="flex flex-col gap-1.5">
                          <Link
                            href={`/service-order/${o.h_no}`}
                            className="inline-flex items-center justify-center gap-1 rounded-full border border-green-200 bg-green-50 text-green-700 px-3 py-1 text-xs font-semibold hover:bg-green-100"
                          >
                            <Eye className="w-3.5 h-3.5" /> {tp("viewDetail")}
                          </Link>
                          {/* Pay — legacy hStatus=='2' */}
                          {o.status === "2" && (
                            <Link
                              href={`/service-order/${o.h_no}`}
                              className="inline-flex items-center justify-center gap-1 rounded-full border border-cyan-200 bg-cyan-50 text-cyan-700 px-3 py-1 text-xs font-semibold hover:bg-cyan-100"
                            >
                              <Wallet className="w-3.5 h-3.5" /> {tp("pay")}
                            </Link>
                          )}
                          {/* Cancel — legacy hStatus<=2 */}
                          {CANCELLABLE.includes(o.status) && (
                            <button
                              type="button"
                              onClick={async () => {
                                if (!o.h_no) return;
                                if (!(await confirm(tp("cancelOneConfirm", { hNo: o.h_no })))) return;
                                startTransition(async () => {
                                  await cancelServiceOrder(o.h_no as string);
                                  router.refresh();
                                });
                              }}
                              disabled={pending}
                              className="inline-flex items-center justify-center gap-1 rounded-full border border-red-200 bg-red-50 text-red-600 px-3 py-1 text-xs font-semibold hover:bg-red-100 disabled:opacity-50"
                            >
                              <XCircle className="w-3.5 h-3.5" /> {tp("cancelOrder")}
                            </button>
                          )}
                          {/* Receipt — legacy hStatus=='5' (สำเร็จ) */}
                          {o.status === "5" && (
                            <Link
                              href={`/service-order/${o.h_no}/receipt`}
                              className="inline-flex items-center justify-center gap-1 rounded-full border border-primary-200 bg-primary-50 text-primary-700 px-3 py-1 text-xs font-semibold hover:bg-primary-100"
                            >
                              <Printer className="w-3.5 h-3.5" /> {tp("printReceipt")}
                            </Link>
                          )}
                          {/* Invoice — legacy hStatus 2..5 */}
                          {INVOICEABLE.includes(o.status) && (
                            <Link
                              href={`/service-order/${o.h_no}/receipt?doc=invoice`}
                              className="inline-flex items-center justify-center gap-1 rounded-full border border-red-200 bg-white text-red-600 px-3 py-1 text-xs font-semibold hover:bg-red-50"
                            >
                              <FileText className="w-3.5 h-3.5" /> {tp("printInvoice")}
                            </Link>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sticky "ชำระเงิน" bar — legacy .b-pay fixed bottom bar. Real bulk
          pay-from-wallet (multi-select → one debit per order, stop on first
          failure) — parity with the E10 bar on the main /service-order list. */}
      {payableRows.length > 0 && (
        <div className="sticky bottom-3 z-30 mx-auto max-w-[680px]">
          <div className="rounded-2xl border border-primary-200 bg-white dark:bg-surface shadow-sm shadow-primary-900/10 px-4 py-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <label className="flex items-center gap-2 text-xs sm:text-sm min-h-[44px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={payableRows.every((o) => o.h_no && selected.has(o.h_no))}
                  onChange={toggleAllPayable}
                  className="h-5 w-5 accent-primary-600"
                />
                <span className="text-muted">{t("selectAll", { selected: selectedPayable.length, total: payableRows.length })}</span>
              </label>
              <div className="text-xs sm:text-sm">
                <span className="text-muted">{tp("itemCountLabel")} </span>
                <span className="font-bold">{selectedPayable.length}</span>
                <span className="text-muted"> · {tp("payTotalLabel")} </span>
                <span className="font-mono font-bold text-red-600">
                  ฿{payTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <button
                type="button"
                onClick={onBulkPay}
                disabled={pending || selectedPayable.length === 0 || !coverage.ok}
                title={
                  !coverage.ok && selectedPayable.length > 0
                    ? t("walletShortfallHint", {
                        short: coverage.shortfall.toLocaleString("th-TH", { minimumFractionDigits: 2 }),
                      })
                    : undefined
                }
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-primary-500 to-primary-700 text-white px-4 py-2 min-h-[44px] text-xs sm:text-sm font-bold shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-shadow"
              >
                <Wallet className="w-4 h-4" />{" "}
                {pending && bulkMode === "pay" ? t("paying") : tp("pay")}
              </button>
            </div>
            {/* Wallet shortfall hint — mirrors the E10 bar. */}
            {!coverage.ok && selectedPayable.length > 0 && (
              <p className="mt-2 text-[11px] text-rose-600">
                {t("walletShortfallHint", {
                  short: coverage.shortfall.toLocaleString("th-TH", { minimumFractionDigits: 2 }),
                })}
              </p>
            )}
            {/* Result banner (success / stopped-at). */}
            {payBanner && (
              <div
                className={
                  "rounded-md text-xs px-2 py-1.5 mt-2 text-white " +
                  (payBanner.kind === "ok" ? "bg-emerald-600" : "bg-red-600")
                }
                role="status"
              >
                {payBanner.text}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
