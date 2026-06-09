"use server";

/**
 * Admin > Service-Order Heartbeat Lock — concurrent-edit safety on
 * `/admin/service-orders/[hNo]/edit`. Faithful port of legacy
 * `pcs-admin/include/pages/shops/updateLock.php` + the jQuery
 * setInterval in `update.php` L499-511.
 *
 * Why this exists:
 *   Wave 31 shipped the 5-tab admin shop-order edit workflow; two
 *   staff opening the same `?page=update&id=<hno>` page simultaneously
 *   silently clobber each other (the second save wins, the first
 *   admin's edits are lost without warning). ภูม flagged this as E4
 *   in shop-order-deep-2026-06-02.md §3. Legacy solved it with a
 *   60-second heartbeat: the page UPDATEd `tb_header_order.session`
 *   (PHP session id) + `hlockdate` (NOW + 60s) every 60s; a second
 *   admin loading the page saw `hlockdate > NOW` with a different
 *   session and got the "กำลังถูกแก้ไขโดย admin XYZ" banner with
 *   edit buttons disabled until they pressed an override.
 *
 * Port shape (Pacred-native, see migration 0159):
 *   We add NEW nullable columns `hlockedby` (adminID varchar(50))
 *   + `hlockedat` (timestamptz) and leave the legacy `session` +
 *   `hlockdate` cols untouched (a parallel PHP install could still
 *   write them — zero behavioural change). The Pacred client island
 *   heartbeats every 50 seconds (10-sec safety margin under the 60s
 *   expiry) — see `app/[locale]/(admin)/admin/service-orders/[hNo]/edit/heartbeat-lock.tsx`.
 *
 *   - lockServiceOrder({hNo})   — UPSERT lock if currently unlocked OR
 *                                  held by same admin OR expired. Returns
 *                                  { acquired:true } on grant or
 *                                  { acquired:false, lockedBy, expiresAt }
 *                                  if someone else holds it.
 *   - unlockServiceOrder({hNo}) — clear hlockedby + hlockedat (only if
 *                                  current admin holds it · best-effort,
 *                                  no error on stale unlock).
 *
 * Server-side mutation block:
 *   NOT enforced. This is a UI-only courtesy guard — if two staff
 *   REALLY want to clobber they can (the existing inline-edit + 5-tab
 *   actions don't check the lock). Server-enforced refusal is a future
 *   hardening step (would need to plumb the lock check through every
 *   header-edit action — bigger surface · captured for ภูม's review).
 *
 * Audit:
 *   Lock acquire / unlock are NOT routed through `logAdminAction` —
 *   they're heartbeats, not state-mutating ops. A staff TAKEOVER (when
 *   the banner's "ล็อคให้ฉัน" button is pressed against a different
 *   admin's still-valid lock) DOES write an audit row so the original
 *   editor's lost-work moment is traceable.
 *
 * Reachability (§0d): /admin/service-orders/[hNo]/edit page mounts
 * <HeartbeatLock>, which calls THIS lockServiceOrder on mount +
 * unlockServiceOrder on unmount/beforeunload.
 */

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { safeLegacyAdminId } from "@/lib/auth/safe-legacy-admin-id";
import {
  canAcquireLock,
  nextLockExpiry,
  LOCK_TTL_MS,
} from "@/lib/service-order/heartbeat-lock";

// ────────────────────────────────────────────────────────────
// resolveLegacyAdminId — lift to actions/admin/common.ts in a
// future refactor (this is now the 11th caller; the dup is OK
// for now to keep this lock module self-contained while we
// settle the column semantics).
// ────────────────────────────────────────────────────────────
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) {
    console.error(`[service-orders-lock.resolveLegacyAdminId auth.getUser] failed`, {
      code: authErr.code, message: authErr.message,
    });
  }
  const email = user?.email ?? null;
  if (!email) return "system";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_admin")
    .select("adminID")
    .eq("adminEmail", email)
    .maybeSingle<{ adminID: string | null }>();
  if (error) {
    console.error(`[service-orders-lock.resolveLegacyAdminId tb_admin lookup] failed`, {
      code: error.code, message: error.message,
    });
  }
  if (data?.adminID) return data.adminID;
  return email;
}

// ════════════════════════════════════════════════════════════
// 1. lockServiceOrder — acquire / refresh the heartbeat lock
// ════════════════════════════════════════════════════════════
const lockSchema = z.object({
  h_no: z.string().trim().regex(/^P\d+$/, "h_no must match /^P\\d+$/"),
  // takeover=true → forces grant even when a different admin holds a still-valid
  // lock (= the banner's "ล็อคให้ฉัน" button path · audit-logged so the original
  // editor's lost-work moment is traceable).
  takeover: z.boolean().optional().default(false),
});
export type LockServiceOrderInput = z.infer<typeof lockSchema>;

export type LockServiceOrderData =
  | {
      acquired: true;
      h_no: string;
      locked_by: string;
      expires_at: string; // ISO timestamp
      ttl_ms: number;
      was_takeover: boolean;
    }
  | {
      acquired: false;
      h_no: string;
      locked_by: string;
      expires_at: string;
    };

export async function lockServiceOrder(
  input: LockServiceOrderInput,
): Promise<AdminActionResult<LockServiceOrderData>> {
  const parsed = lockSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  // The 5-tab workflow lives on /admin/service-orders/[hNo]/edit which is
  // gated for super + accounting (mirrors service-orders-governance.ts L127).
  return withAdmin<LockServiceOrderData>(
    ["super", "accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 50);
      const now = new Date();

      // 1. Load the header — need id + current lock pair to decide grant.
      const { data: header, error: headerErr } = await admin
        .from("tb_header_order")
        .select("id, hno, hlockedby, hlockedat")
        .eq("hno", d.h_no)
        .maybeSingle<{
          id: number;
          hno: string;
          hlockedby: string | null;
          hlockedat: string | null;
        }>();
      if (headerErr) {
        console.error(`[tb_header_order lock lookup] failed`, {
          code: headerErr.code, message: headerErr.message,
        });
        return { ok: false, error: `db_error:${headerErr.code ?? "unknown"}` };
      }
      if (!header) return { ok: false, error: "ไม่พบออเดอร์ฝากสั่งซื้อ (hno ไม่ตรง)" };

      // 2. Decide grant — unlocked / same-admin / expired all OK; otherwise
      //    refuse UNLESS this is a takeover request (banner override button).
      const acquirable = canAcquireLock({
        now,
        currentAdminId: legacyAdminId,
        hlockedby: header.hlockedby,
        hlockedat: header.hlockedat,
      });
      const wasTakeover = !acquirable && d.takeover;

      if (!acquirable && !d.takeover) {
        // Denied — surface the holder + expiry so the banner can render.
        return {
          ok: true,
          data: {
            acquired: false,
            h_no: header.hno,
            locked_by: header.hlockedby ?? "",
            expires_at: header.hlockedat ?? "",
          },
        };
      }

      // 3. Write the new lock — hlockedby = me, hlockedat = NOW + TTL.
      const newExpiry = nextLockExpiry(now);
      const { error: updErr } = await admin
        .from("tb_header_order")
        .update({
          hlockedby: legacyAdminId,
          hlockedat: newExpiry.toISOString(),
        })
        .eq("id", header.id);
      if (updErr) {
        console.error(`[tb_header_order lock acquire] failed`, {
          code: updErr.code, message: updErr.message,
        });
        return { ok: false, error: `db_error:${updErr.code ?? "unknown"}` };
      }

      // 4. Audit ONLY on takeover — heartbeats are noise.
      if (wasTakeover) {
        await logAdminAction(
          adminId,
          "tb_header_order.lock_takeover",
          "tb_header_order",
          header.hno,
          {
            hno:                header.hno,
            previous_holder:    header.hlockedby,
            previous_expiry:    header.hlockedat,
            new_holder:         legacyAdminId,
            new_expiry:         newExpiry.toISOString(),
            takeover_reason:    "banner_override_button",
          },
        );
      }

      return {
        ok: true,
        data: {
          acquired:     true,
          h_no:         header.hno,
          locked_by:    legacyAdminId,
          expires_at:   newExpiry.toISOString(),
          ttl_ms:       LOCK_TTL_MS,
          was_takeover: wasTakeover,
        },
      };
    },
  );
}

// ════════════════════════════════════════════════════════════
// 2. unlockServiceOrder — release on unmount / beforeunload
// ════════════════════════════════════════════════════════════
// Best-effort: only clear the lock if the CURRENT admin holds it.
// If a different admin has since taken over, leave their lock alone.
// Returns ok regardless of whether the row was cleared (the heartbeat
// is fire-and-forget by design).
// ════════════════════════════════════════════════════════════
const unlockSchema = z.object({
  h_no: z.string().trim().regex(/^P\d+$/, "h_no must match /^P\\d+$/"),
});
export type UnlockServiceOrderInput = z.infer<typeof unlockSchema>;

export type UnlockServiceOrderData = {
  h_no: string;
  cleared: boolean;
};

export async function unlockServiceOrder(
  input: UnlockServiceOrderInput,
): Promise<AdminActionResult<UnlockServiceOrderData>> {
  const parsed = unlockSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<UnlockServiceOrderData>(
    ["super", "accounting"],
    async () => {
      const admin = createAdminClient();
      const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 50);

      // Clear only the rows we hold (`hlockedby = legacyAdminId`). The
      // .eq() chain makes this atomic — no need to read-then-write.
      const { error: updErr, count } = await admin
        .from("tb_header_order")
        .update({ hlockedby: null, hlockedat: null }, { count: "exact" })
        .eq("hno", d.h_no)
        .eq("hlockedby", legacyAdminId);
      if (updErr) {
        // Non-fatal — unlock is best-effort; log but return success so the
        // browser-side cleanup path doesn't surface a spurious error toast.
        console.error(`[tb_header_order unlock] failed`, {
          code: updErr.code, message: updErr.message,
        });
        return {
          ok: true,
          data: { h_no: d.h_no, cleared: false },
        };
      }

      return {
        ok: true,
        data: {
          h_no:    d.h_no,
          cleared: (count ?? 0) > 0,
        },
      };
    },
  );
}
