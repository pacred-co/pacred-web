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

// Re-export the input type so existing consumers (review-client.tsx) keep
// importing it from this module. A type-only re-export is erased at compile
// time, so it's allowed in a "use server" file.
export type { CommitMomoRowInput };

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
// commitMomoRowToForwarder — single-row commit (the main button).
// Thin admin-auth wrapper: resolve session identity → delegate to the
// auth-agnostic core (Wave 30.5 extraction). The 51-column atomic INSERT
// + the committed_at stamp + the sync log all live in the core now.
// ────────────────────────────────────────────────────────────

export async function commitMomoRowToForwarder(
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
        const res = await commitMomoRowToForwarder(r);
        if (res.ok) {
          succeeded++;
          results.push({ rowId: r.rowId, ok: true, forwarderId: res.data?.forwarderId });
        } else {
          failed++;
          results.push({ rowId: r.rowId, ok: false, error: res.error });
        }
      }
      return {
        ok: true,
        data: {
          total:     parsed.data.rows.length,
          succeeded,
          failed,
          results,
        },
      };
    },
  );
}
