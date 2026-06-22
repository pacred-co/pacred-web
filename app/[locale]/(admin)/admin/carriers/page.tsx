import { createAdminClient } from "@/lib/supabase/admin";
import { CarrierForm } from "./carrier-form";
import { CarrierRowActions } from "./row-actions";
import { parsePage, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { CsvButton, type CsvCol, type CsvRow } from "@/components/admin/csv-button";
import { exportCarriersAll } from "@/actions/admin/export/carriers";
import { PageHeader } from "@/components/admin/page-header";

export const dynamic = "force-dynamic";

/**
 * /admin/carriers — manage shipping carriers (U2-3).
 *
 * Per chat audit L-8: SPX/J&T/Flash/EMS/Lalamove asks happened ~4x in
 * 6 weeks. Admin can now CRUD carriers without dev escalation.
 *
 * Layout: list table on top + inline NewCarrierForm panel below. Edit
 * happens via row-action edit button → expands inline form pre-populated.
 *
 * Roles: super OR ops (carriers = operational config). Sidebar nav
 * already restricts; this server component runs through admin layout
 * which guards via requireAdmin.
 */

type Row = {
  id:                    string;
  code:                  string;
  name_th:               string;
  name_en:               string;
  tracking_url_template: string | null;
  is_active:             boolean;
  sort_order:            number;
  note:                  string | null;
  created_at:            string;
  updated_at:            string;
};

export default async function AdminCarriersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("carriers")
    .select("id, code, name_th, name_en, tracking_url_template, is_active, sort_order, note, created_at, updated_at")
    .order("is_active", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("name_th",    { ascending: true })
    .returns<Row[]>();
  if (error) {
    console.error(`[carriers list] failed`, { code: error.code, message: error.message });
  }

  const rows = data ?? [];
  const activeCount   = rows.filter((r) => r.is_active).length;
  const inactiveCount = rows.length - activeCount;

  // PERF (2026-06-03): client-slice the displayed table (50/page) — counts
  // above stay full-set-correct (JS-derived over all rows).
  const page = parsePage(sp.page);
  const offset = (page - 1) * DEFAULT_PAGE_SIZE;
  const pageRows = rows.slice(offset, offset + DEFAULT_PAGE_SIZE);

  // CSV — columns mirror the table <thead> 1:1 (+ note + audit dates).
  const csvCols: CsvCol[] = [
    { key: "sort_order",            label: "Sort" },
    { key: "code",                  label: "Code" },
    { key: "name_th",               label: "ชื่อ TH" },
    { key: "name_en",               label: "ชื่อ EN" },
    { key: "tracking_url_template", label: "Tracking URL" },
    { key: "status",                label: "สถานะ" },
    { key: "note",                  label: "หมายเหตุ" },
    { key: "created_at",            label: "สร้างเมื่อ" },
    { key: "updated_at",            label: "แก้ไขเมื่อ" },
  ];
  const csvRows: CsvRow[] = pageRows.map((r) => ({
    sort_order:            r.sort_order,
    code:                  r.code,
    name_th:               r.name_th,
    name_en:               r.name_en,
    tracking_url_template: r.tracking_url_template ?? "",
    status:                r.is_active ? "active" : "inactive",
    note:                  r.note ?? "",
    created_at:            (r.created_at ?? "").slice(0, 10),
    updated_at:            (r.updated_at ?? "").slice(0, 10),
  }));

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-5xl">
      {/* §0h — one consistent page-title hierarchy via <PageHeader>. Display-only
          swap; same eyebrow + title + subtitle + counts + CSV action as before. */}
      <PageHeader
        eyebrow="ADMIN · ปฏิบัติการ"
        title="จัดการขนส่ง (Carriers)"
        subtitle={
          <>
            เพิ่ม/แก้ไขผู้ให้บริการขนส่ง (SPX/J&amp;T/Flash/EMS/Lalamove ฯลฯ).
            Code เปลี่ยนภายหลังไม่ได้ — ถ้าตั้งผิดให้สร้างใหม่ + soft-delete อันเก่า.
            <br />
            {activeCount} active · {inactiveCount} inactive · รวม {rows.length} รายการ
          </>
        }
        actions={
          <CsvButton
            rows={csvRows}
            cols={csvCols}
            filename="carriers.csv"
            fetchAll={async () => {
              "use server";
              return exportCarriersAll();
            }}
          />
        }
      />

      {/* List */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ยังไม่มีขนส่งในระบบ</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 w-20">Sort</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">ชื่อ TH / EN</th>
                  <th className="px-4 py-3">Tracking URL</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3 w-32"></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.id} className={`border-t border-border align-top ${!r.is_active ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3 text-xs font-mono text-muted">{r.sort_order}</td>
                    <td className="px-4 py-3 text-xs font-mono">{r.code}</td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-medium">{r.name_th}</div>
                      <div className="text-muted">{r.name_en}</div>
                      {r.note && <div className="text-[11px] text-muted mt-1">📝 {r.note}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {r.tracking_url_template ? (
                        <code className="text-[11px] break-all">{r.tracking_url_template}</code>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                          r.is_active
                            ? "bg-green-50 text-green-700 border-green-200"
                            : "bg-gray-50 text-gray-600 border-gray-200"
                        }`}
                      >
                        {r.is_active ? "active" : "inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <CarrierRowActions
                        id={r.id}
                        isActive={r.is_active}
                        initial={{
                          name_th:               r.name_th,
                          name_en:               r.name_en,
                          tracking_url_template: r.tracking_url_template ?? "",
                          sort_order:            r.sort_order,
                          note:                  r.note ?? "",
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
          basePath="/admin/carriers"
        />
      </div>

      {/* Create panel */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        <h2 className="font-bold text-sm mb-3">+ เพิ่มขนส่งใหม่</h2>
        <CarrierForm mode="create" />
      </div>
    </main>
  );
}
