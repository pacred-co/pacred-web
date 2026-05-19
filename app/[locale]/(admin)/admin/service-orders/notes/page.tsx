/**
 * Admin > Service Orders > "หมายเหตุฝากสั่ง" — standalone notes-list page.
 *
 * Legacy source: `pcs-admin/forwarder-action.php?action=NoteShop`
 *   - L*: SELECT * FROM tb_header_order WHERE hNote <> '' [+ optional hStatus filter]
 *
 * Before this commit the sidebar item ALSO labelled "หมายเหตุฝากสั่ง" linked
 * to `/admin/service-orders?q=note` which the list page does NOT handle —
 * the filter was silently dropped, and the link rendered the unfiltered
 * order list. Owner flagged this. Fix = a dedicated `/notes` route.
 *
 * Pacred-native schema: the legacy `tb_header_order.hNote` lives as
 * `service_orders.note` (text, nullable, migration 0011 L224). Same field,
 * Pacred column-case.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "รอชำระเงิน",
  paid:            "ชำระแล้ว",
  processing:      "กำลังดำเนินการ",
  shipped:         "ส่งแล้ว",
  arrived_thailand: "ถึงไทย",
  delivered:       "สำเร็จ",
  cancelled:       "ยกเลิก",
};

type ServiceOrder = {
  id:        string;
  order_no:  string | null;
  status:    string;
  note:      string | null;
  created_at: string;
  updated_at: string | null;
  total_thb: number | null;
  profile: {
    member_code: string | null;
    first_name:  string | null;
    last_name:   string | null;
    phone:       string | null;
  } | null;
};

export default async function ServiceOrderNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  // legacy menu-purchasing.php — note view sits inside the purchasing
  // module → CS/sales/super (ops alias keeps it open to the cargo team)
  await requireAdmin(["ops", "sales_admin"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // legacy: WHERE hNote<>'' (+ optional hStatus). Pacred: note IS NOT NULL
  // AND note <> ''. Sorted hDateUpdate DESC to match the legacy "ล่าสุด" view.
  let q = admin.from("service_orders")
    .select(`
      id, order_no, status, note, created_at, updated_at, total_thb,
      profile:profiles!profile_id ( member_code, first_name, last_name, phone )
    `)
    .not("note", "is", null)
    .neq("note", "")
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (sp.status) q = q.eq("status", sp.status);

  type RawRow = Omit<ServiceOrder, "profile"> & {
    profile: ServiceOrder["profile"] | ServiceOrder["profile"][];
  };
  const { data } = await q;
  const rows = ((data ?? []) as RawRow[]).map((r) => ({
    ...r,
    profile: Array.isArray(r.profile) ? r.profile[0] ?? null : r.profile,
  }));

  return (
    <div className="pcs-legacy">
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />
      <title>หมายเหตุฝากสั่ง | PR Admin</title>

      <main className="p-6 lg:p-8 space-y-5">
        {/* Breadcrumb */}
        <div className="text-sm text-muted space-x-2">
          <Link href="/admin" className="hover:underline">หน้าแรก</Link>
          <span>›</span>
          <Link href="/admin/service-orders" className="hover:underline">ฝากสั่งสินค้า</Link>
          <span>›</span>
          <span className="font-semibold">หมายเหตุฝากสั่ง</span>
        </div>

        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ฝากสั่งสินค้า</p>
          <h1 className="mt-1 text-2xl font-bold">หมายเหตุฝากสั่ง</h1>
          <p className="mt-1 text-sm text-muted">
            รายการฝากสั่งที่มีหมายเหตุ · {rows.length} รายการ · เรียงตามวันอัปเดตล่าสุด · จำกัด 500 รายการ
          </p>
        </div>

        {/* Filter chips — รวม + filter by status */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted mr-1">สถานะ:</span>
          <FilterChip active={!sp.status} href="/admin/service-orders/notes">ทั้งหมด</FilterChip>
          {Object.entries(STATUS_LABEL).map(([k, label]) => (
            <FilterChip
              key={k}
              active={sp.status === k}
              href={`/admin/service-orders/notes?status=${k}`}
            >
              {label}
            </FilterChip>
          ))}
        </div>

        {/* Table — note rows */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          {rows.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <div className="text-4xl" aria-hidden>📝</div>
              <p className="text-sm font-medium text-foreground">ไม่มีรายการฝากสั่งที่มีหมายเหตุ</p>
              <p className="text-xs text-muted">ลองล้าง/เปลี่ยนตัวกรองสถานะด้านบน</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3">วันอัปเดต / สั่ง</th>
                    <th className="px-4 py-3">เลขออเดอร์</th>
                    <th className="px-4 py-3">ลูกค้า</th>
                    <th className="px-4 py-3">สถานะ</th>
                    <th className="px-4 py-3 text-right">ยอด (บาท)</th>
                    <th className="px-4 py-3">หมายเหตุ</th>
                    <th className="px-4 py-3 text-right">เปิด</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const updated = r.updated_at ?? r.created_at;
                    return (
                      <tr key={r.id} className="border-t border-border align-top">
                        <td className="px-4 py-3 text-xs whitespace-nowrap text-muted">
                          {new Date(updated).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono font-semibold">{r.order_no ?? r.id.slice(0, 8)}</td>
                        <td className="px-4 py-3 text-xs">
                          <div className="font-mono font-semibold">{r.profile?.member_code ?? "—"}</div>
                          <div className="text-muted">{r.profile?.first_name} {r.profile?.last_name}</div>
                          <div className="text-[10px] text-muted">{r.profile?.phone}</div>
                        </td>
                        <td className="px-4 py-3 text-xs">{STATUS_LABEL[r.status] ?? r.status}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs">
                          {r.total_thb != null
                            ? Number(r.total_thb).toLocaleString("th-TH", { minimumFractionDigits: 2 })
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs max-w-[320px]">
                          <div className="rounded bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 px-2 py-1">
                            📝 {r.note}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-xs">
                          <Link
                            href={`/admin/service-orders/${r.id}`}
                            className="text-primary-500 hover:underline whitespace-nowrap"
                          >
                            เปิด →
                          </Link>
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
