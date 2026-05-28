import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { PageTopMenubar } from "@/components/admin/page-top-menubar";
import { DISBURSEMENT_MENUBAR } from "@/lib/admin/disbursement-menubar";
import { SalesPayoutActions } from "./actions-cell";

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  paid: "bg-green-50 text-green-700 border-green-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "รอตรวจ", approved: "อนุมัติ", paid: "โอนแล้ว", rejected: "ปฏิเสธ",
};

export default async function AdminSalesPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; kind?: string }>;
}) {
  // W-1 (gap-admin H-1): page-level role gate. Exposes sales-rep bank
  // accounts + commission payouts via createAdminClient (RLS-bypass) —
  // accounting + sales_admin (super implicit).
  await requireAdmin(["accounting", "sales_admin"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // D1 Phase-B Wave-A audit
  // (docs/research/sidebar-fidelity-audit/02-wallet-withdrawal-pattern.md
  //  §3 + §5.1b): sidebar splits "เบิกค่าสินค้า ?kind=shop-goods" from
  // "โบนัสเซลล์ (default)" but sales_payouts has NO kind column today —
  // legacy ที่ฝั่ง PHP keeps these in two tables (tb_sale_*  for goods,
  // tb_sales_commission for bonus). The audit defers the data-model
  // split to Wave-B (adding a payout_kind column + backfill); meanwhile
  // we surface the active filter as a chip so staff arriving from the
  // sidebar see the URL state honoured (no silent drop). The query is
  // un-filtered by kind today — when the column lands, swap the
  // comment block below for a real .eq() filter.
  // const KIND_TODO: only filter once payout_kind column is added (Wave-B).

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
  const { data, error } = await q;
  if (error) {
    console.error(`[sales_payouts list] failed`, { code: error.code, message: error.message });
  }
  type Profile = { member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null };
  type TeamLeader = { team_code: string; commission_pct: number; profile: Profile | Profile[] | null };
  type RawRow = Omit<NonNullable<typeof data>[number], "team_leader"> & { team_leader: TeamLeader | TeamLeader[] | null };
  const rows = ((data ?? []) as RawRow[]).map((r) => {
    const tl = Array.isArray(r.team_leader) ? r.team_leader[0] ?? null : r.team_leader;
    const profile = tl && (Array.isArray(tl.profile) ? tl.profile[0] ?? null : tl.profile);
    return { ...r, team_leader_team: tl?.team_code ?? null, team_leader_profile: profile };
  });

  return (
    <>
      <PageTopMenubar items={DISBURSEMENT_MENUBAR} activeHref="/admin/sales-payouts" />
      <main className="p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN</p>
        <h1 className="mt-1 text-2xl font-bold">
          {sp.kind === "shop-goods" ? "เบิกเงินค่าสินค้า" : "เบิกค่าคอม (sales payouts)"}
        </h1>
        {sp.kind && (
          <p className="mt-1 text-xs text-amber-700">
            ⚠️ kind filter ({sp.kind}) ยังไม่ active — รอ payout_kind column (Wave-B). แสดงทุก payout ก่อน.
          </p>
        )}
      </div>

      <KindBar currentKind={sp.kind} currentStatus={sp.status} />
      <FilterBar currentKind={sp.kind} currentStatus={sp.status} />

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
    </>
  );
}

function buildHref(kind?: string, status?: string) {
  const u = new URLSearchParams();
  if (kind)   u.set("kind", kind);
  if (status) u.set("status", status);
  const qs = u.toString();
  return qs ? `/admin/sales-payouts?${qs}` : "/admin/sales-payouts";
}

function FilterBar({
  currentKind,
  currentStatus,
}: {
  currentKind?:   string;
  currentStatus?: string;
}) {
  const opts = [
    { v: undefined, l: "ทั้งหมด" },
    ...Object.entries(STATUS_LABEL).map(([v, l]) => ({ v, l })),
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {opts.map((o) => (
        <Link key={o.l} href={buildHref(currentKind, o.v)}
          className={`rounded-full border px-3 py-1 text-xs ${
            (currentStatus ?? "") === (o.v ?? "") ? "bg-primary-500 text-white border-primary-500" : "bg-white border-border hover:bg-surface-alt"
          }`}>
          {o.l}
        </Link>
      ))}
    </div>
  );
}

/**
 * Kind chip strip — surfaces the active kind from the sidebar so staff
 * see which queue they're in (เบิกค่าสินค้า vs โบนัสเซลล์). The query
 * itself doesn't yet filter by kind — see the page-body comment about
 * the deferred payout_kind column.
 */
function KindBar({
  currentKind,
  currentStatus,
}: {
  currentKind?:   string;
  currentStatus?: string;
}) {
  const opts: Array<{ v: string | undefined; l: string }> = [
    { v: undefined,     l: "ทุกประเภท" },
    { v: "sales-bonus", l: "โบนัสเซลล์" },
    { v: "shop-goods",  l: "เบิกเงินค่าสินค้า" },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {opts.map((o) => (
        <Link key={o.l} href={buildHref(o.v, currentStatus)}
          className={`rounded-full border px-3 py-1 text-xs ${
            (currentKind ?? "") === (o.v ?? "") ? "bg-primary-500 text-white border-primary-500" : "bg-white border-border hover:bg-surface-alt"
          }`}>
          {o.l}
        </Link>
      ))}
    </div>
  );
}
