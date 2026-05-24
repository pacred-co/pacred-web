import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { RetryDispatchButton } from "./retry-button";

/**
 * Sprint-11 P2.3.B — /admin/notifications/dispatch
 *
 * Focused supervisory page on notification DISPATCH status — failed,
 * pending, and recently-delivered pushes to LINE Notify / Messaging API /
 * email. Companion to the broader /admin/system/notifications log
 * (which lists every notification ever sent).
 *
 * Purpose: an operator on call sees "last N failures" + retries them
 * one click. The retry doesn't re-push synchronously — it resets the
 * row so the dispatch-line-notify cron picks it up on the next 2-min
 * tick (matches the existing failure-recovery pattern in
 * /api/cron/dispatch-line-notify).
 *
 * Filters:
 *   - status   — pending | sent | failed | all (default: failed first)
 *   - channel  — line_notify | line_messaging | email | in_app
 *   - date range (from / to)
 *
 * Pagination: 50/page via ?offset=N.
 *
 * RBAC: super + ops.
 */
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const STATUSES = ["failed", "pending", "sent", "all"] as const;
type Status = (typeof STATUSES)[number];

// Channel → semantic. The DB doesn't store a single "channel" column
// (one row can be pushed to multiple channels), so we DERIVE the channel
// filter by looking at the corresponding *_at + *_error columns.
const CHANNELS = ["line_notify", "line_messaging", "email", "in_app"] as const;
type Channel = (typeof CHANNELS)[number];

const CHANNEL_LABEL: Record<Channel, string> = {
  line_notify:     "LINE Notify",
  line_messaging:  "LINE Messaging API",
  email:           "Email",
  in_app:          "In-app",
};

type Row = {
  id:                       string;
  profile_id:               string;
  category:                 string;
  severity:                 string;
  title:                    string;
  body:                     string;
  link_href:                string | null;
  delivered_line_at:        string | null;
  delivered_email_at:       string | null;
  delivered_line_notify_at: string | null;
  delivery_status:          string | null;
  delivery_error:           string | null;
  last_delivery_error:      string | null;
  delivery_attempts:        number | null;
  created_at:               string;
  profile?:                 { member_code: string | null; first_name: string | null; last_name: string | null } | { member_code: string | null; first_name: string | null; last_name: string | null }[] | null;
};

type SP = {
  status?:  string;
  channel?: string;
  from?:    string;
  to?:      string;
  offset?:  string;
};

function normOne<T>(p: T | T[] | null | undefined): T | null {
  if (!p) return null;
  return Array.isArray(p) ? (p[0] ?? null) : p;
}

/**
 * Resolve which channel statuses to surface on the row.
 *
 * - "line_notify" push lives on `delivered_line_notify_at` (success) +
 *   `last_delivery_error` (transient/perm fail) + `delivery_attempts`
 *   (retry counter capped at MAX_FAILED_ATTEMPTS=5 in the cron).
 * - "line_messaging" push (via @pacred OA) lives on `delivered_line_at`.
 *   No per-row error column — failures flagged via `delivery_status`.
 * - "email" lives on `delivered_email_at`.
 * - "in_app" = the notifications row itself (always created); display
 *   purposes only.
 */
function rowChannelStatus(r: Row, ch: Channel): "sent" | "failed" | "pending" {
  if (ch === "line_notify") {
    // Stamped delivered + no error → success.
    if (r.delivered_line_notify_at && !r.last_delivery_error) return "sent";
    // Stamped delivered + has error string = permanent fail in cron.
    if (r.delivered_line_notify_at && r.last_delivery_error) return "failed";
    // (delivery_attempts ?? 0) >= 5 = giveup (cron stamps both — already
    // covered by branch above), so we fall through to pending.
    return "pending";
  }
  if (ch === "line_messaging") {
    if (r.delivered_line_at) return "sent";
    if (r.delivery_status === "failed") return "failed";
    return "pending";
  }
  if (ch === "email") {
    if (r.delivered_email_at) return "sent";
    if (r.delivery_status === "failed") return "failed";
    return "pending";
  }
  // in_app — always "sent" the moment the row exists.
  return "sent";
}

const STATUS_BADGE: Record<"sent" | "failed" | "pending", string> = {
  sent:    "bg-green-50 text-green-700 border-green-200",
  failed:  "bg-red-50 text-red-700 border-red-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
};

export default async function AdminNotificationsDispatchPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin(["super", "ops"]);
  const sp = await searchParams;
  const admin = createAdminClient();

  // Default to failed (= what an on-call operator opens this page for).
  const status: Status =
    (STATUSES as readonly string[]).includes(sp.status ?? "")
      ? (sp.status as Status)
      : "failed";

  const channel: Channel | "all" =
    (CHANNELS as readonly string[]).includes(sp.channel ?? "")
      ? (sp.channel as Channel)
      : "all";

  const offset = Math.max(0, parseInt(sp.offset ?? "0", 10) || 0);

  let q = admin
    .from("notifications")
    .select(
      `id, profile_id, category, severity, title, body, link_href,
       delivered_line_at, delivered_email_at, delivered_line_notify_at,
       delivery_status, delivery_error, last_delivery_error, delivery_attempts,
       created_at,
       profile:profiles!profile_id(member_code, first_name, last_name)`,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  // Status filter — the DB columns differ per channel, so we translate
  // the requested status into a postgrest predicate that matches ALL
  // channels (admin sees rows where ANY channel has the requested
  // status — channel filter narrows further below).
  if (status === "failed") {
    // Failed = explicit failure marker on EITHER channel.
    q = q.or(
      `delivery_status.eq.failed,last_delivery_error.not.is.null`,
    );
  } else if (status === "sent") {
    // Sent = delivered on at least one channel.
    q = q.or(
      `delivered_line_at.not.is.null,delivered_email_at.not.is.null,delivered_line_notify_at.not.is.null,delivery_status.eq.delivered,delivery_status.eq.read`,
    );
  } else if (status === "pending") {
    // Pending = no success markers AND no failure marker. The cleanest
    // predicate is delivery_status=pending OR (NULL + no delivered_*).
    // We approximate via the dedicated column — the dispatch cron writes
    // it on every scan.
    q = q.or(`delivery_status.eq.pending,delivery_status.is.null`);
  }
  // status === "all" — no filter.

  if (sp.from) q = q.gte("created_at", sp.from.trim());
  if (sp.to) {
    const t = /^\d{4}-\d{2}-\d{2}$/.test(sp.to.trim()) ? `${sp.to.trim()}T23:59:59` : sp.to.trim();
    q = q.lte("created_at", t);
  }

  const { data, count } = await q;
  const allRows = (data ?? []) as Row[];
  const totalCount = count ?? 0;

  // Channel filter is a row-level POST filter — we already pulled the row
  // from the DB (couldn't do this server-side cleanly because per-channel
  // status is a derivation, not a column). Cheap on a 50-row page.
  const rows = channel === "all"
    ? allRows
    : allRows.filter((r) => rowChannelStatus(r, channel) === status || status === "all");

  const pageEnd = Math.min(offset + PAGE_SIZE, offset + allRows.length);

  // Build pagination links preserving filters.
  const sharedParams = new URLSearchParams();
  if (sp.status)  sharedParams.set("status",  sp.status);
  if (sp.channel) sharedParams.set("channel", sp.channel);
  if (sp.from)    sharedParams.set("from",    sp.from);
  if (sp.to)      sharedParams.set("to",      sp.to);

  function pageUrl(o: number): string {
    const p = new URLSearchParams(sharedParams);
    if (o > 0) p.set("offset", String(o));
    else       p.delete("offset");
    const qs = p.toString();
    return `/admin/notifications/dispatch${qs ? `?${qs}` : ""}`;
  }

  const prevOffset = Math.max(0, offset - PAGE_SIZE);
  const nextOffset = offset + PAGE_SIZE;
  const hasPrev = offset > 0;
  const hasNext = totalCount > offset + allRows.length;

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-6xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · notifications · dispatch</p>
          <h1 className="mt-1 text-2xl font-bold">Dispatch supervisor</h1>
          <p className="mt-1 text-sm text-muted">
            ตรวจ notifications ที่ส่งล้มเหลว · กด retry เพื่อให้ cron <code className="rounded bg-surface-alt px-1 py-0.5 text-[10px]">/api/cron/dispatch-line-notify</code> ลองส่งใหม่ในรอบถัดไป (~2 นาที).
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/system/notifications" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">ดู log ทั้งหมด →</Link>
          <Link href="/admin" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">← Admin</Link>
        </div>
      </div>

      {/* Filter form */}
      <form action="/admin/notifications/dispatch" method="get" className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm grid gap-2 md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
        <label className="space-y-1">
          <span className="text-[10px] text-muted">status</span>
          <select name="status" defaultValue={status} className="w-full rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500/40">
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[10px] text-muted">channel</span>
          <select name="channel" defaultValue={channel} className="w-full rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500/40">
            <option value="all">— ทั้งหมด —</option>
            {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[10px] text-muted">ตั้งแต่</span>
          <input type="date" name="from" defaultValue={sp.from ?? ""} className="w-full rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500/40" />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] text-muted">ถึง</span>
          <input type="date" name="to" defaultValue={sp.to ?? ""} className="w-full rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500/40" />
        </label>
        <button type="submit" className="self-end rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600">
          กรอง
        </button>
      </form>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-bold text-sm">
            แสดง {allRows.length === 0 ? 0 : offset + 1}–{pageEnd} จาก {totalCount.toLocaleString()} รายการ
            {channel !== "all" && (
              <span className="ml-2 text-xs font-normal text-muted">(channel: {CHANNEL_LABEL[channel]})</span>
            )}
          </h2>
          <span className="text-[10px] text-muted">ใหม่ → เก่า · {PAGE_SIZE} ต่อหน้า</span>
        </div>
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">
            {status === "failed"
              ? "ไม่มี dispatch ล้มเหลว · ระบบส่ง notification ปกติทุก channel"
              : "ไม่พบ rows ตามตัวกรอง"}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => {
              const profile = normOne(r.profile);
              const recipientLabel = profile
                ? `${[profile.first_name, profile.last_name].filter(Boolean).join(" ") || "—"}${profile.member_code ? ` (${profile.member_code})` : ""}`
                : r.profile_id.slice(0, 8);
              const lineNotifyStatus    = rowChannelStatus(r, "line_notify");
              const lineMessagingStatus = rowChannelStatus(r, "line_messaging");
              const emailStatus         = rowChannelStatus(r, "email");
              // Retry button only when LINE Notify channel failed
              // (it's the only channel whose retry has a wired cron).
              const canRetry = lineNotifyStatus === "failed" || (lineNotifyStatus === "pending" && (r.delivery_attempts ?? 0) >= 5);
              const errorMsg = r.last_delivery_error ?? r.delivery_error ?? null;
              return (
                <li key={r.id} className="px-5 py-3 space-y-1.5">
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap text-xs">
                        <span className="rounded-full bg-surface-alt px-2 py-0.5 text-[10px] font-mono">{r.category}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${STATUS_BADGE[lineNotifyStatus]}`} title="LINE Notify channel">
                          LN · {lineNotifyStatus}
                        </span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${STATUS_BADGE[lineMessagingStatus]}`} title="LINE Messaging API channel">
                          LM · {lineMessagingStatus}
                        </span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${STATUS_BADGE[emailStatus]}`} title="Email channel">
                          ✉ · {emailStatus}
                        </span>
                        {(r.delivery_attempts ?? 0) > 0 && (
                          <span className="rounded-full border bg-gray-50 text-gray-700 border-gray-200 px-2 py-0.5 text-[10px]" title="LINE Notify retry counter (cap 5)">
                            attempts: {r.delivery_attempts}/5
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm font-medium truncate">{r.title}</p>
                      <p className="text-xs text-muted line-clamp-2">{r.body}</p>
                      <p className="mt-0.5 text-[10px] text-muted">
                        → <span className="font-medium text-foreground">{recipientLabel}</span>
                        {" · "}
                        {new Date(r.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                        {r.delivered_line_notify_at && <> · LN ✓ {new Date(r.delivered_line_notify_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</>}
                        {r.delivered_line_at && <> · LM ✓ {new Date(r.delivered_line_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</>}
                        {r.delivered_email_at && <> · ✉ ✓ {new Date(r.delivered_email_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</>}
                      </p>
                    </div>
                    {canRetry && <RetryDispatchButton notificationId={r.id} />}
                  </div>
                  {errorMsg && (
                    <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-[10px] text-red-700 font-mono break-words">
                      {errorMsg}
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
        Retry: รีเซ็ต <code>delivery_attempts</code> + เคลียร์ <code>delivered_line_notify_at</code> ของแถวนั้น → cron <code>dispatch-line-notify</code> เก็บแถวนี้กลับเข้าคิวรอบถัดไป (~2 นาที). ไม่ push ทันทีจาก admin UI เพื่อไม่ให้ผูก UI กับ latency ของ LINE upstream.
      </p>
    </main>
  );
}
