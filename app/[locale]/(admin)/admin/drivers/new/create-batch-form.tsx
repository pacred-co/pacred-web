"use client";

/**
 * Create-batch form — client island for the multi-select stop picker +
 * driver select + endtime select.
 *
 * Mirrors legacy forwarder-driver.php "page=add" tab + addFrom.php modal,
 * collapsed into one inline form (no modal — Pacred pattern).
 *
 * PRESENTATION (2026-07-01 · owner "ให้เหมือน PCS 100%"): the stop picker is a
 * DENSE TABLE — one <tr> per delivery group with the exact legacy columns:
 *   [☑] · จำนวน · บริษัทขนส่ง · เลขแทรคกิ้ง (nested per-tracking sub-table:
 *   # / เลขออเดอร์ / รหัสสมาชิก / เลขแทรคกิ้ง(+location) / กล่อง / น้ำหนัก /
 *   ปริมาตร → "รวม" row) · ลำดับส่ง · ที่อยู่ (อำเภอ highlighted).
 * Top: "แสดง N รายการ" length dropdown + "ค้นหา" box. Footer: เลือกคนขับรถ +
 * running weight/volume totals + "แสดง 1 ถึง N จาก M รายการ" pagination.
 * The LOGIC (state · createDriverBatch · route-order sort · carrier filter ·
 * driver/endtime selectors) is UNCHANGED — only the markup matches legacy.
 *
 * FOOTER (2026-07-01 · owner "เอาแบบ PCS ไปเลย"): a COMPACT COLORED (primary/red)
 * action bar pinned bottom-left — faithful to legacy `.m-driver-footer`
 * (forwarder-driver.php L1032: `position: fixed; bottom: 20px; left: 70px`, a
 * `btn-group` of `btn-color-main round` pills). The truck action button sits on
 * the LEFT, the driver + endtime selectors + the running หนัก / ปริมาตร /
 * ระบบแนะนำ totals inline beside it — NOT a tall gray panel. The 0-select guard
 * POPS UP centered (legacy Swal "กรุณาเลือกรายการ") via useConfirmDialogs.alert.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { Truck } from "lucide-react";
import { createDriverBatch } from "@/actions/admin/driver-batches";
import { exportFlashPickupCsv } from "@/actions/admin/export/flash-pickup";
import { recommendVehicle } from "@/lib/admin/vehicle-recommendation";
import { routeOrderOf } from "@/lib/admin/driver-route-order";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";

type StopItem = {
  id:           number;
  fidorco:      string;
  ftrackingchn: string;
  userid:       string;
  famount:      number;
  fweight:      number;
  fvolume:      number;
  fpallet:      string;
  fnote:        string;
};

type Stop = {
  key:           string;
  fshipby:       string | null;
  shipByLabel:   string;
  userid:        string;
  customerName:  string;
  /** Recipient display name — real address name, else customer name (never the
   *  bare "รับที่โกดัง Pacred" warehouse placeholder). */
  recipientName: string;
  /** No real delivery address yet (warehouse placeholder / empty). */
  addressMissing: boolean;
  address: {
    name:        string;
    lastName:    string;
    no:          string;
    subDistrict: string;
    district:    string;
    province:    string;
    zipCode:     string;
    tel:         string;
  };
  items:        StopItem[];
  forwarderIds: number[];
  totalBoxes:   number;
  totalWeight:  number;
  totalVolume:  number;
};

type DriverOption = { member_code: string; display: string };

export function CreateBatchForm({
  groups,
  drivers,
  showCarrierFilter = false,
}: {
  groups: Stop[];
  drivers: DriverOption[];
  /** Show the 🚚 ขนส่ง carrier-filter chip row — Express tab only (มอบคนขับ = Pacred-only, no filter). */
  showCarrierFilter?: boolean;
}) {
  const router = useRouter();
  const { alert, dialogs } = useConfirmDialogs();
  const [pending, startTransition] = useTransition();

  // Selected stop keys (the user picks WHOLE stops, not individual items —
  // matches legacy "select N rows from grouped table"). Defaults to empty.
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [driverCode,    setDriverCode]    = useState<string>("");
  const [endTimeHours,  setEndTimeHours]  = useState<17 | 24 | 30>(17);
  const [carrierFilter, setCarrierFilter] = useState<string>("");
  // Legacy list controls (DataTable "แสดง N รายการ" + "ค้นหา") — presentation
  // only; they narrow which rows render, never the submit payload.
  const [pageLength, setPageLength] = useState<number>(100);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [exporting, setExporting] = useState(false);

  // Aggregates for the selection summary.
  const summary = useMemo(() => {
    let stops = 0;
    let items = 0;
    let boxes = 0;
    let weight = 0;
    let volume = 0;
    const fwdIds: number[] = [];
    for (const g of groups) {
      if (selectedKeys.has(g.key)) {
        stops += 1;
        items += g.items.length;
        boxes += g.totalBoxes;
        weight += g.totalWeight;
        volume += g.totalVolume;
        fwdIds.push(...g.forwarderIds);
      }
    }
    return { stops, items, boxes, weight, volume, fwdIds };
  }, [groups, selectedKeys]);

  // Sort the stops by ลำดับส่ง (district route order) — closest→farthest — so the
  // list reads like the driver's actual run (legacy sorts the add-table the same way).
  const sortedGroups = useMemo(
    () =>
      [...groups].sort(
        (a, b) => routeOrderOf(a.address.district) - routeOrderOf(b.address.district),
      ),
    [groups],
  );

  // ขนส่ง filter — distinct carrier labels + count, biggest first (for the chip row).
  const carriers = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of groups) m.set(g.shipByLabel, (m.get(g.shipByLabel) ?? 0) + 1);
    return [...m.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }, [groups]);

  // The route-sorted list, narrowed to the picked carrier + the ค้นหา search
  // (legacy DataTable searches across every visible cell: recipient · code ·
  // carrier · tracking# · address). This is the FULL filtered set.
  const filteredGroups = useMemo(() => {
    let list = carrierFilter
      ? sortedGroups.filter((g) => g.shipByLabel === carrierFilter)
      : sortedGroups;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((g) => {
        const hay = [
          g.recipientName, g.customerName, g.userid, g.shipByLabel,
          g.address.no, g.address.subDistrict, g.address.district,
          g.address.province, g.address.zipCode, g.address.tel,
          ...g.items.map((i) => `${i.fidorco} ${i.ftrackingchn} ${i.userid} ${i.fpallet}`),
        ].join(" ").toLowerCase();
        return hay.includes(q);
      });
    }
    return list;
  }, [sortedGroups, carrierFilter, searchQuery]);

  // The current page slice ("แสดง N รายการ" length · legacy pagination).
  const totalFiltered = filteredGroups.length;
  const pageCount = Math.max(1, Math.ceil(totalFiltered / pageLength));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageLength;
  const visibleGroups = useMemo(
    () => filteredGroups.slice(pageStart, pageStart + pageLength),
    [filteredGroups, pageStart, pageLength],
  );

  function toggleStop(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function selectAll() {
    // Select the whole filtered set (respects the ขนส่ง filter + ค้นหา · across
    // every page — legacy "เลือกทั้งหมด" ticks all matching rows, not just the
    // current page slice).
    setSelectedKeys(new Set(filteredGroups.map((g) => g.key)));
  }
  function clearAll() {
    setSelectedKeys(new Set());
  }

  // Export the currently-listed external-courier deliveries (Flash carrier or
  // all-external, whatever the filter shows) as the Flash "Import ข้อมูลผู้รับ"
  // CSV → upload to the Flash web back-office → Flash picks up at the โกดัง.
  // EXPORT-ONLY: no mutation; the action re-reads tb_forwarder by id.
  async function handleExportFlash() {
    const exportIds = filteredGroups.flatMap((g) => g.forwarderIds);
    if (exportIds.length === 0) {
      void alert("ไม่มีรายการให้ส่งออก");
      return;
    }
    setExporting(true);
    try {
      const res = await exportFlashPickupCsv({ forwarderIds: exportIds });
      if (!res.rowCount) {
        void alert("ไม่พบข้อมูลสำหรับ export");
        return;
      }
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `flash-นัดรับ-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (res.truncated) {
        void alert("ส่งออกได้สูงสุด 500 แถว — กรองรายการให้แคบลงเพื่อให้ครบ");
      }
    } catch (e) {
      console.error("[handleExportFlash] failed:", e);
      void alert("ส่งออกไฟล์ Flash ไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setExporting(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Legacy guard (forwarder-driver.php L1206 `#addFrom` click handler): if
    // NOTHING is ticked, refuse + POP UP "กรุณาเลือกรายการ" (legacy Swal error →
    // our centered useConfirmDialogs.alert). We keep the submit button CLICKABLE
    // with 0 ticked so this prompt actually fires — a disabled button would
    // silently swallow the guard (the 2026-07-01 bug).
    if (summary.stops === 0) {
      void alert("กรุณาเลือกรายการ");
      return;
    }
    if (!driverCode) {
      void alert("กรุณาเลือกพนักงานขับรถ");
      return;
    }
    startTransition(async () => {
      const res = await createDriverBatch({
        forwarderIds:     summary.fwdIds,
        driverMemberCode: driverCode,
        endTimeHours,
        stopCount:        summary.stops,
      });
      if (res.ok && res.data) {
        router.push(`/admin/drivers/${res.data.batchId}`);
      } else if (!res.ok) {
        // Server-side failure — surface it in the same centered popup.
        void alert(res.error);
      }
    });
  }

  const anySelected = summary.stops > 0;

  // ระบบแนะนำ — the legacy footer's vehicle recommendation, derived LIVE from the
  // ticked selection's total weight (kg) + volume (CBM). Faithful port of call.php.
  const recommendedVehicle = recommendVehicle(summary.weight, summary.volume, anySelected);

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Centered popup host (legacy Swal replacement) — 0-select guard etc. */}
      {dialogs}

      {/* ── Legacy PCS list controls: "แสดง N รายการ" (left) + "ค้นหา" (right) ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-1.5 text-muted">
          <span>แสดง</span>
          <select
            value={pageLength}
            onChange={(e) => { setPageLength(Number(e.target.value)); setPage(1); }}
            className="rounded border border-border bg-white px-2 py-1 text-sm"
            aria-label="จำนวนรายการต่อหน้า"
          >
            {[25, 50, 100, 250, 500].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <span>รายการ</span>
        </div>
        <div className="flex items-center gap-1.5">
          <label htmlFor="stop-search" className="text-muted">ค้นหา:</label>
          <input
            id="stop-search"
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            placeholder="ชื่อ / รหัสลูกค้า / แทรคกิ้ง / ที่อยู่"
            className="rounded border border-border bg-white px-2.5 py-1 text-sm min-w-[200px]"
          />
          <span className="text-muted text-xs">·</span>
          <button type="button" onClick={selectAll} className="text-xs text-primary-600 hover:underline">
            เลือกทั้งหมด
          </button>
          <button type="button" onClick={clearAll} className="text-xs text-primary-600 hover:underline">
            ล้างการเลือก
          </button>
        </div>
      </div>

      {/* ขนส่ง filter chips — Express tab only (มอบคนขับ = Pacred-only, no filter) */}
      {showCarrierFilter && carriers.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-muted mr-0.5">🚚 ขนส่ง:</span>
          <button
            type="button"
            onClick={() => { setCarrierFilter(""); setPage(1); }}
            className={`rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
              !carrierFilter ? "bg-primary-600 text-white border-primary-600" : "bg-white text-foreground border-border hover:bg-surface-alt"
            }`}
          >
            ทั้งหมด ({groups.length})
          </button>
          {carriers.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => { setCarrierFilter(c.label); setPage(1); }}
              className={`rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
                carrierFilter === c.label ? "bg-primary-600 text-white border-primary-600" : "bg-white text-foreground border-border hover:bg-surface-alt"
              }`}
            >
              {c.label} ({c.count})
            </button>
          ))}
        </div>
      )}

      {/* ส่งออกไฟล์ Flash (นัดรับ) — Express tab only. Exports the currently-listed
          external-courier deliveries as the Flash "Import ข้อมูลผู้รับ" CSV. */}
      {showCarrierFilter && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportFlash}
            disabled={exporting || filteredGroups.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-sm hover:bg-surface-alt disabled:opacity-40 shrink-0"
          >
            {exporting ? "⏳ กำลังส่งออก…" : "📄 ส่งออกไฟล์ Flash (นัดรับ)"}
          </button>
          <p className="text-xs text-muted">
            ดาวน์โหลด → อัพโหลดเข้าเวป Flash (Import ข้อมูลผู้รับ) → Flash มารับที่โกดัง
          </p>
        </div>
      )}

      {/* ── The dense legacy PCS table — ONE ROW per delivery group ──
          Columns (legacy forwarder-driver.php?page=add): [☑] · จำนวน · บริษัทขนส่ง ·
          เลขแทรคกิ้ง (nested sub-table) · ลำดับส่ง · ที่อยู่. */}
      <div className="overflow-x-auto scrollbar-x-visible rounded border border-border bg-white">
        {/* table-bordered — full gridlines (เส้นตัดทุกช่อง แนวตั้ง+แนวนอน) like legacy
            forwarder-driver.php add-page. Child combinators keep the rule scoped to
            THIS table's cells (the nested per-tracking table gets its own below). */}
        <table className="w-full text-sm border-collapse min-w-[1100px] [&>thead>tr>th]:border [&>thead>tr>th]:border-[#dcdfe4] [&>tbody>tr>td]:border [&>tbody>tr>td]:border-[#dcdfe4]">
          <thead>
            <tr className="bg-surface-alt/60 text-left text-[13px] font-bold text-[#6b6f82]">
              <th className="px-2 py-2 w-10 text-center">
                <input
                  type="checkbox"
                  checked={filteredGroups.length > 0 && filteredGroups.every((g) => selectedKeys.has(g.key))}
                  onChange={() => {
                    const allOn = filteredGroups.length > 0 && filteredGroups.every((g) => selectedKeys.has(g.key));
                    if (allOn) clearAll(); else selectAll();
                  }}
                  className="h-4 w-4 rounded border-border text-primary-600 focus:ring-primary-500 align-middle"
                  aria-label="เลือกทั้งหมด"
                />
              </th>
              <th className="px-3 py-2 w-20 text-center">จำนวน</th>
              <th className="px-3 py-2 w-40">บริษัทขนส่ง</th>
              <th className="px-3 py-2">เลขแทรคกิ้ง</th>
              <th className="px-3 py-2 w-20 text-center">ลำดับส่ง</th>
              <th className="px-3 py-2 w-[26rem]">ที่อยู่</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-muted">
                  ไม่มีรายการรอมอบหมาย — ทุกอย่างถูกมอบหมายไปแล้ว
                </td>
              </tr>
            ) : visibleGroups.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-muted">
                  {searchQuery
                    ? <>ไม่พบรายการที่ตรงกับ &quot;{searchQuery}&quot;</>
                    : <>ไม่มีจุดส่งสำหรับขนส่ง &quot;{carrierFilter}&quot; — เลือกขนส่งอื่น หรือ &quot;ทั้งหมด&quot;</>}
                </td>
              </tr>
            ) : (
              visibleGroups.map((g, gi) => {
                const isSelected = selectedKeys.has(g.key);
                const order = routeOrderOf(g.address.district);
                const zebra = gi % 2 === 0 ? "bg-white" : "bg-surface-alt/30";
                return (
                  <tr
                    key={g.key}
                    onClick={() => toggleStop(g.key)}
                    className={`cursor-pointer border-b border-border align-top ${
                      isSelected ? "bg-primary-50/60" : `${zebra} hover:bg-primary-50/30`
                    }`}
                  >
                    {/* [☑] checkbox */}
                    <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleStop(g.key)}
                        className="h-4 w-4 rounded border-border text-primary-600 focus:ring-primary-500"
                        aria-label={`เลือกจุดส่งของ ${g.recipientName}`}
                      />
                    </td>

                    {/* จำนวน — tracking-row count for this stop (legacy "N รายการ") */}
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      <div className="text-sm font-semibold text-foreground tabular-nums">{g.items.length} รายการ</div>
                    </td>

                    {/* บริษัทขนส่ง — plain carrier label (legacy "PCS เหมาๆ" · no pill,
                        no customer name/code: those live in the nested รหัสสมาชิก + the
                        ที่อยู่ recipient name, matching the legacy add-page). */}
                    <td className="px-3 py-2 text-sm text-foreground">
                      {g.shipByLabel}
                    </td>

                    {/* เลขแทรคกิ้ง — the nested per-tracking sub-table (legacy inner
                        table: # / เลขออเดอร์ / รหัสสมาชิก / เลขแทรคกิ้ง+location /
                        กล่อง / น้ำหนัก / ปริมาตร → รวม row) */}
                    <td className="p-0 align-top" onClick={(e) => e.stopPropagation()}>
                      <table className="w-full text-xs border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-[#dcdfe4] [&>tbody>tr>td]:border [&>tbody>tr>td]:border-[#dcdfe4]">
                        <thead>
                          <tr className="bg-surface-alt/40 text-left text-[11px] font-bold text-[#6b6f82]">
                            <th className="px-1.5 py-1 w-8">#</th>
                            <th className="px-1.5 py-1">เลขออเดอร์</th>
                            <th className="px-1.5 py-1">รหัสสมาชิก</th>
                            <th className="px-1.5 py-1">เลขแทรคกิ้ง</th>
                            <th className="px-1.5 py-1 text-right">กล่อง</th>
                            <th className="px-1.5 py-1 text-right">น้ำหนัก</th>
                            <th className="px-1.5 py-1 text-right">ปริมาตร</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.items.map((it, idx) => (
                            <tr key={it.id}>
                              <td className="px-1.5 py-1 text-muted tabular-nums">{idx + 1}</td>
                              <td className="px-1.5 py-1">
                                <Link
                                  href={`/admin/forwarders/${it.id}`}
                                  className="font-mono text-[#1e9ff2] hover:underline"
                                  target="_blank"
                                >
                                  {it.fidorco}
                                </Link>
                              </td>
                              <td className="px-1.5 py-1 font-mono text-[11px]">{it.userid}</td>
                              <td className="px-1.5 py-1">
                                <div className="font-medium break-all">{it.ftrackingchn}</div>
                                {it.fpallet && (
                                  <div className="text-[11px] text-muted">location : {it.fpallet}</div>
                                )}
                                {it.fnote && (
                                  <div className="mt-0.5 inline-block text-[11px] bg-amber-50 text-amber-800 border border-amber-200 rounded px-1 py-0.5">
                                    📝 {it.fnote}
                                  </div>
                                )}
                              </td>
                              <td className="px-1.5 py-1 text-right tabular-nums">{it.famount}</td>
                              <td className="px-1.5 py-1 text-right tabular-nums">{it.fweight.toFixed(2)}</td>
                              <td className="px-1.5 py-1 text-right tabular-nums">{it.fvolume.toFixed(3)}</td>
                            </tr>
                          ))}
                          {/* รวม summary row — legacy PINK (alert-danger · #f5aab0/#960014),
                              matches forwarder-driver.php add-page (owner 2026-07-16) */}
                          <tr className="bg-[#f5aab0] font-semibold text-[#7a0012]">
                            <td colSpan={4} className="px-1.5 py-1 text-right">รวม</td>
                            <td className="px-1.5 py-1 text-right tabular-nums">{g.totalBoxes}</td>
                            <td className="px-1.5 py-1 text-right tabular-nums">{g.totalWeight.toFixed(2)}</td>
                            <td className="px-1.5 py-1 text-right tabular-nums">{g.totalVolume.toFixed(3)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </td>

                    {/* ลำดับส่ง — district route order (legacy $arrPositF index) ·
                        plain number like the legacy add-page (was an orange box). */}
                    <td className="px-3 py-2 text-center">
                      <span
                        title="ลำดับเส้นทางวิ่งรถ — เขตใกล้โกดัง = เลขน้อย · ไกล = เลขมาก"
                        className="text-base font-bold text-foreground tabular-nums"
                      >
                        {order}
                      </span>
                    </td>

                    {/* ที่อยู่ — legacy add-page format: leads with the recipient name,
                        full "ตำบล/แขวง … อำเภอ/เขต [highlight] … จังหวัด …" wording, โทร
                        inline at the end. */}
                    <td className="px-3 py-2 text-sm">
                      {g.addressMissing ? (
                        <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-1">
                          ⚠️ ยังไม่มีที่อยู่จัดส่ง — เซลกรอกเพิ่มที่หน้ารายการนำเข้า
                        </span>
                      ) : (
                        <span className="text-foreground/90 leading-relaxed">
                          <b className="font-semibold">คุณ{g.recipientName}</b>{" "}
                          {g.address.no}
                          {g.address.subDistrict ? <> ตำบล/แขวง {g.address.subDistrict}</> : null}{" "}
                          {g.address.district ? <>อำเภอ/เขต <span className="bg-[#ff9149] px-1 rounded text-white font-medium">{g.address.district}</span>{" "}</> : null}
                          {g.address.province ? <>จังหวัด {g.address.province} </> : null}{g.address.zipCode}
                          {g.address.tel && g.address.tel !== "-" && (
                            <> โทร. {g.address.tel}</>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Legacy footer — pagination "แสดง 1 ถึง N จาก M รายการ" + prev/next ── */}
      {totalFiltered > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <div>
            แสดง {(pageStart + 1).toLocaleString("th-TH")} ถึง{" "}
            {Math.min(pageStart + pageLength, totalFiltered).toLocaleString("th-TH")} จาก{" "}
            {totalFiltered.toLocaleString("th-TH")} รายการ
            {carrierFilter || searchQuery ? <> (กรองจากทั้งหมด {groups.length.toLocaleString("th-TH")})</> : null}
          </div>
          {pageCount > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="rounded border border-border bg-white px-2.5 py-1 disabled:opacity-40 hover:bg-surface-alt"
              >
                ก่อนหน้า
              </button>
              <span className="px-1.5 tabular-nums">{currentPage} / {pageCount}</span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={currentPage >= pageCount}
                className="rounded border border-border bg-white px-2.5 py-1 disabled:opacity-40 hover:bg-surface-alt"
              >
                ถัดไป
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Footer action bar — legacy PCS `.m-driver-footer` (forwarder-driver.php
          L1032: a `btn-group` of `btn-color-main round` pills pinned
          `position: fixed; bottom: 20px; left: 70px`). We render a COMPACT COLORED
          (brand red) bar pinned bottom-LEFT: the truck action button + the
          driver/endtime selectors + the running หนัก / ปริมาตร / ระบบแนะนำ pills all
          inline in ONE slim row — NOT a tall gray panel. 2026-07-01 เอาแบบ PCS. */}
      <div className="sticky bottom-3 z-20 flex justify-start">
        <div className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border border-primary-700/40 bg-primary-600 px-2.5 py-2 text-white shadow-lg ring-1 ring-black/5">
          {/* Submit — the legacy "เลือกคนขับรถ" truck pill. Deliberately NOT disabled
              by the selection: clicking with 0 ticked must fire the legacy
              "กรุณาเลือกรายการ" POPUP (handleSubmit → alert) — a disabled button
              would swallow it. Only disabled while a create is in-flight. */}
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-4 py-2 text-sm font-bold text-primary-700 shadow-sm hover:bg-white disabled:opacity-60 disabled:cursor-not-allowed min-h-[40px]"
          >
            <Truck className="h-4 w-4" />
            {pending ? "กำลังสร้าง..." : "เลือกคนขับรถ"}
          </button>

          {/* คนขับ + เวลา selectors — inline in the colored bar (legacy bottom-left).
              Disabled until ≥1 row is ticked (the whole bar is unusable at 0). */}
          <select
            id="driver"
            aria-label="คนขับรถ"
            value={driverCode}
            onChange={(e) => setDriverCode(e.target.value)}
            disabled={pending || drivers.length === 0 || !anySelected}
            className="rounded-full border-0 bg-white/95 px-3 py-2 text-sm text-foreground min-h-[40px] max-w-[200px] disabled:opacity-60 disabled:cursor-not-allowed"
            title={!anySelected ? "เลือกรายการที่จะส่งก่อน แล้วจึงเลือกคนขับ" : undefined}
          >
            <option value="">— เลือกพนักงานขับรถ —</option>
            {drivers.map((d) => (
              <option key={d.member_code} value={d.member_code}>{d.display}</option>
            ))}
          </select>
          <select
            id="endtime"
            aria-label="ครบอายุมอบหมายงาน"
            value={endTimeHours}
            onChange={(e) => setEndTimeHours(Number(e.target.value) as 17 | 24 | 30)}
            disabled={pending || !anySelected}
            className="rounded-full border-0 bg-white/95 px-3 py-2 text-sm text-foreground min-h-[40px] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <option value={17}>17 ชั่วโมง</option>
            <option value={24}>24 ชั่วโมง</option>
            <option value={30}>30 ชั่วโมง</option>
          </select>

          {/* Running totals — legacy pills (หนัก / ปริมาตร / ระบบแนะนำ · call.php),
              inline in the colored bar. */}
          <span className="inline-flex items-center rounded-full bg-primary-700/40 px-3 py-1.5 text-xs font-medium whitespace-nowrap">
            เลือก <b className="mx-1 tabular-nums">{summary.stops}</b> จุด
          </span>
          <span className="inline-flex items-center rounded-full bg-primary-700/40 px-3 py-1.5 text-xs font-medium whitespace-nowrap">
            หนัก <b className="mx-1 tabular-nums">{summary.weight.toFixed(2)}</b> kg.
          </span>
          <span className="inline-flex items-center rounded-full bg-primary-700/40 px-3 py-1.5 text-xs font-medium whitespace-nowrap">
            ปริมาตร <b className="mx-1 tabular-nums">{summary.volume.toFixed(3)}</b> CBM
          </span>
          <span
            title="รถที่ระบบแนะนำจากน้ำหนักรวม + ปริมาตรรวมของจุดที่เลือก (กระบะ ≤1800kg/6CBM · 6ล้อเล็ก ≤3500/12 · 6ล้อใหญ่ ≤5000/30)"
            className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap ${
              !anySelected
                ? "bg-white/25 text-white/90"
                : recommendedVehicle === "มากกว่ารถที่กำหนด"
                  ? "bg-amber-300 text-amber-950"
                  : "bg-white text-primary-700"
            }`}
          >
            ระบบแนะนำ : {recommendedVehicle}
          </span>
        </div>
      </div>

      {drivers.length === 0 && (
        <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1.5 rounded">
          ⚠️ ยังไม่มีคนขับในระบบ — เพิ่มก่อนที่{" "}
          <Link href="/admin/admins/new" className="underline">/admin/admins/new</Link> (role = driver)
        </div>
      )}
    </form>
  );
}
