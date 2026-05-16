# ภูม — Backend / Customer Portal / Admin Back-Office / Cargo Port

Last reviewed: 2026-05-16 night (post-deep-sweep — added V-E6..V-E12 freight stack + V-G admin bulk-ops + V-H commission roles to Phase I2 post-Monday)
Branch: `Poom` (working) — push to own branch only; เดฟ merges into `dave`

---

## 🔥 EMERGENCY (read FIRST — overrides normal priority)

บริษัทเผาเงิน. **ภูมคือ single biggest revenue lever** — backend cargo path = ทุกบาทที่ Pacred จะรับเข้ามา.

**ภูม P0 (do these in this order — Part T2):**
1. **T-P1 Admin workflow buttons** for cargo path — `customers/[id]` approve · `forwarders/[fNo]` status + driver · `service-orders/[hNo]` mark-paid + issue-receipt. Staff cannot fulfill without these
2. **T-P2 CT-1 container migration + CT-3 customer container view** — "Where's my container?" = #1 churn factor
3. **T-P3 Wallet/yuan-payments bulk approve** — manual SQL bottleneck = no scale
4. **T-P4 G2 tax invoice issuance** — juristic customers cannot pay without
5. **T-P5 Stub `/admin/accounting`** — owner sees revenue flow → stress ↓

**Defer until T-P1..T-P5 ship:** Track A integration tests, V3 prep, refactor cleanup. Tests valuable but don't earn revenue this week.

Read [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part T for the per-role emergency table + critical path + revenue-ready DoD.

---

## 🔒 Force-read before any work

1. **[`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part T** (emergency — your T-P1..T-P5)
2. [`docs/STRATEGY.md`](../STRATEGY.md) — master strategy single-read
3. [`docs/team.md`](../team.md) §1 (your scope) + §3 (daily flow) + §10 (integration cycle)
4. [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part S3 (ภูม hand-off triggers) + Part O2 (normal pipeline)
5. [`docs/architecture/container-centric-model.md`](../architecture/container-centric-model.md) — NEW data spine for warehouse + container + shipment
6. [`docs/integrations/momo-jmf.md`](../integrations/momo-jmf.md) — partner integration ก๊อต locks, you wire
7. [`docs/decisions/0006-tax-invoice-flow.md`](../decisions/0006-tax-invoice-flow.md) + [`0009-erp-schema-sketch.md`](../decisions/0009-erp-schema-sketch.md) — schema specs you implement
8. [`docs/pacred-info.md`](../pacred-info.md) — company DNA (tax ID + legal name for invoice/PDF templates)
9. [`.claude/skills/INDEX.md`](../../.claude/skills/INDEX.md) — skills kit; **`legacy-php-sweep`** is your bread-and-butter for cargo ports
10. [`docs/learnings/_index.md`](../learnings/_index.md) — scan for any new gotcha entries since last session
11. [`docs/audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) + [`docs/PORT_PLAN.md`](../PORT_PLAN.md) **Part V** — **NEW** cargo/freight forensics → backlog V-A1…V-F3 (mostly yours) + your **V-ADM1** admin-UI polish task
12. [`docs/runbook/team-status-2026-05-16.md`](../runbook/team-status-2026-05-16.md) §"🤝 เดฟ↔ภูม Part V work-split" — **NEW** เดฟ reviewed your 6-item batch (✓ all production-quality, no rework) + set the split: **เดฟ = structural/schema · you = audit/test/SQL/UI-polish**. เดฟ shipped V-D2/D3 structural (`edec18b`) — you run `0039`+`0040` on Supabase + wire `cargo_type` into UI + import. เดฟ next = V-C1.

## 📂 Legacy reference (your most-touched external source)

**`D:\xampp\htdocs\pcscargo\`** — read-only PHP source for everything in cargo. Use [`.claude/skills/legacy-php-sweep/SKILL.md`](../../.claude/skills/legacy-php-sweep/SKILL.md) before every port. Specifically:
- `member/include/function.php` — 2451 LOC business helpers
- `member/include/header.php` — auth + dashboard precompute
- `member/pcs-admin/` — 187 admin files
- DB schema dump `C:\Users\Admin\Desktop\SQLWPPCS\somedata-2026-03-19-1348-pcsc_main.sql` (`Grep` only, never `Read` whole)

---

## Who you are

**100% หลังบ้าน + customer portal + admin back-office + cargo port.** You operate from `Poom`. You:

- Build server actions + DB schema + RLS policies + admin UI
- Bridge frontend ↔ customer backend ↔ admin backend
- Port the PHP `pcs-cargo` legacy to Pacred Next.js + Supabase (Phase 1 = port; Phase 2 = DPX ERP)
- Make the back-office **usable** — UX/UI = easy access, easy understanding
- Admin sidebar = **WHITE bg**; rest of admin chrome = same theme as landing (per เดฟ 2026-05-16 brief)
- Build per the container-centric data model — container is the spine

Per เดฟ brief 2026-05-16: "**ทำระบบหลังบ้านต่อ ให้เชื่อมโยงและใช้งานได้จริง และเข้าถึงใช้งานได้เข้าใจง่ายๆ UX UI ลิงค์ Theme เดียวกับหน้าบ้านทั้งหมด ส่วนหน้าฝั่ง Admin sidebar ด้านซ้าย BG ให้ใช้เป็นสีขาว ส่วน พื้นที่ที่เหลือให้ใช้ theme เดียวกับหน้าบ้านทั้งหมด**"

---

## Scope boundaries (per `team.md` §1.3)

✋ **You don't touch:** `app/[locale]/(public)/`, `components/sections/`, `components/booking/`, `components/knowledge/`, `messages/*.json` (ปอน owns)

✋ **You don't touch (lead-only):** `CLAUDE.md`, `docs/team.md`, `docs/conventions.md`, `docs/env.md`, `docs/PORT_PLAN.md`, `package.json`, `.github/`, `next.config.ts`, `eslint.config.mjs`, `proxy.ts`, `vercel.json`

✅ **You own:** `actions/`, `lib/`, `app/[locale]/(auth|protected|admin)/`, `supabase/migrations/`, `app/api/`, `components/admin/`, `components/pdf/`

---

## Current state of your domain

### 🟢 Customer portal (~88% ready)

`/login`, `/register` (personal + juristic 3-step), `/dashboard`, `/addresses`, `/service-order` (+ /add /cart /[hNo]), `/service-import` (+ /add /[fNo] /receipt /receipts), `/service-payment` (+ /add), `/wallet` (history/deposit/withdraw with soft-degrade + analytics), `/notifications`, `/liff/link`, `/forgot-password`

### 🟢 Admin back-office (~98% HR / ~50% ops)

- HR 100%: org-chart, employees, recruitment, attendance, leaves, training, policies, audit
- Admin dashboard, customers, admins (grant/revoke roles), drivers (P-18), csv-imports (P-19), hs-codes (P-20)
- Track A integration tests (P-28..P-31): OTP / wallet ledger / signup / cart cap — just merged 2026-05-16

### 🟡 Partial (need workflow buttons)

`/admin/customers/[id]`, `/admin/forwarders/[fNo]`, `/admin/service-orders/[hNo]`, `/admin/wallet`, `/admin/yuan-payments`, `/admin/containers`, `/admin/team-leaders`, `/admin/sales-payouts`, `/admin/settings`, `/admin/juristic-check`

### 🔴 Stub modules (port from legacy)

- `/admin/accounting` — 7 PHP files (acc-forwarder, acc-payment, acc-shop, acc-shop-refund, acc-system-cargo, acc-topup, acc-withdraw)
- `/admin/reports` — 30+ PHP files (driver/forwarder/shop/sale/payment/system/OTP/SMS/promo)
- `/admin/barcode` — 9 PHP files (barcode-c-*, barcode-d-*)
- `/admin/learning` — shell; clarify vs HR training

---

## 🚨 Your next pickups (priority order)

### P0 — Container-centric model (NEW from เดฟ brief 2026-05-16)

The biggest backend addition. Read [`docs/architecture/container-centric-model.md`](../architecture/container-centric-model.md) first.

| # | Task | Effort |
|---|---|---|
| **CT-1** | Migration `supabase/migrations/0033_containers.sql` — 4 new tables (containers / shipments / shipment_tracking / container_status_history) + RLS per spec | ~1h |
| **CT-2** | `lib/warehouse/*.ts` — typed clients for upsert + tracking-event-append | ~2h |
| **CT-3** | Customer view `/(protected)/service-import/[fNo]/container` — container card + tracking timeline | ~3h |
| **CT-4** | Admin view `/(admin)/admin/warehouse/containers` — list + filter + detail with customer list inside | ~4h |
| **CT-5** | Block on ก๊อต MOMO endpoint inventory → wire sync cron `app/api/cron/momo-jmf-sync/route.ts` | ~3h |
| **CT-6** | Block on ก๊อต webhook decision → wire `app/api/webhooks/momo-jmf/route.ts` | ~2h |
| **CT-7** | Driver UI integration — driver sees their container's shipments | ~2h |
| **CT-8** | Integration test for container lifecycle (create → pack → seal → in-transit → arrived → unload → deliver) | ~2h |

### P1 — Phase G2 Tax invoice issuance (per [ADR-0006](../decisions/0006-tax-invoice-flow.md))

| # | Task | Effort |
|---|---|---|
| **G2a** | Migration `0034_tax_invoices.sql` (4 tables: tax_invoices, tax_invoice_lines, tax_invoice_seq + RLS) | ~1h |
| **G2b** | `requestTaxInvoice` server action + form on receipt pages | ~3–4h |
| **G2c** | Admin `/admin/tax-invoices` list + detail + `issueTaxInvoice` server action + PDF template | ~4–6h |
| **G2d** | `/api/tax-invoice/[id].pdf` route handler | ~1h |
| **G2e** | Cancellation + credit-note flow | ~3–4h |
| **G2f** | Audit log + integration test for full chain | ~2–3h |

### P1 — Admin workflow gaps (drive partial → complete)

Pick from: `customers/[id]` edit/approve/suspend · `forwarders/[fNo]` status transitions + driver assignment · `service-orders/[hNo]` edit/mark-payment/issue-receipt · `wallet`/`yuan-payments` bulk approve.

### P2 — Stub modules (port from legacy)

Order recommendation:
1. `/admin/accounting` (acc-* PHP — money flows) — ~8h
2. `/admin/reports` (30+ files — datatables + filters) — ~12h batched
3. `/admin/barcode` (scan-in / pick — uses container model) — ~6h
4. `/admin/learning` (decision: deprecate or merge into HR training)

### P2 — Sprint 6 leftover (when above clear)

- P-22 Time attendance system port (~4–6h)
- P-23 Meeting room booking (~2–3h)
- P-27 DPX ERP phase 2 ADR co-authoring (with เดฟ + ก๊อต)

### 🆕 Phase I2 — Freight stack + admin polish (post-Monday launch, V2 long-phase)

From deep-sweep 2026-05-16 ([`docs/audit/php-deep-sweep-2026-05-16.md`](../audit/php-deep-sweep-2026-05-16.md)) — 17 new tables · 12 freight subdirs · 24 admin polish items. **All POST-Monday — do NOT touch before launch.**

**Freight expansion (V-E6..V-E12 in PORT_PLAN Part V — ~150-200h):**
- V-E6 Quotation workflow — 📐 spec [`port-specs/freight-quotation.md`](../port-specs/freight-quotation.md) — admin → approve → customer accept → forwarder order
- V-E7 Receipt & payment tracking — 📐 spec [`port-specs/freight-receipt-and-payment.md`](../port-specs/freight-receipt-and-payment.md) — RD Code 86 + WHT integration
- V-E8 Commission withdrawal — 📐 spec [`port-specs/commission-withdrawal.md`](../port-specs/commission-withdrawal.md) — interpreter (ล่าม) + sales rep + WHT 15%
- V-E9 Monthly closing ritual (freeze past periods) — spec TBD เดฟ
- V-E10 QA/QC intake inspection (pre-billing gate) — spec TBD เดฟ
- V-E11 Customs declaration UI (ใบขนสินค้า) — spec TBD เดฟ
- V-E12 CargoAndFreight role dashboards (6 sub-dashboards) — spec TBD เดฟ

**Admin bulk-ops + polish (V-G1..V-G7 in PORT_PLAN — ~80-120h):**
- V-G1 Bulk forwarder actions · V-G2 Bulk transfer customers · V-G3 Admin push broadcast (popup) · V-G4 Cargo TOS version mgmt · V-G5 Org 5 contact CRUDs · V-G6 New admin reports · V-G7 Audit feature-parity verifications

**Commission role models (V-H1/H2 — ~16-20h):**
- V-H1 Interpreter (ล่าม) role + WHT calc
- V-H2 Sales rep commission finalize (approval workflow + slip upload)

Wait for เดฟ-written port-specs per V-E6..V-E12 before implementing — backend prep is เดฟ's structural lane.

### V-ADM1 — Admin UI polish (เดฟ instruction 2026-05-16 evening — do before the next big batch)

Small, fast cleanup so `/admin` stops looking like a separate app. Tracked as **V-ADM1** in [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part V.

- **Remove the right-hand sidebar entirely** — `/admin` keeps only the left sidebar.
- **Left sidebar → white background** — `bg-white dark:bg-surface` (no admin-only palette).
- Every other admin surface → the **same theme tokens** as the public site + customer portal: `bg-surface` / `bg-background` / `text-foreground` / `text-muted` / `border-border` from `app/globals.css` `@theme inline`. No bespoke admin colors.
- **Apply the public/customer body background** — the radial red-cloud gradient in [`app/globals.css`](../../app/globals.css) `body { … }` — to the `/admin` shell too, so admin matches หน้าบ้าน + หลังบ้านลูกค้า.
- Use `Link` from `@/i18n/navigation` (not `next/link`).
- Mobile-first responsive — warehouse staff scan on tablets.

**Acceptance:** open `/admin` → no right sidebar · left sidebar white · same red-cloud body background as `/` · light + dark both coherent (and the site still opens light per the theme fix).

---

## Blockers + alternatives

When you're blocked:

| Blocked on | Alternative work |
|---|---|
| ก๊อต MOMO endpoint inventory | Migration CT-1 (no MOMO dependency) + customer-side view CT-3 (works with manual entry) |
| ก๊อต K-1 ADR-0003 (already locked) | All Track G is your follow-up label work; pickup at any time |
| ปอน hasn't shipped theme tokens | Use existing `app/globals.css` tokens as-is; flag any new tokens you need to ปอน + เดฟ |
| Phase G2 tax invoice (waiting on Pacred tax-ID) | CT-1..CT-8 don't need it; do those first |

**Note back to เดฟ + ก๊อต when:** you need a partner API confirmed (MOMO), a new env var, an architectural choice, or an external service.

---

## Hand-offs IN

- **ก๊อต** ADRs (locked design contracts) → you implement
- **เดฟ** schema spec drafts + ADR scaffolds → you finalise + apply
- **ปอน** theme tokens + landing components → you reuse in admin UI

## Hand-offs OUT

- Schema migrations (`supabase/migrations/00NN_*.sql`) → เดฟ runs on production Supabase
- Backend feature PRs in `Poom` → เดฟ merges into `dave`
- DECISIONS log entries (in commit messages) → ก๊อต/เดฟ adjust retroactively per `team.md` §6

---

## Push discipline (STRICTER per memory `push_frequency_strict`)

- Commit local freely during long backend sessions
- **Push to `origin/Poom` only at save-points** — end of session / before sleep / machine change / big batch done
- Per session: 1 push max
- เดฟ pulls from `origin/Poom` periodically to consolidate

## Cross-links

- [`docs/team.md`](../team.md) §1.3 — your scope boundaries
- [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part O2 — sprint plan + ranked backlog
- [`docs/architecture/container-centric-model.md`](../architecture/container-centric-model.md) — your new spine
- [`docs/integrations/momo-jmf.md`](../integrations/momo-jmf.md) — partner spec (blocked on ก๊อต)
- [`docs/decisions/`](../decisions/) — ADRs you implement (0002 admin, 0005 K-4..K-7, 0006 tax invoice, 0009 ERP schema)
- [`docs/conventions.md`](../conventions.md) — code style, action shape, migration rules
- [`docs/briefs/ops-roles.md`](ops-roles.md) — staff role → admin workspace mapping
