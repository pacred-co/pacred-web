import type { Metadata } from "next";
import { StubPage } from "@/components/stub-page";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";

const PATH = "/payment/1688";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: "seo.payment.p1688" });
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
            { name: "1688", path: PATH },
          ],
          typedLocale,
        )}
      />
      <StubPage
        eyebrow="PAYMENT · 1688"
        title={typedLocale === "th" ? "ฝากโอนชำระ" : "Pay on"}
        highlight="1688"
        description={
          typedLocale === "th"
            ? "โอนเงินค่าสินค้าให้ร้าน 1688 ในจีนผ่าน Pacred — เรทดี โอนไวภายในวัน พร้อม Slip ยืนยันทุกรายการ"
            : "Pay 1688 suppliers via Pacred — fair rates, same-day transfer, slip confirmation on every order."
        }
        breadcrumb={[
          { label: typedLocale === "th" ? "ฝากโอนชำระ" : "Payment" },
          { label: "1688" },
        ]}
        banner="purchase"
      />
    </>
  );
}
