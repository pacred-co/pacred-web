import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { ArrowRight, BookOpen } from "lucide-react";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { Footer } from "@/components/sections/footer";
import { KNOWLEDGE_ARTICLES } from "@/lib/knowledge-articles";

export const metadata = {
  title: "สาระน่ารู้ · Pacred Shipping",
  description:
    "รวมบทความนำเข้า–ส่งออก เคลียร์สินค้าติดด่าน CIF FTA Incoterms และเคล็ดลับมือโปร จาก Pacred Shipping",
};

const CATEGORIES: { id: string; label: string; color: string }[] = [
  { id: "นำเข้า",  label: "นำเข้า",  color: "bg-primary-600" },
  { id: "เคลียร์", label: "เคลียร์", color: "bg-blue-600"    },
  { id: "ส่งออก",  label: "ส่งออก",  color: "bg-orange-600"  },
];

const CATEGORY_BADGE: Record<string, string> = {
  นำเข้า:  "bg-primary-50 text-primary-700 border-primary-200 dark:bg-primary-900/30 dark:text-primary-300 dark:border-primary-900/50",
  เคลียร์: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-900/50",
  ส่งออก:  "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-900/50",
};

export default function KnowledgeListingPage() {
  return (
    <>
      <NavBar />
      <SearchBar />
      <main>
        <section className="relative pt-6 md:pt-10 pb-10 md:pb-16">
          <div className="mx-auto w-full max-w-[1140px] px-[10px]">

            {/* Header */}
            <div className="mx-auto w-full max-w-[1120px] text-center md:text-left">
              <div className="inline-flex items-center gap-2 mb-2 text-primary-600 text-[13px] font-black tracking-[0.08em] uppercase">
                <span className="w-2 h-2 rounded-full bg-primary-600 shrink-0" />
                KNOWLEDGE BASE
              </div>
              <h1 className="text-[28px] md:text-[42px] leading-[1.15] font-black tracking-[-0.04em] text-[#111827] dark:text-white">
                สาระน่ารู้{" "}
                <span className="text-primary-600">นำเข้า–ส่งออก</span> ฉบับมือโปร
              </h1>
              <p className="mt-3 text-[14px] md:text-[16px] leading-[1.6] text-muted max-w-[760px] md:mx-0 mx-auto">
                รวมบทความ CIF · FTA · Incoterms · เคลียร์สินค้าติดด่าน — เขียนจากประสบการณ์ทีม Pacred Shipping
              </p>

              {/* Category overview */}
              <div className="mt-5 md:mt-6 flex flex-wrap gap-2 justify-center md:justify-start">
                {CATEGORIES.map((c) => {
                  const count = KNOWLEDGE_ARTICLES.filter((a) => a.category === c.id).length;
                  return (
                    <span
                      key={c.id}
                      className="inline-flex items-center gap-1.5 h-8 md:h-9 px-3 md:px-3.5 rounded-full bg-white dark:bg-surface border border-border text-[12px] md:text-[13px] font-black text-[#111827] dark:text-white"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${c.color}`} />
                      {c.label}
                      <span className="text-muted font-bold">· {count}</span>
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Articles grid */}
            <div className="mx-auto mt-8 md:mt-10 w-full max-w-[1120px] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {KNOWLEDGE_ARTICLES.map((article) => (
                <Link
                  key={article.id}
                  href={`/knowledge/${article.slug}`}
                  className="group relative flex flex-col bg-white dark:bg-surface rounded-2xl border border-border overflow-hidden shadow-[0_4px_14px_rgba(15,23,42,0.05)] hover:shadow-[0_20px_40px_rgba(179,0,0,0.12)] hover:border-primary-200 dark:hover:border-primary-900 hover:-translate-y-1 transition-all duration-400"
                >
                  {/* Image */}
                  <div className="relative aspect-[3/4] overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 dark:from-surface-alt dark:to-background">
                    <Image
                      src={article.image}
                      alt={article.title}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 360px"
                      quality={92}
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                    />
                    {/* Category badge */}
                    <div className="absolute top-3 left-3">
                      <span
                        className={[
                          "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-black tracking-wider border shadow-[0_2px_6px_rgba(0,0,0,0.10)]",
                          CATEGORY_BADGE[article.category],
                        ].join(" ")}
                      >
                        {article.category}
                      </span>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex flex-col p-4 md:p-5 gap-2 flex-1">
                    <h3 className="text-[14.5px] md:text-[15.5px] font-black text-[#111827] dark:text-white leading-[1.3] tracking-tight line-clamp-2 group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors">
                      {article.title}
                    </h3>
                    <p className="text-[12.5px] md:text-[13px] text-muted leading-[1.55] line-clamp-3">
                      {article.excerpt}
                    </p>

                    {/* Read more */}
                    <div className="mt-auto pt-2 flex items-center gap-1 text-primary-600 text-[12px] font-black opacity-80 group-hover:opacity-100 transition-opacity">
                      อ่านบทความ
                      <ArrowRight className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-1" strokeWidth={3} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Footer CTA */}
            <div className="mx-auto mt-10 md:mt-14 w-full max-w-[1120px] rounded-2xl bg-gradient-to-br from-primary-50 via-white to-primary-50/40 dark:from-primary-950/30 dark:via-surface dark:to-primary-950/10 border border-primary-100 dark:border-primary-900/40 p-5 md:p-7 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 md:w-12 md:h-12 shrink-0 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center shadow-[0_8px_18px_rgba(179,0,0,0.25)]">
                  <BookOpen className="w-5 h-5 md:w-6 md:h-6" strokeWidth={2.2} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[16px] md:text-[19px] font-black text-[#111827] dark:text-white leading-tight">
                    มีคำถามเฉพาะเคส? ปรึกษาทีม Pacred Shipping ฟรี
                  </h3>
                  <p className="mt-0.5 text-[12.5px] md:text-[14px] text-muted">
                    ตอบทุกเรื่อง CIF · FTA · เคลียร์ด่าน · นำเข้า–ส่งออก โดยมืออาชีพ 14+ ปี
                  </p>
                </div>
              </div>
              <a
                href="https://lin.ee/Yg3fU0I"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full md:w-auto shrink-0 inline-flex items-center justify-center gap-1.5 h-[44px] px-5 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white text-[13px] md:text-[14px] font-black shadow-[0_8px_20px_rgba(179,0,0,0.28)] hover:shadow-[0_12px_26px_rgba(179,0,0,0.38)] hover:-translate-y-0.5 transition-all duration-300"
              >
                ปรึกษา Pacred ฟรี
                <ArrowRight className="w-4 h-4" strokeWidth={3} />
              </a>
            </div>

          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
