/**
 * W11 — HS-code AI-assist (ADVISORY · SUGGESTION ONLY · flag-gated).
 *
 * The doc team's force-multiplier: given a product description / photo, return
 * candidate HS codes + duty% + Form-E hint + the "safer alt name to avoid
 * มอก./อย./permit traps" recommendation. The `ท่า Port.txt` file is literally a
 * ready system prompt the team drafted for an HS-classification assistant
 * (`docs/research/freight-knowledge-2026-06-01/04-customs-docs-accounting.md`
 * §1.6 + PART 3 #3).
 *
 * ⚠️ This NEVER auto-files, auto-classifies a declaration line, or sets duty.
 *   It SUGGESTS — the Docs role copies a candidate into the declaration after
 *   confirming. Every response is advisory; `isConfigured=false` returns a
 *   stub telling the operator to configure the HS-AI endpoint.
 *
 * The actual LLM endpoint is NOT wired (no key in env). When
 * `HS_ASSIST_ENDPOINT` + `HS_ASSIST_API_KEY` are present, a future build can
 * call the model here; until then `isHsAssistConfigured()` is false and the
 * surface degrades gracefully.
 *
 * Server-only (reads env).
 */

import "server-only";

export type HsCandidate = {
  /** Candidate HS code (8 / 10 digits typical for Thai tariff). */
  hsCode: string;
  /** English description matching the code. */
  descriptionEn: string;
  /** Thai description. */
  descriptionTh: string;
  /** MFN import duty % (advisory — confirm in tariff). */
  dutyRatePct: number | null;
  /** Form-E / ACFTA preference hint (advisory). */
  formEHint: string | null;
  /** Permit / restriction caution (มอก./อย./มลพิษ). */
  permitCaution: string | null;
  /** A "safer" alternative product name/HS to avoid permit traps, if any. */
  saferAltNote: string | null;
  /** Model confidence 0..1 (advisory). */
  confidence: number | null;
};

export type HsAssistResult = {
  /** False when the AI endpoint isn't configured — UI shows the configure stub. */
  isConfigured: boolean;
  candidates: HsCandidate[];
  /** Operator-facing message (Thai). */
  message: string;
  /** ALWAYS true — suggestions must be confirmed before use. */
  requiresHumanConfirm: true;
};

/** True only when both the endpoint URL and API key env vars are present. */
export function isHsAssistConfigured(): boolean {
  return Boolean(process.env.HS_ASSIST_ENDPOINT && process.env.HS_ASSIST_API_KEY);
}

/**
 * Suggest HS-code candidates for a product description. ADVISORY.
 *
 * Stub behaviour (current): if the AI endpoint isn't configured, returns
 * `isConfigured: false` with the configure-message and zero candidates. The
 * caller (admin assist surface) renders the "configure HS-AI endpoint" banner.
 *
 * When configured, this is where a future build calls the model — the call is
 * intentionally NOT made yet (no creds), so the function never throws.
 */
export async function suggestHsCodes(
  productDescription: string,
): Promise<HsAssistResult> {
  const desc = (productDescription ?? "").trim();
  if (!desc) {
    return {
      isConfigured: isHsAssistConfigured(),
      candidates: [],
      message: "กรุณากรอกรายละเอียดสินค้าก่อนขอคำแนะนำพิกัด HS",
      requiresHumanConfirm: true,
    };
  }

  if (!isHsAssistConfigured()) {
    return {
      isConfigured: false,
      candidates: [],
      message:
        "ยังไม่ได้ตั้งค่าผู้ช่วยพิกัด HS (HS-AI endpoint) — ตั้งค่า env HS_ASSIST_ENDPOINT + HS_ASSIST_API_KEY ก่อนใช้งาน · ระหว่างนี้ใช้การคีย์พิกัดด้วยตนเอง",
      requiresHumanConfirm: true,
    };
  }

  // Endpoint configured but the model call is deliberately deferred (no
  // verified prompt/contract yet). Return an empty advisory rather than risk
  // an un-tested external call producing wrong classifications.
  return {
    isConfigured: true,
    candidates: [],
    message:
      "ผู้ช่วยพิกัด HS ตั้งค่าแล้ว แต่ยังไม่ได้เชื่อมต่อโมเดล (รอ prompt/contract ที่ยืนยันแล้ว) — ใช้การคีย์ด้วยตนเองไปก่อน",
    requiresHumanConfirm: true,
  };
}
