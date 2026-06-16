import type { Metadata } from "next";
import { MapPin, Phone } from "lucide-react";
import { StubPage } from "@/components/stub-page";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";

const PATH = "/privacy";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: "seo.privacy" });
}

// ── นโยบายการคุ้มครองข้อมูลส่วนบุคคล (PDPA) — เนื้อหาทางการของบริษัท ──
const INTRO =
  "บริษัท แพคเรด (ประเทศไทย) จำกัด (“บริษัท”) ขอแนะนำให้ท่านทำความเข้าใจนโยบายส่วนบุคคล (privacy policy) นี้ เนื่องจาก นโยบายนี้อธิบายถึงวิธีการที่บริษัทปฏิบัติต่อข้อมูลส่วนบุคคลของท่าน เช่น การเก็บรวบรวม การจัดเก็บรักษา การใช้ การเปิดเผย รวมถึงสิทธิต่างๆ ของท่าน เป็นต้น เพื่อให้ท่านได้รับทราบถึงนโยบายในการคุ้มครองข้อมูลส่วนบุคคลของบริษัท บริษัทจึงประกาศนโยบายส่วนบุคคล ดังต่อไปนี้";

type SubItem = { label: string; text: string };
type Item = { label: string; text: string; sub?: SubItem[] };
type Section = { n: string; title: string; paras?: string[]; items?: Item[] };

const SECTIONS: Section[] = [
  {
    n: "1",
    title: "ข้อมูลส่วนบุคคล",
    paras: [
      "“ข้อมูลส่วนบุคคล” หมายถึง ข้อมูลที่สามารถระบุตัวตนของท่าน หรืออาจจะระบุตัวตนของท่านได้ ไม่ว่าทางตรงหรือทางอ้อม",
    ],
  },
  {
    n: "2",
    title: "การเก็บรวบรวมข้อมูลส่วนบุคคล",
    paras: [
      "การจัดเก็บรวบรวมข้อมูลส่วนบุคคลจะกระทำโดยมี วัตถุประสงค์ ขอบเขต และใช้วิธีการที่ชอบด้วยกฎหมายและเป็นธรรม ในการเก็บรวบรวมและจัดเก็บข้อมูล ตลอดจนเก็บรวบรวม และจัดเก็บข้อมูลส่วนบุคคลอย่างจำกัดเพียงเท่าที่จำเป็นแก่การให้บริการ หรือบริการด้วยวิธีการทางอิเล็กทรอนิกส์อื่นใดภายใต้วัตถุประสงค์ของบริษัทเท่านั้น ทั้งนี้บริษัทจะดำเนินการให้เจ้าของข้อมูล รับรู้ ให้ความยินยอม ทางอิเล็กทรอนิกส์หรือตามแบบวิธีการของบริษัท",
      "บริษัทอาจจัดเก็บข้อมูลส่วนบุคคลของท่านซึ่งเกี่ยวกับความสนใจและบริการที่ท่านใช้ ซึ่งอาจประกอบด้วยเรื่อง ชื่อ ที่อยู่ เพศ อายุ หมายเลขโทรศัพท์ อีเมล ข้อมูลทางการเงิน หรือข้อมูลอื่นใด ที่จะเป็นประโยชน์ในการให้บริการ ทั้งนี้ การดำเนินการดังกล่าวข้างต้น บริษัทจะขอความยินยอมจากท่านก่อนทำการเก็บรวบรวม เว้นแต่",
    ],
    items: [
      {
        label: "2.1",
        text: "เป็นการปฏิบัติตามกฎหมาย เช่น พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พระราชบัญญัติว่าด้วยธุรกรรมทางอิเล็กทรอนิกส์ พระราชบัญญัติป้องกันและปราบปรามการฟอกเงิน ประมวลกฎหมายแพ่งและอาญา ประมวลกฎหมายวิธีพิจารณาความแพ่งและอาญา เป็นต้น",
      },
      {
        label: "2.2",
        text: "เป็นไปเพื่อประโยชน์แก่การสอบสวนของพนักงานสอบสวน หรือการพิจารณาพิพากษาคดีของศาล",
      },
      {
        label: "2.3",
        text: "เพื่อประโยชน์ของท่าน และการขอความยินยอมไม่อาจกระทำได้ในเวลานั้น",
      },
      {
        label: "2.4",
        text: "เป็นการจำเป็นเพื่อประโยชน์โดยชอบด้วยกฎหมายของบริษัท หรือของบุคคลหรือนิติบุคคลอื่นที่ไม่ใช่บริษัท",
      },
      {
        label: "2.5",
        text: "เป็นการจำเป็นเพื่อการปฏิบัติตามสัญญาซึ่งเจ้าของข้อมูลส่วนบุคคลเป็นคู่สัญญาหรือเพื่อใช้ในการดำเนินการตามคำขอของเจ้าของข้อมูลส่วนบุคคลก่อนเข้าทำสัญญานั้น",
      },
      {
        label: "2.6",
        text: "เพื่อให้บรรลุวัตถุประสงค์ที่เกี่ยวกับการจัดทำเอกสารประวัติศาสตร์หรือจดหมายเหตุ เพื่อประโยชน์สาธารณะ หรือเพื่อการศึกษา วิจัย การจัดทำสถิติ ซึ่งได้จัดให้มีมาตรการป้องกันที่เหมาะสม",
      },
    ],
  },
  {
    n: "3",
    title: "มาตรการรักษาความมั่นคงปลอดภัยและคุณภาพของข้อมูล",
    items: [
      {
        label: "3.1",
        text: "บริษัทตระหนักถึงความสำคัญของการรักษาความมั่นคงปลอดภัยของข้อมูลส่วนบุคคลของท่าน บริษัทจึงกำหนดให้มีมาตรการในการรักษาความมั่นคงปลอดภัยของข้อมูลส่วนบุคคลอย่างเหมาะสมและสอดคล้องกับการรักษาความลับของข้อมูลส่วนบุคคลเพื่อป้องกันการสูญหาย การเข้าถึง ทำลาย ใช้ แปลง แก้ไขหรือเปิดเผยข้อมูลส่วนบุคคลโดยไม่มีสิทธิหรือโดยไม่ชอบด้วยกฎหมาย ตลอดจนการป้องกันมิให้มีการนำข้อมูลส่วนบุคคลไปใช้โดยมิได้รับอนุญาต ทั้งนี้ เป็นไปตามที่กำหนดในนโยบายการรักษาความมั่นคงปลอดภัยไซเบอร์",
      },
      {
        label: "3.2",
        text: "ข้อมูลส่วนบุคคลของท่านที่บริษัทได้รับมา เช่น ชื่อ อายุ ที่อยู่ หมายเลขโทรศัพท์ ข้อมูลทางการเงิน เป็นต้น ซึ่งสามารถบ่งบอกตัวบุคคลของท่านได้ และเป็นข้อมูลส่วนบุคคลที่มีความถูกต้องและเป็นปัจจุบัน จะถูกนำไปใช้ให้เป็นไปตามวัตถุประสงค์การดำเนินงานของบริษัทเท่านั้น และบริษัทจะดำเนินมาตรการที่เหมาะสมเพื่อคุ้มครองสิทธิของเจ้าของข้อมูลส่วนบุคคล",
      },
    ],
  },
  {
    n: "4",
    title: "วัตถุประสงค์ในการรวบรวม จัดเก็บ ใช้ ข้อมูลส่วนบุคคล",
    paras: [
      "บริษัทรวบรวม จัดเก็บ ใช้ ข้อมูลส่วนบุคคลของท่าน เพื่อประโยชน์ในการให้บริการแก่ท่าน รวมถึงบริการที่ท่านสนใจ เช่น บริการสั่งสินค้า หรือการวิจัยตลาดและการจัดกิจกรรมส่งเสริมการขาย หรือเพื่อประโยชน์ในการจัดทำฐานข้อมูลและใช้ข้อมูลเพื่อเสนอสิทธิประโยชน์ตามความสนใจของท่าน หรือเพื่อประโยชน์ในการวิเคราะห์และนำเสนอบริการหรือผลิตภัณฑ์ใดๆ ของผู้ให้บริการ และ/หรือบุคคลที่เป็นผู้จำหน่าย เป็นตัวแทน หรือมีความเกี่ยวข้องกับผู้ให้บริการ และ/หรือของบุคคลอื่น และเพื่อวัตถุประสงค์อื่นใดที่ไม่ต้องห้ามตามกฎหมาย และ/หรือเพื่อปฏิบัติตามกฎหมายหรือกฎระเบียบที่ใช้บังคับกับผู้ให้บริการ ทั้งขณะนี้และภายภาคหน้า รวมทั้งยินยอมให้ผู้ให้บริการส่ง โอน และ/หรือเปิดเผยข้อมูลส่วนบุคคลให้แก่บริษัท กลุ่มธุรกิจของผู้ให้บริการ พันธมิตรทางธุรกิจ ผู้ให้บริการภายนอก ผู้ประมวลผลข้อมูล ผู้สนใจจะเข้ารับโอนสิทธิ ผู้รับโอนสิทธิ หน่วยงาน/องค์กร/นิติบุคคลใดๆ ที่มีสัญญาอยู่กับผู้ให้บริการหรือมีความสัมพันธ์ด้วย และ/หรือผู้ให้บริการคลาวด์คอมพิวติ้ง โดยยินยอมให้ผู้ให้บริการ ส่ง โอน และ/หรือเปิดเผยข้อมูลดังกล่าวได้ ทั้งในประเทศและต่างประเทศ และบริษัทจะจัดเก็บรักษาข้อมูลดังกล่าวไว้ตามระยะเวลาเท่าที่จำเป็นสำหรับวัตถุประสงค์เหล่านั้นเท่านั้น หากภายหลังมีการเปลี่ยนแปลงวัตถุประสงค์ในการเก็บรวบรวมข้อมูลส่วนบุคคล บริษัทจะประกาศให้ท่านทราบ",
    ],
  },
  {
    n: "5",
    title: "ข้อจำกัดในการใช้และ/หรือเปิดเผยข้อมูลส่วนบุคคล",
    items: [
      {
        label: "5.1",
        text: "บริษัทจะใช้ เปิดเผยข้อมูลส่วนบุคคลของท่านได้ ตามความยินยอมของท่านโดยจะต้องเป็นการใช้ตามวัตถุประสงค์ของการเก็บรวบรวม จัดเก็บ ข้อมูลของบริษัทเท่านั้น บริษัทจะกำกับดูแลพนักงาน เจ้าหน้าที่หรือผู้ปฏิบัติงานของบริษัทมิให้ใช้และ/หรือเปิดเผย ข้อมูลส่วนบุคคลของท่านนอกเหนือไปจากวัตถุประสงค์ของการเก็บรวบรวมข้อมูลส่วนบุคคลหรือเปิดเผยต่อบุคคลภายนอก เว้นแต่",
        sub: [
          {
            label: "5.1.1",
            text: "เป็นการปฏิบัติตามกฎหมาย เช่น พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พระราชบัญญัติว่าด้วยธุรกรรมทางอิเล็กทรอนิกส์ พระราชบัญญัติป้องกันและปราบปรามการฟอกเงิน ประมวลกฎหมายแพ่งและอาญา ประมวลกฎหมายวิธีพิจารณาความแพ่งและอาญา เป็นต้น",
          },
          {
            label: "5.1.2",
            text: "เป็นไปเพื่อประโยชน์แก่การสอบสวนของพนักงานสอบสวน หรือการพิจารณาพิพากษาคดีของศาล",
          },
          {
            label: "5.1.3",
            text: "เพื่อประโยชน์ของท่าน และการขอความยินยอมไม่อาจกระทำได้ในเวลานั้น",
          },
          {
            label: "5.1.4",
            text: "เป็นการจำเป็นเพื่อประโยชน์โดยชอบด้วยกฎหมายของบริษัท หรือของบุคคลหรือนิติบุคคลอื่นที่ไม่ใช่บริษัท",
          },
          {
            label: "5.1.5",
            text: "เป็นการจำเป็นเพื่อการปฏิบัติตามสัญญาซึ่งเจ้าของข้อมูลส่วนบุคคลเป็นคู่สัญญาหรือเพื่อใช้ในการดำเนินการตามคำขอของเจ้าของข้อมูลส่วนบุคคลก่อนเข้าทำสัญญานั้น",
          },
          {
            label: "5.1.6",
            text: "เพื่อให้บรรลุวัตถุประสงค์ที่เกี่ยวกับการจัดทำเอกสารประวัติศาสตร์หรือจดหมายเหตุ เพื่อประโยชน์สาธารณะ หรือเพื่อการศึกษา วิจัย การจัดทำสถิติ ซึ่งได้จัดให้มีมาตรการป้องกันที่เหมาะสม",
          },
        ],
      },
      {
        label: "5.2",
        text: "บริษัท อาจใช้บริการสารสนเทศของผู้ให้บริการซึ่งเป็นบุคคลภายนอกเพื่อให้ดำเนินการเก็บรักษาข้อมูลส่วนบุคคล ซึ่งผู้ให้บริการนั้นจะต้องมีมาตรการรักษาความมั่นคงปลอดภัย โดยห้ามดำเนินการเก็บรวบรวม ใช้หรือเปิดเผยข้อมูลส่วนบุคคลนอกเหนือจากที่บริษัทกำหนด",
      },
    ],
  },
  {
    n: "6",
    title: "สิทธิเกี่ยวกับข้อมูลส่วนบุคคลของท่าน",
    items: [
      {
        label: "6.1",
        text: "ท่านสามารถขอเข้าถึง ขอรับสำเนาข้อมูลส่วนบุคคลของท่าน เช่น สำเนาใบแจ้งหนี้ ตามหลักเกณฑ์และวิธีการที่บริษัทกำหนด หรือขอให้เปิดเผยการได้มาซึ่งข้อมูลส่วนบุคคล ทั้งนี้ บริษัทอาจปฏิเสธคำขอของท่านได้ตามที่กฎหมายกำหนดหรือตามคำสั่งศาล",
      },
      {
        label: "6.2",
        text: "ท่านสามารถขอแก้ไขหรือเปลี่ยนแปลงข้อมูลส่วนบุคคลของท่านที่ไม่ถูกต้องหรือไม่สมบูรณ์ และทำให้ข้อมูลของท่านเป็นปัจจุบันได้",
      },
      {
        label: "6.3",
        text: "ท่านสามารถขอลบหรือทำลายข้อมูลส่วนบุคคลท่าน เว้นแต่เป็นกรณีที่บริษัทต้องปฏิบัติตามกฎหมายที่เกี่ยวข้องในการเก็บรักษาข้อมูลดังกล่าว",
      },
    ],
  },
];

const CONTACT = {
  name: "บริษัท แพคเรด (ประเทศไทย) จำกัด",
  address:
    "28/40 หมู่บ้านสิริ อเวนิว เพชรเกษม 81 ถนนมาเจริญ แขวงหนองแขม เขตหนองแขม กรุงเทพมหานคร 10160",
  phones: [
    { display: "02-421-3325", tel: "+6624213325" },
    { display: "066-131-0253", tel: "+66661310253" },
  ],
};

function PolicyContent({ locale }: { locale: "th" | "en" }) {
  return (
    <div className="mx-auto w-full max-w-[920px]">
      {locale === "en" && (
        <p className="mb-4 rounded-lg bg-surface dark:bg-surface border border-border px-4 py-2.5 text-[12.5px] md:text-[13px] text-muted">
          The full privacy policy below is published in Thai — the official legal version.
        </p>
      )}

      {/* Intro lead */}
      <div className="rounded-2xl border border-primary-100 dark:border-border bg-gradient-to-br from-primary-50 to-white dark:from-surface dark:to-background p-5 md:p-7">
        <p className="text-[13.5px] md:text-[15.5px] leading-[1.85] text-[#374151] dark:text-zinc-200">
          {INTRO}
        </p>
      </div>

      {/* Numbered sections */}
      <div className="mt-4 md:mt-5 space-y-4 md:space-y-5">
        {SECTIONS.map((s) => (
          <section
            key={s.n}
            className="rounded-2xl border border-border bg-surface dark:bg-surface p-5 md:p-7"
          >
            <div className="flex items-center gap-3 mb-3 md:mb-4">
              <span className="flex h-8 w-8 md:h-9 md:w-9 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white text-[14px] md:text-[15px] font-black shadow-[0_4px_10px_rgba(179,0,0,0.22)]">
                {s.n}
              </span>
              <h2 className="text-[16px] md:text-[19px] font-black tracking-tight text-[#111827] dark:text-white">
                {s.title}
              </h2>
            </div>

            {s.paras?.map((p, i) => (
              <p
                key={i}
                className="text-[13.5px] md:text-[15px] leading-[1.85] text-muted mb-3 last:mb-0"
              >
                {p}
              </p>
            ))}

            {s.items && (
              <div className="mt-1 space-y-3">
                {s.items.map((it) => (
                  <div key={it.label}>
                    <div className="flex gap-2.5 md:gap-3">
                      <span className="shrink-0 text-[13px] md:text-[14px] font-black text-primary-600 tabular-nums leading-[1.85]">
                        {it.label}
                      </span>
                      <p className="text-[13.5px] md:text-[15px] leading-[1.85] text-muted">
                        {it.text}
                      </p>
                    </div>
                    {it.sub && (
                      <div className="mt-2 ml-6 md:ml-9 space-y-2 border-l-2 border-primary-100 dark:border-border pl-3 md:pl-4">
                        {it.sub.map((su) => (
                          <div key={su.label} className="flex gap-2.5">
                            <span className="shrink-0 text-[12.5px] md:text-[13.5px] font-bold text-primary-500 tabular-nums leading-[1.8]">
                              {su.label}
                            </span>
                            <p className="text-[13px] md:text-[14.5px] leading-[1.8] text-muted">
                              {su.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}

        {/* Section 7 — contact */}
        <section className="rounded-2xl border border-primary-100 dark:border-border bg-gradient-to-br from-primary-50 to-white dark:from-surface dark:to-background p-5 md:p-7">
          <div className="flex items-center gap-3 mb-3 md:mb-4">
            <span className="flex h-8 w-8 md:h-9 md:w-9 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white text-[14px] md:text-[15px] font-black shadow-[0_4px_10px_rgba(179,0,0,0.22)]">
              7
            </span>
            <h2 className="text-[16px] md:text-[19px] font-black tracking-tight text-[#111827] dark:text-white">
              ช่องทางการติดต่อบริษัท
            </h2>
          </div>
          <p className="text-[15px] md:text-[17px] font-black text-[#111827] dark:text-white">
            {CONTACT.name}
          </p>
          <div className="mt-2.5 flex items-start gap-2 text-[13.5px] md:text-[15px] leading-[1.8] text-muted">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" strokeWidth={2.4} />
            <span>{CONTACT.address}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] md:text-[15px] text-muted">
            <Phone className="h-4 w-4 shrink-0 text-primary-600" strokeWidth={2.4} />
            <span>โทร.</span>
            {CONTACT.phones.map((ph, i) => (
              <span key={ph.tel} className="inline-flex items-center">
                <a
                  href={`tel:${ph.tel}`}
                  className="font-bold text-primary-600 hover:text-primary-700 hover:underline transition-colors"
                >
                  {ph.display}
                </a>
                {i < CONTACT.phones.length - 1 && <span className="ml-2">,</span>}
              </span>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  return (
    <>
      <JsonLd
        data={breadcrumbSchema(
          [
            { name: typedLocale === "th" ? "หน้าหลัก" : "Home", path: "/" },
            { name: typedLocale === "th" ? "นโยบายความเป็นส่วนตัว" : "Privacy policy", path: PATH },
          ],
          typedLocale,
        )}
      />
      <StubPage
        eyebrow="PRIVACY POLICY"
        title={typedLocale === "th" ? "นโยบายความ" : "Privacy"}
        highlight={typedLocale === "th" ? "เป็นส่วนตัว" : "Policy"}
        description={
          typedLocale === "th"
            ? "วิธีการที่ Pacred Shipping เก็บ ใช้ และคุ้มครองข้อมูลส่วนบุคคลของลูกค้าตามมาตรฐาน PDPA"
            : "How Pacred Shipping collects, uses, and protects personal information under Thailand's PDPA."
        }
        breadcrumb={[{ label: typedLocale === "th" ? "นโยบายความเป็นส่วนตัว" : "Privacy policy" }]}
      >
        <PolicyContent locale={typedLocale} />
      </StubPage>
    </>
  );
}
