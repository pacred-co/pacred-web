import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CsvButton } from "@/components/admin/csv-button";

/**
 * V-G6 #4 — Per-customer sales history (admin drill-down).
 *
 * Timeline of EVERY transaction for one customer (forwarders + service_orders
 * + yuan_payments) chronologically — for support, audit, lifetime-value
 * understanding.
 *
 * customer_id param = either UUID OR member_code (PR####).
 *
 * PHP ref: report-user-sales.php.
 *
 * Read-only — no schema changes.
 */

export const dynamic = "force-dynamic";

type Profile = {
  id:             string;
  member_code:    string | null;
  first_name:     string | null;
  last_name:      string | null;
  email:          string | null;
  phone:          string | null;
  account_type:   string | null;
  company_name:   string | null;
  sales_admin_id: string | null;
  created_at:     string;
};

type TxRow = {
  kind:        "forwarder" | "service_order" | "yuan_payment";
  ref:         string;             // f_no / h_no / id
  status:      string;
  amount_thb:  number;
  created_at:  string;
  meta:        string;             // free-form summary
  link_href:   string;
};

function thb(n: number): string {
  return "฿" + Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

const KIND_LABEL: Record<TxRow["kind"], string> = {
  forwarder:     "📦 ฝากนำเข้า",
  service_order: "🛒 ฝากสั่ง",
  yuan_payment:  "💴 ฝากโอนหยวน",
};

const KIND_BADGE: Record<TxRow["kind"], string> = {
  forwarder:     "bg-amber-50 text-amber-700 border-amber-200",
  service_order: "bg-blue-50 text-blue-700 border-blue-200",
  yuan_payment:  "bg-purple-50 text-purple-700 border-purple-200",
};

export default async function UserSalesHistoryReport({
  params,
}: {
  params: Promise<{ customer_id: string }>;
}) {
  await requireAdmin(["super", "ops", "accounting", "sales_admin"]);
  const { customer_id } = await params;

  const admin = createAdminClient();

  // Resolve customer_id (UUID or member_code).
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customer_id);
  const q = admin
    .from("profiles")
    .select("id, member_code, first_name, last_name, email, phone, account_type, company_name, sales_admin_id, created_at");
  const { data: profile } = isUuid
    ? await q.eq("id", customer_id).maybeSingle<Profile>()
    : await q.eq("member_code", customer_id).maybeSingle<Profile>();

  if (!profile) notFound();

  // Pull all transaction sources for this profile_id in parallel.
  const [fwRes, soRes, ypRes] = await Promise.all([
    admin
      .from("forwarders")
      .select("f_no, status, total_price, transport_type, source_warehouse, created_at")
      .eq("profile_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(500),
    admin
      .from("service_orders")
      .select("h_no, status, total_thb, item_count, created_at")
      .eq("profile_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(500),
    admin
      .from("yuan_payments")
      .select("id, status, thb_amount, yuan_amount, exchange_rate, channel, created_at")
      .eq("profile_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const transactions: TxRow[] = [];

  for (const r of (fwRes.data ?? []) as Array<{
    f_no: string; status: string; total_price: number;
    transport_type: string; source_warehouse: string; created_at: string;
  }>) {
    transactions.push({
      kind:       "forwarder",
      ref:        r.f_no,
      status:     r.status,
      amount_thb: Number(r.total_price ?? 0),
      created_at: r.created_at,
      meta:       `${r.source_warehouse} · ${r.transport_type}`,
      link_href:  `/admin/forwarders/${r.f_no}`,
    });
  }
  for (const r of (soRes.data ?? []) as Array<{
    h_no: string; status: string; total_thb: number; item_count: number; created_at: string;
  }>) {
    transactions.push({
      kind:       "service_order",
      ref:        r.h_no,
      status:     r.status,
      amount_thb: Number(r.total_thb ?? 0),
      created_at: r.created_at,
      meta:       `${r.item_count} ชิ้น`,
      link_href:  `/admin/service-orders/${r.h_no}`,
    });
  }
  for (const r of (ypRes.data ?? []) as Array<{
    id: string; status: string; thb_amount: number; yuan_amount: number;
    exchange_rate: number; channel: string; created_at: string;
  }>) {
    transactions.push({
      kind:       "yuan_payment",
      ref:        r.id.slice(0, 8),
      status:     r.status,
      amount_thb: Number(r.thb_amount ?? 0),
      created_at: r.created_at,
      meta:       `¥${Number(r.yuan_amount).toFixed(2)} @ ${r.exchange_rate} · ${r.channel}`,
      link_href:  `/admin/yuan-payments/${r.id}`,
    });
  }

  // Sort newest first.
  transactions.sort((a, b) => b.created_at.localeCompare(a.created_at));

  // Totals (skip cancelled / failed).
  const ACTIVE = (s: string) => !["cancelled", "rejected", "failed", "refunded"].includes(s);
  const fwActive = transactions.filter((t) => t.kind === "forwarder"     && ACTIVE(t.status));
  const soActive = transactions.filter((t) => t.kind === "service_order" && ACTIVE(t.status));
  const ypActive = transactions.filter((t) => t.kind === "yuan_payment"  && ACTIVE(t.status));
  const sum = (xs: TxRow[]) => xs.reduce((s, t) => s + t.amount_thb, 0);

  const csvCols = [
    { key: "kind",   label: "ประเภท" },
    { key: "ref",    label: "เลขที่" },
    { key: "status", label: "สถานะ" },
    { key: "amount", label: "ยอด (บาท)" },
    { key: "meta",   label: "หมายเหตุ" },
    { key: "date",   label: "วันที่" },
  ];
  const csvRows = transactions.map((t) => ({
    kind:   KIND_LABEL[t.kind],
    ref:    t.ref,
    status: t.status,
    amount: t.amount_thb.toFixed(2),
    meta:   t.meta,
    date:   t.created_at,
  }));

  const customerName = profile.company_name?.trim()
    || [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim()
    || "—";

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · REPORTS (V-G6)</p>
          <h1 className="mt-1 text-2xl font-bold">
            ประวัติยอดขาย — {customerName}
            <span className="ml-2 font-mono text-xs text-muted">{profile.member_code}</span>
          </h1>
          <p className="mt-1 text-xs text-muted">
            {profile.email && <>{profile.email}</>}
            {profile.email && profile.phone && " · "}
            {profile.phone && <>📞 {profile.phone}</>}
            {profile.account_type === "juristic" && profile.company_name && <> · นิติบุคคล</>}
            {profile.sales_admin_id && <> · Sales rep: <span className="font-mono">{profile.sales_admin_id}</span></>}
            <> · สมาชิกตั้งแต่ {new Date(profile.created_at).toLocaleDateString("th-TH")}</>
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/admin/customers/${profile.id}`}
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs hover:bg-surface-alt"
          >
            ↗ Customer page
          </Link>
          <Link
            href="/admin/reports"
            className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface-alt"
          >
            ← รีพอร์ตหลัก
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label={`📦 ฝากนำเข้า (${fwActive.length})`} value={thb(sum(fwActive))} />
        <Card label={`🛒 ฝากสั่ง (${soActive.length})`}   value={thb(sum(soActive))} />
        <Card label={`💴 ฝากโอน (${ypActive.length})`}   value={thb(sum(ypActive))} />
        <Card label="🎯 รวม lifetime value" value={thb(sum(fwActive) + sum(soActive) + sum(ypActive))} highlight />
      </div>

      <div className="flex justify-end">
        <CsvButton rows={csvRows} cols={csvCols} filename={`user-sales-${profile.member_code ?? profile.id}.csv`} />
      </div>

      {/* Timeline */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {transactions.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ลูกค้านี้ยังไม่มี transaction ใด ๆ</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">วันที่</th>
                <th className="px-3 py-2">ประเภท</th>
                <th className="px-3 py-2">เลขที่</th>
                <th className="px-3 py-2">สถานะ</th>
                <th className="px-3 py-2">หมายเหตุ</th>
                <th className="px-3 py-2 text-right">ยอด</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={`${t.kind}-${t.ref}-${t.created_at}`} className="border-t border-border">
                  <td className="px-3 py-2 text-xs text-muted whitespace-nowrap">
                    {new Date(t.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${KIND_BADGE[t.kind]}`}>
                      {KIND_LABEL[t.kind]}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Link href={t.link_href} className="font-mono text-xs text-primary-600 hover:underline">
                      {t.ref}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-[10px]">{t.status}</td>
                  <td className="px-3 py-2 text-xs text-muted">{t.meta}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{thb(t.amount_thb)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-[10px] text-muted">
        Source: <code>forwarders</code> + <code>service_orders</code> + <code>yuan_payments</code> filtered by profile_id ·
        Lifetime value = ผลรวมยอดของรายการที่ status ≠ cancelled/rejected/failed/refunded
      </p>
    </main>
  );
}

function Card({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border bg-white dark:bg-surface p-4 shadow-sm ${highlight ? "border-primary-200" : "border-border"}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-xl font-bold font-mono ${highlight ? "text-primary-700" : ""}`}>{value}</p>
    </div>
  );
}
