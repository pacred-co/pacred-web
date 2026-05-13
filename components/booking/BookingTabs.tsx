import { ChevronRight } from "lucide-react";
import type { TabMode } from "@/types/booking";

const TABS: { mode: TabMode; emoji: string; label: string; sub: string }[] = [
  { mode: "sea",      emoji: "🚢", label: "ขนส่งทางเรือ",   sub: "LCL / FCL" },
  { mode: "truck",    emoji: "🚛", label: "ขนส่งทางรถ",     sub: "DDP" },
  { mode: "air",      emoji: "✈️", label: "ขนส่งทางอากาศ",  sub: "นำเข้า–ส่งออก" },
  { mode: "customs",  emoji: "👮", label: "เคลียร์ศุลกากร", sub: "ติดด่าน" },
  { mode: "sourcing", emoji: "🛒", label: "ฝากสั่งซื้อ",    sub: "1688 / Taobao" },
  { mode: "remit",    emoji: "🏦", label: "โอนเงินชำระ",    sub: "ต่างประเทศ" },
];

interface BookingTabsProps {
  active: TabMode | null;
  onChange: (mode: TabMode) => void;
}

export function BookingTabs({ active, onChange }: BookingTabsProps) {
  return (
    <div className="relative">
    <div className="flex overflow-x-auto border-b border-gray-200 px-2 md:px-2.5 md:justify-center [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {TABS.map(tab => (
        <button
          key={tab.mode}
          type="button"
          role="tab"
          suppressHydrationWarning
          aria-selected={active === tab.mode}
          onClick={() => onChange(tab.mode)}
          className={`flex flex-col items-center gap-0.5 px-3.5 md:px-[22px] py-3 md:py-4 whitespace-nowrap shrink-0 border-b-[3px] -mb-px transition-all cursor-pointer ${
            active === tab.mode
              ? "border-red-600 text-red-600"
              : "border-transparent text-gray-500 hover:text-red-600"
          }`}
        >
          <span className="text-[12.5px] md:text-sm font-bold flex items-center gap-1.5">
            <span
              className="text-[18px] md:text-[20px] leading-none transition-all duration-200"
              style={{
                filter: active === tab.mode
                  ? "grayscale(1) sepia(1) saturate(10) hue-rotate(320deg) brightness(0.85)"
                  : "grayscale(1) brightness(0.45)"
              }}
            >{tab.emoji}</span>
            {tab.label}
          </span>
          <span className={`text-[10.5px] md:text-[11px] font-medium ${active === tab.mode ? "text-red-500/70" : "text-gray-400"}`}>
            {tab.sub}
          </span>
        </button>
      ))}
    </div>

    {/* Swipe indicator — right edge fade + chevron on mobile only */}
    <div className="md:hidden pointer-events-none absolute right-0 top-0 bottom-[1px] w-12 bg-gradient-to-l from-white via-white/85 to-transparent flex items-center justify-end pr-1.5">
      <ChevronRight className="w-4 h-4 text-primary-600 animate-pulse" strokeWidth={3} />
    </div>
    </div>
  );
}
