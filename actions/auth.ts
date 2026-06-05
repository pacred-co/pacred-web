"use server";

/**
 * Auth server actions — sign in / sign out / register (personal + juristic 3-step).
 *
 * All mutations enforce input validation (Zod) and use service-role admin client
 * only when bypassing RLS is required (creating users, OTP lookups).
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bridgeLegacyLogin } from "@/lib/auth/pcs-legacy-bridge";
import { bridgeLegacyAdminLogin } from "@/lib/auth/pcs-legacy-admin-bridge";
import { legacySyntheticEmail } from "@/lib/auth/pcs-legacy-password";
import { detectIdentifier, normalizePhone } from "@/lib/utils/phone";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { verifyHcaptcha } from "@/lib/hcaptcha";
import {
  confirmResetByPhoneSchema,
  juristicStep2Schema,
  registerJuristicStep1Schema,
  registerPersonalSchema,
  resetByEmailSchema,
  resetByPhoneSchema,
  signInSchema,
  updatePasswordSchema,
  type ConfirmResetByPhoneInput,
  type JuristicStep2Input,
  type RegisterJuristicStep1Input,
  type RegisterPersonalInput,
  type SignInInput,
} from "@/lib/validators/auth";
import { requestOtp, verifyOtp } from "./otp";
import { logger } from "@/lib/logger";
import {
  insertLegacyTbUserRow,
  findLegacyUserIdByPhone,
  upsertLegacyCorporate,
} from "@/lib/auth/legacy-bridge-tb-users";
import { getSalesRepContactForUserid } from "@/lib/admin/sales-rep-contact";

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string; retryAfterSeconds?: number };

/**
 * Payload for the register success popup (2026-06-02). After a signup commits,
 * the customer is shown their minted member code + the sales rep who now owns
 * them (round-robin · lib/admin/assign-sales-rep.ts → tb_users.adminIDSale)
 * so "ทีมงานจะติดต่อกลับ" is concrete, not abstract.
 */
export type RegisterSuccess = {
  /** Minted member code, e.g. `PR12345`. */
  memberCode: string;
  /** Assigned sales rep display name (or Pacred CS fallback). */
  repName: string;
  /** Assigned sales rep phone — display form (or Pacred CS fallback). */
  repPhone: string;
};

/**
 * Resolve the register success-popup payload for a freshly-committed member
 * code. The sales rep is read back from `tb_users.adminIDSale` (written by the
 * round-robin in insertLegacyTbUserRow) → tb_admin via
 * getSalesRepContactForUserid, which already falls back to Pacred CS when no
 * rep is on file. Best-effort: never throws — a lookup hiccup just yields the
 * CS fallback contact so the popup still renders (the signup already succeeded).
 */
async function buildRegisterSuccess(memberCode: string): Promise<RegisterSuccess> {
  const rep = await getSalesRepContactForUserid(memberCode);
  return {
    memberCode,
    repName:  rep.name,
    repPhone: rep.phoneDisplay,
  };
}

// ─────────────────────────────────────────────────────────────
// Sign In
// ─────────────────────────────────────────────────────────────
export async function signIn(input: SignInInput): Promise<ActionResult<{ isAdmin: boolean }>> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }

  // D-12-wire: rate-limit login attempts per IP (10/h) — credential-stuffing defense
  const ip = getClientIpFromHeaders(await headers());
  const blocked = await checkRateLimit("login", ip);
  if (blocked) return blocked;

  const { identifier, password } = parsed.data;
  const kind = detectIdentifier(identifier);
  const supabase = await createClient();

  let resolvedEmail: string | null = null;
  let resolvedPhone: string | null = null;

  const idTrim = identifier.trim();
  // Staff shorthand (owner 2026-06-06): a bare provisioned-admin username
  // ("admin_may") resolves to its Pacred email, so staff don't have to type
  // the full "@pacred.co.th". The office admins were provisioned as
  // admin_<name>@pacred.co.th (see /admin/admins). Only the admin_* shape
  // qualifies — `detectIdentifier` returns "phone" for it; customers
  // (email / phone / PR-code) are untouched, and a non-existent admin_* email
  // simply misses native signin and falls through to the bridges below.
  if (kind !== "email" && /^admin_[a-z0-9_]+$/i.test(idTrim)) {
    resolvedEmail = `${idTrim.toLowerCase()}@pacred.co.th`;
  } else if (kind === "email") {
    resolvedEmail = identifier.trim();
  } else if (kind === "memberCode") {
    // Look up the profile by member_code via admin client (bypass RLS — pre-auth).
    // We pull migrated_from_pcs so we can route migrated customers through the
    // synthetic legacy email — bypassing the phone-collision trap where two
    // profiles share a phone (e.g. legacy PR321 + admin PR132 both
    // +66948782006). If we resolved `phone` here for a migrated customer,
    // Supabase's phone-based signInWithPassword would lock onto whichever
    // auth.users row happens to carry that phone (the staff/test account,
    // not the legacy customer) and sign in as the wrong identity.
    const admin = createAdminClient();
    const code = identifier.toUpperCase();
    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("phone, email, migrated_from_pcs")
      .eq("member_code", code)
      .maybeSingle<{
        phone: string | null;
        email: string | null;
        migrated_from_pcs: boolean;
      }>();
    if (profileErr) {
      console.error(`[profiles list] failed`, { code: profileErr.code, message: profileErr.message });
    }

    if (profile?.migrated_from_pcs) {
      // Migrated PCS customer — auth.users was provisioned with the synthetic
      // email + (typically) no phone. Always resolve to the synthetic email
      // so native signIn finds THIS customer's auth row, never a colliding
      // staff/test row.
      resolvedEmail = legacySyntheticEmail(code);
    } else if (profile) {
      // Pacred-web-native customer — phone or own email is the credential.
      resolvedPhone = profile.phone;
      resolvedEmail = profile.email;
    } else {
      // No profile row yet — could be a tb_users-only legacy customer that
      // hasn't been first-login-bridged yet. Synthesize the email anyway:
      // if `code` matches a tb_users.userid the bridge will resolve below;
      // if it doesn't, both native + bridge return invalid_credentials.
      resolvedEmail = legacySyntheticEmail(code);
    }
  } else {
    resolvedPhone = normalizePhone(identifier);
  }

  // 1. Native Supabase auth — Pacred-native customers, plus migrated customers
  // who already bridged once (every later login is plain Supabase auth).
  let nativeOk = false;
  if (resolvedPhone) {
    const { error } = await supabase.auth.signInWithPassword({ phone: resolvedPhone, password });
    nativeOk = !error;
  } else if (resolvedEmail) {
    const { error } = await supabase.auth.signInWithPassword({ email: resolvedEmail, password });
    nativeOk = !error;
  }

  // 2. Legacy PCS bridge (B-auth / ADR-0017) — a migrated customer's FIRST
  // login: verify the legacy passTam hash against tb_users, provision the
  // Supabase user with the password just typed, and set the session. A safe
  // no-op (ok:false) when there is no tb_users match — including before the
  // Phase-A legacy data load. Provisional pending ก๊อต Q2 ratification.
  if (!nativeOk) {
    const bridged = await bridgeLegacyLogin(identifier, password);
    if (!bridged.ok) {
      // 3. Legacy PCS STAFF bridge (2026-06-05 · owner directive) — the shared
      // warehouse/transport crew (พนักงานโกดัง / คนขับรถ / เด็กรถ) first login:
      // verify the typed password against the legacy tb_admin.adminPass (same
      // passTam hash) + provision auth+profile+admins-role. Role is grounded in
      // tb_admin.adminStatus ('6'→warehouse, '7'→driver); office/privileged
      // codes are refused (provision via /admin/admins). ADDITIVE — only runs
      // when native + the customer bridge both miss, so it cannot affect any
      // existing login. NOT click-tested on prod — verify with one staff login.
      const staffBridged = await bridgeLegacyAdminLogin(identifier, password);
      if (!staffBridged.ok) return { ok: false, error: "invalid_credentials" };
    }
  }

  // Check if admin to return correct redirect target
  // (queries admins table — RBAC approach replaced legacy profiles.role)
  const supabase2 = await createClient();
  const { data: { user: signedInUser } } = await supabase2.auth.getUser();
  let isAdmin = false;
  if (signedInUser) {
    const { data: adminRows, error: adminRowsErr } = await supabase2
      .from("admins")
      .select("role")
      .eq("profile_id", signedInUser.id)
      .eq("is_active", true)
      .limit(1);
    if (adminRowsErr) {
      console.error(`[admins list] failed`, { code: adminRowsErr.code, message: adminRowsErr.message });
    }
    isAdmin = (adminRows?.length ?? 0) > 0;
  }

  return { ok: true, data: { isAdmin } };
}

// ─────────────────────────────────────────────────────────────
// Sign Out
// ─────────────────────────────────────────────────────────────
export async function signOutAction(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

// ─────────────────────────────────────────────────────────────
// Register — Personal
// ─────────────────────────────────────────────────────────────
export async function registerPersonal(
  input: RegisterPersonalInput,
): Promise<ActionResult<RegisterSuccess>> {
  const parsed = registerPersonalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const data = parsed.data;

  // D-12-wire: rate-limit signup per IP (5/h) — D-13-wire: hCaptcha invisible
  const ip = getClientIpFromHeaders(await headers());
  const blocked = await checkRateLimit("signup", ip);
  if (blocked) return blocked;

  const captcha = await verifyHcaptcha(data.captchaToken, ip);
  if (!captcha.success) return { ok: false, error: "captcha_failed" };

  const phone = normalizePhone(data.phone);

  // Verify OTP (bypassed if OTP_BYPASS=true)
  const otpOk = await verifyOtp(phone, data.otp, "register");
  if (!otpOk) return { ok: false, error: "invalid_otp" };

  const admin = createAdminClient();

  // Identity guard (เดฟ 2026-05-30) — block re-registration when the phone
  // already belongs to an existing customer. Re-registering mints a parallel
  // orphan identity (new profiles row disconnected from the customer's real
  // tb_users account — the PR005 case). D1 rule: existing customers sign in
  // with their existing password (legacy PCS bridge), they don't re-register.
  const existingUserId = await findLegacyUserIdByPhone(admin, phone);
  if (existingUserId) {
    logger.info("auth", "registerPersonal blocked — phone already registered", { existingUserID: existingUserId });
    // Surface the existing member code so the UI can tell the customer
    // "เบอร์นี้มีรหัสอยู่แล้ว: PRxxx". Safe to reveal — the OTP above proved
    // they own this phone (so it's their own code, not an enumeration leak).
    return { ok: false, error: `phone_exists:${existingUserId}` };
  }

  // Create auth user (skip provider's own SMS — we already verified ourselves)
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    phone,
    password: data.password,
    phone_confirm: true,
    email: data.email && data.email.length > 0 ? data.email : undefined,
    email_confirm: !!(data.email && data.email.length > 0),
    user_metadata: {
      first_name: data.firstName,
      last_name: data.lastName,
    },
  });
  if (createErr || !created.user) {
    return { ok: false, error: createErr?.message ?? "signup_failed" };
  }

  // Insert profile (admin bypasses RLS, member_code auto-generated by trigger).
  // `customer_group` only set when ?recom URL param was present on /register
  // — legacy parity for regis-tam.php affiliate signup (THADA.VIP / SIN.VIP /
  // OOAEOM.VIP / SWAN). When absent, the column default 'PR' applies.
  //
  // `shop_user` — legacy <select name="shopUser"> on register.php:
  //   "1" = ซื้อไปใช้เอง (use-self) → false
  //   "2" = ซื้อไปขาย   (resell)   → true
  // (`tb_users.shopuser` column comment in 0081 schema: '1=ซื้อไปใข้เอง'.)
  // Migrates onto profiles.shop_user (boolean, default false — 0003).
  const { data: profileRow, error: profileErr } = await admin
    .from("profiles")
    .insert({
      id: created.user.id,
      account_type: "personal",
      first_name: data.firstName,
      last_name: data.lastName,
      phone,
      email: data.email && data.email.length > 0 ? data.email : null,
      services: data.services,
      how_know: data.howKnow ?? null,
      ...(data.recom ? { customer_group: data.recom } : {}),
      ...(data.shopUser ? { shop_user: data.shopUser === "2" } : {}),
      status: "active",
    })
    .select("member_code")
    .single<{ member_code: string | null }>();
  if (profileErr) {
    // EMERGENCY 2026-05-23 — surface the real reason in Vercel logs (was
    // swallowed as the opaque "profile_failed") + DELETE the orphan
    // auth.user so the customer can retry with the same phone instead of
    // hitting "phone already registered" forever (the bug in the screenshot
    // — auth.admin.createUser succeeded but profile insert failed,
    // leaving the user half-registered).
    console.error("[auth/registerPersonal] profile insert failed:", {
      message: profileErr.message,
      code:    profileErr.code,
      details: profileErr.details,
      hint:    profileErr.hint,
    });
    const { error: delErr } = await admin.auth.admin.deleteUser(created.user.id);
    if (delErr) {
      console.error("[auth/registerPersonal] orphan auth.user cleanup failed:", delErr);
    }
    return { ok: false, error: "profile_failed" };
  }

  // E2E loop fix · Agent F1 · 2026-05-29 (Gap #1) — mirror the new
  // customer into legacy `tb_users` with userActive='0' so the admin
  // approval queue (/admin/customers/pending) sees them. Without this,
  // every Pacred-native signup was invisible to ops + never approved +
  // never auto-assigned a sales rep. Best-effort: a failure here logs
  // loud but does NOT roll back the profile (the customer is already
  // signed up + can use the app; ops can manually backfill via SQL).
  if (profileRow?.member_code) {
    await insertLegacyTbUserRow(admin, {
      memberCode:  profileRow.member_code,
      phone,
      email:       data.email && data.email.length > 0 ? data.email : null,
      accountType: "personal",
      firstName:   data.firstName,
      lastName:    data.lastName,
    });
  } else {
    logger.error(
      "auth",
      "registerPersonal: profile insert returned no member_code — skipping tb_users bridge",
      undefined,
      { userId: created.user.id },
    );
  }

  // Sign in to set session cookies
  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    phone,
    password: data.password,
  });
  if (signInErr) return { ok: false, error: "signin_failed" };

  // 2026-06-02 — return the success-popup payload (member code + assigned
  // sales rep) so the client shows "สมัครสำเร็จ · รหัสสมาชิก PRxxx · เซลที่ดูแล …"
  // instead of bouncing straight to /dashboard. The rep was written into
  // tb_users.adminIDSale by the bridge above (round-robin); we read it back.
  if (profileRow?.member_code) {
    return { ok: true, data: await buildRegisterSuccess(profileRow.member_code) };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// Register — Juristic Step 1 (creates user + incomplete profile)
// ─────────────────────────────────────────────────────────────
export async function registerJuristicStep1(
  input: RegisterJuristicStep1Input,
): Promise<ActionResult> {
  const parsed = registerJuristicStep1Schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const data = parsed.data;

  // D-12-wire: rate-limit signup per IP — D-13-wire: hCaptcha invisible
  const ip = getClientIpFromHeaders(await headers());
  const blocked = await checkRateLimit("signup", ip);
  if (blocked) return blocked;

  const captcha = await verifyHcaptcha(data.captchaToken, ip);
  if (!captcha.success) return { ok: false, error: "captcha_failed" };

  const phone = normalizePhone(data.phone);

  const otpOk = await verifyOtp(phone, data.otp, "register");
  if (!otpOk) return { ok: false, error: "invalid_otp" };

  const admin = createAdminClient();

  // Identity guard (เดฟ 2026-05-30) — block juristic re-registration when the
  // phone already belongs to an existing customer. Otherwise a profiles +
  // corporate row is minted disconnected from the customer's real tb_users
  // identity (the PR005 orphan case: phone owned by PR9370, signup created a
  // parallel PR005). Existing customers log in with their existing password.
  const existingUserId = await findLegacyUserIdByPhone(admin, phone);
  if (existingUserId) {
    logger.info("auth", "registerJuristicStep1 blocked — phone already registered", { existingUserID: existingUserId });
    // OTP-gated above → safe to reveal the customer's own code (see registerPersonal).
    return { ok: false, error: `phone_exists:${existingUserId}` };
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    phone,
    password: data.password,
    phone_confirm: true,
  });
  if (createErr || !created.user) {
    return { ok: false, error: createErr?.message ?? "signup_failed" };
  }

  // `customer_group` only set when ?recom URL param was present on /register
  // — legacy parity for regis-tam.php affiliate signup. Default 'PR' otherwise.
  //
  // `shop_user` — legacy <select name="shopUser"> on register.php (see
  // registerPersonal above for the "1"/"2" → boolean mapping).
  const { data: profileRow, error: profileErr } = await admin
    .from("profiles")
    .insert({
      id: created.user.id,
      account_type: "juristic",
      phone,
      services: data.services,
      how_know: data.howKnow ?? null,
      ...(data.recom ? { customer_group: data.recom } : {}),
      ...(data.shopUser ? { shop_user: data.shopUser === "2" } : {}),
      status: "incomplete",
    })
    .select("member_code")
    .single<{ member_code: string | null }>();
  if (profileErr) {
    // EMERGENCY 2026-05-23 — same handling as registerPersonal: surface
    // the reason in Vercel logs + delete the orphan auth.user.
    console.error("[auth/registerJuristicStep1] profile insert failed:", {
      message: profileErr.message,
      code:    profileErr.code,
      details: profileErr.details,
      hint:    profileErr.hint,
    });
    const { error: delErr } = await admin.auth.admin.deleteUser(created.user.id);
    if (delErr) {
      console.error("[auth/registerJuristicStep1] orphan auth.user cleanup failed:", delErr);
    }
    return { ok: false, error: "profile_failed" };
  }

  // E2E loop fix · Agent F1 · 2026-05-29 (Gap #1) — mirror new juristic
  // signup into tb_users (userActive='0', userCompany='1'). For juristic
  // step 1 the customer hasn't entered first/last/company name yet
  // (step 2 collects it) — leave userName/userLastName empty for now.
  // Wave-2 follow-up: hydrate userName/userLastName from corporate after
  // step 2 if ops want richer pending-queue rows.
  if (profileRow?.member_code) {
    await insertLegacyTbUserRow(admin, {
      memberCode:  profileRow.member_code,
      phone,
      email:       null,
      accountType: "juristic",
      firstName:   null,
      lastName:    null,
    });
  } else {
    logger.error(
      "auth",
      "registerJuristicStep1: profile insert returned no member_code — skipping tb_users bridge",
      undefined,
      { userId: created.user.id },
    );
  }

  // Sign in (session needed for step 2/3 since they use server client + RLS)
  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    phone,
    password: data.password,
  });
  if (signInErr) return { ok: false, error: "signin_failed" };

  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// Register — Juristic Step 2 (update company info)
// ─────────────────────────────────────────────────────────────
export async function saveJuristicStep2(
  input: JuristicStep2Input,
): Promise<ActionResult> {
  const parsed = juristicStep2Schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const data = parsed.data;

  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
  if (!user) return { ok: false, error: "not_signed_in" };

  // Company details are canonical in `corporate` (read by /profile, both
  // receipt pages, and tax-invoice eligibility) — writing profiles.* only
  // left `corporate` empty and broke juristic tax-invoice eligibility.
  const companyAddress = [
    data.addressLine,
    data.subdistrict,
    data.district,
    data.province,
    data.postcode,
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");

  // guard_corporate_account_type needs profiles.account_type='juristic'
  // — set by registerJuristicStep1.
  const { error } = await supabase
    .from("corporate")
    .upsert(
      {
        profile_id:      user.id,
        tax_id:          data.taxId,
        company_name:    data.companyName,
        company_address: companyAddress,
      },
      { onConflict: "profile_id" },
    );
  if (error) return { ok: false, error: "update_failed" };

  // Mirror to profiles for quick lookup (best-effort, matches upsertCorporate).
  await supabase
    .from("profiles")
    .update({ tax_id: data.taxId, company_name: data.companyName })
    .eq("id", user.id);

  // P1-16 (2026-05-30) — ALSO write the LEGACY `tb_corporate` row (keyed by
  // userid = member_code). The rebuilt `corporate` table above is keyed by
  // profile_id UUID and is mostly empty on prod; the legacy admin surfaces +
  // tax-invoice eligibility read `tb_corporate` (keyed by userid). Without
  // this, a Pacred-native juristic customer's company data was a silent
  // dead-write — invisible to ops + never verifiable. Faithful port of
  // check-otp-register.php L101-103 (deferred from the legacy single-step
  // register to here, the moment the corporate data exists).
  //
  // Best-effort: a failure logs loud (inside the helper) but does NOT fail
  // the step-2 save — the customer's auth + profile + rebuilt corporate row
  // are already committed; ops can backfill tb_corporate by hand. Resolve the
  // member_code via the admin client (bypass RLS — profiles is the source of
  // the trigger-minted code).
  const admin = createAdminClient();
  const { data: profileRow, error: profileErr } = await admin
    .from("profiles")
    .select("member_code")
    .eq("id", user.id)
    .maybeSingle<{ member_code: string | null }>();
  if (profileErr) {
    logger.error("auth", "saveJuristicStep2: member_code lookup failed — skipping tb_corporate mirror", profileErr, {
      userId: user.id,
      code: profileErr.code,
    });
  } else if (profileRow?.member_code) {
    await upsertLegacyCorporate(admin, {
      memberCode:       profileRow.member_code,
      corporateNumber:  data.taxId,
      corporateName:    data.companyName,
      corporateAddress: companyAddress,
    });

    // Lane B (2026-06-05) — hydrate tb_users.userName from the company name.
    // Juristic step 1 created the tb_users row with userName="" (the contact
    // name isn't collected at step 1 · see registerJuristicStep1). Without
    // this the admin customer list + pending queue showed a bare "-" for the
    // company (the PR047 bug). Legacy single-step register wrote userName at
    // signup; our 3-step flow only has the company name once step 2 lands, so
    // we backfill it HERE — but ONLY when userName is still empty, so we never
    // clobber a real contact name an admin may have entered. Best-effort: a
    // failure here logs but never fails the step-2 save (corporate already
    // committed). companyName is zod-required (min 1) so it's always non-empty.
    const { data: curUser, error: curUserErr } = await admin
      .from("tb_users")
      .select("userID, userName")
      .eq("userID", profileRow.member_code)
      .maybeSingle<{ userID: string; userName: string | null }>();
    if (curUserErr) {
      logger.warn("auth", "saveJuristicStep2: tb_users name-read failed — skipping userName hydrate", {
        memberCode: profileRow.member_code,
        reason: curUserErr.message,
      });
    } else if (curUser && !(curUser.userName ?? "").trim()) {
      const { error: nameErr } = await admin
        .from("tb_users")
        .update({ userName: data.companyName })
        .eq("userID", profileRow.member_code);
      if (nameErr) {
        logger.warn("auth", "saveJuristicStep2: tb_users userName hydrate failed", {
          memberCode: profileRow.member_code,
          reason: nameErr.message,
        });
      }
    }
  } else {
    logger.error(
      "auth",
      "saveJuristicStep2: no member_code on profile — skipping tb_corporate mirror",
      undefined,
      { userId: user.id },
    );
  }

  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// Register — Juristic Step 3 (upload doc + insert document row)
// ─────────────────────────────────────────────────────────────
const ALLOWED_DOC_TYPES = [
  "company_affidavit",
  "vat",
  "national_id",
] as const;
type DocType = (typeof ALLOWED_DOC_TYPES)[number];

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png"];

export async function uploadJuristicDoc(
  formData: FormData,
): Promise<ActionResult<{ storage_path: string }>> {
  const file = formData.get("file");
  const docType = formData.get("docType") as DocType | null;

  if (!file || !(file instanceof File)) {
    return { ok: false, error: "no_file" };
  }
  if (!docType || !ALLOWED_DOC_TYPES.includes(docType)) {
    return { ok: false, error: "invalid_doc_type" };
  }
  if (file.size > MAX_SIZE) return { ok: false, error: "file_too_large" };
  if (!ALLOWED_MIME.includes(file.type)) {
    return { ok: false, error: "invalid_mime" };
  }

  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
  if (!user) return { ok: false, error: "not_signed_in" };

  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${user.id}/${docType}/${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await supabase.storage
    .from("member-docs")
    .upload(path, buffer, {
      contentType: file.type,
      upsert: true,
    });
  if (uploadErr) {
    // 2026-05-28 — surface the storage error in Vercel logs so we can tell
    // bucket-policy vs not-signed-in vs RLS-deny apart when a juristic
    // step-3 user reports "won't proceed". Without this the client only
    // sees ERR.upload_failed = "อัปโหลดไฟล์ไม่สำเร็จ", which is too generic
    // to diagnose remotely.
    logger.error("auth", "juristic-upload storage failed", uploadErr, {
      userId: user.id,
      docType,
      mime: file.type,
      size: file.size,
    });
    return { ok: false, error: "upload_failed" };
  }

  const { error: insertErr } = await supabase.from("documents").insert({
    profile_id: user.id,
    doc_type: docType,
    storage_path: path,
    mime_type: file.type,
    size_bytes: file.size,
  });
  if (insertErr) {
    logger.error("auth", "juristic-upload doc-record insert failed", insertErr, {
      userId: user.id,
      docType,
      code: insertErr.code,
    });
    return { ok: false, error: "doc_record_failed" };
  }

  return { ok: true, data: { storage_path: path } };
}

export async function completeJuristicRegistration(): Promise<ActionResult<RegisterSuccess>> {
  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
  if (!user) return { ok: false, error: "not_signed_in" };

  // Flip status=active AND read back the minted member_code (the user owns
  // their own profiles row via RLS) so we can build the success popup
  // (2026-06-02). The sales rep was assigned at step 1 (insertLegacyTbUserRow
  // round-robin → tb_users.adminIDSale); we resolve it now for the popup.
  const { data: updated, error } = await supabase
    .from("profiles")
    .update({ status: "active" })
    .eq("id", user.id)
    .select("member_code")
    .maybeSingle<{ member_code: string | null }>();
  if (error) {
    logger.error("auth", "juristic-complete profiles status=active failed", error, {
      userId: user.id,
      code: error.code,
    });
    return { ok: false, error: "update_failed" };
  }

  if (updated?.member_code) {
    return { ok: true, data: await buildRegisterSuccess(updated.member_code) };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// PASSWORD RESET — Phone OTP path (P-2)
// ─────────────────────────────────────────────────────────────
// Two-step: request OTP, then verify+set-new-password. We never reveal
// whether the phone is registered (account enumeration defense) — the
// first step always returns ok even if no profile matches.
export async function requestPasswordResetByPhone(
  phoneRaw: string,
  captchaToken?: string | null,
): Promise<ActionResult<{ bypass?: boolean }>> {
  const parsed = resetByPhoneSchema.safeParse({ phone: phoneRaw, captchaToken });
  if (!parsed.success) {
    return { ok: false, error: "invalid_phone" };
  }

  // D-12-wire: rate-limit password-reset per IP (5/h) — D-13-wire: CAPTCHA
  // anti-enumeration. Run BEFORE the silent-ok branch below so attackers
  // can't probe the phone db without paying the rate-limit cost.
  const ip = getClientIpFromHeaders(await headers());
  const blocked = await checkRateLimit("passwordReset", ip);
  if (blocked) return blocked;

  const captcha = await verifyHcaptcha(captchaToken ?? parsed.data.captchaToken, ip);
  if (!captcha.success) return { ok: false, error: "captcha_failed" };

  const phone = normalizePhone(parsed.data.phone);

  const admin = createAdminClient();
  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("id")
    .eq("phone", phone)
    .maybeSingle<{ id: string }>();
  if (profileErr) {
    console.error(`[profiles list] failed`, { code: profileErr.code, message: profileErr.message });
  }

  // Silent ok for unknown phone — don't leak existence
  if (!profile) return { ok: true };

  const res = await requestOtp(phone, "reset");
  if (!res.ok) return { ok: false, error: res.error };

  // 2026-05-25 — when `EMERGENCY_OTP_BYPASS` (actions/otp.ts:42) is ON,
  // `requestOtp` returns `bypass:true` without sending an SMS. Without
  // forwarding that flag the customer sees the "ใส่รหัส OTP" step + waits
  // forever for an SMS that never comes (the bypass mode was wired into
  // the register UI but not the forgot-password UI). Forward the flag
  // so the UI can skip directly to the "set new password" step + accept
  // any 6-digit placeholder (verifyOtp short-circuits to true in bypass).
  return { ok: true, data: { bypass: res.bypass } };
}

export async function confirmPasswordResetByPhone(
  input: ConfirmResetByPhoneInput,
): Promise<ActionResult> {
  const parsed = confirmResetByPhoneSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;
  const phone = normalizePhone(d.phone);

  // S-3 — IP rate-limit this OTP-confirm step. requestPasswordResetByPhone is
  // rate-limited but this confirm step (it sets the new password) was not — a
  // 6-digit reset OTP is brute-forceable without an IP-level ceiling.
  const ip = getClientIpFromHeaders(await headers());
  const blocked = await checkRateLimit("otpVerify", ip);
  if (blocked) return blocked;

  const otpOk = await verifyOtp(phone, d.otp, "reset");
  if (!otpOk) return { ok: false, error: "invalid_otp" };

  const admin = createAdminClient();
  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("id")
    .eq("phone", phone)
    .maybeSingle<{ id: string }>();

  if (profileErr) {
    console.error(`[profiles mutation lookup] failed`, { code: profileErr.code, message: profileErr.message });
    return { ok: false, error: `db_error:${profileErr.code ?? "unknown"}` };
  }
  if (!profile) return { ok: false, error: "user_not_found" };

  const { error: updErr } = await admin.auth.admin.updateUserById(profile.id, {
    password: d.password,
  });
  if (updErr) return { ok: false, error: "update_failed" };

  // Sign in with the new password so user lands authenticated
  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    phone,
    password: d.password,
  });
  if (signInErr) return { ok: false, error: "signin_failed" };

  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// PASSWORD RESET — Email magic link path (P-2)
// ─────────────────────────────────────────────────────────────
// Supabase sends the email; link redirects through /auth/callback
// (handles PKCE exchange) and then to /reset-password where the user
// completes the flow. Requires SMTP configured on Supabase project.
export async function requestPasswordResetByEmail(
  emailRaw: string,
  captchaToken?: string | null,
): Promise<ActionResult> {
  const parsed = resetByEmailSchema.safeParse({ email: emailRaw, captchaToken });
  if (!parsed.success) {
    return { ok: false, error: "invalid_email" };
  }

  // D-12-wire + D-13-wire — same defenses as the phone variant
  const ip = getClientIpFromHeaders(await headers());
  const blocked = await checkRateLimit("passwordReset", ip);
  if (blocked) return blocked;

  const captcha = await verifyHcaptcha(captchaToken ?? parsed.data.captchaToken, ip);
  if (!captcha.success) return { ok: false, error: "captcha_failed" };

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
  });

  // Supabase doesn't surface "email not found" — it silently succeeds, which
  // is also what we want for enumeration defense. Treat any error as transient.
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Called from /reset-password form after the user lands via magic link
// (session is already set by the /auth/callback exchange).
export async function updatePasswordAfterRecovery(
  newPassword: string,
): Promise<ActionResult> {
  const parsed = updatePasswordSchema.safeParse({ password: newPassword });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_password" };
  }

  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
  if (!user) return { ok: false, error: "not_signed_in" };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// OAuth
// ─────────────────────────────────────────────────────────────
export async function signInWithOAuth(
  provider: "google" | "facebook",
): Promise<ActionResult<{ url: string }>> {
  // Social login is gated behind NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED. The login
  // page hides the buttons when off; this enforces the same gate server-side
  // so a direct server-action call can't bypass it.
  if (process.env.NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED !== "true") {
    return { ok: false, error: "oauth_disabled" };
  }
  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${siteUrl}/auth/callback`,
    },
  });

  if (error || !data.url) return { ok: false, error: error?.message ?? "oauth_failed" };
  return { ok: true, data: { url: data.url } };
}
