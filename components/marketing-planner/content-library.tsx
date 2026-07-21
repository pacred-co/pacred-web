"use client";

/**
 * คลังคอนเทนต์ — the SPREADSHEET view of the planner (owner 2026-07-20:
 * "คลังคอนเทนต์ = หน้า excel แก้ไขได้รายละเอียด · เนื้อหาตรงนี้จะวิ่งไปตรงปฏิทินได้
 *  หรือก็คือหน้าปฏิทินแต่เป็นมุมมอง excel · เห็นสถานะชัด วันที่สร้าง วันที่ลงชัดเจน ·
 *  กดเพื่อดูชื่อแต่ละแพลทฟอร์มได้").
 *
 * It is NOT a second copy of the data — every cell writes through the planner
 * store's `updateContent`, the same one ปฏิทิน/Kanban read, so changing วันลง
 * here moves the card in the calendar immediately. Same rows as the calendar,
 * different lens.
 *
 * Editable inline: ชื่อคอนเทนต์ · วันลง · เวลา · ประเภท · เป้าหมาย · สถานะ ·
 * ผู้รับผิดชอบ. วันที่สร้าง is system-owned → read-only. Clicking the platform
 * cell expands a sub-row with the per-platform title/caption drafts.
 *
 * Multi-select (per-row + select-all) → bulk delete in one action (§0f confirm).
 * Row actions: view / edit / result / duplicate / archive / delete. Draft/Final/
 * Result link columns open the matching link.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArchiveRestore, BarChart3, ChevronDown, ChevronRight, Copy, ExternalLink, Eye, Pencil, Trash2, X } from "lucide-react";
import type { ContentItem } from "@/lib/marketing-planner/types";
import { contentTypeIdsOf, platformContentTypeIdsOf, platformIdsOf } from "@/lib/marketing-planner/types";
import { usePlanner } from "@/lib/marketing-planner/store";
import { isResultEmpty, RESULT_STATUS_COLOR } from "@/lib/marketing-planner/performance";
import { fmtThaiDate } from "@/lib/marketing-planner/util";
import { cx, EmptyState, GroupMultiSelect, iconBtn, SettingTag, useConfirm } from "./ui";
import { EditableDate, EditableSelect, EditableText } from "./content-grid-cells";

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
  const { labelOf, byGroup, colorOf, updateContent, duplicateContent, archiveContent, restoreContent, deleteContent, deleteContents } = usePlanner();
  const confirm = useConfirm();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  // Rows whose per-platform title drafts are open (owner: "กดเพื่อดูชื่อแต่ละแพลทฟอร์ม").
  const [openPlatforms, setOpenPlatforms] = useState<Set<string>>(() => new Set());
  const togglePlatforms = (id: string) =>
    setOpenPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const headRef = useRef<HTMLInputElement>(null);

  // Selection ⊆ what's currently visible: a filter change (or a delete) that hides
  // a row also drops it, so a bulk-delete only ever removes rows the user can see
  // + the counts stay honest. DERIVED at render (it used to be an effect that
  // called setSelected — a render cascade, and eslint react-hooks flags it).
  const visible = useMemo(() => new Set(items.map((c) => c.id)), [items]);
  const sel = useMemo(() => {
    if (selected.size === 0) return selected;
    const next = new Set<string>();
    for (const id of selected) if (visible.has(id)) next.add(id);
    return next.size === selected.size ? selected : next;
  }, [selected, visible]);

  const allSelected = items.length > 0 && sel.size === items.length;
  const someSelected = sel.size > 0 && !allSelected;

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
  const toggleAll = () => setSelected(sel.size === items.length ? new Set() : new Set(items.map((c) => c.id)));
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
    const ids = items.filter((c) => sel.has(c.id)).map((c) => c.id);
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
        {sel.size > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-2.5 py-1.5 dark:border-red-900/40 dark:bg-red-900/10">
            <span className="text-[12px] font-semibold text-red-700 dark:text-red-300">เลือก {sel.size.toLocaleString("th-TH")} รายการ</span>
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
        <table className="w-full min-w-[1320px] border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-border bg-primary-50/30 dark:bg-primary-900/10">
              <th className={cx(TH, "w-9 pr-0")}>
                <input ref={headRef} type="checkbox" className={CHECK} checked={allSelected} onChange={toggleAll} aria-label="เลือกทั้งหมด" title="เลือกทั้งหมด" />
              </th>
              <th className={TH}>คอนเทนต์</th>
              <th className={TH}>วันที่สร้าง</th>
              <th className={TH}>วันลง</th>
              <th className={TH}>เวลา</th>
              <th className={TH}>แพลตฟอร์ม</th>
              <th className={TH}>ประเภท (หลายแบบ)</th>
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
              const isSel = sel.has(c.id);
              const platformsOpen = openPlatforms.has(c.id);
              const pids = platformIdsOf(c);
              return (
                <Fragment key={c.id}>
                <tr className={cx("border-b border-border last:border-0 hover:bg-primary-50/20", isSel && "bg-primary-50/50 dark:bg-primary-900/20", c.archivedAt && "opacity-50")}>
                  <td className={cx(TD, "w-9 pr-0")}>
                    <input type="checkbox" className={CHECK} checked={isSel} onChange={() => toggleOne(c.id)} aria-label={`เลือก ${c.title}`} />
                  </td>
                  <td className={cx(TD, "max-w-[300px]")}>
                    <div className="flex items-center gap-1">
                      <EditableText
                        value={c.title}
                        onCommit={(v) => v && updateContent(c.id, { title: v })}
                        className="font-semibold text-foreground"
                        title="ชื่อคอนเทนต์"
                      />
                      <button type="button" onClick={() => onOpen(c.id)} className={cx(iconBtn, "shrink-0")} title="เปิดรายละเอียด">
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {c.archivedAt && <span className="ml-1 rounded bg-muted/20 px-1 text-[10px] text-muted">archived</span>}
                  </td>
                  <td className={cx(TD, "text-muted")} title="วันที่สร้าง (ระบบบันทึกให้ · แก้ไม่ได้)">{fmtThaiDate(c.createdAt?.slice(0, 10))}</td>
                  <td className={TD}>
                    <EditableDate value={c.publishDate ?? ""} onCommit={(v) => updateContent(c.id, { publishDate: v })} render={(v) => fmtThaiDate(v)} title="วันลง (ย้ายการ์ดในปฏิทิน)" />
                  </td>
                  <td className={cx(TD, "text-muted")}>
                    <EditableDate value={c.publishTime ?? ""} onCommit={(v) => updateContent(c.id, { publishTime: v })} type="time" title="เวลาลง" />
                  </td>
                  <td className={TD}>
                    <button
                      type="button"
                      onClick={() => togglePlatforms(c.id)}
                      className="flex items-center gap-1 rounded px-1 py-0.5 transition hover:bg-primary-50 dark:hover:bg-primary-900/20"
                      title="กดเพื่อดู/แก้ ชื่อแต่ละแพลตฟอร์ม"
                    >
                      {openPlatforms.has(c.id) ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-primary-600" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" />}
                      <span className="flex flex-wrap items-center gap-1">
                        {platformIdsOf(c).length > 0 ? platformIdsOf(c).map((pid) => <SettingTag key={pid} id={pid} />) : <span className="text-muted/50">—</span>}
                      </span>
                    </button>
                  </td>
                  <td className={TD}>
                    <GroupMultiSelect
                      group="contentType"
                      value={contentTypeIdsOf(c)}
                      onChange={(ids) => {
                        // เก็บของแพลตฟอร์มที่ผู้ใช้แยกประเภทเองไว้ (ตารางนี้ save ทันที ไม่มี
                        // undo) — เหมือน setContentTypes ในฟอร์ม: ตามค่าเริ่มต้น → อัปเดต ·
                        // ตั้งต่างไว้แล้ว → คงเดิม.
                        const cur = c.platformContentTypeIds ?? {};
                        const base = contentTypeIdsOf(c);
                        const same = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);
                        return updateContent(c.id, {
                          contentTypeIds: ids,
                          contentTypeId: ids[0],
                          platformContentTypeIds: Object.fromEntries(
                            platformIdsOf(c).map((pid) => {
                              const own = Object.prototype.hasOwnProperty.call(cur, pid) ? cur[pid] ?? [] : null;
                              return [pid, own == null || same(own, base) ? ids : own];
                            }),
                          ),
                        });
                      }}
                      placeholder="— เลือกประเภท —"
                      className="min-w-[180px] max-w-[240px] py-1 text-[11px]"
                    />
                  </td>
                  <td className={TD}><EditableSelect value={c.marketingGoalId} options={byGroup("marketingGoal")} colorOf={colorOf} onCommit={(v) => updateContent(c.id, { marketingGoalId: v })} title="เป้าหมาย" /></td>
                  <td className={TD}><EditableSelect value={c.statusId} options={byGroup("status")} colorOf={colorOf} onCommit={(v) => updateContent(c.id, { statusId: v })} title="สถานะ" /></td>
                  <td className={TD}><EditableSelect value={c.ownerId} options={byGroup("owner")} colorOf={colorOf} onCommit={(v) => updateContent(c.id, { ownerId: v })} title="ผู้รับผิดชอบ" /></td>
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
                {platformsOpen && (
                  <tr className="border-b border-border bg-primary-50/20 dark:bg-primary-900/10">
                    <td className={cx(TD, "w-9 pr-0")} />
                    <td className={TD} colSpan={14}>
                      {pids.length === 0 ? (
                        <p className="text-[11.5px] text-muted">ยังไม่ได้เลือกแพลตฟอร์ม — กด ✎ แก้ไข เพื่อเลือกแพลตฟอร์มก่อน</p>
                      ) : (
                        <div className="space-y-1.5 py-1">
                          <p className="text-[11px] font-bold text-muted">ชื่อ/แคปชั่น + ประเภทคอนเทนต์ แยกตามแพลตฟอร์ม — ชื่อว่าง = ใช้ชื่อหลัก &quot;{c.title}&quot;</p>
                          {pids.map((pid) => (
                            <div key={pid} className="grid gap-2 rounded-lg bg-white/70 p-2 dark:bg-surface/70 sm:grid-cols-[112px_minmax(240px,1fr)_minmax(220px,1fr)] sm:items-center">
                              <span className="w-28 shrink-0"><SettingTag id={pid} /></span>
                              <span className="min-w-0">
                                <EditableText
                                  value={c.platformTitles?.[pid] ?? ""}
                                  placeholder={c.title}
                                  onCommit={(v) => updateContent(c.id, { platformTitles: { ...(c.platformTitles ?? {}), [pid]: v } })}
                                  title={`ชื่อสำหรับ ${labelOf(pid)}`}
                                />
                              </span>
                              <GroupMultiSelect
                                group="contentType"
                                value={platformContentTypeIdsOf(c, pid)}
                                onChange={(ids) => {
                                  const platformContentTypeIds = Object.fromEntries(
                                    pids.map((platformId) => [platformId, platformId === pid ? ids : platformContentTypeIdsOf(c, platformId)]),
                                  );
                                  const contentTypeIds = [...new Set(Object.values(platformContentTypeIds).flat())];
                                  updateContent(c.id, {
                                    contentTypeIds,
                                    contentTypeId: contentTypeIds[0],
                                    platformContentTypeIds,
                                  });
                                }}
                                placeholder={`— สิ่งที่จะลงใน ${labelOf(pid)} —`}
                                className="py-1 text-[11px]"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
