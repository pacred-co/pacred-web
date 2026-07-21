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
  /** Legacy single content type — kept for generated slots and back-compat reads. */
  contentTypeId?: string;
  /** Content formats produced by this item (multi-select). */
  contentTypeIds?: string[];
  contentPillarId?: string;
  funnelStageId?: string;
  customerStageId?: string;
  /** Legacy single platform — kept for back-compat reads; canonical is platformIds. */
  platformId?: string;
  /** Platforms this content goes to (multi-select). */
  platformIds?: string[];
  /** ชื่อ/แคปชั่นดราฟต์แยกต่อแพลตฟอร์ม (platformId → ชื่อ · owner ปอน 2026-07-18) —
   *  เก็บใน JSON blob (mkt_contents.data · ไม่ต้อง migration). ว่าง = ใช้ `title` หลัก. */
  platformTitles?: Record<string, string>;
  /** Content formats published on each selected platform (platformId → contentTypeIds).
   *  Stored inside the existing mkt_contents JSON blob; no DB migration required. */
  platformContentTypeIds?: Record<string, string[]>;
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

/** All content type ids on a content — multi-select with legacy single-value fallback. */
export function contentTypeIdsOf(c: Pick<ContentItem, "contentTypeIds" | "contentTypeId">): string[] {
  if (c.contentTypeIds && c.contentTypeIds.length > 0) return c.contentTypeIds;
  return c.contentTypeId ? [c.contentTypeId] : [];
}

/** Content types assigned to one platform. Old records (and platforms without an
 *  explicit override) inherit the content-level selection. An explicit empty array
 *  means that platform has not been assigned a format yet. */
export function platformContentTypeIdsOf(
  c: Pick<ContentItem, "contentTypeIds" | "contentTypeId" | "platformContentTypeIds">,
  platformId: string,
): string[] {
  if (c.platformContentTypeIds && Object.prototype.hasOwnProperty.call(c.platformContentTypeIds, platformId)) {
    return c.platformContentTypeIds[platformId] ?? [];
  }
  return contentTypeIdsOf(c);
}

/** All service ids on a content — multi-select `serviceIds`, back-compat with the
 *  legacy single `serviceId`. */
export function serviceIdsOf(c: Pick<ContentItem, "serviceIds" | "serviceId">): string[] {
  if (c.serviceIds && c.serviceIds.length > 0) return c.serviceIds;
  return c.serviceId ? [c.serviceId] : [];
}

// ── The whole persisted blob ──
export const PLANNER_SCHEMA_VERSION = 2;

/** Monthly production quota — คลิปยาว/สั้น รวมทั้งเดือน · บทความ ต่อวัน.
 *  โพสต์ ถูกเอาออกจากแผนการผลิต (owner 2026-07-20 "ลบโพสต์ออก") — ประเภท
 *  "โพสต์" ยังใช้กับคอนเทนต์ได้ตามปกติ แค่ไม่มีโควต้าให้วางแผนแล้ว. */
export type ProductionTargets = {
  /** จำนวนคลิปยาว/เดือน — ตัวเลขเดียว (owner 2026-07-20 "ย่อคลิปยาวให้เป็นแค่คลิปยาว
   *  ไม่ต้องมีคอนเทนต์ให้เลือก มันเข้าใจยาก"). */
  longTotal?: number;
  /** LEGACY — เคยแตกโควต้าคลิปยาวตามเสาหลัก. ยังอ่านอยู่เพื่อไม่ให้แผนเดิมหาย:
   *  ถ้าไม่มี longTotal จะรวมค่าในนี้มาใช้แทน (longTotalOf). */
  longByPillar: Record<string, number>;
  shortTotal: number; // จำนวนคลิปสั้น/เดือน (รวม)
  articlePerDay?: number; // บทความ ยืนพื้น/วัน (default 3 · แก้ได้)
};

/** โควต้าคลิปยาว/เดือน — ตัวเลขเดียว โดยยังรับข้อมูลเก่าที่แตกตามเสาหลักได้. */
export function longTotalOf(t: Pick<ProductionTargets, "longTotal" | "longByPillar">): number {
  if (typeof t.longTotal === "number") return Math.max(0, t.longTotal);
  return Object.values(t.longByPillar ?? {}).reduce((s, n) => s + (n > 0 ? n : 0), 0);
}

/**
 * แผนการผลิตที่เซฟไว้ใช้ซ้ำ (owner 2026-07-20 "วางแผนเสร็จ ทำให้สามารถเซฟเป็น preset ได้").
 * เก็บทั้งโควต้า + วันที่เลือก + ค่าที่กำหนดเองรายวัน — กดใช้แล้วได้แผนเดิมทั้งชุด
 * ไม่ต้องตั้งใหม่ทุกเดือน. วันเก็บเป็น "วันที่ 1..31" ไม่ผูกเดือน จึงใช้ข้ามเดือนได้
 * (วันที่เกินจำนวนวันของเดือนนั้นจะถูกตัดทิ้งตอนใช้).
 */
export type PlanPreset = {
  id: string;
  name: string;
  targets: ProductionTargets;
  selectedDays: number[];
  /** day (1..31) → ค่าที่ pin ไว้ต่อประเภท */
  overrides: Record<number, { long?: number; short?: number; article?: number; post?: number }>;
  createdAt: string;
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
/**
 * แพลตฟอร์มที่ "คนค้นหา" คีย์เวิร์ดนั้น (owner 2026-07-20 "ทำให้ keyword แยกแพลตฟอร์มด้วย").
 * คนละชุดกับ SettingGroup "platform" ของคอนเทนต์ ตั้งใจแยก — อันนั้นคือ "ที่เราโพสต์"
 * (LINE OA · Shopee · เว็บ) ซึ่งไม่มี Google เพราะเราไม่ได้โพสต์ลง Google.
 *
 * `google_youtube` = ค่าตั้งต้นของข้อมูลเดิม: Keyword Planner ให้ volume ที่ครอบทั้ง
 * Google Search + YouTube มาในไฟล์เดียว แยกไม่ได้ตั้งแต่ต้นทาง.
 */
export const KEYWORD_PLATFORMS = [
  { id: "google_youtube", name: "Google / YouTube" },
  { id: "google", name: "Google" },
  { id: "youtube", name: "YouTube" },
  { id: "tiktok", name: "TikTok" },
  { id: "facebook", name: "Facebook" },
  { id: "shopee", name: "Shopee" },
  { id: "lazada", name: "Lazada" },
] as const;
export type KeywordPlatformId = (typeof KEYWORD_PLATFORMS)[number]["id"];

/** แพลตฟอร์มของคีย์เวิร์ด — ว่าง = ข้อมูลเดิมจาก Keyword Planner (Google/YouTube). */
export function keywordPlatformOf(k: Pick<KeywordItem, "platform">): KeywordPlatformId {
  return (k.platform as KeywordPlatformId) || "google_youtube";
}
export function keywordPlatformLabel(id: string): string {
  return KEYWORD_PLATFORMS.find((p) => p.id === id)?.name ?? id;
}

export type KeywordItem = {
  id: string;
  service: string; // บริการที่ผูกกับคีย์เวิร์ด (group)
  tier: KeywordTier; // หลัก / รอง / ย่อย
  keyword: string;
  volume?: number; // ค้นหา/เดือน
  cpc?: number; // ฿/คลิก ("แพงไหม")
  difficulty?: number; // 0-100 (การแข่งขัน)
  intent?: string; // ความตั้งใจค้นหา (optional)
  /** แพลตฟอร์มที่คนค้นคำนี้ — ว่าง = ข้อมูลเดิม (Google/YouTube). */
  platform?: string;
  note?: string;
};

export type PlannerData = {
  version: number;
  settings: SettingItem[];
  contents: ContentItem[];
  targets?: ProductionTargets;
  presets?: PlanPreset[];
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
