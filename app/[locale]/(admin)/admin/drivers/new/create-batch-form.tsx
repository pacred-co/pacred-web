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

export function CreateBatchForm({
  groups,
  drivers,
}: {
  groups: Stop[];
  drivers: DriverOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // Selected stop keys (the user picks WHOLE stops, not individual items —
  // matches legacy "select N rows from grouped table"). Defaults to empty.
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [driverCode,   setDriverCode]   = useState<string>("");
  const [endTimeHours, setEndTimeHours] = useState<17 | 24 | 30>(17);

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

  function toggleStop(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function selectAll() {
    setSelectedKeys(new Set(groups.map((g) => g.key)));
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
            2. เลือกจุดส่ง ({groups.length} กลุ่ม)
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

        {groups.length === 0 ? (
          <div className="p-8 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-muted/50 mb-3" />
            <p className="text-sm text-muted">ไม่มีรายการรอมอบหมาย — ทุกอย่างถูกมอบหมายไปแล้ว</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {groups.map((g) => {
              const isSelected = selectedKeys.has(g.key);
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
                    <div className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-semibold text-sm text-foreground">
                        คุณ{g.address.name} {g.address.lastName}
                      </span>
                      <span className="text-xs text-muted">
                        <MapPin className="inline h-3 w-3 mr-0.5" />
                        {g.address.no} ต.{g.address.subDistrict}{" "}
                        อ.<span className="bg-amber-100 px-1 rounded text-amber-800">{g.address.district}</span>{" "}
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
                        <tr className="border-t-2 border-primary-200 bg-primary-50/40 font-semibold">
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
      <section className="sticky bottom-0 rounded-2xl border border-border bg-white shadow-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <div className="font-semibold">
              เลือกแล้ว: {summary.stops} จุดส่ง · {summary.items} แทรคกิ้ง · {summary.boxes} กล่อง
            </div>
            <div className="text-xs text-muted">
              นน.รวม {summary.weight.toFixed(2)} kg · ปริมาตร {summary.volume.toFixed(3)} m³
            </div>
          </div>
          <button
            type="submit"
            disabled={pending || summary.stops === 0 || !driverCode}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
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
