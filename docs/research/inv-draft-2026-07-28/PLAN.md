# 📄 Invoice / Packing List / ใบขน (NetBay) — ยกระบบ inv_draft_system2 เข้า Pacred

> SAVEPOINT 2026-07-28 (ภูม + Claude) · **ขั้น MOCKUP — ยังไม่ลงโค้ดจริง** · รอ ภูม/เดฟ/พี่ป๊อป คอนเฟิร์ม mockup ก่อน
> mockup ล่าสุด = `docs/research/inv-draft-2026-07-28/mockup.html` (v3)
> resume พรุ่งนี้: `cp docs/research/inv-draft-2026-07-28/mockup.html public/_tmp/inv-draft-mockup.html` → เปิด `localhost:3000/_tmp/inv-draft-mockup.html` (⚠️ ลบออกจาก public/ ก่อน commit เสมอ · §0j)

## เป้าหมาย
ยกโปรแกรม **inv_draft_system2** (Python Tkinter ที่ ภูม เขียนตอนเป็น DOC บริษัทเก่า) เข้า Pacred — ให้พนักงาน DOC ทำ **Commercial Invoice + Packing List + ไฟล์ NetBay (ใบขน)** ได้โดยไม่ต้องคีย์มือ/กอปวางเอง.

## ระบบเดิมทำงานยังไง (แกะจาก source จริง — `C:\Users\Admin\Desktop\inv_draft_system2\inv_draft_system2\`)
ไฟล์หลัก: `main.py` (Tkinter GUI · 649 บรรทัด) · `processor.py` (ตรรกะ+สูตร+สร้าง Excel) · `sheets_client.py` · `template.xlsx` (ชีต PACKING + Invoice + **Invoice2**)

**โฟลจริง (ยืนยันจากโค้ด):**
1. **โหลด Orders** จาก Google Sheet master ("สถานะงาน") หลาย URL — `parse_main_sheet` อ่านคอลัมน์: `order · sea_ek(SEA/EK) · link(ลิงค์ฟอร์ม Vat) · mark(สถานะงาน ใบขน) · vat(ยอด VAT) · duty(อากร) · month`. **ไม่มีคอลัมน์ "ตู้"** ในเครื่องมือเดิม
2. **กรอง** — `filter_rows` = `[r for r in data if not r["done"] and r["link"]]` → เอา**เฉพาะที่ยังไม่ done** · `done` = ช่องสถานะมีคำใน `MARKS_DONE_LIST` = ["ลงครบแล้ว","ยิงใบขนแล้ว","ลงใบขนแล้ว","เสร็จแล้ว","ส่งแล้ว",…] (processor.py:22-24, 131) → **งานที่ยิงใบขน/ได้เลขตู้แล้ว = done = หลุดจากลิสต์**
3. **☑ ติ๊กเลือกหลายออเดอร์** (Treeview `selectmode="extended"`) → `_calc_summary_thread` ดึง items จาก detail sheet ของแต่ละออเดอร์ที่ติ๊ก แล้ว**รวมอากร+ภาษี โชว์สดบนแถบสรุป** (สี `#1a1a2e`/`#00d4ff`) → **DOC ปรับติ๊กจนอากร+ภาษีอยู่ในกรอบที่ต้องการ** (main.py:385-497)
4. ใส่ **Invoice No + วันที่ + USD Rate** (แก้ได้ต่อใบ · default 31.41)
5. **🚀 สร้าง Excel** — `create_excel` รวมทุกบรรทัดของออเดอร์ที่ติ๊ก → เท template ชีต Invoice2 + PACKING → ออกไฟล์

**detail sheet (ต่อออเดอร์)** — `parse_dest_sheet` มี 2 section: form บน (HS, %อากร) + export table ล่าง (price USD, EN). คอลัมน์: EN · HS/พิกัด/tariff · %อากร · price USD. `%อากร normalize`: `duty_pct = val/100 if val>1 else val` (10 → 0.10)

## สูตร (ยืนยัน — เหมือนเดิมเป๊ะ · ตรงกับ Invoice2 formula XML + main.py:455-464)
```
มูลค่าบาท (P) = price_usd × rate
อากร (S)      = P × duty_pct
ก่อน VAT (T)  = P + S
VAT (V)       = T × 0.07
รวมภาษี (W)   = S + V
อากรจริง = ΣS · ภาษีจริง = ΣW
```
Pacred มี `lib/forwarder/import-duty-vat.ts` = สูตรเดียวกันอยู่แล้ว.

## Output (ยึดหน้าตาไฟล์จริงที่ DOC ใช้ — `Invoice+packing list.pdf`)
- **หน้า Packing List**: Item · Mark&No · Cartons · Description · Total Qty(PCS) · Gross Weight(KGS) + Total CTNS/Qty/Weight
- **หน้า Commercial Invoice**: Item · Marks · Description · Qty(PCS) · U/Price(USD) · Amount(USD) + CIF total + U.S. DOLLARS
- ต่อ 1 Invoice/ตู้ (เช่น GZS260625-5T = 30 บรรทัด · CIF 12,092.49 · 601 CTNS · 14,150 KGS)
- **Invoice/Packing ที่ส่งจีน+ศุลกากร ไม่โชว์ VAT** (VAT ใช้ต่อฝั่งใบกำกับ/ประเมินภายใน)

## NetBay CSV (`templateแบบcsvเพื่ออัพเข้าnetbay.csv`) = output ที่ 3
เดิม DOC ทำ Invoice+Packing เสร็จ ต้องมานั่งกอปวางทำ CSV เอง → **ต้องกดออก CSV ได้เลย**
28 คอลัมน์: `Invoice Number · Invoice Date · Incoterm(CIF) · Importer Code · Net weight · weight Unit(KGM) · Package · Package Unit(CT) · Eng Des · Tarrif Code(HS) · Thai Des · Qty · Qty Unit(C62) · Quantity(detail) · Quantity Unit(detail) · Unit Price · Amount · Curr×3(USD) · Origin Country×2(CN) · Brand Name(NO BRAND) · ShippingMark · Purchase Order No · Term Of Payment · Product year · USER(PACRED00N)`

## ✅ การตัดสินใจที่เคาะแล้ว (ภูม)
1. **Output = ทั้ง PDF และ .xlsx** (ข้อ 1 = ค.)
2. **ข้อมูลรายบรรทัด = ทำหน้ากรอก + auto เติมส่วนที่เรามี** (ข้อ 2) —
   - 🟢 auto: **HS ดึงจากคลัง HS เรา (mig 0224)** — พนักงานแค่รีเช็คว่า HS ถูก · น้ำหนัก/ลัง จากงานนำเข้า
   - 🟡 DOC กรอก/วาง: EN · ราคา USD สำแดง · %อากร (ถ้าคลังไม่มี HS) — เพราะ EN+USD สำแดงไม่มีในระบบ (ระบบเก็บชื่อไทย+ต้นทุน¥/ขาย฿)
   - ⬜ ระบบคำนวณ: บาท/อากร/VAT
3. **หน้าใหม่แยก** (ข้อ 3 = ข.) — ผูก role DOC
4. **สูตรเดิม** (ข้อ 4) — ยืนยันแล้วไม่เปลี่ยน
5. **NetBay CSV** (ข้อ 5) — กดปุ่มออก CSV ได้เลย · **Importer = PACRED (THAILAND) CO., LTD.** · encoding ตามไฟล์เดิม (TIS-620/cp874)
6. 2 ชีต Google (PCS FRIEGHT/CARGO ใบกำกับภาษี + PACRED ใบกำกับภาษี) = source ที่จะใช้
7. **ลิสต์ = เฉพาะออเดอร์ที่ยังไม่มีเลขตู้** (ยังไม่ done) — มีเลขตู้ = ทำแล้ว = หลุดจากลิสต์ · **เลขตู้/Invoice กำหนดตอนกดออกใบ** ไม่ใช่มีก่อน · **ตัดคอลัมน์ "ตู้" ออกจากลิสต์**
8. **ไม่เอา** ของแถม "ช่องเป้าหมายอากร/ภาษี + แถบเขียว/แดง"

## 🔴 คำถามค้าง (ถาม ภูม พรุ่งนี้)
1. **NetBay CSV มี 2 ช่อง Qty** (`Qty`=50 กับ `Quantity detail`=1 ต่อบรรทัด HAND PUMPS) — อันไหน map กับอะไร
2. **done-signal ใน Pacred** = ผูกกับ field ไหน (fcabinetnumber ว่าง? / สถานะใบขน?) — งานนำเข้าไหนที่ "ยังไม่ออกใบ"
3. **แหล่ง per-line ในระบบ** — ตอนนี้ EN/USD สำแดง DOC สร้างเอง (ไม่มีในงานนำเข้า) → หน้ากรอกเก็บที่ไหน (ตารางใหม่ต่อ invoice-line?)

## ➡️ Next (พรุ่งนี้)
- ภูม/เดฟ/พี่ป๊อป ดู mockup v3 → คอนเฟิร์ม/ปรับ
- ตอบ 3 คำถามค้าง
- แล้วค่อยลงโค้ดจริง (หน้าใหม่ · reuse import-duty-vat.ts · คลัง HS · PDF infra · + NetBay CSV export)
