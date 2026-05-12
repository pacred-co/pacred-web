import { StubPage } from "@/components/stub-page";

export const metadata = {
  title: "ข้อกำหนดและเงื่อนไข · Pacred Shipping",
  description: "ข้อกำหนดและเงื่อนไขการใช้บริการ Pacred Shipping",
};

export default function Page() {
  return (
    <StubPage
      eyebrow="TERMS & CONDITIONS"
      title="ข้อกำหนดและ"
      highlight="เงื่อนไข"
      description="ข้อกำหนดและเงื่อนไขการใช้บริการ Pacred Shipping — อ่านโปรดอย่างละเอียดก่อนใช้บริการ"
      breadcrumb={[{ label: "ข้อกำหนดและเงื่อนไข" }]}
    />
  );
}
