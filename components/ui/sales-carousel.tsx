"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { TrackedExternalLink } from "@/components/analytics/tracked-link";
import type { SalesRep } from "@/lib/admin/sales-roster";

const GAP = 20;
const CARD_WIDTH = 240;

// Curated character art so the established reps keep their nice icons even
// though the roster is now data-driven (owner 2026-06-15 "ผูกกันหมดออโต้").
// Resolution order (see resolvePhoto): known-icon map → rep.photo
// (tb_admin.adminPicture) → generic Pacred logo. A NEW rep with no mapping
// + no photo falls back to the logo — never a broken/blank avatar.
//
// Keys are matched case-insensitively against BOTH the rep's adminID (e.g.
// "admin_may") and short name (e.g. "เมย์"), so a rename of either still
// resolves the art.
const KNOWN_ICON: Record<string, string> = {
  admin_may: "/images/Character_Icon/may.png",
  เมย์: "/images/Character_Icon/may.png",
  admin_pee: "/images/Character_Icon/pee01.png",
  พี: "/images/Character_Icon/pee01.png",
  admin_win: "/images/Character_Icon/win01.png",
  วิน: "/images/Character_Icon/win01.png",
};

const GENERIC_AVATAR = "/images/pacred-logo-red.png";

/** Pick the best avatar for a rep — curated art first, then their own
 *  picture, then the generic logo (rendered object-contain). Returns the
 *  src + whether to letterbox it (the logo needs object-contain padding). */
function resolvePhoto(rep: SalesRep): { src: string; contain: boolean } {
  const known =
    KNOWN_ICON[rep.adminID?.toLowerCase() ?? ""] ?? KNOWN_ICON[rep.name ?? ""];
  if (known) return { src: known, contain: false };
  if (rep.photo) return { src: rep.photo, contain: false };
  return { src: GENERIC_AVATAR, contain: true };
}

type ResolvedPerson = {
  rep: SalesRep;
  src: string;
  contain: boolean;
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
          <Image
            src={person.src}
            alt={person.alt}
            width={78}
            height={78}
            className={person.contain ? "w-full h-full object-contain p-2.5" : "w-full h-full object-cover"}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col items-center text-center px-3 pt-[44px] pb-3 gap-1 grow rounded-b-2xl">
        <p className="font-bold text-sm leading-tight">{person.rep.name}</p>
        <p className="text-[11px] font-medium text-primary-600 leading-tight">{person.role}</p>
        <p className="text-[11px] text-muted leading-snug line-clamp-1">{person.tagline}</p>
        {person.rep.phoneDisplay && (
          <p className="text-[13px] font-semibold text-foreground">{person.rep.phoneDisplay}</p>
        )}
        <TrackedExternalLink
          href="/line"
          cta="line_consult"
          surface="sales_carousel"
          ctaProps={{ rep: person.rep.name }}
          className="mt-auto w-full rounded-lg bg-[#06C755] py-1.5 text-[11px] font-semibold text-white text-center hover:bg-[#05a548] transition-colors"
        >
          {person.button}
        </TrackedExternalLink>
      </div>
    </div>
  );
}

/**
 * Customer-facing sales-team marquee. The roster is data-driven — the parent
 * fetches `getActiveSalesReps()` (SOT: lib/admin/sales-roster.ts) and passes
 * the live flagged reps in, so adding/removing a rep is a toggle in
 * /admin/admins/sales-team, never a code edit here.
 */
export function SalesCarousel({ reps }: { reps: SalesRep[] }) {
  const t = useTranslations("salesTeam");

  // Empty roster (edge case) — render nothing rather than an empty marquee.
  if (reps.length === 0) return null;

  const team: ResolvedPerson[] = reps.map((rep) => {
    const { src, contain } = resolvePhoto(rep);
    return {
      rep,
      src,
      contain,
      role: t("genericRole"),
      tagline: t("genericSlogan"),
      alt: t("genericAlt", { name: rep.name }),
      button: t("genericButton", { name: rep.name }),
    };
  });

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
          <SalesCard key={`${person.rep.adminID}-${i}`} person={person} />
        ))}
      </div>
    </div>
  );
}
