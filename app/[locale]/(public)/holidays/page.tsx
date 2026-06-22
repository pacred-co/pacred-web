import type { Metadata } from "next";
import { CalendarDays, Info } from "lucide-react";
import { StubPage } from "@/components/stub-page";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";

const PATH = "/holidays";

type Loc = "th" | "en";
type Holiday = { d: number; m: number; ce: number; dow: number; th: string; en: string };

// ปฏิทินวันหยุดบริษัท แพคเรด (ประเทศไทย) จำกัด ปี พ.ศ. 2569 (ค.ศ. 2026)
// dow: 0=อาทิตย์ … 6=เสาร์
const HOLIDAYS: Holiday[] = [
  { d: 1, m: 1, ce: 2026, dow: 4, th: "วันขึ้นปีใหม่", en: "New Year's Day" },
  { d: 16, m: 2, ce: 2026, dow: 1, th: "วันตรุษจีน", en: "Chinese New Year" },
  { d: 17, m: 2, ce: 2026, dow: 2, th: "วันตรุษจีน", en: "Chinese New Year" },
  { d: 3, m: 3, ce: 2026, dow: 2, th: "วันมาฆบูชา", en: "Makha Bucha Day" },
  { d: 13, m: 4, ce: 2026, dow: 1, th: "วันสงกรานต์", en: "Songkran Festival" },
  { d: 14, m: 4, ce: 2026, dow: 2, th: "วันสงกรานต์", en: "Songkran Festival" },
  { d: 15, m: 4, ce: 2026, dow: 3, th: "วันสงกรานต์", en: "Songkran Festival" },
  { d: 1, m: 5, ce: 2026, dow: 5, th: "วันแรงงานแห่งชาติ", en: "National Labour Day" },
  { d: 1, m: 6, ce: 2026, dow: 3, th: "วันชดเชยวันวิสาขบูชา", en: "Visakha Bucha Day (substitution)" },
  {
    d: 28,
    m: 7,
    ce: 2026,
    dow: 2,
    th: "วันเฉลิมพระชนมพรรษา พระบาทสมเด็จพระเจ้าอยู่หัว",
    en: "H.M. The King's Birthday",
  },
  { d: 29, m: 7, ce: 2026, dow: 3, th: "วันอาสาฬหบูชา", en: "Asarnha Bucha Day" },
  {
    d: 12,
    m: 8,
    ce: 2026,
    dow: 3,
    th: "วันแม่แห่งชาติ และวันเฉลิมพระชนมพรรษา สมเด็จพระนางเจ้าฯ พระบรมราชินีนาถ",
    en: "National Mother's Day / H.M. The Queen Mother's Birthday",
  },
  { d: 13, m: 10, ce: 2026, dow: 2, th: "วันคล้ายวันสวรรคต รัชกาลที่ 9", en: "Passing of King Bhumibol (Rama IX)" },
  { d: 23, m: 10, ce: 2026, dow: 5, th: "วันปิยมหาราช", en: "Chulalongkorn Day" },
  { d: 5, m: 12, ce: 2026, dow: 6, th: "วันพ่อแห่งชาติ", en: "National Father's Day" },
  { d: 31, m: 12, ce: 2026, dow: 4, th: "วันหยุดปีใหม่", en: "New Year's Holiday" },
  { d: 1, m: 1, ce: 2027, dow: 5, th: "วันหยุดปีใหม่", en: "New Year's Holiday" },
  { d: 2, m: 1, ce: 2027, dow: 6, th: "วันหยุดปีใหม่", en: "New Year's Holiday" },
];

const MONTHS_TH = ["", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const MONTHS_TH_ABBR = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const MONTHS_EN = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_EN_ABBR = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS_TH = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const DAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function HolidaysCalendar({ locale }: { locale: Loc }) {
  const isTh = locale === "th";
  const monthsAbbr = isTh ? MONTHS_TH_ABBR : MONTHS_EN_ABBR;
  const monthsFull = isTh ? MONTHS_TH : MONTHS_EN;
  const days = isTh ? DAYS_TH : DAYS_EN;

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Header strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-gradient-to-br from-surface to-white dark:from-surface dark:to-background px-4 py-3.5 md:px-5 md:py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-[0_6px_14px_rgba(179,0,0,0.22)]">
            <CalendarDays className="h-5 w-5" strokeWidth={2.4} />
          </div>
          <div>
            <p className="text-[15px] md:text-[16px] font-black leading-tight text-[#111827] dark:text-white">
              {isTh ? "ปฏิทินวันหยุด พ.ศ. 2569" : "Holiday Calendar 2026"}
            </p>
            <p className="text-[12px] text-muted">
              {isTh ? "บริษัท แพคเรด (ประเทศไทย) จำกัด · ค.ศ. 2026" : "Pacred (Thailand) Co., Ltd."}
            </p>
          </div>
        </div>
        <span className="rounded-full bg-primary-50 px-3 py-1 text-[12px] font-black text-primary-700 dark:bg-primary-950/50 dark:text-primary-300">
          {isTh ? `${HOLIDAYS.length} วันหยุด` : `${HOLIDAYS.length} holidays`}
        </span>
      </div>

      {/* Holiday grid */}
      <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2 md:gap-3">
        {HOLIDAYS.map((h, i) => (
          <li
            key={i}
            className="flex items-center gap-3.5 rounded-xl border border-border bg-white p-3 transition-colors hover:border-primary-300 dark:bg-surface dark:hover:border-primary-800 md:p-3.5"
          >
            <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-[0_6px_14px_rgba(179,0,0,0.20)]">
              <span className="text-[20px] font-black leading-none">{h.d}</span>
              <span className="mt-0.5 text-[11px] font-bold leading-none opacity-90">{monthsAbbr[h.m]}</span>
            </div>
            <div className="min-w-0">
              <p className="text-[13.5px] font-bold leading-snug text-[#111827] dark:text-white md:text-[14px]">
                {isTh ? h.th : h.en}
              </p>
              <p className="mt-0.5 text-[11.5px] text-muted">
                {isTh
                  ? `วัน${days[h.dow]} · ${h.d} ${monthsFull[h.m]} ${h.ce + 543}`
                  : `${days[h.dow]} · ${h.d} ${monthsFull[h.m]} ${h.ce}`}
              </p>
            </div>
          </li>
        ))}
      </ul>

      {/* Planning note */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 dark:border-amber-900/50 dark:bg-amber-950/20">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" strokeWidth={2.4} />
        <p className="text-[12.5px] leading-[1.6] text-amber-900 dark:text-amber-200/90 md:text-[13px]">
          {isTh
            ? "บริษัทฯ หยุดทำการตามวันหยุดข้างต้น — ช่วงเทศกาลตรุษจีนและวันหยุดยาว แนะนำให้วางแผนการสั่งซื้อและนำเข้าล่วงหน้า เนื่องจากโรงงานและขนส่งในจีนอาจหยุดต่อเนื่องหลายวัน"
            : "Pacred is closed on the dates above. During Chinese New Year and long holidays, please plan your orders and imports ahead — factories and logistics in China may close for several consecutive days."}
        </p>
      </div>
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: "seo.holidays" });
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale = (locale === "en" ? "en" : "th") as Loc;
  return (
    <>
      <JsonLd
        data={breadcrumbSchema(
          [
            { name: typedLocale === "th" ? "หน้าหลัก" : "Home", path: "/" },
            { name: typedLocale === "th" ? "วันหยุดประจำปี" : "Holidays", path: PATH },
          ],
          typedLocale,
        )}
      />
      <StubPage
        eyebrow="HOLIDAYS 2026"
        title={typedLocale === "th" ? "วันหยุดประจำปี" : "Holidays"}
        highlight="Pacred 2026"
        description={
          typedLocale === "th"
            ? "ปฏิทินวันหยุดของ Pacred Shipping ตลอดทั้งปี — รวมวันหยุดศุลกากรไทยและจีน เพื่อให้คุณวางแผนการนำเข้า-ส่งออกได้แม่นยำ"
            : "Pacred Shipping's annual calendar, including Thai and Chinese customs holidays, for accurate import-export planning."
        }
        breadcrumb={[{ label: typedLocale === "th" ? "วันหยุดประจำปี" : "Holidays" }]}
      >
        <HolidaysCalendar locale={typedLocale} />
      </StubPage>
    </>
  );
}
