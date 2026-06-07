import { Tag } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { RelatedTagsTabs } from "@/components/sections/related-tags-tabs";

/**
 * LCL related tags — mirrors the customs landing "Related tags" block:
 * eyebrow + h2 + p + <RelatedTagsTabs groups={...} />.
 */
export function LclRelatedTags() {
  const t = useTranslations("lclRelatedTags");

  // LCL-themed tag groups — keyword chips for SEO + internal linking.
  const TAG_GROUPS: { title: string; items: string[] }[] = [
    {
      title: t("g1Title"),
      items: [
        t("g1i1"),
        t("g1i2"),
        t("g1i3"),
        t("g1i4"),
        t("g1i5"),
        t("g1i6"),
        t("g1i7"),
        t("g1i8"),
        t("g1i9"),
        t("g1i10"),
        t("g1i11"),
        t("g1i12"),
        t("g1i13"),
        t("g1i14"),
        t("g1i15"),
      ],
    },
    {
      title: t("g2Title"),
      items: [
        t("g2i1"),
        t("g2i2"),
        t("g2i3"),
        t("g2i4"),
        t("g2i5"),
        t("g2i6"),
        t("g2i7"),
        t("g2i8"),
        t("g2i9"),
        t("g2i10"),
        t("g2i11"),
        t("g2i12"),
        t("g2i13"),
        t("g2i14"),
      ],
    },
    {
      title: t("g3Title"),
      items: [
        t("g3i1"),
        t("g3i2"),
        t("g3i3"),
        t("g3i4"),
        t("g3i5"),
        t("g3i6"),
        t("g3i7"),
        t("g3i8"),
        t("g3i9"),
        t("g3i10"),
        t("g3i11"),
        t("g3i12"),
        t("g3i13"),
        t("g3i14"),
      ],
    },
    {
      title: t("g4Title"),
      items: [
        t("g4i1"),
        t("g4i2"),
        t("g4i3"),
        t("g4i4"),
        t("g4i5"),
        t("g4i6"),
        t("g4i7"),
        t("g4i8"),
        t("g4i9"),
        t("g4i10"),
        t("g4i11"),
        t("g4i12"),
        t("g4i13"),
        t("g4i14"),
      ],
    },
    {
      title: t("g5Title"),
      items: [
        t("g5i1"),
        t("g5i2"),
        t("g5i3"),
        t("g5i4"),
        t("g5i5"),
        t("g5i6"),
        t("g5i7"),
        t("g5i8"),
        t("g5i9"),
        t("g5i10"),
        t("g5i11"),
        t("g5i12"),
      ],
    },
    {
      title: t("g6Title"),
      items: [
        t("g6i1"),
        t("g6i2"),
        t("g6i3"),
        t("g6i4"),
        t("g6i5"),
        t("g6i6"),
        t("g6i7"),
        t("g6i8"),
        t("g6i9"),
        t("g6i10"),
        t("g6i11"),
        t("g6i12"),
        t("g6i13"),
        t("g6i14"),
        t("g6i15"),
        t("g6i16"),
      ],
    },
  ];

  return (
    <section className="relative pt-1.5 md:pt-3 pb-1 md:pb-2">
      <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
        <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
          <Tag className="w-3.5 h-3.5" strokeWidth={2.6} />
          {t("eyebrow")}
        </div>
        <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
          {t("headingPrefix")} <span className="text-primary-600">{t("headingHighlight")}</span> {t("headingSuffix")}
        </h2>
        <p className="mt-2 md:mt-3 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[920px]">
          {t("descPrefix")} <Link href="/knowledge" className="text-primary-600 hover:text-primary-700 font-bold underline-offset-4 hover:underline">{t("descLink")}</Link>
        </p>

        <div className="mt-6 md:mt-8">
          <RelatedTagsTabs groups={TAG_GROUPS} />
        </div>
      </div>
    </section>
  );
}
