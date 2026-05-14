import type { Metadata } from "next";
import { StubPage } from "@/components/stub-page";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";

const PATH = "/services";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: "seo.services.index" });
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const homeLabel = typedLocale === "th" ? "หน้าหลัก" : "Home";
  const svcLabel  = typedLocale === "th" ? "บริการทั้งหมด" : "All services";

  return (
    <>
      <JsonLd
        data={breadcrumbSchema(
          [
            { name: homeLabel, path: "/" },
            { name: svcLabel, path: PATH },
          ],
          typedLocale,
        )}
      />
      <StubPage
        eyebrow="OUR SERVICES"
        title={typedLocale === "th" ? "บริการ" : "Our"}
        highlight={typedLocale === "th" ? "ของเรา" : "services"}
        description={
          typedLocale === "th"
            ? "ดูแลครบวงจรตั้งแต่สั่งซื้อจีน QC ขนส่ง FCL/LCL ไปจนถึงชิปปิ้งเคลียร์ภาษีและสินค้าติดด่าน — Pacred Shipping จบในที่เดียว"
            : "End to end — China sourcing, QC, FCL/LCL freight, customs clearance and stuck-at-customs recovery. Pacred Shipping handles it all."
        }
        breadcrumb={[{ label: typedLocale === "th" ? "บริการ" : "Services" }]}
      />
    </>
  );
}
