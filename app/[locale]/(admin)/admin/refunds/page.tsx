import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  REFUND_STATUSES,
  REFUND_STATUS_LABEL,
  REFUND_SOURCE_LABEL,
  type RefundStatus,
  type RefundSource,
} from "@/lib/validators/refund";

/**
 * U1-6 — /admin/refunds list page.
 *
 * Status filter via ?status=pending|... + free text search ?q=request_no|source_ref.
 * Pending-first default ordering when no status filter active so the queue is
 * the first thing the admin sees.
 *
 * Roles: super, accounting (writes); ops, sales_admin can read (per 0058 RLS).
 */

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<RefundStatus, string> = {
  pending:  "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  paid:     "bg-green-50 text-green-700 border-green-200",
};

type Profile = {
  member_code: string | null;
  first_name:  string | null;
  last_name:   string | null;
  phone:       string | null;
};

type RefundRow = {
  id:         string;
  request_no: string;
  source:     RefundSource;
  source_ref: string | null;
  amount_thb: number;
  status:     RefundStatus;
  created_at: string;
  approved_at:string | null;
  paid_at:    string | null;
  rejected_at:string | null;
  reason:     string;
  created_by_admin_id: string | null;
  profile: Profile | Profile[] | null;
};

function thb(n: number): string {
  return "฿" + Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

function normP(p: Profile | Profile[] | null): Profile | null {
  if (!p) return null;
  return Array.isArray(p) ? (p[0] ?? null) : p;
}

export default async function AdminRefundsListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  await requireAdmin(["super", "accounting", "ops", "sales_admin"]);
  const sp = await searchParams;
  const status = (REFUND_STATUSES as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as RefundStatus)
    : null;
  const q = sp.q?.trim() ?? "";

  const admin = createAdminClient();

  let query = admin
    .from("refund_requests")
    .select(`
      id, request_no, source, source_ref, amount_thb, status, created_at,
      approved_at, paid_at, rejected_at, reason, created_by_admin_id,
      profile:profiles!profile_id(member_code, first_name, last_name, phone)
    `)
    // Pending-first when no explicit status filter (queue view).
    // status='pending' sorts before others alphabetically AND we order by created_at within.
    .order("status", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(200);
  if (status) query = query.eq("status", status);
  if (q) {
    query = query.or(`request_no.ilike.%${q}%,source_ref.ilike.%${q}%,reason.ilike.%${q}%`);
  }
  const { data: rowsRaw } = await query;
  const rows = ((rowsRaw ?? []) as RefundRow[]).map((r) => ({ ...r, profile: normP(r.profile) }));

  // Status counts for filter chips.
  const counts: Record<RefundStatus, number> = { pending: 0, approved: 0, rejected: 0, paid: 0 };
  const { data: countRows } = await admin.from("refund_requests").select("status");
  for (const r of (countRows ?? []) as Array<{ status: RefundStatus }>) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }
  const totalAll = Object.values(counts).reduce((s, n) => s + n, 0);

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-7xl">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · การเงิน</p>
          <h1 className="mt-1 text-2xl font-bold">คำขอคืนเงิน (Refunds — U1-6)</h1>
          <p className="text-xs text-muted mt-1">
            workflow: pending → อนุมัติ → จ่ายแล้ว (เครดิตเข้ากระเป๋าลูกค้า) · approve+mark-paid = super/accounting
          </p>
        </div>
        <Link
          href="/admin/refunds/new"
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700"
        >
          ➕ สร้างคำขอ (admin → ลูกค้า)
        </Link>
      </header>

      {/* Status filter chips */}
      <nav className="flex flex-wrap gap-2">
        <Link
          href="/admin/refunds"
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
            status === null ? "bg-primary-600 text-white" : "bg-surface-alt text-foreground hover:bg-surface-alt/80"
          }`}
        >
          ทั้งหมด <span className="ml-1 text-[10px]">({totalAll})</span>
        </Link>
        {REFUND_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/refunds?status=${s}`}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
              s === status ? STATUS_BADGE[s] : "bg-white text-foreground border-border hover:bg-surface-alt"
            }`}
          >
            {REFUND_STATUS_LABEL[s]} <span className="ml-1 text-[10px] opacity-75">({counts[s]})</span>
          </Link>
        ))}
      </nav>

      {/* Search */}
      <form className="flex gap-2" action="/admin/refunds" method="get">
        {status && <input type="hidden" name="status" value={status} />}
        <input
          name="q"
          placeholder="ค้นหา: เลขที่ RF / source_ref / เหตุผล"
          defaultValue={q}
          className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700">
          ค้นหา
        </button>
      </form>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <div className="text-4xl" aria-hidden>💸</div>
            <p className="text-sm font-medium text-foreground">
              ไม่มีคำขอคืนเงิน{status && ` สถานะ "${REFUND_STATUS_LABEL[status]}"`}{q && ` ตรงกับ "${q}"`}
            </p>
            <p className="text-xs text-muted max-w-md mx-auto">
              {status || q
                ? "ลองเปลี่ยน/ล้างตัวกรองด้านบนเพื่อดูคำขอทั้งหมด"
                : "เมื่อลูกค้ายื่นคำขอผ่าน /refunds จะเข้ามาที่นี่ — รออนุมัติแล้วระบบจะคืนเงินเข้ากระเป๋าลูกค้าให้อัตโนมัติ"}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">เลขที่</th>
                <th className="px-3 py-2">ลูกค้า</th>
                <th className="px-3 py-2">แหล่ง</th>
                <th className="px-3 py-2 text-right">ยอด</th>
                <th className="px-3 py-2">เหตุผล</th>
                <th className="px-3 py-2">สถานะ</th>
                <th className="px-3 py-2">สร้าง</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30 align-top">
                  <td className="px-3 py-2">
                    <Link href={`/admin/refunds/${r.id}`} className="font-mono text-xs text-primary-600 hover:underline">
                      {r.request_no}
                    </Link>
                    {r.created_by_admin_id && (
                      <p className="text-[9px] text-muted">admin-created</p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <p>{[r.profile?.first_name, r.profile?.last_name].filter(Boolean).join(" ") || "—"}</p>
                    {r.profile?.member_code && (
                      <p className="font-mono text-[10px] text-muted">{r.profile.member_code}</p>
                    )}
                    {r.profile?.phone && (
                      <p className="text-[10px] text-muted">☎ {r.profile.phone}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <p>{REFUND_SOURCE_LABEL[r.source]}</p>
                    {r.source_ref && (
                      <p className="font-mono text-[10px] text-muted">{r.source_ref.slice(0, 18)}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-emerald-700">
                    {thb(Number(r.amount_thb))}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted max-w-xs">
                    <p className="line-clamp-2" title={r.reason}>{r.reason}</p>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${STATUS_BADGE[r.status]}`}>
                      {REFUND_STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {new Date(r.created_at).toLocaleDateString("th-TH")}
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
