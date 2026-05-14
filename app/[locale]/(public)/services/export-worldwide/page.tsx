import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { StubPage } from "@/components/stub-page";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema, serviceSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";

const PATH = "/services/export-worldwide";
const NS = "seo.services.exportWorldwide";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: NS });
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const t = await getTranslations({ locale, namespace: NS });
  const homeLabel = typedLocale === "th" ? "หน้าหลัก" : "Home";
  const svcLabel  = typedLocale === "th" ? "บริการ" : "Services";
  const here      = typedLocale === "th" ? "ส่งออกสินค้าทั่วโลก" : "Export worldwide";

  return (
    <>
      <JsonLd
        data={[
          serviceSchema({
            name: t("title"),
            description: t("description"),
            slug: PATH,
            locale: typedLocale,
            areaServed: ["Worldwide"],
            serviceType: typedLocale === "th" ? "ส่งออก" : "Export",
          }),
          breadcrumbSchema(
            [
              { name: homeLabel, path: "/" },
              { name: svcLabel, path: "/services" },
              { name: here, path: PATH },
            ],
            typedLocale,
          ),
        ]}
      />
      <StubPage
        eyebrow="EXPORT WORLDWIDE"
        title={typedLocale === "th" ? "ส่งออกสินค้า" : "Export"}
        highlight={typedLocale === "th" ? "ทั่วโลก" : "worldwide"}
        description={
          typedLocale === "th"
            ? "ส่งออกสินค้าไปต่างประเทศได้ครบทุก Term — EXW · FOB · CFR · CIF พร้อมเอกสารและการเคลียร์ศุลกากรครบ"
            : "Export to every market under every Incoterm — EXW · FOB · CFR · CIF — with full paperwork and customs clearance."
        }
        breadcrumb={[
          { label: svcLabel, href: "/services" },
          { label: here },
        ]}
      />
    </>
  );
}
