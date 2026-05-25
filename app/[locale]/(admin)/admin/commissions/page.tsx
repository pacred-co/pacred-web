import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  WITHDRAWAL_STATUSES,
  WITHDRAWAL_STATUS_LABEL,
  ROLE_KIND_LABEL,
  type WithdrawalStatus,
  type RoleKind,
} from "@/lib/validators/commission";

/**
 * V-E8 — /admin/commissions list page.
 *
 * Three panels:
 *   1. Pending accruals overview (top earners by unpaid balance)
 *   2. Withdrawal queue — filter by status
 *   3. History
 *
 * Roles: super, accounting.
 */

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<WithdrawalStatus, string> = {
  pending:  "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  paid:     "bg-green-50 text-green-700 border-green-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

type WithdrawalRow = {
  id:                   string;
  withdrawal_no:        string;
  status:               WithdrawalStatus;
  earner_admin_id:      string;
  role_kind:            RoleKind;
  title:                string;
  gross_thb:            number;
  net_thb:              number;
  requested_at:         string;
  earner: {
    member_code: string | null;
    first_name:  string | null;
    last_name:   string | null;
  } | null;
};

type EarnerBalanceRow = {
  earner_admin_id:     string;
  total_unpaid_thb:    number;
  accrual_count:       number;
  member_code:         string | null;
  first_name:          string | null;
  last_name:           string | null;
};

function thb(n: number): string {
  return "฿" + Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

function earnerName(e: { member_code: string | null; first_name: string | null; last_name: string | null } | null): string {
  if (!e) return "—";
  const name = [e.first_name, e.last_name].filter(Boolean).join(" ");
  if (e.member_code && name) return `${e.member_code} · ${name}`;
  return e.member_code ?? name ?? "—";
}

export default async function AdminCommissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin(["super", "accounting"]);
  const sp = await searchParams;
  const status = (WITHDRAWAL_STATUSES as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as WithdrawalStatus)
    : null;

  const admin = createAdminClient();

  // ── Withdrawals (filtered list) ──
  let query = admin
    .from("commission_withdrawals")
    .select(`
      id, withdrawal_no, status, earner_admin_id, role_kind, title,
      gross_thb, net_thb, requested_at,
      earner:profiles!earner_admin_id ( member_code, first_name, last_name )
    `)
    .order("requested_at", { ascending: false })
    .limit(200);
  if (status) query = query.eq("status", status);
  const { data: rowsRaw, error: rowsRawErr } = await query;
  if (rowsRawErr) {
    console.error(`[commission_withdrawals list] failed`, { code: rowsRawErr.code, message: rowsRawErr.message });
  }
  type RawWithdrawal = Omit<WithdrawalRow, "earner"> & {
    earner: WithdrawalRow["earner"] | WithdrawalRow["earner"][] | null;
  };
  const withdrawals: WithdrawalRow[] = ((rowsRaw ?? []) as unknown as RawWithdrawal[]).map((r) => ({
    ...r,
    earner: Array.isArray(r.earner) ? r.earner[0] ?? null : r.earner,
  }));

  // ── Status counts (for filter chips) ──
  const counts: Record<WithdrawalStatus, number> = {} as Record<WithdrawalStatus, number>;
  for (const s of WITHDRAWAL_STATUSES) counts[s] = 0;
  const { data: countRows, error: countRowsErr } = await admin
    .from("commission_withdrawals")
    .select("status");
  if (countRowsErr) {
    console.error(`[commission_withdrawals list] failed`, { code: countRowsErr.code, message: countRowsErr.message });
  }
  for (const r of (countRows ?? []) as Array<{ status: WithdrawalStatus }>) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }

  // ── Top earners with unpaid balance ──
  // Aggregate via SQL — sum(accrued_amount_thb) where withdrawal_item_id is null.
  // RLS bypassed via admin client.
  const { data: unpaidRaw, error: unpaidRawErr } = await admin
    .from("commission_accruals")
    .select("earner_admin_id, accrued_amount_thb")
    .is("withdrawal_item_id", null)
    .limit(2000);
  if (unpaidRawErr) {
    console.error(`[commission_accruals list] failed`, { code: unpaidRawErr.code, message: unpaidRawErr.message });
  }

  const earnerMap = new Map<string, { total: number; count: number }>();
  for (const r of (unpaidRaw ?? []) as Array<{ earner_admin_id: string; accrued_amount_thb: number }>) {
    const cur = earnerMap.get(r.earner_admin_id) ?? { total: 0, count: 0 };
    cur.total += Number(r.accrued_amount_thb);
    cur.count += 1;
    earnerMap.set(r.earner_admin_id, cur);
  }
  const earnerIds = Array.from(earnerMap.keys());
  let earnerBalances: EarnerBalanceRow[] = [];
  if (earnerIds.length > 0) {
    const { data: profilesRaw, error: profilesRawErr } = await admin
      .from("profiles")
      .select("id, member_code, first_name, last_name")
      .in("id", earnerIds);
    if (profilesRawErr) {
      console.error(`[profiles list] failed`, { code: profilesRawErr.code, message: profilesRawErr.message });
    }
    const profiles = (profilesRaw ?? []) as Array<{
      id: string; member_code: string | null; first_name: string | null; last_name: string | null;
    }>;
    const pmap = new Map(profiles.map((p) => [p.id, p]));
    earnerBalances = earnerIds
      .map((id) => {
        const agg = earnerMap.get(id);
        const p = pmap.get(id);
        return {
          earner_admin_id:    id,
          total_unpaid_thb:   Math.round((agg?.total ?? 0) * 100) / 100,
          accrual_count:      agg?.count ?? 0,
          member_code:        p?.member_code ?? null,
          first_name:         p?.first_name ?? null,
          last_name:          p?.last_name ?? null,
        };
      })
      .sort((a, b) => b.total_unpaid_thb - a.total_unpaid_thb)
      .slice(0, 20);
  }

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-6xl">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · ค่าคอม + Payouts</p>
          <h1 className="mt-1 text-2xl font-bold">ค่าคอม + Payouts (V-E8)</h1>
          <p className="text-xs text-muted mt-1">
            ระบบจ่ายค่าคอมล่ามจีน + Sales rep · workflow: pending → approved → paid (slip required)
          </p>
        </div>
      </header>

      {/* Pending accruals — top unpaid earners */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
        <h2 className="font-bold text-sm mb-3">💰 ยอดสะสมรอเบิก (top 20 earners)</h2>
        {earnerBalances.length === 0 ? (
          <p className="text-xs text-muted">ยังไม่มี accrual ค้าง</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">Earner</th>
                <th className="px-3 py-2 text-right">จำนวน accruals</th>
                <th className="px-3 py-2 text-right">ยอดสะสมรวม</th>
              </tr>
            </thead>
            <tbody>
              {earnerBalances.map((e) => (
                <tr key={e.earner_admin_id} className="border-t border-border">
                  <td className="px-3 py-2">{earnerName(e)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{e.accrual_count}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-primary-700">{thb(e.total_unpaid_thb)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Status filter chips */}
      <nav className="flex flex-wrap gap-2">
        <Link
          href="/admin/commissions"
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
            status === null ? "bg-primary-600 text-white" : "bg-surface-alt text-foreground hover:bg-surface-alt/80"
          }`}
        >
          ทั้งหมด <span className="ml-1 text-[10px]">({Object.values(counts).reduce((s, n) => s + n, 0)})</span>
        </Link>
        {WITHDRAWAL_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/commissions?status=${s}`}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
              s === status ? STATUS_BADGE[s] : "bg-white text-foreground border-border hover:bg-surface-alt"
            }`}
          >
            {WITHDRAWAL_STATUS_LABEL[s]} <span className="ml-1 text-[10px] opacity-75">({counts[s]})</span>
          </Link>
        ))}
      </nav>

      {/* Withdrawal queue/history */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="font-bold text-sm">📋 คำขอเบิกค่าคอม</h2>
        </div>
        {withdrawals.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">
            ไม่มีคำขอเบิก{status && ` สถานะ "${WITHDRAWAL_STATUS_LABEL[status]}"`}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">เลขที่</th>
                <th className="px-3 py-2">Earner</th>
                <th className="px-3 py-2">บทบาท</th>
                <th className="px-3 py-2">หัวข้อ</th>
                <th className="px-3 py-2 text-right">ยอดรวม</th>
                <th className="px-3 py-2 text-right">สุทธิ</th>
                <th className="px-3 py-2">สถานะ</th>
                <th className="px-3 py-2">ขอเมื่อ</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.map((w) => (
                <tr key={w.id} className="border-t border-border hover:bg-surface-alt/30">
                  <td className="px-3 py-2">
                    <Link href={`/admin/commissions/${w.id}`} className="font-mono text-xs text-primary-600 hover:underline">
                      {w.withdrawal_no}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs">{earnerName(w.earner)}</td>
                  <td className="px-3 py-2 text-xs">{ROLE_KIND_LABEL[w.role_kind]}</td>
                  <td className="px-3 py-2 text-xs">{w.title}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{thb(w.gross_thb)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs font-bold">{thb(w.net_thb)}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${STATUS_BADGE[w.status]}`}>
                      {WITHDRAWAL_STATUS_LABEL[w.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {new Date(w.requested_at).toLocaleDateString("th-TH")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
