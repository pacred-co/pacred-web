import { getTranslations } from "next-intl/server";
import {
  PackageCheck,
  ClipboardCheck,
  Ship,
  Landmark,
  Home,
  Check,
  Clock,
  PauseCircle,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import {
  resolveJourney,
  type JourneyTimestamps,
  type ResolvedJourneyStage,
} from "@/lib/freight/journey-status";
import type { FreightShipmentStatus } from "@/lib/validators/freight-shipment";

/**
 * <FreightJourney> — the CUSTOMER-VISIBLE shipment journey stepper.
 *
 * Renders ONLY the customer journey stages (lib/freight/journey-status SOT) —
 * never the internal `draft` raw status, never the scary "cancelled" word. A
 * held/cancelled job freezes the ladder at its last real stage + shows a
 * friendly "ล่าช้า/รอเคลียร์ — ติดต่อเซล" note; the in-transit step shows a
 * gentle clearance-ahead note. Milestone dates are only the ones the schema
 * actually stamps (created/confirmed/delivered) — no invented ETD/ETA.
 *
 * Mobile-first: a vertical timeline that reads top-to-bottom on phones and
 * stays a clean column on desktop (customers are on phones · AGENTS §6).
 */

const ICON_MAP: Record<ResolvedJourneyStage["icon"], LucideIcon> = {
  PackageCheck,
  ClipboardCheck,
  Ship,
  Landmark,
  Home,
};

function thDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

export async function FreightJourney({
  status,
  timestamps,
}: {
  status: FreightShipmentStatus;
  timestamps: JourneyTimestamps;
}) {
  const t = await getTranslations("customerFreight");
  const journey = resolveJourney(status, timestamps);

  // Internal draft — the customer sees a neutral "being prepared" placeholder
  // rather than any internal label.
  if (journey.isPreparing) {
    return (
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
        <h2 className="font-bold text-sm mb-2">🧭 {t("journeyHeading")}</h2>
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
          ⏳ {t("journeyPreparing")}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
      <h2 className="font-bold text-sm mb-4">🧭 {t("journeyHeading")}</h2>

      <ol className="relative space-y-0">
        {journey.stages.map((stage, idx) => {
          const Icon = ICON_MAP[stage.icon];
          const isLast = idx === journey.stages.length - 1;
          const date = thDate(stage.date);

          // State-driven visual encoding (§0h hierarchy: the current step pops).
          const node =
            stage.state === "done"
              ? { ring: "bg-green-600 text-white border-green-600", glyph: <Check className="h-4 w-4" /> }
              : stage.state === "current"
                ? { ring: "bg-primary-600 text-white border-primary-600 ring-4 ring-primary-100", glyph: <Icon className="h-4 w-4" /> }
                : stage.state === "paused"
                  ? { ring: "bg-amber-50 text-amber-500 border-amber-300", glyph: <PauseCircle className="h-4 w-4" /> }
                  : { ring: "bg-surface-alt text-muted border-border", glyph: <Icon className="h-4 w-4" /> };

          // Connector line colour: green up to the current step, neutral after.
          const lineDone = stage.state === "done";

          return (
            <li key={stage.key} className="relative flex gap-3 pb-5 last:pb-0">
              {/* Connector line */}
              {!isLast && (
                <span
                  aria-hidden
                  className={`absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-0.5 ${
                    lineDone ? "bg-green-500" : "bg-border"
                  }`}
                />
              )}
              {/* Node */}
              <span
                className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${node.ring}`}
              >
                {node.glyph}
              </span>
              {/* Body */}
              <div className="min-w-0 flex-1 pt-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span
                    className={`text-sm ${
                      stage.state === "current"
                        ? "font-bold text-foreground"
                        : stage.state === "done"
                          ? "font-medium text-foreground"
                          : stage.state === "paused"
                            ? "font-medium text-amber-700"
                            : "text-muted"
                    }`}
                  >
                    {t(stage.labelKey)}
                  </span>
                  {stage.state === "current" && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-primary-200 bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-700">
                      <Clock className="h-3 w-3" /> {t("journeyCurrent")}
                    </span>
                  )}
                </div>
                {date && (
                  <p className="mt-0.5 text-[11px] text-muted">
                    {t("journeyMilestoneOn", { date })}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Friendly hold / clearance-ahead note (never the raw 'cancelled' word). */}
      {journey.holdNote && (
        <div
          className={`mt-4 flex items-start gap-2 rounded-lg border px-3 py-3 text-sm ${
            journey.holdNote.kind === "hold"
              ? "border-amber-300 bg-amber-50 text-amber-800"
              : "border-blue-200 bg-blue-50 text-blue-800"
          }`}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{t(journey.holdNote.messageKey)}</span>
        </div>
      )}
    </section>
  );
}
