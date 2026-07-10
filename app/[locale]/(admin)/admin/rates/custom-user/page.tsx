import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

/**
 * /admin/rates/custom-user — RETIRED 2026-07-10 (owner: ยกเลิกระบบ tier VIP/SVIP/VVIP
 * → ยึดเรทขายหน้า profile ลูกค้า). This was the VIP-group rate editor (rate-vip.php port ·
 * wrote tb_rate_vip_* keyed by coID group). The pricing resolver no longer reads the
 * VIP-group tier (all 154 group customers were materialized to per-customer เรทเฉพาะตัว
 * tb_rate_custom_*), so this editor became a dead-write. It is unwired from the sidebar
 * and now shows this banner. The tb_rate_vip_*/tb_co data is KEPT (historical · not deleted).
 * Set a customer's own rate at their profile → เรทเฉพาะตัว instead.
 */
export default async function CustomUserRatesPage() {
  await requireAdmin(["super", "accounting"]);
  return (
    <div className="p-4 md:p-6 max-w-2xl">
      <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-5">
        <h1 className="text-lg font-bold text-amber-900 dark:text-amber-300">
          🔕 ระบบเรท VIP-group (tier) ยกเลิกแล้ว
        </h1>
        <p className="mt-2 text-sm text-amber-900/90 dark:text-amber-200/80 leading-relaxed">
          ตั้งแต่ 2026-07-10 ระบบ tier <b>VIP / SVIP / VVIP</b> ถูกยกเลิก — เปลี่ยนมาใช้{" "}
          <b>เรทเฉพาะตัวต่อลูกค้า</b> (เรทขายหน้าโปรไฟล์ลูกค้า) แทน. ลูกค้าที่เคยอยู่กลุ่ม VIP
          ถูกย้ายเรทเดิมมาเป็นเรทเฉพาะตัวเรียบร้อยแล้ว (ราคาไม่เปลี่ยน).
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/admin/customers?group=svip"
            className="inline-flex items-center rounded-full bg-primary-600 text-white text-sm font-bold px-4 py-2 hover:bg-primary-700 transition-colors"
          >
            ดูลูกค้าที่มีเรทเฉพาะตัว →
          </Link>
          <Link
            href="/admin/rates/general"
            className="inline-flex items-center rounded-full bg-white text-primary-600 border-2 border-primary-600 text-sm font-bold px-4 py-2 hover:bg-primary-50 transition-colors"
          >
            เรททั่วไป (general)
          </Link>
        </div>
        <p className="mt-3 text-[12px] text-muted">
          ตั้งเรทเฉพาะตัวของลูกค้าแต่ละราย ที่หน้าโปรไฟล์ลูกค้า (แท็บ &quot;เรทลูกค้า&quot;).
        </p>
      </div>
    </div>
  );
}
