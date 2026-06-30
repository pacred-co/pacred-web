/**
 * Default settings (every dropdown group) + mock content so the planner is
 * usable on first open (owner brief §3, §12 "ทำ Mock Data เริ่มต้นมาให้ครบ").
 * Seed IDs are deterministic (`${group}-${key}`) so the mock contents can
 * reference them. User-created items use runtime uids (store.ts).
 */
import type { ContentItem, KeywordItem, PlannerData, ProductionTargets, SettingGroup, SettingItem } from "./types";
import { PLANNER_SCHEMA_VERSION } from "./types";
import { enrichResult } from "./performance";

/** Default monthly production quota (ปอน 2026-07-01 · long breakdown = 58, short = 280). Editable in-app. */
export const DEFAULT_TARGETS: ProductionTargets = {
  longByPillar: {
    "contentPillar-ourwork": 20,
    "contentPillar-knowledge": 10,
    "contentPillar-news": 10,
    "contentPillar-onsite": 2,
    "contentPillar-people": 5,
    "contentPillar-howto": 7,
    "contentPillar-promo": 4,
  },
  shortTotal: 280,
  articlePerDay: 3,
  postPerDay: 3,
};

const PALETTE = [
  "#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#84cc16", "#06b6d4", "#a855f7",
  "#0891b2", "#d946ef", "#22c55e", "#eab308", "#f43f5e", "#3b82f6",
];

type Def = { key: string; name: string; color?: string; description?: string; meta?: Record<string, unknown> };

function mk(group: SettingGroup, ts: string, defs: Def[]): SettingItem[] {
  return defs.map((d, i) => ({
    id: `${group}-${d.key}`,
    group,
    name: d.name,
    description: d.description,
    color: d.color ?? PALETTE[i % PALETTE.length],
    order: i,
    isActive: true,
    meta: d.meta,
    createdAt: ts,
    updatedAt: ts,
  }));
}

function buildSettings(ts: string): SettingItem[] {
  return [
    ...mk("platform", ts, [
      { key: "facebook", name: "Facebook", color: "#1877F2" },
      { key: "tiktok", name: "TikTok", color: "#111827" },
      { key: "instagram", name: "Instagram", color: "#E4405F" },
      { key: "youtube", name: "YouTube", color: "#FF0000" },
      { key: "website", name: "Website", color: "#0ea5e9" },
      { key: "blog", name: "Blog", color: "#6366f1" },
      { key: "lineoa", name: "LINE OA", color: "#06C755" },
      { key: "gbp", name: "Google Business", color: "#4285F4" },
      { key: "shopee", name: "Shopee", color: "#EE4D2D" },
      { key: "lazada", name: "Lazada", color: "#0F146D" },
      { key: "email", name: "Email", color: "#6b7280" },
    ]),
    ...mk("channel", ts, [
      { key: "seo", name: "SEO", color: "#16a34a" }, { key: "local-seo", name: "Local SEO", color: "#16a34a" },
      { key: "ai-search", name: "AI Search", color: "#16a34a" },
      { key: "google-ads", name: "Google Ads", color: "#ef4444" }, { key: "meta-ads", name: "Meta Ads", color: "#ef4444" },
      { key: "tiktok-ads", name: "TikTok Ads", color: "#ef4444" }, { key: "remarketing", name: "Remarketing", color: "#ef4444" },
      { key: "backlink", name: "Backlink", color: "#8b5cf6" }, { key: "pr", name: "PR / สนับสนุน", color: "#8b5cf6" },
      { key: "influencer", name: "Influencer", color: "#8b5cf6" }, { key: "partner", name: "Partner Website", color: "#8b5cf6" },
      { key: "podcast", name: "Podcast", color: "#8b5cf6" },
      { key: "crm", name: "CRM", color: "#0ea5e9" }, { key: "line-broadcast", name: "LINE Broadcast", color: "#06C755" },
      { key: "call-old", name: "โทรลูกค้าเก่า", color: "#0ea5e9" }, { key: "referral", name: "Referral", color: "#0ea5e9" },
      { key: "loyalty", name: "Loyalty", color: "#0ea5e9" }, { key: "email", name: "Email", color: "#6b7280" },
      { key: "sms", name: "SMS", color: "#6b7280" },
    ]),
    ...mk("contentType", ts, [
      { key: "image", name: "ภาพเดี่ยว" }, { key: "album", name: "Album" },
      { key: "short", name: "Short Video" }, { key: "long", name: "Long Video" },
      { key: "reel", name: "Reel" }, { key: "tiktok", name: "TikTok" },
      { key: "yt-shorts", name: "YouTube Shorts" }, { key: "yt-long", name: "YouTube Long" },
      { key: "article", name: "บทความ" }, { key: "post", name: "โพสต์" },
      { key: "blog", name: "Blog" }, { key: "seo", name: "SEO Article" },
      { key: "ads", name: "Ads Creative" }, { key: "case", name: "Case Study" },
      { key: "review", name: "Review" }, { key: "info", name: "Infographic" },
      { key: "live", name: "Live" }, { key: "story", name: "Story" },
      { key: "broadcast", name: "Broadcast" }, { key: "landing", name: "Landing Page" },
    ]),
    ...mk("marketingGoal", ts, [
      { key: "awareness", name: "ให้คนรู้จัก", description: "รู้จักแบรนด์ + บริการ นำเข้า/ส่งออก/เคลียร์ ครบจบด้านโลจิสติกส์" },
      { key: "trust", name: "ให้คนเชื่อใจ", description: "เชื่อว่าแบรนด์/คน/ทีมนี้พาเราจบงานได้ ไม่มีปัญหา" },
      { key: "seo-find", name: "ให้คนค้นหาเจอ", description: "เวลาลูกค้าจะหา/ใช้บริการ ต้องเจอเราก่อน" },
      { key: "dm", name: "ให้คนทัก", description: "คนที่เจอปัญหา/อยากใช้บริการ ทักเข้ามา → สร้างยอดขายเพิ่ม" },
      { key: "retention", name: "ให้ลูกค้าเก่ากลับมา", description: "วนในหัวลูกค้า สร้างภาพจำ ให้นึกถึงเราก่อน (เหมือนนึกถึงสะดวกซื้อ = 7-11)" },
      { key: "advocacy", name: "ให้คนนอกช่วยพูดถึงเรา", description: "รู้จักวงกว้างผ่านคนที่เขาชื่นชอบ เพิ่มความน่าเชื่อถือ" },
    ]),
    ...mk("contentPillar", ts, [
      { key: "knowledge", name: "ความรู้", description: "เอาปัญหา/คำถามลูกค้ามาอธิบายแบบง่าย" },
      { key: "ourwork", name: "ผลงานของเรา", description: "เคสจริง: ลูกค้าต้องการอะไร → Pacred ทำอะไร → จบยังไง" },
      { key: "news", name: "ข่าวสาร / เตือนภัย", description: "ข่าว/ความเสี่ยงที่กระทบลูกค้านำเข้า" },
      { key: "onsite", name: "ลงหน้างานจริง", description: "ถ่ายโกดัง ตู้ รถ ทีมงาน เอกสาร ขั้นตอนหลังบ้าน — ลุยหน้างาน" },
      { key: "review", name: "รีวิว / เจาะลึกบริการ", description: "เหมาะกับใคร ข้อดี ข้อจำกัด ราคาเริ่มต้น ขั้นตอน เอกสารที่ต้องใช้" },
      { key: "howto", name: "วิธีใช้บริการ / เริ่มต้น", description: "คู่มือว่าลูกค้าเริ่มยังไง ส่งข้อมูลอะไร เตรียมอะไร" },
      { key: "people", name: "ตัวตนคนในแบรนด์", description: "ESG (เริ่มจากพนักงาน) + Q&A คนใน มุมงาน/ความคิด/ความรับผิดชอบ" },
      { key: "challenge", name: "ชาเลนจ์", description: "หาสินค้า → โพสต์ขายในเว็บ → ส่งออก (นำเข้าเพื่อผลิต ตีแบรนด์ส่งออก)" },
      { key: "faq", name: "ลูกค้าถามเซลล์ → คลิปตอบ", description: "เอาคำถามจริงที่ลูกค้าถามเซลล์มาทำคลิปตอบ" },
      { key: "promo", name: "โปรโมชั่น", description: "แนะนำโปร 1688 / เถาเป่า / อาลีบาบา" },
    ]),
    ...mk("funnelStage", ts, [
      { key: "awareness", name: "Awareness", color: "#0ea5e9" },
      { key: "interest", name: "Interest", color: "#6366f1" },
      { key: "consideration", name: "Consideration", color: "#8b5cf6" },
      { key: "conversion", name: "Conversion", color: "#22c55e" },
      { key: "retention", name: "Retention", color: "#14b8a6" },
      { key: "loyalty", name: "Loyalty", color: "#f59e0b" },
      { key: "referral", name: "Referral", color: "#ec4899" },
    ]),
    ...mk("customerStage", ts, [
      { key: "new", name: "ลูกค้าใหม่" }, { key: "interested", name: "ลูกค้าที่กำลังสนใจ" },
      { key: "contacted", name: "ลูกค้าที่ทักมาแล้ว" }, { key: "quoted", name: "ลูกค้าที่ขอราคา" },
      { key: "bought", name: "ลูกค้าที่เคยซื้อ" }, { key: "lapsed", name: "ลูกค้าเก่าหาย" },
      { key: "regular", name: "ลูกค้าประจำ" }, { key: "partner", name: "Partner" },
    ]),
    ...mk("service", ts, [
      { key: "import-cn", name: "นำเข้าจากจีน" }, { key: "lcl", name: "LCL" },
      { key: "fcl", name: "FCL" }, { key: "cargo", name: "Cargo" },
      { key: "freight", name: "Freight" }, { key: "air", name: "Air Freight" },
      { key: "sea", name: "Sea Freight" }, { key: "truck", name: "Truck Freight" },
      { key: "express", name: "Express" }, { key: "customs", name: "เคลียร์ศุลกากร" },
      { key: "decl", name: "ใบขน" }, { key: "taxinv", name: "ใบกำกับ" },
      { key: "shop", name: "ฝากสั่ง" }, { key: "transfer", name: "ฝากโอน" },
      { key: "export", name: "ส่งออก" },
      { key: "import-other", name: "นำเข้าประเทศอื่น" }, { key: "warehouse-other", name: "เปิดโกดังประเทศอื่น" },
      { key: "export-other", name: "ส่งออกประเทศอื่น" }, { key: "permit", name: "อย./มอก./เกษตร/ประมง" },
      { key: "fumigation", name: "ฟูมิเกชัน / รมยา (ลมควัน)" }, { key: "crate", name: "ตีลังไม้" },
      { key: "rushing", name: "รัชชิ่ง" },
    ]),
    ...mk("status", ts, [
      { key: "idea", name: "Idea", color: "#94a3b8", meta: { isDone: false, inCalendar: true, inKanban: true } },
      { key: "brief", name: "Brief", color: "#64748b", meta: { isDone: false, inCalendar: false, inKanban: true } },
      { key: "in-progress", name: "In Progress", color: "#3b82f6", meta: { isDone: false, inCalendar: true, inKanban: true } },
      { key: "draft", name: "Draft", color: "#8b5cf6", meta: { isDone: false, inCalendar: true, inKanban: true } },
      { key: "review", name: "Review", color: "#f59e0b", meta: { isDone: false, inCalendar: true, inKanban: true } },
      { key: "approved", name: "Approved", color: "#10b981", meta: { isDone: false, inCalendar: true, inKanban: true } },
      { key: "scheduled", name: "Scheduled", color: "#06b6d4", meta: { isDone: false, inCalendar: true, inKanban: true } },
      { key: "published", name: "Published", color: "#22c55e", meta: { isDone: true, inCalendar: true, inKanban: true } },
      { key: "reported", name: "Reported", color: "#14b8a6", meta: { isDone: true, inCalendar: true, inKanban: true } },
      { key: "rework", name: "Rework", color: "#ef4444", meta: { isDone: false, inCalendar: true, inKanban: true } },
      { key: "cancelled", name: "Cancelled", color: "#6b7280", meta: { isDone: false, inCalendar: false, inKanban: true } },
    ]),
    // owner is NOT seeded — owners come from real admin accounts (PlannerUser).
    ...mk("priority", ts, [
      { key: "low", name: "Low", color: "#94a3b8" },
      { key: "medium", name: "Medium", color: "#3b82f6" },
      { key: "high", name: "High", color: "#f59e0b" },
      { key: "urgent", name: "Urgent", color: "#ef4444" },
    ]),
    ...mk("campaign", ts, [
      { key: "midyear", name: "Mid-Year Import Fair", color: "#6366f1", meta: { goal: "ดันยอดนำเข้ากลางปี", budget: 50000, status: "active" } },
      { key: "newuser", name: "โปรสมาชิกใหม่", color: "#22c55e", meta: { goal: "เพิ่มสมาชิกใหม่", budget: 20000, status: "active" } },
    ]),
    ...mk("linkType", ts, [
      { key: "brief", name: "Brief" }, { key: "draft", name: "Draft" },
      { key: "draft-video", name: "Draft Video" }, { key: "draft-image", name: "Draft Image" },
      { key: "final", name: "Final Work" }, { key: "published", name: "Published Post" },
      { key: "result", name: "Result" }, { key: "report", name: "Report" },
      { key: "raw", name: "Raw File" }, { key: "reference", name: "Reference" },
      { key: "other", name: "Other" },
    ]),
    ...mk("format", ts, [
      { key: "vertical", name: "แนวตั้ง 9:16" }, { key: "square", name: "จัตุรัส 1:1" },
      { key: "landscape", name: "แนวนอน 16:9" }, { key: "carousel", name: "Carousel" },
      { key: "text", name: "ข้อความ" },
    ]),
    ...mk("tone", ts, [
      { key: "formal", name: "ทางการ" }, { key: "friendly", name: "เป็นกันเอง" },
      { key: "fun", name: "สนุก/ตลก" }, { key: "edu", name: "ให้ความรู้" },
      { key: "sell", name: "ขายของ" }, { key: "inspire", name: "สร้างแรงบันดาลใจ" },
    ]),
  ];
}

function dstr(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function buildContents(ts: string): ContentItem[] {
  const base = (over: Partial<ContentItem>): ContentItem => ({
    id: over.id!,
    title: over.title ?? "",
    links: over.links ?? [],
    createdAt: ts,
    updatedAt: ts,
    archivedAt: null,
    ...over,
  });

  return [
    base({
      id: "seed-c1",
      title: "นำเข้าจากจีนแบบ LCL ต้องรู้อะไรบ้าง",
      topic: "คู่มือนำเข้า LCL",
      brief: "อธิบายขั้นตอน LCL ตั้งแต่สั่ง → ตู้รวม → เคลียร์ → ส่ง",
      marketingGoalId: "marketingGoal-seo-find", contentTypeId: "contentType-yt-long",
      contentPillarId: "contentPillar-knowledge", funnelStageId: "funnelStage-awareness",
      platformId: "platform-youtube", serviceId: "service-lcl", campaignId: "campaign-midyear",
      formatId: "format-landscape", toneId: "tone-edu",
      keyword: "นำเข้า LCL จีน", cta: "ทักแชทรับเรทพิเศษ", priorityId: "priority-high",
      hook: "นำเข้า LCL ครั้งแรก เสียค่าโง่ตรงไหนบ้าง?", painPoint: "กลัวของติดด่าน เสียภาษีเกิน ไม่รู้ขั้นตอน",
      proof: "คลิปจริงจากโกดัง + ใบขนจริง", authority: "ทีม Pacred เคลียร์มาแล้วหลักพันตู้",
      channelIds: ["channel-seo", "channel-meta-ads", "channel-crm"],
      statusId: "status-published", ownerId: "owner-pond", coOwnerIds: ["owner-pop"],
      publishDate: dstr(-6), publishTime: "10:00",
      links: [
        { id: "seed-l1", linkTypeId: "linkType-published", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "โพสต์จริง YouTube", createdAt: ts },
      ],
      result: enrichResult({ actualPublishDate: dstr(-6), reach: 12000, view: 8400, like: 320, comment: 45, share: 60, save: 110, click: 240, inbox: 38, lead: 22, deal: 4, revenue: 86000, cost: 5000, shouldRepeat: "yes", repeatReason: "ทักเยอะ ปิดการขายได้จริง", insight: "หัวข้อ how-to ได้ lead ดี" }),
    }),
    base({
      id: "seed-c2",
      title: "รีลรีวิวลูกค้าตู้คอนเทนเนอร์ FCL",
      topic: "รีวิวลูกค้า FCL",
      marketingGoalId: "marketingGoal-trust", contentTypeId: "contentType-reel",
      contentPillarId: "contentPillar-review", funnelStageId: "funnelStage-consideration",
      platformId: "platform-tiktok", serviceId: "service-fcl",
      formatId: "format-vertical", toneId: "tone-friendly",
      priorityId: "priority-medium", statusId: "status-published",
      ownerId: "owner-santa", publishDate: dstr(-2), publishTime: "18:30",
      links: [{ id: "seed-l2", linkTypeId: "linkType-published", url: "https://www.tiktok.com/@scout2015/video/6718335390845095173", title: "TikTok รีวิว", createdAt: ts }],
      result: enrichResult({ actualPublishDate: dstr(-2), reach: 5400, view: 4800, like: 210, comment: 18, share: 22, save: 30, click: 60, inbox: 9, lead: 3, shouldRepeat: "maybe", insight: "ยอดวิวโอเค แต่ทักน้อย" }),
    }),
    base({
      id: "seed-c3",
      title: "อินโฟกราฟิก: ค่าใช้จ่ายเคลียร์ศุลกากร",
      brief: "แยกค่าธรรมเนียม + ภาษี + ค่าบริการ ให้เข้าใจง่าย",
      marketingGoalId: "marketingGoal-trust", contentTypeId: "contentType-info",
      contentPillarId: "contentPillar-knowledge", funnelStageId: "funnelStage-interest",
      platformId: "platform-facebook", serviceId: "service-customs",
      formatId: "format-square", toneId: "tone-edu",
      priorityId: "priority-medium", statusId: "status-in-progress",
      ownerId: "owner-pop", publishDate: dstr(1), publishTime: "12:00", deadline: dstr(0),
      links: [{ id: "seed-l3", linkTypeId: "linkType-draft-image", url: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1200", title: "ดราฟต์ภาพ", createdAt: ts }],
    }),
    base({
      id: "seed-c4",
      title: "โปรสมาชิกใหม่ ลด 50% ค่าบริการแรก",
      marketingGoalId: "marketingGoal-lead", contentTypeId: "contentType-ads",
      contentPillarId: "contentPillar-promo", funnelStageId: "funnelStage-conversion",
      platformId: "platform-facebook", serviceId: "service-shop", campaignId: "campaign-newuser",
      formatId: "format-square", toneId: "tone-sell",
      priorityId: "priority-urgent", statusId: "status-scheduled",
      ownerId: "owner-pond", publishDate: dstr(4), publishTime: "09:00",
      links: [{ id: "seed-l4", linkTypeId: "linkType-brief", url: "https://docs.google.com/document/d/1abc/edit", title: "บรีฟแคมเปญ", createdAt: ts }],
    }),
    base({
      id: "seed-c5",
      title: "ไอเดีย: ซีรีส์เบื้องหลังโกดังจีน",
      brief: "ถ่ายเบื้องหลังทีมจีน คัดสินค้า แพ็ก ส่ง",
      marketingGoalId: "marketingGoal-brand", contentTypeId: "contentType-short",
      contentPillarId: "contentPillar-bts", funnelStageId: "funnelStage-awareness",
      platformId: "platform-instagram", formatId: "format-vertical", toneId: "tone-inspire",
      priorityId: "priority-low", statusId: "status-idea", ownerId: "owner-santa",
      publishDate: dstr(8),
      links: [],
    }),
  ];
}

/** Build a fresh seeded planner blob (called on first load / reset). */
/** Sample keyword research (ตัวอย่าง · ปอน กรอกค่าจริงทับได้). volume = ค้นหา/เดือน · cpc = ฿/คลิก · difficulty 0-100. */
export const DEFAULT_KEYWORDS: KeywordItem[] = [
  // นำเข้าสินค้าจากจีน
  { id: "kw-s1-1", service: "นำเข้าสินค้าจากจีน", tier: "primary", keyword: "นำเข้าสินค้าจากจีน", volume: 12000, cpc: 35, difficulty: 70, intent: "Commercial" },
  { id: "kw-s1-2", service: "นำเข้าสินค้าจากจีน", tier: "secondary", keyword: "วิธีนำเข้าสินค้าจากจีน", volume: 3000, cpc: 18, difficulty: 45, intent: "Informational" },
  { id: "kw-s1-3", service: "นำเข้าสินค้าจากจีน", tier: "longtail", keyword: "นำเข้าสินค้าจากจีนมาขาย ต้องทำยังไง", volume: 600, cpc: 12, difficulty: 25, intent: "Informational" },
  // ชิปปิ้งจีน (Cargo)
  { id: "kw-s2-1", service: "ชิปปิ้งจีน (Cargo)", tier: "primary", keyword: "ชิปปิ้งจีน", volume: 9000, cpc: 40, difficulty: 72, intent: "Commercial" },
  { id: "kw-s2-2", service: "ชิปปิ้งจีน (Cargo)", tier: "secondary", keyword: "ชิปปิ้งจีนเจ้าไหนดี", volume: 1500, cpc: 22, difficulty: 50, intent: "Commercial" },
  { id: "kw-s2-3", service: "ชิปปิ้งจีน (Cargo)", tier: "longtail", keyword: "ชิปปิ้งจีน ราคาถูก ส่งไว", volume: 800, cpc: 25, difficulty: 40, intent: "Transactional" },
  // นำเข้าทั้งตู้ FCL/LCL (Freight)
  { id: "kw-s3-1", service: "นำเข้าทั้งตู้ FCL/LCL", tier: "primary", keyword: "นำเข้าตู้คอนเทนเนอร์", volume: 2000, cpc: 30, difficulty: 55, intent: "Commercial" },
  { id: "kw-s3-2", service: "นำเข้าทั้งตู้ FCL/LCL", tier: "secondary", keyword: "freight forwarder นำเข้า", volume: 700, cpc: 28, difficulty: 48, intent: "Commercial" },
  { id: "kw-s3-3", service: "นำเข้าทั้งตู้ FCL/LCL", tier: "longtail", keyword: "นำเข้า LCL คืออะไร ต่างจาก FCL", volume: 500, cpc: 8, difficulty: 20, intent: "Informational" },
  // เคลียร์ภาษีศุลกากร
  { id: "kw-s4-1", service: "เคลียร์ภาษีศุลกากร", tier: "primary", keyword: "เคลียร์สินค้าศุลกากร", volume: 1800, cpc: 33, difficulty: 58, intent: "Commercial" },
  { id: "kw-s4-2", service: "เคลียร์ภาษีศุลกากร", tier: "secondary", keyword: "ตัวแทนออกของ", volume: 1200, cpc: 26, difficulty: 52, intent: "Commercial" },
  { id: "kw-s4-3", service: "เคลียร์ภาษีศุลกากร", tier: "longtail", keyword: "สินค้าติดด่านศุลกากร ทำยังไง", volume: 400, cpc: 10, difficulty: 22, intent: "Informational" },
  // ฝากสั่งซื้อสินค้าจีน
  { id: "kw-s5-1", service: "ฝากสั่งซื้อสินค้าจีน", tier: "primary", keyword: "ฝากสั่งของจีน", volume: 6000, cpc: 20, difficulty: 60, intent: "Commercial" },
  { id: "kw-s5-2", service: "ฝากสั่งซื้อสินค้าจีน", tier: "secondary", keyword: "พรีออเดอร์จีน 1688", volume: 2500, cpc: 16, difficulty: 45, intent: "Transactional" },
  { id: "kw-s5-3", service: "ฝากสั่งซื้อสินค้าจีน", tier: "longtail", keyword: "ฝากสั่ง taobao ยังไง ปลอดภัยไหม", volume: 1900, cpc: 18, difficulty: 42, intent: "Informational" },
];

export function buildSeed(): PlannerData {
  const ts = new Date().toISOString();
  return { version: PLANNER_SCHEMA_VERSION, settings: buildSettings(ts), contents: buildContents(ts), targets: DEFAULT_TARGETS, keywords: DEFAULT_KEYWORDS };
}
