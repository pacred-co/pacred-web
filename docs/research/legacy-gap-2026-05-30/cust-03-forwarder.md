# Legacy-gap audit — cust-03-forwarder (ฝากนำเข้า / forwarder · customer view)

> Date: 2026-05-30 · Auditor: เดฟ-lane subagent · Branch compared: `dave-pacred` (HEAD)
> Legacy SOT: `/Users/dev/Desktop/pcs-realshit/REALSHITDATAPCS/pcsc/public_html/member/`
> Scope: customer-facing **ฝากนำเข้าสินค้า** — list · add · detail · pay · receipt · invoice · tracking. (Admin-side forwarder is ภูม's lane — see `docs/audit/forwarders-fidelity-2026-05-30-evening.md`; this doc is the **customer** companion and does NOT re-audit admin.)

---

## Overview

### Legacy scope (the canonical customer workflow)
The legacy customer forwarder lives at pretty-URL `/member/forwarder/` and is dispatched by `REQUEST_URI` (function.php `pageName()` L2242-2252). The status filter is `?q=<n>`. The list/detail HTML is rendered by the index-page system; the mutations + AJAX helpers live in `member/include/pages/forwarder/` + `member/include/pages/index/`. Receipt generation lives in `member/test-system/runReceiptF/index.php` + `printReceiptF.php`.

**Canonical `fStatus` enum (function.php `statusForwarderAll2` L532-548 — the customer status spine):**

| fStatus | label | `?q=` | notes |
|---|---|---|---|
| 1 | รอสินค้าเข้าโกดังจีน | q=1 | customer may **delete** here (if `refOrder=''`) |
| 2 | สินค้าถึงโกดังจีนแล้ว | q=2 | |
| 3 | กำลังส่งมาประเทศไทย | q=3 | |
| 4 | สินค้าถึงประเทศไทยแล้ว | q=4 | |
| 5 | รอชำระเงิน | q=5 | **payable** (also `fCredit=1`) |
| 6 | เตรียมส่ง | q=6 | `+fStatusDriver=1` → **6.1 กำลังจัดส่ง** (q=6.1) |
| 7 | ส่งแล้ว | q=7 | terminal |
| — | เครดิตสินค้า | q=c | `fCredit=1` credit-line orders |

Other customer enums: `fRefPrice` (1=น้ำหนัก/2=ปริมาตร), `fWarehouseChina` (1=กวางโจว/2=อีฮู), `namePayMethod` (1=ต้นทาง/2=ปลายทาง), `nameCrate` (1=ตีลังไม้/2=ไม่ตีลัง), `nameShipBy` (47 carriers + PCS/F/PCSF/PCSE).

**Legacy customer flows (files):**
- `forwarder/calPrice.php` — live total recompute (7 components − discount, +50฿ PCSF, −1% WHT corp≥1000)
- `forwarder/checkFTrackingCHN.php` — duplicate-tracking guard (live, onblur)
- `forwarder/checkFreeArea.php` — free-delivery-zone validation by ZIP (BKK + 5 provinces)
- `forwarder/getShipBy.php` — **carrier picker** + free-50 promo + pay-method (origin/destination) selector
- `forwarder/getDataAddressF.php` / `getDataAddress.php` — address fetch for the add/edit forms
- `forwarder/deleteForwarder.php` — **customer self-delete** (only `fStatus='1' AND refOrder='' AND userID=self`)
- `index/getListPayForwarder.php` — the **PAY modal** (PromptPay QR + slip; wallet explicitly disabled → `paymentForwarderNew`)
- `index/userReadNoteForwarder.php` — clear admin-note unread flag (`fNoteUserRead=''`)
- `index/userReadReForwarder.php` — ack the receipt popup (`tb_receipt.rPopup='1'`)
- `index/all-popup/check-noti-receipt.php` — "you received a receipt" popup → `printReceiptF.php?id=`
- `report-user-sales/getListForwarder.php` — **affiliate/sales-agent commission withdrawal** (1% share, −3% tax, min 1,000฿) — distinct from import payment
- `test-system/runReceiptF/index.php` — receipt-number engine: `FRC`(corp)/`FRG`(general)+`ym`+`-`+5-digit, monthly reset, **back-date insertion** when a slip predates the latest issued, writes `tb_receipt`+`tb_receipt_item`

**Legacy menu (left-menu.php L67-75):** รายการนำเข้าทั้งหมด · รอชำระเงิน(q=5) · รายการเครดิต(q=c) · **ประวัติใบเสร็จ (receipt-f-hs)** · เพิ่มรายการนำเข้า(forwarder/add).

### Pacred scope (what's built on dave-pacred)
Route: `app/[locale]/(protected)/service-import/*`. Two customer action files:
- **`actions/forwarder-legacy.ts`** (3 UI imports) → writes **`tb_forwarder`** ✅ — `createLegacyForwarder`, `updateLegacyForwarderShipBy`, `updateLegacyForwarderAddress`.
- **`actions/forwarder.ts`** (7 UI imports, 69 KB) → **MIXED**. Pay-submit + receipt-withdrawal read/write `tb_*` (✅); but `payForwarderFromWallet`, `listForwarders`, `getForwarderByNo`, `customerAcknowledgeForwarderDelivery`, `customerDecideCostAdjustment`, `previewPrice`/`createForwarder` operate on the **rebuilt `forwarders` / `forwarder_items` / `forwarder_cost_adjustments`** tables (the 8,898 customers' data is NOT there).

**Key truth:** the **primary customer screens are healthy** because the list (`page.tsx`) + detail (`[fNo]/page.tsx`) + table (`table/page.tsx`) + invoice (`[fNo]/invoice`) + receipts (`receipts/`) **query `tb_forwarder`/`tb_receipt` directly inline** (NOT via the rebuilt-table action functions). The rebuilt-table functions in `forwarder.ts` are largely **dead/orphan** or back a **secondary divergent page** (`/service-import/pending`).

### % complete
**~78%.** The high-traffic happy path (browse list → add → pay-by-slip → see receipt) is a faithful tb_forwarder port. The gaps are: (1) the **carrier/ship-by picker on add is UNWIRED** (P1 — customer can't choose a carrier), (2) **no customer self-delete/cancel** (P1), (3) a cluster of **rebuilt-table dead-write functions + a dead `/pending` view** (P1 confusion/landmine), and (4) **no affiliate-commission withdrawal** screen.

---

## Workflow-by-workflow gap table

| Legacy flow | Pacred equiv | status | flow-order correct? | owner |
|---|---|---|---|---|
| List view `/forwarder/` + `?q=1..7,6.1,c` status filter | `service-import/page.tsx` reads `tb_forwarder` w/ status GROUP BY + driver-item + credit + PCSF joins | ✅ | ✅ (q-tabs + fStatusDriver→6.1 honored) | — |
| Table view `forwarder-table/` (q=22) | `service-import/table/page.tsx` reads `tb_forwarder` | ✅ | ✅ | — |
| Detail `/forwarder/detail/<ID>/` | `service-import/[fNo]/page.tsx` reads `tb_forwarder` ⋈ users ⋈ promotion ⋈ driver-item inline | ✅ | ✅ | — |
| Add `forwarder/add/` → INSERT tb_forwarder | `add/page.tsx` → `ServiceImportAddForm` → `createLegacyForwarder` (tb_forwarder) | 🟡 | 🟡 carrier-picker UNWIRED | เดฟ |
| `checkFTrackingCHN.php` (live dup-tracking onblur) | server-side dup guard inside `createLegacyForwarder` (forwarder-legacy.ts L97-114) | 🟡 | 🟡 only on submit, not live onblur | เดฟ |
| `getShipBy.php` — carrier dropdown + free-50 promo + payMethod | `#selectShipBy` div in `add/page.tsx` L553-556 = **`TODO(server-action)` UNWIRED** | ❌ | ❌ | เดฟ |
| `checkFreeArea.php` — ZIP free-zone validation | none | ❌ | n/a | เดฟ |
| `calPrice.php` — live total recompute | `forwarder.ts: calculateForwarderTotal` (reads tb_forwarder; used by pay modal) | ✅ | ✅ | — |
| `deleteForwarder.php` — customer delete `fStatus=1 AND refOrder=''` | **none** | ❌ | n/a | เดฟ |
| PAY modal `getListPayForwarder.php` (PromptPay QR + slip → `paymentForwarderNew`) | `forwarder-pay-modal.tsx` → `submitForwarderPayment` (tb_forwarder read · tb_wallet_hs insert · status='1' · type=4 · typeService=2 · typeNew=6 · NO fStatus flip · +50 PCSF · −1% niti) | ✅ | ✅ **faithful** | — |
| Pay slip upload | `forwarder.ts: uploadForwarderSlip` + magic-byte re-check | ✅ | ✅ | — |
| Wallet pay for forwarder (legacy: **DISABLED**) | `forwarder.ts: payForwarderFromWallet` (rebuilt `forwarders`+`wallet_transactions`) + `pay-from-wallet-button.tsx` | 💀 | ❌ legacy removed wallet for this service; this is a dead-write on the wrong table AND a removed method | เดฟ |
| `userReadNoteForwarder.php` — clear note-unread | admin-note unread badge handling on list (note_user flow) | 🟡 | partial — note display present; explicit "mark read" round-trip not confirmed | เดฟ |
| Receipt popup `check-noti-receipt.php` + `userReadReForwarder.php` (rPopup='1') | none (no receipt-arrival popup + ack) | ❌ | n/a | ปอน |
| ประวัติใบเสร็จ `receipt-f-hs/` list | `service-import/receipts/page.tsx` reads `tb_receipt`/`tb_receipt_item` | ✅ | ✅ | — |
| Print receipt `printReceiptF.php?id=` | `service-import/[fNo]/receipt/page.tsx` (tb_forwarder + tb_receipt) + `receipts/print/` | 🟡 | 🟡 mixes rebuilt `withholding_tax_entries`/`invoice_adjustments`/`forwarder_cost_adjustments` | เดฟ |
| Invoice `invoiceF.php` | `service-import/[fNo]/invoice/page.tsx` reads tb_forwarder ⋈ tb_receipt_item ⋈ tb_receipt ⋈ tb_corporate ⋈ tb_wallet | ✅ | ✅ | — |
| Receipt-number engine (FRC/FRG monthly + back-date insert) | `runReceiptF` equivalent fires on admin slip-approve (`autoIssueReceiptOnPaymentLand`) | ✅ | ✅ (verify back-date insertion parity separately) | ภูม |
| Edit ship-by on detail (`update_fShipBy`) | `updateLegacyForwarderShipBy` (tb_forwarder, PCS-depot override) | ✅ | ✅ | — |
| Edit address on detail (`update_fAddress`) | `updateLegacyForwarderAddress` (tb_forwarder) | ✅ | ✅ | — |
| `report-user-sales/getListForwarder.php` — affiliate commission withdrawal (1%, −3% tax, min 1,000) | **none** (no affiliate/sales dashboard) | ❌ | n/a | เดฟ |
| Tracking (China + TH leg) | `service-import/_tracking/*` container-card + stage-tabs | 🟡 | container-centric (Pacred model); not the legacy fTrackingCHN row-level view | ปอน |
| Cost-adjustment customer decision | `customerDecideCostAdjustment` (rebuilt `forwarder_cost_adjustments`) | 💀 | Pacred-original Phase-C; dead-write on empty table — no legacy equiv | เดฟ |
| Delivery acknowledgement | `customerAcknowledgeForwarderDelivery` (rebuilt `forwarders`) | 💀 | Pacred-original Phase-C; dead-write on empty table — no legacy equiv | เดฟ |

---

## Death-flows (P0/P1 detailed)

### P1 — `getShipBy` carrier picker is UNWIRED on the add form (broken add)
`app/[locale]/(protected)/service-import/add/page.tsx` L553-556 renders an empty `<div id="selectShipBy"></div>` with `{/* TODO(server-action): populate via getShipBy() AJAX */}`. Legacy `getShipBy.php` produces the **carrier dropdown** (`optionHShipByCart3`), the **free-50 promo** checkbox (free-area only), and the **pay-method** radio (เก็บเงินต้นทาง/ปลายทาง). `createLegacyForwarder` *accepts* `hShipBy`/`pro`/`payMethod` but the form never presents the picker → the customer creates a forwarder **with no carrier selected** (or only the PCS-depot fallback). This breaks the core "เพิ่มรายการนำเข้า" flow vs legacy. Owner: **เดฟ** (customer-backend — needs a `getShipByOptions` server action returning the carrier list + free-area gate). Companion gap: `checkFreeArea.php` ZIP-validation is also unported.

### P1 — No customer self-delete / cancel (legacy `deleteForwarder.php`)
Legacy lets a customer DELETE a forwarder row while `fStatus='1' AND refOrder='' AND userID=self` (a just-created import not yet at the China warehouse and not spawned from a shop order). Pacred has **no** `deleteForwarder`/`cancelForwarder` on either action file (verified by grep). Customers who mis-create a row cannot remove it → support burden + stale q=1 rows. Owner: **เดฟ**. Faithful guard must replicate `fStatus='1' AND refOrder='' AND userID=self` exactly (do NOT widen).

### P1 — Dead-write cluster + dead `/pending` view in `actions/forwarder.ts`
Multiple **customer-callable** functions write/read the **rebuilt empty tables** instead of `tb_forwarder`:
- `payForwarderFromWallet` (L753) → `forwarders` + `wallet_transactions`. **Double wrong:** (a) on the empty rebuilt table; (b) implements *wallet payment for forwarder*, which legacy **explicitly disabled** (`getListPayForwarder.php` L67: "ระบบกระเป๋าตังไม่สามารถใช้งานได้กับบริการนี้แล้ว"). Wired to `pay-from-wallet-button.tsx`.
- `listForwarders` (L492) + `getForwarderByNo` (L441) → `forwarders`. Back `forwarder-list.tsx`, which is rendered by **`/service-import/pending/page.tsx`** → a **dead view** (always empty for the 8,898 migrated customers).
- `createForwarder`/`previewPrice` (L308/523) → `forwarders`+`forwarder_items` — back the **orphan** `add/forwarder-form.tsx` (NOT rendered anywhere; the active add uses `createLegacyForwarder`).
- `customerAcknowledgeForwarderDelivery` (L1323) + `customerDecideCostAdjustment` (L1434) → `forwarders`/`forwarder_cost_adjustments` — Pacred-original Phase-C with no legacy equivalent, also dead-writes.

These look present (and pass build/type checks) but are landmines: a future wiring change, or a customer reaching `/service-import/pending`, surfaces an empty/broken screen. Owner: **เดฟ** — decision: delete the orphans (`forwarder-form.tsx`, `pending/page.tsx`, `pay-from-wallet-button.tsx`) + the rebuilt-table customer functions, OR repoint them at `tb_forwarder`. Phase-C features (ack / cost-adjust) should be parked behind a flag, not left as live dead-writes.

### P1 — Affiliate / sales-agent commission withdrawal missing
`report-user-sales/getListForwarder.php` is a full customer-facing flow: a sales-agent customer selects their referred forwarder rows (`tb_user_sales.usStatus='1'`), sees 1% commission − 3% WHT, min 1,000฿, uploads ID-card PDF, submits to `report-user-sales-history/`. Pacred has no `/report-user-sales` route or action. Affects partner agents (THADA.VIP / SIN.VIP / OOAEOM.VIP / SWAN + the PCS888/352/2000/2678/4155 1%-earners). Owner: **เดฟ** (customer-backend; pairs with ภูม's admin C5 `tb_user_sales` INSERT-on-fstatus=7).

### P2 — Receipt-arrival popup + ack not ported
`check-noti-receipt.php` shows a one-time "คุณได้รับใบเสร็จ" modal with a print link, acked via `userReadReForwarder.php` (`tb_receipt.rPopup='1'`). Pacred has the receipt list/print but not the proactive popup + `rPopup` ack. Lower impact (receipts still reachable). Owner: **ปอน** (customer-facing surface/notification).

### P2 — Print-receipt page mixes rebuilt tables
`[fNo]/receipt/page.tsx` reads rebuilt `forwarder_cost_adjustments` / `withholding_tax_entries` / `invoice_adjustments` (Pacred-original) alongside tb_*. Verify the printed figures reconcile to the legacy `printReceiptF` (which derives from tb_forwarder + tb_receipt only). Owner: **เดฟ**.

---

## Flow-order divergences

1. **Dup-tracking check timing.** Legacy fires `checkFTrackingCHN.php` **live onblur** (warns inline before the customer finishes the form). Pacred only rejects on submit inside `createLegacyForwarder`. Net result identical (no dup created) but the legacy UX surfaces it earlier. → add a `checkForwarderTracking` server action + onBlur wire.
2. **Carrier selection step absent (see P1).** Legacy add flow ORDER = pick address → `getShipBy` populates carrier + promo + payMethod → submit. Pacred add skips the carrier/promo/payMethod step (`#selectShipBy` empty) → submit. The middle step of the canonical add sequence is missing.
3. **Wallet vs slip for payment.** Legacy flow-order for pay = select rows → PromptPay QR + upload slip → admin verifies (fStatus stays 5). The faithful path (`submitForwarderPayment`) matches this exactly. But the **coexisting** `payForwarderFromWallet` path injects a *wallet-debit* step the legacy removed — a flow that should not exist for this service.
4. **fStatus flip on pay (correct, noted for the record).** Pacred correctly does NOT advance fStatus on customer slip-submit (stays 5 until admin verify) — matches legacy. The status→6 (เตรียมส่ง) and →7 (ส่งแล้ว) transitions are admin/driver-driven (ภูม's lane).

---

## Modals / AJAX / cron / print inventory

**AJAX endpoints (legacy customer forwarder):**
| Endpoint | Purpose | Pacred |
|---|---|---|
| `forwarder/calPrice.php` | live total | ✅ `calculateForwarderTotal` |
| `forwarder/checkFTrackingCHN.php` | dup-tracking onblur | 🟡 submit-time only |
| `forwarder/checkFreeArea.php` | ZIP free-zone | ❌ |
| `forwarder/getShipBy.php` | carrier + promo + payMethod picker | ❌ `#selectShipBy` unwired |
| `forwarder/getDataAddressF.php` · `getDataAddress.php` | address fetch for form | ✅ (addresses.ts / inline) |
| `forwarder/deleteForwarder.php` | customer delete (fStatus=1) | ❌ |
| `index/getListPayForwarder.php` | pay modal (QR+slip) | ✅ `forwarder-pay-modal` + `submitForwarderPayment` |
| `index/userReadNoteForwarder.php` | clear note-unread | 🟡 |
| `index/userReadReForwarder.php` | ack receipt popup | ❌ |
| `report-user-sales/getListForwarder.php` | affiliate commission withdraw | ❌ |

**Modals (legacy):** `list-payment2` (pay) ✅ ported · `pcs-express-cal` (PCS Express price) ❌ · `pcs-re-f` receipt popup (`check-noti-receipt.php`) ❌ · per-row admin-note modal (`pcs-forwarder<ID>`, all-script.php L562) 🟡 · credit-due popups (credit-due-1d/3d/past-due) — present in all-script.php, check separately.

**Print/PDF:** `printReceiptF.php?id=` ✅ (`[fNo]/receipt` + `receipts/print`, mixed tables 🟡) · `invoiceF.php` ✅ (`[fNo]/invoice`).

**Cron:** none specific to the **customer** forwarder view. (Admin/driver crons — expire-driver-assignments, status auto-flip — are ภูม's lane; flagged in master-fidelity C2/B1.)

---

## Recommended fixes (ranked, with owner)

1. **(P1, เดฟ, ~3h)** Wire the carrier picker on add: `getForwarderShipByOptions(addressID)` server action returning the carrier list (`nameShipBy` map) + free-area gate (`checkFreeArea` ZIP logic) + payMethod default; populate `#selectShipBy`. Without it the core add flow is broken vs legacy.
2. **(P1, เดฟ, ~1h)** Port customer self-delete: `deleteForwarder(ID)` action — guard `fStatus='1' AND refOrder='' AND userID=self` exactly; wire a delete button on q=1 rows.
3. **(P1, เดฟ, ~2h)** Resolve the rebuilt-table dead-write cluster: delete orphan `add/forwarder-form.tsx` + dead `pending/page.tsx` + `pay-from-wallet-button.tsx` + the rebuilt-table customer functions in `forwarder.ts` (`payForwarderFromWallet`, `listForwarders`, `getForwarderByNo`, `createForwarder`, `previewPrice`), OR repoint at `tb_forwarder`. Park `customerAcknowledgeForwarderDelivery` + `customerDecideCostAdjustment` (Phase-C) behind a feature flag so they aren't live dead-writes.
4. **(P1, เดฟ, ~6h)** Build the affiliate-commission withdrawal screen (`/service-import/commission` or `/report-user-sales`) faithful to `getListForwarder.php` (1% − 3% tax, min 1,000, ID-card PDF) — pairs with ภูม's admin C5.
5. **(P2, เดฟ, ~30m)** Add live `checkForwarderTracking` onBlur (dup-tracking parity).
6. **(P2, ปอน, ~1h)** Port the receipt-arrival popup + `rPopup` ack (`check-noti-receipt` + `userReadReForwarder`).
7. **(P2, เดฟ, ~1h)** Reconcile `[fNo]/receipt` printed figures vs legacy `printReceiptF` (drop/verify the rebuilt `*_adjustments` reads).
8. **(P2, ปอน, verify)** Confirm the `_tracking` container-card view is an acceptable Pacred substitute for the legacy row-level fTrackingCHN tracking, or add the legacy view.

> Note: items 1-3 are the load-bearing ones — they restore add-flow fidelity and remove the silent dead-write landmines. The high-traffic browse→pay→receipt path is already faithful on `tb_forwarder`.
