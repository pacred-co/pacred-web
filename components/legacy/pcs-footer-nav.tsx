/* eslint-disable @next/next/no-img-element */
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { PcsChromeData } from "@/lib/legacy/pcs-chrome";

/** Legacy basePath."assets" — the staged Modern-Admin theme bundle. */
const A = "/legacy/pcs/assets";

/** member/include/function.php L368-375 — badgeMenuFooter(): the small red
 *  pill, with the footer-position modifier class. */
function FooterBadge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <div className="pcs-sm-badge badge-danger pcs-sm-badge-pill pcs-badge-footer">
      {n}
    </div>
  );
}

/**
 * Legacy PCS Cargo footer + mobile bottom-nav + desktop right-rail — a 1:1
 * transcription of `member/include/all-script.php` L1-82.
 *
 *  - `nav-footer-pcs` is the mobile experience: a fixed bottom bar the legacy
 *    responsive CSS reveals below the tablet breakpoint.
 *  - `nav-right-pcs` is the desktop right quick-rail.
 *
 * The legacy `!login && !register` guard is always true inside (protected)
 * (every screen here is a signed-in portal page), so both always render.
 */
export async function PcsFooterNav({ data }: { data: PcsChromeData }) {
  const t = await getTranslations("pcsFooterNav");
  const year = new Date().getFullYear();

  return (
    <>
      <div className="sidenav-overlay"></div>
      <div className="drag-target"></div>
      <div id="google_translate_element2"></div>
      {/* Legacy `all-script.php` L6-8 had a "Copyright © PCS Cargo" footer
          here. Owner directive (2026-05-21): customer back-office + admin
          NEVER show a footer — removed verbatim. (The legacy mobile bottom-
          nav `.nav-footer-pcs` + desktop right-rail `.nav-right-pcs` BELOW
          are kept — those are navigation, not footers.) */}
      {void year}
      <nav className="nav-footer-pcs notranslate">
        <Link href="/" className="nav__link">
          <img
            src={`${A}/images/icon/pcs-home.png`}
            className="pcs-icon2"
            alt=""
          />
          <span className="nav__text">
            <span className="menu-home">{t("home")}</span>
          </span>
        </Link>
        <Link href="/service-order?q=2" className="nav__link">
          <img
            src={`${A}/images/icon/pcs-payment.png`}
            className="pcs-icon2"
            alt=""
          />
          <span className="nav__text lang-shop-pay2">{t("payGoods")} </span>
          <FooterBadge n={data.countShops2} />
        </Link>
        <Link href="/service-import?q=5" className="nav__link">
          <img
            src={`${A}/images/icon/pcs-forwarder-pay.png`}
            className="pcs-icon2"
            alt=""
          />
          <span className="nav__text lang-forwarder-pay2">{t("payShipping")} </span>
          <FooterBadge n={data.countForwarder5} />
        </Link>
        <Link href="/cart" className="nav__link">
          <img
            src={`${A}/images/icon/pcs-cart.png`}
            className="pcs-icon2"
            alt=""
          />
          <span className="nav__text lang-cart">{t("cart")}</span>
          <FooterBadge n={data.countCart} />
        </Link>
        <a
          href="https://lin.ee/Yg3fU0I"
          target="_blank"
          rel="noreferrer"
          className="nav__link"
        >
          <img
            src={`${A}/images/icon/pcs-call-center.png`}
            className="pcs-icon2"
            alt=""
          />
          <span className="nav__text lang-chat">{t("chat")}</span>
        </a>
        <Link href="/dashboard" className="nav__link">
          <i className="ft-menu font-large-1"></i>
          <span className="nav__text lang-menu">{t("menu")}</span>
        </Link>
      </nav>
      {/* Desktop right rail (`.nav-right-pcs`) removed per ปอน 2026-05-24 —
          <FloatingTabs /> from the marketing site (rendered globally by
          app/[locale]/layout.tsx) already covers the desktop right side with
          identical styling, and ปอน wants it to be that exact public
          component (no duplicate / no legacy variant). */}
      {/* END: Footer */}
    </>
  );
}
