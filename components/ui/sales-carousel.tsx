"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { TrackedExternalLink } from "@/components/analytics/tracked-link";

const GAP = 20;
const CARD_WIDTH = 240;

type SalesPersonData = {
  personKey: "may" | "nat" | "win" | "ploy" | "pee" | "toey";
  name: string;
  phone: string;
  image?: string;
  useContain?: boolean;
};

const TEAM_DATA: SalesPersonData[] = [
  { personKey: "may",  name: "เมย์", phone: "066-125-3006", image: "/images/Character_Icon/may.png" },
  { personKey: "nat",  name: "แนท",  phone: "066-131-0253", image: "/images/pacred-logo-red.png", useContain: true },
  { personKey: "pee",  name: "พี",   phone: "061-779-9299", image: "/images/Character_Icon/pee01.png" },
  { personKey: "toey", name: "เตย",  phone: "099-253-1415", image: "/images/Character_Icon/Toey01.png" },
  { personKey: "win",  name: "วิน",  phone: "062-603-0456", image: "/images/Character_Icon/win01.png" },
  // CS พลอย removed from on-site rep cards (ปอน 2026-06-08).
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
      className="shrink-0 h-[270px] rounded-2xl border border-border bg-white dark:bg-surface shadow-sm relative flex flex-col"
    >
      {/* Header */}
      <div className="h-[68px] bg-primary-500 rounded-t-2xl shrink-0" />

      {/* Avatar */}
      <div className="absolute top-[68px] left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
        <div className="w-[78px] h-[78px] rounded-full border-4 border-white dark:border-surface bg-white dark:bg-background overflow-hidden flex items-center justify-center">
          {person.image ? (
            <Image
              src={person.image}
              alt={person.alt}
              width={78}
              height={78}
              className={person.useContain ? "w-full h-full object-contain p-2.5" : "w-full h-full object-cover"}
            />
          ) : (
            <span className="text-2xl font-bold text-primary-600">{person.name.charAt(0)}</span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col items-center text-center px-3 pt-[44px] pb-3 gap-1 grow rounded-b-2xl">
        <p className="font-bold text-sm leading-tight">{person.name}</p>
        <p className="text-[11px] font-medium text-primary-600 leading-tight">{person.role}</p>
        <p className="text-[11px] text-muted leading-snug line-clamp-1">{person.tagline}</p>
        <p className="text-[13px] font-semibold text-foreground">{person.phone}</p>
        <TrackedExternalLink
          href="/line"
          cta="line_consult"
          surface="sales_carousel"
          ctaProps={{ rep: person.name }}
          className="mt-auto w-full rounded-lg bg-[#06C755] py-1.5 text-[11px] font-semibold text-white text-center hover:bg-[#05a548] transition-colors"
        >
          {person.button}
        </TrackedExternalLink>
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
