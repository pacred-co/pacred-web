"use client";

/**
 * Self-pickup mark-done form — client island for the "รับเองหน้าโกดัง" tab
 * (legacy forwarder-driver.php?page=add&q=pcs). Shows the fStatus=6 parcels
 * whose carrier is PCS (ลูกค้ารับเอง) / 2 (ไปรษณีย์) / 4 (J&T).
 *
 * ⚠️ GROUPED BY CUSTOMER (รหัสลูกค้า / userid) — NOT by address (ภูม 2026-06-29).
 * Self-pickup is collected AT the warehouse, so address-grouping lumped several
 * customers' parcels into one card with a single checkbox → staff could not tick
 * just one customer's parcels when that customer came to collect. Now each
 * CUSTOMER gets their OWN card, with their OWN per-parcel checkboxes, their OWN
 * photo input, and their OWN "บันทึกส่งสำเร็จ" submit — so the counter closes one
 * customer's pickup at a time, independently. This mirrors how the sibling
 * มอบหมายคนขับรถ tab groups each unit of work and gives it its own action.
 *
 * The close behavior + server action (markForwarderSelfPickupDelivered) are
 * UNCHANGED — each submit just passes that one customer's selected forwarder ids
 * (fstatus 6→7). Confirm-before-mutate (§0f) is awaited BEFORE startTransition
 * (the 2026-06-22 bug: `await confirm()` inside a transition never opens the
 * dialog → dead button).
 */

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  User, Phone, AlertCircle, Camera, CheckCircle2,
} from "lucide-react";
import { markForwarderSelfPickupDelivered } from "@/actions/admin/forwarder-self-pickup";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";

type PickupItem = {
  id:           number;
  fidorco:      string;
  ftrackingchn: string;
  famount:      number;
  fweight:      number;
  fvolume:      number;
  fpallet:      string;
  fnote:        string;
};

type PickupGroup = {
  key:          string;   // = userid
  userid:       string;
  customerName: string;
  customerTel:  string;
  shipByLabel:  string;
  items:        PickupItem[];
  forwarderIds: number[];
  totalBoxes:   number;
  totalWeight:  number;
  totalVolume:  number;
};

export function SelfPickupForm({ groups }: { groups: PickupGroup[] }) {
  const router = useRouter();
  const { confirm, alert, dialogs } = useConfirmDialogs();

  return (
    <div className="space-y-4">
      {dialogs}

      {/* Header strip */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          ลูกค้าที่มารับของเองที่โกดัง ({groups.length.toLocaleString("th-TH")} ราย)
        </h2>
        <p className="text-[11px] text-muted">
          แยกการ์ดตามลูกค้า · ปิดงานทีละลูกค้าได้อิสระ
        </p>
      </div>

      {groups.length === 0 ? (
        <section className="rounded-2xl border border-border bg-white shadow-sm p-8 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-muted/50 mb-3" />
          <p className="text-sm text-muted">ไม่มีรายการรับเองหน้าโกดัง — ทุกอย่างปิดงานแล้ว</p>
        </section>
      ) : (
        <ul className="space-y-4">
          {groups.map((g) => (
            <CustomerPickupCard
              key={g.key}
              group={g}
              confirm={confirm}
              alert={alert}
              onClosed={() => router.refresh()}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One CUSTOMER card — own per-parcel checkboxes, own photo, own submit.
 * Closing only ever passes THIS customer's selected forwarder ids to the
 * (unchanged) server action.
 */
function CustomerPickupCard({
  group,
  confirm,
  alert,
  onClosed,
}: {
  group: PickupGroup;
  confirm: (msg: string) => Promise<boolean>;
  alert: (msg: string) => Promise<boolean>;
  onClosed: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // Selected forwarder-item ids WITHIN this customer (start with all ticked —
  // the common case is "this customer collected everything").
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    () => new Set(group.items.map((i) => i.id)),
  );
  const [photo, setPhoto] = useState<File | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => {
    const ids: number[] = [];
    let boxes = 0;
    let weight = 0;
    for (const it of group.items) {
      if (selectedIds.has(it.id)) {
        ids.push(it.id);
        boxes += it.famount;
        weight += it.fweight;
      }
    }
    return { ids, count: ids.length, boxes, weight };
  }, [group.items, selectedIds]);

  const allSelected = selected.count === group.items.length && group.items.length > 0;

  function toggleItem(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(group.items.map((i) => i.id)));
  }

  // Confirm BEFORE the transition (the dialog must open synchronously from the
  // click handler — never inside startTransition).
  async function handleSubmit() {
    setErr(null);
    // Legacy guard (forwarder-driver.php L1206): refuse + prompt "กรุณาเลือกรายการ"
    // when nothing is ticked. The button stays CLICKABLE with 0 selected so this
    // prompt actually fires (a disabled button would swallow it) — same fix as
    // the มอบคนขับ tab. Here it's scoped to this customer's parcels.
    if (selected.count === 0) {
      setErr("กรุณาเลือกรายการพัสดุของลูกค้าคนนี้ก่อน");
      return;
    }
    const ok = await confirm(
      `ยืนยันปิดงาน "ส่งแล้ว" ของลูกค้า ${group.userid}` +
        (group.customerName && group.customerName !== group.userid ? ` (คุณ${group.customerName})` : "") +
        `\n${selected.count} พัสดุ · ${selected.boxes} กล่อง\n` +
        (photo ? "📷 จะแนบรูปหลักฐานการรับ/ส่ง" : "⚠️ ยังไม่ได้แนบรูป — ปิดงานได้แต่ควรถ่ายรูปหลักฐาน") +
        "\n\nสถานะจะเปลี่ยนเป็น \"ส่งแล้ว\" (7) และนำออกจากคิว",
    );
    if (!ok) return;

    const fd = new FormData();
    fd.set("forwarderIds", selected.ids.join(","));
    if (photo) fd.set("photo", photo);

    startTransition(async () => {
      const res = await markForwarderSelfPickupDelivered(fd);
      if (res.ok) {
        await alert(`ปิดงานสำเร็จ ${res.data?.closed ?? selected.count} รายการ ✓`);
        setPhoto(null);
        if (photoInputRef.current) photoInputRef.current.value = "";
        onClosed();
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <li className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
      {/* Customer header — lead with ชื่อลูกค้า + รหัสลูกค้า (the self-pickup person) */}
      <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 py-3 border-b border-border bg-surface-alt/40">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 flex-shrink-0">
          <User className="h-4 w-4" />
        </span>
        <div className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-semibold text-sm text-foreground">
            {group.customerName && group.customerName !== group.userid
              ? `คุณ${group.customerName}`
              : "ลูกค้า"}
          </span>
          <span className="inline-flex items-center rounded-md bg-primary-50 border border-primary-100 text-primary-700 px-1.5 py-0.5 text-[11px] font-mono font-semibold">
            {group.userid}
          </span>
          {group.customerTel && group.customerTel !== "-" && (
            <span className="text-xs text-muted">
              <Phone className="inline h-3 w-3 mr-0.5" />
              {group.customerTel}
            </span>
          )}
        </div>
        <span className="inline-flex items-center rounded-full bg-violet-100 border border-violet-200 text-violet-800 px-2 py-0.5 text-[11px] font-medium flex-shrink-0">
          {group.shipByLabel}
        </span>
        <span className="text-xs text-muted whitespace-nowrap flex-shrink-0">
          {group.items.length} แทรคกิ้ง · {group.totalBoxes} กล่อง
        </span>
      </div>

      {/* Per-parcel selection table — own checkbox column */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm table-fixed min-w-[600px]">
          <colgroup>
            <col className="w-[7%]" />
            <col className="w-[14%]" />
            <col className="w-[37%]" />
            <col className="w-[14%]" />
            <col className="w-[14%]" />
            <col className="w-[14%]" />
          </colgroup>
          <thead className="text-left text-[11px] uppercase tracking-wide text-muted bg-surface-alt/30">
            <tr>
              <th className="px-3 py-2 font-medium">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={pending}
                  className="h-5 w-5 rounded border-border text-emerald-600 focus:ring-emerald-500 align-middle"
                  aria-label={`เลือกพัสดุทั้งหมดของ ${group.userid}`}
                />
              </th>
              <th className="px-3 py-2 font-medium">F-no</th>
              <th className="px-3 py-2 font-medium">แทรคกิ้ง</th>
              <th className="px-3 py-2 font-medium">loc.</th>
              <th className="px-3 py-2 font-medium text-right">กล่อง</th>
              <th className="px-3 py-2 font-medium text-right">นน. (kg)</th>
            </tr>
          </thead>
          <tbody>
            {group.items.map((it) => {
              const checked = selectedIds.has(it.id);
              return (
                <tr
                  key={it.id}
                  className={`border-t border-border/60 ${
                    checked ? "bg-emerald-50/40" : "odd:bg-white even:bg-surface-alt/20"
                  } hover:bg-emerald-50/30`}
                >
                  <td className="px-3 py-2 align-top">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleItem(it.id)}
                      disabled={pending}
                      className="h-5 w-5 rounded border-border text-emerald-600 focus:ring-emerald-500"
                      aria-label={`เลือก ${it.fidorco}`}
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Link
                      href={`/admin/forwarders/${it.id}`}
                      className="font-mono text-primary-600 hover:underline"
                      target="_blank"
                    >
                      {it.fidorco}
                    </Link>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium break-all">{it.ftrackingchn}</div>
                    {it.fnote && (
                      <div className="text-[11px] bg-amber-50 text-amber-800 border border-amber-200 rounded px-1.5 py-0.5 mt-0.5 inline-block">
                        📝 {it.fnote}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-muted">{it.fpallet || "—"}</td>
                  <td className="px-3 py-2 align-top text-right tabular-nums">{it.famount}</td>
                  <td className="px-3 py-2 align-top text-right tabular-nums">{it.fweight.toFixed(2)}</td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-emerald-300 bg-emerald-100 text-emerald-900 font-bold">
              <td colSpan={4} className="px-3 py-2 text-right">รวมทั้งลูกค้า</td>
              <td className="px-3 py-2 text-right tabular-nums">{group.totalBoxes}</td>
              <td className="px-3 py-2 text-right tabular-nums">{group.totalWeight.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Per-customer photo + submit — closes ONLY this customer's selected parcels */}
      <div className="border-t border-emerald-200 bg-gradient-to-r from-emerald-50 to-green-100 p-3 sm:p-4 space-y-3">
        <div className="rounded-lg bg-white p-2.5 border border-emerald-100">
          <label htmlFor={`pickup-photo-${group.key}`} className="block text-xs font-medium text-muted mb-1">
            <Camera className="inline h-3.5 w-3.5 mr-1" />
            รูปหลักฐานการรับ/ส่ง (ถ้ามี · ไม่บังคับ)
          </label>
          <input
            id={`pickup-photo-${group.key}`}
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            disabled={pending}
            className="block w-full text-xs text-muted file:mr-3 file:rounded-md file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-primary-700 hover:file:bg-primary-100"
          />
          {photo && <p className="text-[11px] text-emerald-700 mt-1">📷 {photo.name}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <div className="font-bold text-base text-emerald-900">
              เลือกแล้ว: {selected.count} พัสดุ · {selected.boxes} กล่อง
            </div>
            <div className="text-xs text-emerald-700/80">
              ปิดงานเป็น &quot;ส่งแล้ว&quot; (7) — เฉพาะของลูกค้า {group.userid}
            </div>
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending || selected.count === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
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
      </div>
    </li>
  );
}
