import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { getAllPromoBanners, PROMO_LOCATIONS } from "@/lib/promo/banners";
import { PromosManager } from "./promos-manager";

/**
 * Promo-banner manager — /admin/settings/promos (super-only · 2026-06-01).
 *
 * Lets the owner add/edit/delete/reorder MULTIPLE promo banners + upload an
 * image per promo. Stored as a JSON array in business_config key
 * `promo.banners` (NO new table). The /service-import (ฝากนำเข้า) banner reads
 * the active `location='import'` promos from it (falls back to the legacy
 * single promo while the array is empty).
 *
 * Reachable in ≤3 clicks (AGENTS.md §0d): sidebar → ตั้งค่าระบบ Cargo →
 * "แบนเนอร์โปรโมชัน". Also linked from /admin/settings (the settings hub).
 *
 * requireAdmin reads cookies → force-dynamic (AGENTS.md §11).
 */

export const dynamic = "force-dynamic";

export default async function AdminPromosPage() {
  await requireAdmin(["super"]);
  const banners = await getAllPromoBanners();

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-4xl">
      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-600">
          ADMIN · SETTINGS
        </p>
        <h1 className="mt-1 text-2xl font-bold">แบนเนอร์โปรโมชัน (Promo)</h1>
        <p className="mt-1 text-sm text-muted">
          เพิ่ม / แก้ไข / ลบ / จัดลำดับ แบนเนอร์โปรฯ ได้หลายอัน — ตั้งหัวข้อ ข้อความ จำนวนเงิน
          อัปโหลดรูป เปิด-ปิด และช่วงวันที่. แบนเนอร์ที่ <code className="font-mono">location = import</code>{" "}
          จะแสดงบนหน้าฝากนำเข้า (<Link href="/service-import" className="text-primary-600 underline">/service-import</Link>).
        </p>
        <p className="mt-2 text-xs text-amber-700">
          ⚠️ super-only — แก้แล้วมีผลภายใน 1 นาที (60-second cache). ถ้ายังไม่มีแบนเนอร์เลย
          หน้าฝากนำเข้าจะใช้โปรฯ เดิม (จาก Business Config คีย์{" "}
          <code className="font-mono">import.promo.*</code>) ต่อไปจนกว่าจะเพิ่มอันแรก.
        </p>
      </header>

      <PromosManager initialBanners={banners} locations={[...PROMO_LOCATIONS]} />
    </main>
  );
}
