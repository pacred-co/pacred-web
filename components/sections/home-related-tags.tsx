import { Tag } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { RelatedTagsTabs } from "@/components/sections/related-tags-tabs";

/**
 * Home page "Related topics" section — Trip.com-style tabs.
 *
 * Per ปอน 2026-05-23: reuse the RelatedTagsTabs component (originally built
 * for the customs-clearance landing) and fill with 7 home-relevant tabs.
 * Every tag click routes to `/knowledge` (the component's built-in behaviour).
 */
const HOME_TAG_GROUPS: { title: string; items: string[] }[] = [
  {
    title: "นำเข้า",
    items: [
      "นำเข้าสินค้าจากจีน",
      "นำเข้าทางรถ",
      "นำเข้าทางเรือ",
      "นำเข้าทางอากาศ",
      "นำเข้า FCL",
      "นำเข้า LCL",
      "นำเข้า Cargo",
      "นำเข้า Door to Door",
      "DDP Term",
      "EXW Term",
      "FOB Term",
      "นำเข้าสินค้า 1688",
      "นำเข้าจาก Taobao",
      "นำเข้าจาก Tmall",
      "นำเข้าด่วน",
      "คำนวณค่านำเข้า",
      "ภาษีนำเข้า",
      "HS Code นำเข้า",
      "ใบขนสินค้าขาเข้า",
      "ฟรีค่าธรรมเนียมแรกเข้า",
    ],
  },
  {
    title: "ส่งออก",
    items: [
      "ส่งออกสินค้าทั่วโลก",
      "ส่งออกไปจีน",
      "ส่งออกไปอเมริกา",
      "ส่งออกไปยุโรป",
      "ส่งออกไปญี่ปุ่น",
      "ส่งออกไปเกาหลี",
      "ส่งออก FCL",
      "ส่งออก LCL",
      "Air Freight Export",
      "Sea Freight Export",
      "Form E ขอที่ไหน",
      "Certificate of Origin",
      "Invoice + Packing List",
      "ใบขนสินค้าขาออก",
      "ขอคืนภาษีส่งออก",
      "ส่งออกอาหาร",
      "ส่งออกเครื่องสำอาง",
      "ส่งออกสมุนไพร",
      "เอกสารส่งออกครบเซ็ต",
      "ส่งออกผ่านศุลกากร",
    ],
  },
  {
    title: "พิธีการศุลกากร",
    items: [
      "พิธีการศุลกากร",
      "เคลียร์สินค้าติดด่าน",
      "ใบขนสินค้า",
      "ภาษีศุลกากร",
      "ภาษีมูลค่าเพิ่ม VAT",
      "HS Code · พิกัดศุลกากร",
      "เปิดตรวจสินค้า",
      "Form E (จีน)",
      "D/O · Delivery Order",
      "Customs Permit",
      "ใบอนุญาตนำเข้า",
      "ใบกำกับภาษี",
      "ตัวแทนออกของ",
      "Customs Broker",
      "เคลียร์ของสนามบิน",
      "เคลียร์ของท่าเรือ",
      "เคลียร์ของด่วน 1 ชั่วโมง",
      "ของติดด่านทำยังไง",
      "ขอคืนภาษีศุลกากร",
      "ลดหย่อนภาษี",
    ],
  },
  {
    title: "สั่งซื้อสินค้า",
    items: [
      "ฝากสั่งซื้อ 1688",
      "ฝากสั่งซื้อ Taobao",
      "ฝากสั่งซื้อ Tmall",
      "ฝากสั่งซื้อ Alibaba",
      "ฝากสั่งซื้อ JD.com",
      "ฝากสั่งซื้อ Pinduoduo",
      "ฝากสั่งซื้อ AliExpress",
      "รับฝากซื้อสินค้าจีน",
      "ค่าคอมฝากซื้อ",
      "ค่าจัดส่งจีน-ไทย",
      "คำนวณราคาฝากซื้อ",
      "โกดังกวางโจว",
      "โกดังอี้อู",
      "โกดังเซินเจิ้น",
      "เช็คราคาก่อนสั่ง",
      "หาสินค้าทดแทน",
      "QC ก่อนส่งจากจีน",
      "ฝากซื้อด่วน",
      "คุยกับร้านค้าจีน",
      "รับสินค้าโกดังจีน",
    ],
  },
  {
    title: "ฝากโอนชำระสินค้า",
    items: [
      "ฝากโอนเงินจีน",
      "ฝากโอน Alipay",
      "ฝากโอน WeChat Pay",
      "ฝากโอนหยวน RMB",
      "ฝากชำระค่าสินค้าจีน",
      "ฝากโอนค่าตู้",
      "อัตราแลกเปลี่ยนหยวน",
      "ค่าธรรมเนียมโอน",
      "โอนเงินจีนปลอดภัย",
      "หลักฐานการโอน",
      "โอนผ่านธนาคารจีน",
      "Bank Transfer China",
      "ส่งสลิปยืนยัน",
      "ตรวจสอบยอดโอน",
      "โอนทันใจ 5 นาที",
      "ฝากชำระค่าโรงงาน",
      "ฝากชำระค่าโลจิสติกส์",
      "ฝากชำระค่าตรวจสินค้า",
      "ฝากโอนใบกำกับ",
      "ระบบ Escrow",
    ],
  },
  {
    title: "สาระน่ารู้",
    items: [
      "คู่มือนำเข้า-ส่งออก",
      "ขั้นตอนนำเข้าจากจีน",
      "เลือก Term ที่เหมาะ",
      "DDP vs EXW vs FOB",
      "ความต่าง FCL / LCL",
      "เลือกขนส่งแบบไหนดี",
      "การคำนวณ Demurrage",
      "การคำนวณ Detention",
      "ค่าใช้จ่ายแฝงนำเข้า",
      "สินค้าควบคุม",
      "สินค้าห้ามนำเข้า",
      "เปิดบริษัทนำเข้า",
      "การจดทะเบียน VAT",
      "TIN · Tax ID",
      "Incoterms 2020",
      "เอกสารต้องมีอะไรบ้าง",
      "HS Code วิธีค้นหา",
      "การคำนวณภาษีนำเข้า",
      "ทำไมของถึงติดด่าน",
      "Pacred Shipping คือใคร",
    ],
  },
  {
    title: "คำถามที่พบบ่อย",
    items: [
      "ราคานำเข้าเท่าไหร่",
      "ใช้เวลานำเข้ากี่วัน",
      "ออกใบกำกับภาษีได้ไหม",
      "ออกใบขนสินค้าได้ไหม",
      "ฟรี Shipping ไหม",
      "รับนำเข้าสินค้าอะไรบ้าง",
      "มี Minimum CBM ไหม",
      "คิดค่าน้ำหนักยังไง",
      "ลูกค้าใหม่ลดราคา",
      "ชำระด้วยอะไรได้บ้าง",
      "ตรวจสถานะสินค้ายังไง",
      "ส่งของช้าทำยังไง",
      "ของเสียหายเคลม",
      "ฝากซื้อจ่ายล่วงหน้าไหม",
      "โกดังจีนอยู่ที่ไหน",
      "ปรึกษาฟรี 24 ชม.",
      "ติดต่อแอดมิน",
      "หา Sales ใกล้บ้าน",
      "คำนวณราคาเองได้ไหม",
      "มีบริการฝากตู้ไหม",
    ],
  },
];

export function HomeRelatedTags() {
  return (
    <section className="relative pt-6 md:pt-10 pb-2 md:pb-4">
      <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
        <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
          <Tag className="w-3.5 h-3.5" strokeWidth={2.6} />
          RELATED TOPICS · หัวข้อยอดนิยม
        </div>
        <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
          <span className="text-primary-600">นำเข้า · ส่งออก · พิธีการศุลกากร · สั่งซื้อสินค้า · ฝากโอนชำระสินค้า</span>{" "}
          สาระน่ารู้ · คำถามที่พบบ่อย
        </h2>
        <p className="mt-2 md:mt-3 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[920px]">
          กดแท็กดูบทความเจาะลึก หรืออ่านเรื่องอื่นได้ที่หน้า{" "}
          <Link
            href="/knowledge"
            className="text-primary-600 hover:text-primary-700 font-bold underline-offset-4 hover:underline"
          >
            สาระน่ารู้
          </Link>
        </p>

        <div className="mt-6 md:mt-8">
          <RelatedTagsTabs groups={HOME_TAG_GROUPS} />
        </div>
      </div>
    </section>
  );
}
