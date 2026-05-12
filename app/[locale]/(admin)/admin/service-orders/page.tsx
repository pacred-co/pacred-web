import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-gray-50 text-gray-700 border-gray-200",
  awaiting_payment: "bg-yellow-50 text-yellow-700 border-yellow-200",
  ordered: "bg-blue-50 text-blue-700 border-blue-200",
  awaiting_chn_dispatch: "bg-indigo-50 text-indigo-700 border-indigo-200",
  completed: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "รอ", awaiting_payment: "รอชำระ", ordered: "สั่งแล้ว",
  awaiting_chn_dispatch: "รอจัดส่ง", completed: "สำเร็จ", cancelled: "ยกเลิก",
};

export default async function AdminServiceOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const admin = createAdminClient();

  let q = admin
    .from("service_orders")
    .select(`
      id, h_no, status, title, item_count, total_thb, payment_due_at, created_at,
      profile:profiles!profile_id ( member_code, first_name, last_name, phone )
    `)
    .order("created_at", { ascending: false })
    .limit(200);

  if (sp.status) q = q.eq("status", sp.status);
  const { data } = await q;

  type ProfileShape = { member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null };
  type RawRow = {
    id: string; h_no: string; status: string; title: string | null; item_count: number;
    total_thb: number; payment_due_at: string | null; created_at: string;
    profile: ProfileShape | ProfileShape[] | null;
  };
  const rows = ((data ?? []) as RawRow[]).map((r) => ({
    ...r,
    profile: Array.isArray(r.profile) ? r.profile[0] ?? null : r.profile,
  }));

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN</p>
        <h1 className="mt-1 text-2xl font-bold">ฝากสั่ง — Ops</h1>
      </div>

      <FilterBar currentStatus={sp.status} />

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่มีรายการ</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">เลขที่</th>
                  <th className="px-4 py-3">ลูกค้า</th>
                  <th className="px-4 py-3">รายการ</th>
                  <th className="px-4 py-3 text-right">ชิ้น</th>
                  <th className="px-4 py-3 text-right">ยอด</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">วันที่</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link href={`/admin/service-orders/${r.h_no}`} className="text-primary-600 hover:underline">{r.h_no}</Link>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-mono">{r.profile?.member_code ?? "—"}</div>
                      <div>{r.profile?.first_name} {r.profile?.last_name}</div>
                      <div className="text-muted">{r.profile?.phone}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">{r.title ?? "—"}</td>
                    <td className="px-4 py-3 text-right">{r.item_count}</td>
                    <td className="px-4 py-3 text-right font-mono">฿{Number(r.total_thb).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[r.status]}`}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                      {r.status === "awaiting_payment" && r.payment_due_at && (
                        <div className="text-[10px] text-yellow-700 mt-1">หมดเขต {new Date(r.payment_due_at).toLocaleDateString("th-TH")}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{new Date(r.created_at).toLocaleDateString("th-TH")}</td>
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

function FilterBar({ currentStatus }: { currentStatus?: string }) {
  const opts = [
    { v: undefined, l: "ทั้งหมด" },
    ...Object.entries(STATUS_LABEL).map(([v, l]) => ({ v, l })),
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {opts.map((o) => (
        <Link
          key={o.l}
          href={o.v ? `/admin/service-orders?status=${o.v}` : "/admin/service-orders"}
          className={`rounded-full border px-3 py-1 text-xs ${
            (currentStatus ?? "") === (o.v ?? "")
              ? "bg-primary-500 text-white border-primary-500"
              : "bg-white border-border hover:bg-surface-alt"
          }`}
        >
          {o.l}
        </Link>
      ))}
    </div>
  );
}
