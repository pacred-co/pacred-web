# ADR-0008 — DPX ERP Phase 2 — initial design draft

**Status:** Draft (P-27 — initial ADR for stakeholder iteration)
**Date:** 2026-05-16
**Phase:** Sprint 7+ Track D
**Owner:** เดฟ + ก๊อต + ภูม + Pacred owner (Phase 2 scope = Pacred-owner-level decision)

> **This is a draft.** Per PORT_PLAN P-27 acceptance: "ADR file exists with
> sections + at least 2 open questions for stakeholders." Iterate after
> Pacred owner aligns on scope.

---

## Why this exists now

The Pacred team is wrapping Phase 1 (port the legacy PHP `pcs-cargo`
member portal + admin to Next.js + Supabase). Per `docs/team.md` §1
"Phase mapping" — once Phase 1 is stable, Phase 2 = "DPX ERP full
upgrade — ขยายเกินขอบเขต cargo เดิม" (expand beyond the cargo scope).

Without an early design draft, Phase 1 implementation choices that
foreclose Phase 2 options can sneak in. This ADR captures the
working hypothesis so:

1. Schema migrations for Phase 1 leave room for Phase 2 extensions
   without painful re-migrations.
2. RBAC + auth + storage decisions stay forward-compatible.
3. Stakeholders (Pacred owner + ก๊อต + ภูม) have a single doc to
   amend or reject — instead of holding the design in chat / verbal
   commitments.

## What "DPX ERP" means (working definition)

The legacy PHP system focused on **cargo / forwarding ops**:
- Shop order (fetch from 1688 / Taobao / Tmall)
- Yuan transfer (Alipay payments on customer's behalf)
- Forwarder (ฝากนำเข้า — cargo import from China to Thailand)
- Wallet (top-up + withdraw)
- Sales referral commission

DPX ERP (Phase 2) extends to the **broader Pacred ecosystem services**
already enumerated in `/CLAUDE.md` § "Pacred Ecosystem" — service catalogue:

- Service #1: Customs broker matching (YY)
- Service #5: Tax refund
- Service #6: Customs clearance (เคลียร์ติดด่าน)
- Service #7-8: Tax invoice + shipping declaration (some covered by ADR-0006)
- Service #9: Export
- Service #10: Fumigation
- Service #11: Consignment
- Service #12: Bill payment (ฝากจ่ายบริการ)
- Service #13: Logistics + messenger

Plus internal operational systems that the legacy PHP did NOT have:
- **Full HR + payroll** (extends current `/admin/hr/*` per ADR-0005 K-5)
- **Inventory beyond cargo** (warehouse SKU tracking decoupled from per-order)
- **Vendor management** (carriers, customs brokers, fumigation vendors,
  payment gateways — relationship + agreement tracking)
- **Accounts payable + receivable** (currently mostly receivable-only via
  wallet model)
- **Project / opportunity tracking** for B2B sales pipeline

> DPX as a name: not yet confirmed with Pacred owner. Working assumption
> "DPX" = "Document Processing eXpress" or similar. Confirm + commit to a
> stable name before public marketing.

## Scope (proposed)

### In scope for Phase 2

| Module | Why it belongs in ERP |
|---|---|
| Payroll | Already structured under HR per ADR-0005 K-5; payroll = aggregation over attendance + comp fields |
| Tax invoice issuance | Already speced per ADR-0006 K-8; ships in Phase G2 sub-sprint |
| WHT (withholding tax) certificates | Mentioned out-of-scope in ADR-0006 — natural Phase 2 follow-up |
| Customs broker matching | New surface (Service #1) — new schema, new approval workflow |
| Tax refund tracking | Service #5 — claim lifecycle workflow |
| Customs clearance | Service #6 — milestone tracking + document upload |
| Export | Service #9 — outbound shipping workflow (mirror import) |
| Fumigation | Service #10 — booking + certificate |
| Consignment | Service #11 — inventory + sales tracking + payout |
| Bill payment (pay-on-behalf) | Service #12 — pay-on-behalf workflow |
| Logistics + messenger | Service #13 — domestic + door-to-door |
| Inventory beyond cargo | Warehouse SKU tracking decoupled from per-order; supports consignment + fulfilment |
| Vendor management | Carriers + customs brokers + fumigation vendors etc. — relationship tracking |
| Project / opportunity tracking | B2B sales pipeline |
| Accounts payable | Currently wallet-receivable-only; add AP for vendor pay-outs |

### Out of scope (handled elsewhere or never)

- **General accounting GL / journal entries** — Pacred uses external
  accounting software (?). Phase 2 outputs feed into it, doesn't replace it.
- **HRIS competency / talent management** — beyond Pacred team size for the foreseeable future.
- **CRM beyond opportunity tracking** — Pacred sales rep relationships
  are simple enough not to warrant a full CRM.
- **Web storefront / marketplace** — Pacred markets services, not a SKU
  catalog. Landing pages cover marketing.

## Implications for Phase 1

Phase 1 (the PHP cargo port currently underway) should keep these in
mind so Phase 2 doesn't require painful re-migrations:

1. **Service order schema** (`service_orders`, `forwarders`, `yuan_payments`)
   — these are all "customer asks Pacred to do something" surfaces.
   Phase 2 services (customs broker, fumigation, export, etc.) follow
   the same pattern. Future-proof by:
   - Avoid hard-coding `service_orders` table to assume cargo-only
     fields. New services might warrant a `service_requests` parent
     table with per-service sub-tables. ภูม consider this when adding
     the next service to schema.
   - Use `text` enums for state machines (not Postgres ENUMs) so new
     states can land without `ALTER TYPE` migrations.
   - Receipt + tax-invoice PDF generation already abstracts via
     `@react-pdf/renderer` templates; new services can copy the
     pattern.
2. **Admin RBAC** — current 4 roles (`super`, `ops`, `accounting`,
   `sales_admin`) likely insufficient for Phase 2. Plan for **per-module
   role grants** rather than another flat enum (e.g., `customs_admin`,
   `fumigation_admin`). See P-38 ADR draft when scheduled.
3. **Customer profile** — Phase 1 profile has `account_type=
   personal|juristic`. Phase 2 juristic-with-many-services might need
   a `customer_orgs` parent (multiple users per company sharing services
   + invoices). Today's `tb_corporate` 1-1 mapping is fine; just don't
   foreclose multi-user.
4. **Storage buckets** — Phase 1 buckets (`member-docs`, `slips`,
   `forwarder-covers`, `avatars`, `resumes`, `carts`, `csv-imports`).
   Phase 2 will add (`fumigation-certs`, `customs-clearance-docs`,
   `bill-payment-slips`, etc.). Same RLS pattern (user-scoped folder).
5. **i18n** — every new module needs Thai + English keys per
   `docs/conventions.md` §7. Phase 2 modules should NOT introduce a
   third locale without ADR.

## Frontend shell decision (P-39 follow-up)

Two options to revisit when Phase 2 ships:

- **Option A**: Phase 2 modules under `/admin/dpx/*` route group in the
  same Next.js app. Reuses auth, design system, deploy.
- **Option B**: Separate Next.js app at `erp.pacred.co`. Bigger bundle
  isolation, but cross-app session + design + types duplicated.

Phase 1 already chose Option A for the cargo admin (ADR-0002). Default
recommendation = **Option A for Phase 2 too** unless bundle bloat
becomes a problem. ADR-0002's reasoning ports forward:

> Code reuse is high. Pacred team is small; one deploy pipeline is a
> feature not a bug. Route-segment code splitting means admin pages
> don't bloat customer bundles.

Re-evaluate if `/admin/*` bundle exceeds ~2 MB after Phase 2 ships.

## Open questions (for stakeholders)

> Per P-27 acceptance — at least 2 open questions for stakeholders.

1. **Q1 (Pacred owner)**: Is "DPX ERP" the locked product name? If yes, when
   should it be visible to customers (marketing site / admin chrome / docs)?
   If not, what's the working name? Marketing-facing name affects landing
   pages copy + employee onboarding docs.

2. **Q2 (Pacred owner + ก๊อต)**: Is the scope above (15+ modules)
   sequenced by priority, or all-or-nothing? Recommend phased rollout —
   pick 3-4 highest-revenue services first (customs broker matching,
   customs clearance, tax invoice issuance, export). Others stretch
   over 12-18 months.

3. **Q3 (ก๊อต + ภูม)**: Per-module RBAC roles — should each module own
   its own role gate (e.g., `customs_admin`, `fumigation_admin`), or
   should we extend existing 4 roles with permissions matrix?
   Per-module = clearer audit; matrix = fewer rows in `admins` table.

4. **Q4 (Pacred owner + เดฟ)**: External accounting software integration
   — what's Pacred's accounting stack today (Xero / QuickBooks /
   FlowAccount / local)? Phase 2 modules need to emit journal entries
   (or CSV exports) to that system; the choice affects integration
   work.

5. **Q5 (ก๊อต)**: Migration strategy for active customers during Phase 2
   transition — big-bang flip, feature-flag rollout, or service-by-service
   parallel? Affects schema migration approach + customer messaging.

## Future ADRs (Track D roadmap)

This ADR is intentionally high-level. Sub-ADRs already on the runway:

- **P-37 → ADR-0009**: ERP schema sketch — candidate tables + which
  reuse Phase 1 tables + FK relationships
- **P-38 → ADR-0010**: ERP auth + RBAC reuse — answers Q3 above
- **P-39 → ADR-0011**: ERP frontend shell decision — answers Option A vs B above
- **P-40 → ADR-0012**: ERP migration strategy — answers Q5 above

Schedule these for Sprint 7+. Each is ~2-4h.

## References

- `docs/team.md` §1 — Phase 1 / Phase 2 phase mapping
- `/CLAUDE.md` § "Pacred Ecosystem" — service catalogue used to derive scope
- ADR-0002 — admin architecture (Option A precedent for Phase 2 shell)
- ADR-0005 — K-5 payroll extends HR (Phase 2 module already locked)
- ADR-0006 — K-8 tax invoice flow (Phase G2 module, foundational for Phase 2 WHT)
- `docs/PORT_PLAN.md` Part O2 Sprint 7+ Track D — P-27 + P-37/38/39/40 roadmap
