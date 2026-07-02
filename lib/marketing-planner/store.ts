"use client";

/**
 * Planner store — localStorage repository + React context (ปอน 2026-06-30 prototype).
 *
 * REPOSITORY BOUNDARY: every read/write goes through this module. To move to
 * Supabase later, reimplement load/persist + the mutation bodies as server
 * actions — the hook surface (`usePlanner`) stays identical so no UI changes.
 *
 * SSR-safe: server render = empty data + ready:false; the client effect loads
 * (and seeds on first run). First client render matches the server (empty),
 * so there's no hydration mismatch — the app shows a skeleton until `ready`.
 */
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ContentItem, ContentResult, JobMessageKind, JobOrder, JobStatus, KeywordItem, PlannerData, PlannerUser, ProductionTargets, SettingGroup, SettingItem } from "./types";
import { PLANNER_SCHEMA_VERSION, platformIdsOf, serviceIdsOf } from "./types";
import { buildSeed, DEFAULT_KEYWORDS, DEFAULT_TARGETS } from "./seed";
import { enrichResult } from "./performance";
import { distributeMonth } from "./production-plan";
import { deleteMarketingRow, resetMarketing as resetMarketingAction, saveMarketing } from "@/actions/admin/marketing-planner";

const EMPTY: PlannerData = { version: PLANNER_SCHEMA_VERSION, settings: [], contents: [] };

let _seq = 0;
/** Runtime unique id (client-only paths). */
export function uid(prefix: string): string {
  _seq += 1;
  return `${prefix}-${Date.now().toString(36)}${_seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// Stable per-user colour (real admin accounts have no colour field).
const USER_PALETTE = ["#B30000", "#1d4ed8", "#16a34a", "#f59e0b", "#8b5cf6", "#0ea5e9", "#ec4899", "#14b8a6", "#f97316"];
function hashUserColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return USER_PALETTE[h % USER_PALETTE.length];
}

function isSettingReferenced(contents: ContentItem[], id: string): boolean {
  return contents.some(
    (c) =>
      c.marketingGoalId === id || c.contentTypeId === id || c.contentPillarId === id ||
      c.funnelStageId === id || c.customerStageId === id || platformIdsOf(c).includes(id) ||
      serviceIdsOf(c).includes(id) || c.campaignId === id || c.formatId === id || c.toneId === id ||
      c.priorityId === id || c.statusId === id || c.ownerId === id ||
      !!c.coOwnerIds?.includes(id) || c.links.some((l) => l.linkTypeId === id),
  );
}

export type PlannerContextValue = {
  ready: boolean;
  /** Real admin/staff accounts (owner/co-owner source — read from DB, not localStorage). */
  users: PlannerUser[];
  userById: (id?: string) => PlannerUser | undefined;
  userName: (id?: string) => string;
  userColor: (id?: string) => string;
  settings: SettingItem[];
  contents: ContentItem[];
  /** Active options for a group, ordered. */
  byGroup: (g: SettingGroup) => SettingItem[];
  /** All options (incl. inactive) for a group, ordered. */
  allByGroup: (g: SettingGroup) => SettingItem[];
  byId: (id?: string) => SettingItem | undefined;
  labelOf: (id?: string) => string;
  colorOf: (id?: string) => string | undefined;
  isSettingInUse: (id: string) => boolean;
  addSetting: (group: SettingGroup, partial: Partial<SettingItem> & { name: string }) => SettingItem;
  updateSetting: (id: string, patch: Partial<SettingItem>) => void;
  toggleSetting: (id: string) => void;
  /** Returns false (and does nothing) if the setting is in use — deactivate instead. */
  deleteSetting: (id: string) => boolean;
  addContent: (partial: Partial<ContentItem> & { title: string }) => ContentItem;
  updateContent: (id: string, patch: Partial<ContentItem>) => void;
  deleteContent: (id: string) => void;
  /** Batch-delete many contents in one state update (bulk actions). */
  deleteContents: (ids: string[]) => void;
  duplicateContent: (id: string) => ContentItem | undefined;
  archiveContent: (id: string) => void;
  restoreContent: (id: string) => void;
  setResult: (id: string, result: ContentResult) => void;
  setContentDate: (id: string, publishDate: string) => void;
  setContentStatus: (id: string, statusId: string) => void;
  resetAll: () => void;
  /** Monthly production quota (long per pillar + short total). */
  targets: ProductionTargets;
  setLongTarget: (pillarId: string, n: number) => void;
  setShortTarget: (n: number) => void;
  setArticlePerDay: (n: number) => void;
  setPostPerDay: (n: number) => void;
  /** Generate idea slots for a month from the quota; returns how many were created.
   *  `selectedDays` (1-based day numbers) confines placement to those days; null = every day. */
  generateFromPlan: (year: number, month: number, opts: { long: boolean; short: boolean; article: boolean; post: boolean }, selectedDays?: number[] | null) => number;
  // ── Job board ──
  currentUserId: string;
  jobs: JobOrder[];
  createJob: (input: { title?: string; text: string; images: string[] }) => void;
  claimJob: (id: string) => void;
  addJobMessage: (id: string, msg: { text: string; images: string[]; kind?: JobMessageKind }) => void;
  submitJob: (id: string, msg: { text: string; images: string[] }) => void;
  rejectJob: (id: string, msg: { text: string; images: string[] }) => void;
  approveJob: (id: string, msg?: { text: string; images: string[] }) => void;
  // ── Keyword planner ──
  keywords: KeywordItem[];
  addKeyword: (item: Omit<KeywordItem, "id">) => void;
  updateKeyword: (id: string, patch: Partial<KeywordItem>) => void;
  deleteKeyword: (id: string) => void;
  loadSampleKeywords: () => void;
};

const PlannerContext = createContext<PlannerContextValue | null>(null);

export function PlannerProvider({ children, users = [], currentUserId = "", initial }: { children: ReactNode; users?: PlannerUser[]; currentUserId?: string; initial?: PlannerData }) {
  // Initial data comes from the server (loadMarketing → Supabase). Mutations update
  // optimistically and fire-and-forget persist to the DB (saveMarketing, upsert-only).
  const [data, setData] = useState<PlannerData>(initial ?? EMPTY);
  const ready = true;
  const skipFirstSave = useRef(true);

  const apply = useCallback((fn: (d: PlannerData) => PlannerData) => {
    setData((prev) => fn(prev));
  }, []);

  // Persist to the DB AFTER each change. MUST be an effect (runs post-commit) — calling
  // the saveMarketing server action inside the setData updater fired a Router update
  // DURING render ("Cannot update Router while rendering PlannerProvider"), corrupting
  // the render. Skips the first run: initial data already came from the server/DB.
  useEffect(() => {
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }
    void saveMarketing(data);
  }, [data]);

  const byGroup = useCallback(
    (g: SettingGroup) => data.settings.filter((s) => s.group === g && s.isActive).sort((a, b) => a.order - b.order),
    [data.settings],
  );
  const allByGroup = useCallback(
    (g: SettingGroup) => data.settings.filter((s) => s.group === g).sort((a, b) => a.order - b.order),
    [data.settings],
  );
  const byId = useCallback((id?: string) => (id ? data.settings.find((s) => s.id === id) : undefined), [data.settings]);
  const labelOf = useCallback((id?: string) => (id ? data.settings.find((s) => s.id === id)?.name ?? "—" : "—"), [data.settings]);
  const colorOf = useCallback((id?: string) => (id ? data.settings.find((s) => s.id === id)?.color : undefined), [data.settings]);
  const isSettingInUse = useCallback((id: string) => isSettingReferenced(data.contents, id), [data.contents]);

  const userById = useCallback((id?: string) => (id ? users.find((u) => u.id === id) : undefined), [users]);
  const userName = useCallback((id?: string) => (id ? users.find((u) => u.id === id)?.name ?? "—" : "—"), [users]);
  const userColor = useCallback((id?: string) => (id ? hashUserColor(id) : "#64748b"), []);

  const addSetting: PlannerContextValue["addSetting"] = useCallback(
    (group, partial) => {
      const ts = new Date().toISOString();
      const existing = data.settings.filter((s) => s.group === group);
      const item: SettingItem = {
        id: uid(group),
        group,
        name: partial.name,
        description: partial.description,
        color: partial.color,
        icon: partial.icon,
        order: partial.order ?? (existing.length ? Math.max(...existing.map((s) => s.order)) + 1 : 0),
        isActive: partial.isActive ?? true,
        meta: partial.meta,
        createdAt: ts,
        updatedAt: ts,
      };
      apply((d) => ({ ...d, settings: [...d.settings, item] }));
      return item;
    },
    [apply, data.settings],
  );

  const updateSetting = useCallback<PlannerContextValue["updateSetting"]>(
    (id, patch) => {
      const ts = new Date().toISOString();
      apply((d) => ({ ...d, settings: d.settings.map((s) => (s.id === id ? { ...s, ...patch, id: s.id, group: s.group, updatedAt: ts } : s)) }));
    },
    [apply],
  );

  const toggleSetting = useCallback<PlannerContextValue["toggleSetting"]>(
    (id) => {
      const ts = new Date().toISOString();
      apply((d) => ({ ...d, settings: d.settings.map((s) => (s.id === id ? { ...s, isActive: !s.isActive, updatedAt: ts } : s)) }));
    },
    [apply],
  );

  const deleteSetting = useCallback<PlannerContextValue["deleteSetting"]>(
    (id) => {
      if (isSettingReferenced(data.contents, id)) return false;
      apply((d) => ({ ...d, settings: d.settings.filter((s) => s.id !== id) }));
      void deleteMarketingRow("mkt_settings", id);
      return true;
    },
    [apply, data.contents],
  );

  const addContent = useCallback<PlannerContextValue["addContent"]>(
    (partial) => {
      const ts = new Date().toISOString();
      const item: ContentItem = {
        id: uid("content"),
        links: [],
        coOwnerIds: [],
        ...partial,
        title: partial.title,
        createdAt: ts,
        updatedAt: ts,
        archivedAt: null,
      };
      apply((d) => ({ ...d, contents: [item, ...d.contents] }));
      return item;
    },
    [apply],
  );

  const updateContent = useCallback<PlannerContextValue["updateContent"]>(
    (id, patch) => {
      const ts = new Date().toISOString();
      apply((d) => ({ ...d, contents: d.contents.map((c) => (c.id === id ? { ...c, ...patch, id: c.id, updatedAt: ts } : c)) }));
    },
    [apply],
  );

  const deleteContent = useCallback<PlannerContextValue["deleteContent"]>(
    (id) => { apply((d) => ({ ...d, contents: d.contents.filter((c) => c.id !== id) })); void deleteMarketingRow("mkt_contents", id); },
    [apply],
  );

  const deleteContents = useCallback<PlannerContextValue["deleteContents"]>(
    (ids) => {
      if (ids.length === 0) return;
      const drop = new Set(ids);
      // One state update removes them all → a single saveMarketing upsert of the
      // survivors; each removed row is also hard-deleted from the DB.
      apply((d) => ({ ...d, contents: d.contents.filter((c) => !drop.has(c.id)) }));
      for (const id of ids) void deleteMarketingRow("mkt_contents", id);
    },
    [apply],
  );

  const duplicateContent = useCallback<PlannerContextValue["duplicateContent"]>(
    (id) => {
      const src = data.contents.find((c) => c.id === id);
      if (!src) return undefined;
      const ts = new Date().toISOString();
      const copy: ContentItem = {
        ...src,
        id: uid("content"),
        title: `${src.title} (สำเนา)`,
        links: src.links.map((l) => ({ ...l, id: uid("link"), createdAt: ts })),
        result: undefined,
        createdAt: ts,
        updatedAt: ts,
        archivedAt: null,
      };
      apply((d) => ({ ...d, contents: [copy, ...d.contents] }));
      return copy;
    },
    [apply, data.contents],
  );

  const archiveContent = useCallback<PlannerContextValue["archiveContent"]>(
    (id) => updateContent(id, { archivedAt: new Date().toISOString() }),
    [updateContent],
  );
  const restoreContent = useCallback<PlannerContextValue["restoreContent"]>(
    (id) => updateContent(id, { archivedAt: null }),
    [updateContent],
  );

  const setResult = useCallback<PlannerContextValue["setResult"]>(
    (id, result) => {
      const enriched = enrichResult({ ...result, updatedAt: new Date().toISOString() });
      updateContent(id, { result: enriched });
    },
    [updateContent],
  );

  const setContentDate = useCallback<PlannerContextValue["setContentDate"]>(
    (id, publishDate) => updateContent(id, { publishDate }),
    [updateContent],
  );
  const setContentStatus = useCallback<PlannerContextValue["setContentStatus"]>(
    (id, statusId) => updateContent(id, { statusId }),
    [updateContent],
  );

  const resetAll = useCallback<PlannerContextValue["resetAll"]>(() => {
    setData(buildSeed());
    void resetMarketingAction();
  }, []);

  const targets = data.targets ?? DEFAULT_TARGETS;
  const setLongTarget = useCallback<PlannerContextValue["setLongTarget"]>(
    (pillarId, n) => apply((d) => {
      const cur = d.targets ?? DEFAULT_TARGETS;
      return { ...d, targets: { ...cur, longByPillar: { ...cur.longByPillar, [pillarId]: Math.max(0, Math.round(n)) } } };
    }),
    [apply],
  );
  const setShortTarget = useCallback<PlannerContextValue["setShortTarget"]>(
    (n) => apply((d) => {
      const cur = d.targets ?? DEFAULT_TARGETS;
      return { ...d, targets: { ...cur, shortTotal: Math.max(0, Math.round(n)) } };
    }),
    [apply],
  );
  const setArticlePerDay = useCallback<PlannerContextValue["setArticlePerDay"]>(
    (n) => apply((d) => {
      const cur = d.targets ?? DEFAULT_TARGETS;
      return { ...d, targets: { ...cur, articlePerDay: Math.max(0, Math.round(n)) } };
    }),
    [apply],
  );
  const setPostPerDay = useCallback<PlannerContextValue["setPostPerDay"]>(
    (n) => apply((d) => {
      const cur = d.targets ?? DEFAULT_TARGETS;
      return { ...d, targets: { ...cur, postPerDay: Math.max(0, Math.round(n)) } };
    }),
    [apply],
  );
  const generateFromPlan = useCallback<PlannerContextValue["generateFromPlan"]>(
    (year, month, opts, selectedDays) => {
      const t = data.targets ?? DEFAULT_TARGETS;
      const sel = selectedDays == null ? null : new Set(selectedDays);
      const slots = distributeMonth(year, month, t, sel);
      const ts = new Date().toISOString();
      // The initial pipeline status ("Idea"). Prefer the canonical seeded status,
      // else the lowest-order active status. NOT `.find(first active)` — data.settings
      // arrives from the DB in arbitrary row order (loadMarketing has no ORDER BY), so
      // "first in the array" was landing on Cancelled and stamping every generated slot
      // as cancelled. byGroup("status")[0] (content-form) is safe because it sorts first.
      const activeStatuses = data.settings.filter((s) => s.group === "status" && s.isActive);
      const ideaStatus =
        activeStatuses.find((s) => s.id === "status-idea")?.id ??
        [...activeStatuses].sort((a, b) => a.order - b.order)[0]?.id;
      const pillarName = (id: string) => data.settings.find((s) => s.id === id)?.name ?? "คอนเทนต์";
      // Running per-type counters → each generated slot gets a distinct, readable
      // name ("บทความ #7") instead of many identical "บทความ" — a placeholder the
      // team renames to the real topic later. Numbered in publish-date order.
      let nLong = 0, nShort = 0, nArticle = 0, nPost = 0;
      const items: ContentItem[] = [];
      for (const slot of slots) {
        if (opts.long) {
          for (const lg of slot.longs) {
            for (let k = 0; k < lg.count; k += 1) {
              nLong += 1;
              items.push({ id: uid("content"), title: `${pillarName(lg.pillarId)} — คลิปยาว #${nLong}`, statusId: ideaStatus, contentTypeId: "contentType-long", contentPillarId: lg.pillarId, publishDate: slot.date, links: [], coOwnerIds: [], createdAt: ts, updatedAt: ts, archivedAt: null });
            }
          }
        }
        if (opts.short) {
          for (let k = 0; k < slot.short; k += 1) {
            nShort += 1;
            items.push({ id: uid("content"), title: `คลิปสั้น / Reels #${nShort}`, statusId: ideaStatus, contentTypeId: "contentType-short", publishDate: slot.date, links: [], coOwnerIds: [], createdAt: ts, updatedAt: ts, archivedAt: null });
          }
        }
        if (opts.article) {
          for (let k = 0; k < slot.article; k += 1) {
            nArticle += 1;
            items.push({ id: uid("content"), title: `บทความ #${nArticle}`, statusId: ideaStatus, contentTypeId: "contentType-article", publishDate: slot.date, links: [], coOwnerIds: [], createdAt: ts, updatedAt: ts, archivedAt: null });
          }
        }
        if (opts.post) {
          for (let k = 0; k < slot.post; k += 1) {
            nPost += 1;
            items.push({ id: uid("content"), title: `โพสต์ #${nPost}`, statusId: ideaStatus, contentTypeId: "contentType-post", publishDate: slot.date, links: [], coOwnerIds: [], createdAt: ts, updatedAt: ts, archivedAt: null });
          }
        }
      }
      if (items.length) apply((d) => ({ ...d, contents: [...items, ...d.contents] }));
      return items.length;
    },
    [apply, data.targets, data.settings],
  );

  // ── Job board ──
  const jobs = useMemo(() => data.jobs ?? [], [data.jobs]);
  const appendJobMsg = useCallback(
    (id: string, kind: JobMessageKind, text: string, images: string[], status?: JobStatus) => {
      const ts = new Date().toISOString();
      apply((d) => ({
        ...d,
        jobs: (d.jobs ?? []).map((j) =>
          j.id === id
            ? { ...j, status: status ?? j.status, updatedAt: ts, messages: [...j.messages, { id: uid("msg"), authorId: currentUserId, kind, text, images, createdAt: ts }] }
            : j,
        ),
      }));
    },
    [apply, currentUserId],
  );
  const createJob = useCallback<PlannerContextValue["createJob"]>(
    ({ title, text, images }) => {
      const ts = new Date().toISOString();
      const job: JobOrder = {
        id: uid("job"),
        title: (title || text.split("\n")[0] || "งานใหม่").slice(0, 60),
        createdBy: currentUserId,
        status: "open",
        messages: [{ id: uid("msg"), authorId: currentUserId, kind: "brief", text, images, createdAt: ts }],
        createdAt: ts,
        updatedAt: ts,
      };
      apply((d) => ({ ...d, jobs: [job, ...(d.jobs ?? [])] }));
    },
    [apply, currentUserId],
  );
  const claimJob = useCallback<PlannerContextValue["claimJob"]>(
    (id) => {
      const ts = new Date().toISOString();
      apply((d) => ({ ...d, jobs: (d.jobs ?? []).map((j) => (j.id === id && j.status === "open" ? { ...j, assignedTo: currentUserId, status: "in_progress", updatedAt: ts } : j)) }));
    },
    [apply, currentUserId],
  );
  const addJobMessage = useCallback<PlannerContextValue["addJobMessage"]>((id, msg) => appendJobMsg(id, msg.kind ?? "note", msg.text, msg.images), [appendJobMsg]);
  const submitJob = useCallback<PlannerContextValue["submitJob"]>((id, msg) => appendJobMsg(id, "submit", msg.text, msg.images, "submitted"), [appendJobMsg]);
  const rejectJob = useCallback<PlannerContextValue["rejectJob"]>((id, msg) => appendJobMsg(id, "reject", msg.text, msg.images, "in_progress"), [appendJobMsg]);
  const approveJob = useCallback<PlannerContextValue["approveJob"]>((id, msg) => appendJobMsg(id, "note", msg?.text ?? "✅ เสร็จสิ้นคำสั่ง", msg?.images ?? [], "done"), [appendJobMsg]);

  // ── Keyword planner ──
  const keywords = useMemo(() => data.keywords ?? [], [data.keywords]);
  const addKeyword = useCallback<PlannerContextValue["addKeyword"]>((item) => apply((d) => ({ ...d, keywords: [...(d.keywords ?? []), { ...item, id: uid("kw") }] })), [apply]);
  const updateKeyword = useCallback<PlannerContextValue["updateKeyword"]>((id, patch) => apply((d) => ({ ...d, keywords: (d.keywords ?? []).map((k) => (k.id === id ? { ...k, ...patch, id: k.id } : k)) })), [apply]);
  const deleteKeyword = useCallback<PlannerContextValue["deleteKeyword"]>((id) => { apply((d) => ({ ...d, keywords: (d.keywords ?? []).filter((k) => k.id !== id) })); void deleteMarketingRow("mkt_keywords", id); }, [apply]);
  const loadSampleKeywords = useCallback<PlannerContextValue["loadSampleKeywords"]>(() => apply((d) => ({ ...d, keywords: [...DEFAULT_KEYWORDS] })), [apply]);

  const value = useMemo<PlannerContextValue>(
    () => ({
      ready,
      users,
      userById, userName, userColor,
      settings: data.settings,
      contents: data.contents,
      byGroup, allByGroup, byId, labelOf, colorOf, isSettingInUse,
      addSetting, updateSetting, toggleSetting, deleteSetting,
      addContent, updateContent, deleteContent, deleteContents, duplicateContent, archiveContent, restoreContent,
      setResult, setContentDate, setContentStatus, resetAll,
      targets, setLongTarget, setShortTarget, setArticlePerDay, setPostPerDay, generateFromPlan,
      currentUserId, jobs, createJob, claimJob, addJobMessage, submitJob, rejectJob, approveJob,
      keywords, addKeyword, updateKeyword, deleteKeyword, loadSampleKeywords,
    }),
    [
      ready, users, userById, userName, userColor, data.settings, data.contents, byGroup, allByGroup, byId, labelOf, colorOf, isSettingInUse,
      addSetting, updateSetting, toggleSetting, deleteSetting, addContent, updateContent, deleteContent, deleteContents,
      duplicateContent, archiveContent, restoreContent, setResult, setContentDate, setContentStatus, resetAll,
      targets, setLongTarget, setShortTarget, setArticlePerDay, setPostPerDay, generateFromPlan,
      currentUserId, jobs, createJob, claimJob, addJobMessage, submitJob, rejectJob, approveJob,
      keywords, addKeyword, updateKeyword, deleteKeyword, loadSampleKeywords,
    ],
  );

  return createElement(PlannerContext.Provider, { value }, children);
}

export function usePlanner(): PlannerContextValue {
  const ctx = useContext(PlannerContext);
  if (!ctx) throw new Error("usePlanner must be used within <PlannerProvider>");
  return ctx;
}
