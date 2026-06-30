import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Home, ChevronRight, Ship, Info } from "lucide-react";
import { requireAuth } from "@/lib/auth/require-auth";
import { LINE_OA } from "@/components/seo/site";
import { FreightBookingForm } from "../_components/freight-booking-form";

/**
 * /freight/booking — the CUSTOMER in-app freight BOOKING / RFQ create.
 *
 * Logged-in customers create a freight booking request here. It submits through
 * the existing public booking seam `submitFreightQuote` (which soft-links the
 * lead to the customer's profile_id because they're signed in) → a
 * `freight_quote` lead + AX ref → sales picks it up at /admin/freight/leads.
 * Booking-create is the ONLY mutation in the customer freight lane.
 *
 * requireAuth() gates the page; name + phone are prefilled from the profile so
 * the customer barely types.
 */

export const dynamic = "force-dynamic";

export default async function CustomerFreightBookingPage() {
  const t = await getTranslations("customerFreight");
  const { profile } = await requireAuth();

  const defaultName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const defaultPhone = profile?.phone ?? "";

  return (
    <main className="mx-auto w-full max-w-[900px] px-4 py-6 space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted flex-wrap">
        <Link href="/dashboard" className="hover:text-primary-600 inline-flex items-center gap-1">
          <Home className="w-3.5 h-3.5" /> {t("breadcrumbHome")}
        </Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/freight" className="hover:text-primary-600">Freight</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground font-medium">{t("bkBreadcrumb")}</span>
      </nav>

      {/* Header */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600">
            <Ship className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">{t("bkTitle")}</h1>
            <p className="text-xs text-muted mt-0.5">{t("bkSubtitle")}</p>
          </div>
        </div>
      </div>

      {/* How-it-works note */}
      <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{t("bkHowItWorks")}</span>
      </div>

      {/* Form */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
        <FreightBookingForm
          defaultName={defaultName}
          defaultPhone={defaultPhone}
          lineOaUrl={LINE_OA.addFriendUrl}
        />
      </div>
    </main>
  );
}
