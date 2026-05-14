import type { Metadata } from "next";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { Footer } from "@/components/sections/footer";
import { ImportExportBanner } from "@/components/sections/import-export-banner";
import { WarehouseDetail } from "@/components/sections/warehouse-detail";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";

const PATH = "/warehouses/guangzhou";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: "seo.warehouses.guangzhou" });
}

export default async function GuangzhouWarehousePage({
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
            { name: typedLocale === "th" ? "โกดังกวางโจว" : "Guangzhou warehouse", path: PATH },
          ],
          typedLocale,
        )}
      />
      <NavBar />
      <SearchBar />
      <main>
        <WarehouseDetail
          eyebrow="WAREHOUSE · GUANGZHOU"
          city="กวางโจว"
          cityEn="Guangzhou"
          province="มณฑลกวางตุ้ง (Guangdong)"
          flag="🇨🇳"
          intro="Pacred Shipping มีโกดังรับสินค้าในเมืองกวางโจว ประเทศจีน รองรับลูกค้าที่สั่งสินค้าจาก 1688, Taobao, Tmall, Alibaba และโรงงานจีนโดยตรง พร้อมบริการรวมสินค้า ตรวจสอบสินค้า และจัดส่งกลับไทยครบวงจร"
          features={[
            "รองรับสินค้าทั่วไป / มอก. / สินค้าเชิงพาณิชย์",
            "มีทีมจีนประสานงานโรงงานและร้านค้า",
            "รองรับทั้ง LCL แชร์ตู้ และ FCL เหมาตู้",
            "สามารถรวมบิล รวมร้านค้า ก่อนส่งออกได้",
            "รองรับ EXW / FOB / CIF",
            "ส่งต่อได้ทั้งทางรถ ทางเรือ และทางแอร์",
            "พื้นที่ขนส่งหลัก เดินทางสะดวก",
            "รับสินค้าเข้าคลังทุกวัน",
          ]}
          shippingMark={[
            { label: "收货人姓名 (ผู้รับ)", value: "PR ลูกค้า / EK = รถ / SEA = เรือ" },
            { label: "详细地址 (ที่อยู่)", value: "广州市白云区 江高镇沙溪东路18号66仓 (燕子情创园)" },
            { label: "邮政编码 (ไปรษณีย์)", value: "510000" },
            { label: "手机号码 (โทร)", value: "+13168385163" },
          ]}
          shippingMarkNote="กรุณานำรหัส PR สมาชิกของท่านไปแทนที่ตำแหน่ง 'PR ลูกค้า' พร้อมระบุ EK (รถ) หรือ SEA (เรือ) ตามรูปแบบขนส่งที่ต้องการ"
          photo="/images/gwanzhou.png"
        />
        <ImportExportBanner />
      </main>
      <Footer />
    </>
  );
}
