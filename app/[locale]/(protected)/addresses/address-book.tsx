"use client";

/**
 * The addresses screen body — a client tab switcher between the customer's
 * Thai delivery addresses and the China receiving-warehouse table
 * (ปอน 2026-05-30 — "สลับไปเป็นรายการที่อยู่โกดังจีน ไม่ใช่ pop up").
 *
 * - Tab "ที่อยู่จัดส่งในไทย": the server-rendered Thai address list (passed as
 *   `children`) + the "เพิ่มที่อยู่" popup trigger (`addButton`).
 * - Tab "ที่อยู่โกดังจีน": both China warehouses (อี้อู Yiwu + กวางโจว
 *   Guangzhou) rendered as ONE table, each warehouse a group-header row + its
 *   field rows, with per-field + per-warehouse copy-to-clipboard.
 *
 * Warehouse data comes from /service-import/warehouse-addresses (resolved
 * server-side with the member-code suffix `PR<n> by EK` / EK=รถ SEA=เรือ) and
 * is handed down as the `warehouses` prop — this component is presentational.
 */

import { Fragment, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { MapPin, Copy, Check } from "lucide-react";

export type WarehouseField = {
  key: string;
  label: string;
  value: string;
  hint?: string;
};

export type Warehouse = {
  slug: string;
  cityTh: string;
  cityEn: string;
  province: string;
  flag: string;
  blurb: string;
  fields: WarehouseField[];
};

// Hoisted to module scope (not defined inside AddressBook) so it is a stable
// component identity across renders — an inline nested component would remount
// its subtree every render (react-hooks/static-components).
function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
        active
          ? "bg-primary-600 text-white shadow-sm"
          : "text-muted hover:bg-surface-alt hover:text-foreground"
      }`}
    >
      <MapPin className="h-4 w-4" />
      {label}
    </button>
  );
}

export function AddressBook({
  warehouses,
  addButton,
  children,
}: {
  warehouses: Warehouse[];
  addButton: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("addressPage");
  const [tab, setTab] = useState<"thai" | "china">("thai");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
    } catch {
      // Non-secure context / clipboard blocked — manual select fallback.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopiedKey(key);
      } catch {
        /* give up */
      }
      document.body.removeChild(ta);
    }
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm dark:bg-surface">
      {/* Header: tab switcher + (Thai tab) the เพิ่มที่อยู่ popup trigger */}
      <div className="flex flex-col gap-2.5 border-b border-border px-3 py-3 md:flex-row md:items-center md:justify-between md:px-5 md:py-4">
        <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-border bg-surface-alt/40 p-1">
          <TabButton
            active={tab === "thai"}
            onClick={() => setTab("thai")}
            label={t("tabThai")}
          />
          <TabButton
            active={tab === "china"}
            onClick={() => setTab("china")}
            label={t("tabChina")}
          />
        </div>
        {tab === "thai" && <div className="shrink-0">{addButton}</div>}
      </div>

      {/* Content */}
      <div className="px-3 py-3 md:px-5 md:py-4">
        {tab === "thai" ? (
          children
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted">
              {t.rich("chinaIntro", {
                ek: () => <span className="font-mono">EK</span>,
                sea: () => <span className="font-mono">SEA</span>,
              })}
            </p>

            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">{t("colField")}</th>
                    <th className="px-3 py-2.5 font-medium">{t("colDetail")}</th>
                    <th className="px-3 py-2.5 text-center font-medium">{t("colCopy")}</th>
                  </tr>
                </thead>
                <tbody>
                  {warehouses.map((w) => {
                    const fullBlock = w.fields
                      .map(
                        (f) =>
                          `${f.label.replace(/\s*\([^)]*\)\s*/g, "")}: ${f.value}`,
                      )
                      .join("\n");
                    const allKey = `${w.slug}-all`;
                    const allCopied = copiedKey === allKey;
                    return (
                      <Fragment key={w.slug}>
                        <tr className="border-t border-border bg-primary-500/[0.06]">
                          <td colSpan={3} className="px-3 py-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-2 text-sm font-bold text-foreground">
                                <span aria-hidden>{w.flag}</span>
                                {t("warehouseTitle", { cityTh: w.cityTh, cityEn: w.cityEn })}
                                <span className="text-xs font-normal text-muted">
                                  · {w.province}
                                </span>
                              </span>
                              <button
                                type="button"
                                onClick={() => copy(fullBlock, allKey)}
                                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary-500 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-primary-600"
                              >
                                {allCopied ? (
                                  <>
                                    <Check className="h-3 w-3" /> {t("copied")}
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3 w-3" /> {t("copyAll")}
                                  </>
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {w.fields.map((f) => {
                          const key = `${w.slug}-${f.key}`;
                          const isCopied = copiedKey === key;
                          return (
                            <tr
                              key={f.key}
                              className="border-t border-border align-top hover:bg-surface-alt/30"
                            >
                              <td className="whitespace-nowrap px-3 py-2.5 text-[11px] uppercase tracking-wide text-muted">
                                {f.label}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className="block break-words font-mono text-foreground">
                                  {f.value}
                                </span>
                                {f.hint && (
                                  <span className="mt-0.5 block text-[11px] text-muted">
                                    {f.hint}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => copy(f.value, key)}
                                  aria-label={t("copyField", { label: f.label })}
                                  className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                                    isCopied
                                      ? "border-green-300 bg-green-50 text-green-700"
                                      : "border-border bg-white text-muted hover:bg-surface-alt hover:text-foreground dark:bg-surface"
                                  }`}
                                >
                                  {isCopied ? (
                                    <>
                                      <Check className="h-3 w-3" /> {t("copiedShort")}
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="h-3 w-3" /> {t("copy")}
                                    </>
                                  )}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
