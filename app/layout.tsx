import type { Metadata } from "next";
import { Prompt } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { GtmScript, GtmNoscript } from "@/components/analytics/gtm-script";
import { ClarityScript } from "@/components/analytics/clarity-script";
import { GoogleAdsScript } from "@/components/analytics/google-ads-script";
import { GoogleAnalyticsScript } from "@/components/analytics/google-analytics-script";
import {
  FacebookPixelScript,
  FacebookPixelNoscript,
} from "@/components/analytics/facebook-pixel-script";
import { SITE_NAME, SITE_URL } from "@/components/seo/site";
import "./globals.css";

const prompt = Prompt({
  variable: "--font-prompt",
  subsets: ["latin", "thai"],
  weight: ["300", "400", "500", "600", "700"],
});

const DEFAULT_TITLE = "Pacred — นำเข้า ส่งออก ชิปปิ้ง เคลียร์ศุลกากร ครบวงจร";
const DEFAULT_DESCRIPTION =
  "Pacred — บริการนำเข้า-ส่งออก ชิปปิ้ง เคลียร์พิธีการศุลกากร ฝากสั่งซื้อสินค้าจากจีน FCL/LCL ขนส่งทางรถ เรือ อากาศ ครบวงจรในที่เดียว";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: DEFAULT_TITLE,
    template: "%s | Pacred",
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  formatDetection: { email: false, address: false, telephone: false },
  alternates: {
    canonical: "/",
    languages: {
      "th-TH": "/",
      "en-US": "/en",
      "x-default": "/",
    },
  },
  openGraph: {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    siteName: SITE_NAME,
    url: SITE_URL,
    locale: "th_TH",
    alternateLocale: ["en_US"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: [{ url: "/images/pdiwaicon.png", type: "image/png" }],
    shortcut: [{ url: "/images/pdiwaicon.png" }],
    apple: [{ url: "/images/pdiwaicon.png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="th"
      translate="no"
      className={`${prompt.variable} notranslate h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* We ship our own i18n (next-intl th/en) — tell Chrome / Edge / any
            UA-level translator not to offer translation. Without this, the
            browser's translate tooltip ("ข้อความต้นฉบับ" / thumbs up-down /
            "ให้คะแนนคำแปลนี้") leaks on top of the page. The `translate="no"`
            attribute + `notranslate` class are the defensive belt-and-braces;
            CSS in globals.css hides the overlay if a user enables translate
            manually. */}
        <meta name="google" content="notranslate" />
        {/*
          Opt out of Google Translate (browser-side + Web Translate Element).
          Pacred has its own TH/EN switcher in NavBar (next-intl) so Chrome's
          built-in translate prompt + the legacy `tam-it.js` Google Translate
          widget are both redundant + visually noisy (the "ความต้นฉบับ /
          ให้คะแนนคำแปลนี้" rating overlay on every protected page). With
          `<meta name="google" content="notranslate">` Chrome does NOT offer
          translation + the legacy widget no-ops even if injected. CSS in
          globals.css hides any residual `.skiptranslate`/`.goog-te-*` chrome.
        */}
        <meta name="google" content="notranslate" />
        {/*
          Pre-hydration theme script — paints `light` before first paint to
          prevent FOUC. Lives in public/theme-init.js as an external file so
          React 19 hoists it via the script-resource pipeline (any inline
          `<script>` in a Server Component output trips a dev warning in
          Next 16, even with `async` + `id` or via next/script). React 19
          also handles preload + dedup for `<script src async />`.
        */}
        <script async src="/theme-init.js" />
        <GtmScript />
        <ClarityScript />
        <GoogleAdsScript />
        <GoogleAnalyticsScript />
        <FacebookPixelScript />
      </head>
      <body
        suppressHydrationWarning
        className="min-h-full flex flex-col bg-background text-foreground font-[family-name:var(--font-prompt)]"
      >
        <GtmNoscript />
        <FacebookPixelNoscript />
        {/* Always-light-on-open (เดฟ, 2026-05-16): THEME_INIT_SCRIPT paints
            `light` pre-hydration and ThemeProvider starts `light` to match —
            no OS `prefers-color-scheme` detection, no head-script↔React
            desync, so the theme toggle flips on its first click. The site
            opens white on every fresh load; in-session dark toggling still
            works. `defaultTheme` is kept for API parity. See
            components/theme-provider.tsx for the full rationale. */}
        <ThemeProvider defaultTheme="light">{children}</ThemeProvider>
      </body>
    </html>
  );
}
