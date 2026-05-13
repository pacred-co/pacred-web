import { ShieldCheck, Zap, BadgePercent, Headset } from "lucide-react";

type Variant = "default" | "customs";

const ITEMS_DEFAULT = [
  { icon: Zap,          text: "ตอบไว 5 นาที",   accent: "text-green-600" },
  { icon: ShieldCheck,  text: "ถูกต้อง 100%",   accent: "text-blue-600"  },
  { icon: BadgePercent, text: "เริ่ม 2,800.-",   accent: "text-primary-600" },
  { icon: Headset,      text: "ปรึกษาฟรี",       accent: "text-amber-600" },
];

const ITEMS_CUSTOMS = [
  { icon: Zap,          text: "เคลียร์ 1 ชม.",   accent: "text-green-600" },
  { icon: ShieldCheck,  text: "ใบขนถูกต้อง",     accent: "text-blue-600"  },
  { icon: BadgePercent, text: "เริ่ม 2,800.-",   accent: "text-primary-600" },
  { icon: Headset,      text: "ปรึกษาฟรี",       accent: "text-amber-600" },
];

export function MobileTrustRibbon({ variant = "default" }: { variant?: Variant } = {}) {
  const items = variant === "customs" ? ITEMS_CUSTOMS : ITEMS_DEFAULT;
  return (
    <div className="md:hidden px-3 -mt-2 mb-3">
      <div className="relative rounded-2xl border border-border bg-white dark:bg-surface shadow-[0_6px_18px_rgba(15,23,42,0.06)] overflow-hidden">
        {/* Top hairline accent */}
        <span aria-hidden className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary-500 to-transparent" />
        <div className="grid grid-cols-4 divide-x divide-border">
          {items.map(({ icon: Icon, text, accent }) => (
            <div key={text} className="flex flex-col items-center justify-center gap-1 py-2.5 px-1">
              <Icon className={`w-[18px] h-[18px] ${accent}`} strokeWidth={2.6} />
              <span className="text-[10.5px] leading-[1.1] font-black text-[#111827] dark:text-white text-center tracking-tight">
                {text}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
