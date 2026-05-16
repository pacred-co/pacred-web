/**
 * Pacred News data — customer-facing announcements & company updates.
 *
 * Mirrors `lib/knowledge-articles.ts` but lives under `components/` so
 * ปอน can own/edit without crossing the `lib/` boundary
 * (per `docs/briefs/podeng.md` scope rules).
 *
 * Cards on `/news` reuse the same `ArticleStats` (view/like) and
 * `ShareButton` components as the knowledge base.
 */

export type PacredNews = {
  id: number;
  slug: string;
  category: "ประกาศ" | "อัปเดตบริการ" | "กิจกรรม";
  title: string;
  excerpt: string;
  /** Card cover image — square / 3:4 portrait works best. */
  image: string;
  /** Optional in-article inline illustration (rendered mid-content). */
  inlineImage?: string;
  inlineImageAlt?: string;
  inlineImageCaption?: string;
  /** ISO date `YYYY-MM-DD` — used by `<time>` + JSON-LD datePublished. */
  publishedAt: string;
  /** Body text — same dialect that `<ArticleContent>` parses. */
  content: string;
};

export const PACRED_NEWS: PacredNews[] = [
  {
    id: 1,
    slug: "vietnam-customs-shift-to-sea-route",
    category: "ประกาศ",
    title: "ข่าวด่วน · ด่านรถจีน–ไทยติดขัดหนัก หลังเวียดนามตรวจเข้ม กระทบการขนส่งทางรถ",
    excerpt:
      "ในช่วงเดือนพฤษภาคม 2569 เส้นทางขนส่งสินค้าทางรถจากจีนมายังไทย โดยเฉพาะเส้นทางที่ต้องผ่านด่านชายแดนเวียดนามและด่านโหย่วอี้กวน เริ่มได้รับผลกระทบจากปริมาณรถขนส่งที่หนาแน่นและมาตรการตรวจเข้มที่เพิ่มขึ้น",
    image: "/images/PacredNews/khao01.png",
    inlineImage: "/images/PacredNews/prakob01.png",
    inlineImageAlt: "ประกาศปรับรูปแบบการจัดส่งสินค้าเป็นทางเรือ — Pacred Shipping",
    inlineImageCaption:
      "ประกาศจากทีม Pacred Shipping — มาตรการชั่วคราวระหว่างด่านเวียดนามเข้มงวด",
    publishedAt: "2026-05-15",
    content: `ข่าวด่วน: ด่านรถจีน–ไทยผ่านเวียดนามเริ่มติดขัดหนัก หลังมาตรการตรวจเข้มกระทบการขนส่งทางรถ

ในช่วงเดือนพฤษภาคม 2569 เส้นทางขนส่งสินค้าทางรถจากจีนมายังไทย โดยเฉพาะเส้นทางที่ต้องผ่านด่านชายแดนเวียดนามและด่านโหย่วอี้กวน เริ่มได้รับผลกระทบจากปริมาณรถขนส่งที่หนาแน่น และมาตรการควบคุม–ตรวจสอบสินค้านำเข้าอย่างเข้มงวดมากขึ้น ส่งผลให้การขนส่งทางรถมีข้อจำกัด และอาจเกิดความล่าช้าในบางรายการ

สถานการณ์ดังกล่าวเกิดจากหลายปัจจัยร่วมกัน ทั้งปริมาณรถบรรทุกสินค้าที่เพิ่มสูงขึ้นในช่วงฤดูกาลผลไม้ การตรวจสอบเอกสารและสินค้าบริเวณชายแดนที่ใช้เวลานานขึ้น รวมถึงความแออัดของรถบรรทุกที่รอผ่านด่าน ทำให้การปล่อยรถในบางช่วงไม่สามารถทำได้ตามรอบเวลาปกติ

สำหรับลูกค้าที่มีแผนนำเข้าสินค้าจากจีนมายังไทยในช่วงนี้ Pacred Shipping ขอแจ้งให้ทราบว่า บริษัทฯ ยังคงดำเนินการขนส่งสินค้าอย่างต่อเนื่อง แต่ในบางรายการอาจมีการปรับแผนจาก การขนส่งทางรถ เป็นการขนส่งทางเรือชั่วคราว เพื่อช่วยลดความเสี่ยงจากการติดค้างหน้าด่าน ลดความล่าช้าที่อาจเกิดขึ้น และดูแลให้สินค้าของลูกค้าสามารถเข้าประเทศได้อย่างต่อเนื่องและปลอดภัยมากที่สุด

การปรับเป็นทางเรือในช่วงนี้อาจเป็นทางเลือกที่เหมาะสมกว่า สำหรับสินค้าที่ไม่ต้องการเสี่ยงกับคิวรถหน้าด่าน หรือสินค้าที่ต้องวางแผนรอบนำเข้าให้แน่นอนมากขึ้น เนื่องจากเส้นทางเรือสามารถช่วยหลีกเลี่ยงปัญหาคอขวดบริเวณด่านรถ และลดผลกระทบจากมาตรการตรวจเข้มบริเวณชายแดนได้ในระดับหนึ่ง

Pacred Shipping จะติดตามสถานการณ์ด่านชายแดนจีน–เวียดนาม และเส้นทางขนส่งจีน–ไทยอย่างใกล้ชิด พร้อมอัปเดตข้อมูลให้ลูกค้าทราบอย่างต่อเนื่อง หากมีการเปลี่ยนแปลงด้านรอบรถ รอบเรือ หรือแนวทางการจัดส่งเพิ่มเติม

ลูกค้าที่มีสินค้ากำลังรอขนส่ง หรือกำลังวางแผนนำเข้าสินค้าจากจีน สามารถติดต่อทีมงาน Pacred Shipping เพื่อตรวจสอบเส้นทางที่เหมาะสมก่อนตัดสินใจส่งสินค้าได้ทันที

Pacred Shipping ขอขอบพระคุณลูกค้าทุกท่านที่ให้ความไว้วางใจในบริการของเรา

ขอแสดงความนับถือ
Pacred Shipping`,
  },
];

export function getPacredNewsBySlug(slug: string): PacredNews | undefined {
  return PACRED_NEWS.find((n) => n.slug === slug);
}

/**
 * Pick up to N items that aren't the current one — used by the
 * "ข่าวสาร Pacred อื่นๆ" related panel on a detail page.
 */
export function getRelatedNews(currentSlug: string, limit = 3): PacredNews[] {
  return PACRED_NEWS.filter((n) => n.slug !== currentSlug).slice(0, limit);
}
