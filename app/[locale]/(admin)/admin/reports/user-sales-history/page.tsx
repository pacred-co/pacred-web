import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

/**
 * V-G6 #4 entry — /admin/reports/user-sales-history
 *
 * Without a customer_id, show top 50 customers by lifetime value as a
 * launching pad to the drill-down page.
 *
 * With ?q=PR#### or ?q=email substring, redirect to the customer's history.
 */

export const dynamic = "force-dynamic";

function thb(n: number): string {
  return "฿" + Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function UserSalesHistoryEntry({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin(["super", "ops", "accounting", "sales_admin"]);
  const sp = await searchParams;

  const admin = createAdminClient();

  // If q is exact member_code, redirect.
  if (sp.q) {
    const q = sp.q.trim();
    const { data: hit } = await admin
      .from("profiles")
      .select("id, member_code")
      .or(`member_code.ilike.${q},email.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(1)
      .maybeSingle<{ id: string; member_code: string | null }>();
    if (hit) redirect(`/admin/reports/user-sales-history/${hit.member_code ?? hit.id}`);
  }

  // List recent 50 active customers (had a transaction in last 90 days).
  // Cheap heuristic: most-recent forwarders or service_orders.
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 90);
  const sinceIso = since.toISOString();

  const [fwRes, soRes] = await Promise.all([
    admin
      .from("forwarders")
      .select("profile_id, total_price, created_at")
      .gte("created_at", sinceIso)
      .neq("status", "cancelled")
      .limit(5000),
    admin
      .from("service_orders")
      .select("profile_id, total_thb, created_at")
      .gte("created_at", sinceIso)
      .neq("status", "cancelled")
      .limit(5000),
  ]);

  // Aggregate per profile.
  type Agg = { profile_id: string; revenue: number; tx_count: number; last_at: string };
  const aggMap = new Map<string, Agg>();
  for (const r of (fwRes.data ?? []) as Array<{ profile_id: string; total_price: number; created_at: string }>) {
    const a = aggMap.get(r.profile_id) ?? { profile_id: r.profile_id, revenue: 0, tx_count: 0, last_at: r.created_at };
    a.revenue += Number(r.total_price ?? 0);
    a.tx_count += 1;
    if (r.created_at > a.last_at) a.last_at = r.created_at;
    aggMap.set(r.profile_id, a);
  }
  for (const r of (soRes.data ?? []) as Array<{ profile_id: string; total_thb: number; created_at: string }>) {
    const a = aggMap.get(r.profile_id) ?? { profile_id: r.profile_id, revenue: 0, tx_count: 0, last_at: r.created_at };
    a.revenue += Number(r.total_thb ?? 0);
    a.tx_count += 1;
    if (r.created_at > a.last_at) a.last_at = r.created_at;
    aggMap.set(r.profile_id, a);
  }
  const top = Array.from(aggMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 50);

  // Hydrate profile names.
  const ids = top.map((a) => a.profile_id);
  const profileMap = new Map<string, { member_code: string | null; first_name: string | null; last_name: string | null; company_name: string | null }>();
  if (ids.length > 0) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id, member_code, first_name, last_name, company_name")
      .in("id", ids);
    for (const p of (profs ?? []) as Array<{ id: string; member_code: string | null; first_name: string | null; last_name: string | null; company_name: string | null }>) {
      profileMap.set(p.id, p);
    }
  }
  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · REPORTS (V-G6)</p>
          <h1 className="mt-1 text-2xl font-bold">ประวัติยอดขายต่อลูกค้า</h1>
          <p className="mt-1 text-sm text-muted">เลือกลูกค้าจาก Top 50 (90 วันล่าสุด) หรือค้นหาด้วย member_code / email / phone</p>
        </div>
        <Link href="/admin/reports" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
          ← กลับรีพอร์ตหลัก
        </Link>
      </div>

      <form className="flex gap-2" action="/admin/reports/user-sales-history" method="get">
        <input
          name="q"
          placeholder="member_code (PR####), email, หรือ phone"
          className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700">
          ค้นหา
        </button>
      </form>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="font-bold text-sm">Top 50 ลูกค้า (90d) ตาม revenue</h2>
        </div>
        {top.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่มีลูกค้าใน 90 วันล่าสุด</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2">ลำดับ</th>
                <th className="px-4 py-2">ลูกค้า</th>
                <th className="px-4 py-2 text-right">รายการ</th>
                <th className="px-4 py-2 text-right">Revenue</th>
                <th className="px-4 py-2">Last tx</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {top.map((a, i) => {
                const p = profileMap.get(a.profile_id);
                const name = p?.company_name?.trim()
                  || [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim()
                  || "—";
                return (
                  <tr key={a.profile_id} className="border-t border-border">
                    <td className="px-4 py-2 text-xs text-muted">{i + 1}</td>
                    <td className="px-4 py-2">
                      <p className="text-sm">{name}</p>
                      <p className="font-mono text-[10px] text-muted">{p?.member_code ?? a.profile_id.slice(0, 8)}</p>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{a.tx_count}</td>
                    <td className="px-4 py-2 text-right font-mono font-bold">{thb(a.revenue)}</td>
                    <td className="px-4 py-2 text-xs text-muted">
                      {new Date(a.last_at).toLocaleDateString("th-TH")}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link
                        href={`/admin/reports/user-sales-history/${p?.member_code ?? a.profile_id}`}
                        className="text-xs text-primary-500 hover:underline"
                      >
                        ดูประวัติ →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
