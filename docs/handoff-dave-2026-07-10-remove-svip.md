# 🔴 Handoff → เดฟ: owner สั่ง "เอาระบบ SVIP ออก" (2026-07-10 · จากปอน/InwPond007)

> **Owner directive (2026-07-10):** *"เอาระบบ svip ออก แล้วบอกเดฟด้วย"* — ชี้ที่ badge **"SVIP · มีเรทเฉพาะตัว"** บนหน้า `/admin/customers/[id]` (CustomerRateEditor).
>
> ผม (session ปอน · InwPond007) **ไม่ได้แตะระบบ SVIP** เพราะเป็น **money-critical pricing tier ทั้ง platform** — ส่งต่อให้เดฟ ตามที่ owner สั่ง. push งานอื่นไป InwPond007 แล้ว (`e4e827f3`).

## SVIP คืออะไร (ทำไมถึงห้ามถอดมั่ว)
SVIP = ลูกค้าที่มี **เรทเฉพาะตัว** = มีแถวใน `tb_rate_custom_kg` / `tb_rate_custom_cbm`. เป็น **tier บนสุด**ของ pricing waterfall:

> per-order manual ▸ **SVIP (tb_rate_custom_*)** ▸ VIP-group (tb_rate_vip_*) ▸ general (tb_rate_g_*)

- **Resolver (money path):** `lib/forwarder/live-rate.ts` `resolveLiveForwarderRate()` มี "SVIP probe" (อ่าน `tb_rate_custom_cbm` → ถ้ามี = ใช้เรทนั้นก่อนทุก tier) + pure fn `lib/forwarder/resolve-rate.ts` (`isSvip`/`svipKg`/`svipCbm` เป็น input หลักของการตัดสินราคา · มี test lock).
- **ทุกออเดอร์ฝากนำเข้าของลูกค้าที่มีเรทเฉพาะตัว → ราคา resolve ผ่าน tier นี้.** ถอดออกดื้อๆ = ลูกค้ากลุ่มนี้ราคาหล่นไป VIP-group/general = **คิดเงินผิดทั้งหมด** (ของจริง ~เยอะ).

## Footprint: **155 refs · 33 ไฟล์**
`grep -rn "SVIP\|isSvip" app components lib actions` — ตัวใหญ่ๆ:
- **Money/resolver:** `lib/forwarder/live-rate.ts` · `lib/forwarder/resolve-rate.ts` (+`.test.ts`) · `actions/admin/customer-rate.ts` · `actions/forwarder-quote.ts` · `actions/admin/quote-comparison.ts` · `actions/admin/quote-multimode.ts` · `actions/admin/rate-edits.ts` · `actions/admin/settings-vip.ts` · `actions/admin/forwarders-new.ts` · `actions/admin/pay-user-view.ts`
- **Data/SOT:** `lib/admin/customer-rate-tables.ts` (`isSvip` = "มีแถว tb_rate_custom_cbm")
- **Display (badge/chip):** rate-editor.tsx · quote-tab.tsx · editable-quote-card.tsx · legacy-view.tsx · customers/page.tsx · forwarders-table.tsx · forwarders/new · service-orders-table.tsx · sales/page.tsx · settings/vip-tiers · rates/general · wallet/pay-user · accounting/freight · accounting/quote-compare · warehouse-history · sidebar-menu.ts · accounting-menubar.ts

## 🔴 คำถามที่ owner ต้องเคาะก่อนถอด (scope ยังไม่ชัด)
"เอา SVIP ออก" ได้หลายความหมาย — ต้องถาม owner:
1. **แค่ชื่อ/ป้าย "SVIP"?** (rename → "เรทเฉพาะตัว" เฉยๆ ไม่มีคำว่า SVIP · mechanism คงเดิม) — cosmetic, ปลอดภัย แต่ ~15 surfaces.
2. **หรือถอด tier กลไกทั้งหมด?** (ไม่มี per-user custom rate อีก · ทุกคนใช้ VIP-group/general) — **money · ต้อง migrate `tb_rate_custom_*` ที่มีอยู่** (ลูกค้าที่เจรจาเรทไว้แล้วจะเป็นยังไง? ดันขึ้นเป็น VIP-group? เก็บเป็น general? ลบทิ้ง = ราคาเปลี่ยน).
3. **หรือแค่เลิก auto-flip** ("ตั้งเรทเฉพาะตัว → กลายเป็น SVIP") แต่ยังตั้งเรทเฉพาะตัวได้?
4. ลูกค้า SVIP ปัจจุบันมีกี่ราย + เรทที่เจรจาไว้จะย้ายไปไหน (data-fix plan + dry-run prod/dev).

**แนะนำ:** ทำเป็น 1 change coherent (label + mechanism + resolver + data migration พร้อม test) — อย่าแก้ทีละ surface (155 refs · เดี๋ยว pricing ดริฟต์). มี test lock ที่ `resolve-rate.test.ts` — แก้ resolver ต้องอัปเดต test.

## ⚠️ งานที่ผม push ไป InwPond007 วันนี้ (`e4e827f3`) มี SVIP ref เพิ่ม — เดฟ fold เข้าตอนถอด
งานนี้ = "ใบเสนอราคาผูกเรทลูกค้า" (owner สั่งก่อนหน้า) เพิ่ม SVIP ref ใหม่ 2 จุดที่เดฟต้องเก็บตอนถอด:
- `editable-quote-card.tsx` — ปุ่ม **"บันทึกเข้าเรทลูกค้า (SVIP)"** (เขียนเรทกลับ `tb_rate_custom_*`).
- `quote-tab.tsx` — confirm message พูดถึง "ลูกค้าเป็น SVIP" + write-back ผ่าน `adminSaveCustomerRate` (ซึ่ง create SVIP row).
- rate-editor.tsx / quote-tab.tsx — badge "SVIP · มีเรทเฉพาะตัว".

(ถ้า owner เลือกข้อ 2 = ถอด mechanism → ปุ่ม write-back นี้ต้องเปลี่ยนเป้าหมาย/ถอดด้วย.)

## Status
- InwPond007 = `e4e827f3` (pushed) · gate tsc 0 · lint 0.
- SVIP removal = **ยังไม่เริ่ม** (รอ owner เคาะ scope + เดฟ ทำ money+migration).
