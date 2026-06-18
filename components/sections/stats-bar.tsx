import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function StatsBar() {
  const t = useTranslations("heroStats");

  const stats = [
    {
      label: t("customers"),
      value: "10,600",
      unit: t("customersUnit"),
      icon: "/images/hero-section/icon/customer.png",
      alt: "ลูกค้าที่ไว้วางใจใช้บริการนำเข้าสินค้าจากจีนกับ Pacred Shipping",
    },
    {
      label: t("orders"),
      value: "48,842",
      unit: t("ordersUnit"),
      icon: "/images/hero-section/icon/cart.png",
      alt: "ออเดอร์นำเข้า-ฝากสั่งซื้อสินค้าจากจีนกับ Pacred Shipping",
    },
    {
      label: t("deposit"),
      value: "4.88",
      unit: "฿/¥",
      icon: "/images/hero-section/icon/shop.png",
      alt: "เรทค่าฝากสั่งซื้อ-ฝากโอนเงินหยวนชำระสินค้าจีน Pacred Shipping",
    },
  ];

  return (
    <section className="-mt-3 pb-1 md:mt-0 md:pt-3">{/* mobile: pulled up into the calculator's empty bottom padding (owner 2026-06-18) */}
      <div className="mx-auto w-full max-w-[1140px] px-[10px] relative">
        <div className="flex gap-1.5 md:gap-5 md:justify-center md:flex-wrap pb-1 md:pb-0">{/* mobile: 3 cards in one row, no scroll (owner 2026-06-18) */}
          {stats.map((s) => (
            <Link
              key={s.label}
              href="/register"
              className="group relative flex flex-1 min-w-0 md:flex-none md:w-[350px] md:max-w-none h-[58px] md:h-[90px] items-center gap-1 md:gap-3 overflow-hidden rounded-xl border border-border bg-white dark:bg-surface shadow-sm px-1.5 md:px-4 cursor-pointer transition-all duration-300 hover:border-primary-600 hover:shadow-[0_0_0_3px_rgba(179,0,0,0.12),0_4px_20px_rgba(179,0,0,0.15)] hover:-translate-y-0.5"
            >
              {/* red left accent bar */}
              <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-primary-600 scale-y-0 group-hover:scale-y-100 transition-transform duration-300 origin-center" />

              <Image
                src={s.icon}
                alt={s.alt}
                width={56}
                height={56}
                className="h-6 w-6 md:h-14 md:w-14 shrink-0 object-contain transition-transform duration-300 group-hover:scale-110"
              />

              <div className="flex flex-col justify-center gap-0 md:flex-row md:flex-1 md:items-center md:justify-between md:gap-2 min-w-0">
                <span className="text-[10px] md:text-sm font-medium text-[#171717] dark:text-white leading-tight">{s.label}</span>
                <div className="flex flex-wrap md:flex-nowrap items-baseline gap-x-0.5 gap-y-0 md:gap-1.5 min-w-0">
                  <span className="text-[13px] md:text-3xl font-bold tracking-tight text-primary-600 leading-none">
                    {s.value}
                  </span>
                  <span className="text-[9px] md:text-sm text-[#171717] dark:text-white leading-none">{s.unit}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
