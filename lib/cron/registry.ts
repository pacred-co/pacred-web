/**
 * Cron registry — single source of truth for /admin/system/crons.
 *
 * Mirrors vercel.json's `crons` array. We keep this hand-maintained
 * (instead of parsing vercel.json at runtime) so that:
 *   1. Each cron gets a human label + a Thai description
 *   2. We can also list crons that exist in code but aren't yet wired
 *      into vercel.json (rare, but happens during dev)
 *   3. Server components can read it without filesystem access
 *
 * KEEP IN SYNC with vercel.json when adding/removing/rescheduling crons.
 *
 * Server-only — the labels include internal notes.
 */

import "server-only";

export type CronEntry = {
  /** Matches vercel.json `path` AND lib/cron/instrument.ts `cronPath`. */
  path:        string;
  /** Cron expression in vercel.json (UTC). */
  schedule:    string;
  /** Short Thai label for the card header. */
  label:       string;
  /** One-line description (what it does). */
  description: string;
  /** Plain-language schedule note (e.g. "ทุก 15 นาที"). */
  scheduleLabel: string;
};

export const CRON_REGISTRY: readonly CronEntry[] = [
  {
    path:          "/api/cron/auto-cancel-orders",
    schedule:      "*/15 * * * *",
    label:         "ยกเลิก order หมดอายุ",
    description:   "ยกเลิก tb_header_order ที่ hstatus='2' (รอชำระเงิน) + hdatepayment < now (reuse autoExpireOverdueShopOrder · live legacy table)",
    scheduleLabel: "ทุก 15 นาที",
  },
  {
    path:          "/api/cron/sales-daily-digest",
    schedule:      "5 17 * * *",
    label:         "สรุปยอดขายรายวัน",
    description:   "ส่ง digest ยอดขายเมื่อวานให้ super + sales_admin (opt-in)",
    scheduleLabel: "ทุกวัน 00:05 ICT (17:05 UTC)",
  },
  {
    path:          "/api/cron/refresh-active-customers",
    schedule:      "0 1 * * *",
    label:         "อัปเดต is_active ลูกค้า",
    description:   "ไล่ flip profiles.is_active=true จาก 3 streams (orders/forwarders/yuan)",
    scheduleLabel: "ทุกวัน 08:00 ICT (01:00 UTC)",
  },
  {
    path:          "/api/cron/expire-probation",
    schedule:      "0 2 * * *",
    label:         "หมดเวลา probation",
    description:   "ปิดสิทธิ์พนักงาน probation ที่ contract_end_date < today",
    scheduleLabel: "ทุกวัน 09:00 ICT (02:00 UTC)",
  },
  {
    path:          "/api/cron/expire-driver-assignments",
    schedule:      "0 * * * *",
    label:         "หมดเวลา driver assignment",
    description:   "flip forwarder_driver status=1→3 ถ้ามอบงานเกิน 17 ชม.",
    scheduleLabel: "ทุก 1 ชม.",
  },
  {
    path:          "/api/cron/sms-balance-check",
    schedule:      "0 23 * * *",
    label:         "เช็คเครดิต SMS",
    description:   "เตือน super/ops/accounting (opt-in) เมื่อ SMS balance < threshold",
    scheduleLabel: "ทุกวัน 06:00 ICT (23:00 UTC ก่อนหน้า)",
  },
  {
    path:          "/api/cron/send-scheduled-broadcasts",
    schedule:      "*/5 * * * *",
    label:         "ส่ง broadcast ตั้งเวลา",
    description:   "ส่ง broadcasts ที่ scheduled_for <= now() แบบ idempotent",
    scheduleLabel: "ทุก 5 นาที",
  },
  // Sprint-11 P2.3.C — register the CargoThai sync cron so it appears on
  // the cron-health page (was previously surfaced as "orphan" with logs
  // but no registry row). The LINE Notify dispatcher entry was REMOVED
  // 2026-05-26 along with the cron route — notify-bot.line.me EOL'd
  // 2025-03-31, replacement via Messaging API in lib/notifications/.
  {
    path:          "/api/cron/cargothai-sync",
    schedule:      "30 19 * * *",
    label:         "Sync ตู้/forwarder จาก CargoThai",
    description:   "ดึง tb_tmp_forwarder_cargothai สดจาก partner API + reconcile กับ forwarders ใน Pacred",
    scheduleLabel: "ทุกวัน 02:30 ICT (19:30 UTC ก่อนหน้า)",
  },
  // Gap #1 foundation 2026-05-27 — CTT warehouse Google Sheet pull
  // (pilot for the 4-sheet sync: CTT / MX / MK / Sang). Runs in DRY-RUN
  // until ก๊อต provisions GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON +
  // GOOGLE_SHEETS_CTT_ID + the per-sheet column-mapping is finalized.
  // Adapter: lib/integrations/google-sheets/ctt-adapter.ts. The other
  // 3 sheets (MX/MK/Sang) get their own crons after CTT verifies live.
  {
    path:          "/api/cron/sheets-sync-ctt",
    schedule:      "0 * * * *",
    label:         "Sync sheet CTT warehouse",
    description:   "ดึง row ใหม่จาก Google Sheet ของคลัง CTT → tb_forwarder + แจ้งทีม ops (DRY-RUN จนกว่า ก๊อต wire credentials)",
    scheduleLabel: "ทุก 1 ชม.",
  },
  // 2026-06-02 — PCS↔Pacred sync. Pulls recent tb_forwarder edits from the
  // PHP endpoint on the PCS server (pacred-sync.php) and merges them into
  // our tb_forwarder per the conflict policy in
  // lib/integrations/pcs-sync/merge.ts. Dedicated dashboard at
  // /admin/system/pcs-sync (has its own run history; this registry entry
  // makes it appear on the cron-health overview too).
  {
    path:          "/api/cron/pcs-sync",
    schedule:      "*/10 * * * *",
    label:         "Sync tb_forwarder จาก PCS",
    description:   "ดึง tb_forwarder ที่ staff PCS แก้ไข (status/ตู้/driver/...) มาเข้า Pacred ทุก 10 นาที",
    scheduleLabel: "ทุก 10 นาที",
  },
  // 2026-06-05 (LANE A) — แสง's container-cost Google Sheet → cache.
  // Read-only mirror into container_cost_sheet_cache so the cost-check
  // worklist + per-parcel diff read fast + stay fresh. NEVER writes
  // tb_forwarder (applying costs stays a confirm-gated admin action).
  // Adapter: lib/integrations/google-sheets/container-cost-sheet-sync.ts.
  {
    path:          "/api/cron/sync-container-cost-sheet",
    schedule:      "*/20 * * * *",
    label:         "Sync ต้นทุนตู้ (Sheet แสง)",
    description:   "ดึงชีตต้นทุนตู้ของแสง → cache (worklist + diff อ่านเร็ว) · ไม่เขียน tb_forwarder (ปรับต้นทุนยังเป็น action ที่ต้องยืนยัน)",
    scheduleLabel: "ทุก 20 นาที",
  },
  // 2026-06-09 — READ-ONLY wallet integrity scan. Detects wallets whose
  // stored tb_wallet.wallettotal is impossible (negative) or inconsistent
  // with its own pending-debit overhang (overdraft), via the REUSED
  // sumAvailableBalance derivation. ALERTS only (one deduped incident +
  // structured console) — NEVER mutates tb_wallet / tb_wallet_hs.
  {
    path:          "/api/cron/wallet-reconcile",
    schedule:      "0 18 * * *",
    label:         "ตรวจสอบยอดกระเป๋าเงิน (read-only)",
    description:   "สแกน tb_wallet หายอดติดลบ / pending-debit เกินยอดจริง → แจ้งเตือน incident (ไม่แก้เงินอัตโนมัติ · อ่านอย่างเดียว)",
    scheduleLabel: "ทุกวัน 01:00 ICT",
  },
  // 2026-06-09 (Phase-B closeout) — daily container bulletin. Groups in-flight
  // tb_forwarder (fstatus<7) by fcabinetnumber → per-cabinet summary (count /
  // status breakdown / arriving / ready-to-ship) → concise Thai message →
  // staff LINE group via notifyStaffGroup (best-effort; no-ops if LINE
  // unconfigured). READ-ONLY on tb_forwarder · no money path. Faithful
  // re-build of the tombstoned U2-1 bulletin (now reads the legacy tb_forwarder
  // spine instead of the retired warehouse "spine" tables).
  {
    path:          "/api/cron/container-bulletin",
    schedule:      "0 0 * * *",
    label:         "บุลเลตินตู้ประจำวัน",
    description:   "สรุปตู้ที่อยู่ระหว่างขนส่ง (จัดกลุ่มตาม fCabinetNumber) → จำนวน/สถานะ/ถึงไทย/พร้อมส่ง → แจ้งทีมงานผ่าน LINE",
    scheduleLabel: "ทุกวัน 07:00 ICT (00:00 UTC)",
  },
] as const;

/** Look up a registry entry by path; returns null if unknown (means
 * the row was logged by a cron that has since been removed). */
export function getCronEntry(path: string): CronEntry | null {
  return CRON_REGISTRY.find((c) => c.path === path) ?? null;
}
