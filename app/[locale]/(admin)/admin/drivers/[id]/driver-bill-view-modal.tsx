"use client";

/**
 * "ดูบิลใบเสร็จในรายการนี้" — a consolidated, print-ready view of ALL the batch's
 * delivery points grouped by customer/address (ภูม 2026-07-10).
 *
 * Faithful port of legacy forwarder-driver.php `#listBill` → addFromBill.php
 * (action=3). ปอน 2026-07-23 rebuilt the body to the legacy SHAPE:
 *
 *   OUTER table  # | จำนวนรวม | บริษัทขนส่ง | ข้อมูล
 *     └─ ข้อมูล holds an INNER table  # | เลขออเดอร์ | รหัสสมาชิก |
 *        เลขแทรคกิ้ง | location | ที่อยู่   (address tinted, phone inline)
 *        + a per-group "พิมพ์และบันทึกบิลรวม" action and its helper line
 *   plus the legacy list chrome: แสดง N รายการ · ค้นหา · zebra rows ·
 *   "กำลังแสดง X ถึง Y จาก Z รายการ" + prev/next paging.
 *
 * Design = Pacred Tailwind (not Bootstrap). Reuses the page's already-loaded
 * stop data — no extra fetch, no writes.
 */

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ReceiptText, X, Printer, Search } from "lucide-react";
import { Link } from "@/i18n/navigation";

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

/**
 * The legacy PCS badge-pill (Bootstrap `badge badge-danger`, #DC3545) — a
 * fully-rounded capsule in a brighter red than our brand #B30000.
 *
 * ONE constant shared by the header trigger AND the per-group print action
 * (ปอน 2026-07-23): they are the same control in the user's mind — open the
 * bills / print the bills — so they must never drift apart. Exported so the
 * batch page can dress its trigger with it too.
 */
export const BILL_BADGE_CLASS =
  "inline-flex items-center gap-1.5 rounded-full bg-[#DC3545] px-3 py-1 text-xs font-semibold text-white hover:bg-[#C82333]";

const PAGE_SIZES = [10, 25, 50, 100];
/** Legacy tints the ที่อยู่ cell so the eye lands on it first. */
const ADDR_TINT = "#FBEAEA";

/** Everything a row can be searched by — one flat haystack per group. */
function haystack(g: BillGroup): string {
  return [
    g.pr,
    g.customerName,
    g.carrier,
    g.address,
    ...g.phones,
    ...g.items.flatMap((i) => [i.orderNo, i.tracking, i.location]),
  ]
    .join(" ")
    .toLowerCase();
}

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
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(100);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => haystack(g).includes(q));
  }, [groups, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const from = filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, filtered.length);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

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
          <div className="my-4 w-full max-w-6xl rounded-2xl bg-white shadow-xl sm:my-6">
            {/* Title bar — legacy's amber rule under the heading */}
            <div className="flex items-start justify-between gap-3 border-b-2 border-amber-400 px-3 py-3 sm:px-4">
              <h3 className="min-w-0 break-words text-base font-bold text-foreground">
                บิลรายการส่งสินค้า · {batchName}
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-full p-1 text-muted hover:bg-surface-alt"
                aria-label="ปิด"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[72vh] overflow-y-auto p-3 sm:max-h-[78vh] sm:p-4">
              {/* Controls — แสดง N รายการ (left) · ค้นหา (right) */}
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs text-muted">
                  แสดง
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="rounded border border-border bg-white px-2 py-1 text-xs text-foreground"
                  >
                    {PAGE_SIZES.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                  รายการ
                </label>

                <label className="flex items-center gap-2 text-xs text-muted">
                  ค้นหา:
                  <span className="relative">
                    <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                    <input
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setPage(1);
                      }}
                      placeholder="ชื่อ · PR · แทรคกิ้ง · ที่อยู่"
                      className="w-48 rounded border border-border bg-white py-1 pl-7 pr-2 text-xs text-foreground sm:w-64"
                    />
                  </span>
                </label>
              </div>

              {/* OUTER table — one row per delivery group */}
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[860px] text-xs">
                  <thead className="bg-surface-alt/60 text-left text-muted">
                    <tr>
                      <th className="w-12 px-2 py-2 text-center font-semibold">#</th>
                      <th className="w-32 px-2 py-2 font-semibold">จำนวนรวม</th>
                      <th className="w-36 px-2 py-2 font-semibold">บริษัทขนส่ง</th>
                      <th className="px-2 py-2 font-semibold">ข้อมูล</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-8 text-center text-muted">
                          {query ? `ไม่พบรายการที่ตรงกับ "${query}"` : "ไม่มีรายการในรอบนี้"}
                        </td>
                      </tr>
                    ) : (
                      visible.map((g, gi) => (
                        <tr
                          key={g.key}
                          className={`border-t border-border align-top ${gi % 2 === 1 ? "bg-surface-alt/30" : ""}`}
                        >
                          <td className="px-2 py-3 text-center font-semibold text-muted">
                            {from + gi}
                          </td>
                          <td className="px-2 py-3">
                            <div className="font-semibold text-foreground">
                              {g.items.length} รายการ
                            </div>
                            {/* our extra operational numbers — legacy has no
                                room for them in the inner table, so they roll
                                up here instead of being dropped */}
                            <div className="mt-0.5 text-[11px] leading-tight text-muted">
                              {g.totalBoxes} กล่อง
                              <br />
                              {g.totalWeight.toFixed(2)} กก.
                              <br />
                              {g.totalCbm.toFixed(5)} คิว
                            </div>
                          </td>
                          <td className="px-2 py-3">
                            <span className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-slate-700">
                              {g.carrier}
                            </span>
                          </td>

                          {/* ข้อมูล — the nested per-tracking table + action */}
                          <td className="px-2 py-3">
                            <div className="overflow-x-auto rounded-lg border border-border bg-white">
                              <table className="w-full min-w-[620px] text-xs [&_td]:px-2 [&_td]:py-1.5 [&_th]:whitespace-nowrap [&_th]:px-2 [&_th]:py-1.5">
                                <thead className="bg-surface-alt/50 text-left text-muted">
                                  <tr>
                                    <th className="w-6 text-center">#</th>
                                    <th>เลขออเดอร์</th>
                                    <th>รหัสสมาชิก</th>
                                    <th>เลขแทรคกิ้ง</th>
                                    <th>location</th>
                                    <th>ที่อยู่</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {g.items.map((it) => (
                                    <tr
                                      key={`${g.key}-${it.no}-${it.orderNo}`}
                                      className="border-t border-border align-top"
                                    >
                                      <td className="text-center text-muted">{it.no}</td>
                                      <td className="whitespace-nowrap font-mono text-sky-700">
                                        {it.orderNo}
                                      </td>
                                      <td className="whitespace-nowrap font-mono">
                                        {it.pr && it.pr !== "—" ? (
                                          <Link
                                            href={`/admin/customers/${it.pr}`}
                                            className="text-sky-700 hover:underline"
                                          >
                                            {it.pr}
                                          </Link>
                                        ) : (
                                          <span className="text-muted">—</span>
                                        )}
                                      </td>
                                      <td className="whitespace-nowrap font-mono text-sky-700">
                                        {it.tracking || "—"}
                                      </td>
                                      <td className="whitespace-nowrap text-muted">
                                        {it.location || "—"}
                                      </td>
                                      <td
                                        className="min-w-[260px] leading-snug"
                                        style={{ background: ADDR_TINT }}
                                      >
                                        {g.customerName ? (
                                          <span className="font-semibold">{g.customerName} </span>
                                        ) : null}
                                        {g.address || "—"}
                                        {g.phones.length > 0 && (
                                          <> โทร. {g.phones.join(", ")}</>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            {/* per-group action + legacy helper line */}
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <a
                                href={printHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={BILL_BADGE_CLASS}
                              >
                                <Printer className="h-3.5 w-3.5" /> พิมพ์และบันทึกบิลรวม
                              </a>
                              <span className="text-[11px] text-muted">
                                พิมพ์ใบค้นหาสินค้าหลังจากมอบหมายงานคนขับรถในหน้ารายละเอียดงาน
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Footer — count + paging (legacy list chrome) */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
                <span>
                  กำลังแสดง {from} ถึง {to} จาก {filtered.length} รายการ
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    className="rounded border border-border px-2 py-1 disabled:opacity-40"
                  >
                    ก่อนหน้า
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPage(n)}
                      className={`rounded border px-2 py-1 ${
                        n === safePage
                          ? "border-primary-600 bg-primary-600 font-semibold text-white"
                          : "border-border hover:bg-surface-alt"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    className="rounded border border-border px-2 py-1 disabled:opacity-40"
                  >
                    ถัดไป
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
