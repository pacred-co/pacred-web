/**
 * Google Sheets API v4 read-only client.
 *
 * Wraps `google-auth-library` (service-account JWT auth, ~300KB) + raw
 * `fetch` to the Sheets v4 REST endpoint. We DELIBERATELY do not use
 * the full `googleapis` package — its 3.5MB of generated type
 * definitions crashes the Next 16 / tsc build with a heap OOM on
 * Vercel's default 2GB. The Sheets v4 read surface is small enough that
 * a direct REST call is simpler than pulling in the whole SDK.
 *
 * Faithful port of legacy PCS Cargo's `pcs-admin/api/autorun/update-sheet-*`
 * crons (per `docs/audit/php-pcscargo-integrations.md` §8). The legacy
 * service-account JSON `pcs-admin/cryptic-album-325611-f8d67b670cf9.json`
 * (project `cryptic-album-325611`, scope `SPREADSHEETS_READONLY`) is NOT
 * checked into Pacred; ก๊อต provisions a NEW Pacred service account +
 * stores its JSON in `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON` (see `.env.example`).
 *
 * Until that env is set, every adapter using this client gracefully
 * returns `{ ok: false, reason: "not_configured" }` and the cron logs a
 * `status: "failure"` row with a clear reason — same pattern as the
 * CargoThai sync (`app/api/cron/cargothai-sync/route.ts`).
 *
 * Server-only (cron + admin Server Actions).
 */
import "server-only";

import { JWT } from "google-auth-library";

import { logger } from "@/lib/logger";

export type SheetsReadResult =
  | { ok: true; rows: string[][] }
  | {
      ok: false;
      reason: "not_configured" | "auth_failed" | "fetch_failed";
      message?: string;
    };

type ServiceAccountCreds = { client_email: string; private_key: string };

let cachedJwt: JWT | null = null;

/**
 * Read + parse the service-account JSON from
 * `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON`. Returns `null` when unset or
 * malformed (missing `client_email` or `private_key`); the caller then
 * surfaces a `not_configured` failure rather than crashing.
 *
 * Newline-in-private-key gotcha: Vercel env-vars escape `\n` literally.
 * Replace `\\n` → `\n` after JSON.parse so PEM is valid.
 */
function getCreds(): ServiceAccountCreds | null {
  const raw = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const json = JSON.parse(raw) as Partial<ServiceAccountCreds>;
    if (!json.client_email || !json.private_key) return null;
    return {
      client_email: json.client_email,
      private_key: json.private_key.replace(/\\n/g, "\n"),
    };
  } catch {
    return null;
  }
}

/**
 * Memoised JWT auth client. `google-auth-library` handles access-token
 * refresh internally (the token is good for ~1 hour and refreshes on
 * demand), so cron runs sharing a lambda instance reuse the same JWT.
 */
async function getAuth(): Promise<JWT | null> {
  if (cachedJwt) return cachedJwt;
  const creds = getCreds();
  if (!creds) return null;
  const jwt = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  await jwt.authorize();
  cachedJwt = jwt;
  return jwt;
}

/**
 * Read one range of one spreadsheet via the Sheets v4 REST API. Returns
 * rows as `string[][]` (each inner array = one row, each cell stringified
 * by Sheets). Empty trailing rows / cells follow the Sheets v4 contract:
 * absent cells in a sparse row are simply missing from the returned
 * array, NOT padded with `""`.
 *
 * Range syntax: `'<TabName>!A2:Z'` (skip header row 1).
 */
export async function readSheet(
  spreadsheetId: string,
  range: string,
): Promise<SheetsReadResult> {
  let jwt: JWT | null = null;
  try {
    jwt = await getAuth();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("google-sheets", "auth failed", { spreadsheetId, range, message });
    return { ok: false, reason: "auth_failed", message };
  }
  if (!jwt) {
    return { ok: false, reason: "not_configured" };
  }
  try {
    // Sheets v4 REST: GET /v4/spreadsheets/{id}/values/{range}.
    // `getRequestHeaders()` returns `{ Authorization: 'Bearer <token>' }`
    // + handles refresh-on-expiry transparently.
    const headers = await jwt.getRequestHeaders();
    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/` +
      `${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`;
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const message = `${res.status} ${res.statusText}`;
      logger.warn("google-sheets", "fetch failed", { spreadsheetId, range, message });
      return { ok: false, reason: "fetch_failed", message };
    }
    const json = (await res.json()) as { values?: string[][] };
    return { ok: true, rows: json.values ?? [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("google-sheets", "fetch failed", { spreadsheetId, range, message });
    return { ok: false, reason: "fetch_failed", message };
  }
}
