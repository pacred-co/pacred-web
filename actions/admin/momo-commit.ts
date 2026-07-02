"use server";

/**
 * Admin > MOMO review-grid commit actions — synthesis G1 (P0).
 *
 * Context: ภูม flag 2026-05-28 — *"ไม่เป็นโลจิก ไม่เป็นอัตโนมัติ"*. The
 * synthesis (`docs/research/legacy-deep-dive/_SYNTHESIS.md` §3 G1) named
 * the missing piece: legacy MOMO has a review-grid where admin clicks
 * "สร้างใหม่" per row → ONE atomic INSERT lands fStatus + fCabinetNumber
 * + fDateToThai + fDateContainerClose together. Pacred had the sync (ปอน
 * Wave 24) but no commit UX — so MOMO data sits in `momo_import_tracks`
 * with no path to `tb_forwarder`.
 *
 * What this file ships: two ADMIN-GATED server actions —
 *   - commitMomoRowToForwarder(input) → single-row commit
 *   - commitMomoRowsBatch(input)      → bulk-commit several prefilled rows
 *
 * Wave 30.5 — the entire commit BODY now lives in the auth-agnostic core
 * `lib/admin/commit-momo-row-core.ts` (`commitMomoRowCore(ctx, input)`).
 * This file is now a thin admin-auth wrapper: it resolves "who is
 * committing" from the session inside `withAdmin`, then delegates to the
 * core. The cron/system path (`commitMomoRowSystem`, also in the core)
 * calls the same body WITHOUT a session — that's what finally unblocks
 * Wave 30's auto-commit, which failed 7/7 because `withAdmin` rejects the
 * session-less cron context.
 *
 * Why the split: a "use server" file can only export async functions
 * (Next 16 rule). A function that BYPASSES admin auth must never be a
 * "use server" export (it would be an unauthenticated tb_forwarder INSERT
 * endpoint), so `commitMomoRowSystem` lives in the `server-only` core —
 * not here. See docs/learnings/nextjs-16-quirks.md.
 *
 * @see lib/admin/commit-momo-row-core.ts — the shared commit body + system path
 * @see lib/admin/auto-commit-momo.ts      — the cron caller (commitMomoRowSystem)
 */

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, type AdminActionResult } from "./common";
import { getCurrentUser } from "@/lib/auth/get-user";
import {
  commitMomoRowSchema,
  commitMomoRowCore,
  type CommitMomoRowInput,
} from "@/lib/admin/commit-momo-row-core";
import { propagateMomoLiveStatusAndData } from "@/lib/integrations/momo-web/propagate-live-data";

// NOTE: do NOT re-export CommitMomoRowInput from this file. A previous
// attempt did `export type { CommitMomoRowInput }` here, betting that the
// type-only re-export would be erased before Next's "use server" analyzer
// saw it. Under Turbopack the bet failed — the bulk commit path threw
// `ReferenceError: CommitMomoRowInput is not defined` at runtime because
// the analyzer emitted a value re-export against a non-existent binding.
// Consumers must import the type directly from
// `@/lib/admin/commit-momo-row-core`, e.g.
//   import type { CommitMomoRowInput } from "@/lib/admin/commit-momo-row-core";
// Captured as a learning in docs/learnings/nextjs-16-quirks.md.

// ────────────────────────────────────────────────────────────
// resolveLegacyAdminId — same pattern as api-forwarder-manual.ts.
// `tb_forwarder.adminid*` columns are varchar(10) → clip to 10.
// ────────────────────────────────────────────────────────────
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    console.error(`[supabase getUser] failed`, { code: error.code, message: error.message });
  }
  const email = user?.email ?? null;
  if (!email) return "system";

  const admin = createAdminClient();
  const { data, error: lookupErr } = await admin
    .from("tb_admin")
    .select("adminID")
    .eq("adminEmail", email)
    .maybeSingle<{ adminID: string | null }>();
  if (lookupErr) {
    console.error(`[tb_admin lookup] failed`, { code: lookupErr.code, message: lookupErr.message });
  }
  if (data?.adminID) return data.adminID;
  return email.slice(0, 10);
}

// ────────────────────────────────────────────────────────────
// runLiveFillAfterCommit — after a manual commit lands a fresh tb_forwarder
// row, pull MOMO's OWN web ONCE to COMPLETE it in the same click.
//
// Why (owner/ภูม 2026-07-02): the review grid commits from the PARTNER API,
// which lags MOMO's web and often carries NO weight ("รอ MOMO ชั่ง") — so a
// bare commit created an incomplete row (weight/คิว/ขนาด empty). If someone
// then billed it before the 10-min cron filled it, the price (driven by
// weight/คิว) would be WRONG. Pulling MOMO Live at commit closes that window:
// the row is complete the moment it's created.
//
// Reuses the SAME proven money-safe Live cycle the /live button + cron run:
// forward-only status (China-side cap ≤3) · fill-when-empty weight/คิว/ขนาด
// (skip billed 5/6/7 · never overwrite a non-zero) · per-box breakdown into
// momo_box_detail (display-only). BEST-EFFORT — a MOMO-login failure NEVER
// fails the commit (the row is already created; the cron fills it later, exactly
// as before this change), so there is zero regression risk.
// ────────────────────────────────────────────────────────────
type LiveFillSummary = {
  filled: number;
  advanced: number;
  boxes: number;
  /** Rows whose fcabinetnumber was filled with the REAL Live container (เลขตู้). */
  cabinet: number;
  /** Rows whose fdatecontainerclose (วันปิดตู้) was filled from MOMO. */
  closeDate: number;
};

async function runLiveFillAfterCommit(): Promise<LiveFillSummary | null> {
  try {
    const admin = createAdminClient();
    const r = await propagateMomoLiveStatusAndData(admin);
    return {
      filled: r.data.filled,
      advanced: r.status.advanced,
      boxes: r.boxDetail.upserted,
      cabinet: r.cabinet.filled,
      closeDate: r.cabinet.closeDateFilled,
    };
  } catch (e) {
    console.error("[commitMomo→liveFill] best-effort Live fill failed (row still committed)", e);
    return null;
  }
}

// ────────────────────────────────────────────────────────────
// commitOneRow — the shared commit PRIMITIVE (no Live fill). Used directly by
// the batch loop so the (slow) MOMO Live scrape runs ONCE after the whole
// batch, not once per row. Thin admin-auth wrapper: resolve session identity
// → delegate to the auth-agnostic core (Wave 30.5). The 51-column atomic
// INSERT + committed_at stamp + sync log all live in the core.
// ────────────────────────────────────────────────────────────
async function commitOneRow(
  rawInput: CommitMomoRowInput,
): Promise<AdminActionResult<{ forwarderId: number; fIDorCO: string }>> {
  return withAdmin<{ forwarderId: number; fIDorCO: string }>(
    ["super", "ops", "warehouse"],
    async ({ adminId }) => {
      const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);
      const me = await getCurrentUser();
      return commitMomoRowCore(
        {
          adminId,                      // admin path → writes admin_audit_log
          legacyAdminId,                // tb_forwarder.adminid* (varchar(10))
          committedBy: me?.id ?? null,  // momo_import_tracks.committed_by
          revalidate: true,             // interactive → refresh /admin/* paths
        },
        rawInput,
      );
    },
  );
}

// ────────────────────────────────────────────────────────────
// commitMomoRowToForwarder — single-row commit (the "สร้างใหม่" button):
// commit the row THEN pull MOMO Live to complete it (weight/คิว/ขนาด/สถานะ/
// กล่อง) in the same click. `liveFill` reports what the Live pass did (null if
// MOMO login failed — the row is still committed; the cron completes it later).
// ────────────────────────────────────────────────────────────

export async function commitMomoRowToForwarder(
  rawInput: CommitMomoRowInput,
): Promise<AdminActionResult<{ forwarderId: number; fIDorCO: string; liveFill?: LiveFillSummary | null }>> {
  const res = await commitOneRow(rawInput);
  if (!res.ok || !res.data) return res;
  const liveFill = await runLiveFillAfterCommit();
  return { ok: true, data: { ...res.data, liveFill } };
}

// ────────────────────────────────────────────────────────────
// commitMomoRowsBatch — bulk commit the "สร้างทั้งหมด" button.
// Calls commitMomoRowToForwarder sequentially (not in parallel — the
// tb_forwarder unique constraint on tracking + foreign-key reads need
// stable ordering). Collects per-row results so the UI can show which
// succeeded / which failed. Each call re-checks admin auth (unchanged
// from Wave 26 — bulk is admin-only, never the cron path).
// ────────────────────────────────────────────────────────────

const commitMomoBatchSchema = z.object({
  rows: z.array(commitMomoRowSchema).min(1).max(200),
});

export type CommitMomoBatchInput = z.input<typeof commitMomoBatchSchema>;

export type CommitMomoBatchResult = {
  total:    number;
  succeeded: number;
  failed:    number;
  results:  Array<{ rowId: string; ok: boolean; forwarderId?: number; error?: string }>;
  /** One MOMO-Live pass after the batch completes the fresh rows (null if login failed). */
  liveFill?: LiveFillSummary | null;
};

export async function commitMomoRowsBatch(
  input: CommitMomoBatchInput,
): Promise<AdminActionResult<CommitMomoBatchResult>> {
  const parsed = commitMomoBatchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_batch_input" };
  }

  return withAdmin<CommitMomoBatchResult>(
    ["super", "ops", "warehouse"],
    async () => {
      const results: CommitMomoBatchResult["results"] = [];
      let succeeded = 0;
      let failed = 0;
      for (const r of parsed.data.rows) {
        // Use the no-fill primitive in the loop — the (slow) MOMO Live scrape
        // runs ONCE below, after every row is committed, not once per row.
        const res = await commitOneRow(r);
        if (res.ok) {
          succeeded++;
          results.push({ rowId: r.rowId, ok: true, forwarderId: res.data?.forwarderId });
        } else {
          failed++;
          results.push({ rowId: r.rowId, ok: false, error: res.error });
        }
      }
      // Pull MOMO Live ONCE to complete every fresh row (weight/คิว/ขนาด/สถานะ/
      // กล่อง). Best-effort: a failure never undoes the commits above.
      const liveFill = succeeded > 0 ? await runLiveFillAfterCommit() : null;
      return {
        ok: true,
        data: {
          total:     parsed.data.rows.length,
          succeeded,
          failed,
          results,
          liveFill,
        },
      };
    },
  );
}
