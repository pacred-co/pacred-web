# 🧾 Cargo Pricing + Accounting Epic — MASTER synthesis (2026-06-11)

> Grounded from real legacy source (`D:\REALSHITDATAPCS\pcsc\public_html\member` → staged to Temp, 16,126 php) + owner xlsx (ต้นทุนกำไร) + 4 parallel audit agents. Owner mandate: "ห้ามตกหล่น ห้ามข้ามห้ามเดา · ตั้งต้นทุน กำไร สำคัญมาก". Per-workstream detail in the 4 sibling docs.

## TL;DR — the platform is FAR more built than the requests implied
The 4 grounded audits agree: this is **gap-closing + last-mile wiring, NOT a from-scratch build**. The real gaps are specific + smaller than feared. Headlines:

| Sary | State | The REAL gap (grounded) | Effort |
|---|---|---|---|
| **A** ราคา/ตะกร้า | engine **exists** | The recalc engine `getCustomerImportEstimate`→`resolveForwarderRate` already reads live `tb_rate_*` + recomputes per รถ/เรือ — but wired ONLY to `/service-import/estimate`, **not the cart**. → surface it as an island. **No one is mischarged today** (admin sets binding price after warehouse measure — faithful). | 🟢 S |
| **B** เอกสาร/VAT | **ahead** of legacy | Pacred already has the 3-mode picker + persistence + VAT engine (legacy had NONE — always ใบเสร็จ "ไม่ใช่ใบกำกับ" + flat 1% WHT). 🔴 **Owner's exact gap = back-office can't SEE the choice**: `tax_doc_pref` is a dead read, the editor is orphaned, no badge/column/queue. Display-only fix. | 🟢 S |
| **C** ที่อยู่/ขนส่ง/COD | partial | 🔴 **Blocker C-9 first:** `createForwarder` writes rebuilt `forwarders` but every consumer reads legacy `tb_forwarder` (§0e split-brain) → COD/carrier set at create evaporates. Then build order-time zone→carrier→COD coupling (47-carrier registry, BKK-zip zone gate — `lib/bkk-zip.ts` already faithful). | 🟠 M |
| **D** บัญชี | **~75% faithful** | cost/sell/profit/VAT-on-margin/WHT/receipt/disbursement/commission/wallet ALL match legacy line-for-line. 🔴 **G2 = the Excel-forcing gap:** owner xlsx adds **อากรขาเข้า (import duty) + VAT-inclusive total (ราคารวม Vat)** the app doesn't compute. 🟠 **G1** ใบกำกับ issuance exists but DORMANT (owner-blocked: flag + VAT sign-off + PEAK GL). | 🟠 M (+owner-blocked) |

## 🔑 Load-bearing facts (don't relearn)
- **ship_by ≠ physical mode** (proven earlier; commit fix `ecf08e2f` trusts GZS/GZE cabinet). Customer picks รถ/เรือ at order = a *booking*; MOMO consolidates by reality (the packing-list step). ✅ matches owner's explanation.
- **Cargo price** = max(weight×rateKG, cbm×rateCBM) OR ค่าเทียบ, from `tb_rate_g_kg/cbm` (ทั่วไป) · `tb_rate_vip_*` (VIP/coID) · `tb_rate_custom_*` (SVIP/userID), keyed by warehouse+**transportType**+productsType. ตีลังไม้ = separate adder (`pricecrate`). (`apiCalPrice.php` / `function.php:calPriceForwarder2`)
- **VAT 7% = on MARGIN** (profit×0.07, profit=sell−cost), NOT gross sell — internal staff figure, never a customer charge in legacy. **WHT 1% = juristic + total≥1000.** Both already ported (`lib/tax/wht.ts`, `lib/forwarder/calc-company-total.ts`).
- **Pay-on-Thai-arrival** = `tb_forwarder.fstatus = 5 (รอชำระเงิน)`, gate after goods reach TH (status 4); total = china-freight+crate+thai-delivery+service+other−discount +฿50 PCSF −1%WHT. Pacred status-5 pay button already faithful.

## ▶️ Build sequence (waves — each its own review/gate)
1. **C-9 split-brain fix (FIRST — unblocks C + is a §0e money-safety landmine):** point `createForwarder` at `tb_forwarder` (or tombstone the rebuilt write). Verify no data-loss.
2. **A — surface the estimator on `/cart` + add-form** (engine exists; wire `getCustomerImportEstimate` as a client island by the shipping-options card; recompute on รถ/เรือ/ตีลัง/qty). Delete dead `cart-manager.tsx` landmine.
3. **B — make doc-choice visible to back-office** (render `TaxDocBadge`+WHT chip from the already-loaded `tax_doc_pref`; un-orphan the editor; add "เอกสาร" column + "รอออกเอกสารภาษี" queue). Display-only, no schema.
4. **C — order-time zone→carrier→COD coupling** (port the 47-carrier registry + BKK-zip zone gate + COD carrier-coupling into the customer order form; saved-address picker).
5. **D-G2 — อากรขาเข้า + VAT-incl total** (new cost cols + etax wiring; ⚠ HS/policy-sensitive → owner/accountant input on the duty base).
6. **Owner-blocked (park):** D-G1 flip `shop_yuan_enabled` after VAT-base sign-off + PEAK GL codes; the dormant issuance.

## Sub-docs
- [A-pricing-cart.md](A-pricing-cart.md) · [B-docs-vat.md](B-docs-vat.md) · [C-address-shipping-cod.md](C-address-shipping-cod.md) · [D-accounting.md](D-accounting.md)
