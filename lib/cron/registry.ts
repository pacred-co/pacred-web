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
    description:   "ยกเลิก service_orders ที่ status=awaiting_payment + payment_due_at < now",
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
] as const;

/** Look up a registry entry by path; returns null if unknown (means
 * the row was logged by a cron that has since been removed). */
export function getCronEntry(path: string): CronEntry | null {
  return CRON_REGISTRY.find((c) => c.path === path) ?? null;
}
