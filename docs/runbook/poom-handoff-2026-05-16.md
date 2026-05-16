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

## 🟡 Decisions ที่ ภูม ตัดสินใจไปแล้ว (พี่เดฟ/ก๊อต acknowledge or override)

### D-1 · LP-1c2 rate_custom_hs schema — UNIQUE constraint?
**Status:** ✅ ภูม shipped option (b) SELECT-then-write in commit `0d35f1f`. Race window only matters for 2 admins editing same row simultaneously (not a Pacred-scale concern). Feature works.

**ทางเลือก (a) เดฟ optional refactor:** add migration `0044+_rate_custom_hs_unique.sql` (UNIQUE constraint) + simplify `adminUpsertCustomHsRate` to `.upsert({onConflict})`. ~10 min. **Not required for launch.**

### D-2 · Migration numbering — ภูม ครอง 0041-0043
**Status:** ภูม locked 0041/0042/0043 for V-C2/V-C3/V-A1.
**เดฟ to take 0044+** for WHT migration (post-ก๊อต-lock-ADR-0015).
See [`poom-phase-i2-prep.md`](poom-phase-i2-prep.md) "Migration numbering map" for proposed 0044..0051 sequence.

### D-3 · /admin/learning "training" decision
**Status:** ✅ ภูม decided in commit `b115b95` — KEEP /admin/learning as org-docs hub (rules/news/customer T&C). REDIRECT "การอบรม" card → /admin/hr/training (HR owns employee training per CLAUDE.md). Phase H ships the editor.

---

## 🔴 รอ external (ก๊อต / พี่ป๊อป) — ภูม สู้ไม่ได้

### E-1 · ADR-0015 WHT lock — blocks V-A6 + V-E7 + V-E8/H1/H2
**Status:** 🟡 DRAFT (เดฟ scaffolded; 4 open Qs). Per pre-launch-checklist B3 — ก๊อต tonight.
**Impact:** Blocks V-A6 (juristic WHT-on-tax-invoice) + V-E7 (freight receipt WHT field) + V-E8/H1/H2 (commission WHT 15%).
**ภูม pickup:** Immediate after ก๊อต lock. Spec [`port-specs/freight-receipt-and-payment.md`](../port-specs/freight-receipt-and-payment.md) + [`commission-withdrawal.md`](../port-specs/commission-withdrawal.md) ready.

### E-2 · ADR-0016 freight value model — blocks V-E1 / V-E2
**Status:** 🟡 DRAFT (5 open Qs). Per pre-launch-checklist B3.
**Impact:** Blocks V-E1 commercial invoice + V-E2 freight value (real_value / declared_value / vat_plan).
**ภูม pickup:** Post-launch when ก๊อต locks.

### E-3 · MOMO endpoint inventory (ก๊อต MOMO-1 call) — blocks MOMO sync wire
**Status:** Pending ก๊อต call to MOMO dev. Prep doc: [`integrations/momo-1-call-prep.md`](../integrations/momo-1-call-prep.md).
**Impact:** `lib/integrations/momo-jmf/sync.ts` stays skeleton; container tracking falls back to admin-manual entry (already shipped).
**ภูม pickup:** Wire `syncContainersFromMomo()` upsert loop per JSDoc TODO after ก๊อต confirms response shape.

### E-4 · Pacred owner Bundle 1 (PromptPay + bank + tax-ID + LIFF ID)
**Status:** Pending ก๊อต call พี่ป๊อป. Per pre-launch-checklist soft-blocker.
**Impact:** PromptPay QR shows soft-degrade · tax-invoice missing legal name · LIFF customer link non-functional.
**ภูม pickup:** Wire `NEXT_PUBLIC_LIFF_ID` env into `/liff/link` page once available. No code change needed for PromptPay (already soft-degrades).

### E-5 · ก๊อต RBAC review for `interpreter` role (V-H1)
**Status:** New since night-5 — required for V-E8/H1/H2 commission impl.
**Spec:** [`port-specs/commission-withdrawal.md`](../port-specs/commission-withdrawal.md) — Pacred extends `admins.role` enum with `'interpreter'` ahead of commission accrual flow.
**Impact:** Blocks V-H1 interpreter role + V-E8 commission accrual cron.
**ภูม pickup:** Add migration extending `admins.role` CHECK + add to `AdminRole` type + sidebar entries — ~30 min — after ก๊อต confirms.

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
- หรือ commit structural piece (เช่น migration 0044 WHT) → ภูม ลบ entry นี้ใน batch ถัดไป
- Urgent? LINE ping ก็ได้ — ภูม sees the merge + handoff diff every sync.
