import type { Metadata } from "next";
import { StubPage } from "@/components/stub-page";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";

const PATH = "/delivery-areas";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: "seo.deliveryAreas" });
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
            { name: typedLocale === "th" ? "พื้นที่จัดส่ง" : "Delivery areas", path: PATH },
          ],
          typedLocale,
        )}
      />
      <StubPage
        eyebrow="DELIVERY AREAS"
        title={typedLocale === "th" ? "พื้นที่จัดส่ง" : "Delivery"}
        highlight={typedLocale === "th" ? "Pacred เหมาๆ" : "coverage"}
        description={
          typedLocale === "th"
            ? "ส่งทั่วกรุงเทพฯ ปริมณฑล เริ่มต้น 100 บาท พร้อมขยายทั่วประเทศ — เรทเหมาเรทดี ตามเส้นทาง"
            : "Bangkok metro from 100 baht, expanding nationwide — flat-rate pricing optimised by route."
        }
        breadcrumb={[{ label: typedLocale === "th" ? "พื้นที่จัดส่ง" : "Delivery areas" }]}
      />
    </>
  );
}
