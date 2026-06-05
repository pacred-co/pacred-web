/**
 * Legacy PCS Cargo STAFF sign-in bridge — warehouse / driver floor staff.
 * (2026-06-05 · owner directive)
 *
 * The owner wants the shared warehouse/transport crew — พนักงานโกดัง (labor),
 * คนขับรถ (drivers), เด็กรถ (driver-helpers) — who still work the SAME trucks +
 * warehouse for both PCS and Pacred, to log in to OUR system with their
 * EXISTING PCS username + password, unchanged ("อย่าให้เขารู้สึกว่าระบบเปลี่ยน").
 *
 * These people already exist in the ported `tb_admin` table (Phase A loaded all
 * 117 tables incl. `tb_admin.adminPass`), but Pacred staff-login is Supabase
 * Auth only — `tb_admin` was never an auth source. So a floor worker has a
 * `tb_admin` row but NO `auth.users` / `admins` / `profiles` → can't log in.
 *
 * This bridge mirrors the CUSTOMER bridge (lib/auth/pcs-legacy-bridge.ts):
 * on first login it verifies the typed password against the legacy `adminPass`
 * (same `passTam` MD5 hash as customers — verifyLegacyPassword works as-is) and
 * provisions a Supabase user + profile + admins-role row with that password.
 * Every later login is then plain native Supabase auth — the bridge runs once.
 *
 * SAFETY — this is auth (highest blast radius), so:
 *  • Wired as an ADDITIVE fallback in signIn AFTER native + the customer bridge
 *    both fail → it can NEVER break an existing login (it only runs when those
 *    paths already returned no match).
 *  • Role is grounded in the legacy `tb_admin.adminStatus` position code
 *    (function.php L633-634): '6' = พนักงานโกดัง → 'warehouse', '7' = คนขับรถ →
 *    'driver'. EVERY OTHER code (office: '4' บัญชี, '5' ฝากนำเข้า, sales/manager,
 *    or blank = the modern provisioned roster) is REFUSED here — privileged
 *    office staff must be provisioned the proper way (/admin/admins), never
 *    auto-granted via a login bridge. Refuse-when-unsure (no role guessing).
 *  • Distinct synthetic-email namespace (`…@staff.pacred.invalid`) so a bridged
 *    staffer can never collide with — or resolve to — a customer auth row.
 *
 * ⚠️ NOT click-tested on prod (login can't be exercised here). Verify with one
 * real warehouse/driver login. The role mapping can be widened (e.g. partner
 * drivers, extra warehouse sections) once ก๊อต/owner confirm the legacy code set.
 *
 * Server-only.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logger, redactPhone } from "@/lib/logger";
import { detectIdentifier, normalizePhone } from "@/lib/utils/phone";
import { legacyPhoneCandidates, verifyLegacyPassword } from "./pcs-legacy-password";
import type { AdminRole } from "./require-admin";

const SCOPE = "pcs-admin-bridge";

/** The `tb_admin` columns the bridge reads — camelCase (post-0113 rename). */
type LegacyAdmin = {
  adminID: string;
  adminName: string | null;
  adminLastName: string | null;
  adminNickname: string | null;
  adminTel: string | null;
  adminEmail: string | null;
  adminPass: string;
  adminStatusA: string | null; // '0' = deactivated (legacy login gate: adminStatusA<>0)
  adminStatus: string | null;  // position code (function.php L626-634)
};

/**
 * Synthetic auth email for a bridged legacy staffer. DISTINCT `staff.` subdomain
 * (vs the customer bridge's `users.`) so a staff bridge can never collide with —
 * or be mistaken for — a migrated customer's auth row. RFC-2606 `.invalid` TLD.
 */
function legacySyntheticAdminEmail(adminId: string): string {
  return `pcs-legacy-admin-${adminId.trim().toLowerCase()}@staff.pacred.invalid`;
}

/**
 * Map a legacy `tb_admin.adminStatus` position code → a Pacred admins.role.
 * ONLY the two floor-staff buckets the owner asked about are auto-bridgeable;
 * everything else returns null → the bridge refuses (provision via /admin/admins).
 * Grounded in legacy function.php L626-634 (the adminStatus badge switch).
 */
function mapLegacyStaffRole(adminStatus: string | null): Extract<AdminRole, "warehouse" | "driver"> | null {
  switch ((adminStatus ?? "").trim()) {
    case "6": // พนักงานโกดัง (warehouse labor / helpers)
      return "warehouse";
    case "7": // คนขับรถ (driver / driver-helper)
      return "driver";
    default: // '4' บัญชี · '5' ฝากนำเข้า · sales/manager/super · '' modern roster
      return null;
  }
}

function isUsablePhone(e164: string): boolean {
  return /^\+66\d{8,9}$/.test(e164);
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Look up an active legacy staffer in `tb_admin` by what they typed
 * (employee code = adminID · email · phone). Returns null on no match —
 * including when `tb_admin` does not exist yet (pre-Phase-A).
 */
async function findLegacyAdmin(identifier: string): Promise<LegacyAdmin | null> {
  const admin = createAdminClient();
  const id = identifier.trim();
  let query = admin
    .from("tb_admin")
    .select("adminID, adminName, adminLastName, adminNickname, adminTel, adminEmail, adminPass, adminStatusA, adminStatus");

  const kind = detectIdentifier(id);
  if (kind === "email") {
    query = query.ilike("adminEmail", escapeLikePattern(id));
  } else if (kind === "memberCode") {
    // Not an admin identifier shape (PR####). No staff match.
    return null;
  } else {
    const candidates = legacyPhoneCandidates(id);
    // Phone → match adminTel; otherwise treat the text as the employee code
    // (adminID, e.g. "admin_pod"). adminID is case-sensitive in legacy but we
    // accept the typed form + a lowercased form for forgiveness.
    if (candidates.length > 0) {
      query = query.in("adminTel", candidates);
    } else {
      query = query.in("adminID", [id, id.toLowerCase()]);
    }
  }

  try {
    const { data, error } = await query
      .order("adminStatusA", { ascending: false }) // prefer an active row
      .limit(1);
    if (error) {
      logger.debug(SCOPE, "tb_admin lookup unavailable", { reason: error.message });
      return null;
    }
    return (data?.[0] as LegacyAdmin | undefined) ?? null;
  } catch (err) {
    logger.debug(SCOPE, "tb_admin lookup threw", { reason: String(err) });
    return null;
  }
}

/**
 * Attempt a legacy PCS STAFF sign-in (warehouse/driver only). On success the
 * Supabase session cookies are set. Returns `{ ok:false }` for every
 * non-success path — unknown staff, deactivated, non-floor role, wrong
 * password, provisioning failure — so the caller surfaces one generic
 * `invalid_credentials` (no enumeration).
 */
export async function bridgeLegacyAdminLogin(
  identifier: string,
  password: string,
): Promise<{ ok: boolean }> {
  const row = await findLegacyAdmin(identifier);
  if (!row) return { ok: false };

  // Active gate (legacy login.php: adminStatusA<>0).
  if ((row.adminStatusA ?? "").trim() === "0") {
    logger.warn(SCOPE, "staff login refused — deactivated", { adminID: row.adminID });
    return { ok: false };
  }

  // Floor-staff only — refuse office/privileged codes (provision via /admin/admins).
  const role = mapLegacyStaffRole(row.adminStatus);
  if (!role) {
    logger.warn(SCOPE, "staff login refused — non-floor role (not auto-bridgeable)", {
      adminID: row.adminID,
      adminStatus: row.adminStatus,
    });
    return { ok: false };
  }

  if (!verifyLegacyPassword(password, row.adminPass)) {
    return { ok: false };
  }

  // Password verified against the legacy passTam hash → provision a Supabase
  // user with that same plaintext. Always the synthetic STAFF email (never the
  // phone — staff phones may collide with a customer auth row, same trap the
  // customer bridge documents).
  const credentialEmail = legacySyntheticAdminEmail(row.adminID);

  const e164 = normalizePhone(row.adminTel ?? "");
  if (!isUsablePhone(e164)) {
    logger.debug(SCOPE, "legacy staff has no usable phone — profile phone stays empty", {
      adminID: row.adminID,
      adminTel: redactPhone(row.adminTel),
    });
  }

  const admin = createAdminClient();
  const { data: createData, error: createErr } = await admin.auth.admin.createUser({
    email: credentialEmail,
    password,
    email_confirm: true,
    user_metadata: {
      legacy_admin_id: row.adminID,
      first_name: row.adminName,
      last_name: row.adminLastName,
      legacy_provisioned: true,
      legacy_staff_role: role,
    },
  });

  // Edge case: the synthetic email already exists but its password isn't the one
  // just typed (e.g. a half-provisioned row). Find the existing auth user via the
  // admin_contact_extras bridge (legacy_admin_id → profile_id = auth uid) and
  // force-set the verified password. (Normal repeat logins go through native
  // auth and never reach this bridge, so this path is rare.)
  if (createErr && !createData?.user) {
    logger.debug(SCOPE, "createUser failed — existing staff auth, syncing password", {
      adminID: row.adminID,
      reason: createErr.message,
    });
    const { data: extras, error: extrasErr } = await admin
      .from("admin_contact_extras")
      .select("profile_id")
      .eq("legacy_admin_id", row.adminID)
      .maybeSingle<{ profile_id: string }>();
    if (extrasErr || !extras?.profile_id) {
      logger.warn(SCOPE, "createUser said email exists but no extras row maps to this adminID", {
        adminID: row.adminID,
        reason: extrasErr?.message,
      });
      return { ok: false };
    }
    const { error: updErr } = await admin.auth.admin.updateUserById(extras.profile_id, {
      password,
      user_metadata: {
        legacy_admin_id: row.adminID,
        first_name: row.adminName,
        last_name: row.adminLastName,
        legacy_provisioned: true,
        legacy_staff_role: role,
      },
    });
    if (updErr) {
      logger.warn(SCOPE, "password sync to existing staff auth user failed", {
        adminID: row.adminID,
        reason: updErr.message,
      });
      return { ok: false };
    }
  }

  const supabase = await createClient();
  const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
    email: credentialEmail,
    password,
  });
  if (signInErr || !signInData.user) {
    logger.warn(SCOPE, "staff bridge sign-in failed after provisioning", {
      adminID: row.adminID,
      errCode: signInErr?.code,
      errMessage: signInErr?.message,
    });
    return { ok: false };
  }

  // Provision profile + admins-role + extras bridge (idempotent — no-op on repeat).
  await ensureLegacyStaff(signInData.user.id, row, role);

  logger.info(SCOPE, "legacy staff signed in via PCS admin bridge", { adminID: row.adminID, role });
  return { ok: true };
}

/**
 * Create the `profiles` + `admins` (role) + `admin_contact_extras` rows for a
 * bridged legacy staffer on first login. Idempotent — safe on every login.
 * Mirrors scripts/provision-admins-2026-06-02.mjs steps 2-4 (minus tb_admin,
 * which already exists from the Phase-A load). Never throws — the staffer is
 * already authenticated; a provisioning miss logs loud but doesn't block login.
 */
async function ensureLegacyStaff(
  authUserId: string,
  row: LegacyAdmin,
  role: Extract<AdminRole, "warehouse" | "driver">,
): Promise<void> {
  const admin = createAdminClient();

  // profiles (member_code auto-assigned by trigger). Phone omitted to dodge the
  // customer-phone-collision trap; the real number stays on tb_admin.adminTel.
  const { data: existingProfile, error: existingErr } = await admin
    .from("profiles")
    .select("id")
    .eq("id", authUserId)
    .maybeSingle<{ id: string }>();
  if (existingErr) {
    console.error(`[admin-bridge profiles read] failed`, { code: existingErr.code, message: existingErr.message });
  }
  if (!existingProfile) {
    const { error: profErr } = await admin.from("profiles").insert({
      id: authUserId,
      email: row.adminEmail || null,
      first_name: row.adminName,
      last_name: row.adminLastName,
      account_type: "personal",
      status: "active",
      is_active: true,
      register_with: "email",
    });
    if (profErr) {
      logger.warn(SCOPE, "staff profile provisioning failed", { adminID: row.adminID, reason: profErr.message });
    }
  }

  // admins role grant (UPSERT — idempotent on (profile_id, role)).
  const { error: roleErr } = await admin
    .from("admins")
    .upsert(
      { profile_id: authUserId, role, is_active: true, granted_at: new Date().toISOString() },
      { onConflict: "profile_id,role" },
    );
  if (roleErr) {
    logger.warn(SCOPE, "staff admins-role grant failed", { adminID: row.adminID, role, reason: roleErr.message });
  }

  // admin_contact_extras — the legacy_admin_id ↔ profile_id bridge (so the
  // staffer's actions resolve back to their legacy adminID, and rep/handler
  // lookups work). UPSERT on profile_id.
  const { error: extrasErr } = await admin
    .from("admin_contact_extras")
    .upsert(
      {
        profile_id: authUserId,
        display_name: row.adminNickname || row.adminName,
        nickname: row.adminNickname,
        company: "pacred",
        employee_type: "full_time",
        legacy_admin_id: row.adminID,
      },
      { onConflict: "profile_id" },
    );
  if (extrasErr) {
    logger.warn(SCOPE, "staff extras bridge upsert failed", { adminID: row.adminID, reason: extrasErr.message });
  }
}
