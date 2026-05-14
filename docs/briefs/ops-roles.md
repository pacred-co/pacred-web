# Pacred staff role briefs (14 internal + partner side)

Last reviewed: 2026-05-16

> **For system designers** — ก๊อต, เดฟ, ภูม consult this when designing admin
> workspaces, RBAC, or workflows for STAFF. **Not** for daily coding rhythm
> (use [`got.md`](got.md) / [`dave.md`](dave.md) / [`poom.md`](poom.md) /
> [`podeng.md`](podeng.md) for that).
>
> Each section here: real-world responsibilities → admin pages → permissions →
> workflows → current build state → blockers.

---

## 1. Developer (internal eng team — meta)

**Real world:** The 4 of us — ก๊อต + เดฟ + ภูม + ปอน — write the codebase. Plus future hires.

**Admin workspace:** None as a "page" — the codebase itself + GitHub repo + Vercel deploys + Supabase dashboard.

**Permissions:** Read/write GitHub repo, deploy Vercel, manage Supabase. No `admins` row (we're not customers of our own admin system).

**Workflows:**
- Code in personal branch (`Poom` / `podeng` / `dave`) → push at save-points → consolidate via `dave` → `main` → Vercel deploy
- Per-role briefs ([`got.md`](got.md) / [`dave.md`](dave.md) / [`poom.md`](poom.md) / [`podeng.md`](podeng.md)) for daily flow

**Status:** 🟢 Established (4 humans + Claude Code agents). Onboarding new hire: see [`docs/team.md`](../team.md) §8.

---

## 2. Marketing

**Real world:** Drive traffic to Pacred — SEO content, paid ads (when ready), social posts, email/LINE digest campaigns, partnerships.

**Admin workspace (planned):** `/admin/marketing/*` — analytics dashboard (GA4 + Clarity feeds), campaign manager (assets + UTM tracking), content calendar.

**Permissions:** `admins.role = 'marketing'` (new role — needs ADR-0011 RBAC granularity to add). Read GA4 + Clarity dashboards (currently external — once K-12/K-13 land, embed via API).

**Workflows:**
- Build SEO content (ปอน builds the pages, marketing role briefs ปอน on which keywords to target)
- Run campaigns (LINE OA push to opted-in customers via `notify_channels` flag)
- Analyse conversion funnel (GA4 events `sign_up`, `place_order`, `wallet_deposit`, `generate_lead`)
- Track Meta Pixel + TikTok Pixel conversions (post-K-12 GTM activation)

**Status:** 🔴 No admin workspace yet. Operates via external tools (Google Analytics, Meta Ads Manager) + verbal direction to ปอน. **Phase G2+ build target.**

**Cross-links:** [`podeng.md`](podeng.md) (executor) · [`decisions/0007-analytics-and-ab-testing.md`](../decisions/0007-analytics-and-ab-testing.md)

---

## 3. Sales

**Real world:** Close deals. Customer relationship management. B2B opportunity pipeline. Quoting custom rates.

**Admin workspace:** Existing `/admin/customers` + `/admin/customers/[id]` + new `/admin/sales/*` (planned):
- Opportunities pipeline (per [ADR-0009 M13](../decisions/0009-erp-schema-sketch.md))
- Custom quote generator (pulls from pricing role's rate table)
- Customer assignment + transfer
- Commission ledger + payout requests

**Permissions:** `admins.role = 'sales_admin'` (existing). Read all customer data, write opportunity records, request payouts.

**Workflows:**
- Lead intake → opportunity row → assigned sales rep → activity log → won/lost
- Custom quote → uses `lib/forwarder/calc-price.ts` + custom override → send to customer
- Customer reassignment (e.g., วิน → แนท) — existing endpoint, needs UI polish

**Status:** 🟡 Partial — `/admin/customers` + `/admin/customers/transfer-rep` exist; `/admin/sales/*` opportunities is Phase 2 ERP.

**Cross-links:** [`poom.md`](poom.md) (admin UI executor) · [ADR-0009 M13](../decisions/0009-erp-schema-sketch.md)

---

## 4. Pricing

**Real world:** Set rates per service / lane / period. Feeds booking quote engine. Updates as carriers raise/drop rates.

**Admin workspace:** `/admin/rates/*` (existing, partial). Needs effective-date versioning per [ADR-0009 M14](../decisions/0009-erp-schema-sketch.md) discussion.

**Tables:** `tb_rate_*` (existing — `rate_g_*` general / `rate_vip_*` / `rate_custom_*` / `tb_co` couriers).

**Permissions:** `admins.role = 'accounting'` for now (pricing folds into accounting at Pacred scale); split into `pricing_admin` when team grows.

**Workflows:**
- Quarterly rate review → update general rates table
- VIP tier override per customer (`profiles.user_company` + per-customer custom rate)
- Carrier rate sheet sync (Google Sheets cache — pending Phase G integration port)

**Status:** 🟡 Partial — exists but needs effective-date versioning + cleaner admin UI.

**Cross-links:** [`poom.md`](poom.md) · `lib/forwarder/calc-price.ts` (rate engine that consumes this data)

---

## 5. Planning

**Real world:** Operations planning — match shipments to containers, schedule pickups, plan freight (truck/sea/air bookings + container assignments).

**Admin workspace:** `/admin/planning/*` (NEW per [container-centric-model](../architecture/container-centric-model.md)):
- Container pool — open containers + capacity + ETA
- Pending shipments — needing container assignment
- Drag/drop shipment → container OR auto-suggest based on origin/destination/transport-mode
- Freight booking — schedule carrier pickup + assign driver

**Permissions:** `admins.role = 'ops'` (existing) — extends to planning.

**Workflows:**
- New cargo arrives at TH warehouse → planner assigns to container → driver schedule
- Customer asks "when does my shipment go?" — planner sees + answers via CS
- Container full / urgent — planner closes early + schedules next

**Status:** 🟡 Partial — admin/forwarders exists; full planning view is Phase G2 build target after container model lands.

**Cross-links:** [`poom.md`](poom.md) (CT-1..CT-8 backlog) · [`architecture/container-centric-model.md`](../architecture/container-centric-model.md)

---

## 6. CS (Customer Service)

**Real world:** Front-line support. Answer LINE OA / phone / email tickets. Escalate to ops / sales / accounting as needed.

**Admin workspace:** `/admin/cs/*` (planned Phase G2):
- Contact-messages dashboard (existing `contact_messages` table)
- Ticket queue (group by status: new / in-progress / waiting-customer / resolved)
- Customer 360° view — quick lookup with all customer info + recent orders + notifications + wallet
- Quick actions: refund, recompute wallet, resend OTP, manual notification send

**Permissions:** `admins.role = 'cs_admin'` (new role — needs ADR-0011) OR fold under `ops` for now.

**Workflows:**
- Contact form submission → cs sees new ticket → assigns to self/teammate → resolves
- Customer phones in → cs opens customer 360° → answers questions → logs interaction
- Escalation: cs flags ticket → sales/ops/accounting picks up

**Status:** 🔴 No dedicated CS workspace yet. Currently CS uses sales/ops admin views ad-hoc. **Phase G2 build target.**

**Cross-links:** [`poom.md`](poom.md) · existing `actions/contact.ts`

---

## 7. Docs (document team)

**Real world:** Generate documents — invoices, packing lists, Form-E (ใบขนสินค้า), customs declarations, receipts, tax invoices.

**Admin workspace:** `/admin/docs/*` (Phase G2):
- Tax invoice issuance (per [ADR-0006](../decisions/0006-tax-invoice-flow.md))
- Packing list builder (per container — pulls shipments + items)
- Form-E generator (customs declaration form — required for export + customs clearance)
- Receipt regenerator (existing PDF templates `forwarder-receipt.tsx` + `shop-order-receipt.tsx`)

**Permissions:** `admins.role = 'accounting'` for tax invoices (per [ADR-0005 K-7](../decisions/0005-launch-operational-decisions.md)); `admins.role = 'docs_admin'` (new role) for general docs.

**Workflows:**
- Customer requests tax invoice → docs reviews + issues → PDF generated + stored
- Container closes → docs generates packing list + Form-E → archived per container
- Customs incident → docs pulls relevant Form-E + corresponds with broker (M3 in ERP)

**Status:** 🟡 Partial — receipt PDFs exist; tax invoice is Phase G2 per ADR-0006; packing list + Form-E are Phase 2 builds.

**Cross-links:** [`poom.md`](poom.md) · [`decisions/0006-tax-invoice-flow.md`](../decisions/0006-tax-invoice-flow.md) · `components/pdf/*`

---

## 8. Acc AR (Accounts Receivable)

**Real world:** Track money INTO Pacred. Wallet top-up approvals. Slip verification. Refund processing.

**Admin workspace:** `/admin/wallet` (existing — slip approval) + `/admin/accounting/ar` (Phase G2 — aging report, refund queue).

**Permissions:** `admins.role = 'accounting'` (existing).

**Workflows:**
- Customer uploads slip → AR reviews → approve/reject → wallet credit (existing flow)
- Refund request from CS → AR reviews → wallet debit + notify customer
- Aging report — overdue invoices (Phase G2 — depends on tax invoice flow)
- Daily reconciliation — bank statement vs slip approvals (manual for now; automate Phase 2)

**Status:** 🟡 Wallet approve works; refund + aging are Phase G2 (post-tax-invoice ADR-0006).

**Cross-links:** [`poom.md`](poom.md) · `actions/admin/wallet.ts` · [ADR-0005 K-7](../decisions/0005-launch-operational-decisions.md) (approver role)

---

## 9. Acc AP (Accounts Payable)

**Real world:** Track money OUT of Pacred. Pay vendors (carriers, brokers, fumigation, payees). Withholding tax management.

**Admin workspace:** `/admin/accounting/ap/*` (Phase 2 per [ADR-0009 M12](../decisions/0009-erp-schema-sketch.md)).

**Permissions:** `admins.role = 'accounting'`.

**Workflows:**
- Vendor sends invoice → AP records → approval workflow → bank transfer → mark paid
- WHT (withholding tax) per Section 50 — AP withholds + issues `wht_certificate` (per ADR-0009 M2)
- Monthly PND.53 filing — aggregate from `wht_certificates` table
- Driver/messenger commission payouts (links to logistics role)

**Status:** 🔴 No AP workspace yet. **Phase 2 build target.**

**Cross-links:** [`poom.md`](poom.md) · [ADR-0009 M2 + M12](../decisions/0009-erp-schema-sketch.md)

---

## 10. HR

**Real world:** Recruit + onboard + manage employees. Attendance, leaves, training, policies, compliance.

**Admin workspace:** `/admin/hr/*` — **100% complete** (existing):
- Org chart (3 ผู้บริหาร + 9 sections + 24 positions + quota colors)
- Employees (data-table 12 cols + filters + 4 actions per row) + detail page
- Recruitment (postings + 6-stage applicant pipeline)
- Attendance (daily dashboard + clock buttons + ip + location)
- Leaves (queue + approve)
- Training (courses + enrollment + pass/fail/exempt)
- Policies (markdown + ack tracking)
- Audit (feed-style + 7 types × 5 severities)

**Permissions:** `admins.role = 'super'` (HR-related) — granular `hr_admin` role TBD post-launch.

**Workflows:** All existing. Phase 2 ERP adds Payroll module (per [ADR-0005 K-5](../decisions/0005-launch-operational-decisions.md) — extends HR not separate).

**Status:** 🟢 Complete. Phase 2 adds payroll.

**Cross-links:** [`poom.md`](poom.md) · [ADR-0005 K-5](../decisions/0005-launch-operational-decisions.md) · [ADR-0009 M1](../decisions/0009-erp-schema-sketch.md)

---

## 11. Messenger

**Real world:** Domestic delivery + courier — last-mile + customer-to-customer + warehouse-to-customer.

**Admin workspace:** `/admin/logistics/*` (Phase 2 per [ADR-0009 M10](../decisions/0009-erp-schema-sketch.md)).

**Tables:** `logistics_orders` (planned per M10).

**Permissions:** `admins.role = 'logistics_admin'` (new role) OR fold under `ops`.

**Workflows:**
- Booking — customer requests messenger → routed to messenger via `forwarder_driver` pool
- Pickup → in-transit → delivered → proof-of-delivery photo upload (storage bucket `logistics-pods/`)
- Same-day vs standard vs express service tiers

**Status:** 🔴 No workspace yet. **Phase 2 build target.**

**Cross-links:** [`poom.md`](poom.md) · [ADR-0009 M10](../decisions/0009-erp-schema-sketch.md)

---

## 12. Warehouse (Thailand + China)

**Real world:** Receive / store / dispatch cargo. Two physical locations: Thailand (handover from MOMO) + China (Pacred-managed, future).

**Admin workspace:** `/admin/warehouse/*` (NEW per [container-centric-model](../architecture/container-centric-model.md)):
- Container list — open + closed + in-transit + arrived
- Container detail — customers inside + per-customer shipments + tracking
- Inbound scan UI — scan goods received, attach to shipment
- Outbound scan UI — pack into container, seal, prep for freight booking

**Permissions:** `admins.role = 'warehouse'` (new role) — needs ADR-0011 RBAC extension.

**Workflows:**
- **Thailand:** Container arrives from MOMO → scan to verify against MOMO manifest → discrepancies flagged → ready for dispatch
- **China:** Receive customer goods → upload product details + photos → attach shipment label → tracking → invoice → pack into container → seal → freight booking → ship to Thailand
- Container-centric throughout — every action is on a container OR a shipment within a container

**Status:** 🔴 Current: `/admin/containers` exists but partial; container-centric model is NEW (2026-05-16 brief — see CT-1..CT-8 in [`poom.md`](poom.md)). **P0 backend work right now.**

**Cross-links:** [`poom.md`](poom.md) CT-1..CT-8 · [container model](../architecture/container-centric-model.md) · [MOMO integration](../integrations/momo-jmf.md)

---

## 13. Driver

**Real world:** Forwarder shipment driver — pickup goods from China warehouse OR Thai warehouse, deliver to customer.

**Admin workspace:** `/admin/drivers` (existing — P-18) + driver-side mobile view (planned).

**Permissions:** `admins.role = 'driver'` (new role per [container model](../architecture/container-centric-model.md) RLS) — needs ADR-0011 RBAC.

**Tables:** `forwarder_driver` (existing) extended to include messenger work (per ADR-0009 M10).

**Workflows:**
- Assigned shipment via admin → driver opens shipment detail → confirms pickup → in-transit → marks delivered + photo
- Multi-shipment routes — driver sees container manifest → optimal route → delivery sequence
- Sub-driver pairing (see role #14 below)

**Status:** 🟡 Admin side exists; driver-side mobile view is Phase G2 build (after container model lands).

**Cross-links:** [`poom.md`](poom.md) · existing `actions/admin/forwarder-drivers.ts`

---

## 14. Sub-driver

**Real world:** Driver assistant — pairs with a driver on routes (loads/unloads, secondary).

**Admin workspace:** Same as driver — paired view (sub-driver visible as secondary on shipment).

**Permissions:** `admins.role = 'driver'` (shared) OR sub-role flag in `forwarder_driver` table.

**Workflows:**
- Same as driver — accessed via driver's main account OR own login if sub-driver has own role
- Commission split — primary vs sub allocated different percentages (Phase 2)

**Status:** 🔴 Schema doesn't yet split primary/sub. Currently treated as same role. Distinction = Phase 2 work.

**Cross-links:** [`poom.md`](poom.md) · same as role #13

---

## Partner side (external)

### 15. MOMO JMF — Thailand warehouse cargo partner

**Real world:** Cargo container closing partner. Pacred sends cargo to MOMO warehouse → MOMO packs + closes containers → returns status via API.

**Integration spec:** [`docs/integrations/momo-jmf.md`](../integrations/momo-jmf.md) (ก๊อต locks endpoint inventory; ภูม wires).

**Auth:** JWT in `MOMO_JMF_TOKEN` (`.env.local` 2026-05-16 set; not yet in Vercel until ก๊อต flips).

**Status:** Token received 2026-05-16; full integration pending ก๊อต call with MOMO dev + endpoint reverse from legacy `pcs-admin/api-forwarder-jmf/*.php`.

### 16. China warehouse partner (future)

**Real world:** When Pacred has volume → install Pacred-owned system at Chinese warehouse → staff there uses Pacred system to receive + pack + ship to Thailand.

**Status:** Future — see [container model §"View B"](../architecture/container-centric-model.md) for the staff workflow.

---

## RBAC summary — current vs needed

| Role | `admins.role` value | Status |
|---|---|---|
| super | `super` | ✅ exists |
| ops | `ops` | ✅ exists |
| accounting | `accounting` | ✅ exists |
| sales_admin | `sales_admin` | ✅ exists |
| **marketing** | `marketing` | 🔴 add (ADR-0011) |
| **cs_admin** | `cs_admin` | 🔴 add (ADR-0011) |
| **docs_admin** | `docs_admin` | 🔴 add (ADR-0011) |
| **logistics_admin** | `logistics_admin` | 🔴 add (ADR-0011) |
| **warehouse** | `warehouse` | 🔴 add (ADR-0011) |
| **driver** | `driver` | 🔴 add (ADR-0011) |
| **hr_admin** | `hr_admin` (optional split from `super`) | 🟡 optional (ADR-0011) |
| **pricing_admin** | `pricing_admin` (optional split from `accounting`) | 🟡 optional (ADR-0011) |

→ Tracked as **ก๊อต batch K-RBAC** + Sprint 7+ Track D **P-38 → ADR-0011** (in [`got.md`](got.md) backlog).

---

## Cross-references

- [`docs/team.md`](../team.md) §1 — dev role boundaries
- [`docs/decisions/0002-admin-architecture.md`](../decisions/0002-admin-architecture.md) — current 4-role RBAC + `is_admin()`
- [`docs/decisions/0008-dpx-erp-phase-2.md`](../decisions/0008-dpx-erp-phase-2.md) — Phase 2 scope (most stub modules here are Phase 2)
- [`docs/decisions/0009-erp-schema-sketch.md`](../decisions/0009-erp-schema-sketch.md) — schema sketches per Phase 2 module
- [`docs/architecture/container-centric-model.md`](../architecture/container-centric-model.md) — warehouse + driver flows
- [`docs/integrations/momo-jmf.md`](../integrations/momo-jmf.md) — Thailand partner
- Memory: `staff_roles_pacred` — compact reference (load via /memories — not in repo)
