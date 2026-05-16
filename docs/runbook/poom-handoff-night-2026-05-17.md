# 🌙 ภูม → เดฟ overnight handoff — 2026-05-17 night → 2026-05-18 morning launch

> **Context:** ภูม นอนแล้ว — Claude (autonomous) ลุยงานเสริม overnight; เดฟช่วยลุยงานหนักคู่ขนานเพื่อให้ทันก่อน soft launch 10am Mon. **launch จันทร์ห้ามพลาด** — phone+OTP เป็น primary auth ใช้ได้แน่นอน.
>
> Last updated: 2026-05-17 (autonomous Claude) · Branch: `Poom` @ `0e98332`

---

## ✅ เดฟ reply — 2026-05-17 night (เดฟ via Claude)

อ่าน handoff แล้ว ภูม — ตอบทุกข้อ:

1. **D1 (V-E7) → เดฟ ลุยแล้ว.** Spawn เป็น autonomous session แยก (isolated worktree) กำลัง implement V-E7 freight receipt + payment ledger (migration `0052`) จนจบ → จะ merge เข้า `dave` เมื่อเสร็จ. **ภูม ไม่ต้อง pickup V-E7** — ลุย C1-C4 (PDF generators / customer self-upload / TOS+contacts wiring) + D2 (Form E + D/O) ต่อได้เลย.

2. **⚠️ Combined apply file ถูกลบทิ้งแล้ว.** `docs/setup/migrations-0044-0060.sql` — เดฟ ลบ (ไม่ใช้ combined-zip flow อีกต่อไป). **flow ใหม่ที่ ลูกพี่ confirm:** ภูม apply migration จาก `supabase/migrations/` **ตรงๆ** — paste แต่ละไฟล์เรียงเลขใน Supabase SQL Editor (`0044`→…→`0051`→`0060`) หรือ `supabase db push`. ไม่มี zip ส่งไป-มา · agent ตรวจ SQL · ภูม รัน dev+prod เอง. → handoff §"CRITICAL" + §52 "ขอเดฟ regen apply file" = **ไม่ต้องแล้ว**.

3. **Migration apply — เดฟ review ครบแล้ว ทั้ง 9 ไฟล์** (`0044`-`0051` + `0060`) — sound · idempotent. คู่มือ step-by-step + verify block ครบ → [`poom-apply-migrations-2026-05-17.md`](poom-apply-migrations-2026-05-17.md) (อัพเดทเป็น 9 migrations แล้ว). ภูม apply ได้เลยไม่ต้องรอ.

4. **Migration numbering:** `0052` = V-E7 (เดฟ กำลังทำ). ภูม next free หลังจากนั้น = `0053` (commissions). Map → [`poom-phase-i2-prep.md`](poom-phase-i2-prep.md).

5. **Decisions §"ภูม need ตื่นมาตัดสินใจ":** #1 ✅ เดฟ ลุย D1 แล้ว → ภูม pickup D2. #2 C2 customer self-upload → ทำ (ตาม default). #3 C3 TOS gate DB read + fallback → ทำ (ตาม default). #4 → V-E3/E4 ก่อน V-E12 (ตาม default).

**สรุป: ภูม โฟกัส C1-C4 + D2. V-E7 เดฟ คุมเอง. apply migration จาก git ตรงๆ — ไม่มี combined file. สู้ๆ 🚀**

---

## 🚨 CRITICAL — SQL ที่ต้อง apply ก่อน Mon 10am

⚠️ **migrations 0049 + 0050 + 0051 ยังไม่อยู่ใน combined apply file** (`migrations-0044-0060.sql`) ที่เดฟเตรียมไว้. ต้อง **paste 3 ไฟล์นี้แยก** บน dev + prod ก่อน launch:

| Order | File | Adds | Pre-launch critical? |
|---|---|---|---|
| 1 | `supabase/migrations/0049_wallet_order_payment_unique.sql` | Partial unique on `wallet_transactions(reference_id)` for completed `order_payment` slice | 🔥 **YES** — F-11 wallet double-debit guard. ต้องลงก่อน public launch 2pm (ad-driven concurrency) |
| 2 | `supabase/migrations/0050_freight_shipments.sql` | `freight_shipments` + `freight_parties` + `freight_job_seq` + `next_freight_job_no()` + RLS + V-E10 QA FK backfill | 🟢 nice-to-have — freight customers ยังไม่มีก่อน Mon. ลงได้ตอนสะดวก. ห้ามพลาด: รัน 0050 ก่อน 0051 (FK dep) |
| 3 | `supabase/migrations/0051_freight_invoices.sql` | `freight_invoices` + `freight_invoice_lines` + `freight_invoice_seq` + `next_freight_invoice_serial()` + partial-unique (one issued per shipment) + RLS | 🟢 nice-to-have — dep 0050 |

**Apply procedure:**
1. Supabase Dashboard → **dev** project → SQL Editor → New query
2. Paste ทีละไฟล์ ตามลำดับ (0049 → 0050 → 0051) → Run
3. `"already exists"` notice = safe (idempotent); แดง abort = ping ผม
4. **Verify dev:**
   ```sql
   -- after 0049
   select indexname from pg_indexes
    where tablename='wallet_transactions' and indexname='wallet_tx_order_payment_uniq';
   -- expected: 1 row

   -- after 0050
   select tablename from pg_tables
    where schemaname='public' and tablename in ('freight_shipments','freight_parties','freight_job_seq');
   -- expected: 3 rows

   -- after 0051
   select tablename from pg_tables
    where schemaname='public' and tablename in ('freight_invoices','freight_invoice_lines','freight_invoice_seq');
   -- expected: 3 rows

   -- next_* functions exist
   select proname from pg_proc where proname in ('next_freight_job_no','next_freight_invoice_serial');
   -- expected: 2 rows

   -- V-E10 FK backfill
   select 1 from information_schema.table_constraints
    where constraint_name='freight_qa_inspections_freight_shipment_id_fkey';
   -- expected: 1 row
   ```
5. **Repeat บน prod** — same files same order same verify
6. Schema cache reload (Dashboard → Database → Schema → Reload)

**ขอเดฟ regen apply file (post-launch ได้):**
- เพิ่ม 0049-0051 เข้า `docs/setup/migrations-0044-0060.sql` ให้เป็น `migrations-0044-0060-rev2.sql` หรือ rename → `migrations-0044-0051+0060.sql`
- อัพเดต runbook `docs/runbook/poom-apply-migrations-2026-05-17.md` table

---

## 📦 สถานะงาน Pre-launch — สรุปทั้ง session autonomous

**✅ ชิปแล้ว 19 commits, ~12,000+ LOC, 7 migrations (0044-0051 ยกเว้น 0049 = wallet guard):**

| Track | Items | Migrations |
|---|---|---|
| **Cargo** (V-A6 WHT) | 5 actions + admin panel + tax-invoice PDF block + customer banner + issuance gate | 0044 |
| **Cargo** (V-E10 QA) | 4 actions + 3 admin pages + customer panel + V-E7 gate helper | 0045 |
| **Cargo** (F-11) | partial-unique guard + 2 actions catch 23505 | 0049 |
| **Freight** (V-E6 quotation V1) | 11 actions + admin list/new/detail + 7-state workflow | 0048 |
| **Freight** (V-E1 V1) | 14 actions + shipments + invoices + V-E6 convert wired | 0050 + 0051 |
| **Admin polish** (V-G4) | TOS version mgmt admin UI | 0047 |
| **Admin polish** (V-G5) | org_contacts admin tabbed UI | 0046 |
| **Admin polish** (V-G6) | 4 analytical reports | — |
| **Admin polish** (V-G7) | audit bundle 6/6 complete | — |
| **PDFs** (BANK wire) | 3 receipt templates | — |
| **Docs** | 8 playbook sections + Phase I2 prep + session summary | — |

**Phase I2 sequence:** 4/8 ✅ (V-A6 + V-E10 + V-E6 + V-E1 V1)

---

## 🌙 Claude overnight ลุยตัวไหน (safe additive, ไม่กระทบ launch)

ระบบเดิมยังคงรันได้ปกติ. ผมจะ ship เป็น batches เล็กๆ + push real-time. **ทุกอันเป็น additive / read-only / V-1.1 follow-up — zero schema change, zero customer-flow break.**

| # | Item | Effort | Files touched | Status |
|---|---|---|---|---|
| C1 | **V-E1.1 PDF generators: Commercial Invoice + Packing List** | ~3-4h | `components/pdf/freight-commercial-invoice.tsx` + `freight-packing-list.tsx` + `app/api/freight-invoice/[id]/route.tsx` (download endpoint) + button on detail page | pending |
| C2 | **V-A6.1 customer self-upload of WHT cert** | ~2-3h | `actions/wht.ts` (customer-side) + form on customer receipt page + Storage policy allows customer write own folder | pending |
| C3 | **V-G4.1 wire customer TOS gate to tos_versions** | ~1-2h | `actions/tos.ts` + `lib/tos.ts` add `getActiveTosVersion()` helper · `actions/tos.ts::acceptCurrentTos` reads DB version with site.ts fallback · gate modal renders body_md as HTML | pending |
| C4 | **V-G5.1 wire customer footer + contact page to org_contacts** | ~1-2h | `components/sections/footer.tsx` + `app/[locale]/(public)/contact/page.tsx` read `org_contacts` via `getOrgContacts()` helper · site.ts constants stay as fallback | pending |

**Total Claude overnight estimate:** ~7-11h. Conservative: ship C1 + C3 + C4 (~6-8h), defer C2 if behind schedule.

**Why these picks:**
- Zero migration → ไม่ต้องเดฟ apply อะไรเพิ่ม
- All additive — existing customer flow ใช้ site.ts fallback ถ้า DB rows ยังว่าง (V-G4/G5)
- V-E1.1 PDF = visible win — ภูม + พี่ป๊อบ ดู PDF จริงได้ก่อน Monday
- V-A6.1 customer self-upload = ปิด V-A6 loop (admin-only V1 → ลูกค้า self-serve V1.1)

**ทั้ง 4 ไม่ block + ไม่ต้อง wait — เดฟลุยงานข้างล่างได้ขนานเลย**

---

## 🛠 เดฟ ช่วยลุยตัวไหน (parallel + heavier)

ลำดับแนะนำตาม leverage:

### 🟢 D1 — V-E7 receipt + payment ledger V1 (~10-15h, biggest leverage)
**Spec:** [`docs/port-specs/freight-receipt-and-payment.md`](../port-specs/freight-receipt-and-payment.md)
**Migration:** `0052_freight_invoice_payments.sql` (next free; map confirmed by Phase I2 prep §"Migration numbering map")
**Dep:** ✅ V-A6 + V-E10 + V-E1 (all shipped this run)
**Surface:**
- `freight_invoice_payments` table (partial-pay ledger, status enum)
- `actions/admin/freight-invoice-payments.ts` — record payment + auto-flip invoice status when paid in full
- WHT gate: ถ้า invoice มี WHT row + cert_status='pending' → block (mirror tax_invoices issuance gate)
- QA gate: call `isCargoShipmentQaPassed()` ถ้า freight_shipment linked to cargo_shipment (เลื่อนได้ — V-E10 gate มี FK พร้อมแล้วแต่ wiring ใน V-E7 = D1.1)
- Receipt PDF (RD Code 86 compliant — RD-required fields)
- Admin UI on `/admin/freight/shipments/[id]` — payment panel below invoice
**Decisions เดฟต้องเลือก (ไม่มี ADR เฉพาะ):**
1. Multi-payment per invoice หรือ one-shot? — แนะนำ multi (partial pay common in B2B freight) → ledger pattern
2. Cash / bank transfer / wallet หรือ external gateway flag? — V1 = manual entry (cash, bank transfer slip, wallet) → external gateway = T+30d
3. Currency = THB only V1 หรือ multi? — แนะนำ THB only V1 (mirror existing wallet_transactions)

### 🟡 D2 — V-E3 Form E + V-E4 D/O letter PDF generators (~6-8h, depends on C1 below)
**Spec:** [`docs/port-specs/freight-document-suite.md`](../port-specs/freight-document-suite.md) §V-E3 + §V-E4
**Dep:** Claude C1 (V-E1.1 PDFs) — ต้องรอ C1 ลงก่อน เพราะใช้ same `@react-pdf/renderer` pattern + font setup
**Migration:** none — pure templating over existing freight_shipments + freight_parties + freight_invoice_lines + hs_codes
**ก๊อต-flag:** "Form E เป็น draft Pacred ออกให้ลูกค้าไปยื่นเอง หรือ Pacred prepare data ให้ทางการออก?" — เดฟ-decide-on-spot OK (ถ้าไม่แน่ใจ → ทำ draft for customer to file)

### 🟡 D3 — V-E12 role dashboards (~20-25h, lower urgency)
**Spec:** [`docs/port-specs/cargo-and-freight-dashboards.md`](../port-specs/cargo-and-freight-dashboards.md)
**Dep:** none (additive)
**Why later:** customer-facing surfaces ก่อน Mon launch สำคัญกว่า; dashboards = polish post-launch

### 🔴 D4 — V-E8/H1/H2 commission (~20-30h, defer post-launch)
**Dep:** ✅ V-A6 + interpreter role ack
**Migration:** `0053_commissions.sql` (4 tables + admins.role enum extend)
**Why defer:** commission accruals ต้องสะสมพอก่อน → ลูกค้าจริงเข้าสัก 1-2 อาทิตย์ก่อนเปิด

### 🔴 D5 — V-E9 + V-E11 (defer — accounting requests + customs declaration)
**V-E9** = monthly closing — เปิดเมื่อ accounting ขอ (เดือนแรกหลัง launch)
**V-E11** = ใบขนสินค้า internal UI — ไม่มี Thai Customs API integration, internal-only

---

## ⚠️ Blocker / รอ external decision

| Item | Owner | Action |
|---|---|---|
| **OAuth Google/Facebook dashboard config** | ก๊อต Mon 2026-05-18 morning | broken: `NEXT_PUBLIC_SITE_URL` ใน Vercel ชี้ dead `v2.pacred.co` + FB app Dev Mode → OAuth redirect 404. Phone+OTP ใช้ได้ — ไม่ block launch. Steps: [`auth-launch-fixes-2026-05-17.md`](auth-launch-fixes-2026-05-17.md) |
| **MOMO endpoint inventory call** | ลูกพี่ + BBOY | script: [`momo-1-bboy-call-script.md`](momo-1-bboy-call-script.md). Demo data fallback active. T+30d ภูม wires real endpoints |
| **T-G3 remaining** | ลูกพี่ + พี่ป๊อป | PDPA reg cert (defer T+8wk) + legal-info confirm + savings acct |
| **DV-3 ThaiBulkSMS signup + OTP_BYPASS flip** | เดฟ Mon ~6am | per team-status §"Tomorrow morning" item 1 |
| **T-D1 smoke test prod post DV-3** | เดฟ Mon ~7am | item 2 |

---

## 🔥 Mon morning launch critical path (Mon 2026-05-18 6-10am)

| Time | Owner | Item | Why critical |
|---|---|---|---|
| 6am | เดฟ | DV-3 ThaiBulkSMS + flip `OTP_BYPASS=false` | Real SMS for soft launch |
| 7am | เดฟ | T-D1 smoke test prod (post DV-3 + post migrations 0044-0051+0060) | Confirm no 500s |
| 7am | เดฟ | Apply migrations 0049 (+ 0050 + 0051 if not done overnight) on prod | F-11 protects against ad-driven double-debit @ 2pm public launch |
| 8am | ก๊อต | OAuth dashboard config (Vercel env + Supabase URLs + FB/Google) | OAuth restore (phone+OTP works without) |
| 9am | All | LINE + workstation standby | T-D4 soft launch coordination |
| 10am | All | T-D4 soft launch — 5 friendly customers | Real-customer smoke |
| 2pm | All | Public launch if T-D4 green | — |

---

## 📊 Decisions ภูม need ตื่นมาตัดสินใจ

| # | Decision | Default if no input | Impact |
|---|---|---|---|
| 1 | Run V-E7 V1 หลังตื่น หรือ ให้เดฟลุยก่อน? | เดฟ ลุย D1 → ภูม pickup D2 (Form E + D/O PDFs ที่ Claude C1 unblock) | medium — affects who owns V-E7 design decisions |
| 2 | V-A6.1 customer self-upload (C2) ขึ้นไหม? Storage RLS allows customer write own folder under wht-certs | ทำ — finishes V-A6 loop | low — additive |
| 3 | V-G4.1 customer TOS gate รัน DB read หรือ keep hardcoded? | ทำ + fallback to hardcoded — additive | low — feature-flag style |
| 4 | post-launch: ลำดับ V-E3/E4 vs V-E12 dashboards | V-E3/E4 first (freight customers need docs) | medium |

---

## 🟢 Cross-references

- Migration runbook (เดฟ): [`docs/runbook/poom-apply-migrations-2026-05-17.md`](poom-apply-migrations-2026-05-17.md)
- Combined apply file (out-of-date — missing 0049-0051): [`docs/setup/migrations-0044-0060.sql`](../setup/migrations-0044-0060.sql)
- Phase I2 sequence: [`poom-phase-i2-prep.md`](poom-phase-i2-prep.md) §"Recommended sequence"
- Playbook (browser test all sections AA-HH): [`poom-test-playbook-2026-05-16.md`](poom-test-playbook-2026-05-16.md)
- Team status: [`team-status-2026-05-17.md`](team-status-2026-05-17.md)
- Pacred briefs: [`docs/briefs/poom.md`](../briefs/poom.md) · [`docs/briefs/dave.md`](../briefs/dave.md)

---

## 📡 Communication

- ผม push real-time ทุก commit ภายในไม่กี่นาที — เดฟ pull แล้ว rebase ของตัวเองได้เลย
- ถ้าเดฟ start V-E7 — ใช้ migration `0052_freight_invoice_payments.sql` (เลขถัดไปหลัง 0051; map ใน phase-I2-prep ระบุไว้แล้ว)
- ภูมิเรียกทำเก็บงาน specific ไหน → ping ใน chat, ผม pick up
- เดฟ shipping ขนานได้ — branch `Poom` ไม่ block เดฟ branch `dave`. Merge ทิศ ภูม→dave (เหมือนเดิม)

**ภูมิ ฝัน good night — Mon launch สู้ๆ 🚀**
