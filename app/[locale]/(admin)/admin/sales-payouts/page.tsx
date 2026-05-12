import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { SalesPayoutActions } from "./actions-cell";

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  paid: "bg-green-50 text-green-700 border-green-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "รอตรวจ", approved: "อนุมัติ", paid: "โอนแล้ว", rejected: "ปฏิเสธ",
};

export default async function AdminSalesPayoutsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const admin = createAdminClient();

  let q = admin.from("sales_payouts")
    .select(`
      id, amount_total, bank_name, account_name, account_number, status, rejection_reason,
      slip_url, requested_at, paid_at, note,
      team_leader:team_leaders!team_leader_id (
        team_code,
        commission_pct,
        profile:profiles!profile_id ( member_code, first_name, last_name, phone )
      )
    `)
    .order("requested_at", { ascending: false })
    .limit(200);

  if (sp.status) q = q.eq("status", sp.status);
  const { data } = await q;
  type Profile = { member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null };
  type TeamLeader = { team_code: string; commission_pct: number; profile: Profile | Profile[] | null };
  type RawRow = Omit<NonNullable<typeof data>[number], "team_leader"> & { team_leader: TeamLeader | TeamLeader[] | null };
  const rows = ((data ?? []) as RawRow[]).map((r) => {
    const tl = Array.isArray(r.team_leader) ? r.team_leader[0] ?? null : r.team_leader;
    const profile = tl && (Array.isArray(tl.profile) ? tl.profile[0] ?? null : tl.profile);
    return { ...r, team_leader_team: tl?.team_code ?? null, team_leader_profile: profile };
  });

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN</p>
        <h1 className="mt-1 text-2xl font-bold">เบิกค่าคอม (sales payouts)</h1>
      </div>

      <FilterBar currentStatus={sp.status} />

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่มีคำขอ</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">วันที่ขอ</th>
                  <th className="px-4 py-3">ทีม</th>
                  <th className="px-4 py-3">หัวหน้าทีม</th>
                  <th className="px-4 py-3 text-right">ยอด</th>
                  <th className="px-4 py-3">บัญชีรับโอน</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">การจัดการ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{new Date(r.requested_at).toLocaleString("th-TH")}</td>
                    <td className="px-4 py-3 text-xs font-mono">{r.team_leader_team ?? "—"}</td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-mono">{r.team_leader_profile?.member_code ?? "—"}</div>
                      <div>{r.team_leader_profile?.first_name} {r.team_leader_profile?.last_name}</div>
                      <div className="text-muted">{r.team_leader_profile?.phone}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold">
                      ฿{Number(r.amount_total).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div>{r.bank_name}</div>
                      <div className="text-muted">{r.account_name}</div>
                      <div className="font-mono text-muted">{r.account_number}</div>
                      {r.note && <div className="text-[10px] text-muted">📝 {r.note}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[r.status]}`}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                      {r.rejection_reason && <div className="text-[10px] text-red-700 mt-1">{r.rejection_reason}</div>}
                      {r.paid_at && <div className="text-[10px] text-muted mt-1">โอน: {new Date(r.paid_at).toLocaleDateString("th-TH")}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <SalesPayoutActions id={r.id} status={r.status} />
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

function FilterBar({ currentStatus }: { currentStatus?: string }) {
  const opts = [
    { v: undefined, l: "ทั้งหมด" },
    ...Object.entries(STATUS_LABEL).map(([v, l]) => ({ v, l })),
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {opts.map((o) => (
        <Link key={o.l} href={o.v ? `/admin/sales-payouts?status=${o.v}` : "/admin/sales-payouts"}
          className={`rounded-full border px-3 py-1 text-xs ${
            (currentStatus ?? "") === (o.v ?? "") ? "bg-primary-500 text-white border-primary-500" : "bg-white border-border hover:bg-surface-alt"
          }`}>
          {o.l}
        </Link>
      ))}
    </div>
  );
}
