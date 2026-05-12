import { BookingCalculator } from "@/components/booking/BookingCalculator";

export const metadata = {
  title: "คำนวณราคา | Pacred — ชิปปิ้ง นำเข้า-ส่งออก",
  description: "คำนวณราคาขนส่งทางเรือ LCL FCL ทางรถ DDP ทางอากาศ เคลียร์ศุลกากร ฝากสั่งซื้อ โอนเงินต่างประเทศ",
};

export default function BookingPage() {
  return (
    <main>
      <BookingCalculator />
    </main>
  );
}
