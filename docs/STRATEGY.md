# 🎯 Pacred — Master Strategy (single-read consolidation)

> **Purpose:** ทุกคน (เดฟ · ก๊อต · ปอน · ภูม · พี่ป๊อป) เปิดไฟล์เดียวจบ → เข้าใจ where we are, where we go, how each piece fits. ทุก brief / ADR / plan ย่อยลง 1 เอกสาร master นี้ + cross-link ลึกต่อ.

Last reviewed: 2026-06-10 (docs-refresh wave — §5/§7/§8/§9/§15 synced to the CLAUDE.md save-points)
Living doc — update each save-point. **Keep under 800 lines** (single-read budget).

> ## ⟦superseded⟧ 🚨 2026-05-19 EVENING — Direction shift (historical)
>
> Team pivoted from V3 (`main → dave → Poom` loop) to **literal 1:1 transcription**
> of legacy PHP → Next.js per owner's "100% sameness FIRST" rule. The branch
> loop described then (`… → faithful-port → main`) is **superseded** — the
> `faithful-port` branch was deleted 2026-05-24. **Current model (see §5):**
> ภูม `Poom-pacred` + ปอน `InwPond007` → เดฟ integrates on **`dave-pacred`**
> (the trunk) → `main` on the owner's go. The 1:1-transcription *method* still
> applies to Phase-B port work.
>
> Full handoff: [`research/poom-save-point-2026-05-19-night.md`](research/poom-save-point-2026-05-19-night.md).
> Method: [`runbook/faithful-port-transcription.md`](runbook/faithful-port-transcription.md).

---

## 1. Who Pacred is (DNA — 30-second pitch)

**บริษัท แพคเรด (ประเทศไทย) จำกัด** · ทะเบียน `0105564077716` · **Slogan: "เร็ว ไว ไม่มีคำว่าทำไม่ได้"**
**Owner:** พี่ป๊อป Visit · **Second-tier authority:** เดฟ + ก๊อต

**Scope:** end-to-end import-export-customs-cargo-logistics ecosystem.
ตอนนี้ split ออกจาก **PCS CARGO + TTP + ไอแต้ม** — บริษัทใหม่ ของตัวเอง, แต่ยัง "ยืม" API บางตัวมาใช้ขณะ switchover.

**Vision:** ทำให้ใครก็ตาม (แม้ไม่รู้อะไรเลย) นำเข้า-ส่งออกได้ ง่ายๆ แค่ปลายนิ้ว. Full-loop service — เปิดประตูทุก service ลูกค้าต้องการในระบบเดียว, ลูกค้าไม่ต้องไปจ้างเจ้าอื่น.

📋 Full DNA + addresses + 7 emails + sales reps → [`pacred-info.md`](pacred-info.md)
📋 Current direction → [ADR-0017](decisions/0017-pacred-faithful-pcs-port.md) — *this repo (V2) = a **faithful port of the legacy PCS Cargo system** (D1); V3 = future `pacred-DPX` employee masterpiece (ADR-0010)*

---

## 2. Direction (D1, set 2026-05-18) — the faithful PCS Cargo port

> ℹ️ This section records the **direction decision** (still canonical). For the **live shipped-vs-pending state**, see the 2026-06-10 snapshot at the top of §9.

**On 2026-05-18 the owner rejected the rebuilt-from-scratch Pacred app.** Its UI *and* its workflow logic-loop look nothing like the legacy **PCS Cargo** system the business actually runs — and ~8,898 existing customers + every operating role would face a full retraining. The decision (**D1**, [ADR-0017](decisions/0017-pacred-faithful-pcs-port.md)):

> **Pacred becomes the legacy PCS Cargo system, faithfully — rebranded `PCS` → `PR`.** Not a reinterpretation, a faithful port. The owner's rule: **copy the original to 100% sameness FIRST, then improve.**

This supersedes the "V2 = rebuilt owner-pleaser" framing of ADR-0010. The launch-era code (customer portal · 60+ admin routes · Tier 0/1/2) still exists, but the direction under it has changed — see §9.

**Three phases (D1):**
- **Phase A — Data migration. ✅ DONE.** Ported the legacy `pcsc_main` (117 tables · ~8,898 customers · 3.78M rows) into Pacred's PostgreSQL/Supabase. `PCS<n>` → `PR<n>` keeping the exact running number; custom auth so customers sign in with their *existing* password (no reset).
  *Status: 🟢 **complete.** Supabase Pro upgrade done (ก๊อต) · migrations `0081`-`0083` + `0087` applied to dev + prod; **all 117 tables loaded** (the 3 log tables `tb_web_hs`/`tb_history_key`/`tb_history` backfilled post-Pro); **customer image + storage files uploaded to Supabase S3 production** (`pcsracgo/public/member`) by ภูม 2026-05-24. Auth bridge live (`lib/auth/pcs-legacy-password.ts`).* Runbook: [`runbook/pcs-data-migration.md`](runbook/pcs-data-migration.md).
- **Phase B — Workflow fidelity.** Rework the Pacred app — customer portal + admin back-office — so its menus, job statuses, container (ตู้) flow, and end-to-end logic-loop **match the legacy PCS system exactly**.
  *Status: 🟡 **wave 1 shipped + integrated on `dave`** — the 9-icon launchpad, order flow, admin per-role RBAC sidebar, container `tb_cnt` payment ledger, and the legacy-auth bridge. First-pass — **not yet fidelity-verified** against the legacy original (the `legacy-fidelity-check` gate). Subsequent waves continue: ภูม = backend onto the ported `tb_*` schema; ปอน = the customer-facing UI to the legacy look + flow.*
- **Phase C — Pacred enhancements.** *Only after* the faithful port works, layer Pacred's own improvements. The old Tier 0/1/2/3 roadmap + the Phase-2 build queue (booking flow · customer-intelligence · internal-chat · disbursement · china-ops · platform-observability) + the 8-specialist R&D set are **deferred here — re-sequenced, not cancelled.**
  *Status: ⏸️ deferred.*

**Decision lens (D1):**
> Does this change make Pacred a **more faithful** port of the legacy PCS Cargo system — so staff and the ~8,898 existing customers need **zero retraining**? Phase B fidelity beats new capability. Don't ship a Phase-C enhancement before the faithful port works; never ship a stage before the quality gate is green.

**Canonical D1 docs:** [ADR-0017](decisions/0017-pacred-faithful-pcs-port.md) (the decision + work-split) · [`runbook/pcs-data-migration.md`](runbook/pcs-data-migration.md) (Phase A) · the legacy-vs-Pacred fidelity audit in [`research/`](research/_index.md) — `d1-phase-b-gap-map.md` + the 3 `d1-fidelity-*` docs (Phase B rework spec). [`UPGRADE_PLAN.md`](UPGRADE_PLAN.md) and the Tier 0/1/2/3 capability synthesis now describe **Phase-C** work.

---

## 3. The 3 sides of the system (mental map)

```
┌─────────────────────────────────────────────────────────────────────┐
│ Side 1 — หน้าบ้าน (Frontend / Marketing)                            │
│ Owned by: ปอน                                                       │
│ Surfaces: landing pages · SEO · Ads quality · ecosystem service     │
│   pages · funnel CTA · public knowledge base · mobile UX            │
│ Goal: every visitor → signup or LINE add → become customer          │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Side 2 — ฝั่งลูกค้า (Customer Portal)                                │
│ Owned by: ภูม                                                       │
│ Surfaces: /login · /register · /dashboard · /service-order ·        │
│   /service-import · /service-payment · /wallet · /addresses ·       │
│   /notifications · /liff/link                                       │
│ Goal: customer self-serves the full cargo flow without phone calls  │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Side 3 — หลังบ้าน (Admin Back-Office)                                │
│ Owned by: ภูม + ก๊อต (RBAC + decisions)                              │
│ Surfaces: /admin/* (HR · ops · finance · reports · barcode ·        │
│   accounting · warehouse · containers · etc — 14 staff role         │
│   workspaces per ops-roles brief)                                   │
│ Goal: 14 internal roles fulfill orders without manual SQL           │
└─────────────────────────────────────────────────────────────────────┘
```

**Cross-cutting:** เดฟ (integrator + project lead — covers gaps + smoke-tests every flow + manages branches)

📋 Per-side details:
- หน้าบ้าน → [`briefs/podeng.md`](briefs/podeng.md)
- ฝั่งลูกค้า + หลังบ้าน → [`briefs/poom.md`](briefs/poom.md)
- 14 staff workspaces → [`briefs/ops-roles.md`](briefs/ops-roles.md)
- Cross-cutting → [`briefs/dave.md`](briefs/dave.md) · [`briefs/got.md`](briefs/got.md)

---

## 4. Pacred Ecosystem (service catalogue)

13 services in the ecosystem — start with cargo (legacy port), expand:

| # | Service | slug | Group | Source | Backend module |
|---|---|---|---|---|---|
| 1 | จับคู่ลงทะเบียนกรมศุล / ตัวแทนออกของ | `customs-broker-matching` | freight | ❌ new | TBD |
| 2 | ฝากสั่งซื้อสินค้า (China shopping) | `shop-order` | cargo | ✅ PHP | `service-order/` |
| 3 | ฝากโอนชำระสินค้า (Yuan / Alipay) | `yuan-transfer` | cargo | ✅ PHP | `service-payment/` |
| 4 | ฝากนำเข้าสินค้า — FCL/LCL/Cargo (รถ/เรือ/แอร์) | `import` | both | 🟡 cargo only | `service-import/` |
| 5 | ขอคืนภาษีขาออก | `tax-refund` | freight | ❌ new | TBD |
| 6 | เคลียร์สินค้าติดด่าน | `customs-clearance` | freight | ❌ new | partial (landing only) |
| 7 | ออกใบกำกับภาษี | `tax-invoice` | freight | partial (admin) | per ADR-0006 |
| 8 | ออกใบขนสินค้า | `shipping-document` | freight | ❌ new | TBD |
| 9 | ส่งออกสินค้า | `export` | freight | ❌ new | TBD |
| 10 | บริการฟูมิเกชัน | `fumigation` | freight | ❌ new | TBD |
| 11 | บริการฝากขายสินค้า | `consignment` | new | ❌ new | TBD |
| 12 | บริการฝากจ่ายบริการ | `bill-payment` | new | ❌ new | TBD |
| 13 | ขนส่งภายในประเทศ + ระหว่างประเทศ + แมสเซ็นเจอร์ | `logistics` | both | ❌ new | TBD |

**Priority during emergency:** services 2-4 first (cargo — have PHP backbone, have customers). Others = Phase I after revenue stable.

📋 Full catalogue → [`CLAUDE.md`](../CLAUDE.md) §"Pacred Ecosystem"
📋 Legacy PHP source for cargo port → `D:\xampp\htdocs\pcscargo` (see `.claude/skills/legacy-php-sweep/`)

---

## 5. People + branches (who works on what)

> Branch model current as of 2026-06-09 (canonical: [`team.md`](team.md) §0 — four contributors; the owner is the CEO and does not commit code).

| Role | Real-world job | Branch | Authority | Reads first |
|---|---|---|---|---|
| **เดฟ** | Project Lead · Integrator — owns the integration trunk, merges everyone's work, gates the release to `main` (on the owner's go). Works on the owner's behalf. | **`dave-pacred`** (the integration trunk) | second-tier owner | [`briefs/dave.md`](briefs/dave.md) |
| **ก๊อต** | Senior Advisor · ADRs · partner/tool/API picks · production gate · security audit | `main` review + delegated tasks | second-tier owner | [`briefs/got.md`](briefs/got.md) |
| **ภูม** | Backend · admin back-office · accounting · cargo port | `Poom-pacred` | own-branch → เดฟ integrates | [`briefs/poom.md`](briefs/poom.md) |
| **ปอน** | Frontend · UI · landing · SEO · marketing research | `InwPond007` | own-branch → เดฟ integrates | [`briefs/podeng.md`](briefs/podeng.md) |

**Daily sync:** everyone bases on `dave-pacred` (`git fetch origin && git merge origin/dave-pacred`). Push policy: save-points only; เดฟ pushes `main` only on the owner's go ([`team.md`](team.md) §3.0).

📋 Full role + scope detail → [`team.md`](team.md) §0–§1

---

## 6. Tech stack (one-glance)

- **Next.js 16.2.6** App Router + React 19.2.4 + TypeScript 5 (strict)
- **Tailwind CSS v4** (`@theme inline` in `app/globals.css` — no tailwind.config.js)
- **next-intl 4.11.1** (TH/EN) · **next-themes** · **lucide-react** outline
- **Supabase** (Auth + Postgres + Storage + RLS)
- **pnpm 11.0.9** · **Node 24** (.nvmrc pinned)
- Middleware: `proxy.ts` (NOT `middleware.ts` — Next 16 rename)

**Breaking changes vs training data:** [`AGENTS.md`](../AGENTS.md) at repo root

**Constants (DNA in code):** `components/seo/site.ts` (`CONTACT` · `ADDRESSES` · `LINE_OA` · `SOCIAL` · `TAX_ID` · `SLOGAN`). **Never hardcode** — always import.

---

## 7. Infrastructure + external dependencies

| Layer | Provider | Status | Env var (key) |
|---|---|---|---|
| Hosting | Vercel | 🟢 live | n/a |
| DB + Auth + Storage | Supabase Cloud | 🟢 live | `NEXT_PUBLIC_SUPABASE_URL` + service-role |
| SMS OTP | ThaiBulkSMS | 🟡 dev bypass (`OTP_BYPASS=true`) | `THAIBULKSMS_*` |
| LINE Login + Messaging API | LINE Official Account | 🟢 channel set; 🟡 LIFF pending | `LINE_CHANNEL_*` + `NEXT_PUBLIC_LIFF_ID` |
| Payment QR | PromptPay (`lib/promptpay.ts` SOT) + static K-Shop QR image | 🟢 live — `PROMPTPAY_ID` set (Pacred tax-ID, K-Bank `225-2-91144-0`); broken pay-modal QR fixed 2026-06-09 (missing `public/images/payment/pacred-qr.png` uploaded) | `PROMPTPAY_ID` |
| China product search | TAM API (interim — ไอแต้ม) | 🟢 live — prod outage fixed 2026-06-02 (stale Vercel TAMIT detail-URL var); ADR-0003 Option F | `PACRED_TAMIT_*` |
| Cargo container tracking (TH side) | MOMO (partner) | 🟢 live — sync via `lib/integrations/momo-isolated/` + cron `/api/cron/momo-sync` (*/5 min). ⚠️ `lib/integrations/momo-jmf/` = dead stub, do NOT build on it | `MOMO_JMF_TOKEN` + `MOMO_JMF_BASE_URL` |
| Error tracking | Sentry | 🟡 SDK wired; DSN pending | `SENTRY_DSN` |
| Rate limit | Upstash Redis | 🟡 wired; creds pending | `UPSTASH_REDIS_REST_*` |
| Bot prevention | hCaptcha | 🟡 wired; creds pending | `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` |
| Analytics (web) | GTM + Microsoft Clarity | 🟡 containers ready; IDs pending | `NEXT_PUBLIC_GTM_ID` + `NEXT_PUBLIC_CLARITY_ID` |
| Ads | Google Ads + Meta Pixel + TikTok Pixel | 🔴 awaits GTM | n/a |
| Email | Pacred-owned 7 dept addresses | 🟢 live; DKIM TBD | n/a |

📋 Full env spec → [`env.md`](env.md) (19 sections, each var documented)
📋 Borrowed-API plan → [`PORT_PLAN.md`](PORT_PLAN.md) Part T3

---

## 8. Architectural decisions (ADRs — read once, don't relitigate)

| ADR | Title | Status | When to consult |
|---|---|---|---|
| [0017](decisions/0017-pacred-faithful-pcs-port.md) | **Pacred = faithful PCS Cargo port (D1)** — supersedes ADR-0010's V2 framing | ✅ accepted (owner) | **The current direction — read first.** Any Phase A/B/C scoping decision |
| [0001](decisions/0001-line-notify-replacement.md) | LINE Notify → Messaging API | ✅ locked | When wiring LINE push notifications |
| [0002](decisions/0002-admin-architecture.md) | Admin RBAC (`is_admin()` SECURITY DEFINER + `admins` table) | ✅ locked | Every admin route or action |
| [0003](decisions/0003-china-search-vendor-cutoff.md) | China-search vendor cutoff — Option F (TAM interim) | ✅ locked | Touching `lib/china-search/` |
| [0004](decisions/0004-payment-gateway.md) | Payment gateway — PromptPay-only pre-beta | ✅ locked | Touching wallet/payment |
| [0005](decisions/0005-launch-operational-decisions.md) | K-4..K-7 launch ops | ✅ locked | Production hardening |
| [0006](decisions/0006-tax-invoice-flow.md) | Tax invoice issuance + storage contract | ✅ locked | G2 tax invoice work |
| [0007](decisions/0007-analytics-and-ab-testing.md) | GTM + Clarity + cookie A/B | ✅ locked | Adding analytics events / experiments |
| [0008](decisions/0008-dpx-erp-phase-2.md) | DPX ERP Phase 2 (V3 territory) | ✅ draft | V3 architecture discussions |
| [0009](decisions/0009-erp-schema-sketch.md) | ERP schema sketch (M1..M14) | ✅ draft | New admin module schema |
| [0010](decisions/0010-v2-v3-version-strategy.md) | V2 vs V3 version strategy — *V2's "rebuilt owner-pleaser" def superseded by ADR-0017; V3 (`pacred-DPX`) unaffected* | 🟡 partly superseded | When tempted to refactor mid-flight; V3 split |
| [0014](decisions/0014-customer-self-service-state-transitions.md) | Customer self-service state transitions (verify-then-admin-client) | ✅ locked | Any customer-initiated state-machine action |
| [0015](decisions/0015-withholding-tax-model.md) | Withholding-tax (หัก ณ ที่จ่าย) model | ✅ **Accepted 2026-05-16** (ก๊อต locked; V-A6 shipped) | Juristic payments · WHT · receipt gating |
| [0016](decisions/0016-freight-value-model.md) | Freight value model (commercial vs declared value · VAT plan) | ✅ **Accepted 2026-05-16** (ก๊อต locked; declared-value layer shipped — mig 0158 + cargo declarations) | Freight (FCL/LCL) invoicing · declared-value edits |
| [0018](decisions/0018-wallet-sot.md) | Wallet SOT — `tb_wallet`/`tb_wallet_hs` canonical | ✅ accepted | Any wallet read/write |
| [0019](decisions/0019-customer-backend-arch-decisions-2026-05-30.md) | Customer-backend architecture decisions | ✅ accepted | Customer-portal backend work |
| [0020](decisions/0020-commission-sot.md) | Commission SOT | ✅ accepted | Commission reads/writes |
| [0021](decisions/0021-corporate-sot.md) | Corporate (นิติบุคคล) SOT | ✅ accepted | Juristic data |
| [0022](decisions/0022-staff-purge-and-reregister.md) | Staff purge + re-register (13-admin recreate) | ✅ accepted | Admin/RBAC provisioning |
| [0023](decisions/0023-customer-credit-line-sot.md) | Customer credit-line SOT | ✅ accepted | Credit line |
| [0024](decisions/0024-config-settings-sot.md) | Config/settings SOT (`business_config`) | ✅ accepted | Feature flags · settings |
| [0025](decisions/0025-cashback-at-checkout.md) | Cashback at checkout | ✅ accepted | Checkout money path |
| [0026](decisions/0026-commission-admin-surfaces-repoint.md) | Commission admin surfaces repoint | ✅ accepted | Commission admin UI |
| [0027](decisions/0027-tax-invoice-sot.md) | Tax-invoice SOT — World-B `tb_*` canonical (+ 2026-06-10 addendum: World-A dead twin retired · mig 0172 period-freeze) | ✅ accepted | Any ใบกำกับภาษี work |
| [0028](decisions/0028-shop-order-qr-slip-payment-wallet-as-discount.md) | Shop-order QR/slip payment + wallet-as-discount | ✅ accepted | Shop-order pay path |

**Draft ADRs** (deferred — V3 territory):
- 0011 ERP RBAC granular roles per module · 0012 ERP frontend shell · 0013 ERP V2→V3 migration strategy (all DRAFT, deferred)

---

## 9. What's shipped vs pending (D1 snapshot)

> ### 🟦 LIVE SNAPSHOT — 2026-06-10 (the current state; subsections below are the launch-era history)
>
> **main = dave-pacred = `60607c65`** (teammate branches 0-ahead) · `pnpm verify` EXIT 0 at every save-point · **migrations applied prod through 0172** (0065/0153/0168 intentional gaps · NEXT FREE per [`runbook/migration-ledger.md`](runbook/migration-ledger.md) — 0173+ reserved by an in-flight 2026-06-10 wave, check the ledger). Detailed session history = the dated save-points at the top of [`CLAUDE.md`](../CLAUDE.md) (canonical — this snapshot summarizes, doesn't duplicate).
>
> **Shipped (June 2026 arc):**
> - **Build-backlog waves W1–W11 ALL BUILT + on main** ([`research/build-backlog-2026-06-09.md`](research/build-backlog-2026-06-09.md)): freight RFQ leads triage · tax-invoice P1–P4 (doc-mode toggle · cost/Pricing capture mig 0158 · ใบขนรวม cargo declarations mig 0161/0162 · 4-role taxdoc workspace) · freight ops cockpit (mig 0163/0164) · freight P&L + margin-guard (mig 0165) · **W6 freight commission ledger (mig 0167 — 💰 DORMANT** behind `business_config commission.freight_enabled` = OFF, 0 tiers owner-confirmed) · W10 warehouse worker-app (mig 0169–0171) · "W11" customs doc-kit (= build-backlog WAVE 12; the doc's WAVE 11 partner-portal remains unbuilt/owner-blocked) · BI cockpit drill-down · public /track rate-limit.
> - **Tax-invoice dead-twin integrity arc CLOSED 2026-06-10:** World-A `tax_invoices` (mig 0034) = retired dead twin; **live stores = `tb_forwarder_tax_invoice` + `tb_shop_tax_invoice`** (ADR-0027 + addendum); all 6 dead-twin readers consolidated/redirected to the live `/admin/accounting/etax` hub; **mig 0172** freezes the live tb_* stores on period close (extends the 0056 trigger).
> - **W1-W11 audit-harden + ~95 test assertions** (money-safety CONFIRMED-CLEAN: declared≠selling · no commission double-accrual · dormant flags fail-closed · FX correct · cap advisory) · CSV export across ~72 admin surfaces (2026-06-07) · i18n leak-kill + guard (`scripts/i18n-key-audit.mjs`) · 3 urgent prod-bug fixes 2026-06-09 (pay-modal QR · ฝากนำเข้า create-order block · address-add 404).
>
> **Dormant / gated (built, awaiting owner activation):** `tax_invoice.shop_yuan_enabled` (ใบกำกับ ฝากสั่ง/ฝากโอน — after money-loop test + ใบขน VAT sign-off) · `commission.freight_enabled` (after W6 tier-rate confirmation) · `pricing`/`warehouse`/`freight_*_doc` role assignment for staff · PEAK GL codes · NETBAY creds.
>
> **Standing blockers:** no test-customer login (blocks §0c authed click-tests + the tax-invoice money-doc browser-verify) · every tb_* tax-invoice surface renders 0/empty on prod until issuance goes live (0 issued invoices — correct-for-the-future) · rotate the dev DB password.

**Read this section through the D1 lens (§2).** The rebuilt-Pacred app *was* launched to production 2026-05-17 and that code still exists — but on 2026-05-18 the owner rejected the rebuilt direction. So "shipped" below means **"code that exists"**, not "the agreed direction". Under D1 the forward work is **Phase A → B → C**, and most of the rebuilt feature set will be reworked in Phase B to match the legacy PCS workflow.

### 🟦 Phase A — Data migration (🟢 DONE — 117/117 tables loaded on prod · images on S3)

Port the legacy `pcsc_main` MySQL DB into Pacred's PostgreSQL/Supabase. Runbook: [`runbook/pcs-data-migration.md`](runbook/pcs-data-migration.md).

- ✅ **Schema → `0081`-`0083`** — 117 tables ported MySQL→PostgreSQL, faithful (legacy names/types/even typos kept; `tb_` prefix → no collision with Pacred's own tables). Committed as `0081` schema · `0082` indexes · `0083` member-seq.
- ✅ **Converter + dry-run** — 3,780,238 rows via pgloader; 2,297,341 `PCS→PR` member-code transforms (case-normalised — MySQL collation is case-insensitive); dry-run loaded into a throwaway PostgreSQL 17 — all 117 tables reconcile MySQL ↔ PostgreSQL exactly (0 load failures · 0 mismatches).
- ✅ **Loaded to dev + prod Supabase** — `0081`-`0083` + `0087` applied to both projects; **all 117 tables loaded on prod**, incl. the 3 oversized history/log tables (`tb_web_hs` · `tb_history_key` · `tb_history`, 779 MB) backfilled after ก๊อต's Supabase **Pro upgrade**. 8,898 `tb_users` rows with intact 79-char login hashes.
- ✅ **Customer images + storage files** — ภูม uploaded the legacy `pcsracgo/public/member` image + storage files into **Supabase S3 production** (2026-05-24). Phase A storage parity closed; no further legacy migration needed.
- ✅ **Auth bridge** — `lib/auth/pcs-legacy-password.ts` verifies the legacy password hash — migrated customers sign in with their existing password, no reset.
- ✅ **New-customer numbering** — refined through `0095`-`0103` after live use revealed sequence drift / numeric-pad collisions (lowest-vacant + min-3-digit pad + legacy-anchor restore). Current state: PR baseline + min-3-digit pad, cascade backfill safe.
- ✅ **REALSHITDATAPCS.rar extracted** (2026-05-24) — full code-only snapshot at `/Users/dev/Desktop/pcs-realshit/REALSHITDATAPCS/pcsc/` (~25GB — `public_html/` + `backoffice.pcscargo.co.th/` + `pcs-seafreight.com/` + `sms/`); powers the 2026-05-24 deep audit.
- ⚠️ **Remaining cleanup (internal — NOT a legacy gap):** the prod Supabase project (`yzljakczhwrpbxflnmco`) has internal table-naming conflicts between rebuilt-era and legacy `tb_*` schemas — our cleanup task, owners เดฟ + ภูม.
- This supersedes the pre-D1 customers-only migration (`0067` · `u2-1-pcs-customer-migration.md` · `actions/admin/pcs-migration.ts`).

### 🟧 Phase B — Workflow fidelity (🟡 wave 1 shipped + integrated — first-pass)

Rework the customer portal + admin back-office so menus, job statuses, container (ตู้) flow, and the end-to-end logic-loop **match the legacy PCS system exactly** — zero retraining for staff or the ~8,898 customers. ภูม = backend onto the ported `tb_*` schema; ปอน = the customer-facing UI to the legacy look + flow.

- ✅ **Wave 1 — shipped + integrated on `dave`** — the 9-icon launchpad (`pcs-icon-grid` · `pcs-launchpad-header`), the order flow, the admin per-role RBAC sidebar + menu-count badges, the container `tb_cnt` payment ledger (`/admin/accounting/container-payments`), and the legacy-auth bridge (`pcs-legacy-bridge.ts`). **First-pass — not yet fidelity-verified** against the legacy original; subsequent waves run the `legacy-fidelity-check` gate before shipping.
- 🟢 **Post-launch hardening on `dave-pacred` → `main` (Sprint-23 to Sprint-26, 2026-05-25/26)** — incident-driven polish: (Sprint-23) `/forgot-password` forwards the `EMERGENCY_OTP_BYPASS` flag so customers don't wait for an SMS that never arrives during the ThaiBulkSMS outage; (Sprint-24) `/service-order` all 7 status tabs now highlight on URL match (only `q=2` worked before); (Sprint-25) marketing `<FloatingTabs />` + `<Footer />` gated to `(public)/layout.tsx` only — stripped from 17 protected/auth/transactional pages; (Sprint-26) `/service-order` mobile responsive — pure-CSS emulation of legacy DataTables-Responsive in `legacy-overrides.css §11` (kills the dead `.tr1::after` hint + collapses cols 2/3/5/6 + scroll-snap status tabs). Faithful-port intent intact — markup unchanged, only CSS + chrome-layout layers.
- 🟡 **Subsequent waves** — drive off the fidelity audit in [`research/`](research/_index.md): `d1-phase-b-gap-map.md` (overview) + `d1-fidelity-customer.md` / `d1-fidelity-admin.md` / `d1-fidelity-workflow.md` (the per-screen / per-button / per-loop rework spec) + the cargo-ops decode ([`audit/cargo-ops-forensics-2026-05-16.md`](audit/cargo-ops-forensics-2026-05-16.md)).

### ⏸️ Phase C — Pacred enhancements (deferred — re-sequenced, not cancelled)

Layered **only after** the faithful port works. This is where the *entire pre-D1 forward roadmap now lives* — [`UPGRADE_PLAN.md`](UPGRADE_PLAN.md) and the Tier 0/1/2/3 capability synthesis describe Phase-C work:
- Tier 0 connect (`ContactForm` on `/contact`) · Tier 1 buy-bridge (`/start-order` + `QuoteCTA` + `/admin/kpi`) · Tier 2 internal OS (`work_items` board — `/admin/board` + `/admin/inbox`).
- The 4 designed owner systems: internal org-chat · disbursement/เบิก-จ่าย · China-ops/ปิดตู้ · platform-observability.
- The Phase-2 build queue: booking flow · customer-intelligence.

### 🟢 Rebuilt-Pacred code that exists (pre-D1 — direction changed, code retained)

The rebuilt app launched 2026-05-17 and its code is intact; under D1 most of it gets **reworked in Phase B** to the legacy workflow rather than extended. The rebuilt `profiles` schema coexists with the ported `tb_*` schema during the transition, then retires.

- **`main`** — the rebuilt app in production. Foundation (Next.js 16 + Supabase auth/RLS + OAuth + `proxy.ts`) · customer portal (`/login` `/register` `/dashboard` `/service-order` `/service-import` `/service-payment` `/wallet` `/notifications` `/shipments`) · 60+ admin routes (HR · ops · `/admin/accounting` · `/admin/reports` · `/admin/barcode`) · launch-week security/money hardening (W-1 keystone `0062` · overdraw-guard `0064`) · analytics + Sentry + LINE Messaging API.
- **`dave`** — integration branch ahead of `main`, carrying the pre-D1 post-launch batches (U1 wire-the-flow + refund money path · U2 cost ledger + sacks · U4 admin supervisory layer + credit line · Tier 0/1/2) + ~700 test assertions. **The pre-D1 `dave→main` deploy is moot under D1** — that deploy shipped the rebuilt direction; the forward path is Phase A/B, not pushing `dave`. ก๊อต/เดฟ to decide the fate of un-deployed `dave` work (much of it informs Phase C).

### 🆕 R&D / audit evidence base (2026-05-16 → 2026-05-19)

Decoded legacy systems + gap-hunts + audits. Under D1 the **legacy-decode + fidelity-audit docs are primary** (they describe the system Pacred is now porting). Index: [`research/_index.md`](research/_index.md). High-leverage:
- **D1 Phase-B fidelity audit (2026-05-18/19)** — `d1-phase-b-gap-map.md` (overview) + `d1-fidelity-customer.md` / `d1-fidelity-admin.md` / `d1-fidelity-workflow.md` — the rigorous legacy-PCS-vs-Pacred gap maps at screen / button / loop level. **The canonical Phase-B rework spec for ภูม + ปอน.**
- 2026-05-16 audits — **chat-analysis · legacy-cleanup · cargo-ops-forensics · php-deep-sweep** — the canonical legacy decode; Phase-B reference for what the faithful port must match.
- [`research/ads-launch-action-plan-2026-05-20.md`](research/ads-launch-action-plan-2026-05-20.md) — consolidates the prior growth/tools/observability docs + reconciles them with D1 (Phase-C ads work — the funnel is built but MEASURE is off).
- The 8-specialist R&D set ([`research/r-and-d-2026-05-19/`](research/r-and-d-2026-05-19/_synthesis.md)) — mobile-scanning · marketing · customer-portal · admin · devops · backend · billing · tracking — **deferred to Phase C.**
- [`research/PACRED-MASTER-STRATEGY.md`](research/PACRED-MASTER-STRATEGY.md) · [`research/audit-core-2026-05-18.md`](research/audit-core-2026-05-18.md) · [`research/review-u1-u2-2026-05-18.md`](research/review-u1-u2-2026-05-18.md) — pre-D1 syntheses/reviews of the rebuilt app; inform Phase C.

---

## 10. D1 Definition-of-Done — the faithful port

Under D1 the bar is no longer "did the rebuilt app launch" — it is **"is Pacred a faithful port of the legacy PCS Cargo system, so no one needs retraining?"** DoD per phase:

**Phase A — data migration (🟢 ✅ DONE):**
- [x] All 117 `pcsc_main` tables ported to PostgreSQL — faithful schema (`0081`-`0083`)
- [x] Converter handles all 3.78M rows · `PCS<n>`→`PR<n>` on member-code columns only
- [x] Dry-run: 117/117 tables load clean · every row count reconciles MySQL ↔ PostgreSQL
- [x] Auth bridge verifies the legacy password hash — customers sign in, no reset
- [x] All 117 tables loaded on dev + prod Supabase (incl. the 3 log tables backfilled after the Pro upgrade) · 8,898 customers · orders · wallets · ตู้ reconciled
- [x] Customer image + storage files uploaded to Supabase S3 production (ภูม 2026-05-24 — `pcsracgo/public/member`)
- [ ] *Internal cleanup (not a legacy gap):* resolve the prod table-naming conflicts between rebuilt-era and legacy `tb_*` schemas

**Phase B — workflow fidelity (🟡 wave 1 shipped — first-pass, not yet fidelity-verified):**
- [x] Wave 1 — 9-icon launchpad · order flow · admin RBAC sidebar + badges · `tb_cnt` container ledger · legacy-auth bridge (shipped + integrated on `dave`)
- [ ] Wave 1 passes the `legacy-fidelity-check` gate (element-by-element vs the legacy original)
- [ ] Customer-portal menus + navigation match the legacy PCS layout
- [ ] Job statuses + the container (ตู้) flow match the legacy state machine exactly
- [ ] The end-to-end logic-loop (สั่ง → โอน → นำเข้า → ตู้ → ส่งมอบ) matches legacy behaviour
- [ ] Admin back-office screens + workflows match what staff use today
- [ ] A migrated customer + each operating role can do their daily job with **zero retraining**

**Phase C — enhancements:** DoD deferred; the bar reverts to *true / billable / measurable* once the faithful port is live. Phase-C sequence → [`UPGRADE_PLAN.md`](UPGRADE_PLAN.md).

---

## 11. Skills + agent behavior

Every Claude Code session has a starter skills kit. Skills = playbooks the agent follows when triggered.

📂 [`/.claude/skills/`](../.claude/skills/) — index in `INDEX.md`:

| Skill | When to invoke | Purpose |
|---|---|---|
| **phase-verify-loop** | After finishing any phase / batch of work | Assume → check → verify → analyze → fix in iterations until clean |
| **qa-flow-simulator** | Before a `dave→main` deploy · after a flow-touching merge · the functional quality gate | Agent simulates a real user journey end-to-end + asserts the observable outcome (not just a 200) |
| **bug-swarm-loop** | When a bug is intermittent / cross-cutting / hard to repro | Spawn parallel agents to hunt, isolate, fix |
| **audit-kpi-dashboard** | When you need visibility into "how are we doing?" | Generate KPI dashboards from existing data |
| **test-coverage-writer** | After a function ships untested | Write unit + integration tests up to repo coverage target |
| **refactor-readability** | When a file is dense / nested / hard to scan | Refactor for human readability without changing behavior |
| **performance-hunter** | When a page LCP > 3s or a query > 500ms | Find perf bottlenecks systematically |
| **scholar-immortal** | After learning something new mid-session | Capture to `docs/learnings/<topic>.md` so future agents inherit it |
| **copyist-unlimited** | When you need N variants of a template | Clone + adapt template files at scale (e.g., 9 landing shells) |
| **legacy-php-sweep** | When porting a feature from old PHP system | Sweep the legacy `pcscargo` source for that feature + extract logic + write to Next.js |
| **branch-integrate-loop** | Consolidating teammate branches into `dave` · before any `dave→main` deploy | The integrate → verify → distribute cycle — merge without losing work or shipping a half-state |
| **mobile-first-verify** | Before pushing a customer surface · "check this on mobile" · "is this responsive" | Render at the 360/390px reference viewports + assert no horizontal scroll · tap targets ≥ 44px · text ≥ 16px |
| **legacy-fidelity-check** | Before shipping any D1 Phase-B port screen · "fidelity check" · "เหมือนของเดิมไหม" | Audit a port screen element-by-element vs its legacy PCS original — the owner's "copy 100% first" gate |
| **landing-conversion-audit** | Before ads point at a landing page · "พร้อมยิงแอดยัง" · "conversion audit" | Pre-flight a landing for CONVERT + TRACK + Quality-Score |
| **debug-mantra** | Any bug session · "/debug-mantra" · "ช่วยดูบัค" · stack trace pasted | Recite the 4-step mantra (reproduce → fail path → falsify → breadcrumb), then apply in order — no fix before reliable repro |
| **management-talk** | "เขียนให้พี่ป๊อปอ่าน" · "exec summary" · "ทำให้เป็น non-tech" · "Slack/email/standup version" | Translate engineer-to-engineer content for engineering-org leadership, shaped to the channel |

16 skills shipped. Index: [`/.claude/skills/INDEX.md`](../.claude/skills/INDEX.md).

📋 Skills are project assets — ก๊อต iterates on them via skill-creator's eval loop. See [`/.claude/skills/INDEX.md`](../.claude/skills/INDEX.md).

---

## 12. Knowledge accumulation (the "immortal scholar" pattern)

Every time an agent learns something new — a Next.js 16 gotcha · a deploy-cache pitfall · a working solution to a recurring bug · a refactor that paid off — **write it to [`docs/learnings/`](learnings/)** in a topical file.

Future agents (and devs) read these BEFORE searching the web again. Compound knowledge over time.

**Protocol:** [`/.claude/skills/scholar-immortal/SKILL.md`](../.claude/skills/scholar-immortal/SKILL.md)
**Seed:** [`docs/learnings/_index.md`](learnings/_index.md)

---

## 13. Future routes (track but don't build now)

- **Phase C — Pacred enhancements** — the entire pre-D1 forward roadmap (Tier 0/1/2/3 capability work · the 4 owner systems: internal-chat · disbursement · china-ops · platform-observability · the Phase-2 build queue: booking flow · customer-intelligence). Deferred under [ADR-0017](decisions/0017-pacred-faithful-pcs-port.md) until the Phase A/B faithful port works — re-sequenced, not cancelled. Specs stay in [`UPGRADE_PLAN.md`](UPGRADE_PLAN.md) + the Tier synthesis; don't build them now.
- **V3 (`pacred-DPX`)** — separate repo, employee masterpiece. Track ideas in `docs/v3-wishlist.md`. Don't refactor V2 into V3 mid-flight. (ADR-0010 — its V3 split survives D1.)
- **Obsidian brain bridge** — eventual long-term memory layer outside the repo. Plan in [`HANDBOOK.md`](HANDBOOK.md) §Obsidian appendix.
- **Capture every dept's work as data** — a Phase-C initiative. Goal: KPI dashboard per role per day per metric.
- **Multi-project skill share** — Pacred-internal skill registry (clone this `.claude/skills/` into other Pacred repos when they're created).

---

## 14. Where to look first by question

| Question | Open this |
|---|---|
| ทิศทางตอนนี้คืออะไร (D1)? | `decisions/0017-pacred-faithful-pcs-port.md` + this doc §2 |
| งานของฉันคืออะไร (today)? | `briefs/<your-name>.md` + this doc §9 (D1 Phase A/B) |
| ตัดสินใจ X ยังไง / has someone decided? | `decisions/` (ADRs — start at 0017) |
| Phase A data migration: status + runbook? | `runbook/pcs-data-migration.md` |
| สเปกของ Phase-C feature Y? | `UPGRADE_PLAN.md` + the Tier synthesis (Phase-C work) · `PORT_PLAN.md` Parts O–W — search an ID like `U1-3` / `V-A6` / `W-2` |
| คาร์โก้/เฟรท: ระบบจริงทำงานยังไง + ปัญหาอะไร? | `audit/cargo-ops-forensics-2026-05-16.md` (decoded model + problem catalog A–F) |
| Schema ของ table Z? | `architecture/container-centric-model.md` or `decisions/0009-erp-schema-sketch.md` |
| Env var คืออะไร / set ยังไง? | `env.md` |
| Process: pull/push/integrate workflow? | `team.md` §10 |
| Skill / playbook to follow? | `.claude/skills/INDEX.md` |
| ใครเป็นคนทำ what? | `briefs/INDEX.md` + this doc §5 |
| Pacred company info (legal/tax/email/address)? | `pacred-info.md` |
| Legacy PHP code reference? | `D:\xampp\htdocs\pcscargo\` (see `legacy-php-sweep` skill) |
| Things that bite (gotchas)? | `HANDBOOK.md` "things that bite" section |

---

## 15. The handshake (when devs join a new session)

```bash
# 1. Sync — everyone bases on dave-pacred (the live integration trunk; main can lag it).
git fetch origin
git checkout <my-branch>             # InwPond007 / Poom-pacred / dave-pacred
git merge origin/dave-pacred         # the live integration trunk

# 2. Read the few things you really must
cat docs/briefs/<your-name>.md
cat docs/STRATEGY.md                              # this file — full context once-per-session
cat docs/decisions/0017-pacred-faithful-pcs-port.md  # D1 — the current direction
# (CLAUDE.md top save-points = the freshest session state)

# 3. (Recommended) check what changed since you last looked
git log --oneline -20 origin/dave-pacred
cat docs/learnings/_index.md   # any new gotchas captured by other agents?

# 4. Open your priority-1 task from your brief
# 5. Work. Commit local often. Push at save-point.
```

That's the loop. ทุกคนทำซ้ำๆ ทุกวัน. เดฟ integrates (see the `branch-integrate-loop` skill) and promotes `dave-pacred → main` on the owner's go; ก๊อต reviews `main`.

---

**End of STRATEGY.md.** Updates: ทุกครั้งที่ D1 phase state ขยับ (Phase A prod load · Phase B progress) → update §2 + §9 + §10. ทุกครั้งที่ adopt skill ใหม่ → update §11. ทุกครั้งที่ block หาย → strike-through ใน §9.
