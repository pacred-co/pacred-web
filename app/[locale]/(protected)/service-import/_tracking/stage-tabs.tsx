"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

/**
 * 3-stage tabs (Origin / Transit / Destination) + matching panels — the
 * tracking-page chrome from ปอน's 2026-05-28 mockup. One stage visible at
 * a time; the active tab tints its own color block (green/blue/orange).
 *
 * Panels are passed in as props so the parent Server Component can
 * compute step-state per container and pass the rendered panel down,
 * keeping this file as pure interactivity.
 */
export type Stage = "origin" | "transit" | "dest";

export function StageTabs({
  initial = "transit",
  originPanel,
  transitPanel,
  destPanel,
}: {
  initial?: Stage;
  originPanel: ReactNode;
  transitPanel: ReactNode;
  destPanel: ReactNode;
}) {
  const [stage, setStage] = useState<Stage>(initial);
  const t = useTranslations("serviceImportStageTabs");

  const tabs: { key: Stage; num: number; label: string; activeBg: string; activeText: string; restText: string }[] = [
    {
      key: "origin",
      num: 1,
      label: t("origin"),
      activeBg: "bg-emerald-600",
      activeText: "text-white",
      restText: "text-emerald-700",
    },
    {
      key: "transit",
      num: 2,
      label: t("transit"),
      activeBg: "bg-sky-600",
      activeText: "text-white",
      restText: "text-sky-700",
    },
    {
      key: "dest",
      num: 3,
      label: t("dest"),
      activeBg: "bg-orange-500",
      activeText: "text-white",
      restText: "text-orange-600",
    },
  ];

  return (
    <>
      <section
        className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4 -mb-px relative z-[3]"
        aria-label="LCL stage tabs"
      >
        {tabs.map((t) => {
          const active = stage === t.key;
          const base =
            "h-[64px] md:h-[70px] cursor-pointer rounded-t-xl text-sm md:text-lg font-extrabold flex items-center justify-center gap-3 md:gap-4 border border-border border-b-0 shadow-sm transition-colors";
          const palette = active
            ? `${t.activeBg} ${t.activeText}`
            : `bg-white dark:bg-surface ${t.restText} hover:bg-surface-alt/40`;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setStage(t.key)}
              aria-pressed={active}
              className={`${base} ${palette}`}
            >
              <span
                className={`w-9 h-9 rounded-full grid place-items-center font-extrabold shadow-sm ${
                  active ? "bg-white/95 text-current" : "bg-white"
                }`}
              >
                {t.num}
              </span>
              <span className="truncate">{t.label}</span>
            </button>
          );
        })}
      </section>

      <section className="bg-white dark:bg-surface border border-border rounded-b-2xl shadow-sm overflow-hidden">
        <div className="px-2 pt-4 md:px-4">
          {stage === "origin" && originPanel}
          {stage === "transit" && transitPanel}
          {stage === "dest" && destPanel}
        </div>
      </section>
    </>
  );
}
