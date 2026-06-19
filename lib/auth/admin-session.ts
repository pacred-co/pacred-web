/**
 * Dedicated admin-login session "ticket" — signed httpOnly cookie.
 *
 * Owner directive 2026-06-19 (พี่ป๊อป via ปอน): the admin back-office (`/admin`)
 * must NOT be reachable just by having an admin role + a normal customer login.
 * A user can ONLY enter `/admin` if they authenticated through the dedicated
 * admin login page (`/admin/login`). Logging in via the normal `/login` — even
 * with an admin_* account — lands on the customer front-office and `/admin` is
 * blocked.
 *
 * Mechanism (mirrors lib/auth/impersonation.ts — the proven signed-cookie
 * pattern already in the codebase):
 *   1. `/admin/login` → `signInAdmin()` authenticates an `admin_*` account, then
 *      sets this `pacred_admin` ticket (HMAC-SHA-256 over {admin_id, expires_at}).
 *   2. The (admin) layout calls `verifyAdminSession(user.id)` — the AUTHORITATIVE
 *      gate. A missing / forged / wrong-user / expired ticket → redirect to the
 *      customer front-office.
 *   3. The proxy does a fast PRESENCE-only check (edge-safe, no crypto) for an
 *      early redirect; the layout does the real HMAC verify.
 *   4. The normal `signIn()` + signout BOTH clear this ticket, so the only way to
 *      hold a valid ticket is to have gone through `/admin/login`.
 *
 * ── Security ────────────────────────────────────────────────
 * - httpOnly → client JS can't read or set it.
 * - HMAC-signed (secret = SUPABASE_SERVICE_ROLE_KEY, server-only) → a user can't
 *   forge a ticket for their own id, so faking cookie-presence can't bypass the
 *   layout's verify.
 * - Bound to admin_id → a stale ticket from a previous user on the same browser
 *   never validates for a different signed-in user.
 * - The ticket alone grants NOTHING: the layout still runs requireAdmin()'s
 *   role check. A customer who somehow forged a ticket still 404s on no role.
 *
 * Server-only — never import from a Client Component.
 */

import "server-only";

import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "pacred_admin";

/** 7-day hard TTL. A backstop for a stale ticket — the real session lifetime is
 *  the Supabase auth session (the role check needs an authed user). After this
 *  the admin simply re-logs-in via /admin/login. */
export const ADMIN_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type AdminSessionPayload = {
  /** The admin's profile_id (auth.uid()) this ticket was minted for. */
  admin_id: string;
  /** ISO timestamp — past this the ticket is rejected. */
  expires_at: string;
};

// ── HMAC signing — secret = SUPABASE_SERVICE_ROLE_KEY (server-only, already
//    required for createAdminClient). If it rotates, all tickets invalidate →
//    forces a fresh /admin/login, which is the desired behaviour. ─────────
function getSecret(): string {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k) throw new Error("SUPABASE_SERVICE_ROLE_KEY required for admin-session cookie signing");
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

function encode(payload: AdminSessionPayload): string {
  const json = JSON.stringify(payload);
  const body = Buffer.from(json, "utf8").toString("base64url");
  return `${body}.${sign(json)}`;
}

/** Parse + verify the ticket string. Returns null on any failure (malformed,
 *  bad signature, missing fields, expired). NEVER throws. */
function decode(raw: string | undefined | null): AdminSessionPayload | null {
  if (!raw) return null;
  const dot = raw.indexOf(".");
  if (dot <= 0 || dot === raw.length - 1) return null;
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);

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
    typeof (parsed as Record<string, unknown>).expires_at !== "string"
  ) {
    return null;
  }
  const p = parsed as AdminSessionPayload;
  const expMs = Date.parse(p.expires_at);
  if (!Number.isFinite(expMs) || expMs <= Date.now()) return null;
  return p;
}

/**
 * AUTHORITATIVE gate — true only when a valid, non-expired admin ticket exists
 * AND it was minted for `authenticatedUserId`. Use in the (admin) layout.
 */
export async function verifyAdminSession(authenticatedUserId: string): Promise<boolean> {
  const jar = await cookies();
  const payload = decode(jar.get(ADMIN_SESSION_COOKIE)?.value);
  if (!payload) return false;
  return payload.admin_id === authenticatedUserId;
}

/** Set the admin ticket for `adminId`. Called from `signInAdmin` only. */
export async function setAdminSessionCookie(adminId: string): Promise<void> {
  const jar = await cookies();
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_MS).toISOString();
  try {
    jar.set(ADMIN_SESSION_COOKIE, encode({ admin_id: adminId, expires_at: expiresAt }), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: Math.floor(ADMIN_SESSION_TTL_MS / 1000),
    });
  } catch {
    /* not in a mutable cookie context — ignore */
  }
}

/** Clear the admin ticket. Called from normal `signIn`, signout, and any path
 *  that must drop the admin path (so only `/admin/login` can re-mint it). */
export async function clearAdminSessionCookie(): Promise<void> {
  const jar = await cookies();
  try {
    jar.set(ADMIN_SESSION_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
  } catch {
    /* not in a mutable cookie context — ignore */
  }
}
