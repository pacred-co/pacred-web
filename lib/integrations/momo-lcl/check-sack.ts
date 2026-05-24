/**
 * MOMO LCL — sack tracking lookup (D1 Gap #6).
 *
 * Faithful port of legacy PCS Cargo PHP:
 *   backoffice.pcscargo.co.th/app/Controllers/Api/Routes/import-lcl-momo/check-tracks.php
 *
 * The legacy controller hits the MOMO Cargo sack API to fetch the list of
 * tracking numbers + total sack weight inside a single MOMO LCL sack:
 *   GET https://api.momocargo.com:8080/api/sack/get/info/{sack}
 *      Authorization: Bearer <JWT>
 *
 * MOMO returns (shape inferred from check-tracks.php):
 *   { data: { weight: <number>, tracks: ["CG12345", "AAAA0001", ...] } }
 *
 * This helper performs ONLY the network call + parse + normalisation. The
 * caller (actions/admin/momo-lcl.ts) is responsible for the join against
 * tb_tmp_forwarder_item_momo + the productCBM / productWeight roll-up.
 *
 * No retries — the caller decides retry policy (typically: a single click =
 * a single attempt). Discriminated-union return so each failure mode is
 * a separate observable state in the UI.
 *
 * Env vars:
 *   MOMO_CARGO_SACK_BASE_URL  — base URL (defaults to api.momocargo.com:8080)
 *   MOMO_CARGO_SACK_TOKEN     — Bearer JWT issued by MOMO ops
 *
 * Note this is a SEPARATE service from the MOMO JMF container-sync API
 * (lib/integrations/momo-jmf/*) — they share a partner but use different
 * hosts, different tokens, and different response shapes.
 */

import "server-only";

/** Single track entry as returned by the MOMO sack-info endpoint. */
export type MomoSackTrack = string;

/** Normalised sack-info response — exactly the fields check-tracks.php uses. */
export interface MomoSackInfo {
  /** Sack-level weight in kg (MOMO's `data.weight`). 0 when MOMO omits it. */
  sackWeight: number;
  /** Tracking numbers inside the sack — raw, in MOMO's order. */
  tracks:     MomoSackTrack[];
}

/**
 * Discriminated-union result. Every non-`ok:true` branch is an observable
 * failure mode the UI can render verbatim.
 *   - not_configured: env vars missing — degrade gracefully
 *   - invalid_input : caller passed an empty/whitespace sack number
 *   - not_found     : MOMO returned 404 / empty data block
 *   - auth_failed   : MOMO returned 401/403 (token expired/revoked)
 *   - rate_limited  : MOMO returned 429
 *   - network       : fetch threw (DNS, TLS, timeout, etc.)
 *   - parse_error   : MOMO returned malformed JSON
 *   - momo_http_<n> : MOMO returned a non-OK status we don't have a name for
 */
export type CheckSackResult =
  | { ok: true;  data: MomoSackInfo }
  | { ok: false; error: "not_configured" | "invalid_input" | "not_found" | "auth_failed" | "rate_limited" | "network" | "parse_error" | string };

const DEFAULT_BASE_URL = "https://api.momocargo.com:8080";

function getConfig(): { baseUrl: string; token: string } | null {
  const token = process.env.MOMO_CARGO_SACK_TOKEN;
  if (!token) return null;
  const baseUrl = (process.env.MOMO_CARGO_SACK_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  return { baseUrl, token };
}

/**
 * Look up a MOMO LCL sack and return its tracks + weight.
 *
 * The legacy PHP also accepts a comma-separated multi-sack input and
 * concatenates them into the URL path (`sack/get/info/A,B,C`); we accept
 * the same — pass through to MOMO unchanged.
 */
export async function checkMomoSack(sackNo: string): Promise<CheckSackResult> {
  const sack = String(sackNo ?? "").trim();
  if (sack.length === 0) return { ok: false, error: "invalid_input" };

  const cfg = getConfig();
  if (!cfg) return { ok: false, error: "not_configured" };

  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/api/sack/get/info/${encodeURIComponent(sack)}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${cfg.token}`,
        "Accept":        "application/json",
      },
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "network" };
  }

  if (res.status === 401 || res.status === 403) return { ok: false, error: "auth_failed" };
  if (res.status === 404)                       return { ok: false, error: "not_found" };
  if (res.status === 429)                       return { ok: false, error: "rate_limited" };
  if (!res.ok)                                  return { ok: false, error: `momo_http_${res.status}` };

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, error: "parse_error" };
  }

  // Normalise the response. The legacy PHP reaches into
  // `responseData['data']['tracks']` + `responseData['data']['weight']`
  // and treats both as optional (?? [] / ?? 0).
  const root  = (json ?? {}) as { data?: unknown };
  const data  = (root.data ?? {}) as { tracks?: unknown; weight?: unknown };

  // MOMO may legitimately return an empty data block for an unknown sack —
  // surface that as `not_found` so the UI can say "ไม่พบ sack นี้".
  if (data === null || typeof data !== "object" || (data.tracks === undefined && data.weight === undefined)) {
    return { ok: false, error: "not_found" };
  }

  const rawTracks = Array.isArray(data.tracks) ? data.tracks : [];
  const tracks: string[] = [];
  for (const t of rawTracks) {
    if (typeof t === "string" && t.length > 0) tracks.push(t);
  }

  const weight = typeof data.weight === "number"
    ? data.weight
    : Number(data.weight ?? 0) || 0;

  return {
    ok:   true,
    data: { sackWeight: weight, tracks },
  };
}
