/**
 * Tax invoice — typed shapes matching migration 0034_tax_invoices.sql.
 *
 * Customer (juristic OR personal-with-tax-ID) requests; admin (super
 * OR accounting per ADR-0005 K-7) issues. Once `status='issued'`, the
 * header row is immutable (Thai Revenue Department Code 86 compliance).
 *
 * **Status: SCAFFOLD only.** Implementation actions (`requestTaxInvoice`,
 * `issueTaxInvoice`, `cancelTaxInvoice`) are ภูม's T-P4 G2b/G2c/G2e work.
 * These types unblock her from re-deriving the contract from schema.
 *
 * @see docs/decisions/0006-tax-invoice-flow.md
 * @see supabase/migrations/0034_tax_invoices.sql
 * @see docs/decisions/0014-customer-self-service-state-transitions.md
 *      (Customer-initiated request follows the admin-client-after-ownership-verify
 *      pattern — `requestTaxInvoice` should mirror `payServiceOrderFromWallet`.)
 */

// ── Enums (match CHECK constraints in 0034) ─────────────────────────

export type TaxInvoiceStatus =
  | "pending"      // customer requested; admin not yet issued
  | "issued"       // admin issued; serial + PDF generated; IMMUTABLE
  | "cancelled";   // admin cancelled (after issuance) — see credit-note pattern below

export type VatMode =
  | "inclusive"    // total includes VAT 7% (default; retail-style)
  | "exclusive";   // total + VAT separate (B2B enterprise request)

// ── Parent-order discriminator ──────────────────────────────────────
// Per CHECK constraint `tax_invoices_one_parent_order`, exactly one of
// these must be set (not both, not neither).

export type ParentOrderRef =
  | { kind: "service_order"; h_no:  string }
  | { kind: "forwarder";     f_no:  string };

// ── Row shapes (match SELECT * column order in 0034) ────────────────

export interface TaxInvoiceRow {
  id:                 string;
  profile_id:         string;

  // Parent order (exactly one set)
  order_h_no:         string | null;
  forwarder_f_no:     string | null;

  // Buyer snapshot at issuance (IMMUTABLE — RD Code 86)
  buyer_name:         string;
  buyer_address:      string;
  buyer_tax_id:       string;
  buyer_branch:       string;       // default "สำนักงานใหญ่"

  // Issuance state
  status:             TaxInvoiceStatus;
  serial_no:          string | null;            // INV-YYYYMM-NNNN (null while pending)
  issued_at:          string | null;            // ISO datetime
  issued_by_admin:    string | null;

  // Financial snapshot (frozen at issuance)
  subtotal_thb:       number;
  vat_thb:            number;
  total_thb:          number;
  vat_mode:           VatMode;
  payment_method:     string;       // free text: "PromptPay", "Bank Transfer", "Wallet", ...

  // Storage
  pdf_storage_path:   string | null;            // "{profile_id}/{INV-...}.pdf"

  // Cancellation
  cancelled_at:        string | null;
  cancelled_by_admin:  string | null;
  cancellation_reason: string | null;
  credit_note_id:      string | null;           // self-ref when this row IS a credit note

  // Meta
  created_at:         string;
  updated_at:         string;
}

export interface TaxInvoiceLineRow {
  id:              string;
  tax_invoice_id:  string;
  position:        number;
  description:     string;
  qty:             number;
  unit_price_thb:  number;
  amount_thb:      number;
  vat_thb:         number;
  created_at:      string;
}

// Combined fetch — header + ordered lines (for PDF + detail page)
export interface TaxInvoiceWithLines extends TaxInvoiceRow {
  lines: TaxInvoiceLineRow[];
}

// ── Form payloads (ภูม wires actions against these) ────────────────

/**
 * Customer-side form payload — `requestTaxInvoice` Server Action accepts this.
 *
 * Implementation contract (ADR-0014 pattern):
 *   1. Auth check + identify auth.uid()
 *   2. RLS-fetch parent order, verify ownership + status (must be
 *      'completed' for service_order; must be 'delivered' for forwarder)
 *   3. Idempotency: reject if tax_invoices row already exists for
 *      (profile_id, parent_ref) with status in ('pending','issued')
 *   4. Fetch buyer snapshot from `corporate` (juristic) or `profiles`
 *      (personal-with-tax-ID) — fail if tax_id missing
 *   5. Admin client INSERT into tax_invoices (status='pending')
 *   6. Notify admins via sendNotification (notify template: `notify.taxInvoiceRequested`)
 *   7. revalidatePath on the receipt page + admin tax-invoices list
 */
export interface RequestTaxInvoiceInput {
  parent:         ParentOrderRef;
  vat_mode:       VatMode;             // 'inclusive' (default) or 'exclusive'
  payment_method: string;              // free text — UI offers presets but value is server-trusted
}

/**
 * Admin-side issuance — `adminIssueTaxInvoice` Server Action accepts this.
 *
 * Implementation contract:
 *   1. `withAdmin(['super', 'accounting'])` per ADR-0005 K-7
 *   2. Validate tax_invoice row exists + status='pending'
 *   3. Reserve serial via `next_tax_invoice_serial()` Postgres function
 *      (security definer; atomic; gives INV-YYYYMM-NNNN)
 *   4. Generate PDF via `@react-pdf/renderer` + Sarabun font + new
 *      `components/pdf/tax-invoice.tsx` template (fork from forwarder-receipt)
 *   5. Upload to `tax-invoices/` Storage bucket at `{profile_id}/{serial_no}.pdf`
 *   6. UPDATE tax_invoices: status='issued', serial_no, issued_at,
 *      issued_by_admin, pdf_storage_path
 *   7. logAdminAction(adminId, "tax_invoice.issue", "tax_invoice", id, { serial_no })
 *   8. sendNotification(profile_id, notify.taxInvoiceIssued({ serial_no }))
 *   9. revalidatePath on receipt + admin pages
 */
export interface IssueTaxInvoiceInput {
  tax_invoice_id: string;
}

/**
 * Admin-side cancellation — `adminCancelTaxInvoice` Server Action accepts this.
 *
 * Once status='issued', the row is IMMUTABLE per RD Code 86. To "correct"
 * an issued invoice:
 *   1. Cancel: status='issued' → 'cancelled'; stamp cancelled_at, _by_admin,
 *      _reason; PDF stays in Storage with watermark applied at re-render
 *   2. Issue credit note (ใบลดหนี้): admin creates a NEW tax_invoices row
 *      with negative line amounts + credit_note_id pointing to the cancelled
 *      original; new serial (different month possibly)
 *   3. (Optional) Issue corrected invoice — fresh row, fresh serial
 */
export interface CancelTaxInvoiceInput {
  tax_invoice_id: string;
  reason:         string;       // required — audit trail
}

// ── Buyer-snapshot helper (for UI prefill) ──────────────────────────
//
// Fetched from `corporate` (juristic) OR `profiles` (personal with tax_id)
// at form-render time so the customer SEES what will be locked into the
// immutable header.

export interface BuyerSnapshot {
  buyer_name:    string;
  buyer_address: string;
  buyer_tax_id:  string;
  buyer_branch:  string;        // default "สำนักงานใหญ่"
}

// ── Result type (for action returns) ────────────────────────────────

export type TaxInvoiceActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };
