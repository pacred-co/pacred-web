"use client";

import Image from "next/image";

const GAP = 20;
const CARD_WIDTH = 240;

type SalesPerson = {
  name: string;
  role: string;
  tagline: string;
  phone: string;
  image?: string;
  useContain?: boolean;
};

const TEAM: SalesPerson[] = [
  {
    name: "วิน",
    role: "นำเข้า–ส่งออก จีน-ทั่วโลก",
    tagline: "นำเข้าทุก Port ทุก Term ปิดดีลให้จบในที่เดียว",
    phone: "066-125-3007",
    image: "/images/Character_Icon/win.png",
  },
  {
    name: "แนท",
    role: "นำเข้า-สั่งซื้อ 1688/Taobao/Tmall",
    tagline: "นำเข้าสั่งซื้อจีน ทุกแพลตฟอร์ม ครบจบในที่เดียว",
    phone: "066-125-3007",
    image: "/images/pacred-logo-red.png",
    useContain: true,
  },
  {
    name: "พลอย",
    role: "ชิปปิ้งเคลียร์สินค้าติดด่าน",
    tagline: "เคลียร์สินค้าติดด่าน เร็ว ปลอดภัย การันตีจบ",
    phone: "066-090-1217",
    image: "/images/Character_Icon/ploy.png",
  },
];

const ITEMS = [...TEAM, ...TEAM, ...TEAM, ...TEAM];

function SalesCard({ person }: { person: SalesPerson }) {
  return (
    <div
      style={{ width: CARD_WIDTH }}
      className="shrink-0 h-[360px] rounded-2xl border border-border bg-white dark:bg-surface shadow-sm relative flex flex-col"
    >
      {/* Header */}
      <div className="h-[90px] bg-primary-500 rounded-t-2xl shrink-0" />

      {/* Avatar */}
      <div className="absolute top-[90px] left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
        <div className="w-[92px] h-[92px] rounded-full border-4 border-white dark:border-surface bg-white dark:bg-background overflow-hidden flex items-center justify-center">
          {person.image ? (
            <Image
              src={person.image}
              alt={`เซลล์${person.name} Pacred`}
              width={92}
              height={92}
              className={person.useContain ? "w-full h-full object-contain p-3" : "w-full h-full object-cover"}
            />
          ) : (
            <span className="text-2xl font-bold text-primary-600">{person.name.charAt(0)}</span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col items-center text-center px-4 pt-[56px] pb-5 gap-1.5 grow rounded-b-2xl">
        <p className="font-bold text-sm">{person.name}</p>
        <p className="text-[11px] font-medium text-primary-600">{person.role}</p>
        <p className="text-xs text-muted leading-relaxed line-clamp-2">{person.tagline}</p>
        <p className="text-sm font-semibold text-foreground mt-1">{person.phone}</p>
        <a
          href="https://lin.ee/Yg3fU0I"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto w-full rounded-xl bg-[#06C755] py-2 text-xs font-semibold text-white text-center hover:bg-[#05a548] transition-colors"
        >
          ทัก{person.name}เลย
        </a>
      </div>
    </div>
  );
}

export function SalesCarousel() {
  const totalWidth = TEAM.length * (CARD_WIDTH + GAP);

  return (
    <div className="w-full overflow-hidden">
      <div
        className="flex hover:[animation-play-state:paused]"
        style={{
          gap: GAP,
          width: `${totalWidth * 4}px`,
          animation: "marquee 80s linear infinite",
        }}
      >
        {ITEMS.map((person, i) => (
          <SalesCard key={i} person={person} />
        ))}
      </div>
    </div>
  );
}
