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
