import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  BROADCAST_STATUSES, BROADCAST_STATUS_LABEL,
  BROADCAST_AUDIENCE_LABEL,
  type BroadcastStatus, type BroadcastAudience,
} from "@/lib/validators/broadcast";

/**
 * V-G3 — /admin/broadcasts list.
 *
 * Status filter + create new button + sent/failed counts.
 *
 * Roles: super + sales_admin (per spec §"Open question for ก๊อต" default).
 */

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<BroadcastStatus, string> = {
  draft:     "bg-gray-50 text-gray-600 border-gray-200",
  scheduled: "bg-amber-50 text-amber-700 border-amber-200",
  sending:   "bg-blue-50 text-blue-700 border-blue-200",
  sent:      "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

type Row = {
  id:           string;
  title:        string;
  audience:     BroadcastAudience;
  audience_ids: string[] | null;
  status:       BroadcastStatus;
  sent_count:   number;
  failed_count: number;
  scheduled_for: string | null;
  sent_at:      string | null;
  created_at:   string;
};

export default async function AdminBroadcastsListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin(["super", "sales_admin"]);
  const sp = await searchParams;
  const status = (BROADCAST_STATUSES as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as BroadcastStatus)
    : null;

  const admin = createAdminClient();
  let query = admin
    .from("broadcasts")
    .select("id, title, audience, audience_ids, status, sent_count, failed_count, scheduled_for, sent_at, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status) query = query.eq("status", status);
  const { data: raw, error: rawErr } = await query;
  if (rawErr) {
    console.error(`[broadcasts list] failed`, { code: rawErr.code, message: rawErr.message });
  }
  const rows = (raw ?? []) as Row[];

  // Status counts for chip badges.
  const counts: Record<BroadcastStatus, number> = {} as Record<BroadcastStatus, number>;
  for (const s of BROADCAST_STATUSES) counts[s] = 0;
  const { data: countRows, error: countRowsErr } = await admin.from("broadcasts").select("status");
  if (countRowsErr) {
    console.error(`[broadcasts list] failed`, { code: countRowsErr.code, message: countRowsErr.message });
  }
  for (const r of (countRows ?? []) as Array<{ status: BroadcastStatus }>) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-6xl">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · V-G3</p>
          <h1 className="mt-1 text-2xl font-bold">📢 Broadcasts</h1>
          <p className="text-xs text-muted mt-1">
            push popup ออกหาลูกค้า (in-app + LINE in V-G3.1) — workflow: draft → ส่งทันที / กำหนดเวลา → sent
          </p>
        </div>
        <Link
          href="/admin/broadcasts/new"
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700"
        >
          ➕ สร้าง broadcast ใหม่
        </Link>
      </header>

      {/* Status filter chips */}
      <nav className="flex flex-wrap gap-2">
        <Link
          href="/admin/broadcasts"
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
            status === null ? "bg-primary-600 text-white" : "bg-surface-alt text-foreground hover:bg-surface-alt/80"
          }`}
        >
          ทั้งหมด <span className="ml-1 text-[10px]">({Object.values(counts).reduce((s, n) => s + n, 0)})</span>
        </Link>
        {BROADCAST_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/broadcasts?status=${s}`}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
              s === status ? STATUS_BADGE[s] : "bg-white text-foreground border-border hover:bg-surface-alt"
            }`}
          >
            {BROADCAST_STATUS_LABEL[s]} <span className="ml-1 text-[10px] opacity-75">({counts[s]})</span>
          </Link>
        ))}
      </nav>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">
            ไม่มี broadcasts{status && ` สถานะ "${BROADCAST_STATUS_LABEL[status]}"`}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">หัวข้อ</th>
                <th className="px-3 py-2">ลูกค้าเป้าหมาย</th>
                <th className="px-3 py-2">สถานะ</th>
                <th className="px-3 py-2 text-right">ส่งสำเร็จ</th>
                <th className="px-3 py-2 text-right">ล้มเหลว</th>
                <th className="px-3 py-2">เวลา</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                  <td className="px-3 py-2">
                    <Link href={`/admin/broadcasts/${r.id}`} className="text-sm text-primary-600 hover:underline">
                      {r.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {BROADCAST_AUDIENCE_LABEL[r.audience]}
                    {r.audience === "specific_ids" && r.audience_ids && (
                      <span className="text-muted ml-1">({r.audience_ids.length} คน)</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${STATUS_BADGE[r.status]}`}>
                      {BROADCAST_STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{r.sent_count.toLocaleString()}</td>
                  <td className={`px-3 py-2 text-right font-mono text-xs ${r.failed_count > 0 ? "text-red-700" : "text-muted"}`}>
                    {r.failed_count.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {r.sent_at
                      ? <>ส่ง {new Date(r.sent_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</>
                      : r.scheduled_for
                        ? <>กำหนด {new Date(r.scheduled_for).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</>
                        : <>สร้าง {new Date(r.created_at).toLocaleDateString("th-TH")}</>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-[10px] text-muted">
        V1: in-app notifications (rows in `notifications` table — visible at /notifications). V-G3.1 follow-up: LINE push fan-out + scheduled cron worker.
      </p>
    </main>
  );
}
