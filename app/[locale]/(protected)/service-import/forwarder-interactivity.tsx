"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { calculateForwarderTotal } from "@/actions/forwarder";
import {
  ForwarderRowView,
  calPriceForwarderSumCompany,
  type ForwarderRow,
} from "./forwarder-row-view";
import { ForwarderPayModal } from "./forwarder-pay-modal";

/**
 * Client-side interactivity for `/service-import` — Tailwind card-list
 * rebuild (เดฟ 2026-05-27 — ปอน: "rebuild css เป็น tailwind ให้หน่อย").
 * Was a faithful port of the jQuery + DataTables block in
 * `member/forwarder.php` L1273-1409 rendered inside a `<table>`; now
 * renders a stacked card list driven by the same per-row data + the
 * same `calPrice.php` Server-Action recompute.
 *
 * Contract preserved (NO relations changed):
 *   · `calculateForwarderTotal` Server Action still drives the live
 *     "ยอดชำระรวม" recompute.
 *   · `ForwarderPayModal` opens with the selected-id set on "ชำระเงิน".
 *   · Initial-selection mirrors the legacy `initComplete` — rows where
 *     `data-status='5'` or `data-credit='1'` are pre-checked.
 *   · `<form id="frm-example2">` kept (some `.b-pay`-adjacent legacy
 *     CSS rules target it) but `#myTable` `<table>` markup is GONE —
 *     replaced by a flex-column card list.
 *   · `#example-console-rows` debug div kept (was always empty, but
 *     legacy code paths may reach for it).
 *
 * Cross-RSC contract — every prop is plain-serializable; no function
 * props cross the boundary except the `"use server"`
 * `calculateForwarderTotal` Server Action.
 */

// PHP `number_format($n, 2)` — 2 decimals, comma thousands separator.
function numberFormat2(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export type ForwarderInteractivityProps = {
  /** Plain-object rows (primitives only). */
  rowsData: ForwarderRow[];
  /** Plain Array — legacy `arrFidDriver` Set normalised. */
  arrFidDriver: number[];
  /** Current `?q=` value. */
  q: string;
  /** Juristic flag — passed through to `<ForwarderPayModal>`. */
  isJuristic: boolean;
  /** Render the bottom pay-bar (legacy L841 condition). */
  showPayBar: boolean;
  /** Render the "โปรเหมาๆ" headShake strip (legacy L600). */
  showMaoStrip: boolean;
  /** Render the "รวมบิลจ่าย" headShake strip (legacy L831-836). */
  showPayStrip: boolean;
  /** Column count — kept in the API for compat; the card list doesn't
   *  use it anymore. */
  columnCount: number;
  /** Admin-editable promo banners for this page (location='import') —
   *  resolved server-side in page.tsx via getActivePromoBanners (already
   *  filtered to enabled + in-date + sorted; may be the legacy single promo
   *  via the backward-compat fallback). The legacy `showMaoStrip` condition
   *  still gates whether the strips render at all. */
  maoPromos: MaoPromoCard[];
}

/** One resolved promo card — see lib/promo/banners.ts. All fields
 *  plain-serializable so they cross the RSC boundary cleanly. The
 *  enabled/date gating is done server-side, so only display fields cross. */
export type MaoPromoCard = {
  headline: string;
  text: string;
  amount: number;
  /** Image URL or "" for none. */
  imageUrl: string;
};

export function ForwarderInteractivity({
  rowsData,
  arrFidDriver,
  q,
  isJuristic,
  showPayBar,
  showMaoStrip,
  showPayStrip,
  maoPromos,
  // columnCount kept in the prop type for binary compat with page.tsx;
  // the card list doesn't need it.
}: ForwarderInteractivityProps) {
  // Pre-compute per-row total + eligibility once.
  const enrichedRows = useMemo(() => {
    return rowsData.map((row) => {
      const totalPriceNet = calPriceForwarderSumCompany(
        row.fusercompany,
        row.fpriceupdate,
        row.ftotalprice,
        row.ftransportprice,
        row.fshippingservice,
        row.fdiscount,
        row.pricecrate,
        row.ftransportpricechnthb,
        row.priceother,
      );
      const eligibleForPay =
        row.fstatus === "5" || row.fcredit === "1";
      return { ...row, totalPriceNet, eligibleForPay };
    });
  }, [rowsData]);

  // Eligible IDs — legacy `initComplete` (forwarder.php L1298-1305).
  const eligibleIds = useMemo(
    () => enrichedRows.filter((r) => r.eligibleForPay).map((r) => r.id),
    [enrichedRows],
  );

  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    () => new Set(eligibleIds),
  );

  // Optimistic total — sums per-row net prices immediately.
  const optimisticTotal = useMemo(() => {
    let sum = 0;
    for (const r of enrichedRows) {
      if (selectedIds.has(r.id)) sum += r.totalPriceNet;
    }
    return sum;
  }, [enrichedRows, selectedIds]);

  const [serverTotal, setServerTotal] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function recompute(nextSelected: Set<number>) {
    const ids = Array.from(nextSelected);
    if (ids.length === 0) {
      setServerTotal(null);
      return;
    }
    startTransition(async () => {
      const res = await calculateForwarderTotal({ ids });
      if (res.ok) {
        setServerTotal(res.price);
      } else {
        setServerTotal(null);
      }
    });
  }

  function toggleRow(id: number, next: boolean) {
    const ns = new Set(selectedIds);
    if (next) ns.add(id);
    else ns.delete(id);
    setSelectedIds(ns);
    recompute(ns);
  }

  function toggleAll(next: boolean) {
    const ns = next ? new Set(eligibleIds) : new Set<number>();
    setSelectedIds(ns);
    recompute(ns);
  }

  const submitDisabled = selectedIds.size === 0;
  const [payModalOpen, setPayModalOpen] = useState(false);
  function handleBulkPay() {
    if (selectedIds.size === 0) return;
    setPayModalOpen(true);
  }

  const selectedRows = useMemo(
    () => enrichedRows.filter((r) => selectedIds.has(r.id)),
    [enrichedRows, selectedIds],
  );
  const allChecked =
    eligibleIds.length > 0 && selectedIds.size === eligibleIds.length;

  // Display total — prefer server-formatted, fall back to optimistic.
  const displayTotal =
    serverTotal !== null ? serverTotal : numberFormat2(optimisticTotal);

  // ── BUG #1/#2 fix — when the sticky pay-bar is on screen, flag the body
  //    so the global FloatingTabs lifts its LINE bubble above the pay-bar
  //    (globals.css `body.has-import-paybar`). Without this the LINE
  //    bubble (z-51) overlapped the pay-bar and stole the "ชำระเงิน" tap.
  //    The class is removed on unmount / when the bar hides so every other
  //    page is unaffected (same pattern as `no-bottom-tabs`).
  useEffect(() => {
    if (!showPayBar) return;
    document.body.classList.add("has-import-paybar");
    return () => document.body.classList.remove("has-import-paybar");
  }, [showPayBar]);

  // The promo banners are resolved server-side (enabled + in-date + sorted)
  // in page.tsx via getActivePromoBanners — no client-side date math needed.
  // The legacy visibility condition (showMaoStrip) still gates whether the
  // strip renders at all, so it only shows when there ARE status-5 rows.

  return (
    <>
      {/* ── (cond.) "โปรเหมาๆ" strips — forwarder.php L600. Tailwind
              rebuild of the headShake legacy strip (animation kept by
              `animate__animated animate__headShake` classes — vendor
              CSS still loads it). Now renders MULTIPLE admin-managed promos
              (multi-promo manager · /admin/settings/promos). ── */}
      {showMaoStrip &&
        maoPromos.map((promo, i) => (
          <div key={i} className="my-3 mx-auto max-w-[640px]">
            <div className="rounded-2xl bg-red-600 text-white text-center px-4 py-3 shadow-md shadow-red-600/20 animate__animated animate__infinite animate__headShake">
              {promo.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={promo.imageUrl}
                  alt=""
                  className="mx-auto mb-2 max-h-24 w-auto object-contain"
                />
              )}
              {promo.headline && (
                <div className="text-sm font-bold mb-1">{promo.headline}</div>
              )}
              <div className="text-[12px] leading-snug whitespace-pre-line">
                {promo.text}
              </div>
              {promo.amount > 0 && (
                <div className="mt-1.5 text-[11px] font-semibold opacity-90">
                  ส่วนลดสูงสุด {numberFormat2(promo.amount)} บาท
                </div>
              )}
            </div>
          </div>
        ))}

      {/* ── Card list — `<form id="frm-example2">` kept so any legacy
              CSS rule targeting the form id still applies. The legacy
              `<table id="myTable">` is gone; rows are stacked cards. */}
      <form id="frm-example2" className="space-y-3">
        {enrichedRows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-white p-8 text-center shadow-sm dark:bg-surface md:p-12">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/Iconistpack/transport%20system.png"
              alt=""
              className="mx-auto mb-4 h-40 w-40 object-contain opacity-70 md:h-52 md:w-52"
            />
            <h3 className="text-[15px] font-bold text-foreground md:text-[17px]">
              ไม่พบรายการ
            </h3>
          </div>
        ) : (
          enrichedRows.map((row) => (
            <ForwarderRowView
              key={row.id}
              row={row}
              q={q}
              arrFidDriver={arrFidDriver}
              selectable={row.eligibleForPay}
              checked={selectedIds.has(row.id)}
              onToggleCheck={toggleRow}
            />
          ))
        )}
        <div id="example-console-rows" />
      </form>

      {/* ── (cond.) "รวมบิลจ่าย" PCSF strip — forwarder.php L831-836 ── */}
      {showPayStrip && (
        <div className="my-3 rounded-2xl bg-red-600 text-white text-center px-4 py-3 shadow-md shadow-red-600/20 animate__animated animate__infinite animate__headShake">
          <div className="text-xs md:text-sm leading-snug">
            คุณมีรายการรอชำระเงินที่ใช้ Pacred เหมาๆ มากกว่า 1 รายการ
            <br />
            การรวมบิลจ่ายจะช่วยให้คุณได้รับส่วนลด
          </div>
        </div>
      )}

      {/* ── Bottom pay-bar — forwarder.php L840-862. Tailwind rebuild.
            🔧 BUG #1/#2 fix (2026-06-01): the bar now owns the highest
               stacking context near the bottom (`z-[55]`) so its
               "ชำระเงิน" button always receives the tap — previously it
               sat at z-[44], BELOW the FloatingTabs bottom-nav (z-50) AND
               the floating LINE bubble (z-51), so a transparent overlap
               with the LINE bubble silently stole the click (the owner's
               "กดไม่ได้" report). The mobile bar is now FULL-WIDTH
               (`left-2 right-2`) instead of the awkward `right-20` dodge
               — the LINE bubble is lifted above it via the
               `body.has-import-paybar` signal (globals.css), so they no
               longer overlap.
            ·  Mobile: `bottom-[92px]` sits just above the FloatingTabs
               bottom-nav (~88px incl. safe-area); rounded top corners +
               backdrop-blur floating-card look.
            ·  Desktop: `md:bottom-0` flush to the viewport bottom edge
               (FloatingTabs is a vertical right-rail at md+, nothing at
               the bottom to clear). z-[55] > desktop LINE bubble (z-51).
            ·  Hidden on auth/admin via the route group. */}
      {showPayBar && (
        <div className="fixed left-2 right-2 md:left-0 md:right-0 z-[55] bottom-[92px] md:bottom-0 bg-white/95 dark:bg-surface/95 backdrop-blur-md border border-border md:border-0 md:border-t rounded-2xl md:rounded-none shadow-[0_-6px_24px_rgba(0,0,0,0.12)] md:shadow-[0_-6px_20px_rgba(0,0,0,0.08)] overflow-hidden">
          <div className="flex items-center gap-2 md:gap-3 px-3 py-2 md:px-6 md:py-3 md:pl-[280px] md:pr-[88px]">
            {/* Select-all — icon-only on tight viewports, label appears ≥360px */}
            <label className="flex items-center gap-1.5 shrink-0 cursor-pointer">
              <input
                type="checkbox"
                className="dt-checkboxes check-all w-4 h-4 rounded border-border accent-red-600 cursor-pointer"
                checked={allChecked}
                onChange={(e) => toggleAll(e.target.checked)}
              />
              <span className="text-[10.5px] md:text-xs text-muted whitespace-nowrap">ทั้งหมด</span>
            </label>

            {/* Total — stacked on mobile, inline on desktop */}
            <div className="flex-1 min-w-0 leading-tight">
              <div className="text-[10px] md:text-xs text-muted">
                จำนวน <span className="countPay font-bold text-foreground notranslate">{selectedIds.size}</span> รายการ
              </div>
              <div className="font-bold text-foreground text-xs md:text-sm">
                รวม{" "}
                <span className="notranslate price-all text-red-600 text-base md:text-lg">
                  {displayTotal}
                </span>{" "}
                <span className="text-[10px] md:text-xs text-muted font-normal">บ.</span>
              </div>
            </div>

            {/* Pay button */}
            <button
              type="button"
              id="select"
              disabled={submitDisabled}
              onClick={handleBulkPay}
              className={`shrink-0 inline-flex items-center justify-center gap-1 rounded-full px-4 md:px-6 py-2 md:py-2.5 text-sm md:text-base font-bold transition-all ${
                submitDisabled
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-red-600 text-white hover:bg-red-700 active:scale-[0.98] shadow-md shadow-red-600/30 animate__animated animate__infinite animate__headShake"
              }`}
            >
              ชำระเงิน
            </button>
          </div>
        </div>
      )}

      {/* Multi-bill payment modal — opened by the pay-bar "ชำระเงิน". */}
      <ForwarderPayModal
        key={
          Array.from(selectedIds)
            .sort((a, b) => a - b)
            .join(",")
        }
        rows={selectedRows}
        isJuristic={isJuristic}
        open={payModalOpen}
        onClose={() => setPayModalOpen(false)}
      />
    </>
  );
}
