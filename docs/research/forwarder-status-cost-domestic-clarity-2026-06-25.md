# สถานะ / ค่าไทยจีน / ขนส่งในไทย — แผนทำให้เข้าใจ + ทำงานง่าย (2026-06-25)

> Owner: "บัญชีกดจ่ายค่าต้นทุนเฟรท MOMO เป็นชิปเมนต์ พอกดแล้วมันกลายเป็นอัพเดทไป stage 2 ถึงโกดังจีน — สถานะเราไม่ได้เอามาจาก momo หรอ ... งงเรื่อง สถานะ/ค่าไทยจีน/ขนส่งในไทย ทำให้เข้าใจ+ทำงานง่ายเดี๋ยวนี้เลย." (3-agent source map · workflow `momo-cost-status-flow-map`)

## 🎯 ข้อสรุปหลัก: เป็น **perception bug ไม่ใช่ coupling bug** — และสถานะมาจาก MOMO จริง

- **การกดจ่ายต้นทุน ไม่แตะสถานะ.** `applyMomoInvoiceCost` ([actions/admin/momo-invoice-ingest.ts](../../actions/admin/momo-invoice-ingest.ts)) + พี่น้อง cost-pay ทุกตัว (`adminApplyContainerCostFromSheet`/`adminUpdatePaidContainerCost`/`adminUpdateForwarderCost`/`adminCreateCntPayment`) เขียนแค่ `fcosttotalprice` (+`fprofittotal=0`) — **ไม่เขียน fstatus เลย** (§0e money-isolated ถูกต้อง).
- **สถานะ 1-4 มาจาก MOMO จริง** (ตอบคำถาม owner = ใช่): cron `/api/cron/momo-sync` ทุก ~5 นาที → `propagateMomoToForwarders` ([lib/integrations/momo-isolated/propagate.ts:79-98,325-332](../../lib/integrations/momo-isolated/propagate.ts)) แมป MOMO shipmentStatus → fstatus (AT_WAREHOUSE_CN/CONSOLIDATING/TRUCK_CLOSED → '2' ถึงโกดังจีน) forward-only. Gate `MOMO_SYNC_PROPAGATE_STATUS !== 'false'` = **default-ON ตั้งแต่ 2026-06-19**. + MOMO เป็น SoT ตั้งแต่สร้างแถว (`commit-momo-row-core.ts:391` set fstatus 2/3 จาก MOMO).
- **ทำไมดูเหมือนกดจ่ายแล้วสถานะเด้ง:** บังเอิญ — ตอนจ่ายต้นทุน ข้อมูล MOMO ชุดเดียวกันเพิ่งมา → cron เลื่อนสถานะเวลาไล่เลี่ยกัน. **คนละ trigger.**
- **ตัวเร่งความงง:** [cnt-list-table.tsx:582](../../app/[locale]/(admin)/admin/report-cnt/cnt-list-table.tsx) hard-โชว์ badge "3 กำลังส่งมาไทย" ทั้งแท็บ waiting ไม่ว่าสถานะจริงเป็นอะไร → สถานะดูกระโดดมั่ว. + JSDoc เก่า `propagate.ts:331` / `sync.ts:73` ยังเขียนว่า sync "ปิด default" (จริงๆ เปิด) = misleading.

## 3 แกนที่ owner ปน — เป็นคนละเรื่องจริงๆ

| แกน | คืออะไร | DB column | ใคร set | cost/sell/status |
|---|---|---|---|---|
| **สถานะ** | สินค้าอยู่ไหน · 1-4 physical (จีน→ไทย) · 5-7 money/dispatch | `fstatus` (overloaded 1 คอลัมน์) · SOT label = `lib/admin/forwarder-status.ts` FSTATUS_CFG | **MOMO auto** (1-4) · บิล/จ่าย (5-7) · +warehouse scan/manual fallback | STATUS |
| **ค่าไทยจีน** | ค่าขนส่งจีน→ไทย — มี **2 เลขคนละความหมาย** | **ต้นทุน** `fcosttotalprice` (จ่าย MOMO ~2,500/CBM) · **ขาย** composite 7 คอลัมน์ (`ftotalprice`+…+`ftransportpricechnthb`−`fdiscount`) | ต้นทุน=invoice MOMO/resolve-cost · ขาย=resolve-rate (pricing) | **ทั้ง cost+sell** ปนใต้ป้ายเดียว |
| **ขนส่งในไทย** | last-mile ในไทย — **Pacred เลือกเอง** (ไม่ใช่ MOMO) | `fshipby` (carrier code) + `ftransportprice` (ค่าส่งในไทย) + `paymethod` (1 ต้นทาง/2 ปลายทาง COD) | `domestic-shipping.ts` (PRF เหมาๆ ฿100 in-zone · Flash upcountry · PCS รับเอง) | SELL (เก็บลูกค้า) + carrier |

> margin = ขาย − ต้นทุน · เห็นได้เฉพาะ ultra/accounting/pricing (`canViewCostProfit` · super เห็นไม่ได้).

## แผนแก้ (display/clarity เท่านั้น · ไม่แตะ logic เงิน/สถานะ · ปลอดภัย)

1. **หน้าจ่ายต้นทุน MOMO** (`/admin/api-forwarder-momo/invoice-cost`): banner หลังกดบันทึก — "บันทึกแค่ ต้นทุนเฟรท (จ่าย MOMO) · ไม่เปลี่ยนสถานะ · สถานะ (เช่น ถึงโกดังจีน) อัปเดตอัตโนมัติจาก MOMO คนละส่วน". → แก้ตรงจุด owner.
2. **ป้ายสถานะ**: tag "🔄 จาก MOMO · อัปเดต [เวลา]" → รู้ว่าสถานะ auto จาก MOMO ไม่ใช่ปุ่มกด.
3. **แยกกล่องเงิน 3 ช่อง** บน forwarder detail: (ก) ต้นทุน จ่าย MOMO `fcosttotalprice` [cost-role only] · (ข) ค่าจีน→ไทย เก็บลูกค้า `ftransportpricechnthb`+composite · (ค) ค่าในไทย `fshipby`+`ftransportprice`+เหมาๆ+ต้นทาง/ปลายทาง · + โน้ต "ต้นทุน=เราจ่าย MOMO · ค่าไทยจีน/ในไทย=เก็บลูกค้า".
4. **report-cnt legend** จัด chips เป็น 3 หัวข้อ: "สถานะการขนส่ง (จาก MOMO)" / "ค่าตู้ซัพพลายเออร์ (ต้นทุน)" / "เก็บเงินลูกค้า (ขาย)".
5. **แก้ cnt-list-table.tsx:582** ที่ hard-โชว์ "3" ทั้งแท็บ → โชว์สถานะจริงต่อแถว.
6. **แก้ JSDoc เก่า** `propagate.ts:331`/`sync.ts:73` ("off by default" → "default-ON 2026-06-19").

## ทุก fstatus writer (จาก agent · เผื่ออ้างอิง)
MOMO sync (propagate.ts · auto 1-4) · MOMO commit (commit-momo-row-core · INSERT 2/3) · warehouse-intake (scan 1→2/2→3/3→4) · barcode-import (scan →4) · adminBulkUpdateForwarderTbStatus (manual dropdown/cabinet→≥3/TH-track→≥6) · forwarder-step (N→N±1) · adminMarkForwarderCredit (→6 money axis). **ไม่มี cost-pay action อยู่ในลิสต์นี้เลย** = ยืนยันแยกกัน.
