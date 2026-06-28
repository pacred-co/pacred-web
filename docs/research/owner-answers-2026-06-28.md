# Owner answers — 2026-06-28 (the 11 blockers · policy SOT)

The owner answered the survey's blocker batch. These are load-bearing POLICY decisions
for the tax-invoice + cockpit-audit + payment-board lanes. Build to these.

## ก) ใบกำกับ / ใบขน (the 2026-06-28 tax-doc ask)

1. **Form-E = SEMI-AUTO.** Auto-flag/auto-fill eligibility FIRST, then human เฟิม (confirm) /
   แก้ไข (edit) only. Not fully manual, not fully auto.

2. **Declared value (มูลค่าสำแดง) = editable + REQUIRED note + multi-image attach.**
   Must be editable, must enter a หมายเหตุ, and attach **>1 image** — either a single field
   that, once you add the first image, shows it + a slot beside it for more, OR a multi-select
   that picks several images at once. (→ multi-image uploader on the declared-value edit.)

3. **🔑 รับเอกสาร (cargo: ฝากสั่ง/นำเข้า/โอนหยวน) does NOT charge VAT 7%.** When a customer
   chooses "รับเอกสาร" (or is updated to รับเอกสาร), we do **NOT** collect 7% VAT — that's the
   ใบขน/Non-VAT path. We collect VAT 7% **ONLY when the customer BUYS goods IN THAILAND from
   us** (a domestic sale → a real VAT ใบกำกับ). **→ INVESTIGATE legacy for exactly how they
   distinguish/handle this** (`[LINE]เฉพาะงาน TTP NNB ขอใบกำกับภาษี - ขอใบขน INV-PL CI.txt`
   + create-f-receipt.php + lib/tax/tax-doc-mode.ts). Aligns with the earlier D5 (ใบขน =
   margin-VAT internal, no customer VAT line).

4. **Export = BOTH PDF and Excel** ("เอาหมด").

## ข) cockpit audit พนักงาน

5. **Responsible admins = SALES (adminIDSale) + CS (adminIDCS).** Admin-side ONLY — do NOT
   add anything to the customer front-end; only the admin back-office.

6. **Cost counted ONCE.** A shop order that spawns a forwarder = the SAME order → count cost
   ONE time, not twice. **→ check PCS for how they dedupe** (`AXELRA Cost & Profit & Com.xlsx`
   + PCS legacy).

7. **"Freight" = the เหมาตู้ / ปิดตู้ / แชร์ตู้ (full-container / close-container / shared-LCL)
   work.** **→ model from `AXELRA & NNB BOOKING.xlsx`** (+ `[LINE]ตู้รถ EK...` + `[LINE]เอกสาร
   ปิดตู้ งานคุณบี...`). Decides whether the service breakdown is 3 or 4 cards.

8. **Stuck = show the number-of-DAYS + alert the people involved in that process/stage.**
   Display days-in-stage; notify the responsible admin for that stage. (Not a fixed hidden
   threshold — surface the day-count + alert.)

## ค) อื่นๆ

9. **payment-board inline edit = YES** ("เอาเลย"). Mark-paid / toggle-credit inline on the board.

10. **Pay-outside (ชำระนอกระบบ) = attach slip + verify in ONE step.** The customer already
    handed in a slip before; when the admin does "ชำระนอก", let them ตรวจชำระ + แนบสลิป together
    in one action — like admin-attaches-the-slip-on-behalf-of-the-customer. (Ties to #9: the
    board's inline settle = record slip + settle together.) Reuse the proven wallet 1-step
    pay-outside-with-slip flow.

11. **mig 0220 (normies tier) on prod = apply WITH the main push** ("ตามนั้น") — never before
    (else the 9 active super lock out on old code).

## Files dropped for investigation
- `/Users/dev/Desktop/olddata dev/data งานเก่า/` — LINE chats + pcsxmomo HTMLs + the Project dev xlsx
- `/Users/dev/Desktop/project dev/Project dev/AXELRA & NNB BOOKING.xlsx` — freight/container booking (#7)
- `/Users/dev/Desktop/project dev/Project dev/AXELRA Cost & Profit & Com.xlsx` — cost/profit/commission (#6)
- `/Users/dev/Desktop/project dev/Project dev/[LINE]เฉพาะงาน TTP NNB ขอใบกำกับภาษี - ขอใบขน INV-PL CI.txt` — tax-doc workflow (#3)
- `/Users/dev/Desktop/project dev/[AXELRA ERP - DEV]*.txt` — the AXELRA ERP reference (cockpit/freight model)
- `/Users/dev/Desktop/pcs-realshit/REALSHITDATAPCS/...` — legacy PCS source

## Extracted models (from the xlsx · 2026-06-28)

### Freight booking model (#7 · AXELRA & NNB BOOKING.xlsx) — "freight" = a SEPARATE 4th service
The freight matrix (NOT the China-Thailand ฝากนำเข้า cargo):
- **AIR** — incoterm CIF/EXW/FOB × truck 4ล้อ/6ล้อ (codes `AIR_CIF_4ล้อ`…)
- **CARGO** — เรือ / รถ (`CARGO_เรือ`, `CARGO_รถ`)
- **SEA FCL (เหมาตู้/ปิดตู้)** — CIF/FOB/EXW/**DDP(=NNB)** × port กรุงเทพ(PAT)/แหลมฉบัง(LCB) × 20'/40' (`SEA_FCL_CIF20_PAT`…)
- **SEA LCL (แชร์ตู้/ไม่เต็มตู้)** — CIF/FOB/EXW × 4ล้อ/6ล้อ (`SEA_LCL_CIF 4 ล้อ`…)
→ cockpit service-breakdown = **4 cards** (ฝากสั่ง shop / โอนหยวน yuan / ฝากนำเข้า import / **freight**). Freight data likely in `freight_*` tables (freight_quotes/shipments/invoices per the survey).

### Doc-set + margin model (#3/#6 · AXELRA Cost & Profit & Com.xlsx)
- **เอกสารชุดปิดงาน = 4 ส่วน:** (1) ใบปะหน้า Sale+Pricing+slips · (2) ใบเสนอราคา+ใบแจ้งหนี้+ใบเสร็จยอดโอน · (3) ใบสำคัญจ่าย/ใบเบิกเงิน+slips · (4) เอกสารทำงาน (แบบสั่งการตรวจ, **ใบขนสินค้า**).
- **Margin tiers:** เฟรท 30/25/20/15/10% · ขนส่ง 30/25/20/15/10%.
- **Credit:** 7/15/30 วัน · ค่าบริการเครดิต **1.25%**.
- (extracted dumps: scratchpad `booking.txt` + `costprofit.txt`)

## Build plan per lane (now unblocked)
1. **Cockpit employee-audit** (read-only · safe · #5 sales+CS, #8 days-in-stage+alert) — adminIDSale/adminIDCS × fdatestatus2..7 cycle/stuck-days. NO blocker.
2. **Cockpit per-service P&L** — 4 cards incl. freight (#7) · cost-once (#6, dedupe shop→forwarder). Needs the freight_* read + the cost-once rule.
3. **Payment-board inline settle + slip** (#9+#10) — inline "บันทึกชำระ (แนบสลิป)" = pay-outside + verify in one step (reuse the wallet 1-step pay-outside-with-slip path). Money-mutation → reuse guarded action, no new bypass.
4. **Tax-doc lane** (#1 Form-E semi-auto · #2 declared-value edit+note+multi-image · #3 รับเอกสาร≠VAT, VAT only on domestic Thai sale [port legacy] · #4 export PDF+Excel). Money/legal → port legacy faithfully first.
