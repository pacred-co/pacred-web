"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminBackfillPcsAuthUsers, type PcsBackfillResult } from "@/actions/admin/pcs-migration";

export function RunBackfillPanel() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [limit, setLimit] = useState(500);
  const [result, setResult] = useState<PcsBackfillResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function runBatch(opts: { dry_run: boolean }) {
    setError(null);
    setResult(null);
    if (!opts.dry_run) {
      if (!confirm(`Run backfill: up to ${limit} rows.\nThis creates auth.users + profiles for each.\nIdempotent — re-runnable. Continue?`)) return;
    }
    startTransition(async () => {
      const res = await adminBackfillPcsAuthUsers({ limit, dry_run: opts.dry_run });
      if (res.ok && res.data) {
        setResult(res.data);
        router.refresh();
      } else {
        setError(res.ok ? "no_data" : res.error);
      }
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-semibold">Run backfill</h2>
        <label className="text-xs text-muted inline-flex items-center gap-2">
          <span>Batch size</span>
          <input
            type="number"
            min={1}
            max={2000}
            value={limit}
            onChange={(e) => setLimit(Math.max(1, Math.min(2000, parseInt(e.target.value || "1", 10))))}
            className="w-20 rounded border border-border bg-surface px-2 py-1 text-sm tabular-nums"
            disabled={pending}
          />
        </label>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => runBatch({ dry_run: true })}
            disabled={pending}
            className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-hover disabled:opacity-50"
          >
            {pending ? "Running…" : "Dry run"}
          </button>
          <button
            type="button"
            onClick={() => runBatch({ dry_run: false })}
            disabled={pending}
            className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600 disabled:opacity-50"
          >
            {pending ? "Running…" : "Run backfill"}
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 p-3 text-sm text-red-800 dark:text-red-200">
            Error: {error}
          </div>
        )}

        {result && (
          <div className="rounded-lg border border-border bg-surface p-3 text-sm space-y-2">
            <p className="font-semibold">Batch result</p>
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 text-xs">
              <Stat label="Attempted" value={result.attempted} />
              <Stat label="Created"   value={result.created}  ok />
              <Stat label="Merged"    value={result.merged}   ok />
              <Stat label="Ambiguous" value={result.ambiguous} bad={result.ambiguous > 0} />
              <Stat label="Skipped"   value={result.skipped} />
              <Stat label="Failed"    value={result.failed}   bad={result.failed > 0} />
            </div>
            {result.errors.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted">First {Math.min(result.errors.length, 20)} errors</summary>
                <ul className="mt-2 space-y-1 max-h-64 overflow-auto">
                  {result.errors.slice(0, 20).map((e) => (
                    <li key={e.legacy_user_id} className="font-mono">
                      <span className="font-semibold">{e.legacy_user_id}</span> — {e.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {result.attempted === 0 && (
              <p className="text-xs text-muted">No pending staging rows. Done!</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, ok, bad }: { label: string; value: number; ok?: boolean; bad?: boolean }) {
  const klass = ok ? "text-green-700" : bad ? "text-red-700" : "text-foreground";
  return (
    <div className="rounded border border-border bg-white dark:bg-surface px-2 py-1">
      <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-0.5 text-base font-bold tabular-nums ${klass}`}>{value}</p>
    </div>
  );
}
