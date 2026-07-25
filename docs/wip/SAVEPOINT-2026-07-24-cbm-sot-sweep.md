# 🔖 SAVEPOINT 2026-07-24 — คิว/กล่องเพี้ยนทั้งองค์กร (CBM SOT sweep)

> owner: *"มันลามไปยันโกดัง จัดส่ง และออกค่าคอมให้พนักงานทุกคนนะครับ ข้อมูลใช้คนละที่
> หรือแสดงผลคนละแบบก็แย่หมดสิครับ องค์กร"* + *"คอย auto keep context ให้หน่อยครับ
> งานจะได้ไม่หาย ... ไล่ทำให้ครบจบเลยครับ"*
>
> **ไฟล์นี้ = กันงานหายระหว่าง session.** ทำข้อไหนเสร็จให้ติ๊ก + push ทันที.

## 🔑 กฎที่ทุกจุดต้องยึด (SOT)

`lib/forwarder/quantities.ts` → **`totalCbmOf(row)`**
```
famountcount === '1'  → fvolume คือ "ยอดรวมทั้งแถว" แล้ว   → ห้ามคูณกล่องซ้ำ
อื่นๆ (ว่าง/legacy)    → fvolume คือ "ต่อกล่อง"            → ต้อง × famount
```
prod (2026-07-24): **937 แถว fac='1'** (ในนั้น **224 แถวหลายกล่อง** ← ตัวที่โดนคูณเกิน)
· **55 แถว fac ว่าง** (ในนั้น **15 แถวหลายกล่อง** ← ตัวที่โดน Σ ดิบนับขาด)

**อาการ 2 ทิศ — อย่าสับสน**
| ทิศ | โค้ดที่ผิด | ผลกับ fac='1' | ผลกับ fac ว่าง |
|---|---|---|---|
| คูณเกิน | `fvolume * famount` | 🔴 8.6 → **344** | ✅ ถูก |
| นับขาด | `Σ fvolume` ดิบ | ✅ ถูก | 🔴 นับขาด |

## ✅ เสร็จแล้ว (push `d5bf29cd`)

- [x] `admin/forwarders/warehouse-history/page.tsx` (2 จุด) — ประวัติโกดัง · เดิมคูณเกิน
- [x] `admin/forwarders/print/page.tsx` — ใบพิมพ์โกดัง · เดิมคูณเกิน
- [x] ทั้ง 2 ไฟล์ **ไม่เคย select `famountcount`** → เติมเข้า select + type แล้ว

## ✅ เสร็จรอบ 2 (push ถัดไป) — 10 จุดฝั่งคนขับ/จัดส่ง/CSV

- [x] `admin/drivers/new/page.tsx` (2 จุด) + `self-pickup-form.tsx` (3 จุด: Σ · sort · แสดงผล)
- [x] `admin/drivers/[id]/page.tsx` · `stickers` · `delivery-slip` · `run-document`
- [x] `admin/driver-runs/page.tsx` · `admin/printAll/page.tsx`
- [x] `actions/admin/export/warehouse-history.ts` — **CSV โกดัง คูณเกิน = บั๊กจริง** (ยามจับได้)
- [x] `actions/admin/pay-user-view.ts` — กฎถูกแต่ก๊อปสูตร → ต่อ SOT
- [x] ทุกไฟล์เติม `famountcount` เข้า select + type แล้ว

## ✅ เสร็จรอบ 3 — 10 จุดสุดท้าย + ยามเขียวทั้งระบบ + ลงทะเบียน test:unit แล้ว

- [x] `actions/admin/export/report-cnt.ts` (2 จุด) · `actions/admin/reports.ts` (2 query)
- [x] `actions/admin/forwarder-tran-th.ts` · `admin/cnt-hs/[id]` · `admin/billing-run` (list Σ)
- [x] `admin/reports/containers-awaiting-th` (2 จุด)
- [x] 🔴 `admin/reports/forwarder-volume` — **บั๊ก "กล่องผิด" ตัวจริง**: บวก famountcount
      (FLAG '1') เป็นจำนวนกล่อง ได้ 0/1 มั่วๆ → ใช้ famount จริง + คิวผ่าน SOT
- [x] `(protected)/service-import/table` (Σ + ต่อแถว) · `_tracking/tracking-page` (Σ กลุ่ม +
      ItemCell) · `forwarder-interactivity` (Σ ลูกค้า)
- [x] **type กลาง `ForwarderRow` (forwarder-row-view) += famountcount REQUIRED** —
      tsc บังคับทุก builder ส่งมา (optional = เงียบแล้วคูณผิดซ้ำ) → เติม select+map ครบ:
      payment-due · service-import list · [fNo] (รวม sibling query) · table
- [x] ยามลงทะเบียนใน package.json test + test:unit แล้ว (เขียวทั้งระบบ)

## ✅ ยาม กันกลับมาอีก — ทำแล้ว

- [x] `lib/forwarder/cbm-sot-guard.test.ts` — สแกนทุกไฟล์ใน app/lib/actions/components
      จับ 2 ทิศ: `fvolume * famount` (คูณเกิน) และ `+= fvolume` ดิบ (นับขาด)
      · ตัดคอมเมนต์ก่อนตรวจ (เอกสารพูดถึงสูตรได้ โค้ดห้ามเขียน)
      · allowlist = ไฟล์ที่เป็นเจ้าของกฎ + `split-box-rows-plan` (แถว momo_box_detail
        คือ 1 กล่องจริง ไม่มี famountcount ให้ยึด → Σ ดิบถูกแล้ว)
      🔴 **ยามนี้คือตัวที่หา 2 จุดที่ผมมองข้ามเจอ** (CSV โกดัง + pay-user-view)
         = พิสูจน์แล้วว่าคุ้มกว่าไล่ดูด้วยตา

## ✅ ตอบ owner ครบแล้ว

- [x] *"สถานะไปยังครับ รายการแต่ละแทรคกิ้งไปตามทั้งหมดยังครับ"* — probe prod:
      125 ครอบครัวหลายแถว → 121 สถานะตรงกันครบ · 4 ต่างเฉพาะ ≥5 (จ่าย/ส่งแยกใบ = ถูกโดยชอบ)
      · **0 แถวเพี้ยนในช่วงขนส่ง 1-4**
- [x] *"สถานะแรก มันคือ รอเข้าโกดังจีนไม่ใช่หรอครับ"* (2026-07-25) — ใช่ · หน้าแอดมิน
      `/admin/forwarders/[fNo]` TIMELINE ขั้น 1 เคยเขียน "เข้าโกดังจีน" แต่วันที่คือ
      `fdate` = วันเปิดงาน → เจอภาพประหลาด "เข้าโกดังจีน 27/06" มาก่อน "อยู่โกดังจีน 26/06"
      (MOMO คีย์งานย้อนหลัง = fdate มาทีหลังวันถึงโกดังจริง fdatestatus2).
      FIX: ขั้น 1 → **"รอเข้าโกดังจีน"** · ขั้น 2 "อยู่โกดังจีน" → **"ถึงโกดังจีน"**
      = ตรงหน้า edit + หน้าลูกค้า (stepWaitChinaWarehouse) + legacy-status-map แล้ว.
      หน้าอื่น sweep แล้วไม่มี class เดียวกัน (edit ถูกอยู่แล้ว · pay-user ใช้ fdatestatus2 ถูก).

## 📌 งานที่ทำจบไปแล้วใน session นี้ (อย่าทำซ้ำ)

1. ต้นทุนขาด ฿2,111.31 (famountcount ฝั่ง cost) — applied prod
2. นิติ 1% ไม่มีขั้นต่ำ + เอาป้าย "ขั้นต่ำ 1,000" ออก
3. ฟอร์ม 50 ทวิ ฝั่ง Pacred เป็นผู้หัก (AP) + mig 0280
4. หัวร้านค้า ฝากสั่งซื้อ (ร้านที่ N · ชิ้น · เฉลี่ย/ชิ้น · พาสเทล · ปุ่มย่อ/กาง)
5. ราคาเฉลี่ยต่อชิ้น — ทศนิยมตามจริง คูณกลับเป๊ะ (127/127 prod)
6. เบิ้ลกล่อง GZS260606-1 (bare 52047) — กำไรตู้ −5,279 → +1,480
7. เอกสารแจงแยก 1 บรรทัด = 1 แทรคกิ้ง (FRI2607-00071 7→14 บรรทัด ยอดเท่าเดิม)
8. ตรวจสลิป โครงกลาง `components/admin/slip-verify-step.tsx` (yuan + billing-run)
   🔴 เหลือ `wallet/[id]/edit-form.tsx` (997 บรรทัด) ยังไม่ย้าย
9. skill `mockup-first` (สกิลที่ 21) + AGENTS §0j
10. รวมงานภูม (PEAK docs) + ปอน (หน้าคนขับ) ขึ้น main

## ⚙️ กติกาเครื่อง (ย้ำ)

prod pw = chat-only · `npx tsx --env-file=.env.local scripts/run-data-health.ts` ·
build = `NODE_OPTIONS=--max-old-space-size=8192 node node_modules/next/dist/bin/next build` ·
⚠️ build ทับ `.next` = preview ตาย ต้อง `preview_start` ใหม่ ·
⚠️ public/*.html ไม่เสิร์ฟ → ทำ mockup ให้ inject ผ่าน `javascript_tool` แทน
