# 📋 Team status checkpoint — 2026-05-16 (post-merge + T-P1 batch)

> **Purpose:** ใครเปิด repo มาแล้วเห็นไฟล์นี้ → รู้ทันทีว่าเรา **อยู่ตรงไหน · ติดอะไร · ใครต้องทำอะไร**.
> **Last updated:** 2026-05-16 evening-3 (เดฟ via Claude) — TEAM-WIDE RUN-LONG MODE active. All 4 roles autonomous until เดฟ check-in. Full per-role queues + cross-dependency map below.
> **dave HEAD:** T-D2 batch shipped — `0033_containers.sql` + `0034_tax_invoices.sql` + customer receipt page + cart cap doc fix. ภูม T-P2 + T-P4 ✅ UNBLOCKED. Everyone → `git fetch && git merge origin/dave` into own branch before next batch.
> **Cadence:** ใครเปลี่ยน blocker / ปลดล็อค / ship ของใหญ่ → อัพไฟล์นี้ + commit `docs(team): status checkpoint <date> — <what>`.

---

## 🚀 TEAM-WIDE RUN-LONG MODE — read FIRST (active 2026-05-16 evening)

**Until:** เดฟ check-in (เดฟ stepping out; will pull `origin/dave` + review on return).
**Frame:** EMERGENCY cargo revenue sprint. Every task asks: *"ช่วยให้รับลูกค้า cargo ได้เร็วขึ้นไหม?"* — Yes = do · No = defer.

### Master rules (all roles)

1. **Sync first.** `git fetch && git merge origin/dave` into your branch. `dave` = staging hub.
2. **Read your brief.** `docs/briefs/<you>.md` for scope + patterns. Then your queue below.
3. **Pick top unblocked item** from your queue (P0 first). If blocked, skip to next priority.
4. **Patterns** (proven good in T-P1 + T-P3 review): Zod · `withAdmin([...])` per [ADR-0005](../decisions/0005-launch-operational-decisions.md) K-7 · idempotency on money-moving actions · granular audit log · `sendNotification` · `revalidatePath`.
5. **Update this doc** when you ship a big batch — mark ✅ in your queue + add to "Just shipped today" + commit `docs(team): status checkpoint ...`.
6. **Push at save-points only** (`push_frequency_strict`): end of session · before sleep · machine change · big batch done. ~1 push/session.
7. **Stay in V2 scope.** No refactor mid-burn ([ADR-0010](../decisions/0010-v2-v3-version-strategy.md)). Future ideas → `docs/v3-wishlist.md`.
8. **Don't preempt brand cleanup.** PCS/TTP/ไอแต้ม references survive until ก๊อต confirms API switchover (`docs/runbook/pcs-scrub-plan.md`).
9. **Escape hatch:** True blocker not in ADR/Part T/patterns → write flag at end of this doc → flip to next priority. เดฟ + ก๊อต respond async.

### Cross-dependency map (who unblocks whom)

```
ก๊อต K-12 GTM signup            → เดฟ T-D3 GTM verify + ปอน T-N3 CTA verification
ก๊อต K-13 Clarity signup        → ปอน heatmap reading (P2)
ก๊อต DV-1a Sentry signup        → prod error visibility (everyone)
ก๊อต DV-1b Upstash signup       → rate limit live (everyone)
ก๊อต DV-1c hCaptcha signup      → bot filter live (everyone)
ก๊อต T-G3 owner Bundle 1 call   → เดฟ DV-4 + entire payment path
ก๊อต MOMO endpoint inventory    → ภูม MOMO sync wire (post T-P2)
เดฟ migration apply prod        → T-D1 smoke test
เดฟ T-D1 cargo smoke test       → T-D4 soft-launch coordination
ภูม T-P5 /admin/accounting      → owner sees revenue dashboard (พี่ป๊อป stress ↓)
ภูม T-P2 containers + CT-3 view → customer "where is my container?" (churn ↓)
ภูม T-P4 tax invoice G2b-G2f    → juristic B2B customers can pay (>50% cargo value)
ปอน T-N1 SEO audit              → unblocks Ads (currently invisible to Google)
ปอน T-N2 ad landing quality     → cheaper CPC → more leads per same budget
```

Use this to prioritise the items that unblock the most downstream work.

### Per-role run-long quick reference

| Role | Brief | Top priority NOW | When blocked |
|---|---|---|---|
| **ก๊อต** | [`got.md`](../briefs/got.md) | K-12 GTM signup → K-13 Clarity → DV-1a/b/c (browser work, ~2h total) | Draft ADR-0011/0012/0013 (RBAC/shell/V2→V3 migration) OR K-sec-2 RLS audit |
| **ปอน** | [`podeng.md`](../briefs/podeng.md) | T-N1 SEO audit (why is pacred.co invisible?) → T-N2/T-N3 ad landing quality | Competitor analysis OR keyword research OR i18n polish (L-9b/c) |
| **ภูม** | [`poom.md`](../briefs/poom.md) | T-P5 `/admin/accounting` stub (acc-* PHP port) → T-P2 containers → T-P4 tax invoice G2b-G2f | T-P3 polish if any UX bug surfaces; else queue continues |
| **เดฟ** | [`dave.md`](../briefs/dave.md) | **stepping out** — returns to: T-D1 smoke test · migration apply prod · DV-1..DV-4 signups · DV-2 LIFF · DV-4 พี่ป๊อป Bundle 1 | n/a (reviewer/integrator) |

---

## 🟢 Just shipped today (ภูม + เดฟ merge)

| Commit | What |
|---|---|
| `121ea0d` | T-P1 admin workflow buttons (cargo revenue path): `adminAssignDriverToForwarder` + `adminMarkServiceOrderPaid` + UI on `/admin/forwarders/[fNo]` + `/admin/service-orders/[hNo]` (ภูม) |
| `84ca7b5` | T-P3 bulk approve: `adminBulkApproveDeposits` + `adminBulkApproveYuanPayments` + sticky bar UI on `/admin/wallet` + `/admin/yuan-payments` (ภูม) |
| `9000c28` | AGENTS.md §1 mandatory session-start handshake (เดฟ) |
| merge `Poom→dave` | เดฟ merged ภูม batch after review (production-ready: RBAC per K-7, idempotency, 305 tests green) |

**Tests:** 305 assertions all green across 13 test files.

---

## 🟢 Just shipped overnight (เดฟ — merged from `origin/dave`)

50+ commits including:

| Area | What |
|---|---|
| **ADRs (8 NEW)** | 0003 china-search vendor cutoff (Option E) · 0004 payment gateway (PromptPay-only beta) · 0005 K-4..K-7 launch ops · 0006 tax invoice flow · 0007 analytics + A/B · 0008 ERP draft · 0009 ERP schema sketch · 0010 V2/V3 strategy |
| **Code** | `lib/analytics.ts` + `lib/experiments.ts` + `experiments-server.ts` (45 new unit tests · GTM dataLayer + cookie-based A/B bucketing) · OTP dual-pepper rotation accept-window · PROMPTPAY soft-degrade |
| **Audits** | OWASP Top 10 desk audit · `pnpm audit:{md,env,i18n,all}` scripts · `.github/workflows/ci.yml` · `pnpm verify` umbrella |
| **Runbooks** | `docs/runbook/{otp-pepper-rotation,pcs-scrub-plan,vercel-cron-plan}.md` |
| **Docs** | `docs/learnings/` corpus (7 topic files) · `docs/integrations/momo-jmf.md` · `docs/sprints/archive-a-to-n.md` · 9 new agent skills in `.claude/skills/` |
| **Brand** | R2 PCS scrub sweep (4 user-visible files migrated to `CONTACT.*` imports) · LINE_OA constants centralised in `components/seo/site.ts` |

---

## 🆘 Pacred owner blockers (need พี่ป๊อป — Bundle 1 from Part Q)

ใครคุยกับพี่ป๊อปได้ → ขอให้ครบ 4 อย่างนี้ → unblock 70% ของ launch path:

| # | Item | Blocks |
|---|---|---|
| 1 | **PromptPay number** (เบอร์โทร 10 หลัก หรือ tax-ID 13 หลัก, no dash) | wallet deposit production (ตอนนี้ throw error) |
| 2 | **Bank account** number + ชื่อธนาคาร + ชื่อบัญชี (ใช้พิมพ์ใน QR receipt) | wallet deposit + tax invoice + receipt PDFs |
| 3 | **Pacred company info** (legal name TH/EN, tax ID 13 หลัก, ที่อยู่จดทะเบียน, เบอร์กลาง, email) | tax invoice flow (ADR-0006) + email templates + footer |
| 4 | **LINE Premium ID `@pacred`** subscription confirm + LIFF app create access | LINE customer push (D-1-LIFF unblock) |

> **What happens without these:** beta launch ทำได้แต่ในโหมด degraded — wallet deposit broken, tax invoice ใช้ไม่ได้, customer ไม่ได้รับ LINE notify, receipt PDFs มีข้อมูลไม่ครบ.

---

## 🔴 ก๊อต queue (run-long ACTIVE — Part S2 + Part T-G)

| # | Task | Est | Priority |
|---|---|---|---|
| **K-12** | GTM container + GA4 signup → `NEXT_PUBLIC_GTM_ID` ใน Vercel | 30-45m | 🚀 **P0 — start here** (unblocks ปอน T-N3 + เดฟ T-D3) |
| **K-13** | Microsoft Clarity signup → `NEXT_PUBLIC_CLARITY_ID` ใน Vercel | 15-30m | 🚀 **P0 — parallel to K-12** (free tier; just signup → ID) |
| **DV-1a** | Sentry signup → `SENTRY_DSN` ใน Vercel | ~30m | 🚀 **P0 — parallel** |
| **DV-1b** | Upstash Redis DB → `UPSTASH_REDIS_REST_URL/_TOKEN` ใน Vercel | ~30m | 🚀 **P0 — parallel** |
| **DV-1c** | hCaptcha site → `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` + `HCAPTCHA_SECRET_KEY` | ~30m | 🚀 **P0 — parallel** |
| **MOMO-1 (T-G2)** | Call MOMO dev → endpoint inventory → fill [`integrations/momo-jmf.md`](../integrations/momo-jmf.md) | ~2h | 🚀 **P0.5** (unblocks ภูม MOMO sync wire post-T-P2) |
| **T-G3** | Pacred owner call — Bundle 1 (PromptPay + bank + tax-ID + legal name) | ~30m call | 🚀 **P0.5** (unblocks payment path entirely) |
| K-sec-2 | RLS policy comprehensive audit — every Supabase table | 3-4h | 🟡 **P1 (when blocked on signups/calls — heavy-focus item)** |
| K-sec-3 | Audit log coverage gap report | 1-2h | 🟡 **P1 (when blocked)** |
| CSP-1 | CSP migrate from `'unsafe-inline'` to nonce-based per Next 16 | ~4h | 🟡 **P1 (post K-sec audits)** |
| **ADR-0011** | ERP RBAC granular roles per module | 2-3h | 🟢 **P2 (run-long — when all P0/P1 cleared OR while waiting on owner)** |
| **ADR-0012** | ERP frontend shell — same app vs `erp.pacred.co` | 2-3h | 🟢 **P2** |
| **ADR-0013** | ERP V2→V3 migration strategy | 2-3h | 🟢 **P2** |
| **D-7** | Payment Gateway post-beta provider pick (Omise / 2C2P / Stripe TH) | Owner call + decision | 🟢 **P3 (post-beta, post-Bundle 1)** |
| Renovate | Auto-dep PRs setup | ~1h | 🟢 P3 (quick win when bored) |

**Run-long sequence:** browser/call work first (K-12 → K-13 → DV-1a/b/c → MOMO-1 → T-G3) in any order, parallel friendly · then while waiting on owner/MOMO callback, draft ADRs (0011/0012/0013) or K-sec-2 RLS audit · finally CSP + Renovate as polish. Push to `main` is review-only — your work surfaces via ADR files + env vars in Vercel + audit docs.

---

## 🔴 เดฟ queue (Part S4 + Part T-D) — **NEXT SESSION** (เดฟ stepping out)

| # | Task | Est | Status / Blocks |
|---|---|---|---|
| **T-D2** | Backend specs for ภูม — `0033_containers.sql` + `0034_tax_invoices.sql` | 3h | ✅ **DONE + PUSHED** (this session) |
| Customer receipt page | T-P1 GAP 3 — `/service-order/[hNo]/receipt` | 30m | ✅ **DONE + PUSHED** (this session) |
| **Migration apply prod** | Apply 0023..0034 (12 files) to production Supabase via Dashboard or CLI | 30m | 🟡 **next session — pre-req for T-D1** |
| **DV-1** | Same as ก๊อต DV-1a/b/c — actually owned by ก๊อต now per Part S2 | — | (delegated to ก๊อต) |
| **DV-2** | Create LIFF app in LINE Console (Channel ID `2009931373`) → `NEXT_PUBLIC_LIFF_ID` ใน Vercel | 30m | 🟡 next session — unblocks D-1-LIFF customer push + ปอน "LINE OA" CTA |
| **DV-3** | ThaiBulkSMS account apply → API keys → Vercel env | 30m + paid | 🟡 next session — needed for OTP_BYPASS=false |
| **DV-4** | Pacred owner ติดต่อ — Bundle 1 (PromptPay + bank + company info + LIFF ID) | 15m + รอ | 🟡 next session — actually owned by ก๊อต T-G3; เดฟ assists with sequencing |
| **T-D1** | **Cargo flow end-to-end smoke test** (signup → topup → order → admin marks paid → receipt) | 4-6h | 🔴 next session — pre-reqs (receipt page ✅, migrations apply pending) |
| **T-D3** | L-22 GTM verify after ก๊อต K-12 — events → GTM Preview Mode → GA4 | 30m | 🔴 next session — depends ก๊อต K-12 |
| **T-D4** | Internal soft-launch coordination — 5 friendly customers (พี่ป๊อป network) | 2h coord + ongoing | 🔴 next session — depends T-D1 green |

**เดฟ on return** picks up in order: migration apply prod → T-D1 smoke → confirm ก๊อต K-12/K-13 active → T-D3 verify → T-D4 soft-launch coord.

---

## 🟢 ภูม queue (Part T priority — current sprint)

| # | Task | Est | Status |
|---|---|---|---|
| **T-P1** | Admin workflow buttons (driver assign + mark-paid) | 6-10h | ✅ **DONE + MERGED** (commit `121ea0d` → dave) |
| **T-P3** | Wallet/yuan-payments admin **bulk approve** | 2-3h | ✅ **DONE + MERGED** (commit `84ca7b5` → dave) |
| **T-P5** | `/admin/accounting` stub (acc-* PHP port) | 3-5h | 🟢 **NEXT — run-long mode, no confirm needed** |
| **T-P2** | CT-1 container migration + CT-3 customer view | 4-8h | ✅ **UNBLOCKED** — `0033_containers.sql` pushed (this session). ภูม picks up after T-P5 |
| **T-P4** | G2 tax invoice issuance per ADR-0006 — phases G2a-G2f | 14-19h | ✅ **UNBLOCKED** — `0034_tax_invoices.sql` pushed (this session). G2b-G2f sequence ready |
| **Customer receipt page** | T-P1 GAP 3 — `/service-order/[hNo]/receipt/page.tsx` | 30m | ✅ **DONE (เดฟ)** — pushed (this session); pre-req for T-D1 satisfied |

---

## 🟡 ปอน queue (run-long ACTIVE — Part S3 + Part T-N)

| # | Task | Est | Priority |
|---|---|---|---|
| **T-N1** | **SEO emergency audit** — why pacred.co not in Google? · sitemap deploys? · GSC indexing errors? · request manual reindex | ~3h | 🚀 **P0 — START HERE** (site invisible = Ads wasted; biggest leverage) |
| **T-N2** | Ad landing quality on top-5 pages — h1 intent keyword · CTA above fold · LCP <3s on 4G · phone+LINE visible | ~3-4h | 🚀 **P0** (quality score affects CPC) |
| **T-N3** | Funnel CTA wiring on top-5 cargo pages — `generate_lead` / `cta_click` / `start_signup` events into GTM | per-page chunks | 🟡 **P1 partial — top-3 covered (DV-8 Phase 1); finish mobile + Promotion section** |
| **T-N5** | Mobile QA top-5 cargo pages — most TH cargo buyers browse mobile | ~2h | 🚀 **P0 — parallel to T-N1/T-N2** |
| **L-5 priority polish** | Order CONFIRMED by เดฟ (run-long): **home → import-china → china-shopping → customs-clearance**. Execute in this order, ~3-4h each chunk. | ~12-16h total | 🟢 **P1 — autonomous (no more confirm needed)** |
| PCS scrub frontend half | R2 — `components/`, `app/[locale]/(public)/`, `messages/` | ~2-3h | 🟢 **P1** (coordinate with ภูม backend half — `docs/runbook/pcs-scrub-plan.md`) |
| **T-N4** | Phase I landing shells — customs-clearance / customs-broker-matching / tax-invoice / logistics | ~6h | 🟡 **P2 — blocked on Pacred owner copy direction** (escalate via team-status flag) |
| Phase D L-9b/c i18n polish | EN namespace normalize + same-value list review (`pnpm audit:i18n`) | ongoing | 🟢 **P2 self-directed (chip away anytime)** |
| "เพิ่ม LINE OA" CTA at landing pages | drop button + LIFF link on top-5 pages | 1h | 🟡 **P2 blocked on เดฟ DV-2 (LIFF app creation)** — do once `NEXT_PUBLIC_LIFF_ID` lands |
| **Marketing research** | Competitor analysis (top 5 TH cargo competitors) · keyword research (Ahrefs/free tools) · customer painpoint synthesis from sales intake | ~4-6h chunks | 🟢 **P2 self-directed when bored or blocked on owner critique** |
| **A/B experiments** | First experiment after L-24 substrate — pick hypothesis, wire variant, drop `<ExperimentBeacon>` | ~2h setup + 1-2 wk traffic | 🟢 **P3 — when K-12 GTM active** |

**Run-long sequence:** T-N1 + T-N5 + T-N2 in parallel (different surfaces) · then L-5 home → import-china → china-shopping → customs-clearance in order · then T-N3 finish · then Phase I shells when owner copy lands · marketing research as filler. Push to `origin/podeng` at save-points only (end of WFH stretch).

---

## ✅ Decisions LOCKED (no more discussion needed)

Per Part S1 + ADRs 0003-0010:

- **R1 china-search vendor:** Option E hybrid (Track G code stays in repo, **DON'T set `PACRED_TAMIT_*` / `PACRED_AKUCARGO_*` / `PACRED_LAONET_*` env vars in Vercel prod** — production runs in demo mode)
- **R2 PCS scrub:** Active (partial done; runbook `docs/runbook/pcs-scrub-plan.md`)
- **D-7 payment gateway:** PromptPay-only ก่อน beta; Omise/2C2P/Stripe TH selection deferred post-beta
- **K-4 HS variants:** Keep separate (don't merge into tier)
- **K-5 Payroll:** Extend HR (not standalone, re-evaluate at ~50 staff)
- **K-6 Tax invoice numbering:** `INV-YYYYMM-NNNN` with monthly counter reset
- **K-7 Wallet deposit approver:** `super` OR `accounting` only (not ops, not sales_admin)

---

## 🗄️ Migrations status

ภูม รันบน dev project ครบ 10 ไฟล์ (0023..0032). **เดฟ pending: replay batch บน production Supabase:**

```
0023_otp_purpose_change_phone.sql
0024_notification_ref_contact_message.sql
0025_profiles_notify_channels_daily_digest.sql
0026_notification_category_sales_digest.sql
0027_admin_contact_extras_contract_end_date.sql
0028_forwarder_driver.sql
0029_csv_imports.sql                    ← creates 'csv-imports' storage bucket
0030_hs_codes_rates.sql                  ← seeds 9 common HS codes
0031_hs_codes_rls_authenticated.sql
0032_csv_imports_started_at.sql
```

✅ **NEW from เดฟ T-D2 (this session — ภูม run on dev when picking T-P2 / T-P4):**
```
0033_containers.sql                      ← containers + shipments + tracking + history
                                            (extends admins.role: + warehouse + driver)
0034_tax_invoices.sql                    ← tax_invoices + lines + seq + INV-YYYYMM-NNNN
                                            atomic serial generator (security definer)
```

> **Note on 0033:** This migration extends `admins.role` CHECK constraint to add `'warehouse'` + `'driver'` (previously: super, ops, accounting, sales_admin). Existing rows unaffected. After applying, grant warehouse/driver roles via `insert into admins (profile_id, role)`.

---

## 🔍 Findings + flags from this batch (เดฟ responses inline 2026-05-16 evening)

1. **P-31 cart cap off-by-one** — PORT_PLAN spec said "150 OK → 151st throws" but actual `cart_items_cap` trigger raises on `cnt >= 151` (so up to 151 succeeds; 152nd fails). Test mirrors actual behavior.
   → **เดฟ:** ✅ **RESOLVED.** PORT_PLAN spec doc fixed in this batch (lines 250 + 977). Code stays at 151-cap matching legacy PHP `cart.php:17,76`. ภูม no action.

2. **Driver assignment notification reference type** (T-P1) — used `"forwarder"` because `"forwarder_driver"` isn't in `NotifyReferenceType` enum.
   → **เดฟ:** ✅ **OK as-is, defer.** Adding to enum = K-quality. Not blocking. ภูม no action.

3. **Customer-side service-order receipt PAGE missing** (T-P1 GAP 3) — action + PDF component exist; page doesn't.
   → **เดฟ:** ✅ **DONE.** Pushed `app/[locale]/(protected)/service-order/[hNo]/receipt/page.tsx` (this batch). Mirrors `/service-import/[fNo]/receipt` pattern (HTML print-friendly + "ดาวน์โหลด PDF" button → existing `/api/pdf/shop-order/[hNo]`).

4. **`forwarder_driver.profile_id` accepts ANY profile** — no driver role flag in schema.
   → **เดฟ:** ⏸️ **Defer to ก๊อต K-sec-2 RLS audit.** Not blocking T-P1. ภูม no action.

---

## 🚀 ภูม run-long direction (autonomous mode active)

> **เดฟ 2026-05-16 evening:** *"ตราบใดที่น้องยังอยู่ในทาง รู้ว่าอันไหนรีบ อันไหนหลัง ก็โอเค ปล่อยรันยาวๆ เลย ไม่ต้องเฟิม"*

**Priority queue (do in order; skip current if blocked, move to next):**

1. **T-P5** `/admin/accounting` stub (acc-* PHP port — 7 files: acc-forwarder, acc-payment, acc-shop, acc-shop-refund, acc-system-cargo, acc-topup, acc-withdraw). Each = dashboard view + filter date. ~3-5h. Use existing admin pattern (sticky bar UI from T-P3 if bulk actions needed).
2. **T-P2** container migration + CT-3 customer view — ✅ **unblocked**. `0033_containers.sql` in `dave`. Apply on dev → build `lib/warehouse/*.ts` typed clients (upsert + tracking-event-append) → CT-3 customer view page (`/(protected)/service-import/[fNo]/container` showing container card with tracking timeline) → admin warehouse view (`/admin/warehouse/containers` list + filter + detail). Spec: [`container-centric-model.md`](../architecture/container-centric-model.md) CT-1..CT-8.
3. **T-P4** tax invoice G2b-G2f — ✅ **unblocked**. `0034_tax_invoices.sql` in `dave` (G2a done). Sequence: G2b customer request flow (`requestTaxInvoice` action + form on receipt pages) → G2c admin issuance flow (`/admin/tax-invoices` list + detail + `issueTaxInvoice` + PDF + Storage upload) → G2d customer download route (`/api/tax-invoice/[id].pdf`) → G2e cancellation + credit note → G2f integration test. Spec: [ADR-0006](../decisions/0006-tax-invoice-flow.md).
4. **T-P3 polish** — if any UX bug surfaces from real-use of bulk-approve bars, fix it.
5. **MOMO sync wire** — when ก๊อต MOMO-1 endpoint inventory lands → wire `lib/integrations/momo-jmf/*.ts` (skeleton scaffolded by เดฟ Part S note) + cron/webhook sync into `containers` + `shipment_tracking` tables.

**Patterns to follow** (proven good in T-P1 + T-P3 review):
- Zod validate every input
- RBAC via `withAdmin([...])` per [ADR-0005](../decisions/0005-launch-operational-decisions.md) K-7 (wallet+invoice = `["super","accounting"]`; status flips = `["ops"]`; warehouse ops = `["super","ops","warehouse"]`)
- Idempotency on money-moving actions (check existing tx by `reference_type + reference_id + kind + status='completed'`)
- Granular audit log per row (not batched)
- Customer notify via `sendNotification` (severity match outcome)
- `revalidatePath` for every page that displays the changed row
- Commit message style: detailed "What's in" + "DECISIONS (per §6 self-directed)" + "Acceptance" (T-P1/T-P3 style — keep doing it)

**Escape hatch (true blocker):** write flag at end of this doc → flip to next priority. เดฟ + ก๊อต respond async on return.

**Push discipline:** Commit local freely. Push to `origin/Poom` at save-points only. 1 push/session.

---

## 📦 What เดฟ shipped this session (2026-05-16 evening — for ภูม reference)

1. ✅ **Merged `Poom → dave`** — T-P1 (driver assign + mark-paid) + T-P3 (wallet/yuan bulk approve) + team-status doc + UI components all landed in dave staging.
2. ✅ **`docs(team): status checkpoint` — flag responses + ภูม run-long direction** (commit `92b64c8`).
3. ✅ **`supabase/migrations/0033_containers.sql`** — `containers` + `shipments` + `shipment_tracking` + `container_status_history` + extends `admins.role` to add `'warehouse'` + `'driver'`. RLS scoped: customers read own; warehouse staff full access; drivers can write tracking events.
4. ✅ **`supabase/migrations/0034_tax_invoices.sql`** — `tax_invoices` (immutable buyer + financial snapshot per RD Code 86) + `tax_invoice_lines` + `tax_invoice_seq` + `next_tax_invoice_serial()` security-definer function for atomic `INV-YYYYMM-NNNN` generation. RLS scoped: customer reads own; super+accounting read+write all.
5. ✅ **`app/[locale]/(protected)/service-order/[hNo]/receipt/page.tsx`** — HTML print-friendly receipt for China-shop orders. Mirrors `/service-import/[fNo]/receipt` pattern. Shows pricing breakdown (CNY → rate → THB), customer info (juristic block if applicable), items + tracking numbers, "ดาวน์โหลด PDF" button → existing `/api/pdf/shop-order/[hNo]`.
6. ✅ **PORT_PLAN P-31 cart cap resolved** (lines 250 + 977) — keep code at 151-cap matching legacy PHP `cart.php:17,76`; spec doc body fixed from "150 OK → 151st throws" to "151 OK → 152nd throws".

**Acceptance (entire batch):** `pnpm exec tsc --noEmit` ✅ clean · `pnpm exec eslint` on new page ✅ clean · migration files idempotent + commented + RLS-fenced + indexed.

**ภูม next session:** pull `origin/dave` → merge into `Poom` → run `0033` + `0034` on dev Supabase → pick T-P5 (`/admin/accounting` stub) or jump to T-P2/T-P4 (now unblocked). Run-long mode — no need to wait.

---

## 🚦 Light at the end of the tunnel

When all of this lands, Pacred ships beta:

- [x] R1 + R2 + D-7 + K-4..K-8 ADRs locked
- [x] Track G china-search code shipped (in demo mode)
- [x] Track A test coverage (260 → 305 assertions across critical paths)
- [x] T-P1 admin cargo workflow buttons (driver assign + mark-paid) — merged to dave
- [x] T-P3 wallet + yuan-payments bulk approve — merged to dave
- [x] LIFF code + LINE_OA constants ready
- [x] Sentry/Upstash/hCaptcha SDK + rate-limit + captcha wired
- [x] OTP dual-pepper rotation, PROMPTPAY soft-degrade, CI workflow, OWASP audit
- [ ] **Pacred owner Bundle 1** (PromptPay + bank + company info + LIFF app) ← biggest single blocker
- [ ] เดฟ DV-1..DV-4 external signups (Sentry/Upstash/hCaptcha/SMS) ← parallel to owner ask
- [x] เดฟ T-D2 specs → ภูม T-P2 (containers) + T-P4 (tax invoice) — schemas + receipt page pushed 2026-05-16 evening
- [ ] T-D1 cargo flow end-to-end smoke test → first 5 friendly customers (T-D4)

**Estimated time-to-beta if owner bundle arrives this week:** ~1-2 weeks.

---

**End of checkpoint.** Update freq: when blocker resolves / new blocker appears / สำคัญ batch ship → edit this file + commit `docs(team): status checkpoint — <date> — <what changed>`.
