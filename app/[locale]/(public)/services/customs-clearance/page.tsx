import { StubPage } from "@/components/stub-page";

export const metadata = {
  title: "ชิปปิ้งเคลียร์พิธีการศุลกากร · Pacred Shipping",
  description: "บริการเคลียร์สินค้าติดด่าน พิธีการศุลกากร อย./มอก./เกษตร/ประมง — Pacred Shipping",
};

export default function Page() {
  return (
    <StubPage
      eyebrow="CUSTOMS CLEARANCE"
      title="ชิปปิ้งเคลียร์"
      highlight="พิธีการศุลกากร"
      description="เคลียร์สินค้าติดด่านทุกประเภท — สุวรรณภูมิ · แหลมฉบัง · คลองเตย · ดอนเมือง · มุกดาหาร พร้อมจัดการ อย./มอก./เกษตร/ประมงครบ"
      breadcrumb={[
        { label: "บริการ", href: "/services" },
        { label: "ชิปปิ้งเคลียร์พิธีการศุลกากร" },
      ]}
    />
  );
}
