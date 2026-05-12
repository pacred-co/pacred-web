import { StubPage } from "@/components/stub-page";

export const metadata = {
  title: "ฝากโอนชำระ Alipay · Pacred Shipping",
  description: "บริการฝากโอนชำระเงินผ่าน Alipay — โอนไว ปลอดภัย เรทดี ใช้ได้กับเว็บจีนทุกเว็บ",
};

export default function Page() {
  return (
    <StubPage
      eyebrow="PAYMENT · ALIPAY"
      title="ฝากโอนชำระ"
      highlight="Alipay"
      description="ฝากโอนผ่าน Alipay สำหรับซื้อสินค้า/จ่ายค่าบริการจากจีนทุกประเภท — เรทดี โอนไวภายในวัน พร้อม Slip ยืนยัน"
      breadcrumb={[
        { label: "ฝากโอนชำระ" },
        { label: "Alipay" },
      ]}
      banner="purchase"
    />
  );
}
