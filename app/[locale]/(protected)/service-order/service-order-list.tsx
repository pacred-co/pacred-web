"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { ServiceOrderSummary } from "@/actions/service-order";
import { cancelServiceOrder } from "@/actions/service-order";
import { Eye, Package, Printer, FileText, XCircle, Wallet } from "lucide-react";

const STATUS_BADGE: Record<ServiceOrderSummary["status"], string> = {
  pending:               "bg-gray-100 text-gray-700",
  awaiting_payment:      "bg-amber-100 text-amber-700",
  ordered:               "bg-blue-100 text-blue-700",
  awaiting_chn_dispatch: "bg-indigo-100 text-indigo-700",
  completed:             "bg-emerald-100 text-emerald-700",
  cancelled:             "bg-red-100 text-red-700",
};

// Legacy shops.php gates the per-row actions on hStatus:
//  - cancel  : hStatus <= 2  (pending | awaiting_payment)
//  - pay     : hStatus == 2  (awaiting_payment)
//  - receipt : hStatus == 5  (completed)
//  - invoice : hStatus 2..5  (awaiting_payment .. completed)
const CANCELLABLE: ServiceOrderSummary["status"][] = ["pending", "awaiting_payment"];
const INVOICEABLE: ServiceOrderSummary["status"][] = [
  "awaiting_payment", "ordered", "awaiting_chn_dispatch", "completed",
];

export function ServiceOrderList({
  items,
  activeFilter = "all",
}: {
  items: ServiceOrderSummary[];
  activeFilter?: string;
}) {
  const t = useTranslations("serviceOrder");
  const tp = useTranslations("pcsOrder");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Selection drives the legacy bulk-cancel button + the sticky pay bar.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Only awaiting_payment rows feed the sticky "ชำระเงิน" bar (legacy: hStatus==2).
  const payableRows = useMemo(
    () => items.filter((o) => o.status === "awaiting_payment" && o.h_no),
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

  function onBulkCancel() {
    const targets = selectedCancellable.map((o) => o.h_no).filter(Boolean) as string[];
    if (targets.length === 0) return;
    if (!confirm(tp("bulkCancelConfirm", { count: targets.length }))) return;
    startTransition(async () => {
      await Promise.all(targets.map((hNo) => cancelServiceOrder(hNo)));
      setSelected(new Set());
      router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-white dark:bg-surface p-12 text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-surface-alt text-muted">
          <Package className="w-7 h-7" />
        </div>
        <p className="mt-3 text-sm font-medium text-foreground">
          {activeFilter === "all" ? t("listEmpty") : tp("emptyFilter")}
        </p>
        <p className="mt-1 text-xs text-muted">{tp("emptyHint")}</p>
        <Link
          href="/service-order/add"
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
            <XCircle className="w-3.5 h-3.5" /> {tp("bulkCancel")}
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
                const selectable = !!o.h_no && (o.status === "awaiting_payment" || CANCELLABLE.includes(o.status));
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
                      <div>{created.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.</div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      {o.h_no ? (
                        <Link href={`/service-order/${o.h_no}`} className="font-mono text-xs text-primary-600 hover:underline">
                          {o.h_no}
                        </Link>
                      ) : <span className="text-muted">—</span>}
                      {o.payment_due_at && o.status === "awaiting_payment" && (
                        <div className="mt-1 text-[10px] text-amber-700">
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
                            {o.warehouse_china && <> · {o.warehouse_china === "yiwu" ? "อี้อู" : "กวางโจว"}</>}
                            {o.ship_by && <> · {o.ship_by}</>}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[o.status]}`}>
                        {t(`status.${o.status}` as Parameters<typeof t>[0])}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono align-top">
                      <div className="text-sm font-bold text-red-600">
                        {Number(o.total_thb).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </div>
                      {o.yuan_rate_locked && (
                        <div className="text-[10px] text-muted">@ ฿{Number(o.yuan_rate_locked).toFixed(4)}/¥</div>
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
                          {/* Pay — legacy hStatus==2 */}
                          {o.status === "awaiting_payment" && (
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
                              onClick={() => {
                                if (!o.h_no) return;
                                if (!confirm(tp("cancelOneConfirm", { hNo: o.h_no }))) return;
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
                          {/* Receipt — legacy hStatus==5 (completed) */}
                          {o.status === "completed" && (
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

      {/* Sticky "ชำระเงิน" bar — legacy .b-pay fixed bottom bar */}
      {payableRows.length > 0 && (
        <div className="sticky bottom-3 z-30 mx-auto max-w-[680px]">
          <div className="rounded-2xl border border-primary-200 bg-white dark:bg-surface shadow-lg shadow-primary-900/10 px-4 py-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <label className="flex items-center gap-2 text-xs sm:text-sm">
                <input
                  type="checkbox"
                  checked={payableRows.every((o) => o.h_no && selected.has(o.h_no))}
                  onChange={toggleAllPayable}
                  className="accent-primary-600"
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
              {selectedPayable.length === 1 && selectedPayable[0].h_no ? (
                <Link
                  href={`/service-order/${selectedPayable[0].h_no}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-primary-500 to-primary-700 text-white px-4 py-2 text-xs sm:text-sm font-bold shadow-sm hover:shadow-md"
                >
                  <Wallet className="w-4 h-4" /> {tp("pay")}
                </Link>
              ) : (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full bg-surface-alt text-muted px-4 py-2 text-xs sm:text-sm font-semibold cursor-default"
                  title={tp("payOneHint")}
                >
                  <Wallet className="w-4 h-4" /> {tp("pay")}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
