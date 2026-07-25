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

## ✅ 2026-07-25 — ตู้อี้อู 4 ตู้ใหม่ (owner ส่งไฟล์) + integrate ภูม TTW

- [x] **integrate ภูม 716197c2** (ปุ่มสร้าง+ผูกตู้+เลื่อนสถานะ + ตู้แดง/ขาว + tabs) —
      review-fix 1 จุด: เขียน fcabinetnumber ต้องผ่าน `cabinetWriteGuard` (chokepoint ที่ 13)
- [x] **ingest 4 ตู้** YWS260720-9T · YWS260722-10T · YWS260723-1T · YWS260724-2T →
      `ttw_packing_line` **209 แทรค** (script `ingest-ttw-packing-2026-07-25.ts` · backup แล้ว)
- [x] **จับคู่ PR ได้ 7 ราย** (verify กับ tb_users ทุกตัว): มาร์ค PR### 6 + **PCS10830→PR10830**
      (โค้ด PCS เก่า = PR เลขเดิมตาม migration) · ที่เหลือ 202 = มาร์คบริษัทอื่นใน TTW รวมตู้
      (SPK/SP/MG/KD/…) — ของเราเท่านั้นที่แตะ ห้ามเดา
- [x] **อัพเดทแถวที่มีในระบบแล้ว 4 แทรค / 5 แถว** (X9002888=PR032 · X9002904-1/2,-2/2=PR609 ·
      X9002914=PR594 · X9002920=PR613): ผูกตู้จริง (ผ่าน guard · เฉพาะช่องว่าง) + เลื่อน 2→3
      กำลังส่งมาไทย + stamp fdatestatus3 + link staging (`link-ttw-staged-to-forwarder-2026-07-25.ts`
      = logic ปุ่มภูม 100% · money-free · re-run = 0 · userid ตรงมาร์คครบ ไม่มี mismatch)
- 🔵 **เหลือให้ DOC กดสร้าง 3 ราย** (ยังไม่มี tb_forwarder · สร้าง = auto-price = คนกดตามโฟลว์ภูม):
      X9002898 = **PR269** (ตู้ 9T · 1 กล่อง 1.3kg) · X9002936 = **PR596** (ตู้ 1T · 1 กล่อง 11kg) ·
      X9002962 = **PR10830** (ตู้ 2T · 5 กล่อง 32kg) → หน้า `/admin/api-forwarder-ttw` ปุ่ม "＋ เอาเข้าระบบ"
- ⚠️ **X9002904 (PR609) น้ำหนักในระบบ 32.59kg vs packing 2,015kg/62กล่อง** — แถว -1/2 (61 กล่อง)
      fweight=0 · ให้ DOC อัพไฟล์ packing บนหน้า TTW ให้ reconcile เติม (เส้น audited · แตะราคา)
- data-health หลัง apply: ไม่มีของใหม่พัง · ttw_staged_uncommitted 447→651 = แถว ingest ใหม่ตามคาด

## ✅ 2026-07-25 รอบบ่าย — แก้เลขแทรคได้ (เคส 733) + audit ฝั่งอี้อู

- [x] **mig 0281 `tracking_override`** (applied prod) — แก้เลขแทรคบนตารางนำเข้า MOMO ได้
      โดย**ไม่แตะ momo_tracking_no** (กุญแจ sync — แก้ตรงๆ = sync ปั๊ม dup กลับมา)
- [x] **สายเชื่อมครบ 4 จุด**: commit ใช้เลขแก้ → ftrackingchn · propagate (Live sync) alias
      remap · **จับคู่บิล MOMO ชั้นที่ 3 "staging_alias"** (บิลมาเลขเดิม "733" → ตามหางาน
      ผ่าน pointer เจอ) · ป้าย ✎ บนหน้า invoice-cost + ตารางนำเข้า (โชว์ "MOMO: เลขเดิม")
- [x] **data-fix 733** (PR594): override = 1784597733 (จากรูปป้าย TK) — รอ commit ปกติ
      · แถว staging เก่า "1784597733" (0kg ไม่เคยชั่ง) จะขึ้น "มีในระบบแล้ว" เองหลัง commit
- [x] **audit อี้อู (owner "คีย์เข้าระบบกับแพคกิ้งยังแยกกัน")** — ROOT: เส้น CS คีย์ใบส่งของ
      ไม่เคยประทับ pointer กลับ staging → FIX ที่ `addYiwuDeliveryNoteShipments` (best-effort)
      + backfill ผูก 7 แทรคค้างเก่า + ซ่อมตู้ YWYY13164→YWS260717-8T (PR289)
      + แผนรวมหน้าเป็นแพทเทิร์น MOMO อยู่ใน `docs/research/yiwu-ttw-rework-2026-07-25.md`
      (ภูม lane · mockup-first)
- [x] **เคส 733 = MOMO เปิด 2 เรคคอร์ดต่อพัสดุใบเดียว (พิสูจน์จาก raw ของ MOMO เอง)** —
      ร้านประกาศ 21/07 เลขเต็ม (WAITING_SELLER_SHIP · 0kg · ไม่มี CG/ตู้/รูป ค้างตลอด) +
      โกดังชั่ง 22/07 คีย์ 3 ตัวท้าย (TRUCK_CLOSED · 31.5kg · CG84685710212 · รอบ
      PR20260721-SEA01 · **รูปป้ายเขียน TK 1784597733 เอง**) → ไม่ใช่ของซ้ำ ไม่ใช่จับผิด
- [x] **กันเบิ้ล 3 ชั้น (ทุกชั้น verify กับ prod แล้ว)**: (1) UI ป้าย "🔁 ซ้ำ — ใช้แถว X"
      + hold ออกจาก bulk (2) **server refuse ใน commitMomoRowCore** (แถวที่ถูกเคลม
      นำเข้าไม่ได้ ไม่ว่ากดจากไหน/cron · fail-CLOSED · รัศมี prod = 1 แถวเป๊ะ)
      (3) หลัง commit ตัว heal `backlinkStagingCommitted` ประทับแถวผีเป็น "เข้าระบบแล้ว
      → #fid" เอง (**replay planner จริงกับ prod = exact match ✓**) → ไม่ค้างโชว์ผิด
- ⚠️ ถ้าเผลอนำเข้าแถวผีก่อน (0kg) = ได้แถวเก็บเงิน ฿0 → ตอนนี้เกิดไม่ได้แล้ว (ชั้น 2)
- 🔴 **ค้าง CS ตรวจ:** X9002745 staged=PR213 แต่แถวจริง #52319=PR647 (ขัดกัน ห้ามเดา)

## ✅ 2026-07-25 รอบเย็น — ด่านนำเข้า MOMO แก้ได้ทุกคอลัมน์ (owner)

- [x] owner: *"ด่านของการนำข้อมูลเข้าระบบ แก้ไขได้หมด — docs มีข้อมูลเพิ่ม เดี๋ยวกรอกเอง ·
      คอลัมน์คำตอบตายตัวทำเป็นตัวเลือก ลด user error"*
- [x] เปิดแก้เพิ่ม: **SM Date · Branch · Product · Type (dropdown 4 ค่า) · Rem · Note ·
      Dum · CG. · Service Fee** (+ ของเดิม: PR · Tracking · W/L/H · Parcel · Wt · Vol)
- [x] **ของที่กรอกไหลเข้าแถวจริง ไม่ใช่แค่จอ**: Product → `fdetail` · Rem → `fnote`
      (commit เดิม hardcode ""/null — แก้แล้ว) · Service Fee → `raw.extra_cost` →
      `pricecrate` (ค่าตีลังไม้ · เส้นเดิม extractCrateFromMomoRaw) · Type → `raw.type`
      ผ่าน map เดิม (เรทคิดเงิน — ยืนยันซ้ำใน popup ตอนนำเข้าเหมือนเดิม) · CG → คอลัมน์
      `momo_cg_no` + raw คู่กัน
- [x] ทุกช่องเขียนผ่าน `updateMomoImportTrackFields` เดิม (pending-only · zod bound ·
      audit log) — ห้าม uppercase ข้อความไทย/จีน (เฉพาะรหัส PR/tracking/CG)
- ⚪ ตั้งใจไม่เปิดแก้: **Trans** (เรือ/รถ auto จากชื่อตู้จริง + ราคา reconcile ตาม physical
      เอง) · **Status** (state ของ MOMO) · **SM Number** (= เลขชิปเม้น derive จาก tracking
      ที่แก้ได้แล้ว — แก้เลขแทรค = เลขชิปเม้นตามเอง) · **ETD/ETA** (ระดับตู้จากไฟล์ packing) ·
      **Return** (มี flow ตีกลับ G7 แยก)
- ⚠️ ยังไม่ authed-click-test — owner/ทีมกดจริง: แก้ Product/Rem แล้วนำเข้า → ดู fdetail/fnote
      บนแถวจริง + แก้ Service Fee → ดูค่าตีลังตอนนำเข้า
- 📌 กติกา owner (มาระหว่าง session · จดเป็น standing): **"ทุกอย่างจาก api — ชิปเม้น แทรคกิ้ง
      จำนวน กล่อง คิว รูป CG status — ต้องซิงค์จากที่เดียวกัน สถานะเส้นตรง การเปลี่ยนแปลง
      เชื่อมตามกันทั้งหมด"** — tracking_override + pointer คือ instalment แรกของกติกานี้

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
