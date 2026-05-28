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

      {/* Safety banner */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 leading-relaxed">
        <strong>⚠️ Isolation:</strong> Sync เขียนข้อมูลเฉพาะลง 4 tables ใหม่ —{" "}
        <code className="rounded bg-amber-100 px-1">momo_import_tracks</code> ·{" "}
        <code className="rounded bg-amber-100 px-1">momo_container_closed</code> ·{" "}
        <code className="rounded bg-amber-100 px-1">momo_sack_infos</code> ·{" "}
        <code className="rounded bg-amber-100 px-1">momo_sync_logs</code>.
        ไม่กระทบ <code className="rounded bg-amber-100 px-1">cargo_*</code> / <code className="rounded bg-amber-100 px-1">tb_*</code>.
      </div>

      {/* Workflow hint — after sync, go to /review to commit into tb_forwarder */}
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 leading-relaxed">
        <strong>📥 ขั้นถัดไป:</strong> หลัง sync แล้ว ไปที่{" "}
        <Link
          href="/admin/api-forwarder-momo/review"
          className="font-bold underline hover:text-emerald-700"
        >
          /admin/api-forwarder-momo/review
        </Link>{" "}
        เพื่อตรวจ + commit row เข้า <code className="rounded bg-emerald-100 px-1">tb_forwarder</code>{" "}
        (per-row หรือ bulk · atomic INSERT — fstatus + fcabinetnumber + fdatetothai
        + fdatecontainerclose พร้อมกัน). Synthesis G1 (2026-05-28 ดึก).
      </div>

      <MomoSyncClient initialDbRows={initialDbRows} />
    </main>
  );
}
