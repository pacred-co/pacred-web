"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { HSTATUS_CFG } from "@/lib/admin/service-order-status";
import { Link } from "@/i18n/navigation";
import { confirm } from "@/components/ui/confirm";
import { Explain } from "@/components/ui/tooltip";
import { bulkUpdateShopOrderStatus } from "@/actions/admin/service-orders-bulk";
import { SHOP_STATUSES, type ShopOrderStatus } from "@/actions/admin/service-orders-bulk-types";
import { parseDbInstant } from "@/lib/utils/thai-datetime";
import { PurchaserCell } from "@/components/admin/purchaser-cell";
import type { SalesAdminOption } from "@/actions/admin/customer-profile";

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
  /** Contact-person sub-line when customerName=company (juristic). "" = none. */
  contactName: string;
  isJuristic: boolean;   // CUSTTAG — บุคคล/นิติ
  creditLimit: number;   // CUSTTAG — วงเงินเครดิต (>0 = ลูกค้าเครดิต)
  creditDays: number;    // CUSTTAG — เทอม (วัน)
  isVip: boolean;
  vipTier: string | null;
  isCorporate: boolean;
  salesRep: string | null;
  isSvip: boolean;
  isCps: boolean;
  trackingNumbers: string[];
  // owner ④ (mig 0241) — assigned ผู้สั่งซื้อ (per-order).
  assignedPurchaserId: string;              // tb_admin.adminID · "" = ยังไม่มอบหมาย
  assignedPurchaserName: string | null;     // resolved display name
  purchaserIsAuto: boolean;                 // true = fallback id (ip/creator), not a stored assignment
};

const STATUS_LABEL: Record<string, string> = {
  "1": "รอดำเนินการ",
  "2": "รอชำระเงิน",
  "3": "สั่งสินค้า",
  "4": "รอร้านจีนจัดส่ง",
  "40": "ถึงโกดังจีน", // owner 2026-06-16 · MOMO arrival
  "5": "สำเร็จ",
  "6": "ยกเลิก",
};

// 2026-06-19 (owner "สั่งซื้อก็จืด"): vivid hstatus chips via the HSTATUS_CFG SOT
// (mirrors report-cnt's FSTATUS_CFG) — was faded -50 weights.
const STATUS_BADGE: Record<string, string> = Object.fromEntries(
  Object.entries(HSTATUS_CFG).map(([k, v]) => [k, v.chip]),
);

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
  // Legacy tb_* datetimes are UTC but often tz-less — parse as a UTC instant so
  // a just-placed order doesn't read "7 ชม" on a Bangkok (UTC+7) client.
  const thenDate = parseDbInstant(iso);
  if (!thenDate) return "";
  const then = thenDate.getTime();
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
  sortHrefs,
  canReassignPurchaser = false,
  purchaserAdmins = [],
  activeTab = "",
  canEditOrder = true,
}: {
  rows: ServiceOrderRow[];
  /** When viewing q=3 or q=4 the legacy uses hDateUpdate instead of hDate. */
  showUpdateDate: boolean;
  currentSort: SortField | undefined;
  currentDir: "asc" | "desc";
  /** Next 16: pass pre-computed hrefs as a serialisable Record, NOT a fn.
   *  Server Components can't ship functions over the RSC wire. */
  sortHrefs: Record<SortField, string>;
  /** owner ④ — true for interpreter/purchaser_lead/ultra/super (server-gated too). */
  canReassignPurchaser?: boolean;
  /** owner ④ — active admins for the row reassign picker. */
  purchaserAdmins?: SalesAdminOption[];
  /** active status tab (?q). Legacy shops.php L548-553 hides the bulk-PRINT
   *  buttons on q=1 (รอดำเนินการ · ยังไม่จ่าย) + q=6 (ยกเลิก) — nothing valid to print. */
  activeTab?: string;
  /** legacy shops.php L528 — "อัปเดตรายการ" is office-only (server-gated too).
   *  Defaults true (the edit page is the real backstop). */
  canEditOrder?: boolean;
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

  const clearSelection = () => {
    setSelected(new Set());
    setStatusMode(false);
    setOutcome(null);
    setTopErr(null);
  };

  // ── Bulk manual status override (ภูม flag 2026-06-11) ──────────────────
  // Mirrors the /admin/forwarders BulkActionsToolbar "เปลี่ยน status" path.
  // Pure status write — the action does NOT run the happy-path side-effects
  // (no auto-receipt / commission); see actions/admin/service-orders-bulk.ts.
  const router = useRouter();
  const [statusMode, setStatusMode] = useState(false);
  const [targetStatus, setTargetStatus] = useState<ShopOrderStatus | "">("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<{ ok: number; failed: { hno: string; error: string }[] } | null>(null);
  const [topErr, setTopErr] = useState<string | null>(null);

  const runStatusUpdate = async () => {
    if (!targetStatus || selected.size === 0) return;
    const label = STATUS_LABEL[targetStatus] ?? targetStatus;
    const okConfirm = await confirm(
      `ขยับ ${selected.size} ออเดอร์ → สถานะ “${label}” แบบแมนนวล?\n\n` +
        `⚠️ เป็นการแก้สถานะตรงๆ — ไม่รันระบบปกติ (ไม่ออกใบเสร็จ / คอมมิชชั่นอัตโนมัติ)`,
    );
    if (!okConfirm) return;
    setTopErr(null);
    setOutcome(null);
    startTransition(async () => {
      const res = await bulkUpdateShopOrderStatus(Array.from(selected), targetStatus, note.trim() || undefined);
      if (!res.ok) {
        setTopErr(res.error);
        return;
      }
      setOutcome({ ok: res.data?.succeeded.length ?? 0, failed: res.data?.failed ?? [] });
      setStatusMode(false);
      router.refresh();
    });
  };

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
    return `/admin/service-orders/print?${params.toString()}`;
  })();
  const bulkPrintReceiptUrl = (() => {
    if (selected.size === 0) return "#";
    const params = new URLSearchParams();
    params.set("print", "1");
    for (const hno of selected) params.append("id", hno);
    return `/admin/service-orders/print?${params.toString()}`;
  })();

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่มีรายการ</p>
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-xs min-w-[1100px] border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
              <thead className="bg-surface-alt/50 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
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
                    sortHrefs={sortHrefs}
                  />
                  <SortableTh
                    label={showUpdateDate ? "วันที่อัปเดต" : "วันที่สร้าง"}
                    field={showUpdateDate ? "hdateupdate" : "hdate"}
                    currentSort={currentSort}
                    currentDir={currentDir}
                    sortHrefs={sortHrefs}
                  />
                  <SortableTh
                    label="เลขที่ออเดอร์"
                    field="hno"
                    currentSort={currentSort}
                    currentDir={currentDir}
                    sortHrefs={sortHrefs}
                  />
                  <SortableTh
                    label="รหัสสมาชิก"
                    field="userid"
                    currentSort={currentSort}
                    currentDir={currentDir}
                    sortHrefs={sortHrefs}
                  />
                  <th className="px-2 py-3">ข้อมูลสินค้า</th>
                  <SortableTh
                    label="ราคารวม (บาท)"
                    field="price"
                    currentSort={currentSort}
                    currentDir={currentDir}
                    sortHrefs={sortHrefs}
                    align="right"
                    info="ราคารวมต่อออเดอร์ (บาท) = (มูลค่าสินค้า¥ + ค่าส่งจีน¥) × เรท + ค่าบริการ — ยอดที่ลูกค้าต้องจ่ายสำหรับออเดอร์ฝากสั่งนี้"
                  />
                  <SortableTh
                    label="สถานะ"
                    field="hstatus"
                    currentSort={currentSort}
                    currentDir={currentDir}
                    sortHrefs={sortHrefs}
                    info="สถานะออเดอร์ฝากสั่ง: รอดำเนินการ → รอชำระเงิน → สั่งสินค้า → รอร้านจีนจัดส่ง → ถึงโกดังจีน → สำเร็จ · ใต้ป้ายมี 🔔 บอกว่าพนักงานต้องทำอะไรต่อ"
                  />
                  <th className="px-2 py-3">อัปเดต</th>
                  {/* Action column — sticky-right so admins always see
                      ดูรายละเอียด / อัปเดต / พิมพ์ buttons regardless of
                      horizontal scroll position. Windows Chrome hides the
                      scrollbar by default; if the buttons were off-screen
                      the column might as well not exist (AGENTS.md §0c
                      lesson — invisible column = invisible workflow). */}
                  <th className="px-2 py-3 text-center sticky right-0 z-10 bg-surface-alt/95 shadow-[-4px_0_6px_-4px_rgba(0,0,0,0.08)]">
                    ตัวเลือก
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isOn = selected.has(r.hno);
                  const price = rowTotalPrice(r);
                  const dateCol = showUpdateDate ? r.hdateupdate : r.hdate;
                  const sLabel = STATUS_LABEL[r.hstatus] ?? r.hstatus;
                  const badgeCls = STATUS_BADGE[r.hstatus] ?? "bg-gray-50 text-gray-600 border-gray-200";
                  // next-action hint (self-explaining-row §0g) — what staff does NOW.
                  const sNext = HSTATUS_CFG[r.hstatus]?.next ?? "";
                  const sAct = HSTATUS_CFG[r.hstatus]?.act ?? false;
                  const sDate = statusDate(r);
                  const isPrinted = r.hprintbill === "1";
                  const isInvoicePrinted = r.hprintbill2 === "1";
                  // Legacy badgeAdminIP (function.php L2934) — "IPC : X" (ล่ามจีนที่เปิดออเดอร์),
                  // prefers adminIDIP then adminIDCreate. badge-purchasing = purple.
                  // "customer" = ออเดอร์ที่ลูกค้าเปิดเอง (ไม่มีล่าม) → treat as no-IPC → "ฝากสั่งจาก: users"
                  // (Pacred data stores 'customer' where legacy left adminIDCreate empty).
                  const ipInterp = r.adminidip && r.adminidip !== "" && r.adminidip !== "customer" ? r.adminidip : "";
                  const ipCreator = r.adminidcreate && r.adminidcreate !== "" && r.adminidcreate !== "customer" ? r.adminidcreate : "";
                  const ipcAdmin = ipInterp || ipCreator;
                  const sourceLabel = ipcAdmin ? `IPC : ${ipcAdmin}` : "ฝากสั่งจาก: users";
                  const sourceBadgeCls = ipcAdmin
                    ? "bg-purple-50 text-purple-700 border-purple-200"
                    : "bg-gray-50 text-gray-600 border-gray-200";

                  return (
                    <tr
                      key={r.id}
                      className={`group border-t border-border hover:bg-surface-alt/30 ${isOn ? "bg-primary-50/40" : "bg-white"}`}
                    >
                      <td className="px-2 py-2.5 w-8">
                        <input
                          type="checkbox"
                          checked={isOn}
                          onChange={() => toggleRow(r.hno)}
                          aria-label={`เลือก ${r.hno}`}
                        />
                      </td>
                      <td className="px-2 py-2.5 font-mono text-muted whitespace-nowrap">{r.id}</td>
                      <td className="px-2 py-2.5 whitespace-nowrap">
                        <div className="text-foreground">{fmtDateOnly(dateCol)}</div>
                        <div className="text-muted text-[11px]">{fmtTimeOnly(dateCol)} น.</div>
                        {isPrinted && (
                          <span className="mt-0.5 inline-block rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 text-[11px]">
                            พิมพ์ใบเสร็จแล้ว
                          </span>
                        )}
                        {isInvoicePrinted && (
                          <span className="mt-0.5 inline-block rounded-full bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 text-[11px]">
                            พิมพ์ใบแจ้งหนี้แล้ว
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        <Link
                          href={`/admin/service-orders/${r.hno}`}
                          className="font-mono text-sm font-semibold text-primary-600 hover:underline"
                        >
                          {r.hno}
                        </Link>
                        <div className="mt-0.5">
                          <span className={`inline-block rounded-full border px-1.5 py-0.5 text-[11px] ${sourceBadgeCls}`}>
                            {sourceLabel}
                          </span>
                        </div>
                        {/* Legacy shops.php L475-479 — เลขพัสดุจีน (cShippingNumber) ใต้เลขออเดอร์ */}
                        {r.trackingNumbers.length > 0 && (
                          <div className="mt-0.5 text-[10px] leading-tight text-primary-600">
                            {r.trackingNumbers.map((t) => (
                              <div key={t}>{t}</div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        <Link
                          href={`/admin/customers/${r.userid}`}
                          className="font-mono text-sm font-semibold text-primary-600 hover:underline"
                        >
                          {r.userid}
                        </Link>
                        {r.customerName && (
                          <div className="truncate max-w-[140px] text-[11px] text-muted" title={r.customerName}>
                            {r.customerName}
                          </div>
                        )}
                        {r.contactName && (
                          <div className="truncate max-w-[140px] text-[11px] text-muted" title={r.contactName}>
                            ผู้ติดต่อ: {r.contactName}
                          </div>
                        )}
                        {/* CUSTTAG (owner 2026-06-25) — credit pill so staff see เครดิต on the shop-order row */}
                        {r.creditLimit > 0 && (
                          <span
                            className="mt-0.5 inline-block rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800"
                            title={`ลูกค้าเครดิต · เทอม ${r.creditDays} วัน · วงเงิน ฿${r.creditLimit.toLocaleString("th-TH", { minimumFractionDigits: 2 })} · ติดตามให้ลูกค้าจ่ายภายในเทอม`}
                          >
                            💳 เครดิต {r.creditDays}ว
                          </span>
                        )}
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {r.isVip && r.vipTier && (
                            <span className="rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200 px-1.5 py-0.5 text-[11px] font-semibold">
                              {r.vipTier}
                            </span>
                          )}
                          {/* Legacy badgeVIP2 — SVIP (ราคาส่วนตัว) · CPS (คิดตามค่าเทียบ) */}
                          {r.isSvip && (
                            <span className="rounded-full bg-pink-50 text-pink-700 border border-pink-200 px-1.5 py-0.5 text-[11px] font-semibold" title="ลูกค้าคิดราคาแบบส่วนตัว">
                              SVIP
                            </span>
                          )}
                          {r.isCps && (
                            <span className="rounded-full bg-orange-50 text-orange-700 border border-orange-200 px-1.5 py-0.5 text-[11px] font-semibold" title="ลูกค้าคิดราคาตามค่าเทียบ">
                              CPS
                            </span>
                          )}
                          {r.isCorporate && (
                            <span className="rounded-full bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 text-[11px]">
                              นิติบุคคล
                            </span>
                          )}
                          {r.salesRep && (
                            <span className="rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 text-[11px]">
                              sale: {r.salesRep}
                            </span>
                          )}
                        </div>
                        {/* owner ④ — assigned ผู้สั่งซื้อ + reassign control */}
                        <PurchaserCell
                          kind="shop"
                          orderNo={r.hno}
                          purchaserAdminId={r.assignedPurchaserId}
                          purchaserName={r.assignedPurchaserName}
                          canReassign={canReassignPurchaser}
                          admins={purchaserAdmins}
                          auto={r.purchaserIsAuto}
                        />
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex gap-2 items-start">
                          <div className="min-w-0 flex-1">
                            <Link
                              href={`/admin/service-orders/${r.hno}`}
                              className="text-sm font-semibold text-primary-600 hover:underline"
                            >
                              {r.htitle ?? "—"}
                            </Link>
                            {r.hcount > 1 && (
                              <span className="ml-1 text-[11px] text-muted">
                                และอีก {Math.round(r.hcount - 1)} รายการ
                              </span>
                            )}
                            {r.hstatus === "2" && r.hdatepayment && (
                              <div className="text-red-600 text-[11px] mt-0.5">
                                กรุณาชำระเงินก่อน {fmtDate(r.hdatepayment, true)} น.
                              </div>
                            )}
                            {r.hnote && (
                              <div className="mt-1 space-y-0.5">
                                {r.hnoteuser === "1" ? (
                                  <span className="inline-block rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 text-[11px]">
                                    แอดมินเท่านั้น
                                  </span>
                                ) : (
                                  <>
                                    <span className="inline-block rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 text-[11px]">
                                      ทั้งลูกค้าและแอดมิน
                                    </span>
                                    {r.hnoteuserread === "1" && (
                                      <span className="ml-1 text-[11px] text-muted">ยังไม่อ่าน</span>
                                    )}
                                  </>
                                )}
                                <div className="rounded bg-red-600 text-white text-[11px] px-1.5 py-0.5">
                                  หมายเหตุ: {r.hnote}
                                </div>
                                {r.hnotedate && (
                                  <div className="text-[11px] text-muted">
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
                              className="h-[60px] w-[60px] rounded border border-dashed border-border/60 bg-surface-alt/40 shrink-0 flex items-center justify-center text-[11px] text-muted text-center"
                              title="ไม่มีรูปสินค้า"
                            >
                              ไม่มี
                              <br />
                              รูป
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono text-sm font-semibold text-foreground whitespace-nowrap">
                        ฿{price.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-2 py-2.5">
                        <span className="inline-flex items-center gap-1 whitespace-nowrap">
                          <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${badgeCls}`}>
                            {sLabel}
                          </span>
                          {r.hstatus === "40" && (
                            <Explain def="ถึงโกดังจีนแล้ว — สินค้ามาถึงโกดังจีน รอจัดตู้/ส่งเข้าไทย (มาจากการ sync MOMO อัตโนมัติ) · สถานะนี้อยู่ระหว่าง “รอร้านจีนจัดส่ง” กับ “สำเร็จ”" />
                          )}
                        </span>
                        {sNext && r.hstatus !== "6" ? (
                          <div className={`mt-1 text-[11px] whitespace-nowrap ${sAct ? "font-semibold text-rose-600" : "text-muted"}`}>
                            {sAct ? "🔔 " : ""}{sNext}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-2 py-2.5 whitespace-nowrap">
                        {sDate ? (
                          <>
                            <div className="text-[11px]">{fmtDate(sDate, true)}</div>
                            <div className="text-[11px] text-red-600">
                              ผ่านมา {relativeAgo(sDate)}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                        {r.adminidupdate && r.adminidupdate !== "" && (
                          <div className="text-[11px] text-muted font-mono mt-0.5">{r.adminidupdate}</div>
                        )}
                      </td>
                      <td
                        className={`px-2 py-2.5 sticky right-0 z-10 shadow-[-4px_0_6px_-4px_rgba(0,0,0,0.08)] ${
                          isOn ? "bg-primary-50/95" : "bg-white"
                        } group-hover:bg-surface-alt/95`}
                      >
                        <div className="flex flex-col gap-1 items-stretch min-w-[110px]">
                          <Link
                            href={`/admin/service-orders/${r.hno}`}
                            className="rounded border border-green-500 bg-green-50 text-green-700 text-[11px] px-2 py-1 hover:bg-green-100 text-center whitespace-nowrap"
                          >
                            ดูรายละเอียด
                          </Link>
                          {canEditOrder && (
                            <Link
                              href={`/admin/service-orders/${r.hno}`}
                              className="rounded border border-orange-500 bg-orange-50 text-orange-700 text-[11px] px-2 py-1 hover:bg-orange-100 text-center whitespace-nowrap"
                            >
                              อัปเดตรายการ
                            </Link>
                          )}
                          {r.hstatus === "5" && (
                            <a
                              href={`/admin/service-orders/print?print=1&id=${encodeURIComponent(r.hno)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded border border-blue-500 bg-blue-50 text-blue-700 text-[11px] px-2 py-1 hover:bg-blue-100 text-center whitespace-nowrap"
                            >
                              พิมพ์ใบเสร็จ
                            </a>
                          )}
                          {/* hStatus 2..5 (legacy L534) — invoice button */}
                          {["2", "3", "4", "5"].includes(r.hstatus) && (
                            <a
                              href={`/admin/service-orders/print?print=2&id=${encodeURIComponent(r.hno)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded border border-red-500 bg-red-50 text-red-700 text-[11px] px-2 py-1 hover:bg-red-100 text-center whitespace-nowrap"
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
          <span className="rounded-full bg-primary-50 text-primary-700 border border-primary-200 px-3 py-1 text-xs font-semibold inline-flex items-center gap-1">
            ยอดรวม: <b>฿{totalAll.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
            <Explain def="ยอดรวมของรายการที่แสดงในหน้านี้เท่านั้น (ไม่ใช่ยอดรวมทั้งหมดทุกหน้า) — รวมราคารวมต่อออเดอร์ของทุกแถวที่เห็นด้านบน" align="right" />
          </span>
        </div>
      )}

      {/* Fixed-bottom bulk action bar — shows only when ≥1 row selected.
          Legacy shops.php L548-553 = พิมพ์ใบแจ้งหนี้/ใบเสร็จ. ภูม flag 2026-06-11
          adds "อัปเดตสถานะ" — manual status override mirroring the
          /admin/forwarders BulkActionsToolbar (pure status write · no money). */}
      {selected.size > 0 && (
        <div
          role="region"
          aria-label="บาร์จัดการรายการที่เลือก"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white dark:bg-surface shadow-[0_-2px_10px_rgba(0,0,0,0.06)] pcs-safe-area-bottom"
        >
          <div className="mx-auto max-w-7xl space-y-2 px-4 py-3 lg:px-8">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">
                เลือกแล้ว <b className="text-primary-600">{selected.size}</b> รายการ
              </span>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => { setStatusMode((v) => !v); setOutcome(null); setTopErr(null); }}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                      statusMode
                        ? "border-orange-500 bg-orange-500 text-white"
                        : "border-orange-400 bg-orange-50 text-orange-700 hover:bg-orange-100"
                    }`}
                  >
                    อัปเดตสถานะ
                  </button>
                  <Explain def="กดเพื่อแก้สถานะหลายออเดอร์พร้อมกันแบบแมนนวล — เป็นการเขียนสถานะตรงๆ ไม่รันระบบปกติ (ไม่ออกใบเสร็จ/คอมมิชชั่นอัตโนมัติ) · มีหน้าต่างยืนยันก่อนทำเสมอ" />
                </span>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="rounded-md border border-border bg-white px-3 py-1.5 text-xs font-medium hover:bg-surface-alt"
                >
                  ยกเลิก
                </button>
                {/* Legacy shops.php L548-553: bulk-print hidden on q=1 (รอดำเนินการ ·
                    ยังไม่จ่าย = ไม่มีอะไรพิมพ์) + q=6 (ยกเลิก). status-override เก็บไว้ทุกแท็บ. */}
                {activeTab !== "1" && activeTab !== "6" && (
                  <>
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
                  </>
                )}
              </div>
            </div>

            {statusMode && (
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
                <span className="text-xs text-muted">ขยับเป็นสถานะ:</span>
                <select
                  value={targetStatus}
                  onChange={(e) => setTargetStatus(e.target.value as ShopOrderStatus | "")}
                  className="rounded-md border border-border bg-white px-3 py-1.5 text-sm"
                >
                  <option value="">— เลือกสถานะปลายทาง —</option>
                  {SHOP_STATUSES.map((s) => (
                    <option key={s} value={s}>{s} · {STATUS_LABEL[s] ?? s}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="หมายเหตุ (ถ้ามี · เก็บใน log)"
                  className="min-w-[180px] flex-1 rounded-md border border-border bg-white px-3 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={runStatusUpdate}
                  disabled={!targetStatus || pending}
                  className="rounded-md bg-orange-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-40"
                >
                  {pending ? "กำลังอัปเดต..." : `ยืนยัน (${selected.size})`}
                </button>
              </div>
            )}

            {topErr && (
              <div className="rounded-md bg-red-100 px-2 py-1.5 text-xs text-red-800">{topErr}</div>
            )}
            {outcome && (
              <div className="space-y-1">
                {outcome.ok > 0 && (
                  <div className="rounded-md bg-green-100 px-2 py-1.5 text-xs text-green-800">
                    อัปเดตสถานะสำเร็จ {outcome.ok} รายการ
                  </div>
                )}
                {outcome.failed.length > 0 && (
                  <div className="space-y-0.5 rounded-md bg-yellow-100 px-2 py-1.5 text-xs text-yellow-900">
                    <div className="font-medium">ล้มเหลว {outcome.failed.length} รายการ:</div>
                    {outcome.failed.slice(0, 3).map((f) => (
                      <div key={f.hno} className="font-mono">· {f.hno}: {f.error}</div>
                    ))}
                    {outcome.failed.length > 3 && (
                      <div className="text-muted">+ อีก {outcome.failed.length - 3} รายการ</div>
                    )}
                  </div>
                )}
              </div>
            )}
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
  sortHrefs,
  align,
  info,
}: {
  label: string;
  field: SortField;
  currentSort: SortField | undefined;
  currentDir: "asc" | "desc";
  sortHrefs: Record<SortField, string>;
  align?: "right";
  /** Optional ⓘ guide hint (display-only) shown beside the sortable header. */
  info?: string;
}) {
  const active = currentSort === field;
  const arrow = active ? (currentDir === "asc" ? "↑" : "↓") : "⇵";
  const cls = align === "right" ? "text-right" : "";
  return (
    <th className={`px-2 py-3 ${cls}`}>
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "justify-end" : ""}`}>
        <Link
          href={sortHrefs[field]}
          className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-primary-600" : ""}`}
        >
          {label}
          <span className="text-[11px]" aria-hidden>{arrow}</span>
        </Link>
        {info && <Explain def={info} align={align === "right" ? "right" : "center"} />}
      </span>
    </th>
  );
}
