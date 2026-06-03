/**
 * Route-group loading boundary for the (protected) customer portal.
 *
 * Why this exists (perf · 2026-06-03): every (protected) page is
 * `force-dynamic`, so a soft client navigation waits for the server to
 * render the new segment. With NO loading.tsx, the App Router has no
 * Suspense fallback — it keeps the OLD page on screen until the new one
 * is fully ready, so a click feels like "nothing happened" for 50-300ms.
 *
 * This file gives the router an instant fallback: the persistent chrome
 * (NavBar / sidebar / footer, owned by layout.tsx) stays put and only the
 * `.app-content` body swaps to this lightweight skeleton the moment the
 * link is clicked. Pure Tailwind, no client JS, no data — renders instantly.
 */
export default function ProtectedLoading() {
  return (
    <div className="pcs-legacy mx-auto w-full max-w-5xl px-4 py-8" aria-busy="true">
      <div className="flex items-center gap-3 text-primary-600">
        <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
        <span className="text-sm font-medium text-gray-500">กำลังโหลด…</span>
      </div>

      <div className="mt-6 space-y-4">
        {/* header strip */}
        <div className="h-8 w-1/3 animate-pulse rounded bg-gray-200" />
        {/* card grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl bg-gray-100"
            />
          ))}
        </div>
        {/* list rows */}
        <div className="space-y-3 pt-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      </div>
    </div>
  );
}
