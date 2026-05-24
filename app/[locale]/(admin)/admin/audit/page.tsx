import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

/**
 * Admin audit-log viewer — surfaces every admin_audit_log row written by
 * `lib/auth/require-admin.ts::logAdminAction`. Lets super track WHO did
 * WHAT to WHICH target WHEN, with the optional JSON payload (before/after
 * snapshots, override values, etc).
 *
 * Sprint-11 P2.3 extensions:
 *   - target_type dropdown — distinct values + counts pulled from DB
 *   - action dropdown — distinct PREFIXES pulled from DB (legacy text input
 *     stays as a "starts with" hint; both filters combine with AND)
 *   - Search box — substring match on target_id + payload-as-text
 *   - Pagination — 50/page (offset-based) replacing the limit-only slider
 *   - RBAC widened to super + ops (ops needs to debug ops-side actions)
 *
 * Filters: admin (member_code) · action (prefix dropdown) · action_filter (free-text)
 *          · target_type (dropdown) · target_id (exact) · q (search) · from/to dates.
 * All optional; combine freely via ?param=value.
 */

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type Row = {
  id:           string;
  admin_id:     string;
  action:       string;
  target_type:  string;
  target_id:    string;
  payload:      Record<string, unknown> | null;
  created_at:   string;
  admin?:       { member_code: string | null; first_name: string | null; last_name: string | null } | { member_code: string | null; first_name: string | null; last_name: string | null }[] | null;
};

type SP = {
  admin?:       string;    // member_code (PR####)
  action?:      string;    // exact prefix dropdown e.g. "rate_general"
  action_filter?: string;  // free-text prefix override (advanced)
  target_type?: string;
  target_id?:   string;
  q?:           string;    // search on target_id substring + payload text
  from?:        string;    // YYYY-MM-DD — created_at >=
  to?:          string;    // YYYY-MM-DD — created_at <= (end-of-day)
  offset?:      string;    // pagination offset (0-based)
};

function normAdmin(p: Row["admin"]): { member_code: string | null; first_name: string | null; last_name: string | null } | null {
  if (!p) return null;
  return Array.isArray(p) ? (p[0] ?? null) : p;
}

/**
 * Load the distinct `target_type` + action-prefix lists for the dropdowns.
 * We sample the most-recent N rows (cheap on the existing
 * admin_audit_log_admin_idx (admin_id, created_at desc) — but we don't
 * filter by admin so the planner uses created_at via the target_idx
 * fallback. Capped to 5000 rows so the cost stays bounded even with a
 * year's worth of audit history).
 */
async function loadDistinctOptions(
  admin: ReturnType<typeof createAdminClient>,
): Promise<{ targetTypes: string[]; actionPrefixes: string[] }> {
  const { data } = await admin
    .from("admin_audit_log")
    .select("action, target_type")
    .order("created_at", { ascending: false })
    .limit(5000);

  const targetSet = new Set<string>();
  const prefixSet = new Set<string>();
  for (const r of (data ?? []) as Array<{ action: string; target_type: string }>) {
    if (r.target_type) targetSet.add(r.target_type);
    if (r.action) {
      // Action prefix = portion before the first '.', so
      // "rate_general.update" → "rate_general".
      const prefix = r.action.split(".")[0] ?? r.action;
      prefixSet.add(prefix);
    }
  }
  return {
    targetTypes:    [...targetSet].sort((a, b) => a.localeCompare(b)),
    actionPrefixes: [...prefixSet].sort((a, b) => a.localeCompare(b)),
  };
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  // Sprint-11 P2.3 — widened from super-only to super + ops.
  await requireAdmin(["super", "ops"]);
  const sp = await searchParams;
  const admin = createAdminClient();

  const offset = Math.max(0, parseInt(sp.offset ?? "0", 10) || 0);

  // Resolve admin filter to profile_id first
  let adminFilterId: string | null = null;
  if (sp.admin) {
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("member_code", sp.admin.trim().toUpperCase())
      .maybeSingle<{ id: string }>();
    adminFilterId = profile?.id ?? "__not_found__";
  }

  // Action prefix can come from the dropdown (`action`) OR a free-text
  // override (`action_filter`). Free-text wins when both are set.
  const effectiveActionPrefix = (sp.action_filter ?? sp.action ?? "").trim();

  // Load dropdown options BEFORE the main query — both are admin-only
  // and run on the same admin client.
  const { targetTypes, actionPrefixes } = await loadDistinctOptions(admin);

  let q = admin
    .from("admin_audit_log")
    .select(`id, admin_id, action, target_type, target_id, payload, created_at,
      admin:profiles!admin_id(member_code, first_name, last_name)`, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (adminFilterId)            q = q.eq("admin_id", adminFilterId);
  if (effectiveActionPrefix)    q = q.like("action", `${effectiveActionPrefix}%`);
  if (sp.target_type)           q = q.eq("target_type", sp.target_type.trim());
  if (sp.target_id)             q = q.eq("target_id", sp.target_id.trim());
  if (sp.from)                  q = q.gte("created_at", sp.from.trim());
  if (sp.to) {
    // End-of-day inclusive — pad if it's a bare date.
    const toS = sp.to.trim();
    const padded = /^\d{4}-\d{2}-\d{2}$/.test(toS) ? `${toS}T23:59:59` : toS;
    q = q.lte("created_at", padded);
  }
  // Search box hits target_id substring + payload (jsonb cast to text).
  // PostgREST `or` filter with %wrapping for ilike substring matching.
  if (sp.q && sp.q.trim()) {
    const term = sp.q.trim().replace(/[%,]/g, "\\$&");
    q = q.or(`target_id.ilike.%${term}%,payload::text.ilike.%${term}%`);
  }

  const { data, count } = await q;
  const rows = ((data ?? []) as Row[]).map((r) => ({ ...r, _admin: normAdmin(r.admin) }));
  const totalCount = count ?? 0;
  const pageEnd = Math.min(offset + PAGE_SIZE, offset + rows.length);

  // Build pagination links preserving filters.
  const sharedParams = new URLSearchParams();
  if (sp.admin)         sharedParams.set("admin", sp.admin);
  if (sp.action)        sharedParams.set("action", sp.action);
  if (sp.action_filter) sharedParams.set("action_filter", sp.action_filter);
  if (sp.target_type)   sharedParams.set("target_type", sp.target_type);
  if (sp.target_id)     sharedParams.set("target_id", sp.target_id);
  if (sp.q)             sharedParams.set("q", sp.q);
  if (sp.from)          sharedParams.set("from", sp.from);
  if (sp.to)            sharedParams.set("to", sp.to);

  const prevOffset = Math.max(0, offset - PAGE_SIZE);
  const nextOffset = offset + PAGE_SIZE;
  const hasPrev = offset > 0;
  const hasNext = totalCount > offset + rows.length;

  function pageUrl(o: number): string {
    const p = new URLSearchParams(sharedParams);
    if (o > 0) p.set("offset", String(o));
    else       p.delete("offset");
    const qs = p.toString();
    return `/admin/audit${qs ? `?${qs}` : ""}`;
  }

  // CSV export URL preserves all current filters.
  const exportParams = new URLSearchParams();
  if (sp.admin)               exportParams.set("admin", sp.admin);
  if (effectiveActionPrefix)  exportParams.set("action", effectiveActionPrefix);
  if (sp.target_type)         exportParams.set("target_type", sp.target_type);
  if (sp.target_id)           exportParams.set("target_id", sp.target_id);
  if (sp.q)                   exportParams.set("q", sp.q);
  if (sp.from)                exportParams.set("from", sp.from);
  if (sp.to)                  exportParams.set("to", sp.to);
  exportParams.set("limit", "10000");

  // Top 10 distinct action prefixes (from CURRENT page) for quick chips —
  // helps an admin pivot from "everything" to a specific module.
  const actionCounts = new Map<string, number>();
  for (const r of rows) {
    const prefix = r.action.split(".")[0] ?? r.action;
    actionCounts.set(prefix, (actionCounts.get(prefix) ?? 0) + 1);
  }
  const topActions = [...actionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · audit log</p>
          <h1 className="mt-1 text-2xl font-bold">บันทึกการกระทำของแอดมิน</h1>
          <p className="mt-1 text-sm text-muted">
            ทุก action ที่เรียก <code className="rounded bg-surface-alt px-1 py-0.5 text-[10px]">logAdminAction()</code> ลงในตาราง <code className="rounded bg-surface-alt px-1 py-0.5 text-[10px]">admin_audit_log</code>
          </p>
        </div>
        <Link href="/admin" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">← Admin</Link>
      </div>

      {/* Filter form */}
      <form action="/admin/audit" method="get" className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm grid gap-2 md:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1">
          <span className="text-[10px] text-muted">แอดมิน (member_code)</span>
          <input name="admin" defaultValue={sp.admin ?? ""} placeholder="PR001" className="w-full rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary-500/40" />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] text-muted">action prefix</span>
          <select name="action" defaultValue={sp.action ?? ""} className="w-full rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500/40">
            <option value="">— ทั้งหมด —</option>
            {actionPrefixes.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[10px] text-muted">target_type</span>
          <select name="target_type" defaultValue={sp.target_type ?? ""} className="w-full rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500/40">
            <option value="">— ทั้งหมด —</option>
            {targetTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[10px] text-muted">target_id (เท่ากับ)</span>
          <input name="target_id" defaultValue={sp.target_id ?? ""} placeholder="UUID หรือ slug" className="w-full rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary-500/40" />
        </label>
        <label className="space-y-1 md:col-span-2 lg:col-span-2">
          <span className="text-[10px] text-muted">ค้นหา (target_id substring + payload)</span>
          <input name="q" defaultValue={sp.q ?? ""} placeholder="พิมพ์คำที่อยู่ใน target_id หรือ payload (เช่น PR201, refund_id, …)" className="w-full rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500/40" />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] text-muted">ตั้งแต่ (from)</span>
          <input type="date" name="from" defaultValue={sp.from ?? ""} className="w-full rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500/40" />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] text-muted">ถึง (to)</span>
          <input type="date" name="to" defaultValue={sp.to ?? ""} className="w-full rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500/40" />
        </label>
        <details className="space-y-1 md:col-span-2 lg:col-span-2">
          <summary className="cursor-pointer text-[10px] text-muted hover:text-foreground">▾ action prefix (free-text override)</summary>
          <input name="action_filter" defaultValue={sp.action_filter ?? ""} placeholder="rate_general (override dropdown — exact prefix match)" className="mt-1 w-full rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary-500/40" />
        </details>
        <div className="flex gap-2 md:col-span-2 lg:col-span-2 self-end">
          <button type="submit" className="flex-1 rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600">กรอง</button>
          <a
            href={`/api/admin/audit/export?${exportParams.toString()}`}
            className="rounded-lg border border-border bg-white text-foreground px-4 py-2 text-xs font-medium hover:bg-surface-alt text-center"
            download
          >
            ⬇ CSV (≤10k)
          </a>
        </div>
      </form>

      {/* Quick action-prefix chips from current page */}
      {topActions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted">action ในหน้านี้:</span>
          {topActions.map(([prefix, n]) => (
            <Link
              key={prefix}
              href={`/admin/audit?action=${encodeURIComponent(prefix)}`}
              className={`rounded-full border px-2.5 py-1 ${
                sp.action === prefix ? "bg-primary-500 text-white border-primary-500" : "bg-white border-border hover:bg-surface-alt"
              }`}
            >
              {prefix} <span className="opacity-70">({n})</span>
            </Link>
          ))}
        </div>
      )}

      {/* Rows */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-bold text-sm">
            แสดง {rows.length === 0 ? 0 : offset + 1}–{pageEnd} จาก {totalCount.toLocaleString()} รายการ
          </h2>
          <span className="text-[10px] text-muted">ใหม่ → เก่า · {PAGE_SIZE} ต่อหน้า</span>
        </div>
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่พบ action ตามตัวกรอง</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => {
              const a = (r as Row & { _admin: ReturnType<typeof normAdmin> })._admin;
              const adminLabel = a
                ? `${[a.first_name, a.last_name].filter(Boolean).join(" ") || "—"}${a.member_code ? ` (${a.member_code})` : ""}`
                : r.admin_id.slice(0, 8);
              return (
                <li key={r.id} className="px-5 py-3 space-y-1.5">
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div className="min-w-0">
                      <p className="text-xs">
                        <span className="font-mono font-medium text-primary-700">{r.action}</span>
                        <span className="text-muted"> on </span>
                        <span className="font-mono">{r.target_type}</span>
                        <span className="text-muted">:</span>
                        <span className="font-mono">{r.target_id}</span>
                      </p>
                      <p className="text-[10px] text-muted mt-0.5">
                        โดย <span className="font-medium text-foreground">{adminLabel}</span>
                        {" · "}
                        {new Date(r.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                      </p>
                    </div>
                    <Link
                      href={`/admin/audit?target_type=${encodeURIComponent(r.target_type)}&target_id=${encodeURIComponent(r.target_id)}`}
                      className="text-[10px] text-primary-600 hover:underline shrink-0"
                    >
                      ↗ history of target
                    </Link>
                  </div>
                  {r.payload && Object.keys(r.payload).length > 0 && (
                    <details className="text-[10px]">
                      <summary className="cursor-pointer text-muted hover:text-foreground">payload</summary>
                      <pre className="mt-1 rounded bg-surface-alt/50 p-2 overflow-x-auto font-mono text-[10px] whitespace-pre-wrap break-words">
                        {JSON.stringify(r.payload, null, 2)}
                      </pre>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Pagination */}
        {(hasPrev || hasNext) && (
          <div className="px-5 py-3 border-t border-border flex items-center justify-between text-xs">
            {hasPrev ? (
              <Link href={pageUrl(prevOffset)} className="rounded-lg border border-border px-3 py-1.5 hover:bg-surface-alt">← ก่อนหน้า</Link>
            ) : <span />}
            {hasNext ? (
              <Link href={pageUrl(nextOffset)} className="rounded-lg border border-border px-3 py-1.5 hover:bg-surface-alt">ถัดไป →</Link>
            ) : <span />}
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted">
        Tip: ใช้ <code className="rounded bg-surface-alt px-1 py-0.5">action prefix</code> เช่น <code className="rounded bg-surface-alt px-1 py-0.5">rate_general</code> เพื่อดูทั้ง insert/update/delete; กด ↗ history of target เพื่อดู timeline ของแถวนั้น. ค้นหา free-text จับทั้งใน <code className="rounded bg-surface-alt px-1 py-0.5">target_id</code> และข้อมูลใน <code className="rounded bg-surface-alt px-1 py-0.5">payload</code> JSON.
      </p>
    </main>
  );
}
