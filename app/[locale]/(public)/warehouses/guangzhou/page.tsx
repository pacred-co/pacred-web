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
            { label: "地址信息 (พื้นที่)", value: "广东省 / 广州市 / 白云区 / 江高镇" },
            { label: "详细地址 (ที่อยู่)", value: "广东省广州市白云区江高镇沙溪东路18号3-1号仓库, (PR000/EK) 仓库" },
            { label: "收货人姓名 (ผู้รับ)", value: "PR000/EK" },
            { label: "手机号码 (โทร)", value: "13397477837" },
            { label: "邮政编码 (ไปรษณีย์)", value: "510000" },
          ]}
          shippingMarkNote="EK=รถ SEA=เรือ"
          photo="/images/gwanzhou.png"
        />
        <ImportExportBanner />
      </main>
      <Footer />
    </>
  );
}
