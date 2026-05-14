import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { LocaleHtmlLang } from "@/components/locale-html-lang";
import { FloatingTabs } from "@/components/sections/floating-tabs";
import { JsonLd } from "@/components/seo/json-ld";
import {
  localBusinessSchema,
  organizationSchema,
  websiteSchema,
} from "@/components/seo/schemas";
import { SITE_NAME, SITE_URL } from "@/components/seo/site";

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
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
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

  return (
    <NextIntlClientProvider messages={messages}>
      <LocaleHtmlLang />
      <JsonLd data={[
        organizationSchema(typedLocale),
        websiteSchema(typedLocale),
        localBusinessSchema(typedLocale),
      ]} />
      {children}
      <FloatingTabs />
    </NextIntlClientProvider>
  );
}
