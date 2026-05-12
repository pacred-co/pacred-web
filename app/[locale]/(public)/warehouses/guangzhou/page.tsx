import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { Footer } from "@/components/sections/footer";
import { ImportExportBanner } from "@/components/sections/import-export-banner";
import { WarehouseDetail } from "@/components/sections/warehouse-detail";

export const metadata = {
  title: "โกดังกวางโจว (Guangzhou) · Pacred Shipping",
  description:
    "โกดังรับสินค้า Pacred Shipping เมืองกวางโจว ประเทศจีน — รองรับสินค้าจาก 1688, Taobao, Tmall, Alibaba และโรงงานจีน",
};

export default function GuangzhouWarehousePage() {
  return (
    <>
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
            "รองรับสินค้าทั่วไป / อย. / มอก. / สินค้าเชิงพาณิชย์",
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
