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
import { type LiveStatusPropagationResult } from "@/lib/integrations/momo-web/propagate-live-status";
import {
  propagateMomoLiveStatusAndData,
  type LiveStatusAndDataResult,
} from "@/lib/integrations/momo-web/propagate-live-data";

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
 * "🔄 อัปเดตสถานะ + ข้อมูลเข้าระบบ PR" — bulk-propagate the MOMO Live STATUS **and**
 * fill missing measurements (น้ำหนัก/คิว/ขนาด/จำนวนชิ้น) into tb_forwarder.
 * 2026-07-01 (owner/พี่ป๊อป: MOMO's partner API drops parcels, but MOMO's web still
 * has both the status AND the full measurement).
 *
 * ONE fresh master-account login (MOMO is single-session) serves BOTH passes:
 *   1. STATUS — advance every matched tb_forwarder row toward the MOMO-Live status,
 *      FORWARD-ONLY + STATUS-ONLY (fstatus/fdatestatusN/adminidupdate · no money) +
 *      idempotent + TOCTOU-safe (China-side only, capped at fstatus '3').
 *   2. DATA — fill fweight/fvolume/dims/famount, FILL-WHEN-EMPTY only, using the
 *      TOTAL (per-piece × qty) MOMO's web shows, SKIPPING billed rows (fstatus 5/6/7),
 *      never overwriting a non-zero value, flagging (not overwriting) any mismatch.
 * The DATA fill is best-effort — its failure never undoes the STATUS writes.
 *
 * Returns both summaries so the UI can report "advanced N · filled M · เลขตู้ C · flagged K".
 */
export async function propagateMomoLiveStatusNow(): Promise<
  AdminActionResult<{
    summary: LiveStatusPropagationResult;
    data: LiveStatusAndDataResult["data"];
    cabinet: LiveStatusAndDataResult["cabinet"];
    boxSplit: LiveStatusAndDataResult["boxSplit"];
    staging: LiveStatusAndDataResult["staging"];
  }>
> {
  return withAdmin<{
    summary: LiveStatusPropagationResult;
    data: LiveStatusAndDataResult["data"];
    cabinet: LiveStatusAndDataResult["cabinet"];
    boxSplit: LiveStatusAndDataResult["boxSplit"];
    staging: LiveStatusAndDataResult["staging"];
  }>(
    ["super", "ops", "warehouse", "accounting"],
    async ({ adminId }) => {
      if (!isMomoWebConfigured()) {
        return { ok: false, error: "ยังไม่ได้ตั้งค่าบัญชี MOMO (MOMO_WEB_USER/PASS) ใน env" };
      }
      try {
        const admin = createAdminClient();
        const { status: summary, data, cabinet, boxSplit, staging } = await propagateMomoLiveStatusAndData(admin);
        // Audit the bulk status + data push (best-effort · non-fatal).
        await logAdminAction(adminId, "momo_live_status_propagate", "tb_forwarder", "bulk", {
          matched: summary.matched,
          advanced: summary.advanced,
          shopOrdersAdvanced: summary.shopOrdersAdvanced,
          errorCount: summary.errors.length,
          dataFilled: data.filled,
          dataFlaggedMismatch: data.flaggedMismatch,
          dataSkippedBilled: data.skippedBilled,
          cabinetFilled: cabinet.filled,
          closeDateFilled: cabinet.closeDateFilled,
          boxSplitSplit: boxSplit.split,
          boxSplitSiblingsCreated: boxSplit.siblingsCreated,
          stagingFilled: staging.filled,
        });
        return { ok: true, data: { summary, data, cabinet, boxSplit, staging } };
      } catch (e) {
        console.error("[momo-web-live] status+data propagate failed", e);
        return {
          ok: false,
          error:
            e instanceof Error
              ? `อัปเดตสถานะ/ข้อมูลจาก MOMO ไม่สำเร็จ: ${e.message}`
              : "อัปเดตสถานะ/ข้อมูลจาก MOMO ไม่สำเร็จ",
        };
      }
    },
  );
}
