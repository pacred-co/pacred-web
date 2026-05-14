import type { Metadata } from "next";
import { StubPage } from "@/components/stub-page";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";

const PATH = "/join-us";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: "seo.joinUs" });
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
            { name: typedLocale === "th" ? "ร่วมใช้งาน" : "Join us", path: PATH },
          ],
          typedLocale,
        )}
      />
      <StubPage
        eyebrow="JOIN US"
        title={typedLocale === "th" ? "ร่วมใช้งานกับ" : "Join"}
        highlight="Pacred"
        description={
          typedLocale === "th"
            ? "เริ่มต้นใช้งาน Pacred Shipping ในไม่กี่ขั้นตอน — สมัครสมาชิก ยืนยันตัวตน และเริ่มนำเข้า-ส่งออกได้ทันที"
            : "Start using Pacred Shipping in minutes — sign up, verify, and ship from your first order."
        }
        breadcrumb={[{ label: typedLocale === "th" ? "ร่วมใช้งานกับ Pacred" : "Join Pacred" }]}
      />
    </>
  );
}
