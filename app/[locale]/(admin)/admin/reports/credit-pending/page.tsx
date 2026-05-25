import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { AdminDateFilter } from "@/components/admin/date-filter";
import { CsvButton } from "@/components/admin/csv-button";

// V-B1 #2: "เครดิตค้างนำเข้า" — forwarders that shipped/arrived/delivered
// but have NO completed import_payment wallet_transaction yet. Common
// case: cash-on-delivery customer hasn't paid after delivery.

// D1 Phase-B Wave-B5 (sidebar fidelity): sidebar routes 1 SLA queue here
// — เครดิตเกินกำหนด. The page already segments stuck14 (>=14 days) as a
// stat card; the real "overdue" threshold in legacy PHP is not yet
// confirmed (could be per-customer credit_terms vs hardcoded N days), so
// we surface ?sla= as a chip + banner and leave the query untouched
// until the rule is decoded.
const SLA_CFG: Record<string, string> = {
  "overdue": "เครดิตเกินกำหนด",
};

type Profile = { member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null } | null;
type FwdRaw = {
  id: string; f_no: string; status: string; total_price: number; transport_type: string;
  created_at: string; date_shipped_china: string | null;
  profile: Profile | Profile[] | null;
};
type Fwd = Omit<FwdRaw, "profile"> & { profile: Profile };

// Statuses that mean "shipped or beyond" — customer should have paid by these points
const SHIPPED_OR_AFTER = ["shipped_china", "in_transit", "arrived_thailand", "out_for_delivery", "delivered"];

function normP(p: Profile | Profile[] | null): Profile {
  if (!p) return null;
  return Array.isArray(p) ? (p[0] ?? null) : p;
}
function thb(n: number): string {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}
function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export default async function CreditPendingReport({
  searchParams,
}: {
  searchParams: Promise<{ date_from?: string; date_to?: string; sla?: string }>;
}) {
  await requireAdmin(["super", "ops", "accounting"]);
  const sp = await searchParams;
  const slaKey   = sp.sla && SLA_CFG[sp.sla] ? sp.sla : undefined;
  const slaLabel = slaKey ? SLA_CFG[slaKey] : undefined;
  const admin = createAdminClient();

  // 1) Fetch shipped+ forwarders in window
  let fq = admin
    .from("forwarders")
    .select(`id, f_no, status, total_price, transport_type, created_at, date_shipped_china,
      profile:profiles!profile_id(member_code, first_name, last_name, phone)`)
    .in("status", SHIPPED_OR_AFTER)
    .order("created_at", { ascending: true })
    .limit(2000);
  if (sp.date_from) fq = fq.gte("created_at", sp.date_from);
  if (sp.date_to)   fq = fq.lte("created_at", sp.date_to + "T23:59:59");
  const { data: fData, error: fDataErr } = await fq;
  if (fDataErr) {
    console.error(`[forwarders list] failed`, { code: fDataErr.code, message: fDataErr.message });
  }
  const forwarders: Fwd[] = ((fData ?? []) as FwdRaw[]).map((r) => ({ ...r, profile: normP(r.profile) }));
  const fNos = forwarders.map((f) => f.f_no);

  // 2) Fetch wallet_transactions that ALREADY paid these forwarders
  const paidSet = new Set<string>();
  if (fNos.length > 0) {
    const { data: txData, error: txDataErr } = await admin
      .from("wallet_transactions")
      .select("reference_id")
      .eq("reference_type", "forwarder")
      .eq("kind", "import_payment")
      .eq("status", "completed")
      .in("reference_id", fNos);
    if (txDataErr) {
      console.error(`[wallet_transactions list] failed`, { code: txDataErr.code, message: txDataErr.message });
    }
    for (const t of (txData ?? []) as Array<{ reference_id: string | null }>) {
      if (t.reference_id) paidSet.add(t.reference_id);
    }
  }

  // 3) Credit-pending = shipped+ but not yet paid
  const rows = forwarders.filter((f) => !paidSet.has(f.f_no));
  const total = rows.reduce((s, r) => s + Number(r.total_price ?? 0), 0);
  const stuck14 = rows.filter((r) => {
    const ref = r.date_shipped_china ?? r.created_at;
    return daysAgo(ref) >= 14;
  }).length;

  const csvRows = rows.map((r) => ({
    f_no:            r.f_no,
    status:          r.status,
    customer_member: r.profile?.member_code ?? "",
    customer_name:   [r.profile?.first_name, r.profile?.last_name].filter(Boolean).join(" "),
    customer_phone:  r.profile?.phone ?? "",
    total_price:     r.total_price,
    transport:       r.transport_type,
    shipped_at:      r.date_shipped_china ?? "",
    created_at:      r.created_at,
    days_credit:     daysAgo(r.date_shipped_china ?? r.created_at),
  }));
  const csvCols = [
    { key: "f_no",            label: "เลขที่ฝากนำเข้า" },
    { key: "status",          label: "สถานะ" },
    { key: "customer_member", label: "รหัสลูกค้า" },
    { key: "customer_name",   label: "ชื่อลูกค้า" },
    { key: "customer_phone",  label: "เบอร์" },
    { key: "total_price",     label: "ยอดค้างชำระ (บาท)" },
    { key: "transport",       label: "ประเภทขนส่ง" },
    { key: "shipped_at",      label: "วันที่ออกจากจีน" },
    { key: "created_at",      label: "วันที่สร้าง" },
    { key: "days_credit",     label: "เครดิตค้างกี่วัน" },
  ];

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · รีพอร์ตเฉพาะกิจ (V-B1)</p>
          <h1 className="mt-1 text-2xl font-bold">
            เครดิตค้างนำเข้า{slaLabel ? ` — ${slaLabel}` : ""}
          </h1>
          <p className="mt-1 text-sm text-muted">
            ออกจากจีนแล้ว/ถึงไทย/ส่งแล้ว แต่ยังไม่มี wallet_tx <span className="font-mono">import_payment</span> completed
          </p>
        </div>
        <Link href="/admin/reports" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">← กลับรีพอร์ตหลัก</Link>
      </div>

      {slaKey && slaLabel && (
        <>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs text-primary-700">
              SLA: {slaLabel}
              <Link
                href="/admin/reports/credit-pending"
                className="rounded-full bg-white/70 px-1.5 leading-none hover:bg-white"
                aria-label="ล้างตัวกรอง SLA"
              >
                ×
              </Link>
            </span>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            ตัวกรอง SLA: {slaLabel} · กำลังพัฒนาเงื่อนไขกรอง · แสดงทุกรายการในขณะนี้
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-4 justify-between">
        <AdminDateFilter dateFrom={sp.date_from} dateTo={sp.date_to} />
        <CsvButton rows={csvRows} cols={csvCols} filename={`credit-pending-${new Date().toISOString().slice(0,10)}.csv`} />
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Card label="รายการ" value={String(rows.length)} />
        <Card label="ยอดค้างรวม" value={thb(total)} highlight={total > 0} />
        <Card label="ค้าง ≥ 14 วัน" value={String(stuck14)} highlight={stuck14 > 0} />
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">🎉 ไม่มีเครดิตค้าง</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">เลขที่</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">ลูกค้า</th>
                  <th className="px-4 py-3 text-right">ค้างชำระ</th>
                  <th className="px-4 py-3">ออกจีน</th>
                  <th className="px-4 py-3 text-right">เครดิต</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const ref = r.date_shipped_china ?? r.created_at;
                  const age = daysAgo(ref);
                  const ageBadge = age >= 30 ? "bg-red-50 text-red-700 border-red-200"
                    : age >= 14 ? "bg-amber-50 text-amber-700 border-amber-200"
                    : "bg-surface-alt text-muted border-border";
                  return (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-4 py-3 font-mono text-xs">
                        <Link href={`/admin/forwarders/${r.f_no}`} className="text-primary-600 hover:underline">{r.f_no}</Link>
                      </td>
                      <td className="px-4 py-3 text-xs">{r.status}</td>
                      <td className="px-4 py-3 text-xs">
                        <p>{[r.profile?.first_name, r.profile?.last_name].filter(Boolean).join(" ") || "—"}</p>
                        {r.profile?.member_code && <p className="font-mono text-[10px] text-muted">{r.profile.member_code}</p>}
                        {r.profile?.phone && <p className="text-[10px] text-muted">☎ {r.profile.phone}</p>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold">{thb(Number(r.total_price))}</td>
                      <td className="px-4 py-3 text-xs">
                        {r.date_shipped_china ? new Date(r.date_shipped_china).toLocaleDateString("th-TH") : <span className="text-muted">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${ageBadge}`}>
                          {age} วัน
                        </span>
                      </td>
                    </tr>
                  );
                })}
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
