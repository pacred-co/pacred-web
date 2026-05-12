import { StubPage } from "@/components/stub-page";

export const metadata = {
  title: "พื้นที่จัดส่ง Pacred เหมาๆ · Pacred Shipping",
  description: "พื้นที่บริการจัดส่งของ Pacred Shipping — กรุงเทพฯ ปริมณฑล และทั่วประเทศ ราคาเหมา ๆ เริ่มต้น 100 บาท",
};

export default function Page() {
  return (
    <StubPage
      eyebrow="DELIVERY AREAS"
      title="พื้นที่จัดส่ง"
      highlight="Pacred เหมาๆ"
      description="ส่งทั่วกรุงเทพฯ ปริมณฑล เริ่มต้น 100 บาท พร้อมขยายทั่วประเทศ — เรทเหมาเรทดี ตามเส้นทาง"
      breadcrumb={[{ label: "พื้นที่จัดส่ง" }]}
    />
  );
}
