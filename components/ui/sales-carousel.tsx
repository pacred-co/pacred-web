"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";

const GAP = 20;
const CARD_WIDTH = 240;

type SalesPersonData = {
  personKey: "win" | "nat" | "ploy";
  name: string;
  phone: string;
  image?: string;
  useContain?: boolean;
};

const TEAM_DATA: SalesPersonData[] = [
  { personKey: "win",  name: "วิน",  phone: "066-125-3007", image: "/images/Character_Icon/win.png" },
  { personKey: "nat",  name: "แนท",  phone: "066-125-3007", image: "/images/pacred-logo-red.png", useContain: true },
  { personKey: "ploy", name: "พลอย", phone: "066-090-1217", image: "/images/Character_Icon/ploy.png" },
];

type ResolvedPerson = SalesPersonData & {
  role: string;
  tagline: string;
  alt: string;
  button: string;
};

function SalesCard({ person }: { person: ResolvedPerson }) {
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
              alt={person.alt}
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
          {person.button}
        </a>
      </div>
    </div>
  );
}

export function SalesCarousel() {
  const t = useTranslations("salesTeam");

  const team: ResolvedPerson[] = TEAM_DATA.map((p) => ({
    ...p,
    role:    t(`${p.personKey}.role`),
    tagline: t(`${p.personKey}.slogan`),
    alt:     t(`${p.personKey}.alt`),
    button:  t(`${p.personKey}.button`),
  }));

  const items = [...team, ...team, ...team, ...team];
  const totalWidth = team.length * (CARD_WIDTH + GAP);

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
        {items.map((person, i) => (
          <SalesCard key={i} person={person} />
        ))}
      </div>
    </div>
  );
}
