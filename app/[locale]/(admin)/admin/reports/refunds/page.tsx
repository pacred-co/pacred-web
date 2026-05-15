import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { AdminDateFilter } from "@/components/admin/date-filter";
import { CsvButton } from "@/components/admin/csv-button";

// V-B1 #5: refunds issued — wallet_transactions kind='refund' completed.
// Defaults to last 30 days when no filter set.

type Profile = { member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null } | null;
type Raw = {
  id: string; profile_id: string; bucket: string; amount: number; status: string;
  reference_type: string | null; reference_id: string | null;
  note: string | null; created_at: string;
  profile: Profile | Profile[] | null;
};
type Row = Omit<Raw, "profile"> & { profile: Profile };

function normP(p: Profile | Profile[] | null): Profile {
  if (!p) return null;
  return Array.isArray(p) ? (p[0] ?? null) : p;
}
function thb(n: number): string {
  return "฿" + Math.abs(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function RefundsReport({
  searchParams,
}: {
  searchParams: Promise<{ date_from?: string; date_to?: string }>;
}) {
  await requireAdmin(["super", "accounting"]);
  const sp = await searchParams;
  const admin = createAdminClient();

  // Default 30-day window if nothing specified
  const defaultFrom = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const dateFrom = sp.date_from ?? defaultFrom;
  const dateTo   = sp.date_to;

  let q = admin
    .from("wallet_transactions")
    .select(`id, profile_id, bucket, amount, status, reference_type, reference_id, note, created_at,
      profile:profiles!profile_id(member_code, first_name, last_name, phone)`)
    .eq("kind", "refund")
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1000);
  q = q.gte("created_at", dateFrom);
  if (dateTo) q = q.lte("created_at", dateTo + "T23:59:59");
  const { data } = await q;

  const rows: Row[] = ((data ?? []) as Raw[]).map((r) => ({ ...r, profile: normP(r.profile) }));
  const total = rows.reduce((s, r) => s + Math.abs(Number(r.amount ?? 0)), 0);
  const byBucket = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.bucket] = (acc[r.bucket] ?? 0) + Math.abs(Number(r.amount ?? 0));
    return acc;
  }, {});

  const csvRows = rows.map((r) => ({
    id:             r.id,
    created_at:     r.created_at,
    member_code:    r.profile?.member_code ?? "",
    name:           [r.profile?.first_name, r.profile?.last_name].filter(Boolean).join(" "),
    phone:          r.profile?.phone ?? "",
    bucket:         r.bucket,
    amount:         Math.abs(Number(r.amount)),
    reference_type: r.reference_type ?? "",
    reference_id:   r.reference_id ?? "",
    note:           r.note ?? "",
  }));
  const csvCols = [
    { key: "created_at",     label: "วันที่" },
    { key: "id",             label: "Tx ID" },
    { key: "member_code",    label: "รหัสลูกค้า" },
    { key: "name",           label: "ชื่อลูกค้า" },
    { key: "phone",          label: "เบอร์" },
    { key: "bucket",         label: "กระเป๋า" },
    { key: "amount",         label: "ยอดคืน (บาท)" },
    { key: "reference_type", label: "ref type" },
    { key: "reference_id",   label: "ref id" },
    { key: "note",           label: "หมายเหตุ" },
  ];

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · รีพอร์ตเฉพาะกิจ (V-B1)</p>
          <h1 className="mt-1 text-2xl font-bold">รายการคืนเงิน</h1>
          <p className="mt-1 text-sm text-muted">
            wallet_transactions ที่ <span className="font-mono">kind=&apos;refund&apos;</span> status=&apos;completed&apos; — default 30 วันล่าสุด
          </p>
        </div>
        <Link href="/admin/reports" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">← กลับรีพอร์ตหลัก</Link>
      </div>

      <div className="flex flex-wrap items-center gap-4 justify-between">
        <AdminDateFilter dateFrom={sp.date_from} dateTo={sp.date_to} />
        <CsvButton rows={csvRows} cols={csvCols} filename={`refunds-${new Date().toISOString().slice(0,10)}.csv`} />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label="จำนวนรายการ" value={String(rows.length)} />
        <Card label="ยอดคืนรวม" value={thb(total)} />
        <Card label="main bucket" value={thb(byBucket.main ?? 0)} />
        <Card label="cashback bucket" value={thb(byBucket.cashback ?? 0)} />
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่มีการคืนเงินในช่วงเวลานี้</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">วันที่</th>
                  <th className="px-4 py-3">ลูกค้า</th>
                  <th className="px-4 py-3 text-right">ยอดคืน</th>
                  <th className="px-4 py-3">กระเป๋า</th>
                  <th className="px-4 py-3">อ้างอิง</th>
                  <th className="px-4 py-3">หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-4 py-3 text-xs">
                      {new Date(r.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <p>{[r.profile?.first_name, r.profile?.last_name].filter(Boolean).join(" ") || "—"}</p>
                      {r.profile?.member_code && <p className="font-mono text-[10px] text-muted">{r.profile.member_code}</p>}
                      {r.profile?.phone && <p className="text-[10px] text-muted">☎ {r.profile.phone}</p>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-green-700">{thb(Number(r.amount))}</td>
                    <td className="px-4 py-3 text-xs">{r.bucket}</td>
                    <td className="px-4 py-3 text-xs">
                      {r.reference_type && r.reference_id ? (
                        <span className="font-mono text-[11px]">{r.reference_type}: {r.reference_id}</span>
                      ) : <span className="text-muted">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted max-w-xs truncate" title={r.note ?? ""}>
                      {r.note ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function Card({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border bg-white dark:bg-surface p-4 shadow-sm ${highlight ? "border-red-200" : "border-border"}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold font-mono ${highlight ? "text-red-700" : ""}`}>{value}</p>
    </div>
  );
}
