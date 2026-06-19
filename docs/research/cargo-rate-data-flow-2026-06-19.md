# 🔗 Cargo rate / cost / floor / container — ข้อมูลเชื่อมกันยังไง (ทุกฝ่ายอ่านอันนี้)

> **ทำไมมีไฟล์นี้:** ภูม 2026-06-19 — "อุดรอยรั่ว เชื่อมโยงข้อมูล ดึงขึ้นมาใช้ประโยชน์ให้มากที่สุด แจกแจงรายละเอียดให้มากที่สุด เพื่อให้ทุกฝ่ายไม่มีปัญหากัน". ไฟล์นี้คือแผนที่ว่า **ราคา/ต้นทุน/ขั้นต่ำ/เลขตู้** ของฝากนำเข้า (forwarder/cargo) มันมาจากไหน เก็บที่ไหน โชว์ที่ไหน ใครแตะได้ — เพื่อให้ Sales / Accounting / Warehouse / Ultra / CS เห็นภาพเดียวกัน.
>
> Companion: learning `docs/learnings/pacred-domain-knowledge.md` [2026-06-19] · spec `docs/research/cargo-pricing-spec-2026-06-16.md`.

---

## 1. สามตัวเลข ฿/CBM ที่ห้ามสับ (ตัวนี้สำคัญสุด)

| ตัวเลข | คืออะไร | ค่า | เก็บที่ไหน | ใครดู |
|---|---|---|---|---|
| **ต้นทุน (COST)** | MOMO เก็บจาก Pacred จริง | **2,500/คิว** (ฮุย ไท่ ต๋า · mig 0194) | `tb_settings` 144-ช่อง matrix · resolve = `lib/forwarder/resolve-cost.ts` | บัญชี (เช็คกำไร) |
| **ราคาขายขั้นต่ำ (SELL FLOOR)** | ต่ำสุดที่ขายลูกค้าได้ | **กวางโจว รถ4900/เรือ2900 · อี้อู รถ5500/เรือ2900** (ต่อโกดัง×โหมด · เท่ากันทุกประเภทสินค้า) | `COST_FLOOR` (`lib/admin/customer-rate-tables.ts`) + override `business_config pricing.sell_rate_floor_cbm` (ultra แก้ได้) | Sales (ห้ามขายต่ำกว่า) · Ultra (แก้ค่า) |
| **ราคาขายจริง (SELL RATE)** | เรทที่ขายลูกค้าคนนั้น | เซลตั้งเอง (≥ floor) | `tb_rate_custom_kg`/`_cbm` (SVIP) · `tb_rate_vip_*` · `tb_rate_g_*` | Sales ตั้ง · ระบบดึงไปคิด |

> นอกจากนี้ยังมี **มูลค่าสำแดง (DECLARED)** = ใช้สำหรับใบขนศุลกากร (default จาก cost · engineer-down) — คนละตัวกับ 3 ตัวบน. ดู `docs/research/cargo-cost-declared-workflow-audit-2026-06-11.md`.

**กับดักที่เคยพลาด:** `min_sell_floor` (`business_config`, mig 0139) เป็น floor ของ **ยอดรวม** (base+surcharge · advisory) — คนละอันกับ SELL FLOOR ที่เป็น floor ต่อ **เรท/ช่อง** (฿/CBM). ภูม's floor = ต่อเรท → อยู่ที่ `COST_FLOOR` ไม่ใช่ `min_sell_floor`.

---

## 2. Flow การคิดราคา (เรียงตามคน)

```
[Sales]  ตั้งเรทส่วนตัวลูกค้า               [System] ดึงเรทมาคิดอัตโนมัติ
 /admin/customers/[id] ⚙️ ตั้งค่าเรทขนส่ง  →  /admin/forwarders/[fNo] กรอบ "ราคานำเข้าจีน-ไทย"
 → tb_rate_custom_kg/cbm (SVIP)               → resolveLiveForwarderRate (engine เดียวกับตอนบันทึก)
 → ห้ามต่ำกว่า SELL FLOOR (กดบันทึกไม่ได้)     → CBM = default · โชว์ยอดจริง (ไม่ใช่ 0)
                                                       │
                                                       ▼
[Accounting=Ultra] ถ้าราคานำเข้าแปลก         [Accounting] เช็ค vs MOMO invoice
 → ติ๊ก "คิดราคาแบบกำหนดเอง" แก้เรทตรงๆ      → ราคานำเข้าต้องตรงที่ MOMO เก็บ (รายแทรคกิง)
 → override นี้ "ไม่ติด floor" (บัญชี=ultra)    → INV PDF ส่วน "ราคานำเข้าจีน-ไทย"
```

**ลูกค้าไม่มีเรท →** ติ๊ก "คิดราคาแบบกำหนดเอง" (manual = ทางออกพิเศษ ไม่ใช่ default).

**ค่าเทียบ (KG↔CBM):** ถ้า kg/cbm > ค่าเทียบ (default 250–350 · `tb_users.userComparisonValue`) → คิดตาม KG · ไม่งั้นคิดตาม CBM. แก้ต่อออเดอร์ = ติ๊ก "คิดค่าเทียบแบบกำหนดเอง" (mig 0187). **warehouse แก้ค่าเทียบไม่ได้** (mig 0188-era · #5a).

---

## 3. เลขตู้ / กระสอบ / ETD / ETA — MOMO vs แต้ม (iTAM)

| ข้อมูล | แหล่งที่เชื่อถือ | แหล่งสำรอง | เก็บที่ไหน | โชว์ที่ |
|---|---|---|---|---|
| เลขตู้จริง | **แต้ม (iTAM) packing list** | MOMO | `momo_import_tracks.container_batch_no` (หลังปิดตู้) | `/admin/report-cnt` |
| เลขกระสอบ | แต้ม | MOMO | `momo_import_tracks.momo_sack_no` | report-cnt (ก่อนปิดตู้) |
| ETD/ETA | **แต้ม (iTAM)** | MOMO | `momo_import_tracks.etd/eta` | report-cnt คอลัมน์ ETD/ETA |

**SEA0x ≠ เลขตู้.** `PR…-SEA03` / `MO…-SEA02` = **MOMO routing-batch ID** (เขียนโดย `propagate.ts` ก่อนปิดตู้). ตู้จริงอยู่ `momo_import_tracks` join ด้วย `momo_container_no` = ค่า SEA0x. พอปิดตู้ cron สลับให้เอง → ถ้ายังเห็น SEA0x = ตู้ยังไม่ปิด → report-cnt โชว์เลขกระสอบแทน.

**กฎ "ยึดแต้ม":** MOMO ชอบมั่ว (ขนาด/ตู้/เลข) → ทุกที่ที่มีทั้ง 2 แหล่ง ให้ **แต้มชนะ** + (option) tooltip โชว์ค่า MOMO ไว้เทียบ. แต้ม feed เข้าผ่าน `/admin/api-forwarder-momo/warehouse-reconcile` (`taem-reconcile-parser.ts`).

---

## 4. ใครแตะอะไรได้ (RBAC สรุป)

| Role | ตั้งเรทขาย | ค่าเทียบ | แก้ floor | override ต่ำกว่า floor | สถานะ manual |
|---|---|---|---|---|---|
| **sales / sales_admin** | ✅ (≥floor) | ✅ | ❌ | ❌ | ❌ |
| **accounting (= ultra)** | ✅ | ✅ | ✅ (ultra) | ✅ (manual override) | ✅ |
| **ultra (Ultra Admin Z)** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **warehouse** | ❌ | ❌ (ล็อก) | ❌ | ❌ | ❌ |
| **driver** | ❌ | ❌ | ❌ | ❌ | ❌ |

`isGodRole(roles)` = `ultra || super` — ใช้ gate ทุกจุดที่เป็น "ของผู้บริหาร".

---

## 5. รอยรั่วที่อุดไปแล้ว (2026-06-19) + ที่ยังเหลือ

**อุดแล้ว:**
- พรีวิวราคา forwarder เคยขึ้น **฿0** (client คิดเรทระบบเองไม่ได้) → ดึงเรท profile มาคิด server-side · CBM default · โชว์ยอดจริง (`3cfb3ece` + Lane A).
- ตั้งเรทต่ำกว่าขั้นต่ำได้แบบเงียบๆ → **hard-block + grandfather** (`06d34711`).
- report-cnt โชว์ SEA0x เป็น "เลขตู้" (มั่ว) → โชว์เลขตู้จริง/กระสอบจาก `momo_import_tracks` (`f08aee17`).
- floor ค่าเดิม (5300/3300) เก่า/ผิด → แทนด้วยค่าภูมจริง (2900/4900/5500).

**ยังเหลือ (follow-up):**
- ETD/ETA: ดึงจากแต้มเข้าระบบ (Lane B กำลังทำ) — ก่อนหน้านี้คอลัมน์ว่างเพราะ parser ไม่ดึง etd/eta.
- ultra แก้ floor ในแอป (Lane C กำลังทำ · inline ไม่สร้างหน้าใหม่).
- doc-tier discount (-800/คิว ฝากโอน) ยังไม่รวมในพรีวิว base (ยอดบันทึกจริงอาจต่ำกว่าพรีวิวนิดหน่อย).

---

## 6. ไฟล์ที่เกี่ยวข้อง (สำหรับ dev)

- เรทขาย: `lib/forwarder/resolve-rate.ts` · `live-rate.ts` · `actions/admin/customer-rate.ts` · `app/[locale]/(admin)/admin/customers/[id]/rate-editor.tsx`
- ขั้นต่ำ (floor): `lib/admin/customer-rate-tables.ts` (`COST_FLOOR`) · `lib/admin/sell-floor-config.ts` (Lane C)
- ต้นทุน: `lib/forwarder/resolve-cost.ts` · `tb_settings` 144-cell · mig 0194
- พรีวิว forwarder: `app/[locale]/(admin)/admin/forwarders/[fNo]/forwarder-per-tracking-editor.tsx` + `per-tracking-editor-client.tsx`
- ตู้/กระสอบ/etd/eta: `lib/admin/momo-container-resolve.ts` · `lib/integrations/momo-isolated/propagate.ts` · `lib/admin/taem-reconcile-parser.ts`
- report-cnt: `app/[locale]/(admin)/admin/report-cnt/`
