"use client";

/**
 * Create-batch form — client island for the multi-select stop picker +
 * driver select + endtime select.
 *
 * Mirrors legacy forwarder-driver.php "page=add" tab + addFrom.php modal,
 * collapsed into one inline form (no modal — Pacred pattern).
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  MapPin, Phone, Package, AlertCircle,
} from "lucide-react";
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
  key:          string;
  fshipby:      string | null;
  shipByLabel:  string;
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

  // The route-sorted list, narrowed to the picked carrier (if any).
  const visibleGroups = useMemo(
    () => (carrierFilter ? sortedGroups.filter((g) => g.shipByLabel === carrierFilter) : sortedGroups),
    [sortedGroups, carrierFilter],
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
    // Select only what's currently visible (respects the ขนส่ง filter).
    setSelectedKeys(new Set(visibleGroups.map((g) => g.key)));
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

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Driver + endtime panel — sticky on desktop */}
      <section className="rounded-2xl border border-border bg-white shadow-sm p-4 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          1. เลือกคนขับและเวลาส่งงาน
        </h2>
        <div className="grid sm:grid-cols-2 gap-4 max-w-3xl">
          <div>
            <label htmlFor="driver" className="block text-xs font-medium text-muted mb-1">
              คนขับรถ <span className="text-rose-600">*</span>
            </label>
            <select
              id="driver"
              value={driverCode}
              onChange={(e) => setDriverCode(e.target.value)}
              disabled={pending || drivers.length === 0}
              className="w-full rounded-md border border-border bg-white px-3 py-2.5 text-base min-h-[44px]"
            >
              <option value="">— กรุณาเลือกพนักงานขับรถ —</option>
              {drivers.map((d) => (
                <option key={d.member_code} value={d.member_code}>{d.display}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="endtime" className="block text-xs font-medium text-muted mb-1">
              ครบอายุมอบหมายงาน (ชั่วโมง) <span className="text-rose-600">*</span>
            </label>
            <select
              id="endtime"
              value={endTimeHours}
              onChange={(e) => setEndTimeHours(Number(e.target.value) as 17 | 24 | 30)}
              disabled={pending}
              className="w-full rounded-md border border-border bg-white px-3 py-2.5 text-base min-h-[44px]"
            >
              <option value={17}>17 ชั่วโมง</option>
              <option value={24}>24 ชั่วโมง</option>
              <option value={30}>30 ชั่วโมง</option>
            </select>
          </div>
        </div>
      </section>

      {/* Stop selection */}
      <section className="rounded-2xl border border-border bg-white shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            2. เลือกจุดส่ง ({carrierFilter ? `${visibleGroups.length}/${groups.length}` : groups.length} กลุ่ม)
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-primary-600 hover:underline"
            >
              เลือกทั้งหมด
            </button>
            <span className="text-xs text-muted">·</span>
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-primary-600 hover:underline"
            >
              ล้างการเลือก
            </button>
          </div>
        </div>

        {/* ขนส่ง filter chips — กรองตามบริษัทขนส่ง (Flash / J&T / เฟิร์ส / …) · Express tab only */}
        {showCarrierFilter && carriers.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
            <span className="text-xs font-medium text-muted mr-0.5">🚚 ขนส่ง:</span>
            <button
              type="button"
              onClick={() => setCarrierFilter("")}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                !carrierFilter ? "bg-primary-600 text-white border-primary-600" : "bg-white text-foreground border-border hover:bg-surface-alt"
              }`}
            >
              ทั้งหมด ({groups.length})
            </button>
            {carriers.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => setCarrierFilter(c.label)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  carrierFilter === c.label ? "bg-primary-600 text-white border-primary-600" : "bg-white text-foreground border-border hover:bg-surface-alt"
                }`}
              >
                {c.label} ({c.count})
              </button>
            ))}
          </div>
        )}

        {groups.length === 0 ? (
          <div className="p-8 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-muted/50 mb-3" />
            <p className="text-sm text-muted">ไม่มีรายการรอมอบหมาย — ทุกอย่างถูกมอบหมายไปแล้ว</p>
          </div>
        ) : visibleGroups.length === 0 ? (
          <div className="p-8 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-muted/50 mb-3" />
            <p className="text-sm text-muted">ไม่มีจุดส่งสำหรับขนส่ง &quot;{carrierFilter}&quot; — เลือกขนส่งอื่น หรือ &quot;ทั้งหมด&quot;</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {visibleGroups.map((g) => {
              const isSelected = selectedKeys.has(g.key);
              const order = routeOrderOf(g.address.district);
              return (
                <li
                  key={g.key}
                  className={`overflow-hidden rounded-xl border transition-colors ${
                    isSelected ? "border-primary-400 ring-1 ring-primary-200 bg-primary-50/10" : "border-border bg-white"
                  }`}
                >
                  {/* Header bar — click anywhere to toggle the whole stop */}
                  <label className={`flex items-center gap-3 px-3 sm:px-4 py-2.5 cursor-pointer select-none border-b border-border ${
                    isSelected ? "bg-primary-50/50" : "bg-surface-alt/40 hover:bg-surface-alt/70"
                  }`}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleStop(g.key)}
                      className="h-5 w-5 rounded border-border text-primary-500 focus:ring-primary-500 flex-shrink-0"
                      aria-label={`เลือกจุดส่งคุณ ${g.address.name}`}
                    />
                    {/* ลำดับส่ง — district route order (legacy $arrPositF index · sorted) */}
                    <span
                      title="ลำดับเส้นทางวิ่งรถ — เขตใกล้โกดัง = เลขน้อย · ไกล = เลขมาก (รายการเรียงตามนี้ให้คนขับวิ่งเป็นเส้นเดียว)"
                      className="flex-shrink-0 inline-flex flex-col items-center justify-center rounded-lg bg-orange-100 border border-orange-300 px-2.5 py-1 leading-tight"
                    >
                      <span className="text-[11px] font-medium text-orange-700/90">ลำดับส่ง</span>
                      <span className="text-lg font-extrabold text-orange-700 tabular-nums">{order}</span>
                    </span>
                    <div className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-semibold text-sm text-foreground">
                        คุณ{g.address.name} {g.address.lastName}
                      </span>
                      <span className="text-xs text-foreground/80">
                        <MapPin className="inline h-3 w-3 mr-0.5 text-rose-500" />
                        {g.address.no} ต.{g.address.subDistrict}{" "}
                        อ.<span className="bg-amber-200 px-1 rounded text-amber-900 font-medium">{g.address.district}</span>{" "}
                        จ.{g.address.province} {g.address.zipCode}
                      </span>
                      {g.address.tel && g.address.tel !== "-" && (
                        <span className="text-xs text-muted">
                          <Phone className="inline h-3 w-3 mr-0.5" />
                          {g.address.tel}
                        </span>
                      )}
                    </div>
                    <span className="inline-flex items-center rounded-full bg-blue-100 border border-blue-200 text-blue-800 px-2 py-0.5 text-[11px] font-medium flex-shrink-0">
                      {g.shipByLabel}
                    </span>
                    <span className="text-xs text-muted whitespace-nowrap flex-shrink-0">
                      {g.items.length} แทรคกิ้ง · {g.totalBoxes} กล่อง
                    </span>
                  </label>

                  {/* Tracking table — gang'd out, full-width, fixed proportions */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm table-fixed min-w-[640px]">
                      <colgroup>
                        <col className="w-[14%]" />
                        <col className="w-[32%]" />
                        <col className="w-[13%]" />
                        <col className="w-[11%]" />
                        <col className="w-[14%]" />
                        <col className="w-[16%]" />
                      </colgroup>
                      <thead className="text-left text-[11px] uppercase tracking-wide text-muted bg-surface-alt/30">
                        <tr>
                          <th className="px-3 py-2 font-medium">F-no</th>
                          <th className="px-3 py-2 font-medium">แทรคกิ้ง</th>
                          <th className="px-3 py-2 font-medium">ลูกค้า</th>
                          <th className="px-3 py-2 font-medium text-right">กล่อง</th>
                          <th className="px-3 py-2 font-medium text-right">นน. (kg)</th>
                          <th className="px-3 py-2 font-medium text-right">ปริมาตร (m³)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.items.map((it) => (
                          <tr key={it.id} className="border-t border-border/60 odd:bg-white even:bg-surface-alt/20 hover:bg-primary-50/30">
                            <td className="px-3 py-2 align-top">
                              <Link
                                href={`/admin/forwarders/${it.fidorco}`}
                                className="font-mono text-primary-600 hover:underline"
                                target="_blank"
                              >
                                {it.fidorco}
                              </Link>
                            </td>
                            <td className="px-3 py-2 align-top">
                              <div className="font-medium break-all">{it.ftrackingchn}</div>
                              {it.fpallet && (
                                <div className="text-[11px] text-muted">loc: {it.fpallet}</div>
                              )}
                            </td>
                            <td className="px-3 py-2 align-top font-mono text-xs">{it.userid}</td>
                            <td className="px-3 py-2 align-top text-right tabular-nums">{it.famount}</td>
                            <td className="px-3 py-2 align-top text-right tabular-nums">{it.fweight.toFixed(2)}</td>
                            <td className="px-3 py-2 align-top text-right tabular-nums">{it.fvolume.toFixed(3)}</td>
                          </tr>
                        ))}
                        {g.items.some((i) => i.fnote) && (
                          <tr>
                            <td colSpan={6} className="px-3 py-1.5">
                              {g.items.filter((i) => i.fnote).map((i) => (
                                <div key={`note-${i.id}`} className="text-[11px] bg-amber-50 text-amber-800 border border-amber-200 rounded px-1.5 py-0.5 mb-0.5">
                                  📝 {i.fidorco}: {i.fnote}
                                </div>
                              ))}
                            </td>
                          </tr>
                        )}
                        <tr className="border-t-2 border-primary-400 bg-primary-100 text-primary-900 font-bold">
                          <td colSpan={3} className="px-3 py-2 text-right">รวม</td>
                          <td className="px-3 py-2 text-right tabular-nums">{g.totalBoxes}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{g.totalWeight.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{g.totalVolume.toFixed(3)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Summary + submit */}
      <section className="sticky bottom-0 rounded-2xl border border-rose-200 bg-gradient-to-r from-orange-50 to-rose-100 shadow-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <div className="font-bold text-base text-rose-900">
              เลือกแล้ว: {summary.stops} จุดส่ง · {summary.items} แทรคกิ้ง · {summary.boxes} กล่อง
            </div>
            <div className="text-xs text-rose-700/80">
              นน.รวม {summary.weight.toFixed(2)} kg · ปริมาตร {summary.volume.toFixed(3)} m³
            </div>
          </div>
          <button
            type="submit"
            disabled={pending || summary.stops === 0 || !driverCode}
            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-5 py-2.5 text-sm font-bold text-white shadow hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
          >
            <Package className="h-4 w-4" />
            {pending ? "กำลังสร้าง..." : "สร้างรอบจัดส่ง"}
          </button>
        </div>
        {err && (
          <div className="mt-3 text-sm bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2 rounded-md">
            ⚠️ {err}
          </div>
        )}
      </section>
    </form>
  );
}
