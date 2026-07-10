/**
 * Legacy PCS member-folder image URL resolver.
 *
 * Background: the legacy PCS Cargo PHP system stored customer-uploaded files
 * (user pictures, payment slips, forwarder shop covers, etc.) under
 * `pcscargo.co.th/member/` paths like:
 *
 *   - `images/users/<f>`        — customer profile pictures
 *   - `images/shops/<f>`        — forwarder cover images + shop product photos
 *   - `storage/slip/<f>`        — payment slip uploads
 *   - `storage/file/<f>`        — other customer uploads
 *   - `assets/images/icon/forwarder/<f>` — forwarder status icons (static)
 *
 * On 2026-05-24 ภูม mirrored the entire `pcsracgo/public/member` folder into
 * Supabase Storage production (Phase A storage parity). Pacred customer-facing
 * code must read from there — NOT from `pcscargo.co.th` (brand leak; legacy
 * vendor would see Pacred traffic; vendor server may be decommissioned at any
 * time during the brand split).
 *
 * This helper centralizes the resolution so the path can be flipped via env
 * if the bucket/folder layout changes without touching every call site.
 *
 * Default base (when env unset): the production Supabase Storage public URL
 * for the `pcsracgo` bucket's `public/member/` folder. The prod project ref
 * is read from `NEXT_PUBLIC_SUPABASE_URL`; dev points at the dev project so
 * dev pages render against dev-uploaded files (if any).
 *
 * Engineering reference (faithful · scrub-safe · not user-visible): the
 * legacy URL pattern was `https://pcscargo.co.th/member/<relativePath>`.
 *
 * See:
 *   - CLAUDE.md "Customer images: ✅ ภูม uploaded to Supabase S3 production"
 *   - docs/runbook/pcs-data-migration.md §4 (Phase A complete)
 *   - docs/runbook/pcs-scrub-plan.md (brand-leak rules)
 */

/**
 * Resolve a relative legacy `member/` path to its current absolute URL.
 *
 * @param relativePath  Path relative to the legacy `member/` folder, e.g.
 *                      `"images/users/PR123.jpg"` or `"storage/slip/abc.png"`.
 *                      Leading slash is stripped.
 * @returns Absolute URL pointing at the Supabase Storage mirror (or the
 *          `NEXT_PUBLIC_LEGACY_MEMBER_BASE` override if set).
 */
export function legacyMemberUrl(relativePath: string): string {
  const base = legacyMemberBase();
  const path = relativePath.replace(/^\/+/, "");
  return `${base}/${path}`;
}

/**
 * The single Pacred-branded / neutral no-cover placeholder.
 *
 * Customer-facing surfaces MUST use this when a forwarder/shop cover is
 * missing — NEVER `/legacy/pcs/shops/default.png` (that file is the legacy
 * "PCS Cargo Shop" logo → a brand leak the customer would see; owner flagged
 * 2026-07-03 "ทำไมยังมีรูป pcs cargo … โชว์ลูกค้า"). This is a plain box glyph
 * with a "ไม่มีรูป" label — no PCS branding. Keep this the ONE constant so a
 * future no-cover surface can't re-introduce the leak.
 *
 * Also used as the `onError` degradation target: if a real cover URL fails to
 * load (e.g. a stale `pcscargo.co.th` legacy host that is blocked or
 * decommissioned during the brand split), the `<img>` swaps to this instead of
 * showing a broken image or leaking the failed host. See `<CoverThumb>`.
 */
export const NO_COVER_IMAGE = "/images/no-cover.svg";

/**
 * Resolve a forwarder/shop cover column (`tb_forwarder.fcover`) to a
 * renderable URL — the faithful `convertIMGCHN()` logic (function.php
 * L1414-1437) with the brand-leak fallback swapped to {@link NO_COVER_IMAGE}.
 *
 * Rules (matching the legacy):
 *   - empty            → the neutral no-cover placeholder (was the PCS logo)
 *   - a legacy host URL (`pcscargo.co.th/member/<p>`) → re-point at the
 *     Supabase mirror so the customer-visible URL never leaks the legacy host
 *   - any other absolute URL / path-with-slash → used as-is (+ optional size)
 *   - a bare filename  → the Supabase mirror `images/shops/<file>`
 *
 * @param cover  Raw `fcover` value (filename | full URL | empty | null)
 * @param size   Optional legacy size suffix appended to slash-bearing URLs
 *               (e.g. `"_80x80.jpg"` for the thumbnail variant · `""` for full)
 */
export function forwarderCoverUrl(cover: string | null | undefined, size = ""): string {
  const v = (cover ?? "").trim();
  if (!v) return NO_COVER_IMAGE;
  const u = v
    .replace("?x-oss-process=style/alsy", "")
    .replace("?x-oss-process=style/tbsy", "")
    .replace("_250x250.jpg", "");
  if (u.includes("/")) {
    // Old data may store full legacy URLs — re-resolve through the Supabase
    // mirror so customer-visible URLs never leak the legacy host.
    const legacyMatch = u.match(/pcscargo\.co\.th\/member\/(.+)$/);
    if (legacyMatch) return legacyMemberUrl(legacyMatch[1]);
    // `size` is an Alibaba-CDN resize directive — appending it to any other host
    // (a MOMO api.momocargo.com cover, a pasted postimg/Drive link) 404s the
    // image. Gate it, and drop values that can never render (Drive folder link).
    const normalized = normalizeImageUrl(u);
    if (!normalized) return NO_COVER_IMAGE;
    return applyResizeSuffix(normalized, size);
  }
  // a bare filename — legacy stores forwarder covers under images/shops/
  return legacyMemberUrl(`images/shops/${u}`);
}

/**
 * True for an Alibaba / Taobao / Tmall OSS-CDN image URL.
 *
 * Those CDNs accept a `_WxH.jpg` filename SUFFIX as an on-the-fly resize
 * directive (`.../x.jpg` → `.../x.jpg_80x80.jpg`). The legacy `convertIMGCHN`
 * helper appends that suffix to the stored `cImages` value to render a
 * thumbnail. Appending it to ANY OTHER host's URL — a pasted postimg / imgur /
 * Google-Drive link — yields a 404 (that host has no such resize convention).
 * So a caller must gate the resize suffix on this predicate and pass every
 * other absolute URL through unchanged (owner-reported 2026-07-10: pasted
 * external product images not rendering).
 */
export function isAlibabaCdnUrl(u: string): boolean {
  return /(?:alicdn\.com|taobaocdn|tbcdn|img\.alibaba|tmall\.com|taobao\.com)/i.test(u);
}

/** Google-Drive link shapes that point at a SINGLE FILE (normalisable → an image). */
const DRIVE_FILE_ID_PATTERNS = [
  /drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{10,})/i,
  /drive\.google\.com\/open\?(?:[^#]*&)?id=([A-Za-z0-9_-]{10,})/i,
  /drive\.google\.com\/uc\?(?:[^#]*&)?id=([A-Za-z0-9_-]{10,})/i,
  /drive\.google\.com\/thumbnail\?(?:[^#]*&)?id=([A-Za-z0-9_-]{10,})/i,
];

/** A Google-Drive FOLDER link — a directory listing, never an image. */
const DRIVE_FOLDER_RE = /drive\.google\.com\/drive\/folders\//i;

/**
 * Hosts whose bare URL is an HTML *page*, not the image itself. Staff paste these
 * by mistake (the share link) instead of the direct-image link. They can never be
 * embedded, and — unlike a Drive file link — cannot be normalised without fetching
 * the page, so the writer rejects them with a hint to use the direct link.
 */
const NON_IMAGE_PAGE_PATTERNS = [
  DRIVE_FOLDER_RE,
  /^https?:\/\/(?:www\.)?postimg\.cc\//i,        // direct form is i.postimg.cc/...
  /^https?:\/\/(?:www\.)?imgur\.com\//i,         // direct form is i.imgur.com/...
  /^https?:\/\/(?:www\.)?dropbox\.com\/(?:scl\/fo|sh)\//i,
  /^https?:\/\/(?:www\.)?(?:1688|taobao|tmall)\.com\//i,  // product page, not image
  /^https?:\/\/item\.taobao\.com\//i,
  /^https?:\/\/detail\.(?:tmall|1688)\.com\//i,
];

function matchDriveFileId(u: string): string | null {
  for (const re of DRIVE_FILE_ID_PATTERNS) {
    const m = u.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

/**
 * Normalise a stored/pasted image URL into something an `<img>` can actually load.
 *
 * Steps (each observed in real prod data):
 *   - the dead `zzqss` proxy → the original alicdn URL
 *   - strip Aliyun OSS `?x-oss-process=…` params + the legacy `_250x250.jpg` marker
 *   - a Google-Drive **file** link (`/file/d/<id>/view`, `open?id=`, `uc?id=`) →
 *     `drive.google.com/thumbnail?id=<id>` (the only Drive form that embeds)
 *   - a Google-Drive **folder** link → `""` (a directory listing is NOT an image)
 *
 * @returns the renderable URL, or `""` when the value can never render as an image.
 */
export function normalizeImageUrl(raw: string | null | undefined): string {
  let u = (raw ?? "").trim();
  if (!u || u === "-" || u === "0") return "";

  // Protocol-relative marketplace URLs are REAL stored data: TAMIT/1688/Taobao
  // hand back `//img.alicdn.com/...`. A browser resolves them, but our validators
  // and `new URL()` consumers do not — `lib/pdf/prefetch-image.ts` already had to
  // special-case this (ภูม 2026-06-05). Upgrade once, here, at the SOT.
  if (u.startsWith("//")) u = `https:${u}`;

  if (/zzqss/i.test(u)) {
    const m = u.match(/(\/img\/(?:ibank|bao)\/[^?#]+)/i);
    if (m) u = `https://img.alicdn.com${m[1]}`;
  }
  u = u.split("?x-oss-process=")[0] ?? u;
  u = u.replace("_250x250.jpg", "");

  if (DRIVE_FOLDER_RE.test(u)) return "";
  const driveId = matchDriveFileId(u);
  if (driveId) return `https://drive.google.com/thumbnail?id=${driveId}&sz=w1000`;

  return u;
}

/**
 * True when `raw` is an absolute URL that can plausibly be embedded as an image.
 *
 * Used to VALIDATE what staff/customers paste into an image field, so a broken
 * value never enters `tb_cart.cimages` (it is copied verbatim into
 * `tb_order.cimages` → `tb_header_order.hcover` → `tb_forwarder.fcover`, so one bad
 * paste breaks every downstream surface). Empty is allowed (= "no image").
 *
 * Fail-OPEN for unknown hosts (an image CDN need not have a file extension); only
 * the known page/folder shapes are rejected.
 */
export function isDirectImageUrl(raw: string | null | undefined): boolean {
  const v = (raw ?? "").trim();
  if (!v) return true;                          // no image supplied — allowed
  // Accept protocol-relative marketplace URLs (`//img.alicdn.com/…`) — they are
  // real TAMIT/1688 data. `normalizeImageUrl` upgrades them to https, so the
  // stored value is always absolute.
  const s = v.startsWith("//") ? `https:${v}` : v;
  if (!/^https?:\/\//i.test(s)) return false;   // must be an absolute http(s) URL
  const normalized = normalizeImageUrl(s);
  if (!normalized) return false;                // e.g. a Drive folder link
  return !NON_IMAGE_PAGE_PATTERNS.some((re) => re.test(normalized));
}

/**
 * Append the legacy `_WxH.jpg` resize suffix — but ONLY for the Alibaba/Taobao
 * CDNs that implement it (see {@link isAlibabaCdnUrl}). Appending it to any other
 * host 404s the image; that ungated append is the bug behind the owner's
 * 2026-07-10 "แนบรูปแล้วไม่ขึ้น" reports.
 */
export function applyResizeSuffix(url: string, size: string): string {
  if (!size || !isAlibabaCdnUrl(url)) return url;
  if (/_\d+x\d+\.jpg$/i.test(url)) return url;  // already sized — don't double-append
  return url + size;
}

/**
 * **THE** resolver for legacy shop/product image columns — `tb_cart.cimages`,
 * `tb_order.cimages`, `tb_header_order.hcover`.
 *
 * Every surface must go through this one function. Before 2026-07-10 there were
 * six divergent copies (some prepended a legacy base to an already-absolute URL,
 * some appended an Alibaba resize suffix to non-Alibaba hosts, some sent a bare
 * filename to a directory it was never deployed to) — each producing a broken or
 * 404 image on a different page for the same stored value.
 *
 * Resolution order:
 *   1. empty / `-` / `0`                  → `emptyFallback`
 *   2. a legacy `pcscargo.co.th/member/…` → the Supabase mirror (never leak the host)
 *   3. any other absolute URL / path      → {@link normalizeImageUrl} + a
 *                                           host-gated {@link applyResizeSuffix}
 *                                           (an un-renderable value → `emptyFallback`)
 *   4. a bare filename                    → the mirrored legacy `images/shops/` folder
 *
 * @param size Optional Alibaba resize suffix for thumbnails (e.g. `"_150x150.jpg"`).
 *             Ignored for every non-Alibaba host.
 */
export function shopImageUrl(
  value: string | null | undefined,
  opts: { size?: string; emptyFallback?: string } = {},
): string {
  const emptyFallback = opts.emptyFallback ?? NO_COVER_IMAGE;
  const size = opts.size ?? "";
  const raw = (value ?? "").trim();
  if (!raw || raw === "-" || raw === "0") return emptyFallback;

  if (raw.includes("/")) {
    // Old rows may hold a full legacy URL — re-point at the mirror so a
    // customer-visible URL never names the legacy host (and never 404s once it
    // is decommissioned).
    const legacyMatch = raw.match(/pcscargo\.co\.th\/member\/(.+)$/i);
    if (legacyMatch?.[1]) return legacyMemberUrl(legacyMatch[1]);

    const normalized = normalizeImageUrl(raw);
    if (!normalized) return emptyFallback;   // Drive folder link, sentinel, …
    return applyResizeSuffix(normalized, size);
  }

  // A bare filename — the legacy `member/images/shops/` folder, mirrored to
  // Supabase Storage by ภูม 2026-05-24.
  return legacyMemberUrl(`images/shops/${raw}`);
}

/**
 * Resolve a customer profile-picture column (`tb_users.userPicture`) to a
 * renderable URL, handling the filename-vs-URL ambiguity.
 *
 * Background: that legacy column historically held a BARE filename
 * (`PR123.jpg` → `images/users/PR123.jpg`). But since 2026-06-06 ภูม's
 * avatar mirror also writes a FULL Supabase public URL into it (when a
 * customer uploads a new avatar via the modern profile flow). A reader that
 * blindly does `legacyMemberUrl('images/users/' + value)` would produce a
 * malformed nested URL (`.../images/users/https://...`) → broken image.
 *
 * Rule (matches lib/legacy/pcs-chrome.ts + the admin legacy-view): if the
 * value is already an absolute URL (`http(s)://`) or root-absolute path
 * (`/`), pass it through as-is; otherwise treat it as a legacy filename.
 *
 * @param userPicture  Raw `tb_users.userPicture` value (filename | full URL | empty)
 * @returns A renderable URL (the legacy default user image when empty).
 */
export function legacyUserPictureUrl(userPicture: string | null | undefined): string {
  const v = (userPicture ?? "").trim();
  if (!v) return legacyMemberUrl("images/users/user.jpg");
  if (/^(https?:\/\/|\/)/i.test(v)) return v;
  return legacyMemberUrl(`images/users/${v}`);
}

/**
 * The current base URL for the legacy `member/` folder mirror.
 *
 * Resolution order:
 *   1. `NEXT_PUBLIC_LEGACY_MEMBER_BASE` (explicit override, dev/staging/prod)
 *   2. `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/pcsracgo/public/member`
 *      (the canonical Supabase Storage public URL for ภูม's 2026-05-24 upload)
 *
 * Exposed separately so static asset bases (e.g. forwarder icons under
 * `assets/images/icon/forwarder/`) can be composed without re-deriving.
 */
export function legacyMemberBase(): string {
  const override = process.env.NEXT_PUBLIC_LEGACY_MEMBER_BASE;
  if (override && override.length > 0) {
    return override.replace(/\/+$/, "");
  }
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabase || supabase.length === 0) {
    // Env not set — fall back to the local `/legacy/pcs/` static mount
    // so the build does NOT crash (Next 16's "Collect page data" phase
    // evaluates module-scope code, which would otherwise hard-fail a
    // bare worktree without `.env.local`). In any real environment
    // (dev / staging / prod) `NEXT_PUBLIC_SUPABASE_URL` is always set
    // and this branch is unreachable. The fallback URLs will 404 for
    // most paths (only `images/shops/default.png` + `images/users/
    // user.jpg` exist locally) — visibly broken images, but no crash
    // and no brand leak to pcscargo.co.th.
    return "/legacy/pcs";
  }
  return `${supabase.replace(/\/+$/, "")}/storage/v1/object/public/pcsracgo/public/member`;
}
