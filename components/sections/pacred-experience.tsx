import { getTranslations } from "next-intl/server";

export async function PacredExperience() {
  const t = await getTranslations("pacredExperience");
  const strong = (chunks: React.ReactNode) => (
    <strong className="text-primary-600 font-extrabold">{chunks}</strong>
  );
  return (
    <section className="py-6 md:py-12">
      <div className="mx-auto w-full max-w-[1280px] px-4">

        {/* Header */}
        <div className="mb-5 md:mb-8">
          <div className="flex items-center gap-1.5 mb-1 md:mb-1.5 text-primary-600 text-[10.5px] md:text-[13px] font-black tracking-[0.08em] uppercase">
            <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-primary-600 shrink-0" />
            OPEN EXPERIENCE
          </div>
          <h2 className="text-[22px] md:text-[40px] leading-[1.22] md:leading-[1.15] font-black tracking-[-0.03em] md:tracking-[-0.04em] text-[#111827] dark:text-white">
            <span className="text-primary-600">Pacred Shipping</span> {t("titleRest")}
          </h2>
        </div>

        {/* Grid of paragraphs with left border accent */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6 md:gap-y-7">

          <p className="pl-4 md:pl-6 border-l-2 md:border-l-[3px] border-border hover:border-primary-600 hover:translate-x-1.5 transition-all duration-300 text-[13.5px] md:text-[16px] leading-[1.7] md:leading-[1.85] text-[#4b5563] dark:text-white/80">
            {t.rich("p1", { strong })}
          </p>

          <p className="pl-4 md:pl-6 border-l-2 md:border-l-[3px] border-border hover:border-primary-600 hover:translate-x-1.5 transition-all duration-300 text-[13.5px] md:text-[16px] leading-[1.7] md:leading-[1.85] text-[#4b5563] dark:text-white/80">
            {t("p2")}
          </p>

          <p className="pl-4 md:pl-6 border-l-2 md:border-l-[3px] border-border hover:border-primary-600 hover:translate-x-1.5 transition-all duration-300 text-[13.5px] md:text-[16px] leading-[1.7] md:leading-[1.85] text-[#4b5563] dark:text-white/80">
            {t("p3")}
          </p>

          <p className="pl-4 md:pl-6 border-l-2 md:border-l-[3px] border-border hover:border-primary-600 hover:translate-x-1.5 transition-all duration-300 text-[13.5px] md:text-[16px] leading-[1.7] md:leading-[1.85] text-[#4b5563] dark:text-white/80">
            {t.rich("p4", { strong })}
          </p>

          <p className="md:col-span-2 pl-4 md:pl-6 border-l-2 md:border-l-[3px] border-border hover:border-primary-600 hover:translate-x-1.5 transition-all duration-300 text-[13.5px] md:text-[16px] leading-[1.7] md:leading-[1.85] text-[#4b5563] dark:text-white/80">
            {t.rich("p5", { strong })}
          </p>
        </div>
      </div>
    </section>
  );
}
