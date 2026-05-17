import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  BROADCAST_STATUS_LABEL,
  BROADCAST_AUDIENCE_LABEL,
  type BroadcastStatus, type BroadcastAudience,
} from "@/lib/validators/broadcast";
import { BroadcastDetailClient } from "./broadcast-detail-client";

/**
 * V-G3 — /admin/broadcasts/[id] detail.
 *
 * Status-aware actions: draft → send-now / schedule / cancel;
 * scheduled → send-now (override) / cancel; sent → read-only stats.
 */

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<BroadcastStatus, string> = {
  draft:     "bg-gray-50 text-gray-600 border-gray-200",
  scheduled: "bg-amber-50 text-amber-700 border-amber-200",
  sending:   "bg-blue-50 text-blue-700 border-blue-200",
  sent:      "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

type BroadcastRow = {
  id:               string;
  title:            string;
  body:             string;
  link_href:        string | null;
  audience:         BroadcastAudience;
  audience_ids:     string[] | null;
  status:           BroadcastStatus;
  sent_count:       number;
  failed_count:     number;
  scheduled_for:    string | null;
  sent_at:          string | null;
  cancelled_at:     string | null;
  cancelled_reason: string | null;
  created_at:       string;
};

export default async function AdminBroadcastDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin(["super", "sales_admin"]);
  const { id } = await params;
  const admin = createAdminClient();

  const { data: bc } = await admin
    .from("broadcasts")
    .select(`
      id, title, body, link_href, audience, audience_ids, status,
      sent_count, failed_count, scheduled_for, sent_at, cancelled_at,
      cancelled_reason, created_at
    `)
    .eq("id", id)
    .maybeSingle<BroadcastRow>();
  if (!bc) notFound();

  // Read stats: if sent, count how many of the resulting notifications were
  // actually read (via existing notification_reads table).
  let readCount = 0;
  if (bc.status === "sent" && bc.sent_count > 0) {
    const { count } = await admin
      .from("notification_reads")
      .select("notification_id, notifications!inner(broadcast_id)", { count: "exact", head: true })
      .eq("notifications.broadcast_id", id);
    readCount = count ?? 0;
  }

  const readRatePct = bc.sent_count > 0 ? Math.round((readCount / bc.sent_count) * 100) : 0;

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/admin/broadcasts" className="text-xs text-primary-500 hover:underline">
            ← กลับหน้ารายการ
          </Link>
          <h1 className="mt-1 text-2xl font-bold">{bc.title}</h1>
          <p className="text-xs text-muted">
            สร้าง {new Date(bc.created_at).toLocaleString("th-TH")}
            {bc.scheduled_for && <> · กำหนด {new Date(bc.scheduled_for).toLocaleString("th-TH")}</>}
            {bc.sent_at       && <> · ส่ง {new Date(bc.sent_at).toLocaleString("th-TH")}</>}
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_BADGE[bc.status]}`}>
          {BROADCAST_STATUS_LABEL[bc.status]}
        </span>
      </div>

      {/* Content preview */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3">
        <h2 className="font-bold text-sm">ตัวอย่างที่ลูกค้าจะเห็น</h2>
        <div className="rounded-lg border border-primary-300 bg-primary-50/40 p-4 space-y-2">
          <p className="font-bold">{bc.title}</p>
          <p className="text-sm whitespace-pre-line">{bc.body}</p>
          {bc.link_href && (
            <p className="text-xs">
              ลิงก์: <code className="text-[10px] font-mono">{bc.link_href}</code>
            </p>
          )}
        </div>
      </section>

      {/* Audience */}
      <section className="rounded-2xl border border-border bg-surface-alt/30 p-5 space-y-1 text-xs">
        <h2 className="font-bold text-sm mb-2">กลุ่มลูกค้า</h2>
        <p>เป้าหมาย: <strong>{BROADCAST_AUDIENCE_LABEL[bc.audience]}</strong></p>
        {bc.audience === "specific_ids" && bc.audience_ids && (
          <details className="mt-1">
            <summary className="cursor-pointer text-primary-500 hover:underline">
              ดูรายชื่อ ({bc.audience_ids.length} คน)
            </summary>
            <ul className="mt-2 max-h-40 overflow-y-auto font-mono text-[10px] space-y-0.5">
              {bc.audience_ids.map((uid) => <li key={uid}>{uid}</li>)}
            </ul>
          </details>
        )}
      </section>

      {/* Stats (only meaningful for sent) */}
      {bc.status === "sent" && (
        <section className="rounded-2xl border border-green-200 bg-green-50/40 p-5">
          <h2 className="font-bold text-sm mb-3">📊 สถิติการส่ง</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="ส่งสำเร็จ" value={bc.sent_count.toLocaleString()} highlight />
            <Stat label="ส่งไม่สำเร็จ" value={bc.failed_count.toLocaleString()} danger={bc.failed_count > 0} />
            <Stat label="อ่านแล้ว" value={readCount.toLocaleString()} />
            <Stat label="อัตราเปิดอ่าน" value={`${readRatePct}%`} highlight />
          </div>
        </section>
      )}

      {/* Cancelled */}
      {bc.status === "cancelled" && bc.cancelled_reason && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <strong>ยกเลิก:</strong> {bc.cancelled_reason}
          {bc.cancelled_at && (
            <p className="text-xs text-muted mt-1">เมื่อ {new Date(bc.cancelled_at).toLocaleString("th-TH")}</p>
          )}
        </div>
      )}

      {/* Action zone (client) */}
      <BroadcastDetailClient
        id={bc.id}
        status={bc.status}
      />
    </main>
  );
}

function Stat({ label, value, highlight, danger }: { label: string; value: string; highlight?: boolean; danger?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 bg-white ${
      danger     ? "border-red-200" :
      highlight  ? "border-primary-200" :
                   "border-border"
    }`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-xl font-bold font-mono ${
        danger     ? "text-red-700" :
        highlight  ? "text-primary-700" :
                     ""
      }`}>{value}</p>
    </div>
  );
}
