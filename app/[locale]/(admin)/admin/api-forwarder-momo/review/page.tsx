/**
 * /admin/api-forwarder-momo/review — Review grid commit UX (synthesis G1).
 *
 * Synthesis SOT: `docs/research/legacy-deep-dive/_SYNTHESIS.md` §3 G1.
 * Legacy mirror: `pcs-admin/api-forwarder-momo.php?page=manualUpdate` (the
 * page admin uses daily — per-row prefilled grid with "สร้างใหม่" buttons).
 *
 * Server side: auth gate · load pending (un-committed) rows from
 * `momo_import_tracks`. Client side: per-row inline form + commit button +
 * bulk "สร้างทั้งหมด" button.
 *
 * Per AGENTS.md §0a — workflow stolen from legacy, design is Pacred Tailwind
 * (NOT Bootstrap-4). Per the brief — extends ปอน's existing sync (`/sync` →
 * upserts momo_*), this page reads from the SAME momo_* tables and commits
 * the rows downstream into tb_forwarder. No schema change to legacy.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { ReviewGridClient, type PendingRow } from "./review-client";

export const dynamic = "force-dynamic";

export default async function AdminMomoReviewPage() {
  await requireAdmin(["super", "ops", "warehouse"]);

  const admin = createAdminClient();

  // Pending rows — committed_at IS NULL, ordered most-recent-sync first.
  // Cap at 200 (the same upper bound as commitMomoRowsBatch). Past that, admin
  // should narrow with sync filters first.
  //
  // ภูม flag 2026-05-30 (bug 2c): also pull `container_batch_no` — the
  // REAL cabinet joined from container_closed.cid (added in migration 0126).
  // Display this when present; falls back to momo_container_no (which is
  // the MOMO routing batch ID, not a real cabinet).
  const { data: pendingRowsRaw, error: pendingErr } = await admin
    .from("momo_import_tracks")
    .select(
      "id, momo_tracking_no, momo_container_no, container_batch_no, momo_sack_no, shipment_status, admin_status_text, phase, raw, last_synced_at, momo_updated_at",
    )
    .is("committed_at", null)
    .order("last_synced_at", { ascending: false })
    .limit(200);

  if (pendingErr) {
    console.error("[momo_import_tracks pending list] failed", pendingErr);
  }

  // Latest 20 committed rows — small history strip so admin sees their work
  // landed in tb_forwarder. Read-only.
  const { data: recentCommittedRaw, error: recentCommittedErr } = await admin
    .from("momo_import_tracks")
    .select(
      "id, momo_tracking_no, momo_container_no, committed_at, committed_forwarder_id, commit_userid",
    )
    .not("committed_at", "is", null)
    .order("committed_at", { ascending: false })
    .limit(20);
  if (recentCommittedErr) {
    console.error("[momo_import_tracks committed list] failed", recentCommittedErr);
  }

  // Coerce raw → PendingRow shape (extract qty/ship_by hint from raw blob).
  // (Intermediate shape — `userIdValid` filled in below after the bulk
  // tb_users existence probe.)
  const intermediate = (pendingRowsRaw ?? []).map((row) => {
    const raw = row.raw as Record<string, unknown> | null;
    const userCodeRaw =
      raw && typeof raw === "object"
        ? (typeof raw.user_code === "string" ? raw.user_code : null)
        : null;
    const userGroupRaw =
      raw && typeof raw === "object"
        ? (typeof raw.user_group === "string" ? raw.user_group : null)
        : null;
    const shipByRaw =
      raw && typeof raw === "object"
        ? (typeof raw.ship_by === "string" ? raw.ship_by : null)
        : null;
    const qtyRaw =
      raw && typeof raw === "object" && typeof raw.quantity === "number"
        ? raw.quantity
        : null;

    // Guess userID from MOMO's `user_group + user_code` — e.g. user_group="PR"
    // + user_code="032" → "PR032". Admin should still verify before commit.
    const guessedUserId =
      userGroupRaw && userCodeRaw ? `${userGroupRaw}${userCodeRaw}` : null;

    return {
      id:                row.id as string,
      momoTrackingNo:    row.momo_tracking_no ?? null,
      momoContainerNo:   row.momo_container_no ?? null,
      containerBatchNo:  (row.container_batch_no as string | null) ?? null,
      momoSackNo:        row.momo_sack_no ?? null,
      shipmentStatus:    row.shipment_status ?? null,
      adminStatusText:   row.admin_status_text ?? null,
      phase:             row.phase ?? null,
      guessedUserId,
      guessedShipBy:     shipByRaw ?? null,
      qty:               qtyRaw,
      lastSyncedAt:      row.last_synced_at ?? null,
      momoUpdatedAt:     row.momo_updated_at ?? null,
    };
  });

  // ──────────────────────────────────────────────────────────
  // ภูม flag 2026-05-30 (bug 2a): pre-validate guessed userIDs.
  //
  // Bulk commit was failing 3/4 because PR005 / PR116 / PR032 don't exist
  // in tb_users (gaps in the PCS sequence — only PR121 was real). Admin
  // only learned this AFTER clicking "สร้างทั้งหมด". Probe tb_users now
  // so the grid can show "❌ ไม่มีในระบบ" BEFORE the click.
  // ──────────────────────────────────────────────────────────
  const candidateIds = Array.from(
    new Set(
      intermediate
        .map((r) => r.guessedUserId)
        .filter((v): v is string => typeof v === "string" && /^PR\d+$/i.test(v))
        .map((v) => v.toUpperCase()),
    ),
  );

  let knownUserIds = new Set<string>();
  if (candidateIds.length > 0) {
    const { data: existingUsers, error: usersErr } = await admin
      .from("tb_users")
      .select("userID")
      .in("userID", candidateIds);
    if (usersErr) {
      console.error("[tb_users pre-validate] failed", usersErr);
      // Soft-fail — leave knownUserIds empty so EVERY row shows the
      // warning chip; admin can still type the correct userID by hand.
    } else if (existingUsers) {
      knownUserIds = new Set(
        (existingUsers as Array<{ userID: string | null }>)
          .map((u) => u.userID)
          .filter((v): v is string => !!v),
      );
    }
  }

  const pendingRows: PendingRow[] = intermediate.map((r) => ({
    ...r,
    // null = no MOMO guess (admin must type); true = exists; false = missing
    userIdValid:
      r.guessedUserId == null
        ? null
        : knownUserIds.has(r.guessedUserId.toUpperCase()),
  }));

  const recentCommitted = (recentCommittedRaw ?? []).map((row) => ({
    id:                    row.id as string,
    momoTrackingNo:        row.momo_tracking_no ?? null,
    momoContainerNo:       row.momo_container_no ?? null,
    committedAt:           row.committed_at as string | null,
    committedForwarderId:  (row.committed_forwarder_id as number | null) ?? null,
    commitUserId:          (row.commit_userid as string | null) ?? null,
  }));

  return (
    <main className="p-4 lg:p-8 max-w-7xl mx-auto space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600">Admin</Link>
        <span>›</span>
        <Link href="/admin/forwarders" className="hover:text-primary-600">ฝากนำเข้า</Link>
        <span>›</span>
        <Link href="/admin/api-forwarder-momo" className="hover:text-primary-600">MOMO</Link>
        <span>›</span>
        <span className="text-foreground font-medium">Review &amp; Commit</span>
      </nav>

      {/* Header */}
      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-600">
          ADMIN · MOMO · REVIEW &amp; COMMIT
        </p>
        <h1 className="mt-1 text-2xl font-bold">Review &amp; Commit รายการ MOMO</h1>
        <p className="mt-1.5 text-sm text-muted">
          ตรวจสอบรายการที่ sync เข้ามาจาก MOMO API · กรอก userID + บริษัทขนส่ง + ประเภทสินค้า
          → คลิก &ldquo;สร้างใหม่&rdquo; เพื่อ INSERT ลง{" "}
          <code className="rounded bg-surface-alt px-1">tb_forwarder</code>{" "}
          (atomic — fstatus + fcabinetnumber + fdatetothai + fdatecontainerclose ใน 1 call).
        </p>
      </header>

      {/* Legacy fidelity banner */}
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 leading-relaxed">
        <strong>✅ Synthesis G1 (P0):</strong> หน้านี้เทียบกับ legacy{" "}
        <code className="rounded bg-emerald-100 px-1">pcs-admin/api-forwarder-momo.php?page=manualUpdate</code>{" "}
        — ปุ่ม &ldquo;สร้างใหม่&rdquo; / &ldquo;สร้างทั้งหมด&rdquo; · ที่ปอน sync มาที่ momo_* tables ครบแล้ว.
        ใช้คู่กับ{" "}
        <Link href="/admin/api-forwarder-momo/sync" className="underline">
          /sync
        </Link>
        : sync ก่อน → review หน้านี้.
      </div>

      <ReviewGridClient
        pendingRows={pendingRows}
        recentCommitted={recentCommitted}
        pendingError={pendingErr?.message ?? null}
      />
    </main>
  );
}
