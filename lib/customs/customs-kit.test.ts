/**
 * W11 — customs doc-kit pure-logic unit tests.
 *
 * Covers the advisory helpers + reference data (NO DB / network / file IO):
 *   1. port-codes      — code lookup, mode filter, label, no dup codes
 *   2. form-e          — ACFTA eligibility verdicts + restricted-chapter caution
 *   3. customs-letters — carrier lookup, BL-prefix auto-detect, letter-type meta,
 *      LOI-required-for-status rule
 *
 * Runs in <50ms.
 */

import {
  CUSTOMS_PORT_CODES,
  findPortCode,
  portCodesForMode,
  portCodeLabel,
  CUSTOMS_PORT_MODE_LABEL,
} from "./port-codes";
import {
  checkFormEEligibility,
  FORM_E_ORIGIN_CRITERIA,
  FORM_E_ORIGIN_CRITERION_LABEL,
} from "./form-e";
import {
  CUSTOMS_CARRIERS,
  CUSTOMS_LETTER_TYPES,
  findCarrier,
  carrierFromBlPrefix,
  findLetterType,
  loiRequiredForStatus,
  BL_RELEASE_STATUS_LABEL,
} from "./customs-letters";

let pass = 0;
let fail = 0;
function assert(label: string, cond: boolean): void {
  if (cond) { pass++; console.log("  ✓", label); }
  else      { fail++; console.error("  ✗", label); }
}

console.log("customs doc-kit helpers (W11)");

// ── (a) port codes ──────────────────────────────────────────────────────
console.log("  (a) port-codes");
{
  assert("master non-empty", CUSTOMS_PORT_CODES.length > 0);
  const codes = CUSTOMS_PORT_CODES.map((p) => p.code);
  assert("no duplicate codes", new Set(codes).size === codes.length);
  assert("findPortCode 0119 = Bangkok Port", findPortCode("0119")?.nameTh.includes("ท่าเรือกรุงเทพ") === true);
  assert("findPortCode trims whitespace", findPortCode(" 2801 ")?.code === "2801");
  assert("findPortCode unknown = null", findPortCode("9999") === null);
  assert("findPortCode null = null", findPortCode(null) === null);
  assert("sea filter only sea", portCodesForMode("sea").every((p) => p.mode === "sea"));
  assert("air filter has 1190", portCodesForMode("air").some((p) => p.code === "1190"));
  assert("truck filter has 3601", portCodesForMode("truck").some((p) => p.code === "3601"));
  assert("BFS has VAT-rounding note", findPortCode("1193")?.vatRoundingNote != null);
  assert("UPS has doCost 498", findPortCode("1194")?.doCostThb === 498);
  const bkk = findPortCode("0119")!;
  assert("label format", portCodeLabel(bkk).startsWith("0119 — "));
  assert("mode labels present", Boolean(CUSTOMS_PORT_MODE_LABEL.sea && CUSTOMS_PORT_MODE_LABEL.air && CUSTOMS_PORT_MODE_LABEL.truck));
}

// ── (b) Form-E / ACFTA eligibility ───────────────────────────────────────
console.log("  (b) form-e eligibility (advisory)");
{
  // origin not CN → not eligible
  const r1 = checkFormEEligibility({ hsCode: "8517.62", originCountry: "TH", originCriterion: "WO" });
  assert("non-CN origin → not eligible", r1.eligible === false);
  assert("always requiresHumanConfirm", r1.requiresHumanConfirm === true);

  // CN but no criterion → not eligible (criterion needed) but flagged opportunity
  const r2 = checkFormEEligibility({ hsCode: "9503.00", originCountry: "CN", originCriterion: null });
  assert("CN + no criterion → not eligible yet", r2.eligible === false);
  assert("CN + no criterion → prompts for criterion", r2.reasons.some((x) => x.includes("เกณฑ์กำเนิด")));

  // CN + valid criterion → eligible (advisory)
  const r3 = checkFormEEligibility({ hsCode: "8517.62", originCountry: "cn", originCriterion: "WO" });
  assert("CN + WO → eligible (advisory)", r3.eligible === true);
  assert("CN + WO still needs confirm", r3.requiresHumanConfirm === true);

  // restricted HS chapter caution (95 = toys / มอก.)
  const r4 = checkFormEEligibility({ hsCode: "9503.00", originCountry: "CN", originCriterion: "WO" });
  assert("ch.95 restricted caution surfaces", r4.restrictedCaution != null);
  assert("hsChapter parsed as 95", r4.hsChapter === "95");

  // unrestricted chapter → no caution
  const r5 = checkFormEEligibility({ hsCode: "8517.62", originCountry: "CN", originCriterion: "WO" });
  assert("ch.85 IS restricted (electrical/มอก.)", r5.restrictedCaution != null);

  const r6 = checkFormEEligibility({ hsCode: "6109.10", originCountry: "CN", originCriterion: "RVC" });
  assert("ch.61 (apparel) no caution", r6.restrictedCaution === null);

  // no origin → not eligible, reason mentions CN requirement
  const r7 = checkFormEEligibility({ hsCode: null, originCountry: null });
  assert("no origin → not eligible", r7.eligible === false);
  assert("no HS → hsChapter null", r7.hsChapter === null);

  assert("5 origin criteria", FORM_E_ORIGIN_CRITERIA.length === 5);
  assert("every criterion has a label",
    FORM_E_ORIGIN_CRITERIA.every((c) => FORM_E_ORIGIN_CRITERION_LABEL[c]?.length > 0));
}

// ── (c) customs letters / carriers ───────────────────────────────────────
console.log("  (c) customs-letters");
{
  assert("carriers non-empty", CUSTOMS_CARRIERS.length > 0);
  assert("includes ZIM/RCL/COSCO/HEDE/FUJIT/UPS",
    ["ZIM", "RCL", "COSCO", "HEDE", "FUJIT", "UPS"].every((c) => CUSTOMS_CARRIERS.some((x) => x.code === c)));
  assert("ZIM supports split-DO", findCarrier("ZIM")?.supportsSplitDo === true);
  assert("findCarrier unknown = null", findCarrier("NOPE") === null);
  assert("findCarrier null = null", findCarrier(null) === null);

  // BL-prefix auto-detect
  assert("CULU → CULINES", carrierFromBlPrefix("CULU1234567") === "CULINES");
  assert("SLVU → SINOKOR", carrierFromBlPrefix("SLVU4871649") === "SINOKOR");
  assert("COSU → COSCO", carrierFromBlPrefix("COSU9999999") === "COSCO");
  assert("unknown prefix → OTHER", carrierFromBlPrefix("ZZZZ123") === "OTHER");
  assert("null BL → OTHER", carrierFromBlPrefix(null) === "OTHER");

  // letter types
  assert("6 letter types", CUSTOMS_LETTER_TYPES.length === 6);
  assert("do_release needs carrier", findLetterType("do_release")?.needsCarrier === true);
  assert("waiver_45 no carrier", findLetterType("waiver_45")?.needsCarrier === false);
  assert("poa no carrier", findLetterType("poa")?.needsCarrier === false);
  assert("every letter type has subject", CUSTOMS_LETTER_TYPES.every((t) => t.subjectTh.length > 0));
  assert("findLetterType unknown = null", findLetterType("xxx") === null);

  // LOI-required-for-status
  assert("OBL → no LOI needed", loiRequiredForStatus("OBL") === false);
  assert("SURRENDER → LOI needed", loiRequiredForStatus("SURRENDER") === true);
  assert("TLX → LOI needed", loiRequiredForStatus("TLX") === true);
  assert("SWB → LOI needed", loiRequiredForStatus("SWB") === true);
  assert("4 BL status labels", Object.keys(BL_RELEASE_STATUS_LABEL).length === 4);
}

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
