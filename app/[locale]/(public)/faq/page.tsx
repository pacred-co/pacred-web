import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { Footer } from "@/components/sections/footer";
import { ImportExportBanner } from "@/components/sections/import-export-banner";
import { FaqAccordion, type FaqGroup } from "@/components/sections/faq-accordion";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema, faqPageSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";
import { STAFF } from "@/components/seo/site";

const PATH = "/faq";

// Sales contact line shown in the FAQ support answers (= แนท · STAFF.sales[2]
// after เตย removed 2026-06-25), sourced from the single SOT instead of a literal.
// NOTE (flagged to เดฟ): the FAQ email "contact@pacred.co" has NO matching
// entry in components/seo/site.ts CONTACT (which exposes sales@ / docs@ / acc@
// …). Left as-is pending a decision on whether contact@ is a real mailbox.
const FAQ_PHONE = STAFF.sales[2].phone;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: "seo.faq" });
}

const FAQ_GROUPS_TH: FaqGroup[] = [
  {
    id: "general",
    label: "บริการของ Pacred",
    items: [
      {
        q: "Pacred Shipping คือใคร ทำอะไรบ้าง?",
        a: "Pacred Shipping ผู้ให้บริการนำเข้า-ส่งออกครบวงจรประสบการณ์ 14 ปี ดูแลตั้งแต่ฝากสั่งซื้อสินค้าจีน (1688/Taobao/Tmall/Alibaba) จัดส่งจากโกดังจีน เคลียร์พิธีการศุลกากร ส่งถึงมือลูกค้าทั่วประเทศ — รวมถึงบริการส่งออกสินค้าไปทั่วโลก",
      },
      {
        q: "ใครใช้บริการ Pacred ได้บ้าง — บุคคลทั่วไป หรือ บริษัทเท่านั้น?",
        a: "ใช้ได้ทั้งบุคคลธรรมดาและนิติบุคคล ตั้งแต่ลูกค้าพรีออเดอร์รายเล็ก SME ไปจนถึงผู้นำเข้ารายใหญ่ ทีมเราขึ้นทะเบียนผู้นำเข้า-ส่งออกให้ฟรีและจับคู่รหัส YY กับกรมศุลกากรได้ภายในไม่กี่นาที",
      },
      {
        q: "เริ่มใช้บริการต้องทำยังไง?",
        a: "1) สมัครสมาชิกบนเว็บไซต์ pacred.co 2) ยืนยันตัวตน (เบอร์โทร/เอกสาร) 3) เลือกบริการที่ต้องการ — ฝากสั่ง / ฝากนำเข้า / ฝากโอน — แล้วเริ่มได้เลย",
      },
    ],
  },
  {
    id: "shipping",
    label: "นำเข้า & ขนส่ง (FCL / LCL / Cargo)",
    items: [
      {
        q: "FCL กับ LCL ต่างกันยังไง?",
        a: "FCL (Full Container Load) = เหมาตู้ทั้งตู้ 20'/40'/40HQ ราคาต่อหน่วยถูกที่สุด เหมาะกับสินค้าจำนวนมาก. LCL (Less than Container Load) = แชร์ตู้กับลูกค้าอื่น จ่ายตามปริมาตร CBM หรือ น้ำหนัก เหมาะกับสินค้าจำนวนน้อยถึงปานกลาง",
      },
      {
        q: "ระยะเวลาขนส่งจากจีนถึงไทยใช้เวลานานเท่าไหร่?",
        a: "ทางรถ (Cargo): 4–7 วัน ทำการ. ทางเรือ LCL: 12–18 วัน. ทางเรือ FCL: 14–21 วัน. ทางอากาศ: 2–4 วัน. ตัวเลขเป็น Door-to-Door — ตั้งแต่รับจากโกดังจีนจนถึงปลายทางไทย",
      },
      {
        q: "ค่าขนส่งคิดยังไง?",
        a: "ดูจาก 2 ค่า เลือกค่าที่สูงกว่า: (1) น้ำหนัก (กก.) หรือ (2) ปริมาตร (CBM × อัตราคูณ) ลูกค้านิติบุคคลหักภาษี ณ ที่จ่าย 1% และมีค่าบริการ Pacred 50 บาทต่อบิล",
      },
      {
        q: "Term DDP กับ EXW/FOB/CIF ต่างกันยังไง?",
        a: "DDP (Delivered Duty Paid) = ราคาที่จ่ายรวมทุกอย่างจนถึงปลายทางไทย รวมภาษี ลูกค้าไม่ต้องเคลียร์เอง. EXW = รับสินค้าหน้าโรงงาน. FOB = รับที่Port ต้นทาง. CIF = รับที่Port ปลายทาง รวมประกัน",
      },
    ],
  },
  {
    id: "payment",
    label: "การชำระเงิน & ฝากโอน",
    items: [
      {
        q: "ฝากโอนเงินไปจีนผ่าน Pacred ปลอดภัยไหม?",
        a: "ปลอดภัยและตรวจสอบได้ทุกขั้นตอน. รองรับ Alipay / 1688 / Taobao ทุกร้าน. โอนจริงให้ผู้ขายปลายทาง พร้อม Slip ยืนยันส่งกลับลูกค้า โอนภายในวัน เรทตลาดอัปเดทอัตโนมัติ",
      },
      {
        q: "เรทแลกเปลี่ยนหยวน-บาทที่ใช้คือเรทไหน?",
        a: "ใช้เรทตลาดจริง อัปเดทรายวัน + ค่าบริการชัดเจน 100% ไม่มีค่าแอบแฝง ลูกค้าเห็นเรทก่อนยืนยัน",
      },
      {
        q: "ชำระเงินผ่าน Wallet ทำยังไง?",
        a: "โอนผ่าน PromptPay QR หรือบัญชีธนาคารบริษัท แนบสลิปในระบบ ทีมแอดมินอนุมัติภายใน 5–15 นาทีในเวลาทำการ ยอดเงินขึ้นกระเป๋าทันที พร้อมใช้สั่งซื้อ/ขนส่งต่อ",
      },
      {
        q: "ถอนเงินจากกระเป๋าได้ไหม?",
        a: "ได้ครับ. โอนกลับเข้าบัญชีธนาคารของลูกค้า — มีค่าธรรมเนียมเล็กน้อยตาม % ของยอด รายการถอนใช้เวลา 1–3 วันทำการ",
      },
    ],
  },
  {
    id: "customs",
    label: "เคลียร์ศุลกากร & สินค้าติดด่าน",
    items: [
      {
        q: "สินค้าติดด่าน — Pacred เคลียร์ได้ไหม?",
        a: "เคลียร์ได้ครบทุกด่านในไทย: สุวรรณภูมิ · ดอนเมือง · Port คลองเตย · แหลมฉบัง · ICD ลาดกระบัง · ไปรษณีย์หลักสี่ · มุกดาหาร · หนองคาย · อรัญประเทศ · แม่สาย. ส่งเอกสารมาทาง LINE — เริ่มเคลียร์ภายในชั่วโมง",
      },
      {
        q: "ต้องจ่ายภาษีอะไรบ้างเมื่อนำเข้า?",
        a: "1) อากรขาเข้า (Import Duty) ตามพิกัด HS Code 2) ภาษีมูลค่าเพิ่ม VAT 7% คำนวณจาก CIF + อากร 3) ภาษีสรรพสามิต (ถ้ามี). คำนวณภาษีล่วงหน้าฟรีก่อนตัดสินใจ",
      },
      {
        q: "Form E คืออะไร — ลดอะไรได้บ้าง?",
        a: "Form E = ใบรับรองถิ่นกำเนิดสินค้าภายใต้ FTA จีน-อาเซียน ใช้ลดอากรขาเข้าได้ถึง 0% สำหรับสินค้าหลายพิกัด ทีม Pacred ประสานโรงงานออก Form E ให้ได้",
      },
      {
        q: "ใบอนุญาตนำเข้า (มอก./กสทช./เกษตร/ประมง) — ขอเองได้ไหม หรือต้องใช้บริการ?",
        a: "Pacred ช่วยขอใบอนุญาตทุกประเภทจากหน่วยงานที่เกี่ยวข้อง (มอก./กสทช./เกษตร/ประมง) ใช้เวลา 1–5 วันทำการขึ้นกับหน่วยงาน — ไม่ต้องเดินเอกสารเอง",
      },
    ],
  },
  {
    id: "support",
    label: "การติดต่อ & ติดตามสถานะ",
    items: [
      {
        q: "ติดต่อทีม Pacred ได้ทางไหนบ้าง?",
        a: `LINE OA: pacred.co/line (เร็วสุด ตอบภายใน 5 นาที), โทร ${FAQ_PHONE}, อีเมล contact@pacred.co, Facebook / TikTok / Instagram / YouTube @PacredShipping`,
      },
      {
        q: "เปิดทำการวันไหน เวลาอะไร?",
        a: "ทุกวัน 8:00–18:00 ไม่มีวันหยุดปกติ (ยกเว้นเทศกาลใหญ่ — ดูปฏิทินวันหยุดที่หน้า /holidays). LINE OA ตอบตลอดทั้งวัน",
      },
      {
        q: "ติดตามสถานะออเดอร์ที่ไหน?",
        a: "ดูได้ในแดชบอร์ดสมาชิกของลูกค้า แสดงสถานะแต่ละขั้นตอนแบบ Real-time + แจ้งเตือนผ่าน LINE ทุกการเปลี่ยนแปลง",
      },
    ],
  },
];

const FAQ_GROUPS_EN: FaqGroup[] = [
  {
    id: "general",
    label: "About Pacred",
    items: [
      {
        q: "Who is Pacred Shipping?",
        a: "Pacred Shipping is a full-service import & export company with 14 years of experience. We handle every step — China shop-order (1688/Taobao/Tmall/Alibaba), China-warehouse intake, customs clearance, and door-to-door delivery — plus worldwide export.",
      },
      {
        q: "Can individuals use Pacred, or is it for companies only?",
        a: "Both. From pre-order shoppers and SMEs to large importers. We register importers/exporters and link the YY customs code for free, in minutes.",
      },
      {
        q: "How do I get started?",
        a: "Sign up on pacred.co, verify your identity (phone/document), pick a service — shop-order, import, or Yuan transfer — and you're ready to ship.",
      },
    ],
  },
  {
    id: "shipping",
    label: "Import & shipping (FCL / LCL / Cargo)",
    items: [
      {
        q: "What's the difference between FCL and LCL?",
        a: "FCL (Full Container Load) reserves an entire 20'/40'/40HQ container — lowest cost per unit, ideal for high volume. LCL (Less than Container Load) shares a container with other shippers, charged by CBM or weight — ideal for smaller shipments.",
      },
      {
        q: "How long does shipping from China to Thailand take?",
        a: "Cargo (road): 4–7 working days. LCL sea: 12–18 days. FCL sea: 14–21 days. Air: 2–4 days. These are door-to-door, from the China warehouse to your Thai address.",
      },
      {
        q: "How is shipping cost calculated?",
        a: "We take the higher of (1) weight (kg) or (2) volume (CBM × multiplier). Juristic customers get a 1% withholding-tax deduction (no minimum), plus a 50-baht Pacred service fee per bill.",
      },
      {
        q: "DDP vs. EXW / FOB / CIF — what's the difference?",
        a: "DDP (Delivered Duty Paid) is all-inclusive to your Thai door, taxes paid — no clearance needed. EXW: pickup at factory. FOB: at origin port. CIF: at destination port with insurance.",
      },
    ],
  },
  {
    id: "payment",
    label: "Payment & Yuan transfer",
    items: [
      {
        q: "Is sending money to China via Pacred safe?",
        a: "Yes. Verifiable at every step. Supports Alipay / 1688 / Taobao with every shop. Real transfer to seller with slip confirmation back to you, same-day processing, live market rates.",
      },
      {
        q: "Which Yuan-Baht rate do you use?",
        a: "Live market rate, updated daily, with transparent service fees. You see the rate before you confirm.",
      },
      {
        q: "How do I top up my wallet?",
        a: "PromptPay QR or bank transfer, then attach the slip in-system. Admin approval takes 5–15 minutes during office hours. Funds are available immediately for shop-order or shipping.",
      },
      {
        q: "Can I withdraw from my wallet?",
        a: "Yes. Withdrawals to your linked Thai bank account take 1–3 working days, with a small percentage fee.",
      },
    ],
  },
  {
    id: "customs",
    label: "Customs & stuck-at-customs",
    items: [
      {
        q: "Can Pacred clear shipments stuck at customs?",
        a: "Every port in Thailand: Suvarnabhumi · Don Mueang · Klong Toey · Laem Chabang · ICD Lat Krabang · Lak Si Mail · Mukdahan · Nong Khai · Aranyaprathet · Mae Sai. Send documents via LINE — we start clearance within the hour.",
      },
      {
        q: "What taxes apply when importing?",
        a: "1) Import duty by HS Code 2) VAT 7% on CIF + duty 3) Excise (if applicable). We pre-compute the tax for free before you commit.",
      },
      {
        q: "What is Form E and what does it save?",
        a: "Form E is the Certificate of Origin under the China-ASEAN FTA. It can reduce import duty to 0% for many HS Codes. We coordinate with the supplier to issue Form E.",
      },
      {
        q: "Can I obtain permits (TFDA / TISI / etc.) myself, or do I need help?",
        a: "Pacred handles every permit (TFDA / TISI / NBTC / agriculture / fisheries). Lead time 1–5 working days depending on the agency.",
      },
    ],
  },
  {
    id: "support",
    label: "Contact & tracking",
    items: [
      {
        q: "How do I reach the Pacred team?",
        a: `LINE OA: pacred.co/line (fastest — replies within 5 minutes), phone ${FAQ_PHONE}, email contact@pacred.co, plus Facebook / TikTok / Instagram / YouTube @PacredShipping.`,
      },
      {
        q: "What are your hours?",
        a: "Every day, 8:00–18:00 (except major holidays — see /holidays). The LINE OA replies throughout the day.",
      },
      {
        q: "Where can I track my order?",
        a: "Inside your member dashboard — real-time status per stage, plus LINE notifications on every status change.",
      },
    ],
  },
];

export default async function FAQPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("faqPage");
  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const groups = typedLocale === "en" ? FAQ_GROUPS_EN : FAQ_GROUPS_TH;
  const flatItems = groups.flatMap((g) => g.items.map((it) => ({ question: it.q, answer: it.a })));

  const homeLabel = t("breadcrumbHome");
  const faqLabel  = t("breadcrumbFaq");
  const heading = t.rich("heading", {
    highlight: (chunks) => <span className="text-primary-600">{chunks}</span>,
  });
  const subheading = t("subheading");

  return (
    <>
      <JsonLd
        data={[
          faqPageSchema(flatItems),
          breadcrumbSchema(
            [
              { name: homeLabel, path: "/" },
              { name: faqLabel, path: PATH },
            ],
            typedLocale,
          ),
        ]}
      />
      <NavBar />
      <SearchBar />
      <main>
        <section className="relative pt-6 md:pt-10 pb-10 md:pb-16">
          <div className="mx-auto w-full max-w-[1140px] px-[12px] md:px-4">
            <nav className="flex items-center gap-1 text-[11.5px] md:text-[12.5px] text-muted mb-4 md:mb-5">
              <Link href="/" className="hover:text-primary-600 transition-colors font-bold">
                {homeLabel}
              </Link>
              <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
              <span className="font-bold text-[#111827] dark:text-white">{faqLabel}</span>
            </nav>

            <div className="mx-auto w-full max-w-[920px] text-center md:text-left">
              <div className="inline-flex items-center gap-2 mb-2 text-primary-600 text-[12px] md:text-[13px] font-black tracking-[0.08em] uppercase">
                <span className="w-2 h-2 rounded-full bg-primary-600 shrink-0" />
                FAQ
              </div>
              <h1 className="text-[24px] md:text-[42px] leading-[1.15] font-black tracking-[-0.04em] text-[#111827] dark:text-white">
                {heading}
              </h1>
              <p className="mt-3 text-[14px] md:text-[16px] leading-[1.6] text-muted">
                {subheading}
              </p>
            </div>

            <div className="mt-8 md:mt-12 mx-auto w-full max-w-[920px]">
              <FaqAccordion groups={groups} />
            </div>
          </div>
        </section>

        <ImportExportBanner />
      </main>
      <Footer />
    </>
  );
}
