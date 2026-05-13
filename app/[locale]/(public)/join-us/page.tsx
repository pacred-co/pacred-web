import { StubPage } from "@/components/stub-page";

export const metadata = {
  title: "ร่วมใช้งานกับ Pacred · Pacred Shipping",
  description: "ขั้นตอนการสมัครและเริ่มใช้บริการ Pacred Shipping",
};

export default function Page() {
  return (
    <StubPage
      eyebrow="JOIN US"
      title="ร่วมใช้งานกับ"
      highlight="Pacred"
      description="เริ่มต้นใช้งาน Pacred Shipping ในไม่กี่ขั้นตอน — สมัครสมาชิก ยืนยันตัวตน และเริ่มนำเข้า-ส่งออกได้ทันที"
      breadcrumb={[{ label: "ร่วมใช้งานกับ Pacred" }]}
    />
  );
}
