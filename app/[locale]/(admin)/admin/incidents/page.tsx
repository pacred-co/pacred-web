import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin, isGodRole } from "@/lib/auth/require-admin";
import {
  INCIDENT_SOURCES,
  INCIDENT_KINDS,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  INCIDENT_SOURCE_LABEL,
  INCIDENT_KIND_LABEL,
  INCIDENT_SEVERITY_LABEL,
  INCIDENT_STATUS_LABEL,
  INCIDENT_STATUS_BADGE,
  INCIDENT_SEVERITY_BADGE,
  LIVE_INCIDENT_STATUSES,
  type IncidentSource,
  type IncidentKind,
  type IncidentSeverity,
  type IncidentStatus,
} from "@/lib/validators/platform-incident";
import { IncidentTriagePanel } from "./incident-triage-panel";
import { PageHeader } from "@/components/admin/page-header";

/**
 * IO-1 — /admin/incidents triage queue (design doc §6.5).
 *
 * Lists auto-captured platform_incidents (0077), filterable by source /
 * kind / severity / status. Surfaces the lifecycle status the owner
 * asked to see ("ส่งเรื่องแล้ว / กำลังดำเนินการ"). Modeled on the
 * shipped /admin/audit + /admin/system/crons layout grammar — filter
 * form + row list + status badges.
 *
 * RBAC (design doc §6.5): READ is broad — every office + operational
 * role can see the queue (the owner/ก๊อต must see platform health).
 * The triage WRITE actions (actions/admin/incidents.ts) are tighter,
 * super+ops only — enforced inside each action via withAdmin.
 *
 * Always-dynamic so the queue reflects the latest captures (DB-backed;
 * the page reads NavBar/auth → force-dynamic is required anyway).
 */
export const dynamic = "force-dynamic";

type Row = {
  id:               string;
  fingerprint:      string;
  source:           string;
  kind:             string;
  severity:         string;
  status:           string;
  title:            string;
  message:          string;
  stack:            string | null;
  route:            string | null;
  surface_meta:     Record<string, unknown> | null;
  actor_role:       string | null;
  actor_ref:        string | null;
  occurrence_count: number;
  first_seen:       string;
  last_seen:        string;
  assigned_to:      string | null;
  acknowledged_at:  string | null;
  resolved_at:      string | null;
  resolution_note:  string | null;
  work_item_id:     string | null;
  sentry_issue_url: string | null;
  assignee?:        { member_code: string | null; first_name: string | null; last_name: string | null }
                  | { member_code: string | null; first_name: string | null; last_name: string | null }[]
                  | null;
};

type SP = {
  source?:   string;
  kind?:     string;
  severity?: string;
  status?:   string;   // a specific status, or "live" (default) / "all"
  from?:     string;   // YYYY-MM-DD — last_seen >=
  to?:       string;   // YYYY-MM-DD — last_seen <= (end-of-day)
  limit?:    string;
};

function normAssignee(
  p: Row["assignee"],
): { member_code: string | null; first_name: string | null; last_name: string | null } | null {
  if (!p) return null;
  return Array.isArray(p) ? (p[0] ?? null) : p;
}

const FILTER_INPUT =
  "w-full rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500/40";

export default async function AdminIncidentsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  // READ is broad — every office + operational role. WRITE actions
  // self-gate to super+ops. `roles` decides whether triage buttons show.
  const { roles } = await requireAdmin([
    "super", "ops", "accounting", "sales_admin", "warehouse", "driver", "interpreter",
  ]);
  const canTriage = isGodRole(roles) || roles.includes("ops");

  const sp = await searchParams;
  const admin = createAdminClient();
  const limit = Math.min(parseInt(sp.limit ?? "100", 10) || 100, 500);

  // Status filter — default 'live' (the active triage queue).
  const statusMode = sp.status ?? "live";

  let q = admin
    .from("platform_incidents")
    .select(`id, fingerprint, source, kind, severity, status, title, message, stack,
      route, surface_meta, actor_role, actor_ref, occurrence_count, first_seen,
      last_seen, assigned_to, acknowledged_at, resolved_at, resolution_note,
      work_item_id, sentry_issue_url,
      assignee:profiles!assigned_to(member_code, first_name, last_name)`)
    .order("last_seen", { ascending: false })
    .limit(limit);

  // Exact total count — Wave 10.1 follow-up. Mirror the same filters into
  // a head:true count query so the chip shows TRUE total when results
  // exceed `limit`. Pattern: docs/learnings/supabase-rls-patterns.md.
  let countQ = admin
    .from("platform_incidents")
    .select("id", { count: "exact", head: true });

  if (statusMode === "live") {
    q = q.in("status", [...LIVE_INCIDENT_STATUSES]);
    countQ = countQ.in("status", [...LIVE_INCIDENT_STATUSES]);
  } else if (statusMode !== "all" && (INCIDENT_STATUSES as readonly string[]).includes(statusMode)) {
    q = q.eq("status", statusMode);
    countQ = countQ.eq("status", statusMode);
  }
  if (sp.source && (INCIDENT_SOURCES as readonly string[]).includes(sp.source)) {
    q = q.eq("source", sp.source);
    countQ = countQ.eq("source", sp.source);
  }
  if (sp.kind && (INCIDENT_KINDS as readonly string[]).includes(sp.kind)) {
    q = q.eq("kind", sp.kind);
    countQ = countQ.eq("kind", sp.kind);
  }
  if (sp.severity && (INCIDENT_SEVERITIES as readonly string[]).includes(sp.severity)) {
    q = q.eq("severity", sp.severity);
    countQ = countQ.eq("severity", sp.severity);
  }
  if (sp.from) {
    q = q.gte("last_seen", sp.from.trim());
    countQ = countQ.gte("last_seen", sp.from.trim());
  }
  if (sp.to) {
    const toS = sp.to.trim();
    const padded = /^\d{4}-\d{2}-\d{2}$/.test(toS) ? `${toS}T23:59:59` : toS;
    q = q.lte("last_seen", padded);
    countQ = countQ.lte("last_seen", padded);
  }

  const { data, error } = await q;
  if (error) {
    console.error(`[platform_incidents list] failed`, { code: error.code, message: error.message });
  }
  const { count: totalCount } = await countQ;
  const rows = (data ?? []) as Row[];

  // Quick counts for the header summary.
  const liveCount   = rows.filter((r) => (LIVE_INCIDENT_STATUSES as readonly string[]).includes(r.status)).length;
  const highCount   = rows.filter((r) => r.severity === "high" || r.severity === "critical").length;

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <PageHeader
        eyebrow="ADMIN · observability · IO-1"
        title="รายงานสถานะระบบ — Incident triage"
        subtitle={
          <>
            ข้อผิดพลาดที่ระบบเก็บอัตโนมัติ (ไม่มีปุ่มส่ง) จากตาราง{" "}
            <code className="rounded bg-surface-alt px-1 py-0.5 text-[11px]">platform_incidents</code>{" "}
            — กรอง + รับเรื่อง + ปิดงาน
          </>
        }
        actions={
          <Link href="/admin" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
            ← Admin
          </Link>
        }
      />

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-border bg-white dark:bg-surface px-3 py-1.5">
          ทั้งหมด <strong>{totalCount ?? rows.length}</strong> รายการ
          {totalCount && totalCount > rows.length ? (
            <span className="text-muted ml-1">· แสดง {rows.length} ล่าสุด</span>
          ) : null}
        </span>
        <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-red-700">
          ยังไม่ปิด <strong>{liveCount}</strong>
        </span>
        <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-orange-700">
          ความรุนแรงสูง <strong>{highCount}</strong>
        </span>
      </div>

      {/* Filter form — the /admin/audit filter-form pattern */}
      <form
        action="/admin/incidents"
        method="get"
        className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm grid gap-2 md:grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_auto]"
      >
        <label className="space-y-1">
          <span className="text-[11px] text-muted">สถานะ</span>
          <select name="status" defaultValue={statusMode} className={FILTER_INPUT}>
            <option value="live">ยังไม่ปิด (live)</option>
            <option value="all">ทั้งหมด</option>
            {INCIDENT_STATUSES.map((s) => (
              <option key={s} value={s}>{INCIDENT_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-muted">ความรุนแรง</span>
          <select name="severity" defaultValue={sp.severity ?? ""} className={FILTER_INPUT}>
            <option value="">— ทั้งหมด —</option>
            {INCIDENT_SEVERITIES.map((s) => (
              <option key={s} value={s}>{INCIDENT_SEVERITY_LABEL[s]}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-muted">surface</span>
          <select name="source" defaultValue={sp.source ?? ""} className={FILTER_INPUT}>
            <option value="">— ทั้งหมด —</option>
            {INCIDENT_SOURCES.map((s) => (
              <option key={s} value={s}>{INCIDENT_SOURCE_LABEL[s]}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-muted">ชนิด</span>
          <select name="kind" defaultValue={sp.kind ?? ""} className={FILTER_INPUT}>
            <option value="">— ทั้งหมด —</option>
            {INCIDENT_KINDS.map((k) => (
              <option key={k} value={k}>{INCIDENT_KIND_LABEL[k]}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-muted">ตั้งแต่ (last seen)</span>
          <input type="date" name="from" defaultValue={sp.from ?? ""} className={FILTER_INPUT} />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-muted">ถึง</span>
          <input type="date" name="to" defaultValue={sp.to ?? ""} className={FILTER_INPUT} />
        </label>
        <div className="flex flex-col gap-1.5 self-end">
          <button
            type="submit"
            className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600"
          >
            กรอง
          </button>
          <Link
            href="/admin/incidents"
            className="rounded-lg border border-border bg-white text-foreground px-4 py-2 text-xs font-medium hover:bg-surface-alt text-center"
          >
            ล้างตัวกรอง
          </Link>
        </div>
      </form>

      {/* Rows */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-bold text-sm">{rows.length} incident (limit {limit})</h2>
          <span className="text-[11px] text-muted">last seen ใหม่ → เก่า</span>
        </div>
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">
            ไม่พบ incident ตามตัวกรอง — ถ้านี่คือสถานะปกติ แปลว่าระบบนิ่งดี 🎉
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => {
              const assignee = normAssignee(r.assignee);
              const assigneeLabel = assignee
                ? `${[assignee.first_name, assignee.last_name].filter(Boolean).join(" ") || "—"}${assignee.member_code ? ` (${assignee.member_code})` : ""}`
                : null;
              return (
                <li key={r.id} className="px-5 py-4 space-y-2.5">
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${INCIDENT_SEVERITY_BADGE[r.severity as IncidentSeverity] ?? ""}`}
                        >
                          {INCIDENT_SEVERITY_LABEL[r.severity as IncidentSeverity] ?? r.severity}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${INCIDENT_STATUS_BADGE[r.status as IncidentStatus] ?? ""}`}
                        >
                          {INCIDENT_STATUS_LABEL[r.status as IncidentStatus] ?? r.status}
                        </span>
                        <span className="rounded-full border border-border bg-surface-alt px-2 py-0.5 text-[11px] text-muted">
                          {INCIDENT_SOURCE_LABEL[r.source as IncidentSource] ?? r.source}
                        </span>
                        <span className="rounded-full border border-border bg-surface-alt px-2 py-0.5 text-[11px] text-muted font-mono">
                          {INCIDENT_KIND_LABEL[r.kind as IncidentKind] ?? r.kind}
                        </span>
                      </div>
                      <p className="text-sm font-semibold break-words">{r.title}</p>
                      <p className="text-[11px] text-muted">
                        เกิด <strong className="text-foreground">{r.occurrence_count.toLocaleString()}</strong> ครั้ง
                        {" · "}
                        {r.route && <span className="font-mono">{r.route}</span>}
                        {r.route && " · "}
                        ล่าสุด {new Date(r.last_seen).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                      </p>
                      {assigneeLabel && (
                        <p className="text-[11px] text-muted">
                          ผู้รับผิดชอบ: <span className="font-medium text-foreground">{assigneeLabel}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Error message + stack */}
                  <details className="text-[11px]">
                    <summary className="cursor-pointer text-muted hover:text-foreground">
                      รายละเอียดข้อผิดพลาด
                    </summary>
                    <div className="mt-1.5 space-y-1.5">
                      <pre className="rounded bg-surface-alt/50 p-2 overflow-x-auto font-mono text-[11px] whitespace-pre-wrap break-words">
                        {r.message}
                      </pre>
                      {r.stack && (
                        <pre className="rounded bg-surface-alt/50 p-2 overflow-x-auto font-mono text-[11px] whitespace-pre-wrap break-words max-h-64">
                          {r.stack}
                        </pre>
                      )}
                      {r.surface_meta && Object.keys(r.surface_meta).length > 0 && (
                        <pre className="rounded bg-surface-alt/50 p-2 overflow-x-auto font-mono text-[11px] whitespace-pre-wrap break-words">
                          {JSON.stringify(r.surface_meta, null, 2)}
                        </pre>
                      )}
                      <p className="text-[11px] text-muted">
                        fingerprint <code className="font-mono">{r.fingerprint}</code>
                        {r.actor_role && <> · actor <code className="font-mono">{r.actor_role}</code></>}
                        {r.actor_ref && <> <code className="font-mono">{r.actor_ref}</code></>}
                      </p>
                      {r.resolution_note && (
                        <p className="rounded-lg border border-green-200 bg-green-50 p-2 text-[11px] text-green-800">
                          บันทึกการแก้ไข: {r.resolution_note}
                        </p>
                      )}
                      {r.sentry_issue_url && (
                        <a
                          href={r.sentry_issue_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block text-[11px] text-primary-600 hover:underline"
                        >
                          ↗ เปิดใน Sentry
                        </a>
                      )}
                      {r.work_item_id && (
                        <Link
                          href="/admin/board"
                          className="block text-[11px] text-primary-600 hover:underline"
                        >
                          ↗ มี work item สำหรับงานแก้ไขนี้แล้ว
                        </Link>
                      )}
                    </div>
                  </details>

                  {/* Triage actions — only for super/ops */}
                  {canTriage && (
                    <IncidentTriagePanel
                      id={r.id}
                      status={r.status as IncidentStatus}
                      hasWorkItem={r.work_item_id != null}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-[11px] text-muted">
        Incident ถูกเก็บอัตโนมัติจาก error boundary (หน้าเว็บ), withObservability (server action),
        และ Sentry webhook — ไม่มีปุ่มให้ผู้ใช้กดส่ง. ลูกค้าที่เจอปัญหาจะเห็นสถานะ
        &quot;ส่งเรื่องแล้ว / กำลังดำเนินการ / แก้ไขแล้ว&quot; ในหน้า &quot;ปัญหาที่ฉันแจ้ง&quot;.
      </p>
    </main>
  );
}
