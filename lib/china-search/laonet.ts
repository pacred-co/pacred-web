/**
 * Laonet image search adapter (P-53).
 *
 * Per audit `docs/audit/php-pcscargo-integrations.md` §4b — Laonet is a
 * wrapper around the 3rd-party Taobao Open API that powers image-search
 * for Pacred.  Two-step flow:
 *
 *   1. Upload image as base64 →  ?api_name=upload_img&imgcode=&key=
 *      → returns imgid
 *   2. Search by imgid          →  ?api_name=item_search_img&imgid=&key=
 *      → returns hits
 *
 * Auth: API "key" is literally the email `tam011plus@gmail.com` (the
 * vendor's account).  Pacred currently shares this key with the legacy
 * PHP install — stored in PACRED_LAONET_KEY env var.
 *
 * Returns `available: false` on any unrecoverable failure; partial
 * success (upload OK, search empty) returns `available: true` with hits=[].
 *
 * Smoke verification waits on P-55 (Vercel egress IP allowlist with
 * vendor) — until then the upload step likely 403s from Vercel IPs.
 */

import "server-only";
import {
  buildLaonetUploadUrl,
  buildLaonetSearchUrl,
  parseLaonetUploadResponse,
  parseLaonetSearchResponse,
} from "./laonet-helpers";
import type { ChinaSearchResult } from "./types";

const DEFAULT_LAONET_BASE = "https://laonet.online";
const DEFAULT_LAONET_KEY  = "tam011plus@gmail.com";

// 5 MB upload cap — matches the route handler's pre-check, but enforce
// here too as a defence in depth.  Laonet itself rejects > ~8 MB.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export async function laonetImageSearch(file: Blob): Promise<ChinaSearchResult> {
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      available: false,
      reason: "network_error",
      message: `image too large (${file.size} bytes > 5 MB)`,
    };
  }

  const base = (process.env.PACRED_LAONET_API_URL || DEFAULT_LAONET_BASE).replace(/\/+$/, "");
  const key  = process.env.PACRED_LAONET_KEY || DEFAULT_LAONET_KEY;

  // ── 1. upload ──
  let imgid: string | null = null;
  try {
    // base64-encode without data:URI prefix; Laonet expects raw base64.
    const buf = Buffer.from(await file.arrayBuffer());
    const imgcode = buf.toString("base64");

    const uploadUrl = buildLaonetUploadUrl(base, imgcode, key);
    // Send as POST when the URL is too long for a GET (most browsers
    // refuse > 2 KB GET URLs; base64 of even a small image is huge).
    // Laonet accepts the same params via POST body per legacy PHP usage.
    const isLong = uploadUrl.length > 1500;
    const res = isLong
      ? await fetch(`${base}/index.php`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            route:    "api_tester/call",
            api_name: "upload_img",
            imgcode,
            key,
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(15_000),
        })
      : await fetch(uploadUrl, {
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: AbortSignal.timeout(15_000),
        });

    if (!res.ok) {
      return { available: false, reason: "network_error", message: `upload HTTP ${res.status}` };
    }
    imgid = parseLaonetUploadResponse(await res.json());
  } catch (e) {
    return {
      available: false,
      reason: "network_error",
      message: e instanceof Error ? `upload: ${e.message}` : "upload failed",
    };
  }

  if (!imgid) {
    return { available: false, reason: "network_error", message: "upload returned no imgid" };
  }

  // ── 2. search ──
  try {
    const searchUrl = buildLaonetSearchUrl(base, imgid, key);
    const res = await fetch(searchUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return { available: false, reason: "network_error", message: `search HTTP ${res.status}` };
    }
    const json = await res.json();
    const hits = parseLaonetSearchResponse(json);
    return { available: true, hits, page: 1, has_more: false };
  } catch (e) {
    return {
      available: false,
      reason: "network_error",
      message: e instanceof Error ? `search: ${e.message}` : "search failed",
    };
  }
}
