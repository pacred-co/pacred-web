# 🌐 Cross-cutting Test Cases (ทุกหน้า)

เทสกลางที่ใช้กับหลายหน้า — รันควบคู่กับ test case ราย-หน้า

## GX-01 · Auth gates
- หน้า `(protected)` ไม่ login → redirect `/login` · `(auth)` login แล้ว → redirect `/` · `(admin)` ไม่ login → `/login` · admin ผิด role → ถูกปฏิเสธ
## GX-02 · i18n TH/EN
- สลับภาษา (เพิ่ม `/en` prefix) → ข้อความแปลครบ ไม่มี key ดิบโผล่
## GX-03 · Mobile-first
- ทุกหน้า customer-facing ที่ 360/390px: ไม่มี horizontal scroll, tap ≥44px, text ≥16px
## GX-04 · Error boundary
- DB query ล้ม/param ผิด → แสดง error boundary หรือ 404 ที่ตั้งใจ ไม่ใช่หน้าขาว/500
## GX-05 · Money idempotency
- ทุก action เงิน (approve/pay/refund/withdraw): กดซ้ำ/ดับเบิลคลิก → ไม่หัก/จ่ายซ้ำ
## GX-06 · RLS owner-only
- ลูกค้า A เปิด URL ที่มี ID ของลูกค้า B → ไม่เห็นข้อมูล B
## GX-07 · Slip/upload
- หน้าที่อัปโหลดสลิป/รูป: ไฟล์ใหญ่/ผิดชนิด → error · อัปสำเร็จ → preview แสดง
## GX-08 · Pagination/empty
- list ยาว → เลื่อน/หน้าถัดไปได้ · list ว่าง → empty state ไม่ใช่หน้าพัง

