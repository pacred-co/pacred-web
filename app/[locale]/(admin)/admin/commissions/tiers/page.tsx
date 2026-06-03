import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

/**
 * /admin/commissions/tiers — TOMBSTONED 2026-06-02 per ADR-0026 D-3.
 *
 * The page used to read + mutate `commission_tiers` (DEAD rebuilt table · 0
 * rows on prod). The faithful flow per ADR-0020 + `lib/sales-commission/calc.ts`
 * hardcodes the legacy 1% rate × all 4 VIP teams (THADA.VIP · SIN.VIP ·
 * OOAEOM.VIP · SWAN). No per-tier UI is needed until the team-set grows or
 * the rate needs to vary — at which point a fresh page should be built on a
 * new tb_user_sales-aligned `tb_commission_tier_*` schema, NOT on the dead
 * `commission_tiers` table.
 *
 * Keeping the URL alive (with a clear banner) so a stale sidebar link doesn't
 * 404 — eventually delete-able. The `tier-form` + `row-actions` client
 * components remain in the tree (their imports of `adminUpsertCommissionTier`
 * still resolve · the tombstoned action now early-returns an error if a
 * stale render somehow fires).
 */

export const dynamic = "force-dynamic";

export default async function AdminCommissionTiersTombstone() {
  await requireAdmin(["super", "accounting"]);

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-3xl">
      <header>
        <Link href="/admin/commissions" className="text-xs text-primary-500 hover:underline">
          ← กลับหน้าค่าคอม
        </Link>
        <p className="mt-1 text-xs font-semibold tracking-widest text-amber-600">ADMIN · ⚠️ ทอมโบสโตน</p>
        <h1 className="mt-1 text-2xl font-bold">อัตราค่าคอม (Tiers)</h1>
      </header>

      <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 space-y-3">
        <p className="text-sm font-bold text-amber-900">
          🚧 หน้านี้ถูกพักการใช้งานชั่วคราว (Tombstoned 2026-06-02)
        </p>
        <p className="text-sm text-amber-800">
          ตาราง <code className="bg-amber-100 px-1 rounded">commission_tiers</code> เป็นตารางเก่า
          ที่ไม่มีข้อมูลบน prod (0 rows). ระบบค่าคอมที่ใช้งานจริงตอนนี้คิดที่อัตรา <strong>1%</strong>
          ตามมติ ADR-0020 ฝังไว้ใน <code className="bg-amber-100 px-1 rounded">lib/sales-commission/calc.ts</code>
          (4 ทีม VIP: THADA.VIP · SIN.VIP · OOAEOM.VIP · SWAN).
        </p>
        <p className="text-sm text-amber-800">
          หากต้องการแก้อัตรา/เพิ่มทีม VIP — กรุณาแก้ในไฟล์ <code className="bg-amber-100 px-1 rounded">lib/sales-commission/calc.ts</code> ก่อน
          (รอ ADR ใหม่สำหรับ schema <code className="bg-amber-100 px-1 rounded">tb_commission_tier_*</code> ที่ใช้งานจริง).
        </p>
        <div className="pt-2">
          <Link
            href="/admin/commissions"
            className="inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            → ไปหน้าค่าคอม (ระบบที่ใช้งานจริง)
          </Link>
        </div>
      </section>

      <p className="text-[10px] text-muted">
        Ref: ADR-0020 (commission SOT lock) · ADR-0026 D-3 (dead-writer tombstone).
      </p>
    </main>
  );
}
