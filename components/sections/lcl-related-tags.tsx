import { Tag } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { RelatedTagsTabs } from "@/components/sections/related-tags-tabs";

// LCL-themed tag groups — keyword chips for SEO + internal linking.
const TAG_GROUPS: { title: string; items: string[] }[] = [
  {
    title: "นำเข้า LCL จีน",
    items: [
      "นำเข้า LCL จากจีน",
      "LCL รวมตู้ จีน-ไทย",
      "ชิปปิ้ง LCL",
      "นำเข้าจีนไม่เต็มตู้",
      "รวมตู้นำเข้า",
      "Sea Freight LCL",
      "Less Container Load",
      "นำเข้าเริ่มไม่กี่กล่อง",
      "นำเข้าจีน SME",
      "นำเข้าจีนมือใหม่",
      "ฝากนำเข้าจีน",
      "รับนำเข้าสินค้าจีน",
      "นำเข้าจีนราคาถูก",
      "LCL ราคาต่อ CBM",
      "นำเข้าจีน Door-to-Door",
    ],
  },
  {
    title: "โกดังจีน กวางโจว/เซินเจิ้น/อี้อู",
    items: [
      "โกดังจีน",
      "โกดังกวางโจว",
      "โกดังเซินเจิ้น",
      "โกดังอี้อู",
      "ที่อยู่โกดังจีน",
      "รับของที่โกดังจีน",
      "พักของที่โกดังจีน",
      "ฝากของโกดังจีน",
      "Consolidation Warehouse จีน",
      "โกดังรวมสินค้าจีน",
      "ส่งของเข้าโกดังจีน",
      "courier จีน Yunda ZTO SF",
      "โกดังเซี่ยงไฮ้",
      "โกดังหางโจว",
    ],
  },
  {
    title: "รวมตู้ Sea Freight",
    items: [
      "รวมตู้ทางเรือ",
      "ขนส่งทางเรือจีน-ไทย",
      "Sea Freight จีน",
      "ค่าระวางเรือ LCL",
      "ท่าเรือคลองเตย",
      "ท่าเรือแหลมฉบัง",
      "ลาดกระบัง ICD",
      "CBM คืออะไร",
      "Volume Weight 1 CBM 167 KG",
      "คิดค่าขนส่งตาม CBM",
      "Lead time LCL จีน-ไทย",
      "ระยะเวลานำเข้าทางเรือ",
      "Cross-dock",
      "Total Landed Cost",
    ],
  },
  {
    title: "Form E ลดภาษี",
    items: [
      "Form E",
      "Form E ASEAN-China",
      "ขอ Form E",
      "Form E ลดภาษีนำเข้า",
      "FTA จีน-ไทย",
      "สิทธิประโยชน์ทางภาษี",
      "ภาษีนำเข้า 0%",
      "Certificate of Origin",
      "ใบรับรองถิ่นกำเนิดสินค้า",
      "พิกัดอัตราศุลกากร",
      "HS Code",
      "เคลียร์ภาษีนำเข้า",
      "ใบขนสินค้าขาเข้า",
      "อากรขาเข้า",
    ],
  },
  {
    title: "เปรียบเทียบ LCL / FCL",
    items: [
      "LCL กับ FCL ต่างกันยังไง",
      "ควรใช้ LCL หรือ FCL",
      "FCL เหมาตู้",
      "ตู้ 20 ฟุต 40 ฟุต",
      "นำเข้าเต็มตู้",
      "ต้นทุนต่อหน่วย LCL",
      "Order กี่ CBM ถึงคุ้ม FCL",
      "เลือกวิธีขนส่งนำเข้า",
      "LCL เหมาะกับใคร",
      "นำเข้าจีน FCL",
      "เปรียบเทียบค่าขนส่งนำเข้า",
      "นำเข้าทางเรือ vs ทางอากาศ",
    ],
  },
  {
    title: "คำถามที่พบบ่อย",
    items: [
      "LCL เหมาะกับ order ขนาดไหน",
      "ราคา LCL จีน-ไทย คิดยังไง",
      "ส่งของยังไงถึงโกดังจีน",
      "นำเข้า LCL ใช้เวลากี่วัน",
      "พักของที่โกดังจีนได้นานเท่าไร",
      "ของแตกสูญหายทำยังไง",
      "Cargo Insurance ประกันสินค้า",
      "สั่ง 1688 ส่งเข้าโกดัง Pacred",
      "สั่ง Taobao นำเข้าไทย",
      "สั่ง Alibaba นำเข้า",
      "ทำไมต้องเลือก Pacred",
      "freight forwarder คืออะไร",
      "นำเข้าครั้งแรกต้องรู้อะไร",
      "ออกใบกำกับภาษีนำเข้า",
      "ภพ.20 นำเข้า",
      "ล่ามจีนปิดดีลโรงงาน",
    ],
  },
];

/**
 * LCL related tags — mirrors the customs landing "Related tags" block:
 * eyebrow + h2 + p + <RelatedTagsTabs groups={...} />.
 */
export function LclRelatedTags() {
  return (
    <section className="relative pt-1.5 md:pt-3 pb-1 md:pb-2">
      <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
        <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
          <Tag className="w-3.5 h-3.5" strokeWidth={2.6} />
          RELATED TAGS · หัวข้อที่เกี่ยวข้องกับการนำเข้า LCL
        </div>
        <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
          บริการ <span className="text-primary-600">นำเข้า LCL จากจีน</span> ครอบคลุมทุกเมือง
        </h2>
        <p className="mt-2 md:mt-3 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[920px]">
          กดแท็กดูบทความเจาะลึก หรืออ่านเรื่องอื่นได้ที่หน้า <Link href="/knowledge" className="text-primary-600 hover:text-primary-700 font-bold underline-offset-4 hover:underline">สาระน่ารู้</Link>
        </p>

        <div className="mt-6 md:mt-8">
          <RelatedTagsTabs groups={TAG_GROUPS} />
        </div>
      </div>
    </section>
  );
}
