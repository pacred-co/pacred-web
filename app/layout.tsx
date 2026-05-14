import type { Metadata } from "next";
import { Prompt } from "next/font/google";
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
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground font-[family-name:var(--font-prompt)]">
        <ThemeProvider defaultTheme="system">{children}</ThemeProvider>
      </body>
    </html>
  );
}
