import { StubPage } from "@/components/stub-page";

export const metadata = {
  title: "ฝากโอนชำระ 1688 · Pacred Shipping",
  description: "บริการฝากโอนชำระค่าสินค้า 1688 — โอนไว ปลอดภัย เรทดี โดย Pacred Shipping",
};

export default function Page() {
  return (
    <StubPage
      eyebrow="PAYMENT · 1688"
      title="ฝากโอนชำระ"
      highlight="1688"
      description="โอนเงินค่าสินค้าให้ร้าน 1688 ในจีนผ่าน Pacred — เรทดี โอนไวภายในวัน พร้อม Slip ยืนยันทุกรายการ"
      breadcrumb={[
        { label: "ฝากโอนชำระ" },
        { label: "1688" },
      ]}
      banner="purchase"
    />
  );
}
