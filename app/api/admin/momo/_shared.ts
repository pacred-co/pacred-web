/**
 * Shared helpers for /api/admin/momo/* routes.
 *
 * Brief 2026-05-28 (ปอน): every MOMO admin API route must:
 *   - guard with admin auth (super/ops/warehouse roles)
 *   - validate query/body
 *   - normalize errors → never leak token
 *   - return JSON with consistent shape
 */

import "server-only";
import { NextResponse } from "next/server";
import { getAdminRoles, isGodRole } from "@/lib/auth/require-admin";
import type { MomoErrorCode } from "@/lib/integrations/momo-isolated";

/** Roles allowed to use MOMO admin tools (god roles always pass — see below). */
const ALLOWED_ROLES = new Set(["super", "ops", "warehouse", "accounting"]);

/**
 * Admin gate for /api/admin/momo/*.
 * Returns null when allowed, or a 403 JSON response when not.
 */
export async function guardAdmin(): Promise<NextResponse | null> {
  const roles = await getAdminRoles();
  if (!roles || roles.length === 0) {
    return NextResponse.json(
      { ok: false, error: "UNAUTHORIZED", message: "ต้อง login เป็น admin" },
      { status: 401 },
    );
  }
  // god roles (ultra/super) always pass — mirrors requireAdmin's gate so the
  // page (gated via requireAdmin, honors ultra) and this API agree. Without
  // this, an `ultra` admin sees the page+data but every sync button → 403.
  const hit = isGodRole(roles) || roles.some((r) => ALLOWED_ROLES.has(r));
  if (!hit) {
    return NextResponse.json(
      {
        ok: false,
        error: "FORBIDDEN",
        message: "role ไม่มีสิทธิ์ใช้ MOMO admin API",
      },
      { status: 403 },
    );
  }
  return null;
}

/**
 * Validate `start` + `end` query as YYYY-MM-DD pair.
 * Returns null when valid, or a 400 JSON response when not.
 */
export function validateDateRange(
  start: string | null,
  end: string | null,
): { ok: true; start: string; end: string } | { ok: false; response: NextResponse } {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!start || !end || !re.test(start) || !re.test(end)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: "MOMO_VALIDATION_ERROR",
          message: "ต้องส่ง ?start=YYYY-MM-DD&end=YYYY-MM-DD",
        },
        { status: 400 },
      ),
    };
  }
  if (Date.parse(start) > Date.parse(end)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: "MOMO_VALIDATION_ERROR",
          message: "start ต้องไม่หลัง end",
        },
        { status: 400 },
      ),
    };
  }
  return { ok: true, start, end };
}

/** Map a MomoErrorCode → HTTP status. */
export function errorStatus(code: MomoErrorCode): number {
  switch (code) {
    case "MOMO_NOT_CONFIGURED":   return 503;
    case "MOMO_AUTH_INVALID":     return 502;
    case "MOMO_NOT_FOUND":        return 404;
    case "MOMO_API_UNAVAILABLE":  return 502;
    case "MOMO_PARSE_ERROR":      return 502;
    case "MOMO_VALIDATION_ERROR": return 400;
  }
}
