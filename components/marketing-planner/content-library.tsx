"use client";

/**
 * Content library table (owner brief §2.5) — wide, horizontally scrollable.
 * Multi-select (per-row + select-all) → bulk delete in one action (§0f confirm).
 * Row actions: view / edit / result / duplicate / archive / delete (mutations
 * confirm via §0f). Draft/Final/Result link columns open the matching link.
 */
import { useEffect, useRef, useState } from "react";
import { Archive, ArchiveRestore, BarChart3, Copy, ExternalLink, Eye, Pencil, Trash2, X } from "lucide-react";
import type { ContentItem } from "@/lib/marketing-planner/types";
import { platformIdsOf } from "@/lib/marketing-planner/types";
import { usePlanner } from "@/lib/marketing-planner/store";
import { isResultEmpty, RESULT_STATUS_COLOR } from "@/lib/marketing-planner/performance";
import { fmtThaiDate } from "@/lib/marketing-planner/util";
import { cx, EmptyState, iconBtn, OwnerBadge, SettingTag, useConfirm } from "./ui";

function linkBy(c: ContentItem, namer: (id: string) => string, re: RegExp) {
  return c.links.find((l) => re.test(namer(l.linkTypeId)));
}
function openUrl(url?: string) {
  if (url && typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
}

const RE_DRAFT = /draft|ดราฟ|ร่าง/i;
const RE_FINAL = /final|publish|งานจริง|โพสต์|เผยแพร่/i;
const RE_RESULT = /result|report|ผล/i;

const TH = "whitespace-nowrap px-2.5 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-muted";
const TD = "whitespace-nowrap px-2.5 py-2 align-middle";
const CHECK = "h-4 w-4 cursor-pointer accent-primary-600 align-middle";

export function ContentLibrary({ items, onOpen, onEdit, onResult }: { items: ContentItem[]; onOpen: (id: string) => void; onEdit: (id: string) => void; onResult: (id: string) => void }) {
  const { labelOf, duplicateContent, archiveContent, restoreContent, deleteContent, deleteContents } = usePlanner();
  const confirm = useConfirm();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const headRef = useRef<HTMLInputElement>(null);

  // Keep the selection ⊆ what's currently visible: a filter change (or a delete)
  // that hides a row also drops it from the selection, so a bulk-delete only ever
  // removes rows the user can actually see + the counts stay honest. Returns the
  // same Set reference when nothing changed → no re-render loop.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<string>();
      for (const c of items) if (prev.has(c.id)) next.add(c.id);
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  const allSelected = items.length > 0 && selected.size === items.length;
  const someSelected = selected.size > 0 && !allSelected;

  useEffect(() => {
    if (headRef.current) headRef.current.indeterminate = someSelected;
  }, [someSelected]);

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected((prev) => (prev.size === items.length ? new Set() : new Set(items.map((c) => c.id))));
  const clearSelection = () => setSelected(new Set());

  const onArchive = async (c: ContentItem) => {
    if (c.archivedAt) {
      restoreContent(c.id);
      return;
    }
    if (await confirm({ title: "เก็บเข้าคลัง (Archive)", message: `เก็บ "${c.title}" เข้าคลัง? จะถูกซ่อนจากปฏิทิน/คลังหลัก แต่กู้คืนได้`, confirmText: "เก็บเข้าคลัง" })) archiveContent(c.id);
  };
  const onDelete = async (c: ContentItem) => {
    if (await confirm({ title: "ลบคอนเทนต์", message: `ลบ "${c.title}" ถาวร? การลบนี้ย้อนกลับไม่ได้`, confirmText: "ลบถาวร", danger: true })) deleteContent(c.id);
  };
  const onBulkDelete = async () => {
    const ids = items.filter((c) => selected.has(c.id)).map((c) => c.id);
    if (ids.length === 0) return;
    const n = ids.length.toLocaleString("th-TH");
    if (await confirm({ title: "ลบคอนเทนต์ที่เลือก", message: `ลบ ${n} คอนเทนต์ที่เลือกถาวร? การลบนี้ย้อนกลับไม่ได้`, confirmText: `ลบ ${n} รายการ`, danger: true })) {
      deleteContents(ids);
      clearSelection();
    }
  };

  if (items.length === 0) {
    return <EmptyState icon={<Eye className="h-6 w-6" />} title="ไม่พบคอนเทนต์" message="ลองล้างตัวกรอง หรือสร้างคอนเทนต์ใหม่" />;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-muted">พบ {items.length.toLocaleString("th-TH")} คอนเทนต์ · เลื่อนซ้าย-ขวา ⇆ เพื่อดูทุกคอลัมน์</p>
        {selected.size > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-2.5 py-1.5 dark:border-red-900/40 dark:bg-red-900/10">
            <span className="text-[12px] font-semibold text-red-700 dark:text-red-300">เลือก {selected.size.toLocaleString("th-TH")} รายการ</span>
            <button type="button" onClick={onBulkDelete} className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1 text-[12px] font-semibold text-white transition hover:bg-red-700">
              <Trash2 className="h-3.5 w-3.5" /> ลบที่เลือก
            </button>
            <button type="button" onClick={clearSelection} className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[12px] text-muted transition hover:text-foreground" title="ยกเลิกการเลือก">
              <X className="h-3.5 w-3.5" /> ยกเลิก
            </button>
          </div>
        )}
      </div>
      <div className="scrollbar-x-visible overflow-x-auto rounded-2xl border border-border bg-white dark:bg-surface">
        <table className="w-full min-w-[1150px] border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-border bg-primary-50/30 dark:bg-primary-900/10">
              <th className={cx(TH, "w-9 pr-0")}>
                <input ref={headRef} type="checkbox" className={CHECK} checked={allSelected} onChange={toggleAll} aria-label="เลือกทั้งหมด" title="เลือกทั้งหมด" />
              </th>
              <th className={TH}>คอนเทนต์</th>
              <th className={TH}>วันลง</th>
              <th className={TH}>เวลา</th>
              <th className={TH}>แพลตฟอร์ม</th>
              <th className={TH}>ประเภท</th>
              <th className={TH}>เป้าหมาย</th>
              <th className={TH}>สถานะ</th>
              <th className={TH}>ผู้รับผิดชอบ</th>
              <th className={TH}>ดราฟต์</th>
              <th className={TH}>งานจริง</th>
              <th className={TH}>ผล</th>
              <th className={TH}>Score</th>
              <th className={cx(TH, "text-right")}>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => {
              const draft = linkBy(c, labelOf, RE_DRAFT);
              const final = linkBy(c, labelOf, RE_FINAL);
              const resultLink = linkBy(c, labelOf, RE_RESULT);
              const hasResult = !!c.result && !isResultEmpty(c.result);
              const score = c.result?.performanceScore;
              const isSel = selected.has(c.id);
              return (
                <tr key={c.id} className={cx("border-b border-border last:border-0 hover:bg-primary-50/20", isSel && "bg-primary-50/50 dark:bg-primary-900/20", c.archivedAt && "opacity-50")}>
                  <td className={cx(TD, "w-9 pr-0")}>
                    <input type="checkbox" className={CHECK} checked={isSel} onChange={() => toggleOne(c.id)} aria-label={`เลือก ${c.title}`} />
                  </td>
                  <td className={cx(TD, "max-w-[280px]")}>
                    <button type="button" onClick={() => onOpen(c.id)} className="truncate text-left font-semibold text-foreground hover:text-primary-700">
                      {c.title}
                    </button>
                    {c.archivedAt && <span className="ml-1 rounded bg-muted/20 px-1 text-[10px] text-muted">archived</span>}
                  </td>
                  <td className={TD}>{fmtThaiDate(c.publishDate)}</td>
                  <td className={cx(TD, "text-muted")}>{c.publishTime || "—"}</td>
                  <td className={TD}><div className="flex flex-wrap items-center gap-1">{platformIdsOf(c).map((pid) => <SettingTag key={pid} id={pid} />)}</div></td>
                  <td className={TD}><SettingTag id={c.contentTypeId} /></td>
                  <td className={TD}><SettingTag id={c.marketingGoalId} /></td>
                  <td className={TD}><SettingTag id={c.statusId} fallback="—" /></td>
                  <td className={TD}><OwnerBadge ownerId={c.ownerId} /></td>
                  <td className={TD}>{draft ? <button className={iconBtn} title="เปิดดราฟต์" onClick={() => openUrl(draft.url)}><ExternalLink className="h-4 w-4" /></button> : <span className="text-muted/50">—</span>}</td>
                  <td className={TD}>{final ? <button className={iconBtn} title="เปิดงานจริง" onClick={() => openUrl(final.url)}><ExternalLink className="h-4 w-4 text-green-600" /></button> : <span className="text-muted/50">—</span>}</td>
                  <td className={TD}>{resultLink ? <button className={iconBtn} title="เปิดผลลัพธ์" onClick={() => openUrl(resultLink.url)}><ExternalLink className="h-4 w-4 text-primary-600" /></button> : <span className="text-muted/50">—</span>}</td>
                  <td className={TD}>
                    {hasResult ? (
                      <span className="inline-flex items-center gap-1 font-bold text-foreground">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: RESULT_STATUS_COLOR[c.result?.resultStatus ?? "none"] }} />
                        {score ?? 0}
                      </span>
                    ) : (
                      <span className="text-muted/50">—</span>
                    )}
                  </td>
                  <td className={cx(TD, "text-right")}>
                    <div className="inline-flex items-center gap-0.5">
                      <button className={iconBtn} title="ดูรายละเอียด" onClick={() => onOpen(c.id)}><Eye className="h-4 w-4" /></button>
                      <button className={iconBtn} title="แก้ไข" onClick={() => onEdit(c.id)}><Pencil className="h-4 w-4" /></button>
                      <button className={iconBtn} title="วัดผล" onClick={() => onResult(c.id)}><BarChart3 className="h-4 w-4" /></button>
                      <button className={iconBtn} title="ทำสำเนา" onClick={() => duplicateContent(c.id)}><Copy className="h-4 w-4" /></button>
                      <button className={iconBtn} title={c.archivedAt ? "กู้คืน" : "เก็บเข้าคลัง"} onClick={() => onArchive(c)}>{c.archivedAt ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}</button>
                      <button className={cx(iconBtn, "hover:bg-red-50 hover:text-red-600")} title="ลบ" onClick={() => onDelete(c)}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
