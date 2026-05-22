import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

// Admin audit-log viewer — surfaces every admin_audit_log row written by
// `lib/auth/require-admin.ts::logAdminAction`. Lets super track WHO did
// WHAT to WHICH target WHEN, with the optional JSON payload (before/after
// snapshots, override values, etc).
//
// Filters: admin (member_code) · action prefix · target_type · target_id.
// All optional; combine freely via ?param=value.

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
  action?:      string;    // prefix match e.g. "rate_general" matches insert/update/delete
  target_type?: string;
  target_id?:   string;
  from?:        string;    // YYYY-MM-DD — created_at >=
  to?:          string;    // YYYY-MM-DD — created_at <= (end-of-day)
  limit?:       string;
};

function normAdmin(p: Row["admin"]): { member_code: string | null; first_name: string | null; last_name: string | null } | null {
  if (!p) return null;
  return Array.isArray(p) ? (p[0] ?? null) : p;
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin(["super"]);
  const sp = await searchParams;
  const admin = createAdminClient();

  const limit = Math.min(parseInt(sp.limit ?? "100", 10) || 100, 500);

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

  let q = admin
    .from("admin_audit_log")
    .select(`id, admin_id, action, target_type, target_id, payload, created_at,
      admin:profiles!admin_id(member_code, first_name, last_name)`)
    .order("created_at", { ascending: false })
    .limit(limit);

  // Exact total count — Wave 10.1 follow-up (the count-bug audit pattern
  // from docs/learnings/supabase-rls-patterns.md). Re-apply the same
  // filters to a head:true count query so the chip shows TRUE total when
  // results exceed `limit`.
  let countQ = admin
    .from("admin_audit_log")
    .select("id", { count: "exact", head: true });

  if (adminFilterId)    { q = q.eq("admin_id", adminFilterId); countQ = countQ.eq("admin_id", adminFilterId); }
  if (sp.action)        { q = q.like("action", `${sp.action.trim()}%`); countQ = countQ.like("action", `${sp.action.trim()}%`); }
  if (sp.target_type)   { q = q.eq("target_type", sp.target_type.trim()); countQ = countQ.eq("target_type", sp.target_type.trim()); }
  if (sp.target_id)     { q = q.eq("target_id", sp.target_id.trim()); countQ = countQ.eq("target_id", sp.target_id.trim()); }
  if (sp.from)          { q = q.gte("created_at", sp.from.trim()); countQ = countQ.gte("created_at", sp.from.trim()); }
  if (sp.to) {
    // End-of-day inclusive — pad if it's a bare date.
    const toS = sp.to.trim();
    const padded = /^\d{4}-\d{2}-\d{2}$/.test(toS) ? `${toS}T23:59:59` : toS;
    q = q.lte("created_at", padded);
    countQ = countQ.lte("created_at", padded);
  }

  const { count: totalCount } = await countQ;

  const { data } = await q;
  const rows = ((data ?? []) as Row[]).map((r) => ({ ...r, _admin: normAdmin(r.admin) }));

  // Top 10 distinct action prefixes (from current page) for quick chips
  const actionCounts = new Map<string, number>();
  for (const r of rows) {
    const prefix = r.action.split(".")[0] ?? r.action;
    actionCounts.set(prefix, (actionCounts.get(prefix) ?? 0) + 1);
  }
  const topActions = [...actionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return (
    <main className="p-6 lg:p-8 space-y-5">
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
      <form action="/admin/audit" method="get" className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm grid gap-2 md:grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_auto]">
        <label className="space-y-1">
          <span className="text-[10px] text-muted">แอดมิน (member_code)</span>
          <input name="admin" defaultValue={sp.admin ?? ""} placeholder="PR001" className="w-full rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary-500/40" />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] text-muted">action prefix</span>
          <input name="action" defaultValue={sp.action ?? ""} placeholder="rate_general" className="w-full rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary-500/40" />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] text-muted">target_type</span>
          <input name="target_type" defaultValue={sp.target_type ?? ""} placeholder="forwarder" className="w-full rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary-500/40" />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] text-muted">target_id</span>
          <input name="target_id" defaultValue={sp.target_id ?? ""} placeholder="UUID หรือ slug" className="w-full rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary-500/40" />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] text-muted">ตั้งแต่ (from)</span>
          <input type="date" name="from" defaultValue={sp.from ?? ""} className="w-full rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500/40" />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] text-muted">ถึง (to)</span>
          <input type="date" name="to" defaultValue={sp.to ?? ""} className="w-full rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500/40" />
        </label>
        <div className="flex flex-col gap-1.5 self-end">
          <button type="submit" className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600">กรอง</button>
          <a
            href={`/api/admin/audit/export?${new URLSearchParams(
              Object.entries({
                admin: sp.admin ?? "",
                action: sp.action ?? "",
                target_type: sp.target_type ?? "",
                target_id: sp.target_id ?? "",
                from: sp.from ?? "",
                to: sp.to ?? "",
                limit: "10000",
              }).filter(([, v]) => v !== "") as [string, string][],
            ).toString()}`}
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
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-bold text-sm">{rows.length} รายการ (limit {limit})</h2>
          <span className="text-[10px] text-muted">ใหม่ → เก่า</span>
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
      </div>

      <p className="text-[11px] text-muted">
        Tip: ใช้ <code className="rounded bg-surface-alt px-1 py-0.5">action prefix</code> เช่น <code className="rounded bg-surface-alt px-1 py-0.5">rate_general</code> เพื่อดูทั้ง insert/update/delete; กด ↗ history of target เพื่อดู timeline ของแถวนั้น.
      </p>
    </main>
  );
}
