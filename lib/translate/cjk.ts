/**
 * containsCJK — pure, dependency-free guard for the ZH→TH translate tool.
 *
 * Kept in its OWN file (no crypto / fetch / server-only imports) so the client
 * `<TranslateButton>` can import it without pulling any heavy/server code into
 * the browser bundle, while the server `translateZhToTh` shares the exact same
 * predicate (never a drifted copy).
 *
 * Matches CJK ideographs (Chinese) + fullwidth/halfwidth katakana. Deliberately
 * does NOT match Thai (฀-๿) or Latin — so a Thai/English string returns
 * false and never shows a translate button / never hits the endpoint.
 */

// CJK Unified Ideographs + Extension A + Compatibility Ideographs + halfwidth kana.
const CJK_RE = /[㐀-䶿一-鿿豈-﫿ｦ-ﾟ]/;

export function containsCJK(text: string | null | undefined): boolean {
  if (!text) return false;
  return CJK_RE.test(text);
}
