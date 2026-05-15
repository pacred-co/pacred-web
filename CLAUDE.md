@AGENTS.md

---

# 🧬 Pacred DNA (load-bearing — read once, internalise forever)

**Company:** บริษัท แพคเรด (ประเทศไทย) จำกัด · **Pacred (Thailand) Co., Ltd.** · ทะเบียน `0105564077716` · **Slogan: "เร็ว ไว ไม่มีคำว่าทำไม่ได้"** · Owner **พี่ป๊อป Visit** (second-tier: เดฟ + ก๊อต).

**Scope:** ecosystem ของ import-export-customs-cargo-logistics (เคลียร์ศุลกากร · นำเข้า-ส่งออก · ขนส่งระหว่างประเทศ + ในประเทศ · ฝากสั่งซื้อ-ฝากโอน-ฝากขาย · ใบกำกับภาษี · ใบขนสินค้า · ขอคืนภาษี · ฟูมิเกชัน · แมสเซ็นเจอร์ · "และอื่นๆ ทั้งวงการ"). Markets ลำดับ: ไทย → จีน → ญี่ปุ่น → เกาหลี → มาเล → อินโด → เมกา → อื่นๆ.

**Vision:** ทำให้ทุกคน (แม้ไม่รู้อะไรเลย) สามารถนำเข้า-ส่งออกได้ ง่ายๆแค่ปลายนิ้ว. Full-loop service ดึงลูกค้าไว้ในระบบ ไม่ปล่อย handover ที่อื่น.

**Brand-split context (DON'T preempt cleanup):** Pacred = บริษัทใหม่ กำลังแยกจาก **PCS CARGO + TTP + ไอแต้ม**. บาง API ยัง "ยืม" เจ้าเก่าใช้ — ลบ reference เหล่านี้ **หลัง** ก๊อต confirm API switchover เสร็จ (ไม่ใช่ก่อน). Tracked in [`docs/runbook/pcs-scrub-plan.md`](docs/runbook/pcs-scrub-plan.md).

📋 **Full SOT:** [`docs/pacred-info.md`](docs/pacred-info.md) — addresses, phones, emails (7 depts), LINE OA, social, sales reps, JSON-LD code consumers
🧠 **Memory:** `pacred_company_dna` + `cash_burning_p0_emergency` (load via /memories)

---

# 🔥 EMERGENCY STATE — Cargo Revenue Sprint (2026-05-15)

บริษัทกำลังเผาเงินตัวเอง. Google Ads ยิงไม่ติด · Search หา pacred.co ไม่เจอ · FB Ads มี inquiry คาร์โก้เข้าแต่ระบบยังไม่พร้อมรับ → ลูกค้า drop + เสียชื่อ. พี่ป๊อปเครียดมาก.

**Goal:** ระบบ cargo (port from PHP) → live + รับลูกค้าได้ ASAP → revenue → stop burn → fund continued dev.

**Decision lens (every task):** "งานนี้ส่งผลให้รับลูกค้า cargo ได้เร็วขึ้นไหม?" ใช่ → P0. ไม่ → defer.

📋 **Plan:** [`docs/PORT_PLAN.md`](docs/PORT_PLAN.md) **Part T** — per-role T1..T5 emergency pickups + "borrow first, switch later" API plan + revenue-ready DoD checklist.

**Anti-patterns during emergency (don't do):**
- V3 architecture redesign mid-burn (V3 = pacred-DPX repo, not here)
- Wide refactor cleanup without revenue tie-in
- Wait for "perfect" UX — ship "good enough" + iterate post-revenue
- Scrub PCS/TTP/ไอแต้ม **before** ก๊อต API switchover (would break revenue path)

---

# 🛑 STOP — Read your role brief FIRST (force-read every Claude Code session)

ทุก dev ใช้ Claude Code Windows ทำงาน async บน worktree ของตัวเอง. ก่อนแตะ code หรือตอบคำถาม — **เปิด brief ของคุณก่อน**:

| ถ้าคุณคือ… | เปิดไฟล์นี้ก่อนทุกอย่าง | คุณจะรู้ทันที |
|---|---|---|
| **ก๊อต** (Senior Advisor / Production Watcher) | [`docs/briefs/got.md`](docs/briefs/got.md) | P0/P1, ADRs ที่ต้อง lock, partner/tools picks |
| **เดฟ** (Project Lead / Integrator) | [`docs/briefs/dave.md`](docs/briefs/dave.md) | landing pivot, backend prep for ภูม, hardening |
| **ภูม** (Backend / Customer Portal / Admin) | [`docs/briefs/poom.md`](docs/briefs/poom.md) | container model, tax invoice, admin workflows |
| **ปอน** (Frontend / Landing / SEO / Marketing) | [`docs/briefs/podeng.md`](docs/briefs/podeng.md) | owner critiques, L-5 polish, SEO research |

📂 [`docs/briefs/INDEX.md`](docs/briefs/INDEX.md) — routing map + onboarding flow + brief shape
📋 [`docs/briefs/ops-roles.md`](docs/briefs/ops-roles.md) — 14 STAFF role workspaces (admin UI / RBAC system design)

**Why force-read?** แต่ละ brief สรุปว่า:
- คุณ own อะไร / ห้ามแตะอะไร (scope boundaries)
- งานต่อไปลำดับไหน (priority list — ไม่ต้อง re-derive จาก PORT_PLAN ทุกครั้ง)
- ติดอะไรอยู่ → ทำอะไรแทน (blockers + alternatives)
- Hand-off เข้า/ออก คุยกับใคร

อ่าน brief ก่อน → conversation รอบนี้ตรงเป้าตั้งแต่ tool call แรก. ข้าม brief = หลงเดิน.

---

# 👉 START HERE — ทีมงานทุกคน อ่านก่อนเริ่ม

📘 **[`docs/HANDBOOK.md`](docs/HANDBOOK.md)** = entry point — มี documentation map + quick start

**Canonical docs (อ่านครั้งเดียว ใช้ตลอด):**
- 👥 [`docs/team.md`](docs/team.md) — roles + permissions + branch + merge policy + daily workflow + §3.0 push-frequency cost rule (STRICTER — save-points only) + §6 self-directed mode + §9 Claude Code async collab
- 📐 [`docs/conventions.md`](docs/conventions.md) — code style + commit format + naming + DB rules
- 🔐 [`docs/env.md`](docs/env.md) — every env var explained + production checklist (incl. §19 MOMO JMF)
- 🏢 [`docs/pacred-info.md`](docs/pacred-info.md) — company info SOT (addresses + phones + emails + LINE OA + sales reps)

**Role briefs (force-read — see top of file):**
- 🧑‍💻 [`docs/briefs/INDEX.md`](docs/briefs/INDEX.md) — routing map for which brief is yours
- [`docs/briefs/got.md`](docs/briefs/got.md) · [`docs/briefs/dave.md`](docs/briefs/dave.md) · [`docs/briefs/poom.md`](docs/briefs/poom.md) · [`docs/briefs/podeng.md`](docs/briefs/podeng.md)
- 👷 [`docs/briefs/ops-roles.md`](docs/briefs/ops-roles.md) — 14 STAFF role workspaces (system design input)

**🎯 Master strategy (single-read consolidation — all briefs + ADRs + plans condensed):**
- [`docs/STRATEGY.md`](docs/STRATEGY.md) — read once per session, refer back as needed

**🛠 Skills kit (playbooks the agent follows when triggered):**
- [`.claude/skills/INDEX.md`](.claude/skills/INDEX.md) — 9 starter skills: phase-verify-loop · bug-swarm-loop · audit-kpi-dashboard · test-coverage-writer · refactor-readability · performance-hunter · scholar-immortal · copyist-unlimited · legacy-php-sweep

**📚 Learnings (compounding knowledge — read before re-debugging):**
- [`docs/learnings/_index.md`](docs/learnings/_index.md) — every agent / dev adds new entries via `scholar-immortal` skill

**Living docs (เดฟ updates):**
- 📋 [`docs/PORT_PLAN.md`](docs/PORT_PLAN.md) — current sprints + hand-off batches (Parts O–S only; ~1435 lines)
- 📚 [`docs/sprints/archive-a-to-n.md`](docs/sprints/archive-a-to-n.md) — historic survey (Parts A–N — moved out to keep PORT_PLAN under 2000-line agent ceiling)
- 🏗 [`docs/architecture.md`](docs/architecture.md) — system diagrams + DB schema + auth + security
- 🏗 [`docs/architecture/container-centric-model.md`](docs/architecture/container-centric-model.md) — **NEW** warehouse/container/shipment spine (4 tables, RLS, status enums, CT-1..CT-8 implementation)
- 🤝 [`docs/integrations/momo-jmf.md`](docs/integrations/momo-jmf.md) — MOMO partner API spec (JWT, endpoint inventory TBD)
- 🧠 [`docs/PACRED-SECOND-BRAIN.md`](docs/PACRED-SECOND-BRAIN.md) — context notes + gotchas

**Reference (open เมื่อจำเป็น):**
- [`AGENTS.md`](AGENTS.md) — Next 16 breaking changes (สำหรับ Claude/AI)
- [`docs/decisions/*.md`](docs/decisions/) — ADRs (incl. 0010 V2/V3 version strategy, 0006 tax invoice, 0007 analytics)
- [`docs/audit/owasp-2026-05.md`](docs/audit/owasp-2026-05.md) — pre-launch security posture
- [`docs/audit/php-pcscargo-integrations.md`](docs/audit/php-pcscargo-integrations.md) — deep legacy PHP audit
- [`docs/runbook/*.md`](docs/runbook/) — operational runbooks (PCS scrub + OTP rotation + cron)
- [`docs/setup/*.md`](docs/setup/) — onboarding guides (OAuth/Supabase/Vercel/LINE)
- [`supabase/migrations/README.md`](supabase/migrations/README.md) — migration runbook

**ทำงานครั้งแรก:**
1. **เปิด YOUR brief จาก [`docs/briefs/`](docs/briefs/)** ก่อนทุกอย่าง (force-read — see top of file)
2. อ่าน [`docs/HANDBOOK.md`](docs/HANDBOOK.md) → [`docs/team.md`](docs/team.md) → [`docs/conventions.md`](docs/conventions.md)
3. `cp .env.example .env.local` + fill values (ถามเดฟ) — รายละเอียดทุก var ใน [`docs/env.md`](docs/env.md)
4. รัน migration ที่ยังไม่ได้รัน — ดู [`supabase/migrations/README.md`](supabase/migrations/README.md)
5. หางานของตัวเอง: brief ของคุณ + [`docs/PORT_PLAN.md`](docs/PORT_PLAN.md) Part S (current hand-off batch)
6. Sync branch ตามวิธีใน [`docs/team.md`](docs/team.md) §3 (น้อง pull จาก `dave` ไม่ใช่ `main`!) + §3.0 push-frequency rule (save-points only — sleep / machine change / location change / big batch done; per memory `push_frequency_strict`)

---

# Project Snapshot — pacred-web

Last updated: 2026-05-16

> **Pacred** — ระบบเว็บไซต์บริษัทนำเข้า-ส่งออก / ชิปปิ้ง / เคลียร์ศุลกากร / ฝากสั่งซื้อสินค้าจากจีน
> Marketing site + landing pages + (incoming) member portal

> 🎯 **Live state** — ดูที่ [`docs/HANDBOOK.md`](docs/HANDBOOK.md) §"Current state" + [`docs/PORT_PLAN.md`](docs/PORT_PLAN.md) Part P (latest snapshot). โน้ตด้านล่าง section "Auth & Backend State" เป็น Phase 1-5 historic — ปัจจุบัน Sprint 6.5/7+ มีหน้า /service-order, /service-import, /service-payment, /wallet, /sales, /notifications, /admin/* ทำงานแล้ว

## Stack
- Next.js **16.2.6** (App Router) — **โปรดอ่าน AGENTS.md: เวอร์ชันนี้มี breaking changes จาก training data**
- React 19.2.4
- TypeScript 5 (strict)
- Tailwind CSS v4 (`@theme inline` ใน [app/globals.css](app/globals.css) — ไม่มี tailwind.config.js)
- ESLint 9 (flat config, eslint-config-next)
- **next-intl** ^4.11.1 — i18n (th/en) แบบ namespace ใน [messages/](messages/)
- **next-themes** ^0.4.6 — light/dark mode
- **lucide-react** ^1.14.0 — icons (Lucide outline-style ทั้งโปรเจกต์)
- Package manager: **pnpm**

> หมายเหตุ: middleware อยู่ที่ [proxy.ts](proxy.ts) (ไม่ใช่ `middleware.ts` — เป็นรูปแบบของ Next 16)

## Scripts
- `pnpm dev` / `pnpm build` / `pnpm start` / `pnpm lint`

## Conventions

### Routing & i18n
- Path alias: `@/*` → `./*`
- App Router อยู่ที่ [app/](app/) — locale prefix `as-needed` ([i18n/routing.ts](i18n/routing.ts))
- Locale rooted: `app/[locale]/**`
- Default locale: **th**, supported: th + en
- ใช้ `Link` จาก `@/i18n/navigation` แทน `next/link` เสมอ (เพื่อให้ locale prefix ถูก inject)
- Translations ที่ [messages/th.json](messages/th.json) + [messages/en.json](messages/en.json) — ใช้ namespace ตาม section/page (เช่น `nav.*`, `service.*`, `login.*`, `register.*`)

### Styling
- Theme colors define ใน [app/globals.css](app/globals.css) `@theme inline`:
  - `primary-50` → `primary-950` (red palette, 600 = #B30000 = brand)
  - `--color-foreground / --color-background / --color-surface / --color-border / --color-muted`
  - Dark mode ผ่าน `.dark` class (next-themes)
- Font: **Prompt** (`var(--font-prompt)`) ตั้งใน root layout
- ใช้ Tailwind utility ให้ตรง theme — หลีกเลี่ยง hex hardcode ยกเว้นจำเป็น (เช่น brand color ของ social provider)

### Components
- Section-level: [components/sections/](components/sections/) — เช่น `navbar`, `hero-section`, `service`, `blog`, `partner`, `footer`, `floating-tabs`
- Reusable UI: [components/ui/](components/ui/) — เช่น `button`, `service-carousel`, `promo-carousel`, `sales-carousel`
- Icons: [components/icons/social-icons.tsx](components/icons/social-icons.tsx) — Google/LINE/Facebook brand SVGs
- ปกติ component เป็น Server Component ยกเว้น `<NavBar />` และ carousel ที่มี state → `"use client"`

### Carousels
- `<ServiceCarousel />` ที่ [components/ui/service-carousel.tsx](components/ui/service-carousel.tsx) รองรับ **3 variants** ผ่าน prop:
  1. `items?: ServiceItem[]` → rate cards (route + price + type + note + badges)
  2. `imageItems?: ImageCardItem[]` → red bg + heart icon + bottom badges
  3. `blogItems?: BlogCardItem[]` → full red bg + title overlay
  4. ไม่ส่งอะไร → placeholder 6 ใบเปล่า

## Folder Structure

```
app/[locale]/
├─ (public)/                  # ไม่ต้อง login
│  └─ page.tsx                # home
├─ (auth)/                    # auto-redirect → / ถ้า login แล้ว
│  ├─ layout.tsx              # requireGuest()
│  ├─ login/page.tsx
│  └─ register/page.tsx
├─ (protected)/               # auto-redirect → /login ถ้าไม่ login, → /complete-profile ถ้า incomplete
│  ├─ layout.tsx              # requireAuth()
│  ├─ dashboard/page.tsx
│  └─ orders/                 # demo: pattern reference
│     ├─ page.tsx             # list
│     └─ new/page.tsx         # create form
├─ complete-profile/page.tsx  # auth required, allows incomplete
├─ auth/                      # OAuth callback + signout (no locale prefix)
│  ├─ callback/route.ts
│  └─ signout/route.ts
└─ layout.tsx                 # NextIntl + LocaleHtmlLang

actions/                       # Server Actions
├─ auth.ts                    # signIn, signOut, register*, OAuth
├─ otp.ts                     # requestOtp, verifyOtp (with bypass)
└─ orders.ts                  # demo CRUD

lib/
├─ supabase/{client,server,admin}.ts
├─ auth/{get-user,require-auth}.ts
├─ sms/gateway.ts             # ThaiBulkSMS adapter
├─ utils/phone.ts             # normalizePhone + detectIdentifier
└─ validators/{auth,orders}.ts # Zod schemas

supabase/
├─ schema.sql                 # initial: profiles + documents + otp_codes + RLS + Storage
└─ migrations/0002_orders.sql # demo: orders table
```

## Auth & Backend State (Phase 1-5 ✅ done)

### What works
- **Supabase Auth** — email/phone + password, OAuth Google/Facebook (LINE = mocked)
- **DB** — profiles (auto-gen `PR00001` member_code), documents, otp_codes, orders
- **Storage** — `member-docs/` private bucket, RLS = owner-only
- **OTP** — custom via ThaiBulkSMS, hashed (sha256+pepper), TTL 5min, rate-limited 3/hour
  - **`OTP_BYPASS=true`** in dev → skip SMS + accept any code
- **Sessions** — `proxy.ts` middleware refreshes tokens; cookies set by `@supabase/ssr`
- **Route guards** — `(auth)` redirects logged-in users; `(protected)` redirects guests + incomplete profiles
- **NavBar** — auto-aware: shows login/register buttons OR user menu (avatar + dropdown) based on session

### Pages live
| Route | สถานะ |
|---|---|
| `/` (home) | ✅ UI complete |
| `/login` | ✅ wired (signIn + Google/FB OAuth + LINE mock) |
| `/register` | ✅ wired (Personal + Juristic 3-step + uploads) |
| `/dashboard` | ✅ placeholder (shows profile + member_code + quick links) |
| `/complete-profile` | ✅ placeholder (form to-be-built) |
| `/orders` | ✅ demo (list + create form — pattern reference) |
| `/auth/callback` | ✅ OAuth handler (creates profile if first-time) |
| `/auth/signout` (POST) | ✅ |

### Yet to do
- ❌ OTP UI (UI hidden while `OTP_BYPASS=true`; build when bypass=false)
- ❌ LINE Login channel + Supabase custom OIDC
- ❌ `/complete-profile` actual form (only placeholder right now)
- ❌ `/profile` settings page
- ❌ Tax-ID lookup
- ❌ Tests

## Architecture & Roadmap

📐 **Blueprint:** [docs/architecture.md](docs/architecture.md) — full diagrams, DB schema, auth flows, security model, 5-phase roadmap

### Decisions (all locked)
- Hosting: **Vercel + Supabase Cloud**
- Phone OTP: **ThaiBulkSMS** (custom — bypass via `OTP_BYPASS=true`)
- LINE notifications: **LINE Messaging API push** via Pacred OA (ADR-0001) — creds set ใน `.env.local` 2026-05-14 (Channel ID `2009931373`); production = ตั้ง 3 vars ใน Vercel + flip `LINE_PUSH_BYPASS=false`
- LINE customer linkage: **LIFF** (D-1-LIFF scaffolded; รอ Pacred owner สร้าง LIFF app + `NEXT_PUBLIC_LIFF_ID` ใน Vercel)
- LINE Login (OAuth): not yet implemented (button = stub)
- member_code: `PR00001` (running, auto-gen via Postgres trigger) — ใหม่ทั้งระบบ ไม่ต้อง compat กับ PHP เดิม (`PCS<num>`)
- Email verification: optional (Supabase confirm-email OFF)
- Password: min 6 / max 30, no complexity rules
- Admin architecture: same Next.js app + `/admin/*` route group + `admins` table + `is_admin()` SECURITY DEFINER (ADR-0002)
- **R1 china-search vendor cutoff:** **Option E (hybrid)** ✅ locked 2026-05-16 — Track G code (TAMIT/AkuCargo/Laonet) อยู่ใน repo แต่อย่าเซ็ต Vercel env vars; prod = demo mode. ดู [`docs/PORT_PLAN.md`](docs/PORT_PLAN.md) Part R1 + S1
- **R2 PCS branding cutoff:** **scrub** ✅ locked 2026-05-16 — ลบ "PCS Cargo" / "pcscargo.co.th" / "legacy PHP" mentions ออกจาก code/comments; `docs/audit/php-pcscargo-integrations.md` คงไว้เป็น internal-only
- **D-7 Payment Gateway:** **PromptPay-only ก่อน beta** ✅ locked 2026-05-16 — defer Omise/2C2P/Stripe TH → post-beta
- **L-22 GTM (Tag Manager) + L-23 Microsoft Clarity + L-24 A/B (cookie-based):** ✅ scaffolded + 4 conversion events wired + 5 home sections wired with CTA events (2026-05-16). Activation = ก๊อต K-12 + K-13 hand-off. Helpers: `track*` / `clarity*` / `getVariantClient` / `getVariantServer` in `lib/analytics.ts` + `lib/experiments.ts`

---

# 🌐 Pacred Ecosystem (brand + service catalogue)

> **Pacred** = บริษัทใหม่ (ไม่ใช่ PCS Cargo เดิม) — เป็น **all-in-one shipping/customs/cargo platform** ที่กินรวบทุกบริการในห่วงโซ่นำเข้า-ส่งออก
>
> ระบบ PHP เก่าครอบคลุมเฉพาะฝั่ง **Cargo** (จีน-ไทย ฝากสั่ง/ฝากนำเข้า/ฝากโอน) เท่านั้น — Pacred ขยายไปฝั่ง **Freight** (FCL/LCL ระหว่างประเทศ + customs/clearance/export) ครบทั้ง ecosystem

## Brand & social channels
- **Company:** Pacred
- **LINE OA:** https://lin.ee/Yg3fU0I  *(แทน LINE Notify เดิม — LINE Notify EOL Apr 2025)*
- **YouTube:** https://www.youtube.com/@PacredShipping
- **Facebook:** https://www.facebook.com/PacredShippingCustomsClearanceImportExport/
- **TikTok:** https://www.tiktok.com/@pacred.co
- **Instagram:** https://www.instagram.com/pacred.co/

## Service catalogue

แต่ละบริการมี **landing page ของตัวเอง** ที่ `/services/<slug>` (public, ไม่ต้อง login) — กดจาก landing เพื่อ "ใช้บริการ" → redirect เข้าระบบหลังบ้าน (`/(protected)/...`) ที่ตรงกับ service นั้น

| # | Service (TH) | slug | กลุ่ม | สถานะ in PHP เดิม | Backend module (Next.js) |
|---|---|---|---|---|---|
| 1 | จับคู่ลงทะเบียนกรมศุล / ตัวแทนออกของ (YY) | `customs-broker-matching` | freight | ❌ ใหม่ทั้งหมด | TBD |
| 2 | ฝากสั่งซื้อสินค้า (China shopping cart) | `shop-order` | cargo | ✅ shops.php / cart.php | `(protected)/service-order/` |
| 3 | ฝากโอนชำระสินค้า (Yuan transfer / Alipay) | `yuan-transfer` | cargo | ✅ payment.php | `(protected)/service-payment/` |
| 4 | ฝากนำเข้าสินค้า — **FCL / LCL ทุกเทอม** (รถ/เรือ/แอร์) + **Cargo** (รถ/เรือ/แอร์) | `import` | both | 🟡 เฉพาะ cargo (forwarder.php) | `(protected)/service-import/` (รองรับ multi-mode) |
| 5 | ขอคืนภาษี (Tax refund) | `tax-refund` | freight | ❌ ใหม่ทั้งหมด | TBD |
| 6 | เคลียร์สินค้าติดด่าน (รถ/เรือ/แอร์) | `customs-clearance` | freight | ❌ ใหม่ทั้งหมด | TBD |
| 7 | ออกใบกำกับภาษี (Tax invoice) | `tax-invoice` | freight | partial (admin only ใน PHP) | TBD (ต่อยอดจาก receipts) |
| 8 | ออกใบขนสินค้า (Customs declaration form) | `shipping-document` | freight | ❌ ใหม่ทั้งหมด | TBD |
| 9 | ส่งออกสินค้า (Export) | `export` | freight | ❌ ใหม่ทั้งหมด | TBD |
| 10 | บริการฟูมิเกชัน (Fumigation) | `fumigation` | freight | ❌ ใหม่ทั้งหมด | TBD |
| 11 | บริการฝากขายสินค้า (Consignment) | `consignment` | new | ❌ ใหม่ทั้งหมด | TBD |
| 12 | บริการฝากจ่ายบริการ (Pay-on-behalf services) | `bill-payment` | new | ❌ ใหม่ทั้งหมด | TBD |
| 13 | ขนส่งภายในประเทศ + ต่างประเทศ + แมสเซ็นเจอร์ (Logistics + Messenger) | `logistics` | both | ❌ ใหม่ทั้งหมด | TBD |

**กลุ่ม:**
- 🟦 **cargo** = ระบบเดิมจาก PHP `pcs-cargo` (จีน→ไทย, ฝากสั่ง/นำเข้า/โอน)
- 🟧 **freight** = ส่วนขยายใหม่ของ Pacred (international FCL/LCL, customs broker, export)
- 🟪 **both** = บริการที่ครอบคลุมทั้งสองฝั่ง
- ⬜ **new** = ฟีเจอร์ใหม่ที่ไม่เคยมีในเครือเดิม

## Routing convention (planned)

```
app/[locale]/(public)/
├─ page.tsx                       # home (มีแล้ว)
└─ services/
   ├─ page.tsx                    # ภาพรวมทุกบริการ (service grid)
   └─ [slug]/page.tsx             # landing แต่ละบริการ (dynamic, content จาก CMS หรือ MDX)

app/[locale]/(protected)/         # หลังบ้าน (ลูกค้า)
├─ service-order/                 # = slug shop-order
├─ service-payment/               # = slug yuan-transfer
├─ service-import/                # = slug import (รองรับ FCL/LCL/Cargo modes)
└─ ... (modules ใหม่ตาม service catalogue)
```

**หมายเหตุ:** อาจใช้ MDX-per-service หรือ Sanity/Payload CMS ถ้า marketing ต้องแก้ landing บ่อย — ตัดสินใจตอนเริ่ม Phase H (rebrand)

---

# 👥 Team & Branch workflow

> ⚠️ **CANONICAL doc moved to [`docs/team.md`](docs/team.md)** — full role/branch/merge policy + daily workflow + safety rules
> ห้าม duplicate รายละเอียดที่นี่ — อ่านที่ `docs/team.md` ครั้งเดียว ที่เดียว

**TL;DR:**

| คน | บทบาท | Branch | Push to main |
|---|---|---|---|
| **ก๊อต** | Senior Advisor | (review only) | ✅ |
| **เดฟ** | Project Lead | `dave` | ✅ |
| **ปอน** | Frontend & SEO | `podeng` | ❌ (own branch) |
| **ภูม** | Backend & Cargo Port | `Poom` | ❌ (own branch) |

**Daily sync (every morning):**
```bash
git checkout main && git pull origin main
git checkout <my-branch> && git merge main && git push origin <my-branch>
```

**Conflict / safety:** อย่าใช้ `--force` / `reset --hard` ถ้าไม่แน่ใจ — full safety rules ใน [`docs/team.md`](docs/team.md) §5

---

## Working with this codebase

### Add a section to home
- New component in [components/sections/](components/sections/)
- Import in [app/[locale]/(public)/page.tsx](app/[locale]/(public)/page.tsx)

### Add a new feature/system (pattern)
1. SQL: add table + RLS in `supabase/migrations/NNNN_<name>.sql`
2. Validator: Zod schema in `lib/validators/<name>.ts`
3. Server Action: mutations in `actions/<name>.ts` (`"use server"`)
4. Pages: under `app/[locale]/(protected)/<name>/` (auth-guarded)
5. i18n: add keys in [messages/th.json](messages/th.json) + [messages/en.json](messages/en.json) namespace
6. (optional) Realtime: subscribe via `supabase.channel(...)` in `"use client"` component

→ See [actions/orders.ts](actions/orders.ts) + [app/[locale]/(protected)/orders/](app/[locale]/(protected)/orders/) as a working reference

### Common edits
- Locale string → both `messages/th.json` + `messages/en.json`
- Theme color → `@theme inline` in [app/globals.css](app/globals.css)
- Auth check on a page → `await requireAuth()` from `lib/auth/require-auth.ts`
- Get current user → `await getCurrentUserWithProfile()` from `lib/auth/get-user.ts`
- Mutate Supabase from Server Action → `await createClient()` from `lib/supabase/server.ts`
- Bypass RLS (admin only) → `createAdminClient()` from `lib/supabase/admin.ts`

---

# 📋 Legacy PHP Port Plan (in progress)

> **Goal:** Port ทั้งระบบ PHP เดิม (`C:\xampp\htdocs\pcscargo\member\`) มาเป็น Next.js + Supabase
> **Strategy:** เอา **logic + structure** มาก่อน ไม่ต้อง migrate data → ค่อย rebrand UI/UX + จัดกลุ่มใหม่ในเฟสถัดไป
> **Order:** ฝั่งลูกค้าก่อน (member portal) → ฝั่ง admin (back office)
>
> ⚠️ **Scope reminder:** PHP เดิมครอบเฉพาะ **cargo** (services #2, #3, #4-cargo-mode ใน ecosystem table ด้านบน) — services อื่น (`#1, #5-13`) ต้อง **build ใหม่ทั้งหมด** ในเฟสถัดไป (Phase I+) ตามแผน Pacred Ecosystem ไม่มีต้นแบบให้ port

## Survey snapshot (สำรวจแล้ว 2026-05-12)

- **PHP source:** `C:\xampp\htdocs\pcscargo\member\` (~50 ไฟล์ลูกค้า + 187 ไฟล์ admin)
- **DB:** MySQL `pcsc_main` (110+ tables, schema dump 1.38M LOC ที่ `C:\Users\Admin\Desktop\SQLWPPCS\somedata-2026-03-19-1348-pcsc_main.sql`)
- **Auth ปัจจุบัน:** PHP session + persistent cookie `pcs_logged` (10 ปี) checked vs `tb_users.pcs_logged`
- **member_code เดิม:** `PCS<int>` (PHP) — **ทิ้งไม่ใช้** เพราะเป็นบริษัทใหม่ Pacred → ใช้ `PR00001` ของเรา ไม่ต้อง compat
- **Stack PHP:** mysqli plain SQL, no framework, mPDF (THSarabunNew), PHPMailer, Bootstrap 4 admin theme
- **wp_* tables ใน `pcsc_cargo.sql`** = WordPress marketing site → ไม่ต้องพอร์ต (Next.js แทนแล้ว)

## Customer-side feature map (ฝั่ง user — port ก่อน)

| Feature module | PHP source | MySQL tables | Next.js target | สถานะ |
|---|---|---|---|---|
| **auth** (login/register/recover/verify-tel/OAuth) | login, register, regis-tam, register-id, verify-tel, fb-callback, account-settings, logout | `tb_users`, `tb_register`, `tb_corporate`, `tb_users_otp_hs`, `tb_otp_check`, `tb_users_otp`, `tb_pcs_logged`, `tb_terms_service` | `app/[locale]/(auth)/*`, `actions/auth.ts`, `actions/otp.ts` | 🟡 มี Supabase Auth + OAuth Google/FB แล้ว — ต้องเพิ่ม TOS gate, recover, verify-tel |
| **profile** | profile, account-settings, menu (avatar) | `tb_users` | `(protected)/profile/` | 🟢 มี placeholder + read user — ขยายฟอร์ม edit |
| **address** | address, china-address, include/pages/cart/add-address | `tb_address`, `tb_address_main`, `tb_address_maomao_free`, `tb_admin_address` | `(protected)/addresses/` | 🔴 ยังเป็น placeholder |
| **wallet** (รวม credit/cashback/withdraw) | wallet, wallet-credit, wallet-normal, wallet-notblank | `tb_wallet`, `tb_wallet_hs`, `tb_cash_back`, `tb_cash_back_hs`, `tb_credit`, `tb_wallet_paydeposit` | `(protected)/wallet/{deposit,withdraw,history}` | 🔴 ยังเป็น placeholder (รวม 4 variant ของ PHP เป็น 1) |
| **service-order** (ฝากสั่งซื้อ — cart→shops) | cart, shops, convertURL, search, searchIMG | `tb_cart`, `tb_header_order`, `tb_order`, `tb_promotion`, `tb_settings` | `(protected)/service-order/{add,cart,pending}` | 🔴 ยังเป็น placeholder — ใหญ่มาก (shops.php = 2215 LOC) |
| **service-import** (ฝากนำเข้า — forwarder) | forwarder, forwarder-table, invoiceF, printReceiptF, receipt-f-hs | `tb_forwarder`, `tb_forwarder_item`, `tb_forwarder_img`, `tb_rate_*`, `tb_credit` | `(protected)/service-import/{add,pending,receipts}` | 🔴 ยังเป็น placeholder — ซับซ้อนสุด มี rate engine |
| **service-payment** (ฝากโอนหยวน — Alipay) | payment, pay | `tb_payment` | `(protected)/service-payment/{add}` | 🔴 ยังเป็น placeholder |
| **sales-report** (referral commission) | user-sales, report-user-sales*, report-user-sales-history | `tb_user_sales`, `tb_user_sales_pay`, `tb_user_sales_admin_pay` | `(protected)/sales/*` (ใหม่ — restrict by role) | 🔴 ยังไม่มี — เคยจำกัด userID hardcode ต้องเปลี่ยนเป็น team_leaders table |
| **notifications** (LINE Notify) | line-notify, line, api/linenotify/* | `tb_users.userLineNotify`, `tb_users.userLineIDOA`, `tb_notify`, `tb_notify_read` | TBD — LINE Notify EOL 2025-04 → ต้องเลือก replacement | 🔴 ต้องตัดสินใจเทคโนโลยีก่อน |
| **search** (1688/Taobao) | search, convertURL, searchIMG, dataAPI | `tb_product`, `tb_keyword_product`, `tb_history_key`, `tb_api_china_hs` | `(protected)/service-order/add/` (ฝัง) | 🔴 ขึ้นกับ AkuCargo + RCGroup-TH APIs (3rd party) |

## Admin-side feature map (ฝั่ง admin — พอร์ตเฟสถัดไป)

| Group | Files | สาระหลัก |
|---|---|---|
| **Identity & RBAC** | add-admin, admin-table, admin-profile, organization-chart | `tb_admin` + tuple `(companyType, department, section)` × 40 sections; **ไม่มี role table** ต้อง redesign |
| **Accounting** (acc-*) | 8 files | dashboard บัญชีฝากสั่ง/นำเข้า/โอน/ถอน/เติม |
| **Forwarder ops** | forwarder, forwarder-bill, forwarder-driver, forwarder-quotation, forwarder-import-warehouse | จัดการ shipment + driver + invoice |
| **Shops ops** | shops, shop-search, shopping-return, cart | คีย์ออเดอร์แทนลูกค้า, refund |
| **Wallet/Payment ops** | wallet, payment, pay-users | top-up approve, Alipay payout |
| **Barcode** | barcode-c-*, barcode-d-* (9 files) | scan รับสินค้าเข้าโกดัง + driver pickup |
| **API integrations** | api-forwarder-{cn,jmf,ttp}, api-sheets-{ctt,mk,mx,sang} | sync carrier APIs + Google Sheets |
| **Cron/Automation** | api/autorun/{check-apprentice,send-line-sales,update-active-customers,update-sheet-sang} | cPanel cron → HTTP endpoints (ไม่มี IP restrict) |
| **Rates** | rate, rate-vip, settings, settings-vip | manage `tb_rate_g_*`, `tb_rate_vip_*`, `tb_rate_custom_*`, `tb_co` |
| **Reports** | 30 files report-* | datatable + filter date (driver/forwarder/shop/sale/payment/system/OTP/SMS/promo) |
| **Containers** | cnt, cnt-hs, hs-customrate, report-cnt | container tracking + HS code rates |
| **Commission withdraw** | withdraw-commission-{sale,interpreter} | จ่ายค่าคอมพนักงาน |
| **Customer mgmt** | users, users-search, transferSalesCustomers, pay-users | จัดการลูกค้า, ย้าย sales เจ้าของ |
| **Org/HR** | organization-*, contact-list-outsider, post-job, time-attendance-system, booking-meeting-room | ระบบ org + เวลางาน + จองห้องประชุม |
| **PDF print** | print*, gateway*, create-f-receipt | mPDF receipts/bills |
| **Notifications** | notify (cross-DB write→pcscafym_main!), popup, mail, get-token-linenotify | push admin |
| **Validation utils** | check-juristic, check-customer-maomao-*, check-shipby, check-payMethod, check-price-flash | | 
| **Bulk import** | import-excel, single-code-text-converter | CSV → tb_csvimport |

**Deprecated (ไม่ต้องพอร์ต ~35 files):** `*Old.php`, `*BackUp.php`, `* copy.php`, `*-test.php`, `addmail-test`, `a-Test-*`, `forwarderBackUp`, `payment20231213`, `20260311*`, `report-driver-2023`, time-bound promos (`user-pro1212`, `user-pro-valentine`, `report-pro-3-year-anniversary`, `oh-my-ghost`, `survey202306`), template skeletons (`blank*`, `code-templet`)

## Critical migration concerns

| # | Concern | แนวทาง |
|---|---|---|
| 1 | `pass_tam()` symmetric hash (legacy) — Supabase ใช้ bcrypt | force password reset on first login via OTP, OR Edge Function wrapping legacy hash → upgrade |
| 2 | LINE Notify EOL 2025-04 | เลือก replacement: LINE Messaging API push / web push / email digest / Discord/Telegram bot |
| 3 | Hardcoded secrets ใน PHP (DB pass, ThaiBulkSMS, Tiso AI, TechSol, FB secret, Sheets JSON, LINE channel, SMTP, JMF token, Gmail app password) | move to Vercel env vars |
| 4 | ~~member_code mismatch~~ | ✅ **decided:** ใช้ `PR00001` (Pacred = บริษัทใหม่ ไม่ต้อง compat กับ `PCS<num>`) |
| 5 | ไม่มี FK constraints ใน MySQL (relations implicit) | สร้าง real FK + RLS policies ใน Postgres |
| 6 | Cookie `pcs_logged` 10ปี + IP-bound auth | Supabase JWT — ไม่มี migration path สำหรับ active sessions |
| 7 | shared admin-tables (`tb_settings`, `tb_rate_*`, `tb_admin*`, `tb_organization_*`, `tb_co`) | coordinate schema migration ระหว่าง customer/admin port — อย่า double migrate |
| 8 | mPDF Thai PDFs | port to `@react-pdf/renderer` หรือ Puppeteer SSR (Sarabun font) |
| 9 | Image uploads → `/images/users/`, `/images/shops/` | migrate buckets: `avatars/`, `slips/`, `forwarder-covers/`, `member-docs/` |
| 10 | Multiple version-tagged dup files | port latest non-BackUp เท่านั้น |
| 11 | Sales feature whitelist hardcoded (`PCS888/2000/352/2678/4155`) | model เป็น `team_leaders` table + commission % |
| 12 | 3 OTP gateways (ThaiBulkSMS / Tiso AI / TechSol) | consolidate → ThaiBulkSMS (per locked decision) |
| 13 | 3rd party search APIs (AkuCargo, RCGroup-TH) อาจล่ม | abstract behind `lib/china-search/` interface |
| 14 | SQL injection risk ทั่วระบบ (concat `$_GET/$_POST`) | ต้อง re-validate ทุก mutation ผ่าน Zod ก่อน DB call |
| 15 | RBAC inline tuple `(companyType, department, section)` 40+ sections | redesign เป็น `roles` + `role_permissions` + RLS policies |
| 16 | Cross-DB write ไป `pcscafym_main` (WP DB) ใน notify.php | ตัดออก (WP จะถูก replace) |

## External integrations inventory

| Service | Use | Replace strategy |
|---|---|---|
| **ThaiBulkSMS** | OTP + customer SMS | keep, env vars |
| **Tiso AI / TechSol SMS** | OTP (legacy duplicate) | drop — ใช้ ThaiBulkSMS อย่างเดียว |
| **Facebook OAuth (v3.2)** | social login | keep — Supabase Auth |
| **LINE Login (Messaging OA)** | social login + push | TBD (LINE Notify dies; LINE Login อยู่) |
| **DBD juristic-person lookup** | tax-id verify | keep — Edge Function wrapper |
| **AkuCargo + RCGroup-TH** | product search 1688/Taobao | keep — Route Handler proxy |
| **Google Sheets API** | rate sheet cache (admin side) | port to Supabase scheduled function → `sheet_cache` table |
| **PromptPay QR** (`promptpay.js`) | QR generation client-side | keep |
| **mPDF** | Thai receipts | replace with `@react-pdf/renderer` |
| **PHPMailer SMTP** | email | replace with Resend or Supabase email |
| **JMF / TTP / CN / Flash** carrier APIs | admin sync | port to Edge Functions (admin-only) |

## Phased roadmap (ปรับใหม่จาก survey)

### 🟢 Phase A — Foundation (ก่อนเริ่ม port feature)
- [x] A1. ~~Decision: member_code scheme~~ → **`PR00001`** (Pacred ใหม่ ไม่ compat PHP)
- [x] A3. ~~Decision: schema strategy~~ → **Hybrid** (rename column ให้ snake_case + drop columns ที่ deprecated + เพิ่ม FK constraints + ตัด `tb_` prefix)
- [x] A2. ~~Decision: LINE Notify replacement~~ → **LINE Messaging API** (ADR-0001 ✅) + email digest fallback via Resend; LIFF for customer linkage (D-1-LIFF ✅ scaffolded)
- [ ] A4. Extract pure schema (CREATE TABLE only) จาก dump → split เป็น file ตาม domain
- [ ] A5. Replace social links + branding ทั้งหมดในโปรเจกต์ (PCS Cargo → Pacred, links ใหม่ทั้งหมด — ดู Decisions ด้านบน) — R2 scrub plan รอ ก๊อต ADR (Part S K-3)

### 🟡 Phase B — Customer Core (1-2 sprints)
- [ ] B1. Migration `0003_profiles_extended.sql` — เพิ่ม columns ใน profiles ที่ขาด (coID, userCompany, companyCustomer, userPayMethod, userTransportType, userShipBy, adminIDSale, userRecom, userActive, userLineNotify, userLineIDOA, channel, shopUser, etc.)
- [ ] B2. Migration `0004_corporate.sql` — `tb_corporate` (1-1 with profiles where userCompany=1)
- [ ] B3. Migration `0005_addresses.sql` — `tb_address` + `tb_address_main` (1-1 default) + soft-delete (`addressStatus=0` blocks main)
- [ ] B4. Server actions: `actions/profile.ts`, `actions/addresses.ts` + Zod validators
- [ ] B5. UI: `(protected)/profile/`, `(protected)/addresses/` — เลิก placeholder
- [ ] B6. TOS acceptance gate (modal on login if version mismatch)

### 🟡 Phase C — Wallet & Payment (1-2 sprints)
- [ ] C1. Migration `0006_wallet.sql` — `tb_wallet` (1-1) + `tb_wallet_hs` ledger + types/status enums + `tb_cash_back` + `tb_credit`
- [ ] C2. Migration `0007_payment_yuan.sql` — `tb_payment` (Alipay request)
- [ ] C3. Server actions + UI: `(protected)/wallet/{deposit,withdraw,history}`, `(protected)/service-payment/`
- [ ] C4. Slip upload → Supabase Storage `slips/` bucket
- [ ] C5. PromptPay QR client-side (port `promptpay.js` to npm `promptpay-qr`)

### 🔴 Phase D — Service-Import (Forwarder) (3-5 sprints — ใหญ่สุด)
- [ ] D1. Migration `0008_rates.sql` — `tb_rate_g_*`, `tb_rate_vip_*`, `tb_rate_custom_*`, `tb_co`, `tb_settings` (singleton config)
- [ ] D2. Migration `0009_forwarder.sql` — `tb_forwarder` (50+ columns!) + `tb_forwarder_item` + `tb_forwarder_img` + `tb_log_forwarder_status` + status enums
- [ ] D3. Port rate engine `apiCalPrice.php` → `lib/forwarder/calc-price.ts` (TypeScript) — SVIP→VIP→General waterfall, KG/CBM higher, juristic 1% off ≥1000, +50 PCS service fee
- [ ] D4. Server actions + UI: `(protected)/service-import/{add,pending,receipts}`
- [ ] D5. Receipt PDF: port `invoiceF.php` to `@react-pdf/renderer`
- [ ] D6. Cover image + multi-image upload to Storage `forwarder-covers/`

### 🔴 Phase E — Service-Order (Cart + Shops) (2-3 sprints)
- [ ] E1. Migration `0010_cart_shops.sql` — `tb_cart` + `tb_header_order` (hNo `ONS{YYMMDD}-{seq}`) + `tb_order` (line items) + `tb_promotion`
- [ ] E2. Server actions: `actions/cart.ts`, `actions/orders.ts` (replace demo)
- [ ] E3. URL→cart converter (RCGroup-TH API proxy via Route Handler)
- [ ] E4. Search 1688/Taobao (AkuCargo API proxy)
- [ ] E5. Image search (upload→reverse-image)
- [ ] E6. Auto-cancel cron: `hStatus=2 AND hDatePayment<NOW()` → `hStatus=6` (Vercel Cron / pg_cron)
- [ ] E7. UI: `(protected)/service-order/{add,cart,pending}`

### 🔴 Phase F — Sales Referral + Notifications (1-2 sprints)
- [ ] F1. Migration `0011_team_leaders.sql` — แทน hardcoded userID list; `tb_user_sales*` ledger
- [ ] F2. Notification system replacement (decided in A2)
- [ ] F3. UI: `(protected)/sales/{team,report,history}` (role-restricted)

### ⚪ Phase G — Admin Back Office (เริ่มหลัง customer-side stable)
- [ ] G1. Decision: separate Next.js app หรือ same app + `/admin/*` route?
- [ ] G2. Migration: `tb_admin` + `roles` + `role_permissions` + RLS using `is_admin()` SECURITY DEFINER
- [ ] G3. Port groups ตามลำดับ: Identity/RBAC → Customer Mgmt → Forwarder ops → Shops ops → Accounting → Reports → Barcode → Rates → API integrations → Cron → Org/HR
- [ ] G4. mPDF receipt templates → `@react-pdf/renderer`
- [ ] G5. Drop `notify.php` cross-DB write (WP gone)

### ⚪ Phase H — Polish (หลัง logic ครบ)
- [ ] H1. UX/UI redesign + rebrand (เปลี่ยนคำใหม่ + จัดกลุ่มก้อนใหม่ตามที่ user ต้องการ)
- [ ] H2. i18n complete (TH + EN ทุก key)
- [ ] H3. Tests (unit on rate engine + integration on critical flows)
- [ ] H4. Production cutover plan (active session migration, password reset campaign)

### 🆕 Phase I — Pacred Ecosystem expansion (ขยายเกิน cargo เดิม)
ส่วนนี้ **ไม่ใช่งาน port** แต่เป็น **build ใหม่** สำหรับบริการที่ PHP เดิมไม่มี — ดู service catalogue (#1, #5-13) ด้านบน

- [ ] I1. **Landing pages** สำหรับทุกบริการ (`/services/[slug]`) — copy + design + CMS choice
- [ ] I2. **Service #4 (import) FCL/LCL freight mode** — ขยาย `service-import` ให้รองรับ multi-mode (cargo / FCL / LCL × รถ/เรือ/แอร์); schema เพิ่ม `transport_mode`, `incoterm`, `container_size` fields
- [ ] I3. **Service #1 customs-broker-matching (YY)** — สร้าง broker directory + matching workflow + agreement signing flow
- [ ] I4. **Service #6 customs-clearance** — ระบบติดตามสินค้าติดด่าน + document upload + status tracking
- [ ] I5. **Service #7-8 tax-invoice + shipping-document** — issuance + PDF generation
- [ ] I6. **Service #9 export** — outbound shipping workflow (mirror import)
- [ ] I7. **Service #10 fumigation** — booking + certificate
- [ ] I8. **Service #11 consignment** — inventory + sales tracking + payout
- [ ] I9. **Service #12 bill-payment (ฝากจ่ายบริการ)** — pay-on-behalf workflow
- [ ] I10. **Service #13 logistics + messenger** — domestic/international + door-to-door
- [ ] I11. **Service #5 tax-refund** — refund claim workflow

**Sequencing:** Phase I jobs ทำ **คู่ขนาน** กับ Phase D-F ได้ (คนละ domain) — แต่ landing pages (I1) ควรขึ้นก่อน เพราะ marketing ใช้

## Key references (อย่าลืม consult)

- **PHP source root:** `C:\xampp\htdocs\pcscargo\member\`
- **Admin source:** `C:\xampp\htdocs\pcscargo\member\pcs-admin\`
- **Schema dump:** `C:\Users\Admin\Desktop\SQLWPPCS\somedata-2026-03-19-1348-pcsc_main.sql` (1.38M LOC — ห้าม Read ทั้งไฟล์ ใช้ Grep)
- **Helper catalogue:** `C:\xampp\htdocs\pcscargo\member\include\function.php` (2451 LOC of business helpers — ต้องพอร์ต `nameShipBy`, `statusOrderBadge`, `optionShipBy`, `calPriceForwarderSumCompany`, `clearCreditBalance`, `DateThai*`, etc.)
- **Auth helper:** `C:\xampp\htdocs\pcscargo\member\include\header.php` (auth gate + dashboard counters precompute)
