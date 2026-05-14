import type { Metadata } from "next";
import { StubPage } from "@/components/stub-page";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";

const PATH = "/how-to-use";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: "seo.howToUse" });
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
            { name: typedLocale === "th" ? "วิธีการใช้บริการ" : "How to use", path: PATH },
          ],
          typedLocale,
        )}
      />
      <StubPage
        eyebrow="HOW TO USE"
        title={typedLocale === "th" ? "วิธีการ" : "How to"}
        highlight={typedLocale === "th" ? "ใช้บริการ" : "use Pacred"}
        description={
          typedLocale === "th"
            ? "ขั้นตอนตั้งแต่สมัครสมาชิก สั่งซื้อ ฝากโอน รับสินค้าเข้าโกดังจีน จนถึงรับสินค้าที่ไทย — ครบจบในที่เดียวกับ Pacred Shipping"
            : "From sign-up to shop-order, Yuan transfer, China-warehouse intake, and Thailand delivery — Pacred Shipping handles the lot."
        }
        breadcrumb={[{ label: typedLocale === "th" ? "วิธีการใช้บริการ" : "How to use" }]}
        banner="import-export"
      />
    </>
  );
}
