# 🧩 Components — Documentation

> Every React component under `components/` with its props (args). **192 components across 168 files.**

Grouped one file per folder. ✓ marks a required prop; everything else is optional (`?`).

| Folder | Components | Files |
|---|--:|--:|
| [`components/sections/`](sections.md) | 57 | 55 |
| [`components/admin/`](admin.md) | 19 | 19 |
| [`components/booking/`](booking.md) | 18 | 16 |
| [`components/`](root.md) | 17 | 17 |
| [`components/seo/`](seo.md) | 13 | 4 |
| [`components/analytics/`](analytics.md) | 11 | 7 |
| [`components/legacy/`](legacy.md) | 11 | 10 |
| [`components/pdf/`](pdf.md) | 10 | 10 |
| [`components/ui/`](ui.md) | 10 | 9 |
| [`components/icons/`](icons.md) | 6 | 1 |
| [`components/admin/dashboards/`](admin__dashboards.md) | 5 | 5 |
| [`components/booking/options/`](booking__options.md) | 5 | 5 |
| [`components/knowledge/`](knowledge.md) | 3 | 3 |
| [`components/admin/reports/`](admin__reports.md) | 2 | 2 |
| [`components/auth/`](auth.md) | 1 | 1 |
| [`components/freight/`](freight.md) | 1 | 1 |
| [`components/freight-quote/`](freight-quote.md) | 1 | 1 |
| [`components/observability/`](observability.md) | 1 | 1 |
| [`components/pricing/`](pricing.md) | 1 | 1 |

## How props were extracted

- Component defs found via `export [default] [async] function Name(...)` and `export const Name = (...) =>` / `React.FC<Props>`.
- The first parameter's type annotation is resolved: inline object type, or a named `interface`/`type` in the same file (incl. `extends`).
- Props defined in another module (or extending external HTML-attribute types) are noted by type name without a field table.
- `✓` = required; otherwise optional (`?`) or has a default.

<sub>Auto-derived 2026-06-02. Regenerate with `node scripts/gen-component-docs.mjs`.</sub>
