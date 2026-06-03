"use client";

/**
 * Generic lazy-loaded expandable row detail (2026-06-03).
 *
 * Admin list pages used to resolve every row's heavy detail (storage signed
 * URLs, per-row sub-queries, doc previews) up-front during the page render —
 * the N+1 cost that dominated slow pages like /admin/customers. This component
 * defers that work: the detail is fetched ONLY when the operator expands the
 * row, via a Server Action passed as `loader`. The result is cached in local
 * state so re-expanding is instant.
 *
 * Usage:
 *   <LazyRowDetail
 *     label="ดูเอกสาร"
 *     loader={() => getJuristicDocsAction(userid)}     // a "use server" action
 *     render={(docs) => docs.map(d => <a key={d.url} href={d.url}>{d.label}</a>)}
 *   />
 *
 * The loader returns serializable data; `render` (client) turns it into UI.
 */
import { useState, useTransition } from "react";

export function LazyRowDetail<T>({
  label,
  loader,
  render,
  className,
}: {
  label: string;
  loader: () => Promise<T>;
  render: (data: T) => React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && data === null && !pending) {
      startTransition(async () => {
        try {
          setData(await loader());
          setError(false);
        } catch {
          setError(true);
        }
      });
    }
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={toggle}
        className="inline-flex items-center gap-1 text-sm text-primary-600 hover:underline"
        aria-expanded={open}
      >
        <span aria-hidden className={`transition-transform ${open ? "rotate-90" : ""}`}>›</span>
        {label}
      </button>
      {open && (
        <div className="mt-2">
          {pending && <span className="text-xs text-muted">กำลังโหลด…</span>}
          {error && <span className="text-xs text-red-600">โหลดไม่สำเร็จ</span>}
          {!pending && !error && data !== null && render(data)}
        </div>
      )}
    </div>
  );
}
