# อี้อู / TTW rework — แยกงานตามแผนก (owner ภูม 2026-07-25) · SAVEPOINT

owner brief + แผนที่เคาะแล้ว (mockup ผ่าน "โอคหมดเลย · ตัดป้ายบนออก").

## 📌 สถานะ (2026-07-25)
- ✅ **หน้า A yiwu (CS)** เสร็จ — ตาราง excel + ลากคอลัมน์ · รูปเล็ก hover/คลิกเต็ม · ตัด OCR · ประวัติจริง · ตัด step2 · commit ไม่แตะ · eslint 0 · tsc 0
- ✅ **หน้า B TTW Stage 1** — ย้ายอัพ packing มา (`YiwuPackingClient` mount บน TTW page) + header DOC + staging เดิม · eslint 0 (packing reconcile = money-free เดิม)
- ✅ **หน้า B Stage 2 เสร็จ (money-path):** ปุ่ม "เอาเข้าระบบ" ต่อแถว unmatched (reason "ไม่พบออเดอร์ในระบบ" + มีข้อมูลวัด) → กรอก PR → **reuse `addYiwuDeliveryNoteShipments` 100%** (GUARD กันซ้ำ+validate PR+auto-price · ไม่มี INSERT ใหม่) · confirm ก่อน · หลังสร้าง re-upload packing ผูกตู้+เลื่อน 3 · eslint 0 · tsc 0 · diff review money-safe
- ✅ browser-verify: yiwu (ตาราง/hover/ประวัติ/สีสถานะ) + TTW (packing+staging render) — ภูม login localhost verify แล้ว · **create flow ต้องอัพไฟล์ packing จริงที่มีเลข unmatched ถึงเห็นปุ่ม (ภูม test)**
- 🟡 polish รอบหน้า: TTW มี 2 header (page + staging) ซ้อน · รูปหลายใบ (fcover+fimages) ถ้า ภูม อยาก

## โฟลที่ถูกต้อง (แยกตามแผนก)
- **CS** คีย์จาก**ใบส่งของ** ที่ `/admin/api-forwarder-yiwu` → เอาเข้าระบบ → สถานะ "ถึงโกดังจีนแล้ว" (`tb_forwarder` fstatus=2 · fwarehousechina=2 อี้อู)
- **DOC** อัพ**ไฟล์ packing list** ที่ `/admin/api-forwarder-ttw` → จับคู่ → สถานะ "กำลังเดินทางมาไทย"
- packing list มีของหลายบริษัทปน (TTW รวมตู้) · แถวมี PR = ของเรา · 会员=YY = ไม่ใช่ของเรา
- **หน้า TTW = ตาข่ายกันพลาด:** ถ้า CS ลืมคีย์ → DOC เจอตอนอัพ packing → คอนเฟิร์ม CS → กด "เอาเข้าระบบ" (เหมือน MOMO add-missing) + **ต้องกันซ้ำ**

## หน้า A · `/admin/api-forwarder-yiwu` (CS) — ✅ mockup ผ่าน
ไฟล์: `page.tsx` · `yiwu-client.tsx` (step1) · `yiwu-packing-client.tsx` (step2 = ย้ายไป TTW)
- [ ] ตัด **step 2 (YiwuPackingClient)** ออก → ย้ายไปหน้า TTW
- [ ] รูป: **ตัด OCR** (OcrExtract/parseYiwuDeliveryOcr/onOcrText) · เล็ก + **hover พรีวิว + คลิกดูเต็ม** (เดิมรูปใหญ่ sticky) · รอบนี้รูปเดียว (fcover เดิม · commit ไม่แตะ = money-safe) · multi-image = follow-up (fcover+fimages mig 0176 text-json)
- [ ] ตาราง **excel + ลากสลับหัวคอลัมน์ ยาว/กว้าง/สูง** (native drag ไม่ต้อง lib) — กันคีย์ผิดตอนอี้อูสลับ กว้าง↔ยาว · field binding ติดไปกับคอลัมน์
- [ ] **ประวัติด้านล่าง** = tb_forwarder อี้อู (fwarehousechina=2 · 29 แถว prod) · กด 单号 เข้ารายการ
- commit `addYiwuDeliveryNoteShipments` + validation + result = **เก็บเดิม** (money-path ไม่แตะ)

## หน้า B · `/admin/api-forwarder-ttw` (DOC) — ยังไม่เริ่ม
ไฟล์: `page.tsx` · `ttw-staging-client.tsx` · action `ttw-packing.ts` (assign PR เดิม)
- [ ] ย้าย **อัพ packing list** มาที่นี่ (จาก yiwu step2 · reuse `yiwu-packing-reconcile.ts`) → "กำลังเดินทางมาไทย"
- [ ] ปุ่ม **"เอาเข้าระบบ"** สำหรับแถวของเราที่ยังไม่ในระบบ (reuse `momo-add-missing.ts` createMissingMomoForwarderRow) + **dedup guard** (单号 ซ้ำ = ไม่สร้าง)
- แถวไม่ใช่ของเรา = ปล่อยไว้

## reuse
- `components/admin/hover-zoom-image.tsx` (แม่เหล็กซูม — อาจใช้ในโหมดดูเต็ม)
- `actions/admin/momo-add-missing.ts` = create+dedup primitive (yiwu commit clone มาแล้ว)
- native drag: มีใน content-kanban.tsx / promos-manager.tsx (ไม่ต้องลง lib)

## gate
tsc 0 · lint 0 · build 0 · **browser-verify จริง** (§0c คลิกจริง ไม่ใช่แค่ 200) · mockup-first ผ่านแล้ว (yiwu)
ข้อมูลจริง prod: X9002819(PR247 สุไลมันอาบูเด box-split 2 แถว) · 车顶行李箱(PR107) · 货架 510kg/2กล่อง · admin_poom คีย์ 22/07
