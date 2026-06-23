/**
 * usable-image-src — the single guard for legacy avatar columns.
 *
 * `next/image` (and reliable plain-`<img>` URL resolution) only accepts a
 * leading-slash path or an absolute http(s) URL. Legacy avatar fields —
 * `tb_admin.adminPicture` (schema default `'user.jpg'`, NOT NULL) and
 * `profiles.avatar_url` — can hold a BARE filename like `"user.jpg"` with no
 * leading slash. next/image rejects that with
 *   "Failed to parse src 'user.jpg' … must start with a leading slash or be an
 *    absolute URL"
 * and THROWS — taking the whole subtree down to the error boundary. That is the
 * 2026-06-22 home-page crash: one live active sales rep had
 * `adminPicture = "user.jpg"` → `<ContactSales>` → home `/` error boundary.
 *
 * Treat ONLY a path or http(s) URL as a usable image src; coerce everything else
 * (bare filename, `"user.jpg"`, `""`, null/undefined) to either a caller-supplied
 * fallback (`usableImageSrcOr`) or `null` for callers whose UI supplies its own
 * fallback — e.g. the sales roster (`lib/admin/sales-roster.ts`), where
 * `photo: null` lets each surface pick its own placeholder.
 *
 * Mirrors the inline guards already in `lib/legacy/pcs-chrome.ts`,
 * `components/sections/pcs-sales-rep-card.tsx`, and the `safeImageSrc()` in
 * `components/sections/contact-sales.tsx` — this is their canonical home so the
 * rule lives in exactly one place (AGENTS.md §12).
 */

/** True only for a value next/image can load: a "/" path or an http(s) URL. */
export function isUsableImageSrc(src: string | null | undefined): src is string {
  return (
    !!src &&
    (src.startsWith("/") || src.startsWith("http://") || src.startsWith("https://"))
  );
}

/** Coerce any value next/image can't load (bare filename, "user.jpg", "", null)
 *  to `fallback`. Use when the UI needs a concrete src; pass `null` instead when
 *  the surface supplies its own placeholder. */
export function usableImageSrcOr(src: string | null | undefined, fallback: string): string {
  return isUsableImageSrc(src) ? src : fallback;
}
