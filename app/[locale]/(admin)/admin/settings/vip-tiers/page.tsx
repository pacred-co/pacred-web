import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { Info } from "lucide-react";

// ────────────────────────────────────────────────────────────────────
// /admin/settings/vip-tiers — RETIRED (owner 2026-07-10).
//
// The VIP-group tier (tb_rate_vip_* keyed by coID) was dropped: all 154
// VIP-group customers were materialized to a per-customer "เรทเฉพาะตัว"
// (tb_rate_custom_*) + coID='PR', so no customer is on a group tier anymore.
// The pricing waterfall is now: manual ▸ เรทเฉพาะตัว (per-customer) ▸ general.
//
// This page + its CRUD (vip-tiers-client.tsx · actions/admin/settings-vip.ts)
// are kept in place but unwired (no sidebar entry). The tb_rate_vip_* / tb_co
// data is NOT deleted (historical). Staff set a customer's rate at the profile.
// ────────────────────────────────────────────────────────────────────

export default async function AdminVipTiersRetiredPage() {
  await requireAdmin(["super", "accounting"]);

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · ตั้งค่า</p>
        <h1 className="mt-1 text-2xl font-bold">ประเภทสมาชิก VIP (ยกเลิกแล้ว)</h1>
      </div>

      <div className="max-w-2xl rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-2">
            <p className="font-semibold">ระบบ tier VIP ยกเลิกแล้ว (2026-07-10)</p>
            <p>
              ตอนนี้ใช้ <strong>เรทเฉพาะตัวต่อลูกค้า</strong> แทน — ตั้งเรทให้ลูกค้าแต่ละรายที่หน้าโปรไฟล์ลูกค้า
              (ปุ่ม “ตั้งค่าเรทขนส่ง”). ลูกค้ากลุ่ม VIP เดิมถูกย้ายเป็นเรทเฉพาะตัวให้เรียบร้อยแล้ว ราคาไม่เปลี่ยน.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Link href="/admin/customers" className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700">
                ไปหน้าลูกค้า → ตั้งเรทเฉพาะตัว
              </Link>
              <Link href="/admin/settings" className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-alt">
                ← ตั้งค่าระบบ
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
