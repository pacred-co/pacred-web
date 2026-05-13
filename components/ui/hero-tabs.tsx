"use client";

import { useState } from "react";
import type { ElementType } from "react";
import { useTranslations } from "next-intl";
import { Anchor, PlaneTakeoff, ClipboardList, ShoppingCart, Banknote } from "lucide-react";

function TruckMoving({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" width={size} height={size} fill="currentColor" className={className}>
      <path d="M64 32C28.7 32 0 60.7 0 96L0 304l0 80 0 16c0 44.2 35.8 80 80 80c26.2 0 49.4-12.6 64-32c14.6 19.4 37.8 32 64 32c44.2 0 80-35.8 80-80c0-5.5-.6-10.8-1.6-16L416 384l33.6 0c-1 5.2-1.6 10.5-1.6 16c0 44.2 35.8 80 80 80s80-35.8 80-80c0-5.5-.6-10.8-1.6-16l1.6 0c17.7 0 32-14.3 32-32l0-64 0-16 0-10.3c0-9.2-3.2-18.2-9-25.3l-58.8-71.8c-10.6-13-26.5-20.5-43.3-20.5L480 144l0-48c0-35.3-28.7-64-64-64L64 32zM585 256l-105 0 0-64 48.8 0c2.4 0 4.7 1.1 6.2 2.9L585 256zM528 368a32 32 0 1 1 0 64 32 32 0 1 1 0-64zM176 400a32 32 0 1 1 64 0 32 32 0 1 1 -64 0zM80 368a32 32 0 1 1 0 64 32 32 0 1 1 0-64z"/>
    </svg>
  );
}
import { Button } from "@/components/ui/button";

type FieldType = { label: string; placeholder: string; type?: "text" | "select"; options?: string[] };
type TabConfig = { title: string; sub: string; icon: ElementType; fields: FieldType[]; submitLabel: string };

function FormField({ field }: { field: FieldType }) {
  const base =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent";
  return (
    <div className="flex flex-col gap-1 flex-1 min-w-0">
      <label className="text-xs font-medium text-muted">{field.label}</label>
      {field.type === "select" ? (
        <select className={base}>
          <option value="">{field.placeholder}</option>
          {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type="text" placeholder={field.placeholder} className={base} />
      )}
    </div>
  );
}

interface HeroTabsProps {
  onActiveChange?: (i: number | null) => void;
}

export function HeroTabs({ onActiveChange }: HeroTabsProps) {
  const t = useTranslations("heroTabs");
  const f = useTranslations("heroForm");
  const [active, setActive] = useState<number | null>(null);

  const tabs: TabConfig[] = [
    {
      title: t("tab1Title"), sub: t("tab1Sub"), icon: Anchor,
      submitLabel: f("quoteSubmit"),
      fields: [
        { label: f("type"), placeholder: f("typeChoose"), type: "select", options: ["LCL", "FCL"] },
        { label: f("origin"), placeholder: f("originPh1") },
        { label: f("destination"), placeholder: f("destinationPh1") },
        { label: f("weightCbm"), placeholder: f("weightCbmPh") },
      ],
    },
    {
      title: t("tab2Title"), sub: t("tab2Sub"), icon: TruckMoving,
      submitLabel: f("quoteSubmit"),
      fields: [
        { label: f("origin"), placeholder: f("originPh2") },
        { label: f("destination"), placeholder: f("destinationPh1") },
        { label: f("productType"), placeholder: f("productTypePh1") },
        { label: f("weightKg"), placeholder: f("weightKgPh1") },
      ],
    },
    {
      title: t("tab3Title"), sub: t("tab3Sub"), icon: PlaneTakeoff,
      submitLabel: f("quoteSubmit"),
      fields: [
        { label: f("type"), placeholder: f("typeChoose"), type: "select", options: [f("typeImport"), f("typeExport")] },
        { label: f("origin"), placeholder: f("originPh3") },
        { label: f("destination"), placeholder: f("destinationPh2") },
        { label: f("weightKg"), placeholder: f("weightKgPh2") },
      ],
    },
    {
      title: t("tab4Title"), sub: t("tab4Sub"), icon: ClipboardList,
      submitLabel: f("contactSubmit"),
      fields: [
        { label: f("customsPort"), placeholder: f("customsPortPh") },
        { label: f("productType"), placeholder: f("productTypePh2") },
        { label: f("awb"), placeholder: f("awbPh") },
        { label: f("phone"), placeholder: f("phonePh") },
      ],
    },
    {
      title: t("tab5Title"), sub: t("tab5Sub"), icon: ShoppingCart,
      submitLabel: f("sourcingSubmit"),
      fields: [
        { label: f("platform"), placeholder: f("platformPh"), type: "select", options: ["1688", "Taobao", "Tmall", "Alibaba"] },
        { label: f("productLink"), placeholder: f("productLinkPh") },
        { label: f("qty"), placeholder: f("qtyPh") },
        { label: f("budget"), placeholder: f("budgetPh") },
      ],
    },
    {
      title: t("tab6Title"), sub: t("tab6Sub"), icon: Banknote,
      submitLabel: f("quoteSubmit"),
      fields: [
        { label: f("currency"), placeholder: f("currencyPh"), type: "select", options: [f("currencyCny"), f("currencyUsd"), f("currencyEur"), f("currencyJpy")] },
        { label: f("amount"), placeholder: f("amountPh") },
        { label: f("destCountry"), placeholder: f("destCountryPh") },
        { label: f("purpose"), placeholder: f("purposePh") },
      ],
    },
  ];

  function handleTabClick(i: number) {
    const next = active === i ? null : i;
    setActive(next);
    onActiveChange?.(next);
  }

  const cardOpen = active !== null;

  return (
    <div>
      {/* Tabs bar */}
      <div className="bg-white dark:bg-surface rounded-xl shadow-xl border border-border overflow-hidden">
        <div className="flex overflow-x-auto">
          {tabs.map((tab, i) => (
            <button
              key={tab.title}
              onClick={() => handleTabClick(i)}
              className={`group flex flex-1 min-w-0 items-center gap-3 px-4 py-3 text-left transition-colors border-b-2 ${
                active === i
                  ? "border-primary-500 bg-primary-50 dark:bg-primary-950"
                  : "border-transparent hover:bg-surface"
              }`}
            >
              <tab.icon
                size={24}
                className={`shrink-0 transition-colors ${active === i ? "text-primary-500" : "text-muted"}`}
              />
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className={`text-sm font-semibold whitespace-nowrap transition-colors ${active === i ? "text-primary-500" : "text-foreground"}`}>
                  {tab.title}
                </span>
                <span className={`text-xs whitespace-nowrap transition-colors ${active === i ? "text-primary-400" : "text-muted"}`}>
                  {tab.sub}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Form card — smooth open/close */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          cardOpen ? "max-h-[300px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        {active !== null && (
          <div className="mt-2 rounded-xl border border-border bg-white dark:bg-surface shadow-lg px-6 py-5">
            <div className="flex items-end gap-3">
              {tabs[active].fields.map((field) => (
                <FormField key={field.label} field={field} />
              ))}
              <div className="shrink-0 pb-0.5">
                <Button variant="primary" size="md">
                  {tabs[active].submitLabel}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
