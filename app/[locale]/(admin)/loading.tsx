/**
 * Route-group loading boundary for the /admin/* back-office.
 *
 * Same rationale as the (protected) loading.tsx: admin pages are dynamic
 * and there was no Suspense fallback, so navigating between admin queues
 * left the previous page on screen until the next finished rendering. The
 * persistent <AdminSidebar> (layout.tsx) stays put; only the content panel
 * swaps to this skeleton the instant a sidebar link is clicked.
 */
export default function AdminLoading() {
  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8" aria-busy="true">
      <div className="flex items-center gap-3 text-primary-600">
        <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
        <span className="text-sm font-medium text-gray-500">กำลังโหลด…</span>
      </div>

      {/* stat cards row (most admin pages open with a 4-card KPI strip) */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />
        ))}
      </div>

      {/* table skeleton */}
      <div className="mt-6 overflow-hidden rounded-xl border border-gray-100">
        <div className="h-10 animate-pulse bg-gray-200" />
        <div className="divide-y divide-gray-100">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse bg-gray-50" />
          ))}
        </div>
      </div>
    </div>
  );
}
