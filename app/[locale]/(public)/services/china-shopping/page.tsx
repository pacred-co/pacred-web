import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { StubPage } from "@/components/stub-page";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema, serviceSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";

const PATH = "/services/china-shopping";
const NS = "seo.services.chinaShopping";

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
  const here      = typedLocale === "th" ? "สั่งซื้อสินค้าจากจีน" : "China shop-order";

  return (
    <>
      <JsonLd
        data={[
          serviceSchema({
            name: t("title"),
            description: t("description"),
            slug: PATH,
            locale: typedLocale,
            serviceType: typedLocale === "th" ? "ฝากสั่งจีน" : "China shop-order",
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
        eyebrow="CHINA SHOPPING"
        title={typedLocale === "th" ? "สั่งซื้อสินค้าจากจีน" : "China shopping"}
        highlight={typedLocale === "th" ? "1688 Taobao" : "1688 · Taobao"}
        description={
          typedLocale === "th"
            ? "ฝากสั่งซื้อสินค้าจีนทุกแพลตฟอร์ม — 1688 · Taobao · Tmall · Alibaba พร้อมล่ามจีนปิดดีลโรงงานให้ฟรี"
            : "Shop every Chinese marketplace via Pacred — 1688 · Taobao · Tmall · Alibaba — with Mandarin-speaking buyers closing factory deals free."
        }
        breadcrumb={[
          { label: svcLabel, href: "/services" },
          { label: here },
        ]}
      />
    </>
  );
}
