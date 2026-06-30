"use client";

/**
 * Kanban view (owner brief §2.4) — one column per status (status.meta.inKanban),
 * columns editable from Settings. Drag a card to another column to change its
 * status (setContentStatus). Cards show title/date/platform/owner/priority +
 * link/preview/result icons + performance score.
 */
import { useMemo, useState } from "react";
import { FileEdit, CheckCircle2, BarChart3, Link2 } from "lucide-react";
import type { ContentItem, SettingItem } from "@/lib/marketing-planner/types";
import { usePlanner } from "@/lib/marketing-planner/store";
import { isResultEmpty } from "@/lib/marketing-planner/performance";
import { fmtThaiDate } from "@/lib/marketing-planner/util";
import { cx, OwnerBadge, Tag } from "./ui";

function KanbanCard({ c, onOpen }: { c: ContentItem; onOpen: (id: string) => void }) {
  const { byId, labelOf } = usePlanner();
  const platform = byId(c.platformId);
  const priority = byId(c.priorityId);
  const draft = c.links.some((l) => /draft|ดราฟ|ร่าง/i.test(labelOf(l.linkTypeId)));
  const final = c.links.some((l) => /final|publish|งานจริง|โพสต์|เผยแพร่/i.test(labelOf(l.linkTypeId)));
  const hasResult = !!c.result && !isResultEmpty(c.result);
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/planner-id", c.id)}
      onClick={() => onOpen(c.id)}
      className="w-full space-y-1.5 rounded-xl border border-border bg-white p-2.5 text-left shadow-sm transition hover:border-primary-200 hover:shadow dark:bg-surface"
    >
      <div className="flex items-start gap-1.5">
        {priority && <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: priority.color }} title={`Priority: ${priority.name}`} />}
        <p className="line-clamp-2 flex-1 text-[12px] font-semibold leading-snug text-foreground">{c.title}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {platform && <Tag color={platform.color} label={platform.name} />}
        {c.publishDate && <span className="text-[11px] text-muted">{fmtThaiDate(c.publishDate)}</span>}
      </div>
      <div className="flex items-center justify-between">
        <OwnerBadge ownerId={c.ownerId} />
        <span className="flex items-center gap-1 text-muted">
          {c.links.length > 0 && <Link2 className="h-3 w-3" />}
          {draft && <FileEdit className="h-3 w-3" />}
          {final && <CheckCircle2 className="h-3 w-3 text-green-600" />}
          {hasResult && (
            <span className="inline-flex items-center gap-0.5 rounded bg-primary-50 px-1 text-[10px] font-bold text-primary-700">
              <BarChart3 className="h-3 w-3" />{c.result?.performanceScore ?? 0}
            </span>
          )}
        </span>
      </div>
    </button>
  );
}

function Column({ status, items, onOpen, onDropCard }: { status: SettingItem; items: ContentItem[]; onOpen: (id: string) => void; onDropCard: (id: string, statusId: string) => void }) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const id = e.dataTransfer.getData("text/planner-id"); if (id) onDropCard(id, status.id); }}
      className={cx("flex w-[270px] shrink-0 flex-col rounded-2xl border bg-muted/5 p-2 transition", over ? "border-primary-300 bg-primary-50/40" : "border-border")}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-foreground">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: status.color }} />
          {status.name}
        </span>
        <span className="rounded-full bg-white px-1.5 text-[11px] font-medium text-muted dark:bg-surface">{items.length}</span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto">
        {items.length === 0 && <p className="py-6 text-center text-[11px] text-muted/60">ลากการ์ดมาที่นี่</p>}
        {items.map((c) => <KanbanCard key={c.id} c={c} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

export function ContentKanban({ items, onOpenContent }: { items?: ContentItem[]; onOpenContent: (id: string) => void }) {
  const { byGroup, contents, setContentStatus } = usePlanner();
  const src = items ?? contents;

  const columns = useMemo(() => byGroup("status").filter((s) => !(s.meta && s.meta.inKanban === false)), [byGroup]);
  const grouped = useMemo(() => {
    const m = new Map<string, ContentItem[]>();
    for (const c of src) {
      if (c.archivedAt) continue;
      const key = c.statusId ?? "__none";
      const arr = m.get(key) ?? [];
      arr.push(c);
      m.set(key, arr);
    }
    return m;
  }, [src]);

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {columns.map((s) => (
        <Column key={s.id} status={s} items={grouped.get(s.id) ?? []} onOpen={onOpenContent} onDropCard={(id, statusId) => setContentStatus(id, statusId)} />
      ))}
    </div>
  );
}
