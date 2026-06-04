import { type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ChevronRight, Sparkles } from "lucide-react";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { Footer } from "@/components/sections/footer";
import { ImportExportBanner } from "@/components/sections/import-export-banner";
import { ClearanceBanner } from "@/components/sections/clearance-banner";
import { PurchaseBanner } from "@/components/sections/purchase-banner";
import { RotatingServiceBanner } from "@/components/sections/rotating-service-banner";

export type Breadcrumb = { label: string; href?: string };
export type StubBanner = "import-export" | "clearance" | "purchase" | "rotate";

export function StubPage({
  eyebrow,
  title,
  highlight,
  description,
  breadcrumb,
  banner = "import-export",
  children,
}: {
  eyebrow: string;
  title: string;
  highlight?: string;
  description?: string;
  breadcrumb?: Breadcrumb[];
  banner?: StubBanner;
  children?: ReactNode;
}) {
  const tPl = useTranslations("placeholders");
  return (
    <>
      <NavBar />
      <SearchBar />
      <main>
        <section className="relative pt-4 md:pt-6 pb-12 md:pb-20">
          <div className="mx-auto w-full max-w-[1140px] px-[10px]">

            {/* Breadcrumb */}
            {breadcrumb && breadcrumb.length > 0 && (
              <nav className="mx-auto w-full max-w-[1120px] flex items-center gap-1 text-[11.5px] md:text-[12.5px] text-muted mb-4 md:mb-5 flex-wrap">
                <Link href="/" className="hover:text-primary-600 transition-colors font-bold">
                  {tPl("homeBreadcrumb")}
                </Link>
                {breadcrumb.map((b, i) => (
                  <span key={i} className="inline-flex items-center gap-1">
                    <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
                    {b.href ? (
                      <Link href={b.href} className="hover:text-primary-600 transition-colors font-bold">
                        {b.label}
                      </Link>
                    ) : (
                      <span className="font-bold text-[#111827] dark:text-white">{b.label}</span>
                    )}
                  </span>
                ))}
              </nav>
            )}

            {/* Header */}
            <div className="mx-auto w-full max-w-[1120px]">
              <div className="flex items-center gap-2 mb-2 text-primary-600 text-[12px] md:text-[13px] font-black tracking-[0.12em] uppercase">
                <span className="w-2 h-2 rounded-full bg-primary-600 shrink-0" />
                {eyebrow}
              </div>
              <h1 className="text-[28px] md:text-[42px] leading-[1.15] font-black tracking-[-0.04em] text-[#111827] dark:text-white">
                {title}
                {highlight && (
                  <>
                    {" "}<span className="text-primary-600">{highlight}</span>
                  </>
                )}
              </h1>
              {description && (
                <p className="mt-3 md:mt-4 text-[14px] md:text-[16px] leading-[1.65] text-muted max-w-[720px]">
                  {description}
                </p>
              )}
            </div>

            {/* Content slot or default placeholder */}
            <div className="mx-auto mt-8 md:mt-10 w-full max-w-[1120px]">
              {children ?? <DefaultPlaceholder />}
            </div>

          </div>
        </section>

        {/* Banner CTA — แทน CTA card เล็ก */}
        {banner === "rotate" ? (
          <RotatingServiceBanner />
        ) : banner === "clearance" ? (
          <ClearanceBanner />
        ) : banner === "purchase" ? (
          <PurchaseBanner />
        ) : (
          <ImportExportBanner />
        )}
      </main>
      <Footer />
    </>
  );
}

function DefaultPlaceholder() {
  const t = useTranslations("placeholders");
  return (
    <div className="relative rounded-2xl md:rounded-3xl border border-dashed border-border bg-gradient-to-br from-surface to-white dark:from-surface dark:to-background p-10 md:p-16 text-center">
      <div className="mx-auto w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center shadow-[0_10px_24px_rgba(179,0,0,0.25)] mb-4">
        <Sparkles className="w-7 h-7 md:w-8 md:h-8" fill="currentColor" strokeWidth={0} />
      </div>
      <h2 className="text-[20px] md:text-[26px] font-black text-[#111827] dark:text-white tracking-tight">
        {t("stubPreparing")}
      </h2>
      <p className="mt-2 text-[13px] md:text-[15px] text-muted max-w-[520px] mx-auto leading-[1.6]">
        {t("stubBody")}
      </p>
    </div>
  );
}
