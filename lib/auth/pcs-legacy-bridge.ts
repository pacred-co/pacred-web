/**
 * Legacy PCS Cargo sign-in bridge ("เชื่อมต่อบัญชี PCS CARGO").
 *
 * D1 / Phase B (ADR-0017): the ~8,898 migrated PCS customers sign in with
 * their EXISTING password — no reset. Their credentials live in the ported
 * `tb_users` table (`userpass` = the legacy `passTam` hash). Supabase Auth has
 * no "sign in with a foreign hash" API, so on a migrated customer's FIRST
 * login this bridge provisions a Supabase auth user with the password they
 * just typed (verified against the legacy hash). Every later login then goes
 * straight through native Supabase auth — the bridge runs once per customer.
 *
 * Wired into `actions/auth.ts:signIn` as the fallback after native auth fails.
 *
 * Pre-Phase-A safety: `tb_users` does not exist until the legacy data loads
 * (runbook `pcs-data-migration.md` §9, DB-2). Every `tb_users` access is
 * guarded — a missing table degrades to "no legacy match", never an error.
 *
 * ⚠️ Auth posture is Q2-(a)-refined (research/poom-d1-open-questions.md):
 * provision-on-first-login with the customer's own password, no shared
 * secret. Provisional pending ก๊อต ratification before this ships to prod.
 *
 * Server-only.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logger, redactPhone } from "@/lib/logger";
import { detectIdentifier, normalizePhone } from "@/lib/utils/phone";
import {
  legacyPhoneCandidates,
  legacySyntheticEmail,
  verifyLegacyPassword,
} from "./pcs-legacy-password";

const SCOPE = "pcs-bridge";

/** The `tb_users` columns the bridge reads — legacy names, all lowercase. */
type LegacyUser = {
  userID: string;
  userTel: string | null;
  userEmail: string | null;
  userName: string | null;
  userLastName: string | null;
  userPass: string;
  userStatus: string;
  userCompany: string | null;
};

/** A usable Thai E.164 number — `+66` then an 8- or 9-digit national number. */
function isUsablePhone(e164: string): boolean {
  return /^\+66\d{8,9}$/.test(e164);
}

/** Escape PostgreSQL ILIKE metacharacters so a value matches literally. */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Look up a migrated customer in the ported `tb_users` table by whatever the
 * customer typed at sign-in (email / member code / phone). Returns `null` on
 * no match — including when `tb_users` does not exist yet (pre-Phase-A).
 */
async function findLegacyUser(identifier: string): Promise<LegacyUser | null> {
  const admin = createAdminClient();
  const id = identifier.trim();
  // tb_users is RLS-locked to service_role (pcs-data-migration.md §4) — the
  // admin (service-role) client is mandatory for this read.
  let query = admin
    .from("tb_users")
    .select("userID, userTel, userEmail, userName, userLastName, userPass, userStatus, userCompany");

  const kind = detectIdentifier(id);
  if (kind === "email") {
    // Legacy MySQL collation was case-insensitive — match case-insensitively.
    query = query.ilike("userEmail", escapeLikePattern(id));
  } else if (kind === "memberCode") {
    // userID values are uppercase post-rebrand (pcs-data-migration.md §4).
    // Padding-aware match: migration 0103 padded every legacy PR<n> to
    // min-3-digit form (PR1/PR01 → PR001). The customer might still
    // remember the unpadded variant, so accept either the raw input or
    // its 3-digit-padded equivalent. Same row matches both forms — the
    // userID column itself only stores the padded form post-0103.
    const raw   = id.toUpperCase();
    const match = /^PR(\d+)$/.exec(raw);
    const padded = match ? "PR" + match[1].padStart(3, "0") : raw;
    query = padded === raw
      ? query.eq("userID", raw)
      : query.in("userID", [raw, padded]);
  } else {
    const candidates = legacyPhoneCandidates(id);
    query = candidates.length > 0
      ? query.in("userTel", candidates)
      : query.eq("userID", id.toUpperCase()); // letter-only handle (PW / JET / FCL / AIGA)
  }

  try {
    // Prefer an active row ('1' sorts after '0') if a phone is shared with a
    // since-deleted account.
    const { data, error } = await query
      .order("userStatus", { ascending: false })
      .limit(1);
    if (error) {
      // Expected before Phase A loads tb_users — degrade to "no legacy user".
      logger.debug(SCOPE, "tb_users lookup unavailable", { reason: error.message });
      return null;
    }
    return (data?.[0] as LegacyUser | undefined) ?? null;
  } catch (err) {
    logger.debug(SCOPE, "tb_users lookup threw", { reason: String(err) });
    return null;
  }
}

/**
 * Attempt a legacy PCS sign-in. On success the Supabase session cookies are
 * set (the caller can read the session straight after). Returns `{ ok:false }`
 * for every non-success path — unknown user, deactivated account, wrong
 * password, provisioning failure — so the caller surfaces one generic
 * `invalid_credentials` (no account enumeration).
 */
export async function bridgeLegacyLogin(
  identifier: string,
  password: string,
): Promise<{ ok: boolean }> {
  const row = await findLegacyUser(identifier);
  if (!row) return { ok: false };

  // userStatus: '1' = active, '0' = deleted account (legacy column comment).
  if (row.userStatus !== "1") {
    logger.warn(SCOPE, "legacy login refused — inactive account", { userID: row.userID });
    return { ok: false };
  }

  if (!verifyLegacyPassword(password, row.userPass)) {
    return { ok: false };
  }

  // Password verified against the legacy passTam hash. Now establish the
  // Supabase session.
  //
  // ⚠️ AUTHORITATIVE LINK = profiles.member_code → profiles.ID = auth.users.id
  // (Phase-A 1:1). We resolve the EXISTING auth user through that link and use
  // its REAL email — we do NOT re-derive the synthetic email and createUser.
  //
  // WHY (owner 2026-06-24, the PR050 fire): migration 0103 padded member_codes
  // to ≥3 digits (PR50 → PR050), but the bulk-provisioned auth.users.email kept
  // the OLD form (`pcs-legacy-pr50`), and ~34 migrated customers' emails are
  // even scrambled (PR045 → `pcs-legacy-pr121`). `legacySyntheticEmail(member)`
  // therefore no longer matches the real auth email for them. The old code
  // derived that email and called createUser → since the derived email did NOT
  // exist, Supabase CREATED A DUPLICATE auth user with an empty profile → the
  // customer was bounced to /complete-profile and shown the synthetic email
  // ("เละๆ มั่วๆ"). Resolving via member_code first eliminates the whole class.
  //
  // The auth credential is ALWAYS the synthetic email (never the phone): the
  // bulk migration left auth.users with no phone, and 36+ staff/test accounts
  // share customer phones — a phone credential would sign in as the wrong
  // identity. The real phone lives on profiles.phone for SMS only.
  const e164 = normalizePhone(row.userTel ?? "");
  if (!isUsablePhone(e164)) {
    logger.debug(SCOPE, "legacy row has no usable phone — phone field on the profile stays empty", {
      userID:  row.userID,
      userTel: redactPhone(row.userTel),
    });
  }

  const admin = createAdminClient();

  // 1. Resolve the existing auth user via the authoritative profiles link.
  const { data: existingProfile, error: profileLookupErr } = await admin
    .from("profiles")
    .select("ID")
    .eq("member_code", row.userID)
    .maybeSingle<{ ID: string }>();
  if (profileLookupErr) {
    logger.warn(SCOPE, "profile lookup failed", {
      userID: row.userID,
      reason: profileLookupErr.message,
    });
    return { ok: false };
  }

  let authEmail: string;

  if (existingProfile?.ID) {
    // Existing migrated customer — use their REAL auth user (whatever email the
    // migration stored), and force-set the password to the one just typed
    // (verified against the legacy hash). No createUser → no duplicate.
    const { data: existingUser, error: getErr } = await admin.auth.admin.getUserById(existingProfile.ID);
    if (getErr || !existingUser?.user) {
      logger.warn(SCOPE, "existing profile maps to a missing auth user", {
        userID: row.userID,
        reason: getErr?.message,
      });
      return { ok: false };
    }
    authEmail = existingUser.user.email ?? legacySyntheticEmail(row.userID);
    const { error: updErr } = await admin.auth.admin.updateUserById(existingProfile.ID, {
      password,
      user_metadata: {
        legacy_user_id:     row.userID,
        first_name:         row.userName,
        last_name:          row.userLastName,
        legacy_provisioned: true,
      },
    });
    if (updErr) {
      logger.warn(SCOPE, "password sync to existing legacy auth user failed", {
        userID: row.userID,
        reason: updErr.message,
      });
      return { ok: false };
    }
  } else {
    // No profile yet — a never-provisioned legacy customer. Create the auth user
    // with the synthetic email; ensureLegacyProfile creates the profile below.
    authEmail = legacySyntheticEmail(row.userID);
    const { data: createData, error: createErr } = await admin.auth.admin.createUser({
      email:         authEmail,
      password,
      email_confirm: true,
      user_metadata: {
        legacy_user_id:     row.userID,
        first_name:         row.userName,
        last_name:          row.userLastName,
        legacy_provisioned: true,
      },
    });
    if (createErr && !createData?.user) {
      // The synthetic email exists but no profile maps to this member_code — an
      // orphan auth user (an inconsistent/legacy-scaffold state). Do NOT create
      // a second user (that was the dup bug). Bail safely → manual reconcile.
      logger.warn(SCOPE, "createUser failed + no profile for member_code — manual reconcile needed", {
        userID: row.userID,
        reason: createErr.message,
      });
      return { ok: false };
    }
  }

  const supabase = await createClient();
  const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
    email: authEmail,
    password,
  });
  if (signInErr || !signInData.user) {
    logger.warn(SCOPE, "legacy bridge sign-in failed after provisioning", {
      userID:     row.userID,
      credential: authEmail,
      errCode:    signInErr?.code,
      errStatus:  signInErr?.status,
      errMessage: signInErr?.message,
      hadUser:    Boolean(signInData?.user),
    });
    return { ok: false };
  }

  // The migrated customer is authenticated — but the ~8,898 ported PCS
  // customers have no `profiles` row, so `getCurrentUserWithProfile()` would
  // return profile:null and the protected layout would bounce/crash. Create
  // the profile row now (the auth.users row exists → the profiles.ID→auth.users
  // FK is satisfiable). Idempotent — a no-op on every repeat login.
  // The ghost-customer fix per docs/research/wave-1-fidelity/_SYNTHESIS.md §8.
  await ensureLegacyProfile(signInData.user.id, row);

  logger.info(SCOPE, "legacy customer signed in via PCS bridge", { userID: row.userID });
  return { ok: true };
}

/**
 * Create the `profiles` row for a migrated PCS customer on first legacy login.
 * Keyed by the auth.users id, carrying the legacy `member_code`
 * (= `tb_users.userID`) that every customer-side `tb_*` query joins on. Safe to
 * call on every login — it no-ops once the row exists.
 */
async function ensureLegacyProfile(authUserId: string, row: LegacyUser): Promise<void> {
  const admin = createAdminClient();

  const { data: existing, error: existingErr } = await admin
    .from("profiles")
    .select("ID, status, first_name, last_name")
    .eq("member_code", row.userID)
    .maybeSingle<{ ID: string; status: string; first_name: string | null; last_name: string | null }>();
  if (existingErr) {
    console.error(`[profiles list] failed`, { code: existingErr.code, message: existingErr.message });
  }

  if (existing) {
    // A different id = a pre-D1 `0067`-scaffold row already holds this
    // member_code (~6 customers, _SYNTHESIS §8.3) — leave it, log for เดฟ.
    if (existing.ID !== authUserId) {
      logger.warn(SCOPE, "member_code already bound to a different profile — manual reconcile", {
        userID: row.userID,
      });
      return;
    }
    // owner 2026-06-24 — migrated customers ALREADY have name/phone/address in
    // tb_users; the migration left ~6,931 of them at status='incomplete', which
    // bounced them to /complete-profile on every login ("ก็มีหมดแล้ว ยังต้องตั้ง
    // ใหม่อีกทำไม"). Heal on login: flip to 'active' + backfill the name from
    // tb_users if the profile's is blank. Never touch 'suspended'.
    if (existing.status === "incomplete") {
      const patch: Record<string, string> = { status: "active" };
      if (!existing.first_name && row.userName) patch.first_name = row.userName;
      if (!existing.last_name && row.userLastName) patch.last_name = row.userLastName;
      const { error: healErr } = await admin.from("profiles").update(patch).eq("ID", authUserId);
      if (healErr) {
        logger.warn(SCOPE, "profile heal incomplete→active failed", { userID: row.userID, reason: healErr.message });
      }
    }
    return;
  }

  const e164 = normalizePhone(row.userTel ?? "");
  const { error } = await admin.from("profiles").insert({
    ID: authUserId,
    member_code: row.userID,
    first_name: row.userName,
    last_name: row.userLastName,
    phone: isUsablePhone(e164) ? e164 : row.userTel,
    email: row.userEmail,
    account_type: row.userCompany === "1" ? "juristic" : "personal",
    status: "active",
  });
  if (error) {
    // Non-fatal — the customer is authenticated; never block login on this.
    logger.warn(SCOPE, "legacy profile provisioning failed", {
      userID: row.userID,
      reason: error.message,
    });
  }
}
