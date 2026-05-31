import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { nowMs } from "@/lib/datetime-helpers";
import { BroadcastDetailClient } from "./broadcast-detail-client";

/**
 * /admin/broadcasts/[id] — Pop-up ประกาศ detail (faithful — legacy `tb_notify`).
 *
 * 2026-06-01 — REPOINTED to legacy `tb_notify`. Shows the announcement +
 * a customer preview + how many customers have acknowledged it (count of
 * `tb_notify_read` rows where popid = id), and a delete action.
 */

export const dynamic = "force-dynamic";

type NotifyRow = {
  id:        number;
  title:     string;
  content:   string | null;
  url:       string | null;
  datestart: string | null;
  dateexp:   string | null;
  adminid:   string | null;
};

function looksLikeImage(s: string | null | undefined): boolean {
  if (!s) return false;
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(s) || /^https?:\/\//i.test(s);
}

function fmt(dt: string | null): string {
  if (!dt) return "—";
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return dt;
  return d.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

export default async function AdminBroadcastDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin(["super", "sales_admin"]);
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id) || id <= 0) notFound();

  const admin = createAdminClient();

  const { data: row, error: rowErr } = await admin
    .from("tb_notify")
    .select("id, title, content, url, datestart, dateexp, adminid")
    .eq("id", id)
    .maybeSingle<NotifyRow>();
  if (rowErr) {
    console.error(`[tb_notify lookup] failed`, { code: rowErr.code, message: rowErr.message, id });
    throw new Error(`Failed to load tb_notify (${rowErr.code ?? "unknown"}): ${rowErr.message}`);
  }
  if (!row) notFound();

  // How many customers have acknowledged this popup.
  const { count: readCount, error: readErr } = await admin
    .from("tb_notify_read")
    .select("id", { count: "exact", head: true })
    .eq("popid", id);
  if (readErr) {
    console.error(`[tb_notify_read count] failed`, { code: readErr.code, message: readErr.message, popid: id });
  }

  const now = nowMs();
  const start = row.datestart ? new Date(row.datestart).getTime() : -Infinity;
  const end   = row.dateexp   ? new Date(row.dateexp).getTime()   :  Infinity;
  const active = start <= now && now <= end;
  const expired = now > end;

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/admin/broadcasts" className="text-xs text-primary-500 hover:underline">
            ← กลับหน้ารายการ
          </Link>
          <h1 className="mt-1 text-2xl font-bold">{row.title}</h1>
          <p className="text-xs text-muted">
            รหัส #{row.id}
            {row.adminid && <> · ผู้ทำรายการ {row.adminid}</>}
            {" · "}แสดง {fmt(row.datestart)} → {fmt(row.dateexp)}
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            active
              ? "bg-green-50 text-green-700 border-green-200"
              : expired
                ? "bg-gray-50 text-gray-500 border-gray-200"
                : "bg-amber-50 text-amber-700 border-amber-200"
          }`}
        >
          {active ? "กำลังแสดง" : expired ? "หมดอายุ" : "รอแสดง"}
        </span>
      </div>

      {/* Customer preview */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3">
        <h2 className="font-bold text-sm">ตัวอย่างที่ลูกค้าจะเห็น</h2>
        <div className="rounded-lg border border-primary-300 bg-primary-50/40 p-4 space-y-2">
          <p className="font-bold">{row.title}</p>
          {looksLikeImage(row.content) ? (
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={row.content!} alt={row.title} className="rounded border border-border max-w-full" style={{ maxHeight: 240 }} />
            </div>
          ) : row.content ? (
            <p className="text-sm whitespace-pre-line">{row.content}</p>
          ) : (
            <p className="text-xs text-muted italic">(ไม่มีข้อความ/รูป)</p>
          )}
          {row.url && (
            <p className="text-xs">
              ปุ่ม &quot;ดูรายละเอียด&quot; → <code className="text-[10px] font-mono">{row.url}</code>
            </p>
          )}
        </div>
      </section>

      {/* Acknowledge stats */}
      <section className="rounded-2xl border border-green-200 bg-green-50/40 p-5">
        <h2 className="font-bold text-sm mb-3">📊 การรับทราบ</h2>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="ลูกค้ากดรับทราบแล้ว" value={(readCount ?? 0).toLocaleString()} highlight />
          <Stat label="กลุ่มเป้าหมาย" value="ลูกค้าทุกคน" />
        </div>
      </section>

      <BroadcastDetailClient id={row.id} title={row.title} />
    </main>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 bg-white ${highlight ? "border-primary-200" : "border-border"}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-xl font-bold ${highlight ? "text-primary-700 font-mono" : ""}`}>{value}</p>
    </div>
  );
}
