"use client";

/**
 * ตารางแผนคอนเทนต์รายวัน — 1 แถว = 1 แผน, กดลูกศรแล้ว "สไลด์ดาวน์" ลงมาแจงชิ้นงานย่อย
 * (owner 2026-07-21 "กดแล้วมีดร็อปดาวน์ สไลด์ดาวน์ลงมา ตามภาพเลย").
 *
 * ชิ้นงานย่อย = DERIVED (`piecesOf`) จาก platformContentTypeIds ที่มีอยู่แล้ว —
 * ไม่ได้เก็บซ้ำ จึงไม่มีทางไม่ตรงกับตารางหลัก/ปฏิทิน. ฟิลด์ที่พิมพ์เพิ่มต่อชิ้น
 * (รายละเอียด/กำหนด/สถานะ/ผู้รับผิดชอบ/ลิงก์) เขียนผ่าน `updateContent` ตัวเดียว
 * กับที่ปฏิทินใช้ → แก้ตรงนี้ = ข้อมูลชุดเดียวกันขยับทั้งระบบ (ไม่ใช่ตารางที่สอง).
 *
 * §0f: ทุก mutation ที่ลบ/ล้าง ผ่าน confirm. §0g: แถวอ่านรู้เรื่องตั้งแต่เห็น —
 * รูป · ชื่อ · เวลา · ช่องทาง · ประเภท · สถานะ · ผู้รับผิดชอบ · ความคืบหน้า.
 */
import { Fragment, useMemo, useState } from "react";
import { ChevronDown, Eye, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { ContentItem } from "@/lib/marketing-planner/types";
import { contentTypeIdsOf, pieceProgress, piecesOf, platformIdsOf } from "@/lib/marketing-planner/types";
import { isPieceDone } from "@/lib/marketing-planner/piece-status";
import { usePlanner } from "@/lib/marketing-planner/store";
import { cx, EmptyState, iconBtn, MoreChips, OwnerBadge, SettingTag, useConfirm } from "./ui";
import { EditableDate, EditableSelect, EditableText } from "./content-grid-cells";
import { PlatformBadge, PlatformBadges } from "./platform-icon";
import { PlanPreviewPanel } from "./plan-preview-panel";

const TH = "whitespace-nowrap px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-muted";
const TD = "whitespace-nowrap px-3 py-2.5 align-middle";

/** แถบความคืบหน้า "N/M ชิ้นงาน" — เขียวเมื่อครบ, ส้มเมื่อเดินอยู่, เทาเมื่อยังไม่เริ่ม. */
function ProgressBar({ done, total }: { done: number; total: number }) {
  if (total === 0) return <span className="text-[11px] text-muted/50">—</span>;
  const pct = Math.round((done / total) * 100);
  const color = done === 0 ? "#cbd5e1" : done === total ? "#16a34a" : "#f59e0b";
  return (
    <span className="inline-flex min-w-[86px] flex-col gap-1" title={`เสร็จ ${done} จาก ${total} ชิ้นงาน`}>
      <span className="text-[11px] font-medium text-foreground">{done}/{total} ชิ้นงาน</span>
      <span className="h-1.5 w-full overflow-hidden rounded-full bg-muted/20">
        <span className="block h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: color }} />
      </span>
    </span>
  );
}

/** รูปย่อของแผน — ยังไม่มีฟิลด์รูปในโมเดล จึงวาดไทล์สีตามช่องทางแรก (ไม่กุข้อมูล). */
function Thumb({ c }: { c: ContentItem }) {
  const first = platformIdsOf(c)[0];
  return (
    <span className="flex h-9 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/10">
      {first ? <PlatformBadge id={first} compact /> : <span className="text-[10px] text-muted/50">—</span>}
    </span>
  );
}

export function DayPlanTable({ items, onOpen, onEdit }: { items: ContentItem[]; onOpen: (id: string) => void; onEdit: (id: string) => void }) {
  const { byGroup, colorOf, updateContent, deleteContent } = usePlanner();
  const confirm = useConfirm();
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [statusFilter, setStatusFilter] = useState("");

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const shown = useMemo(() => (statusFilter ? items.filter((c) => c.statusId === statusFilter) : items), [items, statusFilter]);

  const onDelete = async (c: ContentItem) => {
    if (await confirm({ title: "ลบคอนเทนต์", message: `ลบ "${c.title}" ถาวร? การลบนี้ย้อนกลับไม่ได้`, confirmText: "ลบถาวร", danger: true })) deleteContent(c.id);
  };

  if (items.length === 0) {
    return <EmptyState icon={<Eye className="h-6 w-6" />} title="วันนี้ยังไม่มีคอนเทนต์" message="กด “สร้างคอนเทนต์วันที่นี้” เพื่อเริ่มวางแผน" />;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-semibold text-foreground">
          วันนี้ {shown.length.toLocaleString("th-TH")} รายการ
          {statusFilter && <span className="ml-1 font-normal text-muted">(กรองจาก {items.length.toLocaleString("th-TH")})</span>}
        </p>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-border bg-white px-2.5 py-1.5 text-[12px] text-foreground outline-none transition focus:border-primary-400 dark:bg-surface"
          title="กรองตามสถานะ"
        >
          <option value="">ทุกสถานะ</option>
          {byGroup("status").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <div className="scrollbar-x-visible overflow-x-auto rounded-2xl border border-border bg-white dark:bg-surface">
        <table className="w-full min-w-[1060px] border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-border bg-primary-50/30 dark:bg-primary-900/10">
              <th className={cx(TH, "w-14 pr-0")} />
              <th className={TH}>คอนเทนต์</th>
              <th className={TH}>เวลา</th>
              <th className={TH}>ช่องทาง</th>
              <th className={TH}>ประเภท</th>
              <th className={TH}>สถานะ</th>
              <th className={TH}>ผู้รับผิดชอบ</th>
              <th className={TH}>ความคืบหน้า</th>
              <th className={cx(TH, "text-right")}>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => {
              const isOpen = open.has(c.id);
              const pieces = piecesOf(c);
              const { done, total } = pieceProgress(pieces, isPieceDone);
              const types = contentTypeIdsOf(c);
              return (
                <Fragment key={c.id}>
                  <tr
                    className={cx(
                      "border-b border-border transition hover:bg-primary-50/20",
                      isOpen && "bg-primary-50/40 dark:bg-primary-900/20",
                    )}
                    style={isOpen ? { boxShadow: "inset 3px 0 0 0 var(--color-primary-600, #B30000)" } : undefined}
                  >
                    <td className={cx(TD, "w-14 pr-0")}>
                      <Thumb c={c} />
                    </td>
                    <td className={cx(TD, "max-w-[280px] whitespace-normal")}>
                      <EditableText value={c.title} onCommit={(v) => v && updateContent(c.id, { title: v })} className="font-semibold text-foreground" title="ชื่อคอนเทนต์" />
                      {total > 1 && <p className="mt-0.5 text-[11px] text-muted">แผนคอนเทนต์ · {total.toLocaleString("th-TH")} ชิ้นงาน</p>}
                    </td>
                    <td className={cx(TD, "text-muted")}>
                      <EditableDate value={c.publishTime ?? ""} type="time" onCommit={(v) => updateContent(c.id, { publishTime: v })} title="เวลาลง" />
                    </td>
                    <td className={TD}><PlatformBadges ids={platformIdsOf(c)} max={5} /></td>
                    <td className={cx(TD, "max-w-[180px] whitespace-normal")}>
                      {types.length === 0 ? (
                        <span className="text-muted/50">—</span>
                      ) : (
                        <span className="inline-flex flex-wrap items-center gap-1">
                          {types.slice(0, 2).map((id) => <SettingTag key={id} id={id} />)}
                          {types.length > 2 && (
                            <MoreChips label={`+${types.length - 2}`} title={`อีก ${types.length - 2} ประเภท — ชี้เพื่อดู`}>
                              {types.slice(2).map((id) => <SettingTag key={id} id={id} />)}
                            </MoreChips>
                          )}
                        </span>
                      )}
                    </td>
                    <td className={TD}>
                      <EditableSelect value={c.statusId} options={byGroup("status")} colorOf={colorOf} onCommit={(v) => updateContent(c.id, { statusId: v })} title="สถานะ" />
                    </td>
                    <td className={TD}>{c.ownerId ? <OwnerBadge ownerId={c.ownerId} /> : <span className="text-muted/50">—</span>}</td>
                    <td className={TD}><ProgressBar done={done} total={total} /></td>
                    <td className={cx(TD, "text-right")}>
                      <div className="inline-flex items-center gap-0.5">
                        <button type="button" className={iconBtn} title="แก้ไข" onClick={() => onEdit(c.id)}><Pencil className="h-4 w-4" /></button>
                        <button type="button" className={cx(iconBtn, "hover:bg-red-50 hover:text-red-600")} title="ลบ" onClick={() => onDelete(c)}><Trash2 className="h-4 w-4" /></button>
                        <button type="button" className={iconBtn} title="ดูรายละเอียดเต็ม" onClick={() => onOpen(c.id)}><MoreHorizontal className="h-4 w-4" /></button>
                        <button
                          type="button"
                          onClick={() => toggle(c.id)}
                          className={cx(iconBtn, isOpen && "bg-primary-50 text-primary-700")}
                          aria-expanded={isOpen}
                          aria-label={isOpen ? `ย่อรายละเอียด ${c.title}` : `กางรายละเอียด ${c.title}`}
                          title={isOpen ? "ย่อรายละเอียด" : "กางดูชิ้นงานย่อย"}
                        >
                          <ChevronDown className={cx("h-4 w-4 transition-transform duration-300", isOpen && "rotate-180")} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {/* แถวรายละเอียด — สไลด์ดาวน์ด้วย grid-rows 0fr→1fr (ยืดตามความสูงจริง
                      ไม่ต้อง fix max-height ให้เดา · ไม่ใช้ transform จึงไม่ไปสร้าง
                      containing block ทับ modal ที่เป็น fixed · ดู [[nextjs-16-quirks]]) */}
                  <tr className="border-b border-border last:border-0">
                    <td colSpan={9} className="p-0">
                      <div className="grid transition-[grid-template-rows] duration-300 ease-out" style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}>
                        <div className="overflow-hidden">
                          {isOpen && (
                            <PlanPreviewPanel c={c} />
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
