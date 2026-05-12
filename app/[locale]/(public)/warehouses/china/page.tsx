import { StubPage } from "@/components/stub-page";

export const metadata = {
  title: "ที่อยู่โกดังจีน · Pacred Shipping",
  description: "ที่อยู่โกดัง Pacred Shipping ในประเทศจีน — กวางโจว อี้อู เซินเจิ้น",
};

export default function Page() {
  return (
    <StubPage
      eyebrow="WAREHOUSE · CHINA"
      title="ที่อยู่โกดัง"
      highlight="จีน"
      description="โกดัง Pacred Shipping ในจีน รองรับสินค้าจากซัพพลายเออร์ทุกแพลตฟอร์ม — 1688, Taobao, Tmall, Alibaba"
      breadcrumb={[
        { label: "โกดัง", href: "/warehouses/china" },
        { label: "ที่อยู่โกดังจีน" },
      ]}
    />
  );
}
