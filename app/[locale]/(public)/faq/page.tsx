import { StubPage } from "@/components/stub-page";

export const metadata = {
  title: "คำถามที่พบบ่อย · Pacred Shipping",
  description: "FAQ คำถามที่พบบ่อยเรื่องนำเข้า-ส่งออก เคลียร์ด่าน และบริการต่าง ๆ ของ Pacred Shipping",
};

export default function Page() {
  return (
    <StubPage
      eyebrow="FAQ"
      title="คำถามที่"
      highlight="พบบ่อย"
      description="รวมคำถามที่ลูกค้าถามบ่อยที่สุดเกี่ยวกับนำเข้า-ส่งออก เคลียร์ด่าน และบริการของ Pacred Shipping"
      breadcrumb={[{ label: "คำถามที่พบบ่อย" }]}
    />
  );
}
