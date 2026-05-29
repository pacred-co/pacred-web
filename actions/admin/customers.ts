"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";
import { notify } from "@/lib/notifications/templates";
import { sendSms } from "@/lib/sms/gateway";
import { logger, redactPhone } from "@/lib/logger";
import { resolveProfileIdForLegacyUserid } from "@/lib/auth/tb-users-resolver";
import {
  parseDbdResponse,
  buildDbdLookupUrl,
  type DbdLookupData,
} from "@/lib/dbd/parse-juristic";

const editCustomerSchema = z.object({
  id:              z.string().uuid(),
  first_name:      z.string().trim().max(100).optional(),
  last_name:       z.string().trim().max(100).optional(),
  email:           z.string().trim().email().max(255).optional().or(z.literal("")),
  phone:           z.string().trim().max(20).optional(),
  customer_group:  z.enum(["normal","vip","special"]).optional(),
  sex:             z.enum(["M","F","other"]).optional().nullable(),
  birthday:        z.string().optional().nullable(),
  line_id:         z.string().trim().max(100).optional().nullable(),
  recommended_by:  z.string().trim().max(100).optional().nullable(),
});
export type EditCustomerInput = z.infer<typeof editCustomerSchema>;

export async function editCustomer(input: EditCustomerInput): Promise<AdminActionResult> {
  const parsed = editCustomerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const { id, ...fields } = parsed.data;

  return withAdmin(["ops", "super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: before, error: beforeErr } = await admin.from("profiles").select("*").eq("id", id).maybeSingle();
    if (beforeErr) {
      console.error(`[editCustomer profiles read] failed`, { code: beforeErr.code, message: beforeErr.message, id });
      return { ok: false, error: beforeErr.message };
    }
    if (!before) return { ok: false, error: "not_found" };

    const update: Record<string, unknown> = {};
    if (fields.first_name     !== undefined) update.first_name     = fields.first_name || null;
    if (fields.last_name      !== undefined) update.last_name      = fields.last_name || null;
    if (fields.email          !== undefined) update.email          = fields.email || null;
    if (fields.phone          !== undefined) update.phone          = fields.phone || null;
    if (fields.customer_group !== undefined) update.customer_group = fields.customer_group;
    if (fields.sex            !== undefined) update.sex            = fields.sex;
    if (fields.birthday       !== undefined) update.birthday       = fields.birthday;
    if (fields.line_id        !== undefined) update.line_id        = fields.line_id;
    if (fields.recommended_by !== undefined) update.recommended_by = fields.recommended_by;

    const { error } = await admin.from("profiles").update(update).eq("id", id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "customer.edit", "profile", id, { before, after: update });
    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${id}`);
    return { ok: true };
  });
}

const verifyJuristicSchema = z.object({ profile_id: z.string().uuid() });
const rejectJuristicSchema = z.object({
  profile_id: z.string().uuid(),
  reason:     z.string().trim().min(1).max(500),
});

export async function verifyJuristic(input: z.infer<typeof verifyJuristicSchema>): Promise<AdminActionResult> {
  const parsed = verifyJuristicSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };

  return withAdmin(["ops", "super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin
      .from("corporate")
      .update({ status: "verified", verified_at: new Date().toISOString(), rejection_reason: null })
      .eq("profile_id", parsed.data.profile_id);
    if (error) return { ok: false, error: error.message };

    await admin.from("profiles").update({ status: "active" }).eq("id", parsed.data.profile_id);
    await logAdminAction(adminId, "juristic.verify", "corporate", parsed.data.profile_id, {});
    revalidatePath("/admin/juristic-check");
    revalidatePath(`/admin/customers/${parsed.data.profile_id}`);
    return { ok: true };
  });
}

export async function rejectJuristic(input: z.infer<typeof rejectJuristicSchema>): Promise<AdminActionResult> {
  const parsed = rejectJuristicSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };

  return withAdmin(["ops", "super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin
      .from("corporate")
      .update({ status: "rejected", rejection_reason: parsed.data.reason, verified_at: null })
      .eq("profile_id", parsed.data.profile_id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "juristic.reject", "corporate", parsed.data.profile_id, { reason: parsed.data.reason });
    revalidatePath("/admin/juristic-check");
    revalidatePath(`/admin/customers/${parsed.data.profile_id}`);
    return { ok: true };
  });
}

/**
 * DBD juristic-person lookup + compare (legacy check-juristic/compare.php).
 *
 * Faithful port of the legacy "ตรวจสอบสถานะกับ DBD" button. Given a juristic
 * customer's profile, look up the company at the Department of Business
 * Development (กรมพัฒนาธุรกิจการค้า) by tax id and return both the DBD record
 * and the Pacred-submitted data so the admin can compare them field-by-field
 * before approving (verifyJuristic).
 *
 * DBD data source — env `DBD_LOOKUP_URL` (a template, see buildDbdLookupUrl):
 *   - UNSET (default)        → manual-check mode: no external call, the UI links
 *                              to dbd.go.th and the admin verifies by eye against
 *                              the uploaded หนังสือรับรอง + ภพ20. SAFE default —
 *                              we never send a customer's tax id to a third party
 *                              unless ก๊อต deliberately wires an endpoint.
 *   - SET (e.g. the legacy   → fetch + parse + cache the payload to
 *     borrowed scraper, or      corporate.dbd_payload/dbd_fetched_at, then compare.
 *     an official DBD API)      On fetch failure we fall back to any cached payload.
 *
 * The legacy endpoint (a "borrowed" interim API, per docs/runbook/pcs-scrub-plan.md)
 * is documented in .env.example / docs/env.md — switching it on is a ก๊อต call.
 *
 * Gate: the customer-facing review roles (legacy CEO/Manager/QA/Accounting/ITDT).
 */
const lookupDbdJuristicSchema = z.object({ profile_id: z.string().uuid() });

export async function lookupDbdJuristic(
  input: z.infer<typeof lookupDbdJuristicSchema>,
): Promise<AdminActionResult<DbdLookupData>> {
  const parsed = lookupDbdJuristicSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };

  return withAdmin<DbdLookupData>(
    ["super", "manager", "ops", "accounting", "qa", "sales_admin"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // 1. Read the customer's corporate row (Pacred-submitted juristic data).
      const { data: corp, error: corpErr } = await admin
        .from("corporate")
        .select("tax_id, company_name, company_address, dbd_payload, dbd_fetched_at")
        .eq("profile_id", parsed.data.profile_id)
        .maybeSingle();
      if (corpErr) {
        logger.error("dbd-lookup", "corporate read failed", corpErr, {
          profileId: redactPhone(parsed.data.profile_id),
          code: corpErr.code,
        });
        return { ok: false, error: corpErr.message };
      }
      if (!corp) return { ok: false, error: "not_juristic" };

      const taxId = (corp.tax_id ?? "").trim();
      const pacred = {
        taxId,
        companyName: corp.company_name ?? null,
        companyAddress: corp.company_address ?? null,
      };
      const cachedFetchedAt: string | null = corp.dbd_fetched_at ?? null;
      const cachedDbd = corp.dbd_payload ? parseDbdResponse(corp.dbd_payload) : null;

      // 2. No endpoint configured → manual-check mode (still surface any cached
      //    payload so a previous lookup stays visible).
      const url = buildDbdLookupUrl(process.env.DBD_LOOKUP_URL, taxId);
      if (!url) {
        return {
          ok: true,
          data: {
            configured: false,
            dbd: cachedDbd,
            pacred,
            taxId,
            cached: cachedDbd !== null,
            fetchedAt: cachedFetchedAt,
          },
        };
      }

      // 3. Live fetch (server-side, 12s timeout — legacy used 15s × 2 retries
      //    against a flaky scraper; one bounded attempt keeps the action snappy).
      let rawBody: string | null = null;
      let fetchWarning: string | undefined;
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 12_000);
        try {
          const res = await fetch(url, {
            signal: ctrl.signal,
            cache: "no-store",
            headers: { Accept: "application/json" },
          });
          if (!res.ok) {
            fetchWarning = `DBD endpoint returned HTTP ${res.status}`;
          } else {
            rawBody = await res.text();
          }
        } finally {
          clearTimeout(timer);
        }
      } catch (e) {
        fetchWarning = e instanceof Error ? e.message : "DBD fetch failed";
      }

      // 3a. Fetch failed → serve cached payload if we have one.
      if (rawBody === null) {
        logger.warn("dbd-lookup", "live fetch failed — falling back to cache", {
          taxId,
          reason: fetchWarning,
          hasCache: cachedDbd !== null,
        });
        return {
          ok: true,
          data: {
            configured: true,
            dbd: cachedDbd,
            pacred,
            taxId,
            cached: cachedDbd !== null,
            fetchedAt: cachedFetchedAt,
            warning: fetchWarning ?? "DBD lookup ไม่สำเร็จ",
          },
        };
      }

      // 3b. Parse the live body. null = ไม่พบข้อมูล (status != 200 / empty).
      const dbd = parseDbdResponse(rawBody);

      // 4. Cache the raw decoded body for audit/anti-tampering + re-display.
      let cachePayload: unknown = null;
      try {
        cachePayload = JSON.parse(rawBody);
      } catch {
        cachePayload = { raw: rawBody.slice(0, 4000) };
      }
      const nowIso = new Date().toISOString();
      const { error: cacheErr } = await admin
        .from("corporate")
        .update({ dbd_payload: cachePayload, dbd_fetched_at: nowIso })
        .eq("profile_id", parsed.data.profile_id);
      if (cacheErr) {
        // Non-fatal — the lookup still returns; we just didn't persist the cache.
        logger.warn("dbd-lookup", "dbd_payload cache write failed", {
          profileId: redactPhone(parsed.data.profile_id),
          reason: cacheErr.message,
        });
      }

      await logAdminAction(adminId, "juristic.dbd_lookup", "corporate", parsed.data.profile_id, {
        taxId,
        found: dbd !== null,
      });

      return {
        ok: true,
        data: {
          configured: true,
          dbd,
          pacred,
          taxId,
          cached: false,
          fetchedAt: cacheErr ? cachedFetchedAt : nowIso,
        },
      };
    },
  );
}

/**
 * Approve a customer — D1 Wave-2 (_SYNTHESIS §7.1 / §7.4): re-pointed
 * from the rebuilt-era `profiles` table to the legacy `tb_users` table.
 *
 * `id` is the legacy member code (`tb_users.userID`, e.g. `PR2791`) —
 * the identifier the re-pointed customer list (page.tsx) passes via
 * `<CustomerRowActions>`. Approving lifts a pending account by setting
 * the legacy `useractive` flag to `'1'` (1=ใช้งานแล้ว). A suspended
 * (deleted) account — `userstatus='0'` — is restored by setting it back
 * to `'1'`. Both flags are cleared so the derived status becomes active.
 */
export async function approveCustomer(id: string): Promise<AdminActionResult> {
  if (!id || typeof id !== "string") return { ok: false, error: "invalid_input" };

  return withAdmin(["ops", "super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: before, error: beforeErr } = await admin
      .from("tb_users")
      .select("userID, userActive, userStatus, userTel, userName, userLastName")
      .eq("userID", id)
      .maybeSingle<{
        userID: string;
        userActive: string | null;
        userStatus: string | null;
        userTel: string | null;
        userName: string | null;
        userLastName: string | null;
      }>();
    if (beforeErr) {
      console.error(`[approveCustomer tb_users read] failed`, { code: beforeErr.code, message: beforeErr.message, id });
      return { ok: false, error: beforeErr.message };
    }
    if (!before) return { ok: false, error: "not_found" };
    // No-op when already active (userActive='1' and not deleted).
    if (before.userActive === "1" && before.userStatus !== "0") return { ok: true };

    // E2E loop fix · Agent F1 · 2026-05-29 (Gap #3 part 2):
    // Auto-assign a sales rep BEFORE flipping useractive so the customer's
    // first touch already has owner attribution. If no sales rep is
    // available, leave adminidsale unchanged (don't fail the approve).
    const assignedLegacyAdminId = await pickLeastLoadedSalesRep(admin);

    const updatePayload: Record<string, unknown> = {
      userActive: "1",
      userStatus: "1",
    };
    if (assignedLegacyAdminId) {
      updatePayload.adminIDSale = assignedLegacyAdminId;
    }

    const { error } = await admin
      .from("tb_users")
      .update(updatePayload)
      .eq("userID", id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "customer.approve", "tb_users", id, {
      before: { userActive: before.userActive, userStatus: before.userStatus },
      after:  { userActive: "1", userStatus: "1", adminIDSale: assignedLegacyAdminId ?? null },
    });

    // E2E loop fix · Agent F1 · 2026-05-29 (Gap #3 part 1):
    // Fire welcome SMS to the customer (NOTIFY_BYPASS-respected via the
    // sendSms gateway). Best-effort — log on failure but never roll back.
    if (before.userTel) {
      const welcomeMsg =
        `ยินดีต้อนรับสู่ Pacred · บัญชี ${id} อนุมัติแล้ว · ` +
        `เริ่มสั่งสินค้าได้เลย: pacred.co.th`;
      const sms = await sendSms(before.userTel, welcomeMsg);
      if (!sms.ok) {
        logger.warn("approveCustomer", "welcome SMS failed", {
          userID: id,
          phone:  redactPhone(before.userTel),
          error:  sms.error,
        });
      }
    } else {
      logger.warn("approveCustomer", "customer has no userTel — welcome SMS skipped", { userID: id });
    }

    // Also notify via the profiles spine (LINE/email when wired) — covers
    // migrated tb_users customers that now have a profiles row via the
    // Wave-1 backfill. Resolver returns null when no profile exists yet
    // (legacy ghost case) — sendNotification is then skipped.
    const profileId = await resolveProfileIdForLegacyUserid(id);
    if (profileId) {
      void sendNotification(profileId, notify.customerApproved({ memberCode: id }));
    }

    // Notify the assigned sales rep so they see the new customer right away.
    if (assignedLegacyAdminId) {
      const displayName = `${before.userName ?? ""} ${before.userLastName ?? ""}`.trim() || id;
      await notifyAssignedSalesRep(admin, assignedLegacyAdminId, {
        memberCode: id,
        displayName,
        phone: before.userTel,
      });
    }

    revalidatePath("/admin/customers");
    revalidatePath("/admin/customers/pending");
    revalidatePath(`/admin/customers/${id}`);
    return { ok: true };
  });
}

/**
 * Pick the least-loaded sales rep (sales / sales_admin / super) — the
 * one currently owning the fewest customer rows in tb_users.adminIDSale.
 * Returns the rep's legacy_admin_id string (the value the column stores)
 * or null when no sales rep is available (Pacred-native admins with NULL
 * legacy_admin_id can't own legacy tb_users rows — adminIDSale is
 * varchar(20) holding the legacy string).
 *
 * Round-robin via "fewest customers wins" — gives newer reps a chance
 * before piling onto the senior rep. Fallback to null on lookup failure.
 *
 * E2E loop fix · Agent F1 · 2026-05-29 (Gap #3 part 2).
 */
async function pickLeastLoadedSalesRep(
  admin: ReturnType<typeof createAdminClient>,
): Promise<string | null> {
  // Step 1 — enumerate active sales reps (or super) with a non-null
  // legacy_admin_id (= bridge value the legacy column accepts).
  const { data: roles, error: rolesErr } = await admin
    .from("admins")
    .select("profile_id, role, is_active")
    .in("role", ["sales", "sales_admin", "super"])
    .eq("is_active", true);
  if (rolesErr) {
    logger.warn("approveCustomer", "admins lookup for auto-assign failed", { reason: rolesErr.message });
    return null;
  }
  const profileIds = (roles ?? [])
    .map((r) => (r as { profile_id: string }).profile_id)
    .filter(Boolean);
  if (profileIds.length === 0) return null;

  const { data: extras, error: extrasErr } = await admin
    .from("admin_contact_extras")
    .select("profile_id, legacy_admin_id, ended_at, suspended_at")
    .in("profile_id", profileIds);
  if (extrasErr) {
    logger.warn("approveCustomer", "admin_contact_extras lookup for auto-assign failed", { reason: extrasErr.message });
    return null;
  }
  const candidateIds: string[] = [];
  for (const e of (extras ?? [])) {
    const row = e as {
      legacy_admin_id: string | null;
      ended_at: string | null;
      suspended_at: string | null;
    };
    if (!row.legacy_admin_id) continue;
    if (row.ended_at) continue;          // permanently left
    if (row.suspended_at) continue;      // temporarily paused
    candidateIds.push(row.legacy_admin_id);
  }
  if (candidateIds.length === 0) return null;

  // Step 2 — count current customer load per legacy_admin_id (only
  // currently-owned, active customers). Use a single query with the
  // .in() filter + group it client-side (PostgREST has no GROUP BY in
  // standard select; counting per id with .head + count would be N
  // round-trips, which is wasteful for ~10 candidates).
  const { data: owned, error: ownedErr } = await admin
    .from("tb_users")
    .select("adminIDSale")
    .in("adminIDSale", candidateIds)
    .eq("userActive", "1")
    .eq("userStatus", "1");
  if (ownedErr) {
    logger.warn("approveCustomer", "tb_users load count for auto-assign failed", { reason: ownedErr.message });
    // Fall through to picking the first candidate — better than no
    // assignment at all.
    return candidateIds[0] ?? null;
  }

  const counts = new Map<string, number>();
  for (const id of candidateIds) counts.set(id, 0);
  for (const r of (owned ?? [])) {
    const sale = (r as { adminIDSale: string | null }).adminIDSale;
    if (!sale) continue;
    counts.set(sale, (counts.get(sale) ?? 0) + 1);
  }

  // Tie-broken by insertion order (the admin list order) — deterministic
  // enough for round-robin semantics; no need for randomness when "fewest
  // wins" already balances over time.
  let winner: string | null = null;
  let winnerCount = Number.POSITIVE_INFINITY;
  for (const id of candidateIds) {
    const c = counts.get(id) ?? 0;
    if (c < winnerCount) {
      winnerCount = c;
      winner = id;
    }
  }
  return winner;
}

/**
 * Notify the auto-assigned sales rep via SMS to their work phone (if any).
 * Best-effort — sales rep notification is informational, not load-bearing.
 *
 * E2E loop fix · Agent F1 · 2026-05-29 (Gap #3 part 2).
 */
async function notifyAssignedSalesRep(
  admin: ReturnType<typeof createAdminClient>,
  legacyAdminId: string,
  customer: { memberCode: string; displayName: string; phone: string | null },
): Promise<void> {
  // Look up the rep's work phone via admin_contact_extras → profile join.
  const { data: extras, error: extrasErr } = await admin
    .from("admin_contact_extras")
    .select("profile_id, work_phone, direct_phone")
    .eq("legacy_admin_id", legacyAdminId)
    .maybeSingle<{
      profile_id: string;
      work_phone: string | null;
      direct_phone: string | null;
    }>();
  if (extrasErr) {
    logger.warn("approveCustomer", "rep contact extras lookup failed", { legacyAdminId, reason: extrasErr.message });
    return;
  }
  if (!extras) return;

  const repPhone = extras.work_phone || extras.direct_phone;
  const message =
    `ลูกค้าใหม่: ${customer.memberCode} ${customer.displayName} · ` +
    `เบอร์ ${customer.phone ?? "-"}`;

  if (repPhone) {
    const sms = await sendSms(repPhone, message);
    if (!sms.ok) {
      logger.warn("approveCustomer", "sales-rep SMS failed", {
        legacyAdminId,
        phone: redactPhone(repPhone),
        error: sms.error,
      });
    }
  }

  // Also drop a system notification on the rep's profile so they see it
  // in the in-app inbox + LINE push (when wired).
  if (extras.profile_id) {
    void sendNotification(extras.profile_id, {
      category:  "sales",
      severity:  "info",
      title:     "ลูกค้าใหม่ในทีมของคุณ",
      body:      message,
      link_href: `/admin/customers/${customer.memberCode}`,
    });
  }
}

// ────────────────────────────────────────────────────────────
// Convert a personal account to juristic
// Port of legacy `pcs-admin/api/customers-move-to-juristic/` — used when
// a customer started as บุคคลธรรมดา then later opened a company and
// wants the same wallet/history to roll under the corporate identity.
//
// Trigger `guard_corporate_account_type` enforces that corporate rows
// can only exist where profiles.account_type='juristic', so the update
// order is non-negotiable:
//   1. Flip profiles.account_type → 'juristic'
//   2. Upsert corporate row (insert if absent, else refresh)
// If step 2 fails, revert step 1 so the two stay consistent.
// ────────────────────────────────────────────────────────────
const convertToJuristicSchema = z.object({
  profile_id:      z.string().uuid(),
  tax_id:          z.string().trim().regex(/^\d{13}$/, "เลขผู้เสียภาษีต้อง 13 หลัก"),
  company_name:    z.string().trim().min(1, "กรอกชื่อบริษัท").max(255),
  company_address: z.string().trim().max(1000).optional().or(z.literal("").transform(() => undefined)),
  // Admin-issued conversions are treated as already verified (the admin
  // is the verifier). Skip DBD round-trip; payload field stays null.
  mark_verified:   z.boolean().default(true),
});
export type ConvertToJuristicInput = z.infer<typeof convertToJuristicSchema>;

export async function adminConvertToJuristic(
  input: ConvertToJuristicInput,
): Promise<AdminActionResult> {
  const parsed = convertToJuristicSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["ops", "super"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: before, error: beforeErr } = await admin
      .from("profiles")
      .select("id, account_type, member_code, first_name, last_name")
      .eq("id", d.profile_id)
      .maybeSingle<{ ID: string; account_type: "personal" | "juristic"; member_code: string | null; first_name: string | null; last_name: string | null }>();
    if (beforeErr) {
      console.error(`[adminConvertToJuristic profiles read] failed`, { code: beforeErr.code, message: beforeErr.message, profile_id: d.profile_id });
      return { ok: false, error: beforeErr.message };
    }
    if (!before) return { ok: false, error: "not_found" };
    if (before.account_type === "juristic") return { ok: false, error: "already_juristic" };

    // Block duplicate tax_id collisions early — the partial unique index
    // on corporate(tax_id) only covers 'verified' rows, so we double-check.
    const { data: clash, error: clashErr } = await admin
      .from("corporate")
      .select("profile_id")
      .eq("tax_id", d.tax_id)
      .neq("profile_id", d.profile_id)
      .maybeSingle();
    if (clashErr) {
      console.error(`[adminConvertToJuristic corporate clash check] failed`, { code: clashErr.code, message: clashErr.message, tax_id: d.tax_id });
      return { ok: false, error: clashErr.message };
    }
    if (clash) return { ok: false, error: "tax_id_already_used" };

    // Step 1 — flip account_type so the corporate trigger lets the insert through
    const { error: profErr } = await admin
      .from("profiles")
      .update({ account_type: "juristic" })
      .eq("id", d.profile_id);
    if (profErr) {
      console.error(`[adminConvertToJuristic profiles update] failed`, { code: profErr.code, message: profErr.message, profile_id: d.profile_id });
      return { ok: false, error: profErr.message };
    }

    // Step 2 — upsert the corporate row
    const corporatePayload: Record<string, unknown> = {
      profile_id:      d.profile_id,
      tax_id:          d.tax_id,
      company_name:    d.company_name,
      company_address: d.company_address ?? null,
      status:          d.mark_verified ? "verified" : "pending",
      verified_at:     d.mark_verified ? new Date().toISOString() : null,
      verified_by:     d.mark_verified ? adminId : null,
      rejection_reason: null,
    };
    const { error: corpErr } = await admin
      .from("corporate")
      .upsert(corporatePayload, { onConflict: "profile_id" });

    if (corpErr) {
      // Rollback the account_type flip — best effort, so the trigger
      // doesn't end up rejecting future updates from a half-state.
      await admin
        .from("profiles")
        .update({ account_type: before.account_type })
        .eq("id", d.profile_id);
      return { ok: false, error: corpErr.message };
    }

    const display = `${before.first_name ?? ""} ${before.last_name ?? ""}`.trim()
      || d.company_name;

    await logAdminAction(adminId, "customer.convert_to_juristic", "profile", d.profile_id, {
      previous_account_type: before.account_type,
      tax_id:                d.tax_id,
      company_name:          d.company_name,
      mark_verified:         d.mark_verified,
    });

    void sendNotification(d.profile_id, notify.customerConvertedToJuristic({
      displayName: display,
      companyName: d.company_name,
    }));

    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${d.profile_id}`);
    revalidatePath(`/admin/customers/${d.profile_id}/convert-to-juristic`);
    return { ok: true };
  });
}

/**
 * Suspend an active customer — D1 Wave-2 (_SYNTHESIS §7.1 / §7.4):
 * re-pointed from `profiles` to the legacy `tb_users` table. `id` is the
 * legacy member code (`tb_users.userID`). Legacy PCS has no distinct
 * "suspended" state — a disabled account is `userstatus='0'`
 * (0=ลบบัญชี), which the re-pointed customer list renders as "ระงับ".
 */
export async function suspendCustomer(id: string): Promise<AdminActionResult> {
  if (!id || typeof id !== "string") return { ok: false, error: "invalid_input" };

  return withAdmin(["ops", "super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: before, error: beforeErr } = await admin
      .from("tb_users")
      .select("userID, userStatus")
      .eq("userID", id)
      .maybeSingle<{ userID: string; userStatus: string | null }>();
    if (beforeErr) {
      console.error(`[suspendCustomer tb_users read] failed`, { code: beforeErr.code, message: beforeErr.message, id });
      return { ok: false, error: beforeErr.message };
    }
    if (!before) return { ok: false, error: "not_found" };
    if (before.userStatus === "0") return { ok: true };  // no-op — already disabled

    const { error } = await admin
      .from("tb_users")
      .update({ userStatus: "0" })
      .eq("userID", id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "customer.suspend", "tb_users", id, {
      before: { userStatus: before.userStatus },
      after:  { userStatus: "0" },
    });

    // Note: customer notification deferred — see approveCustomer comment.

    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${id}`);
    return { ok: true };
  });
}
