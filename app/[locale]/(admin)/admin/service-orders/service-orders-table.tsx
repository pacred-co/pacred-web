"use client";

import { useState, type ChangeEvent } from "react";
import { Link } from "@/i18n/navigation";

/**
 * Service-orders list table — ภูม flag 2026-05-30 evening.
 *
 * Brings /admin/service-orders to the same fidelity level as the
 * /admin/forwarders Wave-11 list. Legacy source: `pcs-admin/shops.php`
 * L411-555 (the 9-column table layout + DataTables init + 11-button
 * row action cluster).
 *
 * Columns (legacy 1:1):
 *   - checkbox (bulk-select hno for printing)
 *   - ID (hno)
 *   - วันที่สร้าง / วันที่อัปเดต (hdate / hdateupdate · switches by tab)
 *   - เลขที่ออเดอร์ (hno + adminIDIP badge + source label)
 *   - รหัสสมาชิก (userid + VIP + corporate + sales-rep badges)
 *   - ข้อมูลสินค้า (hCover thumbnail + htitle + extra-count + note badges)
 *   - ราคารวม (computed price)
 *   - สถานะ (hstatus badge)
 *   - อัปเดต (last status-change date + adminIDUpdate)
 *   - ตัวเลือก (action buttons cluster: ดู / อัปเดต / พิมพ์ใบเสร็จ / พิมพ์ใบแจ้งหนี้)
 *
 * Per AGENTS.md §0a — steal the LOGIC + apply Pacred design.
 */

export type ServiceOrderRow = {
  id: number;
  hno: string;
  hstatus: string;
  hdate: string | null;
  hdate2: string | null;
  hdate3: string | null;
  hdate4: string | null;
  hdate5: string | null;
  hdateupdate: string | null;
  hdatepayment: string | null;
  htitle: string | null;
  hcount: number;
  hcover: string | null;
  coverUrl: string | null;          // server-resolved signed Supabase URL
  htotalpricechn: number;
  hshippingchn: number;
  hshippingservice: number;
  hrate: number;
  hnote: string | null;
  hnoteuser: string | null;         // "1" = admin-only note
  hnoteuserread: string | null;     // "1" = customer hasn't read it
  hnotedate: string | null;
  hprintbill: string | null;        // "1" = receipt was printed
  hprintbill2: string | null;       // "1" = invoice was printed
  adminid: string | null;
  adminidcreate: string | null;
  adminidip: string | null;
  adminidupdate: string | null;
  userid: string;
  customerName: string | null;
  isVip: boolean;
  vipTier: string | null;
  isCorporate: boolean;
  salesRep: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  "1": "รอดำเนินการ",
  "2": "รอชำระเงิน",
  "3": "สั่งสินค้า",
  "4": "รอร้านจีนจัดส่ง",
  "5": "สำเร็จ",
  "6": "ยกเลิก",
};

const STATUS_BADGE: Record<string, string> = {
  "1": "bg-amber-50 text-amber-700 border-amber-200",
  "2": "bg-red-50 text-red-700 border-red-200",
  "3": "bg-blue-50 text-blue-700 border-blue-200",
  "4": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "5": "bg-green-50 text-green-700 border-green-200",
  "6": "bg-gray-50 text-gray-600 border-gray-200",
};

// Sort field keys (server-side via ?sort=&dir=).
type SortField = "id" | "hdate" | "hno" | "userid" | "price" | "hstatus" | "hdateupdate";

function fmtDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  if (withTime) {
    return d.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
  }
  return d.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function fmtDateOnly(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtTimeOnly(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

/** Legacy `diffDateTimeNow($date)` — function.php → "ผ่านมา X นาที / ชม / วัน". */
function relativeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const now = Date.now();
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, now - then);
  const d = Math.floor(diff / 86_400_000);
  if (d > 0) return `${d} วัน`;
  const h = Math.floor(diff / 3_600_000);
  if (h > 0) return `${h} ชม`;
  const m = Math.floor(diff / 60_000);
  if (m > 0) return `${m} นาที`;
  return "เมื่อกี้";
}

/** Total price computation — legacy shops.php L446:
 *   $totalPrice = (($hTotalPriceCHN + $hShippingCHN) * $hRate) + $hShippingService
 */
function rowTotalPrice(r: ServiceOrderRow): number {
  return (Number(r.htotalpricechn) + Number(r.hshippingchn)) * Number(r.hrate) + Number(r.hshippingservice);
}

/** The status-update date column — legacy L515-521 switches by hstatus. */
function statusDate(r: ServiceOrderRow): string | null {
  switch (r.hstatus) {
    case "1": return r.hdate;
    case "2": return r.hdate2;
    case "3": return r.hdate3;
    case "4": return r.hdate4;
    case "5": return r.hdate5;
    default:  return r.hdateupdate;
  }
}

export function ServiceOrdersTable({
  rows,
  showUpdateDate,
  currentSort,
  currentDir,
  buildSortHref,
}: {
  rows: ServiceOrderRow[];
  /** When viewing q=3 or q=4 the legacy uses hDateUpdate instead of hDate. */
  showUpdateDate: boolean;
  currentSort: SortField | undefined;
  currentDir: "asc" | "desc";
  buildSortHref: (field: SortField) => string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleRow = (hno: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(hno)) next.delete(hno);
      else next.add(hno);
      return next;
    });
  };

  const toggleAll = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelected(new Set(rows.map((r) => r.hno)));
    else setSelected(new Set());
  };

  const clearSelection = () => setSelected(new Set());

  const allChecked = rows.length > 0 && selected.size === rows.length;
  const someChecked = selected.size > 0 && selected.size < rows.length;

  // Sum total for the rendered set (legacy L446-447 + L583 — only shown
  // on the รอชำระเงิน tab as "ยอดรวม : <total> บาท" badge).
  const totalAll = rows.reduce((acc, r) => acc + rowTotalPrice(r), 0);

  // Bulk-print form URLs (the legacy form submits to printShop with id[]
  // multi-value). We open new tabs by appending each selected hno as `id=`.
  const bulkPrintInvoiceUrl = (() => {
    if (selected.size === 0) return "#";
    const params = new URLSearchParams();
    params.set("print", "2");
    for (const hno of selected) params.append("id", hno);
    return `/service-order/print?${params.toString()}`;
  })();
  const bulkPrintReceiptUrl = (() => {
    if (selected.size === 0) return "#";
    const params = new URLSearchParams();
    params.set("print", "1");
    for (const hno of selected) params.append("id", hno);
    return `/service-order/print?${params.toString()}`;
  })();

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่มีรายการ</p>
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-[11px] min-w-[1100px]">
              <thead className="bg-surface-alt/50 text-left text-[10px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-2 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={(el) => {
                        if (el) el.indeterminate = someChecked;
                      }}
                      onChange={toggleAll}
                      aria-label="เลือกทั้งหมด"
                    />
                  </th>
                  <SortableTh
                    label="ID"
                    field="id"
                    currentSort={currentSort}
                    currentDir={currentDir}
                    buildSortHref={buildSortHref}
                  />
                  <SortableTh
                    label={showUpdateDate ? "วันที่อัปเดต" : "วันที่สร้าง"}
                    field={showUpdateDate ? "hdateupdate" : "hdate"}
                    currentSort={currentSort}
                    currentDir={currentDir}
                    buildSortHref={buildSortHref}
                  />
                  <SortableTh
                    label="เลขที่ออเดอร์"
                    field="hno"
                    currentSort={currentSort}
                    currentDir={currentDir}
                    buildSortHref={buildSortHref}
                  />
                  <SortableTh
                    label="รหัสสมาชิก"
                    field="userid"
                    currentSort={currentSort}
                    currentDir={currentDir}
                    buildSortHref={buildSortHref}
                  />
                  <th className="px-2 py-3">ข้อมูลสินค้า</th>
                  <SortableTh
                    label="ราคารวม (บาท)"
                    field="price"
                    currentSort={currentSort}
                    currentDir={currentDir}
                    buildSortHref={buildSortHref}
                    align="right"
                  />
                  <SortableTh
                    label="สถานะ"
                    field="hstatus"
                    currentSort={currentSort}
                    currentDir={currentDir}
                    buildSortHref={buildSortHref}
                  />
                  <th className="px-2 py-3">อัปเดต</th>
                  <th className="px-2 py-3 text-center">ตัวเลือก</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isOn = selected.has(r.hno);
                  const price = rowTotalPrice(r);
                  const dateCol = showUpdateDate ? r.hdateupdate : r.hdate;
                  const sLabel = STATUS_LABEL[r.hstatus] ?? r.hstatus;
                  const badgeCls = STATUS_BADGE[r.hstatus] ?? "bg-gray-50 text-gray-600 border-gray-200";
                  const sDate = statusDate(r);
                  const isPrinted = r.hprintbill === "1";
                  const isInvoicePrinted = r.hprintbill2 === "1";
                  const adminCreatedBadge = r.adminidcreate && r.adminidcreate !== "";
                  // Legacy badgeAdminIP — "ฝากสั่ง : admin_X" when admin created.
                  const sourceLabel = adminCreatedBadge
                    ? `ฝากสั่ง: ${r.adminidcreate}`
                    : "ฝากสั่งจาก: users";
                  const sourceBadgeCls = adminCreatedBadge
                    ? "bg-amber-50 text-amber-700 border-amber-200"
                    : "bg-gray-50 text-gray-600 border-gray-200";

                  return (
                    <tr
                      key={r.id}
                      className={`border-t border-border hover:bg-surface-alt/30 ${isOn ? "bg-primary-50/40" : ""}`}
                    >
                      <td className="px-2 py-2.5 w-8">
                        <input
                          type="checkbox"
                          checked={isOn}
                          onChange={() => toggleRow(r.hno)}
                          aria-label={`เลือก ${r.hno}`}
                        />
                      </td>
                      <td className="px-2 py-2.5 font-mono whitespace-nowrap">{r.id}</td>
                      <td className="px-2 py-2.5 whitespace-nowrap">
                        <div className="text-foreground">{fmtDateOnly(dateCol)}</div>
                        <div className="text-muted text-[10px]">{fmtTimeOnly(dateCol)} น.</div>
                        {isPrinted && (
                          <span className="mt-0.5 inline-block rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 text-[9px]">
                            พิมพ์ใบเสร็จแล้ว
                          </span>
                        )}
                        {isInvoicePrinted && (
                          <span className="mt-0.5 inline-block rounded-full bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 text-[9px]">
                            พิมพ์ใบแจ้งหนี้แล้ว
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        <Link
                          href={`/admin/service-orders/${r.hno}`}
                          className="font-mono font-semibold text-primary-600 hover:underline"
                        >
                          {r.hno}
                        </Link>
                        <div className="mt-0.5">
                          <span className={`inline-block rounded-full border px-1.5 py-0.5 text-[9px] ${sourceBadgeCls}`}>
                            {sourceLabel}
                          </span>
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        <Link
                          href={`/admin/customers/${r.userid}`}
                          className="font-mono font-semibold text-primary-600 hover:underline"
                        >
                          {r.userid}
                        </Link>
                        {r.customerName && (
                          <div className="truncate max-w-[140px] text-[10px] text-muted" title={r.customerName}>
                            {r.customerName}
                          </div>
                        )}
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {r.isVip && r.vipTier && (
                            <span className="rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200 px-1.5 py-0.5 text-[9px] font-semibold">
                              {r.vipTier}
                            </span>
                          )}
                          {r.isCorporate && (
                            <span className="rounded-full bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 text-[9px]">
                              นิติบุคคล
                            </span>
                          )}
                          {r.salesRep && (
                            <span className="rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 text-[9px]">
                              sale: {r.salesRep}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex gap-2 items-start">
                          <div className="min-w-0 flex-1">
                            <Link
                              href={`/admin/service-orders/${r.hno}`}
                              className="font-semibold text-primary-600 hover:underline"
                            >
                              {r.htitle ?? "—"}
                            </Link>
                            {r.hcount > 1 && (
                              <span className="ml-1 text-[10px] text-muted">
                                และอีก {Math.round(r.hcount - 1)} รายการ
                              </span>
                            )}
                            {r.hstatus === "2" && r.hdatepayment && (
                              <div className="text-red-600 text-[10px] mt-0.5">
                                กรุณาชำระเงินก่อน {fmtDate(r.hdatepayment, true)} น.
                              </div>
                            )}
                            {r.hnote && (
                              <div className="mt-1 space-y-0.5">
                                {r.hnoteuser === "1" ? (
                                  <span className="inline-block rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 text-[9px]">
                                    แอดมินเท่านั้น
                                  </span>
                                ) : (
                                  <>
                                    <span className="inline-block rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 text-[9px]">
                                      ทั้งลูกค้าและแอดมิน
                                    </span>
                                    {r.hnoteuserread === "1" && (
                                      <span className="ml-1 text-[9px] text-muted">ยังไม่อ่าน</span>
                                    )}
                                  </>
                                )}
                                <div className="rounded bg-red-600 text-white text-[10px] px-1.5 py-0.5">
                                  หมายเหตุ: {r.hnote}
                                </div>
                                {r.hnotedate && (
                                  <div className="text-[9px] text-muted">
                                    {fmtDate(r.hnotedate, true)} · ผ่านมา{" "}
                                    <span className="text-red-600">{relativeAgo(r.hnotedate)}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          {r.coverUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={r.coverUrl}
                              alt={r.htitle ?? `ออเดอร์ ${r.hno}`}
                              className="h-[60px] w-[60px] rounded border border-border object-cover bg-surface-alt shrink-0"
                              loading="lazy"
                            />
                          ) : (
                            <div
                              aria-hidden
                              className="h-[60px] w-[60px] rounded border border-dashed border-border/60 bg-surface-alt/40 shrink-0 flex items-center justify-center text-[9px] text-muted text-center"
                              title="ไม่มีรูปสินค้า"
                            >
                              ไม่มี
                              <br />
                              รูป
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono whitespace-nowrap">
                        ฿{price.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-2 py-2.5">
                        <span className={`inline-block rounded-full border px-2 py-0.5 text-[9px] font-medium whitespace-nowrap ${badgeCls}`}>
                          {sLabel}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 whitespace-nowrap">
                        {sDate ? (
                          <>
                            <div className="text-[10px]">{fmtDate(sDate, true)}</div>
                            <div className="text-[9px] text-red-600">
                              ผ่านมา {relativeAgo(sDate)}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                        {r.adminidupdate && r.adminidupdate !== "" && (
                          <div className="text-[9px] text-muted font-mono mt-0.5">{r.adminidupdate}</div>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex flex-col gap-1 items-stretch min-w-[110px]">
                          <Link
                            href={`/admin/service-orders/${r.hno}`}
                            className="rounded border border-green-500 bg-green-50 text-green-700 text-[10px] px-2 py-1 hover:bg-green-100 text-center whitespace-nowrap"
                          >
                            ดูรายละเอียด
                          </Link>
                          <Link
                            href={`/admin/service-orders/${r.hno}`}
                            className="rounded border border-orange-500 bg-orange-50 text-orange-700 text-[10px] px-2 py-1 hover:bg-orange-100 text-center whitespace-nowrap"
                          >
                            อัปเดตรายการ
                          </Link>
                          {r.hstatus === "5" && (
                            <a
                              href={`/service-order/print?print=1&id=${encodeURIComponent(r.hno)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded border border-blue-500 bg-blue-50 text-blue-700 text-[10px] px-2 py-1 hover:bg-blue-100 text-center whitespace-nowrap"
                            >
                              พิมพ์ใบเสร็จ
                            </a>
                          )}
                          {/* hStatus 2..5 (legacy L534) — invoice button */}
                          {["2", "3", "4", "5"].includes(r.hstatus) && (
                            <a
                              href={`/service-order/print?print=2&id=${encodeURIComponent(r.hno)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded border border-red-500 bg-red-50 text-red-700 text-[10px] px-2 py-1 hover:bg-red-100 text-center whitespace-nowrap"
                            >
                              พิมพ์ใบแจ้งหนี้
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* "ยอดรวม" pill — legacy shops.php L583 shows it on q=2 tab (รอชำระ).
          We show on any tab as it's useful KPI feedback. */}
      {rows.length > 0 && (
        <div className="flex justify-end pr-2">
          <span className="rounded-full bg-primary-50 text-primary-700 border border-primary-200 px-3 py-1 text-xs font-semibold">
            ยอดรวม: <b>฿{totalAll.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
          </span>
        </div>
      )}

      {/* Fixed-bottom bulk action bar — shows only when ≥1 row selected.
          Legacy shops.php L548-553 has a fixed bar with "พิมพ์ใบแจ้งหนี้" +
          (on q=5 only) "พิมพ์ใบเสร็จสินค้า". We render both unconditionally
          since both are gated by status anyway. */}
      {selected.size > 0 && (
        <div
          role="region"
          aria-label="บาร์พิมพ์เอกสารกลุ่ม"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white dark:bg-surface shadow-[0_-2px_10px_rgba(0,0,0,0.06)] pcs-safe-area-bottom"
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 lg:px-8">
            <span className="text-sm font-medium">
              เลือกแล้ว <b className="text-primary-600">{selected.size}</b> รายการ
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-md border border-border bg-white px-3 py-1.5 text-xs font-medium hover:bg-surface-alt"
              >
                ยกเลิก
              </button>
              <a
                href={bulkPrintInvoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
              >
                พิมพ์ใบแจ้งหนี้ ({selected.size})
              </a>
              <a
                href={bulkPrintReceiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
              >
                พิมพ์ใบเสร็จ ({selected.size})
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Sort-arrow header cell — clicking toggles asc/desc. ⇵ = inactive,
 * ↑/↓ = active. Server-side via `?sort=<field>&dir=<asc|desc>`. */
function SortableTh({
  label,
  field,
  currentSort,
  currentDir,
  buildSortHref,
  align,
}: {
  label: string;
  field: SortField;
  currentSort: SortField | undefined;
  currentDir: "asc" | "desc";
  buildSortHref: (field: SortField) => string;
  align?: "right";
}) {
  const active = currentSort === field;
  const arrow = active ? (currentDir === "asc" ? "↑" : "↓") : "⇵";
  const cls = align === "right" ? "text-right" : "";
  return (
    <th className={`px-2 py-3 ${cls}`}>
      <Link
        href={buildSortHref(field)}
        className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-primary-600" : ""}`}
      >
        {label}
        <span className="text-[9px]" aria-hidden>{arrow}</span>
      </Link>
    </th>
  );
}
