import { StubPage } from "@/components/stub-page";

export const metadata = {
  title: "วิธีการใช้บริการ · Pacred Shipping",
  description: "ขั้นตอนการใช้บริการนำเข้า–ส่งออก ฝากสั่งซื้อ และเคลียร์สินค้าติดด่านกับ Pacred Shipping",
};

export default function Page() {
  return (
    <StubPage
      eyebrow="HOW TO USE"
      title="วิธีการ"
      highlight="ใช้บริการ"
      description="ขั้นตอนตั้งแต่สมัครสมาชิก สั่งซื้อ ฝากโอน รับสินค้าเข้าโกดังจีน จนถึงรับสินค้าที่ไทย — ครบจบในที่เดียวกับ Pacred Shipping"
      breadcrumb={[{ label: "วิธีการใช้บริการ" }]}
      banner="import-export"
    />
  );
}
