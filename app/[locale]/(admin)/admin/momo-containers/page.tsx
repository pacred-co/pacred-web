/**
 * /admin/momo-containers — MOMO sync/ingest workspace (ภูม 2026-07-14 · rework).
 *
 * พี่ป๊อป/ภูม: หน้านี้ = ตรวจข้อมูลก่อน "นำเข้าระบบ" — ทั้ง MOMO API และ packing list.
 * ข้อมูลมาเป็น "รายแทรคกิ้งลูกค้า" → ตารางยึด **แทรคกิ้ง = 1 แถว** (แบบ Import Track
 * ในหน้า /sync) ไม่ใช่ยึดตู้. ตรวจแต่ละแทรค (PR/น้ำหนัก/คิว/ขนส่ง/ประเภท) → กดปุ่ม
 * "นำเข้าระบบ" (พรีวิว+ยืนยัน) → INSERT ลง tb_forwarder (wrap commitMomoRowToForwarder).
 *
 * Server side: อ่าน momo_import_tracks (committed + pending · per tracking) + prefill
 * PR จาก MOMO member_code + validate tb_users. กดเลขตู้ → หน้า detail (เก็บไว้).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { momoTypeToProductType } from "@/lib/admin/momo-live-discovery-plan";
import { deriveMomoMemberCode } from "@/lib/admin/momo-raw-helpers";
import { resolveTransportMode } from "@/lib/forwarder/cabinet-transport";
import { MomoIngestClient, type IngestTrack } from "./momo-containers-client";

export const dynamic = "force-dynamic";

const HUB_LINKS: { href: string; label: string }[] = [
  { href: "/admin/api-forwarder-momo/sync", label: "📥 Sync จาก MOMO API" },
  { href: "/admin/api-forwarder-momo/packing-upload", label: "📦 อัพ packing list" },
  { href: "/admin/api-forwarder-momo/drift", label: "🔴 คิว drift (แทร็กหาย)" },
  { href: "/admin/api-forwarder-momo/review", label: "✅ review / commit (เดิม)" },
];

export default async function MomoContainersPage() {
  await requireAdmin(["super", "ops", "warehouse"]);
  const admin = createAdminClient();

  // Every MOMO-synced tracking (committed + pending), newest-sync first.
  // weight_kg/cbm/quantity = the container_closed AGGREGATE (Σ of the shipment's
  // boxes) — the SAME values commitMomoRowCore values the row from; show these so
  // the grid matches what will be billed (fall back to first-box raw when empty).
  const { data: rowsRaw, error } = await admin
    .from("momo_import_tracks")
    .select(
      "id, momo_tracking_no, momo_container_no, container_batch_no, momo_sack_no, shipment_status, phase, admin_status_text, raw, weight_kg, cbm, quantity, committed_at, committed_forwarder_id, commit_userid, last_synced_at",
    )
    .order("last_synced_at", { ascending: false })
    .limit(2000);
  if (error) {
    console.error("[momo-containers ingest list] failed", { code: error.code, message: error.message });
  }

  const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const intermediate = (rowsRaw ?? []).map((row) => {
    const raw = row.raw as Record<string, unknown> | null;
    const str = (k: string): string | null =>
      raw && typeof raw === "object" && typeof raw[k] === "string" ? (raw[k] as string) : null;
    const numFromRaw = (k: string): number => (raw && typeof raw === "object" ? num(raw[k]) : 0);

    const userGroupRaw = str("user_group");
    const userCodeRaw = str("user_code");
    const guessedUserId =
      userGroupRaw && userCodeRaw ? deriveMomoMemberCode(userGroupRaw, userCodeRaw) : null;

    // column-first, raw-fallback (mirror commitMomoRowCore's valuation).
    const colW = num(row.weight_kg);
    const colV = num(row.cbm);
    const colQ = num(row.quantity);

    const images: string[] =
      raw && typeof raw === "object" && Array.isArray(raw.images)
        ? raw.images.filter((u): u is string => typeof u === "string" && u.length > 0)
        : [];

    return {
      id: row.id as string,
      tracking: row.momo_tracking_no ?? null,
      container: (row.container_batch_no as string | null) ?? null, // real cabinet (GZS/GZE)
      transport: resolveTransportMode((row.container_batch_no as string | null) ?? "", null),
      routingBatch: row.momo_container_no ?? null,                   // MOMO routing batch (audit)
      sack: row.momo_sack_no ?? null,
      status: row.shipment_status ?? null,
      phase: row.phase ?? null,
      adminStatusText: (row.admin_status_text as string | null) ?? null,
      guessedUserId,
      guessedShipBy: str("ship_by"),
      guessedProductType: momoTypeToProductType(str("type")),
      qty: colQ > 0 ? colQ : (numFromRaw("quantity") || null),
      weightKg: colW > 0 ? colW : numFromRaw("kg"),
      cbm: colV > 0 ? colV : numFromRaw("cbm"),
      width: numFromRaw("width"),
      length: numFromRaw("length"),
      height: numFromRaw("height"),
      images,
      committed: !!row.committed_at,
      committedForwarderId: (row.committed_forwarder_id as number | null) ?? null,
      commitUserId: (row.commit_userid as string | null) ?? null,
      committedAt: (row.committed_at as string | null) ?? null,
      lastSyncedAt: row.last_synced_at ?? null,
    };
  });

  // Bulk pre-validate guessed PRs against tb_users (so the grid shows
  // "ไม่มีในระบบ" before the admin clicks import — bug 2a lesson from review).
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
    if (usersErr) console.error("[momo-containers tb_users pre-validate] failed", usersErr);
    else if (existingUsers)
      knownUserIds = new Set(
        (existingUsers as Array<{ userID: string | null }>)
          .map((u) => u.userID)
          .filter((v): v is string => !!v),
      );
  }

  const tracks: IngestTrack[] = intermediate.map((r) => ({
    ...r,
    userIdValid: r.guessedUserId == null ? null : knownUserIds.has(r.guessedUserId.toUpperCase()),
  }));

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 space-y-5">
      <header className="space-y-1">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted">ADMIN · MOMO · sync / นำเข้าระบบ</div>
        <h1 className="text-2xl font-bold">MOMO — ตรวจข้อมูล + นำเข้าระบบ (รายแทรคกิ้ง)</h1>
        <p className="text-sm text-muted leading-relaxed">
          ข้อมูลจาก <strong>MOMO API</strong> (และ packing list) มาเป็น <strong>รายแทรคกิ้งลูกค้า</strong> —
          ตรวจแต่ละแทรค (PR / น้ำหนัก / คิว / ขนส่ง / ประเภท) ให้ถูกก่อน แล้วกด{" "}
          <strong>&quot;นำเข้าระบบ&quot;</strong> (พรีวิว + ยืนยันอีกครั้ง) เพื่อดึงเข้าระบบบิล (tb_forwarder).
          {" "}กดเลขตู้เพื่อดูรายละเอียดทั้งตู้.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {HUB_LINKS.map((l) => (
            <Link key={l.href} href={l.href}
              className="rounded-full border border-border bg-white dark:bg-surface px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-surface-alt">
              {l.label}
            </Link>
          ))}
        </div>
      </header>
      <MomoIngestClient tracks={tracks} loadError={error?.message ?? null} />
    </div>
  );
}
