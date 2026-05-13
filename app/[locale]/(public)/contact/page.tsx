import { StubPage } from "@/components/stub-page";

export const metadata = {
  title: "ฝ่ายบริการลูกค้า · Pacred Shipping",
  description: "ติดต่อฝ่ายบริการลูกค้า Pacred Shipping ปรึกษาเรื่องนำเข้า-ส่งออก ชิปปิ้งเคลียร์",
};

export default function Page() {
  return (
    <StubPage
      eyebrow="CONTACT US"
      title="ฝ่ายบริการ"
      highlight="ลูกค้า"
      description="ทีมงาน Pacred Shipping พร้อมตอบทุกคำถามและให้คำปรึกษาทุกขั้นตอน — ทางไลน์ โทรศัพท์ หรือทักผ่านช่องทาง social อื่น ๆ"
      breadcrumb={[{ label: "ฝ่ายบริการลูกค้า" }]}
    />
  );
}
