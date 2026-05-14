import type { Metadata } from "next";
import { StubPage } from "@/components/stub-page";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";

const PATH = "/contact";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: "seo.contact" });
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
            { name: typedLocale === "th" ? "ฝ่ายบริการลูกค้า" : "Contact", path: PATH },
          ],
          typedLocale,
        )}
      />
      <StubPage
        eyebrow="CONTACT US"
        title={typedLocale === "th" ? "ฝ่ายบริการ" : "Contact"}
        highlight={typedLocale === "th" ? "ลูกค้า" : "us"}
        description={
          typedLocale === "th"
            ? "ทีมงาน Pacred Shipping พร้อมตอบทุกคำถามและให้คำปรึกษาทุกขั้นตอน — ทางไลน์ โทรศัพท์ หรือทักผ่านช่องทาง social อื่น ๆ"
            : "The Pacred Shipping team replies on LINE, phone, and every social channel — fast answers guaranteed."
        }
        breadcrumb={[{ label: typedLocale === "th" ? "ฝ่ายบริการลูกค้า" : "Contact" }]}
      />
    </>
  );
}
