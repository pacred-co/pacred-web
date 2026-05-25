/**
 * Legacy filename → Supabase signed URL resolver.
 *
 * Wave 13 (2026-05-23) — after backfill 06 landed all 78K+ historic PCS
 * uploads on prod Supabase Storage, every admin/customer surface that
 * renders an image stored in a `tb_*.images*` / `fcover` / `userimage`
 * column needs to translate the bare filename into a working URL.
 *
 * Legacy schema convention — every "image" column stores **just the
 * filename**, never a path or URL. Examples from prod:
 *   tb_wallet_hs.imagesslip       = "FCL_68f5e7f7a3f941760946167.jpg"
 *   tb_cnt.cntimagesslip          = "PCS9122_6823a3375f1181747166007.jpg"
 *   tb_forwarder.fcover           = "PR10691_67e0...8c1735.jpg"
 *   tb_users.userimage            = "PCS06_1699196040.jpg" (+50x50/ thumb)
 *
 * Where the actual file lives after backfill 06 (per backfill 06 rules):
 *   slip       → slips/legacy/<filename>
 *   cover      → forwarder-covers/legacy-shops/<filename>
 *   profile    → member-docs/legacy-images/users/<filename>
 *               (+ optional 50x50/ thumb at same prefix + /50x50/)
 *   admin      → member-docs/legacy-images/admin/<filename>
 *   notify     → member-docs/legacy-images/notify/<filename>
 *   file       → member-docs/legacy-uploads/file/<filename>
 *   csv        → member-docs/legacy-uploads/csv/<filename>
 *   wp         → member-docs/legacy-wp/uploads/<filename>
 *
 * Three filename shapes we handle (in order of precedence):
 *   1. Already a full URL (http(s)://...)  → pass through unchanged
 *   2. Already includes a slash (a/b/c.jpg) → treat as a bucket-relative
 *      path; pick the bucket from `kind` (Wave 12 admin uploads use this:
 *      `admin/cnt-slip/<id>/<file>` → slips bucket)
 *   3. Bare filename (no slash)           → prepend the `legacy-*` prefix
 *      from the table above
 *
 * This module is server-only — the signed-URL fetch hits Supabase Storage
 * via the service-role admin client.
 */

import "server-only";
import { getSignedBucketUrl } from "./upload";

export type LegacyKind =
  | "slip"          // wallet / cnt / yuan slip image
  | "cover"         // forwarder + shop cover photo (legacy mixed both in images/shops/)
  | "profile"       // customer profile pic (member portrait)
  | "profile-thumb" // 50x50 customer pic thumbnail (auto-resized by legacy upload)
  | "admin-avatar"  // staff sidebar avatar
  | "notify"        // admin-broadcast push-notice image
  | "file"          // ID-card / cert PDF / customer doc
  | "csv"           // bulk CSV import (admin)
  | "wp";           // WordPress media (banner / blog / page hero)

/** Bucket + path that a filename resolves to (before signing). */
interface Resolved {
  bucket: string;
  path:   string;
}

const BUCKET: Record<LegacyKind, string> = {
  "slip":          "slips",
  "cover":         "forwarder-covers",
  "profile":       "member-docs",
  "profile-thumb": "member-docs",
  "admin-avatar":  "member-docs",
  "notify":        "member-docs",
  "file":          "member-docs",
  "csv":           "member-docs",
  "wp":            "member-docs",
};

const LEGACY_PREFIX: Record<LegacyKind, string> = {
  "slip":          "legacy",
  "cover":         "legacy-shops",
  "profile":       "legacy-images/users",
  "profile-thumb": "legacy-images/users/50x50",
  "admin-avatar":  "legacy-images/admin",
  "notify":        "legacy-images/notify",
  "file":          "legacy-uploads/file",
  "csv":           "legacy-uploads/csv",
  "wp":            "legacy-wp/uploads",
};

function classify(filename: string, kind: LegacyKind): Resolved | null {
  const bucket = BUCKET[kind];

  // Case 2 — already includes a slash. Caller (e.g. Wave 12 admin upload)
  // gave us a full bucket-relative path; use as-is.
  if (filename.includes("/")) {
    return { bucket, path: filename };
  }

  // Case 3 — bare filename → prepend legacy prefix.
  return { bucket, path: `${LEGACY_PREFIX[kind]}/${filename}` };
}

/**
 * Resolve a legacy image filename to a 1-hour signed URL on Supabase.
 *
 * @param filename  Bare filename (`PCS9122_...jpg`) OR bucket-relative path
 *                  (`admin/cnt-slip/<id>/<file>`) OR full URL.
 *                  `null` / `""` / `"0"` / `"-"` → returns `null`.
 * @param kind      Which legacy upload category this filename belongs to
 *                  (slip / cover / profile / etc.) — controls which bucket
 *                  + prefix to use.
 * @param ttlSeconds Signed-URL validity. Default 3600 (1 h) — long enough
 *                  for an admin's review session, short enough to keep the
 *                  link non-shareable.
 *
 * @returns Signed URL string, or `null` when filename is empty / sentinel.
 */
export async function resolveLegacyUrl(
  filename: string | null | undefined,
  kind: LegacyKind,
  ttlSeconds = 3600,
): Promise<string | null> {
  if (!filename) return null;
  const f = filename.trim();
  if (!f || f === "-" || f === "0") return null;

  // Case 1 — already a fully-qualified URL. Pass through, but rewrite
  // legacy CDN quirks (zzqss proxy hosts that disappeared, OSS process
  // params that need stripping) per the `getLinkCoverIMG()` helper in
  // legacy `member/include/function.php`. Research doc:
  // `docs/research/marketplace-thumbnails-2026-05-25-night.md`.
  if (/^https?:\/\//i.test(f)) {
    return rewriteLegacyCoverUrl(f, kind);
  }

  const resolved = classify(f, kind);
  if (!resolved) return null;

  return await getSignedBucketUrl(resolved.bucket, resolved.path, ttlSeconds);
}

/**
 * Rewrite a legacy product-cover URL to a clean modern URL.
 *
 * Wave 20 P2 (2026-05-25 ค่ำ) — ports the 3 normalisations from legacy
 * `getLinkCoverIMG()` helper:
 *
 * 1. **zzqss → alicdn** — older shop-orders went through a `zzqss.xxx`
 *    proxy that's offline since 2022. Strip the proxy + reconstruct the
 *    original alicdn URL.
 * 2. **Strip OSS process params** — alicdn URLs sometimes have an
 *    `_<W>x<H>.jpg_.webp` suffix from the Aliyun OSS image processor;
 *    we drop everything past the first `_!` if present (alicdn keeps the
 *    raw image under `O1CNxxx_!!yyy.jpg`).
 * 3. **Append thumb suffix for list views** — alicdn supports an inline
 *    resize via `_150x150.jpg`. Cheap bandwidth save when 50 rows render
 *    at once on the forwarders list. Only applied for `kind=cover` (the
 *    detail page passes the full URL through unchanged for click-to-zoom).
 *
 * @param url  Already-trimmed HTTP/HTTPS URL from a legacy fcover column.
 * @param kind Resolver kind — only "cover" gets the thumb suffix.
 */
function rewriteLegacyCoverUrl(url: string, kind: LegacyKind): string {
  let out = url;

  // 1. zzqss proxy → alicdn passthrough
  //    Pattern: https://[anything]zzqss[anything]/img/ibank/Oxxx
  //          → https://img.alicdn.com/img/ibank/Oxxx
  if (/zzqss/i.test(out)) {
    const m = out.match(/(\/img\/(ibank|bao)\/[^?#]+)/i);
    if (m) {
      out = `https://img.alicdn.com${m[1]}`;
    }
  }

  // 2. Strip OSS process params (everything after the first `?x-oss-process=`)
  if (out.includes("?x-oss-process=")) {
    out = out.split("?x-oss-process=")[0]!;
  }
  // Also strip the .webp / @W_H_jpg suffix some legacy code added
  out = out.replace(/_\d+x\d+\.jpg(\.webp)?$/i, ".jpg");

  // 3. Thumb suffix for list views (kind === "cover" only)
  //    Only alicdn / taobao CDN URLs support this — skip for unknown hosts.
  if (kind === "cover" && /^(https?:\/\/[^/]*(alicdn|taobaocdn|tbcdn|tmall)\.com)/i.test(out)) {
    // Avoid double-appending if already present
    if (!/_\d+x\d+\.jpg$/i.test(out)) {
      out = out + "_150x150.jpg";
    }
  }

  return out;
}

/**
 * Batch-resolve many legacy URLs in parallel. Returns a map from caller's
 * id (whatever stringable key you choose — `tb_wallet_hs.id`, etc.) to
 * the signed URL (or `null`).
 *
 * Use this when a list page renders ~50+ rows each with a thumbnail —
 * sequential `await` would block render; this fans out concurrently.
 */
export async function resolveLegacyUrlMap<K extends string | number>(
  entries: Array<{ id: K; filename: string | null | undefined }>,
  kind: LegacyKind,
  ttlSeconds = 3600,
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  await Promise.all(
    entries.map(async (e) => {
      out[String(e.id)] = await resolveLegacyUrl(e.filename, kind, ttlSeconds);
    }),
  );
  return out;
}
