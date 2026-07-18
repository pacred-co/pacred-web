# 🩺 PLAN 2026-07-18 (session-4) — Data-Health Invariant Monitor: "ระบบ on green สม่ำเสมอ · ลูกค้าไม่ใช่หนูลองยา"

> **Owner (verbatim):** "วิเคราะห์ทุกปัญหาที่ผ่านมาทั้งระบบ แล้วเอามาพัฒนา ไม่ให้เกิดขึ้นอีก ระบบควรจะ on green สม production ·
> MOMO_CRON_AUTOCOMMIT เปิดอยู่แล้ว (true) แต่ห้ามแสดงผลข้อมูลมั่ว/ผิดเพี้ยน · แบบที่แก้ๆ กันอยู่นี่โดนด่ายับ
> เอาลูกค้าจริงมาเป็นหนูลองยาได้ไง"
>
> **แก่นของปัญหา (meta-root):** ทุกบั๊กที่ผ่านมา **ลูกค้า/พี่ป๊อปเป็นคนเจอ ไม่ใช่ระบบเจอเอง** — เราแก้รากทีละตัวได้ดี
> แต่ไม่มีอะไร "เฝ้า" ว่า invariant ที่เคยพังจะไม่พังอีก. Fix ของ session นี้ = เปลี่ยนจาก reactive → **ระบบตรวจสุขภาพข้อมูล
> production อัตโนมัติ** ที่เจอความเพี้ยนก่อนลูกค้าเห็น.

---

## §1 Retrospective — failure classes ที่เกิดซ้ำ (จาก learnings + save-points ทั้งหมด)

| # | Class | เคสจริงที่เกิด | root ที่แก้ไปแล้ว | invariant ที่ต้องเฝ้า |
|---|---|---|---|---|
| A | **Partner re-key / dup rows** | PR050 519218029029 (2→4 กล่อง) · 1780555730 · 07-14 dup 21 แถว | absorb + family-dedup chokepoint (07-18) · Fix F · reconcile 07-14 | ไม่มี bare+"-1/n" ซ้อน · ไม่มี tracking ซ้ำ exact · staging ptr ไม่ dangling |
| B | **เงินเพี้ยน (bill ผิด/ขาด/ซ้ำ)** | PR107 double-bill FRI-13/24 · report-cnt ฿0 · shop-refund ×hrate · #52403 ฿91k→฿15k | ฿0 gate (07-13) · refund ×hrate (07-13) · CBM-basis fix | แถวเดียวไม่อยู่บน >1 ใบ active · base เดียวไม่โดนหลายใบ active · ไม่มี fstatus-5 ที่ ฿0 |
| C | **สถานะไม่เดิน / ถอยหลัง** | cron demotion 4/5→3 · เครดิตค้าง fcredit=1 หลังจ่าย · G6 dispatch หาย · P22314 stuck | `.lt(fstatus)` guard (07-13) · credit-settle (07-13) · triggers 0215/0216/0235 | จ่ายแล้ว→fcredit ต้องเคลียร์ · ถึงไทยแล้ว (fdatetothai) ต้องไม่ค้าง fstatus<4 นาน · fstatus6+paydeposit1 = G6 list |
| D | **งานหาย (ingestion ล่ม)** | MOMO upsert ทั้ง window ล่มเพราะ 1 แถว · MOMO ทิ้งของ 30-40% (drift ฿294k) · field-shape เปลี่ยนเงียบ | resilient upsert + LOUD errors (07-13) · แต้ม reconcile/drift queue | sync error-rate ล่าสุด · ALL_ROWS_LOST_TRACKING = incident ทันที |
| E | **Cost มั่ว (ภายใน)** | garbage cost weight×rate (07-18 −฿267k) · sibling แบก cost ทั้ง shipment ×N | fix-garbage script · absorb zero survivor dup-cost | Σcost(group)/Σcbm(group) ≤ rate×tol · cost บน group เดียวไม่เบิ้ล |
| F | **ตู้/กลุ่ม split-brain** | PR050 นับใน 2 ตู้ (GZS ผี + GZE จริง) → report-cnt เพี้ยนทั้ง 2 ตู้ | absorb adopt ตู้จริง | base เดียวไม่กระจาย >1 ตู้ |

**ทำไมยังหลุด:** ทุก fix ที่ผ่านมาเป็น (1) guard ที่จุดเขียน + (2) heal ใน cron + (3) sweep ครั้งเดียว — แต่ไม่มีชั้นที่ 4:
**ตรวจซ้ำต่อเนื่องว่า invariant ยัง hold** และร้องเองเมื่อพัง (ก่อนหน้าจอลูกค้า). โดยเฉพาะเมื่อ `MOMO_CRON_AUTOCOMMIT=true`
เขียน tb_forwarder เองทุก 5 นาที — เขียนอัตโนมัติต้องมี **ตรวจอัตโนมัติ** ประกบ.

## §2 Build — Data-Health Monitor (reuse ของที่มี · no migration)

1. **`lib/admin/data-health/checks.ts`** — invariant registry ~13 ตัวตามตาราง §1 (แต่ละตัว: id · ชื่อไทย · severity 🔴/🟠/🟡 ·
   คำอธิบาย "ทำไมสำคัญ/เคสที่เคยเกิด" · run(admin) → {count, sample≤20}). Query ทุกตัว READ-ONLY + bounded.
   Group-aware ที่จำเป็น (เช่น cost ratio ต่อ "กลุ่ม" กัน false-positive บน split anchor).
2. **`/api/cron/data-health`** — pattern เดียวกับ `wallet-reconcile` เป๊ะ: `instrumentCron` + READ-ONLY + `captureIncident`
   ต่อ check ที่แดง (fingerprint คงที่ `data-health:<check-id>` → รันซ้ำ = occurrence_count ไต่ ไม่ spam) +
   structured console summary. vercel.json รายชั่วโมง.
3. **`/admin/data-health`** — dashboard รันสด (super/ops/accounting/god · §0d sidebar · §0g self-explaining:
   แต่ละ check = เขียว/แดง + จำนวน + sample rows ลิงก์ไปหน้าแถวจริง + คำอธิบายภาษาคน + "ทำไงต่อ").
4. **Autocommit post-verify** — หลัง `autoCommitEligibleMomoRows` ทุก batch: re-check family/exact dup เฉพาะ tracking
   ที่เพิ่ง commit → violation = console.error LOUD + incident (เกราะประกบ AUTOCOMMIT=true).
5. **รันจริงกับ prod ทันที** = full-system audit: เขียว → รายงาน; แดง → แก้ (dry-run/backup) หรือ flag บัญชี.
6. Gates: tsc 0 · BUILD_EXIT=0 · unit tests (pure parts) → learnings + memory + save-point → **push all 4 branches**.

## §3 Non-goals (session นี้)

- ไม่แตะสูตรเงิน/บิลใดๆ (monitor = READ-ONLY 100%)
- ไม่ auto-fix แถว billed (flag บัญชีเท่านั้น — FRI2606-00013 ยังค้างรอ void)
- ไม่สร้าง table ใหม่ (incidents = sink เดิม · หน้า dashboard รันสด)
