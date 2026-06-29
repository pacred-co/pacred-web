import Image from "next/image";
import { useTranslations } from "next-intl";
import { HeroClient } from "@/components/ui/hero-client";

export function HeroSection({ yuanRate }: { yuanRate: number }) {
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
      // LIVE ฝากสั่ง rate from tb_settings.rsdefault (the value /cart charges),
      // fetched server-side and passed in — was hardcoded "4.88" (owner
      // 2026-06-29 · DISPLAY-ONLY).
      value: yuanRate.toFixed(2),
      unit: "฿/¥",
      icon: "/images/hero-section/icon/shop.png",
    },
  ];

  return (
    <section className="bg-background pt-8 pb-10">
      <div className="mx-auto w-full max-w-[1140px] px-[10px]">

        {/* First container — Banner + Tabs */}
        <HeroClient />

        {/* Second container — 3 cards */}
        <div className="mx-auto mt-6 w-full max-w-[1120px]">
          <div className="flex gap-5 justify-center">
            {stats.map((s) => (
              <div
                key={s.label}
                className="flex w-[350px] h-[90px] shrink-0 items-center gap-3 rounded-xl border border-border bg-white dark:bg-surface shadow-sm px-4"
              >
                <Image
                  src={s.icon}
                  alt=""
                  width={56}
                  height={56}
                  className="h-14 w-14 shrink-0 object-contain"
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
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}
