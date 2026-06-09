/**
 * W11 — Form-E / ACFTA preference eligibility helper (ADVISORY ONLY).
 *
 * Form-E is the ASEAN-China FTA (ACFTA) Certificate of Origin. When goods
 * qualify by an origin criterion, the MFN import duty is zero-rated (0%).
 *
 * ⚠️ POLICY GATE (owner/accounting · `docs/learnings/customs-brokerage-kit.md` §4):
 *   This module is a CAPTURE/DISPLAY aid for the Docs team — it does NOT and
 *   must NOT auto-file, auto-issue a Form-E, or auto-zero the declared duty.
 *   The real ACFTA eligibility is decided by the customs broker against the
 *   `ACFTA ตรวจ FE.pdf` check + the HS tariff. The "engine" here only:
 *     - validates the origin criterion code,
 *     - flags the obvious disqualifiers (origin not CN; restricted HS lists),
 *     - surfaces the per-HS preferential-duty *opportunity* for the operator
 *       to confirm.
 *   Every result carries `requiresHumanConfirm: true`.
 *
 * No DB, no actions, no network — pure functions. Importable server + client.
 */

export type FormEOriginCriterion =
  | "WO"   // Wholly Obtained
  | "PE"   // Produced Entirely (from originating materials)
  | "RVC"  // Regional Value Content (≥40%)
  | "CTH"  // Change in Tariff Heading
  | "PSR"; // Product-Specific Rule

export const FORM_E_ORIGIN_CRITERIA: readonly FormEOriginCriterion[] = [
  "WO", "PE", "RVC", "CTH", "PSR",
] as const;

export const FORM_E_ORIGIN_CRITERION_LABEL: Record<FormEOriginCriterion, string> = {
  WO:  "WO — Wholly Obtained (ได้มาทั้งหมดในประเทศกำเนิด)",
  PE:  "PE — Produced Entirely (ผลิตจากวัตถุดิบในกลุ่มทั้งหมด)",
  RVC: "RVC — Regional Value Content ≥ 40%",
  CTH: "CTH — Change in Tariff Heading (เปลี่ยนพิกัด 4 หลัก)",
  PSR: "PSR — Product-Specific Rule (เกณฑ์เฉพาะสินค้า)",
};

/**
 * HS chapters (first 2 digits) commonly RESTRICTED for import / requiring
 * extra permits (มลพิษ / อย. / มอก.) per the doc-team's avoid list. Captured
 * as an ADVISORY caution — not a hard block, not a tariff ruling.
 * Source: `พิกัดกรมมลพิษ.pdf` (Pollution-Control restricted HS list) + the
 * doc-team's "สินค้าติด มอก./อย. แนะนำเลี่ยง" notes.
 */
const RESTRICTED_HS_CHAPTERS: ReadonlyMap<string, string> = new Map([
  ["28", "เคมีอนินทรีย์ — อาจติดกรมมลพิษ"],
  ["29", "เคมีอินทรีย์ — อาจติดกรมมลพิษ"],
  ["30", "ยา/เวชภัณฑ์ — อาจติด อย."],
  ["33", "เครื่องสำอาง — อาจติด อย."],
  ["38", "เคมีภัณฑ์เบ็ดเตล็ด — อาจติดกรมมลพิษ"],
  ["85", "เครื่องใช้ไฟฟ้า — อาจติด มอก."],
  ["95", "ของเล่น — อาจติด มอก."],
]);

export type FormEEligibilityInput = {
  /** HS code (any length; first 2 digits used for the restricted-chapter hint). */
  hsCode: string | null | undefined;
  /** ISO-2 country of origin (CN required for ACFTA). */
  originCountry: string | null | undefined;
  /** The claimed origin criterion (optional — captured if the operator entered it). */
  originCriterion?: FormEOriginCriterion | null;
};

export type FormEEligibilityResult = {
  /** Provisional eligibility flag — ADVISORY, always needs human confirm. */
  eligible: boolean;
  /** Human-readable reasons (Thai) for the verdict. */
  reasons: string[];
  /** Restricted-chapter caution, if the HS chapter is on the avoid list. */
  restrictedCaution: string | null;
  /** Normalised HS chapter (first 2 digits) or null. */
  hsChapter: string | null;
  /** ALWAYS true — the broker/Docs role must confirm against ACFTA ตรวจ FE.pdf. */
  requiresHumanConfirm: true;
};

function normHsChapter(hs: string | null | undefined): string | null {
  if (!hs) return null;
  const digits = hs.replace(/\D/g, "");
  if (digits.length < 2) return null;
  return digits.slice(0, 2);
}

/**
 * Provisional ACFTA / Form-E eligibility check. ADVISORY ONLY.
 *
 * Verdict logic (intentionally conservative):
 *   - origin must be CN (China) → else NOT eligible (ACFTA is ASEAN↔China).
 *   - an origin criterion is required to *claim* Form-E → if missing, the
 *     result is "potentially eligible, criterion needed" (eligible=false,
 *     prompting the operator to enter it).
 *   - if origin=CN AND a valid criterion is present → "potentially eligible"
 *     (eligible=true) but STILL `requiresHumanConfirm`.
 *   - a restricted HS chapter never blocks Form-E (it's a separate permit
 *     issue) but surfaces a caution.
 */
export function checkFormEEligibility(input: FormEEligibilityInput): FormEEligibilityResult {
  const reasons: string[] = [];
  const hsChapter = normHsChapter(input.hsCode);
  const restrictedCaution = hsChapter ? (RESTRICTED_HS_CHAPTERS.get(hsChapter) ?? null) : null;

  const origin = (input.originCountry ?? "").trim().toUpperCase();
  let eligible = false;

  if (!origin) {
    reasons.push("ยังไม่ระบุประเทศกำเนิด — ACFTA ต้องเป็นจีน (CN)");
  } else if (origin !== "CN") {
    reasons.push(`ประเทศกำเนิด ${origin} ไม่ใช่จีน → ไม่เข้าเงื่อนไข ACFTA/Form E`);
  } else {
    // origin = CN
    const crit = input.originCriterion ?? null;
    if (!crit) {
      reasons.push("ประเทศกำเนิดจีน (CN) — มีโอกาสเข้าเงื่อนไข แต่ต้องระบุเกณฑ์กำเนิด (WO/PE/RVC/CTH/PSR)");
    } else if (!FORM_E_ORIGIN_CRITERIA.includes(crit)) {
      reasons.push(`เกณฑ์กำเนิด "${crit}" ไม่ถูกต้อง`);
    } else {
      eligible = true;
      reasons.push(`จีน (CN) + เกณฑ์ ${crit} → มีโอกาสได้สิทธิ Form E (อากร 0%) — ต้องยืนยันกับเจ้าหน้าที่ตาม ACFTA ตรวจ FE`);
    }
  }

  if (restrictedCaution) {
    reasons.push(`⚠️ พิกัดบทที่ ${hsChapter}: ${restrictedCaution}`);
  }

  return {
    eligible,
    reasons,
    restrictedCaution,
    hsChapter,
    requiresHumanConfirm: true,
  };
}
