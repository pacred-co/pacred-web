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
  userid: string;
  usertel: string | null;
  useremail: string | null;
  username: string | null;
  userlastname: string | null;
  userpass: string;
  userstatus: string;
  usercompany: string | null;
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
    .select("userid, usertel, useremail, username, userlastname, userpass, userstatus, usercompany");

  const kind = detectIdentifier(id);
  if (kind === "email") {
    // Legacy MySQL collation was case-insensitive — match case-insensitively.
    query = query.ilike("useremail", escapeLikePattern(id));
  } else if (kind === "memberCode") {
    // userid values are uppercase post-rebrand (pcs-data-migration.md §4).
    // Padding-aware match: migration 0103 padded every legacy PR<n> to
    // min-3-digit form (PR1/PR01 → PR001). The customer might still
    // remember the unpadded variant, so accept either the raw input or
    // its 3-digit-padded equivalent. Same row matches both forms — the
    // userid column itself only stores the padded form post-0103.
    const raw   = id.toUpperCase();
    const match = /^PR(\d+)$/.exec(raw);
    const padded = match ? "PR" + match[1].padStart(3, "0") : raw;
    query = padded === raw
      ? query.eq("userid", raw)
      : query.in("userid", [raw, padded]);
  } else {
    const candidates = legacyPhoneCandidates(id);
    query = candidates.length > 0
      ? query.in("usertel", candidates)
      : query.eq("userid", id.toUpperCase()); // letter-only handle (PW / JET / FCL / AIGA)
  }

  try {
    // Prefer an active row ('1' sorts after '0') if a phone is shared with a
    // since-deleted account.
    const { data, error } = await query
      .order("userstatus", { ascending: false })
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

  // userstatus: '1' = active, '0' = deleted account (legacy column comment).
  if (row.userstatus !== "1") {
    logger.warn(SCOPE, "legacy login refused — inactive account", { userid: row.userid });
    return { ok: false };
  }

  if (!verifyLegacyPassword(password, row.userpass)) {
    return { ok: false };
  }

  // Password verified against the legacy passTam hash. Provision a Supabase
  // user with that same plaintext password.
  //
  // ⚠️ ALWAYS use the synthetic legacy email as the auth credential — NOT
  // the customer's phone. The Phase-A bulk migration provisioned every
  // legacy customer with `pcs-legacy-pr<n>@users.pacred.invalid` + no
  // phone in auth.users (only the profile row carries the real number for
  // SMS). Switching to a phone credential would:
  //   1. Collide with Pacred-web staff/test accounts that registered with
  //      the SAME phone (36+ such pairs observed 2026-05-24 — e.g. PR321
  //      legacy customer วิสิฐ + PR132 admin วิสิฐ share +66948782006);
  //      `signInWithPassword({phone})` resolves to the staff auth user
  //      → the legacy customer signs in AS THE STAFF MEMBER. Wrong
  //      identity. Tracked in docs/learnings/pacred-domain-knowledge.md.
  //   2. Fail for the 8,896 legacy auth users that have NO phone column —
  //      `signInWithPassword({phone})` returns "no user" because lookup
  //      is by phone.
  // The real phone stays on `profiles.phone` for SMS notifications and
  // contact lookups — it's not load-bearing for auth.
  const credential = { email: legacySyntheticEmail(row.userid) };

  // We keep the phone normalized + diagnostic-logged when usable; the
  // profile-row insert later reads `row.usertel` directly anyway.
  const e164 = normalizePhone(row.usertel ?? "");
  if (!isUsablePhone(e164)) {
    logger.debug(SCOPE, "legacy row has no usable phone — phone field on the profile stays empty", {
      userid:  row.userid,
      usertel: redactPhone(row.usertel),
    });
  }

  const admin = createAdminClient();
  const { data: createData, error: createErr } = await admin.auth.admin.createUser({
    ...credential,
    password,
    email_confirm: true,
    user_metadata: {
      legacy_user_id:     row.userid,
      first_name:         row.username,
      last_name:          row.userlastname,
      legacy_provisioned: true,
    },
  });

  // If createUser failed because the synthetic email already exists (Phase-A
  // bulk-provisioned all 8,895 legacy customers with these emails — but with
  // a placeholder password, since the migration doesn't know the customer's
  // plaintext password), we MUST update the existing user's password to the
  // one the customer just typed (already verified against the legacy hash).
  // Without this step, signInWithPassword would compare against the migration-
  // time placeholder and fail — making the entire bridge unusable for migrated
  // customers. We find the existing user by joining through profiles.id and
  // force-set the password via the admin API.
  //
  // Note: createData here is `{ user: User | null }` not `null` — supabase-js
  // returns an object with a null `user` field on failure. So we check
  // `!createData?.user` (the user object), not `!createData` itself.
  if (createErr && !createData?.user) {
    logger.debug(SCOPE, "createUser failed — existing legacy user, syncing password", {
      userid: row.userid,
      reason: createErr.message,
    });
    // Find the existing auth.users.id by joining through profiles.member_code:
    // Phase-A migration created profiles.id = auth.users.id 1:1 for every
    // legacy customer, so the profile row's UUID IS the auth user's UUID.
    // We avoid `.schema("auth").from("users")` because the auth schema is
    // not exposed via PostgREST by default in Supabase — that lookup would
    // silently return null and the password sync would never apply.
    const { data: existingProfile, error: profileLookupErr } = await admin
      .from("profiles")
      .select("id")
      .eq("member_code", row.userid)
      .maybeSingle<{ id: string }>();

    if (profileLookupErr) {
      logger.warn(SCOPE, "profile lookup for password sync failed", {
        userid: row.userid,
        reason: profileLookupErr.message,
      });
      return { ok: false };
    }
    if (!existingProfile?.id) {
      // No profile bridges this member_code to an auth user — bail. The
      // surface should be the "create new profile" branch below; we got
      // here because createUser said the email exists, which means there
      // IS an auth user without a matching profile. That's an inconsistent
      // state that the bridge can't safely auto-recover from.
      logger.warn(SCOPE, "createUser said email exists but no profile maps to this member_code", {
        userid: row.userid,
      });
      return { ok: false };
    }
    const { error: updErr } = await admin.auth.admin.updateUserById(existingProfile.id, {
      password,
      user_metadata: {
        legacy_user_id:     row.userid,
        first_name:         row.username,
        last_name:          row.userlastname,
        legacy_provisioned: true,
      },
    });
    if (updErr) {
      logger.warn(SCOPE, "password sync to existing legacy auth user failed", {
        userid: row.userid,
        reason: updErr.message,
      });
      return { ok: false };
    }
    logger.info(SCOPE, "password synced to existing legacy auth user", {
      userid: row.userid,
    });
  }

  const supabase = await createClient();
  const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
    ...credential,
    password,
  });
  if (signInErr || !signInData.user) {
    logger.warn(SCOPE, "legacy bridge sign-in failed after provisioning", {
      userid:     row.userid,
      credential: credential.email,
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
  // the profile row now (the auth.users row exists → the profiles.id→auth.users
  // FK is satisfiable). Idempotent — a no-op on every repeat login.
  // The ghost-customer fix per docs/research/wave-1-fidelity/_SYNTHESIS.md §8.
  await ensureLegacyProfile(signInData.user.id, row);

  logger.info(SCOPE, "legacy customer signed in via PCS bridge", { userid: row.userid });
  return { ok: true };
}

/**
 * Create the `profiles` row for a migrated PCS customer on first legacy login.
 * Keyed by the auth.users id, carrying the legacy `member_code`
 * (= `tb_users.userid`) that every customer-side `tb_*` query joins on. Safe to
 * call on every login — it no-ops once the row exists.
 */
async function ensureLegacyProfile(authUserId: string, row: LegacyUser): Promise<void> {
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("member_code", row.userid)
    .maybeSingle();

  if (existing) {
    // A different id = a pre-D1 `0067`-scaffold row already holds this
    // member_code (~6 customers, _SYNTHESIS §8.3) — leave it, log for เดฟ.
    if (existing.id !== authUserId) {
      logger.warn(SCOPE, "member_code already bound to a different profile — manual reconcile", {
        userid: row.userid,
      });
    }
    return;
  }

  const e164 = normalizePhone(row.usertel ?? "");
  const { error } = await admin.from("profiles").insert({
    id: authUserId,
    member_code: row.userid,
    first_name: row.username,
    last_name: row.userlastname,
    phone: isUsablePhone(e164) ? e164 : row.usertel,
    email: row.useremail,
    account_type: row.usercompany === "1" ? "juristic" : "personal",
    status: "active",
  });
  if (error) {
    // Non-fatal — the customer is authenticated; never block login on this.
    logger.warn(SCOPE, "legacy profile provisioning failed", {
      userid: row.userid,
      reason: error.message,
    });
  }
}
