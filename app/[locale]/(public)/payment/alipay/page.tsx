import type { Metadata } from "next";
import { StubPage } from "@/components/stub-page";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";

const PATH = "/payment/alipay";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: "seo.payment.alipay" });
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
            { name: typedLocale === "th" ? "ฝากโอนชำระ" : "Payment", path: "/payment/alipay" },
            { name: "Alipay", path: PATH },
          ],
          typedLocale,
        )}
      />
      <StubPage
        eyebrow="PAYMENT · ALIPAY"
        title={typedLocale === "th" ? "ฝากโอนชำระ" : "Pay via"}
        highlight="Alipay"
        description={
          typedLocale === "th"
            ? "ฝากโอนผ่าน Alipay สำหรับซื้อสินค้า/จ่ายค่าบริการจากจีนทุกประเภท — เรทดี โอนไวภายในวัน พร้อม Slip ยืนยัน"
            : "Alipay-based transfers for any China-based purchase or service — fair rates, same-day clearance, slip confirmation."
        }
        breadcrumb={[
          { label: typedLocale === "th" ? "ฝากโอนชำระ" : "Payment" },
          { label: "Alipay" },
        ]}
        banner="purchase"
      />
    </>
  );
}
