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
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { createDriverBatch } from "@/actions/admin/driver-batches";

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

// ลำดับส่ง — faithful port of legacy `$arrPositF` (forwarder-driver.php L725): the
// BKK + ปริมณฑล districts laid out in DRIVING-ROUTE order (โกดัง สมุทรสาคร → ใกล้ → ไกล).
// A stop's ลำดับส่ง = its district's index here; the stop list is SORTED by it so the
// driver runs one efficient loop instead of zig-zagging. A district not in the list
// defaults to 69 (sorts to the end) — exactly like legacy `else echo '69'`.
const DISTRICT_ROUTE_ORDER: readonly string[] = [
  "หนองแขม", "บางแค", "ภาษีเจริญ", "ธนบุรี", "บางกอกใหญ่", "บางกอกน้อย", "คลองสาน", "สัมพันธวงศ์",
  "ป้อมปราบศัตรูพ่าย", "พระนคร", "สาทร", "ปทุมวัน", "ราชเทวี", "ดุสิต", "พญาไท", "ดินแดง", "ห้วยขวาง",
  "วัฒนา", "คลองเตย", "พระโขนง", "ยานนาวา", "บางคอแหลม", "บางรัก", "ทวีวัฒนา", "ตลิ่งชัน", "บางใหญ่",
  "ไทรน้อย", "บางบัวทอง", "เมืองนนทบุรี", "ปากเกร็ด", "บางกรวย", "จตุจักร", "บางพลัด", "บางซื่อ",
  "หลักสี่", "ดอนเมือง", "สายไหม", "บางเขน", "ลาดพร้าว", "วังทองหลาง", "สวนหลวง", "บางกะปิ", "สะพานสูง",
  "บึงกุ่ม", "คันนายาว", "มีนบุรี", "คลองสามวา", "บางบอน", "จอมทอง", "บางขุนเทียน", "ราษฎร์บูรณะ",
  "ทุ่งครุ", "พระประแดง", "พระสมุทรเจดีย์", "เมืองสมุทรปราการ", "บางนา", "ลาดกระบัง", "ประเวศ", "หนองจอก",
  "บางเสาธง", "บางบ่อ", "บางพลี", "เมืองปทุมธานี", "กระทุ่มแบน", "เมืองสมุทรสาคร", "พุทธมณฑล", "สามพราน",
];
const DISTRICT_ORDER_NOT_FOUND = 69; // legacy default
const routeOrderMap = new Map(DISTRICT_ROUTE_ORDER.map((d, i) => [d, i]));
function routeOrderOf(district: string | null | undefined): number {
  const d = (district ?? "").trim();
  return routeOrderMap.has(d) ? routeOrderMap.get(d)! : DISTRICT_ORDER_NOT_FOUND;
}

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
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (summary.stops === 0) {
      setErr("กรุณาเลือกอย่างน้อย 1 จุดส่ง");
      return;
    }
    if (!driverCode) {
      setErr("กรุณาเลือกคนขับ");
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
        setErr(res.error);
      }
    });
  }

  const anySelected = summary.stops > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
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

      {/* ── The dense legacy PCS table — ONE ROW per delivery group ──
          Columns (legacy forwarder-driver.php?page=add): [☑] · จำนวน · บริษัทขนส่ง ·
          เลขแทรคกิ้ง (nested sub-table) · ลำดับส่ง · ที่อยู่. */}
      <div className="overflow-x-auto scrollbar-x-visible rounded border border-border bg-white">
        <table className="w-full text-sm border-collapse min-w-[1100px]">
          <thead>
            <tr className="bg-surface-alt text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="border-b border-border px-2 py-2 w-10 text-center">
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
              <th className="border-b border-border px-3 py-2 w-20 text-center">จำนวน</th>
              <th className="border-b border-border px-3 py-2 w-40">บริษัทขนส่ง</th>
              <th className="border-b border-border px-3 py-2">เลขแทรคกิ้ง</th>
              <th className="border-b border-border px-3 py-2 w-20 text-center">ลำดับส่ง</th>
              <th className="border-b border-border px-3 py-2 w-[26rem]">ที่อยู่</th>
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

                    {/* จำนวน — box + tracking count for this stop */}
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      <div className="font-bold text-base text-foreground tabular-nums">{g.totalBoxes}</div>
                      <div className="text-[11px] text-muted">กล่อง</div>
                      <div className="text-[11px] text-muted">({g.items.length} แทรค)</div>
                    </td>

                    {/* บริษัทขนส่ง */}
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center rounded bg-blue-50 border border-blue-200 text-blue-800 px-1.5 py-0.5 text-[11px] font-medium">
                        {g.shipByLabel}
                      </span>
                      <div className="mt-1 text-xs font-medium text-foreground">คุณ{g.recipientName}</div>
                      <div className="text-[11px] font-mono text-primary-700">{g.userid}</div>
                    </td>

                    {/* เลขแทรคกิ้ง — the nested per-tracking sub-table (legacy inner
                        table: # / เลขออเดอร์ / รหัสสมาชิก / เลขแทรคกิ้ง+location /
                        กล่อง / น้ำหนัก / ปริมาตร → รวม row) */}
                    <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="text-left text-[11px] text-muted">
                            <th className="px-1.5 py-1 font-medium w-8">#</th>
                            <th className="px-1.5 py-1 font-medium">เลขออเดอร์</th>
                            <th className="px-1.5 py-1 font-medium">รหัสสมาชิก</th>
                            <th className="px-1.5 py-1 font-medium">เลขแทรคกิ้ง</th>
                            <th className="px-1.5 py-1 font-medium text-right">กล่อง</th>
                            <th className="px-1.5 py-1 font-medium text-right">น้ำหนัก</th>
                            <th className="px-1.5 py-1 font-medium text-right">ปริมาตร</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.items.map((it, idx) => (
                            <tr key={it.id} className="border-t border-border/50">
                              <td className="px-1.5 py-1 text-muted tabular-nums">{idx + 1}</td>
                              <td className="px-1.5 py-1">
                                <Link
                                  href={`/admin/forwarders/${it.id}`}
                                  className="font-mono text-primary-600 hover:underline"
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
                          {/* รวม summary row */}
                          <tr className="border-t border-border bg-surface-alt/60 font-semibold text-foreground">
                            <td colSpan={4} className="px-1.5 py-1 text-right">รวม</td>
                            <td className="px-1.5 py-1 text-right tabular-nums">{g.totalBoxes}</td>
                            <td className="px-1.5 py-1 text-right tabular-nums">{g.totalWeight.toFixed(2)}</td>
                            <td className="px-1.5 py-1 text-right tabular-nums">{g.totalVolume.toFixed(3)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </td>

                    {/* ลำดับส่ง — district route order (legacy $arrPositF index) */}
                    <td className="px-3 py-2 text-center">
                      <span
                        title="ลำดับเส้นทางวิ่งรถ — เขตใกล้โกดัง = เลขน้อย · ไกล = เลขมาก"
                        className="inline-flex items-center justify-center rounded bg-orange-100 border border-orange-300 px-2 py-1 text-base font-extrabold text-orange-700 tabular-nums"
                      >
                        {order}
                      </span>
                    </td>

                    {/* ที่อยู่ — full delivery address, อำเภอ highlighted (legacy rightmost) */}
                    <td className="px-3 py-2 text-sm">
                      {g.addressMissing ? (
                        <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-1">
                          ⚠️ ยังไม่มีที่อยู่จัดส่ง — เซลกรอกเพิ่มที่หน้ารายการนำเข้า
                        </span>
                      ) : (
                        <span className="text-foreground/90 leading-relaxed">
                          {g.address.no}
                          {g.address.subDistrict ? <> ต.{g.address.subDistrict}</> : null}{" "}
                          {g.address.district ? <>อ.<span className="bg-amber-200 px-1 rounded text-amber-900 font-medium">{g.address.district}</span>{" "}</> : null}
                          {g.address.province ? <>จ.{g.address.province} </> : null}{g.address.zipCode}
                        </span>
                      )}
                      {g.address.tel && g.address.tel !== "-" && (
                        <div className="mt-1 text-xs text-muted">โทร. {g.address.tel}</div>
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

      {/* ── Footer action bar — เลือกคนขับรถ + เวลา + running totals + submit ──
          (legacy: the "เลือกคนขับรถ" button + weight/volume totals at the bottom.) */}
      <div className="sticky bottom-0 rounded border border-border bg-surface-alt/95 backdrop-blur px-3 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
        <div className="flex flex-wrap items-end gap-3">
          {/* คนขับ + เวลา selectors */}
          <div className="min-w-[220px] flex-1">
            <label htmlFor="driver" className="block text-[11px] font-medium text-muted mb-1">
              คนขับรถ <span className="text-rose-600">*</span>
            </label>
            <select
              id="driver"
              value={driverCode}
              onChange={(e) => setDriverCode(e.target.value)}
              disabled={pending || drivers.length === 0}
              className="w-full rounded border border-border bg-white px-3 py-2 text-sm min-h-[40px]"
            >
              <option value="">— กรุณาเลือกพนักงานขับรถ —</option>
              {drivers.map((d) => (
                <option key={d.member_code} value={d.member_code}>{d.display}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[150px]">
            <label htmlFor="endtime" className="block text-[11px] font-medium text-muted mb-1">
              ครบอายุมอบหมายงาน <span className="text-rose-600">*</span>
            </label>
            <select
              id="endtime"
              value={endTimeHours}
              onChange={(e) => setEndTimeHours(Number(e.target.value) as 17 | 24 | 30)}
              disabled={pending}
              className="w-full rounded border border-border bg-white px-3 py-2 text-sm min-h-[40px]"
            >
              <option value={17}>17 ชั่วโมง</option>
              <option value={24}>24 ชั่วโมง</option>
              <option value={30}>30 ชั่วโมง</option>
            </select>
          </div>

          {/* Running totals (legacy footer: น้ำหนัก / ปริมาตร / ระบบแม่ป้า) */}
          <div className="text-xs text-foreground/80 leading-snug">
            <div>เลือกแล้ว : <b className="text-foreground tabular-nums">{summary.stops}</b> จุดส่ง · <b className="tabular-nums">{summary.items}</b> แทรคกิ้ง · <b className="tabular-nums">{summary.boxes}</b> กล่อง</div>
            <div>น้ำหนัก : <b className="tabular-nums">{summary.weight.toFixed(2)}</b> kg. · ปริมาตร : <b className="tabular-nums">{summary.volume.toFixed(3)}</b> CBM</div>
          </div>

          {/* Submit — the legacy "เลือกคนขับรถ / สร้างรายการ" button */}
          <button
            type="submit"
            disabled={pending || !anySelected || !driverCode}
            className="ml-auto inline-flex items-center gap-2 rounded bg-rose-600 px-5 py-2.5 text-sm font-bold text-white shadow hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
          >
            {pending ? "กำลังสร้าง..." : "เลือกคนขับรถและสร้างรายการ"}
          </button>
        </div>
        {(drivers.length === 0 || err) && (
          <div className="mt-2 space-y-1">
            {drivers.length === 0 && (
              <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1.5 rounded">
                ⚠️ ยังไม่มีคนขับในระบบ — เพิ่มก่อนที่{" "}
                <Link href="/admin/admins/new" className="underline">/admin/admins/new</Link> (role = driver)
              </div>
            )}
            {err && (
              <div className="text-sm bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2 rounded">
                ⚠️ {err}
              </div>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
