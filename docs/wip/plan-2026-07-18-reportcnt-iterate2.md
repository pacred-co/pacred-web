# PLAN 2026-07-18 ดึก-2 — report-cnt iterate รอบ 2 + platform fixes (owner 9 จุด)

> Checkpoint plan (owner: "savepoint plan อัพขึ้น แล้วเช็คกับ plan เป็น checkpoint · push แค่ dave-pacred
> ก่อน · จบครบ → เลินนิ่ง + memory + savepoint + push ทุก branch + ปิด session").
> Update the checkbox as each lands. Resume from here if context dies.

## Checkpoints

- [ ] **A. แพคกิ้งลิสต์เรียงคอลัมน์ตรงตารางใหญ่จริงๆ** (report-cnt/[fNo] dropdown)
      ตารางใหญ่: … รายละเอียด(มีรูป) · **ลัง · ปริมาตร(CBM) · หนัก(Kg) · ประเภท** · …
      → dropdown: `# · แทรคกิ้ง · รูป · กล่อง(รับ/คาด=ลัง) · CBM · น้ำหนัก · ประเภท · กว้าง · ยาว · สูง`
      (ก·ย·ส ไปท้ายสุด เพราะตารางใหญ่ไม่มี — คอลัมน์ที่มีร่วมกันต้องเรียงเหมือนกัน)
- [ ] **B. หัวแถว (summary) เพิ่ม tag ค่านำเข้า**: pill ปริมาตร/น้ำหนัก (uniq frefprice) ใน ค่านำเข้า cell +
      pill เรทขาย (uniq frefrate แดง) ใต้ ประเภท — เหมือนแถวเดี่ยวเป๊ะ.
- [ ] **C. กล่อง/ลัง "-/1" → "0/1" ทุกจุด** (summary + แถวเดี่ยว + แพคกิ้งลิสต์): got null → 0.
- [ ] **D. popup ทั้งระบบ — ต้องลอยกลางจอเสมอ** (ห้ามให้ user เลื่อนหา): root cause = fixed ภายใต้
      transformed ancestor (เหมือน floating-bar 2026-07-16) → **portal to body + fixed inset-0 center**
      ที่ shared dialog + สแกน modal ที่ hand-roll (cost-rate-modal · cnt-payment-modal · confirm ฯลฯ).
- [ ] **E. sidebar ย่อ/ขยาย บัง content ไม่ยอมพับ (บาง user เช่น admin_aom)** — ตรวจ pin/hover logic +
      z-index floating bar · ให้พับเมื่อคลิกนอก/เลือกได้แม้กาง.
- [ ] **F. งานติดลบ /admin/forwarders/52197 งง** — root: ชิปเม้น 1782555393 ขายคิดตามน้ำหนัก (เรท 8/kg)
      แต่ต้นทุนคิดตาม CBM → บางแทรคเบา (kg/CBM<250) ติดลบรายแถว แต่**ทั้งชิปเม้นบวก** (Σ 5,780kg/13.89CBM
      =416kg/CBM → weight ถูกต้อง · Σ sell 46,244 > Σ cost 34,723). fix = แสดงกำไรระดับชิปเม้น + explainer
      ใน ForwarderProfitPanel (display-only).
- [ ] **G. gate รายการตรวจสอบ: ต้องตั้งที่อยู่จัดส่งก่อน** — adminReportCntAddCheck + client eligibility
      refuse แถวไม่มีที่อยู่ (ยกเว้น PCS รับเองโกดัง) กันบัคเงินค่าส่ง.
- [ ] **H. เรทค่าขนส่งไทย auto (Flash/J&T เก็บตามจริง ไม่ใช่ 50)** — ตรวจ wiring resolveThShippingAutoPrice
      → ให้ fire ตอนวัดขนาด/เลือกขนส่ง (fill-when-empty · editable · ไม่แตะแถว billed).
- [ ] **I. ปลดล็อค packing-gate ก่อนวางบิล (advisory)** + ย่อ tag 📦/⏳ เหลืออีโมจิ + tooltip.
- [ ] **J. Close: learnings + memory + CLAUDE.md savepoint + push ALL 4 branches.**

## กติกา
- push **dave-pacred เท่านั้น** ระหว่างทาง — push ทุก branch เฉพาะตอนปิด (J).
- money = display/default-fill เท่านั้น · ห้ามแตะ billed rows · dry-run ก่อน data-write.
- gate ทุก checkpoint: tsc 0 (+ build ก่อน push).
