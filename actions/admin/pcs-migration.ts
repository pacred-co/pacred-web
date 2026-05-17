"use server";

/**
 * U2-1 · PCS → Pacred customer migration server actions.
 *
 * Per docs/UPGRADE_PLAN.md §2 U2-1 + research/legacy-chat-datanew-2026-05-17.md L-2.
 *
 * The migration `0067_pcs_customer_migration.sql` does the schema +
 * sequence offset + builds the staging table. This file does the data
 * push that cannot live inside a SQL migration: creating `auth.users`
 * via the Supabase admin API and linking them to `profiles` rows.
 *
 * Flow (per docs/runbook/u2-1-pcs-customer-migration.md):
 *   1. ภูม dumps legacy `tb_users` to CSV (runbook step i).
 *   2. ภูม loads CSV → `pcs_legacy_customers_staging` via SQL Editor (step ii).
 *   3. ภูม applies migration `0067_pcs_customer_migration.sql` (step iii) —
 *      this offsets `member_code_seq` past the highest legacy number.
 *   4. ภูม calls `adminBackfillPcsAuthUsers()` from /admin/migration/pcs-customers
 *      (step iv) — this iterates staging rows, creates auth.users for each
 *      (random password — customer resets via email/OTP), inserts the
 *      profiles row with the re-stamped `PR<n>` code, marks the staging
 *      row done.
 *   5. ภูม verifies counts via `getPcsMigrationStatus()` (step v).
 *
 * Idempotent: re-runnable. Rows with backfilled_at set are skipped.
 * Restricted to `super` admins (changes auth + adds bulk customers).
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/utils/phone";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

type StagingRow = {
  legacy_user_id:    string;
  user_tel:          string | null;
  first_name:        string | null;
  last_name:         string | null;
  email:             string | null;
  line_id:           string | null;
  facebook_url:      string | null;
  user_registered:   string | null;
  user_sex:          string | null;
  user_birthday:     string | null;
  user_last_login:   string | null;
  co_id:             string | null;
  admin_id:          string | null;
  sales_admin_id:    string | null;
  user_recom:        string | null;
  channel:           string | null;
  company_customer:  string | null;
  shop_user:         string | null;
  user_note:         string | null;
  user_active:       string | null;
  backfilled_at:     string | null;
  backfilled_profile_id: string | null;
  notes:             string | null;
};

export type PcsMigrationStatus = {
  staging_rows:             number;
  staging_pending:          number;
  staging_done:             number;
  migrated_profiles:        number;
  member_code_seq_current:  number;
  max_legacy_num_in_staging: number;
  max_member_code_num:      number;
};

export type PcsBackfillResult = {
  attempted:   number;
  created:     number;
  skipped:     number;
  failed:      number;
  errors:      Array<{ legacy_user_id: string; reason: string }>;
};

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

/** Map legacy userSex ('ชาย' / 'หญิง' / '' / etc.) → profiles.sex enum. */
function mapSex(legacy: string | null): "male" | "female" | "other" | null {
  if (!legacy) return null;
  const s = legacy.trim();
  if (s === "ชาย" || s === "1" || s.toLowerCase() === "male" || s === "M")   return "male";
  if (s === "หญิง" || s === "2" || s.toLowerCase() === "female" || s === "F") return "female";
  if (s === "3" || s.toLowerCase() === "other")                                return "other";
  return null;
}

/** Map legacy companyCustomer '1'/'2' → freight_type enum. */
function mapFreightType(legacy: string | null): "seafreight" | "cargo" | null {
  if (legacy === "1") return "seafreight";
  if (legacy === "2") return "cargo";
  return null;
}

/** Map legacy coID ('PCS' / 'VIP5' / etc.) → Pacred customer_group.
 *  - 'PCS' (~99% of rows) → 'PR' (Pacred general — matches the default)
 *  - 'VIP*' → 'vip'
 *  - anything else → 'PR' (safe default)
 */
function mapCustomerGroup(legacy: string | null): string {
  if (!legacy) return "PR";
  const s = legacy.trim().toUpperCase();
  if (s.startsWith("VIP")) return "vip";
  return "PR";
}

/** Extract the running number out of PCS<n>. Returns null on bad shape. */
function extractPcsNumber(legacyUserId: string): number | null {
  const m = legacyUserId.match(/^PCS(\d+)$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Compose the new PR<n> code keeping the legacy number. min-3-digit padding
 *  to match migration 0060's pattern (PR001 / PR042 / PR1234 / PR12345). */
function legacyToMemberCode(legacyUserId: string): string | null {
  const n = extractPcsNumber(legacyUserId);
  if (n === null) return null;
  return "PR" + String(n).padStart(3, "0");
}

/** Generate a strong random password — the migrated customer will reset it
 *  via email link or phone OTP on first login. 32 chars, hex (safe + simple). */
function generateRandomPassword(): string {
  // Use Web Crypto (available in Node 19+ globalThis + Next.js server runtime).
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ──────────────────────────────────────────────────────────────────
// Status read
// ──────────────────────────────────────────────────────────────────

/**
 * One-row dashboard for the migration (reads the `v_pcs_migration_status`
 * view from migration 0067). Used by the admin page + the runbook
 * verify step.
 */
export async function getPcsMigrationStatus(): Promise<AdminActionResult<PcsMigrationStatus>> {
  return withAdmin(["super"], async () => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("v_pcs_migration_status")
      .select("*")
      .maybeSingle<PcsMigrationStatus>();
    if (error) return { ok: false, error: error.message };
    if (!data)  return { ok: false, error: "no_status_row" };
    return { ok: true, data };
  });
}

// ──────────────────────────────────────────────────────────────────
// Backfill auth.users + profiles
// ──────────────────────────────────────────────────────────────────

/**
 * Walks `pcs_legacy_customers_staging` rows where `backfilled_at IS NULL`,
 * creates `auth.users` for each via the Supabase admin API (with a
 * generated random password — customer resets on first login), inserts
 * the matching `profiles` row with the re-stamped `PR<n>` code, then
 * marks the staging row done.
 *
 * **Idempotent**: a row with `backfilled_at` set is skipped on re-run.
 * Per-row failures are accumulated in `errors[]` and the loop continues
 * — one bad row (e.g. duplicate phone, bad email) does not block the
 * other 9,000.
 *
 * Restricted to `super` admins — this is a one-shot bulk-create.
 *
 * Batched (default `limit=500`) so the action stays under the Vercel
 * 60-second function timeout. Re-run until `staging_pending = 0`.
 */
export async function adminBackfillPcsAuthUsers(opts?: {
  limit?:   number;   // batch size (default 500)
  dry_run?: boolean;  // if true, count + log but don't write
}): Promise<AdminActionResult<PcsBackfillResult>> {
  const limit  = Math.min(Math.max(opts?.limit ?? 500, 1), 2000);
  const dryRun = opts?.dry_run === true;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Pull a batch of pending staging rows
    const { data: rows, error: pullErr } = await admin
      .from("pcs_legacy_customers_staging")
      .select("*")
      .is("backfilled_at", null)
      .order("legacy_user_id", { ascending: true })
      .limit(limit)
      .returns<StagingRow[]>();

    if (pullErr)    return { ok: false, error: pullErr.message };
    if (!rows)      return { ok: false, error: "no_rows_returned" };

    const result: PcsBackfillResult = {
      attempted: rows.length,
      created:   0,
      skipped:   0,
      failed:    0,
      errors:    [],
    };

    for (const row of rows) {
      const legacyId = row.legacy_user_id;
      const memberCode = legacyToMemberCode(legacyId);

      // Skip rows we can't even parse — caller (ภูม) handles via notes.
      if (!memberCode) {
        result.skipped++;
        result.errors.push({ legacy_user_id: legacyId, reason: "bad_legacy_id_format" });
        if (!dryRun) {
          await admin.from("pcs_legacy_customers_staging")
            .update({ notes: "skipped: bad_legacy_id_format" })
            .eq("legacy_user_id", legacyId);
        }
        continue;
      }

      // Already in profiles? Skip + mark done.
      const { data: existing } = await admin
        .from("profiles")
        .select("id")
        .eq("legacy_pcs_user_id", legacyId)
        .maybeSingle<{ id: string }>();

      if (existing) {
        result.skipped++;
        if (!dryRun) {
          await admin.from("pcs_legacy_customers_staging")
            .update({
              backfilled_at:          new Date().toISOString(),
              backfilled_profile_id:  existing.id,
              notes:                  "skipped: already_in_profiles",
            })
            .eq("legacy_user_id", legacyId);
        }
        continue;
      }

      // Need at least a phone OR email to create an auth.users row.
      // Legacy data has ~30% rows with neither (cold leads who never
      // confirmed) — mark + skip so the user-creation surface stays
      // honest. The team can revisit phone-only-OTP-on-import later.
      const rawPhone = row.user_tel?.trim();
      const rawEmail = row.email?.trim();
      const hasPhone = rawPhone && rawPhone.length >= 9;
      const hasEmail = rawEmail && rawEmail.length > 0 && rawEmail.includes("@");

      if (!hasPhone && !hasEmail) {
        result.skipped++;
        result.errors.push({ legacy_user_id: legacyId, reason: "no_phone_or_email" });
        if (!dryRun) {
          await admin.from("pcs_legacy_customers_staging")
            .update({ notes: "skipped: no_phone_or_email" })
            .eq("legacy_user_id", legacyId);
        }
        continue;
      }

      if (dryRun) {
        result.created++;
        continue;
      }

      // Create the auth.users row. Prefer phone (Thai customers log in
      // by phone) — fall back to email for the ~rare email-only row.
      const password = generateRandomPassword();
      const normalizedPhone = hasPhone ? normalizePhone(rawPhone!) : undefined;

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        phone:          normalizedPhone,
        email:          hasEmail ? rawEmail! : undefined,
        password,
        phone_confirm:  !!normalizedPhone,
        email_confirm:  !!hasEmail,
        user_metadata: {
          first_name:           row.first_name ?? "",
          last_name:            row.last_name ?? "",
          migrated_from_pcs:    true,
          legacy_pcs_user_id:   legacyId,
        },
      });

      if (createErr || !created?.user) {
        result.failed++;
        result.errors.push({
          legacy_user_id: legacyId,
          reason:         createErr?.message ?? "createUser_returned_no_user",
        });
        await admin.from("pcs_legacy_customers_staging")
          .update({ notes: `failed: ${createErr?.message ?? "createUser_no_user"}` })
          .eq("legacy_user_id", legacyId);
        continue;
      }

      const userId = created.user.id;

      // Insert profile with explicit member_code (overrides the trigger's
      // auto-generation) + migrated_from_pcs flag.
      const { error: profErr } = await admin.from("profiles").insert({
        id:                   userId,
        account_type:         "personal",
        member_code:          memberCode,
        first_name:           row.first_name ?? null,
        last_name:            row.last_name ?? null,
        phone:                normalizedPhone ?? null,
        email:                hasEmail ? rawEmail : null,
        sex:                  mapSex(row.user_sex),
        birthday:             row.user_birthday ?? null,
        line_id:              row.line_id ?? null,
        facebook_url:         row.facebook_url ?? null,
        customer_group:       mapCustomerGroup(row.co_id),
        freight_type:         mapFreightType(row.company_customer),
        shop_user:            row.shop_user === "1",
        sales_admin_id:       row.sales_admin_id ?? null,
        admin_id:             row.admin_id ?? null,
        recommended_by:       row.user_recom ?? null,
        referral_channel:     row.channel ?? null,
        note:                 row.user_note ?? null,
        is_active:            row.user_active === "1",
        register_with:        "email",     // legacy is closest to email-style
        last_login_at:        row.user_last_login ?? null,
        status:               "active",    // migrated customers are pre-approved
        migrated_from_pcs:    true,
        legacy_pcs_user_id:   legacyId,
      });

      if (profErr) {
        // Profile insert failed — auth.users is orphaned. Best-effort
        // cleanup so re-running picks up the row cleanly.
        await admin.auth.admin.deleteUser(userId).catch(() => {});
        result.failed++;
        result.errors.push({ legacy_user_id: legacyId, reason: `profile_insert: ${profErr.message}` });
        await admin.from("pcs_legacy_customers_staging")
          .update({ notes: `failed: profile_insert ${profErr.message}` })
          .eq("legacy_user_id", legacyId);
        continue;
      }

      // Mark staging row done.
      await admin.from("pcs_legacy_customers_staging")
        .update({
          backfilled_at:          new Date().toISOString(),
          backfilled_profile_id:  userId,
          notes:                  null,
        })
        .eq("legacy_user_id", legacyId);

      result.created++;
    }

    await logAdminAction(adminId, "pcs_migration.backfill_batch", "staging", "batch", {
      limit,
      dry_run:   dryRun,
      attempted: result.attempted,
      created:   result.created,
      skipped:   result.skipped,
      failed:    result.failed,
      first_error: result.errors[0] ?? null,
    });

    revalidatePath("/admin/migration/pcs-customers");
    return { ok: true, data: result };
  });
}
