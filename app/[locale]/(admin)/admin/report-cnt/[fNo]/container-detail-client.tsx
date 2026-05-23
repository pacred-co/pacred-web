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
import { adminReportCntAddCheck } from "@/actions/admin/report-cnt-detail";
import { Link } from "@/i18n/navigation";

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

export function ContainerDetailClient({ rows, showMoney, canBulkCheck, cabinetIsPaid }: ContainerDetailClientProps) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pending, start] = useTransition();
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const router = useRouter();

  const filtered = useMemo(() => filterRows(rows, filter), [rows, filter]);

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

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((r) => r.id)));
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

  function onEditCost(fid: number, mode: "P" | "S" | "Sheet") {
    // P0-1 stub. Wave 16 P0-3 in parallel is building the real modal —
    // this is the call site they'll wire when that lands.
    alert(`P0-3 (parallel) จะสร้าง modal "แก้ไขราคาต้นทุน (${mode})" สำหรับ fID=${fid}`);
  }

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

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-border bg-white dark:bg-surface shadow-sm">
        <table className="w-full text-xs">
          <thead className="bg-surface-alt/50 text-[10px] uppercase tracking-wide text-muted">
            <tr>
              {canBulkCheck && !cabinetIsPaid && (
                <th className="px-2 py-2 text-center w-8">
                  <input
                    type="checkbox"
                    checked={selected.size > 0 && selected.size === filtered.length}
                    onChange={toggleAll}
                    aria-label="เลือกทั้งหมด"
                  />
                </th>
              )}
              <th className="px-2 py-2 text-left">ID</th>
              <th className="px-2 py-2 text-left">ID/CO</th>
              <th className="px-2 py-2 text-left">เลขแทรคกิ้ง</th>
              <th className="px-2 py-2 text-left">รหัส</th>
              <th className="px-2 py-2 text-left">รายละเอียดสินค้า</th>
              <th className="px-2 py-2 text-right">ลัง</th>
              <th className="px-2 py-2 text-right">ปริมาตร<br />(CBM)</th>
              <th className="px-2 py-2 text-right">หนัก<br />(Kg)</th>
              <th className="px-2 py-2 text-left">ประเภท</th>
              {showMoney && <th className="px-2 py-2 text-right">เรทต้นทุน</th>}
              <th className="px-2 py-2 text-right">ค่านำเข้า</th>
              <th className="px-2 py-2 text-right">ค่าอัปเดต</th>
              <th className="px-2 py-2 text-right">ค่าตีลัง</th>
              <th className="px-2 py-2 text-right">ค่าขนส่งจีน+</th>
              <th className="px-2 py-2 text-right">ค่าอื่นๆ</th>
              <th className="px-2 py-2 text-left">การขนส่ง</th>
              <th className="px-2 py-2 text-right">ค่าขนส่งไทย</th>
              <th className="px-2 py-2 text-right">ส่วนลด</th>
              <th className="px-2 py-2 text-right">รวมขาย</th>
              <th className="px-2 py-2 text-right">1%</th>
              {showMoney && <th className="px-2 py-2 text-right">ต้นทุน</th>}
              {showMoney && <th className="px-2 py-2 text-right">กำไร</th>}
              <th className="px-2 py-2 text-center">สถานะสินค้า</th>
              <th className="px-2 py-2 text-center">สถานะตู้</th>
              <th className="px-2 py-2 text-left">หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={26} className="px-4 py-12 text-center text-sm text-muted">
                  ไม่มีรายการที่ตรงกับ filter
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr
                  key={r.id}
                  className={`border-t border-border ${
                    r.inCheckQueue
                      ? "bg-slate-50 dark:bg-slate-900/30"
                      : r.notYetWarehouse
                      ? "bg-red-50/50 dark:bg-red-900/10"
                      : r.trackingDup
                      ? "bg-amber-50/50 dark:bg-amber-900/10"
                      : ""
                  }`}
                >
                  {canBulkCheck && !cabinetIsPaid && (
                    <td className="px-2 py-2 text-center">
                      {!r.inCheckQueue && (
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggleRow(r.id)}
                          aria-label={`เลือก ${r.id}`}
                        />
                      )}
                    </td>
                  )}
                  <td className="px-2 py-2 font-mono" title={r.inCheckQueue ? `เพิ่มแล้วโดย ${r.checkAdminId} เวลา: ${r.checkDate}` : undefined}>
                    {r.id}
                  </td>
                  <td className="px-2 py-2 font-mono text-[11px]">{r.fidorco ?? "-"}</td>
                  <td className="px-2 py-2 text-[11px]">
                    <Link href={`/admin/forwarder/update/${r.id}`} className="text-primary-600 hover:underline">
                      {r.ftrackingchn ?? "-"}
                    </Link>
                    <br />
                    <span className="text-muted text-[10px]">เลขที่ #{r.id}</span>
                  </td>
                  <td className="px-2 py-2 text-[11px]">
                    <Link href={`/admin/users/profile/${r.userid}`} className="text-primary-600 hover:underline">
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
                      <div className="flex gap-1 mt-0.5">
                        <button type="button" onClick={() => onEditCost(r.id, "P")} className="text-sky-600 hover:text-sky-700 text-[10px]" title="แก้ไขราคาต้นทุน PCS">edit</button>
                        <button type="button" onClick={() => onEditCost(r.id, "S")} className="text-sky-600 hover:text-sky-700 text-[10px]" title="รับค่าจาก Sheet แสง">edit2</button>
                        <button type="button" onClick={() => onEditCost(r.id, "Sheet")} className="text-sky-600 hover:text-sky-700 text-[10px]" title="แก้ไขราคา Sheet">editS</button>
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
                    <StatusBadge fstatus={r.fstatus} />
                    {r.fcredit && r.fcredit !== "" && (
                      <div className="mt-1">
                        <Link href={`/admin/forwarder/update/${r.id}`} className="inline-block rounded-full bg-green-100 text-green-700 text-[9px] px-1.5 py-0.5">เครดิตได้</Link>
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center">
                    {r.cntPaid ? (
                      <span className="inline-block rounded-full bg-green-100 text-green-700 text-[10px] px-2 py-0.5">จ่ายแล้ว</span>
                    ) : (
                      <span className="inline-block rounded-full bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5">ยังไม่จ่าย</span>
                    )}
                    {r.trackingDup && (
                      <div className="mt-1">
                        <span className="inline-block rounded-full bg-sky-100 text-sky-700 text-[9px] px-1.5 py-0.5">
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

function StatusBadge({ fstatus }: { fstatus: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    "1": { label: "รอเข้าโกดังจีน",  cls: "bg-yellow-100 text-yellow-700" },
    "2": { label: "ถึงโกดังจีน",     cls: "bg-blue-100 text-blue-700" },
    "3": { label: "กำลังส่งมาไทย",   cls: "bg-pink-100 text-pink-700" },
    "4": { label: "ถึงไทย",          cls: "bg-purple-100 text-purple-700" },
    "5": { label: "รอชำระเงิน",      cls: "bg-amber-100 text-amber-700" },
    "6": { label: "เตรียมส่ง",       cls: "bg-emerald-100 text-emerald-700" },
    "7": { label: "ส่งแล้ว",         cls: "bg-green-100 text-green-700" },
  };
  const m = map[fstatus] ?? { label: fstatus, cls: "bg-gray-100 text-gray-700" };
  return <span className={`inline-block rounded-full text-[10px] px-2 py-0.5 ${m.cls}`}>{m.label}</span>;
}
