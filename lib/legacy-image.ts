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
    // Fail loud in dev; on prod NEXT_PUBLIC_SUPABASE_URL is always set so
    // this branch is effectively unreachable. Throwing avoids silently
    // rendering broken/leaky URLs.
    throw new Error(
      "legacyMemberBase: neither NEXT_PUBLIC_LEGACY_MEMBER_BASE nor NEXT_PUBLIC_SUPABASE_URL is set",
    );
  }
  return `${supabase.replace(/\/+$/, "")}/storage/v1/object/public/pcsracgo/public/member`;
}
