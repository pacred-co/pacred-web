# MOMO packing-list XLSX → main table ingest (item 8 · plan · 2026-07-07)

> พี่ป๊อป spec §4 "MOMO 2 modes: (1) ดึง API (2) **อัพไฟล์**". ภูม ส่งไฟล์จริง =
> `C:\Users\Admin\Downloads\PR20260614-SEA01 (1).xlsx` (MOMO export ต่อ 1 ตู้).
> **Format decoded · parser gotcha found · build = พรุ่งนี้ (fresh context · money-adjacent ห้ามรีบ).**

## ไฟล์จริง = MOMO packing list ต่อตู้ (Sheet1 · A1:R12)
- **row 0:** `PACKING LIST: 2026-06-14 SEA01` (ชื่อ list)
- **row 2 (meta header):** `COMPANY NAME:` · `TRACKING:` · `QUANTITY:` · `TOTAL WEIGHT:` · `TOTAL CBM:` · `CONTAINER NAME:` · `CONTAINER CODE:`
- **row 3 (meta values):** `PACRED CARGO CO., LTD.` · `3` (จำนวน tracking) · `7` (qty) · `510` (kg รวม) · `1.569334` (CBM รวม) · **`GZS260617-1`** (ชื่อตู้ · = fcabinetnumber) · `-` (code)
- **row 5 = data header (18 คอลัมน์ A–R):**
  `Trans.` | `SM. Date` | `Branch` | `Product` | `Dum` | `Type` | `Code` | `Tracking` | `Width` | `Length` | `Height` | `Parcel Count` | `Weight(KG)` | `CBM` | `Total Weight` | `Total CBM` | `Remark Number` | `CG`
- **row 6+ = parcel rows** (1 แถว/พัสดุ ในตู้นี้)

### column → field mapping (ทำพรุ่งนี้ · ยืนยันกับ momo_import_tracks schema ก่อน)
| xlsx col | ความหมาย | ปลายทาง (คาดการณ์) |
|---|---|---|
| Container Name (meta) | เลขตู้ GZS/GZE | `momo_container_no` / tb_forwarder.fcabinetnumber |
| Code | รหัสลูกค้า PR | (join) tb_forwarder.userid |
| Tracking | เลขพัสดุจีน | `momo_tracking_no` / ftrackingchn |
| Width/Length/Height | ขนาด ซม. | fwidth/flength/fheight |
| Parcel Count | จำนวนกล่อง | famount |
| Weight(KG) / Total Weight | น้ำหนัก | weight_kg / fweight |
| CBM / Total CBM | ปริมาตร | cbm / fvolume |
| CG | CG_NO พัสดุย่อย | raw.CG_NO / cg_no |
| Type / Trans. | ประเภท/ขนส่ง | ftransporttype (SEA→เรือ) |

## 🔴 GOTCHA (สำคัญ · เสียเวลาไปแล้ว)
ไฟล์นี้ใช้ **inline strings** (ไม่มี `xl/sharedStrings.xml`) → **SheetJS `xlsx` (ทั้ง `readFile` และ `read(buffer)`) parse พัง** — คืน raw ZIP-XML แทน cells (`!ref` ได้ `A1:B32` แทนที่จะเป็น `A1:R12`).
- **วิธีที่ใช้ได้ (พิสูจน์แล้ว):** unzip xlsx (มันคือ ZIP) → parse `xl/worksheets/sheet1.xml` เอง (cells เป็น `<c r=".." t="inlineStr"><is><t>ค่า</t></is></c>` สำหรับ string · `<v>` สำหรับ number). สคริปต์ python ที่ decode สำเร็จอยู่ในประวัติ session นี้.
- **⚠️ อย่าใช้ SheetJS ตรงๆ กับไฟล์นี้** — ต้อง custom unzip+XML parse (หรือหา SheetJS option ที่รองรับ inline-str) → **เขียน unit test ด้วยไฟล์นี้เป็น fixture**.

## แผน build (พรุ่งนี้ · 3 ชิ้น)
1. **parser** `lib/admin/momo-packing-xlsx-parser.ts` (pure · no IO): buffer → `{ container, totals, rows:[{tracking,code,weight,cbm,w,l,h,parcelCount,cg,...}] }`. unzip+sheet1.xml. **+ test** (fixture = ไฟล์ ภูม).
2. **UI** อัพไฟล์บน `/admin/api-forwarder-momo/sync` (โหมด "อัพไฟล์" คู่กับ API) → parse → **PREVIEW** (reuse ตาราง preview เดิม) → ยืนยัน. อัพซ้ำช่องเดิมได้ (spec).
3. **ingest** → upsert `momo_import_tracks` (reuse commit path เดิม / momo-isolated). **money-adjacent** (feed cost/status) → §0e verify ตารางปลายทาง · gate · dry-run/preview ก่อน commit เสมอ.

## หมายเหตุ
- ตู้ในไฟล์ (GZS260617-1) = SEA = เรือ (ตรง `lib/forwarder/cabinet-transport.ts`).
- format นี้ใกล้ packing list แต้ม (taem-reconcile-parser) แต่ **คอลัมน์ไม่ตรงกันเป๊ะ** — คนละ parser.
