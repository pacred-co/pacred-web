import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { StubPage } from "@/components/stub-page";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema, serviceSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";

const PATH = "/services/import-china-lcl";
const NS = "seo.services.importChinaLcl";

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
  const here      = typedLocale === "th" ? "นำเข้าสินค้าจากจีน LCL" : "Import from China · LCL";

  return (
    <>
      <JsonLd
        data={[
          serviceSchema({
            name: t("title"),
            description: t("description"),
            slug: PATH,
            locale: typedLocale,
            serviceType: typedLocale === "th" ? "นำเข้า LCL" : "LCL Import",
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
        eyebrow="IMPORT FROM CHINA · LCL"
        title={typedLocale === "th" ? "นำเข้าสินค้าจากจีน" : "Import from China"}
        highlight={typedLocale === "th" ? "LCL แชร์ตู้/รวมตู้" : "LCL · Shared Container"}
        description={
          typedLocale === "th"
            ? "ขนส่งทางเรือแบบ Less than Container Load — เริ่มต้นกี่กล่องก็ได้ จ่ายตาม CBM หรือกิโลกรัม รองรับ DDP ครบจบรวมภาษี เหมาะกับ SME และพรีออเดอร์"
            : "Less-than-container sea freight — start from a few boxes, charged by CBM or kg. DDP available, ideal for SME and pre-orders."
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
