"use client";

/**
 * Reusable admin-list rows-per-page selector (2026-07-06).
 *
 * A small <select> (50 / 100 / 250 / 500 / 1000 / ทั้งหมด) that drives the
 * `?size=` URL param. It PRESERVES the list's other filters (q / type / group /
 * adminidsale / …) passed via `params`, and RESETS to page 1 on change (a new
 * page size makes the old page number meaningless).
 *
 * Server pages pair this with `parsePageSize(sp.size)` (lib/admin/paginate.ts)
 * to size the `.range()` window + the <Pagination> total. Built generic so any
 * admin list can adopt it — wire `basePath` + the current filters + `current`.
 */
import { useRouter } from "next/navigation";
import { ALLOWED_PAGE_SIZES, ALL_PAGE_SIZE_CAP } from "@/lib/admin/paginate";

export type PageSizeSelectProps = {
  /** Route to navigate to, e.g. "/admin/customers". */
  basePath: string;
  /** Current effective page size (a number, or ALL_PAGE_SIZE_CAP for "all"). */
  current: number;
  /** Other query params to preserve across a size change (page is reset). */
  params?: Record<string, string | number | undefined | null>;
};

const ALL_VALUE = "all";

export function PageSizeSelect({ basePath, current, params = {} }: PageSizeSelectProps) {
  const router = useRouter();

  // "all" when the current size is the capped ทั้งหมด window; else the number.
  const currentValue = current >= ALL_PAGE_SIZE_CAP ? ALL_VALUE : String(current);

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== "") sp.set(k, String(v));
    }
    if (value && value !== String(50)) sp.set("size", value);
    // page intentionally omitted → resets to 1.
    const qs = sp.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span>แสดง</span>
      <select
        value={currentValue}
        onChange={onChange}
        className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/50"
        aria-label="จำนวนแถวต่อหน้า"
      >
        {ALLOWED_PAGE_SIZES.map((n) => (
          <option key={n} value={String(n)}>
            {n.toLocaleString("th-TH")}
          </option>
        ))}
        <option value={ALL_VALUE}>ทั้งหมด (สูงสุด {ALL_PAGE_SIZE_CAP.toLocaleString("th-TH")})</option>
      </select>
      <span>แถว/หน้า</span>
    </label>
  );
}
