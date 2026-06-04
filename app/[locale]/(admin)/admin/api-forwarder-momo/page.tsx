/**
 * /admin/api-forwarder-momo — landing for the MOMO carrier integration.
 *
 * Wave 17 P1-1 (2026-05-23) — port `pcs-admin/api-forwarder-momo.php` (the
 * carrier-dispatch page that switches on `?page=<sub>`). Per the Wave 16
 * audit, only `manualUpdate` is in scope for this wave (the form admin
 * actually uses daily); the other sub-pages (updateAPI, APICheckSM,
 * APICheckSMDetail, pageHome dashboard) are P2 and need API tokens +
 * retry/backoff design.
 *
 * Behaviour: this top-level route renders a small hub card with a primary
 * CTA → "อัปเดต MOMO ด้วยมือ" (the only sub-page wired in Wave 17). The
 * other 4 sub-pages are shown as "Coming soon · Phase C" buttons per the
 * design philosophy in AGENTS.md §0a (banner deferred features, don't
 * silently link).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { PageTopMenubar, type MenubarItem } from "@/components/admin/page-top-menubar";
import {
  Truck,
  Wand2,
  Database,
  Search,
  BarChart3,
  CheckCircle2,
  Activity,
  AlertTriangle,
  XCircle,
} from "lucide-react";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// Wave 30.6 #230 — MOMO health snapshot (ภูม flag 2026-05-30):
// "เวลาดึงจากmomoจะเช็คยังไง ว่าไม่ได้ตกหล่นอะ".
// Reads momo_sync_logs (cron history) to compute 3 health metrics:
//   1. Freshness — minutes since the last successful sync.
//   2. Fail streak — count of consecutive `status=failed` rows since last
//      successful run. Surfaces the silent "env vars missing on Vercel"
//      bug type that bit us 2026-05-29.
//   3. Drift — tb_forwarder rows whose ftrackingchn matches a MOMO row
//      with a clearly-newer status (heuristic: MOMO shipment_status
//      indicates "at Thailand warehouse or later" but tb_forwarder.fstatus
//      is still 1/2/3). The remediation count.
// ─────────────────────────────────────────────────────────────
type HealthSnapshot = {
  lastSuccessMinAgo: number | null;
  failStreak:        number;
  lastFailMessage:   string | null;
  driftCount:        number;
  totalTracks:       number;
  uncommitted:       number;
};

async function loadHealth(): Promise<HealthSnapshot> {
  const admin = createAdminClient();

  // Latest 30 sync log rows — enough to compute streak in the typical case.
  const { data: logs, error: logsErr } = await admin
    .from("momo_sync_logs")
    .select("status, created_at, errors")
    .order("created_at", { ascending: false })
    .limit(30);
  if (logsErr) {
    console.error("[momo health] logs query failed", {
      code: logsErr.code,
      message: logsErr.message,
    });
  }
  const rows = (logs ?? []) as Array<{
    status: string | null;
    created_at: string | null;
    errors: Array<{ message?: string }> | null;
  }>;

  let lastSuccessMinAgo: number | null = null;
  let failStreak = 0;
  let lastFailMessage: string | null = null;
  for (const r of rows) {
    if (r.status === "success") {
      lastSuccessMinAgo = r.created_at
        ? Math.round((Date.now() - new Date(r.created_at).getTime()) / 60000)
        : null;
      break;
    }
    if (r.status === "failed") {
      failStreak += 1;
      if (!lastFailMessage && r.errors && r.errors.length > 0) {
        const m = r.errors[0]?.message;
        if (typeof m === "string") lastFailMessage = m.slice(0, 180);
      }
    }
  }

  // Drift heuristic — fetch up to 200 most recent MOMO tracks with arrived
  // status, then look up matching tb_forwarder rows still at 1/2/3.
  const { data: arrived, error: arrivedErr } = await admin
    .from("momo_import_tracks")
    .select("momo_tracking_no, shipment_status")
    .in("shipment_status", [
      "AT_WAREHOUSE_TH",
      "WAITING_PAYMENT",
      "DISTRIBUTING",
      "DELIVERING",
      "DELIVERED",
    ])
    .order("last_synced_at", { ascending: false })
    .limit(200);
  if (arrivedErr) {
    console.error("[momo health] arrived tracks query failed", {
      code: arrivedErr.code,
      message: arrivedErr.message,
    });
  }
  const arrivedTrackings = (arrived ?? [])
    .map((r) => (r as { momo_tracking_no: string | null }).momo_tracking_no)
    .filter((t): t is string => !!t);
  let driftCount = 0;
  if (arrivedTrackings.length > 0) {
    const { count } = await admin
      .from("tb_forwarder")
      .select("id", { count: "exact", head: true })
      .in("ftrackingchn", arrivedTrackings)
      .in("fstatus", ["1", "2", "3"]);
    driftCount = count ?? 0;
  }

  const { count: totalTracks } = await admin
    .from("momo_import_tracks")
    .select("id", { count: "exact", head: true });

  const { count: uncommitted } = await admin
    .from("momo_import_tracks")
    .select("id", { count: "exact", head: true })
    .is("committed_at", null);

  return {
    lastSuccessMinAgo,
    failStreak,
    lastFailMessage,
    driftCount,
    totalTracks: totalTracks ?? 0,
    uncommitted: uncommitted ?? 0,
  };
}

function freshnessTone(min: number | null): {
  bg: string;
  border: string;
  fg: string;
  label: string;
} {
  if (min === null) {
    return {
      bg: "bg-red-50",
      border: "border-red-300",
      fg: "text-red-800",
      label: "ไม่มีบันทึก sync success เลย",
    };
  }
  if (min <= 15) {
    return {
      bg: "bg-emerald-50",
      border: "border-emerald-300",
      fg: "text-emerald-800",
      label: `${min} นาทีก่อน · ปกติ`,
    };
  }
  if (min <= 60) {
    return {
      bg: "bg-amber-50",
      border: "border-amber-300",
      fg: "text-amber-800",
      label: `${min} นาทีก่อน · ช้ากว่าปกติ`,
    };
  }
  const hr = Math.floor(min / 60);
  return {
    bg: "bg-red-50",
    border: "border-red-300",
    fg: "text-red-800",
    label: `${hr} ชม. ${min % 60} นาทีก่อน · ต้องตรวจ`,
  };
}

const CARRIER_MENUBAR: MenubarItem[] = [
  { label: "MOMO", href: "/admin/api-forwarder-momo" },
  { label: "CargoCenter", href: "/admin/api-forwarder-cn" },
];

export default async function AdminApiForwarderMomoPage() {
  await requireAdmin(["super", "ops", "warehouse"]);

  const health = await loadHealth();
  const freshTone = freshnessTone(health.lastSuccessMinAgo);

  return (
    <main className="p-4 lg:p-8 space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600">Admin</Link>
        <span>›</span>
        <Link href="/admin/forwarders" className="hover:text-primary-600">ฝากนำเข้า</Link>
        <span>›</span>
        <span className="text-foreground font-medium">MOMO</span>
      </nav>

      {/* Header */}
      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-600">
          ADMIN · ฝากนำเข้า · MOMO Integration
        </p>
        <h1 className="mt-1 text-2xl font-bold">แดชบอร์ด Cargo Center · MOMO</h1>
        <p className="mt-1.5 text-sm text-muted">
          เชื่อมข้อมูลรายการ MOMO เข้าระบบ PR — Wave 17 รองรับเฉพาะ &ldquo;อัปเดตด้วยมือ&rdquo;
        </p>
      </header>

      {/* Top menubar (MOMO ↔ CargoCenter) */}
      <PageTopMenubar items={CARRIER_MENUBAR} activeHref="/admin/api-forwarder-momo" />

      {/* Wave 30.6 #230 — MOMO Health Snapshot. ภูม flag 2026-05-30:
          "เวลาดึงจากmomoจะเช็คยังไง ว่าไม่ได้ตกหล่นอะ". 3 cards: freshness,
          cron-fail streak, drift count. Surfaces the silent failures that
          caused the 2026-05-29 5-hour blackout (env vars dropped on Vercel). */}
      <section
        aria-labelledby="momo-health-h"
        className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-3"
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 id="momo-health-h" className="flex items-center gap-2 text-sm font-bold text-gray-900">
            <Activity className="h-4 w-4 text-primary-600" />
            สุขภาพการ sync MOMO
          </h2>
          <p className="text-[10px] text-muted">
            อัปเดตทุกครั้งที่เปิดหน้านี้ · cron run ทุก 10 นาที
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {/* Card 1: Freshness */}
          <div className={`rounded-xl border ${freshTone.border} ${freshTone.bg} p-3`}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-600">
              Sync success ล่าสุด
            </p>
            <p className={`mt-1 text-lg font-bold ${freshTone.fg}`}>
              {freshTone.label}
            </p>
            <p className="mt-1 text-[10px] text-gray-600">
              ปกติ ≤ 15 นาที · ช้า 15-60 · ต้องตรวจ {">"} 60
            </p>
          </div>
          {/* Card 2: Fail streak */}
          <div
            className={`rounded-xl border p-3 ${
              health.failStreak === 0
                ? "border-emerald-300 bg-emerald-50"
                : health.failStreak < 3
                  ? "border-amber-300 bg-amber-50"
                  : "border-red-300 bg-red-50"
            }`}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-600">
              จำนวน cron ล่าสุดที่ FAIL ต่อกัน
            </p>
            <p
              className={`mt-1 text-lg font-bold ${
                health.failStreak === 0
                  ? "text-emerald-800"
                  : health.failStreak < 3
                    ? "text-amber-800"
                    : "text-red-800"
              }`}
            >
              {health.failStreak === 0 ? (
                <>
                  <CheckCircle2 className="inline h-4 w-4 mr-1" />0 — ปกติ
                </>
              ) : (
                <>
                  {health.failStreak >= 3 ? (
                    <XCircle className="inline h-4 w-4 mr-1" />
                  ) : (
                    <AlertTriangle className="inline h-4 w-4 mr-1" />
                  )}
                  {health.failStreak} รอบ
                </>
              )}
            </p>
            {health.lastFailMessage && (
              <p className="mt-1 text-[10px] text-gray-700 break-words">
                error: <span className="font-mono">{health.lastFailMessage}</span>
              </p>
            )}
          </div>
          {/* Card 3: Drift */}
          <div
            className={`rounded-xl border p-3 ${
              health.driftCount === 0
                ? "border-emerald-300 bg-emerald-50"
                : health.driftCount < 10
                  ? "border-amber-300 bg-amber-50"
                  : "border-red-300 bg-red-50"
            }`}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-600">
              จำนวน tb_forwarder ที่สถานะ DRIFT vs MOMO
            </p>
            <p
              className={`mt-1 text-lg font-bold ${
                health.driftCount === 0
                  ? "text-emerald-800"
                  : health.driftCount < 10
                    ? "text-amber-800"
                    : "text-red-800"
              }`}
            >
              {health.driftCount === 0 ? (
                <>
                  <CheckCircle2 className="inline h-4 w-4 mr-1" />0 — ตรงกัน
                </>
              ) : (
                <>{health.driftCount} รายการ</>
              )}
            </p>
            <p className="mt-1 text-[10px] text-gray-600">
              ตู้/พัสดุที่ MOMO บอกถึงไทย แต่ของเรายัง fstatus 1/2/3
              {" · "}
              ตั้ง <code className="rounded bg-white/60 px-1">MOMO_SYNC_PROPAGATE_STATUS=true</code>{" "}
              ให้ cron แก้ให้อัตโนมัติ
            </p>
          </div>
        </div>
        <p className="text-[10px] text-muted">
          MOMO ทั้งหมดที่ sync แล้ว: {health.totalTracks.toLocaleString()} ·{" "}
          ยังไม่ commit ลง tb_forwarder: {health.uncommitted.toLocaleString()} ({" "}
          <Link href="/admin/api-forwarder-momo/review" className="text-primary-600 hover:underline">
            ดู / commit
          </Link>
          )
        </p>
      </section>

      {/* Wave 17 banner */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 leading-relaxed">
        <strong>ℹ️ Wave 17 · ขอบเขต:</strong>{" "}
        เฟสนี้พอร์ตเฉพาะ <strong>&ldquo;อัปเดตด้วยมือ (Manual Update)&rdquo;</strong>{" "}
        ซึ่งเป็นช่องที่แอดมินใช้ทุกวัน. ฟังก์ชั่นอัตโนมัติ (Dashboard · UpdateAPI ·
        APICheckSM · ประวัติ) ต้องใช้ token + retry/backoff design — เลื่อนไป Phase C
        (Wave 18+).
      </div>

      {/* Sub-page hub */}
      <section className="grid gap-4 md:grid-cols-2">
        {/* Live: Manual Update */}
        <Link
          href="/admin/api-forwarder-momo/manual"
          className="group rounded-2xl border-2 border-primary-300 bg-white p-5 shadow-sm hover:border-primary-500 hover:shadow-md transition"
        >
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary-50 p-3 text-primary-600 group-hover:bg-primary-100">
              <Wand2 className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-foreground">อัปเดตด้วยมือ</h3>
              <p className="mt-1 text-xs text-muted leading-relaxed">
                กรอกข้อมูลรายการนำเข้า MOMO ทีละรายการ — ใช้เมื่อระบบ API ไม่ได้
                หรือมีรายการที่ต้องแก้ไขด้วยมือ. INSERT ลง <code className="rounded bg-surface-alt px-1">tb_forwarder</code> โดยตรง.
              </p>
              <span className="mt-3 inline-block rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                ✓ พร้อมใช้ใน Wave 17
              </span>
            </div>
          </div>
        </Link>

        {/* Deferred: Dashboard */}
        <div className="rounded-2xl border border-border bg-surface-alt/30 p-5 opacity-75">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-gray-100 p-3 text-gray-400">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-foreground">แดชบอร์ดสรุป (Home)</h3>
              <p className="mt-1 text-xs text-muted leading-relaxed">
                ภาพรวมรายการรอ-อัปเดต · ยอดส่งผ่าน API วันนี้ · กราฟ.
              </p>
              <span className="mt-3 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                Phase C — เลื่อน
              </span>
            </div>
          </div>
        </div>

        {/* Live (added 2026-05-28 ดึก · synthesis G1): Review & Commit grid.
            Reads pending rows from momo_import_tracks → per-row form +
            "สร้างใหม่" button → atomic INSERT into tb_forwarder. The missing
            "feels automatic" piece per ภูม's 2026-05-28 flag. */}
        <Link
          href="/admin/api-forwarder-momo/review"
          className="group rounded-2xl border-2 border-emerald-400 bg-emerald-50/30 p-5 shadow-sm hover:border-emerald-600 hover:shadow-md transition"
        >
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-emerald-100 p-3 text-emerald-700 group-hover:bg-emerald-200">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-foreground">Review &amp; Commit</h3>
              <p className="mt-1 text-xs text-muted leading-relaxed">
                ตรวจสอบ row ที่ sync มาแล้ว → กรอก userID + บริษัทขนส่ง
                → คลิก &ldquo;สร้างใหม่&rdquo; → atomic INSERT ลง{" "}
                <code className="rounded bg-surface-alt px-1">tb_forwarder</code>{" "}
                · มีปุ่ม &ldquo;สร้างทั้งหมด&rdquo; bulk-commit ด้วย.
              </p>
              <span className="mt-3 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                ✓ ใหม่ · synthesis G1 (P0)
              </span>
            </div>
          </div>
        </Link>

        {/* Live (added 2026-05-28 per ปอน brief): MOMO Status Sync.
            Isolated parallel path → writes to momo_* tables ONLY,
            NEVER touches the legacy spine cargo_* / tb_*. */}
        <Link
          href="/admin/api-forwarder-momo/sync"
          className="group rounded-2xl border-2 border-primary-300 bg-white p-5 shadow-sm hover:border-primary-500 hover:shadow-md transition"
        >
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary-50 p-3 text-primary-600 group-hover:bg-primary-100">
              <Database className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-foreground">ดึงสถานะ MOMO (Status Sync)</h3>
              <p className="mt-1 text-xs text-muted leading-relaxed">
                เรียก MOMO Cargo API → ดึง Import Track / Container Closed / Sack Info ตามช่วงวัน
                · normalize + upsert ลง <code className="rounded bg-surface-alt px-1">momo_*</code> tables (isolated).
                ไม่กระทบ <code className="rounded bg-surface-alt px-1">tb_*</code> เดิม.
              </p>
              <span className="mt-3 inline-block rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                ✓ พร้อมใช้ (2026-05-28)
              </span>
            </div>
          </div>
        </Link>

        {/* Deferred: APICheckSM */}
        <div className="rounded-2xl border border-border bg-surface-alt/30 p-5 opacity-75">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-gray-100 p-3 text-gray-400">
              <Search className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-foreground">ตรวจสอบข้อมูล SM</h3>
              <p className="mt-1 text-xs text-muted leading-relaxed">
                ตรวจ SM Code ในระบบปลายทาง vs ใน PR — ใช้ debug รายการที่ตกหล่น.
              </p>
              <span className="mt-3 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                Phase C — เลื่อน
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer hint */}
      <div className="flex gap-2 flex-wrap pt-2">
        <Link
          href="/admin/forwarders"
          className="rounded-md border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
        >
          <Truck className="inline h-3 w-3 mr-1" />
          ดูรายการฝากนำเข้าทั้งหมด
        </Link>
      </div>
    </main>
  );
}
