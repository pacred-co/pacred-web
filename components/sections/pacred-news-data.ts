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
    title: "ปรับรูปแบบการจัดส่งสินค้าเป็น “ทางเรือ” ชั่วคราว",
    excerpt:
      "เนื่องจากสถานการณ์การตรวจสอบสินค้าที่ด่านเวียดนามยังคงมีความเข้มงวด ทางบริษัทขอปรับรูปแบบการจัดส่งสินค้าทั้งหมดเป็นทางเรือชั่วคราว เพื่อความปลอดภัยและลดความเสี่ยงในการล่าช้า",
    image: "/images/PacredNews/khao01.png",
    inlineImage: "/images/PacredNews/prakob01.png",
    inlineImageAlt: "ประกาศปรับรูปแบบการจัดส่งสินค้าเป็นทางเรือ — Pacred Shipping",
    inlineImageCaption:
      "ประกาศจากทีม Pacred Shipping — มาตรการชั่วคราวระหว่างด่านเวียดนามเข้มงวด",
    publishedAt: "2026-05-15",
    content: `📢 ประกาศแจ้งลูกค้า

🚢 ปรับรูปแบบการจัดส่งสินค้าเป็น "ทางเรือ" ชั่วคราว

เรียน ลูกค้าทุกท่าน

เนื่องจากสถานการณ์การตรวจสอบสินค้าที่ด่านเวียดนามยังคงมีความเข้มงวด ทางบริษัทจึงขอปรับรูปแบบการจัดส่งสินค้าทั้งหมดเป็น "ทางเรือ" ชั่วคราว เพื่อความปลอดภัยของสินค้า และเพื่อลดความเสี่ยงในการล่าช้าระหว่างการขนส่ง

การปรับรูปแบบการจัดส่งในครั้งนี้ เป็นมาตรการชั่วคราวที่บริษัทพิจารณาจากสถานการณ์ปัจจุบัน โดยมีเป้าหมายเพื่อให้การขนส่งดำเนินไปได้อย่างเหมาะสมที่สุด ในช่วงที่ด่านเวียดนามยังมีความเข้มงวดด้านการตรวจสอบสินค้าและเอกสารที่เกี่ยวข้องกับการนำเข้า–ส่งออก

ในช่วงเวลาดังกล่าว การขนส่งผ่านเส้นทางเดิมอาจมีความเสี่ยงต่อความล่าช้ามากขึ้น เช่น การรอตรวจเอกสาร การตรวจสอบรายละเอียดสินค้า หรือขั้นตอนการปล่อยสินค้าที่ใช้เวลามากกว่าปกติ บริษัทจึงเลือกใช้การขนส่งทางเรือเป็นแนวทางชั่วคราว เพื่อช่วยลดความเสี่ยงจากการค้างสินค้าระหว่างทาง และเพื่อให้สามารถบริหารจัดการการขนส่งได้อย่างเป็นระบบมากขึ้น

ทั้งนี้ การปรับเปลี่ยนเป็นทางเรืออาจทำให้ระยะเวลาการจัดส่งแตกต่างจากรูปแบบเดิมบางส่วน บริษัทจะติดตามสถานการณ์อย่างใกล้ชิด และหากมีความคืบหน้าหรือมีการเปลี่ยนแปลงเพิ่มเติม จะแจ้งอัปเดตให้ลูกค้าทราบอีกครั้ง

หากสถานการณ์ด่านเวียดนามกลับเข้าสู่ภาวะปกติ ทางบริษัทจะพิจารณาปรับรูปแบบการจัดส่งกลับมาตามความเหมาะสม และจะแจ้งให้ลูกค้าทราบโดยเร็วที่สุด

ทางบริษัทต้องขออภัยในความไม่สะดวกที่เกิดขึ้น และขอขอบพระคุณลูกค้าทุกท่านที่ให้ความเข้าใจและไว้วางใจในบริการของบริษัทเสมอมา

📲 ทักไลน์ Pacred ถ้าต้องการสอบถามรายละเอียดการจัดส่งของออเดอร์คุณ`,
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
