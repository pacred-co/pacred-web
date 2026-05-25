import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

/**
 * U4-1 — /admin/system/notifications notification delivery log.
 *
 * Roles: super + ops.
 *
 * Filters: category | severity | recipient (member_code OR profile_id)
 *          | date range (default last 7 days) | delivery_status.
 * Pagination: 50/page via ?offset=N.
 *
 * Pattern mirrors /admin/audit/page.tsx (filter form + table + chip nav).
 *
 * NOTE on delivery_status: rows pre-migration 0070 have NULL. The UI
 * treats NULL as "legacy" — they're displayed as "ส่งแล้ว" if
 * delivered_line_at OR delivered_email_at is set; otherwise "—".
 */
export const dynamic = "force-dynamic";

const CATEGORIES = [
  "order","payment","forwarder","yuan_payment",
  "wallet","sales","system","promo","sales_digest",
] as const;
const SEVERITIES = ["info","success","warning","error"] as const;
const DELIVERY_STATUSES = ["pending","delivered","failed","read"] as const;

const PAGE_SIZE = 50;

const SEVERITY_BADGE: Record<string, string> = {
  info:    "bg-blue-50 text-blue-700 border-blue-200",
  success: "bg-green-50 text-green-700 border-green-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  error:   "bg-red-50 text-red-700 border-red-200",
};

const DELIVERY_BADGE: Record<string, string> = {
  pending:   "bg-gray-50 text-gray-700 border-gray-200",
  delivered: "bg-green-50 text-green-700 border-green-200",
  failed:    "bg-red-50 text-red-700 border-red-200",
  read:      "bg-blue-50 text-blue-700 border-blue-200",
};

type Row = {
  id:                  string;
  profile_id:          string;
  category:            string;
  severity:            string;
  title:               string;
  body:                string;
  link_href:           string | null;
  delivered_line_at:   string | null;
  delivered_email_at:  string | null;
  delivery_status:     string | null;
  delivery_error:      string | null;
  created_at:          string;
  profile?:            { member_code: string | null; first_name: string | null; last_name: string | null } | { member_code: string | null; first_name: string | null; last_name: string | null }[] | null;
  read_state?:         { read_at: string | null }[] | null;
};

type SP = {
  category?:        string;
  severity?:        string;
  recipient?:       string;   // member_code OR profile_id (UUID)
  delivery_status?: string;
  from?:            string;   // YYYY-MM-DD
  to?:              string;   // YYYY-MM-DD
  offset?:          string;
};

function normOne<T>(p: T | T[] | null | undefined): T | null {
  if (!p) return null;
  return Array.isArray(p) ? (p[0] ?? null) : p;
}

function effectiveDelivery(r: Row): string | null {
  if (r.delivery_status) return r.delivery_status;
  // Legacy row — derive from delivered_*_at
  if (r.delivered_line_at || r.delivered_email_at) return "delivered";
  return null;
}

export default async function AdminNotificationsLogPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin(["super", "ops"]);
  const sp = await searchParams;
  const admin = createAdminClient();

  const offset = Math.max(0, parseInt(sp.offset ?? "0", 10) || 0);
  const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

  // Default date range = last 7 days. If user sets either bound,
  // use what they passed (no auto-default — they want full control).
  const userTouched = !!(sp.from || sp.to);
  const today = new Date();
  const defaultFrom = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const fromStr = userTouched ? (sp.from ?? "") : defaultFrom;
  const toStr   = userTouched ? (sp.to   ?? "") : "";

  // Resolve recipient → profile_id
  let recipientFilterId: string | null = null;
  if (sp.recipient) {
    const trimmed = sp.recipient.trim();
    if (isUuid(trimmed)) {
      recipientFilterId = trimmed;
    } else {
      const { data: profile, error: profileErr } = await admin
        .from("profiles")
        .select("id")
        .eq("member_code", trimmed.toUpperCase())
        .maybeSingle<{ id: string }>();
      if (profileErr) {
        console.error(`[profiles list] failed`, { code: profileErr.code, message: profileErr.message });
      }
      recipientFilterId = profile?.id ?? "__not_found__";
    }
  }

  let q = admin
    .from("notifications")
    .select(`id, profile_id, category, severity, title, body, link_href,
      delivered_line_at, delivered_email_at, delivery_status, delivery_error, created_at,
      profile:profiles!profile_id(member_code, first_name, last_name),
      read_state:notification_reads(read_at)`, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (sp.category && (CATEGORIES as readonly string[]).includes(sp.category)) {
    q = q.eq("category", sp.category);
  }
  if (sp.severity && (SEVERITIES as readonly string[]).includes(sp.severity)) {
    q = q.eq("severity", sp.severity);
  }
  if (sp.delivery_status && (DELIVERY_STATUSES as readonly string[]).includes(sp.delivery_status)) {
    q = q.eq("delivery_status", sp.delivery_status);
  }
  if (recipientFilterId) q = q.eq("profile_id", recipientFilterId);
  if (fromStr)           q = q.gte("created_at", fromStr);
  if (toStr) {
    const padded = /^\d{4}-\d{2}-\d{2}$/.test(toStr) ? `${toStr}T23:59:59` : toStr;
    q = q.lte("created_at", padded);
  }

  const { data, count, error } = await q;
  if (error) {
    console.error(`[notifications list] failed`, { code: error.code, message: error.message });
  }
  const rows = (data ?? []) as Row[];
  const totalCount = count ?? 0;
  const pageEnd = Math.min(offset + PAGE_SIZE, offset + rows.length);

  // Build pagination links preserving filters.
  const sharedParams = new URLSearchParams();
  if (sp.category)        sharedParams.set("category",        sp.category);
  if (sp.severity)        sharedParams.set("severity",        sp.severity);
  if (sp.recipient)       sharedParams.set("recipient",       sp.recipient);
  if (sp.delivery_status) sharedParams.set("delivery_status", sp.delivery_status);
  if (userTouched && sp.from) sharedParams.set("from", sp.from);
  if (userTouched && sp.to)   sharedParams.set("to",   sp.to);

  const prevOffset = Math.max(0, offset - PAGE_SIZE);
  const nextOffset = offset + PAGE_SIZE;
  const hasPrev = offset > 0;
  const hasNext = totalCount > offset + rows.length;

  function pageUrl(o: number): string {
    const p = new URLSearchParams(sharedParams);
    if (o > 0) p.set("offset", String(o));
    const qs = p.toString();
    return `/admin/system/notifications${qs ? `?${qs}` : ""}`;
  }

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-6xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · system · U4-1</p>
          <h1 className="mt-1 text-2xl font-bold">Notification delivery log</h1>
          <p className="mt-1 text-sm text-muted">
            ค้นหา notifications ที่ส่งให้ลูกค้า · ดู delivery status · debug LINE/email push.
          </p>
        </div>
        <Link href="/admin" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">← Admin</Link>
      </div>

      <form action="/admin/system/notifications" method="get" className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm grid gap-2 md:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]">
        <label className="space-y-1">
          <span className="text-[10px] text-muted">category</span>
          <select name="category" defaultValue={sp.category ?? ""} className="w-full rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500/40">
            <option value="">— ทั้งหมด —</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[10px] text-muted">severity</span>
          <select name="severity" defaultValue={sp.severity ?? ""} className="w-full rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500/40">
            <option value="">— ทั้งหมด —</option>
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[10px] text-muted">delivery</span>
          <select name="delivery_status" defaultValue={sp.delivery_status ?? ""} className="w-full rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500/40">
            <option value="">— ทั้งหมด —</option>
            {DELIVERY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="space-y-1 md:col-span-1">
          <span className="text-[10px] text-muted">ผู้รับ (member_code หรือ profile_id)</span>
          <input name="recipient" defaultValue={sp.recipient ?? ""} placeholder="PR001 หรือ UUID" className="w-full rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary-500/40" />
        </label>
        <div className="space-y-1 lg:col-span-1 grid grid-cols-2 gap-1">
          <label className="space-y-1">
            <span className="text-[10px] text-muted">จาก</span>
            <input type="date" name="from" defaultValue={fromStr} className="w-full rounded-lg border border-border bg-surface-alt/30 px-2 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500/40" />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-muted">ถึง</span>
            <input type="date" name="to" defaultValue={sp.to ?? ""} className="w-full rounded-lg border border-border bg-surface-alt/30 px-2 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500/40" />
          </label>
        </div>
        <button type="submit" className="self-end rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600">
          กรอง
        </button>
      </form>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-bold text-sm">
            แสดง {rows.length === 0 ? 0 : offset + 1}–{pageEnd} จาก {totalCount.toLocaleString()} รายการ
          </h2>
          <span className="text-[10px] text-muted">ใหม่ → เก่า · {PAGE_SIZE} ต่อหน้า</span>
        </div>
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่พบ notifications ตามตัวกรอง</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => {
              const profile = normOne(r.profile);
              const recipientLabel = profile
                ? `${[profile.first_name, profile.last_name].filter(Boolean).join(" ") || "—"}${profile.member_code ? ` (${profile.member_code})` : ""}`
                : r.profile_id.slice(0, 8);
              const delivery = effectiveDelivery(r);
              const readAt = (r.read_state ?? []).find((s) => s?.read_at)?.read_at ?? null;
              return (
                <li key={r.id} className="px-5 py-3 space-y-1.5">
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap text-xs">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${SEVERITY_BADGE[r.severity] ?? "bg-gray-50 text-gray-700 border-gray-200"}`}>
                          {r.severity}
                        </span>
                        <span className="rounded-full bg-surface-alt px-2 py-0.5 text-[10px] font-mono">{r.category}</span>
                        {delivery ? (
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${DELIVERY_BADGE[delivery] ?? "bg-gray-50 text-gray-700 border-gray-200"}`}>
                            {delivery}
                          </span>
                        ) : (
                          <span className="rounded-full border bg-gray-50 text-gray-500 border-gray-200 px-2 py-0.5 text-[10px]">— legacy —</span>
                        )}
                        {readAt && (
                          <span className="text-[10px] text-blue-700">อ่านแล้ว</span>
                        )}
                      </div>
                      <p className="mt-1 text-sm font-medium truncate">{r.title}</p>
                      <p className="text-xs text-muted line-clamp-2">{r.body}</p>
                      <p className="mt-0.5 text-[10px] text-muted">
                        → <span className="font-medium text-foreground">{recipientLabel}</span>
                        {" · "}
                        {new Date(r.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                        {r.delivered_line_at && <> · 📱 LINE {new Date(r.delivered_line_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</>}
                        {r.delivered_email_at && <> · ✉ email {new Date(r.delivered_email_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</>}
                      </p>
                    </div>
                    {r.link_href && (
                      <code className="rounded bg-surface-alt px-1.5 py-0.5 text-[10px] font-mono text-muted shrink-0">
                        {r.link_href}
                      </code>
                    )}
                  </div>
                  {r.delivery_error && (
                    <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-[10px] text-red-700 font-mono break-words">
                      {r.delivery_error}
                    </p>
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

      <p className="text-[10px] text-muted">
        Tip: rows สร้างก่อน migration 0070 ไม่มี <code>delivery_status</code> — แสดงเป็น &quot;legacy&quot;; ระบบเดาว่า &quot;ส่งแล้ว&quot; ถ้ามี <code>delivered_line_at</code> หรือ <code>delivered_email_at</code>.
      </p>
    </main>
  );
}
