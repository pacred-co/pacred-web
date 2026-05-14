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
          Pre-hydration theme script — runs synchronously before paint
          to prevent FOUC. Lives in the Server Component head (NOT inside
          ThemeProvider) so React 19 doesn't warn about <script> JSX
          re-rendering on client. See components/theme-provider.tsx.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground font-[family-name:var(--font-prompt)]">
        <ThemeProvider defaultTheme="system">{children}</ThemeProvider>
      </body>
    </html>
  );
}
