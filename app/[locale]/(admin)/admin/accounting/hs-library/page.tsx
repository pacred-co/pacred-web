import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageTopMenubar } from "@/components/admin/page-top-menubar";
import { CARGO_MENUBAR } from "@/lib/admin/accounting-menubar";
import { HsLibraryClient, type HsRow } from "./hs-library-client";

/**
 * /admin/accounting/hs-library — คลัง HS (อากร) · the HS-code duty dictionary.
 *
 * Owner spec 2026-06-12: extend the EXISTING hs_codes dictionary (mig 0030 +
 * 0180) into a managed library so staff maintain — per HS code — the normal duty
 * (อากรปกติ), the Form-E / ACFTA preferential duty, other preferential forms
 * (อื่นๆ), and a note. The cost-editor reads these as an informational hint.
 *
 * ⚠️ REFERENCE / DICTIONARY DATA ONLY (AGENTS.md §0e) — managing a code here
 * never touches a selling price, an order, or a declaration's persisted duty.
 *
 * RBAC: super | accounting | pricing | freight_import_doc | freight_clearance_both
 * (mirrors the cargo-taxdoc-workspace roles · enforced here + by the server
 * actions). §0c: the initial read destructures error. §0d: reachable from the
 * accounting menubar + the sidebar "บริการ → พิธีการศุลกากร & เอกสาร".
 */

export const dynamic = "force-dynamic";

const VIEW_ROLES = [
  "super",
  "accounting",
  "pricing",
  "freight_import_doc",
  "freight_clearance_both",
] as const;

export default async function HsLibraryPage() {
  await requireAdmin([...VIEW_ROLES]);

  const admin = createAdminClient();
  // Initial load = the first 200 codes (the client re-queries on search).
  const { data, error } = await admin
    .from("hs_codes")
    .select(
      "code, description, description_en, default_duty_pct, form_e_duty_pct, " +
        "other_forms, unit, hs_note, note, default_stat_code, is_active",
    )
    .order("code", { ascending: true })
    .limit(200);
  if (error) {
    console.error("[hs-library initial load]", { code: error.code, message: error.message });
  }
  const rows = ((data ?? []) as unknown) as HsRow[];

  return (
    <>
      <PageTopMenubar items={CARGO_MENUBAR} activeHref="/admin/accounting/hs-library" />
      <main className="p-6 lg:p-8 space-y-6 max-w-6xl">
        <header>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · บัญชี · คลัง HS</p>
          <h1 className="mt-1 text-2xl font-bold">คลัง HS (พิกัด + อากร)</h1>
          <p className="text-xs text-muted mt-1">
            คลังพิกัดศุลกากร (HS Code) พร้อม <b>อากรปกติ</b> · <b>อากร Form-E / ACFTA</b> และฟอร์มอื่นๆ ·
            ใช้เป็นข้อมูลอ้างอิงเมื่อกรอกต้นทุน/มูลค่าสำแดง (ใบขน) ในหน้ารายการสินค้า.
          </p>
          <p className="text-[10px] text-muted mt-1">
            ⚠️ ข้อมูลอ้างอิงเท่านั้น — การแก้ไขที่นี่ <b>ไม่กระทบราคาขาย · ออเดอร์ · หรืออากรที่บันทึกในใบขน</b>.
            ตัวเลขในใบขนยังต้องกรอก/ยืนยันเองตามนโยบาย.
          </p>
        </header>

        <HsLibraryClient initialRows={rows} />
      </main>
    </>
  );
}
