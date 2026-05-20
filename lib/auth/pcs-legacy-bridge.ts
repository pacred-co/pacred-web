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
    query = query.eq("userid", id.toUpperCase());
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
  // user with that same plaintext password — Q2-(a)-refined, no shared secret.
  const e164 = normalizePhone(row.usertel ?? "");
  const usePhone = isUsablePhone(e164);
  if (!usePhone) {
    // Q2: a legacy row with no usable phone provisions by synthetic email —
    // logged so เดฟ can reconcile the (expected to be tiny) list.
    logger.warn(SCOPE, "legacy row has no usable phone — using synthetic email", {
      userid:  row.userid,
      usertel: redactPhone(row.usertel),
    });
  }
  const credential = usePhone
    ? { phone: e164 }
    : { email: legacySyntheticEmail(row.userid) };

  const admin = createAdminClient();
  const { error: createErr } = await admin.auth.admin.createUser({
    ...credential,
    password,
    ...(usePhone ? { phone_confirm: true } : { email_confirm: true }),
    user_metadata: {
      legacy_user_id:     row.userid,
      first_name:         row.username,
      last_name:          row.userlastname,
      legacy_provisioned: true,
    },
  });
  // createUser is intentionally unchecked: it fails when the customer was
  // already provisioned on an earlier login (the bridge runs once per
  // customer) — that is the normal repeat-visit path. signInWithPassword
  // below is the real gate.
  if (createErr) {
    logger.debug(SCOPE, "createUser skipped — customer likely already provisioned", {
      userid: row.userid,
      reason: createErr.message,
    });
  }

  const supabase = await createClient();
  const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
    ...credential,
    password,
  });
  if (signInErr || !signInData.user) {
    logger.warn(SCOPE, "legacy bridge sign-in failed after provisioning", {
      userid: row.userid,
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
