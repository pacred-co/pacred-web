"use server";

/**
 * Admin > ฝากนำเข้า > MOMO > "คิวค้นเจอจาก MOMO Live" (owner/ภูม 2026-07-03).
 *
 * The partner API drops a parcel once it advances past "ออกจากโกดังจีน", so a
 * ฝากสั่งซื้อ shop tracking MOMO Live shows "กำลังส่งมาไทย" (with a container) never
 * reaches the Review & Commit queue → no tb_forwarder row → the shop badge stays stuck.
 * This queue scrapes the MOMO Live board, diffs against tb_forwarder, and lets staff
 * one-click "สร้าง (commit)" the dropped parcels back into the system — REUSING the exact
 * commit path (its atomic INSERT + double-commit claim + best-effort rate + the 0235
 * shop-arrival trigger that unsticks the ฝากสั่งซื้อ).
 *
 * 💰 MONEY-SAFE: metrics are ALWAYS server-scraped (the client never supplies weight/คิว,
 * so it can't tamper the SELL price) · a per-commit re-check refuses to mint a SECOND
 * billable row for a tracking that already has one · the created row lands at the
 * China-side fstatus cap ('3'), never a billing status.
 */

import { z } from "zod";
import { withAdmin, type AdminActionResult } from "./common";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMomoWebConfigured } from "@/lib/integrations/momo-web/client";
import {
  runMomoLiveDiscovery,
  scrapeLiveCandidatesByBase,
  existingForwarderForBase,
  materializeDiscoveredParcel,
  type MomoLiveDiscoveryResult,
} from "@/lib/admin/momo-live-discovery";
import type { DiscoveryCandidate } from "@/lib/admin/momo-live-discovery-plan";
import { commitMomoRowToForwarder } from "./momo-commit";

const DISCOVERY_ROLES = ["super", "ops", "warehouse"] as const;

/** Load (fresh-scrape) the discovery queue. */
export async function loadMomoLiveDiscoveryQueue(): Promise<AdminActionResult<MomoLiveDiscoveryResult>> {
  return withAdmin<MomoLiveDiscoveryResult>([...DISCOVERY_ROLES], async () => {
    if (!isMomoWebConfigured()) {
      return { ok: false, error: "ยังไม่ได้ตั้งค่าบัญชี MOMO (MOMO_WEB_USER/PASS) ใน env" };
    }
    try {
      const admin = createAdminClient();
      const data = await runMomoLiveDiscovery(admin);
      return { ok: true, data };
    } catch (e) {
      console.error("[momo-live-discovery] queue load failed", e);
      return {
        ok: false,
        error: e instanceof Error ? `ดึงข้อมูล MOMO Live ไม่สำเร็จ: ${e.message}` : "ดึงข้อมูลไม่สำเร็จ",
      };
    }
  });
}

const commitItemSchema = z.object({
  tracking: z.string().trim().min(1, "ไม่มีเลขแทรคกิ้ง").max(64),
  userID: z.string().trim().regex(/^PR\d+$/i, "รหัสลูกค้าต้องเป็น PR####").max(20),
  fShipBy: z.string().trim().max(10).optional().default(""),
  fProductsType: z.enum(["1", "2", "3", "4"]).optional().default("1"),
});
type CommitDiscoveredInput = z.input<typeof commitItemSchema>;

export type DiscoveredCommitResult = {
  tracking: string;
  ok: boolean;
  forwarderId?: number;
  error?: string;
};

/**
 * Commit ONE discovered parcel. Re-scrapes for the server-authoritative metrics, re-checks
 * tb_forwarder (idempotency), materializes into momo_import_tracks, then reuses the real
 * commit. `byBase` may be pre-supplied (batch) to share one scrape.
 */
async function commitOne(
  admin: ReturnType<typeof createAdminClient>,
  byBase: Map<string, DiscoveryCandidate>,
  raw: CommitDiscoveredInput,
): Promise<DiscoveredCommitResult> {
  const parsed = commitItemSchema.safeParse(raw);
  if (!parsed.success) {
    return { tracking: String((raw as { tracking?: string })?.tracking ?? ""), ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  }
  const d = parsed.data;
  const candidate = byBase.get(d.tracking);
  if (!candidate) {
    return { tracking: d.tracking, ok: false, error: "ไม่พบพัสดุนี้บนบอร์ด MOMO Live แล้ว (อาจถูกดึง/เปลี่ยนสถานะ) — รีเฟรชคิวใหม่" };
  }

  // idempotency: never mint a 2nd billable row.
  const existing = await existingForwarderForBase(admin, candidate.baseTracking);
  if (existing.exists) {
    return { tracking: d.tracking, ok: false, error: `มีรายการนำเข้าอยู่แล้ว${existing.id ? ` (#${existing.id})` : ""} — ไม่สร้างซ้ำ` };
  }

  // materialize → reuse the real commit (its claim guard is the atomic double-commit lock).
  const mat = await materializeDiscoveredParcel(admin, candidate);
  if ("error" in mat) {
    return { tracking: d.tracking, ok: false, error: mat.error };
  }
  const res = await commitMomoRowToForwarder({
    rowId: mat.rowId,
    userID: d.userID,
    fShipBy: d.fShipBy,
    fProductsType: d.fProductsType,
    fAmount: candidate.quantity,
  });
  if (!res.ok) {
    return { tracking: d.tracking, ok: false, error: res.error ?? "commit ไม่สำเร็จ" };
  }
  return { tracking: d.tracking, ok: true, forwarderId: res.data?.forwarderId };
}

/** Commit ONE discovered parcel (per-row button). */
export async function commitDiscoveredParcel(
  input: CommitDiscoveredInput,
): Promise<AdminActionResult<DiscoveredCommitResult>> {
  return withAdmin<DiscoveredCommitResult>([...DISCOVERY_ROLES], async () => {
    if (!isMomoWebConfigured()) {
      return { ok: false, error: "ยังไม่ได้ตั้งค่าบัญชี MOMO (MOMO_WEB_USER/PASS) ใน env" };
    }
    const admin = createAdminClient();
    try {
      const { byBase, scrapeError } = await scrapeLiveCandidatesByBase();
      if (scrapeError && byBase.size === 0) {
        return { ok: false, error: `ดึงข้อมูล MOMO Live ไม่สำเร็จ: ${scrapeError}` };
      }
      const result = await commitOne(admin, byBase, input);
      if (!result.ok) return { ok: false, error: result.error ?? "commit ไม่สำเร็จ" };
      return { ok: true, data: result };
    } catch (e) {
      console.error("[momo-live-discovery] commitDiscoveredParcel failed", e);
      return { ok: false, error: e instanceof Error ? e.message : "commit ไม่สำเร็จ" };
    }
  });
}

const batchSchema = z.object({
  items: z.array(commitItemSchema).min(1, "ไม่มีรายการ").max(200, "มากเกินไป (สูงสุด 200)"),
});
type CommitDiscoveredBatchInput = z.input<typeof batchSchema>;

export type DiscoveredBatchResult = {
  total: number;
  created: number;
  failed: number;
  results: DiscoveredCommitResult[];
};

/** Commit MANY discovered parcels ("สร้างทั้งหมด") — one fresh scrape shared across all. */
export async function commitDiscoveredBatch(
  input: CommitDiscoveredBatchInput,
): Promise<AdminActionResult<DiscoveredBatchResult>> {
  return withAdmin<DiscoveredBatchResult>([...DISCOVERY_ROLES], async () => {
    if (!isMomoWebConfigured()) {
      return { ok: false, error: "ยังไม่ได้ตั้งค่าบัญชี MOMO (MOMO_WEB_USER/PASS) ใน env" };
    }
    const parsed = batchSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
    }
    const admin = createAdminClient();
    try {
      const { byBase, scrapeError } = await scrapeLiveCandidatesByBase();
      if (scrapeError && byBase.size === 0) {
        return { ok: false, error: `ดึงข้อมูล MOMO Live ไม่สำเร็จ: ${scrapeError}` };
      }
      const results: DiscoveredCommitResult[] = [];
      for (const item of parsed.data.items) {
        // sequential: each commit claims + INSERTs; keep it ordered + rate-limit-friendly.
        results.push(await commitOne(admin, byBase, item));
      }
      const created = results.filter((r) => r.ok).length;
      return {
        ok: true,
        data: { total: results.length, created, failed: results.length - created, results },
      };
    } catch (e) {
      console.error("[momo-live-discovery] commitDiscoveredBatch failed", e);
      return { ok: false, error: e instanceof Error ? e.message : "commit ไม่สำเร็จ" };
    }
  });
}
