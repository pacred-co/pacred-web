"use client";

import { useEffect, useTransition } from "react";
import Image from "next/image";
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

// Glassy red-tint chiclet — Pacred-red gradient + backdrop-blur frosted look.
// Shadows are kept TIGHT (small outer drop + heavy inset bevel) so the glow
// stays INSIDE the card frame instead of bleeding into the gutter between
// cells (per ปอน 2026-05-26 — "ฟุ้งออกกรอบมากไป").
const LAUNCHPAD_BTN_3D = [
  "relative overflow-hidden flex flex-col items-center justify-start gap-1.5 rounded-2xl",
  "bg-gradient-to-br from-white via-rose-50/60 to-rose-100/40 backdrop-blur-sm",
  "border border-rose-100/90",
  "shadow-[0_1px_2px_rgba(179,0,0,0.08),0_2px_4px_rgba(179,0,0,0.05),inset_0_1.5px_0_rgba(255,255,255,1),inset_0_-2px_0_rgba(179,0,0,0.12),inset_0_0_0_1px_rgba(255,255,255,0.5),inset_0_8px_16px_-8px_rgba(255,255,255,0.7),inset_0_-8px_16px_-8px_rgba(179,0,0,0.06)]",
  "transition-[transform,box-shadow] duration-300 ease-out will-change-transform",
  "hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(179,0,0,0.10),0_4px_8px_rgba(179,0,0,0.08),inset_0_2px_0_rgba(255,255,255,1),inset_0_-2px_0_rgba(179,0,0,0.14),inset_0_0_0_1px_rgba(255,255,255,0.55),inset_0_8px_16px_-8px_rgba(255,255,255,0.8),inset_0_-8px_16px_-8px_rgba(179,0,0,0.10)]",
  "active:translate-y-0 active:shadow-[0_1px_2px_rgba(179,0,0,0.10),inset_0_2px_4px_rgba(179,0,0,0.14)]",
  "px-1 py-3 min-h-[88px]",
].join(" ");

// 4 bottom-banner promo cards — scroll horizontally in an infinite marquee
// at the bottom of the launchpad. Sources are the same customer-theme PNGs
// the desktop dashboard carousel draws from.
const BOTTOM_BANNERS = [
  { src: "/images/customertheme/shop.png",  alt: "ค้นหาสินค้าจาก 1688 Taobao Tmall", href: "/service-order"          },
  { src: "/images/customertheme/drive.png", alt: "ส่งของในกรุงเทพ-ปริมณฑลเหมา 100 บาท", href: "/service-import"      },
  { src: "/images/customertheme/bill.png",  alt: "ออกบิลใบเสร็จ / ใบแจ้งหนี้",        href: "/service-import/pending" },
  { src: "/images/customertheme/line.png",  alt: "เชื่อมต่อ Line Notify",            href: "/notifications"          },
] as const;

const LAUNCHPAD = [
  { icon: "/images/hero-section/icon/cart.png", label: "บริการฝากสั่ง",             href: "/service-order"                          },
  { icon: `${ICON_BASE}/pcs-forwarder.png`,    label: "บริการนำเข้า",              href: "/service-import"                         },
  { icon: "/images/hero-section/icon/billingpacred.png", label: "ประวัติใบเสร็จรายการนำเข้า", href: "/service-import/pending"            },
  { icon: `${ICON_BASE}/pcs-payment.png`,      label: "บริการฝากโอน / ชำระ",       href: "/service-payment"                        },
  { icon: `${ICON_BASE}/pcs-wallet.png`,       label: "กระเป๋าเงิน",               href: "/wallet"                                 },
  { icon: `${ICON_BASE}/pcs-wallet-add.png`,   label: "เติมเงิน",                  href: "/wallet/deposit"                         },
  { icon: `${ICON_BASE}/pcs-address.png`,      label: "ที่อยู่จัดส่งสินค้า",       href: "/service-import/warehouse-addresses"     },
] as const;

export function MobileLaunchpad({ memberCode, fullName, avatarUrl, walletTotal, salesRep }: Props) {
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
    <div className="md:hidden w-full px-3 pt-0 pb-24 space-y-3">

      {/* ── 1. Profile hero (BookingHero pattern: full-bleed image + white text
              w/ dark-red stroke + text-shadow — NO color overlay so the photo
              stays visible. Negative margin-top pulls the hero up so the
              SearchBar bottom slightly overlaps the top of the banner —
              the same "search bar bites into the hero" trick BookingCalculator
              uses with `-mt-10`. Per ปอน 2026-05-26.) ── */}
      <section className="relative overflow-hidden rounded-3xl text-white px-4 pt-6 pb-4 shadow-[0_10px_30px_rgba(179,0,0,0.25)] min-h-[110px] -mt-4">
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
          aria-label="ตั้งค่าบัญชีผู้ใช้งาน"
          className="absolute top-7 right-2 z-10 w-7 h-7 rounded-full bg-white/25 hover:bg-white/40 backdrop-blur-sm flex items-center justify-center text-white shadow-md ring-1 ring-white/30 active:scale-95 transition-all"
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
              ยินดีต้อนรับ
            </p>
            <p className="text-[18px] font-black leading-tight whitespace-nowrap truncate text-white [-webkit-text-stroke:1px_#7f1d1d] [paint-order:stroke_fill] [text-shadow:0_2px_6px_rgba(0,0,0,0.7),0_4px_12px_rgba(0,0,0,0.45)]">
              {fullName}
            </p>
            <p className="mt-0.5 text-[12px] font-bold text-white [-webkit-text-stroke:0.5px_#7f1d1d] [paint-order:stroke_fill] [text-shadow:0_2px_5px_rgba(0,0,0,0.55)]">
              รหัสสมาชิก :{" "}
              <span className="font-black tracking-wider">{memberCode || "—"}</span>
            </p>
          </div>
        </div>
      </section>

      {/* ── 2. Wallet balance card — emerald theme (money / growth cue) ── */}
      <Link
        href="/wallet"
        className="relative block overflow-hidden rounded-2xl bg-gradient-to-br from-white via-emerald-50/40 to-emerald-100/60 border border-emerald-100 shadow-[0_6px_20px_rgba(5,150,105,0.08)] px-4 py-3 active:scale-[0.99] transition-transform"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -top-8 -right-6 w-24 h-24 rounded-full bg-emerald-500/10 blur-md"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-10 right-12 w-16 h-16 rounded-full bg-emerald-400/10 blur-md"
        />
        <span
          aria-hidden
          className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-gradient-to-b from-emerald-500 to-emerald-700"
        />

        <div className="relative flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-muted font-semibold uppercase tracking-wider">
              กระเป๋าเครดิต
            </p>
            <p className="mt-0.5 flex items-baseline gap-1 leading-none">
              <span className="text-[22px] font-black tracking-tight text-emerald-600">
                {walletText}
              </span>
              <span className="text-[11px] font-bold text-emerald-500/80">บาท</span>
            </p>
            <p className="mt-1 text-[10.5px] text-muted">
              วงเงินคงเหลือ <span className="font-semibold text-foreground">{walletText}</span> บาท
            </p>
          </div>
          <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-600 text-white text-[11px] font-bold px-3 py-1.5 shadow-md shadow-emerald-600/25">
            เติม +
          </span>
        </div>
      </Link>

      {/* ── 3. Sales rep card — sky/blue theme (trust + contact cue) ── */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white via-sky-50/40 to-sky-100/60 border border-sky-100 shadow-[0_6px_20px_rgba(2,132,199,0.08)] px-3 py-2.5 flex items-center gap-3">
        <span
          aria-hidden
          className="pointer-events-none absolute -top-10 -right-8 w-28 h-28 rounded-full bg-sky-500/10 blur-md"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-12 left-16 w-20 h-20 rounded-full bg-sky-400/10 blur-md"
        />
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
              ผู้ดูแล
            </p>
            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[9px] font-bold px-1.5 py-0.5 border border-emerald-100">
              <span className="w-1 h-1 rounded-full bg-emerald-500" />
              ONLINE
            </span>
          </div>
          <p className="text-[14px] font-bold text-foreground truncate leading-tight">
            เซลล์ {salesRep.nickname}
          </p>
          <p className="mt-0.5 text-[11.5px] text-muted font-mono">
            โทร : <span className="text-foreground">{salesRep.tel}</span>
          </p>
        </div>

        {/* "ติดต่อเซลล์" pill — same style family as wallet's "เติม +" so the
            two info cards have matching CTA chips on the right side. */}
        <a
          href={`tel:${salesRep.tel.replace(/[^+0-9]/g, "")}`}
          aria-label={`โทรหา เซลล์ ${salesRep.nickname}`}
          className="relative shrink-0 inline-flex items-center gap-1 rounded-full bg-sky-600 text-white text-[11px] font-bold px-3 py-1.5 shadow-md shadow-sky-600/25 active:scale-95 transition-transform"
        >
          <Phone className="w-3 h-3" fill="currentColor" />
          ติดต่อเซลล์
        </a>
      </section>

      {/* ── 4. Section header — matches homepage OurServices style:
              red dot + uppercase-tracked label, centered on mobile. */}
      <div className="flex items-center justify-center gap-1.5 pt-2 text-red-600 text-[10.5px] font-black tracking-[0.08em] uppercase">
        <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-red-600 shrink-0" />
        บริการของเรา
      </div>

      {/* ── 5. 4-col × 2-row launchpad grid (8 cells; 8th = ออกจากระบบ).
              3D button effect copied from the homepage OurServices cards
              (multi-layer drop-shadows + inset highlight/shadow for a
              "pushed plastic chiclet" look + hover lift). */}
      <section className="grid grid-cols-4 gap-2.5 pt-1 pb-2">
        {LAUNCHPAD.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={LAUNCHPAD_BTN_3D}
          >
            <span className="relative w-11 h-11 shrink-0">
              <Image
                src={item.icon}
                alt={item.label}
                fill
                sizes="44px"
                className="object-contain"
              />
            </span>
            <span className="text-[10.5px] leading-[1.2] text-center font-medium text-foreground line-clamp-2">
              {item.label}
            </span>
          </Link>
        ))}

        <button
          type="button"
          disabled={signOutPending}
          onClick={() => startSignOut(() => { void signOutAction(); })}
          className={`${LAUNCHPAD_BTN_3D} disabled:opacity-60`}
        >
          <span className="relative w-11 h-11 shrink-0">
            <Image
              src={`${ICON_BASE}/pcs-log-out.png`}
              alt="ออกจากระบบ"
              fill
              sizes="44px"
              className="object-contain"
            />
          </span>
          <span className="text-[10.5px] leading-[1.2] text-center font-medium text-foreground line-clamp-2">
            ออกจากระบบ
          </span>
        </button>
      </section>

      {/* ── 6. Bottom banner marquee — infinite horizontal scroll of the
              4 customertheme promo banners (bill / line / drive / shop).
              The strip is duplicated 2× so the `marquee` keyframe (defined
              in app/globals.css §@keyframes marquee: translateX(0→-50%))
              loops seamlessly. Pauses on hover/active for tap accessibility. */}
      <section className="relative overflow-hidden rounded-2xl" aria-label="โปรโมชั่นและบริการ Pacred">
        <div className="flex w-max gap-3 animate-[marquee_28s_linear_infinite] hover:[animation-play-state:paused]">
          {[...BOTTOM_BANNERS, ...BOTTOM_BANNERS].map((b, i) => (
            <Link
              key={`${b.src}-${i}`}
              href={b.href}
              className="shrink-0 w-[280px] block rounded-2xl overflow-hidden shadow-md active:scale-[0.99] transition-transform"
            >
              <Image
                src={b.src}
                alt={b.alt}
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
