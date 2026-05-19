/**
 * team-map.ts — the legacy PCS Cargo sales-rep team whitelist + the
 * derived team values, transcribed 1:1 from the legacy PHP screens
 * (D1 / ADR-0017 · faithful-port).
 *
 * Every one of the four legacy screens — `user-sales.php`,
 * `report-user-sales.php`, `report-user-sales-add.php`,
 * `report-user-sales-history.php` — hardcodes the SAME branch:
 *
 *   if( ($userID=='PCS888') ){            $userIDMain='THADA.VIP'; }
 *   else if( ($userID=='PCS352') || ($userID=='PCS2000') ){ $userIDMain='SIN.VIP'; }
 *   else if( ($userID=='PCS2678') ){      $userIDMain='OOAEOM.VIP'; }
 *   else if( ($userID=='PCS4155') ){      $userIDMain='SWAN'; }
 *
 * `user-sales.php` L49-58 also derives a `$urlRecom` (the invite-link
 * code) per account; `report-user-sales-history.php` L46-55 derives a
 * `$percen` commission rate (all five accounts = 0.01).
 *
 * This module is the single shared transcription of those PHP
 * branches. The ONLY rebrand is `PCS<n>` → `PR<n>` on the member
 * codes (per ADR-0017 — branding + member codes only). The
 * `$userIDMain` / `$urlRecom` values are legacy `coID` strings — NOT
 * member codes — so they are copied UNCHANGED (changing them would
 * break the join against the migrated `tb_users.coid`).
 */

/** One team-leader account — the legacy per-`$userID` derived values. */
export type SalesAgent = {
  /** the customer's member code — legacy `$userID`, `PCS<n>` → `PR<n>`. */
  memberCode: string;
  /** legacy `$userIDMain` — the team's `coID` (matched against `tb_users.coid`). */
  userIDMain: string;
  /** legacy `$urlRecom` — the invite-link code (user-sales.php L49-58). */
  urlRecom: string;
  /** legacy `$percen` — the commission rate (report-user-sales-history.php L46-55). */
  percen: number;
};

/**
 * The hardcoded team whitelist — one row per legacy `$userID` branch.
 * Legacy `PCS888/PCS2000/PCS352/PCS2678/PCS4155` → `PR888/...` (rebrand).
 * `userIDMain` + `urlRecom` are legacy `coID` strings → copied verbatim.
 */
const SALES_AGENTS: readonly SalesAgent[] = [
  // if( $userID=='PCS888' )  $userIDMain='THADA.VIP';  $urlRecom='THADA';
  { memberCode: "PR888", userIDMain: "THADA.VIP", urlRecom: "THADA", percen: 0.01 },
  // else if( $userID=='PCS2000' )  $userIDMain='SIN.VIP';  $urlRecom='THADA';
  { memberCode: "PR2000", userIDMain: "SIN.VIP", urlRecom: "THADA", percen: 0.01 },
  // else if( $userID=='PCS352' )  $userIDMain='SIN.VIP';  $urlRecom='SIN';
  { memberCode: "PR352", userIDMain: "SIN.VIP", urlRecom: "SIN", percen: 0.01 },
  // else if( $userID=='PCS2678' )  $userIDMain='OOAEOM.VIP';  $urlRecom='OOAEOM';
  { memberCode: "PR2678", userIDMain: "OOAEOM.VIP", urlRecom: "OOAEOM", percen: 0.01 },
  // else if( $userID=='PCS4155' )  $userIDMain='SWAN';  $urlRecom='SWAN';
  { memberCode: "PR4155", userIDMain: "SWAN", urlRecom: "SWAN", percen: 0.01 },
] as const;

/**
 * Resolve the team-leader account for a member code — the transcription
 * of the legacy `if( $userID=='PCS…' ) … else { //404 }` gate.
 * Returns the matching {@link SalesAgent}, or `null` for any account
 * not on the whitelist (the legacy `else { //404 }` branch).
 */
export function resolveSalesAgent(memberCode: string | null): SalesAgent | null {
  if (!memberCode) return null;
  return SALES_AGENTS.find((a) => a.memberCode === memberCode) ?? null;
}
