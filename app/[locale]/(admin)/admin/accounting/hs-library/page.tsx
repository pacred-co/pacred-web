import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { HsLibraryClient } from "./hs-library-client";
import type { HsCodeListRow } from "@/actions/admin/hs-codes";

/**
 * /admin/accounting/hs-library — คลัง HS CODE LIBRARY (the ONE HS page).
 *
 * Owner 2026-07-16: "ให้เอาพิกัดไปรวมไว้ที่เดียวกันเลย · ระบบพิกัด HS CODE ทั้งหมด
 * ยุบทิ้ง ให้มารวมกันอยู่ทีเดียว และหน้าเดียวกัน · ใช้ docbot เป็นพื้นฐาน แล้วต่อยอด
 * แก้เป็น คลัง HS CODE LIBRARY ตัวเต็มจริงๆ"
 *
 * 2026-08-03 — owner ย้ำรอบสอง: "ทำไมยังมี 2 แทป · รวมกันทั้งหน้าตาการใช้งาน
 * และ DB · table เดียวกัน ใช้ที่เดียวกัน" ⇒ ONE table, ONE view now:
 * doc_bot's product-grain moved ONTO the hs_codes row as `product_aliases`
 * (mig 0285 + merge script) — each พิกัด row carries every product name ever
 * asked for it; the search matches those names, so the old แท็บ 2's job
 * (พิมพ์ชื่อสินค้า → เจอพิกัด) happens in the SAME list. No tabs. No second
 * table read. AccountingMenubar removed (owner: "ทำไมมีเมนูบัญชีติดมา") —
 * the page enters from the sidebar (พิธีการศุลกากร & เอกสาร · first item).
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
  "decl_last_used, hs8_is_padded, product_aliases";

export default async function HsLibraryPage() {
  await requireAdmin([...VIEW_ROLES]);

  const admin = createAdminClient();
  // The whole library so the list filters instantly client-side.
  // ⚠️ fetchAllRows, NOT .limit(3000) — PostgREST hard-caps a response at
  // 1,000 rows regardless of the requested limit, so the old read silently
  // showed 1,000/1,757 พิกัด (caught 2026-08-03 from the owner's own
  // screenshot: a suspiciously-round "1,000"). Same class as the report-cnt
  // 60/66-container bug — query ที่อาจเกิน 1,000 แถว ต้อง fetchAllRows เสมอ.
  const { data, error } = await fetchAllRows<HsCodeListRow>(() =>
    admin
      .from("hs_codes")
      .select(HS_FULL_SELECT)
      .order("code", { ascending: true }),
  );
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
    product_aliases:  Array.isArray(r.product_aliases) ? r.product_aliases : [],
  }));

  return (
    <>
      <main className="p-6 lg:p-8 space-y-5 max-w-7xl">
        <header className="space-y-1">
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · คลัง HS</p>
          <h1 className="text-2xl font-bold">คลัง HS CODE LIBRARY</h1>
          <p className="text-xs text-muted leading-relaxed">
            คลังพิกัดศุลกากรของ Pacred <b>ตารางเดียว จบในหน้าเดียว</b> — แต่ละพิกัดรวม <b>อากรปกติ + Form-E +
            ฟอร์มอื่นๆ + รหัสสถิติ</b> · <b>ชื่อสินค้าทุกชื่อที่เคยถาม/ตอบ</b> (จากบอท ไฟล์ และแชท) อยู่บนแถวพิกัดนั้นเลย
            — พิมพ์ชื่อสินค้าในช่องค้นหาก็เจอพิกัด · พร้อม <b>อากรที่ใช้จริงบนใบขน</b> เทียบว่าเลขที่เก็บตรงกับที่ยิงจริงหรือไม่.
          </p>
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              โหลดคลัง HS ไม่สำเร็จ ({error.code ?? "unknown"}) — ลองรีเฟรชหน้าอีกครั้ง
            </p>
          )}
        </header>

        {/* owner 2026-08-07 "เอาพวกเอกสาร doc พิกัด ข้อมูลต่างๆ ไปใส่ไว้ใน คลัง HS CODE"
            — หน้าคิวพิกัดที่แยกออกไป (คิวใส่พิกัดของ CS · คิวถามพิกัดส่ง Doc) ถูกยุบ
            มารวมที่นี่: prod ทั้งคู่ 0 แถว/ไม่เคยใช้ ส่วนความรู้จริง (อากร · ฟอร์ม E ·
            ฟอร์มอื่น · รหัสสถิติ · ชื่อสินค้า · โน้ตเลี่ยงพิกัด/ใบอนุญาต) อยู่บนแถว
            พิกัดในตารางนี้อยู่แล้ว = ที่เดียวจบ. */}
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-[11.5px] text-sky-900 leading-relaxed">
          <b>📚 ที่เดียวจบเรื่องพิกัด</b> — ทุกอย่างอยู่บนแถวพิกัดในตารางข้างล่างนี้:
          <b> อากรปกติ · ฟอร์ม E (ACFTA) · ฟอร์มอื่นๆ · รหัสสถิติ · ชื่อสินค้าที่เคยถาม ·
          โน้ต</b> (ใบอนุญาต/ข้อควรระวัง). พิมพ์ <b>ชื่อสินค้าไทย/จีน/อังกฤษ</b> หรือ
          <b> เลขพิกัด</b> ในช่องค้นหาก็เจอ. เจอสินค้าใหม่ที่ยังไม่มีพิกัด → กด
          <b> “+ เพิ่มพิกัด”</b> บันทึกไว้เลย ครั้งหน้าทั้งทีมค้นเจอ.
          <span className="mt-1 block text-sky-700">
            (2026-08-07 ยุบคิว “ใส่พิกัดให้ออเดอร์” + “ถามพิกัด” เข้ามาที่นี่ — ทั้งคู่ไม่เคยมีงานจริงในระบบ)
          </span>
        </div>

        <HsLibraryClient initialRows={rows} />
      </main>
    </>
  );
}
