"use client";

const BASE_CARDS = [1, 2, 3, 4, 5, 6, 7, 8];
const CARD_WIDTH = 240;
const GAP = 20;

// Duplicate for seamless loop — animate -50% of total width
const ITEMS = [...BASE_CARDS, ...BASE_CARDS];

function SalesCard() {
  return (
    <div
      style={{ width: CARD_WIDTH }}
      className="shrink-0 h-[360px] rounded-2xl border border-border bg-white dark:bg-surface shadow-sm relative flex flex-col"
    >
      {/* Header */}
      <div className="h-[90px] bg-primary-500 rounded-t-2xl shrink-0" />

      {/* Profile image — overlaps header and content */}
      <div className="absolute top-[90px] left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
        <div className="w-[92px] h-[92px] rounded-full border-4 border-white dark:border-surface bg-surface dark:bg-background" />
      </div>

      {/* Content */}
      <div className="flex flex-col items-center text-center px-4 pt-[56px] pb-5 gap-2 grow rounded-b-2xl">
        <p className="font-bold text-sm">ชื่อ นามสกุล</p>
        <p className="text-xs text-muted leading-relaxed line-clamp-2">
          ผู้เชี่ยวชาญด้านนำเข้า-ส่งออก พร้อมให้คำปรึกษา
        </p>
        <p className="text-sm font-medium">08x-xxx-xxxx</p>
        <a
          href="#"
          className="mt-auto w-full rounded-xl bg-primary-500 py-2 text-xs font-semibold text-white text-center hover:bg-primary-600 transition-colors"
        >
          ทักด่วน LINE
        </a>
      </div>
    </div>
  );
}

export function SalesCarousel() {
  const totalWidth = BASE_CARDS.length * (CARD_WIDTH + GAP);

  return (
    <div className="w-full overflow-hidden">
      <div
        className="flex hover:[animation-play-state:paused]"
        style={{
          gap: GAP,
          width: `${totalWidth * 2}px`,
          animation: "marquee 60s linear infinite",
        }}
      >
        {ITEMS.map((_, i) => (
          <SalesCard key={i} />
        ))}
      </div>
    </div>
  );
}
