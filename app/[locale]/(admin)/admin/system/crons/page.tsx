import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CRON_REGISTRY, type CronEntry } from "@/lib/cron/registry";
import { CronTriggerButton } from "./trigger-button";

/**
 * U4-1 — /admin/system/crons cron-health panel.
 *
 * Roles: super + ops.
 *   - super sees the "Trigger now" buttons (calls adminTriggerCron).
 *   - ops sees the same cards but read-only.
 *
 * Each card shows:
 *   - cron path + schedule (from lib/cron/registry.ts)
 *   - last fire timestamp + status badge
 *   - last error message (when last status was failure/partial)
 *   - 7-day success rate (% of fires that returned status='success')
 *
 * Always-dynamic so the dashboard reflects the latest cron_invocations
 * rows (DB-backed; no static-cache layer).
 */
export const dynamic = "force-dynamic";

type InvocationRow = {
  cron_path:     string;
  fired_at:      string;
  finished_at:   string | null;
  duration_ms:   number | null;
  status:        "success" | "failure" | "partial";
  result_summary: Record<string, unknown> | null;
  error_message: string | null;
};

type Stats = {
  last:        InvocationRow | null;
  total7d:     number;
  success7d:   number;
};

const STATUS_BADGE: Record<InvocationRow["status"], string> = {
  success: "bg-green-50 text-green-700 border-green-200",
  failure: "bg-red-50 text-red-700 border-red-200",
  partial: "bg-amber-50 text-amber-700 border-amber-200",
};

const STATUS_LABEL: Record<InvocationRow["status"], string> = {
  success: "สำเร็จ",
  failure: "ล้มเหลว",
  partial: "บางส่วนล้มเหลว",
};

// Helper isolates the impure Date.now() call out of render — keeps the
// React Compiler purity check happy.
function getSevenDayCutoffIso(): string {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

export default async function AdminCronHealthPage() {
  const { roles } = await requireAdmin(["super", "ops"]);
  const canTrigger = roles.includes("super");

  const admin = createAdminClient();
  // Wrap the impure Date.now() in a memoised constant — calling it
  // directly inline trips the React Compiler "no impure functions in
  // render" rule, even for server components.
  const cutoff7d = getSevenDayCutoffIso();

  // Fetch all invocations from the last 7 days + last 30 invocations PER cron.
  // PostgREST doesn't expose `distinct on`; we fetch the 7-day window and
  // compute last + counts in JS — small dataset for an admin page.
  const { data: rows7d, error: rows7dErr } = await admin
    .from("cron_invocations")
    .select("cron_path, fired_at, finished_at, duration_ms, status, result_summary, error_message")
    .gte("fired_at", cutoff7d)
    .order("fired_at", { ascending: false })
    .limit(2000);
  if (rows7dErr) {
    console.error(`[cron_invocations list] failed`, { code: rows7dErr.code, message: rows7dErr.message });
  }

  const byPath = new Map<string, InvocationRow[]>();
  for (const r of (rows7d ?? []) as unknown as InvocationRow[]) {
    const arr = byPath.get(r.cron_path) ?? [];
    arr.push(r);
    byPath.set(r.cron_path, arr);
  }

  // For each registry entry, look up the most recent fire even if it's
  // older than 7 days (otherwise a slow cron looks "never fired").
  const stats = new Map<string, Stats>();
  for (const entry of CRON_REGISTRY) {
    const recent = byPath.get(entry.path) ?? [];
    let last: InvocationRow | null = recent[0] ?? null;
    if (!last) {
      const { data: olderRows, error: olderRowsErr } = await admin
        .from("cron_invocations")
        .select("cron_path, fired_at, finished_at, duration_ms, status, result_summary, error_message")
        .eq("cron_path", entry.path)
        .order("fired_at", { ascending: false })
        .limit(1);
      if (olderRowsErr) {
        console.error(`[cron_invocations list] failed`, { code: olderRowsErr.code, message: olderRowsErr.message });
      }
      last = ((olderRows ?? []) as unknown as InvocationRow[])[0] ?? null;
    }
    const success7d = recent.filter((r) => r.status === "success").length;
    stats.set(entry.path, { last, total7d: recent.length, success7d });
  }

  // Any orphan cron paths in the DB that aren't in the registry?
  // (means someone removed a cron without dropping logs — surface them.)
  const orphans: string[] = [];
  for (const path of byPath.keys()) {
    if (!CRON_REGISTRY.find((c) => c.path === path)) orphans.push(path);
  }

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-6xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · system · U4-1</p>
          <h1 className="mt-1 text-2xl font-bold">Cron health</h1>
          <p className="mt-1 text-sm text-muted">
            สถานะ cron ทั้ง {CRON_REGISTRY.length} งาน (last fire · 7-day success rate · last error).
            Logs จาก <code className="rounded bg-surface-alt px-1 py-0.5 text-[10px]">public.cron_invocations</code>.
          </p>
        </div>
        <Link href="/admin" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">← Admin</Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {CRON_REGISTRY.map((entry) => {
          const s = stats.get(entry.path)!;
          return <CronCard key={entry.path} entry={entry} stats={s} canTrigger={canTrigger} />;
        })}
      </div>

      {orphans.length > 0 && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs">
          <p className="font-semibold text-amber-800">
            ⚠ cron_invocations มี path ที่ไม่อยู่ใน lib/cron/registry.ts ({orphans.length})
          </p>
          <p className="mt-1 text-amber-700">
            อาจเป็น cron ที่ถูกถอดออกจาก vercel.json แต่ logs ยังเหลือ — ลบ entries ใน registry หรือเพิ่มกลับเข้ามา.
          </p>
          <ul className="mt-2 list-disc pl-5 font-mono text-[11px] text-amber-700">
            {orphans.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </section>
      )}

      <p className="text-[10px] text-muted">
        Tip: เปลี่ยน schedule ที่ <code>vercel.json</code> แล้วต้อง redeploy ก่อน Vercel ถึงเริ่มใช้ schedule ใหม่.
        Logs ขึ้นที่นี่หลัง cron handler รันเสร็จ (พึ่ง <code>lib/cron/instrument.ts</code>).
      </p>
    </main>
  );
}

function CronCard({
  entry,
  stats,
  canTrigger,
}: {
  entry: CronEntry;
  stats: Stats;
  canTrigger: boolean;
}) {
  const { last, total7d, success7d } = stats;
  const successPct = total7d > 0 ? Math.round((success7d / total7d) * 100) : null;

  return (
    <article className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm space-y-2">
      <header className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-sm font-bold">{entry.label}</h2>
          <p className="font-mono text-[11px] text-muted truncate">{entry.path}</p>
        </div>
        {last && (
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[last.status]}`}>
            {STATUS_LABEL[last.status]}
          </span>
        )}
      </header>

      <p className="text-xs text-muted">{entry.description}</p>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <dt className="text-muted">Schedule</dt>
        <dd className="font-mono">{entry.scheduleLabel} <span className="text-muted">({entry.schedule})</span></dd>

        <dt className="text-muted">Last fire</dt>
        <dd>
          {last
            ? new Date(last.fired_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "medium" })
            : <span className="text-muted">— ยังไม่เคยรัน</span>
          }
        </dd>

        {last?.duration_ms != null && (
          <>
            <dt className="text-muted">Duration</dt>
            <dd className="font-mono">{last.duration_ms.toLocaleString()} ms</dd>
          </>
        )}

        <dt className="text-muted">7-day success</dt>
        <dd className={successPct == null ? "text-muted" : successPct === 100 ? "text-green-700 font-semibold" : successPct >= 80 ? "text-amber-700 font-semibold" : "text-red-700 font-semibold"}>
          {successPct == null ? "—" : `${successPct}% (${success7d}/${total7d})`}
        </dd>
      </dl>

      {last?.result_summary && Object.keys(last.result_summary).length > 0 && (
        <details className="text-[10px]">
          <summary className="cursor-pointer text-muted hover:text-foreground">last summary</summary>
          <pre className="mt-1 rounded bg-surface-alt/50 p-2 overflow-x-auto font-mono whitespace-pre-wrap break-words">
            {JSON.stringify(last.result_summary, null, 2)}
          </pre>
        </details>
      )}

      {last?.error_message && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-[10px] text-red-700 font-mono break-words">
          {last.error_message}
        </p>
      )}

      {canTrigger && <CronTriggerButton cronPath={entry.path} />}
    </article>
  );
}
