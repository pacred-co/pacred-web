import { StubPage } from "@/components/stub-page";

export const metadata = {
  title: "นำเข้าสินค้าจากจีน LCL แชร์ตู้/รวมตู้ · Pacred Shipping",
  description:
    "บริการนำเข้าสินค้าจากจีนแบบ LCL (Less than Container Load) แชร์ตู้/รวมตู้ — เริ่มต้นกี่กล่องก็ได้ คิดค่าขนส่งตาม CBM หรือกิโลกรัม",
};

export default function Page() {
  return (
    <StubPage
      eyebrow="IMPORT FROM CHINA · LCL"
      title="นำเข้าสินค้าจากจีน"
      highlight="LCL แชร์ตู้/รวมตู้"
      description="ขนส่งทางเรือแบบ Less than Container Load — เริ่มต้นกี่กล่องก็ได้ จ่ายตาม CBM หรือกิโลกรัม รองรับ DDP ครบจบรวมภาษี เหมาะกับ SME และพรีออเดอร์"
      breadcrumb={[
        { label: "บริการ", href: "/services" },
        { label: "นำเข้าสินค้าจากจีน LCL" },
      ]}
      banner="import-export"
    />
  );
}
