import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { TikTokIcon, InstagramIcon } from "@/components/icons/social-icons";

// Brand SVG icons (inline)
function IconYoutube({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  );
}
function IconFacebook({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  );
}
function IconLine({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 3c-4.97 0-9 3.185-9 7.108 0 2.115 1.155 4.025 3.09 5.303-.234.996-1.127 2.378-1.218 2.518-.088.183.056.36.24.316.593-.14 2.875-.726 4.35-1.928 1.48.566 3.14.898 4.908.898 4.97 0 9-3.184 9-7.107S16.97 3 12 3z"/>
    </svg>
  );
}

const LINE_URL = "/line";
const YOUTUBE_URL = "https://www.youtube.com/@PacredShipping";
const FACEBOOK_URL = "https://www.facebook.com/PacredShippingCustomsClearanceImportExport/";
const TIKTOK_URL = "https://www.tiktok.com/@pacred.co";
const INSTAGRAM_URL = "https://www.instagram.com/pacred.co/";

const PARTNERS = [
  { file: "upspartner.png",         url: "https://www.ups.com/th" },
  { file: "fedexpartner.png",       url: "https://www.fedex.com/th" },
  { file: "coscopartner.png",       url: "https://lines.coscoshipping.com" },
  { file: "alibabapartner.png",     url: "https://www.alibaba.com" },
  { file: "dhlpartner.png",         url: "https://www.dhl.com/th" },
  { file: "tntpartner.png",         url: "https://www.tnt.com" },
  { file: "maerskpartner.png",      url: "https://www.maersk.com" },
  { file: "tmallpartner.png",       url: "https://www.tmall.com" },
  { file: "taobaopartner.png",      url: "https://world.taobao.com" },
  { file: "bkp.png",                url: "https://www.bkp.co.th" },
  { file: "patpartner.png",         url: "https://www.port.co.th" },
  { file: "aotpartner.png",         url: "https://www.airportthai.co.th" },
  { file: "thaicargo.png",          url: "https://www.thaicargo.com" },
  { file: "bfs.png",                url: "https://www.bfs.co.th" },
  { file: "etracking.png",          url: "https://e-tracking.customs.go.th" },
  { file: "laemchabangpartner.png", url: "https://www.port.co.th" },
];

export function Footer() {
  const t = useTranslations("footerNew");

  const contactLinks = [
    { label: t("contactCustomer"), href: "/contact" },
    { label: t("contactServices"), href: "/services" },
    { label: t("contactWhCn"),     href: "/warehouses/china" },
    { label: t("contactWhTh"),     href: "/warehouses/thailand" },
  ];

  const aboutLinks = [
    { label: t("aboutPacred"),    href: "/about" },
    { label: t("aboutKnowledge"), href: "/knowledge" },
    { label: t("aboutFaq"),       href: "/faq" },
    { label: t("aboutJoin"),      href: "/register" },
    { label: t("aboutTerms"),     href: "/terms" },
    { label: t("aboutPrivacy"),   href: "/privacy" },
    { label: t("aboutDelivery"),  href: "/delivery-areas" },
    { label: t("aboutHolidays"),  href: "/holidays" },
    { label: t("aboutStatus"),    href: "/status" },
  ];

  const serviceLinks = [
    { label: t("svcFcl"),     href: "/services/import-china-fcl" },
    { label: t("svcLcl"),     href: "/services/import-china-lcl" },
    { label: t("svcExport"),  href: "/services/export-worldwide" },
    { label: t("svcCustoms"), href: "/customs-clearance-shipping-suvarnabhumi" },
    { label: t("svcShop"),    href: "/services/china-shopping" },
  ];

  return (
    <footer id="contact" className="bg-white dark:bg-surface border-t border-border">
      <div className="mx-auto w-full max-w-[1140px] px-[16px] md:px-[20px]">

        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 md:gap-8 py-6 md:py-14">

          {/* Col 1 — Contact */}
          <div className="md:col-span-3">
            <h3 className="text-[15px] md:text-[22px] font-black text-[#111827] dark:text-white mb-2.5 md:mb-5 tracking-tight">
              {t("contactHeading1")}<span className="text-primary-600">{t("contactHeading2")}</span>
            </h3>
            <nav className="flex overflow-x-auto md:flex-col gap-2 md:gap-2.5 mb-4 pb-1 md:pb-0 -mx-4 px-4 md:mx-0 md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {contactLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="shrink-0 md:shrink whitespace-nowrap md:whitespace-normal text-[12px] md:text-[14px] text-muted hover:text-primary-600 transition-colors px-2.5 md:px-0 py-1 md:py-0 rounded-full md:rounded-none bg-surface md:bg-transparent border border-border md:border-0 w-fit"
                >
                  {l.label}
                </Link>
              ))}
            </nav>

            {/* Social icons */}
            <div className="flex items-center gap-2 mb-5">
              <a
                href={YOUTUBE_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="YouTube"
                className="w-9 h-9 rounded-full bg-[#111827] dark:bg-white/10 text-white flex items-center justify-center hover:bg-primary-600 transition-colors"
              >
                <IconYoutube className="w-[18px] h-[18px]" />
              </a>
              <a
                href={FACEBOOK_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook"
                className="w-9 h-9 rounded-full bg-[#111827] dark:bg-white/10 text-white flex items-center justify-center hover:bg-primary-600 transition-colors"
              >
                <IconFacebook className="w-[18px] h-[18px]" />
              </a>
              <a
                href={LINE_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LINE"
                className="w-9 h-9 rounded-full bg-[#111827] dark:bg-white/10 text-white flex items-center justify-center hover:bg-primary-600 transition-colors"
              >
                <IconLine className="w-[18px] h-[18px]" />
              </a>
              <a
                href={TIKTOK_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="TikTok"
                className="w-9 h-9 rounded-full bg-[#111827] dark:bg-white/10 text-white flex items-center justify-center hover:bg-primary-600 transition-colors"
              >
                <TikTokIcon className="w-[18px] h-[18px]" />
              </a>
              <a
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="w-9 h-9 rounded-full bg-[#111827] dark:bg-white/10 text-white flex items-center justify-center hover:bg-primary-600 transition-colors"
              >
                <InstagramIcon className="w-[18px] h-[18px]" />
              </a>
            </div>

            {/* QR code */}
            <a
              href={LINE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block group"
            >
              <div className="relative w-[100px] h-[100px] bg-white border border-border rounded-lg p-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] group-hover:shadow-[0_6px_18px_rgba(179,0,0,0.15)] group-hover:border-primary-300 transition-all">
                <Image
                  src="/images/contact/L_gainfriends_2dbarcodes_BW.png"
                  alt={t("qrAlt")}
                  fill
                  className="object-contain p-1"
                />
              </div>
              <p className="mt-2 text-[11px] font-black text-[#111827] dark:text-white text-center tracking-wider">
                066-131-0253
              </p>
            </a>
          </div>

          {/* Col 2 — About */}
          <div className="md:col-span-3">
            <h3 className="text-[15px] md:text-[22px] font-black text-[#111827] dark:text-white mb-2.5 md:mb-5 tracking-tight">
              {t("aboutHeading1")}<span className="text-primary-600">{t("aboutHeading2")}</span>
            </h3>
            <nav className="flex overflow-x-auto md:flex-col gap-2 md:gap-2.5 pb-1 md:pb-0 -mx-4 px-4 md:mx-0 md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {aboutLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="shrink-0 md:shrink whitespace-nowrap md:whitespace-normal text-[12px] md:text-[14px] text-muted hover:text-primary-600 transition-colors px-2.5 md:px-0 py-1 md:py-0 rounded-full md:rounded-none bg-surface md:bg-transparent border border-border md:border-0 w-fit"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Col 3 — Services */}
          <div className="md:col-span-2">
            <h3 className="text-[15px] md:text-[22px] font-black text-[#111827] dark:text-white mb-2.5 md:mb-5 tracking-tight">
              {t("serviceHeading1")}<span className="text-primary-600">{t("serviceHeading2")}</span>
            </h3>
            <nav className="flex overflow-x-auto md:flex-col gap-2 md:gap-2.5 pb-1 md:pb-0 -mx-4 px-4 md:mx-0 md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {serviceLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="shrink-0 md:shrink whitespace-nowrap md:whitespace-normal text-[12px] md:text-[14px] text-muted hover:text-primary-600 transition-colors px-2.5 md:px-0 py-1 md:py-0 rounded-full md:rounded-none bg-surface md:bg-transparent border border-border md:border-0 w-fit"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Col 4 — Partners */}
          <div className="md:col-span-4">
            <h3 className="text-[15px] md:text-[22px] font-black text-[#111827] dark:text-white mb-2.5 md:mb-5 tracking-tight">
              {t("partnerHeading1")}<span className="text-primary-600">{t("partnerHeading2")}</span>
            </h3>
            <div className="grid grid-cols-4 gap-3 md:gap-4">
              {PARTNERS.map((p) => (
                <a
                  key={p.file}
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center h-10 md:h-12 grayscale opacity-60 hover:grayscale-0 hover:opacity-100 hover:scale-110 transition-all duration-300"
                >
                  <Image
                    src={`/images/partners/${p.file}`}
                    alt=""
                    width={80}
                    height={36}
                    className="max-h-full max-w-full object-contain"
                  />
                </a>
              ))}
            </div>
          </div>

        </div>

        {/* Bottom copyright */}
        <div className="border-t border-border py-5 text-center text-[11.5px] md:text-[12.5px] text-muted leading-relaxed">
          <p>{t("copyright")}</p>
          <p>
            {t("operator")}{" "}
            <span className="font-black text-[#111827] dark:text-white">Pacred CO., LTD.</span>
          </p>
        </div>

      </div>
    </footer>
  );
}
