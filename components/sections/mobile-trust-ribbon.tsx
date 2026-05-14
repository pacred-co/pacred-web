import { ShieldCheck, Zap, BadgePercent, Headset } from "lucide-react";

type Variant = "default" | "customs";

type Item = {
  icon: typeof ShieldCheck;
  text: string;
  sub?: string;
  iconBg: string;
  iconColor: string;
};

const ITEMS_DEFAULT: Item[] = [
  { icon: Zap,          text: "ตอบไว",      sub: "ภายใน 5 นาที",   iconBg: "bg-green-100 dark:bg-green-900/30",  iconColor: "text-green-600 dark:text-green-400"  },
  { icon: ShieldCheck,  text: "ถูกต้อง",     sub: "ตามกฎหมาย 100%", iconBg: "bg-blue-100 dark:bg-blue-900/30",    iconColor: "text-blue-600 dark:text-blue-400"    },
  { icon: BadgePercent, text: "เริ่ม 2,800.-", sub: "ครบจบในใบเดียว",  iconBg: "bg-primary-100 dark:bg-primary-900/30", iconColor: "text-primary-600 dark:text-primary-400" },
  { icon: Headset,      text: "ปรึกษาฟรี",    sub: "ทีม 14 ปี ทักได้เลย", iconBg: "bg-amber-100 dark:bg-amber-900/30",  iconColor: "text-amber-600 dark:text-amber-400"  },
];

const ITEMS_CUSTOMS: Item[] = [
  { icon: Zap,          text: "เคลียร์ไว",   sub: "1 ชม. ปล่อยของ",   iconBg: "bg-green-100 dark:bg-green-900/30",  iconColor: "text-green-600 dark:text-green-400"  },
  { icon: ShieldCheck,  text: "ใบขนถูกต้อง", sub: "อย./มอก. ครบ",     iconBg: "bg-blue-100 dark:bg-blue-900/30",    iconColor: "text-blue-600 dark:text-blue-400"    },
  { icon: BadgePercent, text: "เริ่ม 2,800.-", sub: "ไม่บวกแอบแฝง",     iconBg: "bg-primary-100 dark:bg-primary-900/30", iconColor: "text-primary-600 dark:text-primary-400" },
  { icon: Headset,      text: "ปรึกษาฟรี",    sub: "ทักทีมได้ทันที",    iconBg: "bg-amber-100 dark:bg-amber-900/30",  iconColor: "text-amber-600 dark:text-amber-400"  },
];

export function MobileTrustRibbon({ variant = "default" }: { variant?: Variant } = {}) {
  const items = variant === "customs" ? ITEMS_CUSTOMS : ITEMS_DEFAULT;
  return (
    <div className="md:hidden px-3 -mt-1 mb-3">
      <div className="relative rounded-2xl border border-border bg-white dark:bg-surface shadow-[0_8px_22px_rgba(15,23,42,0.07)] overflow-hidden">
        <span aria-hidden className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary-500 to-transparent" />
        <div className="grid grid-cols-2 gap-px bg-border">
          {items.map(({ icon: Icon, text, sub, iconBg, iconColor }) => (
            <div
              key={text}
              className="flex items-center gap-2.5 bg-white dark:bg-surface px-3 py-2.5"
            >
              <span className={`inline-flex w-9 h-9 rounded-xl items-center justify-center shrink-0 ${iconBg}`}>
                <Icon className={`w-[18px] h-[18px] ${iconColor}`} strokeWidth={2.6} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] leading-[1.15] font-black text-[#111827] dark:text-white tracking-tight truncate">
                  {text}
                </div>
                {sub && (
                  <div className="mt-0.5 text-[10.5px] leading-[1.15] text-muted font-bold truncate">
                    {sub}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
