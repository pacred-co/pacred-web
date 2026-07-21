# ฝากสั่งซื้อ → ฝากนำเข้า: Flow Audit & Bug Hunt

วันที่ตรวจ: 2026-07-21  
ผู้ตรวจ/ผู้แก้: Codex (`codex`)  
ฐานงานเริ่มต้น: `84bc38e2` ซึ่งตรงกับ `origin/dave-pacred` ตอนเริ่มตรวจ  
ขอบเขต: member checkout → admin ตั้งราคา/รับชำระ/สั่งร้าน → สร้างงานฝากนำเข้า → จีนรับเข้า/ผูกตู้/ถึงไทย → member/admin อ่านสถานะและข้อมูลชุดเดียวกัน

## Executive result

แกนสถานะและการเชื่อมข้อมูลถูกปรับเป็นเส้นเดียวใน migration `0268_shop_order_import_single_spine.sql` และใน TypeScript mirror (renumber จาก 0267 หลัง Dave ใช้และ apply `0267_momo_invoice_line` ระหว่างรอบงาน):

```text
member สร้างออเดอร์  1 รอดำเนินการ
admin ตั้งราคา       2 รอชำระ
รับชำระแล้ว          3 ชำระแล้ว/รอสั่งร้าน
สั่งร้านครบ           4 รอร้านจีนจัดส่ง
สร้างฝากนำเข้า       fstatus 1 (hstatus ยัง 4)
ทุก parcel ถึงจีน    40 ถึงโกดังจีน
ทุก parcel ผูกตู้หรือถึงไทย  5 สำเร็จฝั่งฝากสั่งซื้อ
ฝากนำเข้าดำเนินต่อ   fstatus 4 → 5 → 6 → 7
```

สถานะ `40` และ `5` ไม่ถูกกดจากปุ่มหรือ page logic อีกต่อไป แต่ derive จากสินค้าทุกร้าน/ทุก tracking token ที่เชื่อมกับงานฝากนำเข้าจริง การ rollback, ยกเลิก, ลบ หรือเปลี่ยน tracking ฝั่งฝากนำเข้าจะสั่ง derive ใหม่ได้ทั้งด้านเก่าและด้านใหม่ภายในช่วงสถานะที่ระบบอนุญาต

## สิ่งที่แก้แล้ว

| ID | ระดับ | ปัญหาเดิม | ผลแก้ |
|---|---|---|---|
| FIX-01 | P0 | migration 0264 แตกกติกาจาก 0259, มี trigger ฝั่ง `tb_order` ซ้ำ และออเดอร์ไม่มีร้านอาจสำเร็จเอง | 0268 รวมเหลือ pure rule + writer เดียว, ลบ trigger ซ้ำ, zero-shop คงสถานะ 4 |
| FIX-02 | P0 | tracking แบบ comma bag และกล่อง MOMO `-N`/`-N/M` ถูก match ไม่ตรงกันระหว่าง DB/หน้าจอ; กล่องเดียวที่ถึงอาจกลบ sibling ที่ยังไม่ถึง | split ทั้ง `,`/`，`, match ด้วย tracking family base, ทุก active sibling ต้องผ่าน stage และ `-N/M` ต้องมี index ครบ 1..M |
| FIX-03 | P0 | fallback ด้วย tracking อาจโยงคนละลูกค้า หรือใช้ forwarder ที่ยกเลิกแล้ว | ทุก fallback scope ด้วย `userid`; ตัด `fstatus=99` |
| FIX-04 | P0 | forwarder ที่ rollback เป็น 1/99 หรือลบออกไม่ทำให้ hstatus 40 กลับเป็น 4 | trigger ใหม่ฟัง INSERT/DELETE/UPDATE ทั้ง status, cabinet, tracking, reforder, userid และ derive OLD+NEW link |
| FIX-05 | P0 | MOMO commit บังคับ 4→40 จาก forwarder เพียงแถวเดียว ข้ามกติกาทุกร้าน | เอา direct write ออก ให้ DB aggregate trigger เป็นผู้ตัดสินเพียงจุดเดียว |
| FIX-06 | P0 | การสร้างงานนำเข้าฮาร์ดโค้ด Guangzhou/ต้นทาง และทำ tax snapshot/ราคาปรับปรุงหล่น | แปลงรหัส Yiwu/Guangzhou ถูกทิศ, derive paymethod จาก carrier, ส่งต่อ tax preference/tax id/address และ header price-update fallback |
| FIX-07 | P0 | หน้า member แสดง/สร้าง QR แบบรวม VAT แต่ slip ledger บันทึกยอดก่อน VAT | UI และ action ใช้ `computeShopOrderTransferAmount` ตัวเดียวกัน |
| FIX-08 | P1 | checkout ทาง `/service-order` ทำ warehouse และหมายเหตุขนส่งหล่น | map warehouse เข้า header และแยก order note จาก shipping-address note |
| FIX-09 | P1 | promo ที่หน้า cart แสดงว่า apply แล้ว แต่ตอน submit ไม่อ่าน/ไม่ผูกกับ order | อ่าน selection ฝั่ง server, ใช้เรทที่ยัง active, ผูก `tb_promotion` กับ hNo และ carry ต่อไปทุก fNo |
| FIX-10 | P1 | member ไม่มี tab/count/filter สถานะ 40 | เพิ่ม status 40 ครบทั้ง count และ list filter |
| FIX-11 | P1 | active-customer cron ข้ามออเดอร์สถานะ 40 | เพิ่ม 40 เข้า activity set และ regression test |
| FIX-12 | P0 | เปลี่ยน tracking อาจ rename forwarder ของลูกค้าคนอื่นที่ใช้เลขซ้ำ | จำกัดด้วย header `userid` และชุด forwarder ID ที่ lookup ไว้ |
| FIX-13 | P0 | action สร้าง forwarder เชื่อ client/wrapper และบางทางยอมเฉพาะ 4 ไม่ตรงกัน | server action ตัวล่าง guard `hstatus ∈ {4,40}`; wrapper/UI ใช้กติกาเดียวกัน |
| FIX-14 | P0 | admin ส่งรายชื่อร้านไม่ครบแล้วยังแก้บางแถวและ flip header เป็น 4 | ตรวจ exact shop set ก่อนเขียน, ห้าม duplicate/unknown/missing, ตรวจจำนวนร้าน/แถว และใช้ CAS `3→4` |
| FIX-15 | P1 | quote/save/mark-ordered เขียน header ทับสถานะที่เปลี่ยนระหว่าง request | เพิ่ม compare-and-set ด้วยสถานะเดิม พร้อม error ที่ห้ามกดซ้ำเมื่อ race |
| FIX-16 | P1 | per-row spawn ไม่ carry promo แต่ bulk spawn carry | ย้าย promo carry เข้า spawn SOT ที่ทั้งสองปุ่มเรียก |
| FIX-17 | P1 | notification เมื่อ batch มีทั้ง existing/new fNo อาจแจ้งเลขผิด | แยก `createdFNos` จากรายการ idempotent result |
| FIX-18 | P1 | read path member/admin แต่ละหน้าค้น linked imports คนละแบบ | ใช้ RPC `get_linked_shop_forwarders` ตัวเดียว; มี exact fallback ระหว่าง rollout migration |
| FIX-19 | P1 | limit 50/500 ทำให้ order ขนาดใหญ่ถูกอ่าน/ส่งต่อไม่ครบ | เส้นทางที่แก้ในรอบนี้ขยายตาม cart cap 10,000 แถว |

## Data lineage หลังแก้

| ข้อมูลต้นทาง | เก็บที่ shop order | ส่งต่อเข้า forwarder |
|---|---|---|
| ลูกค้า | `userid` | `userid` และใช้เป็น link-scope |
| คลังจีน | `hwarehousechina` (1=Yiwu, 2=Guangzhou) | `fwarehousechina` (2=Yiwu, 1=Guangzhou) |
| วิธีส่งไทย | `hshipby` | `fshipby` |
| วิธีชำระค่าส่งไทย | derive จาก carrier | `paymethod` derive จาก effective carrier |
| ที่อยู่/โทรศัพท์/หมายเหตุจัดส่ง | `haddress*` | `faddress*` |
| เอกสารภาษี | `tax_doc_pref/tax_id/address` | snapshot เดิมบน `tb_forwarder` |
| สินค้า/จำนวน/รูป | `tb_order` + header rollup | ปัจจุบัน spawn ใช้ header rollup; ดู GAP-05 |
| tracking ร้านจีน | `tb_order.ctrackingnumber` (รองรับ comma bag) | `tb_forwarder.ftrackingchn`, link แบบ base-aware |
| promo | `tb_promotion.hno` | carry เป็น `(promoid, hno, fid)` |
| ราคาปรับปรุง | header/override ต่อ tracking | override ก่อน, fallback เป็น `hpriceupdate` |

## ช่องว่างที่ยังไม่ควรปิดแบบเดา

รายการเหล่านี้ไม่ถูกซ่อนว่า “เสร็จแล้ว” เพราะต้องวาง transaction/state-machine ร่วมกับ Claude Code ก่อน:

| ID | ระดับ | ความเสี่ยงคงเหลือ | แนวทางที่เสนอให้หัวหน้าสถาปัตยกรรมตัดสิน |
|---|---|---|---|
| GAP-01 | P0 | checkout สร้าง header, lines, rollup, ลบ cart, promo หลาย transaction; กลางทางล้มได้ partial order | สร้าง Postgres RPC transaction เดียว พร้อม idempotency key |
| GAP-02 | P0 | quote/save/order/spawn แบบหลายแถวไม่ atomic; CAS ป้องกัน header race แต่ line บางส่วนอาจเขียนแล้ว | ย้าย mutation สำคัญเป็น RPC transaction + audit result |
| GAP-03 | P0 | spawn ใช้ check-then-insert ไม่มี DB unique guarantee; request พร้อมกันอาจสร้าง fNo ซ้ำ และ loop อาจหยุดกลางทาง | unique/index ตาม canonical shipment identity + transactional bulk RPC |
| GAP-04 | P0 | slip approve/mark-paid และ wallet/bill/receipt หลายจุดยังไม่ atomic/race-idempotent | payment settlement RPC พร้อม ledger uniqueness และ row lock |
| GAP-05 | P1 | multi-shop spawn ยังใช้ `htitle/hcover/hpriceupdate` ระดับ header ต่อทุก forwarder; title/image/price ต่อ line อาจไม่ตรง parcel | กำหนด parcel-to-line spec แล้วส่ง snapshot ต่อ tracking |
| GAP-06 | P1 | per-row UI ยอมแก้ tracking ก่อน spawn แต่ไม่ได้ทำให้ `tb_order` เป็น SOT ก่อนทุกทาง | save tracking ผ่าน action เดียวก่อน spawn หรือรวมใน transaction |
| GAP-07 | P0 | generic bulk shop-status override และ generic forwarder advance/revert ยังสามารถข้าม state-machine/payment/document gates | จำกัด transition API ตาม role+edge; super override ต้องมี reason/audit แยก |
| GAP-08 | P1 | cart รองรับ 10,000 แต่หน้าปรับราคา/แก้บางหน้ามี read cap 500 | ใช้ pagination/fetch-all หรือกำหนด product limit ที่สอดคล้องกัน |
| GAP-09 | P1 | แก้ที่อยู่/ship-by หลัง spawn บางส่วน อาจทำให้ forwarder เก่าและใหม่คนละ snapshot | lock เมื่อ spawn ครั้งแรก หรือมี explicit propagate-with-audit |
| GAP-10 | P1 | customer paymethod input ยังมีในบาง UI แต่ server ตั้งใจ derive จาก carrier | เอา dead choice ออก หรือกำหนด business rule ใหม่ให้ชัด |
| GAP-11 | P1 | ความหมาย promo PCSF ใน catalog บอกลดค่าส่ง 50 แต่ current Mao lane ใช้ flat fee 100/coverage rule | owner ยืนยัน semantics แล้วรวม promo calculator กับ checkout money SOT |
| GAP-12 | P2 | ปุ่ม wallet-pay เก่าบางจุดยังอ้าง action ที่ปิดใช้; receipt batch ยอม partial missing IDs; billing CAS result บางทางไม่ตรวจ | cleanup UI + เพิ่ม strict batch/CAS tests |
| GAP-13 | P0 deploy | migration 0268 ยังไม่ได้ apply/dev-test กับฐานจริง | Dave review SQL แล้ว apply DEV ก่อน; ห้าม deploy status code โดยไม่มี migration |
| GAP-14 | P1 | compatibility rule ยังยอม forward-pull จาก hstatus 3 ไป 40/5 หากของถูก link และมาถึงก่อน admin กดสั่งร้าน จึงอาจข้าม `hdate4` | owner/Claude ยืนยันว่า physical truth ต้องชนะหรือบังคับ 3→4; ถ้ายอม jump ให้กำหนด timestamp/audit ของ stage ที่ข้าม |

## Verification record

ผ่าน:

- `pnpm test:shop-order-spine` — 40 admin workflow checks + status/migration/handoff/payment suites ผ่านทั้งหมด
- `pnpm test:unit` — ชุด unit ทั้งโปรเจกต์ผ่าน (exit 0)
- `pnpm typecheck` — ผ่าน (exit 0)
- ESLint เฉพาะไฟล์ที่เปลี่ยน — 0 errors, 0 warnings
- `git diff --check` — ผ่าน
- PostgreSQL 17 temporary-cluster integration — apply migration 0268 จริงและผ่าน multi-shop/comma/split `-N/M`/same-user/status 40→4 cancel+delete/`hdate5`/canonical reader scenarios
- Markdown link audit — 6,362 links / 1,492 files ผ่าน
- Next build compile — compile สำเร็จใน 4.5 นาที; standalone TypeScript ผ่าน

ยังไม่ได้ยืนยัน:

- ไม่ได้ apply migration กับ DEV/PROD และไม่มี write ใดไปฐานจริง
- เครื่อง worktree นี้ไม่มี `.env.local`, Docker และ Supabase CLI; จึงยังรัน Authenticated E2E หรือทดสอบกับ schema/data DEV จริงไม่ได้ (SQL migration ถูกทดสอบกับ PostgreSQL 17 ฐานชั่วคราวแล้ว)
- Next build runner ค้างเงียบหลังเข้าสู่ขั้น `Running TypeScript`; หยุดด้วยมือหลัง compile สำเร็จและ `pnpm typecheck` แยกผ่าน จึงไม่ถือว่า full build pipeline ผ่าน
- full repo lint มี baseline 182 errors / 194 warnings นอกขอบเขตไฟล์ที่แก้; targeted lint ของ patch ผ่านสะอาด
- `audit:all` หยุดที่ baseline env audit: 40 declared-but-unused และ 15 used-but-not-declared; markdown audit ผ่าน

## DEV acceptance scenarios หลัง apply 0268

1. สร้าง order 2 ร้าน โดยร้านหนึ่งมี tracking 2 token; spawn แล้วทุก forwarder เริ่ม fstatus 1 และ header ต้องคง 4
2. ทำให้ทุก token ถึง fstatus 2; header ต้องเป็น 40 และ member/admin ต้องเห็น linked fNo ชุดเดียวกัน
3. ใส่ cabinet ให้เพียงบาง token; header ต้องคง 40
4. ใส่ cabinet/ทำ fstatus 4 ครบทุก token; header ต้องเป็น 5 และมี `hdate5`
5. rollback token หนึ่งจาก arrived เป็น 1, เปลี่ยนเป็น 99 หรือลบแถว ขณะ header ยัง 40; header ต้องกลับ 4
6. ใช้ tracking base เดียวกันกับคนละ `userid`; ห้ามข้ามลูกค้า
7. ใช้ MOMO split `BASE-1/3`, `BASE-2/3`, `BASE-3/3`; member/admin/derive ต้องเห็น family เดียวกัน แต่ทุก parcel ต้องผ่าน stage
8. เลือก Yiwu + carrier ปลายทาง + tax invoice; forwarder ต้องได้ Yiwu code 2, paymethod 2 และ tax snapshot ครบ
9. ออก slip tax invoice; ยอดใน UI, QR และ `tb_wallet_hs.amount` ต้องตรงกันรวม VAT
10. ยิง spawn request ซ้ำพร้อมกันเพื่อพิสูจน์ GAP-03 ก่อนอนุมัติ production rollout

## Deployment order

1. Dave/Claude Code review migration 0268 และ residual GAP-01..14
2. Apply 0268 ที่ DEV และรัน acceptance scenarios ข้างต้น
3. Deploy application commit จาก `codex` เข้า integration branch ตามขั้นตอนทีม
4. ตรวจ data-health สำหรับ header 4/40/5 ที่ derive ไม่ตรง แล้วแก้เฉพาะ anomaly ที่ owner อนุมัติ
5. ยังไม่ merge/push `main` จนกว่าจะได้รับ Confirm
