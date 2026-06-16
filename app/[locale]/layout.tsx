import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { LocaleHtmlLang } from "@/components/locale-html-lang";
import { ConfirmDialogHost } from "@/components/ui/confirm";
import { JsonLd } from "@/components/seo/json-ld";
import {
  localBusinessSchema,
  organizationSchema,
  websiteSchema,
} from "@/components/seo/schemas";
import { SITE_NAME, SITE_URL, ogImageUrl } from "@/components/seo/site";

/**
 * Server-only message namespaces — NOT shipped to the client provider.
 *
 * Sprint-8 perf trim. `messages/th.json` is 202 KB on disk; every namespace
 * we serialize into the RSC payload adds bytes to every customer's HTML
 * download. By restricting `NextIntlClientProvider` to the namespaces that
 * client components actually call via `useTranslations(...)`, we drop the
 * 15 server-only namespaces below from the wire — ~20 KB raw / ~5-7 KB
 * gzipped saved per page boot.
 *
 * If a NEW client component starts calling `useTranslations("seo")` (or
 * any other namespace below), move it off this list — the hook will throw
 * `MISSING_MESSAGE` otherwise. Grep is the cheapest audit:
 *   grep -rE 'useTranslations\(["\x27]NAMESPACE' app components
 *
 * Server components (e.g. `generateMetadata`) keep using `getTranslations`
 * with the FULL message set — `getMessages()` on the server side still
 * returns everything. This list ONLY narrows what crosses to the browser.
 */
const SERVER_ONLY_NAMESPACES = new Set([
  "admin",            // legacy admin sub-tree, used server-side only
  "bookingPage",      // booking SC render only
  "credit",           // server credit-line copy
  "dashboard",        // dashboard SC render
  "footer",           // legacy footer SC — `footerNew` is the client one
  "footerExtras",     // server footer SC
  "freightReceipt",   // PDF render server-side
  "hero",             // legacy hero SC — `heroBanner` is the client one
  "register",         // server-rendered register form copy
  "sales",            // sales server pages
  "seo",              // metadata/OG generators only
  "serviceData",      // service detail SC
  "shipments",        // shipments SC
  "walletShop",       // shop wallet SC (client uses local strings)
  "work_chat",        // legacy work-chat server-side
]);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!routing.locales.includes(locale as "th" | "en")) return {};

  const t = await getTranslations({ locale, namespace: "seo.root" });
  const title = t("title");
  const description = t("description");

  const ogLocale = locale === "en" ? "en_US" : "th_TH";
  const altLocale = locale === "en" ? "th_TH" : "en_US";

  return {
    title: { default: title, template: `%s | ${SITE_NAME}` },
    description,
    alternates: {
      canonical: locale === "th" ? "/" : `/${locale}`,
      languages: {
        "th-TH": "/",
        "en-US": "/en",
        "x-default": "/",
      },
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}${locale === "th" ? "" : `/${locale}`}`,
      siteName: SITE_NAME,
      locale: ogLocale,
      alternateLocale: [altLocale],
      type: "website",
      images: [{ url: ogImageUrl("home"), width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl("home")],
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as "th" | "en")) {
    notFound();
  }

  const messages = await getMessages();
  const typedLocale = locale as "th" | "en";

  // Pick only the client-required namespaces. The full message tree
  // stays available to server components via `getTranslations` — this
  // only controls what gets serialized into the RSC payload that the
  // browser downloads on every page boot.
  const clientMessages = Object.fromEntries(
    Object.entries(messages as Record<string, unknown>).filter(
      ([ns]) => !SERVER_ONLY_NAMESPACES.has(ns),
    ),
  );

  return (
    <NextIntlClientProvider messages={clientMessages}>
      <LocaleHtmlLang />
      <JsonLd data={[
        organizationSchema(typedLocale),
        websiteSchema(typedLocale),
        localBusinessSchema(typedLocale),
      ]} />
      {/* `<FloatingTabs />` was previously mounted here, which leaked the
          marketing mobile-CTA bar + LINE chat bubble into the customer
          portal, admin, and auth pages. Moved to
          `app/[locale]/(public)/layout.tsx` so it only renders on
          public marketing routes. (Sprint-25, 2026-05-25.) */}
      {children}
      {/* Global centered confirm/alert/prompt host — replaces native browser
          popups everywhere (see components/ui/confirm.tsx). Mounted once. */}
      <ConfirmDialogHost />
    </NextIntlClientProvider>
  );
}
