"use server";

/**
 * Export-all (CSV) สำหรับ `/admin/customs-leads` — คิวเซลโทรตามลูกค้าที่ใช้ใบขน
 * (`customs_importer_lead` · ดึงจากใบขน NetBay).
 *
 * ปุ่ม "⬇ CSV" บนหน้า ดาวน์โหลดเฉพาะแถวที่โหลดมาแสดง (หน้าจำกัด 1,000 แถว)
 * ส่วนตัวนี้หนุนปุ่ม "⬇ CSV ทั้งหมด" = ยิง query เดิมซ้ำแบบไม่จำกัดหน้า (cap ที่
 * EXPORT_CAP) แล้วเขียน `admin_export_log` — ไฟล์นี้มี **ชื่อบริษัท · เลขนิติ ·
 * เบอร์โทร** จึงต้องมี trail เสมอตาม owner directive.
 *
 * DRIFT-FREE: filter chain ด้านล่างสะท้อนของหน้า
 * (`app/[locale]/(admin)/admin/customs-leads/page.tsx`) ตัวต่อตัว —
 *   view: all | existing | new | call
 *   .contains("transports",[transport]) · .eq("lead_status",status)
 *   .eq("assigned_sale",sale) · .or(ilike 4 ช่อง)
 *   .order("decl_count",{ascending:false})
 * ต่างกันแค่ .limit(1000) → .range(0, EXPORT_CAP) + audit log.
 * คอลัมน์/การแปลงค่าใช้ตัวเดียวกับปุ่มบนหน้า (`lib/admin/customs-lead-csv.ts`)
 * → ไฟล์จาก 2 ปุ่มมีหน้าตาเหมือนกันเสมอ.
 *
 * RBAC ตรงกับหน้า: super / sales / sales_admin / ops.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import {
  customsLeadCsvRow,
  type CustomsLeadCsvInput,
} from "@/lib/admin/customs-lead-csv";
import type { CsvRow } from "@/components/admin/csv-button";

/** เพดานกันดึงทีเดียวจนหน่วง (ตารางจริงตอนนี้ ~254 แถว). */
const EXPORT_CAP = 10000;

export type CustomsLeadExportFilters = {
  view?: string;      // all | existing | new | call
  transport?: string; // road | sea | air
  status?: string;
  sale?: string;
  q?: string;
};

export async function exportCustomsLeadsAll(
  f: CustomsLeadExportFilters = {},
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  // ด่านเดียวกับหน้า
  await requireAdmin(["super", "sales", "sales_admin", "ops"]);

  const admin = createAdminClient();

  let q = admin
    .from("customs_importer_lead")
    .select("*")
    .order("decl_count", { ascending: false })
    .range(0, EXPORT_CAP); // ขอเกิน 1 แถวเพื่อรู้ว่าโดนตัดหรือเปล่า

  const view = f.view ?? "all";
  if (view === "existing") q = q.eq("is_existing", true);
  else if (view === "new")
    q = q.eq("is_existing", false).neq("lead_status", "our_own");
  else if (view === "call")
    q = q
      .in("lead_status", ["new", "called", "interested"])
      .neq("lead_status", "our_own");
  if (f.transport) q = q.contains("transports", [f.transport]);
  if (f.status) q = q.eq("lead_status", f.status);
  if (f.sale) q = q.eq("assigned_sale", f.sale);
  if (f.q && f.q.trim()) {
    const s = f.q.trim();
    q = q.or(
      `name_th.ilike.%${s}%,name_en.ilike.%${s}%,tax_id.ilike.%${s}%,matched_phone.ilike.%${s}%`,
    );
  }

  const { data, error } = await q;
  if (error) {
    // §0c — อย่ากลืน error เงียบ: คืนศูนย์แถวพร้อม log ให้ตามได้ (ปุ่มจะเด้ง
    // "ไม่พบข้อมูลสำหรับ export" ไม่ใช่ดาวน์โหลดไฟล์เปล่าแบบไม่รู้ตัว)
    console.error("[exportCustomsLeadsAll] failed", {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (data ?? []) as unknown as CustomsLeadCsvInput[];
  const truncated = all.length > EXPORT_CAP;
  const leads = truncated ? all.slice(0, EXPORT_CAP) : all;

  const rows = leads.map(customsLeadCsvRow);

  await logAdminExport({
    dataset: "customs-leads",
    filters: {
      view,
      transport: f.transport ?? null,
      status: f.status ?? null,
      sale: f.sale ?? null,
      q: f.q ?? null,
    },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
