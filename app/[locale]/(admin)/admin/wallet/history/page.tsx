/**
 * Admin > Wallet > "ประวัติรายการ" — read-only audit trail of every
 * wallet transaction (no admin actions, no bulk approve — that lives on
 * /admin/wallet itself). This is the legacy `wallet/history/` view from
 * pcs-admin/wallet.php (the `$_GET['page']=='history'` branch) +
 * `pcs-admin/include/pages/wallet/w-s-history.php`.
 *
 * Sidebar link `wallet.history` -> /admin/wallet/history was dead before
 * this commit; the link rendered a 404. See gap matrix item #2.
 *
 * NOTE on schema mismatch — legacy SQL hits `tb_wallet_hs JOIN tb_users`;
 * pacred-current wallet uses the native `wallet_transactions` table
 * (Phase 1-5 schema, coexists w/ tb_* per ADR-0017). We surface the
 * native rows here verbatim — re-port onto tb_wallet_hs is a Phase B
 * follow-up tracked in docs/runbook/faithful-port-plan.md.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  deposit: "เติมเงิน",
  withdraw: "ถอนเงิน",
  refund: "คืนเงิน",
  adjustment: "ปรับยอด",
  order_payment: "ชำระฝากสั่ง",
  order_top_up: "เติม+ชำระฝากสั่ง",
  import_payment: "ชำระฝากนำเข้า",
  import_top_up: "เติม+ชำระฝากนำเข้า",
  yuan_payment: "ชำระฝากโอนหยวน",
  cashback_earn: "ได้รับ cashback",
  cashback_redeem: "ใช้ cashback",
};

const STATUS_BADGE: Record<string, string> = {
  pending:   "bg-yellow-50 text-yellow-700 border-yellow-200",
  completed: "bg-green-50 text-green-700 border-green-200",
  failed:    "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-gray-50 text-gray-600 border-gray-200",
};

type ProfileShape = {
  member_code: string | null;
  first_name:  string | null;
  last_name:   string | null;
  phone:       string | null;
};

type RawRow = {
  id:           number;
  bucket:       string | null;
  amount:       number;
  kind:         string;
  status:       string;
  bank_name:    string | null;
  account_name: string | null;
  account_number: string | null;
  note:         string | null;
  created_at:   string;
  profile:      ProfileShape | ProfileShape[] | null;
};

export default async function WalletHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; from?: string; to?: string }>;
}) {
  // legacy money page → restrict to accounting/super
  await requireAdmin(["accounting"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // legacy SELECT — every completed transaction, newest first, scoped by
  // optional date range + optional kind. Read-only — no action column.
  let q = admin.from("wallet_transactions")
    .select(`
      id, bucket, amount, kind, status, bank_name, account_name,
      account_number, note, created_at,
      profile:profiles!profile_id ( member_code, first_name, last_name, phone )
    `)
    .order("created_at", { ascending: false })
    .limit(500);

  if (sp.kind) q = q.eq("kind", sp.kind);
  if (sp.from) q = q.gte("created_at", `${sp.from}T00:00:00`);
  if (sp.to)   q = q.lte("created_at", `${sp.to}T23:59:59`);

  const { data } = await q;
  const rows = ((data ?? []) as RawRow[]).map((r) => ({
    ...r,
    profile: Array.isArray(r.profile) ? r.profile[0] ?? null : r.profile,
  }));

  // Totals — legacy showed running totals at the top
  const total_deposit = rows
    .filter((r) => r.kind === "deposit" && r.status === "completed")
    .reduce((s, r) => s + Number(r.amount), 0);
  const total_withdraw = rows
    .filter((r) => r.kind === "withdraw" && r.status === "completed")
    .reduce((s, r) => s + Math.abs(Number(r.amount)), 0);

  return (
    <div className="pcs-legacy">
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />
      <title>ประวัติรายการกระเป๋าเงิน | PR Admin</title>

      <main className="p-6 lg:p-8 space-y-5">
        {/* Breadcrumb (legacy w-s-history.php L20-31) */}
        <div className="text-sm text-muted space-x-2">
          <Link href="/admin" className="hover:underline">หน้าแรก</Link>
          <span>›</span>
          <Link href="/admin/wallet" className="hover:underline">เป๋าตัง</Link>
          <span>›</span>
          <span className="font-semibold">ประวัติรายการ</span>
        </div>

        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">WALLET</p>
          <h1 className="mt-1 text-2xl font-bold">ประวัติรายการ</h1>
          <p className="mt-1 text-sm text-muted">รายการ wallet ทั้งหมด · เรียงล่าสุด · จำกัด 500 รายการ</p>
        </div>

        {/* Totals summary */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-white dark:bg-surface p-4">
            <p className="text-[11px] text-muted uppercase tracking-wider">ยอดเติม (สำเร็จ)</p>
            <p className="mt-1 text-lg font-semibold text-green-700 font-mono">
              +{total_deposit.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-white dark:bg-surface p-4">
            <p className="text-[11px] text-muted uppercase tracking-wider">ยอดถอน (สำเร็จ)</p>
            <p className="mt-1 text-lg font-semibold text-red-600 font-mono">
              −{total_withdraw.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-white dark:bg-surface p-4">
            <p className="text-[11px] text-muted uppercase tracking-wider">ทั้งหมดในมุมมองนี้</p>
            <p className="mt-1 text-lg font-semibold font-mono">{rows.length} รายการ</p>
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted mr-1">ประเภท:</span>
          <FilterChip active={!sp.kind} href="/admin/wallet/history">ทั้งหมด</FilterChip>
          {Object.entries(KIND_LABEL).map(([k, label]) => (
            <FilterChip
              key={k}
              active={sp.kind === k}
              href={`/admin/wallet/history?kind=${k}`}
            >
              {label}
            </FilterChip>
          ))}
        </div>

        {/* Table — legacy myTable display table-bordered */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          {rows.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <div className="text-4xl" aria-hidden>📜</div>
              <p className="text-sm font-medium text-foreground">ไม่มีรายการในประวัติ</p>
              <p className="text-xs text-muted">ลองล้างตัวกรองด้านบนหรือเปลี่ยนช่วงวันที่</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3">วันที่ทำรายการ</th>
                    <th className="px-4 py-3">รหัสสมาชิก</th>
                    <th className="px-4 py-3">ประเภทรายการ</th>
                    <th className="px-4 py-3">สถานะรายการ</th>
                    <th className="px-4 py-3 text-right">ยอดเงิน</th>
                    <th className="px-4 py-3">หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const profile = r.profile as ProfileShape | null;
                    const amount = Number(r.amount);
                    return (
                      <tr key={r.id} className="border-t border-border align-top">
                        <td className="px-4 py-3 text-xs whitespace-nowrap text-muted">
                          {new Date(r.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <div className="font-mono font-semibold">{profile?.member_code ?? "—"}</div>
                          <div className="text-muted">{profile?.first_name} {profile?.last_name}</div>
                          <div className="text-[10px] text-muted">{profile?.phone}</div>
                        </td>
                        <td className="px-4 py-3 text-xs">{KIND_LABEL[r.kind] ?? r.kind}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[r.status] ?? "bg-gray-50 border-gray-200"}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-right font-mono ${amount < 0 ? "text-red-600" : "text-green-700"}`}>
                          {amount > 0 ? "+" : ""}{amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted max-w-[260px]">
                          {r.note ?? "—"}
                          {r.bank_name && <div className="text-[10px]">{r.bank_name} {r.account_number ? `· ${r.account_number}` : ""}</div>}
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
    </div>
  );
}

function FilterChip({
  active, href, children,
}: { active: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs whitespace-nowrap ${
        active
          ? "bg-primary-500 text-white border-primary-500"
          : "bg-white border-border hover:bg-surface-alt text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
