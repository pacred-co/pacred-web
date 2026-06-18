/**
 * G-4 · Admin impersonation (view-as-customer) — cookie + validation.
 *
 * The flow:
 *   1. Admin (super/ops) clicks "View as customer" on
 *      /admin/customers/[id]. Server action `adminBeginImpersonation`
 *      creates an `impersonation_sessions` row + sets the
 *      `pacred_impersonating` cookie carrying {admin_id,
 *      target_profile_id, session_id, expires_at}.
 *   2. Every subsequent request, `getEffectiveUser()` (in
 *      `lib/auth/get-user.ts`) reads the cookie, re-verifies via
 *      `readActiveImpersonation()` below, and if still valid swaps
 *      in the target customer's profile.
 *   3. Admin clicks "exit" → `adminEndImpersonation` clears the
 *      cookie + writes ended_at on the session row.
 *
 * ── Security boundaries ─────────────────────────────────────
 * - Impersonation is READ-ONLY. `assertNotImpersonating()` is
 *   called from every customer-side mutation server action and
 *   refuses with `cannot_write_during_impersonation`.
 * - The admin's Supabase auth cookie does NOT change — they are
 *   still authenticated as themselves. RLS on the customer tables
 *   sees auth.uid() = admin's uid, and the admin-override policies
 *   (0015 + 0062) grant read access. So reads "as the customer"
 *   are achieved by filtering by target_profile_id at the read
 *   site, NOT by literally re-auth-ing.
 * - Cookie payload is HMAC-signed (HMAC-SHA-256 over the JSON)
 *   so a customer cannot forge one — `readImpersonationCookie`
 *   verifies the signature before trusting any field.
 * - Session TTL = 30 minutes (auto-expire). Max 3 active sessions
 *   per admin (enforced in adminBeginImpersonation).
 * - On read, we re-check that the admin STILL has super/ops role.
 *   If their roles were revoked mid-session, the cookie is
 *   invalidated and the impersonation ends ("admin_role_lost").
 *
 * Server-only — never import this from a Client Component.
 */

import "server-only";

import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const IMPERSONATION_COOKIE = "pacred_impersonating";

/** 30 minute hard TTL. Matches schema expires_at default. */
export const IMPERSONATION_TTL_MS = 30 * 60 * 1000;

/** Maximum number of simultaneously-active impersonation sessions per admin. */
export const MAX_ACTIVE_IMPERSONATION_SESSIONS_PER_ADMIN = 3;

/** Stable error code returned by every mutation when impersonating. */
export const IMPERSONATION_WRITE_ERROR = "cannot_write_during_impersonation";

export type ImpersonationCookiePayload = {
  /** Admin's profile_id (auth.uid()). */
  admin_id:           string;
  /** Profile being viewed-as. */
  target_profile_id:  string;
  /** impersonation_sessions.id — the audit-anchor for this session. */
  session_id:         string;
  /** ISO timestamp — past this, the cookie is rejected. */
  expires_at:         string;
};

// (The richer EffectiveProfile type lives in lib/auth/get-user.ts —
// keeping it close to getEffectiveUser() avoids a circular type-only
// import dance. This file only owns the cookie payload type above.)

// ────────────────────────────────────────────────────────────
// Cookie signing — HMAC-SHA-256 over the JSON payload
// ────────────────────────────────────────────────────────────
// We use SUPABASE_SERVICE_ROLE_KEY as the HMAC secret. It is server-only
// (never shipped to the client) + already required for createAdminClient,
// so we don't need a new env var. If the service role key ever rotates,
// all active impersonation cookies are invalidated — which is the
// desired behaviour (forces re-auth into a new session).

function getSecret(): string {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k) throw new Error("SUPABASE_SERVICE_ROLE_KEY required for impersonation cookie signing");
  return k;
}

function sign(payloadJson: string): string {
  return createHmac("sha256", getSecret()).update(payloadJson).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Encode {payload, sig} into the cookie string. */
export function encodeImpersonationCookie(payload: ImpersonationCookiePayload): string {
  const json = JSON.stringify(payload);
  const body = Buffer.from(json, "utf8").toString("base64url");
  const sig  = sign(json);
  return `${body}.${sig}`;
}

/**
 * Parse + verify the cookie. Returns null on any failure (malformed,
 * bad signature, missing fields, expired). NEVER throws — callers
 * downgrade gracefully to "not impersonating".
 */
export function decodeImpersonationCookie(raw: string | undefined | null): ImpersonationCookiePayload | null {
  if (!raw) return null;
  const dot = raw.indexOf(".");
  if (dot <= 0 || dot === raw.length - 1) return null;
  const body = raw.slice(0, dot);
  const sig  = raw.slice(dot + 1);

  let json: string;
  try {
    json = Buffer.from(body, "base64url").toString("utf8");
  } catch {
    return null;
  }

  if (!safeEqual(sig, sign(json))) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as Record<string, unknown>).admin_id !== "string" ||
    typeof (parsed as Record<string, unknown>).target_profile_id !== "string" ||
    typeof (parsed as Record<string, unknown>).session_id !== "string" ||
    typeof (parsed as Record<string, unknown>).expires_at !== "string"
  ) {
    return null;
  }

  const p = parsed as ImpersonationCookiePayload;

  // Hard expiry check — even if the DB row still says open, the cookie
  // self-expires after expires_at so a stolen cookie can't outlive the
  // intended window.
  const expMs = Date.parse(p.expires_at);
  if (!Number.isFinite(expMs) || expMs <= Date.now()) return null;

  return p;
}

/**
 * Validate the cookie against the DB session AND the admin's current
 * roles. Returns the validated payload or null. If the admin lost their
 * super/ops role mid-session, this also closes the session row with
 * `exit_reason='admin_role_lost'` so the audit trail records why.
 *
 * Side-effect-free on the happy path. Only writes when invalidating
 * a now-defunct session (rare).
 */
export async function readActiveImpersonation(
  authenticatedUserId: string,
): Promise<ImpersonationCookiePayload | null> {
  const jar = await cookies();
  const raw = jar.get(IMPERSONATION_COOKIE)?.value;
  const payload = decodeImpersonationCookie(raw);
  if (!payload) return null;

  // The cookie must belong to the currently-authenticated user. If the
  // user signed out + a different user signed in on the same browser,
  // the stale cookie must NOT impersonate on the new user's behalf.
  if (payload.admin_id !== authenticatedUserId) return null;

  const admin = createAdminClient();

  // 1. Session row must exist + not be ended yet.
  type SessionRow = {
    id:                string;
    admin_id:          string;
    target_profile_id: string;
    ended_at:          string | null;
    expires_at:        string;
  };
  const { data: session, error: sessionErr } = await admin
    .from("impersonation_sessions")
    .select("id, admin_id, target_profile_id, ended_at, expires_at")
    .eq("id", payload.session_id)
    .maybeSingle<SessionRow>();
  if (sessionErr) {
    console.error(`[impersonation_sessions lookup] failed`, { code: sessionErr.code, message: sessionErr.message, details: sessionErr.details, hint: sessionErr.hint });
    throw new Error(`Failed to load impersonation_sessions (${sessionErr.code ?? "unknown"}): ${sessionErr.message}`);
  }
  if (!session) return null;
  if (session.ended_at) return null;
  if (session.admin_id !== payload.admin_id) return null;
  if (session.target_profile_id !== payload.target_profile_id) return null;
  if (Date.parse(session.expires_at) <= Date.now()) return null;

  // 2. Admin must STILL have super or ops role. If revoked mid-session
  //    we close the session with admin_role_lost so the audit shows
  //    why it died.
  type AdminRoleRow = { role: string };
  const { data: roles, error: rolesErr } = await admin
    .from("admins")
    .select("role")
    .eq("profile_id", payload.admin_id)
    .eq("is_active", true);
  if (rolesErr) {
    console.error(`[admins list] failed`, { code: rolesErr.code, message: rolesErr.message });
  }

  const roleSet = new Set(((roles ?? []) as unknown as AdminRoleRow[]).map((r) => r.role));
  const stillEligible = roleSet.has("ultra") || roleSet.has("super") || roleSet.has("ops");
  if (!stillEligible) {
    await admin
      .from("impersonation_sessions")
      .update({ ended_at: new Date().toISOString(), exit_reason: "admin_role_lost" })
      .eq("id", payload.session_id)
      .is("ended_at", null);
    return null;
  }

  return payload;
}

/**
 * Guard for customer-facing mutation server actions. Call at the top:
 *
 *   const err = await assertNotImpersonating();
 *   if (err) return err;
 *
 * Returns { ok: false, error: "cannot_write_during_impersonation" }
 * when the caller's session has an active impersonation cookie. The
 * caller may want to relax the type (use `as never` or a narrower
 * generic on the inferred T); the stable error code stays constant
 * so the UI can render a single localised message.
 */
export async function assertNotImpersonating(): Promise<
  { ok: false; error: typeof IMPERSONATION_WRITE_ERROR } | null
> {
  const jar = await cookies();
  const raw = jar.get(IMPERSONATION_COOKIE)?.value;
  // Note: we deliberately do NOT verify the signature here — even an
  // expired/invalid impersonation cookie indicates the caller is in
  // a "view-as-customer" UI state, where writes are confusing at best.
  // Cheaper to refuse on cookie presence than to do the full DB probe.
  if (!raw) return null;
  return { ok: false, error: IMPERSONATION_WRITE_ERROR };
}

/**
 * Set the impersonation cookie. Used by adminBeginImpersonation.
 *
 * The cookie is httpOnly + sameSite=lax + secure (in prod). It deliberately
 * has no `Path` restriction so the banner can read it on every protected
 * page.
 */
export async function setImpersonationCookie(payload: ImpersonationCookiePayload): Promise<void> {
  const jar = await cookies();
  const expMs = Date.parse(payload.expires_at);
  const maxAge = Math.max(0, Math.floor((expMs - Date.now()) / 1000));
  // Wrap in try/catch — cookies().set() throws if called from a Server
  // Component (mirrors the pattern in lib/supabase/server.ts). Should
  // never throw here because callers are Server Actions, but be safe.
  try {
    jar.set(IMPERSONATION_COOKIE, encodeImpersonationCookie(payload), {
      httpOnly: true,
      sameSite: "lax",
      secure:   process.env.NODE_ENV === "production",
      path:     "/",
      maxAge,
    });
  } catch {
    /* not in a mutable cookie context — ignore */
  }
}

/**
 * Clear the impersonation cookie. Used by adminEndImpersonation +
 * any cleanup path (admin signed out, role lost, etc.).
 */
export async function clearImpersonationCookie(): Promise<void> {
  const jar = await cookies();
  try {
    jar.set(IMPERSONATION_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure:   process.env.NODE_ENV === "production",
      path:     "/",
      maxAge:   0,
    });
  } catch {
    /* not in a mutable cookie context — ignore */
  }
}
