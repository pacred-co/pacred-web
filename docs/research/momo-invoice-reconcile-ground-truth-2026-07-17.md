# MOMO invoice → ตู้ reconcile — ground truth (2026-07-17 · verified prod, read-only)

Owner (verbatim): *"ให้ทางบัญชี อัพไฟล์ PDF จากทาง MOMO — MOMO จะปล่อยไฟล์มาให้บัญชีเป็นรอบๆ → บัญชีอัพ PDF → **ตรวจสอบข้อมูลกับระบบเรา ว่าถูกต้องตรงกัน หรือมีอะไรขัดแย้ง** → แล้วให้ **ทำตัดจ่ายต้นทุนตู้ในระบบเราได้เลย** เพราะ **MOMO วางบิลเรามาเป็น Tracking ครับ แต่เราคิดเป็นตู้ ไปตรวจให้ตรงกันนะครับ"*

Source invoice: `C:\Users\Admin\Desktop\INV-20260708-0002.pdf` (210KB · 4 pages · 39 line-items).
4 older invoices: `C:\Users\Admin\Desktop\วางบิลต้นทุน MOMO\*.pdf` (already ingested 2026-06-26).

---

## 1. Invoice anatomy (verified against the real PDF)

Each line-item = 5-6 text rows:

```
34 ค่าขนส่งสินค้าจากจีน GZE260701-1      ← # + **ตู้ (container!)**
DPK214010238058-1/2 40.00 KG/0.0386      ← tracking + kg + cbm   (CBM may WRAP →)
CBM                                       ← ⚠️ the wrap (real, line #34)
PR095 1 4,700.00                          ← memberCode + qty(box count) + ฿/CBM
คิดตาม CBM
181.42                                    ← lineTotal = COST for this tracking
```

**Footer:** `ค่าขนส่งทั้งหมด (Sub-total): 21,626.89` · `หักภาษีค่าขนส่ง ณ ที่จ่าย (WHT 1%) 216.27`
· `ค่าตีลังไม้ทั้งหมด: 0.00` · `ค่าเก็บเงินปลายทางทั้งหมด: 0.00` · `ค่าบริการขนส่งในไทย: 0.00`
· `ยอดสุทธิ (Grand Total): 21,410.62`. Note: *"ราคานี้รวม VAT 7% และค่าบริการพิธีการศุลกากรเรียบร้อยแล้ว"*.

### 🔑 The invoice ALREADY carries the ตู้ on every line
The owner framed this as "MOMO บิลเป็น tracking แต่เราคิดเป็นตู้" — true for the *money grain*, but the
container IS printed per line (`ค่าขนส่งสินค้าจากจีน **GZS260620-2**`). So tracking→ตู้ does **not**
need guessing: MOMO *asserts* it, and we can **cross-check it against our `fcabinetnumber`** — that
assertion-vs-ours diff is the real "ขัดแย้ง" detector.

### Rate confirms mig 0260 (owner-set 2026-07-17)
- `GZS…` (เรือ) → unit **2,500.00** ✓
- `GZE…` (รถ)  → unit **4,700.00** ✓
Matches `lib/forwarder/cabinet-transport.ts` (GZS/SEA=เรือ · GZE/EK=รถ).

### lineTotal = unitPrice × CBM — **qty = จำนวนกล่อง ไม่ใช่ตัวคูณ** (ยืนยันแล้ว **ทุกใบ ทั้ง 2 เดือน**)

> ## 🔴🔴 บันทึกความผิดพลาด — "การแก้" ที่เคยเขียนตรงนี้ **ผิดเอง** (ถอนแล้ว 2026-07-17 ดึก-2)
> เคยเขียนไว้ว่า *"MOMO เปลี่ยนความหมายคอลัมน์ CBM ระหว่างรุ่นใบ (มิ.ย. = ต่อกล่อง · ก.ค. = ทั้งบรรทัด)"*
> — **ไม่จริง ถอนทั้งหมด.** ของเดิมที่เขียนไว้แต่แรก (qty ไม่ใช่ตัวคูณ) **ถูกอยู่แล้ว**
>
> **ต้นตอของความเข้าใจผิด = `lib/admin/momo-invoice-parser.test.ts` ที่ HEAD มี fixture ที่ "ถูกกุขึ้น"**
> ติดป้ายว่า *Real INV-20260618-0003* แต่เอาค่าจริง **หารด้วย qty** แล้วคงยอดรวมไว้ เพื่อให้สูตร ×qty "ผ่าน":
>
> | tracking | **PDF จริง** | fixture ที่ HEAD | |
> |---|---|---|---|
> | `1779955936` | `100.00 KG / **0.3108** CBM` · qty 2 → 2,500 × 0.3108 = **777.00** ✓ | `50.00 KG / 0.1554` | **หาร 2** |
> | `1779955936-2` | `520.00 KG / **1.7640** CBM` · qty 40 → 2,500 × 1.764 = **4,410.00** ✓ | `13.00 KG / 0.0441` | **หาร 40** |
>
> **ลูกโซ่ความผิดพลาด (จดไว้กันซ้ำ):** agent เจอ fixture ปลอม → รายงานว่า "ขัดแย้งกับคำสั่ง" (ซื่อสัตย์ ถูกแล้ว)
> → **verifier ตรวจว่า "agent กุ fixture ขึ้นเองไหม?" (ไม่ · มันอยู่ที่ HEAD ก่อนแล้ว) → สรุปว่า fixture จริง**
> → **ผมเชื่อ verifier แล้วเขียนคำแก้ที่ผิดลง doc + push** → รอบถัดมา agent ไปเปิด **PDF จริง** → จับได้
>
> **บทเรียน (§0b):** verifier เช็คแค่ว่า *ของนี้มีมาก่อนไหม* ไม่ได้เช็คว่า *ตรงกับ source จริงไหม*.
> **fixture/HTML/screenshot = ของที่แปลงมาแล้ว ไม่ใช่ source** — ต้องกลับไปที่ PDF/PHP/DB ตัวจริงเสมอ
> (PDF จริงอยู่ในมือตลอด แต่ไปเชื่อไฟล์เทสแทน). **เทสที่กุขึ้น = ล็อกพฤติกรรมผิดไว้ตลอดกาล** — อันตรายกว่าไม่มีเทส

**หลักฐานปิดคดี — แกะ PDF จริงทั้ง 5 ใบ ผ่านโค้ดจริง (unpdf → assembleInvoiceText → parseMomoInvoiceText):**

```
✓ INV-20260708-0002  39 บรรทัด  Σ=21,626.89 = Sub-total  basis=line_total  ตู้=GZS260620-2,GZE260701-1
✓ INV-20260618-0003  12 บรรทัด  Σ=23,097.30 = Sub-total  basis=line_total  ตู้=GZS260525-2,GZS260528-2
✓ INV-20260618-0004   8 บรรทัด  Σ= 6,893.25 = Sub-total  basis=line_total  ตู้=(ไม่ระบุในใบ)
✓ INV-20260623-0006  19 บรรทัด  Σ= 8,385.00 = Sub-total  basis=-           ตู้=GZS260524-1
✓ INV-20260625-0003   9 บรรทัด  Σ=28,175.00 = Sub-total  basis=-           ตู้=(ไม่ระบุในใบ)
```
โหวตต่อบรรทัดที่ชี้ขาดได้: ก.ค. **line_total 6 : per_box 0** · มิ.ย. **line_total 7+2 : per_box 0**
→ **ทุกใบ ทั้ง 2 เดือน = `line_total`** · `basis=-` 2 ใบ = ทุกบรรทัดมีกล่องเดียว (ชี้ขาดไม่ได้ · 2 สูตรให้ผลเท่ากัน = ไม่กระทบ)

**การตรวจ basis ยัง evidence-based (majority-fit ทั้งใบ) ไม่ได้ hard-code `line_total`** → ถ้า MOMO เปลี่ยนจริงในอนาคตจะจับได้
· ชี้ขาดไม่ได้ + 2 สูตรให้ผลต่างกัน → **fail-closed**

> 🔴 **ห้ามแก้ด้วย "OR ของ 2 สูตร"** (WIP รอบแรกทำแบบนั้น = blocker A · แก้แล้ว) — ถ้ายอมทั้งสองสูตร แล้ว MOMO
> คิดเกินแบบ ×qty จริง (เช่น 4,700 × 0.4298 × 14 = **฿28,280.84** แทน ฿2,020.06 = **เกิน 14 เท่า**)
> จะ **ไม่ถูก flag** และ `reconciles` ก็ผ่าน เพราะ Sub-total ของ MOMO สอดคล้องกับความผิดของตัวเอง
> → **ธงตาบอดบนทุกบรรทัด qty>1** ซึ่งคือหัวใจของ "รายงาน ตรง/ขัดแย้ง ก่อนกดตัดจ่าย"

⚠️ **ตู้ไม่ได้มีทุกใบ:** 2 ใน 5 ใบเขียน `ค่าขนส่งสินค้าจากจีน (Guangzhou - TH)` แทนชื่อตู้
→ "ไม่ระบุตู้ในใบ" = **ไม่ใช่ ขัดแย้ง** (ห้ามบล็อก) · บล็อกเฉพาะตอน **MOMO ระบุตู้มา แล้วไม่ตรงกับของเรา**

---

## 2. 🔴 Confirmed PRODUCTION money bug — silently dropped line

`TRACK_RE = /^(\S+)\s+([\d.]+)\s*KG\s*\/\s*([\d.]+)\s*CBM$/i` requires `CBM` at end-of-row.
Real invoice line **#34 wraps `CBM` onto its own row** → **no match → line silently dropped**.

- parsed **38 of 39** lines · Σ = 21,445.47 vs printed Sub-total 21,626.89 → **short ฿181.42**
- ฿181.42 = 4,700 × 0.0386 = *exactly* the dropped line ✓

**Worse — there is no gate:** `grep -c subTotal` = **0** in both `lib/admin/momo-invoice-parser.ts`
and `actions/admin/momo-invoice-ingest.ts`. Only the one-off `scripts/momo-invoice-cost-backfill-2026-06-26.mjs`
reconciles Σ vs Sub-total. So the live UI `/admin/api-forwarder-momo/invoice-cost` would ingest
38/39 lines and **nobody would ever know**.

**Root fix (prevent the whole class, per [[fix-root-prevent-whole-class]]):**
1. tolerate the wrap — make `CBM` optional in `TRACK_RE`, then require the *next* row to be exactly `CBM`
   (a guard, so it can't false-positive on unrelated rows);
2. parse `subTotal` in the parser + expose `reconciles: Σ(lineTotal) === subTotal`;
3. the UI/action **REFUSES to apply** when it doesn't reconcile (fail-closed) — a parse that
   doesn't foot the printed Sub-total must never write money.

After the fix: **39 lines · Σ = 21,626.89 = Sub-total ✓**.

---

## 3. 🔑 THE reconcile rule — MOMO `-1/N` ≡ our BARE base tracking

MOMO bills the **first box** of a split as `<base>-1/N`; our `tb_forwarder` stores it as the **bare base**
(the known bare-header/suffix split structure). Naive exact-match ⇒ **3 false "ขาด" alarms** on this
invoice alone — and an accountant "fixing" that would create duplicate rows / double cost.

Verified to the cent (prod):

| MOMO line | our row | kg | CBM | cost |
|---|---|---|---|---|
| `1781515241-1/3` ฿5,091.50 | `1781515241` fid **52095** | 554.00 = 554.00 | 2.0366 = 2.036604 | 5,091.50 ≈ 5,091.51 |
| `908006932749-1/6` ฿34.78 | `908006932749` fid **52187** | 21.00 = 21.00 | 0.0074 = 0.0074 | 34.78 = 34.78 |
| `DPK214010238058-1/2` ฿181.42 | `DPK214010238058` fid **52189** | 40.00 = 40.00 | 0.0386 = 0.0386 | 181.42 = 181.42 |

Siblings `-2/3`, `-3/3`, `-2/6`… exist verbatim in our system, so **only the `-1/N` needs the fallback**.

**Matcher (in order, first hit wins):** exact `ftrackingchn` → if `-1/N`, the bare base →
(never fuzzy-match beyond this). Corroborate a `-1/N`→bare hit with kg/CBM before trusting it.

---

## 4. Reconcile result — INV-20260708-0002 vs prod (read-only, 2026-07-17)

```
ตู้ GZS260620-2 (เรือ · 2,500): MOMO บิล  3 tracking · Σ ฿10,858.25
ตู้ GZE260701-1 (รถ  · 4,700): MOMO บิล 36 tracking · Σ ฿10,768.64
                                            รวม Σ ฿21,626.89 ✓ = Sub-total
```
- **ตรง 36** · **ตู้ไม่ตรง 0** · **ลูกค้าไม่ตรง 0** · **"ไม่มีในระบบ" 3** → all 3 = the `-1/N`→bare
  normalization above (**false alarms**, not real gaps).
- **ตู้ GZS260620-2: เรามี 7 แถว · MOMO บิล 3 → MOMO ไม่ได้บิล 4 แถว** (`1781683835` · `DPK202760913241`
  · `KY4001045590371` · `YT7627100580731`) = the **"ขาด/เกิน"** axis — MOMO may bill these on a later
  round (they release files เป็นรอบๆ), so this must read as *"ยังไม่ถูกบิลรอบนี้"* (informational), **NOT**
  as an error, and must never be auto-written.
- Neither container is paid yet (`tb_cnt_item` has 0 rows for both) → both are legitimately payable.
- Our stored `fcosttotalprice` already equals MOMO's charge on the checked rows — an independent
  **validation that mig 0260's 2,500/4,700 are correct**.

---

## 5. Conflict axes the reconcile UI must report (before any ตัดจ่าย)

| axis | rule | severity |
|---|---|---|
| **ตู้ไม่ตรง** | MOMO's per-line ตู้ ≠ our `fcabinetnumber` | 🔴 block — the owner's "หัวใจ" |
| **ไม่มีในระบบ** | no exact + no `-1/N`→bare hit | 🔴 block |
| **ลูกค้าไม่ตรง** | invoice `รหัสสมาชิก` (PRxxx) ≠ our `userid` | 🔴 block (wrong customer billed) |
| **เรทผิดประเภทตู้** | `GZS…` line not 2,500 / `GZE…` line not 4,700 | 🟠 warn (MOMO mis-bill) |
| **น้ำหนัก/คิว ต่าง** | MOMO kg/CBM vs our `fweight`/`fvolume` | 🟠 warn |
| **ต้นทุนต่าง** | MOMO lineTotal ≠ our `fcosttotalprice` | 🟠 warn — MOMO's invoice WINS (it's the bill) |
| **MOMO ไม่ได้บิลรอบนี้** | our row in the ตู้, absent from invoice | ⚪ info — never auto-write |
| **Σ ≠ Sub-total** | parse doesn't foot | 🔴 **refuse the whole file** |
| **ตู้จ่ายแล้ว** | `tb_cnt_item` has the cabinet | ⏸ skip (never re-pay) |

## 6. Reuse — do NOT rebuild (owner: "ของเดิมต้องต่อยอด อย่าสร้างใหม่")
- `lib/admin/momo-invoice-parser.ts` — the parser (fix at root, keep the API)
- `actions/admin/momo-invoice-ingest.ts` + `/admin/api-forwarder-momo/invoice-cost` — paste→preview→apply
- `scripts/momo-invoice-cost-backfill-2026-06-26.mjs` — the proven reconcile-gate pattern
- `/admin/cnt-hs` + `actions/admin/cnt-payment.ts` (`tb_cnt`/`tb_cnt_item`/`tb_cnt_pay_*`) — จ่ายค่าตู้
  ⚠️ create-side double-pay is guarded by the mig-0183 partial-UNIQUE on `tb_cnt_item."fCabinetNumber"`.

---

# ข้อ 3 — GZE260627-1 "น้ำหนักมั่ว" : ต้นตอเจอแล้ว (verified prod 2026-07-17)

## อาการที่ owner เห็น
ตู้ `GZE260627-1` · 31 แถว · **ต้นทุนที่ตั้งไว้ Σ = ฿0.00** (= "ไม่มีต้นทุนมา 2 สัปดาห์") · ขาย Σ ฿51,925.10
Σ น้ำหนัก = **69,916.28 kg** ใน Σ **10.2788 คิว** → **6,802 kg/คิว** (น้ำ = 1,000 → เป็นไปไม่ได้)
→ ตั้งเรท 4,700 แล้ว apply โดน sanity backstop เด้ง (4,700 × 69,916 ≈ ฿328M)

## 🔑 ต้นตอ: **MOMO ส่งค่ามาไม่คงเส้นคงวา — บางแถว "ต่อกล่อง" บางแถว "ยอดรวม"**
`momo_box_detail` (`base_tracking`/`box_tracking`/`weight_kg`/`cbm`/`quantity`/`width`/`length`/`height`)
ตัวชี้ขาดตัวเดียวที่เชื่อได้ = **dims** (`width×length×height` → m³) :

| tracking | dims/กล่อง | MOMO cbm | qty | แปลว่า |
|---|---|---|---|---|
| `983824005` | 50×30×27 = **0.0405** | 0.0405 | 40 | **ต่อกล่อง** → เราคูณ 40 = **ถูกแล้ว** |
| `KY4001041630124-6` | 40×62×34 = 0.08432 | **1.18048** = 0.08432×14 | 14 | **ยอดรวม** → เราคูณ 14 ซ้ำ = **บัค** |

⚠️ **กับดัก:** ถ้าใช้ "ความหนาแน่น > 1,000 kg/คิว" เป็นตัวจับ จะ **flag ผิด** — ของหนัก (โลหะ) เกิน 1,000 ได้จริง
(`908006917359` 28.5kg/0.0138คิว = 2,065 kg/คิว แต่ **ถูกต้อง**: 30×23×20 ตรง dims เป๊ะ).
และถ้าใช้ "fweight == weight_kg × quantity" เป็นตัวจับ ก็ **flag ผิด 122 แถว** เพราะแถว "ต่อกล่อง" ต้องคูณอยู่แล้ว.
→ **ต้องเทียบ dims เท่านั้น**: `cbm ≈ dims` = ต่อกล่อง (คูณได้) · `cbm ≈ dims × qty` = ยอดรวม (**ห้ามคูณ**)

## ผลจริงหลังใช้ตัวชี้ขาด dims (จาก 135 แถวที่เทียบได้)
**10 แถว** ที่ MOMO ส่งยอดรวมมาแล้วเราคูณ quantity ซ้ำ · **น้ำหนักผีรวม 82,829 kg** · **4 แถวคิวผิดด้วย**

| fid | tracking | ตู้ | ผู้ใช้ | นน.ที่เก็บ | ที่ถูก | qty | คิวผิดด้วย | st |
|---|---|---|---|---|---|---|---|---|
| 52225 | KY4001041630124-25 | GZE260627-1 | PR075 | 66,150.00 | **945.00** | 70 | ไม่ | 6 |
| 52196 | 1782555393-4 | GZS260629-1 | PR067 | 8,000.00 | **800.00** | 10 | 🔴 | 4 |
| 52194 | 1782555393-2 | GZS260629-1 | PR067 | 10,741.50 | **3,580.50** | 3 | 🔴 | 4 |
| 52206 | KY4001041630124-6 | GZE260627-1 | PR075 | 2,646.00 | **189.00** | 14 | ไม่ | 6 |
| 52218 | KY4001041630124-18 | GZE260627-1 | PR075 | 504.00 | **84.00** | 6 | ไม่ | 6 |
| 52198 | 1782544029-2 | GZE260701-1 | PR086 | 250.00 | **50.00** | 5 | 🔴 | 6 |
| 52217 | KY4001041630124-17 | GZE260627-1 | PR075 | 108.00 | **36.00** | 3 | ไม่ | 6 |
| 52600 | 1782459481-7 | GZS260628-1 | PR10601 | 122.00 | **61.00** | 2 | 🔴 | 4 |
| 52203 | KY4001041630124-3 | GZE260627-1 | PR075 | 54.00 | **27.00** | 2 | ไม่ | 6 |
| 52208 | KY4001041630124-8 | GZE260627-1 | PR075 | 52.00 | **26.00** | 2 | ไม่ | 6 |

→ ซ่อม GZE260627-1 แล้ว Σ น้ำหนักจะเหลือ ~**1,834 kg** / 10.2788 คิว = **178 kg/คิว** (สมเหตุผล) → ตั้งต้นทุน 4,700/คิว ได้

## 🔴 เจอ **เก็บเงินเกินลูกค้าจริง 1 ราย** (เก็บไปแล้ว · รอ owner เคาะคืนเงิน)
**fid 52198 · `1782544029-2` · PR086 · ตู้ GZE260701-1 · fstatus=6 (เก็บแล้ว)**
- MOMO: `weight_kg=50 · cbm=0.2 · qty=5` · dims/กล่อง = 0.04 → 0.04×5 = 0.2 → **cbm = ยอดรวม**
- เรา: `fvolume=1.0` (= 0.2×5 ซ้ำ) · `fweight=250` (= 50×5 ซ้ำ)
- ขาย = ฿4,900 = เรท 4,900 × **คิวที่เพี้ยน 1.0** → **ที่ถูก = 4,900 × 0.2 = ฿980**
- → **เก็บเกิน ฿3,920**
- ✅ **ยืนยันซ้อนจากใบแจ้งหนี้ MOMO เอง** (INV-20260708-0002 บรรทัด 5): `1782544029-2 50.00 KG/0.2000 CBM · PR086 5 4,700.00 · 940.00`
  → คิวจริง = 0.2 ✓ · ต้นทุนเรา = ฿940 → ขาย ฿980 vs ทุน ฿940 = margin ~4% (สมจริง)
  ส่วนที่เก็บจริง ฿4,900 บนทุน ฿940 = 5.2 เท่า (ผิดรูป)
- อีก 3 แถวที่คิวเพี้ยน (52194/52196/52600) **ขายคิดจากน้ำหนักที่ถูก → ปลอดภัย ไม่ได้เก็บเกิน**
- แถว PR075 ทั้งหมด **ขายคิดจากคิว (เรท 4,900/คิว) → ปลอดภัย** (frefprice=1 ที่นี่ **ไม่ได้** แปลว่าคิดตามน้ำหนัก — อย่าอ่าน flag ตรงๆ)

## สิ่งที่ต้องทำ (ยังไม่ทำ — money · owner เคาะ)
1. **แก้ต้นตอที่ WRITE path** — หาโค้ดที่เขียน `fweight`/`fvolume` จาก `momo_box_detail` แล้วใส่ตัวชี้ขาด dims
   (`cbm ≈ dims` → คูณ qty · `cbm ≈ dims × qty` → **ห้ามคูณ**) → กันทั้ง class ([[fix-root-prevent-whole-class]])
   ⚠️ ของเดิมมี pass 6 self-heal `lib/admin/box-detail-reconcile-plan.ts` อยู่แล้ว → **ต่อยอด อย่าสร้างใหม่**
2. **backfill 10 แถว** (dry-run + backup + invariant) — เขียนเฉพาะ `fweight`/`fvolume` · **money-neutral**
   ⚠️ 6 แถว fstatus=6 (เก็บเงินแล้ว) → ห้าม re-price · zero-basis guard เดิม (`live-rate.ts`) ต้องกันไว้
3. **fid 52198 PR086 เก็บเกิน ฿3,920** → owner เคาะ: คืนเงิน / เครดิต / ปล่อย (เก็บไปแล้ว = ต้องตัดสินใจ)
4. หลังน้ำหนักถูก → ตั้งต้นทุน GZE260627-1 ที่ 4,700/คิว (mig 0260) ได้ตามที่ owner สั่ง

---

# ข้อ 4 + ข้อ 5 — คิวตรวจสอบ & "ผิดพลาด 8" : ตัวเลขตรงกันหมดแล้ว (verified prod 2026-07-17)

## 🔑 "แจ้งชำระเงินสำเร็จ 0 · ผิดพลาด 8" = **8 แถวติด "ยังไม่ใส่ค่าส่งไทย"** (ไม่ใช่สถานะ)

รัน probe จริงกับ prod (`scripts/probe-forwarder-check-fail-2026-07-17.mjs` · read-only):
```
คิวทั้งหมด 168
  ✅ fstatus=4 (แจ้งชำระได้)        8   ← แต่ติด C2 ทุกตัว
  🧹 ไม่ใช่สถานะ 4                159   (5:27 · 6:112 · 7:20 = เก็บเงินไปแล้ว)
  🧹 orphan (ไม่มีแถว tb_forwarder)  1   (fID=52399)
สรุป: ผ่าน 0 · C1 ค่านำเข้า ฿0 = 0 · C2 ไม่มีค่าส่งไทย = 8 · ไม่ใช่สถานะ4 = 159 · orphan = 1
```
→ **ตรงกับที่ owner แคปมาเป๊ะ**: "สำเร็จ **0**" = ผ่าน 0 · "ผิดพลาด **8**" = C2 ทั้ง 8 แถว
→ gate "ห้ามลืมค่าส่งไทย" (`lib/forwarder/domestic-shipping.ts` · commit `c1f29101`) **ทำงานถูกต้อง** —
  ปัญหาคือ **จอบอกผิดเรื่อง**: ขึ้น *"ยังไม่ถึงโกดังไทย"* ทั้งที่ของถึงไทยแล้ว (fstatus=4)
  → พนักงานไปนั่งรอ MOMO ทั้งที่แค่ต้องใส่ค่าส่งไทย = [[wrong-error-message-hides-real-block]] ตรงเป๊ะ

**ต้นตอที่ทำให้ error หาย:** action เก็บเหตุผลไว้ใน `errors: string[]` แต่ **client ไม่เคยอ่าน** → จอโชว์แค่ตัวเลข
→ แก้แล้ว: `BillFailure { fid · reason · nextAction }` รายแถว + `diagnoseThShippingBlock()` ให้เหตุผลไทย

## ข้อ 4 — คิวรับแถวที่เก็บเงินไปแล้ว (159/168 = 95% ของคิวเป็นขยะ)
owner: *"มันควรจะเข้าไปแค่ รายการที่จะให้ลูกค้าชำระเงิน"*
- **ต้นตอ (WRITE path):** `adminReportCntAddCheck` มี gate **ขอบล่าง** (≥4) แต่**ไม่มีขอบบน** → แถว 5/6/7 เข้าคิวได้
  ทั้งที่ consumer (`adminCallPriceUser`) อ่าน `.eq("fstatus","4")` เท่านั้น → เข้าได้แต่ทำอะไรไม่ได้ + ไม่เคยถูกลบ
- **แก้ที่ต้นตอ:** gate เป็น `'4'` เป๊ะ (min == max) = เซ็ตเดียวกับที่ consumer ทำงานด้วยได้ ·
  fail-closed เมื่อ fstatus ว่าง/null · SOT = `lib/admin/report-cnt-add-check-gate.ts` (`addCheckIneligibleReason`)
- **ฝั่ง READ** กรองซ้ำ (defence-in-depth) + บอกเหตุผลที่ซ่อน (§0g)
- **backfill ล้างคิว** = `scripts/forwarder-check-queue-backfill-2026-07-17.mjs`
  **dry-run default** ✓ (verified: `--apply` เท่านั้นถึงเขียน · backup JSON ก่อน · ทำใน transaction)
  → จะลบ **160 แถว** (159 ค้าง + 1 orphan) · เหลือคิว **8 แถว** · **ลบเฉพาะแถวใน `tb_check_forwarder`
  (ตารางคิว) ไม่แตะ `tb_forwarder`/เงิน** → 🔴 **owner เคาะก่อนรัน --apply**

## ลำดับที่ถูกต้องในการเคลียร์ (สำคัญ — อย่าสลับ)
1. ล้างคิว 160 แถว (`--apply`) → คิวเหลือ 8 แถวที่ทำงานได้จริง
2. **ใส่ค่าส่งไทยให้ 8 แถวนั้น** → ถึงจะแจ้งชำระผ่าน (ไม่ใช่บัค · เป็นข้อมูลที่ยังขาด)

---

# ⚠️ แก้ตัวเลข "ผิดพลาด 8" ให้ตรงความจริง (2026-07-17 ดึก-3 · เดฟ ตรวจซ้ำเอง)

> **ที่เคยเขียนว่า "8 แถวติด 'ยังไม่ใส่ค่าส่งไทย' ทั้งหมด" — คลาด.** ติดจริง **7 ไม่ใช่ 8**
> ต้นเหตุ: `scripts/probe-forwarder-check-fail-2026-07-17.mjs` (diagnostic ที่ agent เขียน) เช็คแบบง่ายๆ
> ว่า `ftransportprice <= 0` → **ไม่ได้ใช้ SOT จริง** `isThShippingCostMissing()` ที่ **ยกเว้น PCS/เหมาๆ/COD**
> **ตัวระบบจริงถูกอยู่แล้ว** — `actions/admin/forwarder-check.ts` import SOT ตัวนั้นมาใช้ (บรรทัด 63) ✓
> บทเรียนซ้ำรอยเดิม: **script วินิจฉัยที่เขียนสูตรเอง ≠ SOT** → ได้เลขที่ดูน่าเชื่อแต่ผิด (เหมือนเคส fixture ปลอม)

## คิวตอนนี้ = 8 แถว · แยกตามสิ่งที่ต้องทำจริง (verified prod + รันผ่าน SOT จริง)

| แถว | ลูกค้า | ตู้ | ขนส่ง | ติดอะไร | ต้องทำ |
|---|---|---|---|---|---|
| **52137** | PR067 | GZS260629-1 | **PCS** (รับเองโกดัง) | **ไม่ติดอะไรเลย** | ✅ **แจ้งชำระได้เลย** (PCS = ฿0 ถูกต้อง · SOT ยกเว้นอยู่แล้ว) |
| 52194 · 52195 · 52196 · 52197 | PR067 | GZS260629-1 | **(ว่าง)** | **ยังไม่เลือกขนส่ง** → คิดค่าส่งไม่ได้ | **เลือกขนส่งก่อน** แล้วค่อยใส่ค่าส่ง |
| 52162 · 52163 · 52164 | PR043 | GZS260628-2 | `2` (Flash) | เลือกขนส่งแล้ว แต่ยังไม่ใส่ราคา | **ใส่ค่าส่งไทย** |

→ ข้อความ error ที่ถูกต้องต่อแถวจึงไม่เหมือนกัน: **"ยังไม่เลือกขนส่ง"** (4 แถว) ≠ **"ยังไม่ใส่ค่าส่งไทย"** (3 แถว)
  ([[wrong-error-message-hides-real-block]] — บอก "ใส่ค่าส่งไทย" กับแถวที่ยังไม่เลือกขนส่ง = ส่งคนไปผิดที่อีกรอบ)

**หมายเหตุ:** 52194/52196 = 2 แถวที่ backfill เพิ่งแก้คิวให้ (กำไร -52,710 → +11,270) → ตอนนี้ฐานถูกแล้ว
เหลือแค่เลือกขนส่ง + ใส่ค่าส่งไทย ก็เก็บเงินได้
