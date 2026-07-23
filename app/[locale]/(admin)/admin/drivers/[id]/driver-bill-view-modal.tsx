"use client";

/**
 * "ดูบิลใบเสร็จในรายการนี้" — a consolidated, print-ready view of ALL the batch's
 * delivery points grouped by customer/address (ภูม 2026-07-10).
 *
 * Faithful port of legacy forwarder-driver.php `#listBill` → addFromBill.php
 * (action=3): the modal lists every forwarder in the run grouped by
 * userID+carrier+address, columns #/เลขที่ออเดอร์/รหัสสมาชิก/เลขแทรคกิ้ง/location,
 * with a print action. Design = Pacred Tailwind (not Bootstrap). Reuses the
 * page's already-loaded stop data (no extra fetch).
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import { ReceiptText, X, Printer } from "lucide-react";

export type BillGroupItem = {
  no: number;
  orderNo: string;      // #<id> or the running order code
  pr: string;           // รหัสสมาชิก (PR / —)
  customerName: string;
  tracking: string;     // เลขแทรคกิ้ง
  location: string;     // fpallet
  boxes: number;
  weight: number;
  cbm: number;
};

export type BillGroup = {
  key: string;
  pr: string;
  customerName: string;
  carrier: string;      // nameShipBy label
  address: string;
  phones: string[];
  items: BillGroupItem[];
  totalBoxes: number;
  totalWeight: number;
  totalCbm: number;
};

/** Default look — the wide button used inside the bottom action row. */
const TRIGGER_DEFAULT =
  "inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-100";

export function DriverBillViewModal({
  groups,
  batchName,
  printHref,
  triggerClassName = TRIGGER_DEFAULT,
}: {
  groups: BillGroup[];
  batchName: string;
  printHref: string;
  /**
   * Override the trigger's look. The batch header renders this as a compact
   * chip right under the run meta (ปอน 2026-07-23) — staff open the bills far
   * more often than they print, so it belongs beside the run identity rather
   * than buried in the print row at the bottom.
   */
  triggerClassName?: string;
}) {
  // No `mounted` guard needed: `open` starts false, so the portal branch is
  // never evaluated during SSR — `document` is only touched after a click.
  const [open, setOpen] = useState(false);

  const grandBoxes = groups.reduce((s, g) => s + g.totalBoxes, 0);
  const grandTracks = groups.reduce((s, g) => s + g.items.length, 0);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={triggerClassName}>
        <ReceiptText className="h-3.5 w-3.5" />
        ดูบิลใบเสร็จในรายการนี้
      </button>

      {/* PORTAL TO BODY — load-bearing, not tidiness. This dialog lives deep
          inside the page content, and an ancestor there opens its own stacking
          context, so the overlay's z-index was only ever compared against its
          SIBLINGS — never against the admin shell's `fixed z-[60]` header.
          Result: the header painted over the dialog's top edge (worst on
          mobile, where the title wraps to two lines) and NO z-index value
          could have fixed it. Portaling to <body> puts the overlay in the root
          stacking context, where z-[90] genuinely beats the header's 60. */}
      {open && createPortal(
        <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto overscroll-contain bg-black/50 p-3 sm:p-4">
          <div className="my-4 w-full max-w-5xl rounded-2xl bg-white shadow-xl sm:my-6">
            {/* Header — wraps on narrow screens so the action never gets
                pushed off the edge (was a single non-wrapping row). */}
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-3 py-3 sm:px-4">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-foreground break-words">บิลรายการส่งสินค้า · {batchName}</h3>
                <p className="text-[11px] text-muted">
                  {groups.length} จุดส่ง · {grandTracks} แทรคกิ้ง · {grandBoxes} กล่อง
                </p>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <a
                  href={printHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
                >
                  <Printer className="h-4 w-4" /> พิมพ์และบันทึกบิลรวม
                </a>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full p-1 text-muted hover:bg-surface-alt"
                  aria-label="ปิด"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {/* legacy helper line that sits beside this action in PCS */}
              <p className="w-full text-[11px] text-muted">
                พิมพ์ใบค้นหาสินค้าหลังจากมอบหมายงานคนขับรถในหน้ารายละเอียดงาน
              </p>
            </div>

            {/* Grouped body */}
            <div className="max-h-[68vh] space-y-4 overflow-y-auto p-3 sm:max-h-[75vh] sm:p-4">
              {groups.map((g, gi) => (
                <div key={g.key} className="rounded-xl border border-border overflow-hidden">
                  {/* group header — customer + carrier + address */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 bg-surface-alt/60 px-3 py-2 text-xs">
                    <span className="rounded-full bg-primary-500 px-1.5 text-white">{gi + 1}</span>
                    <span className="font-mono font-bold text-primary-600">{g.pr}</span>
                    <span className="font-semibold text-foreground">{g.customerName}</span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700 border border-slate-200">{g.carrier}</span>
                    {g.phones.map((p) => (
                      <span key={p} className="text-muted">โทร {p}</span>
                    ))}
                    <span className="w-full text-[11px] text-muted">{g.address}</span>
                  </div>
                  {/* items */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs [&_th]:whitespace-nowrap [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1.5">
                      <thead className="bg-surface-alt/40 text-left text-muted">
                        <tr>
                          <th className="w-6">#</th>
                          <th>เลขที่ออเดอร์</th>
                          <th>รหัสสมาชิก</th>
                          <th>เลขแทรคกิ้ง</th>
                          <th>location</th>
                          <th className="text-right">กล่อง</th>
                          <th className="text-right">น้ำหนัก</th>
                          <th className="text-right">ปริมาตร</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.items.map((it) => (
                          <tr key={`${g.key}-${it.no}-${it.orderNo}`} className="border-t border-border">
                            <td className="text-muted">{it.no}</td>
                            <td className="font-mono text-primary-600">{it.orderNo}</td>
                            <td className="font-mono">{it.pr}</td>
                            <td className="font-mono">{it.tracking}</td>
                            <td className="text-muted">{it.location || "—"}</td>
                            <td className="text-right">{it.boxes}</td>
                            <td className="text-right">{it.weight.toFixed(2)}</td>
                            <td className="text-right">{it.cbm.toFixed(5)}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-border bg-surface-alt/40 font-semibold">
                          <td className="text-right text-muted" colSpan={5}>รวม</td>
                          <td className="text-right">{g.totalBoxes}</td>
                          <td className="text-right">{g.totalWeight.toFixed(2)}</td>
                          <td className="text-right">{g.totalCbm.toFixed(5)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
