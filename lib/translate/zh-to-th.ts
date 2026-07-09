/**
 * translateZhToTh — reusable, in-house, FREE, cached ZH→TH translation.
 *
 * DISPLAY-ONLY helper (never touches money/status/rate). Used platform-wide to
 * translate Chinese product fields (ชื่อสินค้าจีน · ชื่อร้าน · สี/ขนาด · หมายเหตุ)
 * on demand into Thai for staff + customers.
 *
 * ── Free · no API key ────────────────────────────────────────────────────────
 *   Primary : Google gtx (translate_a/single · public, keyless)
 *   Fallback: MyMemory   (api.mymemory.translated.net · public, keyless)
 *   Both fail → returns the original text with ok:false (never throws).
 *
 * ── Cache ────────────────────────────────────────────────────────────────────
 *   translation_cache (mig 0246) keyed by sha256(source + "|th"). Checked first;
 *   a fresh fetch is upserted so identical strings never re-hit the endpoint
 *   (absorbs the N-repeats of the same product name across rows/surfaces).
 *
 * SERVER-ONLY (uses node:crypto + the service-role admin client).
 */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { containsCJK } from "./cjk";
import { translationCacheHash } from "./hash";

export { translationCacheHash };

export type TranslateResult = {
  thai: string;
  ok: boolean;
  cached: boolean;
};

const TARGET_LANG = "th";
const FETCH_TIMEOUT_MS = 6000;
const MAX_LEN = 2000;

export async function translateZhToTh(text: string): Promise<TranslateResult> {
  const src = (text ?? "").trim();
  // Guard: empty, over-long, or non-Chinese → do not translate, do not hit the net.
  if (!src || src.length > MAX_LEN || !containsCJK(src)) {
    return { thai: text ?? "", ok: false, cached: false };
  }

  const hash = translationCacheHash(src);

  // 1) Cache hit
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("translation_cache")
      .select("target_text")
      .eq("source_hash", hash)
      .maybeSingle();
    if (!error && data?.target_text) {
      return { thai: data.target_text, ok: true, cached: true };
    }
  } catch {
    // cache unavailable (e.g. table not yet migrated) → fall through to live fetch
  }

  // 2) Live fetch — gtx primary, MyMemory fallback
  const fetched = await fetchGtx(src) ?? (await fetchMyMemory(src));
  if (!fetched) {
    return { thai: text ?? "", ok: false, cached: false };
  }

  // 3) Upsert cache (best-effort — never fail the translate on a cache write)
  try {
    const admin = createAdminClient();
    await admin
      .from("translation_cache")
      .upsert(
        {
          source_hash: hash,
          source_text: src,
          target_text: fetched,
          target_lang: TARGET_LANG,
        },
        { onConflict: "source_hash" },
      );
  } catch {
    /* ignore cache-write failure */
  }

  return { thai: fetched, ok: true, cached: false };
}

async function fetchGtx(src: string): Promise<string | null> {
  try {
    const url =
      "https://translate.googleapis.com/translate_a/single" +
      `?client=gtx&sl=auto&tl=${TARGET_LANG}&dt=t&q=${encodeURIComponent(src)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    // Shape: [ [ [ "แปล", "src", ... ], ... ], ... ]
    if (!Array.isArray(data) || !Array.isArray(data[0])) return null;
    const segments = data[0] as unknown[];
    const thai = segments
      .map((seg) => (Array.isArray(seg) && typeof seg[0] === "string" ? seg[0] : ""))
      .join("")
      .trim();
    return thai || null;
  } catch {
    return null;
  }
}

async function fetchMyMemory(src: string): Promise<string | null> {
  try {
    const url =
      "https://api.mymemory.translated.net/get" +
      `?q=${encodeURIComponent(src)}&langpair=${encodeURIComponent(`zh-CN|${TARGET_LANG}`)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const data = (await res.json()) as { responseData?: { translatedText?: string } };
    const thai = data?.responseData?.translatedText?.trim();
    return thai || null;
  } catch {
    return null;
  }
}
