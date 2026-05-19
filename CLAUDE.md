@AGENTS.md

---

# 🚨 2026-05-19 EVENING — DIRECTION SHIFT (read FIRST)

The team pivoted from V3 (the `main → dave → Poom` loop where Wave A/B/R1
sidebar-fidelity work shipped this morning) to a **literal 1:1 transcription**
of legacy PHP → Next.js per the owner's "100% sameness FIRST" rule.

**New branch loop:**
- **`Poom-pacred`** (ภูม · admin transcription · 187 `pcs-admin/*.php` files)
- **`dave-pacred`** (เดฟ · customer transcription + integrates)
- **`podeng`** (ปอน · customer-portal frontend)
- → **`faithful-port`** (integration target · เดฟ-owned)
- → ก๊อต production gate → **`main`** (Vercel auto-deploy)

V3 branches (`Poom`, `dave`) are **FROZEN** — preserved + already merged into
`faithful-port`, so today's morning work isn't lost — but no new commits land
there until further notice.

**Method:** 1:1 transcription · same HTML markup · same SQL · `PCS → PR` branding
only · zero design decisions. Legacy source on ภูม's machine at
`C:\Users\Admin\pcscargo\` (187 admin + 42 customer-portal `.php` files).

**Status (2026-05-19 night):** register/login fix shipped to `main` · customer
portal **7/~24** screens transcribed 1:1 on `dave-pacred` (`menu`→dashboard ·
china-address · account-settings · search · wallet · addresses · cart) · admin
pilot done (`admin-table`→`/admin/admins`) · Bootstrap-4 + jQuery + FontAwesome
vendor JS being staged for 1:1 interactivity. Full status + the 4-person
work-split → [`docs/runbook/faithful-port-plan.md`](docs/runbook/faithful-port-plan.md).

**Authoritative SOTs (read in order):**
1. 🚨 [`docs/research/poom-save-point-2026-05-19-night.md`](docs/research/poom-save-point-2026-05-19-night.md) — the direction-shift save-point · branch state · per-role lanes · PCS→PR table · resume commands
2. 📋 [`docs/runbook/faithful-port-plan.md`](docs/runbook/faithful-port-plan.md) — the plan · branch model · 4-person work-split · status · cross-cutting infra
3. 🛠 [`docs/runbook/faithful-port-transcription.md`](docs/runbook/faithful-port-transcription.md) — the canonical method · 1:1 transcription steps + admin pattern §8
4. 🧰 [`.claude/skills/legacy-php-sweep/SKILL.md`](.claude/skills/legacy-php-sweep/SKILL.md) — supporting skill
5. 🗺 [`docs/runbook/pcs-data-migration.md`](docs/runbook/pcs-data-migration.md) — Phase A data load (the `tb_*` table inventory)

**Pattern references (read before transcribing your first screen):**
- Customer pilot: `app/[locale]/(protected)/dashboard/page.tsx` + `public/legacy/pcs/menu.css`
- Admin pilot: `app/[locale]/(admin)/admin/admins/page.tsx` + `public/legacy/pcs/admin/admin-base.css`

The D1 phase doc + per-role briefs below are still authoritative for company
context · the SHIFT only changes the **work-loop** and the **method**, not the
goal. Goal stays: faithful PCS Cargo port · zero retraining · D1.

---

# 🧬 Pacred DNA (load-bearing — read once, internalise forever)

**Company:** บริษัท แพคเรด (ประเทศไทย) จำกัด · **Pacred (Thailand) Co., Ltd.** · ทะเบียน `0105564077716` · **Slogan: "เร็ว ไว ไม่มีคำว่าทำไม่ได้"** · Owner **พี่ป๊อป Visit** (second-tier: เดฟ + ก๊อต).

**Scope:** ecosystem ของ import-export-customs-cargo-logistics (เคลียร์ศุลกากร · นำเข้า-ส่งออก · ขนส่งระหว่างประเทศ + ในประเทศ · ฝากสั่งซื้อ-ฝากโอน-ฝากขาย · ใบกำกับภาษี · ใบขนสินค้า · ขอคืนภาษี · ฟูมิเกชัน · แมสเซ็นเจอร์ · "และอื่นๆ ทั้งวงการ"). Markets ลำดับ: ไทย → จีน → ญี่ปุ่น → เกาหลี → มาเล → อินโด → เมกา → อื่นๆ.

**Vision:** ทำให้ทุกคน (แม้ไม่รู้อะไรเลย) สามารถนำเข้า-ส่งออกได้ ง่ายๆแค่ปลายนิ้ว. Full-loop service ดึงลูกค้าไว้ในระบบ ไม่ปล่อย handover ที่อื่น.

**Brand-split context (DON'T preempt cleanup):** Pacred = บริษัทใหม่ กำลังแยกจาก **PCS CARGO + TTP + ไอแต้ม**. บาง API ยัง "ยืม" เจ้าเก่าใช้ — ลบ reference เหล่านี้ **หลัง** ก๊อต confirm API switchover เสร็จ (ไม่ใช่ก่อน). Tracked in [`docs/runbook/pcs-scrub-plan.md`](docs/runbook/pcs-scrub-plan.md).

📋 **Full SOT:** [`docs/pacred-info.md`](docs/pacred-info.md) — addresses, phones, emails (7 depts), LINE OA, social, sales reps, JSON-LD code consumers
🧠 **Memory:** `pacred_company_dna` + `cash_burning_p0_emergency` (load via /memories)

---

# 🧭 CURRENT DIRECTION — D1: Pacred is a faithful port of PCS Cargo (2026-05-18)

**The direction changed on 2026-05-18.** The owner (พี่ป๊อป) reviewed the rebuilt-from-scratch Pacred app and **rejected it** — neither the UI nor the workflow logic-loop matches the legacy **PCS Cargo** system that staff and **~8,898 existing customers** use every day. Rebuilding fresh would force everyone to retrain.

**New direction (decision "D1"):** Pacred **becomes the legacy PCS Cargo system, faithfully — rebranded `PCS` → `PR`.** Not a reinterpretation; a faithful port. The canonical source of truth is **[ADR-0017](docs/decisions/0017-pacred-faithful-pcs-port.md)** — read it in full before any D1 work. It supersedes the "V2 = rebuilt owner-pleaser" framing of [ADR-0010](docs/decisions/0010-v2-v3-version-strategy.md).

**⚠️ Owner mandate (2026-05-19, verbatim):** *"ต้องเอาของเดิมมา copy ให้ได้ ให้เหมือนทั้งหมด 100% ก่อน แล้วเราค่อยพัฒนาให้เหนือยิ่งกว่า"* — copy the original to **100% sameness FIRST**, then improve. The owner scolded the team on 2026-05-19 for screens still diverging from legacy PCS. Faithful first; improvements are Phase C only. Every Phase-B port runs through the `legacy-fidelity-check` skill.

**Three phases:**
- **Phase A — Data migration.** Port the legacy `pcsc_main` (117 tables, ~8,898 customers, years of orders) into Pacred's PostgreSQL/Supabase. `PCS<n>` → `PR<n>` keeping the exact running number; custom auth so customers sign in with their existing password (no reset). *Status (2026-05-19): **business data LOADED to dev + prod Supabase** — 114 of 117 tables (~8,898 customers · orders · wallets · ตู้ · forwarders · receipts · login hashes) reconciled exactly; migrations `0081`-`0083`+`0087` on `dave`. Remaining: 3 oversized log tables (779 MB) + customer image files — backfilled after the Supabase Pro upgrade (imminent).* Runbook: [`docs/runbook/pcs-data-migration.md`](docs/runbook/pcs-data-migration.md).
- **Phase B — Workflow fidelity.** Rework the Pacred app — customer portal + admin back-office — so its menus, job statuses, container (ตู้) flow, and end-to-end logic-loop **match the legacy PCS system exactly**. Goal: staff + customers need *zero* retraining. *Status: **wave 1 done + integrated on `dave`** (customer 9-icon launchpad · order flow · admin per-role RBAC sidebar + badges · admin container `tb_cnt` payment ledger · legacy-auth bridge) — first-pass, not yet fidelity-verified. Waves 2+ in progress.*
- **Phase C — Pacred enhancements.** *Only after* the faithful port works, layer Pacred's own improvements on top. **Deferred — not cancelled.**

**What this means for prior work:**
- The launched rebuilt app (2026-05-17 production deploy) and its `profiles` + launch-era schema **coexist** with the ported `tb_*` schema during the transition, then retire.
- The **Tier 0/1/2/3 capability roadmap** and the **Phase-2 build queue** (booking flow · customer-intelligence · internal-chat · disbursement · china-ops · platform-observability) are **deferred to Phase C — not cancelled**, re-sequenced *after* the faithful port. [`docs/UPGRADE_PLAN.md`](docs/UPGRADE_PLAN.md) is the **D1 master phase plan** (current state · stages · work-lanes); its Phase-C appendix + [`docs/research/capability-tools-strategy-2026-05-18.md`](docs/research/capability-tools-strategy-2026-05-18.md) describe that deferred work.
- In-flight pre-D1 feature work (e.g. BK-1 booking flow, freight V-E1.1) **pauses**; the team pivots to Phase A/B.

**Decision lens (every task):** does this make the port **more faithful to PCS Cargo** — closer to *zero retraining* for staff and customers? Prefer work that moves Phase A (data migration) or Phase B (workflow fidelity) forward. De-prioritise anything that extends the rejected rebuild or belongs to the deferred Phase-C enhancements.

**Anti-patterns (under D1):**
- Extending the rejected rebuilt app or building Phase-C enhancements before the faithful port works
- Reinterpreting / "improving" the PCS workflow during Phase B — fidelity first; enhancements are Phase C
- V3 architecture redesign in this repo (V3 = `pacred-DPX`, separate repo — append ideas to `docs/v3-wishlist.md`)
- Shipping a stage before the quality gate is green (`pnpm verify` + build smoke + a functional pass)
- Scrub PCS/TTP/ไอแต้ม **before** ก๊อต API switchover (would break the revenue path)

---

# 🛑 STOP — Read your role brief FIRST (force-read every Claude Code session)

ทุก dev ใช้ Claude Code ทำงาน async บน worktree ของตัวเอง. ก่อนแตะ code หรือตอบคำถาม — **เปิด brief ของคุณก่อน**:

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
- 📐 [`docs/conventions.md`](docs/conventions.md) — code style + commit format + naming + DB rules + §13 docs rules (every .md ≤ 2000 lines · no duplication) + §14 pre-deploy smoke gate
- 🔐 [`docs/env.md`](docs/env.md) — every env var explained + production checklist (incl. §19 MOMO JMF)
- 🏢 [`docs/pacred-info.md`](docs/pacred-info.md) — company info SOT (addresses + phones + emails + LINE OA + sales reps)

**Role briefs (force-read — see top of file):**
- 🧑‍💻 [`docs/briefs/INDEX.md`](docs/briefs/INDEX.md) — routing map for which brief is yours
- [`docs/briefs/got.md`](docs/briefs/got.md) · [`docs/briefs/dave.md`](docs/briefs/dave.md) · [`docs/briefs/poom.md`](docs/briefs/poom.md) · [`docs/briefs/podeng.md`](docs/briefs/podeng.md)
- 👷 [`docs/briefs/ops-roles.md`](docs/briefs/ops-roles.md) — 14 STAFF role workspaces (system design input)

**🎯 Master strategy (single-read consolidation — all briefs + ADRs + plans condensed):**
- [`docs/STRATEGY.md`](docs/STRATEGY.md) — read once per session, refer back as needed

**🛠 Skills kit (playbooks the agent follows when triggered):**
- [`.claude/skills/INDEX.md`](.claude/skills/INDEX.md) — 12 starter skills: phase-verify-loop · bug-swarm-loop · audit-kpi-dashboard · test-coverage-writer · refactor-readability · performance-hunter · scholar-immortal · copyist-unlimited · legacy-php-sweep · qa-flow-simulator · branch-integrate-loop · mobile-first-verify

**📚 Learnings (compounding knowledge — read before re-debugging):**
- [`docs/learnings/_index.md`](docs/learnings/_index.md) — every agent / dev adds new entries via `scholar-immortal` skill

**Living docs (เดฟ updates):**
- 🧭 [`docs/decisions/0017-pacred-faithful-pcs-port.md`](docs/decisions/0017-pacred-faithful-pcs-port.md) — **THE current direction (D1)** — faithful PCS Cargo port, Phase A/B/C. Start here for "what's next".
- 🚀 [`docs/UPGRADE_PLAN.md`](docs/UPGRADE_PLAN.md) — **the D1 master phase plan** — current state + the stages (A-final → B-0 → B-waves → C) + the work-lanes. The canonical "what's next" sequencing doc; deferred Phase-C/Tier detail kept as a labelled appendix.
- 🚚 [`docs/runbook/pcs-data-migration.md`](docs/runbook/pcs-data-migration.md) — **Phase A runbook** — the `pcsc_main` (117 tables) → Supabase data migration; business data loaded to dev + prod, 3 log tables + customer images pending the Supabase Pro upgrade.
- 📋 [`docs/PORT_PLAN.md`](docs/PORT_PLAN.md) — sprint history + cargo/gap-hunt backlogs (Parts O–W; Part V = cargo-forensics, Part W = gap-hunt; ~1825 lines — watch the 2000-line cap)
- 📚 [`docs/sprints/archive-a-to-n.md`](docs/sprints/archive-a-to-n.md) — historic survey (Parts A–N — moved out to keep PORT_PLAN under 2000-line agent ceiling)
- 🏗 [`docs/architecture.md`](docs/architecture.md) — system diagrams + DB schema + auth + security
- 🏗 [`docs/architecture/container-centric-model.md`](docs/architecture/container-centric-model.md) — **NEW** warehouse/container/shipment spine (4 tables, RLS, status enums, CT-1..CT-8 implementation)
- 🤝 [`docs/integrations/momo-jmf.md`](docs/integrations/momo-jmf.md) — MOMO partner API spec (JWT, endpoint inventory TBD)
- 🧠 [`docs/PACRED-SECOND-BRAIN.md`](docs/PACRED-SECOND-BRAIN.md) — context notes + gotchas

**Reference (open เมื่อจำเป็น):**
- [`AGENTS.md`](AGENTS.md) — Next 16 breaking changes (สำหรับ Claude/AI)
- [`docs/decisions/*.md`](docs/decisions/) — ADRs (incl. 0010 V2/V3 version strategy, 0006 tax invoice, 0007 analytics, 0014 state transitions, 0015 withholding tax, 0016 freight value model)
- [`docs/audit/chat-analysis-2026-05-16.md`](docs/audit/chat-analysis-2026-05-16.md) — **NEW** LINE chat audit (จุดรั่ว + MOMO status enum canonical + workflows team really uses)
- [`docs/audit/legacy-cleanup-2026-05-16.md`](docs/audit/legacy-cleanup-2026-05-16.md) — **NEW** PHP cleanup sweep (~115 dead-code files + 6 NEW critical security findings + 5 minor port gaps)
- [`docs/audit/cargo-ops-forensics-2026-05-16.md`](docs/audit/cargo-ops-forensics-2026-05-16.md) — **NEW** decoded cargo/freight ops model (GZE truck / GZS sea · A/M/X/O/Z types · Form E / D-O / invoice-value engineering) + ไอแต้ม-chat problem catalog → PORT_PLAN Part V
- 🆕 [`docs/research/capability-tools-strategy-2026-05-18.md`](docs/research/capability-tools-strategy-2026-05-18.md) — capability synthesis (growth / operating-system / build-vs-buy) → the Tier 0/1/2/3 roadmap. **Deferred to Phase C by D1** ([ADR-0017](docs/decisions/0017-pacred-faithful-pcs-port.md)) — not the current "what's next".
- 🆕 [`docs/research/PACRED-MASTER-STRATEGY.md`](docs/research/PACRED-MASTER-STRATEGY.md) — **chained gap-hunt synthesis** — rolls the 5 source-code gap docs ([`docs/research/`](docs/research/_index.md)) into 4 problems: a 🔴 P0 security keystone (`driver`/`warehouse` RLS reach all money tables — fix launch-week), the 🔴 wallet-leak chain, the "islands with no bridges" flow-wiring workstream, and **[PORT_PLAN Part W](docs/PORT_PLAN.md)** backlog
- [`docs/audit/owasp-2026-05.md`](docs/audit/owasp-2026-05.md) — pre-launch security posture (note: superseded on RLS-vs-role-model by the master strategy §1)
- [`docs/audit/php-pcscargo-integrations.md`](docs/audit/php-pcscargo-integrations.md) — deep legacy PHP integrations audit (companion to legacy-cleanup-2026-05-16)
- [`docs/runbook/*.md`](docs/runbook/) — operational runbooks (PCS scrub + OTP rotation + cron + cargo smoke test T-D1)
- [`docs/setup/*.md`](docs/setup/) — onboarding guides (OAuth/Supabase/Vercel/LINE)
- [`supabase/migrations/README.md`](supabase/migrations/README.md) — migration runbook

**ทำงานครั้งแรก:**
1. **เปิด YOUR brief จาก [`docs/briefs/`](docs/briefs/)** ก่อนทุกอย่าง (force-read — see top of file)
2. อ่าน [`docs/HANDBOOK.md`](docs/HANDBOOK.md) → [`docs/team.md`](docs/team.md) → [`docs/conventions.md`](docs/conventions.md)
3. `cp .env.example .env.local` + fill values (ถามเดฟ) — รายละเอียดทุก var ใน [`docs/env.md`](docs/env.md)
4. รัน migration ที่ยังไม่ได้รัน — ดู [`supabase/migrations/README.md`](supabase/migrations/README.md)
5. หางานของตัวเอง: brief ของคุณ + [`docs/decisions/0017-pacred-faithful-pcs-port.md`](docs/decisions/0017-pacred-faithful-pcs-port.md) §"Work-split" (current per-role D1 work)
6. Sync branch ตามวิธีใน [`docs/team.md`](docs/team.md) §3 (น้อง pull จาก `dave` ไม่ใช่ `main`!) + §3.0 push-frequency rule (save-points only — sleep / machine change / location change / big batch done; per memory `push_frequency_strict`)

---

# Project Snapshot — pacred-web

Last updated: 2026-05-19 (D1 — Phase A data loaded to dev + prod · Phase B wave-1 integrated — see [ADR-0017](docs/decisions/0017-pacred-faithful-pcs-port.md) + [`docs/UPGRADE_PLAN.md`](docs/UPGRADE_PLAN.md))

> **Pacred** — ระบบเว็บไซต์บริษัทนำเข้า-ส่งออก / ชิปปิ้ง / เคลียร์ศุลกากร / ฝากสั่งซื้อสินค้าจากจีน
> Marketing site + landing pages + customer member portal + admin back-office. The rebuilt app launched 2026-05-17, but on **2026-05-18 the owner redirected the project (D1)** — Pacred is now a **faithful port of the legacy PCS Cargo system** (`PCS` → `PR`). Current work: **Phase A** (data migration — legacy `pcsc_main` business data loaded to dev + prod Supabase; 3 log tables + customer images backfill after the Supabase Pro upgrade) → **Phase B** (workflow fidelity — wave 1 integrated on `dave`, waves 2+ in progress). See the "CURRENT DIRECTION — D1" section at the top of this file + [`docs/UPGRADE_PLAN.md`](docs/UPGRADE_PLAN.md) for the full phase plan.

> 🎯 **Live state** — ดูที่ [`docs/STRATEGY.md`](docs/STRATEGY.md) §9 (shipped vs pending — updated each save-point). The "Auth & Backend State" section below and STRATEGY.md §9 describe the **rebuilt** app — that work is preserved + coexists with the ported `tb_*` schema during the D1 transition, but the rebuilt schema/workflow is no longer the target; the legacy PCS workflow is. Phase B reworks the app to match it.

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

📐 Full convention rules → [`docs/conventions.md`](docs/conventions.md) (CANONICAL — code style + commit format + naming + DB rules + §13 docs rules ≤2000 lines · no duplication + §14 pre-deploy smoke gate).

**Hot tips you'll trip on:**
- Path alias `@/*` → `./*`; locale prefix `as-needed`; default locale TH; `Link` from `@/i18n/navigation` (NOT `next/link`)
- Tailwind v4 → `@theme inline` in [`app/globals.css`](app/globals.css) (no `tailwind.config.js`); brand red = `primary-600` (#B30000)
- Component split: section-level → [`components/sections/`](components/sections/); reusable UI → [`components/ui/`](components/ui/); default Server Component unless state needed
- i18n: TH+EN parity in [`messages/th.json`](messages/th.json) + [`messages/en.json`](messages/en.json); `pnpm audit:i18n` enforces

## Folder Structure

📁 **Live tree** is the authoritative source — `ls app/[locale]/` to see actual routes. High-level shape:

- `app/[locale]/(public)/` — marketing site + landing pages (no auth)
- `app/[locale]/(auth)/` — login/register/forgot — guests only; auto-redirect signed-in to `/`
- `app/[locale]/(protected)/` — customer portal (dashboard / orders / wallet / shipments / etc.) — `requireAuth()` gate
- `app/[locale]/(admin)/admin/*` — admin back-office — `requireAdmin()` gate per [ADR-0002](docs/decisions/0002-admin-architecture.md)
- `actions/` — Server Actions (`actions/auth.ts`, `actions/wallet.ts`, etc.); admin variants in `actions/admin/*`
- `lib/` — `supabase/{client,server,admin}.ts` · `auth/*` · `sms/gateway.ts` · `notifications/*` · `validators/*` (Zod) · `pdf/*` · `forwarder/calc-price.ts`
- `supabase/migrations/` — 0001..0087 numbered migrations (`0065` is an intentional unused gap; `0081`-`0083` = the D1 legacy `tb_*` schema/indexes/member-seq, applied to dev + prod; `0087` = a migration-view security fix — see [`docs/runbook/pcs-data-migration.md`](docs/runbook/pcs-data-migration.md) §9; next free number `0088`); see [`supabase/migrations/README.md`](supabase/migrations/README.md)
- `proxy.ts` (NOT `middleware.ts` — Next 16 rename) at repo root

## Auth & Backend State (rebuilt app — coexists during the D1 transition)

> ⚠️ **D1 note:** this section describes the **rebuilt** app's auth/backend (Phase 1-5 pre-D1). Under D1 it **coexists** with the ported legacy `tb_*` schema and the legacy-auth bridge (`lib/auth/pcs-legacy-bridge.ts` — migrated PCS customers sign in with their existing password, no reset) during the transition, then retires. Phase-B work reworks these surfaces onto the `tb_*` schema.

### What works
- **Supabase Auth** — email/phone + password. Social login (Google/Facebook OAuth + LINE) is gated OFF by default behind `NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED` → the buttons render greyed-out "COMING SOON" (legacy PCS was password-only; D1 defers social login to Phase C)
- **Legacy-auth bridge** — `lib/auth/pcs-legacy-password.ts` + `pcs-legacy-bridge.ts` — migrated PCS customers sign in with their **existing** PCS password (no reset) via a "เชื่อมต่อบัญชี PCS CARGO" login; the 79-char legacy hash is verified against the ported `tb_users.userpass`
- **DB** — profiles (auto-gen `PR001` member_code — PR + min-3-digit running no.), documents, otp_codes, orders
- **Storage** — `member-docs/` private bucket, RLS = owner-only
- **OTP** — custom via ThaiBulkSMS, hashed (sha256+pepper), TTL 5min, rate-limited 3/hour
  - **`OTP_BYPASS=true`** in dev → skip SMS + accept any code
- **Sessions** — `proxy.ts` middleware refreshes tokens; cookies set by `@supabase/ssr`
- **Route guards** — `(auth)` redirects logged-in users; `(protected)` redirects guests + incomplete profiles
- **NavBar** — auto-aware: shows login/register buttons OR user menu (avatar + dropdown) based on session

### Pages live + current state

📊 **Live state snapshot** is in [`docs/STRATEGY.md`](docs/STRATEGY.md) §9 (shipped vs pending — updated each save-point). The lists below were Phase 1-5 historic — **current state lives in STRATEGY.md §9, not here**.

Shipped + in production: customer portal (`/service-order` · `/service-import` · `/service-payment` · `/wallet` +deposit/+history/+withdraw · `/refunds` · `/sales` · `/notifications` · `/shipments` +[code]) · `/admin/*` (60+ routes incl. accounting/container-costs · disbursements · refunds · migration/pcs-customers · search · system/crons · system/notifications) · tax-invoice flow · pay-from-wallet self-serve · customer credit line · staff RBAC console. **Post-launch U1/U2/U4 + Tier 0/1/2 features shipped on `dave`** — incl. `/contact` lead funnel · `/start-order` + `QuoteCTA` buy-bridge · `/admin/kpi` exec dashboard · `/admin/board` + `/admin/inbox` work-board. See STRATEGY.md §9 + [`docs/research/capability-tools-strategy-2026-05-18.md`](docs/research/capability-tools-strategy-2026-05-18.md).

## Architecture & Roadmap

📐 **Blueprint:** [`docs/architecture.md`](docs/architecture.md) — full diagrams, DB schema, auth flows, security model.

🎯 **Master strategy (single-read consolidation):** [`docs/STRATEGY.md`](docs/STRATEGY.md) — read once per session.

📋 **Locked decisions (ADRs):** [`docs/decisions/`](docs/decisions/) — 17 ADRs + drafts. The high-leverage ones:
- **ADR-0017 — D1: Pacred = faithful PCS Cargo port** (the current direction — supersedes the "V2 = rebuilt owner-pleaser" framing of ADR-0010)
- ADR-0001 LINE Notify → Messaging API push (creds set; LIFF pending DV-2)
- ADR-0002 admin architecture (`is_admin()` SECURITY DEFINER + `admins` table)
- ADR-0003 China-search Option E (Track G code, prod=demo mode)
- ADR-0004 PromptPay-only pre-beta; Omise/2C2P/Stripe = post-beta ([decision matrix](docs/decisions/d7-payment-gateway-decision-matrix.md) ready)
- ADR-0006 tax invoice (RD Code 86)
- ADR-0007 GTM + Clarity + cookie A/B
- ADR-0010 V2 vs V3 (`pacred-dpx`) — note: the "V2 = rebuilt owner-pleaser" definition is superseded by ADR-0017 (V2 is now the faithful PCS port); V3 unaffected
- ADR-0014 customer self-service state transitions (admin-client-after-ownership-verify)
- ADR-0015/0016 ✅ Accepted 2026-05-16 (WHT model + freight value model)
- ADR-0011/0012/0013 (DRAFT — V3 RBAC granular + ERP shell + V2→V3 migration; deferred T+30d)

🌱 **Infra stack:** Vercel + Supabase Cloud · `proxy.ts` middleware · ThaiBulkSMS OTP (`OTP_BYPASS` flag) · `member_code` = `PR001` running — **PR + minimum 3 digits**, overflow-safe past PR999 (Postgres trigger `generate_member_code`, migration `0060`; **NO compat with PHP `PCS<num>`** — Pacred is new company).

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

> **Goal:** Port ทั้งระบบ PHP เดิม (`/Users/dev/Desktop/pcscargo/member/` บน Mac · `C:\xampp\htdocs\pcscargo\member\` บน Windows) มาเป็น Next.js + Supabase
> **Strategy:** เอา **logic + structure** มาก่อน ไม่ต้อง migrate data → ค่อย rebrand UI/UX + จัดกลุ่มใหม่ในเฟสถัดไป
> **Order:** ฝั่งลูกค้าก่อน (member portal) → ฝั่ง admin (back office)
>
> ⚠️ **Scope reminder:** PHP เดิมครอบทั้ง **cargo** (services #2, #3, #4-cargo-mode) **+ freight** (ใน `pcs-admin/include/pages/{home/Freight, home/CargoAndFreight, hs-forwarder-invoice, forwarder-quotation, withdraw-commission-*}`) — services อื่น (`#1, #5-13`) ต้อง **build ใหม่ทั้งหมด** ในเฟสถัดไป (Phase I+)
>
> 🆕 **AUTHORITATIVE gap status (2026-05-16 night):** [`docs/audit/php-deep-sweep-2026-05-16.md`](docs/audit/php-deep-sweep-2026-05-16.md) — เดฟ-led 4-agent deep-sweep against 20,331 .php files + verification pass. Found **17 NEW DB tables** + **12 freight subdirs** + **24 admin polish items** that the prior `legacy-cleanup-2026-05-16` audit §6 missed. The deep-sweep audit replaces §6 "should-port" assessment; tables below remain useful as **customer-side / admin-side historical reference** but for current Sunday-night blockers + V2 long-phase backlog **read the deep-sweep doc + [PORT_PLAN Part V](docs/PORT_PLAN.md) V-E6..V-E12 / V-G / V-H**.

## Survey snapshot (สำรวจแล้ว 2026-05-12; updated 2026-05-16 deep-sweep)

- **PHP source:** `/Users/dev/Desktop/pcscargo/member/` (Mac) · `C:\xampp\htdocs\pcscargo\member\` (Windows) — 20,331 .php files / 2.2 GB
- **DB:** MySQL `pcsc_main` (110+ tables; full schema in legacy SQL dumps)
- **member_code เดิม:** `PCS<int>` (PHP) — **ทิ้งไม่ใช้**; Pacred ใช้ `PR001` running (PR + ขั้นต่ำ 3 หลัก)
- **Stack PHP:** mysqli plain SQL, mPDF (THSarabunNew), PHPMailer, Bootstrap 4

## Customer-side / Admin-side feature maps + migration concerns + integrations

**Authoritative live docs (read these, not duplicates below):**

| What you need | Where it lives |
|---|---|
| Per-feature port status + tasks | [`docs/PORT_PLAN.md`](docs/PORT_PLAN.md) Parts O-V (most active) + archive Parts A-N |
| Master gap audit (20k file sweep) | [`docs/audit/php-deep-sweep-2026-05-16.md`](docs/audit/php-deep-sweep-2026-05-16.md) |
| Deep integrations + secrets inventory | [`docs/audit/php-pcscargo-integrations.md`](docs/audit/php-pcscargo-integrations.md) (TAMIT, JMF, LINE Notify, SMS, OAuth, mPDF) |
| Dead-code + security findings (S-1..S-6) | [`docs/audit/legacy-cleanup-2026-05-16.md`](docs/audit/legacy-cleanup-2026-05-16.md) §1-5 (§6 superseded by deep-sweep) |
| Cargo ops decoded (GZE/GZS / A-M-X-O-Z / Form E / D-O / "แผน VAT") | [`docs/audit/cargo-ops-forensics-2026-05-16.md`](docs/audit/cargo-ops-forensics-2026-05-16.md) |
| Chat-derived workflows (W-1..W-9) + leak holes (L-1..L-10) | [`docs/audit/chat-analysis-2026-05-16.md`](docs/audit/chat-analysis-2026-05-16.md) |
| Cutover dependency burn-down (F1-1..F1-8) | [`docs/runbook/legacy-cutover-tracker.md`](docs/runbook/legacy-cutover-tracker.md) |
| Per-task implementation specs (V-D / V-E / V-G / etc.) | [`docs/port-specs/`](docs/port-specs/) — 10 spec docs |
| Per-task ADR decisions | [`docs/decisions/`](docs/decisions/) — 16 ADRs + 5 plans/matrices |

## Phased roadmap

> **Historic Phase A-I list moved to:** [`docs/PORT_PLAN.md`](docs/PORT_PLAN.md) Parts O-V (live) + [`docs/sprints/archive-a-to-n.md`](docs/sprints/archive-a-to-n.md) (Phase A-N historic).
>
> **Current state (2026-05-16):** Phase A-F ✅ shipped · Phase G admin back-office ~98% HR + ~50% ops + 60+ routes shipped · Phase H polish ongoing · Phase I expansion = V2 long-phase post-Monday-launch ([port-specs/](docs/port-specs/) for V-E6..V-E12 freight stack + V-G admin polish).

## Key references (อย่าลืม consult)

- **PHP source:** `/Users/dev/Desktop/pcscargo/` (Mac) · `C:\xampp\htdocs\pcscargo\` (Windows)
- **Admin source:** `<root>/member/pcs-admin/` (187 entry .php + 85 business-logic subdirs under `include/pages/`)
- **Helper catalogue:** `<root>/member/include/function.php` (2451 LOC) + `<root>/member/pcs-admin/include/function.php` (3500 LOC)
- **Schema dump:** legacy SQL dumps (see `docs/audit/legacy-cleanup-2026-05-16.md` §7)
- **Use legacy-php-sweep skill** (`.claude/skills/legacy-php-sweep/SKILL.md`) when porting any feature
