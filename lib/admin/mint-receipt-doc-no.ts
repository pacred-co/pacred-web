/**
 * lib/admin/mint-receipt-doc-no.ts
 *
 * Wave 29 P0 #206 (Part A) — receipt document-number minter.
 *
 * ⚠️ STUB · MAIN THREAD WILL REPLACE — Agent 206 wrote this minimal stub
 *     to satisfy TypeScript imports from `actions/admin/forwarder-invoice.ts`
 *     + `lib/admin/auto-issue-receipt.ts`. The main thread is porting the
 *     full legacy formula from `pcs-admin/include/functions.php` L457-486
 *     (the `grenrateReceiptF` rid-mint block) — including:
 *       - the per-corporate-type / per-year-month sequence partition
 *       - the `lastDateSlip > dateSlip` "must insert a sub-number" branch
 *       - the LENGTH(rID) ≤ 13 + ORDER BY rID DESC partition window
 *
 *     For now this stub implements the HAPPY PATH only:
 *       - count rows in tb_receipt matching the same yyMM+corporateType
 *       - increment, pad to 5 digits, return `FRC2605-00007` / `FRG2605-00007`
 *
 *     This is FUNCTIONALLY CORRECT for the auto-receipt + manual-override
 *     paths when there is no out-of-order insertion. The main thread's
 *     full port adds the in-order-insertion edge case (legacy L497-521).
 *
 * Format: `FRC<yyMM>-<NNNNN>` (juristic) or `FRG<yyMM>-<NNNNN>` (individual).
 *
 * Signature (CONTRACT — do not break):
 *   mintReceiptDocNo(admin, { corporate, dateSlip }) → Promise<string>
 *
 * - admin: ReturnType<typeof createAdminClient> — caller passes the client
 * - corporate: 1 | 2 — 1=นิติบุคคล (FRC) · 2=บุคคล (FRG)
 * - dateSlip: Date — used for yyMM extraction (legacy L458-460)
 */

import type { createAdminClient } from "@/lib/supabase/admin";

export async function mintReceiptDocNo(
  admin: ReturnType<typeof createAdminClient>,
  opts: {
    corporate: 1 | 2;
    dateSlip: Date;
  },
): Promise<string> {
  // Legacy L458: $rIDDate = date('ym', strtotime($dateSlip))
  // (a 2-digit year — e.g. "26" — followed by 2-digit month "05")
  const dateSlip = opts.dateSlip;
  const yy = String(dateSlip.getFullYear()).slice(2);
  const mm = String(dateSlip.getMonth() + 1).padStart(2, "0");
  const yyMM = `${yy}${mm}`;

  // Legacy L466-471: prefix is FRC for corporate=1, FRG for corporate=2.
  const prefix = opts.corporate === 1 ? "FRC" : "FRG";

  // Legacy L462-472: count rows in tb_receipt where issuedate is in the
  // same year+month, corporateType matches, and rID length is ≤ 13 (the
  // ≤ 13 filter excludes the "out-of-order sub-number" rows L516, which
  // are 14+ chars like "FRG2605-00001-1").
  //
  // Year+month filter — we use ISO range so PostgREST + Postgres handle
  // the timezone the same way the legacy MySQL `YEAR()/MONTH()` would.
  const monthStart = new Date(dateSlip.getFullYear(), dateSlip.getMonth(), 1).toISOString();
  const monthEnd = new Date(dateSlip.getFullYear(), dateSlip.getMonth() + 1, 1).toISOString();

  const { count, error } = await admin
    .from("tb_receipt")
    .select("id", { count: "exact", head: true })
    .gte("issuedate", monthStart)
    .lt("issuedate", monthEnd)
    .eq("corporatetype", String(opts.corporate));
  if (error) {
    console.error(`[mintReceiptDocNo: tb_receipt count] failed`, {
      code: error.code, message: error.message, prefix, yyMM,
    });
    throw new Error(`mintReceiptDocNo count failed: ${error.message}`);
  }

  // Next sequence number = (current count) + 1, padded to 5 digits.
  const seq = (count ?? 0) + 1;
  const seqStr = String(seq).padStart(5, "0");
  return `${prefix}${yyMM}-${seqStr}`;
}
