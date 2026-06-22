"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, Check } from "lucide-react";

export type WarehouseField = {
  key:   string;
  label: string;
  value: string;
  hint?: string;
};

export type WarehouseDef = {
  slug:     string;
  cityTh:   string;
  cityEn:   string;
  province: string;
  flag:     string;
  blurb:    string;
  fields:   WarehouseField[];
};

export function WarehouseCard({ warehouse: w }: { warehouse: WarehouseDef }) {
  const t = useTranslations("warehouseAddressesPage");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
    } catch {
      // Older browsers / non-secure context — fall back to manual select
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); setCopiedKey(key); } catch { /* give up */ }
      document.body.removeChild(ta);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
    }
  }

  const fullBlock = w.fields.map((f) => `${f.label.replace(/\s*\([^)]*\)\s*/g, "")}: ${f.value}`).join("\n");

  return (
    <article className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
      <header className="px-5 py-4 border-b border-border bg-gradient-to-br from-primary-500/5 to-transparent">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-widest font-bold text-primary-500">WAREHOUSE · {w.cityEn.toUpperCase()}</p>
            <h2 className="mt-0.5 text-lg font-bold text-foreground inline-flex items-center gap-2">
              <span aria-hidden>{w.flag}</span> {t("cardTitle", { city: w.cityTh, cityEn: w.cityEn })}
            </h2>
            <p className="text-xs text-muted">{w.province}</p>
          </div>
          <button
            type="button"
            onClick={() => copy(fullBlock, `${w.slug}-all`)}
            className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-primary-500 text-white px-3 py-1.5 text-xs font-bold hover:bg-primary-600"
          >
            {copiedKey === `${w.slug}-all` ? <><Check className="w-3.5 h-3.5" /> {t("copied")}</> : <><Copy className="w-3.5 h-3.5" /> {t("copyAll")}</>}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">{w.blurb}</p>
      </header>

      <ul className="divide-y divide-border">
        {w.fields.map((f) => {
          const key = `${w.slug}-${f.key}`;
          const isCopied = copiedKey === key;
          return (
            <li key={f.key} className="px-5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-wide text-muted">{f.label}</p>
                  <p className="mt-0.5 text-sm font-mono text-foreground break-words">{f.value}</p>
                  {f.hint && <p className="mt-0.5 text-[11px] text-muted">{f.hint}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => copy(f.value, key)}
                  aria-label={t("copyFieldAria", { label: f.label })}
                  className={`shrink-0 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                    isCopied
                      ? "border-green-300 bg-green-50 text-green-700"
                      : "border-border bg-white dark:bg-surface text-muted hover:text-foreground hover:bg-surface-alt"
                  }`}
                >
                  {isCopied ? <><Check className="w-3 h-3" /> {t("copiedShort")}</> : <><Copy className="w-3 h-3" /> {t("copy")}</>}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
