# 🧰 คลังเครื่องมือ "งานเฟรท" — ของที่เก็บไว้ หยิบมาใช้ได้ตอนไหน

> **owner 2026-08-07:** *"หลังบ้านนี่เราว่าต้องใช้ครับ แต่แค่จะเอามาประกอบตอนไหนส่วนไหน
> **นายต้องเป็นคนจด tools ไว้ครับ** ตอนที่เราให้ทำอะไร แล้วได้จังหวะอันไหนมาใช้
> ดึงอันไหนที่เคยเก็บไว้ ก็หยิบมานำเสนอเอาครับ"*
>
> ⇒ ไฟล์นี้ = **บัญชีของที่มีในมือ** ไม่ใช่ของที่จะทิ้ง. ทุกครั้งที่ owner สั่งงานใหม่
> ที่แตะเรื่อง **ราคา/ขนส่งระหว่างประเทศ/เอกสารศุลกากร/ใบเสนอราคา/คอมมิชชั่น** →
> **เปิดไฟล์นี้ก่อน** แล้วเสนอว่า "อันนี้เคยทำไว้แล้ว หยิบมาต่อได้เลย" แทนที่จะเขียนใหม่.

**สถานะข้อมูลจริง (วัด prod 2026-08-07):** ทั้งกองเฟรท **ไม่เคยมีงานลูกค้าจริงสักงาน** —
`freight_quotes`/`freight_invoices`/`freight_parties`/`freight_quote` = **0 แถว** ·
`freight_shipments` 144 แถว = seed/mock ล้วน (PRMOCK + PR2605xxxx ไล่เลข · 0 มี B/L ·
หยุดนิ่งตั้งแต่ 30/06) · `bookings` 6 แถว = MOCK ของปอน. ⇒ **โค้ดพร้อม แต่ยังไม่เคยรับงาน**
= เอามาต่อยอดได้ทันทีโดยไม่ต้องกลัวข้อมูลเก่าพัง.

---

## 1) 💰 เครื่องคิดราคา / เรทเฟรท
| ไฟล์ | ทำอะไร | หยิบมาใช้ตอนไหน |
|---|---|---|
| `lib/freight/rate-engine.ts` (+ `.test`) | เครื่องคิดค่าระวางเฟรท | ตอนทำ "ใบเสนอราคาเฟรท" ใหม่ |
| `lib/freight/rate-lookup.ts` · `rate-lookup-math.ts` | จับคู่เรทตามเส้นทาง (POL/POD) + ลำดับความสำคัญ | ตอนต้องเลือกเรทตามท่าเรือ/เส้นทาง |
| `lib/freight/rate-model.ts` | โครงข้อมูลเรท (ประเภท·หน่วย·สกุลเงิน) | ออกแบบตารางเรทใหม่ |
| `lib/freight/warehouse-calc.ts` | คิดค่าโกดัง/ค่าเก็บของ | งานคิดค่าฝากเก็บ |
| `lib/freight/public-estimate.ts` | ประเมินราคาให้คนนอกดูหน้าเว็บ | ทำหน้า "เช็คราคาเบื้องต้น" |
| `tb_freight_rate` (3 แถว) | ตารางเรทต้นทุนฝั่งจีน | มีข้อมูลตัวอย่างให้ดูโครง |

## 2) 🚢 สถานะงาน / เส้นทางเดินงาน
| ไฟล์ | ทำอะไร | หยิบมาใช้ตอนไหน |
|---|---|---|
| `lib/freight/journey-catalog.ts` | **สถานะ 38 ขั้น × 5 รูปแบบขนส่ง × 3 เฟส** + ตารางสิทธิ์ 8 ตำแหน่ง (ใครขยับสถานะไหนได้) | **ของดีที่สุดในกอง** — ตอนทำ flow งานใหม่ (เฟรท/ส่งออก) หยิบมาเป็นแม่แบบได้เลย |
| `lib/freight/journey-status.ts` · `shipment-journey-view.ts` | แปลงสถานะ → สิ่งที่จอแสดง (ไทม์ไลน์) | ทำจอติดตามงาน |
| `lib/freight/lead-status.ts` | สถานะลูกค้ามุ่งหวัง (ใหม่→ติดต่อแล้ว→เสนอราคา) | ทำคิวติดตามลูกค้าใหม่ |
| `lib/freight/freight-queue-keys.ts` | คีย์คิวงานต่อตำแหน่ง | ทำ workspace รายตำแหน่ง |

## 3) 📄 เอกสารศุลกากร / เอกสารเดินเรือ (PDF) — **ของหายาก ทำใหม่แพง**
| ไฟล์ | ทำอะไร | หยิบมาใช้ตอนไหน |
|---|---|---|
| `components/pdf/freight-form-e.tsx` + `app/api/freight-invoice/[id]/form-e/` | **ฟอร์ม E (ACFTA)** ลดอากร | ลูกค้าขอฟอร์ม E |
| `components/pdf/freight-do-letter.tsx` + `.../do-letter/` | **ใบปล่อยสินค้า D/O** | งานออกของ |
| `components/pdf/freight-commercial-invoice.tsx` | Commercial Invoice (อินวอยซ์ศุลกากร) | ยื่นศุลกากร |
| `components/pdf/freight-packing-list.tsx` | Packing List | ยื่นศุลกากร |
| `components/pdf/freight-receipt.tsx` | ใบเสร็จเฟรท | ตอนเปิดเก็บเงินเฟรท |
| `lib/customs/customs-letters.ts` + `app/api/customs-letter/` | **หนังสือ 45 วัน · มอบอำนาจ · ขอแก้ใบขน · ใบขนหาย** | งานเดินเอกสารศุลกากร |
| `lib/customs/form-e.ts` · `hs-assist.ts` · `port-codes.ts` · `declaration-fees.ts` | เกณฑ์ฟอร์ม E · ช่วยหาพิกัด · รหัสท่า · ค่าธรรมเนียมใบขน | งานพิธีการ |
| `components/pdf/customs-declaration.tsx` | ใบขนสินค้า PDF (**ใช้อยู่ 14 ที่ — คาร์โก้ก็ใช้**) | ⚠️ ห้ามลบ |

## 4) 🧾 ใบเสนอราคา
| ไฟล์ | ทำอะไร | หมายเหตุ |
|---|---|---|
| `components/quote/quote-paper.tsx` | กระดาษใบเสนอราคา (พิมพ์ได้) | ⚠️ **workspace/booking ที่เก็บไว้ใช้อยู่** ห้ามลบ |
| `components/quote/editable-quote-card.tsx` | การ์ดแก้ใบเสนอราคา | ต่อยอดฟอร์มใบเสนอราคา |
| `components/freight-quote/FreightQuoteWizard.tsx` | wizard ขอราคาหลายขั้น (หน้าเว็บสาธารณะ) | ทำหน้า RFQ ใหม่ |

## 5) 💵 คอมมิชชั่นเฟรท (ปิดไว้ ไม่เคยเปิด)
| ไฟล์ | ทำอะไร | ต้องมีอะไรก่อนเปิด |
|---|---|---|
| `lib/freight-commission/calc-v2.ts` · `flag.ts` (+2 เทส) | คิดคอมเฟรทตามขั้น + ธงเปิด/ปิด | owner ยืนยันเรทคอมแต่ละขั้นก่อน (`freight_commission_tiers` 4 แถว รอยืนยัน) |
| `actions/admin/freight-commission.ts` | ลงบัญชีคอม (idempotent · ไม่จ่ายอัตโนมัติ) | เปิดธง `commission.freight_enabled` |

## 6) 🗂 ตัวเขียนข้อมูล (actions) — โครงงานครบวง
`actions/admin/freight-leads.ts` (คิวลูกค้ามุ่งหวัง) · `freight-quotes.ts` (ใบเสนอราคา ร่าง→อนุมัติ→แปลงเป็นงาน) ·
`freight-shipments.ts` (สร้าง/แก้งาน) · `freight-shipment-workflow.ts` (ขยับสถานะตามสิทธิ์ + log) ·
`freight-invoices.ts` (ออกใบแจ้งหนี้ + VAT/WHT) · `freight-invoice-payments.ts` (รับชำระ) ·
`freight-ops-cockpit.ts` (บอร์ด PRICING→SALES→DOC→ACC) · `freight-rates.ts` (ดูแลเรท)
→ **หยิบมาดูเป็นแม่แบบ flow ได้ทั้งชุด** ตอนต่อ workspace ใหม่เข้ากับฐานข้อมูลจริง

## 7) 👤 หน้าฝั่งลูกค้า (เก็บไว้ตามคำสั่ง owner 2026-08-07)
`(protected)/freight/page.tsx` (หน้าแรกบริการเฟรท) · `freight/booking` (ลูกค้าขอราคาเอง) ·
`freight/quotes/[quote_no]` (ดู+กดตอบรับใบเสนอราคา) · `freight/shipments` + `[id]` (ติดตามงาน) ·
`(public)/freight-quote` (wizard คนนอก)
→ **โครงหน้าจอฝั่งลูกค้าครบแล้ว** ตอนเปิดบริการเฟรทจริง หยิบมาต่อได้ทันที (ยังไม่มีลูกค้าเคยใช้ = แก้ได้อิสระ)

---

## ⚠️ ของที่อยู่ในโฟลเดอร์ "freight" แต่ **เป็นของคาร์โก้** — ห้ามแตะ
| ไฟล์/หน้า | ความจริง |
|---|---|
| `lib/freight/shipping-methods.ts` | **ทะเบียนชื่อขนส่งไทย** (Flash/J&T/นครเขื่อนขันธ์ฯ ฯลฯ) — **16 ที่ใช้** ทั้งคาร์โก้ |
| `(protected)/freight/invoice/[id]` | ใบแจ้งหนี้ **ฝากนำเข้า** (คาร์โก้) — แค่วางผิดโฟลเดอร์ |
| `(protected)/freight/receipts/print/[id]` | ใบเสร็จ **ฝากนำเข้า** — ลิงก์จาก `/service-import/[fNo]` |
| `components/pdf/customs-declaration.tsx` | ใบขน PDF ที่คาร์โก้ใช้ (14 ที่) |
| `components/quote/quote-paper.tsx` | ใบเสนอราคาที่ workspace ใช้ |

---

## สถานะหลังคลีน 2026-08-07 — อะไรอยู่ อะไรไป

**ยังอยู่ในระบบ (เปิดอ่าน/หยิบใช้ได้ทันทีตาม path ข้างบน):**
ทุกอย่างในหมวด 1-7 — เครื่องคิดเรท · journey-catalog · PDF ศุลกากรทุกใบ · ใบเสนอราคา ·
คอมมิชชั่น · actions ทั้ง 8 ตัว · **หน้าฝั่งลูกค้าทั้งหมด**.

**ตัดออกแล้ว = เฉพาะ "หน้าจอฝั่งแอดมิน"** (commit `b49103b6` · 79 ไฟล์) —
`/admin/freight/*` · `/admin/accounting/{freight,customs-declarations,cargo-declarations,customs-doc-kit,hs-triage,hs-consult}` ·
`/admin/pricing/taxdoc-workspace` · `/admin/commission/freight` · `/admin/withdrawal/freight-th-list` ·
`/admin/bookings` · `/admin/tax-invoices` · `/admin/cargothai` · `workspace/booking/{export,other,shop-order,yuan-transfer}`.
เหตุผล: prod ไม่เคยมีงานลูกค้าจริงสักงาน (วัดแล้ว — ดูหัวไฟล์) แต่กินที่ในเมนู
ทำให้คนทำงานคาร์โก้หลง. **ตัวเครื่อง (backend) ไม่ได้ตัด** → พอจะเปิดบริการเฟรทจริง
เขียนหน้าจอใหม่ให้ตรงงานจริงได้เลย โดยไม่ต้องสร้างเครื่องใหม่.

**กู้หน้าจอเดิมกลับมาดู:**
```bash
git show b49103b6^:'app/[locale]/(admin)/admin/freight/operations/page.tsx'
git log --all --diff-filter=D -- 'app/[locale]/(admin)/admin/freight/**'
```

**เก็บไว้แต่ไม่มีหน้าให้เข้าแล้ว** (นับ/คิดได้ แต่ไม่มี UI): `lib/freight/freight-queue-keys.ts`
(กลไกนับคิวงานเฟรท · เทสยังล็อกไว้ที่ `lib/admin/workspace.test.ts`) — พอทำหน้าใหม่ ต่อกลับได้ทันที.

**กติกาของผม (Claude):** ก่อนเริ่มงานที่แตะ *ราคา · ขนส่งระหว่างประเทศ · เอกสารศุลกากร ·
ใบเสนอราคา · คอมมิชชั่น · สถานะงานหลายขั้น* → **อ่านไฟล์นี้ก่อน** แล้วเสนอ owner ว่ามีของเดิม
ชิ้นไหนหยิบมาต่อได้ ก่อนจะเขียนใหม่.
