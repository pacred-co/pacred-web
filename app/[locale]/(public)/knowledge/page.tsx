import type { Metadata } from "next";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { Footer } from "@/components/sections/footer";
import { ImportExportBanner } from "@/components/sections/import-export-banner";
import { ArticleListTabs } from "@/components/sections/article-list-tabs";
import { KNOWLEDGE_ARTICLES } from "@/lib/knowledge-articles";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";
import { SITE_URL } from "@/components/seo/site";

const PATH = "/knowledge";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: "seo.knowledge.index" });
}

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

export default async function KnowledgeListingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: typedLocale === "th" ? "สาระน่ารู้นำเข้า-ส่งออก เคลียร์ศุลกากร" : "Knowledge base — import, export, customs",
    itemListElement: KNOWLEDGE_ARTICLES.map((a, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}${typedLocale === "en" ? "/en" : ""}/knowledge/${a.slug}`,
      name: a.title,
    })),
  };
  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema(
            [
              { name: typedLocale === "th" ? "หน้าหลัก" : "Home", path: "/" },
              { name: typedLocale === "th" ? "สาระน่ารู้" : "Knowledge", path: PATH },
            ],
            typedLocale,
          ),
          itemList,
        ]}
      />
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

              {/* Tab switcher — knowledge ↔ news */}
              <div className="mt-5 md:mt-6 flex justify-center md:justify-start">
                <ArticleListTabs active="knowledge" />
              </div>

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

            {/* Articles grid — same compact card style as the home page Blog carousel
                (per ปอน 2026-05-15 — match home knowledge cards: badge + title only) */}
            <div className="mx-auto mt-6 md:mt-10 w-full max-w-[1120px] grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 md:gap-3">
              {KNOWLEDGE_ARTICLES.map((article) => (
                <Link
                  key={article.id}
                  href={`/knowledge/${article.slug}`}
                  className="group relative bg-white dark:bg-surface rounded-2xl overflow-hidden border border-border shadow-[0_4px_14px_rgba(15,23,42,0.05)] hover:shadow-[0_18px_36px_rgba(179,0,0,0.12)] hover:border-primary-200 hover:-translate-y-1 transition-all duration-300"
                >
                  <div className="relative aspect-[3/4] overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 dark:from-surface-alt dark:to-background">
                    <Image
                      src={article.image}
                      alt={article.title}
                      fill
                      sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 240px"
                      quality={92}
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                    />
                    <div className="absolute top-2.5 left-2.5">
                      <span
                        className={[
                          "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider border shadow-[0_2px_6px_rgba(0,0,0,0.10)]",
                          CATEGORY_BADGE[article.category],
                        ].join(" ")}
                      >
                        {article.category}
                      </span>
                    </div>
                  </div>
                  <div className="p-3 md:p-3.5">
                    <h3 className="text-[12.5px] md:text-[13px] font-black text-[#111827] dark:text-white leading-[1.3] line-clamp-2 group-hover:text-primary-700 transition-colors">
                      {article.title}
                    </h3>
                  </div>
                </Link>
              ))}
            </div>

          </div>
        </section>

        {/* Banner CTA — แทน CTA card เล็ก */}
        <ImportExportBanner />
      </main>
      <Footer />
    </>
  );
}
