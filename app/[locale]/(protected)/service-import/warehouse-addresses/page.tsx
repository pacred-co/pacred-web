import { redirect } from "next/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { WarehouseAddressesClient } from "./warehouse-addresses-client";

// Static catalogue of Pacred's China receiving warehouses. Source of truth
// mirrors what's published on the public marketing pages
// (`/warehouses/guangzhou` + `/warehouses/yiwu`). Kept inline here instead
// of pulling from `settings` because the address rarely changes and we
// want this page to be print-ready on mobile networks with zero queries.
export const WAREHOUSES: Array<{
  slug:          "guangzhou" | "yiwu";
  city_th:       string;
  city_en:       string;
  province_th:   string;
  address_cn:    string;
  postal_code:   string;
  phone:         string;
  hours_th:      string;
  highlight:     string;
}> = [
  {
    slug:        "guangzhou",
    city_th:     "กวางโจว",
    city_en:     "Guangzhou",
    province_th: "มณฑลกวางตุ้ง (Guangdong)",
    address_cn:  "广州市白云区 江高镇沙溪东路18号66仓 (燕子情创园)",
    postal_code: "510000",
    phone:       "+86 13168385163",
    hours_th:    "เปิดทุกวัน 09:00 – 18:00",
    highlight:   "ศูนย์กลางการค้าใต้สุดของจีน — เหมาะกับสินค้าจากโรงงานและร้านค้าออนไลน์",
  },
  {
    slug:        "yiwu",
    city_th:     "อี้อู",
    city_en:     "Yiwu",
    province_th: "มณฑลเจ้อเจียง (Zhejiang)",
    // Yiwu address kept consistent with /warehouses/yiwu — pending the
    // new Yiwu site address from operations. For now we reuse the
    // Guangzhou street as a placeholder; ภูม can swap in the real Yiwu
    // address by editing this constant only.
    address_cn:  "义乌市国际生产资料市场 (Yiwu International Trade Mart)",
    postal_code: "322000",
    phone:       "+86 13168385163",
    hours_th:    "เปิดทุกวัน 09:00 – 18:00",
    highlight:   "ตลาดค้าส่งจิปาถะใหญ่สุดในจีน — ของชำร่วย ของขวัญ ของแต่งบ้าน",
  },
];

export default async function WarehouseAddressesPage() {
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");

  const memberCode = data.profile.member_code ?? "PR—";

  return (
    <>
      <main className="mx-auto w-full max-w-[1100px] px-4 py-8 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-500">
              SHIPPING MARK
            </p>
            <h1 className="mt-1 text-2xl font-bold text-foreground">
              ที่อยู่โกดังจีน + Shipping Mark
            </h1>
            <p className="mt-1 text-sm text-muted">
              นำที่อยู่ + รหัสสมาชิกของท่าน ติดบนกล่องสินค้าที่จะส่งเข้าโกดังจีน
              เพื่อให้ Pacred รับสินค้าและจัดส่งกลับไทยได้ถูกต้อง
            </p>
          </div>
          <Link
            href="/service-import"
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt"
          >
            ← กลับฝากนำเข้า
          </Link>
        </div>

        {/* Member code banner */}
        <div className="rounded-2xl border border-primary-200 bg-primary-50/40 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs text-primary-700/80 uppercase tracking-wider">รหัสสมาชิกของท่าน</p>
              <p className="font-mono text-2xl font-bold text-primary-700">{memberCode}</p>
            </div>
            <p className="text-xs text-primary-700/80 max-w-xs">
              รหัสนี้ถูกฝังใน Shipping Mark ด้านล่างแล้ว — ลูกค้าเพียง <b>คัดลอก</b> หรือ <b>พิมพ์</b>{" "}
              ไปติดที่กล่องสินค้าโดยไม่ต้องแก้อะไรเพิ่ม
            </p>
          </div>
        </div>

        <WarehouseAddressesClient memberCode={memberCode} warehouses={WAREHOUSES} />

        {/* Footnote */}
        <div className="rounded-2xl border border-dashed border-border bg-surface-alt/30 p-4 text-xs text-muted leading-relaxed">
          <p className="font-semibold mb-1 text-foreground">หมายเหตุ</p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              ใส่ <b>EK</b> = ส่งทางรถ · <b>SEA</b> = ส่งทางเรือ · <b>AIR</b> = ส่งทางอากาศ
              ในบรรทัด &quot;收货人姓名&quot; ตามรูปแบบขนส่งที่ท่านต้องการ
            </li>
            <li>
              ถ้ามีสินค้าหลายกล่อง ให้พิมพ์ Shipping Mark <b>1 ใบต่อ 1 กล่อง</b>
              และระบุเลข <b>1/n, 2/n, …</b> ที่มุมขวาบน
            </li>
            <li>
              หากมีคำถาม ติดต่อทีมงานผ่าน LINE @pacred หรือโทร 02-444-7046
            </li>
          </ul>
        </div>
      </main>
      <Footer />
    </>
  );
}
