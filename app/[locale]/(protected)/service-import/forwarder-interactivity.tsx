"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { calculateForwarderTotal } from "@/actions/forwarder";

/**
 * Client-side interactivity for /service-import — faithful port of
 * the jQuery + DataTables row-select / pay-bar logic in
 * `member/forwarder.php` L1280-1409 (D1 / ADR-0017).
 *
 * The SSR page (`app/[locale]/(protected)/service-import/page.tsx`)
 * renders the static chrome (tab strips, status badges, modals, etc.)
 * and produces the per-row markup via `<ForwarderRowView>`. The
 * server passes this component:
 *   - the array of row ids + their eligible-for-pay flag + their
 *     legacy `totalPriceNet` (used for the optimistic client total
 *     while the action call is in-flight)
 *   - the rendered row markup as a `ReactNode[]` so the table still
 *     renders the exact `<ForwarderRowView>` shape; the client
 *     injects only the row-select checkbox via the `firstCellPrefix`
 *     slot prop on each `<ForwarderRowView>` instance
 *   - whether the pay-bar should show (forwarder.php L841)
 *
 * Interactive behaviour reproduced 1:1:
 *   - per-row checkbox toggle              (forwarder.php L1398-1409)
 *   - "เลือกทั้งหมด" (.check-all) toggle     (forwarder.php L1273-1278 / L1373-1382)
 *   - countPay + price-all recompute       (forwarder.php L1384-1395 / L1408)
 *   - "ชำระเงิน" button disabled when none selected (legacy doesn't
 *     disable but the legacy POST is a no-op without ids — disabling
 *     is faithful to the user-visible intent)
 *
 * Note — the actual "ชำระเงิน" submit (forwarder.php L1427-1440 →
 * `getListPayForwarder.php`) is OUT OF SCOPE for the interactivity
 * wiring; it belongs on a separate Server Action that creates the
 * pay-multi-bill flow. The button currently no-ops; the legacy
 * URL pattern (`/service-import/<fNo>&pay=true`) is the per-row
 * fallback already wired in the row's "ชำระเงิน" link.
 */

// PHP `number_format($n, 2)` — 2 decimals, comma thousands separator.
function numberFormat2(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export type ForwarderRowMeta = {
  /** Forwarder ID — primary key in tb_forwarder. */
  id: number;
  /** Legacy `$totalPriceNet` — calPriceForwarderSumCompany result. */
  totalPriceNet: number;
  /** Whether this row should be included in the "select all" set.
      Legacy uses `fStatus='5' OR fCredit=1` (calPrice.php L21). */
  eligibleForPay: boolean;
};

export type ForwarderInteractivityProps = {
  /** Per-row meta — used to seed selection + drive the client-side
      optimistic total while the server action is in flight. */
  rowsMeta: ForwarderRowMeta[];
  /** The rendered table markup, broken out so the client can inject
      a row-select checkbox into each row's first `<td>` via the
      <ForwarderRowView>'s `firstCellPrefix` slot. The closure form
      lets the client pass per-row `checked` + `onChange` without
      re-rendering the entire row tree (which is server-side). */
  renderRow: (
    rowId: number,
    firstCellPrefix: ReactNode,
  ) => ReactNode;
  /** Number of columns in the table header — drives the empty-state
      colspan if rows is empty. */
  columnCount: number;
  /** Active `?q=` value — drives the q==='c' credit columns + the
      pay-bar visibility (combined with `showPayBar`). */
  q: string;
  /** Whether the bottom fixed pay-bar should render. Mirrors the
      legacy guard at forwarder.php L841 — propagated by the server
      so the rule stays a 1:1 transcription. */
  showPayBar: boolean;
  /** SSR-prerendered "table head" JSX so it sits inside the same
      table element — the client only owns the tbody + the pay-bar. */
  tableHead: ReactNode;
  /** SSR-prerendered "above-table" markup (the headShake "โปรเหมาๆ"
      strip, etc.) that sits inside the same `<form>` as the table. */
  aboveTable: ReactNode;
  /** SSR-prerendered "below-table" markup (the rvm-1-เหมาๆ "รวมบิล"
      headShake banner) that follows the table inside the form. */
  belowTable: ReactNode;
  /** Whether to show the `.btn-pay-pc` strip above the table.
      forwarder.php L843 `if($countStatusF5>0)`. */
  showPayStrip: boolean;
};

export function ForwarderInteractivity({
  rowsMeta,
  renderRow,
  columnCount,
  q,
  showPayBar,
  tableHead,
  aboveTable,
  belowTable,
  showPayStrip,
}: ForwarderInteractivityProps) {
  // Eligible IDs — the "select-all" set is the rows where
  // calPrice.php would have summed them (fStatus=5 OR fCredit=1).
  // forwarder.php L1298-1306 `initComplete: api.cells(api.rows(...)).checkboxes.select()`
  // selects ALL rows by default; combined with the q-filter SQL the
  // legacy effectively pre-selects every visible eligible row.
  const eligibleIds = useMemo(
    () => rowsMeta.filter((r) => r.eligibleForPay).map((r) => r.id),
    [rowsMeta],
  );
  // Pre-tick every eligible row — matches the legacy initComplete
  // behaviour the user sees on first load (forwarder.php L1298-1305).
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    () => new Set(eligibleIds),
  );

  // Optimistic client-side totals computed from rowsMeta — match the
  // legacy formula closely enough for the immediate UI update; the
  // server action then reconciles (handles the +50฿ PCSF fee + the
  // juristic 1% discount the legacy applies in calPrice.php L40-45).
  const optimisticTotals = useMemo(() => {
    let total = 0;
    for (const id of selectedIds) {
      const meta = rowsMeta.find((r) => r.id === id);
      if (meta?.eligibleForPay) total += meta.totalPriceNet;
    }
    return { count: selectedIds.size, price: numberFormat2(total) };
  }, [selectedIds, rowsMeta]);

  const [serverTotals, setServerTotals] = useState<{
    count: number;
    price: string;
  } | null>(null);
  const [, startTransition] = useTransition();

  // Drive a server recompute — mirrors the legacy `loadPrice()`
  // helper (forwarder.php L1384-1395 → calPrice.php).
  function recompute(nextSelected: Set<number>) {
    const ids = Array.from(nextSelected);
    startTransition(async () => {
      const res = await calculateForwarderTotal({ ids });
      if (res.ok) {
        setServerTotals({ count: res.count, price: res.price });
      }
    });
  }

  // forwarder.php L1398-1409 — per-row checkbox change handler.
  function toggleRow(id: number, next: boolean) {
    const ns = new Set(selectedIds);
    if (next) ns.add(id);
    else ns.delete(id);
    setSelectedIds(ns);
    recompute(ns);
  }

  // forwarder.php L1273-1278 / L1373-1382 — "เลือกทั้งหมด" toggle.
  function toggleAll(next: boolean) {
    const ns = next ? new Set(eligibleIds) : new Set<number>();
    setSelectedIds(ns);
    recompute(ns);
  }

  // The displayed totals — prefer the server answer when one has
  // returned, otherwise the optimistic local total. Mirrors the
  // legacy AJAX behaviour: the bar shows the last `loadPrice` reply.
  const display = serverTotals ?? optimisticTotals;
  const submitDisabled = selectedIds.size === 0;

  // "Select all" checkbox state — checked when every eligible row
  // is currently selected (forwarder.php L1404 — only `prop('checked', true)`
  // when countID === total eligible).
  const allEligibleSelected =
    eligibleIds.length > 0 && selectedIds.size === eligibleIds.length;

  return (
    <>
      {/* forwarder.php L595 <form id="frm-example2">. Wrapped here so
          the client-side state lives alongside the table; the legacy
          submit (frm-example2.on('submit') → POST id[]) is NOT wired,
          tracked in the page header §4. */}
      <form id="frm-example2">
        {showPayStrip && (
          <div className="pt-1 text-center text-md-left">
            <div
              style={{ position: "relative" }}
              className="btn-pay-pc"
            ></div>
          </div>
        )}
        {aboveTable}
        <div className="table-responsive p-2">
          <table
            id="myTable"
            className="table display table-bordered table-striped dataTable no-footer dtr-inline"
          >
            {tableHead}
            <tbody>
              {rowsMeta.length === 0 ? (
                <tr>
                  <td colSpan={columnCount}></td>
                </tr>
              ) : (
                rowsMeta.map((meta) => {
                  const checkbox = meta.eligibleForPay ? (
                    <input
                      type="checkbox"
                      name="id[]"
                      value={meta.id}
                      className="dt-checkboxes"
                      checked={selectedIds.has(meta.id)}
                      onChange={(e) =>
                        toggleRow(meta.id, e.target.checked)
                      }
                      // Inline spacing so the legacy markup keeps the
                      // checkbox flush against the ID number text —
                      // matches DataTables' overlay positioning.
                      style={{ marginRight: "6px" }}
                    />
                  ) : null;
                  return renderRow(meta.id, checkbox);
                })
              )}
            </tbody>
          </table>
        </div>
        <div id="example-console-rows"></div>
      </form>
      {belowTable}

      {/* ── bottom fixed pay-bar — forwarder.php L840-862 ── */}
      <div
        className="p-1 p-m-0"
        style={{
          position: "fixed",
          bottom: 0,
          width: "80%",
          zIndex: 999,
        }}
      >
        {showPayBar && (
          <div className="b-pay ">
            <div className="row">
              <div className="col-md-6 offset-md-3">
                <div className="row">
                  <div className="col-3 p-05 text-center">
                    <input
                      type="checkbox"
                      className="dt-checkboxes check-all c6"
                      checked={allEligibleSelected}
                      onChange={(e) => toggleAll(e.target.checked)}
                    />
                    <br />
                    เลือกทั้งหมด
                  </div>
                  <div className="col-6 p-05">
                    จำนวนรายการ :{" "}
                    <span className="countPay">{display.count}</span>
                    <br />
                    <b>
                      ยอดชำระรวม :{" "}
                      <span className="notranslate text-danger price-all">
                        {display.price}
                      </span>{" "}
                      บ.
                    </b>
                  </div>
                  <div
                    className="col-3 p-05 text-right"
                    style={{ marginLeft: "-25px" }}
                  >
                    <button
                      type="button"
                      className="btn btn-color-main waves-effect round animate__animated animate__infinite animate__headShake"
                      id="select"
                      disabled={submitDisabled}
                    >
                      ชำระเงิน
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Tracking attribute so QA + e2e tests can read the active
          ?q= without scraping URLs. */}
      <span hidden data-active-q={q} />
    </>
  );
}
