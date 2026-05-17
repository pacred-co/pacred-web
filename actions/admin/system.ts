"use server";

import { withAdmin, type AdminActionResult } from "@/actions/admin/common";
import { buildCronTriggerRequest } from "@/lib/cron/instrument";
import { CRON_REGISTRY } from "@/lib/cron/registry";
import { logger } from "@/lib/logger";
import { logAdminAction } from "@/actions/admin/common";

/**
 * U4-1 — admin Server Actions for the system supervisory pages.
 *
 * Currently only one action: manually trigger a cron via the same
 * URL Vercel calls (with Bearer CRON_SECRET). Super-only — touching
 * a cron is a privileged action.
 *
 * The cron handler self-instruments via instrumentCron, so the
 * triggered run shows up in cron_invocations like any scheduled
 * fire (with no extra effort here).
 */
export async function adminTriggerCron(
  cronPath: string,
): Promise<AdminActionResult<{ httpStatus: number; body: unknown }>> {
  return withAdmin(["super"], async ({ adminId }) => {
    // Whitelist check — only allow paths the registry knows about.
    // Prevents this action being abused to hit arbitrary URLs.
    const entry = CRON_REGISTRY.find((c) => c.path === cronPath);
    if (!entry) {
      return { ok: false, error: "unknown_cron_path" };
    }

    const req = buildCronTriggerRequest(cronPath);
    if (!req) {
      return { ok: false, error: "CRON_SECRET not configured in env" };
    }

    try {
      const res = await fetch(req.url, {
        method:  "GET",
        headers: req.headers,
        cache:   "no-store",
      });
      const body = await res.json().catch(() => ({ ok: false, error: "non-json response" }));

      await logAdminAction(adminId, "cron.manual_trigger", "cron", cronPath, {
        httpStatus: res.status,
      });

      return { ok: true, data: { httpStatus: res.status, body } };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error("admin.system.adminTriggerCron", "manual trigger failed", e, { cronPath });
      return { ok: false, error: msg };
    }
  });
}
