# 📋 Team status checkpoint — 2026-05-16 (post-merge + T-P1 batch)

> **Purpose:** ใครเปิด repo มาแล้วเห็นไฟล์นี้ → รู้ทันทีว่าเรา **อยู่ตรงไหน · ติดอะไร · ใครต้องทำอะไร**.
> **Last updated:** 2026-05-16 evening-2 (เดฟ) — T-D2 schemas + receipt page + P-31 cart cap resolved all shipped.
> **dave HEAD:** T-D2 batch shipped — `0033_containers.sql` + `0034_tax_invoices.sql` + customer receipt page + cart cap doc fix. ภูม T-P2 + T-P4 now ✅ UNBLOCKED. ภูม → `git fetch && git merge origin/dave` into Poom before starting next batch.
> **Cadence:** ใครเปลี่ยน blocker / ปลดล็อค / ship ของใหญ่ → อัพไฟล์นี้ + commit `docs(team): status checkpoint <date> — <what>`.

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

## 🔴 ก๊อต queue (per Part S2 — most ✅ done; remaining ↓)

| # | Task | Est | Status |
|---|---|---|---|
| K-12 | **GTM container + GA4 signup → set `NEXT_PUBLIC_GTM_ID` ใน Vercel** | 30-45m | 🔴 pending — code shipped, แค่ต่อท่อ Google ปลายทาง |
| K-13 | **Microsoft Clarity signup → set `NEXT_PUBLIC_CLARITY_ID` ใน Vercel** | 15-30m | 🔴 pending — code shipped, free tier |
| K-sec-2 | RLS policy comprehensive audit | 3-4h | 🟡 P3 |
| K-sec-3 | Audit log coverage gap report | 1-2h | 🟡 P3 |
| K-ADR-erp-phase-2 | Co-author with ภูม (Sprint 7+ Track D) | 4-6h | 🟡 P4 |

---

## 🔴 เดฟ queue (per Part S4 + Part T-D)

| # | Task | Est | Blocks |
|---|---|---|---|
| **DV-1** | Sentry + Upstash + hCaptcha signups (3 services, free tier) | 30m | activates D-12-wire + D-13-wire + D-11 Sentry |
| **DV-2** | Create LIFF app in LINE Console (Channel ID `2009931373`) → set `NEXT_PUBLIC_LIFF_ID` ใน Vercel | 30m | D-1-LIFF customer push |
| **DV-3** | ThaiBulkSMS account apply → API keys → Vercel env | 30m + paid | OTP จริง (OTP_BYPASS=false) |
| **DV-4** | Pacred owner ติดต่อ — Bundle 1 (PromptPay + bank + company info) | 15m + รอ | ดู "Pacred owner blockers" ด้านบน |
| **T-D1** | **Cargo flow end-to-end smoke test** (signup → topup → place order → admin marks paid → receipt) | 4-6h | confirms revenue path before public ad spend |
| **T-D2** | **Backend specs for ภูม:** `0033_containers.sql` (CT-1) + `0034_tax_invoices.sql` (G2a) — draft + ภูม reviews + applies | 3h | ✅ **DONE + PUSHED** (this session) — ภูม T-P2 + T-P4 now unblocked |
| **T-D3** | L-22 GTM verify after K-12 — events → GTM Preview Mode → GA4 → reports | depends K-12 | confirms ad attribution pipeline |
| **T-D4** | Internal soft-launch coordination — pick 5 friendly customers + hand-hold through end-to-end | 2h coord + ongoing | first real revenue + prod stress test |

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

## 🟡 ปอน queue (Part S3 — frontend)

| # | Task | Est | Status |
|---|---|---|---|
| Phase B L-5 priority page polish | sync เดฟ on order, then implement | ~3-4h chunks | 🔴 blocked on เดฟ confirm priority page order (suggested: home → import-china → china-shopping → customs-clearance) |
| PCS scrub frontend half (R2) | components/, app/, messages/ | ~2-3h | 🟡 unblocked — coordinate with ภูม backend half |
| "เพิ่ม LINE OA" CTA at landing pages | drop button + LIFF link | 1h | 🔴 blocked on DV-2 (LIFF app creation) |
| Phase D L-9b/c i18n polish | self-directed | ongoing | 🟢 unblocked |
| **T-N1** SEO emergency audit (Part T) | 3h | site invisible audit | 🟡 P0 — high impact on ad cost |
| **T-N2** Ad landing quality (h1/CTA/load time) on top-5 pages | ~3-4h | 🟢 unblocked |
| **T-N3** Funnel CTA wiring on top-5 cargo pages | per-page small chunks | 🟢 partial — DV-8 Phase 1 covered top-3; remaining = mobile + Promotion (Phase 2) |
| **T-N5** Mobile QA top-5 cargo pages | ~2h | 🟢 unblocked |

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

## 🚀 ภูม run-long direction (per เดฟ 2026-05-16 evening)

> **เดฟ:** *"ตราบใดที่น้องยังอยู่ในทาง รู้ว่าอันไหนรีบ อันไหนหลัง ก็โอเค ปล่อยรันยาวๆ เลย ไม่ต้องเฟิม"*

**Mode = autonomous run-long.** No need to wait for เดฟ confirm between tasks. Push at save-points only.

**Priority queue (do in order; skip current if blocked, move to next):**

1. **T-P5** `/admin/accounting` stub (acc-* PHP port) — unblocked, go anytime
2. **T-P3 polish** — if any UX bug surfaces from real-use of the bulk-approve bars, fix it
3. **T-P2** container migration + CT-3 customer view — ✅ **unblocked**. `0033_containers.sql` already in `dave`. Spec: [`container-centric-model.md`](../architecture/container-centric-model.md) CT-1..CT-8. Apply on dev → build `lib/warehouse/*.ts` typed clients → CT-3 customer view page → admin warehouse view → MOMO sync wire.
4. **T-P4** tax invoice G2a-G2f — ✅ **unblocked**. `0034_tax_invoices.sql` already in `dave` (G2a done). G2b-G2f per [ADR-0006](../decisions/0006-tax-invoice-flow.md). Customer-side request form attaches to existing receipt page (`/service-order/[hNo]/receipt` shipped this session).

**Patterns to follow (proven good in T-P1 + T-P3 review):**
- Zod validate every input
- RBAC via `withAdmin([...])` per [ADR-0005](../decisions/0005-launch-operational-decisions.md) K-7 (wallet+invoice = `["super","accounting"]`; status flips = `["ops"]`)
- Idempotency on money-moving actions (check existing tx by `reference_type + reference_id + kind + status='completed'`)
- Granular audit log per row (not batched)
- Customer notify via `sendNotification` (severity match outcome)
- `revalidatePath` for every page that displays the changed row
- Commit message style: detailed "What's in" + "DECISIONS (per §6 self-directed)" + "Acceptance" (T-P1/T-P3 style — keep doing it)

**If you hit a true blocker not covered by ADRs / Part T / patterns above:**
- Write the flag at the end of this `team-status` doc (new section or append)
- Flip to next priority task — don't wait
- เดฟ + ก๊อต will respond async (within session or next day)

**Push discipline (per `push_frequency_strict`):** Commit local freely. Push to `origin/Poom` only at save-points: end of session · before sleep · machine change · big batch done. 1 push max per Claude Code session.

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
