"use client";

/**
 * Self-pickup mark-done form — client island for the "รับเองหน้าโกดัง" tab
 * (legacy forwarder-driver.php?page=add&q=pcs). Shows the fStatus=6 parcels
 * whose carrier is PCS (ลูกค้ารับเอง) / 2 (ไปรษณีย์) / 4 (J&T), grouped by
 * customer-address, and lets the warehouse counter tick the ones handed off
 * + (optionally) attach a hand-off photo, then close them ส่งแล้ว (6→7) in
 * one click — NO driver / batch.
 *
 * Mirrors the stop-picker UX of create-batch-form.tsx (the มอบคนขับ tab) so
 * the two tabs feel identical; drops the driver/endtime panel, adds the photo
 * input + a confirm-before-mutate gate (§0f). The confirm is awaited BEFORE
 * startTransition (the 2026-06-22 bug: `await confirm()` inside a transition
 * never opens the dialog → dead button).
 */

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  MapPin, Phone, ChevronDown, ChevronUp, AlertCircle, Camera, CheckCircle2,
} from "lucide-react";
import { markForwarderSelfPickupDelivered } from "@/actions/admin/forwarder-self-pickup";
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

export function SelfPickupForm({ groups }: { groups: Stop[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { confirm, alert, dialogs } = useConfirmDialogs();
  const [err, setErr] = useState<string | null>(null);

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [expandedKey,  setExpandedKey]  = useState<string | null>(null);
  const [photo,        setPhoto]        = useState<File | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const summary = useMemo(() => {
    let stops = 0, items = 0, boxes = 0;
    const fwdIds: number[] = [];
    for (const g of groups) {
      if (selectedKeys.has(g.key)) {
        stops += 1;
        items += g.items.length;
        boxes += g.totalBoxes;
        fwdIds.push(...g.forwarderIds);
      }
    }
    return { stops, items, boxes, fwdIds };
  }, [groups, selectedKeys]);

  function toggleStop(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function selectAll() { setSelectedKeys(new Set(groups.map((g) => g.key))); }
  function clearAll()  { setSelectedKeys(new Set()); }

  // Confirm BEFORE the transition (the dialog must open synchronously from the
  // click handler — never inside startTransition).
  async function handleSubmit() {
    setErr(null);
    if (summary.stops === 0) {
      setErr("กรุณาเลือกอย่างน้อย 1 รายการ");
      return;
    }
    const ok = await confirm(
      `ยืนยันปิดงาน "ส่งแล้ว" ${summary.items} แทรคกิ้ง (${summary.boxes} กล่อง) จาก ${summary.stops} รายการ?\n` +
      (photo ? "📷 จะแนบรูปหลักฐานการรับ/ส่ง" : "⚠️ ยังไม่ได้แนบรูป — ปิดงานได้แต่ควรถ่ายรูปหลักฐาน") +
      "\n\nสถานะจะเปลี่ยนเป็น \"ส่งแล้ว\" (7) และนำออกจากคิว",
    );
    if (!ok) return;

    const fd = new FormData();
    fd.set("forwarderIds", summary.fwdIds.join(","));
    if (photo) fd.set("photo", photo);

    startTransition(async () => {
      const res = await markForwarderSelfPickupDelivered(fd);
      if (res.ok) {
        await alert(`ปิดงานสำเร็จ ${res.data?.closed ?? summary.items} รายการ ✓`);
        router.refresh();
        setSelectedKeys(new Set());
        setPhoto(null);
        if (photoInputRef.current) photoInputRef.current.value = "";
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <div className="space-y-5">
      {dialogs}

      {/* Stop selection */}
      <section className="rounded-2xl border border-border bg-white shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            เลือกรายการที่รับ/ส่งแล้ว ({groups.length} รายการ)
          </h2>
          {groups.length > 0 && (
            <div className="flex gap-2">
              <button type="button" onClick={selectAll} className="text-xs text-primary-600 hover:underline">
                เลือกทั้งหมด
              </button>
              <span className="text-xs text-muted">·</span>
              <button type="button" onClick={clearAll} className="text-xs text-primary-600 hover:underline">
                ล้างการเลือก
              </button>
            </div>
          )}
        </div>

        {groups.length === 0 ? (
          <div className="p-8 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-muted/50 mb-3" />
            <p className="text-sm text-muted">ไม่มีรายการรับเองหน้าโกดัง — ทุกอย่างปิดงานแล้ว</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {groups.map((g) => {
              const isSelected = selectedKeys.has(g.key);
              const isExpanded = expandedKey === g.key;
              return (
                <li
                  key={g.key}
                  className={`rounded-lg border ${
                    isSelected ? "border-emerald-300 bg-emerald-50/40" : "border-border bg-white"
                  }`}
                >
                  <div className="flex items-start gap-3 p-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleStop(g.key)}
                      className="mt-1 h-5 w-5 rounded border-border text-emerald-600 focus:ring-emerald-500"
                      aria-label={`เลือก ${g.address.name}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <p className="font-semibold text-sm">
                            คุณ{g.address.name} {g.address.lastName}
                          </p>
                          <p className="text-xs text-muted">
                            <MapPin className="inline h-3 w-3 mr-0.5" />
                            {g.address.no} ตำบล/แขวง {g.address.subDistrict}{" "}
                            อำเภอ/เขต {g.address.district}{" "}
                            จังหวัด {g.address.province} {g.address.zipCode}
                          </p>
                          {g.address.tel && g.address.tel !== "-" && (
                            <p className="text-xs text-muted mt-0.5">
                              <Phone className="inline h-3 w-3 mr-0.5" />
                              {g.address.tel}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 border border-violet-200 text-violet-800 px-2 py-0.5 text-[11px] font-medium">
                            {g.shipByLabel}
                          </span>
                          <span className="text-xs text-muted">
                            {g.items.length} แทรคกิ้ง · {g.totalBoxes} กล่อง
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setExpandedKey(isExpanded ? null : g.key)}
                        className="mt-2 text-xs text-primary-600 hover:underline inline-flex items-center gap-1"
                      >
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        {isExpanded ? "ซ่อนรายละเอียด" : "ดูแทรคกิ้งในรายการนี้"}
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="border-t border-border bg-surface-alt/30 p-3 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
                          <tr>
                            <th className="px-2 py-1">F-no</th>
                            <th className="px-2 py-1">แทรคกิ้ง</th>
                            <th className="px-2 py-1">ลูกค้า</th>
                            <th className="px-2 py-1 text-right">กล่อง</th>
                            <th className="px-2 py-1 text-right">นน.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.items.map((it) => (
                            <tr key={it.id} className="border-t border-border align-top">
                              <td className="px-2 py-1.5">
                                <Link
                                  href={`/admin/forwarders/${it.fidorco}`}
                                  className="font-mono text-primary-600 hover:underline"
                                  target="_blank"
                                >
                                  {it.fidorco}
                                </Link>
                              </td>
                              <td className="px-2 py-1.5">
                                <div>{it.ftrackingchn}</div>
                                {it.fpallet && (
                                  <div className="text-[11px] text-muted">loc: {it.fpallet}</div>
                                )}
                              </td>
                              <td className="px-2 py-1.5 font-mono">{it.userid}</td>
                              <td className="px-2 py-1.5 text-right">{it.famount}</td>
                              <td className="px-2 py-1.5 text-right">{it.fweight.toFixed(2)}</td>
                            </tr>
                          ))}
                          {g.items.some((i) => i.fnote) && (
                            <tr>
                              <td colSpan={5} className="px-2 py-1.5">
                                {g.items.filter((i) => i.fnote).map((i) => (
                                  <div key={`note-${i.id}`} className="text-[11px] bg-amber-50 text-amber-800 border border-amber-200 rounded px-1.5 py-0.5 mb-0.5">
                                    📝 {i.fidorco}: {i.fnote}
                                  </div>
                                ))}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Photo + submit */}
      <section className="sticky bottom-0 rounded-2xl border border-border bg-white shadow-lg p-4 space-y-3">
        <div>
          <label htmlFor="self-pickup-photo" className="block text-xs font-medium text-muted mb-1">
            <Camera className="inline h-3.5 w-3.5 mr-1" />
            รูปหลักฐานการรับ/ส่ง (ถ้ามี · ไม่บังคับ)
          </label>
          <input
            id="self-pickup-photo"
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            disabled={pending}
            className="block w-full text-xs text-muted file:mr-3 file:rounded-md file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-primary-700 hover:file:bg-primary-100"
          />
          {photo && (
            <p className="text-[11px] text-emerald-700 mt-1">📷 {photo.name}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <div className="font-semibold">
              เลือกแล้ว: {summary.stops} รายการ · {summary.items} แทรคกิ้ง · {summary.boxes} กล่อง
            </div>
            <div className="text-xs text-muted">
              ปิดงานเป็น &quot;ส่งแล้ว&quot; (7) — ไม่ต้องมอบคนขับ
            </div>
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending || summary.stops === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
          >
            <CheckCircle2 className="h-4 w-4" />
            {pending ? "กำลังบันทึก..." : "บันทึกส่งสำเร็จ"}
          </button>
        </div>
        {err && (
          <div className="text-sm bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2 rounded-md">
            ⚠️ {err}
          </div>
        )}
      </section>
    </div>
  );
}
