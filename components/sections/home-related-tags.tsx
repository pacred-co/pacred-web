import { Tag } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { RelatedTagsTabs } from "@/components/sections/related-tags-tabs";

export function HomeRelatedTags() {
  const t = useTranslations("homeRelatedTags");

  /**
   * Home page "Related topics" section — Trip.com-style tabs.
   *
   * Per ปอน 2026-05-23: reuse the RelatedTagsTabs component (originally built
   * for the customs-clearance landing) and fill with 7 home-relevant tabs.
   * Every tag click routes to `/knowledge` (the component's built-in behaviour).
   */
  const HOME_TAG_GROUPS: { title: string; items: string[] }[] = [
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
        t("g1i16"),
        t("g1i17"),
        t("g1i18"),
        t("g1i19"),
        t("g1i20"),
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
        t("g2i15"),
        t("g2i16"),
        t("g2i17"),
        t("g2i18"),
        t("g2i19"),
        t("g2i20"),
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
        t("g3i15"),
        t("g3i16"),
        t("g3i17"),
        t("g3i18"),
        t("g3i19"),
        t("g3i20"),
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
        t("g4i15"),
        t("g4i16"),
        t("g4i17"),
        t("g4i18"),
        t("g4i19"),
        t("g4i20"),
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
        t("g5i13"),
        t("g5i14"),
        t("g5i15"),
        t("g5i16"),
        t("g5i17"),
        t("g5i18"),
        t("g5i19"),
        t("g5i20"),
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
        t("g6i17"),
        t("g6i18"),
        t("g6i19"),
        t("g6i20"),
      ],
    },
    {
      title: t("g7Title"),
      items: [
        t("g7i1"),
        t("g7i2"),
        t("g7i3"),
        t("g7i4"),
        t("g7i5"),
        t("g7i6"),
        t("g7i7"),
        t("g7i8"),
        t("g7i9"),
        t("g7i10"),
        t("g7i11"),
        t("g7i12"),
        t("g7i13"),
        t("g7i14"),
        t("g7i15"),
        t("g7i16"),
        t("g7i17"),
        t("g7i18"),
        t("g7i19"),
        t("g7i20"),
      ],
    },
  ];

  return (
    <section className="relative pt-6 md:pt-10 pb-2 md:pb-4">
      <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
        <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
          <Tag className="w-3.5 h-3.5" strokeWidth={2.6} />
          {t("eyebrow")}
        </div>
        <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
          <span className="text-primary-600">{t("headingHighlight")}</span>{" "}
          {t("headingRest")}
        </h2>
        <p className="mt-2 md:mt-3 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[920px]">
          {t("descPrefix")}{" "}
          <Link
            href="/knowledge"
            className="text-primary-600 hover:text-primary-700 font-bold underline-offset-4 hover:underline"
          >
            {t("descLink")}
          </Link>
        </p>

        <div className="mt-6 md:mt-8">
          <RelatedTagsTabs groups={HOME_TAG_GROUPS} />
        </div>
      </div>
    </section>
  );
}
