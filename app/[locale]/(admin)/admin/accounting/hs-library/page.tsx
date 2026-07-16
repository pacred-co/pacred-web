import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { AccountingMenubar } from "@/components/admin/accounting-menubar";

import { HsLibraryClient } from "./hs-library-client";
import type { HsCodeListRow } from "@/actions/admin/hs-codes";

/**
 * /admin/accounting/hs-library — คลัง HS CODE LIBRARY (the ONE HS page).
 *
 * Owner 2026-07-16: "ให้เอาพิกัดไปรวมไว้ที่เดียวกันเลย · ระบบพิกัด HS CODE ทั้งหมด
 * ยุบทิ้ง ให้มารวมกันอยู่ทีเดียว และหน้าเดียวกัน · ใช้ docbot เป็นพื้นฐาน แล้วต่อยอด
 * แก้เป็น คลัง HS CODE LIBRARY ตัวเต็มจริงๆ"
 *
 * This page absorbed the former /hs-library/bot sub-page (now a redirect) — the
 * two HS surfaces are one. It shows the library on TWO axes, because the data
 * genuinely has two grains and flattening them would lose information:
 *   §1 พิกัด        — code-grain (hs_codes · ~1,718) = the duty library
 *   §2 สินค้า→พิกัด  — product-grain (doc_bot_hs_codes · 5,335) = the aliases,
 *                     พิกัดหลัก/รอง, conflict groups, เลี่ยงพิกัด intel
 *
 * PERF (owner: "ห้ามทำงานบัค งานหาย" + the platform is slow): only §1 is loaded
 * server-side (~1,718 rows). §2's 5,335 alias rows + the overrides lazy-load on
 * first open, so the initial paint is not paying for a tab nobody opened.
 *
 * ⚠️ REFERENCE / DICTIONARY DATA (AGENTS.md §0e) — editing here never touches a
 * selling price or an order. It DOES feed the duty HINT that the cost editor /
 * ใบขน seeder snapshot, which is exactly why duty_confirmed is surfaced: an
 * unconfirmed 0 means "ไม่ทราบ", never "ยกเว้น".
 *
 * RBAC: super | accounting | pricing | freight_import_doc | freight_clearance_both
 * (enforced here AND by every server action). §0c: the read destructures error.
 * §0d: reachable from the accounting menubar + the sidebar "บริการ → พิธีการ
 * ศุลกากร & เอกสาร".
 */

export const dynamic = "force-dynamic";

const VIEW_ROLES = [
  "super",
  "accounting",
  "pricing",
  "freight_import_doc",
  "freight_clearance_both",
] as const;

// Mirrors HS_FULL_SELECT in actions/admin/hs-codes.ts — the edit form round-trips
// what it reads, so a lighter projection here would WIPE other_forms/hs_note.
const HS_FULL_SELECT =
  "code, description, description_en, default_duty_pct, form_e_duty_pct, other_forms, " +
  "unit, hs_note, note, default_stat_code, is_active, source, provenance, is_canonical, " +
  "duty_confirmed, decl_count, decl_duty_pct, decl_form_e_pct, decl_duty_stable, " +
  "decl_last_used, hs8_is_padded";

export default async function HsLibraryPage() {
  await requireAdmin([...VIEW_ROLES]);

  const admin = createAdminClient();
  // The whole library (~1,718 rows · text-only) so §1 filters instantly client-side.
  // 3000 = headroom; the client render-caps for responsiveness.
  const { data, error } = await admin
    .from("hs_codes")
    .select(HS_FULL_SELECT)
    .order("code", { ascending: true })
    .limit(3000);
  if (error) {
    console.error("[hs-library initial load]", { code: error.code, message: error.message });
  }
  const rows = ((data ?? []) as unknown as HsCodeListRow[]).map((r) => ({
    ...r,
    default_duty_pct: Number(r.default_duty_pct),
    form_e_duty_pct:  Number(r.form_e_duty_pct),
    decl_count:       Number(r.decl_count ?? 0),
    decl_duty_pct:    r.decl_duty_pct == null ? null : Number(r.decl_duty_pct),
    decl_form_e_pct:  r.decl_form_e_pct == null ? null : Number(r.decl_form_e_pct),
  }));

  return (
    <>
      <AccountingMenubar activeHref="/admin/accounting/hs-library" />
      <main className="p-6 lg:p-8 space-y-5 max-w-7xl">
        <header className="space-y-1">
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · บัญชี · คลัง HS</p>
          <h1 className="text-2xl font-bold">คลัง HS CODE LIBRARY</h1>
          <p className="text-xs text-muted leading-relaxed">
            คลังพิกัดศุลกากรของ Pacred <b>ที่เดียว จบในหน้าเดียว</b> — รวม <b>พิกัด + อากรปกติ + Form-E + ฟอร์มอื่นๆ +
            รหัสสถิติ</b> เข้ากับ <b>คลังบอท/ไฟล์</b> (ชื่อสินค้า → พิกัดหลัก-รอง) และ <b>อากรที่ใช้จริงบนใบขน</b>{" "}
            เพื่อเทียบว่าเลขที่เราเก็บ ตรงกับที่ยิงจริงหรือไม่.
          </p>
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              โหลดคลัง HS ไม่สำเร็จ ({error.code ?? "unknown"}) — ลองรีเฟรชหน้าอีกครั้ง
            </p>
          )}
        </header>

        <HsLibraryClient initialRows={rows} />
      </main>
    </>
  );
}
