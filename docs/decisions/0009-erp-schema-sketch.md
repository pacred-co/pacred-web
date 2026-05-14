# ADR-0009 — DPX ERP schema sketch (Phase 2)

**Status:** Draft (P-37 — discussion fodder, not implementation contract)
**Date:** 2026-05-16
**Phase:** Sprint 7+ Track D
**Owner:** เดฟ + ภูม + ก๊อต

> Builds on [ADR-0008](0008-dpx-erp-phase-2.md). Per P-37 acceptance:
> "List candidate tables — mark which reuse phase-1 tables, which are new.
> Sketch FK relationships. Discussion fodder, not implementation."
> Each section deliberately stops at "skeleton + open questions" — no
> migrations land from this ADR.

---

## Reading guide

For each Phase-2 module, we list:

- **New tables** — fresh schema; not in Phase 1
- **Reuses (read-only)** — Phase 1 tables this module READs without modifying
- **Reuses (extends)** — Phase 1 tables this module would ADD columns to
- **Storage buckets** — Supabase Storage spaces
- **Open Qs** — design questions that need stakeholder input before DDL

---

## M1 — HR Payroll (extends HR)

Per [ADR-0005 K-5](0005-launch-operational-decisions.md) → extends existing
HR module at `/admin/hr/*`.

**New tables:**
- `payroll_periods` — one row per pay period (typically monthly). Columns:
  `id`, `period_yyyymm`, `status` (`open|locked|paid`), `pay_date`,
  `locked_at`, `locked_by_admin`.
- `payroll_lines` — one row per employee per period. Columns:
  `id`, `payroll_period_id` (FK), `profile_id` (FK), `base_thb`,
  `overtime_thb`, `bonus_thb`, `deduction_sso_thb` (Social Security
  Office), `deduction_tax_thb` (PND.91 withholding), `net_thb`,
  `created_at`.
- `payroll_paystubs` — generated PDF per `payroll_lines` row. Same
  pattern as `tax_invoices.pdf_storage_path` from ADR-0006. Columns:
  `payroll_line_id` (PK FK), `pdf_storage_path`, `issued_at`.

**Reuses (extends):**
- `admin_contact_extras` (1-1 with `admins`) gains: `base_salary_thb`,
  `bank_acct_number`, `bank_name`, `bank_branch`, `national_id`,
  `tax_id` (for PND filing).

**Reuses (read-only):**
- `admins`, `admin_attendance_logs` (to compute overtime), `admin_leaves`
  (to deduct leave-related days).

**Storage:** new bucket `payroll-paystubs/` — RLS = `auth.uid() = payroll_line.profile_id` OR `is_admin(["accounting"])`.

**Open Qs:**
- Q1: Period type — strictly monthly, or support semi-monthly / bi-weekly?
- Q2: Tax bracket table — static (one table) or per-year (history)?
- Q3: Pay slip language — Thai-only or bilingual? Affects template work.

---

## M2 — WHT certificates (extends accounting)

Builds on [ADR-0006 §8](0006-tax-invoice-flow.md). Tax invoice ADR
explicitly defers WHT.

**New tables:**
- `wht_certificates` — one row per withholding instance. Columns:
  `id`, `profile_id` (the customer/vendor whose tax is withheld),
  `category` (`50-1` / `50-2` / `50-3` etc., per Section 50 of RD Code),
  `service_description`, `gross_thb`, `wht_pct` (1.0 / 3.0 / 5.0),
  `wht_thb`, `period_yyyymm`, `serial_no` (separate generator
  `WHT-YYYYMM-NNNN`), `status` (`pending|issued|cancelled`), `issued_at`,
  `pdf_storage_path`.
- `wht_seq` — counter table mirroring `tax_invoice_seq` from ADR-0006.
- `wht_pnd_53_filings` — monthly aggregate filing. Columns:
  `period_yyyymm` (PK), `total_gross_thb`, `total_wht_thb`,
  `filing_pdf_path`, `filed_at`, `filed_by_admin`.

**Reuses (read-only):**
- `tax_invoices` — the source transaction the WHT is computed on.

**Storage:** new bucket `wht-certs/` — owner-only + admin access.

**Open Qs:**
- Q1: WHT issuance timing — at payment, at invoice issuance, or admin manual? Affects UX in admin tax-invoice page.
- Q2: PND.53 vs PND.3 — PND.3 is for personal payees, PND.53 for juristic. Need both, or just PND.53 for B2B-first launch?

---

## M3 — Customs broker matching (Service #1)

Fresh — no Phase 1 analog. Customer requests a customs broker; brokers
respond; customer picks; agreement signed.

**New tables:**
- `customs_brokers` — vendor directory. Columns: `id`, `name`,
  `license_no`, `phone`, `email`, `address`, `specialty` (text[],
  e.g., `["food","cosmetics"]`), `verified` (bool — admin-vetted),
  `rating_avg` (denorm from reviews), `created_at`.
- `broker_match_requests` — customer-initiated request. Columns:
  `id`, `profile_id` (customer), `shipment_description`, `hs_code`,
  `port_arrival`, `estimated_value_thb`, `created_at`, `status`
  (`pending|matched|cancelled`).
- `broker_match_offers` — broker response. Columns: `id`,
  `request_id` (FK), `broker_id` (FK), `quoted_fee_thb`, `lead_time_days`,
  `note`, `created_at`, `selected_at` (null until customer picks).
- `broker_engagements` — finalised match → contract. Columns: `id`,
  `request_id` (1-1), `selected_offer_id` (FK), `contract_pdf_path`,
  `signed_at`, `signed_by_customer`, `signed_by_broker`.

**Reuses (read-only):**
- `profiles`, `forwarders` (broker engagement may attach to a
  forwarder when import-side).

**Storage:** new bucket `broker-contracts/`.

**Open Qs:**
- Q1: How do brokers see requests? Email digest? Logged-in portal?
  Affects authentication needs for vendor side.
- Q2: Rating system — 5-star reviews after engagement closes?

---

## M4 — Customs clearance tracking (Service #6)

Builds on existing customs hero/landing work (ปอน Phase A — already
ships at `/services/customs-clearance-shipping-suvarnabhumi`).
Backend tracking is new.

**New tables:**
- `customs_clearances` — each clearance case. Columns: `id`,
  `profile_id`, `forwarder_id` (FK if attached to existing import),
  `port`, `airline_or_carrier`, `awb_or_bl_number`, `arrival_at`,
  `cargo_description`, `hs_codes` (text[]), `declared_value_thb`,
  `duty_thb`, `vat_thb`, `status` (`incoming|customs_inspection|paid|released|delivered`),
  `released_at`.
- `customs_clearance_documents` — uploads per clearance. Columns:
  `id`, `clearance_id` (FK), `doc_type` (`commercial_invoice` /
  `packing_list` / `bl_awb` / `permit_X` / etc.), `storage_path`,
  `uploaded_at`, `verified_at`, `verified_by_admin`.
- `customs_clearance_status_history` — admin-driven timeline. Columns:
  `id`, `clearance_id`, `from_status`, `to_status`, `note`,
  `changed_at`, `admin_id`.

**Reuses (extends):**
- `forwarders` gains optional `customs_clearance_id` FK so cargo
  shipments can attach a clearance case.

**Storage:** new bucket `customs-clearance-docs/`.

**Open Qs:**
- Q1: Customer self-upload of customs docs or admin-only? Most legacy
  systems are admin-only; customers email scans. Web upload modernises.
- Q2: Status enum granularity — match Thai Customs' "Green Lane / Yellow
  Lane / Red Lane" inspection terminology?

---

## M5 — Tax refund (Service #5)

Pacred files tax refund on customer's behalf.

**New tables:**
- `tax_refund_claims` — one row per claim. Columns: `id`, `profile_id`,
  `tax_type` (`vat_export` / `import_duty_drawback` / `wht_credit` /
  `corporate_loss_carry`), `period_yyyymm`, `claimed_thb`,
  `status` (`drafting|submitted|under_review|approved|rejected|paid`),
  `submitted_at`, `rd_case_number` (assigned by Revenue Department),
  `approved_thb`, `paid_at`.
- `tax_refund_documents` — supporting docs.

**Reuses (read-only):**
- `tax_invoices`, `wht_certificates` (the evidence the claim is based on).

**Storage:** new bucket `tax-refund-docs/`.

**Open Qs:**
- Q1: Pacred files on customer's behalf (POA needed) — store POA copy?
- Q2: RD case-number format varies by tax type — needs flexible storage.

---

## M6 — Export (Service #9)

Mirror of `forwarders` (import) but outbound. Shares much of the rate
engine + transport types.

**New tables:**
- `exports` — outbound shipping requests. Columns nearly identical to
  `forwarders` but `source_warehouse` is in Thailand, `destination_country`
  + `destination_port` are abroad. `incoterm` (`FOB|CIF|EXW|DDP|DAP`),
  `customs_export_declaration_pdf_path`.

**Reuses (extends):**
- `lib/forwarder/calc-price.ts` rate engine extended with export rates
  (different per-country tariff structure).

**Storage:** new bucket `export-docs/` (commercial invoices, packing
lists, export licences).

**Open Qs:**
- Q1: Same table or separate? `forwarders` table already covers
  bidirectional in theory if we add `direction='import'|'export'`. Or
  keep them separate for cleaner RLS + UI?
- Q2: How does export interact with `customs_clearances`? Outbound
  customs is a separate process from inbound; might warrant its own
  `customs_export_declarations` table.

---

## M7 — Fumigation (Service #10)

Container/pallet fumigation booking + certificate issuance.

**New tables:**
- `fumigation_bookings` — one row per fumigation job. Columns:
  `id`, `profile_id`, `forwarder_id` (FK — usually attached to a
  shipment), `cargo_description`, `treatment_type` (`MB|HT|other`),
  `scheduled_at`, `vendor_id` (FK to `customs_brokers` or new
  `fumigation_vendors`), `status` (`booked|treated|certificate_issued`),
  `certificate_no`, `certificate_pdf_path`.

**Reuses (read-only):**
- `forwarders` (the cargo being fumigated).

**Storage:** new bucket `fumigation-certs/`.

**Open Qs:**
- Q1: Vendors — reuse `customs_brokers` table (rename "vendor directory")
  or a separate `fumigation_vendors`? Recommend the latter — different
  certification requirements.

---

## M8 — Consignment (Service #11)

Customer consigns goods to Pacred; Pacred sells; commission to customer.

**New tables:**
- `consignment_agreements` — Customer ↔ Pacred contract. Columns:
  `id`, `profile_id` (consignor), `commission_pct`, `pacred_fee_pct`,
  `agreement_pdf_path`, `signed_at`, `expires_at`.
- `consignment_inventory` — SKU registry tied to agreement. Columns:
  `id`, `agreement_id` (FK), `sku`, `description`, `qty_on_hand`,
  `unit_price_thb`, `warehouse_location`, `received_at`.
- `consignment_sales` — sales out of inventory. Columns: `id`,
  `agreement_id` (FK), `sku` (FK), `qty`, `sale_price_thb`,
  `commission_to_consignor_thb`, `pacred_fee_thb`, `sold_at`.

**Reuses (extends):**
- `wallet` flows — consignor commission lands in their wallet.

**Storage:** new bucket `consignment-agreements/`.

**Open Qs:**
- Q1: Warehouse scanning — barcode flow exists in admin (`barcode-c-*`
  legacy). Can consignment reuse, or needs separate scanning UI?

---

## M9 — Bill payment / pay-on-behalf (Service #12)

Customer asks Pacred to pay a bill (e.g., supplier in China, utility,
import duty in advance). Pacred pays + customer reimburses via wallet.

**New tables:**
- `bill_payment_requests` — Columns: `id`, `profile_id`, `payee`
  (free text or `vendor_id`), `amount_thb`, `reason`, `proof_path`
  (invoice from payee), `status` (`pending|approved|paid|reimbursed`),
  `paid_at`, `reimbursed_at`.

**Reuses (extends):**
- `wallet` — debit on reimbursement.

**Storage:** new bucket `bill-payment-proofs/`.

**Open Qs:**
- Q1: Approval threshold — auto-approve below ฿X, manual above?

---

## M10 — Logistics + messenger (Service #13)

Domestic delivery + courier between Pacred-managed points + customer.

**New tables:**
- `logistics_orders` — Columns: `id`, `profile_id`, `pickup_address`,
  `delivery_address`, `parcel_description`, `weight_kg`, `dimensions_cm`,
  `service_level` (`standard|express|same_day`), `messenger_id`,
  `status` (`booked|picked_up|in_transit|delivered`), `proof_of_delivery_path`.

**Reuses (extends):**
- `forwarder_driver` — could double as messenger pool. Currently
  forwarder-only; consider widening enum + reusing.

**Storage:** new bucket `logistics-pods/` (proof-of-delivery photos).

**Open Qs:**
- Q1: Reuse `forwarder_driver` table or new `messengers`? Recommend
  reuse — same RBAC, same scheduling.

---

## M11 — Vendor management

Cross-cutting — used by M3 (brokers), M7 (fumigation), M6 (export
agents), M9 (payees).

**New tables:**
- `vendors` — superset of `customs_brokers` + `fumigation_vendors` +
  others. Columns: `id`, `name`, `category` (`broker|fumigation|carrier|payee|other`),
  `contact_*`, `license_no` (where applicable), `bank_acct`, `created_at`,
  `verified_at`.
- `vendor_engagements` — generic contract table. Columns: `id`,
  `vendor_id`, `profile_id` (if Pacred-customer relationship) OR
  `pacred` (when Pacred is the engager), `service_type`, `start_at`,
  `end_at`, `contract_pdf_path`.

**Reuses (extends):**
- Replaces `customs_brokers` if we go with the unified-vendor design.

**Open Qs:**
- Q1: Unify into `vendors` OR keep per-domain tables? Unified = easier
  vendor directory UI but harder per-domain field validation.

---

## M12 — Accounts payable

Currently Pacred is wallet-receivable-only. Phase 2 adds AP for paying
vendors (M11 connections).

**New tables:**
- `ap_invoices` — bills Pacred owes. Columns: `id`, `vendor_id`,
  `period_yyyymm`, `due_date`, `amount_thb`, `vat_thb`, `wht_thb`,
  `status` (`received|approved|paid|disputed`), `paid_at`,
  `payment_method`, `bank_txn_ref`.
- `ap_payments` — many-to-one with `ap_invoices` (partial payments OK).

**Reuses (read-only):**
- `payroll_lines` flows into `ap_payments` indirectly (employees are
  AP-style payees? Or separate? See Q below).

**Open Qs:**
- Q1: Employees handled via `ap_invoices` or kept in `payroll_lines`?
  Recommend separate (different regulatory regime — PND vs vendor invoices).

---

## M13 — Project / opportunity tracking (B2B sales pipeline)

For larger B2B deals where sales reps need to track pre-sale activity.

**New tables:**
- `opportunities` — Columns: `id`, `profile_id` (existing customer
  or stub), `sales_admin_id` (rep), `service_interest` (text[] of
  `service-import`, `customs-broker-matching`, etc.), `value_estimate_thb`,
  `stage` (`lead|qualified|proposal|negotiation|won|lost`),
  `next_action_at`, `created_at`, `closed_at`.
- `opportunity_activities` — touchpoint log. Columns: `id`,
  `opportunity_id`, `kind` (`call|email|meeting|note`), `summary`,
  `occurred_at`, `recorded_by_admin`.

**Reuses (read-only):**
- `profiles`, `admins`.

**Open Qs:**
- Q1: Lead-without-profile flow — stub `profile.status='lead'` row OR
  separate `leads` table? Profile stub is simpler but pollutes
  customer counts.

---

## M14 — Inventory beyond cargo

Generalises consignment + Pacred-owned warehouse stock.

**New tables:**
- `warehouses` — locations. Columns: `id`, `name`, `address`,
  `type` (`pacred_owned|consignor|customer_3pl`).
- `sku_inventory` — Columns: `id`, `sku`, `warehouse_id`,
  `consignment_agreement_id` (nullable; if set = consignment, else
  Pacred-owned), `qty_on_hand`, `last_counted_at`.
- `inventory_movements` — Columns: `id`, `sku`, `warehouse_id`,
  `qty_delta` (negative = out), `reason` (`receive|sale|transfer|adjust`),
  `reference_id` (free FK to consignment_sales / logistics_orders / etc.),
  `occurred_at`, `recorded_by_admin`.

**Open Qs:**
- Q1: SKU uniqueness — global or per-warehouse?
- Q2: Stock alerts — at low-stock threshold? Surfaces as admin
  notification (LINE push?).

---

## Relationship summary

```
Phase 1 core                Phase 2 extensions
─────────────────────       ────────────────────────────
profiles ────────► admins ──► admin_contact_extras (+payroll fields)
       │           │
       │           └► payroll_lines ──► payroll_paystubs
       │
       ├──► forwarders ──► customs_clearances ──► customs_clearance_documents
       │       │
       │       └► fumigation_bookings ──► fumigation_certs
       │
       ├──► tax_invoices ─► wht_certificates ──► wht_pnd_53_filings
       │
       ├──► consignment_agreements ──► consignment_inventory ──► consignment_sales
       │
       ├──► bill_payment_requests
       ├──► logistics_orders
       ├──► tax_refund_claims
       │
       └──► opportunities ──► opportunity_activities
                │
                └► sales_admin_id (admins)

(cross-cutting)
vendors ─────────► vendor_engagements
broker_match_requests ──► broker_match_offers ──► broker_engagements
ap_invoices ──► ap_payments

warehouses ──► sku_inventory ──► inventory_movements
```

## Phase-1-implication take-aways

(carried forward to Phase 1 implementation guidance per
[ADR-0008 §"Implications for Phase 1"](0008-dpx-erp-phase-2.md)):

- **Don't make `forwarders` cargo-import-specific** — Phase 2 export
  uses the same shape. Decide whether to extend with `direction` enum or
  spawn separate `exports` table when M6 ships.
- **`vendors` table eventually subsumes specialty tables** — but build
  domain-specific tables first; refactor later when patterns are clear.
- **Numbering generators are a pattern** — Phase 1 already has `f_no`
  (forwarders), `h_no` (service orders), Phase 2 adds `INV-` (tax
  invoices), `WHT-` (WHT certs). Build a generic
  `next_sequential(prefix, period)` helper to deduplicate.
- **Storage bucket pattern is repeatable** — every new module gets
  `<module>-<type>/` with owner-scoped RLS. Consider a `create_bucket(name)`
  migration helper.

## Total Phase-2 net-new objects (rough count)

- 30+ new tables
- 8-10 new storage buckets
- 4-5 new sequence generators
- 0 new auth providers (reuses Supabase + LINE LIFF + OAuth)
- ~5 new admin RBAC roles (per per-module recommendation from ADR-0008)

## Sequencing recommendation

If Pacred ships modules in this order, each Phase-2 sprint compounds value:

1. **G2** Tax invoice issuance (ADR-0006) — closes Phase 1 gap;
   foundational for M2 WHT
2. **M2** WHT certificates — unblocks B2B juristic customers
3. **M1** Payroll — internal value; team needs this anyway
4. **M3** Customs broker matching — first new customer-facing service
5. **M4** Customs clearance tracking — visible customer differentiator
6. **M10** Logistics + messenger — domestic delivery, broad audience
7. (rest) Stretch over 12-18 months as customer demand drives priority

## References

- ADR-0008 — Phase 2 overview + scope
- ADR-0006 — Tax invoice flow (M-pre-2 / Phase G2)
- ADR-0005 K-5 — Payroll extends HR (M1 housing decision)
- ADR-0002 — Admin architecture (frontend shell pattern for Phase 2)
- `/CLAUDE.md` § Pacred Ecosystem — service catalogue source
- Sprint 7+ Track D follow-ups: P-38 (ADR-0010 RBAC), P-39 (ADR-0011
  frontend shell), P-40 (ADR-0012 migration strategy)
