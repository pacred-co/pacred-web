import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

/**
 * /admin/tax-invoices — list view (T-P4 G2c).
 *
 * Default: status='pending' (the work queue — these need admin action).
 * Filter chips: pending / issued / cancelled / all.
 *
 * Per ADR-0006 §1.4 + ADR-0005 K-7, only super or accounting roles see
 * this page. Layout-level guard already enforces; nav also hides the
 * link from other roles.
 */

const STATUS_BADGE: Record<string, string> = {
  pending:   "bg-yellow-50 text-yellow-700 border-yellow-200",
  issued:    "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-gray-50 text-gray-600 border-gray-200",
};

const STATUS_LABEL: Record<string, string> = {
  pending:   "รออนุมัติ",
  issued:    "ออกแล้ว",
  cancelled: "ยกเลิก",
};

type Row = {
  id:             string;
  status:         "pending" | "issued" | "cancelled";
  serial_no:      string | null;
  buyer_name:     string;
  buyer_tax_id:   string;
  total_thb:      number;
  order_h_no:     string | null;
  forwarder_f_no: string | null;
  created_at:     string;
  issued_at:      string | null;
  profile: {
    member_code: string | null;
    first_name:  string | null;
    last_name:   string | null;
  } | null;
};

export default async function AdminTaxInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  // W-1 (gap-admin H-1): page-level role gate. Per ADR-0006 §1.4 only
  // super/accounting see tax invoices (RD Code 86 + buyer tax IDs);
  // the docstring stated this — now enforced, not layout-only.
  await requireAdmin(["accounting"]);

  const sp = await searchParams;
  const statusFilter = (sp.status ?? "pending") as "pending" | "issued" | "cancelled" | "all";

  const admin = createAdminClient();
  let q = admin
    .from("tax_invoices")
    .select(`
      id, status, serial_no, buyer_name, buyer_tax_id, total_thb,
      order_h_no, forwarder_f_no, created_at, issued_at,
      profile:profiles!profile_id ( member_code, first_name, last_name )
    `)
    .order("created_at", { ascending: false })
    .limit(200);

  if (statusFilter !== "all") q = q.eq("status", statusFilter);

  const { data } = await q;
  type ProfileShape = { member_code: string | null; first_name: string | null; last_name: string | null };
  type RawRow = Omit<NonNullable<typeof data>[number], "profile"> & {
    profile: ProfileShape | ProfileShape[] | null;
  };
  const rows = ((data ?? []) as RawRow[]).map((r) => ({
    ...r,
    profile: Array.isArray(r.profile) ? r.profile[0] ?? null : r.profile,
  })) as Row[];

  const counts = await getStatusCounts(admin);

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · บัญชี</p>
        <h1 className="mt-1 text-2xl font-bold">ใบกำกับภาษี</h1>
        <p className="mt-1 text-sm text-muted">
          อนุมัติคำขอใบกำกับภาษี · ออกใบ + สร้าง PDF · ดูประวัติ
        </p>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        <Chip active={statusFilter === "pending"}   href="/admin/tax-invoices?status=pending">
          รออนุมัติ <span className="ml-1 text-xs opacity-70">{counts.pending}</span>
        </Chip>
        <Chip active={statusFilter === "issued"}    href="/admin/tax-invoices?status=issued">
          ออกแล้ว <span className="ml-1 text-xs opacity-70">{counts.issued}</span>
        </Chip>
        <Chip active={statusFilter === "cancelled"} href="/admin/tax-invoices?status=cancelled">
          ยกเลิก <span className="ml-1 text-xs opacity-70">{counts.cancelled}</span>
        </Chip>
        <Chip active={statusFilter === "all"}       href="/admin/tax-invoices?status=all">
          ทั้งหมด
        </Chip>
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">
            ไม่มีรายการ {statusFilter !== "all" && STATUS_LABEL[statusFilter]}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">วันที่ขอ</th>
                  <th className="px-4 py-3">ลูกค้า</th>
                  <th className="px-4 py-3">ผู้ซื้อ</th>
                  <th className="px-4 py-3">อ้างอิงออเดอร์</th>
                  <th className="px-4 py-3 text-right">ยอด</th>
                  <th className="px-4 py-3">เลขที่</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-mono">{r.profile?.member_code ?? "—"}</div>
                      <div>{r.profile?.first_name} {r.profile?.last_name}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-medium">{r.buyer_name}</div>
                      <div className="font-mono text-muted">{r.buyer_tax_id}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {r.order_h_no
                        ? <span className="font-mono">ฝากสั่ง · {r.order_h_no}</span>
                        : r.forwarder_f_no
                          ? <span className="font-mono">ฝากนำเข้า · {r.forwarder_f_no}</span>
                          : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm">
                      ฿{Number(r.total_thb).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {r.serial_no ? (
                        <div>
                          <div className="font-mono">{r.serial_no}</div>
                          {r.issued_at && (
                            <div className="text-muted text-[10px]">
                              {new Date(r.issued_at).toLocaleDateString("th-TH")}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[r.status]}`}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/tax-invoices/${r.id}`}
                        className="inline-flex items-center rounded-lg border border-border px-3 py-1 text-xs font-medium hover:bg-surface-alt"
                      >
                        ดู →
                      </Link>
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
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs ${
        active
          ? "bg-primary-500 text-white border-primary-500"
          : "bg-white border-border hover:bg-surface-alt"
      }`}
    >
      {children}
    </Link>
  );
}

async function getStatusCounts(
  admin: ReturnType<typeof createAdminClient>,
): Promise<{ pending: number; issued: number; cancelled: number }> {
  const [{ count: pending }, { count: issued }, { count: cancelled }] = await Promise.all([
    admin.from("tax_invoices").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("tax_invoices").select("id", { count: "exact", head: true }).eq("status", "issued"),
    admin.from("tax_invoices").select("id", { count: "exact", head: true }).eq("status", "cancelled"),
  ]);
  return {
    pending:   pending   ?? 0,
    issued:    issued    ?? 0,
    cancelled: cancelled ?? 0,
  };
}
