"use client";

import { useEffect, useTransition } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Pencil, Settings, Camera, Phone } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { signOutAction } from "@/actions/auth";

type Rep = {
  /** Display name — the rep's name, or the Pacred CS fallback. */
  name: string;
  /** Avatar URL — the rep's photo, or the Pacred brand logo fallback. */
  picture: string;
  /** Phone (display form) — tap-to-call strips it to digits. */
  tel: string;
};

type Props = {
  memberCode: string;
  fullName: string;
  /** profiles.avatar_url — null until the customer uploads a photo. */
  avatarUrl: string | null;
  walletTotal: number;
  /** The customer's assigned Sales rep + CS rep (Pacred fallback when none). */
  salesRep: Rep;
  csRep: Rep;
  /** Redirect ≥md viewers to /dashboard. TRUE for the standalone
   *  /m/dashboard route (desktop has no launchpad there). Pass FALSE when
   *  embedding the launchpad inside another page that already ships its own
   *  desktop layout (e.g. /profile renders this ONLY < md) — otherwise the
   *  bounce hijacks that page on desktop. Default true (back-compat). */
  bounceDesktopToDashboard?: boolean;
};

// Pacred-red brand icon set (the same PNGs FloatingTabs + the legacy PCS home
// draw from) so the launchpad grid matches the rest of the customer chrome.
const ICON_BASE = "/images/home/iconfloating";

// The service tiles of the legacy PCS member home, wired to the live Pacred
// routes — a faithful 1:1 port of pcscargo.co.th/member/ (D1), 3-column grid
// with a big icon + label. "เติมเงิน" (top-up → /wallet/deposit) is
// intentionally omitted: the owner cancelled the top-up model on 2026-06-07
// (pay-direct + verify-slip). Add it back only on the owner's word.
type GridTile = { icon: string; labelKey: string; href: string; comingSoon?: boolean };
const GRID_TILES: readonly GridTile[] = [
  { icon: `${ICON_BASE}/pcs-shops.png`,                  labelKey: "gridShop",       href: "/service-order" },
  { icon: "/images/IMBOX.png",                           labelKey: "gridImport",     href: "/service-import" },
  // ส่งออก — Pacred's own roadmap tile, paired next to นำเข้า. Ships DISABLED
  // (grayscale "ไอคอนเทาๆ") because the export module isn't built yet. Adding it
  // also makes the grid an even 3×3 (8 tiles + logout = 9), matching PCS.
  { icon: "/images/EXBOX.png",                           labelKey: "tileExport",     href: "#", comingSoon: true },
  { icon: "/images/hero-section/icon/billingpacred.png", labelKey: "gridReceipt",    href: "/service-import/pending" },
  { icon: `${ICON_BASE}/pcs-payment.png`,                labelKey: "gridPayment",    href: "/service-payment" },
  { icon: `${ICON_BASE}/pcs-wallet.png`,                 labelKey: "gridWalletCash", href: "/wallet" },
  { icon: `${ICON_BASE}/pcs-wallet-drop.png`,            labelKey: "gridWithdraw",   href: "/wallet/withdraw" },
  { icon: `${ICON_BASE}/pcs-address.png`,                labelKey: "gridAddress",    href: "/service-import/warehouse-addresses" },
];

export function MobileLaunchpad({ memberCode, fullName, avatarUrl, walletTotal, salesRep, csRep, bounceDesktopToDashboard = true }: Props) {
  const t = useTranslations("mobileLaunchpad");
  const initial = (fullName || "?").trim().charAt(0).toUpperCase();
  const [signOutPending, startSignOut] = useTransition();

  // Desktop bounce — anything ≥ md gets sent to the canonical /dashboard.
  // Skipped when embedded in a page that owns its own desktop view (/profile).
  useEffect(() => {
    if (!bounceDesktopToDashboard) return;
    const mql = window.matchMedia("(min-width: 768px)");
    const bounce = () => {
      window.location.replace("/dashboard");
    };
    if (mql.matches) {
      bounce();
      return;
    }
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) bounce();
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [bounceDesktopToDashboard]);

  const walletText = walletTotal.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // Sales + CS shown as two side-by-side cards (legacy "box-sale" stacked look).
  const repCards = [
    { role: "Sales", rep: salesRep },
    { role: "CS", rep: csRep },
  ] as const;

  return (
    <div className="md:hidden w-full pb-24">

      {/* ── 1. Profile hero — legacy PCS 1:1: centered avatar (with camera
              edit) + edit/settings icons top-right + name + รหัสสมาชิก, on a
              full-bleed red gradient with a rounded bottom (0 0 30px 30px). */}
      <section
        className="relative overflow-hidden rounded-b-[30px] text-white px-4 pt-10 pb-9 -mt-8"
        style={{ background: "#E11D2A" }}
      >
        {/* edit + settings — top-right */}
        <div className="relative z-10 flex justify-end gap-2">
          <Link
            href="/account-settings"
            aria-label={t("editAria")}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center ring-1 ring-white/25 active:scale-95 transition-all"
          >
            <Pencil className="w-4 h-4" strokeWidth={2.2} />
          </Link>
          <Link
            href="/account-settings"
            aria-label={t("settingsAria")}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center ring-1 ring-white/25 active:scale-95 transition-all"
          >
            <Settings className="w-4 h-4" strokeWidth={2.2} />
          </Link>
        </div>

        {/* Profile — avatar LEFT + name/code beside it (Facebook-style, like the
            original Pacred hero — not the centered legacy layout). */}
        <div className="relative z-10 flex items-center gap-3.5 mt-1">
          <div className="relative shrink-0">
            <div className="relative w-[70px] h-[70px] rounded-full bg-white/95 overflow-hidden ring-4 ring-white/40 shadow-lg flex items-center justify-center">
              {avatarUrl ? (
                <Image src={avatarUrl} alt={fullName} fill sizes="70px" className="object-cover" unoptimized />
              ) : (
                <span className="text-[28px] font-black text-primary-600 leading-none select-none">{initial}</span>
              )}
            </div>
            <Link
              href="/account-settings"
              aria-label={t("editPhotoAria")}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-gray-800 text-white flex items-center justify-center border-2 border-white shadow-md active:scale-95 transition-transform"
            >
              <Camera className="w-3.5 h-3.5" strokeWidth={2} />
            </Link>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,0.35)]">
              {t("welcome")}
            </p>
            <h2 className="text-[18px] font-bold text-white leading-tight truncate [text-shadow:0_2px_6px_rgba(0,0,0,0.4)]">
              {fullName}
            </h2>
            <p className="mt-0.5 text-[13px] font-medium text-white/95">
              {t("memberCode")} :{" "}
              <span className="text-[15px] font-bold tracking-wider align-middle">{memberCode || "—"}</span>
            </p>
          </div>
        </div>
      </section>

      {/* ── 2. Wallet card — overlaps the hero. "กระเป๋าสตางค์ (บาท)" + big
              balance + Pacred logo + full-width orange gradient bar (legacy). */}
      <div className="px-4 -mt-4 relative z-20">
        <Link
          href="/wallet"
          className="block bg-white rounded-[22px] shadow-[0_8px_22px_rgba(17,24,39,0.14)] px-4 pt-3 pb-3.5 active:scale-[0.99] transition-transform"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[14px] text-gray-700 font-medium">{t("walletCardTitle")}</div>
              <div className="text-[2.2rem] leading-[1.05] font-semibold text-gray-800 mt-0.5">{walletText}</div>
            </div>
            <Image
              src="/images/pdiwaicon.png"
              alt="Pacred"
              width={96}
              height={96}
              className="w-12 h-12 rounded-[13px] object-cover shrink-0 mt-0.5 shadow-sm"
            />
          </div>
          <div
            className="mt-2.5 h-2.5 rounded-full w-full"
            style={{ background: "linear-gradient(90deg,#F97316 0%,#FB9E3A 55%,#FBBF24 100%)" }}
          />
        </Link>
      </div>

      {/* ── 3. Sales + CS cards — the customer's assigned Sales rep + CS rep,
              side by side. Plain white cards (no red accent) — clean + airy. */}
      <div className="px-4 mt-3.5 grid grid-cols-2 gap-3">
        {repCards.map(({ role, rep }) => (
          <div
            key={role}
            className="bg-white rounded-[16px] shadow-sm border border-black/5 px-2.5 py-2.5 flex items-center gap-2"
          >
            <div className="relative w-9 h-9 rounded-full overflow-hidden border-2 border-[#F3C6CB] bg-white shrink-0">
              <Image src={rep.picture} alt={rep.name} fill sizes="36px" className="object-cover" unoptimized />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-bold text-primary-600 leading-tight truncate">
                {role} : {rep.name}
              </div>
              <div className="text-[11px] text-gray-700 mt-0.5 whitespace-nowrap">
                <a href={`tel:${rep.tel}`} className="text-gray-900 font-medium">{rep.tel}</a>
              </div>
            </div>
            {/* call button — a phone icon (square, not a round button) that
                dials the rep on tap */}
            <a
              href={`tel:${rep.tel}`}
              aria-label={`โทรหา ${role} ${rep.name}`}
              className="shrink-0 p-1.5 -mr-0.5 text-primary-600 active:scale-90 transition-transform"
            >
              <Phone className="w-4 h-4" fill="currentColor" />
            </a>
          </div>
        ))}
      </div>

      {/* ── 4. Service grid — legacy 3-column launchpad, big icon + label. */}
      <div className="px-3 mt-5 grid grid-cols-3 gap-x-2 gap-y-5 text-center">
        {GRID_TILES.map((tile) => {
          if (tile.comingSoon) {
            return (
              <div
                key={tile.labelKey}
                aria-disabled
                className="flex flex-col items-center gap-2 cursor-not-allowed select-none"
              >
                <span className="relative w-16 h-16 shrink-0">
                  <Image src={tile.icon} alt={t(tile.labelKey)} fill sizes="64px" className="object-contain grayscale opacity-45" />
                </span>
                <div className="flex flex-col items-center leading-tight">
                  <span className="text-[12px] font-medium text-gray-400 line-clamp-1">{t(tile.labelKey)}</span>
                  <span className="text-[11px] font-medium text-gray-400 whitespace-nowrap">เร็วๆ นี้</span>
                </div>
              </div>
            );
          }
          return (
            <Link
              key={tile.href}
              href={tile.href}
              className="flex flex-col items-center gap-2 active:scale-95 transition-transform"
            >
              <span className="relative w-16 h-16 shrink-0">
                <Image src={tile.icon} alt={t(tile.labelKey)} fill sizes="64px" className="object-contain" />
              </span>
              <span className="text-[12px] leading-[1.25] font-medium text-gray-700 line-clamp-2">
                {t(tile.labelKey)}
              </span>
            </Link>
          );
        })}

        <button
          type="button"
          disabled={signOutPending}
          onClick={() => startSignOut(() => { void signOutAction(); })}
          className="flex flex-col items-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
        >
          <span className="relative w-16 h-16 shrink-0">
            <Image src={`${ICON_BASE}/pcs-log-out.png`} alt={t("logout")} fill sizes="64px" className="object-contain" />
          </span>
          <span className="text-[12px] leading-[1.25] font-medium text-gray-700 line-clamp-2">
            {t("logout")}
          </span>
        </button>
      </div>
    </div>
  );
}
