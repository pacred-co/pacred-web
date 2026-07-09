/**
 * translationCacheHash — the pure cache-key for the ZH→TH translate cache.
 *
 * Kept in its OWN module (no "server-only" import) so the unit test can import
 * it without pulling the server-only zh-to-th.ts chain (the codebase convention:
 * server-only modules aren't imported directly under tsx). node:crypto is a
 * built-in and runs fine under tsx.
 */

import { createHash } from "node:crypto";

export const TRANSLATE_TARGET_LANG = "th";

/** sha256(source + "|" + lang) — stable, lang-scoped cache key. */
export function translationCacheHash(
  text: string,
  lang: string = TRANSLATE_TARGET_LANG,
): string {
  return createHash("sha256").update(`${text}|${lang}`).digest("hex");
}
