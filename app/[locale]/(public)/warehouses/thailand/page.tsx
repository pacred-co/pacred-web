import { StubPage } from "@/components/stub-page";

export const metadata = {
  title: "ที่อยู่โกดังไทย · Pacred Shipping",
  description: "ที่อยู่โกดัง Pacred Shipping ในประเทศไทย — รองรับการกระจายสินค้าทั่วประเทศ",
};

export default function Page() {
  return (
    <StubPage
      eyebrow="WAREHOUSE · THAILAND"
      title="ที่อยู่โกดัง"
      highlight="ไทย"
      description="โกดัง Pacred Shipping ในไทย รับสินค้าจากจีนและกระจายต่อทั่วประเทศ — กรุงเทพฯ ปริมณฑล และต่างจังหวัด"
      breadcrumb={[
        { label: "โกดัง", href: "/warehouses/thailand" },
        { label: "ที่อยู่โกดังไทย" },
      ]}
    />
  );
}
