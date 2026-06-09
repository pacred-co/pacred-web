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
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { adminReportCntAddCheck, adminReportCntBillToCustomer } from "@/actions/admin/report-cnt-detail";
import { Link } from "@/i18n/navigation";
import { confirm } from "@/components/ui/confirm";
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
  fcover: string | null;
  famount: number | null;
  famountfi: number | null;
  fvolume: number | null;
  fweight: number | null;
  fproductstype: string | null;
  /** Secondary product-type enum used for cost calc (Wave 16 P0-3 modal target) */
  fproductstype2: string | null;
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

export type FilterKey = "all" | "notWarehouse" | "cntUnpaid" | "cntPaid" | "trackingDup" | "idCoDup" | "notCollected";

const FILTER_LABEL: Record<FilterKey, string> = {
  all:          "ทั้งหมด",
  notWarehouse: "ยังไม่ยิงเข้าโกดังไทย",
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
  canBulkCheck: boolean;
  cabinetIsPaid: boolean;
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

export function ContainerDetailClient({ rows, showMoney, canBulkCheck, cabinetIsPaid }: ContainerDetailClientProps) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pending, start] = useTransition();
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
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
      cntUnpaid:    0,
      cntPaid:      0,
      trackingDup:  0,
      idCoDup:      0,
      notCollected: 0,
    };
    for (const r of rows) {
      if (r.notYetWarehouse) c.notWarehouse += 1;
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
                  className={`inline-flex items-center justify-center rounded-full text-[10px] font-bold leading-none px-1.5 py-0.5 ${
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
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-medium ${l.cls}`}
          >
            {l.label}
          </span>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-border bg-white dark:bg-surface shadow-sm scrollbar-x-visible">
        <table className="w-full text-xs">
          <thead className="bg-surface-alt/50 text-[10px] uppercase tracking-wide text-muted">
            <tr>
              {canBulkCheck && !cabinetIsPaid && (
                <th className="px-2 py-2 text-center w-8">
                  <input
                    type="checkbox"
                    checked={
                      eligibleFilteredIds.length > 0 &&
                      selected.size === eligibleFilteredIds.length
                    }
                    onChange={toggleAll}
                    disabled={eligibleFilteredIds.length === 0}
                    title={
                      eligibleFilteredIds.length === 0
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
              <Th k="famount"       onSort={toggleSort} sortKey={sortKey} sortDir={sortDir} align="right">ลัง</Th>
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
              <th className="px-2 py-2 text-center">สถานะตู้</th>
              <th className="px-2 py-2 text-left">หมายเหตุ</th>
            </tr>
            {/* Summary band — orange→red gradient totals row (legacy L1653-1684 `.bg-color`).
                One <td> per header column, in order. */}
            <tr className="bg-gradient-to-r from-orange-400 to-red-500 text-white font-semibold text-[11px]">
              {canBulkCheck && !cabinetIsPaid && <td className="px-2 py-1.5"></td>}
              {/* ID / IDORCO / Tracking / รหัส — merged label */}
              <td className="px-2 py-1.5" colSpan={4}>รวม {summary.count.toLocaleString()} รายการ</td>
              {/* รายละเอียด */}
              <td className="px-2 py-1.5 text-right">รวม</td>
              {/* ลัง */}
              <td className="px-2 py-1.5"></td>
              {/* ปริมาตร (CBM) */}
              <td className="px-2 py-1.5 text-right">{fmt(summary.volume, 2)}</td>
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
                  colSpan={
                    22 +
                    (canBulkCheck && !cabinetIsPaid ? 1 : 0) +
                    (showMoney ? 3 : 0)
                  }
                  className="px-4 py-12 text-center text-sm text-muted"
                >
                  ไม่มีรายการที่ตรงกับ filter
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr
                  key={r.id}
                  className={`border-t border-border ${detailRowTint({
                    inCheckQueue: r.inCheckQueue,
                    notYetWarehouse: r.notYetWarehouse,
                    trackingDup: r.trackingDup,
                    selected: selected.has(r.id),
                  })}`}
                >
                  {canBulkCheck && !cabinetIsPaid && (
                    <td className="px-2 py-2 text-center">
                      {!r.inCheckQueue && (() => {
                        const eligible = isRowEligibleForAddCheck(r.fstatus);
                        const currentLabel =
                          FSTATUS_LABEL[r.fstatus] ??
                          (r.fstatus ? r.fstatus : "(ว่าง)");
                        return (
                          <input
                            type="checkbox"
                            checked={selected.has(r.id)}
                            onChange={() => toggleRow(r.id)}
                            disabled={!eligible}
                            title={
                              eligible
                                ? `เลือก ${r.fidorco ?? `#${r.id}`}`
                                : `รอของถึงโกดังก่อน · สถานะปัจจุบัน: ${currentLabel}`
                            }
                            aria-label={`เลือก ${r.id}`}
                          />
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
                      href={`/admin/forwarders/${encodeURIComponent(r.fidorco ?? String(r.id))}`}
                      className="text-primary-600 hover:underline"
                    >
                      {r.ftrackingchn ?? "-"}
                    </Link>
                    <br />
                    <span className="text-muted text-[10px]">เลขที่ #{r.id}</span>
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
                  <td className="px-2 py-2 max-w-[200px]">
                    <div className="truncate" title={r.fdetail ?? ""}>
                      {r.fdetail ?? "-"}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right">
                    {fmtN(r.famountfi)}/{fmtN(r.famount)}
                  </td>
                  <td className="px-2 py-2 text-right">{fmt(r.fvolume, 2)}</td>
                  <td className="px-2 py-2 text-right">{fmt(r.fweight, 2)}</td>
                  <td className="px-2 py-2">{productTypeLabel(r.fproductstype)}</td>
                  {showMoney && <td className="px-2 py-2 text-right">{fmt(r.rate, 0)}</td>}
                  <td className="px-2 py-2 text-right">
                    {fmt(r.ftotalprice, 2)}
                    <br />
                    <span className={`inline-block rounded-full text-[9px] px-1.5 py-0.5 ${r.frefprice === "1" ? "bg-sky-100 text-sky-700" : "bg-primary-100 text-primary-700"}`}>
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
                      <span className="ml-1 inline-block bg-red-500 text-white text-[9px] px-1 rounded">ปลายทาง</span>
                    )}
                    {r.fshipby !== "PCS" && (r.faddressdistrict || r.faddressprovince) && (
                      <div className="text-muted text-[10px]">
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
                      <span title="ต้นทุน แสง" className="text-muted text-[10px]">S: {fmt(r.fcosttotalpricesheet, 2)}</span>
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
                        <span className={`inline-block rounded-full text-[10px] px-2 py-0.5 font-medium ${b.chip}`}>
                          {b.label}
                        </span>
                      );
                    })()}
                    {/* 2026-06-09 status-gate (ภูม) — when bulk-check is active,
                        flag rows whose fstatus is below the QA-eligibility floor
                        so staff can SEE why the checkbox is disabled. */}
                    {canBulkCheck && !cabinetIsPaid && !r.inCheckQueue && !isRowEligibleForAddCheck(r.fstatus) && (
                      <div className="mt-1">
                        <span
                          className="inline-block rounded-full bg-slate-200 text-slate-700 border border-slate-400 text-[9px] px-1.5 py-0.5"
                          title={`รอของถึงโกดังก่อน · ตรวจสอบได้เมื่อสถานะถึง "${FSTATUS_LABEL[REPORT_CNT_ADD_CHECK_MIN_FSTATUS]}"`}
                        >
                          ยังถึงไม่ได้
                        </span>
                      </div>
                    )}
                    {r.fcredit && r.fcredit !== "" && (
                      <div className="mt-1">
                        {/* ภูม #5 2026-05-29: same path-fix as tracking link above. */}
                        <Link
                          href={`/admin/forwarders/${encodeURIComponent(r.fidorco ?? String(r.id))}`}
                          className="inline-block rounded-full bg-emerald-500 text-emerald-50 border border-emerald-700 text-[9px] px-1.5 py-0.5"
                        >
                          เครดิตได้
                        </Link>
                      </div>
                    )}
                    {/* re-sweep A2 #6 — per-row bill-to-customer (4→5). Money-tier
                        only, and only when the row hasn't been billed yet. */}
                    {showMoney && Number(r.fstatus) < 5 && (
                      <div className="mt-1">
                        <BillToCustomerButton fID={r.id} />
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <span
                      className={`inline-block rounded-full text-[10px] px-2 py-0.5 font-medium ${
                        r.cntPaid ? CNTSTATUS_CFG.paid.chip : CNTSTATUS_CFG.unpaid.chip
                      }`}
                    >
                      {r.cntPaid ? CNTSTATUS_CFG.paid.label : CNTSTATUS_CFG.unpaid.label}
                    </span>
                    {r.trackingDup && (
                      <div className="mt-1">
                        <span className="inline-block rounded-full bg-orange-400 text-orange-950 border border-orange-600 text-[9px] px-1.5 py-0.5">
                          {r.cntPaid ? "จ่ายซ้ำแล้ว" : "กำลังจะจ่ายซ้ำ"}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2 max-w-[140px] text-[11px]">
                    <div className="truncate" title={r.fnote ?? ""}>{r.fnote ?? ""}</div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Fixed-bottom bulk-action bar — only for money-tier roles and when cnt is unpaid */}
      {canBulkCheck && !cabinetIsPaid && (
        <div className="pcs-safe-area-bottom fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex flex-wrap items-center gap-2 rounded-full bg-white dark:bg-surface border border-border shadow-lg px-3 py-2 text-xs">
          <span className="text-muted">เลือก: <span className="font-semibold text-foreground">{selected.size}</span> รายการ</span>
          <button
            type="button"
            disabled={pending || selected.size === 0}
            onClick={bulkCheck}
            className="rounded-full bg-primary-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-600 disabled:opacity-50"
          >
            {pending ? "กำลังเพิ่ม…" : "เพิ่มในรายการตรวจสอบแล้ว"}
          </button>
          <Link
            href="/admin/forwarder-check"
            className="rounded-full border border-border bg-white dark:bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-alt"
            target="_blank"
            rel="noreferrer"
          >
            ดูรายการที่ตรวจสอบแล้ว
          </Link>
          {bulkMsg && <span className="text-muted">{bulkMsg}</span>}
        </div>
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
      setMsg(
        res.data?.alreadyBilled
          ? "รายการนี้แจ้งหนี้ไปแล้ว"
          : `แจ้งหนี้แล้ว · ยอดค้างชำระ ${(res.data?.pricePay ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บ.`,
      );
      router.refresh();
    });
  }

  if (done) {
    return <span className="inline-block text-[9px] text-amber-700">{msg}</span>;
  }
  return (
    <>
      <button
        type="button"
        onClick={bill}
        disabled={pending}
        className="inline-block rounded-full bg-amber-500 text-amber-50 border border-amber-700 text-[9px] px-1.5 py-0.5 hover:bg-amber-600 disabled:opacity-50"
      >
        {pending ? "กำลังแจ้ง…" : "แจ้งหนี้ (4→5)"}
      </button>
      {msg && <div className="mt-0.5 text-[9px] text-red-600">{msg}</div>}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function filterRows(rows: DetailRow[], filter: FilterKey): DetailRow[] {
  switch (filter) {
    case "all":          return rows;
    case "notWarehouse": return rows.filter((r) => r.notYetWarehouse);
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
