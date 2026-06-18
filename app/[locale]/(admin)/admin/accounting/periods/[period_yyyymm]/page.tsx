import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin, isGodRole } from "@/lib/auth/require-admin";
import {
  ACCOUNTING_PERIOD_STATUS_LABEL,
  type AccountingPeriodStatus,
  yyyymmSchema,
} from "@/lib/validators/accounting-period";
import { PeriodDetailActions } from "./period-detail-actions";

/**
 * V-E9 — /admin/accounting/periods/[period_yyyymm] detail.
 *
 * Per-period drill-down:
 *   - Header: status + open/close timeline
 *   - Snapshot ledger: full period_close_event history for this period
 *     (one row per (table, close-event) — re-closes append)
 *   - Action zone (client): mark-closing / close / reopen depending on
 *     status + role
 *
 * Roles: super + accounting + ops (ops read-only).
 */

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<AccountingPeriodStatus, string> = {
  open:    "bg-blue-50 text-blue-700 border-blue-200",
  closing: "bg-amber-50 text-amber-700 border-amber-200",
  closed:  "bg-red-50 text-red-700 border-red-200",
};

type PeriodRow = {
  period_yyyymm:        string;
  status:               AccountingPeriodStatus;
  opened_at:            string;
  closing_marked_at:    string | null;
  closed_at:            string | null;
  closing_notes:        string | null;
  reopened_at:          string | null;
  reopened_reason:      string | null;
  opened_by_profile:    { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
  closed_by_profile:    { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
  reopened_by_profile:  { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
};

type EventRow = {
  id:                   string;
  table_name:           string;
  row_count:            number;
  sum_thb:              number | null;
  sum_label:            string | null;
  closed_at:            string;
  closed_by_profile:    { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
};

function formatYyyymm(yyyymm: string): string {
  const year  = yyyymm.slice(0, 4);
  const month = yyyymm.slice(4, 6);
  const monthNames = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
  ];
  const m = Number.parseInt(month, 10);
  const monthName = monthNames[m - 1] ?? month;
  const beYear = Number.parseInt(year, 10) + 543;
  return `${monthName} ${beYear}`;
}

function profileName(p: PeriodRow["closed_by_profile"]): string {
  if (!p) return "—";
  const single = Array.isArray(p) ? p[0] : p;
  if (!single) return "—";
  return `${single.first_name ?? ""} ${single.last_name ?? ""}`.trim() || "—";
}

function thb(n: number | null): string {
  if (n == null) return "—";
  return "฿" + Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function AdminAccountingPeriodDetailPage({
  params,
}: {
  params: Promise<{ period_yyyymm: string }>;
}) {
  const { roles } = await requireAdmin(["super", "accounting", "ops"]);
  const canWrite  = isGodRole(roles) || roles.includes("accounting");
  const canReopen = isGodRole(roles);

  const { period_yyyymm } = await params;
  const parsed = yyyymmSchema.safeParse(period_yyyymm);
  if (!parsed.success) notFound();

  const admin = createAdminClient();

  const { data: period, error: periodErr } = await admin
    .from("accounting_periods")
    .select(`
      period_yyyymm, status, opened_at, closing_marked_at, closed_at, closing_notes,
      reopened_at, reopened_reason,
      opened_by_profile:profiles!opened_by_admin_id ( first_name, last_name ),
      closed_by_profile:profiles!closed_by_admin_id ( first_name, last_name ),
      reopened_by_profile:profiles!reopened_by_admin_id ( first_name, last_name )
    `)
    .eq("period_yyyymm", parsed.data)
    .maybeSingle<PeriodRow>();
  if (periodErr) {
    console.error(`[accounting_periods lookup] failed`, { code: periodErr.code, message: periodErr.message, details: periodErr.details, hint: periodErr.hint });
    throw new Error(`Failed to load accounting_periods (${periodErr.code ?? "unknown"}): ${periodErr.message}`);
  }
  if (!period) notFound();

  const { data: eventsRaw, error: eventsRawErr } = await admin
    .from("period_close_event")
    .select(`
      id, table_name, row_count, sum_thb, sum_label, closed_at,
      closed_by_profile:profiles!closed_by_admin_id ( first_name, last_name )
    `)
    .eq("period_yyyymm", parsed.data)
    .order("closed_at", { ascending: false });
  if (eventsRawErr) {
    console.error(`[period_close_event list] failed`, { code: eventsRawErr.code, message: eventsRawErr.message });
  }
  const events = (eventsRaw ?? []) as unknown as EventRow[];

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/admin/accounting/periods" className="text-xs text-primary-500 hover:underline">
            ← กลับหน้ารายการ
          </Link>
          <h1 className="mt-1 text-2xl font-bold">งวด {formatYyyymm(period.period_yyyymm)}</h1>
          <p className="font-mono text-xs text-muted">{period.period_yyyymm}</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_BADGE[period.status]}`}>
          {ACCOUNTING_PERIOD_STATUS_LABEL[period.status]}
        </span>
      </div>

      {/* Timeline */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-2 text-xs">
        <h2 className="font-bold text-sm mb-2">เส้นเวลา</h2>
        <p>
          <strong>เปิดงวด:</strong> {new Date(period.opened_at).toLocaleString("th-TH")} โดย {profileName(period.opened_by_profile)}
        </p>
        {period.closing_marked_at && (
          <p>
            <strong>ทำเครื่องหมายกำลังปิด:</strong> {new Date(period.closing_marked_at).toLocaleString("th-TH")}
          </p>
        )}
        {period.closed_at && (
          <p>
            <strong>ปิดงวด:</strong> {new Date(period.closed_at).toLocaleString("th-TH")} โดย {profileName(period.closed_by_profile)}
          </p>
        )}
        {period.closing_notes && (
          <p className="mt-2 rounded-lg bg-surface-alt/50 p-3">
            <strong>หมายเหตุ:</strong> {period.closing_notes}
          </p>
        )}
        {period.reopened_at && (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
            <strong>⚠️ เปิดใหม่:</strong> {new Date(period.reopened_at).toLocaleString("th-TH")} โดย {profileName(period.reopened_by_profile)}
            <br />
            <strong>เหตุผล:</strong> {period.reopened_reason}
          </p>
        )}
      </section>

      {/* Snapshot ledger */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-surface-alt/30">
          <h2 className="font-bold text-sm">📊 Snapshot ตอนปิดงวด ({events.length} รายการ)</h2>
          <p className="text-[10px] text-muted mt-0.5">
            แต่ละครั้งที่ปิดงวด ระบบจะสร้าง snapshot ต่อตารางการเงิน (4 ตาราง) · re-close จะเพิ่มแถวใหม่ (ไม่ทับของเดิม)
          </p>
        </div>
        {events.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">
            ยังไม่ได้ปิดงวด · ปิดงวดจะสร้าง snapshot ของ 4 ตาราง: tax_invoices · freight_invoices · freight_invoice_payments · wallet_transactions
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-surface-alt/50 text-left uppercase tracking-wide text-[10px] text-muted">
              <tr>
                <th className="px-3 py-2">ตาราง</th>
                <th className="px-3 py-2 text-right">จำนวนแถว</th>
                <th className="px-3 py-2 text-right">รวม (THB)</th>
                <th className="px-3 py-2">คอลัมน์ที่รวม</th>
                <th className="px-3 py-2">ปิดเมื่อ</th>
                <th className="px-3 py-2">ปิดโดย</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-t border-border">
                  <td className="px-3 py-2 font-mono">{e.table_name}</td>
                  <td className="px-3 py-2 text-right font-mono">{e.row_count.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-mono">{thb(e.sum_thb)}</td>
                  <td className="px-3 py-2 text-muted">{e.sum_label ?? "—"}</td>
                  <td className="px-3 py-2 text-muted">{new Date(e.closed_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="px-3 py-2 text-muted">{profileName(e.closed_by_profile)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Action zone (client) */}
      <PeriodDetailActions
        period_yyyymm={period.period_yyyymm}
        status={period.status}
        canWrite={canWrite}
        canReopen={canReopen}
      />
    </main>
  );
}
