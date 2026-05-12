"use client";

const GAP = 20;
const CARD_WIDTH = 240;

const TEAM = [
  { name: "แบม", role: "LCL / FCL นำเข้า-ส่งออก", tagline: "ตู้เล็ก ตู้ใหญ่จะตู้ไหน ก็พร้อมปิดให้ได้หมด", phone: "066-125-3007" },
  { name: "ยีนส์", role: "นำเข้า-ส่งออก ชิปปิ้ง", tagline: "ของไม่ค้าง ด่านไม่ติด การันตีถึงมือแน่นอน", phone: "066-090-1217" },
  { name: "พลอย", role: "เคลียร์ศุลกากร", tagline: "จะท่าไหน เทิร์มไหน ก็พร้อมลุย", phone: "062-719-1998" },
  { name: "แป้ง", role: "ฝากสั่งซื้อ 1688 / Taobao", tagline: "สั่งครบ จบในที่เดียว P ดิวะ !", phone: "092-XXX-XXXX" },
  { name: "โจ้", role: "โอนเงินต่างประเทศ", tagline: "เรทดีกว่าธนาคาร ปลอดภัย โปร่งใส", phone: "089-XXX-XXXX" },
];

const ITEMS = [...TEAM, ...TEAM];

function SalesCard({ person }: { person: typeof TEAM[number] }) {
  return (
    <div
      style={{ width: CARD_WIDTH }}
      className="shrink-0 h-[360px] rounded-2xl border border-border bg-white dark:bg-surface shadow-sm relative flex flex-col"
    >
      {/* Header */}
      <div className="h-[90px] bg-primary-500 rounded-t-2xl shrink-0" />

      {/* Avatar */}
      <div className="absolute top-[90px] left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
        <div className="w-[92px] h-[92px] rounded-full border-4 border-white dark:border-surface bg-surface dark:bg-background flex items-center justify-center">
          <span className="text-2xl font-bold text-primary-600">{person.name.charAt(0)}</span>
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
          ทักด่วน LINE
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
          width: `${totalWidth * 2}px`,
          animation: "marquee 40s linear infinite",
        }}
      >
        {ITEMS.map((person, i) => (
          <SalesCard key={i} person={person} />
        ))}
      </div>
    </div>
  );
}
