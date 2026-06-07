import { Check, MapPin, Clock, PackageSearch, AlertCircle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { LINE_OA, CONTACT } from "@/components/seo/site";
import { getPublicTrackStatus } from "@/actions/track";
import { TrackForm } from "../track-form";

/**
 * Public parcel-status timeline (Task 2 · ปอน · 2026-06-02).
 *
 * `force-dynamic` — this reads live DB per request AND the (public) layout's
 * NavBar reads cookies; a [code] dynamic segment without it → DYNAMIC_SERVER_USAGE
 * 500 (AGENTS.md §11). The reader (`getPublicTrackStatus`) is fully sanitized +
 * self-guarding (never 500s, never leaks): a bad code / DB outage → the
 * friendly not-found branch, HTTP 200.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "สถานะพัสดุ — Pacred",
  description: "ติดตามสถานะการนำเข้าสินค้าจากจีนแบบเรียลไทม์",
};

async function HelpFooter() {
  const t = await getTranslations("publicTrackStatus");
  return (
    <div className="mt-6 rounded-xl border border-border bg-surface-alt/30 px-4 py-4 text-center text-sm text-muted">
      {t.rich("codeHelpFooter", {
        lineId: LINE_OA.premiumId,
        phone: CONTACT.phoneCompanyDisplay,
        chat: (chunks) => (
          <a
            href={LINE_OA.addFriendUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-primary-600 hover:underline"
          >
            {chunks}
          </a>
        ),
        call: (chunks) => (
          <a href={`tel:${CONTACT.phoneCompany}`} className="font-semibold text-primary-600 hover:underline">
            {chunks}
          </a>
        ),
      })}
    </div>
  );
}

export default async function TrackCodePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const code = decodeURIComponent(rawCode ?? "");
  const result = await getPublicTrackStatus(code);
  const t = await getTranslations("publicTrackStatus");

  // ── Not found / error → friendly state (never leak, never 500) ──
  if (!result.found) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
        <div className="rounded-2xl border border-border bg-white p-6 text-center shadow-sm dark:bg-surface sm:p-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-500">
            <AlertCircle className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-xl font-bold text-foreground">{t("notFoundTitle")}</h1>
          <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-muted">
            {t.rich("notFoundBody", {
              code,
              codeTag: (chunks) => (
                <span className="font-mono font-semibold text-foreground">{chunks}</span>
              ),
            })}
          </p>
          <div className="mt-5">
            <TrackForm initial={code} />
          </div>
        </div>
        <HelpFooter />
      </main>
    );
  }

  const { tracking, statusLabel, warehouse, etaText, stages } = result;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      {/* Summary card */}
      <div className="rounded-2xl border border-border bg-white p-5 shadow-sm dark:bg-surface sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              <PackageSearch className="h-4 w-4" />
              {t("trackingNumberLabel")}
            </p>
            <p className="mt-1 break-all font-mono text-base font-bold text-foreground">
              {tracking}
            </p>
          </div>
          <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-3 py-1 text-sm font-semibold text-red-700">
            {statusLabel}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {warehouse && (
            <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-alt/30 px-3.5 py-2.5">
              <MapPin className="h-4 w-4 shrink-0 text-muted" />
              <span className="text-sm text-foreground">
                {t.rich("originWarehouse", {
                  warehouse,
                  value: (chunks) => <span className="font-semibold">{chunks}</span>,
                })}
              </span>
            </div>
          )}
          {etaText && (
            <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-alt/30 px-3.5 py-2.5">
              <Clock className="h-4 w-4 shrink-0 text-muted" />
              <span className="text-sm text-foreground">{etaText}</span>
            </div>
          )}
        </div>
      </div>

      {/* Vertical timeline (mobile-first — never goes horizontal) */}
      <ol className="mt-5 rounded-2xl border border-border bg-white p-5 shadow-sm dark:bg-surface sm:p-6">
        {stages.map((s, idx) => {
          const isLast = idx === stages.length - 1;
          const dotClass = s.done
            ? "bg-emerald-500 text-white border-emerald-500"
            : s.current
              ? "bg-red-600 text-white border-red-600 ring-4 ring-red-100"
              : "bg-white dark:bg-surface text-transparent border-border";
          const lineClass = s.done ? "bg-emerald-400" : "bg-border";
          return (
            <li key={s.step} className="relative flex gap-3.5 pb-1">
              {/* Node + connector */}
              <div className="flex flex-col items-center">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${dotClass}`}
                >
                  {s.done ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-current" />
                  )}
                </span>
                {!isLast && <span className={`mt-1 w-0.5 flex-1 ${lineClass}`} />}
              </div>
              {/* Label + date */}
              <div className={`flex-1 pb-5 ${isLast ? "pb-0" : ""}`}>
                <p
                  className={`text-[15px] font-semibold ${
                    s.current
                      ? "text-red-700"
                      : s.done
                        ? "text-foreground"
                        : "text-muted"
                  }`}
                >
                  {s.label}
                  {s.current && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 align-middle text-[11px] font-bold text-red-700">
                      {t("currentStatusBadge")}
                    </span>
                  )}
                </p>
                {s.date && (
                  <p className="mt-0.5 text-xs text-muted">{s.date}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Search another code */}
      <div className="mt-5 rounded-2xl border border-border bg-white p-4 shadow-sm dark:bg-surface sm:p-5">
        <p className="mb-2 text-sm font-semibold text-foreground">{t("searchAnother")}</p>
        <TrackForm />
      </div>

      <HelpFooter />
    </main>
  );
}
