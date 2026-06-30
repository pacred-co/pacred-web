"use client";

/**
 * Marketing Content Planner — app shell (owner brief §2, §6). Tab switcher +
 * global "create" + shared filter, orchestrating every view and modal. Wrapped
 * in PlannerProvider (localStorage data) + ConfirmProvider (§0f confirms).
 */
import { useMemo, useState } from "react";
import { BarChart3, CalendarDays, CalendarRange, Compass, Inbox, KanbanSquare, LayoutDashboard, Library, Plus, Search, Settings2 } from "lucide-react";
import { PlannerProvider, usePlanner } from "@/lib/marketing-planner/store";
import { applyFilter, applyLinkFilter, type ContentFilter } from "@/lib/marketing-planner/filter";
import type { PlannerData, PlannerUser, SettingGroup } from "@/lib/marketing-planner/types";
import { btnPrimary, ConfirmProvider, cx } from "./ui";
import { Dashboard } from "./dashboard";
import { ContentCalendar } from "./content-calendar";
import { ContentKanban } from "./content-kanban";
import { ContentLibrary } from "./content-library";
import { AnalyticsView } from "./analytics-view";
import { SettingsPage } from "./settings-page";
import { ContentForm } from "./content-form";
import { ContentDetail } from "./content-detail";
import { ResultModal } from "./result-modal";
import { FilterBar } from "./filter-bar";
import { StrategyBlueprint } from "./strategy-blueprint";
import { ProductionPlan } from "./production-plan";
import { JobBoard } from "./job-board";
import { KeywordPlanner } from "./keyword-planner";

type Tab = "strategy" | "production" | "dashboard" | "calendar" | "kanban" | "jobs" | "library" | "analytics" | "keywords" | "settings";

const TABS: { key: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { key: "strategy", label: "แผนการตลาด", icon: Compass },
  { key: "production", label: "แผนการผลิต", icon: CalendarRange },
  { key: "dashboard", label: "ภาพรวม", icon: LayoutDashboard },
  { key: "calendar", label: "ปฏิทิน", icon: CalendarDays },
  { key: "kanban", label: "Kanban", icon: KanbanSquare },
  { key: "jobs", label: "สั่งงาน", icon: Inbox },
  { key: "library", label: "คลังคอนเทนต์", icon: Library },
  { key: "analytics", label: "วัดผล", icon: BarChart3 },
  { key: "keywords", label: "Keyword", icon: Search },
  { key: "settings", label: "ตั้งค่า", icon: Settings2 },
];

function PlannerInner() {
  const { ready, contents, labelOf } = usePlanner();
  const [tab, setTab] = useState<Tab>("strategy");
  const [settingsGroup, setSettingsGroup] = useState<SettingGroup>("platform");
  const [filter, setFilter] = useState<ContentFilter>({});
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | undefined>();
  const [defaultDate, setDefaultDate] = useState<string | undefined>();
  const [detailId, setDetailId] = useState<string | undefined>();
  const [resultId, setResultId] = useState<string | undefined>();

  const filtered = useMemo(() => applyLinkFilter(applyFilter(contents, filter), filter, labelOf), [contents, filter, labelOf]);

  const openCreate = (date?: string) => { setEditId(undefined); setDefaultDate(date); setFormOpen(true); };
  const openEdit = (id: string) => { setDetailId(undefined); setEditId(id); setDefaultDate(undefined); setFormOpen(true); };
  const openResult = (id: string) => { setDetailId(undefined); setResultId(id); };
  const goSettings = (group: SettingGroup) => { setSettingsGroup(group); setTab("settings"); };

  if (!ready) {
    return <div className="flex items-center justify-center rounded-2xl border border-border py-24 text-sm text-muted">กำลังโหลดระบบวางแผนคอนเทนต์…</div>;
  }

  const showFilter = tab === "calendar" || tab === "kanban" || tab === "library";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-white p-1 dark:bg-surface">
          {TABS.map((t) => {
            const I = t.icon;
            return (
              <button key={t.key} type="button" onClick={() => setTab(t.key)}
                className={cx("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition", tab === t.key ? "bg-primary-600 text-white" : "text-muted hover:text-foreground")}>
                <I className="h-4 w-4" />{t.label}
              </button>
            );
          })}
        </div>
        <button type="button" className={btnPrimary} onClick={() => openCreate()}><Plus className="h-4 w-4" /> สร้างคอนเทนต์</button>
      </div>

      {showFilter && <FilterBar value={filter} onChange={setFilter} variant={tab === "library" ? "full" : "compact"} />}

      {tab === "strategy" && <StrategyBlueprint onGoSettings={goSettings} onCreate={() => openCreate()} />}
      {tab === "production" && <ProductionPlan />}
      {tab === "dashboard" && <Dashboard onOpenContent={setDetailId} />}
      {tab === "calendar" && <ContentCalendar items={filtered} onOpenContent={setDetailId} onCreateOn={openCreate} />}
      {tab === "kanban" && <ContentKanban items={filtered} onOpenContent={setDetailId} />}
      {tab === "jobs" && <JobBoard />}
      {tab === "library" && <ContentLibrary items={filtered} onOpen={setDetailId} onEdit={openEdit} onResult={openResult} />}
      {tab === "analytics" && <AnalyticsView onOpenContent={setDetailId} onResult={openResult} />}
      {tab === "keywords" && <KeywordPlanner />}
      {tab === "settings" && <SettingsPage key={settingsGroup} initialGroup={settingsGroup} />}

      <ContentForm open={formOpen} editId={editId} defaultDate={defaultDate} onClose={() => setFormOpen(false)} />
      <ContentDetail id={detailId} onClose={() => setDetailId(undefined)} onEdit={openEdit} onResult={openResult} />
      <ResultModal id={resultId} onClose={() => setResultId(undefined)} />
    </div>
  );
}

export function MarketingPlannerApp({ users = [], currentUserId = "", initial }: { users?: PlannerUser[]; currentUserId?: string; initial?: PlannerData }) {
  return (
    <PlannerProvider users={users} currentUserId={currentUserId} initial={initial}>
      <ConfirmProvider>
        <PlannerInner />
      </ConfirmProvider>
    </PlannerProvider>
  );
}
