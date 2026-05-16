export type ArticleCategory = "นำเข้า" | "เคลียร์" | "ส่งออก";

export type KnowledgeArticle = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  category: ArticleCategory;
  image: string;
};

export const KNOWLEDGE_ARTICLES: KnowledgeArticle[] = [
  {
    id: 1,
    slug: "cif-import-clearance",
    title: "นำเข้าเทอม CIF คืออะไร? ต้องเตรียมตัวเคลียร์ของยังไงให้ไม่สะดุด",
    excerpt:
      "เทอม CIF ดูเหมือนง่าย แต่หน้าที่ของคุณยังไม่จบ มาดู 5 ขั้นตอนเคลียร์ของให้ครบทุกขั้นจาก Pacred Shipping",
    category: "นำเข้า",
    image: "/images/knowledge/1.png",
  },
  {
    id: 2,
    slug: "china-internal-logistics",
    title: 'เจาะลึก "โลจิสติกส์ภายในจีน" — ส่งจากโรงงานมาโกดังชิปปิ้ง เลือกแบบไหนคุ้มและไว',
    excerpt:
      "การขนส่งภายในจีนที่หลายคนมองข้าม อาจทำให้ค่าส่งในจีนแพงกว่าค่าส่งกลับไทยถ้าเลือกผิดประเภท",
    category: "นำเข้า",
    image: "/images/knowledge/2.png",
  },
  {
    id: 3,
    slug: "cif-customs-stuck",
    title: "นำเข้า CIF แต่ของติดด่าน? อย่าปล่อยให้ค่าโกดังบานปลาย",
    excerpt:
      "เจาะลึกสินค้า 2 กลุ่มใหญ่ที่มักมีปัญหาหน้าด่าน พร้อมแนวทางเคลียร์จบ ไวทันใจกับ Pacred Shipping",
    category: "เคลียร์",
    image: "/images/knowledge/3.png",
  },
  {
    id: 4,
    slug: "cif-license-required",
    title: "สั่งของเทอม CIF แต่ลืมเช็คใบอนุญาต? ระวังค่าโกดังบานปลาย",
    excerpt:
      "ลิสต์สินค้าเจ้าปัญหา 5 กลุ่มที่ต้องมีใบอนุญาตก่อนนำเข้า — ไม่เช็คคือเสี่ยงติดด่าน",
    category: "เคลียร์",
    image: "/images/knowledge/4.png",
  },
  {
    id: 5,
    slug: "cif-customs-seize-reasons",
    title: "5 สาเหตุหลักที่ทำให้สินค้าเทอม CIF โดนศุลกากรยึดคาด่าน",
    excerpt:
      "สั่งมาแต่ไม่ได้ใช้! สินค้าต้องห้าม สำแดงเท็จ และอีก 3 สาเหตุที่ทำให้ของกลายเป็นของกลาง",
    category: "เคลียร์",
    image: "/images/knowledge/5.png",
  },
  {
    id: 6,
    slug: "cif-sea-import-risk",
    title: "ระวัง! นำเข้าเทอม CIF ทางเรือ อย่าให้ของกลายเป็นของกลางที่แหลมฉบัง คลองเตย",
    excerpt:
      "3 สาเหตุหลักที่ทำให้สินค้าถูกยึดคาท่าเรือ พร้อมวิธีป้องกันก่อนของถึงไทย",
    category: "เคลียร์",
    image: "/images/knowledge/6.png",
  },
  {
    id: 7,
    slug: "restricted-goods-permit",
    title: "คู่มือเอาตัวรอด: สินค้าต้องกำกัด (ติด อย./มอก.) แต่ลืมขอใบอนุญาตก่อนนำเข้า",
    excerpt:
      "เมื่อของถึงไทยแล้วเพิ่งรู้ว่าต้องมีใบอนุญาต — Pacred แนะวิธีเอาตัวรอด ไม่ต้องส่งคืนต้นทาง",
    category: "เคลียร์",
    image: "/images/knowledge/7.png",
  },
  {
    id: 8,
    slug: "customs-stuck-5-steps",
    title: "สินค้าติดด่านศุลกากรทำอย่างไร? สรุป 5 ขั้นตอนแก้ปัญหาให้ได้ของไวที่สุด",
    excerpt:
      "ของค้างอยู่ที่ด่าน? สถานะไม่อัปเดต? คู่มือเคลียร์ปัญหาฉบับมืออาชีพ ทั้งทางแอร์และทางเรือ",
    category: "เคลียร์",
    image: "/images/knowledge/8.png",
  },
  {
    id: 9,
    slug: "invoice-vs-customs-declaration",
    title: "เปิดใบกำกับ vs เปิดใบขน คืออะไร? คู่มือนำเข้าสินค้าฉบับเข้าใจลึก (อัปเดต 2026)",
    excerpt:
      "สองคำนี้ไม่เหมือนกัน และส่งผลต่อต้นทุน ความถูกต้อง และการเติบโตของธุรกิจโดยตรง",
    category: "นำเข้า",
    image: "/images/knowledge/9.png",
  },
  {
    id: 10,
    slug: "fta-form-tax-zero",
    title: 'สิทธิ์ Form FTA คืออะไร? เคล็ดลับนำเข้าสินค้าแบบ "ภาษี 0%" ที่นักธุรกิจมือโปรต้องรู้',
    excerpt:
      'ทำไมคู่แข่งขายสินค้าชนิดเดียวกันราคาถูกกว่า? คำตอบอาจอยู่ที่ "สิทธิ์ Form" ที่หลายคนยังไม่รู้',
    category: "นำเข้า",
    image: "/images/knowledge/10.png",
  },
  {
    id: 11,
    slug: "export-4-incoterms",
    title: "4 TERM ส่งออกยอดฮิต! เลือก Incoterms แบบไหน ให้ธุรกิจได้เปรียบและปิดการขายง่าย",
    excerpt:
      "EXW · FOB · CFR · CIF — Incoterms ตัวกำหนดว่าคุณต้องรับผิดชอบส่งของถึงจุดไหน ใครจ่ายค่าระวาง",
    category: "ส่งออก",
    image: "/images/knowledge/11.png",
  },
  {
    id: 12,
    slug: "customs-registration-paperless",
    title: "วิธีลงทะเบียนกรมศุลกากร + จับคู่ Paperless แบบละเอียด",
    excerpt:
      "จาก 0 → พร้อมนำเข้าได้จริง ภายใน 1 ชั่วโมง สิ่งที่ทุกคนต้องมีก่อนเริ่มนำเข้าให้ถูกต้อง",
    category: "นำเข้า",
    image: "/images/knowledge/12.png",
  },
  {
    // ภาพ /images/knowledge/13.png ยังไม่มี — ใช้ 4.png ชั่วคราว (สินค้าใบอนุญาต)
    id: 13,
    slug: "high-risk-import-goods",
    title: "สินค้าเสี่ยงในการนำเข้า — บุหรี่ เครื่องตรวจสัญญาณ และของควบคุมพิเศษ ที่ต้องเช็คก่อนสั่ง",
    excerpt:
      "รวม 10 กลุ่มสินค้านำเข้าที่ติดด่านบ่อยที่สุด — บุหรี่ Vape โดรน อุปกรณ์ Wi-Fi อาหารเสริม อาวุธ ฯลฯ พร้อมหน่วยงานเจ้าของเรื่อง เช็คก่อนสั่งป้องกันของกลายเป็นของกลาง",
    category: "เคลียร์",
    image: "/images/knowledge/4.png",
  },
];

export const getArticleBySlug = (slug: string): KnowledgeArticle | undefined =>
  KNOWLEDGE_ARTICLES.find((a) => a.slug === slug);

export const getRelatedArticles = (
  current: KnowledgeArticle,
  limit = 3,
): KnowledgeArticle[] =>
  KNOWLEDGE_ARTICLES.filter(
    (a) => a.id !== current.id && a.category === current.category,
  )
    .slice(0, limit)
    .concat(
      // ถ้าหมวดเดียวกันไม่พอ ดึงจากหมวดอื่นมาเติม
      KNOWLEDGE_ARTICLES.filter(
        (a) => a.id !== current.id && a.category !== current.category,
      ),
    )
    .slice(0, limit);
