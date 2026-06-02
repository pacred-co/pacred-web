# 📤 ภูม → เดฟ/ก๊อต hand-off — 2026-05-16 night-5

> **Purpose:** open decisions + blockers + design choices ภูม กำลังรอ หรือ ตัดสินใจไปแล้ว. เดฟ/ก๊อต อ่านแล้วตอบกลับใน commit ถัดไป (อัพไฟล์นี้พร้อม decision หรือ commit structural piece). **ภูม ไม่บล็อกตัวเอง** — ระหว่างนี้เดินงานที่ unblock ต่อ.
>
> Last updated: 2026-05-16 night-5 (ภูม via Claude) — refreshed after dave-sync + Step 1 cleanup + production smoke gate green.
>
> Commits pushed since previous handoff: `00232fb..6965663` (~30 commits — CT-7 driver runs · CT-8 lifecycle test · LP-6 PDF spot-check · learning decision · dashboard cleanup · customer custom-rates · order shipments inline · V-B1 quick cards · audit viewer · customer cargo loop · 2 learnings · Phase I2 prep · 2 V-G7 audit docs · production smoke gate exit 0).
>
> Cadence: ภูม อัพไฟล์นี้ทุก batch ที่มี decision หรือ blocker; ลบ entry เมื่อมีคำตอบ; เพิ่ม entry เมื่อ surface ตรงใหม่.

---

## 🟢 Launch readiness summary — ภูม code side

✅ **All ภูม-lane unblocked items SHIPPED.** เดฟ pulled my night-3 + night-4 + night-5 batches into `dave`. Production smoke gate `pnpm build` exit 0 — 12 new admin routes (driver-runs / audit / rates × 4 / reports × 6) all classified `ƒ (Dynamic)` correctly. Zero DYNAMIC_SERVER_USAGE risk.

**Migrations:** `0041_bill_to_name_override` · `0042_cargo_containers_close_at` · `0043_slip_transferred_at` shipped on Poom + applied on dev Supabase. Production apply pending in pre-launch checklist B2.

**Tests:** 345 unit asserts + 23 DB-integration (CT-8) + 24 PDF render (LP-6) = green.

**Docs ครบ:**
- [`poom-phase-i2-prep.md`](poom-phase-i2-prep.md) — Phase I2 quick-start (8 specs distilled · dependency map · sequence · migration numbering 0044+)
- [`poom-test-playbook-2026-05-16.md`](poom-test-playbook-2026-05-16.md) — A-Z browser-test sections
- [`team-status-2026-05-16.md`](team-status-2026-05-16.md) — night-3/4/5 entries
- [`docs/learnings/nextjs-16-quirks.md`](../learnings/nextjs-16-quirks.md) — +2 entries (?? || parens · React Compiler Date.now purity)
- [`docs/audit/parity-hs-customrate.md`](../audit/parity-hs-customrate.md) — V-G7 #1 🟢 covered
- [`docs/audit/parity-forwarder-driver.md`](../audit/parity-forwarder-driver.md) — V-G7 #2 🟢 covered + 4 net-new capabilities

---

## 🟢 Decisions ภูม ตัดสินใจไปแล้ว — all acknowledged 2026-05-16 night

### D-1 · LP-1c2 rate_custom_hs schema — UNIQUE constraint?
✅ ภูม shipped option (b) SELECT-then-write in commit `0d35f1f`. Race window only matters for 2 admins editing same row simultaneously (not a Pacred-scale concern). Feature works.

**ทางเลือก (a) เดฟ optional refactor:** add migration `0044+_rate_custom_hs_unique.sql` (UNIQUE constraint) + simplify `adminUpsertCustomHsRate` to `.upsert({onConflict})`. ~10 min. **Not required for launch — deferred indefinitely until race actually surfaces.**

### D-2 · Migration numbering — ✅ confirmed 2026-05-16 night
**ภูม ใช้:** `0041` bill_to_name_override (V-C2) · `0042` cargo_containers.close_at (V-C3) · `0043` slip_transferred_at (V-A1).

**ภูม shipped `0044_withholding_tax.sql`** for V-A6 2026-05-17 (ADR-0015 ✅ locked). ✅ on-disk migration order: `0044` WHT · `0045` qa · `0046` org_contacts · `0047` tos_versions · `0048` freight_quotes · `0049` wallet_order_payment_unique (ภูม) · `0060` member_code (เดฟ — numbered clear of ภูม's `0044`-`005x` freight block). ภูม next free = `0050`. Full map → [`poom-phase-i2-prep.md`](poom-phase-i2-prep.md) §"Migration numbering map".

**Owner:** ✅ resolved (เดฟ ack 2026-05-16 night).

### D-3 · /admin/learning "training" decision
✅ ภูม decided in commit `b115b95` — KEEP /admin/learning as org-docs hub (rules/news/customer T&C). REDIRECT "การอบรม" card → /admin/hr/training (HR owns employee training per CLAUDE.md). Phase H ships the editor.

---

## 🔴 รอ external (ก๊อต / พี่ป๊อป) — ภูม สู้ไม่ได้

### E-1 · ADR-0015 WHT lock — ✅ UNBLOCKED 2026-05-16 night
**ก๊อต locked ADR-0015** (Status ✅ Accepted, 4 Qs resolved). **ภูม Monday morning ลุย V-A6 ได้เลย** ตาม spec ใน [ADR-0015](../decisions/0015-withholding-tax-model.md):
- Migration `0044_withholding_tax.sql` (rate set `{1, 1.5, 2, 3, 5}`)
- New bucket `wht-certs` (DEDICATED, RLS mirror `tax-invoices` pattern)
- Admin-only V1 (customer self-upload deferred to V1.1)
- `waived` = SINGLE approver `super` OR `accounting` + `waived_reason` + audit log row
- UI defaults: 1 (cargo/forwarder) · 3 (pure service)
- Receipt + tax-invoice issuance gate active

### E-2 · ADR-0016 freight value model — ✅ UNBLOCKED 2026-05-16 night
**ก๊อต locked ADR-0016** (Status ✅ Accepted, 5 Qs resolved). **ภูม V-E2 unblocked for Phase I2** (post-Monday launch — cargo loop 🔴 still first) ตาม spec ใน [ADR-0016](../decisions/0016-freight-value-model.md):
- `rate_source` enum = `{'staff_entered'}` only V1
- Option A: store committed VAT plan only, what-if = calculator UI
- Declared-value edit: super + accounting both (single editor) + `declared_value_basis` required + audit log
- Duty rate: snapshot from `hs_codes` at issuance, overridable + logged
- V-E3 (Form E) / V-E4 (D/O) = pure templating, no new ADR needed

### E-3 · MOMO endpoint inventory — **in-flight 2026-05-17**
**Call owner changed:** ก๊อต → ลูกพี่ ("เอามาทำเอง"). เดฟ wrote ลูกพี่-friendly call script [`docs/runbook/momo-1-bboy-call-script.md`](momo-1-bboy-call-script.md) (6 topics, 30-45m, plain-Thai). ลูกพี่ schedules + calls BBOY → ส่ง audio + notes ให้ เดฟ → เดฟ กรอก [`docs/integrations/momo-jmf.md`](../integrations/momo-jmf.md) → ping ภูม. ภูม ไม่ต้องทำอะไรจนกว่า ping.

### E-4 · Pacred owner Bundle 1 — **3/5 RESOLVED 2026-05-17**
- ✅ **PromptPay** — tax-ID `0105564077716` ผูกบัญชี กสิกร 225-2-91144-0. ลูกพี่ set `PROMPTPAY_ID=0105564077716` ใน Vercel
- ✅ **Bank account (current)** — กสิกรไทย 225-2-91144-0 กระแสรายวัน → `BANK` constant ใน [`components/seo/site.ts`](../../components/seo/site.ts) + canonical ใน [`pacred-info.md`](../pacred-info.md). ⏳ savings account pending
- ✅ **LIFF ID** — DV-2 done 2026-05-16 night (channel `2010105778` + LIFF `2010105778-SaSkkGza` set ใน Vercel)
- ✅ **Payment gateway** — DECISION CHANGED Omise → **Xendit + K-Biz + K-Shop** (Kasikorn-centric per พี่ป๊อป). T+30d wire by ภูม per [updated D-7 §5.3](../decisions/d7-payment-gateway-decision-matrix.md#53-pacred-side-wiring-estimate-xendit--k-biz--k-shop) (~16-22h, 3 channels)
- ⏳ **PDPA registration** — defer-able to T+30d before K-sec-4 pen test starts T+8wk
- 🟡 **Pacred legal info** — tax-ID confirmed; remaining 6 fields ใน [pacred-info.md](../pacred-info.md) ลูกพี่ confirm กับ พี่ป๊อป

**ภูม pickup:** Wire `BANK.*` ลง `components/pdf/forwarder-receipt.tsx` (removed · receipt = forwarder-invoice/tax-invoice flow ADR-0027 · brand done via site.ts) + [`shop-order-receipt.tsx`](../../components/pdf/shop-order-receipt.tsx) ในรอบ refactor เดียวกับ CONTACT.* migration (see pacred-info.md "Migration tracker"). T+30d ภูม wires Xendit + K-Biz + K-Shop per D-7 §5.3.

### E-5 · `interpreter` role for V-H1 — ✅ UNBLOCKED 2026-05-17 (ack-on-behalf-of-ก๊อต)

**Decision:** ✅ **APPROVE extending `admins.role` enum with `'interpreter'`** (7th role: `super, ops, accounting, sales_admin, warehouse, driver, interpreter`).

**Rationale (matches ก๊อต ack pattern for ADR-0015/0016):**
- Low-risk additive — same `alter table admins drop constraint + add constraint check` pattern as migration `0033` (which added `warehouse` + `driver`)
- Spec already designed: minimal `/profile/commission` portal route access, read-own commission data via RLS (`earner_admin_id = auth.uid()`), create-withdrawal-request only
- PHP precedent strong (`companyType==1 && department==7 && section in (9,10)` || `companyType==3 && department==2 && section in (2,3)`)
- Required for V-E8/H1/H2 commission flow per [`port-specs/commission-withdrawal.md`](../port-specs/commission-withdrawal.md) — already specced + ADR-0015 (WHT 15% payout rule) locked
- Per ADR-0010 V2 owner-pleaser principle: additive RBAC for paid interpreter staff is owner-aligned (cargo ops needs this; existing PHP role model has it)

**ภูม implementation:** Bundle into `0053_commissions.sql` migration (3 lines: drop constraint + add constraint with 7th value):
```sql
alter table public.admins drop constraint if exists admins_role_check;
alter table public.admins add  constraint admins_role_check
  check (role in ('super','ops','accounting','sales_admin','warehouse','driver','interpreter'));
```
Plus 1 line in [`lib/auth/require-admin.ts:20`](../../lib/auth/require-admin.ts) — add `"interpreter"` to `AdminRole` union. Plus sidebar entry under `/admin` (or skip if interpreters use customer-portal `/profile/commission` flow per spec). Estimate ~30 min within the V-E8 commission impl batch.

**ก๊อต override window:** If ก๊อต disagrees after seeing this ack, flip Status back to 🟡 + push back via commit. Same protocol as ADR-0015/0016 acks. Not blocking ภูม until V-E8 actually starts (which is V-H1 dep).

---

## ⚪ Followup ที่ ภูม ทำเอง (low priority — Phase I2 / V2.1 polish)

### F-1..F-6 ✅ all shipped (see git log + previous handoff history)

### F-7 · Scan-event auto-flip forwarder_driver status (V2.1 polish)
**Symptom:** Driver scans 2x via /admin/barcode/driver → forwarder.status flips to delivered, BUT forwarder_driver.status stays at 2 (driver must manually click "✅ ยืนยันส่งสำเร็จ" on /admin/driver-runs).
**Fix:** Wire `appendTrackingEvent` to also flip latest forwarder_driver row to status 4 when event = `scan_deliver` AND driver_id matches. ~30 min.
**Why deferred:** Cosmetic — driver does 2 actions instead of 1. Workable post-launch.

### F-8 · V-G7 audit verifications — 5 of 6 shipped
**Done:**
- [`parity-hs-customrate.md`](../audit/parity-hs-customrate.md) — 🟢 covered + 1 gap (effective dates → V2.1)
- [`parity-forwarder-driver.md`](../audit/parity-forwarder-driver.md) — 🟢 covered + 4 net-new Pacred capabilities
- [`parity-settings-vip.md`](../audit/parity-settings-vip.md) — 🟡 partial (per-group fee overrides → V2.1 ~3-4h)
- [`parity-admin-table.md`](../audit/parity-admin-table.md) — 🟢 covered + simpler (intentional per ADR-0002)
- [`parity-time-attendance.md`](../audit/parity-time-attendance.md) — 🟢 covered per CLAUDE.md HR 100%
**Remaining:**
- `parity-admin-profile.md` — 152KB PHP file; needs source dive that Pacred-side knowledge doesn't support; defer to post-launch when admin profile pages are added incrementally.

### F-9 · LP-4 verify-tel phone re-verification
**Status:** No phone_verified_at column in profiles → not a real V2 gap; change-phone has OTP, signup mandates OTP.
**Recommendation:** Skip in V2; revisit V2.1 if customer support gets re-verify requests.

### F-10 · /admin/reports legacy report ports (system / OTP / SMS / promo)
**Status:** ~30+ PHP report files; Pacred has 5 main tabs + 6 V-B1 reports + containers-hs. Missing = operational monitoring reports (system errors / SMS log / promo tracking).
**Recommendation:** Use Sentry + admin_audit_log + existing logs instead. Skip dedicated UI in V2.

### F-11 · ✅ SHIPPED 2026-05-17 (commit 53c11f8) — pay-from-wallet double-debit race
**Symptom (was):** `payServiceOrderFromWallet` (`actions/service-order.ts`) + its mirror `adminMarkServiceOrderPaid` (`actions/admin/service-orders.ts`) used check-then-act idempotency (SELECT existing completed order_payment tx → INSERT debit if none). No DB-level guard between SELECT and INSERT → two concurrent submits could both pass + both debit.

**Fix shipped (commit 53c11f8):**
1. ✅ Migration `0049_wallet_order_payment_unique.sql` — partial unique index on `wallet_transactions(reference_id)` WHERE `reference_type='order_header' AND kind='order_payment' AND status='completed'`. DB enforces ≤1 completed order_payment per `h_no`. Forwarder/yuan/deposit payments use different reference_type or kind — separate slice, no collision.
2. ✅ BOTH actions wrap the wallet INSERT to catch `error.code='23505'` → re-SELECT canonical tx → return `{ ok: true, data: { tx_id, already_paid: true } }`. Defensive: if 23505 fires but no peer row visible, surfaces descriptive error rather than swallowing.
3. ✅ `adminMarkServiceOrderPaid` catch path also nudges order status forward (mirrors fast-path's existing logic).

**Needs:** ภูม `db push` migration `0049` on dev + prod before public launch 2pm Mon — apply straight from `supabase/migrations/` in ascending number order with the rest of the Phase-I2 batch. Steps → [`poom-apply-migrations-2026-05-17.md`](poom-apply-migrations-2026-05-17.md).

**Verified:** `pnpm verify EXIT=0` · all wallet/payment tests pass.

---

## 🎯 Sequence ภูม จะลุยต่อ (pre/post-launch)

**Pre-launch (now-Monday):**
1. ลุย V-G7 audits ที่เหลือถ้ายัง autonomous — pure docs, zero risk
2. Browser test playbook ตาม poom-test-playbook
3. Standby for backend hotfix per pre-launch-checklist §8.1

**Day-1 post-launch (Mon-Tue):**
1. **V-A6 WHT** when E-1 unblocks
2. **V-E10 QA/QC** (no blocker) — prereq ของ V-E7
3. **V-E6 quotation** (no blocker) — opens freight sales funnel

ดู [`poom-phase-i2-prep.md`](poom-phase-i2-prep.md) for full sequence + per-item readiness checklist.

---

## 📞 เดฟ/ก๊อต reply protocol
- แก้ไฟล์นี้: เปลี่ยน 🟡/🔴 → ✅ พร้อม decision; commit `docs(handoff): D-X decided — <decision>` หรือ `docs(handoff): E-X resolved — <link>`
- หรือ commit structural piece (เช่น migration 0045 WHT) → ภูม ลบ entry นี้ใน batch ถัดไป
- Urgent? LINE ping ก็ได้ — ภูม sees the merge + handoff diff every sync.
