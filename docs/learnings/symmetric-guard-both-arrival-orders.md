# Guard ที่กันได้ทิศเดียว = อีกทิศเงินหาย (dedup guards must be arrival-order symmetric)

**เจอ 2026-07-23** (`899020867609` PR549 · 80kg ค้างไม่เข้าระบบ 1 วัน) — ต่อจาก
[`disjoint-lots`](../../CLAUDE.md) fix 2026-07-21.

## เรื่องย่อ

MOMO บางทีคีย์ **1 ชิปเม้น = 2 ล็อตจริง**: แทรคเปล่า (bare) เป็นล็อตของตัวเอง +
`-N` เป็นอีกล็อต. Dedup guard ตอน commit มี 3 เคส:

1. tracking ซ้ำเป๊ะ → refuse
2. **เข้ามาเป็น `-N` + มีแถว bare อยู่แล้ว** → refuse (กันเอากล่องไปซ้อนแถวรวม)
3. **เข้ามาเป็น bare + มีแถว `-N` อยู่แล้ว** → refuse (กันสร้างแถวรวมซ้อนกล่อง)

2026-07-21 ผมใส่ **disjoint-lots exception ให้เคส 3 อย่างเดียว** เพราะเคสที่ owner
ส่งมา (908007350691) บังเอิญ bare มาทีหลัง. พอเจอเคสที่ **bare มาก่อน** (899020867609:
bare 20.5kg/1 กล่อง commit ไปแล้ว แล้ว `-2` = 20kg × 4 = 80kg ตามมา) มันไปตกเคส 2
ที่ยังไม่มี exception → **refuse ทุกรอบ cron = 80kg ไม่มีทางเข้าระบบ = เก็บเงินขาด**
(≈ ฿1,360). ค้างเงียบ 1 วัน — เจอเพราะ data-health check `shipment_short_a_box` ไม่ใช่
เพราะมีคนสังเกต.

## บทเรียน

> **Guard ที่ตัดสินจาก "อะไรอยู่ในระบบแล้ว" มีจำนวนทิศเท่ากับลำดับการมาถึงของข้อมูล.
> แก้ทิศเดียว = อีกทิศพัง — และพังแบบเงียบ (refuse ไม่ใช่ error, ไม่มีใครเห็น).**

เวลาใส่ exception ให้ dedup/dup guard ให้ถามทันที: *"ถ้าข้อมูลชุดเดียวกันนี้มาถึง
สลับลำดับ จะตกเคสไหน และเคสนั้นมี exception เดียวกันหรือยัง"* ถ้าไม่มี = สร้างหลุมใหม่.

## วิธีทำให้ถูก (ที่ใช้จริง)

ใช้ **discriminator ตัวเดียวกัน** (`isAdditiveLotBare`) ทั้งสองทิศ แค่สลับ argument:

| ทิศ | `bareValue` | `siblingValueSum` |
|---|---|---|
| เคส 3 (bare เข้า) | น้ำหนักที่เข้ามา | Σ suffixed ที่ live |
| เคส 2 (`-N` เข้า) | น้ำหนัก bare ที่ live | น้ำหนักที่เข้ามา + Σ suffixed ที่ live |

**ห้ามส่ง `bareHasOwnBox: true` ลอยๆ** — ต้องอ่าน `momo_box_detail` มายืนยันว่า bare
มีบรรทัดกล่องของตัวเองจริง (resolved ≈ น้ำหนัก live ของมัน). ตัวนี้แหละคือตัวที่กัน
เคสอันตราย PR050 (`519218029029`): แถวรวม 36.5kg + กล่องแรก 16.5kg เข้ามา — ค่ามัน
"ไม่เท่ากัน" เลยดู disjoint หลอกๆ ผ่าน value-check ได้ แต่ **แถวรวมไม่มีบรรทัดกล่อง
ของตัวเองใน box_detail** → `bareHasOwnBox=false` → fail-closed → refuse ถูกต้อง.

ตารางตัดสินที่ล็อกไว้ (verify แล้วทั้ง 4 เคส):

| เคส | bare | Σ siblings | own box | ผล |
|---|---|---|---|---|
| 899020867609 (จริง · disjoint) | 20.5 | 80 | ✓ | **ALLOW** |
| PR050 กล่องแรกเข้า | 36.5 | 16.5 | ✗ | REFUSE |
| aggregate ที่ Σ ตรง | 36.5 | 36.5 | ✓ | REFUSE |
| 908007350691 (ทิศเมื่อวาน) | 112.5 | 10.5 | ✓ | **ALLOW** |

## ผลพลอยได้

Data-health check ที่เขียนไว้ (`shipment_short_a_box`) **จับได้เอง** — นี่คือคุณค่าจริง
ของ 4-LAYER RULE (write-guard → cron heal → sweep → standing invariant check).
ถ้าไม่มีชั้น 4 เคสนี้จะโผล่ตอนลูกค้าทวงของ หรือตอนปิดบัญชีแล้วยอดขาด.

Related: [`audit-discipline.md`](audit-discipline.md) · [`data-health-invariant-monitor.md`](data-health-invariant-monitor.md)
