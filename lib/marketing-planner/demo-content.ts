/**
 * งานตัวอย่าง "เต็มระบบ" 1 ชิ้น — owner 2026-07-21 ขอ "งานที่มีข้อมูลครบๆ สักอัน
 * วันที่ 21 กรกฎา แบบเต็มเลย ลงทุกอย่าง ทั้งโพสต์ คลิป ภาพ ทุกแพลตฟอร์ม".
 *
 * ใช้ดูว่าแผง Preview ตอนข้อมูลครบหน้าตาเป็นยังไง (ของจริงในระบบส่วนใหญ่ยังกรอกไม่ครบ
 * จึงประเมินดีไซน์ไม่ได้). ทุก id อ้าง seed id จริง (`${group}-${key}` จาก seed.ts)
 * → ป้ายทุกอันมีสี/ชื่อจริง ไม่ขึ้นเป็นค่าว่าง.
 *
 * 8 แพลตฟอร์ม × 15 ประเภท → 15 ชิ้นงานย่อย ครบทั้ง บทความ · คลิปยาว · คลิปสั้น ·
 * ภาพ · Carousel · Story · Ads · Broadcast · Landing.
 */
import type { ContentItem } from "./types";
import { enrichResult } from "./performance";

/** id คงที่ — กดซ้ำแล้วทับตัวเดิม ไม่งอกเป็นสิบอัน. */
export const DEMO_CONTENT_ID = "demo-full-2026-07-21";

const P = {
  fb: "platform-facebook", ig: "platform-instagram", tt: "platform-tiktok", yt: "platform-youtube",
  web: "platform-website", blog: "platform-blog", line: "platform-lineoa", gbp: "platform-gbp",
} as const;

const T = {
  article: "contentType-article", seo: "contentType-seo", landing: "contentType-landing",
  blog: "contentType-blog", ytLong: "contentType-yt-long", ytShorts: "contentType-yt-shorts",
  tiktok: "contentType-tiktok", short: "contentType-short", reel: "contentType-reel",
  post: "contentType-post", album: "contentType-album", image: "contentType-image",
  story: "contentType-story", ads: "contentType-ads", broadcast: "contentType-broadcast",
} as const;

/**
 * ชิ้นงานย่อย: [ประเภท, รายละเอียด, เวลา, ขั้นที่อยากให้เป็น].
 *
 * ⚠️ ไม่ได้ใส่ `statusId` ตรงๆ — สถานะคิดอัตโนมัติจาก "หลักฐาน" (piece-status.ts)
 * ตัวอย่างจึงต้องกรอก **ตัวขับ** ให้ครบตามขั้นที่ต้องการ ไม่ใช่ยัดสถานะเข้าไป
 * (ยัดไปก็ไม่มีผล — จะได้ "วางแผน" หมดทุกชิ้น แล้วดูไม่ออกว่าระบบทำงานไหม).
 */
type Stage = "plan" | "shoot" | "review" | "scheduled" | "published";
const PIECES: [keyof typeof T, string, string, Stage][] = [
  ["seo", "บทความหลัก SEO · 1,800 คำ · คีย์เวิร์ดหลัก + รอง 4 คำ", "09:00", "published"],
  ["article", "บทความย่อย: เอกสารที่ต้องเตรียม · 900 คำ", "09:30", "published"],
  ["landing", "Landing ขอเรทเทียบ · ฟอร์ม 4 ช่อง", "10:00", "review"],
  ["blog", "สรุปฉบับอ่านเร็ว 5 นาที ลง Blog", "10:30", "review"],
  ["ytLong", "คลิปยาว 16:9 · 6 นาที · เดินโกดังจริง", "12:00", "scheduled"],
  ["ytShorts", "ตัดจากคลิปยาว 3 ท่อน · 9:16 · 50 วิ", "12:30", "review"],
  ["tiktok", "ฉบับ TikTok · hook ตัวเลขต้นทุนจริง · 45 วิ", "13:00", "shoot"],
  ["short", "คลิปสั้นรวม ใช้ซ้ำได้ทุกช่อง · 9:16", "13:30", "shoot"],
  ["reel", "Reel เบื้องหลังทีมเคลียร์ของ · 30 วิ", "14:00", "shoot"],
  ["post", "โพสต์ข้อความ + ภาพเดี่ยว สรุป 3 ข้อควรรู้", "15:00", "published"],
  ["album", "Carousel 5 ภาพ · 1080×1350 · เทียบต้นทุน", "15:30", "review"],
  ["image", "ภาพเดี่ยว Hero แบนเนอร์เว็บ · 1920×1080", "16:00", "plan"],
  ["story", "Story 3 เฟรม · ลิงก์ไปบทความ", "16:30", "plan"],
  ["ads", "Meta Ads · Lead Campaign · งบ ฿12,000", "18:00", "published"],
  ["broadcast", "LINE Broadcast ลูกค้าเก่า 4,200 คน", "19:00", "scheduled"],
];

/** แปลง "ขั้นที่อยากได้" → ตัวขับที่ต้องกรอก (สะสมทบขึ้นไปเรื่อยๆ ตามลำดับจริง). */
function driversFor(stage: Stage, key: string, shootDate: string, ownerId?: string) {
  const at: Record<string, string | boolean | undefined> = {};
  if (stage === "shoot" || stage === "review" || stage === "scheduled" || stage === "published") {
    at.shootDate = shootDate;
    at.shootBy = ownerId;
  }
  if (stage === "review" || stage === "scheduled" || stage === "published") {
    at.workUrl = `https://drive.google.com/file/d/demo-${key}`;
  }
  if (stage === "scheduled" || stage === "published") {
    at.approvedAt = "2026-07-20T09:00:00.000Z";
    at.approvedBy = ownerId;
  }
  if (stage === "published") at.postUrl = `https://pacred.co.th/p/demo-${key}`;
  return at;
}

/** ประเภทที่แต่ละแพลตฟอร์มรับผิดชอบ — คู่นี้คือตัวสร้าง "ชิ้นงานย่อย" (ดู piecesOf). */
const PLATFORM_TYPES: Record<string, (keyof typeof T)[]> = {
  [P.web]: ["seo", "article", "landing", "image"],
  [P.blog]: ["blog"],
  [P.yt]: ["ytLong", "ytShorts"],
  [P.tt]: ["tiktok", "short"],
  [P.fb]: ["post", "album", "reel", "ads"],
  [P.ig]: ["reel", "story", "album", "ads"],
  [P.line]: ["broadcast"],
  [P.gbp]: ["post", "image"],
};

/**
 * @param publishDate วันเผยแพร่ (YYYY-MM-DD)
 * @param ownerId     ผู้รับผิดชอบ — ส่ง user จริงเข้ามา ป้ายชื่อ/รูปถึงจะขึ้น
 * @param coOwnerIds  ทีมร่วม
 */
export function buildDemoContent(publishDate: string, ownerId?: string, coOwnerIds: string[] = []): ContentItem {
  const ts = new Date().toISOString();
  const contentTypeIds = PIECES.map(([k]) => T[k]);

  return {
    id: DEMO_CONTENT_ID,
    title: "แผนคอนเทนต์: นำเข้าสินค้าจากจีน LCL (ตัวอย่างเต็มระบบ)",
    topic: "คู่มือนำเข้า LCL ฉบับมือใหม่",
    brief: "ชุดคอนเทนต์เดียวกระจายครบทุกช่องทาง — บทความหลักกิน SEO · คลิปยาวสร้างความเชื่อใจ · คลิปสั้น/ภาพดันการเข้าถึง · Ads กับ Broadcast ปิดการขาย",

    // ── 1 วางแผน ──
    marketingGoalId: "marketingGoal-seo-find",
    contentPillarId: "contentPillar-knowledge",
    funnelStageId: "funnelStage-awareness",
    customerStageId: "customerStage-interested",
    serviceIds: ["service-import-cn", "service-lcl", "service-customs", "service-decl"],
    campaignId: "campaign-midyear",
    formatId: "format-vertical",
    toneId: "tone-edu",
    priorityId: "priority-urgent",
    targetAudience: "เจ้าของร้านออนไลน์ / โรงงานเล็ก สั่งของจีน 1–5 คิว/เดือน ยังไม่เคยเคลียร์เอง",

    // ── 2 คีย์เวิร์ด & SEO ──
    keyword: "นำเข้าสินค้าจากจีน",
    hashtag: "#นำเข้าจีน #LCL #ชิปปิ้งจีน #เคลียร์ศุลกากร #Pacred",
    cta: "ทักไลน์รับเรทเทียบฟรี ไม่ต้องย้ายเจ้า",

    // ── 3 โครงคอนเทนต์ 11 ช่อง ──
    hook: "สั่งของจีน 3 คิว แต่จ่ายจริงบานเป็น 2 เท่า — เพราะไม่รู้ 3 อย่างนี้",
    painPoint: "โดนบวกค่าใช้จ่ายหลังบ้านที่ไม่ได้แจ้งตอนเสนอราคา · ของติดด่านแล้วไม่มีใครตอบ · ไม่รู้ว่าต้องเตรียมเอกสารอะไร",
    context: "กลางปีของเข้าเยอะ ตู้แน่น ค่าระวางขยับ ลูกค้าที่ไม่ล็อกเรทไว้เจอบวกกลางทาง",
    storyTelling: "เคสร้านขายอะไหล่ย่านรามคำแหง ย้ายจากเจ้าเดิมมาอยู่กับเรา 3 เดือน ลดต้นทุนต่อคิว 18% และไม่มีของติดด่านเลยสักตู้",
    proof: "ใบขนจริง 3 ใบ + ตารางเทียบต้นทุนต่อคิวย้อนหลัง 3 เดือน + คลิปหน้าโกดังตอนเปิดตู้",
    authority: "ตัวแทนออกของจดทะเบียนกับกรมศุลกากร · ทำมา 14 ปี · เคลียร์มาแล้วหลักพันตู้",
    visual: "ภาพตู้จริงหน้าโกดัง + กราฟิกเทียบต้นทุน 3 แบบ + ภาพเอกสารใบขน (เบลอข้อมูลลูกค้า)",
    organicSelling: "ปิดท้ายด้วย “ขอเรทเทียบให้ฟรี ไม่ต้องย้ายเจ้า” — ไม่ขายตรง ให้ลองเทียบเอง",
    branding: "เร็ว ไว ไม่มีคำว่าทำไม่ได้",
    esg: "ใช้ตู้รวม LCL ลดเที่ยววิ่งเปล่า · เอกสารดิจิทัลลดกระดาษ",
    contact: "LINE OA @pacred · โทร 02-114-7574 · pacred.co.th",

    // ── 5 เผยแพร่ — ทุกแพลตฟอร์ม ──
    platformIds: Object.keys(PLATFORM_TYPES),
    contentTypeIds,
    contentTypeId: contentTypeIds[0],
    platformContentTypeIds: Object.fromEntries(
      Object.entries(PLATFORM_TYPES).map(([pid, keys]) => [pid, keys.map((k) => T[k])]),
    ),
    platformTitles: {
      [P.web]: "นำเข้าสินค้าจากจีนแบบ LCL ครบทุกขั้นตอน (ฉบับมือใหม่ 2569)",
      [P.yt]: "นำเข้าจีน LCL ต้องรู้อะไรบ้าง | เดินโกดังจริง | Pacred",
      [P.tt]: "สั่งของจีนแล้วโดนบวกค่าอะไรบ้าง? 💸",
      [P.ig]: "3 ข้อควรรู้ก่อนนำเข้าจีนครั้งแรก",
      [P.line]: "[Pacred] เรทนำเข้ากลางปี + เช็กลิสต์เอกสาร",
    },
    channelIds: ["channel-seo", "channel-meta-ads", "channel-remarketing", "channel-line-broadcast", "channel-crm"],

    // ── 4 ผลิต ──
    ownerId,
    coOwnerIds,
    startDate: shiftDays(publishDate, -7),
    deadline: shiftDays(publishDate, -1),
    publishDate,
    publishTime: "09:00",
    // สถานะระดับ "แผน" ยังเป็น SettingItem ที่เลือกเองได้ (ต่างจากสถานะราย *ชิ้นงาน*
    // ที่คิดอัตโนมัติแล้ว) — ดู piece-status.ts
    statusId: "status-review",
    pieces: Object.fromEntries(
      PIECES.map(([k, detail, dueTime, stage]) => [
        T[k],
        { detail, dueTime, ownerId, ...driversFor(stage, k, shiftDays(publishDate, -3), ownerId) },
      ]),
    ),

    // ── 7 หมายเหตุ & ไฟล์ ──
    // 1 คอนเทนต์ = 1 backlink — ทุกช่องทางยิงเข้าลิงก์เดียวกัน
    backlinkUrl: "https://pacred.co.th/import-from-china",
    note: "เน้นจุดเด่น: ขั้นตอนง่าย รวดเร็ว ประหยัดเวลา\nอย่าใส่ตัวเลขเรทจริงในคลิป — ให้ทักมาขอเรทเทียบแทน",
    links: [
      { id: "demo-l1", linkTypeId: "linkType-draft", url: "https://docs.google.com/document/d/demo-draft", title: "ดราฟต์บทความ + สคริปต์คลิป", createdAt: ts },
      { id: "demo-l2", linkTypeId: "linkType-published", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "คลิปยาวที่เผยแพร่แล้ว", createdAt: ts },
      { id: "demo-l3", linkTypeId: "linkType-report", url: "https://docs.google.com/spreadsheets/d/demo-report", title: "รายงานผล 7 วันแรก", createdAt: ts },
      { id: "demo-l4", linkTypeId: "linkType-reference", url: "https://pacred.co.th/import-from-china", title: "หน้าปลายทางบนเว็บ", createdAt: ts },
    ],

    // ── 6 วัดผล ──
    result: enrichResult({
      actualPublishDate: publishDate,
      reach: 42180, impression: 68940, view: 11904, watchTime: 134,
      like: 1842, comment: 213, share: 168, save: 402,
      click: 1203, ctr: 2.85, inbox: 141, lineAdd: 96,
      lead: 38, qualifiedLead: 21, quotation: 12, deal: 4,
      revenue: 186400, cost: 12000, roas: 15.53,
      organicTraffic: 2480, keywordRanking: 6, review: 3, mention: 7, backlink: 2,
      broadcastCtr: 8.4, callback: 11,
      shouldRepeat: "yes",
      repeatReason: "ต้นทุนต่อ lead ต่ำกว่าค่ากลาง 3 เท่า และปิดการขายได้จริง 4 ราย",
      insight: "คลิปสั้นตัวที่ hook ด้วยตัวเลขต้นทุนจริง ทำยอดทักไลน์ได้ 3 เท่าของตัวที่เล่าขั้นตอนเฉยๆ · บทความ SEO ขึ้นอันดับ 6 ใน 5 วัน",
      nextAction: "ตัดคลิปสั้นเพิ่ม 2 ตัวจากคลิปยาวตัวเดิม · ยิง Ads ซ้ำกลุ่มที่ดูเกิน 50% · ทำบทความย่อยจับคีย์เวิร์ดรอง 'ค่าใช้จ่ายนำเข้าจีน'",
    }),

    createdAt: ts,
    updatedAt: ts,
    archivedAt: null,
  };
}

/** เลื่อนวัน YYYY-MM-DD แบบ local (ไม่ผ่าน UTC — กันวันเพี้ยนข้ามโซนเวลา). */
function shiftDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
