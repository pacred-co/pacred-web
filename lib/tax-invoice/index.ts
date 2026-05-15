/**
 * Tax invoice — public surface for callers.
 *
 * Import from `@/lib/tax-invoice` (not the individual files) so internal
 * refactors stay invisible.
 *
 * Currently exports only **types** (scaffold per ADR-0006 + 0034 migration).
 * Action skeletons (`requestTaxInvoice`, `adminIssueTaxInvoice`, `adminCancelTaxInvoice`)
 * are ภูม's T-P4 G2b/G2c/G2e work — those land in `actions/tax-invoice.ts`
 * (customer) + `actions/admin/tax-invoices.ts` (admin) following the
 * ADR-0014 pattern.
 *
 * @see docs/decisions/0006-tax-invoice-flow.md
 * @see docs/decisions/0014-customer-self-service-state-transitions.md
 */

export type {
  TaxInvoiceStatus,
  VatMode,
  ParentOrderRef,
  TaxInvoiceRow,
  TaxInvoiceLineRow,
  TaxInvoiceWithLines,
  RequestTaxInvoiceInput,
  IssueTaxInvoiceInput,
  CancelTaxInvoiceInput,
  BuyerSnapshot,
  TaxInvoiceActionResult,
} from "./types";
