/**
 * AkuCargo keyword search adapter (P-52).
 *
 * Per audit `docs/audit/php-pcscargo-integrations.md` §4a — AkuCargo is
 * the canonical keyword-search backend for Pacred (the legacy
 * `PACRED_TAMIT_API_URL` was a guess that didn't match what the PHP
 * actually called).
 *
 * Endpoint pattern:
 *   https://akucargo.com/api3/api-2022/search/v1{maybeTaobao}/?q={words}&page={N}&page_size=15&lang=zh-CN
 *
 *   maybeTaobao = "/taobao" for Taobao, empty for 1688.
 *   Tmall is not separately supported by AkuCargo — fall through to taobao.
 *
 * Auth: none.  Spoofs desktop Firefox UA (mobile UA returns thinner
 * results per legacy comments).
 *
 * Response shape (defensive — defensively parse):
 *   {
 *     items: { item: [
 *       { detail_url, pic_url, title, price, promotion_price, sales }
 *     ]},
 *     ...
 *   }
 *
 * Returns `available: false` only when env unset OR network/HTTP fails;
 * empty results array still resolves as `available: true` with hits=[].
 */

import "server-only";
import {
  parseAkucargoResponse,
  buildAkucargoUrl,
  type AkucargoPlatform,
} from "./akucargo-helpers";
import type { ChinaSearchHit, ChinaSearchResult } from "./types";

const DEFAULT_AKUCARGO_BASE = "https://akucargo.com/api3/api-2022";

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:53.0) Gecko/20100101 Firefox/53.0";

/**
 * Hit AkuCargo and return normalised search hits.  Caller is responsible
 * for choosing the platform — Pacred currently only exposes 1688 + taobao
 * via the UI; tmall maps to taobao.
 */
export async function akucargoSearch(
  words: string,
  page: number,
  platform: AkucargoPlatform,
): Promise<ChinaSearchResult> {
  const base = (process.env.PACRED_AKUCARGO_API_URL || DEFAULT_AKUCARGO_BASE).replace(/\/+$/, "");
  if (!process.env.PACRED_AKUCARGO_API_URL) {
    // Default URL still works (vendor allowlist permitting), but flag in
    // logs so ops know which path the call took.  Don't fail-fast — many
    // env-unset paths in this codebase still proceed with the default.
  }

  const url = buildAkucargoUrl(base, words, page, platform);

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": DESKTOP_UA,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return { available: false, reason: "network_error", message: `HTTP ${res.status}` };
    }
    const json = (await res.json()) as unknown;
    const hits = parseAkucargoResponse(json, platform);
    // AkuCargo doesn't return a has_more flag; we infer "more pages exist"
    // from "we got the full page_size of hits".  Default page_size = 15
    // (matches what the PHP pages use most often).
    const has_more = hits.length >= 15;
    return { available: true, hits: hits as ChinaSearchHit[], page, has_more };
  } catch (e) {
    return {
      available: false,
      reason: "network_error",
      message: e instanceof Error ? e.message : "unknown",
    };
  }
}
