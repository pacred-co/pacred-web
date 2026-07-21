/**
 * Content filtering (owner brief §8) — pure. Link-type-aware predicates
 * (has draft / has final) take a name resolver so this stays store-free.
 */
import type { ContentItem } from "./types";
import { contentTypeIdsOf, platformIdsOf, serviceIdsOf } from "./types";
import { isResultEmpty } from "./performance";

export type ContentFilter = {
  keyword?: string;
  month?: string; // "YYYY-MM" against publishDate
  dateFrom?: string;
  dateTo?: string;
  platformId?: string;
  statusId?: string;
  ownerId?: string;
  contentTypeId?: string;
  marketingGoalId?: string;
  contentPillarId?: string;
  funnelStageId?: string;
  serviceId?: string;
  campaignId?: string;
  priorityId?: string;
  hasDraft?: boolean;
  hasFinal?: boolean;
  hasResult?: boolean;
  shouldRepeat?: boolean;
  /** Content-fill status: "yes" = เติมเนื้อหาแล้ว · "no" = ยังเป็นโครงเปล่า. */
  filled?: "yes" | "no";
  includeArchived?: boolean;
};

export type LinkTypeNamer = (linkTypeId: string) => string;

export const EMPTY_FILTER: ContentFilter = {};

export function isFilterActive(f: ContentFilter): boolean {
  return Object.entries(f).some(([k, v]) => k !== "includeArchived" && v !== undefined && v !== "" && v !== false);
}

function hasDraftLink(c: ContentItem, namer: LinkTypeNamer): boolean {
  return c.links.some((l) => /draft|ดราฟ|ร่าง/i.test(namer(l.linkTypeId)));
}
function hasFinalLink(c: ContentItem, namer: LinkTypeNamer): boolean {
  return c.links.some((l) => /final|publish|งานจริง|โพสต์|เผยแพร่/i.test(namer(l.linkTypeId)));
}

// The content fields the team fills in per slot (NOT classification/schedule/owner
// metadata) — any one non-empty means the slot is no longer a bare skeleton.
const CONTENT_TEXT_FIELDS: (keyof ContentItem)[] = [
  "topic", "brief", "targetAudience", "keyword", "hashtag", "cta",
  "hook", "painPoint", "context", "storyTelling", "proof", "authority",
  "visual", "organicSelling", "branding", "esg", "contact", "note",
];

/** True once a slot has real content (topic/brief/craft field/link); false while
 *  it's still the bare generated skeleton ("คลิปสั้น #1" with nothing filled in). */
export function isContentFilled(c: ContentItem): boolean {
  if (c.links.length > 0) return true;
  return CONTENT_TEXT_FIELDS.some((k) => String(c[k] ?? "").trim() !== "");
}

export function applyFilter(items: ContentItem[], f: ContentFilter): ContentItem[] {
  const kw = f.keyword?.trim().toLowerCase();
  return items.filter((c) => {
    if (!f.includeArchived && c.archivedAt) return false;

    if (kw) {
      const hay = [c.title, c.topic, c.brief, c.keyword, c.hashtag, c.cta, c.targetAudience, c.note]
        .filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    if (f.month && (c.publishDate ?? "").slice(0, 7) !== f.month) return false;
    if (f.dateFrom && (c.publishDate ?? "") < f.dateFrom) return false;
    if (f.dateTo && (c.publishDate ?? "") > f.dateTo) return false;

    if (f.platformId && !platformIdsOf(c).includes(f.platformId)) return false;
    if (f.statusId && c.statusId !== f.statusId) return false;
    if (f.ownerId && c.ownerId !== f.ownerId && !c.coOwnerIds?.includes(f.ownerId)) return false;
    if (f.contentTypeId && !contentTypeIdsOf(c).includes(f.contentTypeId)) return false;
    if (f.marketingGoalId && c.marketingGoalId !== f.marketingGoalId) return false;
    if (f.contentPillarId && c.contentPillarId !== f.contentPillarId) return false;
    if (f.funnelStageId && c.funnelStageId !== f.funnelStageId) return false;
    if (f.serviceId && !serviceIdsOf(c).includes(f.serviceId)) return false;
    if (f.campaignId && c.campaignId !== f.campaignId) return false;
    if (f.priorityId && c.priorityId !== f.priorityId) return false;

    if (f.hasResult && isResultEmpty(c.result)) return false;
    if (f.shouldRepeat && c.result?.shouldRepeat !== "yes") return false;

    if (f.filled === "yes" && !isContentFilled(c)) return false;
    if (f.filled === "no" && isContentFilled(c)) return false;

    return true;
  });
}

/** Draft/final filters need the namer — applied as a second pass when set. */
export function applyLinkFilter(items: ContentItem[], f: ContentFilter, namer: LinkTypeNamer): ContentItem[] {
  return items.filter((c) => {
    if (f.hasDraft && !hasDraftLink(c, namer)) return false;
    if (f.hasFinal && !hasFinalLink(c, namer)) return false;
    return true;
  });
}
