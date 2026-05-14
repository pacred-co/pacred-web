import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { StubPage } from "@/components/stub-page";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema, serviceSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";

const PATH = "/services/import-china";
const NS = "seo.services.importChina";

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
  const here      = typedLocale === "th" ? "นำเข้าสินค้าจากจีน" : "Import from China";

  return (
    <>
      <JsonLd
        data={[
          serviceSchema({
            name: t("title"),
            description: t("description"),
            slug: PATH,
            locale: typedLocale,
            serviceType: typedLocale === "th" ? "นำเข้าสินค้าจากจีน" : "Import from China",
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
        eyebrow="IMPORT FROM CHINA"
        title={typedLocale === "th" ? "นำเข้าสินค้า" : "Import"}
        highlight={typedLocale === "th" ? "จากจีน" : "from China"}
        description={
          typedLocale === "th"
            ? "บริการนำเข้าสินค้าจากจีนครบวงจร — FCL · LCL · Door to Door ครบทุก Port ทุก Term โดย Pacred Shipping"
            : "Full-service import from China — FCL · LCL · door-to-door across every port and Incoterm, with Pacred Shipping."
        }
        breadcrumb={[
          { label: svcLabel, href: "/services" },
          { label: here },
        ]}
      />
    </>
  );
}
