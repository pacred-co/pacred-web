"use client";

/**
 * Customer-side combined bulk-action bar — ยกเลิก N รายการ + ชำระเงิน N รายการ
 * in one sticky floating bottom-bar. Faithful to legacy
 * `member/include/pages/shops/getList.php` (105 LOC modal) — a power user
 * with 5+ pending orders gets multi-select cancel OR multi-select pay.
 *
 * E10 (2026-06-09) supersedes the standalone `<BulkPayBar>` from
 * ./add/service-order-bulk-actions.tsx on the main `/service-order` list
 * page. The /add page keeps its existing standalone <BulkPayBar> (different
 * context: cart-add flow, only payable rows ever appear).
 *
 * Key UX rules (per the user spec + AGENTS.md):
 *   §0e money-path semantics —
 *     - bulk-cancel:  best-effort per-row loop, summary toast at end
 *                     (writes tb_header_order.hstatus='6' same as single)
 *     - bulk-pay:     STOPS ON FIRST FAILURE (don't drain wallet on partial
 *                     failures · sequential for-loop, not Promise.all)
 *   §0f confirm-before-mutate — both buttons open a confirm dialog showing
 *     the count + total before firing
 *   AGENTS.md §6 mobile-first — bar works at 360px (single-row at desktop,
 *     stacked at mobile · sticky bottom, z-55 to clear the LINE bubble z-51)
 *   Wallet pre-check — when total payable > balance, disable pay button +
 *     show shortfall tooltip ("ยอดเกินกระเป๋า · กรุณาเติมเงินก่อน · ขาด ฿X")
 *
 * Pure helpers (lib/service-order/bulk-eligibility.ts) own:
 *   - getCancelableHNos / getPayableHNos (eligibility filters)
 *   - sumPayableTotals (the running total)
 *   - canCoverBulkPay (wallet pre-check)
 *   - summariseLoopResults (post-loop banner copy)
 * Same module covered by 36+ unit assertions.
 *
 * Per Next 16: no `Date.now()` / `new Date()` in render body.
 */

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Trash2, Wallet, CheckSquare } from "lucide-react";
import {
  cancelServiceOrder,
  payServiceOrderFromWallet,
} from "@/actions/service-order";
import { confirm } from "@/components/ui/confirm";
import {
  canCoverBulkPay,
  summariseLoopResults,
  type LoopOutcome,
} from "@/lib/service-order/bulk-eligibility";
// We re-use the context + RowCheckbox + provider from the existing module — the
// E10 bar is a new UI face on top of the same selection state.
import { useBulkSelection } from "./add/service-order-bulk-actions";

type Mode = "idle" | "cancel" | "pay";
type Banner = { kind: "ok" | "err"; text: string };

export function ServiceOrderBulkActionsBar({
  walletBalance,
}: {
  walletBalance: number;
}) {
  const t = useTranslations("serviceOrder");
  const router = useRouter();
  const ctx = useBulkSelection();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("idle");
  const [banner, setBanner] = useState<Banner | null>(null);

  // ── Derived selection slices (always re-computed from canonical state).
  const selectedCancelable = useMemo(
    () => ctx.cancelableHNos.filter((h) => ctx.selected.has(h)),
    [ctx.cancelableHNos, ctx.selected],
  );
  const selectedPayable = useMemo(
    () => ctx.payableHNos.filter((h) => ctx.selected.has(h)),
    [ctx.payableHNos, ctx.selected],
  );
  const priceAll = useMemo(
    () => selectedPayable.reduce((s, h) => s + (ctx.totals.get(h) ?? 0), 0),
    [selectedPayable, ctx.totals],
  );

  const cancelCount = selectedCancelable.length;
  const payCount = selectedPayable.length;
  const coverage = canCoverBulkPay({ walletBalance, totalRequired: priceAll });

  // ── Select-all / clear all (operates on the broader cancelable set so the
  // single checkbox covers BOTH actions' eligibility surface).
  const allCancelableChecked =
    cancelCount > 0 && cancelCount === ctx.cancelableHNos.length;

  // ── BULK-CANCEL — best-effort per-row loop (AGENTS.md §0e cancel mode).
  const onBulkCancel = useCallback(async () => {
    if (pending) return;
    if (cancelCount === 0) {
      setBanner({ kind: "err", text: t("selectOrdersToCancel") });
      return;
    }
    if (!(await confirm(t("bulkCancelConfirm", { count: cancelCount })))) return;
    setBanner(null);
    setMode("cancel");
    startTransition(async () => {
      // best-effort: keep going on per-row failures (legacy `orderCancelAll`).
      const targets = selectedCancelable;
      const out: LoopOutcome[] = [];
      for (const hno of targets) {
        const res = await cancelServiceOrder(hno);
        if (res.ok) out.push({ ok: true, hno });
        else out.push({ ok: false, hno, error: res.error });
      }
      const summary = summariseLoopResults(out);
      if (summary.failed === 0) {
        setBanner({ kind: "ok", text: t("bulkCancelSuccess", { count: summary.total }) });
        router.refresh();
        // Keep the success toast briefly, then clear so the bar isn't permanently green.
        setTimeout(() => setBanner(null), 4000);
      } else {
        setBanner({
          kind: "err",
          text: t("bulkCancelPartial", {
            ok: summary.ok,
            total: summary.total,
            failed: summary.failed,
          }),
        });
      }
      setMode("idle");
    });
  }, [pending, cancelCount, selectedCancelable, t, router]);

  // ── BULK-PAY — STOP ON FIRST FAILURE (AGENTS.md §0e pay mode: don't drain
  // wallet on partial failures). Sequential `for (... of ...)`, not Promise.all.
  const onBulkPay = useCallback(async () => {
    if (pending) return;
    if (payCount === 0) {
      setBanner({ kind: "err", text: t("selectOrdersToPay") });
      return;
    }
    if (!coverage.ok) {
      setBanner({
        kind: "err",
        text: t("walletInsufficient", {
          have: walletBalance.toLocaleString("th-TH", { minimumFractionDigits: 2 }),
          need: priceAll.toLocaleString("th-TH", { minimumFractionDigits: 2 }),
          short: coverage.shortfall.toLocaleString("th-TH", { minimumFractionDigits: 2 }),
        }),
      });
      return;
    }
    if (!(await confirm(t("bulkPayConfirm", {
      count: payCount,
      total: priceAll.toLocaleString("th-TH", { minimumFractionDigits: 2 }),
    })))) return;

    setBanner(null);
    setMode("pay");
    startTransition(async () => {
      const targets = selectedPayable;
      const out: LoopOutcome[] = [];
      let stoppedAt: string | null = null;
      let stopReason: string | null = null;
      for (const hno of targets) {
        const res = await payServiceOrderFromWallet(hno);
        if (res.ok) {
          out.push({ ok: true, hno });
        } else {
          out.push({ ok: false, hno, error: res.error });
          stoppedAt = hno;
          stopReason = res.error;
          break; // STOP — protect the wallet from continuing failures
        }
      }
      const summary = summariseLoopResults(out);
      if (summary.failed === 0) {
        setBanner({ kind: "ok", text: t("bulkPaySuccess", { count: summary.total }) });
        router.refresh();
        setTimeout(() => setBanner(null), 4000);
      } else {
        // Partial-failure: surface "หยุดที่รายการ X เพราะ Y" — much clearer
        // than the generic bulk-pay-partial copy because the loop ABORTED.
        const stoppedMsg = t("bulkPayStoppedAt", {
          hno: stoppedAt ?? "",
          reason: stopReason ?? "",
          ok: summary.ok,
          total: targets.length,
        });
        setBanner({ kind: "err", text: stoppedMsg });
        // Refresh anyway so successful rows update their visible status.
        router.refresh();
      }
      setMode("idle");
    });
  }, [
    pending, payCount, coverage, walletBalance, priceAll, selectedPayable, t, router,
  ]);

  // Bar is hidden when there's nothing actionable in the current view.
  // (Early-return AFTER all hooks per react-hooks/rules-of-hooks.)
  if (ctx.payableHNos.length === 0 && ctx.cancelableHNos.length === 0) return null;

  // toggleAll is a plain handler (no hook) → safe to define after the early return.
  function toggleAll() {
    ctx.cancelableHNos.forEach((h) => {
      const isOn = ctx.selected.has(h);
      if (allCancelableChecked) {
        if (isOn) ctx.toggle(h);
      } else if (!isOn) {
        ctx.toggle(h);
      }
    });
  }

  return (
    <div
      className="fixed inset-x-0 bottom-24 md:bottom-5 z-[55] pl-3 pr-20 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-0 md:flex md:justify-center pointer-events-none"
    >
      <div className="pointer-events-auto mx-auto md:mx-0 w-full md:max-w-3xl rounded-2xl border border-border bg-white dark:bg-surface shadow-lg p-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* ── Select all + counts (left column on desktop, top on mobile) */}
          <label className="flex items-center gap-2 text-xs text-muted shrink-0 cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              className="h-5 w-5 accent-red-600"
              checked={allCancelableChecked}
              onChange={toggleAll}
              aria-label={t("selectAllAria")}
            />
            <CheckSquare className="w-4 h-4 hidden md:inline text-muted" />
            <span className="font-medium text-foreground">{t("selectAllAria")}</span>
          </label>

          {/* ── Counts + price (middle column) */}
          <div className="flex-1 min-w-0 text-sm">
            <div className="text-[11.5px] text-muted">
              {t("itemCountLabel")}: <b className="text-foreground">{String(cancelCount).padStart(2, "0")}</b>
              <span className="mx-2 text-border">·</span>
              {t("bulkPayCountLabel")}: <b className="text-foreground">{String(payCount).padStart(2, "0")}</b>
            </div>
            <b className="block text-[13px] mt-0.5">
              {t("totalPayableLabel")}:{" "}
              <span className="text-rose-700">
                {priceAll > 0
                  ? priceAll.toLocaleString("th-TH", { minimumFractionDigits: 2 })
                  : "0.00"}
              </span>{" "}
              {t("bahtUnit")}
            </b>
            {!coverage.ok && payCount > 0 && (
              <p className="text-[11px] text-rose-600 mt-0.5">
                {t("walletShortfallHint", {
                  short: coverage.shortfall.toLocaleString("th-TH", { minimumFractionDigits: 2 }),
                })}
              </p>
            )}
          </div>

          {/* ── Buttons — stacked on mobile, side-by-side on desktop */}
          <div className="flex flex-col sm:flex-row items-stretch gap-2 shrink-0">
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-600 bg-white text-rose-700 hover:bg-rose-50 disabled:opacity-50 text-sm font-bold px-4 py-2.5 min-h-[44px] transition-colors"
              onClick={onBulkCancel}
              disabled={pending || cancelCount === 0}
              aria-label={t("bulkCancelButton")}
            >
              <Trash2 className="w-4 h-4" strokeWidth={2.4} />
              {pending && mode === "cancel"
                ? t("cancelling")
                : t("bulkCancelCountedButton", { count: cancelCount })}
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-bold px-4 py-2.5 min-h-[44px] transition-colors"
              onClick={onBulkPay}
              disabled={pending || payCount === 0 || !coverage.ok}
              aria-label={t("payButton")}
              title={!coverage.ok ? t("walletShortfallHint", {
                short: coverage.shortfall.toLocaleString("th-TH", { minimumFractionDigits: 2 }),
              }) : undefined}
            >
              <Wallet className="w-4 h-4" strokeWidth={2.4} />
              {pending && mode === "pay"
                ? t("paying")
                : t("bulkPayCountedButton", { count: payCount })}
            </button>
          </div>
        </div>
        {banner && (
          <div
            className={
              "rounded-md text-xs px-2 py-1.5 mt-2 text-white " +
              (banner.kind === "ok" ? "bg-emerald-600" : "bg-red-600")
            }
            role="status"
          >
            {banner.text}
          </div>
        )}
      </div>
    </div>
  );
}
