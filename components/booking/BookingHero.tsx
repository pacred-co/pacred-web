import { HERO_IMGS, HERO_CONTENT } from "@/lib/booking-data";
import type { TabMode, SeaMode } from "@/types/booking";

interface BookingHeroProps {
  activeTab: TabMode | null;
  seaMode: SeaMode;
}

export function BookingHero({ activeTab, seaMode }: BookingHeroProps) {
  const imgKey = activeTab === null
    ? "default"
    : activeTab === "sea"
    ? seaMode
    : activeTab;

  const contentKey = activeTab === null
    ? "default"
    : activeTab === "sea"
    ? seaMode
    : activeTab;

  const bg   = HERO_IMGS[imgKey]   ?? HERO_IMGS.default;
  const copy = HERO_CONTENT[contentKey] ?? HERO_CONTENT.default;

  return (
    <div
      className="relative overflow-hidden min-h-[140px] md:min-h-[280px] flex flex-col items-center justify-center px-4 md:px-7 pt-5 md:pt-[50px] pb-12 md:pb-[90px] rounded-b-2xl md:rounded-b-3xl"
      style={{ background: `url('${bg}') center/cover no-repeat` }}
    >
      <div className="relative z-10 max-w-[850px] mx-auto text-center text-white">
        <h1
          className="text-[17px] md:text-[clamp(28px,4vw,42px)] font-extrabold tracking-tight leading-tight mb-1 md:mb-3 text-white [text-shadow:0_4px_15px_rgba(0,0,0,0.4)]"
          dangerouslySetInnerHTML={{ __html: copy.title.replace('<em>', '<em class="text-yellow-300 not-italic">') }}
        />
        <p className="text-[11.5px] md:text-base font-medium text-white/95 leading-snug [text-shadow:0_2px_10px_rgba(0,0,0,0.5)]">
          {copy.sub}
        </p>
      </div>
    </div>
  );
}
