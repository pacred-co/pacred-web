import type { Metadata } from "next";
import { StubPage } from "@/components/stub-page";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";

const PATH = "/payment/taobao";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: "seo.payment.taobao" });
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
            { name: "Taobao", path: PATH },
          ],
          typedLocale,
        )}
      />
      <StubPage
        eyebrow="PAYMENT · TAOBAO"
        title={typedLocale === "th" ? "ฝากโอนชำระ" : "Pay on"}
        highlight="Taobao"
        description={
          typedLocale === "th"
            ? "ฝากชำระสินค้าจาก Taobao ทุกร้าน — เรทดี โอนไวภายในวัน พร้อม Slip ยืนยันทุกออเดอร์"
            : "Pay Taobao sellers via Pacred — fair rates, same-day transfer, slip confirmation on every order."
        }
        breadcrumb={[
          { label: typedLocale === "th" ? "ฝากโอนชำระ" : "Payment" },
          { label: "Taobao" },
        ]}
        banner="purchase"
      />
    </>
  );
}
