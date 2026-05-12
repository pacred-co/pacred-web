import { StubPage } from "@/components/stub-page";

export const metadata = {
  title: "เกี่ยวกับ Pacred · Pacred Shipping",
  description: "Pacred Shipping ผู้เชี่ยวชาญด้านนำเข้า-ส่งออก เคลียร์พิธีการศุลกากร ครบวงจร มากกว่า 14 ปี",
};

export default function Page() {
  return (
    <StubPage
      eyebrow="ABOUT US"
      title="เกี่ยวกับ"
      highlight="Pacred"
      description="ผู้เชี่ยวชาญด้านนำเข้า–ส่งออก เคลียร์พิธีการศุลกากรครบวงจร มากกว่า 14 ปี — ดูแลตั้งแต่ต้นน้ำถึงปลายน้ำ จบในที่เดียว"
      breadcrumb={[{ label: "เกี่ยวกับ Pacred" }]}
    />
  );
}
