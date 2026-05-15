# 🎯 Pacred — Master Strategy (single-read consolidation)

> **Purpose:** ทุกคน (เดฟ · ก๊อต · ปอน · ภูม · พี่ป๊อป) เปิดไฟล์เดียวจบ → เข้าใจ where we are, where we go, how each piece fits. ทุก brief / ADR / plan ย่อยลง 1 เอกสาร master นี้ + cross-link ลึกต่อ.

Last reviewed: 2026-05-15 (post-DNA-embed + emergency cargo sprint launch)
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

## 2. Current state (2026-05-15) — 🔥 EMERGENCY

**บริษัทเผาเงินตัวเอง.** เป้าตอนนี้คือ: cargo system → รับลูกค้าได้ → revenue → stop burn → fund continued dev.

**Symptoms:**
- Google Ads ยิงไม่ติด — landing rank ต่ำ
- Google Search หา pacred.co ไม่เจอ — SEO ยังไม่ทันที่ Ads
- Facebook Ads มี inquiry คาร์โก้เข้าแต่ระบบยังไม่พร้อมรับ → drop + เสียชื่อ
- พี่ป๊อป (owner) เครียดมาก

**Decision lens for every task this sprint:**
> *"งานนี้ส่งผลให้รับลูกค้า cargo ได้เร็วขึ้นไหม?"* ใช่ = P0 · ไม่ = defer

**Full emergency plan:** [`PORT_PLAN.md`](PORT_PLAN.md) **Part T** (T1 critical path · T2 per-role pickups · T3 borrowed-API plan · T4 brand cleanup gate · T5 revenue-ready DoD)

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

**Pending ADRs** (ก๊อต P2):
- 0011 ERP RBAC granular roles per module
- 0012 ERP frontend shell (same app vs separate `erp.pacred.co`)
- 0013 ERP V2→V3 migration strategy

---

## 9. What's shipped vs pending (production-readiness snapshot)

### 🟢 Shipped (in main / production-deployable)

**Foundation:**
- Next.js 16 + Supabase auth/RLS + OAuth Google/FB
- `proxy.ts` middleware + locale prefix routing (as-needed)
- `pnpm verify` umbrella (lint + tsc + test:unit + audit:all) + CI workflow

**Customer portal (~88%):**
- /login, /register (personal + juristic 3-step), /dashboard, /addresses
- /service-order (+ /add /cart /[hNo]), /service-import (+ /add /[fNo] /receipt /receipts)
- /service-payment (+ /add), /wallet (deposit/withdraw/history with soft-degrade)
- /notifications, /liff/link, /forgot-password

**Admin back-office (~98% HR / ~50% ops):**
- HR full: org-chart, employees, recruitment, attendance, leaves, training, policies, audit
- Admin dashboard, customers, admins (RBAC grant/revoke), drivers, csv-imports, hs-codes
- Track A integration tests (P-28..P-31): OTP / wallet ledger / signup / cart cap

**Infrastructure:**
- Analytics stack — L-22 GTM scaffold + L-23 Clarity + L-24 cookie A/B (silent until env IDs set)
- 9 conversion events + 13 CTA surfaces + first live experiment `home_hero_cta`
- Sentry SDK (D-11) · Upstash rate-limit (D-12) · hCaptcha (D-13) — wired, await creds
- LINE Messaging API + LIFF code scaffolded (D-1-LIFF)
- Cron jobs (5 routes) + CRON_SECRET hardening
- PromptPay soft-degrade · OTP dual-pepper rotation support
- OWASP Top-10 desk audit + PCS scrub plan + OTP pepper rotation runbook

**Landing:**
- Home (15+ sections) · L-1..L-9 SEO bundle · 7 bonus polish · customs-clearance v2 (banner + breadcrumb + "1 ชม." stamp + new copy)
- Mobile FloatingTabs center call FAB · shared section tweaks (ContactSales reusable + mobile swipe + shorter sales card)

### 🟡 Partial (need workflow buttons / wiring)

`/admin/customers/[id]` · `/admin/forwarders/[fNo]` · `/admin/service-orders/[hNo]` · `/admin/wallet` · `/admin/yuan-payments` · `/admin/containers` · `/admin/team-leaders` · `/admin/sales-payouts` · `/admin/settings` · `/admin/juristic-check`

### 🟢 ~~Stub modules~~ — actually shipped (re-audited 2026-05-16 evening)

Per [`audit/legacy-cleanup-2026-05-16.md`](audit/legacy-cleanup-2026-05-16.md) re-audit, the following were marked "stub" but are now functionally **complete**:
- ✅ `/admin/accounting` — 7 tabs (summary/forwarder/yuan/shop/topup/withdraw/refund) + CSV + monthly closing
- ✅ `/admin/reports` — 5 tabs (forwarder/shop/yuan/sales/payment) + CSV + status breakdown
- ✅ `/admin/barcode` — intake/prepare/driver workflows
- 🟡 `/admin/rates` — basic done; **Phase D shipping rates table** (port `tb_rate_g_*`) remains as LP-1
- 🔴 Phase I 9 new services (1, 5-13 in §4) — landing pages + backend modules (separate roadmap)

### 🔴 Critical blockers (block production beta — updated 2026-05-16 evening with audit findings)

| Owner | Blocker | Unblocks |
|---|---|---|
| ก๊อต | T-G4 GTM ID + Clarity ID signup | Ads conversion tracking |
| ก๊อต | T-G5 Sentry DSN + Upstash + hCaptcha | Production error visibility + DoS prevention + bot filter |
| ก๊อต | T-G2 MOMO endpoint inventory call | Container tracking customer view |
| Pacred owner | T-G3 bundle: bank/PromptPay/tax-ID/legal name/LIFF ID | wallet payments + tax invoice + receipts |
| ภูม | T-P1 admin workflow buttons (cargo path) | ✅ DONE (shipped 2026-05-16) |
| ภูม | T-P2 container migration + customer view | "Where's my container?" feature (T-D2 schemas ✅; UI pending) |
| ภูม | U1-3 admin "rebind tracking → container" UI | closes daily "ในระบบไม่ขึ้น" requests (chat audit L-2) |
| ภูม | U1-4 admin "manual tracking entry" UI | closes daily SQL escalations |
| **เดฟ + ภูม** | **U1-2 OTP SMS balance scaffold** | ✅ **DONE evening-10** — cron route + `checkSmsBalance` + notify template + alert pattern; pending vercel.json entry (Pro plan confirm) + ThaiBulkSMS endpoint confirm |
| **เดฟ** | **U1-1 `/status` health page** | ✅ **DONE evening-9** — public route, Supabase live ping + 11 service config checks, traffic-light dots, 60s cache, bilingual TH/EN, Footer link |
| ภูม | U1-5 `received_qty` / `expected_qty` per cargo_shipments | container-split case (chat audit: qty=1 bug) |
| **เดฟ** | **U2-5 multi-line bulk tracking search** | ✅ **DONE evening-10** — `/admin/forwarders` search bar toggles single↔multi mode (chat W-9 closer) |
| **เดฟ (cargo loop closure)** | Customer pay-from-wallet (shop + forwarder) | ✅ **DONE evening-4/6** — `payServiceOrderFromWallet` + `payForwarderFromWallet`, idempotent, admin-client-after-ownership-verify pattern |

### 🆕 Verified deficiency audits (2026-05-16 evening)

Two parallel audits produced concrete leak-hole + cleanup task lists:

- [`audit/chat-analysis-2026-05-16.md`](audit/chat-analysis-2026-05-16.md) — 7 LINE groups · 6 months · 10 ranked leak holes · canonical MOMO 9-status enum · workflows team really uses
- [`audit/legacy-cleanup-2026-05-16.md`](audit/legacy-cleanup-2026-05-16.md) — pcscargo PHP sweep · ~115 dead files · **6 NEW critical security findings** (plaintext password cookie, weak `pass_tam()`, SQLi in `header.php`, hardcoded LINE OAuth, unprotected `api/autorun/`, unsafe upload)

Master task list synthesizing both: [`PORT_PLAN.md`](PORT_PLAN.md) **Part U** (T-U1..T-U5 — 30+ items by severity).

---

## 10. The flow we want (revenue-ready end state)

When this checklist hits 100% → Pacred confidently scales Ads:

- [x] Customer can sign up (TH OTP works in dev · juristic lookup works) — `OTP_BYPASS=true` in dev; prod awaits ก๊อต DV-3 ThaiBulkSMS keys
- [x] Customer can top up wallet (slip upload working; PromptPay awaits Pacred owner Bundle 1)
- [x] Customer can create service-import order (forwarder rate engine · uploads work) — full flow shipped
- [x] **Customer can pay from wallet self-service** (BOTH service-order + service-import) — closed by `payServiceOrderFromWallet` (evening-4) + `payForwarderFromWallet` (evening-6) — no more admin bottleneck per order
- [x] Customer receives receipt PDF (Pacred legal + tax-ID + bank info) — receipt page + PDF route shipped evening-3
- [ ] Customer can request tax invoice if juristic (per ADR-0006) — pending ภูม T-P4 G2b form + admin issuance flow; schema 0034 ready
- [ ] Customer can see container/shipment status (CT-3 view · MOMO sync OR manual) — pending ภูม T-P2 UI + MOMO endpoint inventory (ก๊อต MOMO-1)
- [x] Admin (วิน/พลอย/ภูม) fulfills order via UI (no manual SQL) — `adminMarkServiceOrderPaid` (T-P1) + `adminAssignDriverToForwarder` (T-P1) + bulk approve (T-P3) all shipped
- [ ] Conversion events flow GTM → GA4 (K-12 active) — code shipped, awaits ก๊อต K-12 GTM_ID signup
- [ ] No `OTP_BYPASS` / `LINE_PUSH_BYPASS` / `PROMPTPAY_BYPASS` in prod — awaits ก๊อต DV-1..DV-3 + Pacred owner Bundle 1
- [ ] At least 5 friendly customers completed full loop end-to-end — T-D4 awaits T-D1 smoke (runbook ready evening-4) + Pacred owner bundle
- [x] **`/status` health page** — closed chat audit L-1 (เว็ปล่ม 24x in PHP); public route `app/[locale]/(public)/status/page.tsx`
- [x] **Defensive test coverage growing** — `pnpm test:unit` 14 files (+251 new assertions today: phone 28 + bkk-zip 35 + auth-validators 52 + wallet-validators 36 + cart-validators 54 + profile-validators 46)

📋 Full DoD detail → [`PORT_PLAN.md`](PORT_PLAN.md) Part T5

---

## 11. Skills + agent behavior (NEW — 2026-05-15 night)

Every Claude Code session has a starter skills kit. Skills = playbooks the agent follows when triggered.

📂 [`/.claude/skills/`](../.claude/skills/) — index in `INDEX.md`:

| Skill | When to invoke | Purpose |
|---|---|---|
| **phase-verify-loop** | After finishing any phase / batch of work | Assume → check → verify → analyze → fix in iterations until clean |
| **bug-swarm-loop** | When a bug is intermittent / cross-cutting / hard to repro | Spawn parallel agents to hunt, isolate, fix |
| **audit-kpi-dashboard** | When you need visibility into "how are we doing?" | Generate KPI dashboards from existing data |
| **test-coverage-writer** | After a function ships untested | Write unit + integration tests up to repo coverage target |
| **refactor-readability** | When a file is dense / nested / hard to scan | Refactor for human readability without changing behavior |
| **performance-hunter** | When a page LCP > 3s or a query > 500ms | Find perf bottlenecks systematically |
| **scholar-immortal** | After learning something new mid-session | Capture to `docs/learnings/<topic>.md` so future agents inherit it |
| **copyist-unlimited** | When you need N variants of a template | Clone + adapt template files at scale (e.g., 9 landing shells) |
| **legacy-php-sweep** | When porting a feature from old PHP system | Sweep `D:\xampp\htdocs\pcscargo` for that feature's source + extract logic + write to Next.js |

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
| งานของฉันคืออะไร (today)? | `briefs/<your-name>.md` (EMERGENCY section at top) |
| ตัดสินใจ X ยังไง / has someone decided? | `decisions/` (ADRs) |
| สเปกของ feature Y? | `PORT_PLAN.md` (Parts O–T) — search for ID like `T-P1` |
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
# 1. Sync
git fetch origin
git checkout <my-branch>       # podeng / Poom / dave
git merge origin/main          # น้อง pull main; เดฟ pull dave-staging

# 2. Read the only 2 things you really must
cat docs/briefs/<your-name>.md
cat docs/STRATEGY.md           # this file — for full context once-per-session

# 3. (Optional but recommended) check what changed since you last looked
git log --oneline -20 origin/main
cat docs/learnings/_index.md   # any new gotchas captured by other agents?

# 4. Open your priority-1 task from your brief's EMERGENCY section
# 5. Work. Commit local often. Push at save-point.
```

That's the loop. ทุกคนทำซ้ำๆ ทุกวัน. เดฟ integrate 1-2× ต่อวัน. ก๊อต approves async + executes signups + ADRs.

---

**End of STRATEGY.md.** Updates: ทุกครั้งที่ Part T DoD ขยับ → update §10. ทุกครั้งที่ adopt skill ใหม่ → update §11. ทุกครั้งที่ block หาย → strike-through ใน §9.
