import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { WalletTxActions } from "./actions-cell";
import { WalletBulkApproveBar, WalletRowCheckbox } from "./bulk-approve-bar";

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
  completed: "bg-green-50 text-green-700 border-green-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-gray-50 text-gray-600 border-gray-200",
};
const KIND_LABEL: Record<string, string> = {
  deposit: "เติมเงิน", withdraw: "ถอนเงิน", refund: "คืนเงิน", adjustment: "ปรับยอด",
  order_payment: "ชำระฝากสั่ง", order_top_up: "เติม+ชำระฝากสั่ง",
  import_payment: "ชำระฝากนำเข้า", import_top_up: "เติม+ชำระฝากนำเข้า",
  yuan_payment: "ชำระฝากโอนหยวน",
  cashback_earn: "ได้รับ cashback", cashback_redeem: "ใช้ cashback",
};

export default async function AdminWalletPage({ searchParams }: { searchParams: Promise<{ kind?: string; status?: string }> }) {
  const sp = await searchParams;
  const admin = createAdminClient();

  let q = admin.from("wallet_transactions")
    .select(`
      id, profile_id, bucket, amount, kind, status, slip_url, bank_name,
      account_name, account_number, note, created_at,
      profile:profiles!profile_id ( member_code, first_name, last_name, phone )
    `)
    .order("created_at", { ascending: false })
    .limit(200);

  if (sp.kind)   q = q.eq("kind", sp.kind);
  if (sp.status) q = q.eq("status", sp.status);

  const { data } = await q;
  type ProfileShape = { member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null };
  type RawRow = Omit<NonNullable<typeof data>[number], "profile"> & {
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
        <h1 className="mt-1 text-2xl font-bold">กระเป๋าเงิน — รายการ</h1>
      </div>

      <div className="flex flex-wrap gap-3">
        <FilterChips currentKind={sp.kind} currentStatus={sp.status} />
      </div>

      <WalletBulkApproveBar />

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่มีรายการ</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-2 py-3 w-8"></th>
                  <th className="px-4 py-3">วันที่</th>
                  <th className="px-4 py-3">ลูกค้า</th>
                  <th className="px-4 py-3">ประเภท</th>
                  <th className="px-4 py-3 text-right">จำนวน</th>
                  <th className="px-4 py-3">บัญชี/หลักฐาน</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">การจัดการ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="px-2 py-3">
                      {/* T-P3: bulk-select checkbox shown only for rows that
                          adminBulkApproveDeposits can actually act on */}
                      {r.kind === "deposit" && r.status === "pending" ? (
                        <WalletRowCheckbox id={r.id} />
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{new Date(r.created_at).toLocaleString("th-TH")}</td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-mono">{r.profile?.member_code ?? "—"}</div>
                      <div>{r.profile?.first_name} {r.profile?.last_name}</div>
                      <div className="text-muted">{r.profile?.phone}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">{KIND_LABEL[r.kind] ?? r.kind}</td>
                    <td className={`px-4 py-3 text-right font-mono ${r.amount < 0 ? "text-red-600" : "text-green-700"}`}>
                      {r.amount > 0 ? "+" : ""}{Number(r.amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-xs space-y-1 max-w-[200px]">
                      {r.bank_name && <div>{r.bank_name}</div>}
                      {r.account_name && <div className="text-muted">{r.account_name}</div>}
                      {r.account_number && <div className="font-mono text-muted">{r.account_number}</div>}
                      {r.slip_url && <div className="text-[10px] text-primary-500 truncate">{r.slip_url.slice(-22)}</div>}
                      {r.note && <div className="text-[10px] text-muted">📝 {r.note}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[r.status]}`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <WalletTxActions id={r.id} status={r.status} kind={r.kind} slipUrl={r.slip_url} />
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

function Chip({ active, href, children }: { active: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={`rounded-full border px-3 py-1 text-xs ${active ? "bg-primary-500 text-white border-primary-500" : "bg-white border-border hover:bg-surface-alt"}`}>
      {children}
    </Link>
  );
}

function FilterChips({ currentKind, currentStatus }: { currentKind?: string; currentStatus?: string }) {
  const params = (kind?: string, status?: string) => {
    const u = new URLSearchParams();
    if (kind)   u.set("kind", kind);
    if (status) u.set("status", status);
    return u.toString() ? `?${u}` : "";
  };
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Chip active={!currentKind} href="/admin/wallet">ทุกประเภท</Chip>
        <Chip active={currentKind === "deposit"}  href={`/admin/wallet${params("deposit", currentStatus)}`}>เติมเงิน</Chip>
        <Chip active={currentKind === "withdraw"} href={`/admin/wallet${params("withdraw", currentStatus)}`}>ถอนเงิน</Chip>
      </div>
      <div className="flex flex-wrap gap-2">
        <Chip active={!currentStatus}                  href={`/admin/wallet${params(currentKind)}`}>ทุกสถานะ</Chip>
        <Chip active={currentStatus === "pending"}     href={`/admin/wallet${params(currentKind, "pending")}`}>รอ</Chip>
        <Chip active={currentStatus === "completed"}   href={`/admin/wallet${params(currentKind, "completed")}`}>สำเร็จ</Chip>
        <Chip active={currentStatus === "cancelled"}   href={`/admin/wallet${params(currentKind, "cancelled")}`}>ยกเลิก</Chip>
      </div>
    </>
  );
}
