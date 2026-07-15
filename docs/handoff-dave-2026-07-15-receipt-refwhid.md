# → เดฟ (2026-07-15) — ปุ่ม "อ้างอิงชำระเงิน" ใบเสร็จ ฝากนำเข้า · รัน backfill prod

## ปัญหา (ภูม flag)
หน้า `/admin/accounting/receipts` ปุ่มส้ม "อ้างอิงชำระเงิน" ไม่เคยขึ้นสักแถว.
probe เจอ `tb_receipt.refwhid` = **null ทั้ง DEV (65) และ PROD (78)**. ปุ่มโผล่
เฉพาะ refwhid มีค่า (ตรง legacy `if($row['refWHID']!=0)`) → ตายสนิท.

## แก้แล้ว (code · push Poom-pacred `4868d3f5`)
auto-issue-receipt hook เดิม INSERT ใบเสร็จ hardcode `refwhid=null` — ทั้งที่ 3 ทาง
wallet-approve ถือ `wallet_hs.id` (= refWHID legacy) อยู่. ร้อยเข้าไปแล้ว:
`lib/admin/auto-issue-receipt.ts` (+opts.refWhId) · `wallet-hs.ts`/`tb-bulk.ts`/
`wallet-trans.ts` (ส่ง wallet_hs.id). → ใบเสร็จ wallet-funded **ใหม่** ได้ปุ่มเอง.
billing-run path (จ่ายผ่านใบวางบิล) = null → ปุ่มซ่อน (ตรง legacy · ไม่มี wallet ref).
tsc 0 · lint 0 · money-safe (refwhid = reference ไม่ใช่ยอดเงิน).

## 🔴 ต้องรัน backfill บน PROD (ใบเก่า · prod = โดเมนเดฟ)
`scripts/backfill-receipt-refwhid-2026-07-15.mjs` — ผูก receipt.fid →
wallet_hs.reforder (prefer มีสลิป+ล่าสุด · dry-run+backup · money-safe · เฉพาะ null).

```bash
# dry (ผมรันแล้ว = 25/78 ผูกได้ · 14 มีสลิป)
SUPABASE_DB_PASSWORD='<prod pw chat>' node scripts/backfill-receipt-refwhid-2026-07-15.mjs --ref yzljakczhwrpbxflnmco
# apply
SUPABASE_DB_PASSWORD='<prod pw chat>' node scripts/backfill-receipt-refwhid-2026-07-15.mjs --ref yzljakczhwrpbxflnmco --apply
```
→ 25 ใบ prod จะได้ปุ่ม "อ้างอิงชำระเงิน" ทันที.

## หมายเหตุ
- อีก ~53 ใบ = billing-run (ไม่มี wallet topup) → ปุ่มไม่ขึ้น = ตรง legacy.
  ถ้า owner/ภูม อยากให้ปุ่มขึ้นบน billing-run receipt ด้วย (ลิงก์ไป **ใบวางบิล**
  แทน wallet) = งานแยก (overload refwhid semantic · ต้องเคาะก่อน).
- DEV มี 0 ใบ wallet-funded (billing-run ล้วน) → backfill DEV = 0 (verified ด้วย
  reversible demo: ผูก 1 ใบชั่วคราว → ปุ่มขึ้นจริง [DOM ยืนยัน] → คืน null).
- verified: `/admin/wallet/[refwhid]` รับ wallet_hs.id ได้ (สลิป column ใช้ id เดียวกัน).
