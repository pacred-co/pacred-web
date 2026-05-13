import { StubPage } from "@/components/stub-page";

export const metadata = {
  title: "ส่งออกสินค้าทั่วโลก · Pacred Shipping",
  description: "บริการส่งออกสินค้าไปต่างประเทศทั่วโลก — EXW FOB CFR CIF",
};

export default function Page() {
  return (
    <StubPage
      eyebrow="EXPORT WORLDWIDE"
      title="ส่งออกสินค้า"
      highlight="ทั่วโลก"
      description="ส่งออกสินค้าไปต่างประเทศได้ครบทุก Term — EXW · FOB · CFR · CIF พร้อมเอกสารและการเคลียร์ศุลกากรครบ"
      breadcrumb={[
        { label: "บริการ", href: "/services" },
        { label: "ส่งออกสินค้าทั่วโลก" },
      ]}
    />
  );
}
