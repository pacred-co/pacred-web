"use client";

import { useState, useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import Image from "next/image";
import { Phone, Menu } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Link } from "@/i18n/navigation";
import { LineIcon } from "@/components/icons/social-icons";
import { TrackedExternalLink } from "@/components/analytics/tracked-link";
import { SOCIAL } from "@/components/seo/site";
import { createClient } from "@/lib/supabase/client";
import { trackSignOut } from "@/lib/analytics";

const MOBILE_ICON = {
  home:    "/images/home/iconfloating/pacred-home-main.png",
  blog:    "/images/home/iconfloating/checklistred.png",
  news:    "/images/home/iconfloating/pcs-line-notify.png",
  logout:  "/images/home/iconfloating/pcs-log-out.png", // also used flipped for login
} as const;

// Pacred main office line — single number for mobile FAB (per ปอน 2026-05-22,
// no random sales-rep rotation).
const OFFICE_PHONE = "0661310253";

/** Module-level memo of the last fetched payment-due count, so the badge does
 *  NOT flash to 0 when FloatingTabs remounts crossing the (public)↔(protected)
 *  layout boundary (a different layout group = a fresh mount). Seeded into the
 *  initial state below. */
let lastKnownPayDue = 0;

/** Circular red count pill over a tab icon — "ค้างกี่รายการ" on the ชำระ tab.
 *  Renders nothing when the count is 0 (or on public pages where it's unset). */
function TabCountBadge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="absolute -top-1.5 -right-2 grid min-w-[18px] h-[18px] place-items-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-none text-white ring-2 ring-white dark:ring-surface shadow-sm">
      {n > 99 ? "99+" : n}
    </span>
  );
}

export function FloatingTabs({
  payDueCount = 0,
  avatarUrl = null,
  hideLineBubble = false,
}: {
  payDueCount?: number;
  /** Logged-in member's avatar — shown round (Facebook-style) on the เมนู tab
   *  instead of the hamburger icon. Null on public pages → falls back to Menu. */
  avatarUrl?: string | null;
  /** Hide the standalone floating green LINE bubble. The customer back-office
   *  (the (protected) member portal) passes this so the bubble only appears on
   *  the public site / home page (ปอน 2026-06-08 "เข้าหลังบ้านลูกค้าให้ปุ่มนี้
   *  หาย แต่หน้าแรก/ท่องเว็บให้มีไว้"). The แชท tab in the rail/bottom-nav
   *  stays — only the separate bubble is gated. */
  hideLineBubble?: boolean;
}) {
  const t = useTranslations("floatingTabs");
  const locale = useLocale();
  const [active, setActive] = useState<number | null>(null);
  const [chatOpen, setChatOpen] = useState(false); // the "แชทกับเรา" FAB expand state
  const [user, setUser] = useState<User | null>(null);
  // Live "ชำระ" badge count. Seeded from the SSR prop (protected layout) or the
  // last-known value (avoids a 0-flash on remount), then refreshed client-side.
  const [payDue, setPayDue] = useState(() => payDueCount || lastKnownPayDue);
  const pathname = usePathname();

  // Watch auth state for the mobile login/logout tab — per ปอน 2026-05-18,
  // the right-of-FAB slot flips between "ล็อคอิน" and "ล็อคเอาท์".
  //
  // Use getSession() (local-only read) instead of getUser() to avoid the
  // SDK's auto-refresh path firing an "Invalid Refresh Token: Refresh
  // Token Not Found" AuthApiError into the dev console when the cookie
  // jar gets stale. The auth state change listener below picks up the
  // real session live so we don't miss sign-in / sign-out events.
  // Authoritative auth still happens server-side.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth
      .getSession()
      .then(({ data }) => setUser(data.session?.user ?? null))
      .catch(() => setUser(null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Live payment-due count for the "ชำระ" badge — fetched client-side so the
  // number appears on EVERY page (incl. the public site, not just where the
  // protected layout seeds it) and stays real-time. Re-fetched on navigation
  // (pathname), on login / logout (user), and when the tab regains focus; the
  // endpoint returns 0 for signed-out / no-member users so the badge clears.
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch("/api/payment-due-count", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (cancelled || !d) return;
          const n = Number(d.count ?? 0);
          lastKnownPayDue = n;
          setPayDue(n);
        })
        .catch(() => {
          /* network blip — keep the last known count */
        });
    };
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [pathname, user]);

  // Don't render in admin back-office (admin has its own sidebar) or on the
  // auth flow (login/register/forgot-password) — auth pages are designed to
  // fit one viewport, so the bottom nav + its 64px body-padding clearance
  // both need to go away. Pattern matches `/<route>` AND `/<locale>/<route>`.
  // Per ภูม + เดฟ confirm 2026-05-16 evening; auth-hide per ปอน 2026-05-19.
  // `/r/<token>` = the login-free public RECEIPT page (a money document). It
  // has its own "จัดการเอกสาร" toolbar (incl. its own mobile bottom bar), and
  // the marketing CTA / LINE bubble would clutter a tax doc + collide with that
  // bar — so the floating tabs are hidden there too (same treatment as /admin).
  const isHidden =
    !!pathname &&
    (/^(?:\/[a-z]{2})?\/admin(?:\/|$)/.test(pathname) ||
      /^(?:\/[a-z]{2})?\/r\/[^/]+$/.test(pathname) ||
      /^(?:\/[a-z]{2})?\/(?:login|register|forgot-password)(?:\/|$)/.test(pathname));

  // Hide just the "เมนู" tab on the mobile launchpad (/m/dashboard) — the
  // tab links to /m/dashboard so it's a no-op when the user is already
  // there. We render it as an invisible placeholder so the bottom-nav grid
  // template stays balanced (3 tabs · FAB · 3 tabs) and the centre FAB
  // remains centred. Per ปอน 2026-05-27 ("ในมือถือหน้าเมนู ผมไม่อยากให้มี …
  // แต่หน้าอื่นเหลือไว้เหมือนเดิม").
  const isOnMobileLaunchpad =
    !!pathname && /^(?:\/[a-z]{2})?\/m\/dashboard(?:\/|$)/.test(pathname);

  // Toggle a body class so globals.css can drop the bottom-padding clearance.
  useEffect(() => {
    if (!isHidden) return;
    document.body.classList.add("no-bottom-tabs");
    return () => document.body.classList.remove("no-bottom-tabs");
  }, [isHidden]);

  if (isHidden) return null;

  // Desktop floating tabs mirror the mobile bottom-nav set MINUS the centre
  // call-FAB AND the "บริการ" tab — ปอน 2026-05-24 dropped "บริการ" on
  // desktop because the top NavBar already exposes the service mega-menu.
  // Mobile keeps it (the bottom nav doesn't carry the desktop NavBar).
  const desktopTabs: Array<{
    label: string;
    href: string;
    iconImg?: string;
    iconNode?: ReactNode;
    external?: boolean;
    badge?: number;
  }> = [
    { label: t("homeMain"), iconImg: "/images/home/iconfloating/pacred-home-main.png", href: "/" },
    // "บุ๊กกิ้ง" — TEMPORARILY routes to LINE OA (external) instead of /booking:
    // the booking page isn't opened to public traffic yet (owner 2026-06-12
    // "กดแล้วไปโผล่ไลน์เฉยๆ"). To re-enable the BookingCalculator page later,
    // set href back to "/booking" and drop `external`. Icon = bookingPacred.png
    // (owner-supplied · rendered grayscale→color like the other image tabs).
    { label: t("booking"),  iconImg: "/images/hero-section/icon-draf/bookingPacred.png", href: "/line", external: true },
    { label: t("orders"),   iconImg: "/images/home/iconfloating/pcs-cart.png",         href: "/service-order" },
    { label: t("pay"),      iconImg: "/images/home/iconfloating/pcs-payment.png",      href: "/payment-due", badge: payDue },
    { label: t("chat"),     iconImg: "/images/home/iconfloating/pcs-line-notify.png",  href: "/line", external: true },
    { label: t("menu"),     iconNode: <Menu className="w-8 h-8" strokeWidth={2.2} />,  href: "/dashboard" },
  ];

  return (
    <>
      {/* Vertical floating tabs — right center (desktop only) */}
      <div className="hidden md:flex print:hidden fixed right-0 top-1/2 -translate-y-1/2 z-50 flex-col shadow-xl">
        {desktopTabs.map((item, i) => {
          const isAnchor = item.href.startsWith("#");
          const cls = "group w-[64px] xl:w-[72px] py-3 bg-white dark:bg-surface border border-border flex flex-col items-center justify-center gap-1.5 text-[11px] font-medium text-muted hover:text-foreground transition-colors first:rounded-tl-xl last:rounded-bl-xl";
          const inner = (
            <>
              {item.iconImg && (
                <span className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.iconImg}
                    alt={item.label}
                    className={`w-8 h-8 object-contain transition-all duration-300 ${
                      active === i
                        ? "grayscale-0 brightness-100 opacity-100"
                        : "grayscale brightness-75 opacity-60 group-hover:grayscale-0 group-hover:brightness-100 group-hover:opacity-100"
                    }`}
                  />
                  {item.badge != null && <TabCountBadge n={item.badge} />}
                </span>
              )}
              {item.iconNode && (
                <span
                  className={`transition-all duration-300 ${
                    active === i
                      ? "text-primary-600 opacity-100"
                      : "text-muted opacity-60 group-hover:text-foreground group-hover:opacity-100"
                  }`}
                >
                  {item.iconNode}
                </span>
              )}
              <span className="text-center leading-tight">{item.label}</span>
            </>
          );
          if (isAnchor) {
            return (
              <a key={i} href={item.href} onClick={() => setActive(i)} className={cls}>
                {inner}
              </a>
            );
          }
          if (item.external) {
            return (
              <a
                key={i}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setActive(i)}
                className={cls}
              >
                {inner}
              </a>
            );
          }
          return (
            <Link key={i} href={item.href} onClick={() => setActive(i)} className={cls}>
              {inner}
            </Link>
          );
        })}
      </div>

      {/* Bottom navigation bar (mobile only)
          Layout: [หน้าแรก] [บริการ] [ออเดอร์] [📞 FAB] [ชำระ] [แชท] [เมนู]
          3 tabs | FAB | 3 tabs — per ปอน 2026-05-22 redesign */}
      <nav
        className="md:hidden print:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-surface/95 backdrop-blur-md border-t border-border shadow-[0_-4px_15px_rgba(0,0,0,0.06)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/*
          Separate the tab row into its own `relative` wrapper so the FAB uses
          `top-1/2` of the *content row only*, not the full nav height which
          includes safe-area padding — that was causing the FAB to be cut off.
        */}
        <div className="relative">
          <div className="grid grid-cols-[1fr_1fr_1fr_96px_1fr_1fr_1fr]">

            {/* 1 — หน้าแรก */}
            <Link href="/" onClick={() => setActive(0)}
              className="group flex flex-col items-center justify-center gap-1 pt-2 pb-4 transition-colors active:bg-primary-50/60">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/home/iconfloating/pacred-home-main.png" alt={t("homeMain")}
                className={`w-8 h-8 object-contain transition-all duration-300 ${active === 0 ? "grayscale-0 brightness-100 opacity-100 scale-110" : "grayscale brightness-75 opacity-75"}`} />
              <span className={`text-[11px] leading-tight font-medium ${active === 0 ? "text-primary-600 font-bold" : "text-muted"}`}>{t("homeMain")}</span>
            </Link>

            {/* 2 — บุ๊กกิ้ง → LINE OA (booking page ยังไม่เปิด public · mirror
                เดสก์ท็อป tab). เดิมช่องนี้คือ "บริการ" ที่เปิด bottom-sheet เมนู —
                ปอน ย้าย trigger บริการไปไว้บน NavBar (มือถือ) แล้ว */}
            <a href="/line" target="_blank" rel="noopener noreferrer" onClick={() => setActive(1)}
              className="group flex flex-col items-center justify-center gap-1 pt-2 pb-4 transition-colors active:bg-primary-50/60">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/hero-section/icon-draf/bookingPacred.png" alt={t("booking")}
                className={`w-8 h-8 object-contain transition-all duration-300 ${active === 1 ? "grayscale-0 brightness-100 opacity-100 scale-110" : "grayscale brightness-75 opacity-75"}`} />
              <span className={`text-[11px] leading-tight font-medium ${active === 1 ? "text-primary-600 font-bold" : "text-muted"}`}>{t("booking")}</span>
            </a>

            {/* 3 — ออเดอร์ → customer dashboard */}
            <Link href="/dashboard" onClick={() => setActive(2)}
              className="group flex flex-col items-center justify-center gap-1 pt-2 pb-4 transition-colors active:bg-primary-50/60">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/home/iconfloating/pcs-cart.png" alt={t("orders")}
                className={`w-8 h-8 object-contain transition-all duration-300 ${active === 2 ? "grayscale-0 brightness-100 opacity-100 scale-110" : "grayscale brightness-75 opacity-75"}`} />
              <span className={`text-[11px] leading-tight font-medium ${active === 2 ? "text-primary-600 font-bold" : "text-muted"}`}>{t("orders")}</span>
            </Link>

            {/* Spacer — FAB sits here, positioned on the relative wrapper above */}
            <div aria-hidden />

            {/* 4 — ชำระ → รายการที่ต้องชำระ (cross-service payment-due list) */}
            <Link href="/payment-due" onClick={() => setActive(3)}
              className="group flex flex-col items-center justify-center gap-1 pt-2 pb-4 transition-colors active:bg-primary-50/60">
              <span className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/home/iconfloating/pcs-payment.png" alt={t("pay")}
                  className={`w-8 h-8 object-contain transition-all duration-300 ${active === 3 ? "grayscale-0 brightness-100 opacity-100 scale-110" : "grayscale brightness-75 opacity-75"}`} />
                <TabCountBadge n={payDue} />
              </span>
              <span className={`text-[11px] leading-tight font-medium ${active === 3 ? "text-primary-600 font-bold" : "text-muted"}`}>{t("pay")}</span>
            </Link>

            {/* 5 — แชท LINE */}
            <a href="/line" target="_blank" rel="noopener noreferrer" onClick={() => setActive(4)}
              className="group flex flex-col items-center justify-center gap-1 pt-2 pb-4 transition-colors active:bg-primary-50/60">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/home/iconfloating/pcs-line-notify.png" alt={t("chat")}
                className={`w-8 h-8 object-contain transition-all duration-300 ${active === 4 ? "grayscale-0 brightness-100 opacity-100 scale-110" : "grayscale brightness-75 opacity-75"}`} />
              <span className={`text-[11px] leading-tight font-medium ${active === 4 ? "text-primary-600 font-bold" : "text-muted"}`}>{t("chat")}</span>
            </a>

            {/* 6 — เมนู (อวตาร) → หน้าโปรไฟล์ /profile (Facebook-style: the
                avatar tab always opens the member's profile when logged in —
                ปอน 2026-07-02 "ให้เมนูเป็นหน้าโปรไฟล์ตลอดถ้า log in"). /profile
                is auth-guarded (requireAuth → /login for guests), so a
                signed-out tap lands on login. Was /m/dashboard (a no-op refresh
                when already on the launchpad); /profile is a real destination
                from every page, incl. /m/dashboard itself. */}
            <Link href="/profile" onClick={() => setActive(5)}
              className="group flex flex-col items-center justify-center gap-1 pt-2 pb-4 transition-colors active:bg-primary-50/60">
              {avatarUrl ? (
                <span
                  className={`relative w-8 h-8 shrink-0 overflow-hidden rounded-full border-2 transition-all duration-300 ${active === 5 ? "border-primary-600 scale-110" : "border-transparent opacity-90"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                </span>
              ) : (
                <Menu className={`w-8 h-8 transition-all duration-300 ${active === 5 ? "text-primary-600 scale-110" : "text-muted opacity-75"}`} strokeWidth={2.2} />
              )}
              <span className={`text-[11px] leading-tight font-medium ${active === 5 ? "text-primary-600 font-bold" : "text-muted"}`}>{t("menu")}</span>
            </Link>

          </div>

          {/* Center call FAB — bottom-[10px] pushes it 20px above the nav border
              (row ~66px, FAB 76px → 10+76-66 = 20px protrusion) */}
          <a href={`tel:${OFFICE_PHONE}`} aria-label={t("callAria")}
            className="absolute left-1/2 -translate-x-1/2 bottom-[10px] w-[76px] h-[76px] rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-lg shadow-primary-600/35 ring-2 ring-white/40 dark:ring-primary-300/30 flex items-center justify-center active:scale-95 transition-transform">
            <span aria-hidden className="absolute -inset-1 rounded-full bg-primary-500/30 blur-[5px] animate-pulse [animation-duration:1.8s]" />
            <span aria-hidden className="absolute inset-0 rounded-full ring-2 ring-primary-200/50 dark:ring-primary-300/40 animate-pulse [animation-duration:1.8s] [animation-delay:0.45s]" />
            <Phone className="relative w-7 h-7" strokeWidth={2.4} fill="currentColor" />
          </a>
        </div>
      </nav>

      {/* Floating LINE bubble — sits above mobile bottom nav.
          ·  `pacred-line-bubble` is a CSS hook: globals.css lifts it via
             `body.has-import-paybar` so it clears the /service-import
             sticky pay-bar (declutters the bottom-right pile-up — BUG #1).
          ·  z-[48] keeps it BELOW the pay-bar (z-[55]) so it can never
             steal the "ชำระเงิน" tap (BUG #2), while still floating above
             page content + the bottom-nav border.
          ·  The "สอบถามเพิ่มเติม" pill is desktop-only (`md:block`) — on
             phones it was extra clutter beside the rail + nav + bubble.
          ·  Gated off in the customer back-office via `hideLineBubble`
             (shown only on the public site / home page). */}
      {!hideLineBubble && (
        <div className="pacred-line-bubble group print:hidden fixed bottom-[84px] right-3 z-[48] md:bottom-6 md:right-6">
          {/* LINE + Messenger — fan out above on hover (desktop) / tap (mobile).
              `pb-3` (not mb-3) keeps a hover BRIDGE: the panel box touches the main
              button so moving the mouse up into LINE/Messenger never crosses a dead
              gap that would collapse the group-hover. */}
          <div
            className={`absolute bottom-full right-0 flex flex-col items-end gap-2.5 pb-3 transition-all duration-300 md:group-hover:pointer-events-auto md:group-hover:translate-y-0 md:group-hover:opacity-100 ${
              chatOpen ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
            }`}
          >
            <TrackedExternalLink
              href="/line"
              cta="line_consult"
              surface="floating_tabs"
              suppressHydrationWarning
              aria-label={t("chatAria")}
              className="flex items-center gap-2"
            >
              <span className="rounded-full border border-border bg-white px-3 py-1 text-[13px] font-black text-foreground shadow-md dark:bg-surface dark:text-white">LINE</span>
              <span className="grid h-12 w-12 place-items-center rounded-full bg-[#06C755] text-white shadow-lg ring-2 ring-white transition-transform hover:scale-105 md:h-[52px] md:w-[52px]">
                <LineIcon className="h-6 w-6 md:h-7 md:w-7" />
              </span>
            </TrackedExternalLink>
            <TrackedExternalLink
              href={SOCIAL.messenger}
              cta="messenger"
              surface="floating_tabs"
              suppressHydrationWarning
              aria-label="แชทผ่าน Messenger"
              className="flex items-center gap-2"
            >
              <span className="rounded-full border border-border bg-white px-3 py-1 text-[13px] font-black text-foreground shadow-md dark:bg-surface dark:text-white">Messenger</span>
              <span className="grid h-12 w-12 place-items-center transition-transform hover:scale-105 md:h-[52px] md:w-[52px]">
                <Image src="/images/mainpage/messenger.png" alt="" width={52} height={52} className="h-full w-full object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.22)]" />
              </span>
            </TrackedExternalLink>
          </div>

          {/* Main "แชทกับเรา" button — toggles the fan-out (desktop also opens on hover) */}
          <button
            type="button"
            onClick={() => setChatOpen((o) => !o)}
            aria-label={t("chatAria")}
            aria-expanded={chatOpen}
            suppressHydrationWarning
            className="block h-[60px] w-[60px] transition-transform duration-300 hover:scale-105 active:scale-95 md:h-[82px] md:w-[82px]"
          >
            {/* Full image — already a circular "แชทกับเรา" graphic; show it whole
                (object-contain) so the bottom banner isn't cropped. drop-shadow
                follows the circle's alpha, not a square box. */}
            <Image
              src={locale === "en" ? "/images/mainpage/chat-with-us-en.png" : "/images/mainpage/chat-with-us01.png"}
              alt={t("chatAria")}
              width={82}
              height={82}
              className="h-full w-full object-contain drop-shadow-[0_5px_14px_rgba(0,0,0,0.28)]"
            />
          </button>
        </div>
      )}
    </>
  );
}
