import type { Metadata } from "next";
import { Prompt } from "next/font/google";
import { ThemeProvider, THEME_INIT_SCRIPT } from "@/components/theme-provider";
import { GtmScript, GtmNoscript } from "@/components/analytics/gtm-script";
import { ClarityScript } from "@/components/analytics/clarity-script";
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
    types: {
      "application/rss+xml": "/feed.xml",
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
      className={`${prompt.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/*
          Pre-hydration theme script — runs synchronously inside the
          server-rendered <head> BEFORE first paint to prevent FOUC.
          Per Part P review (เดฟ, 2026-05-14): inline <script> in a
          Server Component <head> is the only path that actually blocks
          paint — next/script strategy="beforeInteractive" preloads but
          does not block hydration for inline children (Next 16 docs).
          React 19's "script in component" warning fires only on Client
          Component re-render, not Server-rendered head content.
        */}
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
        <GtmScript />
        <ClarityScript />
      </head>
      <body
        suppressHydrationWarning
        className="min-h-full flex flex-col bg-background text-foreground font-[family-name:var(--font-prompt)]"
      >
        <GtmNoscript />
        {/* Light theme default per ปอน's first-visit lock UX (commit da60747).
            ปอน wanted enableSystem={false} + disableTransitionOnChange too —
            current `theme-provider.tsx` (ภูม commit 0da2e71) doesn't yet
            expose those props. Flagged as follow-up: extend ThemeProvider to
            support `enableSystem`/`disableTransitionOnChange` to fully match
            next-themes API. For now `defaultTheme="light"` covers the most
            user-visible part of the intent. */}
        <ThemeProvider defaultTheme="light">{children}</ThemeProvider>
      </body>
    </html>
  );
}
