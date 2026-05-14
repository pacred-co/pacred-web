import type { Metadata } from "next";
import { Prompt } from "next/font/google";
import Script from "next/script";
import { ThemeProvider, THEME_INIT_SCRIPT } from "@/components/theme-provider";
import "./globals.css";

const prompt = Prompt({
  variable: "--font-prompt",
  subsets: ["latin", "thai"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Pacred — นำเข้า ส่งออก ชิปปิ้ง เคลียร์ศุลกากร ครบวงจร",
    template: "%s | Pacred",
  },
  description:
    "Pacred — บริการนำเข้า-ส่งออก ชิปปิ้ง เคลียร์พิธีการศุลกากร ฝากสั่งซื้อสินค้าจากจีน FCL/LCL ขนส่งทางรถ เรือ อากาศ ครบวงจรในที่เดียว",
  applicationName: "Pacred",
  openGraph: {
    title: "Pacred — นำเข้า ส่งออก ชิปปิ้ง เคลียร์ศุลกากร ครบวงจร",
    description:
      "ผู้เชี่ยวชาญด้านนำเข้า-ส่งออก เคลียร์พิธีการกรมศุลกากรครบวงจร ฝากสั่งซื้อสินค้าจีน",
    siteName: "Pacred",
    locale: "th_TH",
    type: "website",
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
      <body className="min-h-full flex flex-col bg-background text-foreground font-[family-name:var(--font-prompt)]">
        {/*
          Pre-hydration theme script via next/script with
          strategy="beforeInteractive" — Next.js injects this directly
          into the document <head> outside React's JSX tree, so React 19
          doesn't fire its "script tag inside component" warning.
          Runs synchronously before any client JS / hydration to avoid
          FOUC. See components/theme-provider.tsx.
        */}
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <ThemeProvider defaultTheme="system">{children}</ThemeProvider>
      </body>
    </html>
  );
}
