import { StubPage } from "@/components/stub-page";

export const metadata = {
  title: "นำเข้าสินค้าจากจีน · Pacred Shipping",
  description: "บริการนำเข้าสินค้าจากจีน FCL LCL DDP CIF — Pacred Shipping",
};

export default function Page() {
  return (
    <StubPage
      eyebrow="IMPORT FROM CHINA"
      title="นำเข้าสินค้า"
      highlight="จากจีน"
      description="บริการนำเข้าสินค้าจากจีนครบวงจร — FCL · LCL · Door to Door ครบทุก Port ทุก Term โดย Pacred Shipping"
      breadcrumb={[
        { label: "บริการ", href: "/services" },
        { label: "นำเข้าสินค้าจากจีน" },
      ]}
    />
  );
}
