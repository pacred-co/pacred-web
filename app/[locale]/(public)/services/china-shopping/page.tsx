import { StubPage } from "@/components/stub-page";

export const metadata = {
  title: "สั่งซื้อสินค้าจากจีน 1688 Taobao · Pacred Shipping",
  description: "บริการฝากสั่งซื้อสินค้าจาก 1688 Taobao Tmall Alibaba พร้อมล่ามจีนปิดดีลโรงงาน",
};

export default function Page() {
  return (
    <StubPage
      eyebrow="CHINA SHOPPING"
      title="สั่งซื้อสินค้าจากจีน"
      highlight="1688 Taobao"
      description="ฝากสั่งซื้อสินค้าจีนทุกแพลตฟอร์ม — 1688 · Taobao · Tmall · Alibaba พร้อมล่ามจีนปิดดีลโรงงานให้ฟรี"
      breadcrumb={[
        { label: "บริการ", href: "/services" },
        { label: "สั่งซื้อสินค้าจากจีน" },
      ]}
    />
  );
}
