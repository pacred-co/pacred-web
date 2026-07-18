# PLAN 2026-07-18 ดึก-3 — report-cnt iterate รอบ 3 (owner 3 จุด · vivid + summary-detail + backfill)

> Checkpoint plan. push dave-pacred ระหว่างทาง · ทุก branch ตอนปิด. Update boxes as landed.

## Checkpoints

- [ ] **K. สี VIVID จี๊ดจ๊าด (ไม่จืด) — selection + tag/status ทั้งระบบ:**
      - report-cnt LIST (cnt-list-table rowTint): selected emerald-50 → **emerald-200/500 ring-2** เข้ม.
      - report-cnt/[fNo] CSS `.pcs-row-selected` (+ scan-ok/wait) → เข้มขึ้น · เขียวจี๊ด.
      - เช็ค status pill (FSTATUS_CFG.chip + legacy badge report-cnt) ให้ solid vivid (บาง badge ยัง -50 จาง).
      - action-hint / next-action chip เข้ม.
- [ ] **L. หัวแถว/หัวบิล (summary) = รายละเอียดครบเหมือนแถวเดี่ยว:**
      รูปที่ owner ส่ง: summary row tag ขึ้นไม่ครบ · คำอธิบายไม่มี. เพิ่มบน summary ให้เท่าแถวเดี่ยว —
      รายละเอียดสินค้า (a.detail ถ้า uniq · ไม่งั้น "N รายการ") · **ที่อยู่จัดส่ง** (district·province) ใต้ การขนส่ง ·
      **เครดิตได้/นิติ** badge · **next-action hint** (แจ้งหนี้ 4→5 · ตรวจ/แจ้งเก็บเงิน) · pill ครบ.
      = aggregateGroup เพิ่ม field ที่ขาด (fcredit/usercompany/faddress·/next-action) + render บน summary.
- [ ] **M. Backfill คิวรอตรวจสอบ (tb_check_forwarder) + ตู้ถึงไทยแล้ว (fstatus≥4) — fill ค่าครบ:**
      probe prod (read-only) หา: (a) แถวในคิว/ถึงไทย ที่ ค่าขนส่งไทยว่าง (Flash/J&T · measured) → auto-quote
      (b) ต้นทุน/เรทว่าง (มี rate card) → live-cost fill (c) box-count/สแกนไม่ตรง. dry-run + backup ก่อน --apply.
      money = fill-when-empty · ห้ามแตะ billed (fstatus≥5 ใน bill) · verify Σ.
- [ ] **N. Close: gate + learnings + memory + savepoint + push all 4.**

## กติกา
- push dave-pacred ระหว่างทาง · money = default-fill เท่านั้น · dry-run ก่อน write · gate tsc0/build0.
