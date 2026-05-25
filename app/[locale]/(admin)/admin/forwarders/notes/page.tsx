/**
 * Admin > Forwarders > "หมายเหตุนำเข้า" — standalone notes-list page.
 *
 * Legacy source: `pcs-admin/forwarder-action.php?action=Note`
 *   - SELECT * FROM tb_forwarder WHERE fNote <> '' [+ optional fStatus filter]
 *
 * Before this commit the sidebar item linked to `/admin/forwarders?q=note`
 * but the list page does NOT handle `?q=note` — the link rendered the
 * unfiltered list. Owner flagged this. Fix = a dedicated `/notes` route.
 *
 * Pacred-native schema (migration 0010 L140-141):
 *   - `forwarders.note_admin` (text) — legacy fNote
 *   - `forwarders.note_user`  (text) — legacy fNoteUser (customer-side note)
 *
 * This page surfaces BOTH columns; either being non-empty qualifies the
 * row.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "รอชำระ",
  shipped_china:   "ออกจีน",
  in_transit:      "กลางทาง",
  arrived_thailand: "ถึงไทย",
  out_for_delivery: "กำลังจัดส่ง",
  delivered:       "สำเร็จ",
  cancelled:       "ยกเลิก",
};

type Forwarder = {
  id:                string;
  f_no:              string;
  status:            string;
  note_admin:        string | null;
  note_user:         string | null;
  created_at:        string;
  updated_at:        string | null;
  total_price:       number | null;
  tracking_chn:      string | null;
  tracking_th:       string | null;
  profile: {
    member_code: string | null;
    first_name:  string | null;
    last_name:   string | null;
    phone:       string | null;
  } | null;
};

export default async function ForwarderNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  // legacy menu-forwarder.php — note view sits inside the forwarder module
  // → ops (warehouse + cs) + sales_admin (follow-up). super implicit.
  await requireAdmin(["ops", "sales_admin"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // legacy: WHERE fNote<>'' (+ optional fStatus). Pacred surfaces BOTH
  // note_admin + note_user — either non-empty puts the row on the list.
  let q = admin.from("forwarders")
    .select(`
      id, f_no, status, note_admin, note_user, created_at, updated_at,
      total_price, tracking_chn, tracking_th,
      profile:profiles!profile_id ( member_code, first_name, last_name, phone )
    `)
    .or("note_admin.not.is.null,note_user.not.is.null")
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (sp.status) q = q.eq("status", sp.status);

  type RawRow = Omit<Forwarder, "profile"> & {
    profile: Forwarder["profile"] | Forwarder["profile"][];
  };
  const { data, error } = await q;
  if (error) {
    console.error(`[forwarders list] failed`, { code: error.code, message: error.message });
  }
  // filter empty-string post-load (Supabase .neq("","") can't combine via .or)
  const rows = ((data ?? []) as RawRow[])
    .filter((r) => (r.note_admin && r.note_admin.trim()) || (r.note_user && r.note_user.trim()))
    .map((r) => ({
      ...r,
      profile: Array.isArray(r.profile) ? r.profile[0] ?? null : r.profile,
    }));

  return (
    <div className="pcs-legacy">
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />
      <title>หมายเหตุนำเข้า | PR Admin</title>

      <main className="p-6 lg:p-8 space-y-5">
        {/* Breadcrumb */}
        <div className="text-sm text-muted space-x-2">
          <Link href="/admin" className="hover:underline">หน้าแรก</Link>
          <span>›</span>
          <Link href="/admin/forwarders" className="hover:underline">ฝากนำเข้า</Link>
          <span>›</span>
          <span className="font-semibold">หมายเหตุนำเข้า</span>
        </div>

        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ฝากนำเข้า</p>
          <h1 className="mt-1 text-2xl font-bold">หมายเหตุนำเข้า</h1>
          <p className="mt-1 text-sm text-muted">
            รายการฝากนำเข้าที่มีหมายเหตุ · {rows.length} รายการ · เรียงตามวันอัปเดตล่าสุด · จำกัด 500 รายการ
          </p>
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted mr-1">สถานะ:</span>
          <FilterChip active={!sp.status} href="/admin/forwarders/notes">ทั้งหมด</FilterChip>
          {Object.entries(STATUS_LABEL).map(([k, label]) => (
            <FilterChip
              key={k}
              active={sp.status === k}
              href={`/admin/forwarders/notes?status=${k}`}
            >
              {label}
            </FilterChip>
          ))}
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          {rows.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <div className="text-4xl" aria-hidden>📝</div>
              <p className="text-sm font-medium text-foreground">ไม่มีรายการฝากนำเข้าที่มีหมายเหตุ</p>
              <p className="text-xs text-muted">ลองล้าง/เปลี่ยนตัวกรองสถานะด้านบน</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3">วันอัปเดต / สั่ง</th>
                    <th className="px-4 py-3">เลขนำเข้า</th>
                    <th className="px-4 py-3">ลูกค้า</th>
                    <th className="px-4 py-3">สถานะ</th>
                    <th className="px-4 py-3 text-right">ยอด (บาท)</th>
                    <th className="px-4 py-3">Tracking</th>
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
                        <td className="px-4 py-3 text-xs font-mono font-semibold">{r.f_no}</td>
                        <td className="px-4 py-3 text-xs">
                          <div className="font-mono font-semibold">{r.profile?.member_code ?? "—"}</div>
                          <div className="text-muted">{r.profile?.first_name} {r.profile?.last_name}</div>
                          <div className="text-[10px] text-muted">{r.profile?.phone}</div>
                        </td>
                        <td className="px-4 py-3 text-xs">{STATUS_LABEL[r.status] ?? r.status}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs">
                          {r.total_price != null
                            ? Number(r.total_price).toLocaleString("th-TH", { minimumFractionDigits: 2 })
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs space-y-1">
                          {r.tracking_chn && <div className="font-mono text-[10px]">🇨🇳 {r.tracking_chn}</div>}
                          {r.tracking_th &&  <div className="font-mono text-[10px]">🇹🇭 {r.tracking_th}</div>}
                          {!r.tracking_chn && !r.tracking_th && <span className="text-muted">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs max-w-[320px] space-y-1">
                          {r.note_admin && r.note_admin.trim() && (
                            <div className="rounded bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-2 py-1">
                              <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-300">แอดมิน</span>
                              <div>📝 {r.note_admin}</div>
                            </div>
                          )}
                          {r.note_user && r.note_user.trim() && (
                            <div className="rounded bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 px-2 py-1">
                              <span className="text-[10px] font-semibold text-yellow-700 dark:text-yellow-300">ลูกค้า</span>
                              <div>📝 {r.note_user}</div>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-xs">
                          <Link
                            href={`/admin/forwarders/${r.f_no}`}
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
