import type { Metadata } from "next";
import { StubPage } from "@/components/stub-page";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";

const PATH = "/privacy";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: "seo.privacy" });
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
            { name: typedLocale === "th" ? "นโยบายความเป็นส่วนตัว" : "Privacy policy", path: PATH },
          ],
          typedLocale,
        )}
      />
      <StubPage
        eyebrow="PRIVACY POLICY"
        title={typedLocale === "th" ? "นโยบายความ" : "Privacy"}
        highlight={typedLocale === "th" ? "เป็นส่วนตัว" : "Policy"}
        description={
          typedLocale === "th"
            ? "วิธีการที่ Pacred Shipping เก็บ ใช้ และคุ้มครองข้อมูลส่วนบุคคลของลูกค้าตามมาตรฐาน PDPA"
            : "How Pacred Shipping collects, uses, and protects personal information under Thailand's PDPA."
        }
        breadcrumb={[{ label: typedLocale === "th" ? "นโยบายความเป็นส่วนตัว" : "Privacy policy" }]}
      />
    </>
  );
}
