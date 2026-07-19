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
 * PRESENTATION (2026-07-03 · owner "รับเองหน้าโกดัง หน้าตายังไม่เหมือน PCS ... ให้เหมือน
 * ที่เราทำมาด้วย"): restyled to match the sibling "มอบงานให้คนขับ" tab (create-batch-form.tsx)
 * — the same DENSE PCS-style table (bg-surface-alt header · text-[11px] uppercase · zebra
 * rows · primary-50 select/hover · blue carrier pill · รวม summary row), the same "แสดง N
 * รายการ" + "ค้นหา" list controls, and the same COMPACT COLORED (emerald) pill action bar
 * per customer instead of the tall gray/green panel. The LOGIC (per-customer checkbox
 * selection · photo upload · markForwarderSelfPickupDelivered · confirm-before-mutate) is
 * UNCHANGED — only the markup matches the redesigned tabs.
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
import { Camera, CheckCircle2, Phone, ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";
import { markForwarderSelfPickupDelivered } from "@/actions/admin/forwarder-self-pickup";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";
import { compressImageFile } from "@/lib/image-compress";

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

  // Legacy list controls (DataTable "แสดง N รายการ" + "ค้นหา") — presentation
  // only; they narrow which customer cards render, never any submit payload.
  const [pageLength, setPageLength] = useState<number>(100);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [page, setPage] = useState<number>(1);

  // Search narrows across every visible cell of a customer's card (legacy
  // DataTable behavior): name · code · tel · carrier · order# · tracking# · loc.
  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => {
      const hay = [
        g.customerName, g.userid, g.customerTel, g.shipByLabel,
        ...g.items.map((i) => `${i.fidorco} ${i.ftrackingchn} ${i.fpallet} ${i.fnote}`),
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [groups, searchQuery]);

  // Current page slice ("แสดง N รายการ" length · legacy pagination).
  const totalFiltered = filteredGroups.length;
  const pageCount = Math.max(1, Math.ceil(totalFiltered / pageLength));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageLength;
  const visibleGroups = useMemo(
    () => filteredGroups.slice(pageStart, pageStart + pageLength),
    [filteredGroups, pageStart, pageLength],
  );

  return (
    <div className="space-y-3">
      {dialogs}

      {/* ── Legacy PCS list controls: "แสดง N รายการ" (left) + "ค้นหา" (right) ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-1.5 text-muted">
          <span>แสดง</span>
          <select
            value={pageLength}
            onChange={(e) => { setPageLength(Number(e.target.value)); setPage(1); }}
            className="rounded border border-border bg-white px-2 py-1 text-sm"
            aria-label="จำนวนลูกค้าต่อหน้า"
          >
            {[25, 50, 100, 250, 500].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <span>ราย</span>
        </div>
        <div className="flex items-center gap-1.5">
          <label htmlFor="pickup-search" className="text-muted">ค้นหา:</label>
          <input
            id="pickup-search"
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            placeholder="ชื่อ / รหัสลูกค้า / แทรคกิ้ง / เลขออเดอร์"
            className="rounded border border-border bg-white px-2.5 py-1 text-sm min-w-[200px]"
          />
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="overflow-x-auto scrollbar-x-visible rounded border border-border bg-white">
          <div className="px-3 py-10 text-center text-muted">
            ไม่มีรายการรับเองหน้าโกดัง — ทุกอย่างปิดงานแล้ว
          </div>
        </div>
      ) : visibleGroups.length === 0 ? (
        <div className="overflow-x-auto scrollbar-x-visible rounded border border-border bg-white">
          <div className="px-3 py-10 text-center text-muted">
            ไม่พบลูกค้าที่ตรงกับ &quot;{searchQuery}&quot;
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {visibleGroups.map((g) => (
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

      {/* ── Legacy footer — pagination "แสดง 1 ถึง N จาก M รายการ" + prev/next ── */}
      {totalFiltered > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <div>
            แสดง {(pageStart + 1).toLocaleString("th-TH")} ถึง{" "}
            {Math.min(pageStart + pageLength, totalFiltered).toLocaleString("th-TH")} จาก{" "}
            {totalFiltered.toLocaleString("th-TH")} ราย
            {searchQuery ? <> (กรองจากทั้งหมด {groups.length.toLocaleString("th-TH")})</> : null}
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
    </div>
  );
}

/**
 * One CUSTOMER card — own per-parcel checkboxes, own photo, own submit.
 * Closing only ever passes THIS customer's selected forwarder ids to the
 * (unchanged) server action.
 *
 * Restyled 2026-07-03 to the dense PCS look of the "มอบคนขับ" tab: a bordered
 * white card whose header is one legacy-style row (จำนวน · บริษัทขนส่ง+ลูกค้า) and
 * whose body is the dense per-tracking table (# / เลขออเดอร์ / รหัสสมาชิก /
 * เลขแทรคกิ้ง(+location) / กล่อง / น้ำหนัก / ปริมาตร → รวม), then a COMPACT COLORED
 * (emerald) action bar with the photo input + "บันทึกส่งสำเร็จ" pill.
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
    let volume = 0;
    for (const it of group.items) {
      if (selectedIds.has(it.id)) {
        ids.push(it.id);
        boxes += it.famount;
        weight += it.fweight;
        volume += it.fvolume;
      }
    }
    return { ids, count: ids.length, boxes, weight, volume };
  }, [group.items, selectedIds]);

  const allSelected = selected.count === group.items.length && group.items.length > 0;

  // Column sort (legacy DataTables ⇅) — click a header → asc → desc → off.
  // Display-only (selection keyed by item.id, unaffected by row order). WORKS.
  type SortKey = "order" | "tracking" | "box" | "weight" | "volume";
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  function toggleSort(key: SortKey) {
    setSort((prev) =>
      !prev || prev.key !== key ? { key, dir: "asc" } : prev.dir === "asc" ? { key, dir: "desc" } : null,
    );
  }
  const sortedItems = useMemo(() => {
    if (!sort) return group.items;
    const d = sort.dir === "asc" ? 1 : -1;
    return [...group.items].sort((a, b) => {
      switch (sort.key) {
        case "order":    return a.fidorco.localeCompare(b.fidorco, "th") * d;
        case "tracking": return a.ftrackingchn.localeCompare(b.ftrackingchn, "th") * d;
        case "box":      return (a.famount - b.famount) * d;
        case "weight":   return (a.fweight - b.fweight) * d;
        case "volume":   return (a.fvolume - b.fvolume) * d;
        default:         return 0;
      }
    });
  }, [group.items, sort]);

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
    // Legacy guard (forwarder-driver.php L1206): refuse + POP UP "กรุณาเลือกรายการ"
    // (legacy Swal → our centered useConfirmDialogs.alert) when nothing is ticked.
    // The button stays CLICKABLE with 0 selected so this prompt actually fires (a
    // disabled button would swallow it) — same fix as the มอบคนขับ tab. Here it's
    // scoped to this customer's parcels.
    if (selected.count === 0) {
      await alert("กรุณาเลือกรายการพัสดุของลูกค้าคนนี้ก่อน");
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
    <li className="overflow-hidden rounded border border-border bg-white shadow-sm">
      {/* Customer header — one dense legacy-style row: จำนวน · บริษัทขนส่ง + ลูกค้า
          (mirrors create-batch-form's จำนวน + บริษัทขนส่ง columns) */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface-alt px-3 py-2">
        {/* จำนวน — tracking-row count for this customer (legacy "N รายการ") */}
        <div className="text-center whitespace-nowrap">
          <div className="text-sm font-semibold text-foreground tabular-nums">{group.items.length} รายการ</div>
        </div>
        {/* บริษัทขนส่ง + ลูกค้า — plain carrier label (legacy · no pill), then the
            customer name + code (the card identity for customer self-pickup). */}
        <div className="min-w-0 flex-1">
          <span className="text-sm text-foreground">
            {group.shipByLabel}
          </span>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <span className="text-xs font-medium text-foreground">
              {group.customerName && group.customerName !== group.userid
                ? `คุณ${group.customerName}`
                : "ลูกค้า"}
            </span>
            <span className="text-[11px] font-mono text-primary-700">{group.userid}</span>
            {group.customerTel && group.customerTel !== "-" && (
              <span className="text-[11px] text-muted">
                <Phone className="inline h-3 w-3 mr-0.5" />
                {group.customerTel}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Per-parcel selection table — the dense per-tracking sub-table (legacy
          inner table: [☑] / # / เลขออเดอร์ / รหัสสมาชิก / เลขแทรคกิ้ง(+location) /
          กล่อง / น้ำหนัก / ปริมาตร → รวม row) — matched to create-batch-form. */}
      <div className="overflow-x-auto scrollbar-x-visible">
        {/* table-bordered + table-fixed % widths → เส้นตัดทุกช่อง + คอลัมน์ตรงกันทุกแถว
            (แก้เบี้ยว) · หัวคอลัมน์กดเรียงได้จริง (⇅ functional) · same as create-batch. */}
        <table className="w-full text-sm border-collapse table-fixed min-w-[720px] [&>thead>tr>th]:border [&>thead>tr>th]:border-[#dcdfe4] [&>tbody>tr>td]:border [&>tbody>tr>td]:border-[#dcdfe4]">
          <thead>
            <tr className="bg-surface-alt/60 text-left text-[11px] font-bold text-[#6b6f82]">
              <th className="px-2 py-2 w-[6%] text-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={pending}
                  className="h-4 w-4 rounded border-border text-emerald-600 focus:ring-emerald-500 align-middle"
                  aria-label={`เลือกพัสดุทั้งหมดของ ${group.userid}`}
                />
              </th>
              <th className="px-2 py-2 w-[5%] text-center">#</th>
              <th className="px-2 py-2 w-[22%]">
                <button type="button" onClick={() => toggleSort("order")} className="inline-flex items-center gap-1 hover:text-[#cc3333]">
                  เลขออเดอร์ <SortIcon state={sort?.key === "order" ? sort.dir : null} />
                </button>
              </th>
              <th className="px-2 py-2 w-[15%]">รหัสสมาชิก</th>
              <th className="px-2 py-2 w-[24%]">
                <button type="button" onClick={() => toggleSort("tracking")} className="inline-flex items-center gap-1 hover:text-[#cc3333]">
                  เลขแทรคกิ้ง <SortIcon state={sort?.key === "tracking" ? sort.dir : null} />
                </button>
              </th>
              <th className="px-2 py-2 w-[8%] text-right">
                <button type="button" onClick={() => toggleSort("box")} className="inline-flex items-center gap-1 hover:text-[#cc3333]">
                  กล่อง <SortIcon state={sort?.key === "box" ? sort.dir : null} />
                </button>
              </th>
              <th className="px-2 py-2 w-[10%] text-right">
                <button type="button" onClick={() => toggleSort("weight")} className="inline-flex items-center gap-1 hover:text-[#cc3333]">
                  น้ำหนัก <SortIcon state={sort?.key === "weight" ? sort.dir : null} />
                </button>
              </th>
              <th className="px-2 py-2 w-[10%] text-right">
                <button type="button" onClick={() => toggleSort("volume")} className="inline-flex items-center gap-1 hover:text-[#cc3333]">
                  ปริมาตร <SortIcon state={sort?.key === "volume" ? sort.dir : null} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((it, idx) => {
              const checked = selectedIds.has(it.id);
              const zebra = idx % 2 === 0 ? "bg-white" : "bg-surface-alt/30";
              return (
                <tr
                  key={it.id}
                  onClick={() => { if (!pending) toggleItem(it.id); }}
                  className={`cursor-pointer border-b border-border align-top ${
                    checked ? "bg-emerald-50/60" : `${zebra} hover:bg-emerald-50/30`
                  }`}
                >
                  {/* [☑] checkbox */}
                  <td className="px-2 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleItem(it.id)}
                      disabled={pending}
                      className="h-4 w-4 rounded border-border text-emerald-600 focus:ring-emerald-500"
                      aria-label={`เลือก ${it.fidorco}`}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center text-muted tabular-nums">{idx + 1}</td>
                  <td className="px-2 py-1.5">
                    <Link
                      href={`/admin/forwarders/${it.id}`}
                      className="font-mono text-primary-600 hover:underline break-all"
                      target="_blank"
                    >
                      {it.fidorco}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5 font-mono text-[11px] break-all">{group.userid}</td>
                  <td className="px-2 py-1.5">
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
                  <td className="px-2 py-1.5 text-right tabular-nums">{it.famount}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{it.fweight.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{it.fvolume.toFixed(3)}</td>
                </tr>
              );
            })}
            {/* รวม summary row — legacy PINK (alert-danger #f5aab0/#7a0012) */}
            <tr className="bg-[#f5aab0] font-semibold text-[#7a0012]">
              <td colSpan={5} className="px-2 py-1.5 text-right">รวมทั้งลูกค้า</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{group.totalBoxes}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{group.totalWeight.toFixed(2)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{group.totalVolume.toFixed(3)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Per-customer action bar — COMPACT COLORED (emerald) pill row mirroring
          create-batch-form's sticky footer. Photo input + "บันทึกส่งสำเร็จ" pill +
          the running เลือก / หนัก / ปริมาตร totals inline. Closes ONLY this
          customer's selected parcels. */}
      <div className="border-t border-border p-2.5">
        <div className="flex flex-wrap items-center gap-2 rounded-full border border-emerald-700/40 bg-emerald-600 px-2.5 py-2 text-white shadow-sm ring-1 ring-black/5">
          {/* Submit — kept CLICKABLE at 0-select so the "กรุณาเลือกรายการ" popup
              fires (a disabled button would swallow it). Only disabled in-flight. */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-4 py-2 text-sm font-bold text-emerald-700 shadow-sm hover:bg-white disabled:opacity-60 disabled:cursor-not-allowed min-h-[40px]"
          >
            <CheckCircle2 className="h-4 w-4" />
            {pending ? "กำลังบันทึก..." : "บันทึกส่งสำเร็จ"}
          </button>

          {/* รูปหลักฐาน — inline in the colored bar (photo input on white pill) */}
          <label
            htmlFor={`pickup-photo-${group.key}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-emerald-800 cursor-pointer hover:bg-white min-h-[36px]"
            title="รูปหลักฐานการรับ/ส่ง (ถ้ามี · ไม่บังคับ)"
          >
            <Camera className="h-3.5 w-3.5" />
            {photo ? "เปลี่ยนรูป" : "แนบรูป (ถ้ามี)"}
            <input
              id={`pickup-photo-${group.key}`}
              ref={photoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) { setPhoto(null); return; }
                // Compress in-browser (fails soft → original) so a large phone
                // JPEG can't exceed the Server-Action bodySizeLimit → the
                // "An unexpected response was received from the server" error.
                const compact = await compressImageFile(f, { maxDim: 1600, quality: 0.82 }).catch(() => f);
                setPhoto(compact);
              }}
              disabled={pending}
              className="sr-only"
            />
          </label>
          {photo && (
            <span className="inline-flex items-center rounded-full bg-emerald-700/40 px-3 py-1.5 text-[11px] font-medium whitespace-nowrap max-w-[180px] truncate" title={photo.name}>
              📷 {photo.name}
            </span>
          )}

          {/* Running totals — pills inline in the colored bar */}
          <span className="inline-flex items-center rounded-full bg-emerald-700/40 px-3 py-1.5 text-xs font-medium whitespace-nowrap">
            เลือก <b className="mx-1 tabular-nums">{selected.count}</b> พัสดุ · <b className="mx-1 tabular-nums">{selected.boxes}</b> กล่อง
          </span>
          <span className="inline-flex items-center rounded-full bg-emerald-700/40 px-3 py-1.5 text-xs font-medium whitespace-nowrap">
            หนัก <b className="mx-1 tabular-nums">{selected.weight.toFixed(2)}</b> kg.
          </span>
          <span className="inline-flex items-center rounded-full bg-emerald-700/40 px-3 py-1.5 text-xs font-medium whitespace-nowrap">
            ปริมาตร <b className="mx-1 tabular-nums">{selected.volume.toFixed(3)}</b> CBM
          </span>
          <span className="inline-flex items-center rounded-full bg-white/25 px-3 py-1.5 text-[11px] font-medium whitespace-nowrap">
            ปิดงานเป็น &quot;ส่งแล้ว&quot; (7) — เฉพาะของลูกค้า {group.userid}
          </span>
        </div>
        {err && (
          <div className="mt-2 text-sm bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2 rounded">
            ⚠️ {err}
          </div>
        )}
      </div>
    </li>
  );
}

// Sort-direction glyph for a clickable column header (legacy DataTables ⇅).
// null = not sorted (gray ⇅) · asc = red ▲ · desc = red ▼.
function SortIcon({ state }: { state: "asc" | "desc" | null }) {
  if (state === "asc") return <ChevronUp className="inline h-3 w-3 text-[#cc3333] align-middle" />;
  if (state === "desc") return <ChevronDown className="inline h-3 w-3 text-[#cc3333] align-middle" />;
  return <ChevronsUpDown className="inline h-3 w-3 text-muted/50 align-middle" />;
}
