/**
 * PCS↔Pacred sync — typed HTTP fetcher (server-only).
 *
 * Calls the PHP endpoint on the PCS server, which returns recent
 * `tb_forwarder` changes as JSON. The Vercel cron at
 * `/api/cron/pcs-sync` consumes this; the merger
 * (`./merge.ts`) writes into our `tb_forwarder`.
 *
 * Endpoint contract (designed separately):
 *   GET https://pcscargo.com/api/pacred-sync.php?since=<ISO>&limit=500
 *   Header: X-Pacred-Token: <PCS_SYNC_TOKEN>
 *
 *   Response (200):
 *     { ok: true, now: <ISO>, since: <ISO>, count: <int>, rows: [<PcsRow>, …] }
 *
 *   Error (non-2xx OR ok:false): throws PcsSyncFetchError with classified
 *   `code` (auth | not_found | network | parse | timeout | upstream).
 *
 * Safety rules (mirrors lib/integrations/momo-isolated/client.ts):
 *   - 30 sec AbortController timeout
 *   - never log the token
 *   - never include the token in returned/thrown error messages
 *   - cache: "no-store" (cron freshness)
 */

import "server-only";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_LIMIT      = 500;

// ────────────────────────────────────────────────────────────────
// Types — the on-the-wire shape from the PHP endpoint
// ────────────────────────────────────────────────────────────────

/** A single row emitted by `pacred-sync.php`. All optional but `id`. */
export type PcsRow = {
  id:                    number;
  ftrackingchn?:         string | null;
  fcabinetnumber?:       string | null;
  fstatus?:              string | null;
  fdate?:                string | null;
  fdatestatus3?:         string | null;
  fdatestatus4?:         string | null;
  fdatestatus5?:         string | null;
  fdatestatus6?:         string | null;
  fdatestatus7?:         string | null;
  fdatecontainerclose?:  string | null;
  fdriverid?:            string | null;
  fnotedriver?:          string | null;
  ftrackingth?:          string | null;
  fweight?:              number | string | null;
  fvolume?:              number | string | null;
  famount?:              number | string | null;
  fwarehousename?:       string | null;
  adminidupdate?:        string | null;
  updated_at_pcs?:       string | null;
};

export type PcsDeltaResponse = {
  ok:    true;
  now:   string;
  since: string;
  count: number;
  rows:  PcsRow[];
};

export type PcsSyncErrorCode =
  | "PCS_NOT_CONFIGURED"   // env vars missing
  | "PCS_AUTH_INVALID"     // 401/403 OR `ok: false` w/ auth flag
  | "PCS_NOT_FOUND"        // 404
  | "PCS_UPSTREAM_ERROR"   // 5xx OR `ok: false` w/ message
  | "PCS_NETWORK_ERROR"    // fetch threw (DNS / connection reset)
  | "PCS_TIMEOUT"          // AbortController fired
  | "PCS_PARSE_ERROR";     // response not JSON / shape wrong

export class PcsSyncFetchError extends Error {
  readonly code:   PcsSyncErrorCode;
  readonly status: number | null;
  constructor(code: PcsSyncErrorCode, message: string, status: number | null = null) {
    super(message);
    this.name   = "PcsSyncFetchError";
    this.code   = code;
    this.status = status;
  }
}

// ────────────────────────────────────────────────────────────────
// Config — never returns the token in errors
// ────────────────────────────────────────────────────────────────

function readConfig(): { url: string; token: string } | null {
  const url   = process.env.PCS_SYNC_URL;
  const token = process.env.PCS_SYNC_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token };
}

// ────────────────────────────────────────────────────────────────
// Main entry — fetchPcsDeltas
// ────────────────────────────────────────────────────────────────

export type FetchPcsDeltasOpts = {
  /** ISO timestamp — the `?since=` query passed to PHP endpoint. */
  since:     string;
  /** Optional `?limit=` query (default 500, capped server-side). */
  limit?:    number;
  /** Override default 30s timeout. */
  timeoutMs?: number;
};

/**
 * Fetch deltas from the PCS pacred-sync.php endpoint.
 *
 * Throws `PcsSyncFetchError` on any non-success outcome — caller
 * (the cron route) translates to `pcs_sync_logs.error` + status.
 */
export async function fetchPcsDeltas(
  opts: FetchPcsDeltasOpts,
): Promise<PcsDeltaResponse> {
  const cfg = readConfig();
  if (!cfg) {
    throw new PcsSyncFetchError(
      "PCS_NOT_CONFIGURED",
      "PCS sync env vars missing — set PCS_SYNC_URL + PCS_SYNC_TOKEN",
    );
  }

  const limit = opts.limit ?? DEFAULT_LIMIT;
  const qs    = new URLSearchParams({ since: opts.since, limit: String(limit) });
  const url   = `${cfg.url}?${qs.toString()}`;

  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Accept:           "application/json",
        "X-Pacred-Token": cfg.token,
      },
      cache:  "no-store",
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const aborted = err instanceof Error && err.name === "AbortError";
    if (aborted) {
      throw new PcsSyncFetchError("PCS_TIMEOUT", "PCS sync request timed out");
    }
    throw new PcsSyncFetchError(
      "PCS_NETWORK_ERROR",
      `PCS sync network error: ${err instanceof Error ? err.message : "unknown"}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) {
    throw new PcsSyncFetchError(
      "PCS_AUTH_INVALID",
      "PCS sync auth invalid — check PCS_SYNC_TOKEN env",
      res.status,
    );
  }
  if (res.status === 404) {
    throw new PcsSyncFetchError(
      "PCS_NOT_FOUND",
      "PCS sync endpoint not found — check PCS_SYNC_URL env",
      404,
    );
  }
  if (res.status >= 500) {
    throw new PcsSyncFetchError(
      "PCS_UPSTREAM_ERROR",
      `PCS sync upstream error ${res.status}`,
      res.status,
    );
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new PcsSyncFetchError(
      "PCS_PARSE_ERROR",
      "PCS sync response is not valid JSON",
      res.status,
    );
  }

  // Shape validation. We trust `id` to be a number per the spec — anything
  // else we tolerate as null / string.
  if (!body || typeof body !== "object") {
    throw new PcsSyncFetchError(
      "PCS_PARSE_ERROR",
      "PCS sync response is not an object",
      res.status,
    );
  }
  const b = body as Record<string, unknown>;
  if (b.ok === false) {
    const msg = typeof b.message === "string" ? b.message
              : typeof b.error   === "string" ? b.error
              : "PCS sync returned ok: false";
    // Distinguish auth (when upstream signals so) vs generic upstream.
    const lowerMsg = msg.toLowerCase();
    if (lowerMsg.includes("auth") || lowerMsg.includes("token")) {
      throw new PcsSyncFetchError("PCS_AUTH_INVALID", msg, res.status);
    }
    throw new PcsSyncFetchError("PCS_UPSTREAM_ERROR", msg, res.status);
  }
  if (b.ok !== true) {
    throw new PcsSyncFetchError(
      "PCS_PARSE_ERROR",
      "PCS sync response missing ok:true",
      res.status,
    );
  }
  if (!Array.isArray(b.rows)) {
    throw new PcsSyncFetchError(
      "PCS_PARSE_ERROR",
      "PCS sync response rows is not an array",
      res.status,
    );
  }

  return {
    ok:    true,
    now:   typeof b.now   === "string" ? b.now   : new Date().toISOString(),
    since: typeof b.since === "string" ? b.since : opts.since,
    count: typeof b.count === "number" ? b.count : b.rows.length,
    rows:  b.rows as PcsRow[],
  };
}

/** Friendly TH message for the dashboard. */
export function pcsSyncErrorTh(code: PcsSyncErrorCode): string {
  switch (code) {
    case "PCS_NOT_CONFIGURED":  return "ยังไม่ตั้งค่า PCS Sync (กรุณาเพิ่ม env vars)";
    case "PCS_AUTH_INVALID":    return "PCS token ไม่ถูกต้อง หรือหมดอายุ";
    case "PCS_NOT_FOUND":       return "ไม่พบ PCS sync endpoint (ตรวจ PCS_SYNC_URL)";
    case "PCS_UPSTREAM_ERROR":  return "PCS server ตอบกลับ error";
    case "PCS_NETWORK_ERROR":   return "เชื่อมต่อ PCS ไม่ได้ (network error)";
    case "PCS_TIMEOUT":         return "PCS ตอบช้าเกิน 30 วินาที (timeout)";
    case "PCS_PARSE_ERROR":     return "PCS ส่งข้อมูลรูปแบบไม่ถูกต้อง";
  }
}
