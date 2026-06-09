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
  // Gap #1 2026-05-27 → 2026-06-09 — CTT warehouse Google Sheet pull
  // (pilot for the 4-sheet sync: CTT / MX / MK / Sang). Write path is
  // wired (handoff round 7 P1 #2) but DEFAULTS TO DRY-RUN: ภูม flips
  // `CTT_CRON_LIVE=true` after a few DRY-RUN cycles confirm the column
  // mapping is right, then `CTT_CRON_PROPAGATE_STATUS=true` to enable
  // fstatus advance. Runbook: docs/runbook/ctt-cron-activation.md.
  // Adapter: lib/integrations/google-sheets/ctt-adapter.ts (helpers +
  // tests in ctt-helpers.ts / ctt-adapter.test.ts). The other 3 sheets
  // (MX/MK/Sang) get the same pattern after CTT verifies live.
  {
    path:          "/api/cron/sheets-sync-ctt",
    schedule:      "0 * * * *",
    label:         "Sync sheet CTT warehouse",
    description:   "Match CTT sheet rows → tb_forwarder (cabinet · arrival · status · forward-only · lock-respect). DRY-RUN until CTT_CRON_LIVE=true.",
    scheduleLabel: "ทุก 1 ชม.",
  },
  // 2026-06-09 (§0d health-page accuracy) — register the MOMO isolated-sync
  // cron. Was scheduled in vercel.json (*/5) but missing from the registry,
  // so the cron-health page surfaced it as an "orphan" with logs but no
  // label/description. Pulls MOMO import-tracks + closed containers into the
  // isolated momo_* tables (7-day window) + propagates matched rows to
  // tb_forwarder (cabinet/arrived-in-TH/status). Auto-commit to tb_forwarder
  // is GATED behind MOMO_CRON_AUTOCOMMIT (default OFF — pull-only).
  // Route: app/api/cron/momo-sync/route.ts (its header comment says */10,
  // but vercel.json is the source of truth → */5 every 5 minutes).
  // @see lib/integrations/momo-isolated/sync.ts — runMomoSync orchestrator
  {
    path:          "/api/cron/momo-sync",
    schedule:      "*/5 * * * *",
    label:         "Sync MOMO (isolated)",
    description:   "ดึง import-tracks + ตู้ที่ปิดจาก MOMO เข้าตาราง momo_* (window 7 วัน) + propagate ไป tb_forwarder (ตู้/ถึงไทย/สถานะ) · auto-commit ปิดไว้ (gated ด้วย MOMO_CRON_AUTOCOMMIT)",
    scheduleLabel: "ทุก 5 นาที",
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
  // 2026-06-09 (§0d health-page accuracy) — register the margin-flag cron.
  // Scheduled in vercel.json (10 17 * * *) but missing from the registry →
  // showed as "orphan" on the cron-health page. CEO over-cap auto-flag:
  // scans yesterday's delivered tb_forwarder (fstatus='7'), computes margin
  // (sale − cost − discount), and pings the staff LINE group with OVER-CAP
  // (> ฿15k) + LOSS (< 0) lists + a deep-link to /admin/accounting/margin-monitor.
  // READ-ONLY · MARGIN_FLAG_QUIET=true skips notify on clean days.
  // Route: app/api/cron/margin-flag/route.ts.
  {
    path:          "/api/cron/margin-flag",
    schedule:      "10 17 * * *",
    label:         "Flag กำไรเกิน cap (CEO)",
    description:   "สแกนตู้ที่ส่งสำเร็จเมื่อวาน (tb_forwarder fstatus='7') หากำไรเกิน ฿15k/ตู้ หรือขาดทุน → แจ้งทีมผ่าน LINE + ลิงก์ Margin Monitor (อ่านอย่างเดียว)",
    scheduleLabel: "ทุกวัน 00:10 ICT (17:10 UTC ก่อนหน้า)",
  },
  // 2026-06-09 (§0d health-page accuracy) — register the billing-run-overdue
  // cron. Scheduled in vercel.json (0 9 * * *) but missing from the registry →
  // showed as "orphan". Daily overdue check for ใบวางบิล: for every
  // tb_forwarder_invoice WHERE status='issued' AND date_due < today (capped
  // at 200/run), sends the customer a LINE/email reminder via sendNotification.
  // No "last reminder" flag (R-2 scope) → re-sends daily until paid/cancelled.
  // Route: app/api/cron/billing-run-overdue/route.ts.
  {
    path:          "/api/cron/billing-run-overdue",
    schedule:      "0 9 * * *",
    label:         "เตือนใบวางบิลเลยกำหนด",
    description:   "ไล่ใบวางบิล (tb_forwarder_invoice) status='issued' ที่ date_due < วันนี้ (สูงสุด 200/รอบ) → ส่งเตือนลูกค้าผ่าน LINE/อีเมล · ส่งซ้ำทุกวันจนกว่าจะชำระ/ยกเลิก",
    scheduleLabel: "ทุกวัน 16:00 ICT (09:00 UTC)",
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
