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

### lineTotal = unitPrice × CBM — **qty is a BOX COUNT, not a multiplier**
Verified on 39/39 lines. e.g. `760234506976-2 … 0.4298 CBM · qty 14 · 4,700.00 → 2,020.06` = 4700×0.4298.

> 🔴 **Existing parser bug:** `lib/admin/momo-invoice-parser.ts` computes
> `expected = round2(unitPrice * cbm * qty)` → `totalMismatch` fires on **every multi-box line**.
> `lineTotal` itself is read from the text so the *ingested cost was right*; the flag is noise —
> but it makes the new reconcile UI cry wolf. Fix: `expected = unitPrice * cbm`.

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
