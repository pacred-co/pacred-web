/**
 * MOMO Isolated — typed HTTP client (Admin-only).
 *
 * Brief 2026-05-28 §6 (ปอน): service กลางที่ยิงตามที่ env กำหนด
 *   - auth header name configurable (default "Authorization")
 *   - auth prefix configurable (default "Bearer")
 *   - base URL from env
 *   - timeout + clean error codes
 *   - ห้าม log token / ห้ามคืน token ใน error
 *
 * ⚠️ THIS IS A NEW, ISOLATED MODULE — independent from
 *    `lib/integrations/momo-jmf/client.ts` which the daily cron uses.
 *    The cron + spine writes are NOT affected.
 *
 * Endpoints (per `docs/integrations/momo-jmf-api-spec.md`):
 *   GET /api/func/get/import/track/{date-range}
 *   GET /api/func/get/container/closed/{date-range}
 *   GET /api/sack/get/info/{sackNo}
 */

import "server-only";
import type { MomoClientResult, MomoErrorCode } from "./types";

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Read MOMO config from env. Falls back gracefully so the brief's
 * `MOMO_API_*` aliases work alongside the existing `MOMO_JMF_*`.
 *
 * Returns `null` when token/baseUrl are unset → caller surfaces
 * MOMO_NOT_CONFIGURED. NEVER returns the actual token in errors.
 */
function readConfig(): {
  baseUrl: string;
  token: string;
  authHeader: string;
  authPrefix: string;
} | null {
  const baseUrl =
    process.env.MOMO_API_BASE_URL || process.env.MOMO_JMF_BASE_URL;
  const token =
    process.env.MOMO_API_TOKEN || process.env.MOMO_JMF_TOKEN;
  if (!baseUrl || !token) return null;

  const authHeader = process.env.MOMO_API_AUTH_HEADER || "Authorization";
  const authPrefix = process.env.MOMO_API_AUTH_PREFIX ?? "Bearer";
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    token,
    authHeader,
    authPrefix,
  };
}

/**
 * Format a YYYY-MM-DD date pair as the MOMO date-range path segment.
 * MOMO uses raw `+` between the two ISO dates per the API spec.
 *
 * Note: per the canonical spec, `+` may need URL-encoding as `%2B` on
 * some upstream stacks. We pass raw `+` first; if MOMO ever rejects
 * we can swap to `%2B`. (For now, the spec doc says raw `+` works.)
 */
export function formatDateRange(start: string, end: string): string {
  if (!isValidIsoDate(start) || !isValidIsoDate(end)) {
    throw new Error("MOMO date range invalid — expect YYYY-MM-DD");
  }
  return `${start}+${end}`;
}

function isValidIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

/**
 * Central MOMO request — every public method funnels here.
 *
 * Safety rules per brief §5:
 *   - never log token
 *   - never include token in returned error messages
 *   - distinguish auth_invalid / not_found / network / parse / unavailable
 *
 * Timeout: 30s default. On timeout returns MOMO_API_UNAVAILABLE.
 */
export async function momoRequest<T = unknown>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<MomoClientResult<T>> {
  const cfg = readConfig();
  if (!cfg) {
    return {
      ok: false,
      error: "MOMO_NOT_CONFIGURED",
      message:
        "MOMO API config missing — set MOMO_API_BASE_URL + MOMO_API_TOKEN (or MOMO_JMF_* aliases) in env",
    };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(
    () => ctrl.abort(),
    init?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}${path}`, {
      ...init,
      method: init?.method ?? "GET",
      headers: {
        Accept: "application/json",
        [cfg.authHeader]: cfg.authPrefix
          ? `${cfg.authPrefix} ${cfg.token}`
          : cfg.token,
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      error: "MOMO_API_UNAVAILABLE",
      message: aborted ? "MOMO request timeout" : "MOMO network error",
    };
  } finally {
    clearTimeout(timer);
  }

  // MOMO auth error → most MOMO surfaces return 200 + JSON body
  // `{"status":false,"auth":false,"data":"auth invalid","message":"Auth incorrect.!!"}`
  // We detect this BEFORE returning, so callers don't need to inspect.
  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      error: "MOMO_AUTH_INVALID",
      message: "MOMO auth invalid — check MOMO_API_TOKEN env",
      status: res.status,
    };
  }
  if (res.status === 404) {
    return {
      ok: false,
      error: "MOMO_NOT_FOUND",
      message: "MOMO resource not found",
      status: 404,
    };
  }
  if (res.status >= 500) {
    return {
      ok: false,
      error: "MOMO_API_UNAVAILABLE",
      message: `MOMO server error ${res.status}`,
      status: res.status,
    };
  }

  // Try to parse JSON. Some MOMO error responses come back 200 + JSON
  // with `{"status":false,"auth":false,...}` — treat as auth error.
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return {
      ok: false,
      error: "MOMO_PARSE_ERROR",
      message: "MOMO response not JSON",
      status: res.status,
    };
  }

  if (body && typeof body === "object") {
    const b = body as { auth?: unknown; status?: unknown; message?: unknown };
    if (b.auth === false) {
      return {
        ok: false,
        error: "MOMO_AUTH_INVALID",
        message:
          typeof b.message === "string" ? b.message : "MOMO auth invalid",
        status: res.status,
      };
    }
    // `status: false` with no auth flag → upstream error, surface as unavailable
    if (b.status === false && b.auth === undefined) {
      return {
        ok: false,
        error: "MOMO_API_UNAVAILABLE",
        message:
          typeof b.message === "string" ? b.message : "MOMO returned status=false",
        status: res.status,
      };
    }
  }

  return { ok: true, data: body as T, status: res.status };
}

// ── Public typed wrappers ─────────────────────────────────────

/**
 * GET /api/func/get/import/track/{start}+{end}
 *
 * @param start ISO date YYYY-MM-DD
 * @param end   ISO date YYYY-MM-DD
 */
export function getImportTrack(start: string, end: string) {
  const range = formatDateRange(start, end);
  return momoRequest<unknown>(`/api/func/get/import/track/${range}`);
}

/**
 * GET /api/func/get/container/closed/{start}+{end}
 *
 * @param start ISO date YYYY-MM-DD
 * @param end   ISO date YYYY-MM-DD
 */
export function getContainerClosed(start: string, end: string) {
  const range = formatDateRange(start, end);
  return momoRequest<unknown>(`/api/func/get/container/closed/${range}`);
}

/**
 * GET /api/sack/get/info/{sackNo}
 *
 * @param sackNo raw sack code (e.g. "CBX251111-EK04"). URL-encoded internally.
 */
export function getSackInfo(sackNo: string) {
  return momoRequest<unknown>(
    `/api/sack/get/info/${encodeURIComponent(sackNo)}`,
  );
}

/** Map an error code → friendly message for UI. */
export function momoErrorTh(code: MomoErrorCode): string {
  switch (code) {
    case "MOMO_NOT_CONFIGURED":
      return "ยังไม่ตั้งค่า MOMO API (กรุณาเพิ่ม env vars)";
    case "MOMO_AUTH_INVALID":
      return "MOMO auth ไม่ถูกต้อง (token หมดอายุหรือผิด)";
    case "MOMO_NOT_FOUND":
      return "ไม่พบข้อมูลที่ MOMO";
    case "MOMO_API_UNAVAILABLE":
      return "MOMO API ไม่พร้อมใช้งาน (อาจ down หรือ timeout)";
    case "MOMO_PARSE_ERROR":
      return "ข้อมูลจาก MOMO รูปแบบไม่ถูกต้อง";
    case "MOMO_VALIDATION_ERROR":
      return "ข้อมูลที่ส่งไม่ถูกต้อง";
  }
}
