import type { Metadata } from "next";
import { StubPage } from "@/components/stub-page";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";

const PATH = "/terms";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: "seo.terms" });
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
            { name: typedLocale === "th" ? "ข้อกำหนดและเงื่อนไข" : "Terms", path: PATH },
          ],
          typedLocale,
        )}
      />
      <StubPage
        eyebrow="TERMS & CONDITIONS"
        title={typedLocale === "th" ? "ข้อกำหนดและ" : "Terms &"}
        highlight={typedLocale === "th" ? "เงื่อนไข" : "Conditions"}
        description={
          typedLocale === "th"
            ? "ข้อกำหนดและเงื่อนไขการใช้บริการ Pacred Shipping — อ่านโปรดอย่างละเอียดก่อนใช้บริการ"
            : "Terms and conditions for the Pacred Shipping website and services — please read before using the platform."
        }
        breadcrumb={[{ label: typedLocale === "th" ? "ข้อกำหนดและเงื่อนไข" : "Terms" }]}
      />
    </>
  );
}
