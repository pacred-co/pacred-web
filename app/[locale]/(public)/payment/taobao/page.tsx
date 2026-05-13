import { StubPage } from "@/components/stub-page";

export const metadata = {
  title: "ฝากโอนชำระ Taobao · Pacred Shipping",
  description: "บริการฝากโอนชำระค่าสินค้า Taobao — เรทดี โอนไว มี Slip ยืนยัน กับ Pacred Shipping",
};

export default function Page() {
  return (
    <StubPage
      eyebrow="PAYMENT · TAOBAO"
      title="ฝากโอนชำระ"
      highlight="Taobao"
      description="ฝากชำระสินค้าจาก Taobao ทุกร้าน — เรทดี โอนไวภายในวัน พร้อม Slip ยืนยันทุกออเดอร์"
      breadcrumb={[
        { label: "ฝากโอนชำระ" },
        { label: "Taobao" },
      ]}
      banner="purchase"
    />
  );
}
