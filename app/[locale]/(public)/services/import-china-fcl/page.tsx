import { StubPage } from "@/components/stub-page";

export const metadata = {
  title: "นำเข้าสินค้าจากจีน FCL ปิดตู้/เหมาตู้ · Pacred Shipping",
  description:
    "บริการนำเข้าสินค้าจากจีนแบบ FCL (Full Container Load) ปิดตู้/เหมาตู้ — เหมาะกับสินค้าจำนวนมาก ต้นทุนต่อหน่วยถูกที่สุด",
};

export default function Page() {
  return (
    <StubPage
      eyebrow="IMPORT FROM CHINA · FCL"
      title="นำเข้าสินค้าจากจีน"
      highlight="FCL ปิดตู้/เหมาตู้"
      description="ขนส่งทางเรือแบบ Full Container Load 20ft / 40ft / 40HQ — เหมาะกับสินค้าจำนวนมาก รองรับ DDP / EXW / FOB ต้นทุนต่อหน่วยถูกที่สุด"
      breadcrumb={[
        { label: "บริการ", href: "/services" },
        { label: "นำเข้าสินค้าจากจีน FCL" },
      ]}
      banner="import-export"
    />
  );
}
