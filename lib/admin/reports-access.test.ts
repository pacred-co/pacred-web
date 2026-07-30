/**
 * reports-access.test.ts — ล็อกกฎ gate ของ /admin/system-reports (owner 2026-07-30 · HR).
 * Run: tsx lib/admin/reports-access.test.ts
 */
import assert from "node:assert/strict";
import { canViewSystemReports, canViewContainerProfit } from "./reports-access";
import type { AdminRole } from "@/lib/auth/require-admin";

let passed = 0;
function check(label: string, cond: boolean) {
  assert.equal(cond, true, label);
  passed++;
}
const R = (...r: string[]) => r as AdminRole[];

// ── เข้าหน้ารายงาน ──────────────────────────────────────────────
check("ultra เข้าได้", canViewSystemReports(R("ultra"), null));
check("HR (แผนก hr) เข้าได้แม้ไม่ใช่ ultra", canViewSystemReports(R("super"), "hr"));
check("HR ตัวพิมพ์ใหญ่/มีช่องว่าง ก็เข้าได้", canViewSystemReports(R("normies"), " HR "));
check("super แผนกอื่น เข้าไม่ได้", !canViewSystemReports(R("super"), "finance"));
check("super ไม่มีแผนก เข้าไม่ได้", !canViewSystemReports(R("super"), null));
check("driver แผนก logistics เข้าไม่ได้", !canViewSystemReports(R("driver"), "logistics"));
check("normies ไม่มีแผนก เข้าไม่ได้", !canViewSystemReports(R("normies"), ""));
check("ultra แผนกอะไรก็เข้าได้", canViewSystemReports(R("ultra"), "finance"));

// ── แท็บกำไรตู้ (margin = ultra เท่านั้น) ────────────────────────
check("ultra เห็นกำไรตู้", canViewContainerProfit(R("ultra")));
check("HR ไม่เห็นกำไรตู้ (แม้เข้าหน้าได้)", !canViewContainerProfit(R("super")));
check("accounting ไม่เห็นกำไรตู้ผ่านหน้านี้ (ultra-only)", !canViewContainerProfit(R("accounting")));
check("driver ไม่เห็นกำไรตู้", !canViewContainerProfit(R("driver")));

console.log(`✓ reports-access.test.ts — ${passed} assertions passed`);
