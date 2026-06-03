import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PartnerForm } from "./partner-form";
import { PartnerRowActions } from "./row-actions";
import { PARTNER_TYPE_LABELS_TH } from "./types";
import { parsePage, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";

/**
 * /admin/partners — manage the external partner directory (CLAUDE.md §PM-6 #3).
 *
 * "Partner" = an external logistics/business company Pacred works with
 * (GOGO/JMF/TTP/MOMO/CargoThai consolidators · warehouse partners · customs
 * brokers · messengers · API providers). Admin-managed CRM-style directory.
 *
 * Gate: super only (the page guards explicitly; the admin layout already
 * runs requireAdmin, but the build brief asked for requireAdmin(["super"])).
 *
 * Layout: list table on top + inline "add partner" panel below. Edit happens
 * via the row-action ✏️ button → expands the form pre-populated.
 */

export const dynamic = "force-dynamic";

type Row = {
  id:            string;
  code:          string;
  name:          string;
  name_en:       string | null;
  partner_type:  string;
  contact_name:  string | null;
  contact_phone: string | null;
  contact_email: string | null;
  note:          string | null;
  is_active:     boolean;
  sort:          number;
  created_at:    string;
  updated_at:    string;
};

export default async function AdminPartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin(["super"]);

  const sp = await searchParams;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("partners")
    .select(
      "id, code, name, name_en, partner_type, contact_name, contact_phone, contact_email, note, is_active, sort, created_at, updated_at",
    )
    .order("is_active", { ascending: false })
    .order("sort",      { ascending: true })
    .order("name",      { ascending: true })
    .returns<Row[]>();
  if (error) {
    console.error(`[partners list] failed`, { code: error.code, message: error.message });
  }

  const rows = data ?? [];
  const activeCount   = rows.filter((r) => r.is_active).length;
  const inactiveCount = rows.length - activeCount;

  // PERF (2026-06-03): client-slice the displayed table (50/page) — counts
  // above stay full-set-correct (JS-derived over all rows).
  const page = parsePage(sp.page);
  const offset = (page - 1) * DEFAULT_PAGE_SIZE;
  const pageRows = rows.slice(offset, offset + DEFAULT_PAGE_SIZE);

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-5xl">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · เครื่องมือ</p>
        <h1 className="mt-1 text-2xl font-bold">พาร์ทเนอร์ (Partners)</h1>
        <p className="mt-1 text-sm text-muted">
          ทำเนียบบริษัทพาร์ทเนอร์ภายนอกที่ Pacred ทำงานด้วย — ผู้รวบรวมสินค้า
          (GOGO/JMF/TTP/MOMO/CargoThai), โกดังจีน-ไทย, ตัวแทนออกของ,
          แมสเซ็นเจอร์, ผู้ให้บริการ API ฯลฯ.
          Code เปลี่ยนภายหลังไม่ได้ — ถ้าตั้งผิดให้สร้างใหม่ + ปิด/ลบอันเก่า.
        </p>
        <p className="mt-1 text-xs text-muted">
          {activeCount} active · {inactiveCount} inactive · รวม {rows.length} รายการ
        </p>
      </div>

      {/* List */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ยังไม่มีพาร์ทเนอร์ในระบบ — เพิ่มรายการแรกด้านล่าง</p>
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 w-16">Sort</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">ชื่อ / ประเภท</th>
                  <th className="px-4 py-3">ผู้ติดต่อ</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3 w-40"></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.id} className={`border-t border-border align-top ${!r.is_active ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3 text-xs font-mono text-muted">{r.sort}</td>
                    <td className="px-4 py-3 text-xs font-mono">{r.code}</td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-medium">{r.name}</div>
                      {r.name_en && <div className="text-muted">{r.name_en}</div>}
                      <div className="mt-1">
                        <span className="rounded-full border border-border bg-surface-alt/40 px-2 py-0.5 text-[10px] text-muted">
                          {PARTNER_TYPE_LABELS_TH[r.partner_type] ?? r.partner_type}
                        </span>
                      </div>
                      {r.note && <div className="text-[10px] text-muted mt-1">📝 {r.note}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {r.contact_name || r.contact_phone || r.contact_email ? (
                        <div className="space-y-0.5">
                          {r.contact_name  && <div className="font-medium">{r.contact_name}</div>}
                          {r.contact_phone && <div className="text-muted">{r.contact_phone}</div>}
                          {r.contact_email && <div className="text-[10px] text-muted break-all">{r.contact_email}</div>}
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                          r.is_active
                            ? "bg-green-50 text-green-700 border-green-200"
                            : "bg-gray-50 text-gray-600 border-gray-200"
                        }`}
                      >
                        {r.is_active ? "active" : "inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <PartnerRowActions
                        id={r.id}
                        isActive={r.is_active}
                        initial={{
                          name:          r.name,
                          name_en:       r.name_en ?? "",
                          partner_type:  r.partner_type,
                          contact_name:  r.contact_name ?? "",
                          contact_phone: r.contact_phone ?? "",
                          contact_email: r.contact_email ?? "",
                          note:          r.note ?? "",
                          sort:          r.sort,
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={page}
          pageSize={DEFAULT_PAGE_SIZE}
          total={rows.length}
          basePath="/admin/partners"
        />
      </div>

      {/* Create panel */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        <h2 className="font-bold text-sm mb-3">+ เพิ่มพาร์ทเนอร์ใหม่</h2>
        <PartnerForm mode="create" />
      </div>
    </main>
  );
}
