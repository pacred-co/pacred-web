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
    },
    {
      label: t("orders"),
      value: "48,842",
      unit: t("ordersUnit"),
      icon: "/images/hero-section/icon/cart.png",
    },
    {
      label: t("deposit"),
      value: "4.88",
      unit: "฿/¥",
      icon: "/images/hero-section/icon/shop.png",
    },
  ];

  return (
    <section className="pt-4 pb-1">
      <div className="mx-auto w-full max-w-[1140px] px-[10px]">
        <div className="flex gap-5 justify-center flex-wrap">
          {stats.map((s) => (
            <Link
              key={s.label}
              href="/register"
              className="group relative flex w-[350px] h-[90px] shrink-0 items-center gap-3 rounded-xl border border-border bg-white dark:bg-surface shadow-sm px-4 cursor-pointer transition-all duration-300 hover:border-primary-600 hover:shadow-[0_0_0_3px_rgba(179,0,0,0.12),0_4px_20px_rgba(179,0,0,0.15)] hover:-translate-y-0.5"
            >
              {/* red left accent bar */}
              <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-primary-600 scale-y-0 group-hover:scale-y-100 transition-transform duration-300 origin-center" />

              <Image
                src={s.icon}
                alt=""
                width={56}
                height={56}
                className="h-14 w-14 shrink-0 object-contain transition-transform duration-300 group-hover:scale-110"
              />
              <div className="flex flex-1 items-center justify-between gap-2">
                <span className="text-sm font-medium text-[#171717] dark:text-white">{s.label}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-3xl font-bold tracking-tight text-primary-600">
                    {s.value}
                  </span>
                  <span className="text-sm text-[#171717] dark:text-white">{s.unit}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
