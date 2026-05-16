# 📤 ภูม → เดฟ/ก๊อต hand-off — 2026-05-16 night

> **Purpose:** open decisions + blockers + design choices ภูม จะ run ต่อ. เดฟ/ก๊อต อ่านแล้วตอบกลับใน commit ถัดไป (อัพไฟล์นี้พร้อม decision) หรือ ping ในแชท. **ภูม ไม่บล็อกตัวเอง** — ระหว่างนี้เดินงานที่ unblock ต่อ.
>
> Last updated: 2026-05-16 night (ภูม via Claude)
> Commits pushed since previous team-status: `93d23eb..00232fb` (11 commits — V-D2/D3 wiring · V-B1 reports · V-C2 bill-header · V-C3 ตัดตู้ · V-A1 slip time · V-A7 N/A docs · React-purity fix · polish · LP-1a/b/c1 rates UI).
>
> Cadence: ภูม อัพไฟล์นี้ทุก batch ที่มี decision หรือ blocker; ลบ entry เมื่อมีคำตอบ.

---

## 🟡 รอ decision จาก เดฟ / ก๊อต

### D-1 · LP-1c2 rate_custom_hs schema — UNIQUE constraint? (พร้อม shipped option b)
**Context:** Migration `0009_rates.sql` สร้าง `rate_custom_hs` แต่ comment เขียนว่า "placeholder shape" + ไม่มี `UNIQUE (profile_id, hs_code, source_warehouse, transport_type, product_type, basis)`.

**Status:** ✅ ภูม shipped LP-1c2 with **option (b) SELECT-then-write** ใน commit `0d35f1f`. Feature ทำงาน ได้ — race-window เล็กแค่ admin 2 คนแก้ตู้เดียวกันพร้อมกัน (ไม่ใช่ scale Pacred).

**ทางเลือก (a) UNIQUE constraint — เดฟ choose later:**
- ลง migration `0044_rate_custom_hs_unique.sql` แล้วแก้ `actions/admin/rates.ts::adminUpsertCustomHsRate` ให้ใช้ `.upsert({ onConflict: ... })` (ลบ SELECT-then-INSERT/UPDATE branch). 5-10 นาที.

**Owner of decision:** เดฟ — refactor optional. ไม่ block.

---

### D-2 · Migration numbering — ✅ confirmed 2026-05-16 night
**ภูม ใช้:** `0041` bill_to_name_override (V-C2) · `0042` cargo_containers.close_at (V-C3) · `0043` slip_transferred_at (V-A1)

**ภูม Monday morning takes `0044_withholding_tax.sql`** สำหรับ V-A6 (ADR-0015 ✅ locked → spec ready in ADR §"Schema sketch — migration `0039_withholding_tax.sql`" — rename to 0044 + apply).

**Owner:** ✅ resolved

---

## 🔴 รอ external (ก๊อต / พี่ป๊อป)

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

### E-3 · MOMO endpoint inventory — **in-flight 2026-05-16 night**
**Call owner changed:** ก๊อต → ลูกพี่ ("เอามาทำเอง"). เดฟ wrote ลูกพี่-friendly call script [`docs/runbook/momo-1-bboy-call-script.md`](momo-1-bboy-call-script.md) (6 topics, 30-45m, plain-Thai). ลูกพี่ schedules + calls BBOY → ส่ง audio + notes ให้ เดฟ → เดฟ กรอก [`docs/integrations/momo-jmf.md`](../integrations/momo-jmf.md) → ping ภูม. ภูม ไม่ต้องทำอะไรจนกว่า ping.

### E-4 · Pacred owner Bundle 1 — block tax-invoice prod + LIFF + payment
ก๊อต/เดฟ คุยกับพี่ป๊อปเอง — ภูม ไม่เข้าไปยุ่ง.

---

## ⚪ Followup ที่ภูม ทำเอง (low priority, ไม่ block)

### F-1 · BillToOverridePanel "default name" สำหรับลูกค้านิติบุคคล ✅
**Status:** Shipped ใน commit `0d35f1f` — profile select เพิ่ม `account_type` + ถ้า juristic ดึง `corporate.company_name` มา feed `defaultName` prop.

### F-2 · LP-1c2 rate_custom_hs UI ✅
Shipped ใน commit `0d35f1f` พร้อม F-1 (เลือก option (b) ตาม D-1).

### F-3 · /admin/learning "training" decision ✅
**Decision:** KEEP /admin/learning as org-wide docs hub (rules/news/customer T&C). REDIRECT "การอบรม" card → /admin/hr/training (HR owns employee training per CLAUDE.md). Avoids duplicate code paths. Phase H ships the editor + sign-acknowledge flow for remaining 3 sections.

### F-4 · CT-7 driver self-serve runs ✅
Shipped `fe05c3a` — /admin/driver-runs + driverUpdateOwnAssignmentStatus action.

### F-5 · CT-8 container lifecycle integration test ✅
Shipped `58509f4` — lib/warehouse/lifecycle.test.ts (23 asserts, DB-backed).

### F-6 · LP-6 PDF spot-check ✅
Shipped `92fdb29` — extended render.test.tsx with 3 ShopOrderReceipt cases (paid/awaiting/juristic+override+edgeThai).

---

## 🟢 ของพร้อมเทสต์ — ภูม จะลุยตาม [poom-test-playbook-2026-05-16.md](poom-test-playbook-2026-05-16.md)

ดูไฟล์ playbook สำหรับ step-by-step ลูกค้า + พนักงาน flow.

---

## เดฟ/ก๊อต reply ใส่ที่ไหน
- แก้ไฟล์นี้: เปลี่ยน 🟡/🔴 → ✅ พร้อม decision; commit `docs(handoff): D-X decided — <decision>`
- หรือ commit เลย structural piece (เช่น migration 0044) → ภูม ลบ entry นี้ใน batch ถัดไป.
