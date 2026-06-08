/**
 * Receipt document-number minter — faithful port of legacy
 * `pcs-admin/include/functions.php:457-486`.
 *
 * Why this file exists (read first — load-bearing context):
 * Wave 28 shipped a `mintReceiptId` helper inside `actions/admin/forwarder-invoice.ts`
 * that mints `PR<yyMMdd>-<seq>` (e.g. `PR260529-3`). That is WRONG on every
 * axis vs legacy:
 *   - Prefix should be `FRC` (นิติบุคคล) / `FRG` (ทั่วไป) — NOT `PR` (PR is the
 *     PCS→PR rebrand for ID codes; it has no business on a doc-class field)
 *   - Date granularity should be `yyMM` (4 digits, MONTHLY counter rolls each
 *     month) — NOT `yyMMdd` (daily)
 *   - Counter should be 5-digit zero-padded — NOT raw integer
 *
 * Live legacy data on prod already uses the legacy format (`FRG2605-00219`,
 * `FRC2605-00080`) — Wave 28 polluted `tb_receipt.rid` with `PR260529-N` rows
 * that DON'T parse the same way. Finance reconciliation, tax filings, and
 * customer-quoted invoice numbers all break. See:
 *   - `docs/research/legacy-accounting-reality-2026-05-30.md` §3
 *   - 4-agent deep-audit synthesis 2026-05-30
 *
 * ──────────────────────────────────────────────────────────────
 * Legacy spec (functions.php:457-486 — paraphrased):
 * ──────────────────────────────────────────────────────────────
 *
 *   $rIDDate = date('ym', strtotime($dateSlip));     // 4 digits, yyMM
 *   $rIDC    = corporate == 1 ? 'FRC' : 'FRG';       // by corporateType
 *
 *   // Find last rid for THIS month, THIS corporateType
 *   SELECT rid FROM tb_receipt
 *   WHERE YEAR(issuedate) = Y
 *     AND MONTH(issuedate) = M
 *     AND LENGTH(rid) <= 13     // skip malformed older IDs
 *     AND corporatetype = X
 *   ORDER BY rid DESC LIMIT 1
 *
 *   // bump
 *   $next = substr($lastRid, -5) + 1;        // → 220
 *   $next = str_pad($next, 5, '0', LEFT);    // → "00220"
 *   $rid  = $rIDC . $rIDDate . '-' . $next;  // → "FRG2605-00220"
 *
 *   // first row of month → "FRC2605-00001" / "FRG2605-00001"
 *
 * ──────────────────────────────────────────────────────────────
 * Race conditions (load-bearing):
 * ──────────────────────────────────────────────────────────────
 * Legacy `tb_receipt.rid` is NOT a unique key — it's a business identifier.
 * Two concurrent admin actions in the same month + corporateType CAN mint
 * the same number. Legacy tolerated this (the receipt was reviewed before
 * print). We follow the same tolerance — the caller decides whether to add
 * a retry-with-bump if a downstream uniqueness constraint catches it.
 *
 * For the auto-receipt path (Wave 29 #206) collisions are extremely
 * unlikely because the trigger is a single payment-land event with no
 * inherent concurrency. For the batch manual path, a brief retry loop
 * around the INSERT is sufficient.
 *
 * ──────────────────────────────────────────────────────────────
 * Schema reference (tb_receipt · per supabase/migrations/0081 L4132):
 * ──────────────────────────────────────────────────────────────
 *   rid           varchar(20)   — the minted business id (FRG2605-00219)
 *   corporatetype varchar(1)    — '1' (นิติบุคคล) | '2' (ทั่วไป)
 *   issuedate     timestamp     — the date on the receipt header (= dateSlip)
 *
 * tb_receipt did NOT get camelCase-renamed in migration 0113/0115 (only
 * tb_users/tb_admin/tb_co + tb_cnt/tb_cnt_item/tb_check_forwarder did).
 * So column names here stay lowercase.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** The two legacy "corporate types" — these flow from `tb_users.corporateNumber`. */
export type ReceiptCorporateType = 1 | 2;

/** Legacy prefix per corporateType (verbatim from functions.php:464-473). */
const PREFIX_BY_CORPORATE: Record<ReceiptCorporateType, "FRC" | "FRG"> = {
  1: "FRC", // นิติบุคคล
  2: "FRG", // ทั่วไป (บุคคลธรรมดา)
};

export type MintReceiptDocNoOpts = {
  /**
   * 1 if the customer has a `tb_users.corporateNumber` (นิติบุคคล)
   * 2 otherwise (บุคคลธรรมดา).
   *
   * Caller derives this from the customer row at the same time it derives
   * the dateSlip (legacy `functions.php:431-456` makes this exact decision).
   */
  corporate: ReceiptCorporateType;
  /**
   * The slip date — used to derive `yyMM` for the doc number AND to bound
   * the monthly counter window. For auto-issue on payment-land use the
   * payment timestamp; for manual issue use `new Date()` (today).
   */
  dateSlip: Date;
};

/**
 * Derive the 4-digit `yyMM` token (e.g. `2605` for May 2026) from a date.
 * Exported so callers can echo it in audit logs / SMS without re-deriving.
 */
export function yyMmTokenForDate(d: Date): string {
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yy}${mm}`;
}

/**
 * Mint the next `rid` for `tb_receipt`.
 *
 * Format: `{FRC|FRG}{yyMM}-{NNNNN}` — e.g. `FRG2605-00220`. Counter is
 * monthly per corporateType (FRC and FRG run independent sequences).
 *
 * @throws Never — on Supabase error the helper logs + falls back to
 *         `${prefix}${yyMM}-00001`. The caller's INSERT will surface the
 *         downstream constraint if anything is truly wrong; failing the
 *         mint silently would hide it.
 */
export async function mintReceiptDocNo(
  admin: SupabaseClient,
  opts: MintReceiptDocNoOpts,
): Promise<string> {
  const prefix = PREFIX_BY_CORPORATE[opts.corporate];
  const yyMm = yyMmTokenForDate(opts.dateSlip);
  const matchPattern = `${prefix}${yyMm}-%`; // ILIKE pattern, e.g. "FRG2605-%"

  // Legacy uses `LENGTH(rid) <= 13` as a guard against older malformed IDs.
  // Our ILIKE on the prefix+yyMM already constrains it to the exact 13-char
  // family (3 + 4 + 1 + 5 = 13), so we don't need a separate length filter.
  //
  // We sort by `rid DESC` (legacy did the same): because the 5-digit suffix
  // is zero-padded, descending lex order = descending numeric order, so the
  // first row is the highest counter for the month.
  const { data, error } = await admin
    .from("tb_receipt")
    .select("rid")
    .eq("corporatetype", String(opts.corporate))
    .ilike("rid", matchPattern)
    .order("rid", { ascending: false })
    .limit(1)
    .maybeSingle<{ rid: string | null }>();

  if (error) {
    // §0c — log + don't throw. Caller proceeds with the safe fallback below.
    console.error(`[mintReceiptDocNo] tb_receipt lookup failed`, {
      code: error.code,
      message: error.message,
      prefix,
      yyMm,
    });
  }

  // First row of the month for this corporateType → start at 00001.
  if (!data?.rid) {
    return `${prefix}${yyMm}-00001`;
  }

  // Bump: substring last 5 chars → parseInt → +1 → zero-pad.
  // Defensive against malformed legacy rows (e.g. an old `FRG2605-9`
  // without padding): if parseInt returns NaN we treat it as 0 and bump to 1.
  const lastSuffix = data.rid.slice(-5);
  const lastSeq = Number.parseInt(lastSuffix, 10);
  const nextSeq = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1;
  const nextSuffix = String(nextSeq).padStart(5, "0");

  return `${prefix}${yyMm}-${nextSuffix}`;
}

/**
 * Derive `corporate` (1 | 2) from a `tb_users` row.
 *
 * Legacy `functions.php:431-456` reads `tb_users.corporateNumber` AND the
 * `tb_corporate` join. If the user has a tax-ID-shaped corporateNumber
 * present → corporate=1 (FRC family); otherwise corporate=2 (FRG family).
 *
 * Centralised here so the auto-receipt hook (Wave 29 #206) and the
 * manual issue action (Wave 29 #208) make the SAME decision.
 */
export function deriveCorporateFromUser(
  user: { corporatenumber?: string | null } | null | undefined,
): ReceiptCorporateType {
  const cn = user?.corporatenumber?.trim();
  // Legacy treats any non-empty corporateNumber as the นิติบุคคล signal.
  // Tax-ID validity (13-digit format · check digit) is enforced upstream at
  // /admin/customers/[id] edit; we trust the column here.
  return cn ? 1 : 2;
}

// ════════════════════════════════════════════════════════════════════════════
// FORWARDER-INVOICE DOC NO (FRI) — billing-run R-2 (2026-06-03)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Mint the next `doc_no` for `tb_forwarder_invoice` (ใบวางบิล / billing-run).
 *
 * Format: `FRI{yyMM}-{NNNNN}` — e.g. `FRI2606-00001`. Counter is monthly
 * (rolls over on the 1st of each month). Single sequence — unlike receipts,
 * billing-run does NOT bifurcate juristic vs personal because the operational
 * concept (monthly batch billing) is identical for both. The buyer_name +
 * is_juristic columns on the row distinguish the customer class.
 *
 * Mirrors `mintReceiptDocNo` race-condition behavior — `tb_forwarder_invoice.doc_no`
 * IS a unique constraint, so a duplicate would 23505 on insert. The Server
 * Action wraps INSERT in a small retry loop (3 attempts with re-mint between)
 * for that case.
 *
 * @throws Never — on lookup error returns `FRI{yyMM}-00001` so the INSERT
 *         attempts; the downstream unique constraint will surface the real
 *         issue. See AGENTS.md §0c.
 */
export async function mintForwarderInvoiceDocNo(
  admin: SupabaseClient,
  opts: { issueDate: Date },
): Promise<string> {
  const yyMm = yyMmTokenForDate(opts.issueDate);
  const matchPattern = `FRI${yyMm}-%`; // ILIKE pattern, e.g. "FRI2606-%"

  const { data, error } = await admin
    .from("tb_forwarder_invoice")
    .select("doc_no")
    .ilike("doc_no", matchPattern)
    .order("doc_no", { ascending: false })
    .limit(1)
    .maybeSingle<{ doc_no: string | null }>();

  if (error) {
    console.error(`[mintForwarderInvoiceDocNo] tb_forwarder_invoice lookup failed`, {
      code: error.code,
      message: error.message,
      yyMm,
    });
  }

  if (!data?.doc_no) {
    return `FRI${yyMm}-00001`;
  }

  // Same parse pattern as mintReceiptDocNo: last 5 chars + parseInt + +1.
  const lastSuffix = data.doc_no.slice(-5);
  const lastSeq = Number.parseInt(lastSuffix, 10);
  const nextSeq = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1;
  const nextSuffix = String(nextSeq).padStart(5, "0");

  return `FRI${yyMm}-${nextSuffix}`;
}

// ════════════════════════════════════════════════════════════════════════════
// SHOP/YUAN TAX-INVOICE DOC NO (TIV) — migration 0152 (2026-06-08)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Mint the next `serial_no` for `tb_shop_tax_invoice` (ใบกำกับภาษี/ใบขน on the
 * ฝากสั่งซื้อ + ฝากโอน lanes).
 *
 * Format: `TIV{yyMM}-{NNNNN}` — e.g. `TIV2606-00001`. Counter is monthly,
 * SHARED across shop + yuan (one RD-running tax-invoice sequence for the two
 * lanes; forwarder runs its own FRC/FRG sequence via mintReceiptDocNo). The
 * `service_type` + `is_juristic` columns on the row distinguish the customer
 * class — the SERIAL itself is a single continuous tax-document number, which
 * is what an RD ใบกำกับภาษี register wants (no per-class bifurcation).
 *
 * `tb_shop_tax_invoice.serial_no` IS a partial-unique index (where serial_no
 * is not null), so a concurrent double-mint would 23505 on insert. The caller
 * (lib/admin/shop-tax-invoice.ts / yuan-tax-invoice.ts) is idempotent on the
 * source order anyway (one invoice per hno / payment_id), so the realistic
 * collision surface is two DIFFERENT orders minting in the same month at the
 * exact same instant — rare; the issuer logs + leaves serial_no null on the
 * (unlikely) clash rather than failing the invoice.
 *
 * @throws Never — on lookup error returns `TIV{yyMM}-00001`; the caller decides
 *         whether to retry. See AGENTS.md §0c.
 */
export async function mintTaxInvoiceDocNo(
  admin: SupabaseClient,
  opts: { issueDate: Date },
): Promise<string> {
  const yyMm = yyMmTokenForDate(opts.issueDate);
  const matchPattern = `TIV${yyMm}-%`;

  const { data, error } = await admin
    .from("tb_shop_tax_invoice")
    .select("serial_no")
    .ilike("serial_no", matchPattern)
    .order("serial_no", { ascending: false })
    .limit(1)
    .maybeSingle<{ serial_no: string | null }>();

  if (error) {
    console.error(`[mintTaxInvoiceDocNo] tb_shop_tax_invoice lookup failed`, {
      code: error.code,
      message: error.message,
      yyMm,
    });
  }

  if (!data?.serial_no) {
    return `TIV${yyMm}-00001`;
  }

  const lastSuffix = data.serial_no.slice(-5);
  const lastSeq = Number.parseInt(lastSuffix, 10);
  const nextSeq = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1;
  const nextSuffix = String(nextSeq).padStart(5, "0");

  return `TIV${yyMm}-${nextSuffix}`;
}
