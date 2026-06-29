# PR999 ฝากสั่งซื้อ loop — เสร็จ + follow-ups (2026-06-29 · เดฟ)

owner: เอา PR999 (ลูกค้าใหญ่) เข้าระบบจริง · ห้ามบัค/มั่ว/ผิด. เจาะ legacy ทั้ง loop → fix 3 + verify. **ทำ local · ยังไม่ push (รอ bill).** commit `eff558b5`.

## ✅ เสร็จ (verified · tsc 0 · unit 47/0 · money-reviewed เอง)
1. **multi-shop tracking** (headline bug) — `lib/admin/maybe-complete-shop-order.ts` = legacy gate (slotCount===trackingCount · forward-only · idempotent). ลบ unconditional 4→5 flip. spawn ทีละร้านได้จนครบทุกร้านค่อย auto สำเร็จ. unit: 10 ร้านครบ→5 · ไม่ครบ→ค้าง4 · multi-parcel 3slot/2track→ค้าง4.
2. **hRateCost (เรทต้นทุน) ทุกสถานะ** — `adminUpdateOrderCost` เขียนแค่ cost trio · **SELL ล็อก** · gate accounting/pricing · card status 3/4/5/40.
3. **crate price** — mig 0223 (prod+dev applied) `tb_header_order.pricecrate` · inline input ทุกสถานะ · carry→forwarder บน spawn.

## 🟡 SURFACE ให้ owner (money · ตัดสินใจ)
- **crate price carry บน spawn = bills ผ่าน forwarder grand-total** (`forwarders-field-edits.ts` L619). legacy carry แค่ crate flag ไม่ carry price → **เกิน legacy โดยตั้งใจ** (owner "ใช้ได้จริง" = ต้อง bill). blast radius ~0 (default 0 · operator-set เท่านั้น). **ยืนยัน:** crate price ฝั่งสั่งซื้อ ควรไหลเข้าบิลฝากนำเข้าตอน spawn ใช่ไหม? (ถ้าไม่ → ตัด `service-orders-spawn.ts` pricecrate carry, เหลือ crate flag = faithful legacy)

## 🔧 deferred (ทำต่อ · fresh context)
1. **forwarder-side crate-price editor** (owner "ฝากนำเข้าตอนแรกเลย") — impl defer เพราะ `tb_forwarder.pricecrate` feed grand-total (money). = editor guarded บน `forwarders/[fNo]/edit` + input บน `forwarders/new` เขียน `tb_forwarder.pricecrate` (มี column แล้ว · ไม่ต้อง mig) · confirm-before-mutate · role pricing/accounting. (shop-side carry ทำให้ crate price ไหลได้แล้ว · อันนี้คือใส่ตรงฝั่ง forwarder)
2. **super-cost-gate align** (verifier minor · non-blocking) — `adminUpdateOrderCost` ผ่าน withAdmin god-bypass → super เขียน cost ได้แต่ไม่เห็น card (mig 0193 super ไม่เห็น cost). align: block super (เหลือ ultra/accounting/pricing). harmless แต่ "ห้ามผิด".
3. **crate ที่ cart/admin create** (`add-form.tsx` ไม่มี crate control เลย) — เพิ่ม crate yes/no + price ตอนสร้างออเดอร์ (ตอนนี้ใส่ผ่าน all-status inline ได้แล้ว). confirm: customer cart เห็น crate price ไหม / admin-only.

## ❓ audit open-questions (จาก legacy · ยืนยันกับ prod PR999 ก่อน rely)
1. gate count: legacy DISTINCT(cShippingNumber) vs impl comma-token sum. บน Pacred one-slot-per-shop = "ทุกร้านมี tracking" (verified non-breaking) — แต่ยืนยันกับ tb_order จริงของ PR999 (ถ้า cShippingNumber เป็น comma-bag หลาย slot/ร้าน gate ต้องการ N tracking).
2. status-5 re-open tracking/spawn (ของมาช้า/แก้ typo) — ตอนนี้ gate 4-only (บั๊กหลักหายเพราะออเดอร์ค้างที่ 4 จนครบ). legacy special-case admin_tam/tam2 re-open ทุกสถานะ → ถ้าต้องการ allow 5 re-open ให้ super/ops ยืนยัน role.
3. legacy update_cost re-derive hTotalPriceUser → OMIT แล้ว (SELL ล็อก · owner intent · faithful-divergence ตั้งใจ).

## "พัฒนาทั้งหมด ห้ามบัค" (owner ขอ hardening รวม)
gap-hunt 2026-06-29 ([`gap-hunt-2026-06-29.md`](gap-hunt-2026-06-29.md)) ทำ adversarial audit แล้ว: platform แข็งแรง ~95% · money-trap fixed/tombstoned · interconnection solid (DB trigger 0215/0216). **ที่เหลือจริง = accounting B1-B7** ([`accounting-b1-vat-plan-2026-06-29.md`](accounting-b1-vat-plan-2026-06-29.md) · รอ owner เคาะ 5 ข้อ). hardening รอบใหม่ = fresh context (ลึกเกินจะ audit ทั้งระบบรอบนี้).
