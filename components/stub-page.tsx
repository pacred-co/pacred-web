import { type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { ArrowRight, ChevronRight, Sparkles } from "lucide-react";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { Footer } from "@/components/sections/footer";

const LINE_URL = "https://lin.ee/Yg3fU0I";

export type Breadcrumb = { label: string; href?: string };

export function StubPage({
  eyebrow,
  title,
  highlight,
  description,
  breadcrumb,
  children,
}: {
  eyebrow: string;
  title: string;
  highlight?: string;
  description?: string;
  breadcrumb?: Breadcrumb[];
  children?: ReactNode;
}) {
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
                  หน้าหลัก
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

            {/* CTA card */}
            <div className="mx-auto mt-10 md:mt-14 w-full max-w-[1120px]">
              <div className="rounded-2xl bg-gradient-to-br from-primary-50 via-white to-primary-50/40 dark:from-primary-950/30 dark:via-surface dark:to-primary-950/10 border border-primary-100 dark:border-primary-900/40 p-5 md:p-7 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-[18px] md:text-[22px] font-black text-[#111827] dark:text-white leading-tight tracking-tight">
                    มีคำถาม? ปรึกษาทีม Pacred Shipping ฟรี
                  </h3>
                  <p className="mt-1 text-[12.5px] md:text-[14px] text-muted">
                    ตอบทุกเรื่องนำเข้า-ส่งออก เคลียร์ด่าน — โดยมืออาชีพ 14+ ปี
                  </p>
                </div>
                <a
                  href={LINE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full md:w-auto inline-flex items-center justify-center gap-1.5 h-[44px] px-5 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white text-[13px] md:text-[14px] font-black shadow-[0_8px_20px_rgba(179,0,0,0.28)] hover:shadow-[0_12px_26px_rgba(179,0,0,0.38)] hover:-translate-y-0.5 transition-all duration-300"
                >
                  ทักไลน์เลย
                  <ArrowRight className="w-4 h-4" strokeWidth={3} />
                </a>
              </div>
            </div>

          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function DefaultPlaceholder() {
  return (
    <div className="relative rounded-2xl md:rounded-3xl border border-dashed border-border bg-gradient-to-br from-surface to-white dark:from-surface dark:to-background p-10 md:p-16 text-center">
      <div className="mx-auto w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center shadow-[0_10px_24px_rgba(179,0,0,0.25)] mb-4">
        <Sparkles className="w-7 h-7 md:w-8 md:h-8" fill="currentColor" strokeWidth={0} />
      </div>
      <h2 className="text-[20px] md:text-[26px] font-black text-[#111827] dark:text-white tracking-tight">
        กำลังเตรียมข้อมูลให้คุณ
      </h2>
      <p className="mt-2 text-[13px] md:text-[15px] text-muted max-w-[520px] mx-auto leading-[1.6]">
        เนื้อหาส่วนนี้กำลังอยู่ระหว่างการอัปเดต — ระหว่างนี้คุณสามารถปรึกษาทีม Pacred Shipping ได้ผ่าน LINE หรือเบอร์โทรด้านล่าง
      </p>
    </div>
  );
}
