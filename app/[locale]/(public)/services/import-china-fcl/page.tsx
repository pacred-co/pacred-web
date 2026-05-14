import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { StubPage } from "@/components/stub-page";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema, serviceSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";

const PATH = "/services/import-china-fcl";
const NS = "seo.services.importChinaFcl";

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
  const here      = typedLocale === "th" ? "นำเข้าสินค้าจากจีน FCL" : "Import from China · FCL";

  return (
    <>
      <JsonLd
        data={[
          serviceSchema({
            name: t("title"),
            description: t("description"),
            slug: PATH,
            locale: typedLocale,
            serviceType: typedLocale === "th" ? "นำเข้า FCL" : "FCL Import",
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
        eyebrow="IMPORT FROM CHINA · FCL"
        title={typedLocale === "th" ? "นำเข้าสินค้าจากจีน" : "Import from China"}
        highlight={typedLocale === "th" ? "FCL ปิดตู้/เหมาตู้" : "FCL · Full Container"}
        description={
          typedLocale === "th"
            ? "ขนส่งทางเรือแบบ Full Container Load 20ft / 40ft / 40HQ — เหมาะกับสินค้าจำนวนมาก รองรับ DDP / EXW / FOB ต้นทุนต่อหน่วยถูกที่สุด"
            : "Sea freight in 20ft / 40ft / 40HQ containers — best for large volumes. Supports DDP / EXW / FOB at the lowest unit cost."
        }
        breadcrumb={[
          { label: svcLabel, href: "/services" },
          { label: here },
        ]}
        banner="import-export"
      />
    </>
  );
}
