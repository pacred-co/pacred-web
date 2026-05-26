import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { PageTopMenubar } from "@/components/admin/page-top-menubar";
import { DISBURSEMENT_MENUBAR } from "@/lib/admin/disbursement-menubar";
import { ShopPayoutActions } from "./actions-cell";

/**
 * Admin shop-wallet payout queue — Sprint-3 P2.3.
 *
 * Lists every `tb_shop_transactions` row whose `kind='withdraw'`
 * (with optional `transfer_out` future surface). Accounting + ops
 * roles approve / reject / mark-paid via the per-row actions cell.
 *
 * Mirrors `/admin/sales-payouts` (sales commission payouts) — kept as
 * a parallel page because shop-wallet sits on a separate ledger
 * (tb_shop_transactions, migration 0104) with its own RLS posture
 * + auto-recompute trigger that fires when a row transitions to
 * `status='completed'`.
 */

const STATUS_BADGE: Record<string, string> = {
  pending:   "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
  failed:    "bg-gray-50 text-gray-600 border-gray-200",
};
const STATUS_LABEL: Record<string, string> = {
  pending:   "รอตรวจ",
  completed: "โอนแล้ว",
  cancelled: "ปฏิเสธ",
  failed:    "ล้มเหลว",
};

export default async function AdminShopPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin(["accounting", "ops"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // Pull pending + recent rows. Joined to profiles for the customer
  // identity column. We include `transfer_out` as a future-proofing
  // hedge — today only `withdraw` rows enter the admin queue.
  let q = admin
    .from("tb_shop_transactions")
    .select(`
      id, amount, kind, status, note,
      bank_name, account_name, account_number, slip_url,
      rejected_reason, reviewed_at, created_at,
      profile:profiles!profile_id ( member_code, first_name, last_name, phone )
    `)
    .in("kind", ["withdraw", "transfer_out"])
    .order("created_at", { ascending: false })
    .limit(200);

  if (sp.status) q = q.eq("status", sp.status);
  const { data, error } = await q;
  if (error) {
    console.error(`[tb_shop_transactions list] failed`, { code: error.code, message: error.message });
  }

  type Profile = {
    member_code: string | null;
    first_name:  string | null;
    last_name:   string | null;
    phone:       string | null;
  };
  type RawRow = Omit<NonNullable<typeof data>[number], "profile"> & {
    profile: Profile | Profile[] | null;
  };
  const rows = ((data ?? []) as RawRow[]).map((r) => {
    const profile = Array.isArray(r.profile) ? r.profile[0] ?? null : r.profile;
    return { ...r, profile };
  });

  return (
    <>
      <PageTopMenubar items={DISBURSEMENT_MENUBAR} activeHref="/admin/shop-payouts" />
      <main className="p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN</p>
        <h1 className="mt-1 text-2xl font-bold">เบิกกระเป๋าร้าน (shop wallet)</h1>
        <p className="mt-1 text-sm text-muted">
          คำขอถอนเงิน/โอนออกจากกระเป๋าร้านของลูกค้า (affiliate / partner). อนุมัติแล้วเงินถึงโอนจริง — โอนสำเร็จกด &ldquo;โอนแล้ว&rdquo; ระบบจะหักยอดของลูกค้าโดยอัตโนมัติ
        </p>
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
                  <th className="px-4 py-3">ลูกค้า</th>
                  <th className="px-4 py-3 text-right">ยอด</th>
                  <th className="px-4 py-3">บัญชีรับโอน</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">การจัดการ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString("th-TH")}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-mono">{r.profile?.member_code ?? "—"}</div>
                      <div>
                        {r.profile?.first_name} {r.profile?.last_name}
                      </div>
                      <div className="text-muted">{r.profile?.phone}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold">
                      ฿
                      {Math.abs(Number(r.amount)).toLocaleString("th-TH", {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {r.kind === "withdraw" ? (
                        <>
                          <div>{r.bank_name}</div>
                          <div className="text-muted">{r.account_name}</div>
                          <div className="font-mono text-muted">{r.account_number}</div>
                        </>
                      ) : (
                        <div className="text-muted">— (transfer)</div>
                      )}
                      {r.note && <div className="text-[10px] text-muted">📝 {r.note}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[r.status]}`}
                      >
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                      {r.rejected_reason && (
                        <div className="text-[10px] text-red-700 mt-1">{r.rejected_reason}</div>
                      )}
                      {r.reviewed_at && (
                        <div className="text-[10px] text-muted mt-1">
                          ตรวจ: {new Date(r.reviewed_at).toLocaleDateString("th-TH")}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ShopPayoutActions id={r.id} status={r.status} />
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

function buildHref(status?: string) {
  return status ? `/admin/shop-payouts?status=${status}` : "/admin/shop-payouts";
}

function FilterBar({ currentStatus }: { currentStatus?: string }) {
  const opts: Array<{ v: string | undefined; l: string }> = [
    { v: undefined, l: "ทั้งหมด" },
    ...Object.entries(STATUS_LABEL).map(([v, l]) => ({ v, l })),
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {opts.map((o) => (
        <Link
          key={o.l}
          href={buildHref(o.v)}
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
