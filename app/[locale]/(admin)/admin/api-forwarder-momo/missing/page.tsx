/**
 * /admin/api-forwarder-momo/missing — "พัสดุที่ขาด" (closed-container parcels
 * that never reached tb_forwarder).
 *
 * 2026-06-29 (ภูม). MOMO's import/track feed only returns parcels in the FIRST
 * status; a parcel that advances drops out, so the sync never creates its
 * tb_forwarder row — even though MOMO's container/closed feed still lists it
 * (with weight/cbm, but WITHOUT the member code). This page lists those missing
 * parcels per ตู้ and lets staff fill the member code (read off the MOMO web UI)
 * → create the forwarder row via addMissingMomoParcel.
 *
 * Server-side: auth gate only — all MOMO reads happen client-side through the
 * existing admin-gated API routes (/api/admin/momo/container-closed +
 * /api/admin/momo/track-completeness). Money-write is the server action.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { MomoMissingClient } from "./missing-client";

export const dynamic = "force-dynamic";

export default async function AdminMomoMissingPage() {
  await requireAdmin(["super", "ops", "warehouse", "accounting"]);

  return (
    <main className="p-4 lg:p-8 space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600">Admin</Link>
        <span>›</span>
        <span>ฝากนำเข้า</span>
        <span>›</span>
        <Link href="/admin/api-forwarder-momo" className="hover:text-primary-600">MOMO</Link>
        <span>›</span>
        <span className="text-foreground font-medium">พัสดุที่ขาด</span>
      </nav>

      <PageHeader
        eyebrow="ADMIN · MOMO"
        title="พัสดุที่ขาด — ตู้ปิดที่ยังไม่เข้าระบบ"
        subtitle="พัสดุที่ MOMO มีในตู้ปิด แต่ยังไม่มีใน tb_forwarder — กรอกรหัสลูกค้า → เพิ่มเข้าระบบ"
      />

      <MomoMissingClient />
    </main>
  );
}
