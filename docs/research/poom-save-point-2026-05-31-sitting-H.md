# Save-point — sitting-H + sitting-H-fix · 2026-05-31

> **Purpose:** ปิดวัน · ส่งต่อให้พรุ่งนี้. สิ่งที่ push ไป + สิ่งที่ค้าง + resume commands.
>
> **Branch state:** `Poom-pacred = ef0b666f` · push แล้ว (0/0 vs origin) · `dave-pacred` ยังไม่ pull (ยังไม่ต้อง — เดฟ batch-merge เอง per handoff §0.1)

---

## 🎯 5 commits ที่ push ไปวันนี้ (range `61bca6b7..ef0b666f`)

| # | SHA | Phase | งาน |
|---|---|---|---|
| 1 | `d93b0592` | H · B1 | rebuild `/admin/tax-invoices` list to PEAK 7-tab pattern + `print-button.tsx` client island |
| 2 | `61127915` | H · B2 | NEW `/admin/accounting/receipts` PEAK explorer (list + [rid] detail + `actions/admin/accounting-receipts.ts` + sidebar reachability) |
| 3 | `4cf71cbf` | H · docs | tick handoff doc entry #12 |
| 4 | `f53dfa7e` | H-fix-1 | consolidate forwarder-invoice/receipts (4 files): redirect old list → /receipts · drop orphan [rid] · repoint row links → mPDF print · menubar leaves point at /receipts with `?service`+`?kind` params |
| 5 | `ef0b666f` | H-fix-2 | mPDF data-gap fallback for receipts missing `tb_receipt_item` rows (ภูม Q4 — FRG2605-00219 = 0.00) + ย้าย ใบกำกับภาษีขาย ออกจาก sidebar Extension → headmenu `รายรับ` (ภูม Q5 — PEAK structure) |

**Total scope:** 11 files changed · ~2,000 LOC net delta · all ESLint clean · all lane-discipline maintained (ภูม admin-only, no `actions/admin/*-tb.ts`, no customer-write).

---

## ✅ ภูม 5 questions resolved

| # | คำถาม | คำตอบ + วิธีจัดการ |
|---|---|---|
| Q1 | service เรท vs รายการ แยกได้มั้ย | **ใช่** — มี `tb_forwarder_item` child table (0081 L2200+). Rate = no children · Item = has children. URLs already wired with `?kind=rate\|item` ใน menubar leaves; server filter ที่เหลือเป็น H-fix 3 (พรุ่งนี้) |
| Q2 | forwarder-invoice URL strategy | ใช้ **redirect** — old URL → /receipts (translated query params). `[id]` mPDF + `/add` form ยังอยู่ที่ /forwarder-invoice ตามเดิม |
| Q3 | ใบกำกับภาษีซื้อ (รายจ่าย) | ภูม รับว่า "phase ถัดไป" — defer ไว้ |
| Q4 | mPDF data bug | code-side fallback แก้แล้ว — ดึง ramount จาก receipt header เมื่อ items หาย + รายงาน banner เฉพาะหน้าจอ |
| Q5 | tax-invoices position | move เข้า headmenu `รายรับ → ใบกำกับภาษีขาย` · drop sidebar Extension entry · page URL `/admin/tax-invoices` ยังอยู่เดิม |

---

## ⏸ ค้าง — Resume พรุ่งนี้

### Priority order
1. **🔴 H-fix 6 (dropdown "สร้าง" 3-4 อัน bug)** — ต้อง browser test
   - Component: `components/admin/page-top-menubar.tsx`
   - Hypothesis: `group-hover/sub` + `group-focus-within/sub` ใน `NestedItem` ทำให้ sibling L3+ dropdowns ค้างเปิดพร้อมกัน
   - 3 fix options (ขอ ภูม choose หรือลุยตามดุลพินิจ):
     - (a) ลบ `group-focus-within/sub:block` (เก็บแค่ hover) — defensive
     - (b) บังคับ L2+ click-to-expand (เลิก hover-open) — predictable
     - (c) React context tracking "active path" + close sibling on hover — surgical
   - ต้องเปิด dev server + interact ใน browser ดูว่าจริงๆเกิดอะไร

2. **🟡 H-fix 3 (`?service` + `?kind` server filter)** — extend `getReceiptList`
   - File: `actions/admin/accounting-receipts.ts:getReceiptList()`
   - Logic: เพิ่ม optional params `service` (shop/forwarder/payment) + `kind` (rate/item)
   - `service=forwarder` + `kind=item` → EXISTS subquery against `tb_forwarder_item` joining via `tb_receipt_item.fid`
   - `service=forwarder` + `kind=rate` → NOT EXISTS subquery
   - `service=shop` / `payment` → ต้อง trace `tb_receipt.refid` หรือ `tb_receipt_item` join target (need DB inspection)
   - Tab counts ต้องคำนึง service filter ด้วย

3. **🟢 H-fix 7 (ใบกำกับภาษีซื้อ + ใบสั่งซื้อ + ใบจ่ายมัดจำ + บันทึกค่าใช้จ่าย + รับใบลด/เพิ่มหนี้)**
   - ภูม บอก "เดี๋ยวมารันพรุ่งนี้เลย" — ภูม คุมเอง
   - ต้องเพิ่ม `รายจ่าย` หัวข้อใน CARGO_MENUBAR
   - ใบกำกับภาษีซื้อ = new table (migration ใหม่) — `tax_invoices_purchase` หรือ extend `tax_invoices` ด้วย `kind` column
   - ใบสั่งซื้อ + ใบจ่ายมัดจำ = stub OK (ยังไม่ต้องจริง)

### Lower priority / parking lot
- **Wave 29 manual-create flow audit** — ตามรอย root cause ของ tb_receipt_item missing rows (FRG2605-00219 + คนอื่น) · ต้องมี prod DB query access
- **Bulk-actions wiring** — checkbox column ใน receipts list ยัง disabled
- **Page-size selector** — ตอนนี้ fixed 10/page
- **Grand-total over all matches** — ปัจจุบัน summary footer = page-visible only

---

## 🛠 Resume commands (พรุ่งนี้)

```bash
cd /c/Users/Admin/pacred-web/pacred-web
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/Poom-pacred   # ควรเป็น 0/0
git log --oneline -8                                            # ดู 5 commits + บริบท
cat docs/research/poom-save-point-2026-05-31-sitting-H.md       # this doc
cat docs/research/handoff-2026-05-30-night-resplit.md           # lane rules + ภูม pickup list
# Pickup: H-fix 6 (dropdown bug · browser test) → H-fix 3 (server filter) → H-fix 7 (ภูม คุม)
pnpm dev   # ถ้า ภูม เลือก H-fix 6 ก่อน — เปิด browser ที่ /admin (login admin) แล้ว hover menubar รายรับ → ใบเสร็จรับเงิน → ฝากสั่งซื้อ
```

---

## 🟠 ภูม manual actions ที่ค้างยัง (carry-over)
1. 🔴 ROTATE S3 access key `e913d7da34ca0089638f100afb74c972` (still pending — many sessions)
2. (Optional) browser-verify 5 commits ที่ push ไปวันนี้: ลอง `/admin/accounting/receipts` (PEAK 7-tab list) + `/admin/accounting/forwarder-invoice` (auto-redirect) + `/admin/tax-invoices` (still works + sidebar drawer ไม่มีแล้ว) + reprint FRG2605-00219 (มี banner สีแดง + แสดงยอดจริง)

---

_เซฟงานพอ ภูม รับและก็เจอกันพรุ่งนี้._
