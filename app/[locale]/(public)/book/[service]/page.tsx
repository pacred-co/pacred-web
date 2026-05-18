/**
 * BK-1 — `/book/[service]` — service-level booking detail page.
 *
 * The route segment is omitted; the booking detail renders with
 * `routeSlug=null` so the customer picks an origin/destination on-page
 * (or just submits without one — the rep picks up route via call).
 *
 * Same `<BookingDetailPage>` component as `[route]/page.tsx`, no route
 * in the URL — `docs/research/booking-flow-system-2026-05-18.md` §3.2.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Home, ChevronRight } from "lucide-react";
import { NavBar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/components/seo/schemas";
import { getServiceConfig } from "@/lib/booking/service-config";
import { BookingDetailPage } from "@/components/booking/BookingDetailPage";
import { createClient } from "@/lib/supabase/server";
import { readCarry, deriveBase } from "@/lib/booking/page-data";
import type { BookingRate } from "@/types/booking";

// Force-dynamic — renders <NavBar> (auth-cookies). AGENTS.md §11.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; service: string }>;
}): Promise<Metadata> {
  const { locale, service } = await params;
  const cfg = getServiceConfig(service);
  if (!cfg) return {};
  const isEn = locale === "en";
  const title = isEn
    ? `Book — ${cfg.titleEn}`
    : `จอง — ${cfg.titleTh}`;
  const description = isEn ? cfg.subEn : cfg.subTh;
  const path = `/book/${service}`;
  return {
    title,
    description,
    alternates: {
      canonical: path,
      languages: {
        "th-TH": path,
        "en-US": `/en${path}`,
        "x-default": path,
      },
    },
    openGraph: { title, description, url: path, type: "website" },
  };
}

interface PageProps {
  params: Promise<{ locale: string; service: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface BookingRateRow {
  id: string;
  scope: "labor" | "tractor" | "doc" | "upgrade";
  rate_key: string;
  service_slug: string | null;
  label_th: string;
  label_en: string;
  unit_amount: number;
  active: boolean;
}

async function fetchRates(serviceSlug: string): Promise<BookingRate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("booking_rates")
    .select("id, scope, rate_key, service_slug, label_th, label_en, unit_amount, active")
    .eq("active", true)
    .or(`service_slug.is.null,service_slug.eq.${serviceSlug}`);
  if (error || !data) return [];
  return (data as BookingRateRow[]).map((r) => ({
    id: r.id,
    scope: r.scope,
    rateKey: r.rate_key,
    serviceSlug: r.service_slug,
    labelTh: r.label_th,
    labelEn: r.label_en,
    unitAmount: Number(r.unit_amount),
    active: r.active,
  }));
}

export default async function BookServicePage({ params, searchParams }: PageProps) {
  const { locale, service } = await params;
  const sp = await searchParams;
  const cfg = getServiceConfig(service);
  if (!cfg) notFound();

  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const homeLabel = typedLocale === "th" ? "หน้าแรก" : "Home";
  const bookLabel = typedLocale === "th" ? "จองบริการ" : "Book";
  const titleLabel = typedLocale === "en" ? cfg.titleEn : cfg.titleTh;

  const carry = readCarry(sp);
  const base = deriveBase(cfg, carry);
  const rates = await fetchRates(cfg.slug);

  return (
    <>
      <JsonLd
        data={breadcrumbSchema(
          [
            { name: homeLabel, path: "/" },
            { name: bookLabel, path: "/book" },
            { name: titleLabel, path: `/book/${service}` },
          ],
          typedLocale,
        )}
      />
      <NavBar />
      <main>
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="mx-auto w-full max-w-[1180px] px-4 md:px-5 pt-4 md:pt-5"
        >
          <ol className="flex items-center gap-1.5 md:gap-2 text-[12.5px] md:text-[14px] flex-wrap">
            <li>
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-muted hover:text-primary-600 transition-colors"
              >
                <Home className="w-3.5 h-3.5 md:w-4 md:h-4" strokeWidth={2.2} />
                <span>{homeLabel}</span>
              </Link>
            </li>
            <li aria-hidden className="text-gray-300 dark:text-border">
              <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.2} />
            </li>
            <li>
              <Link
                href="/book"
                className="text-muted hover:text-primary-600 transition-colors"
              >
                {bookLabel}
              </Link>
            </li>
            <li aria-hidden className="text-gray-300 dark:text-border">
              <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.2} />
            </li>
            <li aria-current="page" className="font-bold text-foreground">
              {titleLabel}
            </li>
          </ol>
        </nav>

        <section className="relative pt-4 md:pt-6 pb-8 md:pb-12">
          <div className="mx-auto w-full max-w-[1180px] px-4 md:px-5">
            <BookingDetailPage
              serviceConfig={cfg}
              routeSlug={null}
              rates={rates}
              initialCarry={carry}
              baseAmount={base.amount}
              baseLabel={base.label}
              sourceChannel="book_service"
              sourceUrl={`/book/${service}`}
            />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
