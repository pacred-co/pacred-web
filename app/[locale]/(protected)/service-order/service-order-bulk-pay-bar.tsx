"use client";

/**
 * Customer-side bulk-action bar — ยกเลิก N รายการ in one sticky floating
 * bottom-bar. Faithful to legacy `member/include/pages/shops/getList.php`.
 *
 * 2026-06-22 (owner D1 "ถอด wallet ทุกจุด"): the bulk **pay-from-wallet** action
 * was REMOVED. Customers now pay each order via QR + slip on the order detail
 * (the `payServiceOrderFromWallet` chokepoint is retired). This bar keeps only
 * the still-valid bulk-CANCEL (multi-select cancel for a power user with several
 * pending orders); paying is per-order slip, not wallet.
 *
 * Key UX rules:
 *   §0e — bulk-cancel: best-effort per-row loop, summary toast at end.
 *   §0f — confirm-before-mutate: opens a confirm dialog showing the count.
 *   §6  — mobile-first: works at 360px (sticky bottom, z-55 clears the LINE bubble).
 * Per Next 16: no `Date.now()` / `new Date()` in render body.
 */

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Trash2, CheckSquare } from "lucide-react";
import { cancelServiceOrder } from "@/actions/service-order";
import { confirm } from "@/components/ui/confirm";
import { summariseLoopResults, type LoopOutcome } from "@/lib/service-order/bulk-eligibility";
// Re-use the selection context + RowCheckbox + provider from the existing module.
import { useBulkSelection } from "./add/service-order-bulk-actions";

type Banner = { kind: "ok" | "err"; text: string };

export function ServiceOrderBulkActionsBar(
  // walletBalance prop kept for call-site compatibility but no longer used
  // (wallet-pay retired · D1 2026-06-22).
  _props: { walletBalance: number },
) {
  void _props;
  const t = useTranslations("serviceOrder");
  const router = useRouter();
  const ctx = useBulkSelection();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner | null>(null);

  const selectedCancelable = useMemo(
    () => ctx.cancelableHNos.filter((h) => ctx.selected.has(h)),
    [ctx.cancelableHNos, ctx.selected],
  );
  const cancelCount = selectedCancelable.length;
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
    startTransition(async () => {
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
        setTimeout(() => setBanner(null), 4000);
      } else {
        setBanner({
          kind: "err",
          text: t("bulkCancelPartial", { ok: summary.ok, total: summary.total, failed: summary.failed }),
        });
      }
    });
  }, [pending, cancelCount, selectedCancelable, t, router]);

  // Bar shows only when there's something cancelable in view.
  if (ctx.cancelableHNos.length === 0) return null;

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
    <div className="fixed inset-x-0 bottom-24 md:bottom-5 z-[55] pl-3 pr-20 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-0 md:flex md:justify-center pointer-events-none">
      <div className="pointer-events-auto mx-auto md:mx-0 w-full md:max-w-2xl rounded-2xl border border-border bg-white dark:bg-surface shadow-lg p-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
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

          <div className="flex-1 min-w-0 text-sm">
            <div className="text-xs text-muted">
              {t("itemCountLabel")}: <b className="text-foreground">{String(cancelCount).padStart(2, "0")}</b>
            </div>
            <p className="text-[11px] text-muted mt-0.5">ชำระเงิน: กดเข้าไปที่รายการ → แนบสลิป (QR)</p>
          </div>

          <div className="flex items-stretch gap-2 shrink-0">
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-600 bg-white text-rose-700 hover:bg-rose-50 disabled:opacity-50 text-sm font-bold px-4 py-2.5 min-h-[44px] transition-colors"
              onClick={onBulkCancel}
              disabled={pending || cancelCount === 0}
              aria-label={t("bulkCancelButton")}
            >
              <Trash2 className="w-4 h-4" strokeWidth={2.4} />
              {pending ? t("cancelling") : t("bulkCancelCountedButton", { count: cancelCount })}
            </button>
          </div>
        </div>
        {banner && (
          <div
            className={"rounded-md text-xs px-2 py-1.5 mt-2 text-white " + (banner.kind === "ok" ? "bg-emerald-600" : "bg-red-600")}
            role="status"
          >
            {banner.text}
          </div>
        )}
      </div>
    </div>
  );
}
