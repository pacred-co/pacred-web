/* eslint-disable @next/next/no-img-element */
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { signOutAction } from "@/actions/auth";
import { countText, type PcsChromeData } from "@/lib/legacy/pcs-chrome";
import { SOCIAL } from "@/components/seo/site";

/** Legacy basePath."assets" — the staged Modern-Admin theme bundle. */
const A = "/legacy/pcs/assets";

/** PHP number_format($n, 2). */
function nf2(n: number): string {
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Legacy PCS Cargo customer top navbar — a 1:1 transcription of
 * `member/include/top-menu.php` (the fixed red header bar). The Bootstrap-4
 * markup is verbatim; only the route targets are rebranded to the Pacred
 * (protected) screens. The marketing-site dropdown links point at `#` until
 * ปอน wires the Pacred marketing routes (flagged, non-blocking — the legacy
 * portal links these out to the public CMS pages).
 */
export async function PcsTopMenu({ data }: { data: PcsChromeData }) {
  const t = await getTranslations("pcsTopMenu");
  return (
    <nav
      id="header-navbar"
      className="notranslate header-navbar navbar-expand-lg navbar navbar-with-menu navbar-without-dd-arrow navbar-hide-on-scroll fixed-top navbar-dark bg-gradient-x-danger"
    >
      <div className="navbar-wrapper">
        <div className="navbar-header">
          <ul className="nav navbar-nav flex-row">
            <li className="nav-item mobile-menu d-lg-none d-n-578 mr-auto">
              <a
                className="nav-link nav-menu-main menu-toggle hidden-xs z-index-999"
                href="#"
              >
                <i className="ft-menu font-large-1"></i>
              </a>
            </li>
            <li className="nav-item h-logo d-n-578 mr-auto">
              <Link
                className="navbar-brand z-index-999"
                id="navbar-brand"
                href="/dashboard"
              >
                <img
                  id="brand-logo"
                  className="brand-logo z-index-999"
                  alt="Pacred"
                  src="/images/pacred-logo-red.png"
                />
                <h3 className="brand-text d-n-991 notranslate" id="brand-text">
                  Pacred
                </h3>
              </Link>
            </li>
            <li className="nav-item mr-auto"></li>
            <li className="nav-item d-none d-lg-block nav-toggle">
              <a className="nav-link modern-nav-toggle pr-0" data-toggle="collapse">
                <i
                  className="toggle-icon ft-toggle-right font-medium-3 white"
                  data-ticon="ft-toggle-right"
                ></i>
              </a>
            </li>
            <li className="nav-item d-n-578 d-n-991 d-lg-none">
              <a
                className="nav-link open-navbar-container"
                data-toggle="collapse"
                data-target="#navbar-mobile"
              >
                <i className="la la-ellipsis-v"></i>
              </a>
            </li>
          </ul>
        </div>
        <div className="navbar-container content">
          <div className="container" id="navbar-mobile">
            <div className="row top-bar-s align-items-center">
              <div className="col-md-2 d-n-578">
                <ul className="nav navbar-nav">
                  <li className="nav-item d-n-1199">
                    <a href="#" className="mr-1">
                      <span className="lang-follow-us-on">{t("followUsOn")} </span>
                    </a>
                  </li>
                  {/* Social icons — legacy top-menu.php L34-37 had 3 (Line/FB/YT);
                      Pacred has 5 (added IG + TikTok per owner 2026-05-21). All
                      URLs sourced from `components/seo/site.ts` SOCIAL constant.
                      `mr-1` adds 0.25rem gap between icons — legacy renders gaps
                      via inter-tag whitespace which JSX strips. */}
                  <li className="nav-item">
                    <a href={SOCIAL.line} className="mr-1" target="_blank" rel="noreferrer">
                      <i className="font-18 fab fa-line"></i>
                    </a>
                    <a href={SOCIAL.facebook} className="mr-1" target="_blank" rel="noreferrer">
                      <i className="font-18 fab fa-facebook"></i>
                    </a>
                    <a href={SOCIAL.youtube} className="mr-1" target="_blank" rel="noreferrer">
                      <i className="font-18 fab fa-youtube"></i>
                    </a>
                    <a href={SOCIAL.instagram} className="mr-1" target="_blank" rel="noreferrer">
                      <i className="font-18 fab fa-instagram"></i>
                    </a>
                    <a href={SOCIAL.tiktok} target="_blank" rel="noreferrer">
                      <i className="font-18 fab fa-tiktok"></i>
                    </a>
                  </li>
                </ul>
              </div>
              <div className="col-11 col-md-9">
                <ul className="nav navbar-nav flex-direction-unset float-right">
                  <li className="nav-item d-n-578">
                    <a href="#" className="at">
                      <span className="lang-deposit-rate">{t("depositRate")}</span>{" "}
                      {nf2(data.rsDefault)}
                    </a>
                  </li>
                  <li className="nav-item d-n-578">
                    <a href="#" className="at">
                      &nbsp;Alipay {nf2(data.rpDefault)}
                    </a>
                  </li>
                  <li className="nav-item d-block d-sm-none">
                    <Link href="/" className="at">
                      <span className="menu-home">{t("home")}</span>
                    </Link>
                  </li>
                  <li className="nav-item">
                    <a href="#" className="at">
                      &nbsp;<span className="lang-rate-forwarder">{t("rateForwarder")}</span>
                    </a>
                  </li>
                  <li className="nav-item d-n-578">
                    <a href="#" className="at">
                      &nbsp;<span>{t("promotion")}</span>
                    </a>
                  </li>
                  <li className="dropdown dropdown-user nav-item">
                    <a
                      className="dropdown-toggle nav-link dropdown-user-link at"
                      href="#"
                      data-toggle="dropdown"
                    >
                      <span className="lang-about-us">{t("aboutUs")}</span>{" "}
                      <i className="ft-chevron-down"></i>
                    </a>
                    <div className="dropdown-menu dropdown-menu-right">
                      <a className="dropdown-item" href="#">
                        <span className="lang-about-us">{t("aboutUs")}</span>
                      </a>
                      <a className="dropdown-item" href="#">
                        <span className="lang-our-service">{t("ourService")}</span>
                      </a>
                      <a className="dropdown-item" href="#">
                        <span>{t("faq")}</span>
                      </a>
                      <a className="dropdown-item" href="#">
                        <span className="lang-ch-address">{t("chinaWarehouseAddress")}</span>
                      </a>
                      <a className="dropdown-item" href="#">
                        <span>{t("promotion")}</span>
                      </a>
                      <a className="dropdown-item" href="#">
                        <span>{t("deliveryArea")}</span>
                      </a>
                      <a className="dropdown-item" href="#">
                        <span>{t("howToOrder")}</span>
                      </a>
                      <a className="dropdown-item" href="#">
                        <span>{t("articles")}</span>
                      </a>
                      <a className="dropdown-item" href="#">
                        <span>{t("holidays2025")}</span>
                      </a>
                      <a className="dropdown-item" href="#">
                        <span className="lang-terms-service">{t("termsOfService")}</span>
                      </a>
                      <a className="dropdown-item" href="#">
                        <span className="lang-privacy-policy">{t("privacyPolicy")}</span>
                      </a>
                      <a className="dropdown-item" href="#">
                        <span className="lang-contact-us">{t("contactUs")}</span>
                      </a>
                    </div>
                  </li>
                  <li className="dropdown dropdown-language nav-item">
                    <a
                      className="dropdown-toggle nav-link"
                      id="dropdown-flag"
                      href="#"
                      data-toggle="dropdown"
                      aria-haspopup="true"
                      aria-expanded="false"
                    >
                      <i className="flag-icon flag-icon-th"></i>
                      <span className="selected-language">{t("languageThai")}</span>{" "}
                      <i className="ft-chevron-down"></i>
                    </a>
                    <div className="dropdown-menu" aria-labelledby="dropdown-flag">
                      <a className="dropdown-item" href="#" data-language="en">
                        <i className="flag-icon flag-icon-us"></i> English
                      </a>
                      <a className="dropdown-item" href="#" data-language="ch">
                        <i className="flag-icon flag-icon-ch"></i> Chinese
                      </a>
                      <a className="dropdown-item" href="#" data-language="th">
                        <i className="flag-icon flag-icon-th"></i> {t("languageThai")}
                      </a>
                    </div>
                  </li>
                  <li className="dropdown dropdown-user nav-item">
                    <a
                      className="dropdown-toggle nav-link dropdown-user-link"
                      href="#"
                      data-toggle="dropdown"
                    >
                      <span className="avatar avatar-online">
                        <img src={data.userPicture} alt="" />
                      </span>
                      <span className="user-name">
                        {data.userID} {countText(data.userName, 13)}
                      </span>{" "}
                      <i className="ft-chevron-down"></i>
                    </a>
                    <div className="dropdown-menu dropdown-menu-right">
                      <Link className="dropdown-item" href="/profile">
                        <i className="ft-user"></i>
                        <span className="lang-profile">{t("editProfile")}</span>
                      </Link>
                      <Link className="dropdown-item" href="/account-settings">
                        <i className="ft-clipboard"></i>{" "}
                        <span className="lang-account-settings">{t("accountSettings")}</span>
                      </Link>
                      <div className="dropdown-divider"></div>
                      <form action={signOutAction}>
                        <button type="submit" className="dropdown-item">
                          <i className="ft-power"></i>{" "}
                          <span className="lang-logout">{t("logout")}</span>
                        </button>
                      </form>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
            <div className="row">
              <div className="col-11 col-sm-10">
                <form method="GET" action="/search">
                  <input
                    className="form-control"
                    type="text"
                    name="url"
                    id="input-search"
                    placeholder={t("searchPlaceholder")}
                  />
                  <button className="btn btn-main btn-search-h" type="submit">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="feather feather-search"
                    >
                      <circle cx="11" cy="11" r="8"></circle>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                  </button>
                </form>
                <form
                  encType="multipart/form-data"
                  method="GET"
                  id="myform"
                  action="/search"
                >
                  <label htmlFor="file-upload" className="custom-file-upload">
                    <i className="ft-camera"></i>
                  </label>
                  <input
                    id="file-upload"
                    accept="image/png, image/jpeg"
                    className="upload-images"
                    type="file"
                    name="imagesSearch"
                  />
                  <input id="file-upload2" type="hidden" name="imagesSearch2" />
                </form>
                {data.keywords.length > 0 && (
                  <div className="group-key-pop">
                    {data.keywords.map((kw, i) => (
                      <a
                        key={`${kw}-${i}`}
                        className="at"
                        href={`/search?url=${encodeURIComponent(kw)}`}
                      >
                        {kw}
                      </a>
                    ))}
                  </div>
                )}
              </div>
              <div className="d-n-578 col-2 col-sm-2 dropdown-notification">
                <Link className="nav-link nav-link-label pcs-icon-cart" href="/cart">
                  <i
                    className="ft-shopping-cart"
                    style={{
                      fontSize: "1.6rem",
                      border: "2px solid",
                      borderRadius: "20rem",
                      padding: "5px",
                      color: "#fff",
                    }}
                  ></i>
                  {data.countCart > 0 && (
                    <span
                      className="badge badge-pill badge-danger badge-up badge-glow"
                      style={{ background: "#fff", color: "red" }}
                    >
                      {data.countCart}
                    </span>
                  )}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
