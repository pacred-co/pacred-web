"use client";

import { useMemo, useState, useTransition } from "react";
import { calculateForwarderTotal } from "@/actions/forwarder";
import {
  ForwarderRowView,
  calPriceForwarderSumCompany,
  type ForwarderRow,
} from "./forwarder-row-view";

/**
 * Client-side interactivity for `/service-import` — faithful port of
 * the jQuery block in `member/forwarder.php` L1273-1409 + the
 * `calPrice.php` AJAX recompute it drives (D1 / ADR-0017).
 *
 * The SSR page (`app/[locale]/(protected)/service-import/page.tsx`)
 * renders the static chrome (breadcrumbs, status-filter tabs, the
 * "เพิ่มรายการนำเข้า" button, the corporate-pending gate, both
 * modals + the "โปรเหมาๆ" / "รวมบิล" headShake strips). This
 * component takes the per-row serialised data + owns:
 *
 *   - `<thead>` (the column header row) — legacy forwarder.php L599-621
 *   - `<tbody>` (one `<tr>` per row, first `<td>` adds the
 *     DataTables `.dt-checkboxes` overlay around the ID — legacy
 *     L1280-1336)
 *   - the "เลือกทั้งหมด" (.check-all) toggle in the bottom pay-bar
 *   - the live "จำนวนรายการ" / "ยอดชำระรวม" counters in the bottom
 *     pay-bar — legacy L840-862, driven by the `calPrice.php` AJAX
 *     replaced here by the `calculateForwarderTotal` Server Action.
 *   - the "ชำระเงิน" submit (disabled when nothing selected — legacy
 *     L1357 `rows_selected.join(',')`).
 *
 * The legacy CSS classes (.dt-checkboxes / .check-all / .b-pay /
 * .btn-pay-pc / .countPay / .price-all / etc.) are kept verbatim so
 * the static `/legacy/pcs/service-import.css` rules match 1:1.
 *
 * Cross-RSC contract — every prop is plain-serializable:
 *   - rowsData: ForwarderRowData[] (primitives only)
 *   - arrFidDriver: number[] (legacy Set normalised at page.tsx)
 *   - q / showPayBar / showPayStrip / showMaoStrip / columnCount
 *     are strings / booleans / numbers
 * NO functions cross the boundary (besides the `"use server"`
 * `calculateForwarderTotal` Server Action, which is the allowed
 * exception). This is the fix-pattern that replaces the previous
 * `renderRow={(rowId, checkbox) => …}` violation that caused the
 * `/service-import?q=5` 500 (RSC serialization error).
 */

// PHP `number_format($n, 2)` — 2 decimals, comma thousands separator.
function numberFormat2(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export type ForwarderInteractivityProps = {
  /** Plain-object rows — already includes `totalPriceNet` +
   *  `eligibleForPay` to avoid recomputing client-side. */
  rowsData: ForwarderRow[];
  /** Plain Array — legacy `arrFidDriver` Set normalised. */
  arrFidDriver: number[];
  /** Current `?q=` value — controls extra credit columns + helper
   *  predicates. */
  q: string;
  /** Whether to render the bottom pay-bar (legacy L841 condition). */
  showPayBar: boolean;
  /** Whether to render the "โปรเหมาๆ" headShake strip above the
   *  table (legacy L600). */
  showMaoStrip: boolean;
  /** Whether to render the "รวมบิลจ่าย" headShake strip below the
   *  table (legacy L831-836). */
  showPayStrip: boolean;
  /** Column count — controls the colSpan of the empty-state row.
   *  q=='c' adds 2 extra columns (วันที่ให้เครดิต / วันที่ครบกำหนด). */
  columnCount: number;
};

export function ForwarderInteractivity({
  rowsData,
  arrFidDriver,
  q,
  showPayBar,
  showMaoStrip,
  showPayStrip,
  columnCount,
}: ForwarderInteractivityProps) {
  // Pre-compute per-row total + eligibility once (the row was
  // serialised by the server, so the helper is deterministic).
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

  // Eligible IDs — the legacy `initComplete` (forwarder.php L1298-1305)
  // ticks the rows whose row has `data-status='5'`/`data-credit='1'`
  // on first paint. We mirror that initial-selection behaviour.
  const eligibleIds = useMemo(
    () => enrichedRows.filter((r) => r.eligibleForPay).map((r) => r.id),
    [enrichedRows],
  );

  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    () => new Set(eligibleIds),
  );

  // Optimistic total — sum the per-row net prices client-side
  // immediately on toggle (matches legacy `calPrice.php` returning
  // ~instantly because the server does the same arithmetic). The
  // Server Action then replaces it with the canonical formatted
  // total (which also applies the +50 ฿ PCSF flat fee + the -1%
  // juristic discount the legacy `calPrice.php` applies).
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

  // The legacy `<input id="select">` (forwarder.php L860) submits
  // the selected ids to the bulk-pay flow — wired UNLESS empty.
  // The destination route is the legacy "ชำระเงิน multi-bill" page;
  // until that Server Action lands the click no-ops (logged), but
  // the disabled state mirrors the legacy guard at L1357.
  const submitDisabled = selectedIds.size === 0;
  const allChecked =
    eligibleIds.length > 0 && selectedIds.size === eligibleIds.length;

  // Display total — prefer server-formatted, fall back to optimistic
  // (which doesn't include the +50 ฿ PCSF flat / -1% juristic yet,
  // but renders immediately on toggle).
  const displayTotal =
    serverTotal !== null ? serverTotal : numberFormat2(optimisticTotal);

  return (
    <>
      {/* ── (cond.) "โปรเหมาๆ" headShake strip — forwarder.php L600 ── */}
      {showMaoStrip && (
        <div className="row">
          <div className="col-md-6 offset-md-3">
            <div className="p-1 bg-main text-center text-white animate__animated animate__infinite animate__headShake">
              โปรเหมาๆ
              <br />
              “หากลูกค้าชำระค่าขนส่งในไทยก่อนเวลา 00.00 น. บริษัทฯ จะจัดส่งสินค้าให้ภายใน 1-3 วันทำการ นับจากวันที่ชำค่าขนส่ง”
            </div>
          </div>
        </div>
      )}

      {/* ── `#frm-example2` + #myTable — forwarder.php L595-825 ── */}
      <form id="frm-example2">
        <div className="table-responsive p-2">
          <table
            id="myTable"
            className="table display table-bordered table-striped dataTable no-footer dtr-inline"
          >
            <thead>
              <tr className="text-center bg-danger2">
                <th className="all add-text-all">ID</th>
                <th className="none">วันที่สร้าง</th>
                <th className="all">รายละเอียด</th>
                <th className="none">ค่าขนส่ง</th>
                <th className="none">เลขแทรคกิ้งจีน</th>
                <th className="none">เลขพัสดุ (ไทย)</th>
                <th className="none">สถานะ</th>
                {q === "c" && (
                  <>
                    <th className="bg-danger3">วันที่ให้เครดิต</th>
                    <th className="bg-danger3">วันที่ครบกำหนด</th>
                  </>
                )}
                <th className="none">ตัวเลือก</th>
              </tr>
            </thead>
            <tbody>
              {enrichedRows.length === 0 ? (
                <tr>
                  <td className="text-center" colSpan={columnCount}>
                    <i>ไม่พบรายการ</i>
                  </td>
                </tr>
              ) : (
                enrichedRows.map((row) => {
                  const isSelectable = row.eligibleForPay;
                  const checked = selectedIds.has(row.id);
                  return (
                    <tr key={row.id}>
                      {/* Legacy first-cell — DataTables targets:0
                          overlays the row-select checkbox onto the
                          ID cell (forwarder.php L1290-1295). 1:1: the
                          checkbox + the legacy ID number share the
                          first `<td>`. */}
                      <td className="text-center tr1 cursor-pointer">
                        {isSelectable ? (
                          <>
                            <input
                              type="checkbox"
                              className="dt-checkboxes"
                              name="ID[]"
                              value={row.id}
                              checked={checked}
                              onChange={(e) =>
                                toggleRow(row.id, e.target.checked)
                              }
                            />
                            <br />
                          </>
                        ) : null}
                        {row.id}
                      </td>
                      {/* Remaining cells — rendered by the shared
                          row-view (no `<tr>`, no leading ID `<td>`). */}
                      <ForwarderRowView
                        row={row}
                        q={q}
                        arrFidDriver={arrFidDriver}
                        skipFirstCell
                      />
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div id="example-console-rows"></div>
      </form>

      {/* ── (cond.) "รวมบิลจ่าย" headShake strip — forwarder.php L831-836 ── */}
      {showPayStrip && (
        <div className="m-1 p-1 bg-main text-white animate__animated animate__infinite animate__headShake">
          คุณมีรายการรอชำระเงินที่ใช้ PR เหมาๆ มากกว่า 1 รายการ การรวมบิลจ่ายจะช่วยให้คุณได้รับส่วนลด
        </div>
      )}

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
                      checked={allChecked}
                      onChange={(e) => toggleAll(e.target.checked)}
                    />
                    <br />
                    เลือกทั้งหมด
                  </div>
                  <div className="col-6 p-05">
                    จำนวนรายการ :{" "}
                    <span className="countPay">{selectedIds.size}</span>
                    <br />
                    <b>
                      ยอดชำระรวม :{" "}
                      <span className="notranslate text-danger price-all">
                        {displayTotal}
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
    </>
  );
}
