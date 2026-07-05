"use client";

import { Fragment, useMemo, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { isGeneralCoid } from "@/lib/forwarder/coid";
import { FSTATUS_CFG, listRowTint, fstatusVivid } from "@/lib/admin/forwarder-status";
// 2026-06-12 — the MOMO หัวบิล (bill-header) box-count rule now lives in a
// shared, unit-tested helper so the report / completeness / check-queue Σ
// reuse the EXACT same detection. baseTracking/trackingSuffix moved there too.
import {
  baseTracking,
  trackingSuffix,
  filterCountableForwarderRows,
} from "@/lib/admin/momo-bill-header";
import { Link } from "@/i18n/navigation";
import { ArrowUpDown, Lock } from "lucide-react";
import {
  adminBulkUpdateForwarderTbStatus,
  markForwarderPrinted,
  adminRestoreForwarderFromSpecial,
} from "@/actions/admin/forwarders";
import { confirm } from "@/components/ui/confirm";
import { Explain, GUIDE } from "@/components/ui/tooltip";
import { BulkActionsToolbar } from "./bulk-actions-toolbar";
// 2026-06-11 (Lane B · doc-choice visibility) — per-row tax-document badge.
import { TaxDocBadge, JuristicWhtChip } from "@/components/admin/tax-doc-badge";

/**
 * 2026-06-17 (ภูม flag · "fvolume = total, ไม่ ×กล่อง") — total parcel CBM for
 * display. The famountcount flag decides whether `volume_cbm` is the already-
 * totalled parcel CBM (flag==='1', as every MOMO commit writes) or a per-box
 * value that must be ×boxes (manual multi-box rows, flag≠'1'). Mirrors the
 * authoritative cost calc in lib/forwarder/live-rate.ts L284 (legacy
 * calPriceForwarder L1935-1941). DISPLAY ONLY — never feed cost/sell.
 */
function cbmTotal(
  volume_cbm: number,
  amount_count: number,
  flag: string | null,
): number {
  return String(flag ?? "").trim() === "1"
    ? volume_cbm
    : volume_cbm * (amount_count || 1);
}

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
  /**
   * 2026-06-17 — famountcount flag (the per-row box-count multiplier mode).
   * MOMO commits write famountcount='1' → `volume_cbm` is ALREADY the TOTAL
   * parcel CBM, so it must NEVER be ×boxes again. Manual multi-box rows have
   * famountcount≠'1' and `volume_cbm` is per-box → ×boxes. Mirrors the
   * authoritative cost rule in lib/forwarder/live-rate.ts L284 (legacy
   * calPriceForwarder L1935-1941). DISPLAY ONLY — see cbmTotal().
   */
  amount_count_flag: string | null;
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
  /** #259 Option B — true when admin has manually locked the cabinet number. */
  cabinet_locked: boolean;
  /** Lane B (2026-06-11) — the customer's tax-document choice
   * (tb_forwarder.tax_doc_pref · 'tax_invoice'|'customs'|'receipt'|null).
   * Rendered as <TaxDocBadge> in the "เอกสาร" column so staff see VAT/no-VAT
   * + which document to issue, per row. */
  tax_doc_pref: string | null;
  /** 2026-06-12 (พี่ป๊อป) — physical dimensions in cm (tb_forwarder.fwidth/
   *  flength/fheight · measured at the warehouse). Shown on the group
   *  breakdown as ก×ย×ส. null when not yet measured. */
  width_cm: number | null;
  length_cm: number | null;
  height_cm: number | null;
  /** 2026-06-12 (พี่ป๊อป) — MOMO CG_NO (carrier sub-parcel id · from
   *  momo_import_tracks.raw.CG_NO, joined by tracking). null for non-MOMO rows. */
  cg_no: string | null;
  customer: {
    userid: string;
    name: string;
    /** Contact-person sub-line when name=company (juristic). "" otherwise. */
    contact_name: string;
    phone: string;
    // Wave 18-B — VIP/SVIP/SaleAdmin badge inputs (legacy badgeVIP3 +
    // badgeAdminSale at forwarder.php L589).
    coid: string;
    is_svip: boolean;
    is_corporate: boolean;
    is_comparison: boolean;
    is_juristic: boolean;
    credit_limit: number;   // CUSTTAG — วงเงินเครดิต (>0 = ลูกค้าเครดิต)
    credit_days: number;    // CUSTTAG — เทอม (วัน)
    sale_admin: string | null;
  } | null;
};

// 2026-06-19 (owner "จืดไป · เอาสีสันชัดๆแบบ report-cnt"): the status chips now reuse
// the VIVID FSTATUS_CFG palette (the SOT report-cnt uses) instead of the old faded
// -50 weights, so a row's stage reads at-a-glance + matches report-cnt 1:1. 99 (พิเศษ)
// keeps a solid orange (not in FSTATUS_CFG's 1-7 journey).
const STATUS_BADGE: Record<string, string> = {
  "1":  FSTATUS_CFG["1"].chip,
  "2":  FSTATUS_CFG["2"].chip,
  "3":  FSTATUS_CFG["3"].chip,
  "4":  FSTATUS_CFG["4"].chip,
  "5":  FSTATUS_CFG["5"].chip,
  "6":  FSTATUS_CFG["6"].chip,
  "7":  FSTATUS_CFG["7"].chip,
  "99": "bg-orange-100 text-orange-800 border border-orange-300",
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
    if (isGeneralCoid(coid)) return null;  // general/default tier (PR · legacy PCS) = no chip
    const label = coid;
    return (
      <span className="rounded-full border border-purple-300 bg-purple-50 px-1.5 py-0.5 text-[11px] font-semibold text-purple-700">
        {label}
      </span>
    );
  })();
  return (
    <div className="mt-0.5 flex flex-wrap gap-1 items-center">
      {tierBadge}
      {isSvip && (
        <span
          className="rounded-full border border-pink-300 bg-pink-50 px-1.5 py-0.5 text-[11px] font-semibold text-pink-700"
          title="ลูกค้าคิดราคาแบบส่วนตัว"
        >
          SVIP
        </span>
      )}
      {isComparison && (
        <span
          className="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700"
          title="ลูกค้าคิดราคาตามค่าเทียบ"
        >
          CPS
        </span>
      )}
      {(isCorporate || isJuristic) && (
        <span
          className="rounded-full border border-blue-300 bg-blue-50 px-1.5 py-0.5 text-[11px] font-semibold text-blue-700"
          title="ลูกค้าบริษัท (นิติบุคคล)"
        >
          นิติ
        </span>
      )}
      <span
        className={`rounded-full border px-1.5 py-0.5 text-[11px] font-medium ${
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

// ─────────────────────────────────────────────────────────────────────
// 2026-06-10 (ภูม flag) — sibling China-tracking grouping (DISPLAY ONLY).
// MOMO splits one consignment into N tracking numbers with a numeric
// suffix (base "1779955936" + "1779955936-2" … "-5" = 5 boxes of one
// shipment, same customer + cabinet) and the MOMO sync commits ONE
// tb_forwarder row per tracking — so the list showed 5 near-identical
// rows. Rows on the CURRENT page sharing (baseTracking, userid) collapse
// into one main row (Σ aggregates + 📦 badge + chevron) with an
// expandable member sub-table. No DB / sync / server-action change —
// every tracking stays its own tb_forwarder row.
//
// Pagination caveat (accepted limitation): grouping only sees rows on the
// current page. Siblings are committed together with adjacent ids so they
// near-always land on the same page; a set straddling a page boundary
// simply groups what each page has. Pagination itself is untouched.
// ─────────────────────────────────────────────────────────────────────

// baseTracking / trackingSuffix are imported from @/lib/admin/momo-bill-header
// (the shared, unit-tested home of the MOMO sibling-suffix rule).

/** Members that should feed a group's Σ aggregates — drops the MOMO
 *  "หัวบิล" (bill-header) placeholder. When a carrier (MOMO) splits a parcel
 *  it sends a BARE tracking (no `-N` suffix) whose `famount` is the DECLARED
 *  box count AND whose weight is 0 — a bill-open, not a real parcel — plus the
 *  real boxes as `-N/M` siblings. Summing the bare header with its boxes
 *  double-counts (e.g. header 6 + boxes 6 = 12 for a 6-box parcel · ภูม flag
 *  2026-06-12). So when box-suffixed siblings exist, drop any bare member with
 *  zero weight. A bare row WITH weight is a real order (legacy `-1` groups) and
 *  is kept — no regression.
 *
 *  Delegates to the shared `filterCountableForwarderRows`: a display group's
 *  members all share one (baseTracking, userid), so filtering that group ==
 *  the old local logic (verified identical · locked by momo-bill-header.test). */
function countableGroupMembers(members: Row[]): Row[] {
  return filterCountableForwarderRows(members, {
    tracking: (m) => m.tracking_chn,
    weight: (m) => m.weight_kg,
    userid: (m) => m.customer?.userid ?? "",
  });
}

type DisplayUnit =
  | { kind: "single"; row: Row }
  | { kind: "group"; key: string; main: Row; members: Row[] };

/**
 * Collapse the page's rows into display units, preserving input order.
 * A group forms only when ≥2 rows share (baseTracking, userid); the group
 * unit is emitted at the MAIN row's original position and the sibling
 * members disappear from the normal flow (they render in the sub-table).
 * Main row = the member with no suffix if present, else lowest suffix.
 */
function buildDisplayUnits(rows: Row[]): DisplayUnit[] {
  const byKey = new Map<string, Row[]>();
  for (const r of rows) {
    const base = baseTracking(r.tracking_chn);
    if (!base) continue; // empty/null tracking never groups
    const key = `${base}::${r.customer?.userid ?? ""}`;
    const list = byKey.get(key);
    if (list) list.push(r);
    else byKey.set(key, [r]);
  }
  const groupOf = new Map<number, { key: string; main: Row; members: Row[] }>();
  for (const [key, members] of byKey) {
    if (members.length < 2) continue;
    const sorted = [...members].sort(
      (a, b) =>
        trackingSuffix(a.tracking_chn) - trackingSuffix(b.tracking_chn) ||
        a.id - b.id,
    );
    const g = { key, main: sorted[0]!, members: sorted };
    for (const m of sorted) groupOf.set(m.id, g);
  }
  const units: DisplayUnit[] = [];
  for (const r of rows) {
    const g = groupOf.get(r.id);
    if (!g) {
      units.push({ kind: "single", row: r });
    } else if (g.main.id === r.id) {
      units.push({ kind: "group", key: g.key, main: g.main, members: g.members });
    }
    // non-main group members: skipped — rendered inside the sub-table only
  }
  return units;
}

// ─────────────────────────────────────────────────────────────────────
// Lane C 2026-06-02 — sortable column headers (per ภูม flag #3).
// Module-level component per the cnt-hs-table.tsx pattern (Next 16
// react-hooks/static-components rule: never define a child component
// inside another component's render body — identity flips every render).
// ─────────────────────────────────────────────────────────────────────
type ForwardersSortKey =
  | "id"
  | "created_at"
  | "userid"
  | "outstanding"
  | "tracking_chn"
  | "date_status2"
  | "date_status3"
  | "date_status4"
  | "status"
  | "date_admin_status";
type ForwardersSortDir = "asc" | "desc";

function fwSortValue(r: Row, k: ForwardersSortKey): string | number {
  switch (k) {
    case "id":                  return r.id;
    case "created_at":          return r.created_at ? Date.parse(r.created_at) : 0;
    case "userid":              return (r.customer?.userid ?? "").toLowerCase();
    case "outstanding":         return r.outstanding_thb;
    case "tracking_chn":        return (r.tracking_chn ?? "").toLowerCase();
    case "date_status2":        return r.date_status2 ? Date.parse(r.date_status2) : 0;
    case "date_status3":        return r.date_status3 ? Date.parse(r.date_status3) : 0;
    case "date_status4":        return r.date_status4 ? Date.parse(r.date_status4) : 0;
    case "status":              return r.status;
    case "date_admin_status":   return r.date_admin_status ? Date.parse(r.date_admin_status) : 0;
  }
}

function FwSortableTh({
  label,
  sortKey,
  activeKey,
  activeDir,
  onSort,
  align = "left",
  title,
}: {
  label: string;
  sortKey: ForwardersSortKey;
  activeKey: ForwardersSortKey | null;
  activeDir: ForwardersSortDir;
  onSort: (k: ForwardersSortKey) => void;
  align?: "left" | "right" | "center";
  title?: string;
}) {
  const active = activeKey === sortKey;
  const alignCls = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th className={`px-2 py-3 ${alignCls}`} title={title}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${
          active ? "text-primary-700 font-semibold" : ""
        } ${align === "right" ? "flex-row-reverse" : ""}`}
        aria-label={`เรียงตาม ${label}`}
      >
        <span>{label}</span>
        <ArrowUpDown
          className={`w-3 h-3 ${active ? "opacity-100" : "opacity-40"}`}
          aria-hidden
        />
        {active && (
          <span className="sr-only">{activeDir === "asc" ? "ascending" : "descending"}</span>
        )}
      </button>
    </th>
  );
}

export function ForwardersTable({
  rows,
  statusLabel,
  modeLabel,
  currentStatus,
  isUltra = false,
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
  /**
   * 2026-06-29 (ภูม · สิทธิ์) — true only for Ultra Admin Z (role "ultra").
   * Gates the LIST bulk-bar manual status-move controls (สถานะ dropdown +
   * เลขตู้ + "อัพเดต N รายการ"). Print labels / สถานะพิเศษ / driver / cancel
   * stay available to every role. Server-enforced too (source="bulk_manual").
   */
  isUltra?: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<BulkStatusValue>("2");
  // Lane C 2026-06-02 — client-side sort state (server pre-orders by fdate desc;
  // until user clicks a header, activeKey stays null = preserve server order).
  const [sortKey, setSortKey] = useState<ForwardersSortKey | null>(null);
  const [sortDir, setSortDir] = useState<ForwardersSortDir>("desc");
  const handleSort = (k: ForwardersSortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  };
  // 2026-06-10 (ภูม flag) — sibling-tracking grouping: rows collapse into
  // display units (single row OR group). Sorting compares the group's MAIN
  // row value, so a group sorts exactly where its main row would.
  const viewUnits = useMemo(() => {
    const units = buildDisplayUnits(rows);
    if (!sortKey) return units;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...units].sort((a, b) => {
      const ar = a.kind === "group" ? a.main : a.row;
      const br = b.kind === "group" ? b.main : b.row;
      const av = fwSortValue(ar, sortKey);
      const bv = fwSortValue(br, sortKey);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [rows, sortKey, sortDir]);
  // Expanded sibling groups, keyed by the group key (base::userid).
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroupExpand = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
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

  // Group checkbox semantics (2026-06-10 ภูม flag): the main row's checkbox
  // selects/deselects ALL member ids of the sibling group — the bulk bar +
  // bulk actions keep working untouched because they already operate on the
  // individual row ids in `selected`.
  const toggleGroup = (memberIds: number[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = memberIds.every((id) => next.has(id));
      if (allOn) memberIds.forEach((id) => next.delete(id));
      else memberIds.forEach((id) => next.add(id));
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

  const onBulkSubmit = async () => {
    setError(null);
    setSuccess(null);
    if (selected.size === 0) return;
    const statusLabelTxt = BULK_STATUS_OPTIONS.find((o) => o.v === bulkStatus)?.l ?? bulkStatus;
    const cab = bulkCabinet.trim();
    const cabinetTxt = cab ? `\nเลขตู้ (GZE/GZS): "${cab}"` : "";
    if (!(await confirm(`อัพเดต ${selected.size} รายการ เป็นสถานะ "${statusLabelTxt}"${cabinetTxt} ?`))) return;

    const fids = Array.from(selected);
    startTransition(async () => {
      const result = await adminBulkUpdateForwarderTbStatus({
        fids,
        fstatus: bulkStatus,
        // 2026-06-29 (ภูม · สิทธิ์) — tag this as the LIST bulk-bar manual move
        // so the action gates it to Ultra Admin Z (server-side enforcement; the
        // UI also hides these controls for non-ultra below).
        source: "bulk_manual",
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
  const onSpecialToggle = async () => {
    setError(null);
    setSuccess(null);
    if (selected.size === 0) return;
    const fids = Array.from(selected);

    if (inSpecialLane) {
      if (
        !(await confirm(
          `ย้าย ${fids.length} รายการ กลับสู่สถานะปกติ (คืนค่าจากประวัติสถานะ) ?`,
        ))
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
      !(await confirm(`เพิ่ม ${fids.length} รายการ ไปยังสถานะพิเศษ (พิเศษ / 99) ?`))
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
    // 2026-06-10 ภูม flag: when the fixed-bottom bulk bar is up it covered the
    // last table rows — the checkbox on the bottom row was unreachable. Pad the
    // page bottom by the bar's height while ≥1 row is selected so the list can
    // scroll fully clear of the bar.
    <div className={selected.size > 0 ? "space-y-3 pb-16" : "space-y-3"}>
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่มีรายการที่ตรงกัน</p>
        ) : (
          // 2026-06-08 (ภูม round 5 · S1 audit finding): the 12+ col table
          // at typical 1366px Windows Chrome — default overflow-x scrollbar
          // is invisible there, so staff don't realise they can scroll +
          // think the rightmost "จัดการ" column is missing (Wave 18 PR10899
          // repro). The `scrollbar-x-visible` class (globals.css L155)
          // forces a visible horizontal scrollbar so staff always see it.
          <div className="overflow-x-auto scrollbar-x-visible">
            {/* §0h — base table text raised off the 11px floor to text-xs (12px)
                so secondary cells read comfortably; key identity cells (รหัสลูกค้า ·
                ออเดอร์# · ยอดค้างชำระ) step UP to text-sm, the smallest detail chips
                stay text-[11px] = floor. Size now encodes importance, not just weight. */}
            {/* legacy table-bordered — full gridlines on every cell (owner 2026-07-06
                "ตีเส้นตารางให้เหมือน PCS"). Scoped to the MAIN table's direct
                thead-th / tbody-td so the nested sibling-detail table (below) keeps
                its own styling. */}
            <table className="w-full text-xs border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
              <thead className="bg-surface-alt/50 text-left text-[11px] uppercase tracking-wide text-muted">
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
                      className="h-4 w-4 cursor-pointer accent-primary-600"
                    />
                  </th>
                  <FwSortableTh label="ID"            sortKey="id"                activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
                  <FwSortableTh label="วันที่สร้าง"     sortKey="created_at"        activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
                  <FwSortableTh label="รหัสลูกค้า"     sortKey="userid"            activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
                  <th className="px-2 py-3">รายละเอียด</th>
                  <FwSortableTh label="ยอดค้างชำระ"   sortKey="outstanding"       activeKey={sortKey} activeDir={sortDir} onSort={handleSort} align="right" title="คำนวณจาก calPriceForwarderMain (legacy formula)" />
                  <FwSortableTh label="เลขพัสดุ (จีน)" sortKey="tracking_chn"      activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
                  <th className="px-2 py-3">เลขพัสดุ (ไทย)</th>
                  <FwSortableTh label="เข้าโกดัง"      sortKey="date_status2"      activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
                  <FwSortableTh label="ออกโกดัง"      sortKey="date_status3"      activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
                  <FwSortableTh label="ถึงไทย"        sortKey="date_status4"      activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
                  <FwSortableTh label="สถานะ"         sortKey="status"            activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
                  {/* 2026-06-11 (Lane B) — เอกสารภาษีที่ลูกค้าเลือก (ใบกำกับ/ใบขน/
                      ไม่รับฯ) + นิติบุคคล/หัก ณ ที่จ่าย · staff scan VAT/no-VAT per row. */}
                  <th className="px-2 py-3" title="เอกสารภาษีที่ลูกค้าเลือก (ใบกำกับ / ใบขน / ไม่รับเอกสาร)">เอกสาร</th>
                  <FwSortableTh label="อัปเดต"        sortKey="date_admin_status" activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
                  <th className="px-2 py-3">ตัวเลือก</th>
                </tr>
              </thead>
              <tbody>
                {viewUnits.map((unit) => {
                  // Sibling-group unit: render the MAIN row in the normal
                  // position with Σ aggregates; members render only inside
                  // the expandable sub-table row below.
                  const r = unit.kind === "group" ? unit.main : unit.row;
                  const group = unit.kind === "group" ? unit : null;
                  const memberIds = group ? group.members.map((m) => m.id) : null;
                  const selCount = memberIds
                    ? memberIds.filter((id) => selected.has(id)).length
                    : 0;
                  const groupAllOn = !!memberIds && selCount === memberIds.length;
                  const groupSomeOn = !!memberIds && selCount > 0 && selCount < memberIds.length;
                  const isExpanded = group ? expandedGroups.has(group.key) : false;
                  const groupBase = group ? baseTracking(r.tracking_chn) : null;
                  const sameStatus = group
                    ? group.members.every((m) => m.status === r.status)
                    : true;
                  // Σ over countable members only — drops the MOMO หัวบิล
                  // placeholder so a 6-box parcel reads 6 boxes, not 6+6=12
                  // (ภูม flag 2026-06-12). The header is weight/price 0 so the
                  // weight/cbm/outstanding Σ are unchanged; the box count + the
                  // allPaid flag (header paydeposit='0' would force false) get fixed.
                  const aggMembers = group ? countableGroupMembers(group.members) : [];
                  // 2026-06-12 (พี่ป๊อป) — sequence # over countable members
                  // only, so the breakdown numbers the real boxes 1..N and
                  // flags the MOMO หัวบิล (bill-header) row as "หัวบิล".
                  const memberSeq = new Map(
                    aggMembers.map((m, i) => [m.id, i + 1] as const),
                  );
                  const agg = group
                    ? {
                        boxes: aggMembers.reduce((s, m) => s + (m.amount_count || 0), 0),
                        weight: aggMembers.reduce((s, m) => s + (m.weight_kg || 0), 0),
                        // mirror the single-row display semantics: CBM cell
                        // shows the per-row TOTAL CBM (famountcount rule —
                        // flag==='1' MOMO rows are already-totalled, never
                        // ×boxes again).
                        cbm: aggMembers.reduce(
                          (s, m) => s + cbmTotal(m.volume_cbm || 0, m.amount_count, m.amount_count_flag),
                          0,
                        ),
                        outstanding: aggMembers.reduce(
                          (s, m) => s + (m.outstanding_thb || 0),
                          0,
                        ),
                        allPaid: aggMembers.every((m) => m.paydeposit === "1"),
                      }
                    : null;

                  const statusKey = r.status;
                  // VIVID end-of-row status pill (owner 2026-06-23: rows white →
                  // เน้นสถานะท้ายรายการเด่นๆ). Solid high-contrast fill, not the soft chip.
                  const badgeCls = fstatusVivid(r.status);
                  const sLabel = r.fcredit === "1"
                    ? `เครติด · ${statusLabel[r.status] ?? r.status}`
                    : statusLabel[statusKey] ?? statusKey;
                  // next-action hint (self-explaining-row §0g) — what staff does NOW.
                  const fsCfg = FSTATUS_CFG[r.status as keyof typeof FSTATUS_CFG];
                  const fsNext = fsCfg?.next ?? "";
                  const fsAct = fsCfg?.act ?? false;
                  const isOn = group ? groupAllOn : selected.has(r.id);
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
                    <Fragment key={group ? `g-${group.key}` : r.id}>
                    <tr
                      // hover gray ONLY when NOT selected — else the hover wash
                      // covered the green selected-highlight (owner 2026-06-23 bug).
                      className={`border-t border-border ${isOn ? "" : "hover:bg-surface-alt/30"} ${listRowTint(r.status, false, isOn)}`}
                    >
                      <td className="px-2 py-2.5 w-8">
                        {group && memberIds ? (
                          // Main-row checkbox = whole group. Indeterminate
                          // when only some members are individually checked
                          // (inside the expanded sub-table).
                          <input
                            type="checkbox"
                            checked={groupAllOn}
                            ref={(el) => {
                              if (el) el.indeterminate = groupSomeOn;
                            }}
                            onChange={() => toggleGroup(memberIds)}
                            aria-label={`เลือกกลุ่มพัสดุ ${groupBase ?? ""} ทั้ง ${memberIds.length} รายการ`}
                            className="h-4 w-4 cursor-pointer accent-primary-600"
                          />
                        ) : (
                          <input
                            type="checkbox"
                            checked={isOn}
                            onChange={() => toggleRow(r.id)}
                            aria-label={`เลือก ออเดอร์ #${r.id}`}
                            className="h-4 w-4 cursor-pointer accent-primary-600"
                          />
                        )}
                      </td>
                      <td className="px-2 py-2.5 font-mono whitespace-nowrap">{r.id}</td>
                      <td className="px-2 py-2.5 whitespace-nowrap text-muted">
                        {r.created_at ? new Date(r.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "—"}
                        {/* Wave 18-B — diffDateTimeNow elapsed-time stamp
                            (port of legacy function.php L1399 · forwarder.php
                            L673 "ผ่านมา : ...") next to fdate. SLA visibility
                            without making operators do mental math. */}
                        {r.created_at && (
                          <div className="text-[11px] text-amber-700 mt-0.5">
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
                                className="rounded-full border border-blue-300 bg-blue-50 px-1 py-0.5 text-[11px] text-blue-700"
                                title="พิมพ์เอกสาร #1 แล้ว"
                              >
                                📄1
                              </span>
                            )}
                            {r.print_status_2 && (
                              <span
                                className="rounded-full border border-sky-300 bg-sky-50 px-1 py-0.5 text-[11px] text-sky-700"
                                title="พิมพ์เอกสาร #2 แล้ว"
                              >
                                📄2
                              </span>
                            )}
                            {r.print_status_3 && (
                              <span
                                className="rounded-full border border-green-300 bg-green-50 px-1 py-0.5 text-[11px] text-green-700"
                                title="พิมพ์เอกสาร #3 แล้ว"
                              >
                                📄3
                              </span>
                            )}
                            {r.print_status_4 && (
                              <span
                                className="rounded-full border border-amber-300 bg-amber-50 px-1 py-0.5 text-[11px] text-amber-700"
                                title="พิมพ์เอกสาร #4 แล้ว"
                              >
                                📄4
                              </span>
                            )}
                            {r.car_on && (
                              <span
                                className="rounded-full border border-amber-400 bg-amber-50 px-1 py-0.5 text-[11px] text-amber-800"
                                title="ขึ้นรถแล้ว"
                              >
                                ↑ ขึ้นรถ
                              </span>
                            )}
                            {r.car_off && (
                              <span
                                className="rounded-full border border-gray-300 bg-gray-50 px-1 py-0.5 text-[11px] text-gray-700"
                                title="ลงรถแล้ว"
                              >
                                ↓ ลงรถ
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        {/* §0h — primary identity (รหัสลูกค้า) sized up to text-sm so
                            the eye lands on "whose row" first; name + phone stay secondary. */}
                        <div className="font-mono text-sm font-semibold text-foreground">{r.customer?.userid ?? "—"}</div>
                        <div className="truncate max-w-[140px]" title={r.customer?.name ?? ""}>
                          {r.customer?.name || "—"}
                        </div>
                        {r.customer?.contact_name && (
                          <div className="truncate max-w-[140px] text-muted text-[11px]" title={r.customer.contact_name}>
                            ผู้ติดต่อ: {r.customer.contact_name}
                          </div>
                        )}
                        <div className="text-muted text-[11px]">{r.customer?.phone}</div>
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
                        {/* CUSTTAG (owner 2026-06-25) — credit pill so staff see
                            "ลูกค้าเครดิต · เทอม Nวัน" on the order row → ติดตามให้จ่ายภายในเทอม. */}
                        {r.customer && r.customer.credit_limit > 0 && (
                          <span className="mt-0.5 inline-flex items-center gap-1">
                            <span
                              className="inline-block rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800"
                              title={`ลูกค้าเครดิต · เทอม ${r.customer.credit_days} วัน · วงเงิน ฿${r.customer.credit_limit.toLocaleString("th-TH", { minimumFractionDigits: 2 })} · ติดตามให้ลูกค้าจ่ายภายในเทอม`}
                            >
                              💳 เครดิต {r.customer.credit_days}ว
                            </span>
                            <Explain def={GUIDE.cash_vs_credit} />
                          </span>
                        )}
                        {/* Wave 18-B — จะมาถึงไทย ETA range (port of legacy
                            forwarder.php L595-609). Transport=1 = ±2d ·
                            else ±4d. Hidden when no ETA set. */}
                        {(() => {
                          const eta = formatEtaRange(r.eta_base, r.transport_type);
                          if (!eta) return null;
                          return (
                            <div className="mt-1 text-[11px] text-primary-700">
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
                              className="h-12 w-12 rounded border border-dashed border-amber-300 bg-amber-50/60 shrink-0 flex items-center justify-center text-[11px] text-amber-700"
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
                              className="text-sm font-semibold text-primary-600 hover:underline"
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
                                <span className={`rounded-full border px-1.5 py-0.5 text-[11px] ${block1Cls}`}>
                                  {block1Label}
                                </span>
                              )}
                              {/* Block 2: shop-order link (additive · only when refOrder set) */}
                              {hasRefOrder && (
                                <Link
                                  href={`/admin/shops/detail/${r.ref_order}`}
                                  className="rounded-full border bg-sky-50 text-sky-700 border-sky-200 px-1.5 py-0.5 text-[11px] hover:bg-sky-100"
                                  title="คลิกดูออเดอร์ฝากสั่งซื้อที่ spawn ฝากนำเข้านี้"
                                >
                                  ฝากสั่งซื้อ : {r.ref_order}
                                </Link>
                              )}
                              {/* 2026-06-12 (พี่ป๊อป) — the raw "MO…" fidorco
                                  string used to render here; removed per owner
                                  ("ใส่มาทำไม"). It's redundant with the tracking
                                  shown + the cabinet, and still searchable. */}
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
                        {agg ? (
                          // Sibling group: Σ across all members (each keeps
                          // its own row in tb_forwarder — display sum only).
                          <>
                            {agg.outstanding > 0 ? (
                              // §0h — the money number staff chases sized up to text-sm.
                              <div className="font-mono text-sm font-semibold text-red-700 inline-flex items-center gap-1 justify-end">
                                ฿{agg.outstanding.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                                <Explain def={GUIDE.outstanding_net} align="right" />
                              </div>
                            ) : agg.allPaid ? (
                              <div className="font-mono text-[11px] font-medium text-green-600">
                                ชำระแล้ว
                              </div>
                            ) : (
                              <div className="font-mono text-muted text-[11px]">—</div>
                            )}
                            <div className="text-muted text-[11px] mt-0.5">
                              Σ {agg.boxes} กล่อง
                              {agg.weight > 0 && (
                                <> · {agg.weight.toLocaleString("th-TH", { maximumFractionDigits: 2 })} Kg</>
                              )}
                            </div>
                            {agg.cbm > 0 && (
                              <div className="text-muted text-[11px]">
                                Σ {agg.cbm.toLocaleString("th-TH", { maximumFractionDigits: 4 })} CBM
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            {r.outstanding_thb > 0 ? (
                              // §0h — the money number staff chases sized up to text-sm.
                              <div className="font-mono text-sm font-semibold text-red-700 inline-flex items-center gap-1 justify-end">
                                ฿{r.outstanding_thb.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                                <Explain def={GUIDE.outstanding_net} align="right" />
                              </div>
                            ) : r.paydeposit === "1" ? (
                              <div className="font-mono text-[11px] font-medium text-green-600">
                                ชำระแล้ว
                              </div>
                            ) : (
                              <div className="font-mono text-muted text-[11px]">—</div>
                            )}
                            <div className="text-muted text-[11px] mt-0.5">
                              {r.amount_count} กล่อง
                              {r.weight_kg > 0 && (
                                <> · {r.weight_kg.toLocaleString("th-TH", { maximumFractionDigits: 2 })} Kg</>
                              )}
                            </div>
                            {r.volume_cbm > 0 && (
                              <div className="text-muted text-[11px]">
                                {cbmTotal(r.volume_cbm, r.amount_count, r.amount_count_flag).toLocaleString("th-TH", { maximumFractionDigits: 4 })} CBM
                              </div>
                            )}
                          </>
                        )}
                        {r.measured_by_admin && (
                          <div className="text-[11px] text-muted/70 font-mono mt-0.5" title="แอดมินที่วัดขนาด/ชั่งน้ำหนัก">
                            วัด: {r.measured_by_admin}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        {group && groupBase ? (
                          // Sibling group: BASE number + chevron + 📦 badge.
                          // Both the chevron and the badge toggle the
                          // expanded member sub-table.
                          <>
                            {/* 2026-06-10 ภูม flag: the chevron was a bare ▸
                                glyph — staff couldn't tell it expands. Make it
                                a clear pill button (blue bg + border + label). */}
                            <button
                              type="button"
                              onClick={() => toggleGroupExpand(group.key)}
                              aria-expanded={isExpanded}
                              title={isExpanded ? "ซ่อนเลขพัสดุในกลุ่ม" : "แสดงเลขพัสดุในกลุ่ม"}
                              className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 bg-blue-50 px-1.5 py-1 font-mono text-[11px] text-blue-800 hover:bg-blue-100 transition-colors"
                            >
                              <span
                                aria-hidden
                                className={`inline-block text-[11px] leading-none transition-transform ${isExpanded ? "rotate-90" : ""}`}
                              >
                                ▸
                              </span>
                              <span className="font-semibold">{groupBase}</span>
                            </button>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1">
                              <button
                                type="button"
                                onClick={() => toggleGroupExpand(group.key)}
                                className="inline-flex items-center gap-1 rounded-full bg-blue-600 text-white px-1.5 py-0.5 text-[11px] font-medium hover:bg-blue-700"
                                title={`พัสดุกลุ่มเดียวกัน ${aggMembers.length} เลข (MOMO แตกกล่อง · ไม่นับหัวบิล) — คลิกดูรายเลข`}
                              >
                                📦 {aggMembers.length} เลขพัสดุ
                                <span aria-hidden>{isExpanded ? "▲" : "▼"}</span>
                              </button>
                              <span className="rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 text-[11px]">
                                {modeLabel[r.transport_type] ?? r.transport_type}
                              </span>
                            </div>
                          </>
                        ) : r.tracking_chn && r.tracking_chn !== "-" ? (
                          <>
                            <div className="font-mono text-[11px]">{r.tracking_chn}</div>
                            <div className="mt-0.5">
                              <span className="rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 text-[11px]">
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
                          <div className="mt-1 text-[11px]">
                            <span className="text-muted">เลขตู้: </span>
                            {isMomoRoutingBatch(r.cabinet_number) ? (
                              <span
                                className="font-mono text-amber-700"
                                title={`รอ MOMO ปิดตู้ (routing batch: ${r.cabinet_number})`}
                              >
                                รอปิดตู้
                              </span>
                            ) : (
                              <>
                                <Link
                                  href={`/admin/report-cnt/${encodeURIComponent(r.cabinet_number)}`}
                                  className="font-mono text-primary-600 hover:underline"
                                >
                                  {r.cabinet_number}
                                </Link>
                                {r.cabinet_locked && (
                                  <span
                                    className="inline-block ml-1 align-middle"
                                    title="เลขตู้ถูกล็อก — partner sync จะไม่ทับค่านี้"
                                  >
                                    <Lock className="text-amber-500" size={10} aria-hidden />
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        )}
                        {/* Wave 18-B — fpallet (warehouse location) chip
                            (port of legacy L653 "location : <fpallet>"). */}
                        {r.pallet && (
                          <div className="mt-1">
                            <span
                              className="rounded-full border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[11px] font-mono text-slate-700"
                              title="ตำแหน่งใน warehouse"
                            >
                              loc: {r.pallet}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2.5 font-mono text-[11px]">
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
                        <span className="inline-flex items-center gap-1">
                          <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap shadow-sm ${badgeCls}`}>
                            {sLabel}
                          </span>
                          <Explain def={GUIDE.pay_state} />
                        </span>
                        {/* Sibling group with mixed member statuses: show the
                            main row's pill + a hint so the operator expands
                            to see the per-member states. */}
                        {group && !sameStatus ? (
                          <div className="mt-0.5 text-[11px] text-gray-500 whitespace-nowrap">
                            (สถานะต่างกัน)
                          </div>
                        ) : fsNext ? (
                          <div className={`mt-1 text-[11px] whitespace-nowrap ${fsAct ? "font-semibold text-rose-600" : "text-muted"}`}>
                            {fsAct ? "🔔 " : ""}{fsNext}
                          </div>
                        ) : null}
                        {r.cabinet_number && (
                          isMomoRoutingBatch(r.cabinet_number) ? (
                            <div
                              className="mt-0.5 text-[11px] text-amber-700 font-mono"
                              title={`รอ MOMO ปิดตู้ (routing batch: ${r.cabinet_number})`}
                            >
                              ตู้ · รอปิด
                            </div>
                          ) : (
                            <div className="mt-0.5 text-[11px] text-muted font-mono">ตู้ {r.cabinet_number}</div>
                          )
                        )}
                      </td>
                      {/* 2026-06-11 (Lane B) — the customer's doc choice + juristic
                          WHT signal, per row. A sibling group shares one customer +
                          (near-always) one choice → show the main row's badge. */}
                      <td className="px-2 py-2.5">
                        <div className="flex flex-col items-start gap-1">
                          <TaxDocBadge pref={r.tax_doc_pref} size="sm" showVat={false} />
                          {r.customer && (
                            <JuristicWhtChip
                              isJuristic={r.customer.is_juristic || r.customer.is_corporate}
                              totalThb={r.outstanding_thb > 0 ? r.outstanding_thb : r.total_price}
                              size="sm"
                            />
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2.5 whitespace-nowrap">
                        {r.date_admin_status ? (
                          <>
                            <div className="text-muted text-[11px]">
                              {fmtDate(r.date_admin_status, true)}
                            </div>
                            <div className="text-[11px] text-amber-700">
                              ผ่านมา {relativeAgo(r.date_admin_status)}
                            </div>
                            {r.admin_id_last && (
                              <div className="text-[11px] text-muted font-mono">{r.admin_id_last}</div>
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
                            className="rounded border border-green-500 bg-green-50 text-green-700 text-[11px] px-2 py-1 hover:bg-green-100 text-center whitespace-nowrap"
                          >
                            ดูข้อมูล
                          </Link>
                          <Link
                            href={`/admin/forwarders/${r.id}`}
                            className="rounded border border-orange-500 bg-orange-50 text-orange-700 text-[11px] px-2 py-1 hover:bg-orange-100 text-center whitespace-nowrap"
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
                            className="rounded border border-blue-500 bg-blue-50 text-blue-700 text-[11px] px-2 py-1 hover:bg-blue-100 text-center whitespace-nowrap"
                          >
                            🖨 พิมพ์ป้าย
                          </a>
                        </div>
                      </td>
                    </tr>
                    {/* Expanded sibling-group detail — full-width row with a
                        compact sub-table, one line per member (incl. main).
                        1688-shop-order-item-table style: light gray bg ·
                        small text · indented. */}
                    {group && isExpanded && (
                      <tr className="border-t border-border bg-slate-50">
                        <td colSpan={15} className="px-3 py-2">
                          <div className="pl-8">
                            <div className="mb-1.5 text-[11px] font-medium text-slate-600">
                              พัสดุในกลุ่ม <span className="font-mono">{groupBase}</span> ·{" "}
                              {aggMembers.length} เลข · ลูกค้า{" "}
                              <span className="font-mono">{r.customer?.userid ?? "—"}</span>
                            </div>
                            <table className="w-full max-w-4xl text-[11px]">
                              <thead>
                                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                                  <th className="px-2 py-1 w-8" aria-label="เลือก" />
                                  <th className="px-2 py-1 w-8">#</th>
                                  <th className="px-2 py-1">เลขพัสดุ (จีน)</th>
                                  <th className="px-2 py-1">CG_NO</th>
                                  <th className="px-2 py-1">ขนาด (ก×ย×ส)</th>
                                  <th className="px-2 py-1 text-right">กล่อง</th>
                                  <th className="px-2 py-1 text-right">น้ำหนัก</th>
                                  <th className="px-2 py-1 text-right">CBM</th>
                                  <th className="px-2 py-1">สถานะ</th>
                                  <th className="px-2 py-1 text-right">ยอดค้าง</th>
                                  <th className="px-2 py-1">ตัวเลือก</th>
                                </tr>
                              </thead>
                              <tbody>
                                {group.members.map((m) => {
                                  const mBadge = STATUS_BADGE[m.status] ?? "bg-gray-50 text-gray-600 border-gray-200";
                                  const mOn = selected.has(m.id);
                                  // 2026-06-12 — countable box # (undefined = the
                                  // MOMO หัวบิล placeholder → label "หัวบิล").
                                  const mSeq = memberSeq.get(m.id);
                                  return (
                                    <tr
                                      key={m.id}
                                      className={`border-t border-slate-200 ${mOn ? "bg-primary-50/40" : ""}`}
                                    >
                                      <td className="px-2 py-1.5 w-8">
                                        <input
                                          type="checkbox"
                                          checked={mOn}
                                          onChange={() => toggleRow(m.id)}
                                          aria-label={`เลือก ออเดอร์ #${m.id}`}
                                          className="h-4 w-4 cursor-pointer accent-primary-600"
                                        />
                                      </td>
                                      <td className="px-2 py-1.5 text-slate-500">
                                        {mSeq ?? (
                                          <span className="text-amber-600" title="หัวบิล MOMO — ไม่นับเป็นกล่อง">
                                            หัวบิล
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-2 py-1.5 font-mono">
                                        {m.tracking_chn}
                                        {m.id === r.id && (
                                          <span className="ml-1 text-[11px] text-blue-600">(หลัก)</span>
                                        )}
                                        {/* #259 Option B — lock icon on member row when cabinet is locked */}
                                        {m.cabinet_locked && m.cabinet_number && (
                                          <span
                                            className="inline-block ml-1 align-middle"
                                            title="เลขตู้ถูกล็อก — partner sync จะไม่ทับค่านี้"
                                          >
                                            <Lock className="inline-block text-amber-500" size={9} aria-hidden />
                                          </span>
                                        )}
                                      </td>
                                      {/* 2026-06-12 (พี่ป๊อป) — CG_NO (MOMO carrier sub-parcel id) */}
                                      <td className="px-2 py-1.5 font-mono text-slate-600">
                                        {m.cg_no ? m.cg_no : <span className="text-muted">—</span>}
                                      </td>
                                      {/* 2026-06-12 (พี่ป๊อป) — dimensions ก×ย×ส (cm) */}
                                      <td className="px-2 py-1.5 whitespace-nowrap text-slate-600">
                                        {m.width_cm && m.length_cm && m.height_cm ? (
                                          `${m.width_cm}×${m.length_cm}×${m.height_cm}`
                                        ) : (
                                          <span className="text-muted">—</span>
                                        )}
                                      </td>
                                      <td className="px-2 py-1.5 text-right">{m.amount_count}</td>
                                      <td className="px-2 py-1.5 text-right">
                                        {m.weight_kg > 0
                                          ? `${m.weight_kg.toLocaleString("th-TH", { maximumFractionDigits: 2 })} Kg`
                                          : "—"}
                                      </td>
                                      <td className="px-2 py-1.5 text-right">
                                        {m.volume_cbm > 0
                                          ? cbmTotal(m.volume_cbm, m.amount_count, m.amount_count_flag).toLocaleString("th-TH", { maximumFractionDigits: 4 })
                                          : "—"}
                                      </td>
                                      <td className="px-2 py-1.5">
                                        <span className={`rounded-full border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${mBadge}`}>
                                          {statusLabel[m.status] ?? m.status}
                                        </span>
                                      </td>
                                      <td className="px-2 py-1.5 text-right font-mono">
                                        {m.outstanding_thb > 0 ? (
                                          <span className="text-red-700">
                                            ฿{m.outstanding_thb.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                                          </span>
                                        ) : m.paydeposit === "1" ? (
                                          <span className="text-green-600">ชำระแล้ว</span>
                                        ) : (
                                          <span className="text-slate-400">—</span>
                                        )}
                                      </td>
                                      <td className="px-2 py-1.5">
                                        <div className="flex flex-wrap gap-1">
                                          <Link
                                            href={`/admin/forwarders/${m.id}`}
                                            className="rounded border border-green-500 bg-green-50 text-green-700 text-[11px] px-1.5 py-0.5 hover:bg-green-100 whitespace-nowrap"
                                          >
                                            ดูข้อมูล
                                          </Link>
                                          <Link
                                            href={`/admin/forwarders/${m.id}`}
                                            className="rounded border border-orange-500 bg-orange-50 text-orange-700 text-[11px] px-1.5 py-0.5 hover:bg-orange-100 whitespace-nowrap"
                                          >
                                            อัปเดต
                                          </Link>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
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
          {/* 2026-06-10 ภูม flag: the bar was 2 rows tall (flex-wrap) and
              covered the bottom of the list. Compact single row — smaller
              paddings, shorter labels, narrower cabinet input. Long titles
              stay discoverable via the title= tooltips. */}
          <div className="mx-auto flex max-w-7xl flex-nowrap items-center gap-2 overflow-x-auto px-3 py-1.5 lg:px-6">
            <span className="shrink-0 text-xs font-medium whitespace-nowrap inline-flex items-center gap-1">
              เลือก <b className="text-primary-600">{selected.size}</b>
              <Explain def="เปลี่ยนสถานะหลายรายการพร้อมกัน — เลือกสถานะปลายทาง (+เลขตู้ถ้ามี) แล้วกด “อัพเดต” ระบบจะเปลี่ยนทุกรายการที่ติ๊กไว้" />
            </span>
            {/* 2026-06-29 (ภูม · สิทธิ์) — สถานะ dropdown + เลขตู้ visible only
                to Ultra Admin Z. Non-ultra see the print / สถานะพิเศษ / คนขับ /
                ยกเลิก actions only (rendered below). */}
            {isUltra ? (
              <>
                <select
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value as BulkStatusValue)}
                  disabled={pending}
                  aria-label="เปลี่ยนสถานะเป็น"
                  className="shrink-0 rounded-md border border-border bg-white px-2 py-1 text-xs"
                >
                  {BULK_STATUS_OPTIONS.map((o) => (
                    <option key={o.v} value={o.v}>{o.l}</option>
                  ))}
                </select>
                {/* Cabinet input — Wave 23 ภูม flag: assign เลขตู้ (GZE/GZS) to
                    the selected batch in one shot. Blank = don't touch. */}
                <input
                  type="text"
                  value={bulkCabinet}
                  onChange={(e) => setBulkCabinet(e.target.value)}
                  disabled={pending}
                  maxLength={300}
                  placeholder="เลขตู้ (เว้นว่าง = ไม่เปลี่ยน)"
                  title="กำหนดเลขตู้ GZE/GZS ให้รายการที่เลือก — เว้นว่างถ้าไม่ต้องการเปลี่ยน"
                  className="shrink-0 rounded-md border border-border bg-white px-2 py-1 text-xs font-mono w-44"
                />
              </>
            ) : (
              <span
                className="shrink-0 text-xs text-muted whitespace-nowrap"
                title="เฉพาะ Ultra Admin Z เท่านั้นที่เลื่อนสถานะจากหน้ารายการได้"
              >
                🔒 เลื่อนสถานะ: เฉพาะ Ultra Admin Z
              </span>
            )}
            <div className="ml-auto flex flex-nowrap items-center gap-1.5">
              {/* Faithful port of legacy printAll.php bottom-left trio.
                  Print buttons open the 100×75mm label sheet in a new tab and
                  do NOT clear the selection (so the operator can print both
                  box + address labels for the same batch). */}
              <button
                type="button"
                onClick={() => onPrintLabels(1)}
                disabled={pending}
                className="shrink-0 rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50 whitespace-nowrap"
                title="พิมพ์ป้ายติดหน้ากล่อง (100×75mm) — รหัสลูกค้า + QR + น้ำหนัก/ปริมาตร"
              >
                🖨 ป้ายกล่อง
              </button>
              <button
                type="button"
                onClick={() => onPrintLabels(4)}
                disabled={pending}
                className="shrink-0 rounded-md border border-violet-300 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50 whitespace-nowrap"
                title="พิมพ์ป้ายที่อยู่ส่งสินค้า (100×75mm) — ชื่อ + ที่อยู่ + บริษัทขนส่ง"
              >
                🏷 ป้ายที่อยู่
              </button>
              <button
                type="button"
                onClick={onSpecialToggle}
                disabled={pending}
                className={
                  inSpecialLane
                    ? "shrink-0 rounded-md border border-gray-300 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 whitespace-nowrap"
                    : "shrink-0 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 whitespace-nowrap"
                }
                title={
                  inSpecialLane
                    ? "ย้ายรายการที่เลือกกลับสู่สถานะปกติ (คืนค่าจากประวัติสถานะ)"
                    : "เพิ่มรายการที่เลือกไปยังสถานะพิเศษ (พิเศษ / 99)"
                }
              >
                {inSpecialLane ? "↩ กลับสถานะปกติ" : "⭐ สถานะพิเศษ"}
              </button>
              <Explain
                def={
                  inSpecialLane
                    ? "กดเพื่อย้ายรายการที่เลือกกลับสู่สถานะปกติ (คืนค่าสถานะเดิมจากประวัติ)"
                    : "สถานะพิเศษ (99) = พักรายการไว้นอกคิวปกติ (เช่น มีปัญหา/รอตรวจสอบ) — กดเพื่อย้ายรายการที่เลือกเข้าลานพิเศษ"
                }
              />
              <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
              <button
                type="button"
                onClick={clearSelection}
                disabled={pending}
                className="shrink-0 rounded-md border border-border bg-white px-2 py-1 text-xs font-medium hover:bg-surface-alt disabled:opacity-50 whitespace-nowrap"
              >
                ยกเลิก
              </button>
              {/* 2026-06-29 (ภูม · สิทธิ์) — the status-move submit is Ultra
                  Admin Z only (matches the hidden dropdown above + server gate
                  source="bulk_manual"). */}
              {isUltra && (
                <button
                  type="button"
                  onClick={onBulkSubmit}
                  disabled={pending}
                  className="shrink-0 rounded-md bg-primary-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {pending ? "กำลังอัพเดต..." : `อัพเดต ${selected.size} รายการ`}
                </button>
              )}
            </div>
            {/* V-G1 — driver-assign + cancel bulk actions (faithful
                forwarder-action.php multi-row · backend actions/admin/
                forwarders-bulk.ts). Mounted here so the previously-orphaned
                BulkActionsToolbar is reachable (AGENTS.md §0d). The inline
                row above keeps status/cabinet/print; this adds the two
                actions it lacked. Selection is shared — same Set<id>. */}
            <div className="w-full">
              <BulkActionsToolbar
                selectedFNos={Array.from(selected).map(String)}
                onClearSelection={clearSelection}
                actions={["driver", "cancel"]}
                hideHeader
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
