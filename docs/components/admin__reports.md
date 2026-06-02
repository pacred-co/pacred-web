# Components — `components/admin/reports/`

> 2 components across 2 files. ✓ = required prop.

### `admin/reports/report-date-form.tsx` · `"use client"`

#### `ReportDateForm`

| Prop | Req | Type |
|---|:-:|---|
| `pathname` | ✓ | `string` |
| `range` | ✓ | `DateRange` |
| `extraQuery` |  | `Record<string, string \| undefined>` |

### `admin/reports/report-shell.tsx`

#### `ReportShell`

| Prop | Req | Type |
|---|:-:|---|
| `eyebrow` |  | `string` |
| `title` | ✓ | `string` |
| `subtitle` |  | `string` |
| `range` | ✓ | `DateRange` |
| `pathname` | ✓ | `string` |
| `extraQuery` |  | `Record<string, string \| undefined>` |
| `summary` |  | `ReportSummaryCard[]` |
| `data` | ✓ | `ReportData` |
| `csvSlug` | ✓ | `string` |
| `emptyLabel` |  | `string` |
| `sourceNote` |  | `string` |
| `extraControls` |  | `React.ReactNode` |


---

<sub>Auto-derived from component source on 2026-06-02. Props parsed from the first-param type / named Props interface. See [README.md](README.md).</sub>
