"use server";

/**
 * translateTextAction — reusable server action for on-demand ZH→TH translation.
 *
 * DISPLAY-ONLY. Bounded to signed-in users (customer OR staff — both are
 * Supabase-authenticated). Writes nothing but the translation_cache. Called by
 * the reusable `<TranslateButton>`; safe to call from any surface.
 */

import { requireAuth } from "@/lib/auth/require-auth";
import { translateZhToTh, type TranslateResult } from "@/lib/translate/zh-to-th";

export async function translateTextAction(
  text: unknown,
): Promise<{ thai: string; ok: boolean }> {
  await requireAuth();

  if (typeof text !== "string") {
    return { thai: "", ok: false };
  }
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 2000) {
    return { thai: text, ok: false };
  }

  const result: TranslateResult = await translateZhToTh(text);
  return { thai: result.thai, ok: result.ok };
}

/**
 * Batch ZH→TH — one round-trip for a whole screen of Chinese strings.
 *
 * owner 2026-07-17: "ตรงรายการ และ รายละเอียดสินค้า ควรแปลไทยให้มาเลยนะครับ ของฝากสั่ง"
 * A 1688 listing carries a Chinese title plus up to ~40 Chinese option labels. Translating
 * on mount through the single-text action would fire ~41 server actions per product view;
 * this takes them in one call. `translateZhToTh` reads/writes translation_cache, so a
 * repeat view (and every other customer on the same listing) is a cache hit — the free
 * upstream is only ever hit for genuinely new strings.
 *
 * Returns a map keyed by the ORIGINAL string. A string that fails simply maps to itself,
 * so a caller renders the original rather than an empty box. DISPLAY-ONLY.
 */
export async function translateTextsAction(
  texts: unknown,
): Promise<{ map: Record<string, string>; ok: boolean }> {
  await requireAuth();
  if (!Array.isArray(texts)) return { map: {}, ok: false };

  // Dedupe + bound: an option grid repeats labels across SKU rows, and we never want a
  // hostile/huge payload to fan out into the upstream.
  const unique = Array.from(
    new Set(
      texts
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim())
        .filter((t) => t.length > 0 && t.length <= 2000),
    ),
  ).slice(0, 60);
  if (unique.length === 0) return { map: {}, ok: true };

  const map: Record<string, string> = {};
  let anyFail = false;
  // Sequential on purpose: the free upstream rate-limits, and cache hits make this
  // near-instant after the first view of a listing.
  for (const src of unique) {
    try {
      const r = await translateZhToTh(src);
      map[src] = r.ok && r.thai ? r.thai : src;
      if (!r.ok) anyFail = true;
    } catch {
      map[src] = src; // fall back to the original — never blank the UI
      anyFail = true;
    }
  }
  return { map, ok: !anyFail };
}
