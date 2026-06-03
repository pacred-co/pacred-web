/**
 * Shared admin pagination control (2026-06-03).
 *
 * Page-number + prev/next style, driven by a `?page=N` URL param so links are
 * bookmarkable and navigation stays client-side (Next <Link>). Server pages
 * read the page via `parsePage` (lib/admin/paginate.ts), fetch one window with
 * `.range()`, and render this with the row total. Renders nothing when there's
 * only one page.
 *
 * Preserves all other query params (q, sort, dir, group, view, …) passed via
 * `params` so filters survive page changes.
 */
import { Link } from "@/i18n/navigation";

export type PaginationProps = {
  /** Current 1-based page. */
  page: number;
  /** Rows per page. */
  pageSize: number;
  /** Total row count (from a `count: "exact"` query). */
  total: number;
  /** Route to link to, e.g. "/admin/customers". */
  basePath: string;
  /** Other query params to preserve across page changes (page is managed here). */
  params?: Record<string, string | number | undefined | null>;
};

/** Build the windowed list of page tokens: 1 … p-1 p p+1 … N. */
function pageWindow(page: number, totalPages: number): (number | "…")[] {
  const out: (number | "…")[] = [];
  const push = (n: number | "…") => out.push(n);
  const window = 1; // pages on each side of current
  const first = 1;
  const last = totalPages;
  const lo = Math.max(first, page - window);
  const hi = Math.min(last, page + window);
  if (lo > first) {
    push(first);
    if (lo > first + 1) push("…");
  }
  for (let p = lo; p <= hi; p++) push(p);
  if (hi < last) {
    if (hi < last - 1) push("…");
    push(last);
  }
  return out;
}

export function Pagination({ page, pageSize, total, basePath, params = {} }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== "") sp.set(k, String(v));
    }
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const linkCls =
    "inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-3 text-sm transition-colors";
  const idle = "border-border text-foreground hover:bg-surface-alt";
  const active = "border-primary-600 bg-primary-600 text-white font-semibold";
  const disabled = "border-border text-muted opacity-50 pointer-events-none";

  return (
    <nav
      className="mt-4 flex flex-wrap items-center justify-between gap-3"
      aria-label="Pagination"
    >
      <p className="text-xs text-muted">
        แสดง {from.toLocaleString()}–{to.toLocaleString()} จาก {total.toLocaleString()} รายการ
      </p>
      <div className="flex flex-wrap items-center gap-1">
        <Link
          href={href(Math.max(1, page - 1))}
          className={`${linkCls} ${page <= 1 ? disabled : idle}`}
          aria-disabled={page <= 1}
          aria-label="ก่อนหน้า"
        >
          ‹
        </Link>
        {pageWindow(page, totalPages).map((tok, i) =>
          tok === "…" ? (
            <span key={`gap-${i}`} className="px-1 text-muted">
              …
            </span>
          ) : (
            <Link
              key={tok}
              href={href(tok)}
              className={`${linkCls} ${tok === page ? active : idle}`}
              aria-current={tok === page ? "page" : undefined}
            >
              {tok}
            </Link>
          ),
        )}
        <Link
          href={href(Math.min(totalPages, page + 1))}
          className={`${linkCls} ${page >= totalPages ? disabled : idle}`}
          aria-disabled={page >= totalPages}
          aria-label="ถัดไป"
        >
          ›
        </Link>
      </div>
    </nav>
  );
}
