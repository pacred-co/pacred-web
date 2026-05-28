/**
 * /admin/api-forwarder-momo/sync — Admin MOMO Status Sync page.
 *
 * Brief 2026-05-28 §10 (ปอน): หน้า Admin ที่กดดึงสถานะจาก MOMO
 * Cargo API + บันทึกลง momo_* tables ใหม่. ห้ามแสดงให้ลูกค้า.
 *
 * Server-side: auth gate + initial DB snapshot from momo_* tables.
 * Client-side: form interactions + API calls + result display.
 *
 * ⚠️ Reads ONLY from momo_* tables (new isolated tables).
 *    Writes happen through /api/admin/momo/sync — NEVER directly here.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { MomoSyncClient } from "./sync-client";

export const dynamic = "force-dynamic";

export default async function AdminMomoSyncPage() {
  await requireAdmin(["super", "ops", "warehouse", "accounting"]);

  // Initial DB snapshot — latest 20 rows per momo_* table.
  // Service-role client (bypass RLS) — these are admin-only tables.
  const admin = createAdminClient();
  const [
    importTrackQ,
    containerClosedQ,
    sackInfoQ,
  ] = await Promise.all([
    admin
      .from("momo_import_tracks")
      .select(
        "momo_tracking_no, momo_sack_no, momo_container_no, shipment_status, admin_status_text, last_synced_at",
      )
      .order("last_synced_at", { ascending: false })
      .limit(20),
    admin
      .from("momo_container_closed")
      .select(
        "momo_container_no, momo_sack_no, shipment_status, admin_status_text, last_synced_at",
      )
      .order("last_synced_at", { ascending: false })
      .limit(20),
    admin
      .from("momo_sack_infos")
      .select(
        "momo_sack_no, momo_tracking_no, momo_container_no, shipment_status, admin_status_text, last_synced_at",
      )
      .order("last_synced_at", { ascending: false })
      .limit(20),
  ]);

  const initialDbRows = {
    importTrack:     importTrackQ.data ?? [],
    containerClosed: containerClosedQ.data ?? [],
    sackInfo:        sackInfoQ.data ?? [],
  };

  return (
    <main className="p-4 lg:p-8 max-w-7xl mx-auto space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600">Admin</Link>
        <span>›</span>
        <Link href="/admin/api-forwarder-momo" className="hover:text-primary-600">MOMO</Link>
        <span>›</span>
        <span className="text-foreground font-medium">ดึงสถานะ (Status Sync)</span>
      </nav>

      {/* Header */}
      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-600">
          ADMIN · MOMO · STATUS SYNC
        </p>
        <h1 className="mt-1 text-2xl font-bold">ดึงสถานะ MOMO Cargo</h1>
        <p className="mt-1.5 text-sm text-muted">
          เชื่อม MOMO Cargo API → บันทึกผลลง <code className="rounded bg-surface-alt px-1">momo_*</code> tables (isolated).
          ไม่กระทบ table เดิม. หน้านี้สำหรับ admin หลังบ้านเท่านั้น.
        </p>
      </header>

      <MomoSyncClient initialDbRows={initialDbRows} />
    </main>
  );
}
