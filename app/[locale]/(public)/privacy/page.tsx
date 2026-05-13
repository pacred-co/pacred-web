import { StubPage } from "@/components/stub-page";

export const metadata = {
  title: "นโยบายความเป็นส่วนตัว · Pacred Shipping",
  description: "นโยบายความเป็นส่วนตัวและการจัดการข้อมูลของ Pacred Shipping",
};

export default function Page() {
  return (
    <StubPage
      eyebrow="PRIVACY POLICY"
      title="นโยบายความ"
      highlight="เป็นส่วนตัว"
      description="วิธีการที่ Pacred Shipping เก็บ ใช้ และคุ้มครองข้อมูลส่วนบุคคลของลูกค้าตามมาตรฐาน PDPA"
      breadcrumb={[{ label: "นโยบายความเป็นส่วนตัว" }]}
    />
  );
}
