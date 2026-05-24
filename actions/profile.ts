"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTosVersion } from "@/lib/tos-server";
import {
  profileBasicSchema,
  corporateSchema,
  notifyChannelsSchema,
  completeProfileSchema,
  type ProfileBasicInput,
  type CorporateInput,
  type NotifyChannels,
  type CompleteProfileInput,
} from "@/lib/validators/profile";
import {
  checkEmailAvailabilitySchema,
  checkPhoneAvailabilitySchema,
  type CheckEmailAvailabilityInput,
  type CheckPhoneAvailabilityInput,
} from "@/lib/validators/auth";
import { normalizePhone } from "@/lib/utils/phone";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { assertNotImpersonating } from "@/lib/auth/impersonation";

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

// ────────────────────────────────────────────────────────────
// PROFILE — basic fields (personal + juristic share these)
// ────────────────────────────────────────────────────────────
export async function updateProfileBasic(
  input: ProfileBasicInput,
): Promise<ActionResult> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const parsed = profileBasicSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const { error } = await supabase
    .from("profiles")
    .update({
      first_name:     d.first_name,
      last_name:      d.last_name,
      phone:          d.phone,
      email:          d.email ?? null,
      sex:            d.sex ?? null,
      birthday:       d.birthday ?? null,
      line_id:        d.line_id ?? null,
      facebook_url:   d.facebook_url ?? null,
      freight_type:   d.freight_type ?? null,
      pay_method:     d.pay_method ?? null,
      transport_type: d.transport_type ?? null,
      ship_by:        d.ship_by ?? null,
      shop_user:      d.shop_user ?? false,
      note:           d.note ?? null,
    })
    .eq("id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/profile");
  revalidatePath("/dashboard");
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// CORPORATE — upsert juristic company details
// ────────────────────────────────────────────────────────────
export async function upsertCorporate(
  input: CorporateInput,
): Promise<ActionResult> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const parsed = corporateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // Guard at app layer too: corporate row requires account_type='juristic'
  const { data: profile } = await supabase
    .from("profiles")
    .select("account_type")
    .eq("id", user.id)
    .maybeSingle<{ account_type: "personal" | "juristic" }>();

  if (!profile || profile.account_type !== "juristic") {
    return { ok: false, error: "account_not_juristic" };
  }

  const { error } = await supabase
    .from("corporate")
    .upsert(
      {
        profile_id:      user.id,
        tax_id:          d.tax_id,
        company_name:    d.company_name,
        company_address: d.company_address,
        // status stays 'pending' on insert; never overwrite verified→pending here
      },
      { onConflict: "profile_id", ignoreDuplicates: false },
    );

  if (error) return { ok: false, error: error.message };

  // also mirror tax_id + company_name onto profiles for quick lookup
  await supabase
    .from("profiles")
    .update({ tax_id: d.tax_id, company_name: d.company_name })
    .eq("id", user.id);

  revalidatePath("/profile");
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// NOTIFY CHANNELS — toggle line / email
// ────────────────────────────────────────────────────────────
export async function updateNotifyChannels(
  input: NotifyChannels,
): Promise<ActionResult> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const parsed = notifyChannelsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const { error } = await supabase
    .from("profiles")
    .update({ notify_channels: parsed.data })
    .eq("id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/profile");
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// AVATAR — set avatar_url after client-side upload to 'avatars' bucket
// ────────────────────────────────────────────────────────────
export async function updateAvatar(publicUrl: string): Promise<ActionResult> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  if (!publicUrl || publicUrl.length > 500) {
    return { ok: false, error: "invalid_url" };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl })
    .eq("id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/profile");
  revalidatePath("/dashboard");
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// COMPLETE PROFILE (P-1) — first-time OAuth user finishing signup.
// Folds TOS acceptance into the same write so completion is atomic
// and the (protected) layout doesn't immediately re-prompt with TosGate.
// ────────────────────────────────────────────────────────────
export async function completeProfile(
  input: CompleteProfileInput,
): Promise<ActionResult> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const parsed = completeProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const { data: existing } = await supabase
    .from("profiles")
    .select("status, account_type")
    .eq("id", user.id)
    .maybeSingle<{ status: "incomplete" | "active" | "suspended"; account_type: "personal" | "juristic" }>();

  if (!existing) return { ok: false, error: "profile_not_found" };
  if (existing.status === "suspended") return { ok: false, error: "account_suspended" };
  // Juristic must use the 3-step register flow — guard at server even if
  // the page redirects them client-side.
  if (existing.account_type === "juristic") {
    return { ok: false, error: "juristic_use_register_flow" };
  }

  // V-G4.1 — accept the currently-active TOS version (DB-driven with
  // hardcoded fallback). Same behavior as TOS gate.
  const activeTos = await getActiveTosVersion("all");
  const { error } = await supabase
    .from("profiles")
    .update({
      first_name:           d.first_name,
      last_name:            d.last_name,
      phone:                d.phone,
      sex:                  d.sex ?? null,
      birthday:             d.birthday ?? null,
      tos_accepted_version: activeTos.version_no,
      tos_accepted_at:      new Date().toISOString(),
      status:               "active",
    })
    .eq("id", user.id);

  if (error) {
    if (error.message?.includes("schema cache") || error.message?.includes("tos_accepted")) {
      return { ok: false, error: "ระบบยังไม่พร้อม — โปรดให้แอดมินรัน migration 0006_tos_acceptance.sql ก่อน" };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// LINE LINK / UNLINK — populate profiles.line_user_id (D-1-LIFF)
//
// Linking flow: customer opens /liff/link inside LINE OA chat (or browser),
// the LIFF SDK exchanges the LINE login state for a profile { userId, ... },
// the page POSTs userId here, and we persist it on the signed-in Pacred
// profile.  Without this populator, every push to a customer is a silent
// no-op because lib/notifications/index.ts gates `sendLinePush()` on
// profile.line_user_id being non-null.
//
// Uniqueness: profiles_line_user_id_idx (0003_profiles_extended.sql) enforces
// one Pacred profile per LINE userId — re-link from a second Pacred account
// surfaces as `line_already_linked` so we never silently steal it.
// ────────────────────────────────────────────────────────────

// LINE userIds are exactly "U" + 32 lowercase hex chars (33 total).  Reject
// anything else early so we never write garbage from a spoofed client.
const LINE_USER_ID_RE = /^U[0-9a-f]{32}$/;

export async function linkLineAccount(lineUserId: string): Promise<ActionResult> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  if (typeof lineUserId !== "string" || !LINE_USER_ID_RE.test(lineUserId)) {
    return { ok: false, error: "invalid_line_user_id" };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // If this LINE userId is already attached to a *different* Pacred account,
  // fail loud rather than overwriting (the unique index would 23505 anyway,
  // but the lookup gives us a friendlier error string).
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("line_user_id", lineUserId)
    .maybeSingle<{ id: string }>();

  if (existing && existing.id !== user.id) {
    return { ok: false, error: "line_already_linked" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      line_user_id:   lineUserId,
      line_linked_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    // Defensive — race could still trip the unique index between the lookup
    // above and this update.
    if (error.code === "23505") return { ok: false, error: "line_already_linked" };
    return { ok: false, error: error.message };
  }

  revalidatePath("/profile");
  return { ok: true };
}

export async function unlinkLine(): Promise<ActionResult> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const { error } = await supabase
    .from("profiles")
    .update({ line_user_id: null, line_linked_at: null })
    .eq("id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/profile");
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// AVAILABILITY CHECKS (G-2) — register + profile-edit pre-flight.
//
// 1:1 ports of:
//   • member/include/pages/register/checkEmailUser.php
//   • member/include/pages/register/checkTelUser.php
//   • member/include/pages/profile/checkEmailUser.php
//   • member/include/pages/profile/checkTelUser.php
//
// Legacy queried only `tb_users` (the single user table) with `userstatus<>'0'`
// (= not soft-deleted). In the rebuilt era we have TWO sources of truth —
// the migrated legacy `tb_users` table AND the rebuilt-era `profiles` table —
// so this action checks BOTH and reports "taken" if either has the value.
// Service-role admin client is required because `tb_users` has no per-row
// RLS for anonymous reads + `profiles` only lets a user read their own row.
//
// In profile-edit context the caller passes `currentUserId` (uuid of the
// signed-in profile) so editing your own profile doesn't flag your own
// existing email/phone as "taken" — matching the legacy `<> $_SESSION[...]`
// guard in `profile/check*User.php`.
//
// IP rate-limit: tries to use the `generic` bucket (30/min/IP) since that's
// the closest preset to the "20/min" requirement and the project owner
// explicitly forbade touching `lib/rate-limit.ts` here. 30/min is still
// tight enough that an enumeration-by-email/phone attacker can't trawl the
// member directory at meaningful speed.
//
// Return shape: `{ available: boolean, reason?: "taken" | "invalid" | "rate_limited" }`.
// `available: true` + no reason = success. `available: false` always has
// a reason so the caller can render the right message.
// ────────────────────────────────────────────────────────────

type AvailabilityResult =
  | { available: true }
  | { available: false; reason: "taken" | "invalid" | "rate_limited"; retryAfterSeconds?: number };

export async function checkEmailAvailability(
  email: string,
  currentUserId?: string,
): Promise<AvailabilityResult> {
  // Zod validates shape (well-formed email, uuid if present). We don't run
  // `assertNotImpersonating` here — read-only lookup is fine while impersonating.
  const input: CheckEmailAvailabilityInput = { email, currentUserId: currentUserId ?? null };
  const parsed = checkEmailAvailabilitySchema.safeParse(input);
  if (!parsed.success) {
    return { available: false, reason: "invalid" };
  }
  const { email: cleanEmail, currentUserId: ownerId } = parsed.data;
  // Lowercase for canonical compare — both legacy and rebuilt-era should
  // really store lowercase, but Postgres collation is case-sensitive so be
  // explicit.
  const needle = cleanEmail.trim().toLowerCase();

  // Rate-limit (G-2 spec: 20/min/IP; using `generic` bucket = 30/min as
  // the closest standing preset — see header comment).
  const ip = getClientIpFromHeaders(await headers());
  const blocked = await checkRateLimit("generic", `email-avail:${ip}`);
  if (blocked) {
    return {
      available:         false,
      reason:            "rate_limited",
      retryAfterSeconds: blocked.retryAfterSeconds,
    };
  }

  const admin = createAdminClient();

  // 1. Rebuilt-era profiles — exclude the caller's own row when editing.
  let profilesQuery = admin
    .from("profiles")
    .select("id")
    .ilike("email", needle)
    .limit(1);
  if (ownerId) profilesQuery = profilesQuery.neq("id", ownerId);
  const { data: profileHit, error: profileErr } = await profilesQuery.maybeSingle<{ id: string }>();
  if (profileErr && profileErr.code !== "PGRST116") {
    // PGRST116 = "no rows" when using .single(); .maybeSingle suppresses it
    // but be defensive. Any other error = treat as available (don't block
    // signup over a transient DB hiccup) but log so we notice in Sentry.
    console.error("[profile/checkEmailAvailability] profiles lookup failed:", profileErr);
  }
  if (profileHit) return { available: false, reason: "taken" };

  // 2. Legacy tb_users — userstatus<>'0' replicates the legacy guard.
  //    Exclude the caller's own legacy row by useremail when in edit mode
  //    (legacy used $_SESSION['userEmail'] for the same purpose). We don't
  //    have a userid <-> profile.id mapping at this layer, so we exclude
  //    by email value rather than by id — equivalent to the legacy semantics.
  let legacyQuery = admin
    .from("tb_users")
    .select("userid")
    .ilike("useremail", needle)
    .neq("userstatus", "0")
    .limit(1);
  if (ownerId) {
    // Look up the caller's own email to exclude their legacy row (if any).
    // Cheap extra query but only on the profile-edit hot path.
    const { data: ownProfile } = await admin
      .from("profiles")
      .select("email")
      .eq("id", ownerId)
      .maybeSingle<{ email: string | null }>();
    if (ownProfile?.email) {
      legacyQuery = legacyQuery.neq("useremail", ownProfile.email);
    }
  }
  const { data: legacyHit, error: legacyErr } = await legacyQuery.maybeSingle<{ userid: string }>();
  if (legacyErr && legacyErr.code !== "PGRST116") {
    console.error("[profile/checkEmailAvailability] tb_users lookup failed:", legacyErr);
  }
  if (legacyHit) return { available: false, reason: "taken" };

  return { available: true };
}

export async function checkPhoneAvailability(
  phone: string,
  currentUserId?: string,
): Promise<AvailabilityResult> {
  const input: CheckPhoneAvailabilityInput = { phone, currentUserId: currentUserId ?? null };
  const parsed = checkPhoneAvailabilitySchema.safeParse(input);
  if (!parsed.success) {
    return { available: false, reason: "invalid" };
  }
  const { phone: rawPhone, currentUserId: ownerId } = parsed.data;

  // Both formats — rebuilt-era profiles.phone stores E.164 (+66...),
  // legacy tb_users.usertel stores Thai-local (0...). normalizePhone gives
  // us E.164; we derive the Thai-local form for the legacy query by
  // stripping `+66` and prefixing `0`.
  const e164  = normalizePhone(rawPhone);
  const local = e164.startsWith("+66") ? "0" + e164.slice(3) : e164;

  // Rate-limit (see checkEmailAvailability header — same bucket choice).
  const ip = getClientIpFromHeaders(await headers());
  const blocked = await checkRateLimit("generic", `phone-avail:${ip}`);
  if (blocked) {
    return {
      available:         false,
      reason:            "rate_limited",
      retryAfterSeconds: blocked.retryAfterSeconds,
    };
  }

  const admin = createAdminClient();

  // 1. Rebuilt-era profiles (E.164 form).
  let profilesQuery = admin
    .from("profiles")
    .select("id")
    .eq("phone", e164)
    .limit(1);
  if (ownerId) profilesQuery = profilesQuery.neq("id", ownerId);
  const { data: profileHit, error: profileErr } = await profilesQuery.maybeSingle<{ id: string }>();
  if (profileErr && profileErr.code !== "PGRST116") {
    console.error("[profile/checkPhoneAvailability] profiles lookup failed:", profileErr);
  }
  if (profileHit) return { available: false, reason: "taken" };

  // 2. Legacy tb_users (Thai-local form, userstatus<>'0' = not deleted).
  let legacyQuery = admin
    .from("tb_users")
    .select("userid")
    .eq("usertel", local)
    .neq("userstatus", "0")
    .limit(1);
  if (ownerId) {
    const { data: ownProfile } = await admin
      .from("profiles")
      .select("phone")
      .eq("id", ownerId)
      .maybeSingle<{ phone: string | null }>();
    if (ownProfile?.phone) {
      const ownLocal = ownProfile.phone.startsWith("+66")
        ? "0" + ownProfile.phone.slice(3)
        : ownProfile.phone;
      legacyQuery = legacyQuery.neq("usertel", ownLocal);
    }
  }
  const { data: legacyHit, error: legacyErr } = await legacyQuery.maybeSingle<{ userid: string }>();
  if (legacyErr && legacyErr.code !== "PGRST116") {
    console.error("[profile/checkPhoneAvailability] tb_users lookup failed:", legacyErr);
  }
  if (legacyHit) return { available: false, reason: "taken" };

  return { available: true };
}
