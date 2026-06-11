# ADR-0027 — Tax-invoice Source of Truth: World-B (`tb_*`) is canonical

**Status:** Accepted · 2026-06-02
**Deciders:** Owner (พี่ป๊อป) · เดฟ (integrator)
**Supersedes (for forwarder customer-request):** ADR-0006 World-A request path
**Refs:** big-audit-2026-06-01 §U8 · ADR-0006 (tax-invoice flow) · ADR-0015 (WHT model) · ADR-0026 (commission repoint) · `docs/research/tax-billing-flow-design-2026-05-30.md`

---

## Context — two tax-invoice worlds coexisted

The faithful-port era left **two parallel ใบกำกับภาษี (RD Code 86) implementations** in the codebase, keyed off the two coexisting schema families (CLAUDE_TECHNICAL.md "two coexisting worlds"). Prod row counts (2026-06-01): rebuilt `forwarders` = **0 rows**, `tb_forwarder` = **47,636**, `tb_receipt` = **13,789**.

### World-A — rebuilt, profiles-based — **DEAD for real customers**
- Tables: `tax_invoices` (migration 0034) + `tax_invoice_lines` + `withholding_tax_entries` (0044).
- `tax_invoices.profile_id → profiles(id)` NOT NULL · `tax_invoices.forwarder_f_no → forwarders(f_no)` (the **rebuilt, 0-row** table).
- `withholding_tax_entries` enforces **one row per order** with a single `wht_rate_pct ∈ {1,1.5,2,3,5}`.
- Customer entry: `actions/tax-invoices.ts:requestTaxInvoice` → reads rebuilt `forwarders`/`service_orders`/`yuan_payments` and writes `tax_invoices`. **Every real (legacy) customer fails** — they have no rebuilt-table row and usually no `profiles` row.
- Admin: `actions/admin/tax-invoices.tsx` + `/admin/tax-invoices`. Reads dead `tax_invoices` → near-empty.

### World-B — ภูม's, `tb_*`-native — **LIVE**
- Tables: `tb_forwarder_tax_invoice` (+ `_item` + `tb_forwarder_wht_entry`) (migration 0129).
- Keys off `tb_forwarder.id` (bigint) + `tb_users.userID` (text). Buyer snapshot from `tb_corporate`/`tb_users`.
- Engine: `lib/admin/forwarder-tax-invoice.ts:issueForwarderTaxInvoice(admin, opts)` — **idempotent on `fids`** (re-issue returns `alreadyIssued`), per-CLASS WHT (transport 1% · service 3% · rental 5% · goods 0% co-existing on one order — which the single-rate World-A row cannot represent), VAT 7% on the vatable base, intl leg zero-rated.
- Auto-issued at forwarder payment-land by `lib/admin/auto-issue-receipt.ts` when `tb_forwarder.tax_doc_pref='tax_invoice'`.
- Read by `/admin/accounting/etax` + `/admin/accounting/wht-certs`.

---

## Decision

1. **World-B (`tb_*`) is the canonical tax-invoice store.** All live-customer tax-invoice issuance + reads go through `tb_forwarder_tax_invoice` family.
2. **The forwarder customer-request path is rewired to World-B now.** `actions/tax-invoices.ts:requestTaxInvoice` (forwarder branch) reads `tb_forwarder` by numeric `id`, gates ownership on `tb_forwarder.userid == profile.member_code`, and **calls `issueForwarderTaxInvoice` (idempotent)** instead of writing World-A `tax_invoices`. The customer-request panel moves onto the working `/service-import/[fNo]/invoice` page (the old `…/receipt` orphan is now a redirect).
3. **Shop (`tb_header_order`) + yuan (`tb_payment`) customer-request are DEFERRED behind a banner.** World-B currently has **no cross-type tax-invoice table** — only forwarder. Rather than keep reading the dead rebuilt twins (which fail for real customers), these branches return a friendly `not_yet_supported` result the panel renders as a banner ("ใบกำกับภาษีฝากสั่งซื้อ/ฝากโอน กำลังพัฒนา — แจ้งทีมงาน"). No crash, no silent dead-write.
4. **World-A is NOT deleted** — `/admin/tax-invoices` + `actions/admin/tax-invoices.tsx` stay (legacy/freight rows may exist) but get a top banner pointing accounting staff to `/admin/accounting/etax` for real-customer invoices.
5. **The dead forwarder receipt orphan stack is removed** (the ADR companion fix): `app/[locale]/(protected)/service-import/[fNo]/receipt/page.tsx` (read rebuilt `forwarders` → 404 for every real order) → one-line redirect to `…/invoice`; its only-consumer PDF route + PDF component + `getForwarderByNo` action deleted.

---

## Consequences

- Real (legacy) forwarder customers can now request + receive a ใบกำกับภาษี — previously a guaranteed 404/fail.
- Forwarder tax-invoice issuance is idempotent: customer-request and the auto-receipt hook both call the same `issueForwarderTaxInvoice` → no double issuance for one `fid`.
- Shop + yuan customers see an honest "coming soon" banner instead of a green-toast dead-write or a 404.
- Two code paths still exist for forwarder issuance (customer-request + auto-receipt), but they converge on one engine + one store → safe.

## Open questions for ภูม (World-B follow-ups — NOT in this change)

1. **Serial numbering.** `issueForwarderTaxInvoice` leaves `serial_no = null` unless a pre-minted serial is passed. The e-Tax XML hook (`/admin/accounting/etax`) reads `serial_no` — so customer-requested invoices issued with null serial need a minting step before e-Tax export. Decide: mint at issuance (reuse the FRC/FRG/INV-YYYYMM family) vs mint at e-Tax export time.
2. **WHT-cert gate.** World-A blocked issuance until the 50-ทวิ cert was received (`withholding_tax_entries.cert_status`). World-B **issues immediately + tracks the cert separately** (`tb_forwarder_wht_entry.cert_status='pending'`). Confirm this is the desired policy (issue-then-chase-cert) vs World-A's gate-then-issue. Owner leaned toward separate tracking (the wht-certs hub exists).
3. **Cross-type table for shop + yuan.** To un-defer shop/yuan, pick:
   - **Option A** — a generic `tb_tax_invoice` keyed by `userid` + nullable `fid` / `hno` / `payment_id` (one table, type-discriminated). Simpler reporting; one e-Tax export.
   - **Option B** — per-type tables mirroring `tb_forwarder_tax_invoice` (e.g. `tb_shop_tax_invoice`, `tb_yuan_tax_invoice`). More tables, but each stays type-native like the forwarder one.
   Recommendation: Option A if the per-CLASS WHT model generalises cleanly across types; otherwise B.

---

## 📌 STATUS ADDENDUM — 2026-06-10 (reconciliation with shipped reality)

> The **core decision still holds** (World-B `tb_*` is the canonical tax-invoice store) — this is an *addendum*, not a rewrite. Three of this ADR's open items + one of its "do NOT delete" stances have since been resolved by the shipped code; recording the deltas for the trail:

1. **Open Question #3 (cross-type table for shop + yuan) — RESOLVED via Option B.** Migration **`0152_shop_yuan_tax_invoice.sql`** added **`tb_shop_tax_invoice`** (+ `_item`) for ฝากสั่งซื้อ (`tb_header_order`) and the yuan (`tb_payment`) lane — per-type tables mirroring `tb_forwarder_tax_invoice` (the explicit Option-B choice). So §3's "coming soon" deferral is **lifted at the schema/engine level** — but issuance **ships DORMANT** behind `business_config tax_invoice.shop_yuan_enabled` (owner flips it ONLY after the ใบขน VAT-base sign-off + a TEST-order money-loop).

2. **§4 "World-A is NOT deleted" — SUPERSEDED 2026-06-10.** The World-A `tax_invoices` (0034) family was confirmed a **0-row DEAD TWIN with no live producer** (`requestTaxInvoice`/`issueTaxInvoice` only UPDATE; the sole INSERT was a credit-note clone). The 2026-06-10 **dead-twin integrity arc** retired it end-to-end: `/admin/tax-invoices` list+[id] now redirect to the live `/admin/accounting/etax` hub; `/admin/accounting/documents` + `/admin/search` + the PDF route were repointed to the live `tb_*` union; the orphaned World-A action/export/buttons were removed (**`wht-panel.tsx` KEPT** — it's a live freight-shipment dep); the period-close snapshot was forward-fixed to the `tb_*` union; and **migration `0172`** extends the 0056 `accounting_period_freeze_check()` to FREEZE both live tax-invoice stores on period close. (No backfill was needed — prod had 0 closed periods + 0 issued invoices.)

3. **Live stores (current SOT):** `tb_forwarder_tax_invoice` (forwarder · mig 0129) + `tb_shop_tax_invoice` (shop + yuan · mig 0152), serial_no-keyed, `gross_before_wht` = VAT-incl total; `_wht_entry` children stay mutable for the 50-ทวิ cert chase even when the header is frozen.

4. **Migration numbering:** NEXT FREE = **`0174`** (0173 = count_forwarder_by_owner RPC, pending-apply; 0065/0168 are intentional gaps). The migration ledger is the SOT for numbers.

The faithful tax-invoice SOT is now fully on World-B with the dead twin retired + frozen-on-close. See the CLAUDE.md 2026-06-10 save-point + [`docs/learnings/pacred-cargo-tax-invoice-flow.md`](../learnings/pacred-cargo-tax-invoice-flow.md).
