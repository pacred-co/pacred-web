# โฟลการทำงาน Pacred — ภาษาพูด

> 2026-06-05 · เขียนแบบเล่าให้ฟัง ไม่ใช่ tech spec
> เปิดอ่านครั้งแรกใช้ ~15 นาที · ใช้เป็น brief ให้ทีมใหม่ก็ได้
> เวอร์ชัน technical (table + field name) อยู่ที่ `customer-and-admin-flow-2026-06-05.md`

---

# 🟦 ฝั่งลูกค้า — เริ่มจากสมัครยันได้ของ

## 1. ลูกค้าสมัคร

ลูกค้าเข้าเว็บ `pacred.co.th` กดสมัคร · กรอกเบอร์โทร · ระบบส่ง OTP ทาง SMS · ใส่รหัสผ่าน · ระบบสร้างบัญชีให้ + auto-assign เซลผู้ดูแล (round-robin ระหว่าง พี + เมย์) + ออกรหัสสมาชิก PR ให้อัตโนมัติ.

ถ้าเป็นนิติบุคคล มี step 2 ให้กรอกเลขผู้เสียภาษี + ที่อยู่ใบกำกับ. ระบบลอง lookup กับ DBD ให้ (ถ้า DBD endpoint ตอบ — บางครั้งล่ม ลูกค้ากรอกเอง).

พอจบ ลูกค้า land ที่ dashboard · เห็น popup โชว์เซลที่ดูแล + เบอร์โทรเซล (กันลูกค้าไม่รู้จะคุยกับใคร).

**🟠 หลังบ้านเกิดอะไร:**
- เซลที่ได้รับเห็นลูกค้าใหม่ในระบบ ที่ `/admin/customers` ของตัวเอง
- LINE staff group ขึ้น notify "ลูกค้าใหม่"
- เซลควรโทร/LINE ทักภายใน 24 ชั่วโมง (workflow ของทีม)

---

## 2. ฝากสั่งซื้อ (ลูกค้าให้ Pacred ช่วยซื้อของจาก 1688/Taobao)

นี่เป็น flow หลักของ Pacred. ลูกค้าไม่อยากเสียเวลาเปิด Alipay/WeChat เอง → ให้ Pacred ซื้อให้ คิดค่าบริการ.

**โซ่ลูกค้า:**

ลูกค้าเปิดหน้า search · paste link สินค้าจาก 1688/Taobao/Tmall · ระบบดึงข้อมูลผ่าน TAMIT/Laonet/AkuCargo · โชว์ราคา ¥ + รูป + ตัวเลือก SKU. ลูกค้าเลือก SKU + จำนวน · กดหยิบใส่ตะกร้า.

เปิดหน้าตะกร้า · ตรวจรายการ · ลบหรือแก้จำนวนได้ · กดส่งคำสั่งซื้อ (มี popup ยืนยันก่อน). ระบบสร้างออเดอร์ใหม่ status = **รอดำเนินการ**.

**🟠 หลังบ้าน (admin process):**

แอดมินเห็นออเดอร์ใหม่ใน `/admin/service-orders` · เปิดหน้าแก้ไข (`/edit`) — หน้านี้ออกแบบเป็น "PCS-style 1 หน้าจบ" มีทุกอย่าง: ลูกค้า / สินค้ารายการ / ราคา / ปุ่ม action.

แอดมินทำ 4 step ต่อกัน:
1. **แก้ราคา/จำนวน/ค่าส่งในจีน** ต่อ item → กดปุ่มแดง "บันทึก + เปลี่ยนเป็นรอชำระเงิน" → status **1→2** · ระบบส่ง SMS+LINE+email ให้ลูกค้า "รอชำระเงิน ภายใน 5 วัน"
2. ลูกค้าจ่ายเงิน — มี 2 แบบ:
   - **(แบบ A)** ลูกค้ากดเองที่หน้า /service-order/[hNo] "ชำระจาก wallet" (มี confirm) → ระบบหักเงิน wallet + status **2→3**
   - **(แบบ B · Pacred enhancement)** แอดมินกดแทนลูกค้าใน /edit Tier A2 panel "บันทึกชำระจาก wallet" หรือ "รับเงินสด/นอกระบบ"
3. **แอดมินใช้ Alipay จริงสั่งร้านจีน** → กลับมาที่ /edit · กรอก "เลขออเดอร์ร้านจีน" ต่อร้าน (ลูกค้าซื้อหลายร้านในออเดอร์เดียวได้) → กดบันทึก → status **3→4** · ลูกค้าได้ notify "สั่งสินค้าแล้ว"
4. **ร้านจีนส่ง tracking มา** → แอดมินกรอก tracking ต่อร้านใน /edit → กดบันทึก → ระบบ "ปั่น" tracking แต่ละตัวไปสร้าง `tb_forwarder` (status รอรับ) · status **4→5 = สำเร็จ** ของฝั่งฝากสั่งซื้อ

ตรงนี้ฝั่งฝากสั่งซื้อจบ. ของกำลังเดินทาง → เข้าโซ่ฝากนำเข้าต่อ.

---

## 3. ฝากนำเข้า (ของเดินทางจากจีนถึงไทย)

โซ่นี้มี 2 ทางเข้า:
- (path A) ลูกค้ากรอก tracking ที่ซื้อตรง 1688 ด้วยตัวเอง — เข้าหน้า `/service-import/add`
- (path B) จากฝากสั่งซื้อ step 4 ข้างบน auto spawn ให้
- (path C) MOMO/CN/JMF partner sync tracking มาให้เอง (ของลูกค้าที่ partner รู้จัก) — cron ทุก 10 นาที

**โซ่ status (`tb_forwarder.fstatus` 1→7):**

1. **รอเข้าโกดังจีน** — เพิ่งมา · ยังไม่ scan
2. **เข้าโกดังจีนแล้ว** — partner scan barcode รับเข้า · ลูกค้าได้ notify
3. **ลงตู้/เรือ/รถ** — partner ปิดตู้ → กำลังเดินทาง · เลข cabinet GZS260529-1 อะไรงี้
4. **ถึงโกดังไทย** — แอดมิน warehouse scan รับเข้า
5. **รอชำระเงิน** — แอดมินบัญชีกรอกน้ำหนัก/CBM/ค่าตี + คิดราคา → กดแจ้งชำระเงิน · ลูกค้าได้ SMS+LINE
6. **ลูกค้าชำระแล้ว** — ลูกค้ากด pay-bar ที่ /service-import?q=5 → หัก wallet · ระบบออกใบเสร็จอัตโนมัติ FRC{เดือน}-{เลข}
7. **ส่งของแล้ว** — driver scan barcode ขึ้นรถ · ลูกค้าได้ notify

**🟠 หลังบ้าน:**

แอดมินบัญชี (ภูม + team) ทำงานหลักที่ step 4-5:
- เปิด `/admin/forwarders` หรือ `/admin/forwarder-check` ดู forwarder ที่พร้อมเก็บเงิน
- คลิกแถวเข้า `/admin/forwarders/[fNo]/edit` กรอก weight + CBM + crate dimensions + เลือก transport-mode → ระบบคำนวณราคาให้อัตโนมัติ (มี VIP tier + custom rate + floor ป้องกัน undercut)
- กดบันทึก → กลับมาที่ list → ติ๊กหลายตัวพร้อมกัน → กด bulk "แจ้งชำระเงิน" → status **4→5** · ส่ง notify

หรือใช้ "ใบวางบิลรวม" (combine-bill) สำหรับลูกค้านิติบุคคลที่มีหลายตู้พร้อมกัน:
- ไปที่ `/admin/forwarders/combine-bill/add` เลือก forwarders หลายตัวของลูกค้าคนเดียว → สร้างใบ FRG{เดือน}-{เลข} → กดส่งให้ลูกค้า → SMS+LINE แจ้งพร้อม deep-link
- ลูกค้าคลิก link จาก SMS → เปิดหน้า `/billing-run/[id]` ดูบิลรวม → จ่ายทีเดียวครอบคลุมทุกตู้

**Driver:**
- เปิด `/admin/barcode/driver/import` (mobile-first · ออกแบบสำหรับมือถือ) · scan barcode ของขึ้นรถ → flip status เป็น 7

---

## 4. ฝากชำระสินค้า (Yuan Transfer / Alipay+WeChat)

ลูกค้าซื้อของกับร้านจีนเองแล้ว แต่ไม่มี Alipay/WeChat — ให้ Pacred ช่วยโอนให้.

**โซ่ลูกค้า:**
- เปิด `/service-payment/add` กรอกยอด ¥ + Alipay/WeChat ID หรือรูป QR
- ระบบเก็บไว้ status=1 (รอชำระเงิน) ตามอัตราซื้อหยวน (default 4.97 บาท/หยวน)
- ลูกค้ากด "ชำระจาก wallet" → หักเงิน → status=2 (ชำระแล้ว · รอแอดมินโอน)

**🟠 หลังบ้าน:**
- แอดมินเปิด `/admin/yuan-payments` ดูที่ pending → ใช้ Alipay/WeChat ของจริงโอนเงินไปร้านจีน
- กลับมาคลิก "อนุมัติ" → status=3 (โอนสำเร็จ) · ลูกค้าได้ notify

---

## 5. กระเป๋าสตางค์ (Wallet)

ลูกค้าต้องมีเงินใน wallet ก่อนถึงจะจ่ายฝากสั่งซื้อ/ฝากนำเข้า/ฝากชำระได้

**เติมเงิน:**
- เปิด `/wallet/deposit` กรอกยอดที่อยากเติม → กดสร้าง QR → PromptPay ของ Pacred (TaxID 0105564077716) ขึ้นมา
- ลูกค้า scan ด้วย mobile banking → จ่ายเสร็จ → upload สลิป
- กด "เติมเงิน" — **มี confirm modal** โชว์ "ยืนยันเติมเงิน ฿X · สลิป [ชื่อไฟล์] · ขนาด [KB]"
- ส่งคำขอเข้า admin queue · ลูกค้าได้ message "รอแอดมินตรวจสอบสลิป"

**🟠 หลังบ้าน:**
- แอดมินบัญชีเปิด `/admin/wallet?kind=deposit` ดู pending
- คลิกแถว → ดูรูปสลิป (signed URL) → กด approve → ระบบ credit wallet ลูกค้า · ลูกค้าได้ notify "เติมเงินสำเร็จ ฿X"
- หรือ reject + ใส่เหตุผล · ไม่ใส่เงิน

**ถอนเงิน:**
- เปิด `/wallet/withdraw` กรอกยอด + ธนาคาร + ชื่อบัญชี + เลขบัญชี
- กด "ยืนยันสั่งถอน" — **มี confirm modal** โชว์ "ยืนยันถอน ฿X · ค่าบริการ ฿Y · ยอดที่จะได้รับ ฿Z · เข้าบัญชี [ธนาคาร/ชื่อ/เลข] · ⚠️ ระบบจะหักจาก wallet ทันที"
- กดยืนยัน → wallet หักเงินเลย + คำขอเข้า admin queue · "7-10 วันทำการ"

> *ค่าบริการ 25 บาท ถ้ายอดถอน < 500 บาท · ขั้นต่ำ 25 บาท*

**🟠 หลังบ้าน:**
- แอดมินเปิด `/admin/withdrawals?status=1` ดู pending
- ใช้ bank app ของตัวเองโอนจริง → upload สลิปโอน → กด "จ่ายแล้ว" → status=2 · ลูกค้าได้ notify
- หรือ reject → ระบบคืนเงินเข้า wallet ลูกค้า · ลูกค้าได้ notify + เหตุผล

---

## 6. ใบกำกับภาษี + ใบเสร็จ

ลูกค้านิติบุคคลตั้ง `tax_doc_pref` ในโปรไฟล์ได้ 3 แบบ:
- **ใบกำกับภาษี** (default) — auto-ออกใบกำกับ + หัก WHT 1% หลังจ่าย
- **ใบขนสินค้า** — สำหรับลูกค้าเคลียร์ศุลกากรเอง (VAT base ต่างกัน · รอบัญชี sign off)
- **ไม่รับเอกสาร** — แค่ใบเสร็จเปล่าๆ

ทุกครั้งที่ payment ลง (hstatus=3 หรือ fstatus=6) ระบบ auto-issue ใบเสร็จเลข FRC{เดือน}-{ลำดับ} + ถ้า opt-in ก็ออกใบกำกับด้วย. ลูกค้า download ที่ wallet history.

---

# 🟧 ฝั่งแอดมิน — workflow ตามวัน

## เช้า · เปิด /admin หน้า dashboard

ดู KPI MTD + AR + pending counts. เช็คอะไรค้าง

## งานประจำวัน (แอดมิน accounting)

1. **เคลียร์ queue เติมเงิน** — `/admin/wallet?kind=deposit` · ดูสลิปลูกค้า · approve เร็วๆ (ภายในวัน) เพื่อให้ลูกค้าใช้ wallet จ่ายฝากสั่ง/ฝากนำเข้าได้
2. **เคลียร์ queue ถอนเงิน** — `/admin/withdrawals?status=1` · ถอนตามคิว 7-10 วัน
3. **เคลียร์ฝากสั่งซื้อ** — `/admin/service-orders` · status 1 (ใหม่) → แก้ราคา · status 3 (ลูกค้าจ่ายแล้ว) → ใช้ Alipay สั่งร้านจีน
4. **เคลียร์ฝากนำเข้า** — `/admin/forwarders` หรือ `/admin/forwarder-check` · status 4 (ของถึง) → กรอก weight/CBM → แจ้งชำระ
5. **เคลียร์ฝากชำระ** — `/admin/yuan-payments` · status 2 (ลูกค้าจ่ายแล้ว) → โอนผ่าน Alipay/WeChat
6. **ใบวางบิลรวม** — ลูกค้านิติบุคคลที่ต้องการบิลรวม · ตอนสิ้นเดือนรวมเป็นบิลเดียว

## งานประจำวัน (แอดมิน sales)

1. **โทรลูกค้าใหม่** — `/admin/customers` ที่ assign มา · โทรภายใน 24 ชั่วโมง
2. **CRM** — `/admin/crm` ดู LINE inbox · ตอบลูกค้า
3. **ดู commission ของตัวเอง** — `/sales` (customer-side view) หรือ `/admin/reports/sales-by-rep`

## งานประจำวัน (warehouse + driver · มือถือ)

1. **warehouse** — `/admin/barcode/cargo/import` scan barcode ของถึงโกดังไทย
2. **driver** — `/admin/barcode/driver/import` scan ของขึ้นรถส่ง (mobile-first UI)

## งาน super (พี่ป๊อป + เดฟ + ก๊อต + พี)

1. **ดู cockpit** — `/admin/reports/cockpit` · AR aging · margin advisory · MTD orders > 15k flag
2. **ดู KPI** — `/admin/kpi` · revenue + signups + wallet
3. **MOMO sync review** — `/admin/api-forwarder-momo/review` · check tracking ใหม่จาก MOMO · COMMIT เข้า `tb_forwarder`
4. **CRUD admin staff** — `/admin/admins` · เพิ่ม/แก้/เซ็ทเซลใหม่
5. **CRUD partner** — `/admin/partners` · directory พันธมิตร GOGO/JMF/MOMO ฯลฯ

---

# 📞 Notification ทำงานยังไง

ทุกครั้งที่ status เปลี่ยน — ระบบส่ง notify 4 ทางพร้อมกัน:

1. **SMS** ผ่าน ThaiBulkSMS (sender = "Pacred" · pool corporate)
2. **LINE OA push** ผ่าน @pacred (มี Flex card + deep-link ไปหน้าที่เกี่ยวข้อง)
3. **LINE staff group** — แจ้งแอดมินใน group "SA-MKT-PR Pacred" ตอนลูกค้าทำอะไรสำคัญ (สมัครใหม่ · submit cart · upload slip)
4. **Email** (optional · legacy compat) — สรุปคำสั่งซื้อ + ใบเสร็จ PDF

---

# ⚠️ จุดที่ต้องระวัง (lesson เก่าๆ)

1. **OTP rate limit** 3 ครั้ง/ชั่วโมง/เบอร์ — เทสบ่อยๆ จะติด · dev ใช้ `OTP_BYPASS=true`
2. **Vercel prod env ต้องตรง** — ถ้า env บน Vercel ยังเป็นค่าเก่า (เช่น TAMIT URL หรือ THAIBULKSMS_FORCE) จะ override code default · ของพังโดยที่ local ปกติ
3. **ลูกค้าเทสจ่าย slip** — แอดมินต้องมีคน approve ภายในวัน · ไม่งั้นลูกค้ารอ
4. **MOMO operator พิมพ์ผิด** — บางครั้ง user_code "023" ที่ MOMO กรอกผิด · เห็นรูปป้ายจริงก่อนเชื่อ field
5. **Cabinet vs routing batch** — เลขตู้จริง (GZS260529-1) ต้องอยู่ใน `fcabinetnumber` · ไม่ใช่ routing batch ID
6. **dual-write** — ทุกตารางที่ legacy + rebuilt มีคู่กัน (profiles ↔ tb_users · corporate ↔ tb_corporate) ต้อง dual-write เพื่อไม่ให้ split-brain

---

# 🎯 ก่อนเปิดรับลูกค้าจริง

ภูม เช็ค checklist นี้:
- [ ] Vercel prod env ครบ: `OTP_BYPASS=false` · `THAIBULKSMS_FORCE=corporate` · `PACRED_TAMIT_DETAIL_URL=…/api-product-2026` · `PROMPTPAY_ID=0105564077716`
- [ ] ThaiBulkSMS quota เหลือ + sender "Pacred" approve
- [ ] LINE OA quota plan (Free 300/เดือน → Light หรือ Standard)
- [ ] Migration ล่าสุด apply prod ครบ
- [ ] 13 admin recreate ผ่าน `/admin/admins/new` ครบ
- [ ] Sentry `NEXT_PUBLIC_SENTRY_DSN` set บน Vercel
- [ ] Admin staff schedule Day 1 พร้อม approve slip + ออกบิลภายในวัน
- [ ] เทส end-to-end จริง 1 รอบ (สมัคร → ฝากสั่ง → ฝากนำเข้า → จ่าย → ดูใบเสร็จ)

ครบหมดแล้ว = พร้อมเปิดรับลูกค้าจริง.
