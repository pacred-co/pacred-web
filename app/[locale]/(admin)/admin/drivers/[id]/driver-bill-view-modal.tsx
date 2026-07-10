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

export function DriverBillViewModal({
  groups,
  batchName,
  printHref,
}: {
  groups: BillGroup[];
  batchName: string;
  printHref: string;
}) {
  const [open, setOpen] = useState(false);

  const grandBoxes = groups.reduce((s, g) => s + g.totalBoxes, 0);
  const grandTracks = groups.reduce((s, g) => s + g.items.length, 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-100"
      >
        <ReceiptText className="h-4 w-4" />
        ดูบิลใบเสร็จในรายการนี้
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-6 w-full max-w-5xl rounded-2xl bg-white shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div>
                <h3 className="text-base font-bold text-foreground">บิลรายการส่งสินค้า · {batchName}</h3>
                <p className="text-[11px] text-muted">
                  {groups.length} จุดส่ง · {grandTracks} แทรคกิ้ง · {grandBoxes} กล่อง
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={printHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary-300 bg-primary-50 px-3 py-1.5 text-sm font-medium text-primary-700 hover:bg-primary-100"
                >
                  <Printer className="h-4 w-4" /> พิมพ์บิลจัดส่ง
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
            </div>

            {/* Grouped body */}
            <div className="max-h-[75vh] space-y-4 overflow-y-auto p-4">
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
        </div>
      )}
    </>
  );
}
