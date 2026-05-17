# 🚢 Pacred — Port Plan & Work Split

> **เป้าหมาย:** Port ระบบ PHP `pcs-cargo` ทั้งระบบ (customer + admin) → Next.js + Supabase
> **กติกา:** อ่านเอกสารนี้ครั้งเดียวจบ — **ไม่ต้องกลับไปดูไฟล์ PHP ต้นฉบับอีก**
> **วันที่:** 2026-05-13 · **เวอร์ชัน:** 1.0

---

## 🚨🚨 URGENT — เดฟ + ก๊อต attention (2026-05-15 evening) 🚨🚨

**✅ R1 vendor cutoff RESOLVED 2026-05-15 ค่ำ** — ก๊อต+เดฟ approved Option F (use TAM API interim, ก๊อต cutoff later). ADR: [`docs/decisions/0003-china-search-vendor-cutoff.md`](decisions/0003-china-search-vendor-cutoff.md) + cutoff checklist locked. **ภูม unblocked** → Track G activates in production day-1.

**Part Q (active):** Production beta blockers — บัญชี/LINE/การเงิน ที่ owner ต้อง provide creds + decisions **→ ดู [Part Q](#part-q--urgent-pacred-owner-blockers-2026-05-14)** สำหรับ 3 bundles + D-1-LIFF + production launch checklist.

**Part R (mostly resolved):** R1 ✅ done. R2 PCS branding scrub still pending. R3-R5 reduced — most decisions ก๊อต+เดฟ ตัดสินได้คนละครึ่ง.

**Estimate (revised):** beta launch in 1-2 weeks if Bundle 1 creds (PromptPay + SMS + Pacred company info + LIFF app) come this week. China-search no longer blocks anything.

---

## 📊 TL;DR — สรุป 5 บรรทัด

| | สถานะปัจจุบัน |
|---|---|
| ✅ **Customer-facing (ฝั่งลูกค้า)** | **~85% เสร็จ** — auth, dashboard, orders, forwarders, wallet, payment ทำงานได้จริง |
| ✅ **Admin HR** | **100% เสร็จ** — org chart, employees, recruitment, attendance, training, policies, audit |
| 🟡 **Admin Operations** | **~40% เสร็จ** — list views มี, ปุ่ม approve/reject/edit ส่วนใหญ่ยังไม่ครบ |
| 🔴 **Admin Finance/Reports** | **~10% เสร็จ** — accounting, reports เป็น stub |
| 🔴 **API Integrations** | **0% เสร็จ** — JMF/TTP/Sheets/PDF generation ยังไม่ทำ |

**Critical gaps สำหรับ launch:** PDF receipts (จริงๆ), admin forwarder/order status workflow, admin wallet approve, rate management UI

---

## 🎯 แผนแบ่งงาน

```
ปอน (podeng)  → ปิด customer-facing gaps + UI polish     [~3 sprints]
ภูม (Poom)    → admin operations ทั้งหมด                  [~4 sprints]
เดฟ (dave)    → integrations + critical infra + coordination [~3 sprints]
```

**Total estimated:** ~3-4 สัปดาห์ ถ้า full-time

---

<!-- PORT_PLAN_SPLIT_MARKER_2026_05_16 -->

> 📚 **Historic context (Parts A–N) moved 2026-05-16** to
> [`docs/sprints/archive-a-to-n.md`](sprints/archive-a-to-n.md) to keep
> this file under the 2000-line agent-read limit. Open the archive when
> auditing the PHP-port survey, gap analysis, earlier sprint plans
> (D–H), env decisions (Part J), tracking (K–L), or production-readiness
> audits (M–N). **Current sprint + hand-off batches stay here (Parts O–S below).**

---

# Part O — Sprint 5+ Plan with Role Restructure (2026-05-13 evening)

> **Role restructure decision (Pacred owner):** ทีมแบ่งงานชัดเจนตามความเชี่ยวชาญ — ดู [`docs/team.md`](team.md) สำหรับ full role definition
>
> - **ปอน (podeng):** 100% frontend / landing / SEO / acquisition
> - **ภูม (Poom):** 100% backend — เชื่อม frontend ↔ customer backend ↔ admin backend; phase 1 = port PHP cargo 100%; phase 2 = DPX ERP
> - **เดฟ:** project lead + infrastructure
> - **ก๊อต:** senior advisor + co-merger

## O1. งาน ปอน + ภูม โอนใหม่ (จาก Part N6)

### โอนจาก ปอน → ภูม (customer portal คือ backend scope)
| Task | เดิม Part N6 ปอน | ใหม่ Part O ภูม |
|---|---|---|
| C-0 complete-profile form | ปอน 5-6h | ✅ ภูม |
| C-2 PDF shop receipt | ปอน 3-4h (รอ C-7) | ✅ ภูม (รอ C-7) |
| C-3 sales claim form | ปอน 2-3h | ✅ ภูม |
| C-4 phone change OTP atomic | ปอน 2-3h | ✅ ภูม |
| C-5 China warehouse addresses page | ปอน 1h | ✅ ภูม |
| C-6 cart counter navbar badge | ปอน 30m | ✅ ภูม |
| C-8 contact form submit handler | ปอน 1h | ✅ ภูม |
| C-10 forgot-password flow (NEW) | ปอน 3-4h | ✅ ภูม |
| Bug-1 approve/suspend audit | ภูม 1-2h | ✅ already fixed by dave (commit `1a470ee`) |
| Bug-2 scan-form.tsx React Compiler | ภูม 2-3h | ✅ already fixed by dave (commit `1a470ee`) |

### โอนจาก ปอน → ปอน (เน้น frontend/SEO อย่างเดียว)
| Task | เดิม | ใหม่ |
|---|---|---|
| All public/landing/SEO work | — | ✅ ปอน เป็น primary owner |
| i18n keys ทุก namespace | ปอน | ✅ ปอน (continue) |
| Phase I ecosystem landing pages (#1, #5-13) | TBD | ✅ ปอน (new primary owner) |
| Mobile responsive QA | TBD | ✅ ปอน |
| Lighthouse / SEO scores | TBD | ✅ ปอน |
| `app/sitemap.ts` / `app/robots.ts` | (missing) | ✅ ปอน (new task L-1) |

## O2. 👤 ภูม (Poom) — Sprint 5 (CARGO PORT FOCUS)

**Strategy:** Port PHP cargo system → Pacred 100% ก่อน DPX ERP. ทุก feature ที่ PHP เดิมมี ต้อง work ใน Pacred ก่อน

**Status check (2026-05-14):**
- ✅ P-1 ถึง P-14 เสร็จหมด (รายละเอียดใน commit log `bb747bf`..`1700144`)
- ✅ Bug fixes ของ Sprint 1-3 (approve/suspend, scan-form, etc.) — แก้แล้วบน dave commit `1a470ee`
- ✅ Sprint 1-3 admin features ครบ (A-1 ถึง A-15 + L-cleanup)
- 🟡 4 commits cleanup ค้าง `origin/Poom` (ยังไม่ merge เข้า main) — ต้องผ่าน Phase 0 review fixes ก่อน
- 🟡 ลำดับงานใหม่:

### ✅ Phase 0 — Pre-merge fixes (DONE 2026-05-14 by ภูม)

เดฟ review 4 commits (8db9140, 07535a5, 5cf2499, b8dd259) → flagged 3 fixes → ภูม ship ทั้ง 3 commits ก่อนเดฟกลับจากกินข้าว 🎯

| # | Fix | Resolution commit |
|---|---|---|
| ✅ **rev-1** | inline `<script>` ใน server `<head>` แทน `next/script beforeInteractive` (FOUC fix) — ภูม เพิ่ม `suppressHydrationWarning` ดีกว่าที่แนะนำด้วย | `0da2e71` |
| ✅ **rev-2** | Transfer Rep card ย้ายหลัง `AssignRepForm` | `ee63068` |
| ✅ **rev-3** | "Active ล่าสุด" sidebar gate `roles: ["sales_admin","accounting"]` | `8ad80d8` |

Bonus 5 commits ที่ภูมทำเพิ่ม (ไม่ได้ขอ — ดี proactive):
- `45205ba` cleanup misleading freight stubs + expose `/admin/rates`
- `a2d2e25` wire `contact_message` reference_type end-to-end (close P-6 follow-up gap)
- `ce5792e` support phone-only accounts in password/phone change
- `3f8b887` close minor finds from P-7 + P-9 audit
- `66c8fec` merge main into Poom (sync)

### Priority 0 (block customer launch — must finish first)

| # | Task | Est | Description |
|---|---|---|---|
| **P-1** | C-0 `/complete-profile` real form | 5-6h | OAuth new users blocked without this. Personal: first_name + last_name + phone + sex + birthday + TOS. Juristic: redirect to register flow. Server action `completeProfile()`. Acceptance: OAuth user → submit → `profile.status='active'` → /dashboard |
| **P-2** | C-10 `/forgot-password` flow | 3-4h | Input phone/email → request OTP → verify → reset password. Server actions `requestPasswordReset()` + `confirmPasswordReset()`. **BLOCKER** — current customers can't recover accounts |
| **P-3** | C-4 phone change atomic | 2-3h | Update both `auth.phone` + `profiles.phone` atomically with OTP verify. Page `/profile/security/change-phone` |
| **P-4** | Fix DBD silent fail | 1-2h | `actions/auth.ts:355-379` — when DBD API down, show "API ไม่พร้อม กรุณากรอกข้อมูลเอง" instead of "notfound". Add retry |
| **P-5** | C-6 cart counter navbar badge | 30m | Add to `components/sections/navbar.tsx` — fetch count + badge |
| **P-6** | C-8 contact form submit | 1h | `actions/contact.ts` → save to `contact_messages` table + admin notify |
| **P-7** | C-3 sales claim form | 2-3h | `/sales/report/add` — form + server action `createSalesClaim()` |

### Priority 1 (cargo system completeness)

| # | Task | Est | Description |
|---|---|---|---|
| **P-8** | C-5 China warehouse addresses page | 1h | `/service-import/warehouse-addresses` — list with copy buttons |
| **P-9** | A-17 transfer sales rep | 2-3h | `/admin/customers/[id]/transfer-rep` workflow |
| **P-10** | M2.3 customer bulk transfer (personal→juristic) | 4-6h | Admin tool from PHP `customers-move-to-juristic` |
| **P-11** | M2.5b forwarder month-end closing | 6-8h | `/admin/accounting/closing` report from PHP `closingAccReportForwarder` |
| **P-12** | M2.5c forwarder sale tracking | 4-6h | `/admin/forwarder-sales` from PHP |
| **P-13** | M2.5h recently imported customers cache | 2-3h | Admin UX feature |

### Priority 2 (after C-7 from เดฟ lands)

| # | Task | Est | Description |
|---|---|---|---|
| **P-14** | C-2 PDF shop order receipt | 3-4h | Uses `@react-pdf/renderer` infrastructure + `ReadNumber()` helper from เดฟ |

### Priority 3 (cron-jobs port — เดฟ scaffolded, ภูม finishes)

เดฟวางโครงไว้ที่ `app/api/cron/{sales-daily-digest,refresh-active-customers}/route.ts` + `vercel.json` อัปเดตแล้ว

| # | Task | Est | Description |
|---|---|---|---|
| **P-15** | Wire `sales-daily-digest` recipient/dispatch | 2-3h | Route at `app/api/cron/sales-daily-digest/route.ts` already computes yesterday + MTD totals across order_payment / import_payment / yuan_payment. Need: (a) extend `profiles.notify_channels` jsonb with `daily_digest` flag (new migration), (b) loop admins where `role IN ('super','sales_admin')` with flag on, (c) call `sendNotification()` per admin with the formatted message. See TODO block at end of route.ts |
| **P-16** | Verify + enable `refresh-active-customers` schedule | 1h | Route already implements full PHP behaviour (3 activity streams → flip `profiles.is_active=true`). Need: (a) confirm forwarder status enum exclusion is right (only `pending_payment` excluded, not `'rejected'` etc.), (b) confirm doesn't conflict with P-13 recently-active dashboard logic, (c) flip on the daily 01:00 UTC cron in production. Vercel cron entry already added |
| **P-17** | Port `check-apprentice` (deferred) | 4-6h | Two halves: (i) admin probation expiry — needs new column `employees.contract_end_date date`, then sweep employees where date passed → set `is_active=false`. (ii) driver assignment 17h timeout — blocked entirely on `forwarder_driver` table (not yet ported in cargo schema). Recommend splitting into two route handlers when ready |

### Priority 4 (waiting for owner decision)

- M2.2 Payroll module (decision D-9 with owner)
- M2.4 HS variants keep/merge (decision D-8 with owner)
- M2.5d Driver work shifts (after payroll decision)

---

## Sprint 6 — long runway for ภูม (self-directed, 2026-05-14 → unblocked)

> **Mode:** เดฟ บอก "ภูมบอกงานหมด ให้ทำยาวๆ ยั้นจบไปเลย ไม่ต้องรอ" → ภูม pick task ตามลำดับด้านล่าง self-direct ไม่ต้องรอ confirm  
> **กฎ:** สำหรับ task ที่ marked "no decision needed" — ลุยได้เลย commit/push ตามปกติ. สำหรับ task ที่ marked "ภูม decide" — เลือก default ที่แนะนำ + log decision ใน commit message (เดฟปรับย้อนหลังได้)  
> **ห้าม:** scope expansion ของแต่ละ task (เพิ่ม feature นอกเหนือสเปค) — ถ้าเห็นว่าควรขยาย ให้ commit ครอบเฉพาะสเปค + flag idea ใน PORT_PLAN เป็น `P-XX-followup`  
> **เป้าหมาย:** ปิด PHP cargo port 100% (Phase G remaining) + เริ่มเตรียม phase 2 (DPX ERP design)

### ✅ Priority 0 — Sprint 5 wrap-up (DONE 2026-05-14 by ภูม)

| # | Task | Resolution commit |
|---|---|---|
| ✅ **P-15** | sales-daily-digest dispatch — daily_digest flag in profiles.notify_channels + admin loop + sendNotification per opt-in | `e440a31` |
| ✅ **P-16** | refresh-active-customers verified + enabled — D-18 resolved as "keep both" (verified P-13 dashboard does NOT depend on is_active flag — independent concerns) | `6b5a517` |
| ✅ **P-17** | check-apprentice admin half — adapted to `admin_contact_extras.contract_end_date` (employees table doesn't exist; HR meta lives there per migration 0018). DECISION logged | `0479949` |

### ✅ Priority 1 — Cargo port completeness (DONE 2026-05-14 by ภูม)

| # | Task | Resolution commit |
|---|---|---|
| ✅ **P-18** | `forwarder_driver` table + admin CRUD + 17h expiry cron — full schema + RLS + composite indexes + cron auth pattern | `8bd04b7` |
| ✅ **P-19** | CSV bulk import (`csv_imports` table + Storage bucket + 3-stage workflow upload→preview→confirm + papaparse + 5MB/1000-row caps) | `e6c970b` |
| ✅ **P-20** | HS code rates (`hs_codes` + `container_hs_lines` + admin entry pages + aggregate report) | `dda663c` |
| 🟡 **P-21** | Notification template system (DRY) | not yet started — เลื่อนเป็น Sprint 6.5 |

### Priority 2 — HR module port + tests (~9-12h, no decisions needed)

| # | Task | Est | Decision? | Description |
|---|---|---|---|---|
| **P-22** | Time attendance system port | 4-6h | No | Port from PHP `time-attendance-system.php`. Migration `0030_time_attendance.sql` (already partial in 0020 — extend with `clock_in_at`, `clock_out_at` per day per employee, location, ip). Admin pages: `/admin/hr/attendance` (today's status grid) + `/admin/hr/attendance/[employee_id]` (individual log). Employee self-service: `/(protected)/attendance/clock` (browser clock-in with timestamp + IP). **Acceptance:** employee clocks in/out → admin sees status |
| **P-23** | Meeting room booking (`booking-meeting-room`) port | 2-3h | No | Migration `0031_meeting_rooms.sql` — `meeting_rooms` (id, name, capacity, equipment text) + `meeting_room_bookings` (room_id, organizer_id, start_at, end_at, title, attendees jsonb, status). Admin pages: `/admin/hr/rooms` (list+config) + `/admin/hr/rooms/bookings` (calendar view simple). Employee: `/(protected)/rooms/book`. Conflict detection: trigger or app check |
| **P-24** | Forwarder rate engine unit tests | 3-4h | No | Critical correctness path — `lib/forwarder/calc-price.ts` (rate waterfall + tier + juristic discount + service fee). Use `vitest` (not yet installed — add to devDeps). Cover: (a) general rate fallback (b) VIP override (c) custom rate per customer (d) juristic 1% discount on ≥1000 (e) +50 PCS service fee (f) KG vs CBM higher wins (g) free-shipping promo flag. Aim ≥30 test cases |

### Priority 3 — Audit + Phase 2 prep (~5-9h, mostly research)

| # | Task | Est | Decision? | Description |
|---|---|---|---|---|
| **P-25** | Re-audit Part N3 silent degraded modes | 1-2h | No | Walk Part N3.1 (8 items) + N3.2 (6 items) + N3.3 (6 items). For each, verify status today: still degraded / fixed / blocked on creds. Update Part N3 with current status per row. No code changes — doc only. **Acceptance:** all 20 rows updated with 2026-05-14 status |
| **P-26** | Integration test for service-order placement flow | 2-3h | No | End-to-end happy path test: create cart_items → place order (h_no gen) → admin update status through workflow → verify wallet_transactions ledger entry → verify notification sent. Use vitest + `lib/supabase/admin.ts` against test DB. **Acceptance:** 1 happy-path test green; verifies most-touched code paths |
| **P-27** | ✅ **DONE 2026-05-16** — Phase 2 DPX ERP design draft [`docs/decisions/0008-dpx-erp-phase-2.md`](decisions/0008-dpx-erp-phase-2.md) (the 0003 slot ADR-0005 promised was already taken by R1 vendor cutoff; renumbered to 0008). 15+ modules scoped + Phase 1 implications + 5 open questions for stakeholders (Pacred owner / ก๊อต / ภูม) + Track D roadmap (P-37/38/39/40 → ADRs 0009-0012) |

### 🟡 Audit findings — non-blocking follow-ups (เดฟ audit 2026-05-14 evening)

P-15..P-20 ทั้งหมด ship-ready แต่ผมไล่ review พบรายการเล็กที่ ภูม pick ได้ระหว่างกินข้าว/รอ Sprint 7 spec:

| # | Task | Est | Source | Description |
|---|---|---|---|---|
| **P-15-followup** | Admin self-service UI to toggle `daily_digest` flag | 30m | P-15 audit | ตอนนี้ admin flip flag ผ่าน Supabase Table Editor เท่านั้น — เพิ่ม checkbox ที่ `/admin/profile` หรือ `/admin/settings/notifications` ให้แต่ละ admin เปิด/ปิด digest เอง |
| **P-18-followup-rbac** | `requireAdmin(["ops"])` ที่ page-level | 15m | P-18 audit | `app/[locale]/(admin)/admin/drivers/page.tsx` + `[id]/page.tsx` ใช้ layout default `requireAdmin()` (any role). Sidebar gate แล้ว แต่ direct URL ลูกชาย admin role อื่นเข้าได้ (action enforce แล้ว — ไม่ใช่ security hole แค่ UX inconsistent). Add `await requireAdmin(["ops"])` top of both pages |
| **P-19-followup-batch** | Batch insert ใน `confirmCsvImport` | 30m | P-19 audit | ตอนนี้ N+1 inserts (1000 rows = 1000 round-trips). แก้เป็น `.insert([rows...])` chunked 100/batch |
| **P-19-followup-stale** | Stale "importing" recovery | 1h | P-19 audit | ถ้า process crash ระหว่าง import → row ค้าง `status='importing'` ตลอดไป. เพิ่ม `started_at` column + sweep cron (หรือ check on next read) ที่ flip > 10min old `importing` → `failed` |
| **P-20-followup-rls** | Tighten `hs_codes_select_all` RLS | 5m | P-20 audit | `using (true)` เปิด anon (intent คือ authenticated per comment). แก้เป็น `using (auth.role() = 'authenticated')`. Low-risk (HS code = public reference data) แต่ inconsistent กับ comment |
| **P-vercel-plan** | Verify Vercel plan supports 5 cron jobs | 15m | cross-cutting | vercel.json มี 5 cron entries ตอนนี้: auto-cancel-orders, sales-daily-digest, refresh-active-customers, expire-probation, expire-driver-assignments. Hobby plan limit = 2; Pro = 100/day per cron. เดฟ confirm Pacred ใช้ plan ไหน |

**Estimated total:** ~2-3h เก็บได้ทั้งหมดในรอบเดียว

### Priority 4 (still waiting for owner decision — unchanged)

- M2.2 Payroll module (decision D-9 with owner)
- M2.4 HS variants keep/merge (decision D-8 with owner)
- M2.5d Driver work shifts overlap (after payroll decision; some covered by P-18 forwarder_driver basic CRUD)

---

## Sprint 7+ — long runway tracks (open-ended menu, ~60-90h, self-directed)

> **Context (เดฟ บอก 2026-05-14 evening):** เดฟ + Claude pivoting to landing/customer-acquisition focus to drive growth — ภูม keeps grinding backend ยาวๆ. Pick from any track below in any order. Each track is themed + composable; no strict sequencing within or between tracks unless noted.
> **Mode:** ตาม §6 self-directed. ทุก task `Decision? = No` ยกเว้นที่ระบุ
> **Goal:** Get Pacred to **production-ready beta launch** — code health, observability, perf, docs, ERP phase 2 prep. Once these tracks land + creds + Pacred owner decisions arrive, Pacred can open beta to first customers
> **Order suggestion (high-leverage first):** Track A (tests) → Track B (hardening) → Track C (perf) → Track D (DPX ERP prep) → Track E (DevX/docs/gaps). But interleave at will

### Track A — Test coverage (~12-18h)

The biggest production risk for Pacred today is silent regressions in cargo math + auth flows. Tests = highest ROI safety net.

| # | Task | Est | Description |
|---|---|---|---|
| **P-21** | Notification template system (DRY) | 3-4h | New `lib/notifications/templates.ts` exporting typed builders: `salesDigest`, `forwarderStatusChange`, `walletDepositApproved`, `customerApproved`, `customerSuspended`, `paymentApproved`. Each returns `NotifyPayload` with category/title/body filled. Refactor ≥5 existing call sites in `actions/admin/*` to use templates. **Acceptance:** TS clean + diff shows literals removed |
| **P-24** | Forwarder rate engine unit tests | 3-4h | Critical correctness — `lib/forwarder/calc-price.ts`. Install `vitest` + `vitest.config.ts` + add `pnpm test:unit` script. Cover: (a) general rate fallback (b) VIP override (c) custom rate per customer (d) juristic 1% discount on ≥1000 (e) +50 PCS service fee (f) KG vs CBM higher wins (g) free-shipping promo flag (h) rounding edge cases. **Aim ≥30 cases**, all green |
| **P-26** | Service-order placement integration test | 2-3h | E2E happy path: create cart_items → place order (h_no gen) → admin update status through workflow → verify wallet_transactions ledger entry → verify notification sent. Use vitest + `lib/supabase/admin.ts` against test DB. **Acceptance:** 1 happy-path test green |
| **P-28** | OTP flow integration test | 2-3h | Cover: requestOtp → rate limit (3/h via DB) → verifyOtp success + wrong-code reject + expired reject → consumed-once enforcement. Mock SMS gateway. **Acceptance:** 6 cases green |
| **P-29** | Wallet ledger consistency test | 2-3h | Deposit → admin approve → trigger recomputes balance correctly. Multiple types (main/cashback/credit). Verify pending → completed transitions don't double-count. **Acceptance:** 4 cases green |
| **P-30** | Auth signup flow integration test | 2h | Personal signup → OAuth callback → complete-profile → status='active' → first login. Plus juristic flow. **Acceptance:** 2 happy paths green |
| **P-31** | Cart 151-item cap test (DB trigger) | 1h | Insert 151 items OK → 152nd throws `cart cap reached (151 items)` (cap matches legacy PHP `cart.php:17,76`). Verify trigger fires on insert when existing count >= 151. **Acceptance:** 1 case green |

### Track B — Production hardening (~10-15h)

Each item closes a real gap from Part N audit. Mostly small, high-leverage.

| # | Task | Est | Decision? | Description |
|---|---|---|---|---|
| **P-25** | Re-audit Part N3 silent degraded modes | 1-2h | No | Walk Part N3.1 (8) + N3.2 (6) + N3.3 (6 — most fixed by Sprint 5/6). Update each row with 2026-05-14 status. Doc only |
| **P-32** | SLA tracking — `started_at`/`completed_at` on long admin actions | 3-4h | No | Add columns to: `csv_imports` (already partial via P-19-followup-stale), `forwarder_driver` (assigned→accepted SLA), `forwarders` (status transition SLAs). Helps spot ops bottlenecks. Migration `0031_sla_tracking.sql`. **Acceptance:** queries against new columns work + 1 sample report at `/admin/reports/sla` |
| **P-33** | DB backup verification + restore drill | 3-4h | No | Document Supabase auto-backup retention; write `docs/runbook/db-restore.md` covering point-in-time restore procedure; do 1 dry-run restore to a staging DB and time it. Critical for production confidence. **Acceptance:** runbook exists + restore time recorded |
| **P-34** | Vercel Web Vitals + Speed Insights | 1-2h | No | Add `@vercel/speed-insights` to root layout + verify dashboard receives data (after deploy). One-line install per Vercel docs |
| **P-35** | Rate limit response headers | 1h | No | When `lib/rate-limit.ts` `checkRateLimit` triggers, return `X-RateLimit-Limit`, `-Remaining`, `-Reset`, `Retry-After` headers. Refactor `checkRateLimit` to optionally return headers object |
| **P-36** | Sentry alert rules (config doc) | 1h | No | Document recommended Sentry alert rules in `docs/runbook/sentry-alerts.md`: error rate > 10/h, specific scopes (auth, payment), new error type detection. **Activates after** Sentry DSN lands; doc-only now |

### Track C — Performance + bundle (~7-10h)

| # | Task | Est | Decision? | Description |
|---|---|---|---|---|
| **P-41** | N+1 query audit on admin pages | 3-4h | No | Walk every `/admin/*` server component. Look for loops calling `supabase.from()` per item. Fix via `.in()` batch / RLS-aware joins / RPC. Use `EXPLAIN` on slow ones. **Acceptance:** report at `docs/perf/admin-n1-audit.md` listing pages audited + fixes applied |
| **P-42** | Postgres index optimization | 3-4h | No | Run pg_stat_statements (or query the slow query log via Supabase dashboard) to find missing indexes. Add migration `0032_perf_indexes.sql` for the worst offenders. Most likely candidates: `notifications(profile_id, created_at)`, `wallet_transactions(profile_id, kind, status)`, `forwarders(profile_id, status, created_at)` — verify before adding |
| **P-43** | Bundle size audit per route | 2-3h | No | Use `@next/bundle-analyzer`. Run `ANALYZE=true pnpm build`. List routes > 200KB JS. Identify common heavy deps; lazy-load via `dynamic(import())` for non-critical paths. **Acceptance:** report + at least 1 route shrunk by 50KB+ |

### Track D — DPX ERP Phase 2 prep (~10-15h)

ปูทางสำหรับ phase 2 ก่อนที่ phase 1 cargo จะ launch — ออกแบบไว้ก่อน implement หลัง launch

| # | Task | Est | Decision? | Description |
|---|---|---|---|---|
| **P-27** | DPX ERP Phase 2 ADR draft | 2-4h | No (draft) | New `docs/decisions/0003-dpx-erp-phase-2.md`. Cover: (a) what's in scope vs cargo phase 1 (b) shared data model implications (c) auth+RBAC reuse (d) frontend redirect strategy (e) at least 2 open questions. Draft only — เดฟ + ก๊อต iterate later |
| **P-37** | ✅ **DONE 2026-05-16** — ADR-0009 ERP schema sketch [`docs/decisions/0009-erp-schema-sketch.md`](decisions/0009-erp-schema-sketch.md) (0004 slot was taken — renumbered to 0009). 14 modules × candidate tables + reuses + open Qs + Phase-1-implication take-aways + sequencing recommendation (G2 tax invoice → M2 WHT → M1 payroll → M3 broker matching → M4 customs clearance → M10 logistics → rest) |
| **P-38** | ERP auth + RBAC reuse | 2-3h | No | Document how phase 1 `admins` table + `is_admin()` SECURITY DEFINER reuses for ERP. Identify gaps: ERP-specific roles (e.g., `payroll_admin`), how to scope FE feature flags. Output: `docs/decisions/0005-erp-auth.md` |
| **P-39** | ERP frontend shell decision | 2-3h | เดฟ + ก๊อต | Trade-off: separate Next.js app vs `/erp/*` route in same app vs subdomain. Pros/cons table; recommend one. Output: `docs/decisions/0006-erp-frontend-shell.md` |
| **P-40** | ERP migration strategy | 2-3h | No | Once phase 2 ready, how do active customers transition? Big-bang? Gradual feature flag? Output: `docs/decisions/0007-erp-migration-strategy.md` |

### Track E — DevX + docs + remaining gaps (~13-20h)

Make the codebase pleasant to work in for the next 6 months + close any PHP feature gaps

| # | Task | Est | Decision? | Description |
|---|---|---|---|---|
| **P-22** | Time attendance system port | 4-6h | No | Port from PHP `time-attendance-system.php`. Migration `0033_time_attendance.sql` (extend HR module — `clock_in_at`, `clock_out_at` per day per employee, location, IP). Admin: `/admin/hr/attendance` (today grid) + `/admin/hr/attendance/[employee_id]` (individual log). Employee self-service: `/(protected)/attendance/clock`. **Acceptance:** employee clocks in/out → admin sees status |
| **P-23** | Meeting room booking port | 2-3h | No | Migration `0034_meeting_rooms.sql` (`meeting_rooms` + `meeting_room_bookings`). Admin: `/admin/hr/rooms` + `/admin/hr/rooms/bookings`. Employee: `/(protected)/rooms/book`. Conflict detection via DB trigger or app check |
| **P-44** | API documentation backfill | 3-4h | No | Add JSDoc `@param`/`@returns`/`@throws` to all server actions in `actions/`. Optional: install `typedoc` + generate `docs/api/`. **Acceptance:** every exported action has JSDoc + auto-generated docs (if typedoc) build green |
| **P-45** | Production runbook | 3-4h | No | New `docs/runbook/` directory. Files: `oncall.md` (who to call when), `common-issues.md` (FAQ for ops), `deploy.md` (rollback procedure), `db-restore.md` (from P-33), `sentry-alerts.md` (from P-36). **Acceptance:** runbook exists + reviewed by ก๊อต at next standup |
| **P-46** | Admin SOP document | 2-3h | No | New `docs/sop/admin-operations.md`. Cover common admin tasks: refund customer, cancel order, transfer rep, approve juristic, recompute wallet, etc. Step-by-step with screenshots if possible. ภูม knows admin UX best — write it down before knowledge atrophies |
| **P-47** | Migration template helper | 1-2h | No | New `scripts/new-migration.mjs`: `pnpm migrate:new <name>` → creates `supabase/migrations/<next-num>_<name>.sql` with header template (Phase ref, RLS reminder, drop-trigger pattern, etc.). Reduces friction for ภูม's many remaining migrations |
| **P-48** | Local data seeding script | 2-3h | No | New `scripts/seed-dev.mjs`: idempotent seed of profiles + admins + 1 forwarder + 1 service-order + sample wallet activity. Run via `pnpm seed:dev`. Critical for new dev onboarding (ดู §8 of team.md). **Acceptance:** new clone → `pnpm seed:dev` → `/dashboard` shows data |
| **P-49** | Search admin tools port (`users-search` / `shop-search`) | 4-6h | No | Port PHP admin search across customers + shops. Already partly done via existing `/admin/customers` filter; this expands with full-text search via Postgres `tsvector` or similar |

### Track F — Anything ภูม spots (open invitation)

ภูม audit codebase ตอน free time → propose new tracks via `docs/decisions/00XX-<theme>.md` ADR + ping เดฟ. Keep this section as a reminder that the runway is intentionally open-ended

### Track G — China search rewire + carrier APIs (URGENT — from PHP audit 2026-05-14)

> **Source:** `docs/audit/php-pcscargo-integrations.md` (deep audit ของ legacy PHP) — เปิดเผยว่า Pacred lib/china-search/index.ts wired ผิด. RCGroup-TH = dead code in PHP! Real flow = TAMIT (detail) + tam-i-t (cache) + AkuCargo (keyword) + Laonet (image)
>
> **Why CRITICAL:** Pacred URL-paste converter, keyword search, image search ทุกอันใช้ `PACRED_RCGROUP_API_URL` ที่ไม่มี response → fallback demo mode → ลูกค้ากรอกราคาเอง สับสน
>
> **🚨 STATUS UPDATE 2026-05-15 (ภูม):** P-50, P-51, P-52, P-53 ✅ shipped to `origin/Poom` per spec.  **BUT — owner (ก๊อต+เดฟ) flagged 2026-05-15 ค่ำ ว่าห้าม activate ใน production** จนกว่าจะตัดสินใจ vendor cutoff strategy.  All 4 endpoints (TAMIT/tam-i-t/AkuCargo/Laonet) เป็น vendor PCS Cargo เก่า — ดู [Part R §R1](#part-r--vendor-cutoff--urgent-decisions-for-กอต--เดฟ-2026-05-15) สำหรับ Option A-E + ก๊อต/เดฟ decision.  Code นั่งนิ่งใน repo รอ env-var flip; demo fallback ทำงานได้ — production interim acceptable.

| # | Task | Est | Decision? | Description |
|---|---|---|---|---|
| **P-50** 🔴 | Rewire `lib/china-search/index.ts` to TAMIT-cloud | 4-6h | No | Replace `convertProductUrl` + `convertProductUrlDetail` to use `PACRED_TAMIT_DETAIL_URL` + endpoint pattern `/get/{1688\|taobao}/?id={productID}`. Keep `buildDemoDetail()` fallback. Update `normaliseDetail` to consume actual TAMIT response shape (`json.status==200 → json.data.{title,vendor,listImage,mainImage,sku,skuMap,priceRanges,referencePrice,mainVedio,detail}`). **Acceptance:** paste real Taobao URL locally → see real product title + image + SKU axes |
| **P-51** | Add tam-i-t.com short-URL cache layer | 2-3h | No | New helper `lib/china-search/short-url-cache.ts`. Before TAMIT call: `GET {PACRED_TAMIT_CACHE_URL}/get[/taobao]/?tk={tk}` → if 204, fetch URL with desktop UA spoof, scrape productID via regex (`Id%3D` / `Foffer%2F` / `id=`), `POST` back to `/save/?tk=...&provider={1\|2}&productID=...`. Cache the result in-memory + DB (cart_items url field already serves as poor-man's cache). **Acceptance:** paste short Taobao URL `m.tb.cn/{tk}` → resolves to detail. Spec verbatim in `docs/audit/php-pcscargo-integrations.md` §3b |
| **P-52** | Add AkuCargo keyword search adapter | 2-3h | No | New `lib/china-search/akucargo.ts`. Replace `searchKeyword()` to call `{PACRED_AKUCARGO_API_URL}/search/v1[/taobao]/?q={words}&page={N}&page_size=15&lang=zh-CN` with desktop Firefox UA. Response shape `json.items.item[i].{detail_url,pic_url,title,price,promotion_price,sales}`. **Acceptance:** type Thai or Chinese keyword → get hits with real prices |
| **P-53** | Add Laonet image search adapter | 2-3h | No | New `lib/china-search/laonet.ts`. Replace `searchByImage(file)` to: (a) upload file as base64 → `{PACRED_LAONET_API_URL}/index.php?route=api_tester/call&api_name=upload_img&imgcode={b64}&key={PACRED_LAONET_KEY}` returns `imgid` (b) search → `?api_name=item_search_img&imgid={imgid}&key={PACRED_LAONET_KEY}` returns hits. **Acceptance:** upload product photo → get similar 1688 products |
| **P-54** ✅ | LINE Messaging API ACTIVATED — creds in `.env.local` | done by เดฟ | — | All 3 vars set 2026-05-14: `LINE_CHANNEL_ID`/`_SECRET`/`_ACCESS_TOKEN`. Production needs same in Vercel env + `LINE_PUSH_BYPASS=false`. ภูม: P-15 dispatch wiring (already done in `e440a31`) → real LINE pushes when bypass off. Future task: webhook receiver for LINE OA (signature verify uses `LINE_CHANNEL_SECRET`) |
| **D-1-LIFF** 🟡 SCAFFOLDED by เดฟ | LINE LIFF for customer→profile linkage (`profiles.line_user_id` populator) | 4-6h spec → 1-2h remaining | No (recommended LIFF default) | **Why:** Pacred has LINE creds + push code ready, BUT no customer has `line_user_id` linked → no customer gets push. Without this, the entire LINE notification pipeline is dead-end. **เดฟ scaffolded** (a)+(b)+(c)+(d) on 2026-05-14 evening: `@line/liff` installed · `app/[locale]/liff/link/page.tsx` client component with full state machine (loading/needs_pacred_login/linking/success/error) · `actions/profile.ts:linkLineAccount(lineUserId)` with U-prefix validation + 23505 unique-constraint error mapping · `NEXT_PUBLIC_LIFF_ID` env var documented. **ภูม pickup remaining:** (e) UI hookup — add "เชื่อม LINE OA" button at `/profile` + landing CTA (could ask ปอน to do landing CTA part) (f) End-to-end test on real device with real LIFF ID after Pacred owner creates LIFF app in console. **Activation order:** owner creates LIFF in LINE Console → Vercel env `NEXT_PUBLIC_LIFF_ID` → ภูม wire CTAs → ship |
| **P-55** | Verify Vercel egress IP allowlist with TAMIT/AkuCargo/Laonet/tam-i-t | 1h | ภูม + เดฟ | Vercel function egress IP differs from legacy XAMPP/cPanel. Check after P-50 lands — if real API returns 403/blocked, contact vendor (likely all 4 services owned by same vendor `tam011plus@gmail.com`) to allowlist Vercel. Document Vercel egress IP block in `docs/runbook/vendor-allowlist.md` |
| **P-56** | (Future) JMFCARGO carrier sync port | 6-8h | เดฟ + ก๊อต | Two-way sync over HTTP. PCS↔JMF via `JMF_CARGO_TOKEN` (concat of legacy Tiso key+secret). Receiving endpoint at `/api/integrations/jmf-cargo/inbound/route.ts`. Outbound calls in admin actions. Lower priority — only if Pacred wants JMF integration. Spec in audit §9a |
| **P-57** | (Future) CargoThai TTP/CN container API port | 4-6h | เดฟ + ก๊อต | Active legacy carrier (`a807f4fe...`, `aea07c4d...` query-string `_token`). Endpoint `https://cargothai.tech/api/service/{GetContainer,GetDetail}`. Lower priority — only if Pacred uses these carriers. Spec in audit §9b |

---

**Sprint 7+ estimate:** ~60-90h → 4-8 weeks part-time. Combined with Sprint 6.5 (~2-3h follow-ups), ภูม has ~70-95h runway

**Hand-off rule (unchanged):** หลังจบ task → push branch + commit อัพเดท PORT_PLAN Part P snapshot ว่า P-XX done. DECISION blocks for trade-offs. Flag scope expansion as `P-XX-followup` instead of widening current task

## O3. 👤 ปอน (podeng) — Sprint 5 (FRONTEND/SEO/LANDING FOCUS)

**Strategy:** ทำงานเป็น phase สั้นๆ — เสร็จ 1 phase → ส่งเดฟ confirm → เริ่ม phase ถัดไป (feedback จากเดฟ 2026-05-14: "เริ่มคิดนานนะ ลองแบ่งเฟส คิด หรือ แยก หัวคิด แล้ว ให้คอนเฟิม")
**สถานะ 2026-05-14 evening:** Phase A (SEO foundation L-1..L-9 + 5 bonus) ✅ shipped — ดูตาราง ✅ COMPLETED ด้านล่าง. งานต่อ = Phase B (L-5 landing polish, ต้อง decision) + L-8 mobile QA (blocked) + Phase D L-9b/c i18n polish + Phase C+ ecosystem expansion (L-10..L-20, ต้อง decision)

### ✅ COMPLETED (Sprint 5 Day 3 — claude session `great-banzai-0675e6` → merged into `podeng` 2026-05-14)

| # | Task | Files / Notes |
|---|---|---|
| ✅ **L-1** | `app/sitemap.ts` | 27 static routes + 15 dynamic knowledge slugs × TH/EN hreflang alternates · Next 16 `MetadataRoute.Sitemap` type |
| ✅ **L-2** | `app/robots.ts` | allow `/`, disallow `/admin /auth /api /dashboard /profile /addresses /wallet /service-* /sales /receipts /complete-profile /login /register /recover` + AI bot allowlist (GPTBot/ChatGPT-User/CCBot/Google-Extended/anthropic-ai/Claude-Web) |
| ✅ **L-3** | JSON-LD on all landing pages | `components/seo/{json-ld.tsx,schemas.ts,site.ts,page-meta.ts}` — Organization + LocalBusiness + WebSite (locale layout) · Service + BreadcrumbList (per service landing) · Article (knowledge slug) · FAQPage (faq page) · ItemList (knowledge index) |
| ✅ **L-4** | OG + Twitter meta + dynamic OG image | `metadataBase` set in root layout · per-page `generateMetadata` with `openGraph` + `twitter` + `alternates.canonical` + `alternates.languages` · `app/opengraph-image.tsx` generates 1200×630 PNG with Sarabun font on demand |
| ✅ **L-6** | Knowledge SEO + RSS | `app/feed.xml/route.ts` — RSS 2.0 with all 15 articles · Article JSON-LD + locale-aware OG on each `/knowledge/[slug]` · `alternates.types["application/rss+xml"]` in root layout |
| ✅ **L-7** | Real FAQ page + FAQPage JSON-LD | `app/[locale]/(public)/faq/page.tsx` — 22 Q&A across 5 categories (general / shipping / payment / customs / support) · `components/sections/faq-accordion.tsx` reusable client accordion · TH + EN content |
| ✅ **L-9** | i18n audit script | `scripts/i18n-audit.mjs` — diffs th vs en, reports missing keys + same-value (untranslated) candidates · current state: 1770 keys each, 0 missing |
| ✅ **Bonus 1** | New `seo.*` namespace | ~70 keys × 2 locales for all SEO titles/descriptions (root, home, services.*, warehouses.*, knowledge.index, faq, about, contact, booking, payment.*, howToUse, deliveryAreas, holidays, joinUs, terms, privacy) |
| ✅ **Bonus 2** | Home rich SEO article block | `components/sections/home-article.tsx` — "Pacred Shipping — ผู้เชี่ยวชาญด้านนำเข้า-ส่งออกครบวงจร 14 ปี" placed under `<Partner />` (home only). 5 sub-sections: 3-paragraph hero with inline service links · pull quote · marketplaces (1688/Taobao/Tmall/Alibaba/JD/Pinduoduo/AliExpress/Weidian) · 16 category pills · 10 port pills · 3 warehouse cards · `homeArticle.*` i18n namespace |
| ✅ **Bonus 3** | Reusable horizontal scroller | `components/sections/horizontal-scroller.tsx` — client component: mouse drag-to-scroll + vertical-wheel→horizontal scroll + touch native momentum + click suppression on drag · used on all 4 pill/card rows in HomeArticle |
| ✅ **Bonus 4** | Red-cloud page background | `app/globals.css` — replaced mismatched yellow radial with 4 uniform red radial blobs (1250–1400px) · `background-attachment: fixed` · removed mobile `#ffffff !important` override (mobile now matches desktop) · dark-mode variant |
| ✅ **Bonus 5** | Page-mover + cleanup | Moved `<Partner />` to bottom (home only) · Office image card now `<Link href="/about">` with hover badge "เกี่ยวกับเรา" · Removed orphan `cert*` i18n keys (7×2) + `public/images/dbd/` (4 cert images) · Removed stale "certificate slider" comment in `about/page.tsx` · Replaced `app/favicon.ico` (default Next.js logo) with `app/icon.png` (`pdiwaicon.png`) + updated `metadata.icons` |
| ✅ **Bonus 6** | `pacred.co/line` short link | `app/[locale]/(public)/line/page.tsx` — server `redirect()` to `https://lin.ee/Yg3fU0I` (307) so we can print/share `pacred.co/line` and rotate the LINE OA channel from one file. Updated 11 user-facing components (footer, navbar, floating-tabs, contact-sales, clearance-promo, import-export-banner, pricing-section, purchase-banner, warehouse-detail, knowledge/article-content, ui/sales-carousel) + FAQ text to use `/line`. `SOCIAL.line` in `components/seo/site.ts` stays canonical for JSON-LD `sameAs`. **TODO for เดฟ/ก๊อต:** `lib/booking-data.ts` 3 sales reps also use `lin.ee/Yg3fU0I` — swap to `/line` from lead scope when convenient. |
| ✅ **Bonus 7** | Mobile booking tabs + LCL/FCL split + trust-ribbon removed | `components/booking/BookingTabs.tsx` — removed `justify-center` (was hiding sea/truck on mobile because `air` is centered), added `snap-x snap-proximity` + mask-image fade + pulsing `<ChevronRight>` scroll affordance + `scrollIntoView` of active tab on change. `components/sections/pricing-section.tsx` — `FREIGHT_CARDS` now grouped `lcl`/`fcl`, prices refreshed per Google Doc rate sheet (LCL Truck DDP ฿5,500/CBM · LCL Sea DDP ฿3,500/CBM · FCL 20ft DDP ฿135,000 · FCL 40HQ DDP ฿155,000). Render split into 2 stacked `<FreightGroupRow>` sections (LCL row + FCL row), each with own eyebrow/title/sub. **`MobileTrustRibbon` polished 2×2 then dropped entirely** per Pacred owner — `components/sections/mobile-trust-ribbon.tsx` deleted; usages removed from home + customs-clearance pages. |

### ⚠️ L-pricing-fix — RETRACTED (audit false alarm, 2026-05-14 evening)

เดฟ audit รอบแรกอ้างว่า 6 keys (`lcl/fcl SectionEyebrow/Title/Sub`) missing จาก `messages/{th,en}.json` ในcommit `129ef5a`. **ตรวจรอบสองหลัง merge:** keys อยู่ครบที่ line 1705-1710 ในทั้ง 2 locale ของ pricing namespace block. ปอน add ไว้แล้วใน same commit (audit agent miss). NO blocker — `129ef5a` ship-ready. **Bonus 6+7 merged into dave/main** 2026-05-14 evening (commit `<TBD>`)

> **Lesson learned (เพิ่มใน team.md §6 etiquette):** อย่า trust agent audit 100% — verify directly by `grep` ก่อน flag blocker. ทุก audit ที่อ้าง "missing key/file" ต้อง paste grep output ที่แสดง absent ก่อน accept
> **Optional follow-up:** **L-9d-followup** — ขยาย `scripts/i18n-audit.mjs` ให้ grep source `t()` calls vs key existence — ป้องกัน false negatives ในอนาคต

### 🟡 REMAINING (Sprint 5 Day 4+)

| # | Task | Est | Description |
|---|---|---|---|
| 🟡 **L-5** | Audit + polish ทุก service landing | 6-8h | `/services/import-china`, `/services/import-china-fcl`, `/services/import-china-lcl`, `/services/export-worldwide`, `/services/china-shopping` — content, CTAs, mobile UX. (`/services/customs-clearance` already has full content via existing `Clearance*` components.) Recommendation: replace `StubPage` with real layout per service |
| 🔴 **L-8** | Mobile responsive QA top 10 pages | 4-6h | Audit + fix layout issues with browser devtools. **Blocked: needs real device or BrowserStack testing — Claude session can only spot-check via curl/CSS** |
| ✅ **L-line-refactor** DONE 2026-05-14 by เดฟ | Centralise LINE OA URLs from hardcoded strings → `LINE_OA` constants | done | Audit revealed only 5 real refactor targets (most components already used the local `/line` redirect indirection ✅): `app/[locale]/(public)/line/page.tsx` (the redirect itself) + `clearance-banner.tsx` (mismatch `r3b1BuOC` standardised to canonical) + `clearance-cards.tsx` + `promotion.tsx` (4 sites) + `lib/booking-data.ts` (3 sales-rep entries with same default URL). All now import `LINE_OA.shortUrl` or `LINE_OA.addFriendUrl`. Verify: `grep -rn 'lin\.ee\|line\.me/ti/p'` returns only the constant definitions in `components/seo/site.ts` + 1 traceability comment in `clearance-banner.tsx` |

> ✅ **Phase A1+A2+A3 finished as one bundle** by ปอน 2026-05-14 (commit `a0d9d83`) — pattern below applies to remaining work (L-5/L-8/L-10..L-20)
> 🟢 **Bonus 6+7 shipped** 2026-05-14 evening — pacred.co/line shortlink + booking tabs mobile fix + LCL/FCL pricing split + drop MobileTrustRibbon
> ⚠️ **§6 watch-item:** commit `c6c5d58` claims "per Pacred owner" but no LINE/voice trail in repo. Action is scope-correct (clean delete) — log as precedent for §6 trust. ปอน confirm in next standup whether owner walked over to her desk

> **กฎ checkpoint สำหรับ phase ที่เหลือ:** ทุกเฟสจบ → ส่ง output ให้เดฟใน LINE → รอ "go" ก่อนเริ่ม phase ถัดไป — ห้ามทำหลาย phase พร้อมกัน ถ้ายังไม่ได้ confirm

---

### Phase B — Landing page polish (DECISION CHECKPOINT FIRST)

**🛑 ก่อนเริ่ม Phase B ขอเดฟ confirm 2 ข้อใน LINE:**
1. **Priority pages** — page ไหน polish ก่อน? (ปอน suggest: home → import-china → china-shopping → customs-clearance ตามลำดับ)
2. **Style update** — มี design tokens ใหม่หรือยังใช้ของเดิม?

หลัง confirm:
- [ ] **L-5a** Polish page #1 ที่เดฟเลือก (2-3h)
- [ ] **L-5b** Polish page #2 (2-3h)
- ... (ทำทีละ page → checkpoint after each)

ส่วนของ L-5 อื่นๆ:
- [ ] **L-7** FAQ + FAQPage JSON-LD (2h)
- [ ] **L-8** Mobile responsive QA top 10 pages (4-6h) — ใช้ browser devtools / Playwright

**🛑 CHECKPOINT B-final:** หลังทุก page โดน polish — Lighthouse score แต่ละ page > 90 mobile + 95 desktop

---

### Phase D — i18n polish (~2-3h, partial — script done by ปอน)

- [x] ✅ **L-9a script** — `scripts/i18n-audit.mjs` ports diff (committed by ปอน in `a0d9d83`); current state = 1770 keys × 2 locales, 0 missing
- [ ] **L-9b** Normalize namespace pattern (`page.section.element`) — refactor existing keys
- [ ] **L-9c** EN translation polish — run script ออก same-value list → review machine TL

**🛑 CHECKPOINT D:** PR diff ของ messages/*.json — เดฟ review

---

### Phase C+ — Pacred Ecosystem expansion landing pages (DECISION REQUIRED FIRST)

11 new service landing pages (L-10 ถึง L-20) — ต้องถามเดฟ + Pacred owner ก่อน:

**🛑 BEFORE STARTING ANY of L-10..L-20:**
1. **Style guide** — ใช้ของเดิม (red/dark) หรือ design ใหม่?
2. **Content** — ปอนเขียน copy เอง / marketing person / AI draft + edit?
3. **Images** — มี asset library / use stock / commission?
4. **Priority order** — services ไหนสำคัญก่อน? (ปอน suggest: customs-clearance + export ก่อน เพราะ ecosystem ใหม่ไม่ครอบเดิม + revenue สูง)

หลัง decisions ครบ → ทำทีละ service → checkpoint after each

| # | Service | slug | Est |
|---|---|---|---|
| **L-10** | customs broker matching | `/services/customs-broker-matching` | 4-6h |
| **L-11** | tax refund | `/services/tax-refund` | 3-4h |
| **L-12** | customs clearance (expand existing) | `/services/customs-clearance` | 2-3h |
| **L-13** | tax invoice issuance | `/services/tax-invoice` | 3-4h |
| **L-14** | shipping document | `/services/shipping-document` | 3-4h |
| **L-15** | export | `/services/export` | 3-4h |
| **L-16** | fumigation | `/services/fumigation` | 3-4h |
| **L-17** | consignment | `/services/consignment` | 3-4h |
| **L-18** | bill payment | `/services/bill-payment` | 3-4h |
| **L-19** | logistics + messenger | `/services/logistics` | 4-6h |
| **L-20** | services hub page redesign | `/services` | 4-6h |

---

### Phase E — Performance + analytics (สุดท้าย — เมื่อ landing เสร็จแล้ว)

| # | Task | Est | Description |
|---|---|---|---|
| **L-21** | Image optimization (lazy + WebP) | 4-6h | Audit `<Image>` usage, use proper sizes, lazy load below-fold |
| **L-22** | Conversion tracking (GTM/GA4) | 3-4h | Setup events: page_view, cta_click, register_start, register_complete |
| **L-23** | Heatmap (Microsoft Clarity or Hotjar) | 1-2h | Setup tracking |
| **L-24** | A/B test infrastructure | TBD | If GrowthBook or similar chosen |

**🛑 ก่อน Phase E:** ขอเดฟยืนยันว่า analytics tools เลือกอะไร (GA4? GTM? Clarity? Hotjar?)

---

**Estimated:**
- Phase A1+A2+A3: ~9-12h → 2-3 sessions ของปอน
- Phase B + D: ~15-20h → 4-5 sessions
- Phase C+ (11 services): +40-50h → ขึ้นกับ owner priority + content readiness
- Phase E: +10-15h

## O4. 👤 เดฟ (dave) — Sprint 5 (INFRASTRUCTURE LEAD)

### ✅ COMPLETED (Sprint 5 Days 1-2)
1. ✅ **helper-1** `lib/utils/thai-number.ts` — port of PHP ReadNumber + 50 unit tests passed (commit `8f6d9c3`)
2. ✅ **C-7** PDF receipt infrastructure — `@react-pdf/renderer` + Sarabun font + `lib/pdf/register-fonts.ts` + `components/pdf/{styles,forwarder-receipt}.tsx` + `app/api/pdf/forwarder/[fNo]/route.tsx` + HTML receipt has "ดาวน์โหลด PDF" button (commit `8f6d9c3`)
3. ✅ **D-14** Security headers in `next.config.ts` — HSTS + X-Frame + CSP + Referrer + Permissions (commit `c973ef5`)
4. ✅ **D-15** Server-side file validation — `lib/file-validation.ts` magic bytes check + wired in `actions/wallet.ts createDeposit()` (commit `c973ef5`)
5. ✅ **D-16** Structured logger — `lib/logger.ts` + PII redaction helpers + replaced 8 console.log/warn/error spots (commit `c973ef5`)
6. ✅ **D-17** CRON_SECRET hardening — `/api/cron/auto-cancel-orders` now requires `x-vercel-cron` OR `Bearer ${CRON_SECRET}` in production (commit `c973ef5`)
7. ✅ **A-9** Settings edit UI — **already built by ภูม** (yuan_rate + service_fee + QC + crate + juristic + free-ship)
8. ✅ **A-10** Team Leaders commission edit — **already built by ภูม** (inline % editor + toggle active)
9. ✅ **A-11** Sales Payouts approve actions — **already built by ภูม** (approve/reject/paid + rejection reason)
10. ✅ **A-12** Containers ETA workflow — new `/admin/containers/[id]` detail page with full edit form (ETA + carrier + vessel + note) + linked forwarders list with unlink + "Link forwarders" multi-select (filtered by origin+transport+unlinked) + bulk-link action + status timeline. New server actions `adminLinkForwardersToContainer` + `adminUnlinkForwarder` (with audit logs)
11. ✅ **cron-scaffold** Cron jobs port (Part N5 row 4 of 4) — scaffolded `/api/cron/sales-daily-digest` (auth + aggregations done; ภูม wires dispatch — P-15) + `/api/cron/refresh-active-customers` (full impl; ภูม verifies + enables — P-16). Dropped `update-sheet-sang` as obsolete. `check-apprentice` deferred (needs schema). vercel.json updated with 2 new entries.
12. ✅ **D-11** Sentry SDK scaffolding — `instrumentation.ts` + `instrumentation-client.ts` + `sentry.{server,edge}.config.ts` + `next.config.ts` wrapped with `withSentryConfig` + `lib/logger.ts` `logger.error()` forwards to `Sentry.captureException` + env vars documented in `.env.example` + `docs/env.md` §13. SDK is no-op when `SENTRY_DSN` unset (safe for dev). Self-audit fix in `cae1082` (drop integrations:[] regression, add edge PII strip, tag cardinality). Activation = drop DSN in Vercel env → redeploy → errors flow
13. ✅ **D-12** Rate limit abstraction — `lib/rate-limit.ts` with Upstash adapter (when `UPSTASH_REDIS_REST_URL`+`_TOKEN` set) + in-memory `Map` fallback (dev only). Pre-configured limits: signup 5/h/IP · login 10/h/IP · passwordReset 5/h/IP · contact 5/h/IP · generic 30/min. `checkRateLimit(name, key)` returns `{ ok:false, error:'rate_limit', retryAfterSeconds }` or `null` to continue. `getClientIp(req)` extracts from `x-forwarded-for`. Sliding-window via Upstash (fairer than fixed). Wiring to specific endpoints = follow-up task (won't auto-wire to avoid surprise UX). Env vars documented `.env.example` + `docs/env.md` §13. Note: complementary to existing OTP DB-backed limit in `actions/otp.ts` (3/h/phone via `otp_codes` table — that one doubles as audit trail)
14. ✅ **D-13** hCaptcha invisible scaffolding — `lib/hcaptcha.ts` server-side `verifyHcaptcha(token, ip)` posting to `api.hcaptcha.com/siteverify` (dev no-op when secret unset; prod fails-closed) + `components/hcaptcha-invisible.tsx` client `forwardRef` component with promise-based `execute()` + `reset()` API. Renders nothing when site key unset. Both vars (`NEXT_PUBLIC_HCAPTCHA_SITE_KEY` + `HCAPTCHA_SECRET_KEY`) documented `.env.example` + `docs/env.md` §12. Wiring to forms (signup / contact / password reset) = D-13-wire follow-up (won't auto-wire to avoid surprise UX). Pairs with D-12 rate limit (defense in depth)

### 🟡 REMAINING (Sprint 5 Days 3+)
15. 🔴 **D-7a** Set 3rd-party API env vars + verify endpoints (2-4h) — **blocked: need real credentials** (RCGroup URL, TAMIT URL, ThaiBulkSMS keys, PromptPay ID)
16. 🔴 **D-7b** LINE Messaging API setup (3-4h) — **blocked: need LINE Channel Access Token from Pacred OA**
17. 🟡 **D-11-activate** Get Sentry account + DSN → drop in Vercel env (15-30m) — **blocked: need Pacred owner to create Sentry account / authorize use**
18. 🟡 **D-12-activate** Create Upstash Redis DB + drop creds in Vercel env (15-30m) — **blocked: need Pacred owner to authorize**
19. ✅ **D-12-wire** DONE 2026-05-14 evening — `checkRateLimit` wired into 6 server actions: `submitContactMessage` (contact 5/h/IP) + `signIn` (login 10/h/IP) + `registerPersonal` + `registerJuristicStep1` (signup 5/h/IP) + `requestPasswordResetByPhone` + `requestPasswordResetByEmail` (passwordReset 5/h/IP). New helper `getClientIpFromHeaders` in `lib/rate-limit.ts` for Server Action use. Returns `{ ok:false, error:'rate_limit', retryAfterSeconds }` — UI shows friendly Thai error
20. 🟡 **D-13-activate** Create hCaptcha site (Type=Invisible) → drop site/secret in Vercel env (15-30m) — **blocked: need Pacred owner to create hCaptcha account**
21. ✅ **D-13-wire** DONE 2026-05-14 evening — `<HCaptchaInvisible />` widget added to `components/contact-form.tsx` + `app/[locale]/(auth)/register/page.tsx` (PersonalForm + JuristicForm step 1) + `app/[locale]/(auth)/forgot-password/page.tsx` (shared between phone+email request flows). Token passed via `captchaToken` field added to validators (`registerPersonalSchema`, `registerJuristicStep1Schema`, `resetByPhoneSchema`, `resetByEmailSchema`, `contactMessageSchema`). Server-side `verifyHcaptcha(token, ip)` enforces in 5 server actions (`signIn` opted out — too friction for credential-stuffing UX). Reset on error so retry obtains fresh token. Dev no-op when site key + secret unset (`HCaptchaInvisible` renders null + `verifyHcaptcha` returns success)
22. ⚪ **D-7c** Decision: Payment Gateway provider (with Pacred owner) → M2.1 design

**Estimated remaining:** ~14-21h once credentials/decisions are in hand
**Sprint 5 Days 1-2 actual:** ~3-4 commits, lint clean, build pass, 50/50 tests
**Sprint 5 Day 3:** cron scaffolding + collab pattern docs (3 commits) → merged into main `eec4b69`
**Sprint 5 Day 3 evening:** D-11 Sentry + audit fix + D-12 rate-limit + D-13 hCaptcha all scaffolded on dave (4 commits) — เดฟ blocked items down to D-7a/b + decisions; activations only need creds

## O5. 👤 ก๊อต — Production Watcher + Senior Advisor (expanded scope 2026-05-15)

**Primary role:** Production gatekeeper — every dave→main merge passes through ก๊อต. Beyond that: architectural review, security audits, upgrades, and ADRs that need senior judgment.

> **เดฟ บอก 2026-05-15:** "ก๊อตบอกไม่มีงาน — คนเก่งๆ อย่าให้เสียของ ให้ upgrade/refactor". Below = substantial track ก๊อต self-direct ก่อน reach for new work.

### Track K1 — Production gatekeeping (continuous)

| # | Task | Cadence |
|---|---|---|
| **K-merge** | Review `dave→main` per `team.md` §3 ก๊อต flow | Per-batch (every 1-3 days) |
| **K-runbook** | Maintain `docs/runbook/` — oncall + deploy + restore + Sentry alerts (per P-45) | Continuous as new infra lands |
| **K-CODEOWNERS** | Set up `.github/CODEOWNERS` so PRs auto-request ก๊อต review | One-time, ~30m |

### Track K2 — Architectural reviews + ADRs (~12-18h)

ก๊อต = senior architect → write ADRs that lock direction before น้อง implements.

| # | Task | Est | Description |
|---|---|---|---|
| **K-ADR-vendor-cutoff** 🚨 | ADR for Part R1 (china-search vendor cutoff strategy) — Option A/B/C/D/E choice + rationale | 2-3h | New `docs/decisions/0003-china-search-vendor-cutoff.md`. Lock ก๊อต+เดฟ choice. ภูม unblocked |
| **K-ADR-payment-gateway** 🚨 | ADR for D-7 (Omise / 2C2P / Stripe TH / PromptPay-only) | 2-3h | New `docs/decisions/0004-payment-gateway.md`. Once locked, เดฟ leads M2.1 (~40-60h) |
| **K-ADR-erp-phase-2** | Co-author with ภูม (P-27 Sprint 7+ Track D) | 4-6h | DPX ERP phase 2 design — what's in scope vs phase 1 cargo |
| **K-ADR-rbac-future** | Audit current `admins` table + `is_admin()` flow → propose ERP role expansion (P-38 Sprint 7+ Track D) | 2-3h | New ADR; shapes DPX phase 2 auth |
| **K-ADR-tax-invoice** | Lock numbering format (`INV-YYYYMM-NNNN`?) + flow design before ภูม implements | 2-3h | New ADR; needed before tax invoice port |

### Track K3 — Security + production audit (~10-15h)

ก๊อต = production safety lens. ตรวจสอบสิ่งที่ team อาจมองข้าม.

| # | Task | Est | Description |
|---|---|---|---|
| **K-sec-1** | OWASP Top 10 audit on Pacred — go through each: SQL injection (Zod validators), XSS (React+Tailwind = mostly safe), CSRF (Server Actions native), auth (Supabase + RLS), broken access control (admin RBAC), security misconfiguration (CSP+headers), etc. | 4-6h | Output: `docs/audit/owasp-2026-05.md` with status per item + open risks |
| **K-sec-2** | RLS policy comprehensive audit — every Supabase table: who can read/write? — match against `actions/admin/*` callers | 3-4h | Output: `docs/audit/rls-coverage.md`. Critical: missing RLS = data leak |
| **K-sec-3** | Audit log coverage — every admin mutation in `actions/admin/*` calls `logAdminAction()`? | 1-2h | Output: gap report + commits to fix |
| **K-sec-4** | Penetration testing prep — coordinate external pen test (vendor recommendation + scope + timeline) | 2-3h | Plan only, exec post-launch |

### Track K4 — Tech upgrade + tooling (~8-12h, ก๊อต self-direct)

| # | Task | Est | Description |
|---|---|---|---|
| **K-upgrade-1** | Audit Next 16 → 17 upgrade path — dependencies, breaking changes, est effort | 2-3h | Doc only. Don't upgrade yet (Next 16 stable enough for beta) |
| **K-upgrade-2** | Audit Tailwind v4 → future + config strategy | 1-2h | Doc only |
| **K-upgrade-3** | Supabase upgrade strategy (CLI version, migration tooling, plan tier) | 2-3h | Doc + estimate |
| **K-tooling-1** | Set up `.github/workflows/ci.yml` — auto run lint+test+build on PR | 2-3h | CI quality gate before manual review |
| **K-tooling-2** | Renovate / Dependabot setup — automated dep PRs | 1h | Reduces ก๊อต overhead long-term |

### Track K5 — Code quality + refactor (~10-15h)

| # | Task | Est | Description |
|---|---|---|---|
| **K-quality-1** | Read every file in `actions/admin/*` — propose extract-helper / DRY opportunities | 4-5h | Output: refactor proposals; ภูม executes if approved |
| **K-quality-2** | Audit `lib/` for duplicated patterns — e.g., 3 similar fetch wrappers? Consolidate | 3-4h | Output: consolidation proposals |
| **K-quality-3** | TypeScript strictness audit — any `any` slipping through? Loose nullable types? | 2-3h | Output: gap list |
| **K-quality-4** | Bundle size deep dive (alongside ภูม P-43) — identify shared bloat | 2-3h | Co-audit with ภูม Track C |

### Track K6 — Documentation strategy (~5-8h)

| # | Task | Est | Description |
|---|---|---|---|
| **K-docs-1** | Audit `docs/HANDBOOK.md` — is the entry point still accurate after 2 weeks of churn? | 1-2h | Update if drift |
| **K-docs-2** | Audit `docs/PORT_PLAN.md` size (3000+ lines) — propose split into `docs/sprints/` if too long | 1-2h | Don't split yet, but flag threshold |
| **K-docs-3** | Onboarding test — fresh clone + follow `docs/team.md` §8 → does it work? | 2-3h | Output: gap fix; critical for new team members |
| **K-docs-4** | Customer-facing FAQ + product docs strategy (separate from `docs/sop/admin-operations.md` from P-46) | 1-2h | Plan only |

### Track K7 — Strategic / business-side (consulting hours, async)

| # | Task | Est | Description |
|---|---|---|---|
| **K-strat-1** | Pacred owner call agenda runner — ดู Part Q + Part R outstanding | per-call | Schedule + lead |
| **K-strat-2** | Pricing strategy review — booking calculator output vs competitor pricing | 2-3h | Marketing input for ปอน landing |
| **K-strat-3** | DPX ERP phase 2 stakeholder alignment | TBD | Coordinate with Pacred owner + เดฟ |

---

**ก๊อต total runway:** ~50-80h across 7 tracks. Self-directed via §6. Async — no hard sequencing except K2 ADRs that unblock น้อง.

**Recommended start order (high-impact first):**
1. **K-ADR-vendor-cutoff** (2-3h) — unblocks ภูม Track G + production-readiness
2. **K-ADR-payment-gateway** (2-3h) — unblocks เดฟ M2.1
3. **K-tooling-1** CI workflow (2-3h) — quality multiplier going forward
4. **K-sec-1** OWASP audit (4-6h) — production launch confidence
5. **K-CODEOWNERS** (30m) — automates review routing
6. Then K3/K4/K5/K6 in any order

---

## O6. Sprint coordination rules

- **ภูม** must finish P-1 (complete-profile) + P-2 (forgot-password) before customer beta
- **เดฟ** must finish C-7 PDF infra before ภูม can start P-14
- **ปอน** ✅ L-1..L-4, L-6, L-7, L-9 ship-ready บน `origin/podeng` แล้ว (claude session 2026-05-14)
- **All:** sync main daily (per [`team.md`](team.md) §3)
- **PR turnaround:** review within 24h target

---

## O7. Live status — 2026-05-14 (latest claude check-in)

> **เป้าหมาย:** ให้ 4 claude code ของทุกคน (เดฟ/ก๊อต/ภูม/ปอน) เปิดมาแล้วเห็นภาพเดียวกันทันที — จบ phase = push เข้า branch ตัวเอง

| Branch | SHA | สถานะเนื้อหา |
|---|---|---|
| `origin/main` | `5475f14` | latest ก่อน claude session |
| `origin/dave` | `1700144` | = `origin/podeng` (1 commit behind main = Poom merge) |
| `origin/Poom` | `3f8b887` | ภูม push 5 commit ใหม่ (admin/auth/notifications fixes) — ไม่กระทบ public scope ของปอน |
| `origin/podeng` | (kept fresh after this session) | ปอนรับงาน SEO bundle + HomeArticle + red cloud + cleanup เข้ามา; ตามตาราง O3 ✅ section |

### ใครเปิดเทอร์มินอลแล้วทำอะไรต่อ
1. **เดฟ/ก๊อต:** pull `origin/podeng` → review งานปอน (ดูตาราง O3 ✅) → pull `origin/Poom` → merge ทั้งคู่เข้า `dave` → verify lint+build → merge → `main`
2. **ปอน:** sync `podeng` ลงเครื่อง (`git pull origin podeng`) → เริ่ม **L-5** (service landing polish) บน branch ตัวเอง — ดูว่า `home-article.tsx` pattern (server component + `useTranslations` + JSON-LD) reuse กับ landing อื่นได้เลย
3. **ภูม:** ทำงาน Poom branch ต่อ (P-7+ admin) ไม่กระทบกัน
4. **claude สำหรับใครก็ตาม:** อ่าน Part O3 ✅ section + ตาราง O7 นี้ก็เข้าใจว่ามาถึงไหนแล้ว

---

**End of Part O.** Part O supersedes Part N6 Sprint 5 plan with proper role mapping.

---

# Part P — Day 3 evening checkpoint (2026-05-14)

> **What landed since morning:** Two parallel wave merges. ภูม cleared Sprint 6 P-15..P-20 (16-22h work in one session) + Phase 0 review fixes; ปอน shipped SEO bundle L-1..L-9 + 7 bonus items; เดฟ shipped cron scaffolds + Sentry/rate-limit/hCaptcha SDK scaffolds + collab pattern §9. Main went from `5475f14` → `e9da976` in one day across 25+ commits from 3 contributors using §9 async via Claude Code.
> **Per-person tasks:** O2/O3/O4

## P1. State of branches now (post-Day-3-evening)

| Branch | HEAD | Status |
|---|---|---|
| `origin/main` | `e9da976` | latest stable — has P-1..P-20 + Sentry/rate-limit/hCaptcha + SEO bundle + Phase 0 fixes |
| `origin/dave` | `e9da976` | == main |
| `origin/Poom` | `dda663c` | merged into main ✅ — ภูม picks Sprint 6 follow-ups (P-15-followup..P-20-followup, ~2-3h) or Priority 2/3 next |
| `origin/podeng` | `c6c5d58` | merged into dave/main ✅ — L-pricing-fix was a false alarm (keys exist) |

**Validation Claude Code collab pattern (§9):** ภูม commit `0da2e71` อ้างอิง "per Part P review" + ภูม Sprint 6 commits ทุกตัวมี explicit `DECISION:` blocks per §6. ปอน Bonus 6+7 ส่งเสริม Phase A. **3 contributors shipped 14-15h work each in 1 day async, zero coordination meetings** = pattern works.

## P1.5 ที่ landed ใน main today

จาก `5475f14` → `e9da976` (3 wave merges):

**Wave 1 — afternoon merge** (`b941903`): Phase 0 fixes + SEO bundle L-1..L-9 + cron scaffolds (sales-daily-digest + refresh-active-customers) + team.md §9 + Part P
**Wave 2 — Sprint 6 push runway docs** (`eec4b69`): PORT_PLAN P-15..P-27 task list + team.md §6 self-directed mode
**Wave 3 — Day 3 evening** (`e9da976`):
- เดฟ: D-11 Sentry SDK (`bc93be1` + audit fix `cae1082`) + D-12 Upstash rate-limit (`5648d6d`) + D-13 hCaptcha (`4d824b6`) → `4d824b6`
- ภูม: P-15..P-20 ทั้งหมด (`e440a31` `6b5a517` `0479949` `8bd04b7` `e6c970b` `dda663c`) → merged via `e9da976`

## P2. Decisions ที่ยัง outstanding

### 🆕 New

| # | Decision | Owner | Blocks | Recommended |
|---|---|---|---|---|
| **D-18** | P-13 `recently-active customers dashboard` vs `/api/cron/refresh-active-customers` overlap | เดฟ + ภูม | ภูม P-16 enable cron | คงทั้งคู่ — cron flips `is_active` flag (cheap query later); P-13 is real-time aggregate. ภูม confirm ว่า P-13 query depend ที่ flag หรือ on-the-fly aggregate |

### Carried forward

| # | Decision | Owner | Blocks |
|---|---|---|---|
| D-7 | Payment Gateway provider (Omise / 2C2P / Stripe TH) | เดฟ + Pacred owner | M2.1 implementation (40-60h) |
| D-8 | HS variants — keep แยก หรือ merge เข้า tier | Pacred owner + ก๊อต | M2.4 design |
| D-9 | Payroll module — standalone หรือ extend HR | ภูม + เดฟ | M2.2 design + M2.5d driver shifts |

### Credentials / external setup รอ Pacred owner

| Var / Account | Status | Blocks |
|---|---|---|
| ~~`PACRED_RCGROUP_API_URL`~~ | DEAD (was dead in PHP too — see audit §2) | — |
| `PACRED_TAMIT_DETAIL_URL` | unset (need to set + verify) | URL→cart product detail (P-50) |
| `PACRED_TAMIT_CACHE_URL` | unset | Short-URL resolution (P-51) |
| `PACRED_AKUCARGO_API_URL` | unset | Keyword search (P-52) |
| `PACRED_LAONET_API_URL` + `_KEY` | unset | Image search (P-53) |
| `PROMPTPAY_ID` | unset (PCS Cargo legacy `064-174-3836` — Pacred ต้อง new acct) | Wallet deposit QR (throws error) |
| `THAIBULKSMS_API_KEY` + `_SECRET` | placeholder | OTP send |
| `LINE_CHANNEL_ID` + `_SECRET` + `_ACCESS_TOKEN` | ✅ **set in `.env.local` 2026-05-14** (Channel ID 2009931373) — Vercel env ยังต้องตั้ง | LINE push + P-15 dispatch (P-54 activated) |
| `LINE_PUSH_BYPASS=false` | bypass (dev keeps true for safety) | Real LINE delivery production |
| `OTP_BYPASS=false` + `OTP_PEPPER` | bypass + placeholder | Real OTP production |
| `NEXT_PUBLIC_SITE_URL=https://pacred.co` | localhost:3000 | OAuth callback + notification deep links |
| Sentry DSN | none (SDK scaffolded D-11 ✅; need DSN to activate) | Production error tracking activation |
| Upstash Redis | none (lib scaffolded D-12 ✅; need URL+token to switch off memory fallback) | Rate limiting in production (memory fallback leaks quota across function instances) |
| hCaptcha keys | none (lib + component scaffolded D-13 ✅; need keys to activate) | Production bot protection (server fails closed without secret) |
| Resend API key | none | Email fallback |

→ **Action:** ก๊อต schedule Pacred owner call 15-30 นาที — D-7 payment gateway · LINE OA token request · Sentry account · 3rd-party cred consolidation

## P3. Sprint 5+6 burndown (refreshed Day 3 evening, post-Poom-merge)

**Done (across 1 day, 3 contributors):**
- ภูม: P-1..P-14 + Phase 0 review fix + 5 bonus polish + **Sprint 6 P-15..P-20** = **28 deliverables**
- ปอน: L-1..L-9 + 5 SEO bonus + **Bonus 6 + 7 + drop ribbon** = **15 deliverables**
- เดฟ: helper-1 + C-7 + D-14..17 + A-12 + cron-scaffold + collab docs + **D-11 Sentry + D-12 rate-limit + D-13 hCaptcha** = **13 deliverables**
- ก๊อต: review + merge audit (ongoing — เดฟ self-merge in §9 mode)

**Remaining:**
- **ภูม:** Sprint 6 follow-ups (6 items, ~2-3h) + Sprint 7+ Tracks A-G (~70-100h) — all self-directed. **NEW priority injection:** Track G P-50..P-53 (china-search rewire, ~10-15h) is most-leveraged because URL paste / search / image search are core customer flows — recommend doing P-50 + P-51 first (highest user-visible impact)
- **ปอน:** Bonus 6+7 merged ✅ — next = L-5 + L-9b/c + Phase C+ ecosystem (ต้อง decision)
- **เดฟ:** D-7a/b (creds) + D-7c/d (owner decision) = 4 blocked items; D-12-wire + D-13-wire ✅ DONE 2026-05-14 (forms + auth actions all wired, dev no-op until creds activate)
- **ก๊อต:** schedule Pacred owner call to unblock D-7 + 4 sets of creds (Sentry DSN, Upstash, hCaptcha, 3rd-party APIs)

**Real coverage estimate (post-Day-3-evening main):**
- Customer portal: ~88% (P-1..P-3 closed + SEO foundation + Bonus polish)
- Admin: ~98% (P-15..P-20 closed gaps in cron / drivers / CSV import / HS rates)
- Infrastructure: ~85% (Sentry + rate-limit + hCaptcha all SDK-ready; flip on with DSN+creds)
- SEO/landing: ~75% (Phase A + Bonus 1-7; L-5 + Phase C+ pending)
- Phase I ecosystem: ~0% (decision-blocked)

## P4. ลำดับสำคัญ Day 4+ (with strategic pivot 2026-05-14 evening)

> **Strategic shift (เดฟ บอก):** "หลังบ้านให้ ภูม ทำไปก่อนยาวๆ — เดฟ + ผม pivot ไปลุยแลนดิ้ง หาลูกค้าก่อน". Backend = ภูม solo (Sprint 7+ runway 60-90h). Frontend acquisition = เดฟ + Claude **assist ปอน** (ปอน ยังคง lead frontend, เดฟ + Claude join as helpers)

1. **ปอน:** ✅ Bonus 6+7 merged into dave/main (L-pricing-fix was audit false alarm — keys existed)
2. **ภูม:** open menu — Sprint 6.5 follow-ups (6 items, ~2-3h) + Sprint 7+ tracks A-F (~60-90h, 5 themed tracks). Self-directed per §6. Recommended ลำดับ: เก็บ follow-ups quick wins (P-vercel-plan + P-20-followup-rls + P-18-followup-rbac, ~30m) → Track A tests start → interleave tracks. **Goal:** keep grinding while เดฟ pivots
3. **เดฟ + Claude pivot — landing/acquisition:**
   - Help ปอน ที่ Phase B (L-5 service landing polish) + Phase C+ (L-10..L-20 ecosystem expansion)
   - Specific items เดฟ owns naturally: L-22 conversion tracking (GTM/GA4) + L-23 heatmap + L-24 A/B infra
   - Coordinate with ปอน on division of labor (ปอน lead design/copy; เดฟ + Claude assist with structure/scaffolding/scripts)
4. **ก๊อต:** schedule Pacred owner call (~30m bundle):
   - D-7 payment gateway choice
   - ✅ ~~LINE OA channel access token~~ — **DONE 2026-05-14** (Channel ID 2009931373 + Secret + Long-lived token in `.env.local`)
   - Sentry DSN + Upstash creds + hCaptcha keys
   - ThaiBulkSMS real keys + PromptPay ID (Pacred new bank acct — PCS Cargo legacy `064-174-3836` ใช้ไม่ได้)
   - **NEW:** approval to pivot to landing-first focus (confirm with owner that beta launch priority order = customer acquisition channels working > more backend features)
   - **NEW:** Track G china-search rewire — verify with vendor (`tam011plus@gmail.com` likely owns TAMIT/AkuCargo/Laonet/tam-i-t) that Vercel egress IP is allowlisted
5. ✅ **เดฟ work DONE 2026-05-14:** D-12-wire + D-13-wire — rate-limit + hCaptcha both wired into 5 server actions + 3 form components (no-op until Vercel creds set)

**Estimate production beta-ready:** 1-2 weeks ถ้า creds + 1 owner call ได้ในweek นี้ · 3-4 weeks ถ้าไม่
**Estimate to first 10 paying customers:** depends entirely on landing/acquisition push (เดฟ pivot focus) — backend is ahead of demand
**Sprint 6 expected wrap:** ~3-4 สัปดาห์หลังจากนี้ (เมื่อภูม clear P-15..P-27 หมด) → ทันที DPX ERP phase 2 design lock พร้อม impl

---

## P5. Day 4 update — ภูม Sprint 6 progress + blockers (2026-05-15)

### Sprint 6 progress: 11/13 done · D-1-LIFF URGENT shipped (~14h actual)

| Task | Status | Commit |
|---|---|---|
| P-15 sales-daily-digest dispatch wired | ✅ | `e440a31` |
| P-16 refresh-active-customers verified + D-18 resolved | ✅ | `6b5a517` |
| P-17 check-apprentice probation expiry (admin half) | ✅ | `0479949` |
| P-18 forwarder_driver table + admin CRUD + expiry cron | ✅ | `8bd04b7` |
| P-19 CSV bulk import (forwarders) | ✅ | `e6c970b` |
| P-19 follow-up: bucket-not-found UX (banner + hint) | ✅ | `e0c5976` |
| P-20 HS code rates + container line items + report | ✅ | `dda663c` |
| P-21 notification template builders (DRY) | ✅ | `8532f30` |
| P-24 forwarder rate engine unit tests (49 assertions) | ✅ | `36ac681` |
| P-25 re-audit Part N3 silent degraded modes | ✅ | `f39af74` |
| P-26 service-order placement integration test (12 assertions) | ✅ | `52c7331` |
| **🚨 D-1-LIFF (URGENT NEW from Part Q)** — LINE LIFF customer linkage | ✅ | `dba11a6` |
| **🔴 P-50 (Track G URGENT)** — china-search rewire to TAMIT-cloud | ✅ | `01f0cc1` |
| **P-51 (Track G)** — tam-i-t.com short-URL cache layer | ✅ | `1dc4ed3` |
| **P-52 (Track G)** — AkuCargo keyword search adapter | ✅ | `74db555` |
| **P-53 (Track G)** — Laonet image search adapter (closes Track G core) | ✅ | `f8e1a20` |
| **Sprint 6.5 batch (6 follow-ups)** — RLS, RBAC, batch insert, stale recovery, daily_digest UI, vercel cron doc | ✅ | this commit |
| P-22 / P-23 / P-27 remaining Sprint 6 | ⏳ deferred to runway | — |

**Decisions logged in commit messages** (per §6 self-directed mode): migration numbering bumps (0028→0030 chain), schema adaptations (`employees` → `admin_contact_extras`), audit-log skip for cron actions, target table CHECK starts at `forwarders` only. Lead can adjust retroactively.

### 🔴 New blocker found by manual QA — D-7a critical

ภูม เจอตอน manual-test /service-order/add หลัง Sprint 6 batch:

1. **Paste URL Tmall/Taobao** → page hung indefinitely (no UI feedback)
2. **Keyword search** → yellow banner "ระบบค้นหาไม่พร้อมใช้งาน (not_configured)"

**Root cause:** legacy URLs จาก `.env.example`:
```
PACRED_RCGROUP_API_URL=https://rcgroup-th.com/api-china/api-search
PACRED_TAMIT_API_URL=https://tamit-cloud.com/api-product/api-search
```
ภูมตั้ง 2 URLs นี้บน `.env.local` ตามค่า default แล้ว — แต่ endpoint ดูเหมือน dead (ไม่ตอบใน reasonable time)

**ภูม shipped 1 mitigation** (commit `77d4c44` `fix(china-search): add 8s/15s timeouts`):
- เพิ่ม `AbortSignal.timeout(8000)` ใน `convertProductUrl` + `convertProductUrlDetail` + `searchKeyword`
- เพิ่ม `AbortSignal.timeout(15000)` ใน `searchByImage`
- ผล: hang → 8s wait → graceful fallback to demo mode (UI editable, customer can still proceed)

**ยังต้องการจาก เดฟ + Pacred owner (D-7a):**
1. Confirm URLs `https://rcgroup-th.com/api-china/api-search` + `https://tamit-cloud.com/api-product/api-search` ยัง alive มั้ย? มี per-customer key มั้ย?
2. ถ้า dead → ขอ replacement URL จาก Pacred owner หรือเลือก provider ใหม่
3. ถ้า alive แต่ต้อง auth header → ภูม wire เพิ่มได้ (คือ scope code) แต่ต้องการ key

**ภูม ไม่ blocked** — ทำ P-21 (notification templates, no external dep) ต่อได้ทันที. แค่ flag ไว้ตรงนี้เพื่อให้เดฟ priority D-7a ตอนหา window

### 🟡 Other env vars ยังขาด (ภูม noted ใน .env.local เป็น comment)

```
# CRON_SECRET=               # required for cron endpoints in production
# LINE_CHANNEL_ACCESS_TOKEN= # for real LINE push (LINE_PUSH_BYPASS=false)
# PROMPTPAY_ID=              # for /wallet/deposit QR
# RESEND_API_KEY=            # for /forgot-password email path (P-2)
# RESEND_FROM=               # email From: header
```

ทั้ง 5 ตัวเป็น D-7b/c/d scope ของเดฟ (ดู P3 `Credentials / external setup ที่รอ Pacred owner`). ไม่ block Sprint 6 cont.

### Migrations รอเดฟรันบน production Supabase (ลำดับ)

ภูมรันบน dev project แล้ว ครบทั้ง 8 — verified via 3-query check. รอ เดฟ run บน production ตอน merge Poom → main batch ถัดไป:
```
0023_otp_purpose_change_phone.sql
0024_notification_ref_contact_message.sql
0025_profiles_notify_channels_daily_digest.sql
0026_notification_category_sales_digest.sql
0027_admin_contact_extras_contract_end_date.sql
0028_forwarder_driver.sql
0029_csv_imports.sql            ← creates 'csv-imports' storage bucket
0030_hs_codes_rates.sql         ← seeds 9 common HS codes
```

### Next from ภูม (continuing self-directed)

🎉 **Track G core closed + Sprint 6.5 follow-ups all shipped.**  Code repo is clean from low-hanging follow-ups.  Block on R1 decision (vendor cutoff strategy from ก๊อต+เดฟ — see Part R) before any further china-search work.

→ **Track A tests (~7-9h)** — P-28 OTP flow + P-29 wallet ledger + P-30 auth signup + P-31 cart cap.  Pure DB/server-side coverage, doesn't touch china-search at all → safe parallel work while waiting on R1.

After Track A: **Sprint 6 leftover** P-22 (HR attendance, 4-6h) + P-23 (meeting room, 2-3h) + P-27 (DPX ERP ADR, 2-4h) — or **Track B production hardening** (10-15h: SLA tracking, DB backup runbook, Web Vitals, rate limit headers, Sentry alert rules) if Pacred owner prefers ops focus.

### Sprint 6.5 batch shipped (this commit — 6 follow-ups, ~2.5h actual)

| # | Task | Where | Notes |
|---|---|---|---|
| **P-15-followup** | Admin self-service UI for daily_digest toggle | `/admin/settings/notifications` (new page + form) | Reuses existing `updateNotifyChannels` action; `notifyChannelsSchema` extended with optional `daily_digest` field. Eligibility hint shown for non-(super/sales_admin) admins |
| **P-18-followup-rbac** | `requireAdmin(["ops"])` page-level | `/admin/drivers/page.tsx` + `[id]/page.tsx` | Sidebar gate already filtered, but direct URL bypass closed. Defence in depth |
| **P-19-followup-batch** | Chunked batch insert | `actions/admin/csv-imports.ts::confirmCsvImport` | 2-pass refactor: validate-then-insert in chunks of 100. 1000-row CSV: 1000 round-trips → 10 round-trips. Per-chunk failure marks whole chunk skipped (no fall-back to per-row — same FK violations would just re-fire) |
| **P-19-followup-stale** | Stale 'importing' recovery | Migration `0032_csv_imports_started_at.sql` + `lib/admin/csv-import-sweep.ts` | Sweep-on-read at admin list page + at top of `confirmCsvImport`. 10-min threshold. Migration backfills existing zombie rows on first run. Started_at stamped when status flips to 'importing' |
| **P-20-followup-rls** | Tighten `hs_codes_select_all` RLS | Migration `0031_hs_codes_rls_authenticated.sql` | `using (true)` → `using (auth.role() = 'authenticated')`. Low-risk reference data but matches the policy comment intent |
| **P-vercel-plan** | Vercel plan vs cron count check | `docs/runbook/vercel-cron-plan.md` (new) | Doc-only audit: Pacred has 5 crons, Hobby plan limit is 2. Clear action items for เดฟ if on Hobby (upgrade to Pro $20/mo OR consolidate to 2 batch crons). If on Pro: ✅ no action |

**Acceptance gate:**
- `tsc --noEmit` clean ✅
- `pnpm exec eslint <touched files>` clean ✅
- `pnpm test` chain → 207 assertions all green (no test additions needed for these — they're plumbing changes, behaviour verified by existing P-19 manual QA path)
- Migrations 0031 + 0032 ready for เดฟ to run on production Supabase

**Migrations รอเดฟรันบน production Supabase:**
```
0031_hs_codes_rls_authenticated.sql   ← P-20-followup-rls
0032_csv_imports_started_at.sql        ← P-19-followup-stale (auto-recovers any existing zombies)
```

### P-53 shipped (Track G closes)

`lib/china-search/laonet.ts` (server-only) + `laonet-helpers.ts` (testable) per audit §4b:

- **2-step flow** mirrors PHP `searchIMG.php`:
  1. Read `Blob` → `Buffer` → base64 → POST to `/index.php` with `route=api_tester/call&api_name=upload_img&imgcode=<b64>&key=<email>` (auto-switches to GET when URL < 1500 chars; long base64 always POSTs)
  2. Parse `imgid` from response (defensive — top-level `imgid`/`img_id`/`id`/`url` and nested `data.*`/`result.*` variants)
  3. GET `/index.php?route=api_tester/call&api_name=item_search_img&imgid=<id>&key=<email>` → parse hits via the same shape-variant parser used by AkuCargo
- **5 MB upload cap** enforced server-side (matches the route handler's pre-check; defence in depth — Laonet itself rejects > ~8 MB)
- **All hits marked `provider: "1688"`** — Laonet's image-search backend only indexes 1688 even though the same wrapper serves Taobao detail in the audit
- **Env vars**: `PACRED_LAONET_API_URL` (default `https://laonet.online`), `PACRED_LAONET_KEY` (default `tam011plus@gmail.com` — the vendor's literal-email-as-key per audit; Pacred shares this key with the legacy install for now)
- **`searchByImage`** in `index.ts` now delegates to `laonetImageSearch(file)`; the dead RCGroup path with its `normaliseHits` helper has been removed (was the last consumer)
- **Tests:** 31 new assertions across 7 areas in `laonet-helpers.test.ts`:
  - (a) buildLaonetUploadUrl encoding + trailing slash
  - (b) buildLaonetSearchUrl encoding
  - (c) parseLaonetUploadResponse top-level fields (`imgid`/`img_id`/`id`/`url`)
  - (d) parseLaonetUploadResponse nested wrappers (`data.*`/`result.*`)
  - (e) parseLaonetUploadResponse defensive (null/undef/string/empty/wrong-type)
  - (f) parseLaonetSearchResponse canonical hits (8 field assertions)
  - (g) parseLaonetSearchResponse alt shapes + edge cases

**Acceptance gate:**
- `pnpm tsx lib/china-search/laonet-helpers.test.ts` → 31 pass ✅
- `tsc --noEmit` clean ✅
- `pnpm exec eslint lib/china-search/ app/api/china-search/` clean ✅
- `pnpm test` chain → **207 assertions** all green (176 + 31 new)
- Real Laonet response owner-blocked: needs Vercel egress IP allowlist verification (P-55).  Locally: image upload likely 403s from Vercel IPs → UI banner gracefully degraded.  Logic verified by unit tests covering both upload + search response shape variants.

### Track G summary (complete)

| Task | Lines added | Tests |
|---|---|---|
| P-50 — TAMIT-cloud URL→detail rewire | ~430 | 19 assertions |
| P-51 — tam-i-t.com short-URL cache | ~260 | 22 assertions |
| P-52 — AkuCargo keyword search | ~280 | 24 assertions |
| P-53 — Laonet image search | ~330 | 31 assertions |
| **Total** | **~1300** | **96 new assertions** |

**Suite total** 207 assertions across 7 test files (49 + 50 + 19 + 22 + 24 + 31 + 12).  No more wired-to-dead-endpoint code in `lib/china-search/`.  All adapters share the same posture: `available: true` with empty hits / demo product on graceful failures, `available: false` only when env unset at the route layer.

### P-52 shipped (Track G)

`lib/china-search/akucargo.ts` (server-only) + `akucargo-helpers.ts` (testable) per audit §4a:

- **Endpoint**: `https://akucargo.com/api3/api-2022/search/v1[/taobao]/?q=<words>&page=<N>&page_size=15&lang=zh-CN` — Tmall maps to taobao (AkuCargo doesn't separately route Tmall).  Default base URL hard-coded so `PACRED_AKUCARGO_API_URL` env var being unset still works (vendor allowlist permitting).
- **Auth**: none.  Spoofs desktop Firefox UA per audit (mobile UA returns thinner / different results).
- **Response parser** handles 3 top-level shape variants:
  - canonical `{ items: { item: [...] } }`
  - flat `{ items: [...] }`
  - legacy `{ data: [...] }`
- **Per-row defensive parsing**: skips rows with no title AND no url; numeric-or-undef coercion for prices; promo wins when `> 0` AND `< base`; falls back to base if promo missing/zero/higher.
- **Wired into** `searchKeyword(words, page, _order, platform)` — `_order` kept for API back-compat (AkuCargo doesn't expose order-by; the `/api/china-search` route handler doesn't need to change).
- **Types extracted** to new `lib/china-search/types.ts` so helper modules + their tsx tests can `import type` without dragging the Next.js `server-only` sentinel into a node test runner.  `index.ts` re-exports types for back-compat.
- **Tests:** 24 new assertions across 7 areas in `akucargo-helpers.test.ts`:
  - (a) buildAkucargoUrl — 1688 path
  - (b) buildAkucargoUrl — taobao path
  - (c) buildAkucargoUrl — defensive inputs (trailing slash, zero/negative page)
  - (d) parseAkucargoResponse — canonical items.item[]
  - (e) parseAkucargoResponse — price fallback rules (promo=0, promo≥base, base missing, both missing)
  - (f) parseAkucargoResponse — alt response shapes (flat items, legacy data)
  - (g) parseAkucargoResponse — defensive edge cases (null, undefined, string, empty list, rows lacking title+url)

**Acceptance gate:**
- `pnpm tsx lib/china-search/akucargo-helpers.test.ts` → 24 pass ✅
- `tsc --noEmit` clean ✅
- `pnpm exec eslint lib/china-search/` clean ✅
- `pnpm test` chain → **176 assertions** all green (152 + 24 new)
- Real AkuCargo response owner-blocked: needs Vercel egress IP allowlist verification (P-55).  Locally: keyword search with default base URL → likely network error → UI banner "ระบบไม่พร้อม" gracefully degraded (was the same before P-52, just on a different broken endpoint).  Logic verified by unit tests covering all branches.

### P-51 shipped (Track G)

`lib/china-search/short-url-cache.ts` + `short-url-helpers.ts` per audit §3b:

- **Detect**: `detectShortUrl(url)` recognises `m.tb.cn/<tk>` (Taobao, provider 2, cache subpath `/get/taobao/`) and `qr.1688.com/s/<tk>` (1688, provider 1, cache subpath `/get/`).
- **Resolve flow** (mirrors PHP `convertURLChinna()`):
  1. In-memory LRU hit → return immediately (5-min TTL, max 200 entries, FIFO eviction)
  2. GET tam-i-t.com cache → if 200 with productID, cache in memory + return
  3. On 204 / network blip: fetch the short URL itself with desktop Firefox UA spoof (mobile UA returns a different DOM that hides the productID) → scrape productID from final URL + body via PHP-equivalent regex set
  4. POST back to `/save/?tk=&provider=&productID=` (best-effort, fire-and-forget) so the next paste of the same tk skips the scrape
- **Wired into** `convertProductUrlDetail` ahead of the `extractProductId` step — short URLs now resolve to a productID instead of falling through to demo.  Failure at any layer still falls through to demo so the customer is never blocked.
- **Helpers split** into `short-url-helpers.ts` (no `server-only`) so tsx tests can load `detectShortUrl` + `scrapeProductId` without dragging the Next.js server-only sentinel into a node runner.  Same pattern as `extract-product-id.ts`.
- **Tests:** 22 new assertions across 6 areas in `short-url-cache.test.ts`:
  - (a) Taobao m.tb.cn detection (4)
  - (b) 1688 qr.1688.com detection (4)
  - (c) non-short URLs return null (5)
  - (d) encoded redirect patterns (`Id%3D`, `Foffer%2F`) (2)
  - (e) plain querystring patterns (`?id=`, `/offer/<id>.html`, `?offerId=`) (3)
  - (f) HTML body fragments + edge cases (4)

**Acceptance gate:**
- `pnpm tsx lib/china-search/short-url-cache.test.ts` → 22 pass ✅
- `tsc --noEmit` clean ✅
- `pnpm exec eslint lib/china-search/` clean ✅
- `pnpm test` chain → **152 assertions** all green (130 + 22 new)
- Real cache+scrape flow owner-blocked: needs Vercel egress IP allowlist (P-55) before tam-i-t.com responds outside legacy XAMPP IP.  Locally short URL paste → cache miss → scrape attempt → demo fallback (graceful), but unit-tested path covers all logic branches.

### P-50 shipped (Track G URGENT)

`lib/china-search/index.ts` rewired to TAMIT-cloud per audit §3a:

- **New env var** `PACRED_TAMIT_DETAIL_URL` (default `https://tamit-cloud.com/api-product`) — `.env.example` already had this from เดฟ audit commit; `.env.local` updated to match (RCGroup vars commented out as legacy).
- **Endpoint pattern** changed from `?q=<full-url>` to `/get/{1688|taobao}/?id=<productID>` per the canonical PHP `convertURLChinna()` — Tmall maps to taobao at TAMIT.
- **`extractProductId()`** extracted to its own file `lib/china-search/extract-product-id.ts` (no `server-only`) so it's tsx-testable. Handles 1688/Taobao/Tmall desktop + mobile patterns + `?offerId=` fallback + generic numeric path segments.
- **`normaliseTamitDetail()`** parses TAMIT's actual response shape: `json.status==200 → json.data.{title, vendor, mainImage, listImage[], referencePrice, priceRanges[], sku[], skuMap[]}`.  Defensive: missing/wrong-typed fields degrade gracefully (e.g., no priceRanges → no promo price; sku_axes empty → UI single-row fallback).
- **Demo fallback preserved** — if productID not extractable (short URLs, P-51 will fix), TAMIT unreachable, response status !== 200, or any throw → returns `available: true` with `buildDemoDetail()` so the customer can still type price/qty manually and place the order. Same posture the legacy PHP took on API outages.
- **`searchKeyword` + `searchByImage`** kept on legacy wiring for now with explicit `TODO(P-52)` / `TODO(P-53)` comments — those rewires come next in this same Track G batch.
- **Tests:** new `extract-product-id.test.ts` with 19 assertions across 7 areas (a-g): 1688 desktop, Taobao item.htm, Tmall, ?offerId fallback, generic path segments, short URLs return null, malformed inputs. Wired into `pnpm test` chain → total now **130 assertions** all green.

**Acceptance gate:**
- `extractProductId` unit tests green ✅
- `tsc --noEmit` clean ✅
- `pnpm exec eslint lib/china-search/` clean ✅
- `pnpm test` chain green (130 assertions) ✅
- Real TAMIT smoke test owner-blocked: needs Vercel egress IP allowlist verification (P-55) once first paste hits production. Locally a Tmall URL → demo fallback (TAMIT may not respond from dev IP) but extractProductId → correct productID, so the rewire is verified in unit tests + shape-compatible.

### D-1-LIFF shipped (this batch — URGENT from Part Q)

Spec from Part Q + Part O2 line 1749. What's in:

- `actions/profile.ts::linkLineAccount(lineUserId)` — Zod-style regex guard `^U[a-f0-9]{32}$`, pre-check unique-index conflict, returns `line_already_linked` instead of crashing
- `app/[locale]/liff/link/page.tsx` — server wrapper (`requireAuth`, allow-incomplete) + client `LinkLineClient` that does `liff.init` → `liff.login` → `liff.getProfile` → server action POST
- `@line/liff` 2.29.0 added (dynamic import keeps it out of rest-of-app bundle)
- "เชื่อม LINE OA" button at `/profile` now navigates to `/liff/link` (was disabled placeholder)
- i18n: full `liff.*` namespace TH + EN (16 keys)
- env: `NEXT_PUBLIC_LIFF_ID` documented in `.env.example`; `.env.local` notes "set when LIFF app created in console"

**Page handles 8 states:** boot · needs_liff_id · needs_login · ready · linking · linked · already_linked · error

**Acceptance gate:** flow tested locally:
- `/liff/link` without session → redirect `/login` ✅
- `/liff/link` with session, NEXT_PUBLIC_LIFF_ID unset → "ระบบยังไม่พร้อม" notice ✅
- `/liff/link` with already-linked profile → "เชื่อมไว้แล้ว" + back button ✅
- Production wiring: requires LIFF app created in LINE Console (uses Pacred Channel ID 2009931373) + `NEXT_PUBLIC_LIFF_ID` set in Vercel + `LINE_PUSH_BYPASS=false` + ปอน drops "QR add friend" CTA at landing per Part Q Q4

**Customer-side test (manual, owner-blocked):** needs LIFF app published in LINE console first. Once `NEXT_PUBLIC_LIFF_ID` lands → end-to-end test from Part Q4 Q1 acceptance: scan QR → add Pacred OA → click LIFF link → see "เชื่อมสำเร็จ" → admin pushes test notification → see in LINE chat.

---

**End of Part P.** Snapshot ณ 2026-05-15 ดึก หลัง Sprint 6 + Track G + Sprint 6.5 + R1 ADR + Track A complete (P-15..P-21, P-24..P-26, D-1-LIFF, P-50..P-53, 6 follow-ups, ADR 0003, P-28..P-31).  **R1 vendor cutoff RESOLVED ก๊อต+เดฟ (Option F).**  Test suite total: **260 assertions** all green across 11 test files.  Next: Sprint 6 leftover P-22 / P-23 / P-27 OR Track B production hardening — ภูม pick.

### Track A shipped (this batch — P-28..P-31, ~3h actual)

| # | Task | Assertions | File |
|---|---|---|---|
| **P-28** | OTP flow integration test | 14 | `lib/auth/otp.test.ts` |
| **P-29** | Wallet ledger consistency (3 buckets, recompute trigger) | 14 | `lib/wallet/ledger.test.ts` |
| **P-30** | Auth signup flow (personal + juristic + member_code) | 15 | `lib/auth/signup.test.ts` |
| **P-31** | Cart 151-item cap trigger | 10 | `lib/service-order/cart-cap.test.ts` |

Wired into `pnpm test` chain. All use the same pattern as P-26 placement test (admin client + DB-direct + cleanup-in-finally).

**🚨 Finding from P-31 (RESOLVED 2026-05-16 evening, เดฟ):** PORT_PLAN Track A spec previously said "Insert 150 OK → 151st throws" — off-by-one with the actual `cart_items_cap` trigger which raises on `cnt >= 151` (151st succeeds; 152nd fails — matches legacy PHP `cart.php:17,76` hardcoded 151-cap). **Decision:** keep trigger at `>=151` (legacy-compatible). PORT_PLAN spec body fixed in same commit. ภูม test + actual code already align; no code change needed.

> **🟢 เดฟ merge sweep 2026-05-15 evening** — Pulled both `origin/Poom` (16 commits) + `origin/podeng` (6 commits) into `dave` + `main` (commits `e90e594` + `ccb3dc4`). Verified: pnpm install ok · eslint clean · tsc clean · pnpm build passes · all 7 test files green (147 assertions chained: calc-price 49 + thai-number 50 + extract-product-id 19 + short-url-cache 22 + akucargo-helpers 24 + laonet-helpers 31 + placement 12 env-gated).
>
> **Conflicts resolved:**
> - `actions/profile.ts` — took ภูม's `linkLineAccount` (improved: pre-check + race-fallback)
> - `app/[locale]/liff/link/page.tsx` — took ภูม's version (Server+Client split, 8-state machine, full i18n)
> - `app/layout.tsx` — kept ปอน's intent (`defaultTheme="light"`) but stripped 3 next-themes-API props that current `theme-provider.tsx` doesn't yet support → flagged as **`theme-provider-followup`** (extend `theme-provider.tsx` with `enableSystem`/`disableTransitionOnChange`/`attribute` to match next-themes API for ปอน's first-visit lock UX completeness)
>
> **2 follow-up flags for เดฟ post-merge** (ภูม's audit notes):
> 1. **🚨 Vercel cron count = 5** (Hobby max=2). Confirm Pacred Vercel Pro tier OR consolidate before next prod deploy. Documented in `docs/runbook/vercel-cron-plan.md`
> 2. **🚨 Per Part R1: do NOT set Track G env vars** (`PACRED_TAMIT_DETAIL_URL` etc.) ใน Vercel production until vendor cutoff strategy lands — code degrades to demo mode cleanly when unset (intended interim per Option E hybrid)
>
> **§6 watch-item (ปอน):** `da60747` first-visit lock edited `app/layout.tsx` + `i18n/routing.ts` — root-level files outside ปอน's allowed scope (`docs/team.md` §1). Sensible UX intent (light default + locale lock for non-TH) but no DECISION block in commit message. Log as 2nd §6 watch-item (after Bonus 5 "per Pacred owner" claim from Sprint 5) — both delivered correct fixes with self-audit, accept; tighten review only if any future commit fails verification

---

# 🚨 Part Q — URGENT Pacred owner blockers (2026-05-14)

> **เดฟ บอก** "เน้นพวกเรื่อง บัญชี เรื่อง ไลน์ เรื่อง อะไรที่เป็นการเงิน อะไรที่จำเป็นต้องรอก็บอก ก็เตือน". This part = single-page alert for เดฟ + ก๊อต. ทุกคนอ่านอันนี้แล้ว pick action ของตัวเอง

## Q1. Status — บัญชี / LINE / การเงิน

### ✅ ใช้งานได้แล้ว (ใน main `b2064e5`, code+infra ครบ)

**LINE:** wrapper push via Messaging API + `profiles.line_user_id` column ready + P-15 sales digest dispatch wired (`e440a31`)

**บัญชี/การเงิน:**
- Wallet ledger 3 buckets + recompute trigger
- Wallet deposit slip → admin approve
- Wallet withdraw request → admin approve
- Yuan transfer (Alipay) request → admin approve
- Service-import + service-order full flow + receipt PDFs
- Sales commission ledger + claim form (P-7)
- Forwarder month-end closing (P-11)
- Cross-team commission dashboard (P-12)
- CSV bulk import for forwarders (P-19)
- HS code rates + container line items + report (P-20)

### 🟡 พร้อมระดับ code — ต้อง flip switch ใน production

| Item | Action |
|---|---|
| **LINE push** | ✅ creds ใน `.env.local` → ตั้ง 3 vars (`LINE_CHANNEL_ID`/`_SECRET`/`_ACCESS_TOKEN`) ใน Vercel env + flip `LINE_PUSH_BYPASS=false` |
| **Sentry** | SDK scaffolded → ตั้ง `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` ใน Vercel |
| **Rate limit** | lib scaffolded + ✅ **wired into 6 actions** (D-12-wire DONE 2026-05-14) → ตั้ง `UPSTASH_REDIS_REST_URL` + `_TOKEN` ใน Vercel = production-grade |
| **CAPTCHA** | scaffold ready + ✅ **wired into 3 forms + 5 actions** (D-13-wire DONE 2026-05-14) → ตั้ง `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` + `HCAPTCHA_SECRET_KEY` ใน Vercel = bot protection live |

### 🔴 BLOCKED — รอ Pacred owner ก่อน beta launch

#### 1. PromptPay QR (wallet deposit จะ throw error)
ต้อง 3 ค่าจาก Pacred:
- PromptPay number (เบอร์โทร 10 หลัก หรือ tax-ID 13 หลัก)
- Bank account number (สำหรับพิมพ์ใน QR receipt)
- Account name (ชื่อบริษัท Pacred)

⚠️ PCS Cargo legacy ใช้ `064-174-3836` Kasikorn — **Pacred ใช้ไม่ได้** ต้องเปิดบัญชีใหม่

#### 2. Payment gateway (D-7 decision — owner)
ตอนนี้ launch ได้เฉพาะ **PromptPay-only manual** (slip upload + admin approve). ถ้าจะรับ credit card — ต้องเลือก:
- **Omise** — Thai-friendly, simple integration
- **2C2P** — Pacred industry standard
- **Stripe TH** — international, more features

หลัง decide → M2.1 implementation (~40-60h) — เดฟ ทำ

#### 3. ThaiBulkSMS real keys (OTP fail ถ้า OTP_BYPASS=false)
- `THAIBULKSMS_API_KEY`
- `THAIBULKSMS_API_SECRET`

ปัจจุบัน `YOUR_API_KEY` placeholder — production OTP ใช้ไม่ได้

#### 4. 🚨 LINE customer linkage — **ใหญ่กว่าที่คิด** (D-1-LIFF NEW)
**`profiles.line_user_id` column มี แต่ NO mechanism populate มัน:**
- ❌ ไม่มี LINE OA webhook receiver (เก็บ user_id ตอน customer add friend)
- ❌ ไม่มี LIFF / LINE Login OAuth (auto-link ตอน customer login)

**ผลกระทบ:** LINE push ทำงานกับ admin ได้ (ถ้า seed `line_user_id` manually ใน DB) แต่ **customer ไม่ได้รับ push เลย** จนกว่าจะมี linkage

**ต้องเลือก 1 ใน 3 patterns:**
| Option | Friction | Est | Note |
|---|---|---|---|
| **LIFF in OA** ⭐ | ต่ำสุด | 4-6h | Customer click link → open LIFF → auto-link via LINE userID. ใช้ Pacred OA ที่มีแล้ว |
| LINE OA webhook + DM bot | กลาง | 6-8h | Customer add friend → bot ส่ง code → customer paste ใน profile |
| LINE Login OAuth | สูง | 6-8h | Separate channel — full auth replacement |

**แนะนำ:** LIFF (lowest friction, fastest, reuses existing OA channel). New task **D-1-LIFF** assigned to ภูม → ดู Part O2 Track G

### ⚠️ ขาดทั้งระบบ (PHP เดิมไม่มีหรือ partial — Pacred ยังไม่ได้ build)

**บัญชี/Tax (post-launch OK ก่อน):**
- ❌ Tax invoice (ใบกำกับภาษี) issuance flow + numbering
- ❌ Withholding tax (ภ.ง.ด. 3, 53) handling สำหรับ B2B juristic
- ❌ Aging report — admin ไม่เห็น overdue accounts
- ❌ Profit/Loss report comprehensive
- ❌ Bank reconciliation (slip vs bank statement auto-match)

**Refund/dispute (post-launch OK):**
- ❌ Formal refund workflow (ปัจจุบัน wallet adjustment manual)
- ❌ Dispute / chargeback model

**Phase I services (ecosystem expansion — design only):**
- Service #5 tax-refund · #7 tax-invoice · #8 shipping-document · #12 bill-payment

## Q2. ของที่ก๊อต ต้องเตรียมก่อน owner call

### Bundle 1 — เปิดได้ทันที (no decisions, just provide values)
```
□ PromptPay number (เบอร์/tax-ID, no dash)
□ Bank account number + ชื่อธนาคาร + ชื่อบัญชี (สำหรับพิมพ์ใน QR receipt)
□ ThaiBulkSMS account → API key + API secret (login ที่ thaibulksms.com)
□ Pacred company info (ใช้สำหรับ tax invoice + footer + email):
  □ Tax ID (เลข 13 หลัก)
  □ ที่อยู่จดทะเบียน (สำหรับใบกำกับ)
  □ ชื่อบริษัท Thai + English
  □ เบอร์โทรกลาง + email contact
□ Sentry account → DSN (free tier OK pre-launch)
□ Upstash Redis DB → URL + token (free tier OK)
□ hCaptcha site (Type=Invisible) → site key + secret
```

### Bundle 2 — Decisions ที่ต้องตอบ
```
□ D-7: Payment gateway = Omise / 2C2P / Stripe TH? หรือ PromptPay-only ก่อน?
□ D-1: LINE customer linkage = LIFF (แนะนำ) / Webhook+DM / OAuth?
□ D-8: HS code variants = แยก หรือ merge เข้า tier?
□ Tax invoice numbering format? (auto INV-YYYYMM-NNNN?)
□ ใครเป็น approver ของ wallet deposit? (super only / accounting role / both?)
```

### Bundle 3 — ✅ landed already (ไม่ต้องคุย)
```
✅ LINE OA channel access token (Pacred provided 2026-05-14)
✅ LINE OA Basic ID (@683wolja) + Premium ID (@pacred) provided 2026-05-14
   → in components/seo/site.ts as LINE_OA.{basicId, premiumId, addFriendUrl}
   → premium ID add-friend URL = https://line.me/R/ti/p/%40pacred
✅ Sentry SDK + Rate limit + hCaptcha — scaffolded รอ creds เท่านั้น
✅ D-12-wire + D-13-wire — rate-limit + CAPTCHA wired into 6 actions + 3 forms
```

## Q3. Production launch checklist (priority order)

```
Sequence ถ้าจะ launch beta แบบ "PromptPay-only + admin manual":
  1. PromptPay creds → wallet deposit ทำงาน
  2. ThaiBulkSMS keys → OTP จริง (OTP_BYPASS=false)
  3. Sentry DSN → จับ error production
  4. LINE LIFF (D-1-LIFF) + LINE_CHANNEL_* ใน Vercel → customer notification
  5. Pacred company info → tax invoice เตรียมในอนาคต
  6. Upstash + hCaptcha → bot/abuse protection production-grade
  7. (Optional) Payment gateway D-7 — ถ้ายังไม่พร้อมก็ใช้ PromptPay-only ไปก่อน
```

**Estimate ถ้า creds week นี้:** 1-2 weeks ถึง beta launch (PromptPay-only + LIFF + บัญชีพื้นฐาน)
**ถ้า payment gateway ต้อง launch:** +3-4 weeks สำหรับ M2.1

## Q4. Action assignments (per role)

### ⚠️ All roles — cost discipline (ก๊อต flag 2026-05-15)
> **`docs/team.md` §3.0 — push frequency rule:** commit local ฟรี, push เฉพาะ save point. Target ~1-3 push/day/คน. Vercel build minutes คิดตัง.

### ก๊อต (URGENT)
- [ ] **Schedule Pacred owner call this week** — Bundle 1 (creds) + Bundle 2 (decisions)
- [ ] หลัง owner call: review งานน้อง 2-day batch + merge dave→main (per `team.md` §3 ก๊อต flow)
- [ ] D-7 payment gateway intro — owner discuss + เลือก provider

### เดฟ (URGENT — ตอนนี้ pivot landing แต่ยังต้อง track)
- [x] ✅ D-12-wire + D-13-wire DONE 2026-05-14 (no-op until creds activated in Vercel env)
- [ ] หลัง D-7 lock → lead M2.1 payment gateway implementation (~40-60h)
- [ ] Continue landing pivot กับ Claude (current pivot focus)

### ภูม (URGENT — backend self-directed)
- [ ] **NEW D-1-LIFF (URGENT, ~4-6h)** — LINE LIFF for customer linkage. ดู Part O2 Track G
- [ ] **P-50 china-search rewire (CRITICAL, ~4-6h)** — TAMIT-cloud per audit
- [ ] Sprint 6.5 follow-ups (~2-3h)
- [ ] Sprint 7+ Tracks A-G ตามลำดับ self-directed

### ปอน (URGENT — frontend self-directed)
- [ ] Continue Phase B landing polish (decisions ก็ pull เดฟ assist)
- [ ] **NEW: หลัง D-1-LIFF lands** — เพิ่ม "เพิ่ม LINE OA" CTA + LIFF entry point ที่ landing pages + dashboard
- [ ] Phase D L-9b/c i18n polish (self-directed, anytime)
- [ ] Phase C+ ecosystem (รอ Pacred owner decisions ที่ Bundle 2)

---

**End of Part Q.** Single-page alert บัญชี/LINE/การเงิน. Cross-link to Part O2 (per-task spec) + Part P §P3 burndown + audit `docs/audit/php-pcscargo-integrations.md`

---

# 🚨 Part R — VENDOR CUTOFF + URGENT decisions for ก๊อต / เดฟ (2026-05-15)

> **ภูม flag (2026-05-15 ค่ำ):** "Pacred owner = ก๊อต + เดฟ — ตัดสินได้เลย ไม่ต้องคุยใคร".  **"ตัด ทั้งไอแต้ม (TAM/TAMAI/TAMTISO/tam-i-t/tamit-cloud/akucargo/laonet) ทั้ง PCS Cargo legacy ออกให้หมด — ไม่อยากให้ vendor เก่ารู้ว่า Pacred ทำเว็บใหม่"**.
>
> Part Q เดิมมี "Pacred owner ต้องตอบ" เป็นจำนวนมาก — ภูม clarify ว่า "owner" = ก๊อต+เดฟ.  ดังนั้นเรื่องที่ถูก block อยู่จริงๆ มีแค่บางตัว (creds external เช่น Sentry/Upstash/hCaptcha) — ที่เหลือ ก๊อต+เดฟ ตัดสินได้เลย.

## R1. ✅ RESOLVED 2026-05-15 ค่ำ — Option F (use TAM interim, ก๊อต cutoff later)

> **Decision by ก๊อต+เดฟ (2026-05-15 ค่ำ):** "ใช้ API ของไอแต้มไปก่อน เดี๋ยวพี่กอทมาไล่เปลี่ยนทีหลัง".
>
> **Locked in ADR:** [`docs/decisions/0003-china-search-vendor-cutoff.md`](decisions/0003-china-search-vendor-cutoff.md)
> **ก๊อต cutoff checklist:** [`docs/decisions/0003-china-search-vendor-cutoff-checklist.md`](decisions/0003-china-search-vendor-cutoff-checklist.md)
>
> **What this means for Pacred launch:**
> - ✅ Track G code (P-50..P-53) **activates** in production with TAM endpoints
> - ✅ Vercel env vars set per ADR (all defaults → TAM URLs work as-is, but explicit setting is cleaner)
> - ✅ Customer flow: real product detail / keyword search / image search work day-1
> - ⏰ ก๊อต cutoff trigger: **100 daily orders OR 8 weeks post-launch**, whichever sooner
> - 🔒 Cleanup work locked in checklist (Phase 0 → Phase 3, ~10-50h depending on chosen replacement)
>
> **เดฟ action this week:** set 5 env vars in Vercel (PACRED_TAMIT_DETAIL_URL etc.) — see ADR §Action items.
> **ก๊อต future track:** K-ADR-vendor-cutoff (Sprint 7+ Track K, post-launch).

### Original blocker context (kept for history)

**Status:** P-50, P-51, P-52, P-53 ภูม ship ครบใน `origin/Poom` (5 commits, ~1,300 LOC, 96 test assertions all green).  **โค้ดทำงานถูกต้องตาม audit แต่ wired ไปหา vendor ที่เจ้าของไม่อยากเกี่ยว.**

**Endpoints ที่ Track G ใช้** (audit-derived; ทั้งหมดเป็น vendor PCS Cargo เก่า):

| File | Endpoint | จัดการ |
|---|---|---|
| `lib/china-search/index.ts` (P-50) | `tamit-cloud.com/api-product/get/{1688\|taobao}/?id=` | URL→detail |
| `lib/china-search/short-url-cache.ts` (P-51) | `tam-i-t.com/api/convert-link-china/{get,save}` | short URL resolver |
| `lib/china-search/akucargo.ts` (P-52) | `akucargo.com/api3/api-2022/search/v1[/taobao]/` | keyword search |
| `lib/china-search/laonet.ts` (P-53) | `laonet.online/index.php?api_name={upload_img,item_search_img}` | image search |
| `.env.local` `PACRED_LAONET_KEY` | `tam011plus@gmail.com` (vendor's literal email-as-key) | shared with PCS legacy |

**Decision needed (ก๊อต+เดฟ — เลือก 1):**

| Option | Effort | Risk | Note |
|---|---|---|---|
| **A. Build Pacred-owned scraper** (Cheerio + Puppeteer + Vercel function) | ~30-50h | Med (1688/Taobao change anti-scraper rules) | Full independence; matches what TAM/AkuCargo do internally |
| **B. Apply for official Taobao Open API** (Alibaba Open Platform) | ~10h apply + 5-10h integrate | Low (official) | Need Pacred company verification documents to Alibaba; might take weeks for approval |
| **C. Pay 3rd-party SaaS** (RapidAPI / Apify Taobao Scraper / similar) | ~5h | Low | Monthly recurring cost; not under our control but cleanly contracted |
| **D. Cut feature short-term** — customer pastes URL/title/price/qty manual | 0h (revert wiring) | Low | UI already supports demo mode (P-50 demo fallback); just don't enable Track G in production. Add notice "ใส่ข้อมูลสินค้าเอง — ระบบ search กำลังพัฒนา" |
| **E. Hybrid (recommended interim)** | 0h decision + 1-3 days implement when ready | Low | Keep Track G code as-is in repo (it's correct) but **don't set the env vars in Vercel**.  Production runs in demo mode (option D).  When option A/B/C ready, just set the env vars and traffic flows.  Zero throwaway work. |

**ภูม ความเห็น (advice — final call to ก๊อต/เดฟ):** **Option E (hybrid)** ตอนนี้ — Track G code นั่งนิ่ง ๆ ไม่กระทบใคร, prod ใช้ demo mode (UI เปลี่ยน label ให้ลูกค้าเข้าใจ).  ขนาน ก๊อต/เดฟ ตัดสินใจ A/B/C เป็นการบ้าน Phase H/I ไม่ rush.

**ถ้าอยาก Option D ตัดทันที:** ภูม ใช้ ~1h revert wiring (set `PACRED_TAMIT_DETAIL_URL=disabled` หรือ feature flag) — บอกได้เลย.

## R2. 🆘 PCS Cargo branding cutoff (audit-needed)

ภูม flag: "ตัด PCS ออกหมดด้วย".  ตอนนี้ในโค้ด/comment/test ยังมี references ที่อาจหลงเหลือ:

| ที่ | สิ่งที่อาจรั่ว | Action |
|---|---|---|
| `docs/audit/php-pcscargo-integrations.md` | สรุป PHP เก่าทั้งหมด — มี secret PCS, social tokens, etc. | **internal-only doc** ไม่ commit ออก public; ถ้า leak Git history ของ vendor/ก๊อต/เดฟ — flag |
| Code comments mentioning "PCS Cargo" / "pcscargo.co.th" | บอกที่มา legacy | Replace ด้วย "Pacred (formerly the same team / new company)" หรือ "legacy" generic |
| Test data / migrations using PCS member codes | `PCS<num>` เก่า | ✅ ไม่มี — ใช้ `PR<num>` ตั้งแต่แรก (CLAUDE.md decision A1) |
| `.env.local` legacy variable names with `PCS_` prefix | naming leak | ✅ ตรวจแล้ว — ใช้ `PACRED_*` prefix ทั้งหมด |
| Bank account `064-174-3836` Kasikorn (PCS legacy) | ไม่อยู่ในโค้ด แต่ถ้า hardcode = leak | ⏳ เดฟ block ใน Part Q — รอ Pacred bank acct ใหม่ |
| LINE Notify legacy tokens (audit §1.3) | ไม่อยู่ในโค้ด — ทั้งหมด LINE Notify EOL แล้ว | ✅ ไม่ใช้แน่นอน |

**Action ก๊อต/เดฟ:**
- [ ] Confirm `docs/audit/php-pcscargo-integrations.md` เป็น internal-only doc (ไม่ใช่ public docs)
- [ ] Decide: ในโค้ด/comment ที่อ้างถึง "PCS Cargo" / "pcscargo.co.th" / "legacy PHP" — เก็บไว้เพื่อ context หรือลบทิ้ง?
- [ ] Pacred new bank account + PromptPay number (Part Q Bundle 1 #1)

## R3. ของเร่งด่วน — Pacred owner = ก๊อต/เดฟ ตัดสินได้ตอนนี้เลย

ที่ Part Q เดิม mark "BLOCKED on owner" — ภูม clarify ว่า ก๊อต+เดฟ ตัดสินได้เลย:

| # | Decision | Owner | Sub-decision details |
|---|---|---|---|
| 1 | **D-7 Payment Gateway** | ก๊อต+เดฟ | Omise / 2C2P / Stripe TH / PromptPay-only?  Beta launch ใช้ PromptPay-only ได้ตามที่เดฟ note ใน Part Q. |
| 2 | **D-1 LINE customer linkage** | ก๊อต+เดฟ | LIFF (เดฟ บอกแนะนำ) / Webhook+DM / OAuth?  ภูมิ ship LIFF code แล้ว — แค่ตัดสินใจ "OK ใช้ LIFF" + create LIFF app ใน LINE Console + set `NEXT_PUBLIC_LIFF_ID` ใน Vercel |
| 3 | **D-8 HS code variants** | ก๊อต+เดฟ | แยก หรือ merge? |
| 4 | **D-9 Payroll module** | ก๊อต+เดฟ | M2.2 spec |
| 5 | **Tax invoice numbering format** | ก๊อต+เดฟ | `INV-YYYYMM-NNNN`? Sequential? |
| 6 | **Wallet deposit approver role** | ก๊อต+เดฟ | super only / accounting role / both? |
| 7 | **R1 — Track G replacement strategy** | ก๊อต+เดฟ | Option A/B/C/D/E (ดู R1 ด้านบน) |
| 8 | **R2 — PCS branding cutoff** | ก๊อต+เดฟ | จะเก็บ comment context หรือ scrub? |

**ของที่ external-blocked จริงๆ (ไม่ใช่ ก๊อต/เดฟ ตัดสินใจคนเดียวได้):**

| # | Decision | External party | Notes |
|---|---|---|---|
| A | Sentry account → DSN | sentry.io signup | free tier OK pre-launch |
| B | Upstash Redis DB → URL + token | upstash.com signup | free tier OK |
| C | hCaptcha site (Type=Invisible) → site key + secret | hcaptcha.com signup | free tier OK |
| D | ThaiBulkSMS account → API key + secret | thaibulksms.com signup | paid (per SMS) |
| E | Pacred company info | Pacred legal | tax ID, address, bank acct |

→ **Action ก๊อต:** Bundle A-E สามารถสมัครเอง / ขอ Pacred legal เอง (15-30 นาที per service)

## R4. Action checklist (priority order, ก๊อต+เดฟ คนละครึ่ง)

### ก๊อต — URGENT (this week)
- [ ] **R1 decision**: เลือก Option E (hybrid) ไหม? ถ้าเลือก = แค่ "OK" reply → ภูม ทำ Option D parallel (UI label change) ระหว่างรอ A/B/C
- [ ] **R2 decision**: scrub PCS comments หรือเก็บ?
- [ ] Sign up: Sentry + Upstash + hCaptcha (Bundle A/B/C — ฟรีหมด)
- [ ] Apply: ThaiBulkSMS account (Bundle D)
- [ ] Provision: Pacred company bank acct + PromptPay number (Bundle E + Part Q #1)
- [ ] Create: LIFF app ใน LINE Console (Pacred Channel ID 2009931373) → set `NEXT_PUBLIC_LIFF_ID` ใน Vercel

### เดฟ — URGENT (this week)
- [ ] **R1 decision** ร่วมกับ ก๊อต — ถ้า A (build scraper) → spec ออกเป็น Phase H task
- [ ] D-7 Payment Gateway lock (ก๊อต+เดฟ ตัดสิน) → ถ้า PromptPay-only ก่อน beta = OK
- [ ] D-12-wire (rate limit drop into forms) — เมื่อ Upstash creds เข้า
- [ ] D-13-wire (hCaptcha drop into signup/contact/password-reset) — เมื่อ hCaptcha keys เข้า
- [ ] Continue Phase H landing pivot กับ Claude

### ภูม — unblocked ✅ (R1 resolved as Option F per ADR 0003)
- [x] ✅ Sprint 6.5 follow-ups DONE (commit `0d9b47c`)
- [x] ✅ R1 ADR 0003 + cutoff checklist written (this session)
- [ ] **Track A tests** (Tier 1 in pending_state memory) — P-28 OTP / P-29 wallet / P-30 signup / P-31 cart cap (~7-9h, all green-field, doesn't touch china-search)
- [ ] Sprint 6 leftover P-22 / P-23 / P-27 if Track A wraps fast
- [ ] Tier 2-6 (Track B/C/D/E from pending_state memory)

### ปอน — ไม่กระทบ
- [ ] Phase B landing polish (ตามเดิม)
- [ ] หลัง LIFF app created (ก๊อต) → drop "เพิ่ม LINE OA" CTA ตามที่ Part Q4 บอก

## R5. Burndown estimate (revised)

| Path | Time-to-beta | Notes |
|---|---|---|
| **Hybrid (Option E)** | 1-2 weeks | ก๊อต/เดฟ ตัดสินวันนี้ + Bundle creds เข้าสัปดาห์นี้ + ภูม Sprint 6.5 + Track A. China-search = demo mode in prod (acceptable) |
| **Cut feature (Option D)** | 1-2 weeks | เหมือน hybrid + ภูม revert wiring (~1h) |
| **Pacred-owned scraper (Option A)** | 4-6 weeks | hybrid first → ภูม + เดฟ ทำ scraper parallel → swap when ready |
| **Official Taobao API (Option B)** | unknown (Alibaba approval) | hybrid first → ผูกกับ application timeline ของ Alibaba |
| **3rd-party SaaS (Option C)** | 1-2 weeks | hybrid first → contract + integrate (~5-7h) |

---

**End of Part R.** Single-page alert vendor cutoff + ก๊อต/เดฟ decisions.  ภูม block on R1 decision but has parallel work (Sprint 6.5 + Track A) ที่ไม่ blocked.

---

# 🤝 Part S — เดฟ → ก๊อต async hand-off (2026-05-16)

> **Purpose:** ก๊อต = senior advisor / นานๆ ว่างที — ฉะนั้นเวลาก๊อตเปิด Claude Code/repo มาแล้ว ควรเห็น "batch of decisions + ADRs" ที่ pre-loaded ไว้ให้ลุยรวดเดียวจบ. เดฟ encode งานก๊อต ที่นี่ ก๊อต tick off ใน commit เมื่อเสร็จ.
>
> **Mode:** Async (per `team.md` §9). เดฟ + ก๊อต ไม่ต้องเจอกันแบบ real-time. ก๊อต อ่าน → ทำ → push → commit ปิด task. เดฟ pick up changes ใน sync ครั้งถัดไป.

## S1. ✅ Decisions ที่เดฟ confirm 2026-05-16 (R1 + R2 = locked)

| # | Decision | Choice | Rationale |
|---|---|---|---|
| **R1** | China-search vendor cutoff strategy | ✅ **Option E (hybrid)** | Track G code ภูม ship ครบ — งดงาม. Keep ใน repo, **อย่า set Track G env vars (`PACRED_TAMIT_*`/`PACRED_AKUCARGO_*`/`PACRED_LAONET_*`) ใน Vercel** prod. Prod = demo mode (UI label change). Zero throwaway work. ก๊อต/เดฟ ตัดสินใจ A/B/C parallel เป็นการบ้าน Phase H/I ไม่ rush. **ภูม unblocked** ทำ Track A tests parallel + label-change UI (~1h เมื่อพร้อม) |
| **R2** | PCS Cargo branding cutoff | ✅ **Scrub** | ลบ "PCS Cargo" / "pcscargo.co.th" / "legacy PHP" mentions ใน code comments / test data / migrations. Replace ด้วย "legacy" generic หรือลบทิ้ง ถ้า rot context. `docs/audit/php-pcscargo-integrations.md` คงไว้เป็น **internal-only** doc (ไม่อยู่ใน landing-public scope). บัญชี `064-174-3836` ห้าม hardcode (ยังไม่อยู่ในโค้ดอยู่แล้ว ✅) |

**Action:** ก๊อต confirm 2 decisions นี้ + spec ออกเป็น 2 ADRs (S2 #1 + S2 #3 ด้านล่าง) → ภูม + ปอน + เดฟ pick up

---

## S2. 🎯 ก๊อต batch — Priority order (~13-17h total, self-directed pace)

### Priority 1 — Unblock work (do first)

| # | Task | Est | Output | Unblocks |
|---|---|---|---|---|
| **K-1** | ✅ **DONE 2026-05-16** — ADR-0003 china-search vendor cutoff [`0003-china-search-vendor-cutoff.md`](decisions/0003-china-search-vendor-cutoff.md). Locks Option E hybrid + guardrails + re-evaluation triggers. Written by เดฟ on ก๊อต's behalf per §6 second-tier owner authority — ก๊อต can amend | done | — |
| **K-2** | ✅ **DONE 2026-05-16** — ADR-0004 payment gateway [`0004-payment-gateway.md`](decisions/0004-payment-gateway.md). Locks D-7 = PromptPay-only ก่อน beta + post-beta selection criteria (Omise > 2C2P > Stripe TH gated on cart-dropoff % + CS ticket volume) | done | — |
| **K-3** | ✅ **DONE 2026-05-16** — Scrub runbook [`docs/runbook/pcs-scrub-plan.md`](runbook/pcs-scrub-plan.md) + sweep applied. 4 user-visible files migrated to `CONTACT.*` / `ADDRESSES.*` imports (HTML + 2 PDF receipts + sales-rep-card fallback). Legacy code comments + migration SQL kept (internal traceability, never ship to client). Pending = bank acct + PromptPay number (Part Q Bundle 1, blocked on Pacred owner) | done | — |

### Priority 2 — Quick decisions (~1h batched)

✅ **DONE 2026-05-16** — all 4 locked + formalised in [ADR-0005](decisions/0005-launch-operational-decisions.md):

| # | Task | Decision | Rationale |
|---|---|---|---|
| **K-4** ✅ | D-8 HS variants — แยก / merge เข้า tier? | **Keep separate** | ภูม P-20 schema is live; merging conflates customer-volume discount (tier) with product-classification surcharge (HS) — different reviewers, different change frequencies |
| **K-5** ✅ | D-9 Payroll module — standalone / extend HR? | **Extend HR** | Pacred team is small (~8-15 staff); HR already owns canonical employee record + `is_admin(["accounting"])` gate. Re-evaluate at ~50 staff |
| **K-6** ✅ | Tax invoice numbering format | **`INV-YYYYMM-NNNN`** with monthly reset | Matches Thai `ภ.พ. 30` monthly filing convention; 4-digit suffix = 9999/month headroom; lexicographically sortable |
| **K-7** ✅ | Wallet deposit approver role | **`super` OR `accounting`** (not ops, not sales_admin) | `super` = full powers; `accounting` = primary work. Ops shouldn't touch money flows (compliance risk) |

### Priority 3 — Deep work (when time permits)

| # | Task | Est | Output |
|---|---|---|---|
| **K-8** | ✅ **DONE 2026-05-16** — ADR-0006 tax invoice flow [`docs/decisions/0006-tax-invoice-flow.md`](decisions/0006-tax-invoice-flow.md). Full design contract: schema (tax_invoices + tax_invoice_lines + tax_invoice_seq) + RLS + numbering generator function + PDF template plan + cancellation/credit-note flow + VAT mode (inclusive default) + RBAC gate (super+accounting per K-7) + 6-phase implementation breakdown (G2a-G2f, ~14-19h). WHT noted as out-of-scope. Pacred-side pre-issuance checklist included | done | — |
| **K-9** | ✅ **DONE pre-2026-05-16** — `.github/CODEOWNERS` exists with default-funnel-to-deffeyameh + TODO note to add @got-jirayus + @Poom + @podeng as accounts confirmed | done | — |
| **K-10** | ✅ **DONE 2026-05-16** — `.github/workflows/ci.yml` (lint + tsc + `pnpm test:unit`) on PR + push to main/dave. Concurrency-cancels in-flight runs. Skips `pnpm build` (Vercel covers) + placement integration test (needs `.env.local`). New `pnpm test:unit` script (env-independent suite) | done | — |
| **K-11** | ✅ **DONE 2026-05-16** — OWASP Top 10 (2021) desk audit [`docs/audit/owasp-2026-05.md`](audit/owasp-2026-05.md). Summary: 8× 🟢 strong / 2× 🟡 (A05 CSP unsafe-inline, A06 transitive postcss). Recommendations sorted P0-P3; P0 items map to existing K-12/K-13/DV-1 activation tasks. Re-audit triggers documented (quarterly + on RBAC/SDK change) | done | — |
| **K-12 🆕** | **L-22 GTM activation** — สมัคร GTM container + GA4 + ตั้ง `NEXT_PUBLIC_GTM_ID` ใน Vercel | 30-45m | Quick run: (1) tagmanager.google.com → New Container → Web → copy `GTM-XXXXXXX` (2) inside GTM connect GA4 property → publish container (3) `vercel env add NEXT_PUBLIC_GTM_ID` for Production + Preview (4) redeploy (5) smoke: open prod + GTM Preview Mode → verify sign_up/login/generate_lead/place_order dataLayer events fire. **Code shipped 2026-05-16 ([`08685b3`]); ทุกอย่างพร้อมแล้ว แค่ต่อท่อ Google ปลายทาง** |
| **K-13 🆕** | **L-23 Clarity activation** — สมัคร Microsoft Clarity + ตั้ง `NEXT_PUBLIC_CLARITY_ID` ใน Vercel | 15-30m | Quick run: (1) clarity.microsoft.com → sign in with Microsoft account → New Project → site URL `https://pacred.co` → copy 10-char project ID (2) `vercel env add NEXT_PUBLIC_CLARITY_ID` for Production + Preview (3) redeploy (4) wait ~15min then check Clarity dashboard for first recordings. **Code shipped 2026-05-16 (DV-6); free tier no quota; auto-masks form inputs** |

### Priority 4 — Nice-to-have (after Priority 1-3)

- K-sec-2 RLS policy comprehensive audit (3-4h)
- K-sec-3 Audit log coverage gap report (1-2h)
- K-ADR-erp-phase-2 co-author with ภูม (4-6h) — see Sprint 7+ Track D
- K-quality-* refactor proposals (Sprint 7+ Track K5)

---

## S3. 🔄 เดฟ → ภูม / ปอน hand-off (after R1+R2 lock)

### ภูม
- 🟢 **Continue self-directed:** Track A tests P-28..P-31 (~7-9h, no R1 dependency)
- 🟡 **After K-1 ADR ships:** P-50 Option E label change UI (~1h) — "ใส่ข้อมูลสินค้าเอง — ระบบ search กำลังพัฒนา"
- 🟡 **After K-3 ADR ships:** PCS scrub task list — ภูม own backend half (actions/, lib/, migrations/, supabase/)
- 🟢 **Continue:** Sprint 6 leftover P-22 attendance + P-23 meeting room (after K-5 D-9 decision) + P-27 ADR draft

### ปอน
- 🟢 **Continue:** Phase D L-9b/c i18n polish (anytime)
- 🟡 **After K-3 ADR ships:** PCS scrub frontend half (components/, app/, messages/) — coordinate w/ ภูม
- 🟡 **Blocked on เดฟ confirm:** Phase B L-5 priority page order (เดฟ pick: home → import-china → china-shopping → customs-clearance per ปอน suggestion)
- 🟡 **Blocked on เดฟ LIFF app creation:** "เพิ่ม LINE OA" CTA drop at landing pages

---

## S4. 🚀 เดฟ self-batch (this week, parallel with ก๊อต batch)

| # | Task | Est | Blocker |
|---|---|---|---|
| **DV-1** | External signups: Sentry + Upstash + hCaptcha (all free tier) | 30m | None — เดฟ ทำได้ทันที |
| **DV-2** | Create LIFF app ใน LINE Console (use Channel ID `2009931373`) → set `NEXT_PUBLIC_LIFF_ID` ใน Vercel | 30m | None |
| **DV-3** | ThaiBulkSMS account apply + API keys → Vercel env | 30m | None (paid per SMS) |
| **DV-4** | Pacred owner ติดต่อ ขอ PromptPay # + bank acct | 15m + รอ | Pacred legal |
| **DV-5** | ✅ **DONE 2026-05-16** — L-22 GTM/GA4 scaffold + 4 events wired (commits `632e028` + `08685b3`). Activation = K-12 ของก๊อต | done | — |
| **DV-6** | ✅ **DONE 2026-05-16** — L-23 Clarity scaffold (`components/analytics/clarity-script.tsx` + `clarityTag/clarityEvent/clarityIdentify` helpers). Activation = K-13 ของก๊อต | done | — |
| **DV-7** | ✅ **DONE 2026-05-16** — L-24 A/B infra (cookie-based deterministic bucketing via `pacred_vid` + FNV-1a; `lib/experiments.ts` pure primitives + `lib/experiments-server.ts` for RSC). No external activation needed; flip experiment `active: true` in registry to start traffic-splitting | done | — |
| **DV-8** | 🟡 **Phase 1 DONE 2026-05-16** — analytics wired on top-3 home CTAs (BookingCalculator × 4 calc modes + ContactSales × 3 reps × 2 channels + ImportExportBanner × 3 surfaces). Phase 2 (visual polish per ปอน page-order suggestion) remains | phase 1 done | ปอน sync for phase 2 |

**Estimate รวม:** ~16-22h งานเดฟ this week. หลัง creds เข้าจาก DV-1..DV-4 → activate Sentry/Upstash/hCaptcha ใน Vercel + redeploy = unblock production hardening

---

---

## S5. 📊 Priority order — Claude + เดฟ ทำได้ทันที (no external blocker)

> Updated 2026-05-16 หลัง L-22 landed. งานที่ **ทำได้เลยไม่ต้องรอใครก่อน**:

| Rank | Task | Effort | Who unblocks | Why this order |
|---|---|---|---|---|
| ~~1~~ ✅ | ~~DV-6 L-23 Microsoft Clarity scaffold~~ | done | — | Landed 2026-05-16 |
| ~~2~~ ✅ | ~~DV-7 L-24 A/B infra scaffold~~ | done | — | Landed 2026-05-16 (cookie-based bucketing, no external SaaS) |
| ~~3~~ 🟡 | DV-8 L-5 home **Phase 1 analytics wiring** | done | — | Landed 2026-05-16 — top-3 home CTAs emit `cta_click` events |
| 1 | **DV-8 L-5 home Phase 2 — visual polish** | 3-4h chunk | ปอน sync (priority page order) → Claude implement | Strategic shift Part P4. ปอน suggest order: home → import-china → china-shopping → customs-clearance. Now has analytics data to inform changes |
| ~~2~~ ✅ | ~~Track G label-change UI~~ | done | — | Landed 2026-05-16 — i18n `apiUnavailable` rewritten to Option E messaging ("ใส่ข้อมูลสินค้าเอง — ระบบ search กำลังพัฒนา"), banner switched from yellow/warning to blue/info, `reason` interpolation dropped |
| ~~3~~ ✅ | ~~Wire remaining home CTAs~~ | done | — | Top-5 banners covered (DV-8 Phase 1). Promotion deferred — Server Component needs "use client" refactor; Sales/Blog have no top-level click CTAs |
| 2 | **DV-8 Phase 2 — visual polish** (home → import-china → china-shopping → customs-clearance) | 3-4h chunk | ปอน sync (priority page) → Claude implement | Now has analytics + heatmap + A/B infra to inform changes |
| ~~3~~ ✅ | ~~Convert Promotion to client + wire register CTAs~~ | done | — | Landed 2026-05-16 — "use client" + `trackCtaClick("promotion_claim", "home_promotion", { promo_idx, promo_title })` on each card |
| 3 | **Extend trackPlaceOrder to admin-side wallet approve** | 30m | Claude self-directed | After admin approves slip → `trackWalletDeposit(amount)` so revenue events flow into GTM even when initiated by admin |

### งานที่ต้องรอ external (defer; ส่งต่อก๊อต/Pacred owner):

| Task | Blocked by | Hand-off ที่ไหน |
|---|---|---|
| K-12 L-22 **GTM activation** | ก๊อต ทำ Google account signup + Vercel env | Part S2 Priority 3 (เพิ่งเพิ่ม) |
| DV-1 Sentry/Upstash/hCaptcha signups | เดฟ/ก๊อต ทำ external signups | Part S4 DV-1 |
| DV-2 LIFF app creation | เดฟ/ก๊อต ใน LINE Console | Part S4 DV-2 |
| DV-3 ThaiBulkSMS keys | เดฟ ทำ external signup | Part S4 DV-3 |
| DV-4 PromptPay + bank | Pacred owner provision | Part S4 DV-4 |
| K-1..K-7 ADRs / decisions | ก๊อต senior advisor scope | Part S2 |

### Hand-off triggers (เมื่ออันบน landed):

- **เมื่อ K-12 (GTM) activate:** → DV-6 Clarity scaffold พร้อมเข้า config เดียวกัน (สามารถใช้ GTM container ปูทาง Clarity ก็ได้)
- **เมื่อ DV-2 LIFF app created:** → ปอน drop "เพิ่ม LINE OA" CTA ที่ landing pages
- **เมื่อ K-1 ADR vendor-cutoff:** → ภูม Track G label-change + ปอน strip "ไอแต้ม" references จาก landing copy

---

**End of Part S.** เดฟ→ก๊อต hand-off pattern: ทุกครั้งที่เดฟต้อง offload งานสำคัญให้ก๊อต → append entry ใน Part S ใหม่ (new section S6, S7, ...) พร้อม commit message `docs(port-plan): hand-off batch to ก๊อต — <topics>`. ก๊อต tick off ใน follow-up commit.

---

# 🔥 Part T — EMERGENCY P0: Cargo Revenue Sprint (2026-05-15 brief)

> **State:** บริษัทกำลังเผาเงินตัวเอง. Google Ads ยิงไม่ติด · Search ก็ไม่เจอ · Facebook Ads มี inquiry คาร์โก้เข้าแต่ระบบยังไม่พร้อมรับ → ลูกค้า drop + เสียชื่อ. พี่ป๊อปเครียดมาก.
> **Goal:** Get the cargo system live + receiving customers ASAP. Revenue inflow → stop burn → fund continued dev (V2 expansion + V3 prep).
> **Lens (every priority decision):** "งานนี้ส่งผลให้รับลูกค้า cargo ได้เร็วขึ้นไหม?" ถ้าใช่ → P0. ถ้าไม่ → defer.

## T1 — Critical path to first revenue

The shortest path from "today's state" → "Pacred receives first paying customer for cargo service":

```
[A] Owner provides bank + PromptPay
    ↓
[B] ก๊อต API switchover decisions (R1 china-search ✅ done · MOMO endpoints · borrow plan)
    ↓
[C] ภูม cargo backend full (service-import receipts + admin workflows + container model CT-1..CT-4)
    ↓
[D] ปอน landing fixes (SEO + Ad quality score)
    ↓
[E] Soft-launch internal test → first 5 friendly customers
    ↓
[F] Public Ads on (Google + FB) → scale
```

Each box can advance in parallel where the dep allows. The slowest box drags revenue → that's where everyone helps.

## T2 — Per-role emergency pickups (override normal priority)

> ปฎิบัติเพิ่ม / แทน priority ของ brief เดิม. **อ่านนี่ก่อน normal P0 list.**

### ก๊อต (decision + API switchover gate)

| # | Task | Why it blocks revenue |
|---|---|---|
| **T-G1** | **API borrow audit** — list every external API that the cargo system depends on right now. For each: (a) is it Pacred-owned or borrowed? (b) if borrowed, from whom? (c) sign-up timeline for Pacred-owned replacement | Without this list ภูม can't tell which deps are stable. Currently fuzzy. ~2h |
| **T-G2** | MOMO JMF endpoint inventory (existing MOMO-1) | Container tracking blocks customer trust → without "where's my container?" feature, customers don't return. ~2h call + 1h doc |
| **T-G3** | Pacred owner call bundle — bank/PromptPay/tax-ID/legal name (existing P3) | PromptPay = entire wallet/deposit flow. Tax-ID = tax invoice flow. Without these, customer cannot pay. ~30m call |
| **T-G4** | K-12 GTM + K-13 Clarity signup (existing P0) | Ads quality score depends on conversion tracking. No GTM = paying for ads without data = revenue waste | 
| **T-G5** | DV-1 Sentry + Upstash + hCaptcha signup (existing P0) | Sentry = catch prod errors that lose customers · Upstash = prevent OTP DoS · hCaptcha = prevent bot inquiries that waste sales bandwidth |

### ภูม (backend — biggest single revenue lever)

| # | Task | Why it blocks revenue |
|---|---|---|
| **T-P1** | **Admin workflow buttons** for cargo path — `customers/[id]` approve · `forwarders/[fNo]` status transitions + driver assignment · `service-orders/[hNo]` mark-payment + issue-receipt | Admin staff (วิน + พลอย + ภูม) cannot fulfill orders without these. Each missing button = manual SQL = bottleneck |
| **T-P2** | CT-1 container migration + CT-3 customer-side container view | "Where's my container?" = #1 customer churn factor. Customer can see → return rate ↑ |
| **T-P3** | Wallet/yuan-payments admin **bulk approve** | Pacred staff approves deposits manually → bottleneck. Bulk approve = same staff handles 10× volume |
| **T-P4** | G2 tax invoice issuance (existing P1) | Juristic customers (>50% of cargo value) cannot pay without tax invoice. Mandatory for B2B revenue |
| **T-P5** | Stub `/admin/accounting` (acc-* PHP port) | Owner sees revenue flow. Without dashboard, owner stress ↑ (can't see if Ads working) |

> Defer Track A integration tests + V3 prep until T-P1..T-P5 ship. Tests valuable but don't earn revenue this week.

### ปอน (landing → SEO → Ad-quality)

| # | Task | Why it blocks revenue |
|---|---|---|
| **T-N1** | **SEO emergency audit** — why is pacred.co not in Google search results? · run `pnpm audit:i18n` to check metadata · verify sitemap.xml deploys · check Google Search Console for indexing errors · request manual reindex | Site invisible = Ads wasted. ~3h. Result: report back what's blocking indexing |
| **T-N2** | **Ad landing quality** — every `/services/*` page must: (a) have h1 with intent keyword, (b) have CTA above the fold, (c) load <3s on 4G, (d) have phone + LINE CTA visible. Use Google PageSpeed Insights | Quality score affects CPC. Better quality = same ad budget reaches more customers |
| **T-N3** | **Funnel CTA wiring on top-5 cargo pages** — every page emits `generate_lead` when phone tapped, `cta_click` when LINE clicked, `start_signup` when "ลงทะเบียน" clicked. GTM dashboards then show drop-off | Without funnel data ก๊อต/เดฟ cannot tune ads |
| **T-N4** | **Phase I landing shells** (when Pacred has copy direction) — `/services/customs-clearance`, `/services/customs-broker-matching`, `/services/tax-invoice`, `/services/logistics` | Each missing landing = each missing Ad keyword = lost capture |
| **T-N5** | **Mobile QA top-5 cargo pages** — most TH cargo buyers browse mobile. If layout breaks → drop | Existing L-8 task; bump to P0 |

### เดฟ (integrator + cargo backend support for ภูม)

| # | Task | Why it blocks revenue |
|---|---|---|
| **T-D1** | **Cargo flow end-to-end smoke test** — go through signup → topup wallet → place service-order → admin marks paid → receipt issues. Find every gap. Fill or assign to ภูม | Without smoke test no one knows what's broken on the path to revenue. ~4h test + 2h fix |
| **T-D2** | **Backend specs for ภูม** — G2 tax invoice schema migration `0034_tax_invoices.sql` + container migration `0033_containers.sql` (draft + ภูม reviews + applies) | Unblocks ภูม T-P2 + T-P4. ~3h |
| **T-D3** | **L-22 GTM verify** (after ก๊อต K-12) — confirm events flow into GTM Preview Mode → into GA4 → into reports ก๊อต sees | Confirms entire conversion data pipeline; without this we're blind on ad attribution |
| **T-D4** | **Internal soft-launch coordination** — pick 5 friendly customers (พี่ป๊อป's network) for first paying transactions. Schedule. Hand-hold each through signup → topup → order → fulfilment | Real revenue. Tests system under real conditions. Builds confidence for public launch |

## T3 — "Borrow first, switch later" API plan (ก๊อต-gated)

> สาเหตุที่ Pacred ยังไม่ "ของตัวเอง" ทั้งหมด — เพิ่งแยกจาก PCS CARGO / TTP / ไอแต้ม. List external deps with switchover state.

| API / service | Current state | Borrow-from | Pacred-own timeline | ก๊อต task |
|---|---|---|---|---|
| **China product search** (1688/Taobao) | ✅ ADR-0003 Option F locked — use TAM API interim · ภูม shipped P-50..P-53 rewire | TAM (ไอแต้ม) — but cutoff planned | Option B (Alibaba API direct) or D (SaaS like RCGroup-TH) — ก๊อต ADR-0011 candidate | Decide replacement vendor + timeline |
| **MOMO JMF cargo tracking** (TH warehouse partner) | 🟡 JWT token captured · endpoints TBD | MOMO (partner — not competitor) | Pacred owns warehouse eventually (post-revenue) | T-G2 endpoint call |
| **ThaiBulkSMS OTP** | 🟢 Pacred-own pending creds | Self (sign up own acct) | Just sign up + flip `OTP_BYPASS=false` | DV-3 in Part S4 |
| **PromptPay payment** | 🔴 Owner opening Pacred bank acct | TBD | Owner provides | Part Q owner bundle |
| **Tax invoice numbering** | 🟢 Pacred-own (ADR-0006) | Self | Already locked | ภูม T-P4 |
| **Google Ads + Meta Pixel + TikTok Pixel** | 🟢 Pacred-own pending GTM activation | Self | K-12 GTM → activate | ก๊อต K-12 + เดฟ L-22-Ads |
| **Sentry + Upstash + hCaptcha** | 🟡 Code wired · accts pending | Self (sign up own) | Just sign up | DV-1a/b/c in Part S4 |
| **LINE Messaging API + LIFF** | 🟢 Pacred-own (Channel ID 2009931373 set) | Self | LIFF app creation pending | DV-2 in Part S4 |
| **DBD juristic-person lookup** | 🟢 Pacred-own (free DBD API) | Self | Already wired | n/a |
| **Email** (Resend/Workspace) | 🟡 7 dept emails set up | Self | Confirm forwarding rules + DKIM | เดฟ ops |

## T4 — Brand cleanup gate (don't preempt)

**Rule:** ทุก reference ของ "PCS Cargo / TTP / ไอแต้ม" จะลบเมื่อ ก๊อต confirm API switchover ของ component นั้นๆ. **อย่ารีบลบก่อน** เพราะอาจ break revenue path.

Current scrub status (per [`runbook/pcs-scrub-plan.md`](runbook/pcs-scrub-plan.md)):
- R2 PCS branding scrub plan ✅ documented; partial sweep done
- TTP scrub plan ⏳ pending (TTP = unknown to current code? verify with ก๊อต)
- ไอแต้ม scrub plan ⏳ pending (post-Option B/D vendor swap)

## T5 — Definition of "revenue-ready"

We've shipped revenue-ready when **all** of these are TRUE:

- [ ] Customer can sign up (TH OTP works · juristic lookup works)
- [ ] Customer can top up wallet (PromptPay live · slip upload works · admin approves within 1h)
- [ ] Customer can create service-import order (forwarder rate engine works · uploads work)
- [ ] Customer can pay for the order (wallet or PromptPay direct)
- [ ] Customer receives receipt PDF (with Pacred legal name + tax ID + bank account)
- [ ] Customer can request tax invoice if juristic (ADR-0006 flow live)
- [ ] Customer can see container/shipment status (CT-3 view + MOMO sync OR manual entry by admin)
- [ ] Admin (วิน/พลอย/ภูม) can fulfill the order through admin UI (no manual SQL)
- [ ] Conversion events fire into GTM → GA4 (K-12 active)
- [ ] No `OTP_BYPASS` / `LINE_PUSH_BYPASS` / `PROMPTPAY_BYPASS` flags in prod
- [ ] At least 5 friendly customers completed the loop end-to-end

> When this checklist hits 100%, Pacred can confidently scale Ads.

---

**End of Part T.** Update freq: each role updates their column when they ship something. เดฟ keeps T1 critical path drawing accurate. ก๊อต updates T3 borrow→own state when each switchover lands.

---

# Part U — Verified deficiency audit findings (chat + legacy cleanup)

**Source:** Two parallel audits 2026-05-16 evening:
- [`docs/audit/chat-analysis-2026-05-16.md`](audit/chat-analysis-2026-05-16.md) — 7 LINE group chats analysed (~507KB, Nov 2025 → May 2026)
- [`docs/audit/legacy-cleanup-2026-05-16.md`](audit/legacy-cleanup-2026-05-16.md) — `C:\xampp\htdocs\pcscargo` sweep

These T-U* items = the "**เก็บกวาดบ้านเก่า + อุดจุดรั่ว**" batch — what kept breaking in PCS that Pacred MUST fix before cargo revenue scales, plus dead-code cleanup to deprecate PHP cleanly.

## U1 — Critical leak holes (must-fix before public beta)

| # | Task | Source | Owner | Est | Status |
|---|---|---|---|---|---|
| **U1-1** | `/status` public health-check page (Vercel + Supabase + LINE Messaging status) | chat L-1: 24x "เว็ปล่ม" | เดฟ | 2h | 🔴 |
| **U1-2** | OTP SMS balance daily check + LINE alert when balance < 1000 messages | chat L-3 silent fail | ภูม + ก๊อต DV-3 wire | 2h | 🔴 |
| **U1-3** | Admin "rebind tracking → container" UI (no SQL escalation) | chat L-2: ~10 asks/week | ภูม T-P2 follow-up | 3h | 🔴 |
| **U1-4** | Admin "manual tracking entry" UI | chat IT: ~15 asks/week | ภูม T-P2 follow-up | 2h | 🔴 |
| **U1-5** | `received_qty` + `expected_qty` per `cargo_shipments` item (split case) | chat MOMO: qty=1 bug | ภูม schema update | 1h migration + 2h UI | 🔴 |
| **U1-6** | MOMO 9-status enum verbatim port → `MOMO_STATUS_TO_PACRED` + i18n labels | chat May 2 verbatim | ภูม T-P2 | 1h | 🟡 partial (`lib/integrations/momo-jmf/types.ts` has mapping; needs i18n labels + UI) |
| **U1-7** | Last-sync timestamp on customer tracking pages | chat L-4 trust | ภูม T-P2 | 30m | 🔴 |
| **U1-8** | Receipt PDF Thai-special-char unit tests (Sarabun font + edge addresses) | chat L-5 | ภูม test:unit | 2h | 🔴 |
| **U1-9** | Patch S-3 SQL injection in PHP `header.php` (if PHP stays externally exposed) | legacy S-3 audit | ก๊อต decide | 30m or n/a | 🟡 mitigated by XAMPP local-only |

## U2 — Workflow gaps from chat (must-fix for ops efficiency)

| # | Task | Source | Owner | Est | Status |
|---|---|---|---|---|---|
| **U2-1** | Daily container bulletin auto-generator (LINE-pastable `DD/MM/YY สรุปรายการ` format) | chat W-1 | ภูม | 3h | 🟡 P2 |
| **U2-2** | "จองรถ" truck booking form (output LINE-paste block) | chat W-2 dozens/week | ภูม + ปอน UI | 4h | 🟡 |
| **U2-3** | Carrier admin CRUD (SPX/J&T/Flash/EMS/Lalamove) — no dev required | dev/IT chat: 4 asks | ภูม | 2h | 🔴 |
| **U2-4** | Cost adjustment workflow post-delivery (D/O fee, gateway fee, weight rebill) | chat W-4 AIR IMPORT | ภูม | 3h | 🔴 |
| **U2-5** | Bulk-tracking multi-line search URL (like PHP `forwarder-search-muti.php?fTracking=...%0D%0A...`) | chat W-9 | ภูม | 1h | 🔴 |
| **U2-6** | Per-port lead-times stored (TTP/TTW/Bangkok/Laem Chabang) for ETA quotes | chat partner notes | ภูม + ก๊อต | 2h | 🟡 |

## U3 — Legacy cleanup (zero-risk house cleanup)

| # | Task | Source | Owner | Est | Status |
|---|---|---|---|---|---|
| **U3-1** | Snapshot PHP tree → `legacy-php-backup-2026-05-15.tar.zst` (out-of-tree, local) | legacy audit | เดฟ | 15m | 🔴 |
| **U3-2** | Delete Tier 1-3 dead code (~145 .php files + 3 backup sub-dirs) — local pcscargo/ | legacy §2-4 | เดฟ | 30m | 🔴 |
| **U3-3** | Archive `pcsc_main.sql` (2026-04-30) → `docs/audit/sql-dumps/` (gitignored) | legacy §7 | เดฟ | 15m | 🔴 |
| **U3-4** | Verify 5 should-port admin tools (MaoMao tier, ShipBy-Freedom, monthly close, interpreter payout, etc.) — port or write deferral one-pager | legacy §6 | ภูม | 4-6h | 🟡 |
| **U3-5** | Revoke LINE Notify OAuth client `4G0QlYx3x9BRL94COg76xR` at LINE dev console | legacy S-4 | ก๊อต | 15m | 🔴 |
| **U3-6** | Plan short-URL redirect strategy for `/c/`, `/f/`, `/s/` (external SMS/QR links) | legacy §1 | ก๊อต + เดฟ | 1h | 🟡 |

## U4 — Pre-launch security (post-Pacred cutover)

| # | Task | Source | Owner | Est | Status |
|---|---|---|---|---|---|
| **U4-1** | Force-clear `member_password` cookie globally before any external PHP exposure | legacy S-1 (CRITICAL) | ก๊อต decide | 15m | 🟡 conditional on PHP exposure |
| **U4-2** | Send breach-disclosure to PHP customers re: weak `pass_tam()` MD5 hash → reset on first Pacred login | legacy S-2 (CRITICAL) | พี่ป๊อป + เดฟ wording | 2h | 🟡 |
| **U4-3** | Rotate ALL PHP-hardcoded secrets (ThaiBulkSMS / FB OAuth / SMTP / LINE Notify) post-cutover | legacy S-4/S-6 | ก๊อต | 1h | 🟡 |
| **U4-4** | If PHP hosting changes: add `.htaccess` IP allowlist to `api/autorun/` first | legacy S-5 | ก๊อต | 30m | 🟡 conditional |

## U5 — Should-fix (operationally significant; P2-P3)

| # | Task | Source | Owner | Est | Status |
|---|---|---|---|---|---|
| **U5-1** | HS code lookup tool (cached + AI + DOC-validated) — port piloted system from Jan 2026 | chat W-3 | ภูม + ก๊อต ADR for AI provider | 6-8h | 🟢 P2 |
| **U5-2** | LINE OA lead routing (keyword + service-slug aware first-touch attribution) | chat L-7 | ภูม | 4-5h | 🟢 P2 |
| **U5-3** | Customer-phone search in admin → owner + last contact lookup | chat W-6 | ภูม | 2h | 🟢 P2 |
| **U5-4** | Lalamove dispatch tracking field per shipment | chat W-8 | ภูม | 1h | 🟢 P2 |
| **U5-5** | Customer slip-upload UX (drag-drop + auto-OCR optional) | chat customer pains | ปอน + ภูม | 4h | 🟢 P3 |
| **U5-6** | VAT rebalancing calculator for ใบขนพ่วง (niche staff tool) | chat W-7 | ภูม | 4h | 🟢 P3 |
| **U5-7** | Cross-rep customer attribution dashboard | chat L-7 | ภูม | 3h | 🟢 P3 |
| **U5-8** | LP-1 Phase D shipping rates table UI (port `tb_rate_g_*` / `tb_rate_vip_*` / `tb_rate_custom_*`) | legacy audit §6 + Phase D plan | ภูม | 4-6h | 🟢 P2 |
| **U5-9** | LP-2 TOS acceptance gate modal on login if version mismatch | legacy audit | ภูม | 2h | 🟢 P3 (blocked on TOS legal text) |
| **U5-10** | LP-3 LINE Login OAuth (real, not stub) | legacy audit | ก๊อต Supabase OIDC + ภูม wire | 3-4h | 🟢 P2 |

## Cross-links

- Each U* item must reference its audit source line (chat L-N or legacy §N)
- ภูม picks U1 first (cargo-loop-critical), then U2 (ops efficiency), then U5 (P2 backlog)
- ก๊อต handles U1-9, U3-5, U3-6, U4-* (security + cleanup gates)
- เดฟ handles U1-1, U3-1..U3-3 (status page + cleanup execution)
- ปอน handles U2-2, U5-5 surfaces only (frontend)

**End of Part U.** Each ✅ shipped → tick off in this table + add to team-status doc + commit `docs(port-plan,team): U-N shipped — <description>`.

---

# 🔬 Part V — Legacy Cargo Forensics → revenue-ready backlog (2026-05-16)

> **Source:** [`docs/audit/cargo-ops-forensics-2026-05-16.md`](audit/cargo-ops-forensics-2026-05-16.md)
> — decoded from the ไอแต้ม (legacy system developer) LINE chat + 10 real
> China-cargo spreadsheets เดฟ handed over (invoices · packing lists · Form E ·
> D/O letter · warehouse loading manifests). That doc is the **why**; this Part
> is the **schedule**.
>
> Revenue lens: 🔴 = unblocks cargo revenue now · 🟠 = daily ops pain · 🟡 = fix soon.
> Default owner = ภูม (cargo backend). Each task keeps its forensics ID (A1…F3).

## V-A — Money & accounting integrity

| # | Task | Owner | Rev | Status |
|---|---|---|---|---|
| V-A1 | Payment record stores the **slip transfer time** (editable + audited) — not the approval-click time | ภูม | 🟠 | ⬜ |
| V-A2 | Order/payment **status rollback** with reason + audit row — staff self-serve, no dev (ADR-0014) | ภูม | 🔴 | ⬜ |
| V-A3 | Payment↔order **reconciliation** — a matched slip auto-clears "เครดิตค้างนำเข้า"; mismatch surfaced to staff | ภูม | 🔴 | ⬜ |
| V-A4 | Rate-entry **validation** — exchange/price rate range-guarded; block the "เรทเบิ้ล" (doubled-rate) class of error | ภูม | 🟠 | ⬜ |
| V-A5 | **Manual adjustment line** on an invoice (±amount, reason, audited) — ends the per-cent dev tickets | ภูม | 🟡 | ⬜ |
| V-A6 | **Withholding-tax model** — invoice gross → WHT 1%/3% → net paid; receipt issuance **gated on WHT-certificate (50 ทวิ) upload**. Design = [ADR-0015](decisions/0015-withholding-tax-model.md) (🟡 DRAFT — ก๊อต to lock); pairs w/ ADR-0006 + migration 0034 | ภูม impl · ก๊อต lock ADR-0015 | 🔴 | ⬜ |
| V-A7 | Receipt-number cleanup — one canonical number, drop the error-prone `-N` suffix | ภูม | 🟡 | ⬜ |
| V-A8 | Accounting export reconcilable with **ภพ.30** (sales-tax report = filed VAT return) | ภูม | 🟡 | ⬜ |

## V-B — Self-serve reports

| # | Task | Owner | Rev | Status |
|---|---|---|---|---|
| V-B1 | Admin report screens (zero dev tickets): pending-import payments · credit-pending imports · containers awaiting TH warehouse · debtors · refunds issued · month's orders — CSV export each | ภูม | 🟠 | ⬜ |

## V-C — Order-lifecycle flexibility

| # | Task | Owner | Rev | Status |
|---|---|---|---|---|
| V-C1 | **Post-lock refund** path — refund over-collected shipping when the carrier changes after "preparing to ship" | ภูม | 🔴 | ⬜ |
| V-C2 | Bill-header (buyer name) **editable by staff**, audited | ภูม | 🟠 | ⬜ |
| V-C3 | "ตัดตู้" UX — enforce + explain the container close-date (วันที่ปิดตู้) before assigning parcels | ภูม | 🟠 | ⬜ |

## V-D — Container & volume integrity (revenue-critical)

| # | Task | Owner | Rev | Status |
|---|---|---|---|---|
| V-D1 | Store CBM **per source** (received / queue / manifest) on `cargo_shipments`; surface the diff to staff **before billing** (real case GZE260422-1: 16.79 vs 21.28) | ภูม | 🔴 | ⬜ |
| V-D2 | One **canonical cargo-type enum**; map both legacy sets (API `A/M/X/O/Z` + manifest `G/T/F`) onto it | ภูม | 🟠 | ⬜ |
| V-D3 | Link the Pacred container code ↔ the carrier's physical container number | ภูม | 🟡 | ⬜ |
| V-D4 | Split-receipt expected-vs-received box count — migration 0037 (U1-5) schema ✅; wire the UI | ภูม | 🟠 | ⬜ |

> 📐 **Schema spec for V-D1/D2/D3** → [`docs/port-specs/cargo-volume-reconciliation.md`](port-specs/cargo-volume-reconciliation.md) — เดฟ prep (proposed columns + canonical cargo-type enum + legacy mapping); ภูม implements + finalises.

## V-E — Freight (FCL/LCL) document suite — net-new (Phase I2)

| # | Task | Owner | Rev | Status |
|---|---|---|---|---|
| V-E1 | Commercial **Invoice + Packing List** generator — ✅ V1 SHIPPED 2026-05-17 (commit 6478efe). freight_shipments + parties + invoices + lines + 14 admin actions + admin list/new/detail + V-E6 convert wired. PDF generators + customer portal = V-E1.1 follow-up. | ภูม | 🟠 | ✅ V1 |
| V-E2 | Freight **value model** — `real_value` vs `declared_value` vs `vat_plan` ("แผน VAT" 1/2/…); VAT 7% on the declared figure. Design = [ADR-0016](decisions/0016-freight-value-model.md) (🟡 DRAFT — ก๊อต to lock) | ภูม impl · ก๊อต lock ADR-0016 | 🟠 | ⬜ |
| V-E3 | **Form E** (ASEAN-China FTA Certificate of Origin) generator — 12-box form, HS code, origin criterion | ภูม | 🟡 | ⬜ |
| V-E4 | **D/O exchange letter** generator (sea) — B/L no, vessel/voyage, container no, telex-release wording | ภูม | 🟡 | ⬜ |
| V-E5 | Range-guard **every numeric import** — legacy invoice sheets carry int32-overflow garbage (`-2146826xxx`) | ภูม | 🟡 | ⬜ |

> 📐 **Schema + generation spec for V-E1/E3/E4** → [`docs/port-specs/freight-document-suite.md`](port-specs/freight-document-suite.md) — เดฟ prep (the `freight_*` tables + Invoice/PL · Form E · D/O generators); value/VAT math in [ADR-0016](decisions/0016-freight-value-model.md).

## V-E6..V-E12 — Freight expansion (NEW from deep-sweep 2026-05-16)

> Discovered in deep-sweep of PHP `pcs-admin/include/pages/{home/Freight, home/CargoAndFreight, hs-forwarder-invoice, forwarder-quotation, closingAccReportForwarder, withdraw-commission-*}` — 12 subdirs the prior audits never explored. Full inventory + new tables → [`docs/audit/php-deep-sweep-2026-05-16.md`](audit/php-deep-sweep-2026-05-16.md) §5. All Phase I2 — post-Monday-launch.

| # | Task | Owner | Rev | Status |
|---|---|---|---|---|
| V-E6 | **Quotation workflow** — ✅ V1 SHIPPED 2026-05-17 (commit a0c9c78). freight_quotes + items + 7-state workflow + 11 admin actions + admin list/new/detail UI + audit timeline. Convert-to-shipment stub (V-E1 dep). Customer portal + PDF deferred to V-E6.1. 📐 spec [`port-specs/freight-quotation.md`](port-specs/freight-quotation.md). | ภูม | 🟠 | ✅ V1 |
| V-E7 | **Receipt & payment tracking** — payment ledger w/ withholding-tax + RD Code 86. Schema `freight_invoices` + `freight_invoice_lines` + `freight_invoice_payments` (was `tb_receipt*`). 📐 spec → [`port-specs/freight-receipt-and-payment.md`](port-specs/freight-receipt-and-payment.md). PHP ref `closingAccReportForwarder/` + receipt PDF | ภูม | 🟠 | ⬜ |
| V-E8 | **Commission withdrawal** — interpreter (ล่าม) + sales rep. Schema `commission_tiers` + `commission_accruals` + `commission_withdrawals` + `commission_withdrawal_items` (was `tb_withdraw_comm_*`). Includes WHT 15% on >5k payments per Thai law (Revenue Code §50). 📐 spec → [`port-specs/commission-withdrawal.md`](port-specs/commission-withdrawal.md) (covers V-E8 + V-H1 + V-H2 combined). PHP ref `pages/withdraw-commission-{interpreter,sale}/` | ภูม | 🟠 | ⬜ |
| V-E9 | **Monthly closing ritual for forwarder accounting** — `accounting_periods` with status=open|pending_close|closed + frozen-via-trigger; read-only past periods. 📐 spec → [`port-specs/freight-monthly-closing.md`](port-specs/freight-monthly-closing.md). PHP ref `closingAccReportForwarder.php` (32KB) | ภูม | 🟠 | ⬜ |
| V-E10 | **QA/QC intake inspection** — pre-billing gate; checklist (damage / missing / quality); pass→release, fail→rework. Schema `freight_qa_inspections` (was `tb_check_forwarder`). 📐 spec → [`port-specs/freight-qa-qc-inspection.md`](port-specs/freight-qa-qc-inspection.md). PHP ref `pages/forwarder-check/` | ภูม | 🟡 | ⬜ |
| V-E11 | **Customs declaration UI (ใบขนสินค้า)** — internal-only V2 (no Thai Customs API integration yet — Phase III). Schema `freight_customs_declarations` + lines. 📐 spec → [`port-specs/freight-customs-declaration.md`](port-specs/freight-customs-declaration.md) | ภูม | 🟡 | ⬜ |
| V-E12 | **CargoAndFreight role dashboards** — 7 per-role dashboards (Super · Accounting · Warehouse · SalesAdmin · Driver · Interpreter · Ops fallback) via single-route dispatch. 📐 spec → [`port-specs/cargo-and-freight-dashboards.md`](port-specs/cargo-and-freight-dashboards.md). PHP ref `pages/home/{CargoAndFreight,Freight}/` (mostly placeholder; Pacred build largely net-new) | ภูม + ก๊อต | 🟡 | ⬜ |

## V-G — Admin bulk ops + workflow polish (NEW from deep-sweep)

| # | Task | Owner | Rev | Status |
|---|---|---|---|---|
| V-G1 | **Bulk forwarder actions** — multi-shipment status update / driver assignment / cancel. 📐 spec → [`port-specs/admin-polish-bundle.md`](port-specs/admin-polish-bundle.md) §V-G1. PHP ref `forwarder-action.php` | ภูม | 🟡 | ⬜ |
| V-G2 | **Bulk transfer customers to sales rep** — currently per-customer only at `/admin/customers/[id]/transfer-rep`. 📐 spec → [`port-specs/admin-polish-bundle.md`](port-specs/admin-polish-bundle.md) §V-G2. PHP ref `transferSalesCustomers.php` | ภูม | 🟡 | ⬜ |
| V-G3 | **Admin push broadcast (popup)** — admin send notifications TO users via ad-hoc UI; currently only via custom server actions. 📐 spec → [`port-specs/admin-polish-bundle.md`](port-specs/admin-polish-bundle.md) §V-G3. PHP ref `popup.php` | ภูม | 🟡 | ⬜ |
| V-G4 | **Cargo TOS version management UI** — ✅ V1 SHIPPED 2026-05-17 (commit c0af160). tos_versions + tos_acceptances tables + /admin/settings/tos-versions admin UI (create/edit/activate/per-version acceptance count). V1 = backend management only; customer gate still reads CURRENT_TOS_VERSION from lib/tos.ts (V-G4.1 wires DB read). | ภูม | 🟡 | ✅ V1 |
| V-G5 | **Organization 5 contact CRUDs** — ✅ V1 SHIPPED 2026-05-17 (commit 8befff5). org_contacts table + /admin/settings/contacts (tabs per kind). V1 = backend management only; customer-side wire to footer + JSON-LD = V-G5.1 follow-up. | ภูม | 🟢 | ✅ V1 |
| V-G6 | **New admin reports** — ✅ SHIPPED 2026-05-17 (commit fe6d013). 4 routes: /admin/reports/{forwarder-volume, sales-by-rep, hs-code-revenue, user-sales-history[/[customer_id]]}. All pure SELECT, period filter, CSV export. Zero schema changes. | ภูม | 🟡 | ✅ |
| V-G7 | **Audit feature-parity verifications** — ✅ ALL 6 SHIPPED 2026-05-17. Bundle: [`parity-hs-customrate`](audit/parity-hs-customrate.md) · [`parity-forwarder-driver`](audit/parity-forwarder-driver.md) · [`parity-settings-vip`](audit/parity-settings-vip.md) · [`parity-admin-table`](audit/parity-admin-table.md) · [`parity-time-attendance`](audit/parity-time-attendance.md) · [`parity-admin-profile`](audit/parity-admin-profile.md). 5/6 = 🟢 covered, 1/6 = 🟡 partial (admin-profile self-service gap → V-G9 follow-up). | ภูม | 🟢 | ✅ |

## V-H — Role models for commission (NEW from deep-sweep)

| # | Task | Owner | Rev | Status |
|---|---|---|---|---|
| V-H1 | **Interpreter (ล่าม) role** — extend `admins.role` enum + commission accrual per-job + withdrawal workflow + WHT calc. 📐 spec → [`port-specs/commission-withdrawal.md`](port-specs/commission-withdrawal.md) (combined w/ V-E8 + V-H2). PHP ref `withdraw-commission-interpreter/` + `tb_set_comm_interpreter` lookup | ก๊อต confirms RBAC → ภูม | 🟠 | ⬜ |
| V-H2 | **Sales rep commission finalize** — currently partial via `team_leaders` + `/admin/sales-payouts`. Add: approval workflow detail, rejection_reason, slip upload, WHT math. 📐 spec → [`port-specs/commission-withdrawal.md`](port-specs/commission-withdrawal.md). PHP ref `withdraw-commission-sale/` | ภูม | 🟠 | ⬜ |

> 📐 **Spec docs shipped (เดฟ night-5):**
> - **Freight stack (V-E):** V-E6 quotation · V-E7 receipt+payment · V-E8/H1/H2 commission · V-E9 monthly closing · V-E10 QA/QC · V-E11 customs declaration · V-E12 role dashboards
> - **Admin polish (V-G):** V-G1..V-G7 combined in [`admin-polish-bundle.md`](port-specs/admin-polish-bundle.md)
> - **Tooling/setup:** [`docs/setup/line-liff-create-guide.md`](setup/line-liff-create-guide.md) — DV-2 LIFF Console step-by-step
>
> All 8 specs in [`docs/port-specs/`](port-specs/) + [`docs/setup/line-liff-create-guide.md`](setup/line-liff-create-guide.md) ready for ภูม Monday pickup. Estimated total V2 long-phase: ~150-200h freight stack (V-E6+) + ~32-40h admin polish (V-G).
> 📋 **Full inventory + 17 new tables + false-alarm filter** → [`docs/audit/php-deep-sweep-2026-05-16.md`](audit/php-deep-sweep-2026-05-16.md).

## V-F — Strategic / dependency

| # | Task | Owner | Rev | Status |
|---|---|---|---|---|
| V-F1 | Migration burn-down to remove the **ไอแต้ม single-point-of-failure** (China product API + server + SMS all bill through one freelancer) — tracked in [`runbook/legacy-cutover-tracker.md`](runbook/legacy-cutover-tracker.md) (8 dependencies, F1-1…F1-8) | เดฟ + ก๊อต | 🔴 | 🏗 |
| V-F2 | PEAK / ERP accounting-export API (follows V-A8) | เดฟ | 🟡 | ⬜ |
| V-F3 | Legacy-infra resilience — fragile 3rd-party server, pay-or-die; cut over before any contract lapse | ก๊อต | 🟡 | ✅ review [`audit/v-f3-legacy-infra-resilience-2026-05-16.md`](audit/v-f3-legacy-infra-resilience-2026-05-16.md) by เดฟ; ก๊อต confirms legacy retirement date |

## V-ADM1 — Admin UI polish (เดฟ instruction, 2026-05-16)

ภูม: small `/admin` theme cleanup so the back office matches the rest of the app —
- **remove the right-hand sidebar** entirely;
- **left sidebar → white background** (`bg-white dark:bg-surface`);
- every other surface → adopt the **same theme tokens** as the public site + customer portal (`bg-surface` / `text-foreground` / `border-border` — no admin-only palette);
- apply the public/customer **body background** (the radial red-cloud gradient in [`app/globals.css`](../app/globals.css)) to `/admin` too.

Full hand-off + acceptance criteria → [`docs/briefs/poom.md`](briefs/poom.md).

## Cross-links

- The **why** behind every V task → [`docs/audit/cargo-ops-forensics-2026-05-16.md`](audit/cargo-ops-forensics-2026-05-16.md) §4-5
- Schema spine for V-D* → [`docs/architecture/container-centric-model.md`](architecture/container-centric-model.md)
- V-A6 WHT pairs with → [`docs/decisions/0006-tax-invoice-flow.md`](decisions/0006-tax-invoice-flow.md) + migration `0034`
- Audit-row pattern for V-A2 / V-C* → [`docs/decisions/0014-customer-self-service-state-transitions.md`](decisions/0014-customer-self-service-state-transitions.md)
- Permanent decoded model → [`docs/learnings/pacred-domain-knowledge.md`](learnings/pacred-domain-knowledge.md)

**End of Part V.** Each ✅ shipped → tick the table + commit `docs(port-plan): V-N shipped — <description>`. New cargo-forensics findings → append rows here, never rewrite history.

---

# 🕳 Part W — Gap-hunt backlog (2026-05-17)

> **Source:** the 5-angle source-code gap-hunt + the chained synthesis in
> [`docs/research/PACRED-MASTER-STRATEGY.md`](research/PACRED-MASTER-STRATEGY.md)
> — read that doc for the **why** (the 4 chains: the P0 security keystone, the
> wallet-leak chain, the "islands with no bridges" theme). This Part is the
> **schedule**: every genuinely *unplanned* `G-*` finding across the 5 gap docs,
> **deduped** against `R-1..R-19` ([`docs/research/PACRED-GAP-ANALYSIS.md`](research/PACRED-GAP-ANALYSIS.md))
> and Part V (`V-A..V-H`), consolidated into one ranked list.
>
> Revenue/launch lens: 🔴 = launch-week or post-launch P0 · 🟠 = post-launch P1 ·
> 🟡 = post-launch P2/P3. Effort: **S** ≤3 d · **M** 1–2 wk · **L** 2–4 wk.
> Owner TBD — assign at planning. Each row keeps its gap-doc source IDs.

## W-1..W-8 — ranked backlog

| # | What | Why | Sev | Effort | Depends on | Launch-blocker | Source |
|---|---|---|---|---|---|---|---|
| **W-1** | **Security keystone** — role-pin every money/PII/order RLS policy (`is_admin(array[...])`, never bare); add `requireAdmin([roles])` to the 11 ungated finance pages; make the `createAdminClient` ownership check un-skippable via a `lib/` helper; add a DB-level money-mutation audit trigger | Money is reachable (read), movable (write) + un-attributed: a low-trust `driver`/`warehouse` admin JWT passes RLS to every wallet/order/tax table, the finance pages have no page gate, and direct PostgREST writes leave no `admin_audit_log` row | 🔴 P0 | M | none | **YES — launch-week** (before any `warehouse`/`driver` account) | sec S-1·S-2·G-6 · admin H-1·H-2·H-7 |
| **W-3** | **Wallet-integrity guard** — add `freight_invoice` to `wallet_transactions.reference_type` CHECK + a real debit in `recordFreightPayment`; sum **pending+completed** debits in every balance check; add a status-transition guard to `adminUpdateYuanPayment` + fire the refund credit for a *completed* wallet-tx; atomic non-negative-balance mechanism (`SELECT … FOR UPDATE` in a DB fn, not a naive CHECK) | One bug class leaking money: freight wallet-pay flips invoice `paid` with no debit; stacked pending debits overdraw to negative; yuan refund→re-completed never re-debits | 🔴 P0/P1 | M | none | **YES — launch-week** (H-1 overdraw exploitable once withdraw+yuan live) | sec G-3·S-5 · customer H-1 · rev-flow H-1·H-2 |
| **W-2** | **Wire the flow** — unify the 2 container tables (`cargo_containers` canonical, migrate `containers`, repoint `forwarders.container_id`, redirect `/admin/containers`); propagate container status onto `forwarders`/`service_orders` via a documented enum; arrival→billing gate (block `mark*Paid` until container-no + final CBM confirmed); freight `quote.convert`→shipment + `markDelivered`→invoice wiring + `freight_invoices` partial-unique index; order auto-close action + trigger | Pacred-web is correct islands with no edges: container `delivered` never closes the order, the customer portal reads a frozen status, freight jobs reach `delivered` un-billed, no order ever auto-closes — the legacy "ของอยู่ไหน" leak rebuilt inside Pacred. Precondition for `R-1` having value | 🟠 P1 | L | container-unify must precede `R-1`/`R-10` | No (post-launch P0 first wave) | rev-flow Stages 4·6·7·9 · admin H-3 |
| **W-4** | **MOMO JMF sync made runnable** — fill the `sync.ts` upsert loop, add `app/api/cron/momo-jmf-sync/route.ts`, add the 7th `vercel.json` cron, capture the real `?api=` endpoint names | `lib/integrations/momo-jmf/` has a typed client but the sync body is a stub with **zero callers and no cron** — it cannot run at all; every container is hand-typed. MOMO is Pacred's only digital container-status source | 🔴 P0 | L | the `?api=` endpoint capture + the MOMO-1 call | No (manual entry covers launch; P0 immediately after) | integrations G-1 |
| **W-5** | **Refund money path** — one credit-writing action (`kind='refund'`) covering cancel-after-paid, yuan refund of a *completed* payment, carrier-change over-collection (`V-C1`); plus a customer-facing claim/issue entry ("ตกหล่น" — type, photos, status lifecycle) that can link an `R-9` warehouse discrepancy row | Statuses say "refunded" while no money moves; cancelling a paid order orphans the wallet debit; customers have no channel but LINE to report a missing/damaged item or request a refund | 🟠 P1 | M | `V-C1`; loosely `R-9` | No | rev-flow H-3 · admin G-6 · customer G-C2 |
| **W-6** | **Admin supervisory layer** — audit-log search/filter/export + per-target history; staff RBAC console (capability view, section scoping, `super`-holder review); notification delivery log; admin global search (customer / h_no / f_no / container); cron-health panel; bulk-action failed-id summary rows | The admin can write money but nobody can answer "who changed this / can I trust the team with RLS-bypass UI"; `admin_audit_log` is write-only with no query UI; `super` proliferation has no review surface; failed LINE pushes vanish silently | 🟠 P1 | M | pairs with W-1 (audit trigger) | No | admin G-1·G-2·G-5·G-7·G-9·H-5·H-6 |
| **W-7** | **Customer credit line (เครดิตสินค้า / "pay later")** — `profiles.credit_limit` + a credit-charge ledger kind + a credit-outstanding view + a "pay my credit" action + an admin grant/limit + aging screen | `wallet.credit_balance` + the `/wallet` "เครดิต — วงเงินเครดิตจาก Pacred" card are rendered but **no code earns, grants, or spends credit** — the largest customer-facing dead surface; the legacy portal had a real credit line as a repeat-importer retention lever | 🟠 High | L | a small ADR (eligibility + limit rules + overdue handling); feeds `R-7` | No | customer G-C1 |
| **W-8** | **Freight WHT gate + per-container cost basis** — add `freight_invoice_id` to `withholding_tax_entries` + relax the XOR CHECK so `getFreightReceiptGate` stops being a permanent no-op; add a `container_costs` carrier-rate-card table (cost per cabinet × cargo type) | A juristic freight customer can pull a receipt with no 50-ทวิ cert on file (the ADR-0015 control simply does not exist for freight); Pacred has no record of what a container *cost* it → margin-blind on the cargo side; feeds `R-7` | 🟠 P1 | M | feeds `R-7` (which must be 2 tables: rate card + AP ledger) | No | sec G-1·G-4 · rev-flow Stage 8 |

## W-9+ — Tier 2 tail (post-launch P2/P3)

Lower-severity unplanned items; schedule interleaved with `R-3..R-19`. Grouped by source doc — see [`PACRED-MASTER-STRATEGY.md` §4.2](research/PACRED-MASTER-STRATEGY.md) and the per-doc detail:

- **Customer** ([`gap-customer.md`](research/gap-customer.md)) — G-C3 delivery-acknowledgement ("ยืนยันรับสินค้าครบถ้วน"); G-C4 tax invoice for ฝากโอน (yuan); G-C5 per-shipment forwarding-instruction recap; G-C6 pre-payment self-service order edit; H-2/H-3/H-4/H-6 wallet-tx + order lifecycle UX (post-debit-failure visibility, customer cancel of a pending deposit/withdraw, stray-`cancelled`-order cleanup, slip-rejection-with-reason loop); H-5 `how-to-use` stub content.
- **Admin** ([`gap-admin.md`](research/gap-admin.md)) — G-3 ops-facing container cost-entry; G-4 view-as-customer / session tools; G-8 export hub + scheduled reports; G-10 editable business config (OTP TTL, min-deposit, feature flags, cashback %); H-4 widen the reconcile `kind` match.
- **Integrations** ([`gap-integrations-tools.md`](research/gap-integrations-tools.md)) — G-3 resolve the hCaptcha prod-fail-mode doc contradiction (decide **before** the launch checklist); G-4 clear the 2 Sentry deprecation warnings; G-5 webhook-receiver harness (`app/api/webhooks/`, signature-verifying); G-6 real ship-tracking feed (vs the hand-typed `vessel_voyage` string); G-7 PEAK; G-8 NetBay; G-9 fuel-cost calculator; G-10 Customs Trader Portal; G-11 driver/warehouse scan + capacity layer; G-13 flag (do NOT scrub) the dead legacy carrier env stubs.
- **Schema/security** ([`gap-schema-security.md`](research/gap-schema-security.md)) — S-3 rate-limit `confirmPasswordResetByPhone` (+ `confirmPhoneChange`, `registerPersonal`); S-4 add an edge route-protection check in `proxy.ts`; S-6 IP/global cap on `requestOtp` (SMS-cost abuse); S-7 `admins` default-deny guard test; S-8 transactional money-audit insert; G-5 yuan-refund / cancel slip+reason parity; G-7 audit-log retention column + `tax_id` DBD-verification gate before tax-invoice issuance.

> **Dedup.** `gap-revenue-flow`'s own `W-1..W-8` numbering is folded into the
> Part W ids above (its container/propagation/billing items ⇒ **W-2**; its
> deposit/refund items ⇒ **W-3**+**W-5**; its yuan-guard/orphan-report ⇒
> **W-3**+**W-6**). Items already in `R-1..R-19` / `V-A..V-H` are **not**
> re-listed here — Part W is strictly the *delta* the 5 gap-hunts found.

## Cross-links

- The **why** + the 4 chains + phasing → [`docs/research/PACRED-MASTER-STRATEGY.md`](research/PACRED-MASTER-STRATEGY.md)
- The earlier `R-1..R-19` roadmap this extends → [`docs/research/PACRED-GAP-ANALYSIS.md`](research/PACRED-GAP-ANALYSIS.md)
- Pacred-identity guardrail (legitimate-path-only — load-bearing) → [`docs/research/PACRED-GAP-ANALYSIS.md`](research/PACRED-GAP-ANALYSIS.md) §4
- Security audits W-1 corrects → [`docs/audit/owasp-2026-05.md`](audit/owasp-2026-05.md) · [`docs/audit/rls-and-audit-log-2026-05-16.md`](audit/rls-and-audit-log-2026-05-16.md)

**End of Part W.** Each ✅ shipped → tick the table + commit `docs(port-plan): W-N shipped — <description>`. New gap-hunt findings → append rows here, never rewrite history.

