import type { Metadata } from "next";
import { StubPage } from "@/components/stub-page";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";

const PATH = "/holidays";

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
  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
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
        highlight={typedLocale === "th" ? "Pacred 2026" : "Pacred 2026"}
        description={
          typedLocale === "th"
            ? "ปฏิทินวันหยุดของ Pacred Shipping ตลอดทั้งปี — รวมวันหยุดศุลกากรไทยและจีน เพื่อให้คุณวางแผนการนำเข้า-ส่งออกได้แม่นยำ"
            : "Pacred Shipping's annual calendar, including Thai and Chinese customs holidays, for accurate import-export planning."
        }
        breadcrumb={[{ label: typedLocale === "th" ? "วันหยุดประจำปี" : "Holidays" }]}
      />
    </>
  );
}
