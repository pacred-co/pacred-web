"use client";

/**
 * <ContainerDetailClient> — Wave 16 P0-1
 *
 * Client wrapper that owns:
 *   - the 6 quick-filter buttons (status1 ยังไม่ยิงเข้าโกดังไทย /
 *     status2 ยังไม่จ่ายเงิน / status3 จ่ายเงินแล้ว / status4
 *     แทร็คกิ้งซ้ำ / status5 ID/CO ซ้ำ / status6 ยังไม่เก็บเงินลูกค้า)
 *   - the row-selection checkboxes (multi-select)
 *   - the fixed-bottom "เพิ่มในรายการตรวจสอบแล้ว" bulk-action button
 *
 * Faithful port of report-cnt.php L1614-1631 (filter buttons) +
 * L1915-1918 (bulk-action bar). Filtering itself is client-side
 * because the table rows are already loaded server-side — switching
 * filters should be instant, no round-trip.
 *
 * The per-row inline edit buttons (editCost / editCost2 / editCostSheet)
 * are emitted as placeholders that call `onEditCost(fid)` — the actual
 * modal lives in a future P0-3 integration. The button is rendered so
 * the column shape matches legacy 1:1 but clicking it just shows an
 * alert today.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronRight } from "lucide-react";
import { adminReportCntAddCheck, adminReportCntBillToCustomer, adminReportCntBillGroupToCustomer } from "@/actions/admin/report-cnt-detail";
import { Link } from "@/i18n/navigation";
import { confirm } from "@/components/ui/confirm";
import { SelectedItemsConfirmDialog } from "@/components/admin/selected-items-confirm-dialog";
import { baseTracking } from "@/lib/admin/momo-bill-header";
import { ForwarderCostEditButton } from "@/components/admin/forwarder-cost-edit-button";
import { fstatusBadge, CNTSTATUS_CFG, FSTATUS_CFG } from "@/lib/admin/forwarder-status";
import { carrierLabel } from "@/lib/freight/shipping-methods";
import {
  isRowEligibleForAddCheck,
  FSTATUS_LABEL,
  REPORT_CNT_ADD_CHECK_MIN_FSTATUS,
} from "@/lib/admin/report-cnt-add-check-gate";

// ─────────────────────────────────────────────────────────────────────
// Row shape
// ─────────────────────────────────────────────────────────────────────

export type DetailRow = {
  id: number;
  fidorco: string | null;
  ftrackingchn: string | null;
  userid: string;
  username: string | null;
  usercompany: string | null;
  custJuristic: boolean;   // customer's canonical นิติ flag (tb_users.userCompany) — drives the badge

  fdetail: string | null;
  /** resolved product-detail to render (fdetail → item productname → null) */
  detailDisplay: string | null;
  fcover: string | null;
  /** resolved signed/passthrough thumbnail URL for fcover (FIX 2 · null = none) */
  coverUrl: string | null;
  famount: number | null;
  famountfi: number | null;
  fvolume: number | null;
  fweight: number | null;
  /** owner 2026-07-18 — physical dims (cm) for the per-tracking packing-list dropdown. */
  fwidth: number | null;
  flength: number | null;
  fheight: number | null;
  fproductstype: string | null;
  /** Secondary product-type enum used for cost calc (Wave 16 P0-3 modal target) */
  fproductstype2: string | null;
  /** FLAG 5 — resolved SELL rate per CBM (or per KG when small) — shown as a
   *  badge under the product-type word in the "ประเภท" column (legacy col 9). */
  frefrate: number | null;
  /** rate per product type (legacy `nameColumn` lookup or tb_cost_container) */
  rate: number;
  /** "นำเข้าสุทธิ" — fTotalPrice */
  ftotalprice: number;
  /** fRefPrice=1 → "น้ำหนัก" badge, else "ปริมาตร" */
  frefprice: string | null;
  fpriceupdate: number;
  pricecrate: number;
  ftransportpricechnthb: number;
  priceother: number;
  fshipby: string | null;
  faddressdistrict: string | null;
  faddressprovince: string | null;
  faddresszipcode: string | null;
  paymethod: string | null;
  ftransportprice: number;
  fdiscount: number;
  priceGetUser: number;          // derived
  fusercompany1per: number;      // derived
  fcosttotalprice: number;
  fcosttotalpricesheet: number;
  profitItem: number;            // derived
  fstatus: string;
  fcredit: string | null;
  fnote: string | null;
  // markers for the 6 quick filters
  notYetWarehouse: boolean;      // status1 — not in tb_forwarder_import2
  cntPaid: boolean;              // for status2/3 — derived from container-level isPaid
  trackingDup: boolean;          // status4 — fTrackingCHN count > 1
  idCoDup: boolean;              // status5 — fIDorCO count > 1
  notCollectedFromCustomer: boolean; // status6 — fStatus<5
  inCheckQueue: boolean;          // tb_check_forwarder row exists
  checkAdminId: string | null;
  checkDate: string | null;
};

export type FilterKey =
  | "all"
  | "notWarehouse"
  | "readyToCheck"
  | "inCheckQueue"
  | "cntUnpaid"
  | "cntPaid"
  | "trackingDup"
  | "idCoDup"
  | "notCollected";

// Legacy report-cnt filter-button order: ยังไม่ยิงเข้าโกดังไทย · พร้อมเพิ่ม… ·
// มีในรายการ… · ยังไม่จ่ายค่าตู้ · จ่ายแล้ว · แทร็คซ้ำ · ID/CO ซ้ำ · ยังไม่เก็บเงินลูกค้า.
const FILTER_LABEL: Record<FilterKey, string> = {
  all:          "ทั้งหมด",
  notWarehouse: "ยังไม่ยิงเข้าโกดังไทย",
  readyToCheck: "พร้อมเพิ่มไปยังรายการตรวจสอบแล้ว",
  inCheckQueue: "มีในรายการตรวจสอบแล้ว",
  cntUnpaid:    "ยังไม่จ่ายเงิน (ค่าตู้)",
  cntPaid:      "จ่ายเงินแล้ว (ค่าตู้)",
  trackingDup:  "แทร็คกิ้งซ้ำ",
  idCoDup:      "ID/CO ซ้ำ",
  notCollected: "ยังไม่เก็บเงินลูกค้า",
};

// Legacy report-cnt.php L1601-1615 colours each filter button per semantic —
// mirror the exact Bootstrap btn classes (reproduced in legacy-report-cnt.css):
// notWarehouse=danger · readyToCheck=bg-color-select · inCheckQueue=bg-color-check ·
// cntUnpaid=warning · cntPaid=success · trackingDup=info · idCoDup=primary ·
// notCollected=danger. "all" (ทั้งหมด) is a Pacred convenience → secondary.
const FILTER_BTN: Record<FilterKey, string> = {
  all:          "btn-secondary",
  notWarehouse: "btn-danger",
  readyToCheck: "bg-color-select",
  inCheckQueue: "bg-color-check",
  cntUnpaid:    "btn-warning",
  cntPaid:      "btn-success",
  trackingDup:  "btn-info",
  idCoDup:      "btn-primary",
  notCollected: "btn-danger",
};

// ─────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────

export type ContainerDetailClientProps = {
  rows: DetailRow[];
  showMoney: boolean;
  /** FIX 2: the viewer can use the add-to-check flow (checkbox + bar) —
   *  decoupled from money visibility. Mirrors adminReportCntAddCheck's gate. */
  canCheckFlow: boolean;
  cabinetIsPaid: boolean;
  /** fid → the ใบวางบิล (billing-run) invoices covering it (read-only display ·
   *  newest invoice first · a forwarder on no bill has no entry). */
  billByFid?: Record<number, Array<{ invoiceId: number; docNo: string; status: string }>>;
  /** ทางรถ / ทางเรือ / ทางอากาศ — legacy shows this transport badge on every
   *  row's "สถานะตู้" cell (same value for the whole container). */
  transportLabel: string;
  /** Legacy transport-pill colour by mode (ทางรถ=badge-info · ทางเรือ=badge-success). */
  transportBadgeClass: string;
};

// Sortable column keys — keep type-safe + map to DetailRow numeric/string fields.
type SortKey =
  | "id"
  | "fidorco"
  | "ftrackingchn"
  | "userid"
  | "famount"
  | "fvolume"
  | "fweight"
  | "fproductstype"
  | "rate"
  | "ftotalprice"
  | "fpriceupdate"
  | "pricecrate"
  | "ftransportpricechnthb"
  | "priceother"
  | "ftransportprice"
  | "fdiscount"
  | "priceGetUser"
  | "fcosttotalprice"
  | "profitItem"
  | "fstatus"
  | "fdetail"
  | "fshipby"
  | "cntPaid"
  | "fnote"
  | "onePer"
  | null;

type SortDir = "asc" | "desc";

/** Resolve a row's value for a sort column. Most keys are direct DetailRow
 *  fields; "onePer" is the DISPLAYED 1% WHT (juristic only → else 0), which is
 *  computed, not stored, so it needs this indirection. */
function sortValueOf(
  r: DetailRow,
  key: Exclude<NonNullable<SortKey>, "onePer"> | "onePer",
): string | number | boolean | null {
  if (key === "onePer") return r.usercompany === "1" ? (r.fusercompany1per ?? 0) : 0;
  return r[key];
}

export function ContainerDetailClient({ rows, showMoney, canCheckFlow, cabinetIsPaid, billByFid = {}, transportLabel, transportBadgeClass }: ContainerDetailClientProps) {
  // The checkbox COLUMN shows for any check-flow viewer; interactivity (ticking
  // + the add button) is disabled on a PAID cabinet (read-only, with a note).
  const checkColumn = canCheckFlow;
  const checkInteractive = canCheckFlow && !cabinetIsPaid;
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pending, start] = useTransition();
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [confirmAddCheck, setConfirmAddCheck] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  // ภูม 2026-06-18 — which multi-tracking orders are expanded (collapsed by
  // default; the summary row carries a dropdown chevron to reveal the boxes).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // click a product thumbnail → full-image lightbox (ปอน 2026-07-15 "กดจิ้มดูภาพเต็ม").
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const router = useRouter();
  // Portal the fixed action bar to <body> so it escapes the .animate-fade-in
  // identity transform (which traps position:fixed → the bar scrolled off with
  // the content instead of sticking to the viewport · ปอน 2026-07-15). Mount-gate
  // so createPortal only runs client-side (SSR has no document.body).
  const [mounted, setMounted] = useState(false);
  // mount-gate: flip once after hydration so the client-only portals
  // (action bar + image lightbox) render — SSR has no document.body.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const filtered = useMemo(() => {
    const f = filterRows(rows, filter);
    if (!sortKey) return f;
    const dir = sortDir === "asc" ? 1 : -1;
    const key = sortKey;
    return [...f].sort((a, b) => {
      const av = sortValueOf(a, key);
      const bv = sortValueOf(b, key);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "th") * dir;
    });
  }, [rows, filter, sortKey, sortDir]);

  function toggleSort(k: NonNullable<SortKey>) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  }

  // ── ภูม 2026-06-18: group sibling trackings (a split parcel shares
  // (baseTracking, userid) — e.g. 1779955936 / -2 / -3 …) into ONE collapsible
  // order. A multi-box order shows a full-size SUMMARY row (the order rolled up
  // — Σ box/CBM/weight/money, one status/carrier when uniform) with a dropdown
  // chevron; clicking it reveals the individual box rows. A single-box order
  // renders plain. Grouping is stable over the active column sort (buckets keep
  // the first-appearance order of `filtered`).
  const groups = useMemo(() => {
    const map = new Map<string, DetailRow[]>();
    const order: string[] = [];
    for (const r of filtered) {
      const base = baseTracking(r.ftrackingchn);
      const key = base ? `${base}|${r.userid}` : `__solo_${r.id}`;
      let arr = map.get(key);
      if (!arr) { arr = []; map.set(key, arr); order.push(key); }
      arr.push(r);
    }
    return order.map((k) => map.get(k)!);
  }, [filtered]);

  function toggleGroup(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Tick / untick every add-check-ELIGIBLE box of one order in one go (the
  // summary-row checkbox) — mirrors the per-row gate so a collapsed order is
  // still selectable without expanding it.
  function toggleGroupSelect(ids: number[]) {
    if (ids.length === 0) return;
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = ids.every((id) => next.has(id));
      if (allOn) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  // Total column count — for the empty-state colSpan (22 always-on cols incl. the
  // legacy "ตัวเลือก" ฿-collect col; + the select col + the 3 money cols when shown).
  // (ID column removed 2026-07-15 · ปอน — base was 23.)
  const totalCols = 22 + (checkColumn ? 1 : 0) + (showMoney ? 3 : 0);

  // Render list: a multi-box order emits a SUMMARY row (always) + its box rows
  // ONLY when expanded; a single-box order emits one plain row. Recomputes when
  // a group is toggled (depends on `expanded`).
  const renderItems = useMemo(() => {
    const items: Array<
      | { kind: "summary"; group: DetailRow[]; gkey: string; open: boolean }
      | { kind: "pack"; group: DetailRow[]; gkey: string }
      | { kind: "row"; r: DetailRow; member: boolean }
    > = [];
    for (const g of groups) {
      if (g.length > 1) {
        const base = baseTracking(g[0].ftrackingchn);
        const gkey = base ? `${base}|${g[0].userid}` : `__solo_${g[0].id}`;
        const open = expanded.has(gkey);
        items.push({ kind: "summary", group: g, gkey, open });
        // owner 2026-07-18 — the dropdown is now a NEUTRAL gray/white packing-list of the
        // shipment's trackings (แทรค · ก · ย · ส · น้ำหนัก · CBM · กล่อง), NOT coloured data
        // rows. ONE nested detail row replaces the N member rows.
        if (open) items.push({ kind: "pack", group: g, gkey });
      } else {
        items.push({ kind: "row", r: g[0], member: false });
      }
    }
    return items;
  }, [groups, expanded]);

  // Summary totals for the orange-red gradient band (legacy report-cnt.php L1653-1684 + L1888 totals).
  const summary = useMemo(() => {
    return filtered.reduce(
      (acc, r) => ({
        count:     acc.count + 1,
        volume:    acc.volume + (r.fvolume ?? 0),
        weight:    acc.weight + (r.fweight ?? 0),
        cost:      acc.cost + r.fcosttotalprice,
        price:     acc.price + r.ftotalprice,
        discount:  acc.discount + r.fdiscount,
        priceUser: acc.priceUser + r.priceGetUser,
        profit:    acc.profit + r.profitItem,
      }),
      { count: 0, volume: 0, weight: 0, cost: 0, price: 0, discount: 0, priceUser: 0, profit: 0 },
    );
  }, [filtered]);

  // counts per filter (for the button badges) — match legacy
  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      all:          rows.length,
      notWarehouse: 0,
      readyToCheck: 0,
      inCheckQueue: 0,
      cntUnpaid:    0,
      cntPaid:      0,
      trackingDup:  0,
      idCoDup:      0,
      notCollected: 0,
    };
    for (const r of rows) {
      if (r.notYetWarehouse) c.notWarehouse += 1;
      if (!r.inCheckQueue && isRowEligibleForAddCheck(r.fstatus)) c.readyToCheck += 1;
      if (r.inCheckQueue)    c.inCheckQueue += 1;
      if (!r.cntPaid)        c.cntUnpaid    += 1;
      if (r.cntPaid)         c.cntPaid      += 1;
      if (r.trackingDup)     c.trackingDup  += 1;
      if (r.idCoDup)         c.idCoDup      += 1;
      if (r.notCollectedFromCustomer) c.notCollected += 1;
    }
    return c;
  }, [rows]);

  function toggleRow(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Eligible-only set for the "select all" header checkbox — never tick a
  // row the gate would reject (avoid the staff "ticked + submit + bounced"
  // ping-pong). Mirrors the server-side STATUS GATE in
  // adminReportCntAddCheck (lib/admin/report-cnt-add-check-gate.ts).
  // owner 2026-07-18 — select-all (+ the master checkbox) skips any row not fully box-scanned
  // (famountfi < famount) OR with no delivery address set, so a ยิงไม่ครบ/ไม่มีที่อยู่
  // shipment can never be ticked → sent to วางบิล (mirrors the server gates).
  const eligibleFilteredIds = useMemo(
    () =>
      filtered
        .filter((r) => isRowEligibleForAddCheck(r.fstatus) && isScanComplete(r.famountfi, r.famount, r.fstatus) && hasDeliveryAddress(r))
        .map((r) => r.id),
    [filtered],
  );

  function toggleAll() {
    if (selected.size === eligibleFilteredIds.length && eligibleFilteredIds.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(eligibleFilteredIds));
    }
  }

  function bulkCheck() {
    if (selected.size === 0) {
      setBulkMsg("กรุณาเลือกอย่างน้อย 1 รายการ");
      return;
    }
    setBulkMsg(null);
    start(async () => {
      const res = await adminReportCntAddCheck(Array.from(selected));
      if (!res.ok) {
        setBulkMsg(res.error);
        return;
      }
      setBulkMsg(`เพิ่มในรายการตรวจสอบแล้ว ${res.data?.inserted ?? 0} รายการ (ข้าม ${res.data?.skipped ?? 0})`);
      setSelected(new Set());
      router.refresh();
    });
  }

  // ── ภูม 2026-06-18: the SUMMARY row of a multi-box order — a normal full-size
  // table row showing the order rolled up (Σ box/CBM/weight/all money columns;
  // one status/carrier/type when uniform, else a "หลาย…" marker) with a dropdown
  // chevron to reveal the box rows. The whole row toggles expand on click; the
  // checkbox + customer link stop-propagate so they don't also toggle.
  function renderSummaryRow(g: DetailRow[], gkey: string, isOpen: boolean) {
    const a = aggregateGroup(g);
    // owner 2026-07-18 — ยิงกล่องครบทั้งชิปเม้น? drives the RED/WHITE header + the billing gate.
    // EVERY tracking must be fully received (not Σgot≥Σexp — an over-received tracking must
    // NOT mask a short one · review 2026-07-18). One short/in-transit แทรค → the whole ชิปเม้น
    // is not billable.
    const scanned = g.every((r) => isScanComplete(r.famountfi, r.famount, r.fstatus));
    const base = baseTracking(g[0].ftrackingchn) ?? g[0].ftrackingchn ?? "-";
    const eligibleIds = g
      .filter((r) => !r.inCheckQueue && isRowEligibleForAddCheck(r.fstatus) && hasDeliveryAddress(r))
      .map((r) => r.id);
    const groupSel = eligibleIds.length > 0 && eligibleIds.every((id) => selected.has(id));
    // How many of the shipment's แทรค are already in the check queue. A multi-แทรค
    // header must state its check state like a single row — ภูม 2026-07-21: a fully-in-check
    // shipment showed a disabled EMPTY checkbox with a FALSE "รอของถึงโกดัง" reason instead
    // of "✓ อยู่ในรายการ". shipmentInCheck = in the queue with nothing left to add.
    const inCheckCount = g.filter((r) => r.inCheckQueue).length;
    const shipmentInCheck = inCheckCount > 0 && eligibleIds.length === 0;
    const statusBadge = a.status != null ? fstatusBadge(a.status) : null;
    return (
      <tr
        key={`sum-${gkey}-${g[0].id}`}
        onClick={() => toggleGroup(gkey)}
        /* 🔴 owner 2026-07-18 — a multi-แทรค header is JUST a shipment, no different from a
           single-แทรค row → it behaves IDENTICALLY: RED (ยังยิงกล่องไม่ครบ) / WHITE (ครบ) by
           scan, and EMERALD when ticked (pcs-row-selected · same as a single row · "พอติ๊ก
           สีต้องเปลี่ยนเหมือนรายการเพื่อนๆ"). Only extra = the chevron dropdown for its แทรค. */
        className={`${groupSel ? "pcs-row-selected" : shipmentInCheck ? "pcs-row-check" : scanned ? "pcs-row-scan-ok" : "pcs-row-scan-wait"} cursor-pointer`}
      >
        {checkColumn && (
          shipmentInCheck ? (
            /* ภูม 2026-07-21 — the shipment's แทรค are already in the check queue → state it
               like a single row's "✓ อยู่ในรายการ", never a disabled empty box with a false
               "รอของถึงโกดัง" reason. */
            <td className="px-2 py-2 text-center align-middle" onClick={(e) => e.stopPropagation()}>
              <span
                className="block text-[11px] text-emerald-600"
                title={inCheckCount === g.length ? "ทุกแทรคอยู่ในรายการตรวจสอบแล้ว" : `${inCheckCount}/${g.length} แทรคอยู่ในรายการตรวจสอบแล้ว`}
              >
                ✓ อยู่ในรายการ{inCheckCount === g.length ? "" : ` ${inCheckCount}/${g.length}`}
              </span>
            </td>
          ) : (
            <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
              {/* owner 2026-07-18 — ALWAYS show the tick (like a single row), disabled-with-the-REAL-reason. */}
              <input
                type="checkbox"
                checked={groupSel}
                onChange={() => toggleGroupSelect(eligibleIds)}
                disabled={!checkInteractive || eligibleIds.length === 0 || !scanned}
                title={
                  !checkInteractive
                    ? "ตู้นี้จ่ายค่าตู้แล้ว · แก้ผ่านบิลจ่ายเงินตู้"
                    : g.every((r) => (parseInt(r.fstatus || "0", 10) || 0) >= 5)
                      ? "ออกบิลแล้ว · แก้ผ่านบิล"
                      : g.some((r) => isRowEligibleForAddCheck(r.fstatus) && !hasDeliveryAddress(r))
                        ? "ยังไม่ตั้งที่อยู่จัดส่ง"
                        : eligibleIds.length === 0
                          ? "รอของถึงโกดังก่อน (ยังไม่ถึงไทย)"
                          : !scanned
                            ? `ยิงกล่องไม่ครบ (${fmtN(a.boxGot)}/${fmtN(a.boxExp)}) · เลือกวางบิลไม่ได้จนกว่าจะยิงครบทั้งชิปเม้น`
                            : `เลือกทั้งชิปเม้น (${eligibleIds.length} แทรคที่ถึงไทยแล้ว)`
                }
                aria-label={`เลือกชิปเม้น ${base}`}
              />
            </td>
          )
        )}
        {/* ID/CO */}
        <td className="px-2 py-2 font-mono text-[11px]">{a.fidorco || "—"}</td>
        {/* เลขแทรคกิ้ง — chevron TOGGLES the dropdown · the base tracking# is a LINK to the
            shipment detail (owner 2026-07-18 "กดเลขแทรคหัวแถวแล้วต้องเข้าไปดูชิปเม้นได้ · เห็น
            แทรคกิ้งทั้งหมด") → the main forwarder detail shows its sibling trackings. */}
        <td className="px-2 py-2 text-[11px]">
          <span className="inline-flex items-center gap-1 font-semibold text-primary-700 dark:text-primary-300">
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <Link
              href={`/admin/forwarders/${g[0].id}`}
              onClick={(e) => e.stopPropagation()}
              className="hover:underline"
              title="เปิดดูรายละเอียดชิปเม้น (ทุกแทรคกิ้ง)"
            >
              {base}
            </Link>
          </span>
          <span className="badge badge-secondary badge-pill" style={{ marginLeft: ".35rem" }}>
            {g.length} แทรค
          </span>
        </td>
        {/* รหัส */}
        <td className="px-2 py-2 text-[11px]">
          <Link
            href={`/admin/customers/${encodeURIComponent(a.userid)}`}
            onClick={(e) => e.stopPropagation()}
            className="text-primary-600 hover:underline"
          >
            {a.userid}
          </Link>
        </td>
        {/* รายละเอียด */}
        <td className="px-2 py-2 max-w-[200px]">
          <div className="truncate" title={a.detail ?? ""}>
            {a.detail ?? `${g.length} รายการ`}
          </div>
        </td>
        {/* ลัง (รับ/คาด) */}
        <td className="px-2 py-2 text-right">{fmtBox(a.boxGot, a.boxExp)}</td>
        {/* ปริมาตร */}
        <td className="px-2 py-2 text-right">{fmt(a.volume, 6)}</td>
        {/* หนัก */}
        <td className="px-2 py-2 text-right">{fmt(a.weight, 2)}</td>
        {/* ประเภท — + เรทขาย pill (owner 2026-07-18 รอบ2: หัวแถวต้องมี tag เหมือนแถวเดี่ยว) */}
        <td className="px-2 py-2">
          {a.productType != null ? productTypeLabel(a.productType) : "หลายประเภท"}
          {a.frefrate != null && Number.isFinite(a.frefrate) && a.frefrate > 0 && (
            <>
              <br />
              <span className="badge badge-danger badge-pill font-10" title="เรทขาย (SELL) ต่อคิว/กิโล — ทั้งชิปเม้น">
                {a.frefrate.toLocaleString("en-US")}
              </span>
            </>
          )}
        </td>
        {/* เรทต้นทุน — owner 2026-07-18: คิดทีเดียวทั้งชิปเม้น. The cost rate is per-CBM/
            mode (uniform across a shipment's trackings) → show it ONCE on the header. */}
        {showMoney && (
          <td className="px-2 py-2 text-right font-semibold">
            {a.rate != null && a.rate > 0
              ? fmt(a.rate, 0)
              : g.some((r) => r.rate > 0)
                ? <span className="text-amber-600 text-[11px]" title="รายในชิปเม้นเรทต้นทุนไม่เท่ากัน">หลายเรท</span>
                : <span className="text-muted">—</span>}
          </td>
        )}
        {/* ค่านำเข้า (รวมทั้งชิปเม้น) — + basis pill ปริมาตร/น้ำหนัก เหมือนแถวเดี่ยว */}
        <td className="px-2 py-2 text-right font-semibold">
          {fmt(a.ftotalprice, 2)}
          {a.frefprice != null && (
            <>
              <br />
              <span className={`badge badge-pill font-10 ${a.frefprice === "1" ? "badge-info" : "badge-primary"}`}>
                {a.frefprice === "1" ? "น้ำหนัก" : "ปริมาตร"}
              </span>
            </>
          )}
        </td>
        {/* ค่าอัปเดต */}
        <td className="px-2 py-2 text-right">{fmt(a.fpriceupdate, 2)}</td>
        {/* ค่าตีลัง */}
        <td className="px-2 py-2 text-right">{fmt(a.pricecrate, 2)}</td>
        {/* ค่าขนส่งจีน+ */}
        <td className="px-2 py-2 text-right">{fmt(a.ftransportpricechnthb, 2)}</td>
        {/* ค่าอื่นๆ */}
        <td className="px-2 py-2 text-right">{fmt(a.priceother, 2)}</td>
        {/* การขนส่ง — + ปลายทาง(COD) + ที่อยู่จัดส่ง เหมือนแถวเดี่ยว (owner 2026-07-18 รอบ3) */}
        <td className="px-2 py-2 text-[11px]">
          {a.shipBy != null ? shipByLabel(a.shipBy) : (g.length > 1 ? "หลายขนส่ง" : "—")}
          {a.paymethod === "2" && <span className="badge badge-danger badge-pill font-10" style={{ marginLeft: ".25rem" }}>ปลายทาง</span>}
          {a.shipBy !== "PCS" && (a.addressDistrict || a.addressProvince) && (
            <>
              <br />
              {a.addressDistrict ?? ""}
              {a.addressProvince ? ` · จ.${a.addressProvince}` : ""}
            </>
          )}
        </td>
        {/* ค่าขนส่งไทย */}
        <td className="px-2 py-2 text-right">{fmt(a.ftransportprice, 2)}</td>
        {/* ส่วนลด */}
        <td className="px-2 py-2 text-right">{fmt(a.fdiscount, 2)}</td>
        {/* รวมขาย */}
        <td className="px-2 py-2 text-right font-semibold">{fmt(a.priceGetUser, 2)}</td>
        {/* 1% */}
        <td className="px-2 py-2 text-right">{a.onePer > 0 ? fmt(a.onePer, 2) : ""}</td>
        {/* ต้นทุน — showMoney only (no per-row edit buttons on the rollup) */}
        {showMoney && (
          <td className="px-2 py-2 text-right">
            <span title="ต้นทุน PCS รวม">P: {fmt(a.fcosttotalprice, 2)}</span>
            <br />
            <span title="ต้นทุน แสง รวม" className="text-muted text-[11px]">S: {fmt(a.fcosttotalpricesheet, 2)}</span>
          </td>
        )}
        {/* กำไร — showMoney only */}
        {showMoney && (
          <td className="px-2 py-2 text-right">
            <span className={a.profit >= 0 ? "text-green-600" : "text-red-600"}>
              {a.profit >= 0 ? "+" : ""}{fmt(a.profit, 2)}
            </span>
          </td>
        )}
        {/* สถานะสินค้า + group bill (per-shipment pay) */}
        <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
          {statusBadge ? (
            <span className={`badge badge-pill ${a.status != null ? legacyStatusClass(a.status) : "badge-secondary"}`}>
              {statusBadge.label}
            </span>
          ) : (
            <span className="badge badge-secondary badge-pill">หลายสถานะ</span>
          )}
          {/* next-action hint + credit/นิติ badges — same detail a single row shows
              (owner 2026-07-18 รอบ3 "หัวแถวรายละเอียดไม่ครบ · tag/คำอธิบายไม่ขึ้น"). */}
          {a.status != null && FSTATUS_CFG[a.status as keyof typeof FSTATUS_CFG]?.next && (
            <div className={`mt-0.5 text-[11px] whitespace-nowrap ${FSTATUS_CFG[a.status as keyof typeof FSTATUS_CFG].act ? "font-semibold text-rose-600" : "text-muted"}`}>
              {FSTATUS_CFG[a.status as keyof typeof FSTATUS_CFG].act ? "🔔 " : ""}{FSTATUS_CFG[a.status as keyof typeof FSTATUS_CFG].next}
            </div>
          )}
          <div className="mt-1 flex flex-wrap justify-center gap-1">
            <EntityBadge juristic={a.isJuristic} />
            {a.fcredit && (
              <Link href={`/admin/forwarders/${g[0].id}`} onClick={(e) => e.stopPropagation()} className="badge badge-success badge-pill font-10">
                เครดิตได้
              </Link>
            )}
          </div>
          {/* Per-SHIPMENT pay: bill the whole -N split at once (restored 2026-06-19
              — was lost when the collapsible grouping landed; owner: "เลือกชำระราย
              ชิปเม้น หายไป"). Only when goods arrived (fstatus 4) + money-tier.
              🔴 owner 2026-07-18 GATE: "ยังยิงกล่องไม่ครบทั้งชิปเม้นก็เลือกวางบิลไม่ได้ เพราะ
              ของลูกค้าในตู้ยังยิงไม่ครบ" — hide the bill button until fully box-scanned. */}
          {showMoney && a.billableIds.length > 0 && (
            scanned ? (
              <div className="mt-1">
                <GroupCollectButton fIDs={a.billableIds} base={base} userid={a.userid} />
              </div>
            ) : (
              <div className="mt-1 text-[11px] text-red-700" title={`ยิงรับกล่องแล้ว ${fmtN(a.boxGot)}/${fmtN(a.boxExp)} — ต้องครบทั้งชิปเม้นก่อนวางบิล`}>
                ⛔ ยิงกล่องไม่ครบ ({fmtN(a.boxGot)}/{fmtN(a.boxExp)}) · วางบิลไม่ได้
              </div>
            )
          )}
          {/* Reverse bill link (read-only) — union of the group members' bills,
              deduped, newest invoice first. Groups collapse by default so surface
              it on the summary row too. */}
          {(() => {
            const gb = Array.from(
              new Map(
                g.flatMap((r) => (billByFid[r.id] ?? []).map((b) => [b.invoiceId, b] as const)),
              ).values(),
            ).sort((a2, b2) => b2.invoiceId - a2.invoiceId);
            return gb.length > 0 ? (
              <div className="mt-1 space-y-0.5">
                {/* owner 2026-07-19 "หัวบิลก็คือชิปเม้น...เบิ้ลไปหมด" — a shipment often
                    carries cancel + re-bill HISTORY (e.g. 00069/00070 cancelled →
                    00075 paid). Rendering all three identically read as "3 open
                    bills". Live docs render normally; cancelled ones grey +
                    strike-through so ONE shipment reads as ONE live bill. */}
                {gb.map((b) => (
                  <Link
                    key={b.invoiceId}
                    href={`/admin/billing-run/${b.invoiceId}`}
                    title={`ใบวางบิล ${b.docNo} · สถานะ ${b.status}`}
                    className={`block text-[11px] hover:underline ${b.status === "cancelled" ? "text-muted-foreground/60 line-through" : "text-primary-600"}`}
                  >
                    🧾 {b.docNo}{b.status === "cancelled" ? " (ยกเลิก)" : b.status === "paid" ? " · จ่ายแล้ว" : ""}
                  </Link>
                ))}
              </div>
            ) : null;
          })()}
        </td>
        {/* สถานะตู้ */}
        <td className="px-2 py-2 text-center">
          <span className={`badge badge-pill ${a.allPaid ? "badge-success" : "badge-warning"}`}>
            {a.allPaid ? CNTSTATUS_CFG.paid.label : a.nonePaid ? CNTSTATUS_CFG.unpaid.label : "บางส่วน"}
          </span>{" "}
          <span className={`badge ${transportBadgeClass} badge-pill`}>{transportLabel}</span>
        </td>
        {/* ตัวเลือก — ฿ รวมยอดเก็บของกลุ่ม */}
        <td className="px-2 py-2 text-right">฿{fmt(a.priceGetUser, 2)}</td>
        {/* หมายเหตุ */}
        <td className="px-2 py-2"></td>
      </tr>
    );
  }

  // 🔴 owner 2026-07-18 — the shipment dropdown is a NEUTRAL gray/white striped packing-list
  // (แบบแพคกิ้งลิส) of the trackings INSIDE this shipment: which trackings it has, how many
  // boxes (รับ/คาด), w × l × h (cm), weight (kg), CBM. NOT red/white data rows — the header
  // owns the scan/pay state; this is pure detail ("มีแทรคไรบ้าง · กี่กล่อง · ขนาด · น้ำหนัก · กี่คิว").
  function renderPackingList(g: DetailRow[], gkey: string) {
    return (
      <tr key={`pack-${gkey}`} className="pcs-row-packwrap">
        <td colSpan={totalCols} className="p-0">
          <div className="pcs-pack-wrap">
            {/* owner 2026-07-18 รอบ2 — columns SHARED with the main table keep the main
                table's ORDER (ลัง · ปริมาตร CBM · หนัก · ประเภท); the extra ก·ย·ส go LAST
                ("ที่มีอะเอามาเรียงให้ตรงก่อน แล้วค่อย กว้าง ยาว สูง ไว้หลังสุด"). */}
            <table className="pcs-pack">
              <thead>
                <tr>
                  <th className="text-right">#</th>
                  <th className="text-left">แทรคกิ้ง</th>
                  <th className="text-center">รูป</th>
                  <th className="text-right">ลัง (รับ/คาด)</th>
                  <th className="text-right">ปริมาตร (CBM)</th>
                  <th className="text-right">หนัก (Kg)</th>
                  <th className="text-left">ประเภท</th>
                  <th className="text-right">กว้าง (ซม.)</th>
                  <th className="text-right">ยาว</th>
                  <th className="text-right">สูง</th>
                </tr>
              </thead>
              <tbody>
                {g.map((r, i) => {
                  const rowScanned = isScanComplete(r.famountfi, r.famount, r.fstatus);
                  return (
                    <tr key={r.id}>
                      <td className="text-right text-muted">{i + 1}</td>
                      <td className="text-left font-mono">
                        <Link href={`/admin/forwarders/${r.id}`} className="text-primary-600 hover:underline">
                          {r.ftrackingchn ?? "-"}
                        </Link>
                        <span className="text-muted"> · #{r.id}</span>
                      </td>
                      {/* รูปแต่ละแทรค — ย่อไว้ · hover=ขยาย (CSS) · คลิก=เปิดแท็บใหม่. */}
                      <td className="text-center">
                        {r.coverUrl ? (
                          <a href={r.coverUrl} target="_blank" rel="noopener noreferrer" title="คลิกเพื่อเปิดรูปในแท็บใหม่">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={r.coverUrl} alt={`#${r.id}`} loading="lazy" className="pcs-pack-img" />
                          </a>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td
                        /* neutral packing-list (owner: gray/white) — a bold weight is the
                           only cue for a short tracking; no red row/cell colour here. */
                        className={`text-right ${rowScanned ? "" : "font-semibold"}`}
                        title={rowScanned ? "ยิงรับกล่องครบแล้ว" : "ยังยิงรับกล่องไม่ครบ"}
                      >
                        {fmtBox(r.famountfi, r.famount)}
                      </td>
                      <td className="text-right">{fmt(r.fvolume, 6)}</td>
                      <td className="text-right">{fmt(r.fweight, 2)}</td>
                      <td className="text-left">{productTypeLabel(r.fproductstype)}</td>
                      <td className="text-right">{r.fwidth != null && r.fwidth > 0 ? fmt(r.fwidth, 0) : "—"}</td>
                      <td className="text-right">{r.flength != null && r.flength > 0 ? fmt(r.flength, 0) : "—"}</td>
                      <td className="text-right">{r.fheight != null && r.fheight > 0 ? fmt(r.fheight, 0) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </td>
      </tr>
    );
  }

  // Wave 16 integration (post-P0-3): cost-edit modal is now `<ForwarderCostEditButton>`
  // (see components/admin/forwarder-cost-edit-button.tsx). Removed the placeholder
  // `onEditCost` callback — each button row now wires its own state via the button.

  return (
    <div className="space-y-3">
      {/* Quick-filter buttons — faithful legacy report-cnt.php L1600-1616 (btn
          colours per semantic · "สถานะเช็คข้อมูล" text label before the pay group). */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        {(Object.keys(FILTER_LABEL) as FilterKey[]).map((k) => {
          const active = filter === k;
          const cnt = counts[k];
          return (
            <span key={k} className="inline-flex items-center">
              {k === "cntUnpaid" && <span className="pcs-filter-label">สถานะเช็คข้อมูล</span>}
              <button
                type="button"
                onClick={() => setFilter(k)}
                className={`btn btn-sm ${FILTER_BTN[k]} box-shadow-2 mr-1${active ? " is-active" : ""}`}
              >
                {FILTER_LABEL[k]}
                {cnt > 0 && <span className="pcs-count-badge">{cnt}</span>}
              </button>
            </span>
          );
        })}
      </div>

      {/* Table — faithful legacy #myTable (table-bordered · 0.9rem · centered th) */}
      <div className="pcs-table-wrap scrollbar-x-visible">
        <table className="pcs-table">
          <thead>
            <tr>
              {checkColumn && (
                <th className="px-2 py-2 text-center w-8">
                  <input
                    type="checkbox"
                    checked={
                      eligibleFilteredIds.length > 0 &&
                      selected.size === eligibleFilteredIds.length
                    }
                    onChange={toggleAll}
                    disabled={!checkInteractive || eligibleFilteredIds.length === 0}
                    title={
                      !checkInteractive
                        ? "ตู้นี้จ่ายค่าตู้แล้ว · แก้ผ่านบิลจ่ายเงินตู้"
                        : eligibleFilteredIds.length === 0
                          ? `ไม่มีรายการที่ถึงโกดังไทยแล้ว (ขั้นต่ำ "${FSTATUS_LABEL[REPORT_CNT_ADD_CHECK_MIN_FSTATUS]}")`
                          : `เลือกทั้งหมด ${eligibleFilteredIds.length} รายการที่ถึงโกดังไทยแล้ว`
                    }
                    aria-label="เลือกทั้งหมด"
                  />
                </th>
              )}
              <Th k="fidorco"       onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="left">ID/CO</Th>
              <Th k="ftrackingchn"  onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="left">เลขแทรคกิ้ง</Th>
              <Th k="userid"        onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="left">รหัส</Th>
              <Th k="fdetail" onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="left">รายละเอียดสินค้า</Th>
              <Th k="famount"       onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="right">ลัง</Th>
              <Th k="fvolume"       onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="right">ปริมาตร<br />(CBM)</Th>
              <Th k="fweight"       onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="right">หนัก<br />(Kg)</Th>
              <Th k="fproductstype" onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="left">ประเภท</Th>
              {showMoney && <Th k="rate" onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="right">เรทต้นทุน</Th>}
              <Th k="ftotalprice"            onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="right">ค่า<br />นำเข้า</Th>
              <Th k="fpriceupdate"           onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="right">ค่า<br />อัปเดต</Th>
              <Th k="pricecrate"             onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="right">ค่า<br />ตีลัง</Th>
              <Th k="ftransportpricechnthb"  onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="right">ค่าขน<br />ส่งจีน+</Th>
              <Th k="priceother"             onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="right">ค่าอื่นๆ</Th>
              <Th k="fshipby" onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="left">การขนส่ง</Th>
              <Th k="ftransportprice"        onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="right">ค่าขน<br />ส่งไทย</Th>
              <Th k="fdiscount"              onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="right">ส่วน<br />ลด</Th>
              <Th k="priceGetUser"           onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="right">รวม<br />ขาย</Th>
              <Th k="onePer" onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="right">1%</Th>
              {showMoney && <Th k="fcosttotalprice" onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="right">ต้นทุน</Th>}
              {showMoney && <Th k="profitItem"      onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="right">กำไร</Th>}
              <Th k="fstatus" onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="center">สถานะสินค้า</Th>
              {/* 2026-06-19 owner "สถานะมั่ว": this column is the container-PAYMENT
                  state — renamed "สถานะตู้" → "สถานะจ่ายค่าตู้" to match the LIST page
                  (where "สถานะตู้" means the GOODS journey, not payment). Now the
                  two pages use the same word for the same axis. */}
              <Th k="cntPaid" onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="center">สถานะจ่ายค่าตู้</Th>
              <th className="text-right">ตัว<br />เลือก</th>
              <Th k="fnote" onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="left">หมายเหตุ</Th>
            </tr>
            {/* Summary band — orange→red gradient totals row (legacy L1621-1651 `.bg-color`).
                One <td> per header column, in order. */}
            <tr className="pcs-sum">
              {checkColumn && <td className="px-2 py-1.5"></td>}
              {/* IDORCO / Tracking / รหัส — merged label */}
              <td className="px-2 py-1.5" colSpan={3}>รวม {summary.count.toLocaleString()} รายการ</td>
              {/* รายละเอียด */}
              <td className="px-2 py-1.5 text-right">รวม</td>
              {/* ลัง */}
              <td className="px-2 py-1.5"></td>
              {/* ปริมาตร (CBM) */}
              <td className="px-2 py-1.5 text-right">{fmt(summary.volume, 6)}</td>
              {/* หนัก (Kg) */}
              <td className="px-2 py-1.5 text-right">{fmt(summary.weight, 2)}</td>
              {/* ประเภท */}
              <td className="px-2 py-1.5"></td>
              {/* เรทต้นทุน — showMoney only */}
              {showMoney && <td className="px-2 py-1.5"></td>}
              {/* ค่านำเข้า */}
              <td className="px-2 py-1.5 text-right">{fmt(summary.price, 2)}</td>
              {/* ค่าอัปเดต */}
              <td className="px-2 py-1.5"></td>
              {/* ค่าตีลัง */}
              <td className="px-2 py-1.5"></td>
              {/* ค่าขนส่งจีน+ */}
              <td className="px-2 py-1.5"></td>
              {/* ค่าอื่นๆ */}
              <td className="px-2 py-1.5"></td>
              {/* การขนส่ง */}
              <td className="px-2 py-1.5"></td>
              {/* ค่าขนส่งไทย */}
              <td className="px-2 py-1.5"></td>
              {/* ส่วนลด */}
              <td className="px-2 py-1.5 text-right">{fmt(summary.discount, 2)}</td>
              {/* รวมขาย */}
              <td className="px-2 py-1.5 text-right">{fmt(summary.priceUser, 2)}</td>
              {/* 1% */}
              <td className="px-2 py-1.5"></td>
              {/* ต้นทุน — showMoney only */}
              {showMoney && <td className="px-2 py-1.5 text-right">{fmt(summary.cost, 2)}</td>}
              {/* กำไร — showMoney only */}
              {showMoney && (
                <td className="px-2 py-1.5 text-right">
                  {summary.profit >= 0 ? "+" : ""}{fmt(summary.profit, 2)}
                </td>
              )}
              {/* สถานะสินค้า */}
              <td className="px-2 py-1.5"></td>
              {/* สถานะตู้ */}
              <td className="px-2 py-1.5"></td>
              {/* ตัวเลือก (฿ รวมยอดเก็บ) */}
              <td className="px-2 py-1.5 text-right">฿{fmt(summary.priceUser, 2)}</td>
              {/* หมายเหตุ */}
              <td className="px-2 py-1.5"></td>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={totalCols}
                  className="px-4 py-12 text-center text-sm text-muted"
                >
                  ไม่มีรายการที่ตรงกับ filter
                </td>
              </tr>
            ) : (
              renderItems.map((it) => {
                if (it.kind === "summary") {
                  return renderSummaryRow(it.group, it.gkey, it.open);
                }
                if (it.kind === "pack") {
                  return renderPackingList(it.group, it.gkey);
                }
                const r = it.r;
                // 🔴 owner 2026-07-18 — RED (ยังยิงกล่องไม่ครบ) / WHITE (ยิงครบแล้ว) ONLY, no
                // เขียว/น้ำเงิน/ส้ม. A single-tracking shipment is its own "หัวแถว" (no dropdown)
                // → same scan-based colour as the group header. Selected (emerald · interaction
                // feedback) + already-in-check-queue (white) still win. Supersedes the
                // 2026-07-17 per-fstatus palette — the box-scan completeness is the one signal.
                const rowScanned = isScanComplete(r.famountfi, r.famount, r.fstatus);
                const rowCls = selected.has(r.id)
                  ? "pcs-row-selected"
                  : r.inCheckQueue
                    ? "pcs-row-check"
                    : rowScanned
                      ? "pcs-row-scan-ok"
                      : "pcs-row-scan-wait";
                return (
                <tr
                  key={r.id}
                  className={rowCls}
                >
                  {checkColumn && (
                    <td className="px-2 py-2 text-center align-middle">
                      {r.inCheckQueue ? (
                        <span className="block text-[11px] text-emerald-600" title={`เพิ่มแล้วโดย ${r.checkAdminId ?? "-"}`}>
                          ✓ อยู่ในรายการ
                        </span>
                      ) : (() => {
                        const eligible = isRowEligibleForAddCheck(r.fstatus);
                        const currentLabel =
                          FSTATUS_LABEL[r.fstatus] ??
                          (r.fstatus ? r.fstatus : "(ว่าง)");
                        return (
                          <input
                            type="checkbox"
                            checked={selected.has(r.id)}
                            onChange={() => toggleRow(r.id)}
                            disabled={!eligible || !checkInteractive || !rowScanned || !hasDeliveryAddress(r)}
                            title={
                              !checkInteractive
                                ? "ตู้นี้จ่ายค่าตู้แล้ว · แก้ผ่านบิลจ่ายเงินตู้"
                                : !eligible
                                  ? `รอของถึงโกดังก่อน · สถานะปัจจุบัน: ${currentLabel}`
                                  : !rowScanned
                                    ? `ยิงกล่องไม่ครบ (${fmtBox(r.famountfi, r.famount)}) · เลือกวางบิลไม่ได้จนกว่าจะยิงครบ`
                                    : !hasDeliveryAddress(r)
                                      ? "ยังไม่ได้ตั้งที่อยู่จัดส่ง/เลือกขนส่ง — ตั้งก่อนเข้าคิวแจ้งชำระ (กันค่าขนส่งไทยตกหล่น)"
                                      : `เลือก ${r.fidorco ?? `#${r.id}`}`
                            }
                            aria-label={`เลือก ${r.id}`}
                          />
                        );
                      })()}
                    </td>
                  )}
                  <td className="px-2 py-2 font-mono text-[11px]">{r.fidorco ?? "-"}</td>
                  <td className="px-2 py-2 text-[11px]">
                    {/* ภูม #5 2026-05-29: legacy PHP linked to
                        `forwarder/update/<ID>` (singular) which does not exist
                        in Next.js. The Pacred forwarder detail lives at
                        `/admin/forwarders/[fNo]` (plural) and accepts either
                        `fidorco` or numeric `id` via legacy-fallback lookup. */}
                    <Link
                      href={`/admin/forwarders/${r.id}`}
                      className="text-primary-600 hover:underline"
                    >
                      {r.ftrackingchn ?? "-"}
                    </Link>
                    <br />
                    <span className="text-muted text-[11px]">เลขที่ #{r.id}</span>
                  </td>
                  <td className="font-12">
                    {/* ภูม #5 2026-05-29: legacy PHP linked to
                        `users/profile/<userID>` which does not exist in
                        Next.js. Pacred customer detail = `/admin/customers/[id]`
                        (Wave 20 P0-1, `tb_users.userID` backed). */}
                    <Link
                      href={`/admin/customers/${encodeURIComponent(r.userid)}`}
                      className="text-primary-600 hover:underline"
                    >
                      {r.userid}
                    </Link>
                    {/* นิติ / บุคคล — always shown so every row states the buyer's
                        entity type (ภูม 2026-07-21). Source = customer's canonical flag. */}
                    <> <EntityBadge juristic={r.custJuristic} /></>
                  </td>
                  <td className="max-w-[220px]">
                    {/* legacy: image float-right + short-text detail (fdetail →
                        item productname → tracking·ประเภท), never a bare "-". */}
                    {r.coverUrl ? (
                      <span className="float-right ml-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={r.coverUrl}
                          alt={`#${r.id}`}
                          loading="lazy"
                          className="prod-img cursor-zoom-in"
                          onClick={() => setLightboxSrc(r.coverUrl ?? null)}
                        />
                      </span>
                    ) : null}
                    <div className="short-text max-w" title={r.detailDisplay ?? r.ftrackingchn ?? ""}>
                      {r.detailDisplay ??
                        (r.ftrackingchn
                          ? `${r.ftrackingchn} · ${productTypeLabel(r.fproductstype)}`
                          : "-")}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right">
                    {/* V-D4 split-receipt: received / expected. Amber when a
                        scan exists but is short of expected (partial receipt);
                        red has no extra state — over-receipt is informational. */}
                    {(() => {
                      const exp = r.famount ?? 0;
                      const got = r.famountfi;
                      const isShort = got != null && exp > 0 && got < exp;
                      return (
                        <span
                          className={isShort ? "text-amber-600 font-semibold" : ""}
                          title={isShort ? `รับเข้าไม่ครบ: ${got}/${exp} ลัง (ขาด ${exp - got})` : "จำนวนลังที่รับเข้าโกดังไทย / จำนวนที่คาดไว้"}
                        >
                          {fmtBox(r.famountfi, r.famount)}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-2 py-2 text-right">{fmt(r.fvolume, 6)}</td>
                  <td className="px-2 py-2 text-right">{fmt(r.fweight, 2)}</td>
                  <td>
                    {productTypeLabel(r.fproductstype)}
                    {/* FLAG 5 — resolved SELL rate badge under the type word
                        (legacy report-cnt col 9: "ทั่วไป" + red pill "5,700"). */}
                    {r.frefrate != null && Number.isFinite(r.frefrate) && r.frefrate > 0 && (
                      <>
                        <br />
                        <span
                          className="badge badge-danger badge-pill font-10"
                          title="เรทขาย (SELL) ต่อคิว/กิโล"
                        >
                          {r.frefrate.toLocaleString("en-US")}
                        </span>
                      </>
                    )}
                  </td>
                  {showMoney && <td className="text-right">{fmt(r.rate, 0)}</td>}
                  <td className="text-right">
                    {fmt(r.ftotalprice, 2)}
                    <br />
                    <span className={`badge badge-pill font-10 ${r.frefprice === "1" ? "badge-info" : "badge-primary"}`}>
                      {r.frefprice === "1" ? "น้ำหนัก" : "ปริมาตร"}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right">{fmt(r.fpriceupdate, 2)}</td>
                  <td className="px-2 py-2 text-right">{fmt(r.pricecrate, 2)}</td>
                  <td className="px-2 py-2 text-right">{fmt(r.ftransportpricechnthb, 2)}</td>
                  <td className="px-2 py-2 text-right">{fmt(r.priceother, 2)}</td>
                  <td className="font-12">
                    {shipByLabel(r.fshipby)}
                    {r.paymethod === "2" && <span className="bg-danger">ปลายทาง</span>}
                    {r.fshipby !== "PCS" && (r.faddressdistrict || r.faddressprovince) && (
                      <>
                        <br />
                        {r.faddressdistrict ?? ""}
                        {r.faddressprovince ? ` · จ.${r.faddressprovince}` : ""}
                      </>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">{fmt(r.ftransportprice, 2)}</td>
                  <td className="px-2 py-2 text-right">{fmt(r.fdiscount, 2)}</td>
                  <td className="px-2 py-2 text-right">{fmt(r.priceGetUser, 2)}</td>
                  <td className="px-2 py-2 text-right">
                    {r.usercompany === "1" ? fmt(r.fusercompany1per, 2) : ""}
                  </td>
                  {showMoney && (
                    <td className="px-2 py-2 text-right">
                      <span title="ต้นทุน PCS">P: {fmt(r.fcosttotalprice, 2)}</span>
                      <br />
                      <span title="ต้นทุน แสง" className="text-muted text-[11px]">S: {fmt(r.fcosttotalpricesheet, 2)}</span>
                      <br />
                      <div className="flex gap-2 mt-0.5">
                        <ForwarderCostEditButton
                          mode="editCost"
                          forwarder={{
                            fid: r.id,
                            fNo: r.fidorco || String(r.id),
                            fCostTotalPrice: r.fcosttotalprice,
                            fCostTotalPriceSheet: r.fcosttotalpricesheet,
                            fProductsType2: r.fproductstype2,
                            fVolume: r.fvolume ?? 0,
                            fWeight: r.fweight ?? 0,
                            fTrackingCHN: r.ftrackingchn,
                          }}
                        />
                        <ForwarderCostEditButton
                          mode="editCost2"
                          forwarder={{
                            fid: r.id,
                            fNo: r.fidorco || String(r.id),
                            fCostTotalPrice: r.fcosttotalprice,
                            fCostTotalPriceSheet: r.fcosttotalpricesheet,
                            fProductsType2: r.fproductstype2,
                            fVolume: r.fvolume ?? 0,
                            fWeight: r.fweight ?? 0,
                            fTrackingCHN: r.ftrackingchn,
                          }}
                        />
                        <ForwarderCostEditButton
                          mode="editCostSheet"
                          forwarder={{
                            fid: r.id,
                            fNo: r.fidorco || String(r.id),
                            fCostTotalPrice: r.fcosttotalprice,
                            fCostTotalPriceSheet: r.fcosttotalpricesheet,
                            fProductsType2: r.fproductstype2,
                            fVolume: r.fvolume ?? 0,
                            fWeight: r.fweight ?? 0,
                            fTrackingCHN: r.ftrackingchn,
                          }}
                        />
                      </div>
                    </td>
                  )}
                  {showMoney && (
                    <td className="px-2 py-2 text-right">
                      <span className={r.profitItem >= 0 ? "text-green-600" : "text-red-600"}>
                        {r.profitItem >= 0 ? "+" : ""}{fmt(r.profitItem, 2)}
                      </span>
                    </td>
                  )}
                  <td className="px-2 py-2 text-center">
                    {(() => {
                      const b = fstatusBadge(r.fstatus);
                      return (
                        <span className={`badge badge-pill ${legacyStatusClass(r.fstatus)}`}>
                          {b.label}
                        </span>
                      );
                    })()}
                    {/* 2026-06-09 ภูม: badge "ยังถึงไม่ได้" removed — row tint
                        (pink/rose for notYetWarehouse) + status pill already
                        signal it visually; the extra chip was redundant clutter.
                        Checkbox disable + tooltip still active (sufficient). */}
                    {r.fcredit && r.fcredit !== "" && (
                      <div className="mt-1">
                        {/* ภูม #5 2026-05-29: same path-fix as tracking link above. */}
                        <Link href={`/admin/forwarders/${r.id}`} className="badge badge-success badge-pill">
                          เครดิตได้
                        </Link>
                      </div>
                    )}
                    {/* re-sweep A2 #6 — per-row bill-to-customer (4→5). Money-tier
                        only, and ONLY when the goods have arrived (fstatus 4 =
                        ถึงไทยแล้ว). Audit 2026-06-18: was `< 5` (showed on 1/2/3
                        too → could bill goods still in China). 5/6/7 = already
                        billed (the action no-ops those).
                        🔴 owner 2026-07-18 GATE — also require ยิงกล่องครบ (rowScanned):
                        an arrived-but-partially-boxed row (famountfi<famount) is RED and
                        must NOT be billable until fully scanned. */}
                    {showMoney && Number(r.fstatus) === 4 && (
                      rowScanned ? (
                        <div className="mt-1">
                          <BillToCustomerButton fID={r.id} />
                        </div>
                      ) : (
                        <div className="mt-1 text-[11px] text-red-700" title={`ยิงรับกล่องแล้ว ${fmtN(r.famountfi)}/${fmtN(r.famount)} — ต้องครบก่อนวางบิล`}>
                          ⛔ ยิงกล่องไม่ครบ ({fmtN(r.famountfi)}/{fmtN(r.famount)}) · วางบิลไม่ได้
                        </div>
                      )
                    )}
                    {/* Reverse bill link (read-only) — the ใบวางบิล(s) covering
                        this forwarder. No bill → nothing renders. */}
                    {(billByFid[r.id] ?? []).length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {(billByFid[r.id] ?? []).map((b) => (
                          <Link
                            key={b.invoiceId}
                            href={`/admin/billing-run/${b.invoiceId}`}
                            title={`ใบวางบิล ${b.docNo} · สถานะ ${b.status}`}
                            className={`block text-[11px] hover:underline ${b.status === "cancelled" ? "text-muted-foreground/60 line-through" : "text-primary-600"}`}
                          >
                            🧾 {b.docNo}{b.status === "cancelled" ? " (ยกเลิก)" : b.status === "paid" ? " · จ่ายแล้ว" : ""}
                          </Link>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="text-center">
                    {/* legacy: จ่ายแล้ว/ยังไม่จ่าย badge + transport badge (ทางรถ/เรือ/อากาศ) */}
                    <span className={`badge badge-pill ${r.cntPaid ? "badge-success" : "badge-warning"}`}>
                      {r.cntPaid ? CNTSTATUS_CFG.paid.label : CNTSTATUS_CFG.unpaid.label}
                    </span>{" "}
                    <span className={`badge ${transportBadgeClass} badge-pill`}>{transportLabel}</span>
                    {r.trackingDup && (
                      <div className="mt-1">
                        <span className="badge badge-warning badge-pill">
                          {r.cntPaid ? "จ่ายซ้ำแล้ว" : "กำลังจะจ่ายซ้ำ"}
                        </span>
                      </div>
                    )}
                  </td>
                  {/* ตัวเลือก — legacy ฿ collect amount cell */}
                  <td className="text-right">฿{fmt(r.priceGetUser, 2)}</td>
                  <td className="max-w-[140px] font-12">
                    <div className="truncate" title={r.fnote ?? ""}>{r.fnote ?? ""}</div>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Product-image lightbox — click a thumbnail to view it full-size (ปอน
          2026-07-15 "กดจิ้มดูภาพเต็ม"). Portalled to <body> so the fixed overlay
          escapes the .animate-fade-in transform (same trap as the action bar);
          click anywhere / Esc dismisses. */}
      {mounted && lightboxSrc && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxSrc(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxSrc}
            alt="รูปสินค้าเต็ม"
            className="max-h-[92vh] max-w-[92vw] rounded-md object-contain shadow-2xl"
          />
        </div>,
        document.body,
      )}

      {/* Fixed-bottom add-to-check bar — for any check-flow viewer (super/ops/
          accounting/god). On a PAID cabinet it's read-only: the add button is
          replaced by a note, but the "ดูรายการที่ตรวจสอบแล้ว" CTA (→ /admin/
          forwarder-check where 4→5 billing happens) stays visible. */}
      {checkColumn && mounted && createPortal(
        // wrapped in .pcs-rc so the portalled bar keeps the legacy pcs-card styling
        // (.pcs-rc .btn / .pcs-fixed-actions) even though it now lives under <body>.
        <div className="pcs-rc">
          {checkInteractive && bulkMsg && (
            <div className="fixed bottom-16 left-1/2 z-40 -translate-x-1/2 rounded bg-black/80 px-3 py-1.5 text-xs text-white shadow-lg">
              {bulkMsg}
            </div>
          )}
          <div className="pcs-fixed-actions admin-floating-action pcs-safe-area-bottom">
            {checkInteractive ? (
              <>
                <button
                  type="button"
                  disabled={pending || selected.size === 0}
                  onClick={() => {
                    if (selected.size === 0) {
                      setBulkMsg("กรุณาเลือกอย่างน้อย 1 รายการ");
                      return;
                    }
                    setBulkMsg(null);
                    setConfirmAddCheck(true);
                  }}
                  className="btn btn-color-main"
                >
                  {pending
                    ? "กำลังเพิ่ม…"
                    : `เพิ่มในรายการตรวจสอบแล้ว${selected.size > 0 ? ` (${selected.size})` : ""}`}
                </button>
              </>
            ) : (
              <span className="btn btn-secondary" style={{ cursor: "default" }}>
                ตู้นี้จ่ายค่าตู้แล้ว · เพิ่มรายการตรวจสอบไม่ได้
              </span>
            )}
            <Link href="/admin/forwarder-check" className="btn btn-color-main" target="_blank" rel="noreferrer">
              <span className="text-white">ดูรายการที่ตรวจสอบแล้ว</span>
            </Link>
          </div>
        </div>,
        document.body,
      )}

      {/* Itemized confirm-before-mutate popup (§0f) — lists the ticked rows about
          to be added to the check-queue. On confirm → the unchanged bulkCheck()
          (adminReportCntAddCheck). */}
      {checkInteractive && (
        <SelectedItemsConfirmDialog
          open={confirmAddCheck}
          title={`รายการที่เลือก ${selected.size}/${eligibleFilteredIds.length} รายการ`}
          rows={rows
            .filter((r) => selected.has(r.id))
            .map((r) => ({
              orderNo: r.fidorco ?? `#${r.id}`,
              tracking: r.ftrackingchn ?? "-",
              customerCode: r.userid,
              status: FSTATUS_LABEL[r.fstatus] ?? (r.fstatus || "-"),
            }))}
          confirmLabel="เพิ่มไปยังรายการตรวจสอบแล้ว"
          busy={pending}
          onCancel={() => setConfirmAddCheck(false)}
          onConfirm={() => {
            setConfirmAddCheck(false);
            bulkCheck();
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Per-row bill-to-customer (4→5) button — calls adminReportCntBillToCustomer.
// Confirms before billing (money action) + shows the resulting balance.
// ─────────────────────────────────────────────────────────────────────

function BillToCustomerButton({ fID }: { fID: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function bill() {
    if (!(await confirm(`แจ้งหนี้ลูกค้า (ย้ายไปสถานะรอชำระเงิน) สำหรับรายการ #${fID}?`))) return;
    setMsg(null);
    start(async () => {
      const res = await adminReportCntBillToCustomer({ fID });
      if (!res.ok) {
        setMsg(res.error);
        return;
      }
      setDone(true);
      const auto = res.data?.autoThShipping;
      setMsg(
        res.data?.alreadyBilled
          ? "รายการนี้แจ้งหนี้ไปแล้ว"
          : `แจ้งหนี้แล้ว · ยอดค้างชำระ ${(res.data?.pricePay ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บ.${auto ? ` · เพิ่มค่าส่งไทย ${auto.label} อัตโนมัติ` : ""}`,
      );
      router.refresh();
    });
  }

  if (done) {
    return <span className="inline-block text-[11px] text-amber-700">{msg}</span>;
  }
  return (
    <>
      <button
        type="button"
        onClick={bill}
        disabled={pending}
        className="inline-block rounded-full bg-amber-500 text-amber-50 border border-amber-700 text-[11px] px-1.5 py-0.5 hover:bg-amber-600 disabled:opacity-50"
      >
        {pending ? "กำลังแจ้ง…" : "แจ้งหนี้ (4→5)"}
      </button>
      {msg && <div className="mt-0.5 text-[11px] text-red-600">{msg}</div>}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Group bill-to-customer — bill an ENTIRE -N split shipment (per-shipment pay)
// in one click. Loops the same per-row 4→5 writer (adminReportCntBillGroupToCustomer,
// gated super/ops/accounting, idempotent). Restored 2026-06-19 (owner-flagged
// the per-shipment pay selection had disappeared from the collapsed group row).
// ─────────────────────────────────────────────────────────────────────
function GroupCollectButton({ fIDs, base, userid }: { fIDs: number[]; base: string; userid: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function bill() {
    if (!(await confirm(`แจ้งหนี้ลูกค้า ${userid} ทั้งกลุ่มแทรคกิ้ง ${base} (${fIDs.length} ซอย) พร้อมกัน?`))) return;
    setMsg(null);
    start(async () => {
      const res = await adminReportCntBillGroupToCustomer({ fIDs });
      if (!res.ok) {
        setMsg(res.error);
        return;
      }
      setDone(true);
      const d = res.data;
      setMsg(
        `แจ้งหนี้ ${d?.billed ?? 0} ซอย · ยอดรวม ${(d?.totalPricePay ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บ.` +
          (d?.failed ? ` · ผิดพลาด ${d.failed}` : ""),
      );
      router.refresh();
    });
  }

  if (done) {
    return <span className="inline-block text-[11px] text-amber-700">{msg}</span>;
  }
  return (
    <>
      <button
        type="button"
        onClick={bill}
        disabled={pending}
        className="inline-block rounded-full bg-amber-500 text-amber-50 border border-amber-700 text-[11px] px-1.5 py-0.5 hover:bg-amber-600 disabled:opacity-50"
      >
        {pending ? "กำลังแจ้ง…" : `แจ้งหนี้ทั้งกลุ่ม (${fIDs.length} ซอย)`}
      </button>
      {msg && <div className="mt-0.5 text-[11px] text-red-600">{msg}</div>}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

// Roll a multi-box order up into one summary: Σ the numeric columns; a text/
// enum column collapses to its single value when uniform across the boxes, else
// null (the summary renders a "หลาย…" marker). Mirrors the same money columns
// the per-row table + the bottom totals band already sum (display-only · no
// money is written here).
/**
 * owner 2026-07-18 — "ตั้งที่อยู่จัดส่งแล้ว?" — a row with no delivery address can't
 * price its ค่าขนส่งไทย → the bill under-collects. Mirrors the SERVER address-gate in
 * adminReportCntAddCheck (province OR zipcode set · self-pickup PCS exempt).
 */
function hasDeliveryAddress(r: DetailRow): boolean {
  if ((r.fshipby ?? "").trim() === "PCS") return true; // รับเองโกดัง
  return (r.faddressprovince ?? "").trim() !== "" || (r.faddresszipcode ?? "").trim() !== "";
}

/**
 * owner 2026-07-18 — "ยิงกล่องครบ" = all expected boxes of this row/shipment have
 * been scanned-received at the TH warehouse (famountfi ≥ famount). This drives BOTH
 *   • the RED (ยังไม่ครบ) / WHITE (ครบ) header-row colour, and
 *   • the billing gate (a shipment can't be selected for วางบิล until fully scanned).
 * When no expected box-count is set (famount 0/null), fall back to the arrival scan
 * (fstatus ≥ 4 = ถึงไทยแล้ว) so a measured-but-unboxed arrived row still reads WHITE.
 */
function isScanComplete(
  got: number | null | undefined,
  exp: number | null | undefined,
  fstatus: string | null | undefined,
): boolean {
  const e = Number(exp ?? 0);
  if (e > 0) return Number(got ?? 0) >= e;
  return Number((fstatus ?? "").trim() || 0) >= 4;
}

function aggregateGroup(g: DetailRow[]) {
  const sum = (f: (r: DetailRow) => number) => g.reduce((s, r) => s + (Number(f(r)) || 0), 0);
  function uniq<T>(f: (r: DetailRow) => T): T | null {
    const first = f(g[0]);
    return g.every((r) => f(r) === first) ? first : null;
  }
  return {
    userid:                g[0].userid,
    boxGot:                sum((r) => r.famountfi ?? 0),
    boxExp:                sum((r) => r.famount ?? 0),
    volume:                sum((r) => r.fvolume ?? 0),
    weight:                sum((r) => r.fweight ?? 0),
    ftotalprice:           sum((r) => r.ftotalprice),
    // owner 2026-07-18 — เรทต้นทุน is per-CBM/mode, the SAME for every tracking of a
    // shipment (one container/mode) → show it ONCE on the header (was blank "—").
    // uniq keeps it null on the rare mixed-rate group (falls back to "หลายเรท").
    rate:                  uniq((r) => r.rate),
    // owner 2026-07-18 รอบ2 — the header wears the same ค่านำเข้า tags a single row
    // does: basis pill (ปริมาตร/น้ำหนัก · frefprice) + SELL-rate pill (frefrate).
    frefprice:             uniq((r) => (r.frefprice ?? "").trim()),
    frefrate:              uniq((r) => r.frefrate),
    fpriceupdate:          sum((r) => r.fpriceupdate),
    pricecrate:            sum((r) => r.pricecrate),
    ftransportpricechnthb: sum((r) => r.ftransportpricechnthb),
    priceother:            sum((r) => r.priceother),
    ftransportprice:       sum((r) => r.ftransportprice),
    fdiscount:             sum((r) => r.fdiscount),
    priceGetUser:          sum((r) => r.priceGetUser),
    onePer:                sum((r) => (r.usercompany === "1" ? r.fusercompany1per : 0)),
    fcosttotalprice:       sum((r) => r.fcosttotalprice),
    fcosttotalpricesheet:  sum((r) => r.fcosttotalpricesheet),
    profit:                sum((r) => r.profitItem),
    productType:           uniq((r) => (r.fproductstype ?? "").trim()),
    shipBy:                uniq((r) => (r.fshipby ?? "").trim()),
    status:                uniq((r) => r.fstatus),
    fidorco:               uniq((r) => r.fidorco ?? "") ?? "",
    detail:                uniq((r) => (r.detailDisplay ?? "").trim() || null),
    // owner 2026-07-18 รอบ3 — the header must carry the SAME detail as a single row:
    // credit/นิติ badges · COD · the delivery address · the next-action hint.
    fcredit:               g.some((r) => (r.fcredit ?? "").trim() === "1"),
    isJuristic:            g.some((r) => r.custJuristic),
    paymethod:             uniq((r) => (r.paymethod ?? "").trim()),
    addressDistrict:       uniq((r) => (r.faddressdistrict ?? "").trim() || null),
    addressProvince:       uniq((r) => (r.faddressprovince ?? "").trim() || null),
    allPaid:               g.every((r) => r.cntPaid),
    nonePaid:              g.every((r) => !r.cntPaid),
    // fids billable now = goods arrived in TH (fstatus 4 = ถึงไทยแล้ว). Feeds the
    // group "แจ้งหนี้ทั้งกลุ่ม" button so a -N split shipment can be billed once.
    billableIds:           g.filter((r) => Number(r.fstatus) === 4).map((r) => r.id),
  };
}

function filterRows(rows: DetailRow[], filter: FilterKey): DetailRow[] {
  switch (filter) {
    case "all":          return rows;
    case "notWarehouse": return rows.filter((r) => r.notYetWarehouse);
    case "readyToCheck": return rows.filter((r) => !r.inCheckQueue && isRowEligibleForAddCheck(r.fstatus));
    case "inCheckQueue": return rows.filter((r) => r.inCheckQueue);
    case "cntUnpaid":    return rows.filter((r) => !r.cntPaid);
    case "cntPaid":      return rows.filter((r) =>  r.cntPaid);
    case "trackingDup":  return rows.filter((r) => r.trackingDup);
    case "idCoDup":      return rows.filter((r) => r.idCoDup);
    case "notCollected": return rows.filter((r) => r.notCollectedFromCustomer);
  }
}

function fmt(n: number | null | undefined, digits: number): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "-";
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtN(n: number | null | undefined): string {
  if (n === null || n === undefined) return "-";
  return String(n);
}

/** owner 2026-07-18 รอบ2 — กล่อง/ลัง display: "เดี๋ยว -/1 เดี๋ยว 0/1 ให้ใช้ 0/1 เหมือนกันหมด".
 *  A not-yet-scanned side renders 0, never "-". */
function fmtBox(got: number | null | undefined, exp: number | null | undefined): string {
  const g = got ?? 0, e = exp ?? 0;
  // over-received (โกดังยิงเกินที่ MOMO แจ้ง เช่น 6/1) — say so explicitly instead of a
  // bare "6/1" that reads as garbage (owner 2026-07-19 "จำนวนกล่องไม่ถูก"). The scans
  // are the warehouse's physical count; the expected is MOMO's declared quantity —
  // a mismatch = a real MOMO-vs-physical conflict for staff to reconcile.
  return g > e && e > 0 ? `${g}/${e} · เกิน +${g - e}` : `${g}/${e}`;
}

function productTypeLabel(t: string | null): string {
  switch ((t ?? "").trim()) {
    case "1": return "ทั่วไป";
    case "2": return "มอก.";
    case "3": return "อย./น้ำยา";
    case "4": return "พิเศษ";
    default:  return "-";
  }
}

// Carrier name — the SHARED platform SOT (carrierLabel · lib/freight/shipping-methods),
// identical to the forwarder detail page. External couriers (Flash/J&T/ธนามัย ฯลฯ)
// render their NAME, never a raw numeric code — the partial SHIP_BY_LABEL map used to
// show a raw "13" for ธนามัย ขนส่งด่วน (ภูม 2026-07-21). Full legacy nameShipBy faithful.
function shipByLabel(s: string | null): string {
  return carrierLabel(s);
}

// นิติ / บุคคล pill — EVERY row shows the buyer's entity type (ภูม 2026-07-21:
// "ขึ้นไปเลยว่าเป็นนิติ หรือ บุคคล · ทุกแถว"). tb_forwarder.fusercompany="1" = นิติบุคคล,
// else = บุคคลธรรมดา. นิติ = highlighted (badge-vip), บุคคล = neutral (badge-secondary)
// so the juristic customers stand out at a glance (self-explaining row · §0g).
function EntityBadge({ juristic }: { juristic: boolean }) {
  return (
    <span
      className={`badge badge-pill font-10 ${juristic ? "badge-vip" : "badge-secondary"}`}
      title={juristic ? "ลูกค้านิติบุคคล" : "ลูกค้าบุคคลธรรมดา"}
    >
      {juristic ? "นิติ" : "บุคคล"}
    </span>
  );
}

// Legacy report-cnt "สถานะสินค้า" badge colour by fstatus — 1:1 with the legacy
// statusForwarderBadge() (include/function.php L879-892): 1=warning · 2=info ·
// 3=pink · 4=brown · 5=danger · 6=primary · 7=success. Label from fstatusBadge().
function legacyStatusClass(fstatus: string): string {
  switch ((fstatus ?? "").trim()) {
    case "1": return "badge-warning";
    case "2": return "badge-info";
    case "3": return "badge-pink";
    case "4": return "badge-brown";
    case "5": return "badge-danger";
    case "6": return "badge-primary";
    case "7":
    case "8": return "badge-success";
    default:  return "badge-secondary";
  }
}

// Sortable column header — clickable with up/down arrow indicator.
function Th({
  k,
  onSort,
  sortKey,
  sortDir,
  align,
  children,
}: {
  k: NonNullable<SortKey>;
  onSort: (k: NonNullable<SortKey>) => void;
  sortKey: SortKey;
  sortDir: SortDir;
  align: "left" | "right" | "center";
  children: React.ReactNode;
}) {
  const active = sortKey === k;
  const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  const alignCls =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const justifyCls =
    align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  return (
    <th className={`px-2 py-2 ${alignCls}`}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`group inline-flex w-full items-center gap-1 ${justifyCls} hover:text-foreground ${active ? "text-foreground" : ""}`}
      >
        <span className="text-center leading-tight">{children}</span>
        <Icon className={`h-3 w-3 shrink-0 ${active ? "opacity-100" : "opacity-40 group-hover:opacity-70"}`} />
      </button>
    </th>
  );
}
