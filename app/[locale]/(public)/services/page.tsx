import { StubPage } from "@/components/stub-page";

export const metadata = {
  title: "บริการทั้งหมด · Pacred Shipping",
  description: "บริการนำเข้า ส่งออก เคลียร์ด่าน และฝากสั่งซื้อสินค้าจากจีนของ Pacred Shipping",
};

export default function Page() {
  return (
    <StubPage
      eyebrow="OUR SERVICES"
      title="บริการ"
      highlight="ของเรา"
      description="ดูแลครบวงจรตั้งแต่สั่งซื้อจีน QC ขนส่ง FCL/LCL ไปจนถึงชิปปิ้งเคลียร์ภาษีและสินค้าติดด่าน — Pacred Shipping จบในที่เดียว"
      breadcrumb={[{ label: "บริการ" }]}
    />
  );
}
