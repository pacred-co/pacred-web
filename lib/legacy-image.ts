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
    return u + size;
  }
  // a bare filename — legacy stores forwarder covers under images/shops/
  return legacyMemberUrl(`images/shops/${u}`);
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
