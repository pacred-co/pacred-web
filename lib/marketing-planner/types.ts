/**
 * Marketing Content Planner — central data model (ปอน 2026-06-30).
 *
 * Prototype persistence = localStorage (lib/marketing-planner/store.ts). The shape
 * here is the SINGLE source of truth so swapping to Supabase later is a data-layer
 * change only (UI untouched). Every dropdown across the app is a `SettingItem` keyed
 * by `group` — nothing is hardcoded in forms (owner brief §3, §10).
 */

// ── Dropdown groups — every selectable option in the app is one of these ──
export type SettingGroup =
  | "platform"
  | "channel"
  | "contentType"
  | "marketingGoal"
  | "contentPillar"
  | "funnelStage"
  | "customerStage"
  | "service"
  | "status"
  | "owner"
  | "priority"
  | "campaign"
  | "linkType"
  | "format"
  | "tone";

export const SETTING_GROUPS: { group: SettingGroup; labelTh: string }[] = [
  { group: "platform", labelTh: "แพลตฟอร์ม" },
  { group: "channel", labelTh: "ช่องทางขยายผล (Distribution)" },
  { group: "contentType", labelTh: "ประเภทคอนเทนต์" },
  // NOTE: "owner" is intentionally NOT here — owners come from real admin
  // accounts (PlannerUser), not an editable dropdown.
  { group: "marketingGoal", labelTh: "เป้าหมายการตลาด" },
  { group: "contentPillar", labelTh: "เสาหลักคอนเทนต์ (Pillar)" },
  { group: "funnelStage", labelTh: "Funnel Stage" },
  { group: "customerStage", labelTh: "Stage ของลูกค้า" },
  { group: "service", labelTh: "บริการที่เกี่ยวข้อง" },
  { group: "status", labelTh: "สถานะงาน" },
  { group: "owner", labelTh: "ผู้รับผิดชอบ / ทีม" },
  { group: "priority", labelTh: "ความสำคัญ (Priority)" },
  { group: "campaign", labelTh: "แคมเปญ" },
  { group: "linkType", labelTh: "ชนิดลิงก์" },
  { group: "format", labelTh: "รูปแบบ (Format)" },
  { group: "tone", labelTh: "โทน (Tone)" },
];

/**
 * One dropdown option. Extra per-group fields live in `meta`:
 *  - status:   { order, isDone, inCalendar, inKanban }
 *  - owner:    { position, team, avatar }
 *  - campaign: { goal, startDate, endDate, budget, ownerId, status }
 */
export type SettingItem = {
  id: string;
  group: SettingGroup;
  name: string;
  description?: string;
  color?: string; // hex, e.g. "#1877F2"
  icon?: string; // free-text / lucide name (optional)
  order: number;
  isActive: boolean;
  meta?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

// ── Link attached to a content item ──
export type ContentLink = {
  id: string;
  linkTypeId: string; // → SettingItem(group="linkType")
  url: string;
  title?: string;
  note?: string;
  createdAt: string;
};

export type ShouldRepeat = "" | "yes" | "no" | "maybe";

export type ResultStatus =
  | "none" // ยังไม่กรอกผล
  | "waiting" // รอข้อมูล
  | "low" // ผลลัพธ์ต่ำ
  | "mid" // ผลลัพธ์กลาง
  | "high" // ผลลัพธ์ดี
  | "repeat" // ควรทำซ้ำ
  | "rework"; // ควรปรับใหม่

// ── Measured result for a content item ──
export type ContentResult = {
  actualPublishDate?: string;
  reach?: number;
  impression?: number;
  view?: number;
  watchTime?: number; // seconds
  like?: number;
  comment?: number;
  share?: number;
  save?: number;
  click?: number;
  ctr?: number; // %
  inbox?: number; // DM / LINE ทัก
  lead?: number;
  qualifiedLead?: number;
  quotation?: number;
  deal?: number;
  revenue?: number;
  cost?: number;
  roas?: number;
  // ── Goal-specific metrics (ปอน MKT framework §5) ──
  lineAdd?: number; // ให้คนทัก — LINE add
  callback?: number; // ให้ลูกค้าเก่ากลับมา — โทรกลับ
  organicTraffic?: number; // ให้คนค้นหาเจอ
  keywordRanking?: number; // อันดับคีย์เวิร์ด (เลขอันดับ — ยิ่งน้อยยิ่งดี)
  review?: number; // ให้คนเชื่อใจ — รีวิวจากลูกค้าจริง
  mention?: number; // ให้คนพูดถึง — การกล่าวถึง
  backlink?: number; // ให้คนพูดถึง — backlink ภายนอก
  broadcastCtr?: number; // ลูกค้าเก่า — Broadcast CTR (%)
  performanceScore?: number; // 0-100 (computed)
  resultStatus?: ResultStatus; // derived unless overridden
  resultStatusOverride?: ResultStatus | "";
  insight?: string;
  nextAction?: string;
  shouldRepeat?: ShouldRepeat;
  repeatReason?: string;
  note?: string;
  updatedAt?: string;
};

// ── A content item (the core record) ──
export type ContentItem = {
  id: string;
  title: string;
  topic?: string;
  brief?: string;
  marketingGoalId?: string;
  contentTypeId?: string;
  contentPillarId?: string;
  funnelStageId?: string;
  customerStageId?: string;
  /** Legacy single platform — kept for back-compat reads; canonical is platformIds. */
  platformId?: string;
  /** Platforms this content goes to (multi-select). */
  platformIds?: string[];
  /** Legacy single service — kept for back-compat reads; canonical is serviceIds. */
  serviceId?: string;
  /** Services this content relates to (multi-select). */
  serviceIds?: string[];
  campaignId?: string;
  formatId?: string;
  toneId?: string;
  targetAudience?: string;
  keyword?: string; // SEO Keyword
  hashtag?: string;
  cta?: string;
  // ── Content craft elements (ปอน MKT framework §3) ──
  hook?: string;
  painPoint?: string;
  context?: string;
  storyTelling?: string;
  proof?: string;
  authority?: string;
  visual?: string;
  organicSelling?: string;
  branding?: string;
  esg?: string;
  contact?: string;
  // Distribution / amplification channels (§4) — SettingItem(group="channel")
  channelIds?: string[];
  priorityId?: string;
  statusId?: string;
  ownerId?: string;
  coOwnerIds?: string[];
  startDate?: string; // YYYY-MM-DD
  deadline?: string; // YYYY-MM-DD
  publishDate?: string; // YYYY-MM-DD ← drives the calendar
  publishTime?: string; // HH:mm
  note?: string;
  links: ContentLink[];
  result?: ContentResult;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
};

/** All platform ids on a content — the multi-select `platformIds`, falling back to
 *  the legacy single `platformId` so pre-multi data keeps working everywhere. */
export function platformIdsOf(c: Pick<ContentItem, "platformIds" | "platformId">): string[] {
  if (c.platformIds && c.platformIds.length > 0) return c.platformIds;
  return c.platformId ? [c.platformId] : [];
}

/** All service ids on a content — multi-select `serviceIds`, back-compat with the
 *  legacy single `serviceId`. */
export function serviceIdsOf(c: Pick<ContentItem, "serviceIds" | "serviceId">): string[] {
  if (c.serviceIds && c.serviceIds.length > 0) return c.serviceIds;
  return c.serviceId ? [c.serviceId] : [];
}

// ── The whole persisted blob ──
export const PLANNER_SCHEMA_VERSION = 2;

/** Monthly production quota (ปอน 2026-07-01): clips per pillar/total + daily baseline for บทความ/โพสต์. */
export type ProductionTargets = {
  longByPillar: Record<string, number>; // pillarId → จำนวนคลิปยาว/เดือน
  shortTotal: number; // จำนวนคลิปสั้น/เดือน (รวม)
  articlePerDay?: number; // บทความ ยืนพื้น/วัน (default 3 · แก้ได้)
  postPerDay?: number; // โพสต์ ยืนพื้น/วัน (default 3 · แก้ได้)
};

// ── Job board (สั่งงาน/รับงาน · ปอน 2026-07-01) ──
export type JobStatus = "open" | "in_progress" | "submitted" | "done";
export type JobMessageKind = "brief" | "note" | "submit" | "reject";

export type JobMessage = {
  id: string;
  authorId: string;
  kind: JobMessageKind;
  text: string;
  images: string[]; // compressed base64 data URLs
  createdAt: string;
};

export type JobOrder = {
  id: string;
  title: string;
  createdBy: string; // userId who ordered
  assignedTo?: string; // userId who claimed it
  status: JobStatus;
  messages: JobMessage[];
  createdAt: string;
  updatedAt: string;
};

// ── Keyword planner (Keyword บริการ · ปอน 2026-07-01) ──
export type KeywordTier = "primary" | "secondary" | "longtail";
export type KeywordItem = {
  id: string;
  service: string; // บริการที่ผูกกับคีย์เวิร์ด (group)
  tier: KeywordTier; // หลัก / รอง / ย่อย
  keyword: string;
  volume?: number; // ค้นหา/เดือน
  cpc?: number; // ฿/คลิก ("แพงไหม")
  difficulty?: number; // 0-100 (การแข่งขัน)
  intent?: string; // ความตั้งใจค้นหา (optional)
  note?: string;
};

export type PlannerData = {
  version: number;
  settings: SettingItem[];
  contents: ContentItem[];
  targets?: ProductionTargets;
  jobs?: JobOrder[];
  keywords?: KeywordItem[];
};

/** A real admin/staff account from the system — the source for owner/co-owner. */
export type PlannerUser = {
  id: string;
  name: string;
  role?: string;
  avatarUrl?: string | null;
};
