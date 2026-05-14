import type { Metadata } from "next";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { Footer } from "@/components/sections/footer";
import { ImportExportBanner } from "@/components/sections/import-export-banner";
import { WarehouseDetail } from "@/components/sections/warehouse-detail";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";

const PATH = "/warehouses/yiwu";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: "seo.warehouses.yiwu" });
}

export default async function YiwuWarehousePage({
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
            { name: typedLocale === "th" ? "ที่อยู่โกดังจีน" : "China warehouses", path: "/warehouses/china" },
            { name: typedLocale === "th" ? "โกดังอี้อู" : "Yiwu warehouse", path: PATH },
          ],
          typedLocale,
        )}
      />
      <NavBar />
      <SearchBar />
      <main>
        <WarehouseDetail
          eyebrow="WAREHOUSE · YIWU"
          city="อี้อู"
          cityEn="Yiwu"
          province="มณฑลเจ้อเจียง (Zhejiang)"
          flag="🇨🇳"
          intro="Pacred Shipping มีโกดังรับสินค้าในเมืองอี้อู (Yiwu) ประเทศจีน ศูนย์กลางค้าส่งสินค้าขนาดใหญ่ของจีน รองรับลูกค้าที่สั่งสินค้าจาก 1688, Taobao, Tmall, Alibaba และ Yiwu Market พร้อมบริการรับพัสดุ รวมสินค้า ตรวจสอบสินค้า และจัดส่งกลับไทยครบวงจร"
          features={[
            "รองรับสินค้าทั่วไป / อย. / มอก. / สินค้าเชิงพาณิชย์",
            "มีทีมจีนช่วยประสานงานร้านค้าและโรงงาน",
            "รองรับทั้ง LCL แชร์ตู้ และ FCL เหมาตู้",
            "สามารถรวมร้านค้า รวมบิล ก่อนส่งออกได้",
            "รองรับ EXW / FOB / CIF",
            "ส่งต่อได้ทั้งทางรถ ทางเรือ และทางแอร์",
            "รองรับลูกค้าพรีออเดอร์ ร้านค้าออนไลน์ และนำเข้าเชิงธุรกิจ",
            "รับสินค้าเข้าคลังทุกวัน เดินทางสะดวก",
          ]}
          shippingMark={[
            { label: "Shipping Mark", value: "PR***** by EK" },
            { label: "收件人 (ผู้รับ)", value: "PR (รถ EK / เรือ SEA)" },
            { label: "ที่อยู่ (中文)", value: "浙江省金华市义乌市荷叶塘工业区龙岗路一街2号1栋102" },
            { label: "电话 (โทร)", value: "19817984258 谢小姐" },
          ]}
          shippingMarkNote="กรุณานำรหัส PR สมาชิกของท่านไปแทนที่ตำแหน่ง PR***** ก่อนแจ้งให้ร้านค้าจีน เพื่อให้ทีมโกดังจับคู่กับออเดอร์ของท่านได้แม่นยำ"
          photo="/images/pacredyiwu.png"
        />
        <ImportExportBanner />
      </main>
      <Footer />
    </>
  );
}
