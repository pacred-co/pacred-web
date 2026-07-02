"use server";

/**
 * Admin > MOMO > "ดูข้อมูล MOMO (Live)" — passwordless login + load board.
 * 2026-06-30 (ภูม · click-to-login landing).
 *
 * The /live page no longer auto-fetches on load. Instead staff click a single
 * "🔓 เข้าสู่ระบบ MOMO" button (NO password field — creds are server-side in env)
 * and this action logs in FRESH to the MOMO web (master account, server-side)
 * and returns ONE status board's parcels. Two reasons (owner/ภูม):
 *   (a) MOMO is single-session — a login elsewhere kicks our token. Clicking the
 *       button re-grabs the session for Pacred (fresh login, then fetch).
 *   (b) other staff never see/learn the master password.
 *
 * READ-ONLY: it only RETURNS the safe parcels; no DB writes, no MOMO mutations.
 * 🔒 Cost is NEVER fetched — uses fetchMomoLiveListFresh, which normalises every
 * parcel to the SAFE `MomoLiveParcel` shape (operational fields only).
 */

import { z } from "zod";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchMomoLiveListFresh,
  isMomoWebConfigured,
  MOMO_LIVE_STATUSES,
  type MomoLiveParcel,
  type MomoLiveStatus,
} from "@/lib/integrations/momo-web/client";
import {
  propagateMomoLiveStatus,
  type LiveStatusPropagationResult,
} from "@/lib/integrations/momo-web/propagate-live-status";

const schema = z.object({
  status: z.enum(MOMO_LIVE_STATUSES),
});

export async function loadMomoLiveBoard(
  status: string,
): Promise<AdminActionResult<{ parcels: MomoLiveParcel[] }>> {
  return withAdmin<{ parcels: MomoLiveParcel[] }>(
    ["super", "ops", "warehouse", "accounting"],
    async () => {
      const parsed = schema.safeParse({ status });
      if (!parsed.success) return { ok: false, error: "สถานะไม่ถูกต้อง" };

      if (!isMomoWebConfigured()) {
        return { ok: false, error: "ยังไม่ได้ตั้งค่าบัญชี MOMO (MOMO_WEB_USER/PASS) ใน env" };
      }

      try {
        const parcels = await fetchMomoLiveListFresh(parsed.data.status as MomoLiveStatus, 500);
        return { ok: true, data: { parcels } };
      } catch (e) {
        console.error("[momo-web-live] load failed", e);
        return {
          ok: false,
          error:
            e instanceof Error
              ? `เข้าสู่ระบบ MOMO / ดึงข้อมูลไม่สำเร็จ: ${e.message}`
              : "เข้าสู่ระบบ MOMO / ดึงข้อมูลไม่สำเร็จ",
        };
      }
    },
  );
}

/**
 * "🔄 อัปเดตสถานะเข้าระบบ PR" — bulk-propagate the MOMO Live status into tb_forwarder.
 * 2026-07-01 (owner/ภูม: MOMO is source-of-truth for STATUS).
 *
 * The partner import/track feed DROPS a parcel once it advances, but MOMO's web still
 * shows it in the right board. This action scrapes ALL MOMO Live boards (fresh master-
 * account login, server-side) and advances every matched tb_forwarder row toward the
 * MOMO-Live status — FORWARD-ONLY + STATUS-ONLY (writes only fstatus/fdatestatusN/
 * adminidupdate='system-live' · no money) + idempotent + TOCTOU-safe. It reuses the
 * exact same authenticated MOMO path as the /live board view, so an admin who is already
 * looking at the board can push those statuses into the system in one click (without
 * waiting for the ~5-min sync cron).
 *
 * Returns a summary so the UI can report "advanced N rows".
 */
export async function propagateMomoLiveStatusNow(): Promise<
  AdminActionResult<{ summary: LiveStatusPropagationResult }>
> {
  return withAdmin<{ summary: LiveStatusPropagationResult }>(
    ["super", "ops", "warehouse", "accounting"],
    async ({ adminId }) => {
      if (!isMomoWebConfigured()) {
        return { ok: false, error: "ยังไม่ได้ตั้งค่าบัญชี MOMO (MOMO_WEB_USER/PASS) ใน env" };
      }
      try {
        const admin = createAdminClient();
        const summary = await propagateMomoLiveStatus(admin);
        // Audit the bulk status push (best-effort · non-fatal).
        await logAdminAction(adminId, "momo_live_status_propagate", "tb_forwarder", "bulk", {
          matched: summary.matched,
          advanced: summary.advanced,
          shopOrdersAdvanced: summary.shopOrdersAdvanced,
          errorCount: summary.errors.length,
        });
        return { ok: true, data: { summary } };
      } catch (e) {
        console.error("[momo-web-live] status propagate failed", e);
        return {
          ok: false,
          error:
            e instanceof Error
              ? `อัปเดตสถานะจาก MOMO ไม่สำเร็จ: ${e.message}`
              : "อัปเดตสถานะจาก MOMO ไม่สำเร็จ",
        };
      }
    },
  );
}
