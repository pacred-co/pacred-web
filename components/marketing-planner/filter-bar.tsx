"use client";

/** Search + filter bar (owner brief §8). Controlled — parent owns the filter. */
import { Search, X } from "lucide-react";
import type { ContentFilter } from "@/lib/marketing-planner/filter";
import { isFilterActive } from "@/lib/marketing-planner/filter";
import { cx, GroupSelect, inputCls, UserSelect } from "./ui";

const TOGGLES: [keyof ContentFilter, string][] = [
  ["hasDraft", "มีดราฟต์"],
  ["hasFinal", "มีงานจริง"],
  ["hasResult", "มีผลลัพธ์"],
  ["shouldRepeat", "ควรทำซ้ำ"],
];

export function FilterBar({ value, onChange, variant = "full" }: { value: ContentFilter; onChange: (f: ContentFilter) => void; variant?: "full" | "compact" }) {
  const set = (patch: Partial<ContentFilter>) => onChange({ ...value, ...patch });
  const toggle = (k: keyof ContentFilter) => onChange({ ...value, [k]: value[k] ? undefined : true });
  const active = isFilterActive(value);

  return (
    <div className="space-y-2 rounded-2xl border border-border bg-white p-3 shadow-sm dark:bg-surface">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className={cx(inputCls, "pl-8")} placeholder="ค้นหาคอนเทนต์..." value={value.keyword ?? ""} onChange={(e) => set({ keyword: e.target.value || undefined })} />
        </div>
        <input type="month" className={cx(inputCls, "w-auto")} value={value.month ?? ""} onChange={(e) => set({ month: e.target.value || undefined })} />
        <div className="w-[150px]"><GroupSelect group="platform" value={value.platformId} onChange={(v) => set({ platformId: v })} placeholder="แพลตฟอร์ม" /></div>
        <div className="w-[140px]"><GroupSelect group="status" value={value.statusId} onChange={(v) => set({ statusId: v })} placeholder="สถานะ" /></div>
        <div className="w-[150px]"><UserSelect value={value.ownerId} onChange={(v) => set({ ownerId: v })} placeholder="ผู้รับผิดชอบ" /></div>
        {variant === "full" && (
          <>
            <div className="w-[150px]"><GroupSelect group="contentType" value={value.contentTypeId} onChange={(v) => set({ contentTypeId: v })} placeholder="ประเภท" /></div>
            <div className="w-[150px]"><GroupSelect group="marketingGoal" value={value.marketingGoalId} onChange={(v) => set({ marketingGoalId: v })} placeholder="เป้าหมาย" /></div>
            <div className="w-[140px]"><GroupSelect group="funnelStage" value={value.funnelStageId} onChange={(v) => set({ funnelStageId: v })} placeholder="Funnel" /></div>
            <div className="w-[140px]"><GroupSelect group="service" value={value.serviceId} onChange={(v) => set({ serviceId: v })} placeholder="บริการ" /></div>
            <div className="w-[140px]"><GroupSelect group="campaign" value={value.campaignId} onChange={(v) => set({ campaignId: v })} placeholder="แคมเปญ" /></div>
            <div className="w-[130px]"><GroupSelect group="priority" value={value.priorityId} onChange={(v) => set({ priorityId: v })} placeholder="Priority" /></div>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {TOGGLES.map(([k, l]) => (
          <button key={k} type="button" onClick={() => toggle(k)}
            className={cx("rounded-full border px-2.5 py-1 text-[12px] transition", value[k] ? "border-primary-300 bg-primary-50 font-medium text-primary-700" : "border-border text-muted hover:border-primary-200")}>
            {l}
          </button>
        ))}
        {active && (
          <button type="button" onClick={() => onChange({})} className="ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] text-muted hover:text-red-600">
            <X className="h-3.5 w-3.5" /> ล้างตัวกรอง
          </button>
        )}
      </div>
    </div>
  );
}
