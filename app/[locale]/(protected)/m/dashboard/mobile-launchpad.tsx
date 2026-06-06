"use client";

import { useEffect, useTransition } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Phone, Settings } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { signOutAction } from "@/actions/auth";

type SalesRep = {
  /** Display name — adminnickname or fullname. Falls back to "แนท" (the
   *  central Pacred care rep) when the customer has no adminidsale. */
  nickname: string;
  /** Avatar URL — `tb_admin.adminpicture` if present, otherwise the Pacred
   *  brand logo so the slot is never an empty initial. */
  picture: string;
  /** Direct phone — tb_organization_tell.tell joined via tb_org_tell_ships,
   *  or the Pacred office line 02-421-3325 as fallback. */
  tel: string;
};

type Props = {
  memberCode: string;
  fullName: string;
  /** profiles.avatar_url — null until customer uploads a photo */
  avatarUrl: string | null;
  walletTotal: number;
  salesRep: SalesRep;
};

// 8-icon launchpad — 4 cols × 2 rows per ปอน 2026-05-26. Uses the legacy
// PNG icon set from /images/home/iconfloating/ (Pacred-red brand icons —
// same set FloatingTabs draws from) so the launchpad matches the rest of
// the customer chrome instead of looking like generic Lucide outlines.
const ICON_BASE = "/images/home/iconfloating";

// 4 bottom-banner promo cards — scroll horizontally in an infinite marquee
// at the bottom of the launchpad. Sources are the same customer-theme PNGs
// the desktop dashboard carousel draws from.
const BOTTOM_BANNERS = [
  { src: "/images/customertheme/shop.png",  altKey: "bannerShop",   href: "/service-order"          },
  { src: "/images/customertheme/drive.png", altKey: "bannerDrive",  href: "/service-import"      },
  { src: "/images/customertheme/bill.png",  altKey: "bannerBill",   href: "/service-import/pending" },
  { src: "/images/customertheme/line.png",  altKey: "bannerLine",   href: "/notifications"          },
] as const;

// Launchpad item type — `comingSoon: true` flips the tile to disabled
// grayscale + "COMING SOON" caption (no Link navigation).
type LaunchpadItem = {
  icon: string;
  labelKey: string;
  href: string;
  comingSoon?: boolean;
};

// ROW 1 — shipping / import / export services. Grouped as the "ส่งของ"
// workflow with นำเข้า ↔ ส่งออก paired side-by-side (เดฟ 2026-05-27 — ปอน:
// "เอาส่งออกไปคู่กับนำเข้าให้หน่อย"). ส่งออก carries `comingSoon: true`
// because the export module isn't built yet — `export.png` is its dedicated
// icon (already in the iconfloating set), grayscale + "COMING SOON" badge
// applied in the render branch.
const PRIMARY_SERVICES: readonly LaunchpadItem[] = [
  { icon: "/images/hero-section/icon/cart.png", labelKey: "tileShopOrder", href: "/cart/add"   },
  { icon: `${ICON_BASE}/pcs-payment.png`,      labelKey: "tileYuanTransfer", href: "/service-payment" },
  { icon: `${ICON_BASE}/pcs-forwarder.png`,    labelKey: "tileImport",     href: "/service-import"  },
  { icon: `${ICON_BASE}/export.png`,           labelKey: "tileExport",     href: "#", comingSoon: true },
];

// ROW 2 — utility / account actions: address, wallet, topup, history.
// ออกจากระบบ moves to row 3 as a single end-of-session cell (rendered as a
// <button> after this list because logout is a Server Action, not a link).
const SECONDARY_ACTIONS: readonly LaunchpadItem[] = [
  { icon: `${ICON_BASE}/pcs-address.png`,                labelKey: "tileShipAddress", href: "/service-import/warehouse-addresses" },
  { icon: `${ICON_BASE}/pcs-wallet.png`,                 labelKey: "tileWallet", href: "/wallet"                 },
  { icon: `${ICON_BASE}/pcs-wallet-add.png`,             labelKey: "tileTopup",        href: "/wallet/deposit"         },
  { icon: "/images/hero-section/icon/billingpacred.png", labelKey: "tileReceiptHistory",  href: "/service-import/pending" },
];

export function MobileLaunchpad({ memberCode, fullName, avatarUrl, walletTotal, salesRep }: Props) {
  const t = useTranslations("mobileLaunchpad");
  // Customer initial — first character of the display name, uppercased.
  // Used as a clean fallback if avatar_url is null / fails to load.
  const initial = (fullName || "?").trim().charAt(0).toUpperCase();
  const [signOutPending, startSignOut] = useTransition();

  // Desktop bounce — anything ≥ md gets sent to the canonical /dashboard.
  useEffect(() => {
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
  }, []);

  const walletText = walletTotal.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div className="md:hidden w-full px-3 pt-0 pb-24 space-y-2.5">

      {/* ── 1. Profile hero — FULL-BLEED edge-to-edge banner (เดฟ 2026-05-27 —
              ปอน: "ทำให้เต็มแล้วโค้งมนๆเลยตรงมุม"). `-mx-3` undoes the
              parent wrapper's `px-3` so the banner extends to the viewport
              edges; `rounded-b-3xl` rounds ONLY the bottom corners — the top
              edge sits flat under the SearchBar so it reads as one continuous
              chrome surface ("drawer pulling down from under header"). The
              `-mt-8` keeps the legacy-PCS "bite into the search bar" overlap.
              Min-height 180px reveals the full truck illustration in
              `bannermobilemain.png` (`cover` scales with container height). */}
      <section className="relative overflow-hidden rounded-b-2xl text-white px-4 pt-14 pb-5 shadow-md min-h-[190px] -mt-8 -mx-3">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background: "url('/images/bannermobile/bannermobilemain.png') center center / cover no-repeat",
          }}
        />
        {/* Settings gear — top-right of the hero, opens /account-settings.
            Wrapped in a circular white/translucent button so it's tap-friendly
            and reads against the photo background. */}
        <Link
          href="/account-settings"
          aria-label={t("settingsAria")}
          className="absolute top-14 right-2 z-10 w-7 h-7 rounded-full bg-white/25 hover:bg-white/40 backdrop-blur-sm flex items-center justify-center text-white shadow-md ring-1 ring-white/30 active:scale-95 transition-all"
        >
          <Settings className="w-3.5 h-3.5" strokeWidth={2.2} />
        </Link>

        <div className="relative flex items-center gap-3">
          <div className="relative w-[64px] h-[64px] rounded-full bg-white/95 overflow-hidden shadow-lg ring-4 ring-white/30 shrink-0 flex items-center justify-center">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={fullName}
                fill
                sizes="64px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <span className="text-[28px] font-black text-primary-600 leading-none select-none">
                {initial}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-white [-webkit-text-stroke:0.5px_#7f1d1d] [paint-order:stroke_fill] [text-shadow:0_2px_6px_rgba(0,0,0,0.6)]">
              {t("welcome")}
            </p>
            <p className="text-[15px] font-bold leading-tight whitespace-nowrap truncate text-white/95 [-webkit-text-stroke:0.5px_#7f1d1d] [paint-order:stroke_fill] [text-shadow:0_2px_6px_rgba(0,0,0,0.7),0_4px_12px_rgba(0,0,0,0.45)]">
              {fullName}
            </p>
            <p className="mt-1 text-[13px] font-bold text-white [-webkit-text-stroke:0.5px_#7f1d1d] [paint-order:stroke_fill] [text-shadow:0_2px_5px_rgba(0,0,0,0.55)]">
              {t("memberCode")} :{" "}
              <span className="text-[19px] font-black tracking-wider align-middle [-webkit-text-stroke:0.9px_#7f1d1d] [paint-order:stroke_fill] [text-shadow:0_2px_7px_rgba(0,0,0,0.65)]">
                {memberCode || "—"}
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* ── 2. Sales rep card — PROMOTED to primary (เดฟ 2026-05-27 — ปอน:
              "สลับเซลล์ขึ้นไปแทน"). The sales rep is the most-used contact
              point for the customer, so it gets the prominent "overlapping
              the hero" slot. `-mt-16 z-10` lifts the card ~54px up onto the
              red banner's lower half; the sky-tinted lift shadow tells the
              eye it floats above the red. Card stays compact + clean per
              earlier "ขาวๆ ไม่ต้องโปร่ง" rule. */}
      <section className="relative z-10 -mt-12 overflow-hidden rounded-2xl bg-white border border-border shadow-sm px-3 py-2.5 flex items-center gap-3">
        <span
          aria-hidden
          className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-gradient-to-b from-sky-500 to-sky-700"
        />

        <div className="relative shrink-0">
          <div className="relative w-14 h-14 overflow-hidden rounded-full border-2 border-sky-500/40 bg-white">
            <Image
              src={salesRep.picture}
              alt={salesRep.nickname}
              fill
              sizes="56px"
              className="object-cover"
              unoptimized
            />
          </div>
          <span aria-hidden className="absolute bottom-0 right-0 flex h-3.5 w-3.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-white" />
          </span>
        </div>

        <div className="relative min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-sky-700">
              {t("salesRepLabel")}
            </p>
            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[9px] font-bold px-1.5 py-0.5 border border-emerald-100">
              <span className="w-1 h-1 rounded-full bg-emerald-500" />
              ONLINE
            </span>
          </div>
          <p className="text-[14px] font-bold text-foreground truncate leading-tight">
            {t("salesRepName", { name: salesRep.nickname })}
          </p>
          <p className="mt-0.5 text-[11.5px] text-muted font-mono">
            {t("phoneLabel")} : <span className="text-foreground">{salesRep.tel}</span>
          </p>
        </div>

        <a
          href={`tel:${salesRep.tel.replace(/[^+0-9]/g, "")}`}
          aria-label={t("callSalesAria", { name: salesRep.nickname })}
          className="relative shrink-0 inline-flex items-center gap-1 rounded-full bg-sky-600 text-white text-[11px] font-bold px-3 py-1.5 shadow-md shadow-sky-600/25 active:scale-95 transition-transform"
        >
          <Phone className="w-3 h-3" fill="currentColor" />
          {t("contactSales")}
        </a>
      </section>

      {/* ── 3. Wallet balance card — DEMOTED to secondary (เดฟ 2026-05-27 —
              ปอน: "ทำให้กระเป๋าเล็กลงนิดนึงให้เป็นรองเซลล์"). Slimmer padding,
              smaller balance digit, and no "วงเงินคงเหลือ" subtitle so the
              card reads as a compact one-liner under the prominent sales
              card above. Label also renamed from "กระเป๋าเครดิต" → "กระเป๋าเงิน"
              per ปอน. */}
      <Link
        href="/wallet"
        className="relative overflow-hidden rounded-2xl bg-white border border-border shadow-sm px-3 py-2.5 flex items-center gap-3 active:scale-[0.99] transition-transform"
      >
        <span
          aria-hidden
          className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-gradient-to-b from-emerald-500 to-emerald-700"
        />

        {/* Single row — no icon, label + balance inline (owner 2026-06-04:
            "ไม่ต้องมีไอคอนกระเป๋าพักเงิน และทำให้ทุกอย่างเป็นแถวเดียวกัน"). */}
        <div className="relative min-w-0 flex-1 flex items-baseline gap-1.5 pl-1.5">
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
            {t("walletLabel")}
          </span>
          <span className="truncate text-[18px] font-black tracking-tight text-emerald-600">
            {walletText}
          </span>
          <span className="shrink-0 text-[11px] font-bold text-emerald-500/80">{t("baht")}</span>
        </div>

        {/* Right button — same pill style as "ติดต่อเซลล์" so both cards have
            matching CTAs. */}
        <span className="relative shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-600 text-white text-[11px] font-bold px-3 py-1.5 shadow-md shadow-emerald-600/25">
          {t("topupShort")}
        </span>
      </Link>

      {/* ── 4. Section header — matches homepage OurServices style:
              red dot + uppercase-tracked label, centered on mobile. */}
      <div className="flex items-center justify-center gap-1.5 pt-2 text-red-600 text-[10.5px] font-black tracking-[0.08em] uppercase">
        <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-red-600 shrink-0" />
        {t("ourServices")}
      </div>

      {/* ── 5. 9-tile launchpad — 4-col × 3-row (8 active links + 1 disabled
              coming-soon tile + 1 logout button = 9 cells; row 3 ends with
              just ออกจากระบบ + 3 empty cells). Layout intent (ปอน 2026-05-27):
                Row 1 (services + roadmap): ฝากสั่งซื้อ · ฝากโอนชำระ · นำเข้า · ส่งออก[COMING SOON]
                Row 2 (utility actions):    ที่อยู่จัดส่ง · กระเป๋าพักเงิน · เติมเงิน · ประวัติใบเสร็จ
                Row 3 (end-of-session):     ออกจากระบบ · — · — · —
              ส่งออก sits next to นำเข้า — natural import↔export pair — but
              wears the disabled grayscale + COMING SOON badge because the
              export module isn't built yet. Active state on links = subtle
              rose tint so the tap has tactile feedback. */}
      <section className="grid grid-cols-4 gap-2 pt-1 pb-2">
        {[...PRIMARY_SERVICES, ...SECONDARY_ACTIONS].map((item) => {
          if (item.comingSoon) {
            return (
              <div
                key={item.labelKey}
                aria-disabled
                className="flex flex-col items-center justify-start gap-1 px-1 py-2.5 rounded-xl cursor-not-allowed select-none"
              >
                <span className="relative w-11 h-11 shrink-0">
                  <Image
                    src={item.icon}
                    alt={t(item.labelKey)}
                    fill
                    sizes="44px"
                    className="object-contain grayscale opacity-50"
                  />
                </span>
                <span className="text-[10.5px] leading-[1.2] text-center font-medium text-gray-400 line-clamp-1">
                  {t(item.labelKey)}
                </span>
                <span className="text-[8px] leading-none font-bold text-gray-400 uppercase tracking-wider">
                  Coming Soon
                </span>
              </div>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center justify-start gap-1.5 px-1 py-2.5 rounded-xl active:bg-rose-50/60 transition-colors"
            >
              <span className="relative w-11 h-11 shrink-0">
                <Image
                  src={item.icon}
                  alt={t(item.labelKey)}
                  fill
                  sizes="44px"
                  className="object-contain"
                />
              </span>
              <span className="text-[10.5px] leading-[1.2] text-center font-medium text-foreground line-clamp-2">
                {t(item.labelKey)}
              </span>
            </Link>
          );
        })}

        <button
          type="button"
          disabled={signOutPending}
          onClick={() => startSignOut(() => { void signOutAction(); })}
          className="flex flex-col items-center justify-start gap-1.5 px-1 py-2.5 rounded-xl active:bg-rose-50/60 transition-colors disabled:opacity-60"
        >
          <span className="relative w-11 h-11 shrink-0">
            <Image
              src={`${ICON_BASE}/pcs-log-out.png`}
              alt={t("logout")}
              fill
              sizes="44px"
              className="object-contain"
            />
          </span>
          <span className="text-[10.5px] leading-[1.2] text-center font-medium text-foreground line-clamp-2">
            {t("logout")}
          </span>
        </button>
      </section>

      {/* ── 6. Bottom banner marquee — infinite horizontal scroll of the
              4 customertheme promo banners (bill / line / drive / shop).
              The strip is duplicated 2× so the `marquee` keyframe (defined
              in app/globals.css §@keyframes marquee: translateX(0→-50%))
              loops seamlessly. Pauses on hover/active for tap accessibility. */}
      <section className="relative overflow-hidden rounded-2xl" aria-label={t("promoMarqueeAria")}>
        <div className="flex w-max gap-3 animate-[marquee_28s_linear_infinite] hover:[animation-play-state:paused]">
          {[...BOTTOM_BANNERS, ...BOTTOM_BANNERS].map((b, i) => (
            <Link
              key={`${b.src}-${i}`}
              href={b.href}
              className="shrink-0 w-[280px] block rounded-2xl overflow-hidden shadow-md active:scale-[0.99] transition-transform"
            >
              <Image
                src={b.src}
                alt={t(b.altKey)}
                width={460}
                height={140}
                className="w-full h-auto"
              />
            </Link>
          ))}
        </div>
      </section>

    </div>
  );
}
