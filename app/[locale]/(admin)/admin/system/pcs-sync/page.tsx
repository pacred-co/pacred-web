import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Database, RefreshCw, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { PcsSyncActionPanel } from "./action-panel";

/**
 * /admin/system/pcs-sync — PCS↔Pacred sync dashboard.
 *
 * Roles: super + accounting (read) — super-only on the action buttons
 * (gated by the Server Actions in actions/admin/pcs-sync.ts).
 *
 * Shows:
 *   1. Current state — last_sync_at, last_run_at, last_error, status badge
 *   2. Last 50 sync runs — since/until window, rows seen/upserted/skipped/failed
 *   3. "Trigger sync now" button (super-only · runs the cron flow inline)
 *   4. "Test endpoint" button (super-only · calls /pacred-sync.php?since=-1h)
 *
 * Always-dynamic so the dashboard reflects each new run immediately.
 */
export const dynamic = "force-dynamic";

type StateRow = {
  last_sync_at: string;
  last_run_at:  string | null;
  last_error:   string | null;
};

type LogRow = {
  id:                  number;
  ran_at:              string;
  since:               string | null;
  until:               string | null;
  rows_seen:           number;
  rows_upserted:       number;
  rows_skipped_newer:  number;
  rows_failed:         number;
  duration_ms:         number | null;
  error:               string | null;
};

function formatBkkTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("th-TH", {
      timeZone: "Asia/Bangkok",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function ageMinutes(iso: string | null): number | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return null;
  return Math.floor((Date.now() - ts) / 60000);
}

export default async function PcsSyncDashboardPage() {
  await requireAdmin(["super", "accounting"]);
  const admin = createAdminClient();

  // ── 1. Current state ──
  const { data: stateRaw, error: stateErr } = await admin
    .from("pcs_sync_state")
    .select("last_sync_at, last_run_at, last_error")
    .eq("id", 1)
    .maybeSingle();
  if (stateErr) {
    console.error("[pcs-sync dashboard state] failed", {
      code: stateErr.code, message: stateErr.message,
    });
  }
  const state = (stateRaw as unknown as StateRow | null) ?? {
    last_sync_at: "",
    last_run_at:  null,
    last_error:   null,
  };

  // ── 2. Last 50 logs ──
  const { data: logsRaw, error: logsErr } = await admin
    .from("pcs_sync_logs")
    .select("id, ran_at, since, until, rows_seen, rows_upserted, rows_skipped_newer, rows_failed, duration_ms, error")
    .order("ran_at", { ascending: false })
    .limit(50);
  if (logsErr) {
    console.error("[pcs-sync dashboard logs] failed", {
      code: logsErr.code, message: logsErr.message,
    });
  }
  const logs = (logsRaw ?? []) as unknown as LogRow[];

  // ── Derived status badge ──
  const lastRunAgeMin = ageMinutes(state.last_run_at);
  const isStale       = lastRunAgeMin !== null && lastRunAgeMin > 30; // cron is */10
  const hasError      = !!state.last_error;
  const statusLabel   = hasError ? "ล่าสุดล้มเหลว"
                      : !state.last_run_at ? "ยังไม่เคยรัน"
                      : isStale ? `เก่า (${lastRunAgeMin} นาที)`
                      : "ทำงานปกติ";
  const statusBadge   = hasError ? "bg-red-50 text-red-700 border-red-200"
                      : !state.last_run_at ? "bg-gray-50 text-gray-700 border-gray-200"
                      : isStale ? "bg-amber-50 text-amber-700 border-amber-200"
                      : "bg-green-50 text-green-700 border-green-200";
  const StatusIcon    = hasError ? AlertCircle
                      : !state.last_run_at ? Clock
                      : isStale ? Clock
                      : CheckCircle2;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">PCS ↔ Pacred Sync</h1>
            <p className="text-xs text-muted mt-0.5">
              ดึง <code className="text-[11px] bg-surface-alt px-1 py-0.5 rounded">tb_forwarder</code> ที่เปลี่ยนแปลงจาก PCS server มาเข้า Pacred ทุก 10 นาที
            </p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium ${statusBadge}`}
        >
          <StatusIcon className="w-3.5 h-3.5" />
          {statusLabel}
        </span>
      </div>

      {/* ── State cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StateCard
          label="Cursor (last_sync_at)"
          value={formatBkkTime(state.last_sync_at)}
          hint="จุดเริ่มของรอบถัดไป"
        />
        <StateCard
          label="รันล่าสุด"
          value={formatBkkTime(state.last_run_at)}
          hint={lastRunAgeMin !== null ? `${lastRunAgeMin} นาทีที่แล้ว` : "ยังไม่เคย"}
        />
        <StateCard
          label="Error ล่าสุด"
          value={state.last_error ? "มี" : "ไม่มี"}
          hint={state.last_error ?? "—"}
          tone={state.last_error ? "error" : "ok"}
        />
      </div>

      {state.last_error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          <div className="font-semibold mb-1 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            Error ล่าสุดจาก state
          </div>
          <code className="block whitespace-pre-wrap break-words text-[11px]">{state.last_error}</code>
        </div>
      )}

      {/* ── Action panel (super-only client buttons) ── */}
      <PcsSyncActionPanel />

      {/* ── Run history ── */}
      <section className="bg-white rounded-lg border border-border overflow-hidden">
        <header className="px-4 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-muted" />
            <h2 className="text-sm font-semibold text-foreground">ประวัติการรัน (50 รอบล่าสุด)</h2>
          </div>
          <span className="text-[11px] text-muted">{logs.length} รอบ</span>
        </header>
        <div className="overflow-x-auto scrollbar-x-visible">
          <table className="w-full text-[12px] min-w-[920px]">
            <thead className="bg-surface-alt text-muted">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">เวลา</th>
                <th className="px-3 py-2 font-medium">since</th>
                <th className="px-3 py-2 font-medium">until</th>
                <th className="px-3 py-2 font-medium text-right">เห็น</th>
                <th className="px-3 py-2 font-medium text-right">เขียน</th>
                <th className="px-3 py-2 font-medium text-right">ข้าม</th>
                <th className="px-3 py-2 font-medium text-right">fail</th>
                <th className="px-3 py-2 font-medium text-right">ms</th>
                <th className="px-3 py-2 font-medium">error</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-center text-muted" colSpan={9}>
                    ยังไม่มีประวัติการรัน — กด &quot;Trigger sync ตอนนี้&quot; เพื่อทดสอบ
                  </td>
                </tr>
              )}
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-border hover:bg-surface-alt/40">
                  <td className="px-3 py-2 whitespace-nowrap text-foreground">
                    {formatBkkTime(l.ran_at)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted text-[11px]">
                    {formatBkkTime(l.since)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted text-[11px]">
                    {formatBkkTime(l.until)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.rows_seen}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-green-700">{l.rows_upserted}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{l.rows_skipped_newer}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${l.rows_failed > 0 ? "text-red-700 font-medium" : "text-muted"}`}>
                    {l.rows_failed}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{l.duration_ms ?? "—"}</td>
                  <td className="px-3 py-2 text-[11px] text-red-700 max-w-[260px] truncate" title={l.error ?? ""}>
                    {l.error ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="text-[11px] text-muted">
        Cron: <code className="bg-surface-alt px-1 py-0.5 rounded">*/10 * * * *</code>
        {" · "}
        Endpoint env: <code className="bg-surface-alt px-1 py-0.5 rounded">PCS_SYNC_URL</code>
        {" + "}
        <code className="bg-surface-alt px-1 py-0.5 rounded">PCS_SYNC_TOKEN</code>
        {" · "}
        Runbook: <code className="bg-surface-alt px-1 py-0.5 rounded">docs/runbook/pcs-sync-setup.md</code>
      </footer>
    </div>
  );
}

function StateCard({
  label, value, hint, tone = "ok",
}: {
  label: string; value: string; hint?: string; tone?: "ok" | "error";
}) {
  return (
    <div className="bg-white rounded-lg border border-border p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted font-medium">{label}</p>
      <p className={`text-sm font-semibold mt-1 ${tone === "error" ? "text-red-700" : "text-foreground"} truncate`}>
        {value}
      </p>
      {hint && <p className="text-[11px] text-muted mt-1 truncate" title={hint}>{hint}</p>}
    </div>
  );
}
