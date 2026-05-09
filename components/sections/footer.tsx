import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function Footer() {
  const t = useTranslations("footer");

  const quickLinks = [
    { href: "/", label: t("home") },
    { href: "#service", label: t("service") },
    { href: "#promotion", label: t("promotion") },
    { href: "#blog", label: t("blog") },
    { href: "#contact", label: t("contact") },
  ];

  return (
    <footer id="contact" className="bg-background border-t border-border">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* Main — 70/30 split */}
        <div className="flex gap-10 py-12">

          {/* Left 70% — Brand + Quick Links + Contact */}
          <div className="w-[70%] grid grid-cols-3 gap-10">
            {/* Brand */}
            <div className="flex flex-col gap-4">
              <Link href="/" className="text-xl font-bold text-primary-500">
                Pacred
              </Link>
              <p className="text-sm leading-relaxed text-muted">{t("tagline")}</p>
              <div className="flex gap-3">
                {["facebook", "twitter", "instagram", "linkedin"].map((social) => (
                  <a
                    key={social}
                    href="#"
                    aria-label={social}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-muted hover:border-primary-300 hover:text-primary-500 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 8v8M8 12h8" />
                    </svg>
                  </a>
                ))}
              </div>
            </div>

            {/* Quick links */}
            <div className="flex flex-col gap-4">
              <h3 className="text-sm font-semibold">{t("quickLinks")}</h3>
              <nav className="flex flex-col gap-2">
                {quickLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="text-sm text-muted hover:text-primary-500 transition-colors"
                  >
                    {link.label}
                  </a>
                ))}
              </nav>
            </div>

            {/* Contact */}
            <div className="flex flex-col gap-4">
              <h3 className="text-sm font-semibold">{t("contactTitle")}</h3>
              <div className="flex flex-col gap-2">
                {[
                  { icon: "📍", text: t("address") },
                  { icon: "📞", text: t("phone") },
                  { icon: "✉️", text: t("email") },
                ].map(({ icon, text }) => (
                  <p key={text} className="flex items-start gap-2 text-sm text-muted">
                    <span>{icon}</span>
                    <span>{text}</span>
                  </p>
                ))}
              </div>
            </div>
          </div>

          {/* Right 30% — Partner */}
          <div className="w-[30%] flex flex-col gap-4">
            <h3 className="text-sm font-semibold">{t("followUs")}</h3>
            <div className="rounded-xl border border-dashed border-border flex-1 flex items-center justify-center text-sm text-muted">
              Partner
            </div>
          </div>

        </div>

        {/* Bottom bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border py-5 text-xs text-muted">
          <span>{t("copyright")}</span>
          <div className="flex gap-4">
            <a href="#" className="hover:text-primary-500 transition-colors">{t("privacy")}</a>
            <a href="#" className="hover:text-primary-500 transition-colors">{t("terms")}</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
