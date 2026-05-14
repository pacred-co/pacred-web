import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["th", "en"],
  defaultLocale: "th",
  localePrefix: "as-needed",
  // First-time visitors are forced to TH regardless of browser Accept-Language.
  // After they switch to /en manually, the cookie remembers that choice.
  localeDetection: false,
});
