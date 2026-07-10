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

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronRight } from "lucide-react";
import { adminReportCntAddCheck, adminReportCntBillToCustomer, adminReportCntBillGroupToCustomer } from "@/actions/admin/report-cnt-detail";
import { Link } from "@/i18n/navigation";
import { confirm } from "@/components/ui/confirm";
import { SelectedItemsConfirmDialog } from "@/components/admin/selected-items-confirm-dialog";
import { baseTracking } from "@/lib/admin/momo-bill-header";
import { ForwarderCostEditButton } from "@/components/admin/forwarder-cost-edit-button";
import {
  fstatusBadge,
  detailRowTint,
  DETAIL_LEGEND,
  CNTSTATUS_CFG,
} from "@/lib/admin/forwarder-status";
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
  | null;

type SortDir = "asc" | "desc";

export function ContainerDetailClient({ rows, showMoney, canCheckFlow, cabinetIsPaid, billByFid = {} }: ContainerDetailClientProps) {
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
  const router = useRouter();

  const filtered = useMemo(() => {
    const f = filterRows(rows, filter);
    if (!sortKey) return f;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...f].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
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

  // Total column count — for the empty-state colSpan (22 base cols + the select
  // col + the 3 money cols).
  const totalCols = 22 + (checkColumn ? 1 : 0) + (showMoney ? 3 : 0);

  // Render list: a multi-box order emits a SUMMARY row (always) + its box rows
  // ONLY when expanded; a single-box order emits one plain row. Recomputes when
  // a group is toggled (depends on `expanded`).
  const renderItems = useMemo(() => {
    const items: Array<
      | { kind: "summary"; group: DetailRow[]; gkey: string; open: boolean }
      | { kind: "row"; r: DetailRow; member: boolean }
    > = [];
    for (const g of groups) {
      if (g.length > 1) {
        const base = baseTracking(g[0].ftrackingchn);
        const gkey = base ? `${base}|${g[0].userid}` : `__solo_${g[0].id}`;
        const open = expanded.has(gkey);
        items.push({ kind: "summary", group: g, gkey, open });
        if (open) for (const r of g) items.push({ kind: "row", r, member: true });
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
  const eligibleFilteredIds = useMemo(
    () => filtered.filter((r) => isRowEligibleForAddCheck(r.fstatus)).map((r) => r.id),
    [filtered],
  );

  // G1 combo-flow (2026-07-08) — the distinct customers among the TICKED rows. The
  // "→ ออกใบวางบิล" transition only fires for a SINGLE customer (a ใบวางบิล = 1 ใบ/
  // ลูกค้า) — it carries the exact ticked forwarder ids into the create-form.
  const selectedUserids = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (selected.has(r.id) && r.userid) s.add(r.userid);
    return Array.from(s);
  }, [rows, selected]);

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
    const base = baseTracking(g[0].ftrackingchn) ?? g[0].ftrackingchn ?? "-";
    const eligibleIds = g
      .filter((r) => !r.inCheckQueue && isRowEligibleForAddCheck(r.fstatus))
      .map((r) => r.id);
    const groupSel = eligibleIds.length > 0 && eligibleIds.every((id) => selected.has(id));
    const statusBadge = a.status != null ? fstatusBadge(a.status) : null;
    return (
      <tr
        key={`sum-${gkey}-${g[0].id}`}
        onClick={() => toggleGroup(gkey)}
        className="border-t-2 border-primary-200 bg-primary-50/60 dark:bg-primary-900/15 font-medium cursor-pointer hover:bg-primary-100/70 dark:hover:bg-primary-900/25"
      >
        {checkColumn && (
          <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
            {eligibleIds.length > 0 && (
              <input
                type="checkbox"
                checked={groupSel}
                onChange={() => toggleGroupSelect(eligibleIds)}
                disabled={!checkInteractive}
                title={
                  checkInteractive
                    ? `เลือกทั้งออเดอร์ (${eligibleIds.length} แทรคที่ถึงไทยแล้ว)`
                    : "ตู้นี้จ่ายค่าตู้แล้ว · แก้ผ่านบิลจ่ายเงินตู้"
                }
                aria-label={`เลือกออเดอร์ ${base}`}
              />
            )}
          </td>
        )}
        {/* ID — group marker */}
        <td className="px-2 py-2 text-center text-muted">📦</td>
        {/* ID/CO */}
        <td className="px-2 py-2 font-mono text-[11px]">{a.fidorco || "—"}</td>
        {/* เลขแทรคกิ้ง — chevron toggle + base + count */}
        <td className="px-2 py-2 text-[11px]">
          <span className="inline-flex items-center gap-1 font-semibold text-primary-700 dark:text-primary-300">
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            {base}
          </span>
          <span className="ml-1.5 inline-block rounded-full bg-primary-200 text-primary-800 dark:bg-primary-800 dark:text-primary-100 text-[11px] font-bold px-1.5 py-0.5">
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
        <td className="px-2 py-2 text-right">{fmtN(a.boxGot)}/{fmtN(a.boxExp)}</td>
        {/* ปริมาตร */}
        <td className="px-2 py-2 text-right">{fmt(a.volume, 6)}</td>
        {/* หนัก */}
        <td className="px-2 py-2 text-right">{fmt(a.weight, 2)}</td>
        {/* ประเภท */}
        <td className="px-2 py-2">{a.productType != null ? productTypeLabel(a.productType) : "หลายประเภท"}</td>
        {/* เรทต้นทุน — rate is not summable */}
        {showMoney && <td className="px-2 py-2 text-right text-muted">—</td>}
        {/* ค่านำเข้า */}
        <td className="px-2 py-2 text-right">{fmt(a.ftotalprice, 2)}</td>
        {/* ค่าอัปเดต */}
        <td className="px-2 py-2 text-right">{fmt(a.fpriceupdate, 2)}</td>
        {/* ค่าตีลัง */}
        <td className="px-2 py-2 text-right">{fmt(a.pricecrate, 2)}</td>
        {/* ค่าขนส่งจีน+ */}
        <td className="px-2 py-2 text-right">{fmt(a.ftransportpricechnthb, 2)}</td>
        {/* ค่าอื่นๆ */}
        <td className="px-2 py-2 text-right">{fmt(a.priceother, 2)}</td>
        {/* การขนส่ง */}
        <td className="px-2 py-2 text-[11px]">{a.shipBy != null ? shipByLabel(a.shipBy) : "—"}</td>
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
            <span className={`inline-block rounded-full text-[11px] px-2 py-0.5 font-medium ${statusBadge.chip}`}>
              {statusBadge.label}
            </span>
          ) : (
            <span className="inline-block rounded-full text-[11px] px-2 py-0.5 font-medium bg-gray-200 text-gray-700">หลายสถานะ</span>
          )}
          {/* Per-SHIPMENT pay: bill the whole -N split at once (restored 2026-06-19
              — was lost when the collapsible grouping landed; owner: "เลือกชำระราย
              ชิปเม้น หายไป"). Only when goods arrived (fstatus 4) + money-tier. */}
          {showMoney && a.billableIds.length > 0 && (
            <div className="mt-1">
              <GroupCollectButton fIDs={a.billableIds} base={base} userid={a.userid} />
            </div>
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
                {gb.map((b) => (
                  <Link
                    key={b.invoiceId}
                    href={`/admin/billing-run/${b.invoiceId}`}
                    title={`ใบวางบิล ${b.docNo} · สถานะ ${b.status}`}
                    className="block text-[11px] text-primary-600 hover:underline"
                  >
                    🧾 {b.docNo}
                  </Link>
                ))}
              </div>
            ) : null;
          })()}
        </td>
        {/* สถานะตู้ */}
        <td className="px-2 py-2 text-center">
          <span
            className={`inline-block rounded-full text-[11px] px-2 py-0.5 font-medium ${
              a.allPaid ? CNTSTATUS_CFG.paid.chip : a.nonePaid ? CNTSTATUS_CFG.unpaid.chip : "bg-amber-100 text-amber-700"
            }`}
          >
            {a.allPaid ? CNTSTATUS_CFG.paid.label : a.nonePaid ? CNTSTATUS_CFG.unpaid.label : "บางส่วน"}
          </span>
        </td>
        {/* หมายเหตุ */}
        <td className="px-2 py-2"></td>
      </tr>
    );
  }

  // Wave 16 integration (post-P0-3): cost-edit modal is now `<ForwarderCostEditButton>`
  // (see components/admin/forwarder-cost-edit-button.tsx). Removed the placeholder
  // `onEditCost` callback — each button row now wires its own state via the button.

  return (
    <div className="space-y-3">
      {/* Quick-filter buttons */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted">กรอง:</span>
        {(Object.keys(FILTER_LABEL) as FilterKey[]).map((k) => {
          const active = filter === k;
          const cnt = counts[k];
          return (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 transition-colors ${
                active
                  ? "bg-primary-500 text-white border-primary-500"
                  : "bg-white dark:bg-surface text-foreground border-border hover:bg-surface-alt"
              }`}
            >
              <span>{FILTER_LABEL[k]}</span>
              {cnt > 0 && (
                <span
                  className={`inline-flex items-center justify-center rounded-full text-[11px] font-bold leading-none px-1.5 py-0.5 ${
                    active ? "bg-white text-primary-600" : "bg-red-500 text-white"
                  }`}
                >
                  {cnt}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend chips — top of detail table (legacy report-cnt.php L1601-1615 ·
          canonical DETAIL_LEGEND has 8 chips). Logic-encoded color key for staff. */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-border bg-white dark:bg-surface px-3 py-2 text-[11px] shadow-sm">
        <span className="text-muted mr-1">สีแถว/สถานะ:</span>
        {DETAIL_LEGEND.map((l) => (
          <span
            key={l.key}
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${l.cls}`}
          >
            {l.label}
          </span>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-border bg-white dark:bg-surface shadow-sm scrollbar-x-visible">
        <table className="w-full text-xs">
          <thead className="bg-surface-alt/50 text-[11px] uppercase tracking-wide text-muted">
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
              <Th k="id"            onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="left">ID</Th>
              <Th k="fidorco"       onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="left">ID/CO</Th>
              <Th k="ftrackingchn"  onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="left">เลขแทรคกิ้ง</Th>
              <Th k="userid"        onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="left">รหัส</Th>
              <th className="px-2 py-2 text-left">รายละเอียดสินค้า</th>
              <Th k="famount"       onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="right">ctns (รับ/คาด)</Th>
              <Th k="fvolume"       onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="right">ปริมาตร (CBM)</Th>
              <Th k="fweight"       onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="right">หนัก (Kg)</Th>
              <Th k="fproductstype" onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="left">ประเภท</Th>
              {showMoney && <Th k="rate" onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="right">เรทต้นทุน</Th>}
              <Th k="ftotalprice"            onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="right">ค่านำเข้า</Th>
              <Th k="fpriceupdate"           onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="right">ค่าอัปเดต</Th>
              <Th k="pricecrate"             onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="right">ค่าตีลัง</Th>
              <Th k="ftransportpricechnthb"  onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="right">ค่าขนส่งจีน+</Th>
              <Th k="priceother"             onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="right">ค่าอื่นๆ</Th>
              <th className="px-2 py-2 text-left">การขนส่ง</th>
              <Th k="ftransportprice"        onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="right">ค่าขนส่งไทย</Th>
              <Th k="fdiscount"              onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="right">ส่วนลด</Th>
              <Th k="priceGetUser"           onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="right">รวมขาย</Th>
              <th className="px-2 py-2 text-right">1%</th>
              {showMoney && <Th k="fcosttotalprice" onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="right">ต้นทุน</Th>}
              {showMoney && <Th k="profitItem"      onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="right">กำไร</Th>}
              <Th k="fstatus" onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="center">สถานะสินค้า</Th>
              {/* 2026-06-19 owner "สถานะมั่ว": this column is the container-PAYMENT
                  state — renamed "สถานะตู้" → "สถานะจ่ายค่าตู้" to match the LIST page
                  (where "สถานะตู้" means the GOODS journey, not payment). Now the
                  two pages use the same word for the same axis. */}
              <th className="px-2 py-2 text-center">สถานะจ่ายค่าตู้</th>
              <th className="px-2 py-2 text-left">หมายเหตุ</th>
            </tr>
            {/* Summary band — orange→red gradient totals row (legacy L1653-1684 `.bg-color`).
                One <td> per header column, in order. */}
            <tr className="bg-gradient-to-r from-orange-400 to-red-500 text-white font-semibold text-[11px]">
              {checkColumn && <td className="px-2 py-1.5"></td>}
              {/* ID / IDORCO / Tracking / รหัส — merged label */}
              <td className="px-2 py-1.5" colSpan={4}>รวม {summary.count.toLocaleString()} รายการ</td>
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
                const r = it.r;
                return (
                <tr
                  key={r.id}
                  className={`border-t border-border ${it.member ? "border-l-2 border-l-primary-300" : ""} ${detailRowTint({
                    inCheckQueue: r.inCheckQueue,
                    notYetWarehouse: r.notYetWarehouse,
                    trackingDup: r.trackingDup,
                    selected: selected.has(r.id),
                  })}`}
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
                          <>
                            <input
                              type="checkbox"
                              checked={selected.has(r.id)}
                              onChange={() => toggleRow(r.id)}
                              disabled={!eligible || !checkInteractive}
                              title={
                                !checkInteractive
                                  ? "ตู้นี้จ่ายค่าตู้แล้ว · แก้ผ่านบิลจ่ายเงินตู้"
                                  : eligible
                                    ? `เลือก ${r.fidorco ?? `#${r.id}`}`
                                    : `รอของถึงโกดังก่อน · สถานะปัจจุบัน: ${currentLabel}`
                              }
                              aria-label={`เลือก ${r.id}`}
                            />
                            {/* FIX 2b — VISIBLE disabled reason so a not-yet-arrived
                                row (fstatus<4) doesn't read as "broken" (the dead-end). */}
                            {!eligible && checkInteractive && (
                              <span className="mt-0.5 block text-[11px] leading-tight text-amber-600">
                                รอสินค้าถึงไทย
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </td>
                  )}
                  <td className="px-2 py-2 font-mono" title={r.inCheckQueue ? `เพิ่มแล้วโดย ${r.checkAdminId} เวลา: ${r.checkDate}` : undefined}>
                    {r.id}
                  </td>
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
                  <td className="px-2 py-2 text-[11px]">
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
                  </td>
                  <td className="px-2 py-2 max-w-[220px]">
                    {/* FIX 2d — cover thumbnail + real product-detail (fdetail →
                        item productname → tracking·ประเภท), never a bare "-". */}
                    <div className="flex items-start gap-2">
                      {r.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.coverUrl}
                          alt={`#${r.id}`}
                          loading="lazy"
                          className="h-10 w-10 shrink-0 rounded border border-border bg-surface-alt object-cover"
                        />
                      ) : null}
                      <div
                        className="min-w-0 flex-1 truncate"
                        title={r.detailDisplay ?? r.ftrackingchn ?? ""}
                      >
                        {r.detailDisplay ??
                          (r.ftrackingchn
                            ? `${r.ftrackingchn} · ${productTypeLabel(r.fproductstype)}`
                            : "-")}
                      </div>
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
                          {fmtN(r.famountfi)}/{fmtN(r.famount)}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-2 py-2 text-right">{fmt(r.fvolume, 6)}</td>
                  <td className="px-2 py-2 text-right">{fmt(r.fweight, 2)}</td>
                  <td className="px-2 py-2">
                    {productTypeLabel(r.fproductstype)}
                    {/* FLAG 5 — resolved SELL rate badge under the type word
                        (legacy report-cnt col 9: "ทั่วไป" + "3,700" / "15"). */}
                    {r.frefrate != null && Number.isFinite(r.frefrate) && r.frefrate > 0 && (
                      <div
                        className="mt-0.5 text-[11px] text-muted"
                        title="เรทขาย (SELL) ต่อคิว/กิโล"
                      >
                        {r.frefrate.toLocaleString("en-US")}
                      </div>
                    )}
                  </td>
                  {showMoney && <td className="px-2 py-2 text-right">{fmt(r.rate, 0)}</td>}
                  <td className="px-2 py-2 text-right">
                    {fmt(r.ftotalprice, 2)}
                    <br />
                    <span className={`inline-block rounded-full text-[11px] px-1.5 py-0.5 ${r.frefprice === "1" ? "bg-sky-100 text-sky-700" : "bg-primary-100 text-primary-700"}`}>
                      {r.frefprice === "1" ? "น้ำหนัก" : "ปริมาตร"}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right">{fmt(r.fpriceupdate, 2)}</td>
                  <td className="px-2 py-2 text-right">{fmt(r.pricecrate, 2)}</td>
                  <td className="px-2 py-2 text-right">{fmt(r.ftransportpricechnthb, 2)}</td>
                  <td className="px-2 py-2 text-right">{fmt(r.priceother, 2)}</td>
                  <td className="px-2 py-2 text-[11px]">
                    {shipByLabel(r.fshipby)}
                    {r.paymethod === "2" && (
                      <span className="ml-1 inline-block bg-red-500 text-white text-[11px] px-1 rounded">ปลายทาง</span>
                    )}
                    {r.fshipby !== "PCS" && (r.faddressdistrict || r.faddressprovince) && (
                      <div className="text-muted text-[11px]">
                        {r.faddressdistrict ?? ""}
                        {r.faddressprovince ? ` · จ.${r.faddressprovince}` : ""}
                      </div>
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
                        <span className={`inline-block rounded-full text-[11px] px-2 py-0.5 font-medium ${b.chip}`}>
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
                        <Link
                          href={`/admin/forwarders/${r.id}`}
                          className="inline-block rounded-full bg-emerald-500 text-emerald-50 border border-emerald-700 text-[11px] px-1.5 py-0.5"
                        >
                          เครดิตได้
                        </Link>
                      </div>
                    )}
                    {/* re-sweep A2 #6 — per-row bill-to-customer (4→5). Money-tier
                        only, and ONLY when the goods have arrived (fstatus 4 =
                        ถึงไทยแล้ว). Audit 2026-06-18: was `< 5` (showed on 1/2/3
                        too → could bill goods still in China). 5/6/7 = already
                        billed (the action no-ops those). */}
                    {showMoney && Number(r.fstatus) === 4 && (
                      <div className="mt-1">
                        <BillToCustomerButton fID={r.id} />
                      </div>
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
                            className="block text-[11px] text-primary-600 hover:underline"
                          >
                            🧾 {b.docNo}
                          </Link>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <span
                      className={`inline-block rounded-full text-[11px] px-2 py-0.5 font-medium ${
                        r.cntPaid ? CNTSTATUS_CFG.paid.chip : CNTSTATUS_CFG.unpaid.chip
                      }`}
                    >
                      {r.cntPaid ? CNTSTATUS_CFG.paid.label : CNTSTATUS_CFG.unpaid.label}
                    </span>
                    {r.trackingDup && (
                      <div className="mt-1">
                        <span className="inline-block rounded-full bg-orange-400 text-orange-950 border border-orange-600 text-[11px] px-1.5 py-0.5">
                          {r.cntPaid ? "จ่ายซ้ำแล้ว" : "กำลังจะจ่ายซ้ำ"}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2 max-w-[140px] text-[11px]">
                    <div className="truncate" title={r.fnote ?? ""}>{r.fnote ?? ""}</div>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Fixed-bottom add-to-check bar — for any check-flow viewer (super/ops/
          accounting/god). On a PAID cabinet it's read-only: the add button is
          replaced by a note, but the "ดูรายการที่ตรวจสอบแล้ว" CTA (→ /admin/
          forwarder-check where 4→5 billing happens) stays visible. */}
      {checkColumn && (
        <div className="pcs-safe-area-bottom fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex flex-wrap items-center gap-2 rounded-full bg-white dark:bg-surface border border-border shadow-lg px-3 py-2 text-xs">
          {checkInteractive ? (
            <>
              <span className="text-muted">เลือก: <span className="font-semibold text-foreground">{selected.size}</span> รายการ</span>
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
                className="rounded-full bg-primary-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-600 disabled:opacity-50"
              >
                {pending ? "กำลังเพิ่ม…" : "เพิ่มในรายการตรวจสอบแล้ว"}
              </button>
              {/* G1 combo-flow (2026-07-08) — carry the ตรวจตู้ selection straight to
                  the create-bill form (ติ๊กให้อัตโนมัติ). Fires only for a SINGLE
                  customer (ใบวางบิล = 1 ใบ/ลูกค้า). Use AFTER "เพิ่มในรายการตรวจสอบแล้ว"
                  so a fresh สถานะ 4 (ตรวจตู้แล้ว) row is on the check-queue → the bill
                  admits it (G4) + lifts 4→5. สถานะ 5 rows carry with no precondition. */}
              {selectedUserids.length === 1 ? (
                <button
                  type="button"
                  disabled={selected.size === 0}
                  onClick={() =>
                    router.push(
                      `/admin/billing-run/add?userid=${encodeURIComponent(selectedUserids[0])}&fids=${Array.from(selected).join(",")}`,
                    )
                  }
                  title="ยกยอดรายการที่เลือกไปออกใบวางบิล (ติ๊กให้อัตโนมัติ) · แนะนำให้กด 'เพิ่มในรายการตรวจสอบแล้ว' ก่อน"
                  className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                >
                  → ออกใบวางบิล
                </button>
              ) : selectedUserids.length > 1 ? (
                <button
                  type="button"
                  disabled
                  title="เลือกได้ทีละลูกค้า (ใบวางบิล = 1 ใบ/ลูกค้า)"
                  className="rounded-full border border-border bg-surface-alt px-3 py-1.5 text-xs font-medium text-muted opacity-60 cursor-not-allowed"
                >
                  → ออกใบวางบิล (เลือกทีละลูกค้า)
                </button>
              ) : null}
            </>
          ) : (
            <span className="text-muted">ตู้นี้จ่ายค่าตู้แล้ว · เพิ่มรายการตรวจสอบไม่ได้ (แก้ผ่านบิลจ่ายเงินตู้)</span>
          )}
          <Link
            href="/admin/forwarder-check"
            className="rounded-full border border-border bg-white dark:bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-alt"
            target="_blank"
            rel="noreferrer"
          >
            ดูรายการที่ตรวจสอบแล้ว
          </Link>
          {checkInteractive && bulkMsg && <span className="text-muted">{bulkMsg}</span>}
        </div>
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
    detail:                uniq((r) => (r.fdetail ?? "").trim() || null),
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

function productTypeLabel(t: string | null): string {
  switch ((t ?? "").trim()) {
    case "1": return "ทั่วไป";
    case "2": return "มอก.";
    case "3": return "อย./น้ำยา";
    case "4": return "พิเศษ";
    default:  return "-";
  }
}

function shipByLabel(s: string | null): string {
  switch ((s ?? "").trim()) {
    case "PCS":   return "PCS-รับเอง";
    case "PCSE":  return "PCS-ส่งบ้าน";
    case "PCSF":  return "PCS-ส่งฟรี";
    default:      return s ?? "-";
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
        <span>{children}</span>
        <Icon className={`h-3 w-3 ${active ? "opacity-100" : "opacity-40 group-hover:opacity-70"}`} />
      </button>
    </th>
  );
}
