# 🎯 Pacred — Master Strategy (single-read consolidation)

> **Purpose:** ทุกคน (เดฟ · ก๊อต · ปอน · ภูม · พี่ป๊อป) เปิดไฟล์เดียวจบ → เข้าใจ where we are, where we go, how each piece fits. ทุก brief / ADR / plan ย่อยลง 1 เอกสาร master นี้ + cross-link ลึกต่อ.

Last reviewed: 2026-05-18 (post-launch — production live since 2026-05-17)
Living doc — update each save-point. **Keep under 800 lines** (single-read budget).

---

## 1. Who Pacred is (DNA — 30-second pitch)

**บริษัท แพคเรด (ประเทศไทย) จำกัด** · ทะเบียน `0105564077716` · **Slogan: "เร็ว ไว ไม่มีคำว่าทำไม่ได้"**
**Owner:** พี่ป๊อป Visit · **Second-tier authority:** เดฟ + ก๊อต

**Scope:** end-to-end import-export-customs-cargo-logistics ecosystem.
ตอนนี้ split ออกจาก **PCS CARGO + TTP + ไอแต้ม** — บริษัทใหม่ ของตัวเอง, แต่ยัง "ยืม" API บางตัวมาใช้ขณะ switchover.

**Vision:** ทำให้ใครก็ตาม (แม้ไม่รู้อะไรเลย) นำเข้า-ส่งออกได้ ง่ายๆ แค่ปลายนิ้ว. Full-loop service — เปิดประตูทุก service ลูกค้าต้องการในระบบเดียว, ลูกค้าไม่ต้องไปจ้างเจ้าอื่น.

📋 Full DNA + addresses + 7 emails + sales reps → [`pacred-info.md`](pacred-info.md)
📋 V2 vs V3 strategy → [ADR-0010](decisions/0010-v2-v3-version-strategy.md) — *this repo = V2 owner-pleaser; V3 = future `pacred-DPX` employee masterpiece*

---

## 2. Current state (2026-05-18) — 🚀 POST-LAUNCH

**Pacred launched to production 2026-05-17.** `main` is live + verified healthy. The emergency "เผาเงิน" sprint is behind us — the cargo revenue path (signup → wallet → service-order → admin-paid → receipt) works end-to-end. The lens shifts from *survive* to *stabilise + deepen*.

**Where we are:**
- 🟢 **`main`** — production, live. 19 launch-week migrations (`0044`-`0064`) applied to prod Supabase.
- 🟡 **`dave`** — integration branch, **30+ commits ahead of `main`**. Carries the shipped post-launch U1/U2/U4 batches. The `dave→main` deploy is gated on ภูม applying migrations `0058`-`0072` to prod.
- The post-launch roadmap is **[`UPGRADE_PLAN.md`](UPGRADE_PLAN.md)** — §0 gate → U1 wire-the-flow → U2 revenue/margin → U3 ecosystem tools → U4 supervisory.

**Decision lens (post-launch):**
> Does this make the product more **true** (the flow actually closes), **billable** (revenue captured, not lost), or **measurable**? — and never code an UPGRADE_PLAN item before its §0 gate is green.

**Full post-launch plan:** [`UPGRADE_PLAN.md`](UPGRADE_PLAN.md). Backlogs it draws from: [`PORT_PLAN.md`](PORT_PLAN.md) Part V (cargo-forensics) + Part W (gap-hunt).

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

| Role | Real-world job | Branch | Authority | Reads first |
|---|---|---|---|---|
| **เดฟ** | Project Lead · Integrator · covers landing with ปอน · preps backend for ภูม | `dave` (staging) | second-tier owner | [`briefs/dave.md`](briefs/dave.md) |
| **ก๊อต** | Senior Advisor · ADRs · partner/tool/API picks · production gate · security audit | `main` (review-only) | second-tier owner | [`briefs/got.md`](briefs/got.md) |
| **ภูม** | Backend · customer portal · admin back-office · cargo port · container model | `Poom` | own-branch | [`briefs/poom.md`](briefs/poom.md) |
| **ปอน** | Frontend · landing · SEO · marketing research · WFH-friendly | `podeng` | own-branch | [`briefs/podeng.md`](briefs/podeng.md) |

**Daily integration cycle:** [`team.md`](team.md) §10 (loop diagram + review checklist + emergency cadence override)

📋 Full role + scope detail → [`team.md`](team.md) §1

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
| Payment QR | PromptPay client-side | 🟡 pending owner bank acct | `PROMPTPAY_*` (none yet) |
| China product search | TAM API (interim — ไอแต้ม) | 🟡 ADR-0003 Option F locked | `PACRED_TAMIT_*` |
| Cargo container tracking (TH side) | MOMO JMF (partner) | 🟡 JWT captured; endpoints TBD | `MOMO_JMF_TOKEN` + `MOMO_JMF_BASE_URL` |
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
| [0001](decisions/0001-line-notify-replacement.md) | LINE Notify → Messaging API | ✅ locked | When wiring LINE push notifications |
| [0002](decisions/0002-admin-architecture.md) | Admin RBAC (`is_admin()` SECURITY DEFINER + `admins` table) | ✅ locked | Every admin route or action |
| [0003](decisions/0003-china-search-vendor-cutoff.md) | China-search vendor cutoff — Option F (TAM interim) | ✅ locked | Touching `lib/china-search/` |
| [0004](decisions/0004-payment-gateway.md) | Payment gateway — PromptPay-only pre-beta | ✅ locked | Touching wallet/payment |
| [0005](decisions/0005-launch-operational-decisions.md) | K-4..K-7 launch ops | ✅ locked | Production hardening |
| [0006](decisions/0006-tax-invoice-flow.md) | Tax invoice issuance + storage contract | ✅ locked | G2 tax invoice work |
| [0007](decisions/0007-analytics-and-ab-testing.md) | GTM + Clarity + cookie A/B | ✅ locked | Adding analytics events / experiments |
| [0008](decisions/0008-dpx-erp-phase-2.md) | DPX ERP Phase 2 (V3 territory) | ✅ draft | V3 architecture discussions |
| [0009](decisions/0009-erp-schema-sketch.md) | ERP schema sketch (M1..M14) | ✅ draft | New admin module schema |
| [0010](decisions/0010-v2-v3-version-strategy.md) | V2 (owner-pleaser) vs V3 (employee masterpiece) | ✅ locked | When tempted to refactor mid-flight |
| [0014](decisions/0014-customer-self-service-state-transitions.md) | Customer self-service state transitions (verify-then-admin-client) | ✅ locked | Any customer-initiated state-machine action |
| [0015](decisions/0015-withholding-tax-model.md) | Withholding-tax (หัก ณ ที่จ่าย) model | 🟡 DRAFT — ก๊อต to lock | V-A6 · juristic payments · receipt gating |
| [0016](decisions/0016-freight-value-model.md) | Freight value model (commercial vs declared value · VAT plan) | 🟡 DRAFT — ก๊อต to lock | V-E2 · freight (FCL/LCL) invoicing |

**Pending ADRs** (ก๊อต P2):
- 0011 ERP RBAC granular roles per module
- 0012 ERP frontend shell (same app vs separate `erp.pacred.co`)
- 0013 ERP V2→V3 migration strategy
- **0015 needs ก๊อต lock** — answer the 4 open questions, flip Status → Accepted (unblocks V-A6)
- **0016 needs ก๊อต lock** — answer the 5 open questions, flip Status → Accepted (unblocks V-E2)

---

## 9. What's shipped vs pending (post-launch snapshot)

### 🟢 Shipped + in production (`main` — live since 2026-05-17)

**Foundation:**
- Next.js 16 + Supabase auth/RLS + OAuth Google/FB · `proxy.ts` middleware + locale routing
- `pnpm verify` umbrella (lint + tsc + test:unit + audit:all) + CI workflow

**Customer portal:**
- /login, /register (personal + juristic 3-step + OTP), /dashboard, /addresses, /forgot-password
- /service-order (+ /add /cart /[hNo]), /service-import (+ /add /[fNo] /receipt /receipts)
- /service-payment (+ /add), /wallet (deposit/withdraw/history, soft-degrade), /notifications, /liff/link, /shipments (+/[code])
- Pay-from-wallet self-serve (shop + forwarder) · receipt PDF · tax-invoice request flow

**Admin back-office (60+ routes):**
- HR full: org-chart, employees, recruitment, attendance, leaves, training, policies, audit
- Dashboard, customers, admins (RBAC grant/revoke), drivers, csv-imports, hs-codes, containers
- /admin/accounting (7 tabs + CSV + monthly closing) · /admin/reports (5 tabs) · /admin/barcode (intake/prepare/driver)
- Track A integration tests (OTP / wallet ledger / signup / cart cap)

**Launch-week security + money hardening (all on `main`):**
- W-1 keystone (`0062`) — RLS role-pin on ~24 admin-write policies + `wallet_transactions` DB audit trigger; `requireAdmin([role])` on 18 finance/PII pages
- W-3 (`0063`) — freight wallet-pay writes a real debit; yuan status-transition guard
- `0064` overdraw-guard — non-negative wallet floor with row-lock; `lib/wallet/balance.ts` available-balance helper
- S-3/S-4/S-7 — password-reset/phone-change IP rate-limit · edge `/admin/**` redirect · static guard test on `admins`
- F-2 — `/admin` dashboard + `/admin/reports` hub role-gated

**Infrastructure:**
- Analytics — GTM + Clarity + cookie A/B (env IDs set by ก๊อต) · 9 conversion events + 13 CTA surfaces
- Sentry SDK · Upstash rate-limit · hCaptcha — wired + graceful-degrade (see [`runbook/launch-monitoring-golive-2026-05-17.md`](runbook/launch-monitoring-golive-2026-05-17.md))
- LINE Messaging API + LIFF · 6 cron jobs (incl. SMS-balance alert) + CRON_SECRET hardening
- `member_code` = `PR001` running (PR + min-3-digit, migration `0060`)

**Landing:** Home (15+ sections) · SEO bundle · customs-clearance landing + `[port]` detail pages · `/line` redirect + GTM on every LINE CTA · ad-landing polish

### 🟢 Shipped on `dave` — post-launch U1/U2/U4 (NOT yet on `main` — gated on migration apply)

The post-launch [`UPGRADE_PLAN.md`](UPGRADE_PLAN.md) batches — coded + verified + on `dave`, awaiting ภูม applying migrations `0058`-`0072` to prod before the `dave→main` deploy:

- **U1 wire-the-flow** — container unify (`0059`/`0066`) · container→order status propagation · arrival→billing gate (`lib/forwarder/billing-gate.ts`) · freight-chain auto-draft/auto-convert · order auto-close · **refund money path** (`0058` `refund_requests` + customer self-serve `/refunds` + admin queue)
- **U2** — PCS→Pacred customer migration (`0067` + `/admin/migration/pcs-customers`) · per-container cost basis + AP/disbursement ledger (`0069` + `/admin/accounting/container-costs` + `/disbursements` + `lib/cost/container-margin.ts`) · freight WHT gate · cargo_sacks / กระสอบรวม (`0068` + `lib/warehouse/sacks.ts`)
- **U4** — admin supervisory layer (`0070` — audit-log export · notification delivery log · cron-health panel · staff RBAC console · 8-entity global search `/admin/search`) · customer credit line / pay-later (`0071` — `credit_limit_thb` + outstanding view + pay-credit action + `/wallet` credit panel)
- **C-1 fix** (`0072`) — `wallet_tx_insert_self_serve` RLS amount-sign guard (core-audit P1)
- **~700 new test assertions** — เดฟ wrote 11 test files covering the new validators (refund · commission · customs-declaration · freight-shipment · accounting-period · broadcast · billing-gate · booking-calc · notify-templates · short-url · admin-config · thai-tax-id)

### 🟡 In-flight / follow-up

- **`dave→main` deploy** — gated on ภูม recreating dev Supabase + applying `0058`-`0072` to prod (the deleted dev project `gnortvyazfmocvcbvfbs` must be restored — prod is a separate healthy project). See [`runbook/poom-handoff-2026-05-18.md`](runbook/poom-handoff-2026-05-18.md).
- **U1/U2 code-review follow-ups** — [`research/review-u1-u2-2026-05-18.md`](research/review-u1-u2-2026-05-18.md): P0-1 + P1-1 ✅ fixed by เดฟ; P1-2..P2-7 = ภูม follow-up before running the U2-1 backfill.
- **U1-7 MOMO JMF sync** — ⛔ blocked: the on-record MOMO API host/format is wrong (datanew L-0 — real = `api.momocargo.com:8080` REST); needs ก๊อต to clear the API docs first.
- **U2-4 PEAK** · **U3 ecosystem tools** (NetBay · Customs Trader Portal · ship-tracking · fuel calc) · **U4-3 tier-2 tail** — later UPGRADE_PLAN phases, partner-scheduled.
- 🔴 Phase I — 9 new ecosystem services (1, 5-13 in §4) — landing pages + backend modules, post-revenue-stable roadmap.

### 🆕 R&D / audit evidence base (2026-05-16/17/18)

The "why" behind UPGRADE_PLAN — decoded legacy systems + gap-hunts + pre-launch audits + post-launch reviews. Index: [`research/_index.md`](research/_index.md). High-leverage:
- [`research/PACRED-MASTER-STRATEGY.md`](research/PACRED-MASTER-STRATEGY.md) — chained gap-hunt synthesis (the 4-problem framing that UPGRADE_PLAN sequences)
- [`research/legacy-chat-datanew-2026-05-17.md`](research/legacy-chat-datanew-2026-05-17.md) — launch-eve decode; corrects the MOMO API surface (DN-1..DN-5)
- [`research/audit-core-2026-05-18.md`](research/audit-core-2026-05-18.md) — post-launch rigorous core audit (🟢 sound; C-1 P1 → fixed `0072`)
- [`research/review-u1-u2-2026-05-18.md`](research/review-u1-u2-2026-05-18.md) — U1/U2 code review (ownership-split follow-ups)
- 2026-05-16 audits (chat-analysis · legacy-cleanup · cargo-ops-forensics · php-deep-sweep) — still the canonical legacy decode.

---

## 10. The cargo loop — DoD (✅ met at launch)

The revenue-ready checklist was the launch gate. It is **met** — Pacred is in production and can take cargo customers:

- [x] Customer can sign up (TH OTP — `OTP_BYPASS=false` in prod after ThaiBulkSMS signup) · juristic lookup degrades to manual entry
- [x] Customer can top up wallet (slip upload + PromptPay `0105564077716`)
- [x] Customer can create service-import order (forwarder rate engine + uploads)
- [x] Customer can pay from wallet self-service (service-order + service-import) — no admin bottleneck per order
- [x] Customer receives receipt PDF (Pacred legal + tax-ID + กสิกร bank info)
- [x] Customer can request tax invoice if juristic (per ADR-0006)
- [x] Customer can see container/shipment status — `/shipments` + `/shipments/[code]`; MOMO auto-sync pending (manual admin entry is the working fallback)
- [x] Admin fulfils order via UI (no manual SQL) — mark-paid + assign-driver + bulk-approve
- [x] Conversion events flow GTM → GA4 (env IDs set)
- [x] `/status` public health page (closed chat audit L-1 — PHP web outages)
- [x] Production smoke gate passed before deploy (`next start` + curl, zero 500s)

**Post-launch DoD evolves into the UPGRADE_PLAN.** The next bar is not "can we launch" but "is the flow *true* + *billable* + *measurable*" — that is exactly what U1 (wire-the-flow) + U2 (revenue/margin) deliver. Full post-launch sequence → [`UPGRADE_PLAN.md`](UPGRADE_PLAN.md).

---

## 11. Skills + agent behavior

Every Claude Code session has a starter skills kit. Skills = playbooks the agent follows when triggered.

📂 [`/.claude/skills/`](../.claude/skills/) — index in `INDEX.md`:

| Skill | When to invoke | Purpose |
|---|---|---|
| **phase-verify-loop** | After finishing any phase / batch of work | Assume → check → verify → analyze → fix in iterations until clean |
| **qa-flow-simulator** | Before a `dave→main` deploy · after a flow-touching merge · the UPGRADE_PLAN §0 functional gate | Agent simulates a real user journey end-to-end + asserts the observable outcome (not just a 200) |
| **bug-swarm-loop** | When a bug is intermittent / cross-cutting / hard to repro | Spawn parallel agents to hunt, isolate, fix |
| **audit-kpi-dashboard** | When you need visibility into "how are we doing?" | Generate KPI dashboards from existing data |
| **test-coverage-writer** | After a function ships untested | Write unit + integration tests up to repo coverage target |
| **refactor-readability** | When a file is dense / nested / hard to scan | Refactor for human readability without changing behavior |
| **performance-hunter** | When a page LCP > 3s or a query > 500ms | Find perf bottlenecks systematically |
| **scholar-immortal** | After learning something new mid-session | Capture to `docs/learnings/<topic>.md` so future agents inherit it |
| **copyist-unlimited** | When you need N variants of a template | Clone + adapt template files at scale (e.g., 9 landing shells) |
| **legacy-php-sweep** | When porting a feature from old PHP system | Sweep the legacy `pcscargo` source for that feature + extract logic + write to Next.js |

10 skills shipped. A pending **11th** — `branch-integrate-loop` (the daily integrate-verify-distribute cycle) — is specced in [`/.claude/skills/INDEX.md`](../.claude/skills/INDEX.md) "How to extend" for ก๊อต to create.

📋 Skills are project assets — ก๊อต iterates on them via skill-creator's eval loop. See [`/.claude/skills/INDEX.md`](../.claude/skills/INDEX.md).

---

## 12. Knowledge accumulation (the "immortal scholar" pattern)

Every time an agent learns something new — a Next.js 16 gotcha · a deploy-cache pitfall · a working solution to a recurring bug · a refactor that paid off — **write it to [`docs/learnings/`](learnings/)** in a topical file.

Future agents (and devs) read these BEFORE searching the web again. Compound knowledge over time.

**Protocol:** [`/.claude/skills/scholar-immortal/SKILL.md`](../.claude/skills/scholar-immortal/SKILL.md)
**Seed:** [`docs/learnings/_index.md`](learnings/_index.md)

---

## 13. Future routes (track but don't build now)

- **V3 (`pacred-DPX`)** — separate repo, employee masterpiece. Track ideas in `docs/v3-wishlist.md`. Don't refactor V2 into V3 mid-flight. (ADR-0010)
- **Obsidian brain bridge** — eventual long-term memory layer outside the repo. Plan in [`HANDBOOK.md`](HANDBOOK.md) §Obsidian appendix.
- **Capture every dept's work as data** — Phase III initiative once revenue stable. Goal: KPI dashboard per role per day per metric.
- **Multi-project skill share** — Pacred-internal skill registry (clone this `.claude/skills/` into other Pacred repos when they're created).

---

## 14. Where to look first by question

| Question | Open this |
|---|---|
| งานของฉันคืออะไร (today)? | `briefs/<your-name>.md` + `UPGRADE_PLAN.md` (post-launch roadmap) |
| ตัดสินใจ X ยังไง / has someone decided? | `decisions/` (ADRs) |
| สเปกของ feature Y? | `UPGRADE_PLAN.md` (U-items) · `PORT_PLAN.md` Parts O–W — search an ID like `U1-3` / `V-A6` / `W-2` |
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
# 1. Sync — น้อง pull dave (NOT main — main lags). เดฟ also resyncs to dave.
git fetch origin
git checkout <my-branch>       # podeng / Poom / dave
git merge origin/dave          # the live integration branch

# 2. Read the few things you really must
cat docs/briefs/<your-name>.md
cat docs/STRATEGY.md           # this file — full context once-per-session
cat docs/UPGRADE_PLAN.md       # the post-launch roadmap — what's next

# 3. (Recommended) check what changed since you last looked
git log --oneline -20 origin/dave
cat docs/learnings/_index.md   # any new gotchas captured by other agents?

# 4. Open your priority-1 task from your brief + the UPGRADE_PLAN
# 5. Work. Commit local often. Push at save-point.
```

That's the loop. ทุกคนทำซ้ำๆ ทุกวัน. เดฟ integrate 1-2× ต่อวัน (see the `branch-integrate-loop` skill). ก๊อต approves async + gates `dave→main`.

---

**End of STRATEGY.md.** Updates: ทุกครั้งที่ launch state / UPGRADE_PLAN ขยับ → update §2 + §9. ทุกครั้งที่ adopt skill ใหม่ → update §11. ทุกครั้งที่ block หาย → strike-through ใน §9.
