import { StubPage } from "@/components/stub-page";

export const metadata = {
  title: "วันหยุดประจำปี Pacred · Pacred Shipping",
  description: "ปฏิทินวันหยุดประจำปี Pacred Shipping และวันหยุดศุลกากร",
};

export default function Page() {
  return (
    <StubPage
      eyebrow="HOLIDAYS 2026"
      title="วันหยุดประจำปี"
      highlight="Pacred 2026"
      description="ปฏิทินวันหยุดของ Pacred Shipping ตลอดทั้งปี — รวมวันหยุดศุลกากรไทยและจีน เพื่อให้คุณวางแผนการนำเข้า-ส่งออกได้แม่นยำ"
      breadcrumb={[{ label: "วันหยุดประจำปี" }]}
    />
  );
}
