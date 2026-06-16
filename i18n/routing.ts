import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["th", "en"],
  defaultLocale: "th",
  localePrefix: "as-needed",
  // First-time visitors are forced to TH regardless of browser Accept-Language.
  // After they switch to /en manually, the cookie remembers that choice.
  localeDetection: false,
});

// Localized URL segments for the public portfolio ("our work"): Thai users
// see /ผลงานของเรา/..., English keeps /our-work/... . These pathnames live
// ONLY here (used by the MIDDLEWARE in proxy.ts) — the <Link> navigation in
// i18n/navigation.ts stays bound to `routing` above (no pathnames) so the
// ~400 existing string-href call sites need no change. The middleware serves
// /ผลงานของเรา/<slug> from the unchanged app/[locale]/(public)/our-work/[id]
// route and 301-redirects the legacy /our-work (th) → /ผลงานของเรา.
export const routingWithPathnames = defineRouting({
  locales: ["th", "en"],
  defaultLocale: "th",
  localePrefix: "as-needed",
  localeDetection: false,
  pathnames: {
    "/our-work": { th: "/ผลงานของเรา", en: "/our-work" },
    "/our-work/[id]": { th: "/ผลงานของเรา/[id]", en: "/our-work/[id]" },
  },
});
