"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  adminBulkUpdateForwarderTbStatus,
  markForwarderPrinted,
  adminRestoreForwarderFromSpecial,
} from "@/actions/admin/forwarders";

/**
 * Forwarders table — Wave 11 fidelity port to legacy `forwarder.php`
 * L508-707 (the 12-column list layout).
 *
 * Wave 11 changes vs Wave 5:
 *   - Column shape mirrors legacy 1:1: ID · วันที่สร้าง · รหัสลูกค้า ·
 *     รายละเอียด · ยอดค้างชำระ · เลขพัสดุ(จีน) · เลขพัสดุ(ไทย) ·
 *     เข้าโกดัง · ออกโกดัง · ถึงไทย · สถานะ · อัปเดต · ตัวเลือก
 *   - "ออเดอร์ #<id>" link instead of "f_no" (was wrongly showing
 *     Cargo API tracking `fidorco`)
 *   - "ฝากนำเข้าจาก: users" / "จาก: admin_X" badge under product detail
 *   - 3 stage-date columns (fdatestatus2/3/4) for warehouse pipeline visibility
 *   - Inline ดู / อัปเดต button cluster in the ตัวเลือก column
 *
 * Wave 5 carry-over (still works · same Server Action):
 *   - Checkbox column + indeterminate header check
 *   - Fixed-bottom bulk-update bar with 8-status dropdown
 *   - window.confirm dialog before mutation
 */

export type Row = {
  id: number;
  order_no: string;             // "ออเดอร์ #<id>"
  f_no_cargo: string | null;    // fidorco (Cargo API tracking · separate from order id)
  status: string;
  warehouse_china: string;
  partner_warehouse: string;
  transport_type: string;
  amount_count: number;
  weight_kg: number;
  volume_cbm: number;
  total_price: number;
  tracking_chn: string | null;
  tracking_th: string | null;
  cabinet_number: string | null;
  created_at: string;
  date_status2: string | null;
  date_status3: string | null;
  date_status4: string | null;
  date_admin_status: string | null;
  admin_id_last: string | null;
  admin_creator: string | null;
  ref_order: string | null;
  fcredit: string;
  paydeposit: string | null;
  note: string | null;
  detail: string | null;
  cover: string | null;
  /**
   * Wave 13 — server-resolved signed Supabase URL for `cover`. The Server
   * Component on page.tsx fans out `resolveLegacyUrlMap("cover")` and
   * fills this in before passing rows down; the client just renders it.
   */
  coverUrl: string | null;
  /**
   * Wave 15 P0-3 — outstanding balance (ยอดค้างชำระ) in THB. Computed
   * by `calcForwarderOutstanding()` on the server. Zero when row is
   * paid in full (paydeposit='1').
   */
  outstanding_thb: number;
  /**
   * Wave 15 P0-3 — admin id who measured dimensions/weight
   * (`adminidkey`). Empty when not yet measured.
   */
  measured_by_admin: string | null;
  /**
   * Wave 18-B — 7-col fidelity backfill (per fidelity-gap-2026-05-24.md).
   * Legacy forwarder.php L575-580 + L595-609 + L651-653 render these as
   * inline badges/chips operators read at-a-glance.
   */
  print_status_1: boolean;   // legacy printstatus1='1' → "พิมพ์แล้ว #1"
  print_status_2: boolean;   // legacy printstatus2='1' → "พิมพ์แล้ว #2"
  print_status_3: boolean;   // legacy printstatus3='1' → "พิมพ์แล้ว #3"
  print_status_4: boolean;   // legacy printstatus4='1' → "พิมพ์แล้ว #4"
  car_on: boolean;           // legacy fstatuscaron='1' → ขึ้นรถแล้ว
  car_off: boolean;          // legacy fstatuscaroff='1' → ลงรถ
  eta_base: string | null;   // legacy fdatetothai · ETA range computed in cell
  pallet: string | null;     // legacy fpallet · warehouse location chip
  customer: {
    userid: string;
    name: string;
    phone: string;
    // Wave 18-B — VIP/SVIP/SaleAdmin badge inputs (legacy badgeVIP3 +
    // badgeAdminSale at forwarder.php L589).
    coid: string;
    is_svip: boolean;
    is_corporate: boolean;
    is_comparison: boolean;
    is_juristic: boolean;
    sale_admin: string | null;
  } | null;
};

const STATUS_BADGE: Record<string, string> = {
  "1":  "bg-yellow-50 text-yellow-700 border-yellow-200",
  "2":  "bg-blue-50 text-blue-700 border-blue-200",
  "3":  "bg-pink-50 text-pink-700 border-pink-200",
  "4":  "bg-purple-50 text-purple-700 border-purple-200",
  "5":  "bg-red-50 text-red-700 border-red-200",
  "6":  "bg-indigo-50 text-indigo-700 border-indigo-200",
  "7":  "bg-green-50 text-green-700 border-green-200",
  "99": "bg-orange-50 text-orange-700 border-orange-200",
};

// Bulk-update target options. The dropdown intentionally excludes "6.1"
// (= fstatus='6' with a driver-item join) — that's not a real fstatus
// value the legacy app can SET; it's a derived display slice. '99' is
// the legacy "พิเศษ" lane (Special Hold).
type BulkStatusValue = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "99";
const BULK_STATUS_OPTIONS: ReadonlyArray<{ v: BulkStatusValue; l: string }> = [
  { v: "1",  l: "1 · รอเข้าโกดังจีน" },
  { v: "2",  l: "2 · ถึงโกดังจีนแล้ว" },
  { v: "3",  l: "3 · กำลังส่งมาไทย" },
  { v: "4",  l: "4 · ถึงไทยแล้ว" },
  { v: "5",  l: "5 · รอชำระเงิน" },
  { v: "6",  l: "6 · เตรียมส่ง" },
  { v: "7",  l: "7 · ส่งแล้ว" },
  { v: "99", l: "99 · สถานะพิเศษ" },
];

function fmtDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  if (withTime) {
    return d.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
  }
  return d.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

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

/**
 * Wave 18-B — port of legacy `diffDateTimeNow($datetime)` from
 * `pcs-admin/include/function.php` L1399-1425. Used as the inline
 * "X วันที่แล้ว" elapsed-time stamp next to fdate so operators see SLA
 * breaches at-a-glance ("stuck 8 days in China warehouse").
 *
 * Output format chosen for list density: "8 วัน 3 ชม" (skip seconds —
 * legacy showed them but they're noise in a 300-row table).
 */
function diffDateTimeNowThai(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  if (days > 0) return hours > 0 ? `${days} วัน ${hours} ชม` : `${days} วัน`;
  if (hours > 0) return `${hours} ชม ${minutes} น.`;
  if (minutes > 0) return `${minutes} นาที`;
  return "เพิ่งสักครู่";
}

/**
 * Wave 18-B — ETA range "23/05 ± 2 วัน" formatter (port of legacy
 * forwarder.php L595-609). Legacy logic:
 *   transport=1 (รถ): show fDateToThai → fDateToThai+2 (range = 2 days)
 *   else (เรือ/แอร์): show fDateToThai → fDateToThai+4 (range = 4 days)
 * The `0000-00-00` sentinel ("no ETA yet") is mapped to null upstream
 * — server-side `eta_base` is already `string | null`.
 */
function formatEtaRange(
  base: string | null,
  transportType: string,
): { primary: string; tail: string } | null {
  if (!base) return null;
  const d = new Date(base);
  if (Number.isNaN(d.getTime())) return null;
  const offset = transportType === "1" ? 2 : 4;
  const end = new Date(d);
  end.setDate(end.getDate() + offset);
  const fmt = (x: Date) =>
    x.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit" });
  return {
    primary: `${fmt(d)} - ${fmt(end)}`,
    tail: `± ${offset} วัน`,
  };
}

/**
 * Wave 18-B — VIP/SVIP/SaleAdmin badges. Port of legacy helpers
 * `badgeVIP3()` (function.php L597) + `badgeAdminSale()` (L618).
 * Inline component to avoid a new file for ~30 LOC.
 */
function CustomerBadges({
  coid,
  isSvip,
  isCorporate,
  isComparison,
  isJuristic,
  saleAdmin,
}: {
  coid: string;
  isSvip: boolean;
  isCorporate: boolean;
  isComparison: boolean;
  isJuristic: boolean;
  saleAdmin: string | null;
}) {
  // Tier-color map mirrors the legacy `badge-vip` palette but uses our
  // Tailwind tokens (no Bootstrap badge classes).
  const tierBadge = (() => {
    if (!coid || coid === "PCS") return null;  // PCS = default tier = no chip
    const label = coid;
    return (
      <span className="rounded-full border border-purple-300 bg-purple-50 px-1.5 py-0.5 text-[9px] font-semibold text-purple-700">
        {label}
      </span>
    );
  })();
  return (
    <div className="mt-0.5 flex flex-wrap gap-1 items-center">
      {tierBadge}
      {isSvip && (
        <span
          className="rounded-full border border-pink-300 bg-pink-50 px-1.5 py-0.5 text-[9px] font-semibold text-pink-700"
          title="ลูกค้าคิดราคาแบบส่วนตัว"
        >
          SVIP
        </span>
      )}
      {isComparison && (
        <span
          className="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700"
          title="ลูกค้าคิดราคาตามค่าเทียบ"
        >
          CPS
        </span>
      )}
      {(isCorporate || isJuristic) && (
        <span
          className="rounded-full border border-blue-300 bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold text-blue-700"
          title="ลูกค้าบริษัท (นิติบุคคล)"
        >
          นิติ
        </span>
      )}
      <span
        className={`rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${
          saleAdmin
            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
            : "border-gray-200 bg-gray-50 text-gray-500"
        }`}
        title="Sale ผู้ดูแล"
      >
        Sale : {saleAdmin ?? "ไม่ระบุ"}
      </span>
    </div>
  );
}

/**
 * MOMO writes their own routing-batch ID into `container_no` (e.g.
 * "PR20260527-SEA02" / "MO20260523-SEA02") BEFORE the container actually
 * closes. Until MOMO's sync flips that to the real cabinet (e.g.
 * "GZS260525-2" from `momo_container_closed.raw.cid`), the value isn't
 * a real cabinet a staff member can drill into via /admin/report-cnt/.
 *
 * This helper detects those routing-batch IDs so the UI can display
 * "รอปิดตู้" instead of the cryptic value, and skip the (broken) drill
 * link. The backfill script (scripts/backfill-momo-cabinet.mjs) replaces
 * these values with real cabinets once MOMO closes the batch — so this
 * is a transitional display, not a permanent mask.
 */
const MOMO_ROUTING_RX = /^(PR|MO)\d{8}-(SEA|EK)\d{2}$/;
function isMomoRoutingBatch(cab: string | null | undefined): boolean {
  return !!cab && MOMO_ROUTING_RX.test(cab.trim());
}

export function ForwardersTable({
  rows,
  statusLabel,
  modeLabel,
  currentStatus,
}: {
  rows: Row[];
  statusLabel: Record<string, string>;
  modeLabel: Record<string, string>;
  /**
   * The active `?status=` filter (from the page's searchParams). When this is
   * "p" the list is showing the special-status (พิเศษ / fstatus="99") lane, so
   * the special-toggle button flips its action from "add to special" → "restore
   * to normal". Undefined = the default mixed list.
   */
  currentStatus?: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<BulkStatusValue>("2");
  // Wave 23 (2026-05-27 ภูม flag): cabinet input in bulk-bar so admin can
  // assign a container (เลขตู้ "GZE-2026-001" etc) to a batch of orders in
  // one shot. Optional — left blank = don't touch fcabinetnumber on the
  // selected rows (matches legacy semantics).
  const [bulkCabinet, setBulkCabinet] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggleRow = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelected(new Set(rows.map((r) => r.id)));
    else setSelected(new Set());
  };

  const clearSelection = () => {
    setSelected(new Set());
    setBulkCabinet("");
    setError(null);
    setSuccess(null);
  };

  const onBulkSubmit = () => {
    setError(null);
    setSuccess(null);
    if (selected.size === 0) return;
    const statusLabelTxt = BULK_STATUS_OPTIONS.find((o) => o.v === bulkStatus)?.l ?? bulkStatus;
    const cab = bulkCabinet.trim();
    const cabinetTxt = cab ? `\nเลขตู้ (GZE/GZS): "${cab}"` : "";
    if (!window.confirm(`อัพเดต ${selected.size} รายการ เป็นสถานะ "${statusLabelTxt}"${cabinetTxt} ?`)) return;

    const fids = Array.from(selected);
    startTransition(async () => {
      const result = await adminBulkUpdateForwarderTbStatus({
        fids,
        fstatus: bulkStatus,
        // Only pass cabinet_number when admin actually typed something —
        // leaving the input blank should NOT clobber existing cabinet
        // numbers on the selected rows.
        ...(cab ? { cabinet_number: cab } : {}),
      });
      if (!result.ok) {
        setError(result.error ?? "อัพเดตไม่สำเร็จ");
        return;
      }
      setSuccess(`อัพเดตสำเร็จ ${result.data?.updated ?? fids.length} รายการ`);
      setSelected(new Set());
      setBulkCabinet("");
      router.refresh();
    });
  };

  // Wave 30.x (2026-05-29 ภูม) — faithful port of legacy printAll.php's three
  // bottom-left buttons: พิมพ์จากหน้ากล่อง (box label, printStatus1) ·
  // พิมพ์ที่อยู่ส่งสินค้า (address label, printStatus4) · เพิ่มไปสถานะพิเศษ.
  const inSpecialLane = currentStatus === "p";

  /**
   * Open the 100×75mm label print sheet for the selected rows.
   *  which=1 → box label  (?type=box)     → marks printstatus1
   *  which=4 → address label (?type=address) → marks printstatus4
   * window.open fires synchronously inside the click gesture so the popup
   * blocker stays happy; the markForwarderPrinted call is best-effort audit
   * only — a failure there must NOT stop the operator from printing.
   */
  const onPrintLabels = (which: 1 | 4) => {
    setError(null);
    setSuccess(null);
    if (selected.size === 0) return;
    const fids = Array.from(selected);
    const typeParam = which === 1 ? "box" : "address";
    const query = fids.map((id) => `id[]=${id}`).join("&");
    window.open(
      `/admin/forwarders/print?type=${typeParam}&${query}`,
      "_blank",
      "noopener,noreferrer",
    );
    // Best-effort: record that these labels were printed (printStatus flag).
    startTransition(async () => {
      const result = await markForwarderPrinted({ fids, which });
      if (!result.ok) {
        // Non-blocking — the sheet already opened. Surface softly.
        setError(`เปิดหน้าพิมพ์แล้ว แต่บันทึกสถานะพิมพ์ไม่สำเร็จ: ${result.error ?? ""}`);
      }
    });
  };

  /**
   * Special-status toggle. In the normal list → push selected rows to
   * fstatus="99" (พิเศษ) via the existing bulk action. In the special lane
   * (?status=p) → restore them to their pre-special status from the status log.
   */
  const onSpecialToggle = () => {
    setError(null);
    setSuccess(null);
    if (selected.size === 0) return;
    const fids = Array.from(selected);

    if (inSpecialLane) {
      if (
        !window.confirm(
          `ย้าย ${fids.length} รายการ กลับสู่สถานะปกติ (คืนค่าจากประวัติสถานะ) ?`,
        )
      )
        return;
      startTransition(async () => {
        const result = await adminRestoreForwarderFromSpecial({ fids });
        if (!result.ok) {
          setError(result.error ?? "ย้ายกลับสถานะปกติไม่สำเร็จ");
          return;
        }
        setSuccess(`ย้ายกลับสถานะปกติสำเร็จ ${result.data?.restored ?? fids.length} รายการ`);
        clearSelection();
        router.refresh();
      });
      return;
    }

    if (
      !window.confirm(`เพิ่ม ${fids.length} รายการ ไปยังสถานะพิเศษ (พิเศษ / 99) ?`)
    )
      return;
    startTransition(async () => {
      const result = await adminBulkUpdateForwarderTbStatus({ fids, fstatus: "99" });
      if (!result.ok) {
        setError(result.error ?? "เพิ่มไปสถานะพิเศษไม่สำเร็จ");
        return;
      }
      setSuccess(`เพิ่มไปสถานะพิเศษสำเร็จ ${result.data?.updated ?? fids.length} รายการ`);
      clearSelection();
      router.refresh();
    });
  };

  const allChecked = rows.length > 0 && selected.size === rows.length;
  const someChecked = selected.size > 0 && selected.size < rows.length;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่มีรายการที่ตรงกัน</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
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
                  <th className="px-2 py-3">ID</th>
                  <th className="px-2 py-3">วันที่สร้าง</th>
                  <th className="px-2 py-3">รหัสลูกค้า</th>
                  <th className="px-2 py-3">รายละเอียด</th>
                  <th className="px-2 py-3 text-right" title="คำนวณจาก calPriceForwarderMain (legacy formula)">ยอดค้างชำระ</th>
                  <th className="px-2 py-3">เลขพัสดุ (จีน)</th>
                  <th className="px-2 py-3">เลขพัสดุ (ไทย)</th>
                  <th className="px-2 py-3">เข้าโกดัง</th>
                  <th className="px-2 py-3">ออกโกดัง</th>
                  <th className="px-2 py-3">ถึงไทย</th>
                  <th className="px-2 py-3">สถานะ</th>
                  <th className="px-2 py-3">อัปเดต</th>
                  <th className="px-2 py-3">ตัวเลือก</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const statusKey = r.status;
                  const badgeCls = STATUS_BADGE[r.status] ?? "bg-gray-50 text-gray-600 border-gray-200";
                  const sLabel = r.fcredit === "1"
                    ? `เครติด · ${statusLabel[r.status] ?? r.status}`
                    : statusLabel[statusKey] ?? statusKey;
                  const isOn = selected.has(r.id);
                  // Wave 19 BUG #2 fix — port forwarder.php L623-624 logic
                  // EXACTLY (ภูม catch · "ฝากนำเข้า : ระบบ" wording was wrong ·
                  // legacy refOrder-set = "ฝากสั่งซื้อ : <hNo>" link to shops).
                  //
                  // Legacy 2-block rendering:
                  //   Block 1 (mutually exclusive · ONLY when refOrder empty):
                  //     - adminIDCreator set      → yellow "ฝากนำเข้า : admin_X"
                  //     - adminIDCreator empty    → gray  "ฝากนำเข้าจาก : users"
                  //   Block 2 (additive · ONLY when refOrder set):
                  //     - any                     → blue  "ฝากสั่งซื้อ : <hNo>"
                  //                                 + link to /admin/shops/detail/<hNo>
                  //
                  // When refOrder is set, Block 1 hides entirely (customer's
                  // shop order spawned this forwarder · the shop is the source).
                  const hasRefOrder = !!(r.ref_order && r.ref_order !== "");
                  const hasAdminCreator = !!(r.admin_creator && r.admin_creator !== "");
                  const block1Label = hasRefOrder
                    ? null
                    : hasAdminCreator
                      ? `ฝากนำเข้า : ${r.admin_creator}`
                      : "ฝากนำเข้าจาก : users";
                  const block1Cls = hasAdminCreator
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
                          onChange={() => toggleRow(r.id)}
                          aria-label={`เลือก ออเดอร์ #${r.id}`}
                        />
                      </td>
                      <td className="px-2 py-2.5 font-mono whitespace-nowrap">{r.id}</td>
                      <td className="px-2 py-2.5 whitespace-nowrap text-muted">
                        {r.created_at ? new Date(r.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "—"}
                        {/* Wave 18-B — diffDateTimeNow elapsed-time stamp
                            (port of legacy function.php L1399 · forwarder.php
                            L673 "ผ่านมา : ...") next to fdate. SLA visibility
                            without making operators do mental math. */}
                        {r.created_at && (
                          <div className="text-[9px] text-amber-700 mt-0.5">
                            ผ่านมา {diffDateTimeNowThai(r.created_at)}
                          </div>
                        )}
                        {/* Wave 18-B — print-status + ขึ้นรถ/ลงรถ badges
                            (port of legacy forwarder.php L575-580). Each
                            badge = a workflow checkbox an operator already
                            ticked. Tiny chips kept inline below the date. */}
                        {(r.print_status_1 || r.print_status_2 || r.print_status_3 || r.print_status_4 || r.car_on || r.car_off) && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {r.print_status_1 && (
                              <span
                                className="rounded-full border border-blue-300 bg-blue-50 px-1 py-0.5 text-[9px] text-blue-700"
                                title="พิมพ์เอกสาร #1 แล้ว"
                              >
                                📄1
                              </span>
                            )}
                            {r.print_status_2 && (
                              <span
                                className="rounded-full border border-sky-300 bg-sky-50 px-1 py-0.5 text-[9px] text-sky-700"
                                title="พิมพ์เอกสาร #2 แล้ว"
                              >
                                📄2
                              </span>
                            )}
                            {r.print_status_3 && (
                              <span
                                className="rounded-full border border-green-300 bg-green-50 px-1 py-0.5 text-[9px] text-green-700"
                                title="พิมพ์เอกสาร #3 แล้ว"
                              >
                                📄3
                              </span>
                            )}
                            {r.print_status_4 && (
                              <span
                                className="rounded-full border border-amber-300 bg-amber-50 px-1 py-0.5 text-[9px] text-amber-700"
                                title="พิมพ์เอกสาร #4 แล้ว"
                              >
                                📄4
                              </span>
                            )}
                            {r.car_on && (
                              <span
                                className="rounded-full border border-amber-400 bg-amber-50 px-1 py-0.5 text-[9px] text-amber-800"
                                title="ขึ้นรถแล้ว"
                              >
                                ↑ ขึ้นรถ
                              </span>
                            )}
                            {r.car_off && (
                              <span
                                className="rounded-full border border-gray-300 bg-gray-50 px-1 py-0.5 text-[9px] text-gray-700"
                                title="ลงรถแล้ว"
                              >
                                ↓ ลงรถ
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="font-mono font-semibold">{r.customer?.userid ?? "—"}</div>
                        <div className="truncate max-w-[140px]" title={r.customer?.name ?? ""}>
                          {r.customer?.name || "—"}
                        </div>
                        <div className="text-muted text-[10px]">{r.customer?.phone}</div>
                        {/* Wave 18-B — VIP/SVIP/SaleAdmin badges (port of
                            legacy badgeVIP3 + badgeAdminSale · L589). */}
                        {r.customer && (
                          <CustomerBadges
                            coid={r.customer.coid}
                            isSvip={r.customer.is_svip}
                            isCorporate={r.customer.is_corporate}
                            isComparison={r.customer.is_comparison}
                            isJuristic={r.customer.is_juristic}
                            saleAdmin={r.customer.sale_admin}
                          />
                        )}
                        {/* Wave 18-B — จะมาถึงไทย ETA range (port of legacy
                            forwarder.php L595-609). Transport=1 = ±2d ·
                            else ±4d. Hidden when no ETA set. */}
                        {(() => {
                          const eta = formatEtaRange(r.eta_base, r.transport_type);
                          if (!eta) return null;
                          return (
                            <div className="mt-1 text-[10px] text-primary-700">
                              จะมาถึงไทย: <span className="font-medium">{eta.primary}</span>{" "}
                              <span className="text-muted">{eta.tail}</span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex gap-2 items-start">
                          {/* Product thumbnail · legacy forwarder.php shows the
                              fcover image inline in the รายละเอียด column for
                              fast "is this the right box" recognition. Empty
                              cover renders a neutral placeholder so the row
                              height stays consistent. */}
                          {r.coverUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={r.coverUrl}
                              alt={`ออเดอร์ ${r.id}`}
                              className="h-12 w-12 rounded border border-border object-cover bg-surface-alt shrink-0"
                              loading="lazy"
                            />
                          ) : r.ref_order && r.ref_order !== "" ? (
                            // Wave 20 quick-win 1: shop-spawned row with NO image
                            // = real bug (URL fetch failed at order time). Surface
                            // it differently so ops know to investigate.
                            <div
                              aria-hidden
                              className="h-12 w-12 rounded border border-dashed border-amber-300 bg-amber-50/60 shrink-0 flex items-center justify-center text-[10px] text-amber-700"
                              title={`ฝากสั่งซื้อ ${r.ref_order} — รูปสินค้าหาย`}
                            >
                              ⚠️
                              <br />
                              ไม่พบ
                            </div>
                          ) : (
                            // Admin-created / user-uploaded forwarder = no product
                            // image expected (just a shipping container). Neutral
                            // box icon — ภูม confirmed 2026-05-26 he doesn't want
                            // the customer-initial avatar variant; the box reads
                            // correctly once you know admin rows never have product
                            // images. Smart tooltip + reserved ⚠️ amber for the
                            // refOrder-set rows where image fetch failed stay in
                            // place above.
                            <div
                              aria-hidden
                              className="h-12 w-12 rounded border border-border/60 bg-surface-alt/40 shrink-0 flex items-center justify-center text-muted"
                              title={r.admin_creator ? `ฝากนำเข้า admin ${r.admin_creator}` : "ฝากนำเข้าจากลูกค้า"}
                            >
                              📦
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <Link
                              href={`/admin/forwarders/${r.id}`}
                              className="font-semibold text-primary-600 hover:underline"
                            >
                              ออเดอร์ #{r.id}
                            </Link>
                            {r.detail && (
                              <div className="text-muted truncate max-w-[200px] mt-0.5" title={r.detail}>
                                {r.detail}
                              </div>
                            )}
                            <div className="mt-1 flex flex-wrap gap-1 items-center">
                              {/* Block 1: admin OR users (mutually exclusive · only when no refOrder) */}
                              {block1Label && (
                                <span className={`rounded-full border px-1.5 py-0.5 text-[9px] ${block1Cls}`}>
                                  {block1Label}
                                </span>
                              )}
                              {/* Block 2: shop-order link (additive · only when refOrder set) */}
                              {hasRefOrder && (
                                <Link
                                  href={`/admin/shops/detail/${r.ref_order}`}
                                  className="rounded-full border bg-sky-50 text-sky-700 border-sky-200 px-1.5 py-0.5 text-[9px] hover:bg-sky-100"
                                  title="คลิกดูออเดอร์ฝากสั่งซื้อที่ spawn ฝากนำเข้านี้"
                                >
                                  ฝากสั่งซื้อ : {r.ref_order}
                                </Link>
                              )}
                              {r.f_no_cargo && (
                                <span className="text-[9px] text-muted font-mono" title="Cargo API tracking (fidorco)">
                                  {r.f_no_cargo}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-right whitespace-nowrap">
                        {/* Wave 15 P0-3 — ยอดค้างชำระ replaces raw total_price
                            here. The outstanding number is what operators chase
                            (legacy column 5 = calPriceForwarderMain result · paid
                            rows fall to 0 so they don't distract). Weight + CBM
                            + measurer's admin-id stack below for the same
                            money-chasing context as the legacy layout. */}
                        {r.outstanding_thb > 0 ? (
                          <div className="font-mono font-semibold text-red-700">
                            ฿{r.outstanding_thb.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                          </div>
                        ) : r.paydeposit === "1" ? (
                          <div className="font-mono text-[11px] font-medium text-green-600">
                            ชำระแล้ว
                          </div>
                        ) : (
                          <div className="font-mono text-muted text-[11px]">—</div>
                        )}
                        <div className="text-muted text-[10px] mt-0.5">
                          {r.amount_count} กล่อง
                          {r.weight_kg > 0 && (
                            <> · {r.weight_kg.toLocaleString("th-TH", { maximumFractionDigits: 2 })} Kg</>
                          )}
                        </div>
                        {r.volume_cbm > 0 && (
                          <div className="text-muted text-[10px]">
                            {(r.volume_cbm * (r.amount_count || 1)).toLocaleString("th-TH", { maximumFractionDigits: 4 })} CBM
                          </div>
                        )}
                        {r.measured_by_admin && (
                          <div className="text-[9px] text-muted/70 font-mono mt-0.5" title="แอดมินที่วัดขนาด/ชั่งน้ำหนัก">
                            วัด: {r.measured_by_admin}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        {r.tracking_chn && r.tracking_chn !== "-" ? (
                          <>
                            <div className="font-mono text-[10px]">{r.tracking_chn}</div>
                            <div className="mt-0.5">
                              <span className="rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 text-[9px]">
                                {modeLabel[r.transport_type] ?? r.transport_type}
                              </span>
                            </div>
                          </>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                        {/* Wave 18-B — cabinet number drill-down (port of
                            legacy forwarder.php L651 — anchor to
                            `report-cnt.php?id=<cabinet>`). Pacred has a
                            per-cabinet detail page at
                            `/admin/report-cnt/[fNo]` (Wave 16 P0-1)
                            keyed by the cabinet code; link straight there. */}
                        {r.cabinet_number && (
                          <div className="mt-1 text-[10px]">
                            <span className="text-muted">เลขตู้: </span>
                            {isMomoRoutingBatch(r.cabinet_number) ? (
                              <span
                                className="font-mono text-amber-700"
                                title={`รอ MOMO ปิดตู้ (routing batch: ${r.cabinet_number})`}
                              >
                                รอปิดตู้
                              </span>
                            ) : (
                              <Link
                                href={`/admin/report-cnt/${encodeURIComponent(r.cabinet_number)}`}
                                className="font-mono text-primary-600 hover:underline"
                              >
                                {r.cabinet_number}
                              </Link>
                            )}
                          </div>
                        )}
                        {/* Wave 18-B — fpallet (warehouse location) chip
                            (port of legacy L653 "location : <fpallet>"). */}
                        {r.pallet && (
                          <div className="mt-1">
                            <span
                              className="rounded-full border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[9px] font-mono text-slate-700"
                              title="ตำแหน่งใน warehouse"
                            >
                              loc: {r.pallet}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2.5 font-mono text-[10px]">
                        {r.tracking_th && r.tracking_th !== "-" ? r.tracking_th : <span className="text-muted">—</span>}
                      </td>
                      <td className="px-2 py-2.5 whitespace-nowrap text-muted">
                        {fmtDate(r.date_status2)}
                      </td>
                      <td className="px-2 py-2.5 whitespace-nowrap text-muted">
                        {fmtDate(r.date_status3)}
                      </td>
                      <td className="px-2 py-2.5 whitespace-nowrap text-muted">
                        {fmtDate(r.date_status4)}
                      </td>
                      <td className="px-2 py-2.5">
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-medium whitespace-nowrap ${badgeCls}`}>
                          {sLabel}
                        </span>
                        {r.cabinet_number && (
                          isMomoRoutingBatch(r.cabinet_number) ? (
                            <div
                              className="mt-0.5 text-[9px] text-amber-700 font-mono"
                              title={`รอ MOMO ปิดตู้ (routing batch: ${r.cabinet_number})`}
                            >
                              ตู้ · รอปิด
                            </div>
                          ) : (
                            <div className="mt-0.5 text-[9px] text-muted font-mono">ตู้ {r.cabinet_number}</div>
                          )
                        )}
                      </td>
                      <td className="px-2 py-2.5 whitespace-nowrap">
                        {r.date_admin_status ? (
                          <>
                            <div className="text-muted text-[10px]">
                              {fmtDate(r.date_admin_status, true)}
                            </div>
                            <div className="text-[9px] text-amber-700">
                              ผ่านมา {relativeAgo(r.date_admin_status)}
                            </div>
                            {r.admin_id_last && (
                              <div className="text-[9px] text-muted font-mono">{r.admin_id_last}</div>
                            )}
                          </>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex flex-col gap-1">
                          <Link
                            href={`/admin/forwarders/${r.id}`}
                            className="rounded border border-green-500 bg-green-50 text-green-700 text-[10px] px-2 py-1 hover:bg-green-100 text-center whitespace-nowrap"
                          >
                            ดูข้อมูล
                          </Link>
                          <Link
                            href={`/admin/forwarders/${r.id}`}
                            className="rounded border border-orange-500 bg-orange-50 text-orange-700 text-[10px] px-2 py-1 hover:bg-orange-100 text-center whitespace-nowrap"
                          >
                            อัปเดต
                          </Link>
                          {/* Per-row print entry — bulk bar opens with multi-id;
                              this is the discoverable single-row equivalent. */}
                          <a
                            href={`/admin/forwarders/print?type=box&id[]=${r.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="พิมพ์ป้ายสติกเกอร์ติดกล่อง (100×75 มม.)"
                            className="rounded border border-blue-500 bg-blue-50 text-blue-700 text-[10px] px-2 py-1 hover:bg-blue-100 text-center whitespace-nowrap"
                          >
                            🖨 พิมพ์ป้าย
                          </a>
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

      {/* Inline status banners (visible above the fixed bar) */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {success}
        </div>
      )}

      {/* Fixed-bottom bulk action bar — shows only when ≥1 row selected */}
      {selected.size > 0 && (
        <div
          role="region"
          aria-label="บาร์เปลี่ยนสถานะกลุ่ม"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white dark:bg-surface shadow-[0_-2px_10px_rgba(0,0,0,0.06)] pcs-safe-area-bottom"
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 lg:px-8">
            <span className="text-sm font-medium">
              เลือกแล้ว <b className="text-primary-600">{selected.size}</b> รายการ
            </span>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted">เปลี่ยนสถานะเป็น</span>
              <select
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value as BulkStatusValue)}
                disabled={pending}
                className="rounded-md border border-border bg-white px-2 py-1.5 text-sm"
              >
                {BULK_STATUS_OPTIONS.map((o) => (
                  <option key={o.v} value={o.v}>{o.l}</option>
                ))}
              </select>
            </label>
            {/* Cabinet input — Wave 23 ภูม flag: assign เลขตู้ (GZE/GZS) to
                the selected batch in one shot. Blank = don't touch. */}
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted whitespace-nowrap">เลขตู้</span>
              <input
                type="text"
                value={bulkCabinet}
                onChange={(e) => setBulkCabinet(e.target.value)}
                disabled={pending}
                maxLength={300}
                placeholder="GZE-2026-001 (เว้นว่าง = ไม่เปลี่ยน)"
                className="rounded-md border border-border bg-white px-2 py-1.5 text-sm font-mono w-56"
              />
            </label>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {/* Faithful port of legacy printAll.php bottom-left trio.
                  Print buttons open the 100×75mm label sheet in a new tab and
                  do NOT clear the selection (so the operator can print both
                  box + address labels for the same batch). */}
              <button
                type="button"
                onClick={() => onPrintLabels(1)}
                disabled={pending}
                className="rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                title="พิมพ์ป้ายติดหน้ากล่อง (100×75mm) — รหัสลูกค้า + QR + น้ำหนัก/ปริมาตร"
              >
                🖨 พิมพ์จากหน้ากล่อง
              </button>
              <button
                type="button"
                onClick={() => onPrintLabels(4)}
                disabled={pending}
                className="rounded-md border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50"
                title="พิมพ์ป้ายที่อยู่ส่งสินค้า (100×75mm) — ชื่อ + ที่อยู่ + บริษัทขนส่ง"
              >
                🏷 พิมพ์ที่อยู่ส่งสินค้า
              </button>
              <button
                type="button"
                onClick={onSpecialToggle}
                disabled={pending}
                className={
                  inSpecialLane
                    ? "rounded-md border border-gray-300 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                    : "rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                }
                title={
                  inSpecialLane
                    ? "ย้ายรายการที่เลือกกลับสู่สถานะปกติ (คืนค่าจากประวัติสถานะ)"
                    : "เพิ่มรายการที่เลือกไปยังสถานะพิเศษ (พิเศษ / 99)"
                }
              >
                {inSpecialLane ? "↩ ย้ายกลับสถานะปกติ" : "⭐ เพิ่มไปสถานะพิเศษ"}
              </button>
              <span className="mx-1 h-5 w-px bg-border" aria-hidden />
              <button
                type="button"
                onClick={clearSelection}
                disabled={pending}
                className="rounded-md border border-border bg-white px-3 py-1.5 text-xs font-medium hover:bg-surface-alt disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={onBulkSubmit}
                disabled={pending}
                className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {pending ? "กำลังอัพเดต..." : `อัพเดตสถานะ ${selected.size} รายการ`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
