# ภูม prep spec — Admin shop ops (P0-14 / P1-10 / P1-11 / P1-12) · 2026-05-31

> READ-ONLY fidelity audit by เดฟ-lane auditor. Source of truth = legacy PHP on
> disk (`/Users/dev/Desktop/pcs-realshit/REALSHITDATAPCS/pcsc/public_html/member/pcs-admin/shops.php`)
> + the LIVE Pacred code (which is the ground truth for column casing). No code
> was changed. Every legacy citation is `file:line`; "⚠️ NOT FOUND" where the
> extract was missing.

## 🚨 Headline finding — read before doing anything

**Three of the four gaps in the brief are STALE.** The brief's premises describe a
pre-Wave-31 state. The live code already fixed P0-14, P1-10, and most of P1-11.
Verified line-by-line below. Do NOT re-implement what already ships — you would
create a duplicate write-path (the exact "yuan-payments.ts vs yuan-payments-tb.ts"
landmine in MEMORY). Only **P1-12** has real, enumerable missing surface.

| Gap | Brief premise | Reality (verified) | Net work |
|---|---|---|---|
| **P0-14** | form mounted only on rebuilt-UUID branch; 21,950 real orders fall to legacy-view which doesn't render it | **DONE (Wave 31).** `legacy-view.tsx:316` mounts `AdminServiceOrderUpdateForm`. `adminUpdateServiceOrder` writes `tb_header_order`. cancel → `hstatus='6'` (one-char) ✅ verified | **NONE** — verify-only |
| **P1-10** | Tab-4 spawn lacks 4→5 auto-flip + tb_promotion carry + notify | **DONE (P0-13).** `adminSpawnForwarderFromShopOrder` does flip + promo carry + notify; mounted via `AdminSpawnToCompletedButton` (status='4') | **NONE** — 1 nuance (auto vs button) |
| **P1-11** | status-change notify single-channel; mark-paid fires none | **MOSTLY DONE.** quote=4-CH, ordered=3-CH, spawn=2-CH all wired. **Real gap:** the 2 mark-paid actions + general `adminUpdateServiceOrder` quick-flips send NO customer notify | **S** — add notify to mark-paid paths |
| **P1-12** | 13 header-edits + IPC reassign + per-item/hard delete missing | **PARTIAL.** address/transport/note DONE. 8 handlers genuinely missing | **M** — enumerated below |

| Legacy region | Pacred target | Effort |
|---|---|---|
| P0-14 — `shops.php:905-915` (`update_hStatus`) + `cancelOrder.php:8` | `adminUpdateServiceOrder` + `update-form.tsx` (both exist) | verify-only |
| P1-10 — `shops.php:1514-1523` (promo carry) + `:1558-1580` (4→5 auto-flip) | `adminSpawnForwarderFromShopOrder` (exists) | verify-only + 1 nuance |
| P1-11 — `shops.php:994-1065` / `:1139-1183` / `:1566-1788` (notify) | `service-orders-shop-workflow.ts` notify helpers (exist) + 2 mark-paid actions (no notify) | S |
| P1-12 — `shops.php:1186-1362,1793-1857` + `editIPC.php` + `deleteItem.php` + `deleteOrder.php` | NEW handlers (8) + UI | M |

---

## hStatus state machine (the revenue path — memorise)

From `shops.php:256-264` (tab filter switch) + `legacy-view.tsx:43-59` (live map).
`tb_header_order.hstatus` is **`varchar(1)`** — single-char codes, NOT words:

| hstatus | Thai (legacy tab) | rebuilt-enum key | date-stamp col |
|:---:|---|---|---|
| `'1'` | รอดำเนินการ (pending) | `pending` | `hdate` (create) |
| `'2'` | รอชำระเงิน (awaiting payment) | `awaiting_payment` | `hdate2` |
| `'3'` | สั่งสินค้า (ordered/paid) | `ordered` | `hdate3` |
| `'4'` | รอร้านจีนจัดส่ง (awaiting CN dispatch) | `awaiting_chn_dispatch` | `hdate4` |
| `'5'` | สำเร็จ (completed) | `completed` | `hdate5` |
| `'6'` | ออเดอร์ที่ยกเลิก (cancelled) | `cancelled` | — (no date col) |

**Cancel value = `'6'` (one char).** NOT `'cancelled'`, NOT `'99'`. Confirmed at
`cancelOrder.php:8` (`SET hStatus='6'`) and live `service-orders.ts:125`
(`REBUILT_TO_LEGACY_HSTATUS.cancelled = "6"`).

**Casing landmine (verified against live code):** the SQL strings in legacy PHP
write **camelCase** (`hStatus`, `hNo`, `userID`, `adminIDUpdate`, `hDate2`,
`hTotalPriceUser`). But on **prod Postgres these columns are lowercase**
(`hstatus`, `hno`, `userid`, `adminidupdate`, `hdate2`, `htotalpriceuser`) — the
migration 0081 lowercased everything except `tb_users`/`tb_admin`/`tb_co`. Every
live Pacred query uses lowercase (`legacy-view.tsx:121`, `service-orders.ts:150`).
**Exception:** the `tb_users` join still queries camelCase
(`.eq("userID", …)`, `.select("usertel,useremail")` — wait, mixed: `userID` in the
key but `usertel`/`useremail` lowercase — see `service-orders-shop-workflow.ts:701-703`).
When you write any new handler, COPY the exact casing the live sibling action uses.

---

# P0-14 — Status-flip / cancel / saveNote → tb_header_order  ✅ ALREADY DONE

## Legacy behaviour

Three POST handlers in `shops.php` under `$_GET['page']=='update'` (and a copy
under `=='detail'`):

- **`update_hStatus`** (`shops.php:905-915`):
  ```sql
  UPDATE tb_header_order SET hStatus='$hStatus', adminIDUpdate='$adminID' WHERE hNo='…'
  ```
  Free-form status set; `saveHistory` NOT called on this path.
- **`saveNote`** (`shops.php:709-775` detail · `:838-904` update):
  ```sql
  UPDATE tb_header_order SET hNoteDate=NOW(), hNoteUser='$hNoteUser',
    hNoteUserRead='$hNoteUserRead', hNote='$hNote', adminIDUpdate='$adminID' WHERE hNo='…'
  ```
  `hNoteUser='1'` → admin-only (sets `hNoteUserRead=''`); else customer-visible
  (`hNoteUserRead='1'` = unread). Fires LINE on save (`:739`, `:760`). `saveHistory(28)`.
- **Cancel** (`cancelOrder.php:4-21`, AJAX endpoint): `UPDATE … SET hStatus='6',
  adminIDUpdate=$_COOKIE[...]`. `saveHistory(23)`. Echoes `1`/`2`/`3`.

## Current Pacred state — fully wired

- **Action** `actions/admin/service-orders.ts:128` `adminUpdateServiceOrder`:
  - Reads `tb_header_order` (L148-158), NOT the empty rebuilt `service_orders`.
  - Maps rebuilt enum → legacy char via `REBUILT_TO_LEGACY_HSTATUS` (L119-126):
    `cancelled → '6'` ✅, `completed → '5'`, etc.
  - Stamps `adminidupdate` (clipped to 10 via `safeLegacyAdminId`) + `hdateupdate`
    on every write (L180-183); stamps `hdate2..hdate5` per status (L104-109, L214-215).
  - `note_admin` → `hnote` with empty-string-not-null guard (L217-228) — the
    sitting-G NOT-NULL fix (verified P22305).
  - V-A2 rollback gate + reason (L187-201); notify on status change (L258-290).
- **UI** `legacy-view.tsx:316-321` mounts `<AdminServiceOrderUpdateForm>` for the
  legacy path (real orders), passing the legacy char mapped to rebuilt key via
  `LEGACY_TO_REBUILT_KEY` (L43-50). The form (`update-form.tsx`) has: quick-flip
  to next status, explicit "❌ ยกเลิก" (→ `cancelled` → `'6'`), direct status
  `<select>`, note textarea, and the T-P1 mark-paid buttons.

**The brief's premise ("form rendered ONLY on rebuilt-UUID branch") is no longer
true.** The Wave-31 comment at `legacy-view.tsx:308-315` documents exactly this
fix. `page.tsx` (rebuilt branch, L214) is dead code on prod (no rows in
`service_orders`).

## What ภูม should actually do for P0-14

**Verify, don't build.** A DB test + a click-through:

### Test assertions (tsx DB-test against prod `tb_header_order`)
1. Pick a real `tb_header_order` row with `hstatus='1'` (or seed one). Call
   `adminUpdateServiceOrder({ h_no, status: 'cancelled' })`. Re-SELECT →
   `hstatus === '6'` (string, one char) AND `adminidupdate` is set AND
   `hdateupdate` advanced. **Assert it is literally `'6'`, not `'cancelled'`/`'99'`.**
2. Call with `status:'awaiting_payment'` → `hstatus==='2'` AND `hdate2` stamped.
3. Call with `note_admin:''` (empty) → `hnote === ''` (NOT null — would throw
   23502 if the not-null guard regressed). This is the sitting-G regression case.
4. Confirm the write hit `tb_header_order` and NOT `service_orders` (the rebuilt
   table stays empty).

### Reachability (≤3 clicks — verified)
`/admin` dashboard → **"ยอดฝากสั่งซื้อ" revenue card** (`admin/page.tsx:278`
`href="/admin/service-orders"`) → list → click row → `/admin/service-orders/[hNo]`
→ form is in the page (legacy-view). **2 clicks from dashboard.**
⚠️ **§0d note:** there is NO sidebar entry for `/admin/service-orders`
(`components/sections/admin-sidebar.tsx` has none — grep returned nothing). Entry
is dashboard-card + customer-profile/search/accounting cross-links only. Owner's
§0d rule wants a clear path; the dashboard card satisfies ≤3 clicks, but consider
adding a sidebar item under the ops group (optional, low effort) so staff don't
have to go through the dashboard. Flag to ปอน/owner — not a P0-14 blocker.

---

# P1-10 — Tab-4 spawn: 4→5 flip + tb_promotion carry + notify  ✅ ALREADY DONE

## Legacy behaviour — `shops.php` `saveTarcking` / `arrSaveTarcking` handlers

The legacy 4→5 transition is **NOT a single button** — it happens as a side-effect
of saving the LAST tracking number. Two near-identical handlers:
`saveTarcking` (`shops.php:1363-1583`) for single-shipping-number shops, and
`arrSaveTarcking` (`:1584-1792`) for comma-separated multi-parcel shops.

Each does, in order:
1. **INSERT/UPDATE `tb_forwarder`** (one row per tracking) — full column set at
   `:1433-1447` (insert) / `:1443-1446` (update existing via `refOrder`). Carries
   `crate, payMethod, fFreeShipping, fTrackingCHN, fDetail, userID, fShipBy,
   fCover, fPriceUpdate (=cPriceUpdate*hRate rounded), fTransportType,
   adminIDCreator, fAddress*, refOrder=$hNo`.
2. **tb_promotion carry** (`:1514-1523`):
   ```sql
   SELECT promoID FROM tb_promotion WHERE hNo='$hNo';
   -- if found:
   INSERT INTO tb_promotion(`date`, `promoID`, fID, hNo) VALUES (NOW(), '$promoID', '$ID', '')
   ```
   i.e. for each promo on the header, write a NEW promo row pointing at the new
   forwarder `fID` (hNo blanked to `''`). NB: `tb_promotion` IS the link table —
   there's no `tb_promotion_use`.
3. **Auto-flip 4→5** (`:1558-1565` and the duplicate `:1767-1774`): the gate is
   ```php
   if (COUNT($arrID) == COUNT($arrID2)) { ... }
   ```
   where `$arrID` = distinct `cShippingNumber` count and `$arrID2` =
   non-empty `cTrackingNumber` count for the hNo. i.e. **flip to 5 only when every
   shop order number has a matching tracking number** (all parcels accounted for):
   ```sql
   UPDATE tb_header_order SET hDate5=NOW(), hDateUpdate=…, hStatus='5', adminIDUpdate=… WHERE hNo='…'
   UPDATE tb_header_order SET hTotalPriceUser='$pricePay0' WHERE hNo='…'  -- recompute
   ```
4. **Notify** — forwarder-created (email + LINE Notify + LINE OA, `:1459-1511`)
   AND, when flipped to 5, completed-mail + LINE (`:1566-1579`).

## Current Pacred state — wired, but as a one-button action

- **Action** `service-orders-shop-workflow.ts:460` `adminSpawnForwarderFromShopOrder`:
  - `spawnGuard` requires `hstatus==='4'` (L170-176).
  - Expands tb_order tracking lines (L509-531), dedups by tracking.
  - Delegates tb_forwarder INSERT to `spawnForwardersFromShopOrder`
    (service-orders-spawn.ts) — single SOT for column shape (idempotent on
    `(refOrder, fTrackingCHN)`).
  - **tb_promotion carry** (L553-606): SELECT promos by hno → INSERT
    `{date, promoid, fid, hno}` per (promo × spawned fNo), with idempotency
    pre-check on `(promoid, fid, hno)`. ✅ matches legacy `:1514-1523`. (Minor
    fidelity divergence: legacy blanks `hno=''` on the carried row; Pacred keeps
    `hno=header.hno`. Pacred's is arguably better for audit; flag as intentional.)
  - **Flip 4→5** (L608-632): `hstatus='5', hdate5=now, hdateupdate, adminidupdate`. ✅
  - Notify (L656) via `notifyShopOrderCompleted` (in-app + LINE OA + email).
- **UI** `legacy-view.tsx:306` mounts `<AdminSpawnToCompletedButton>` when
  `status==='4'`. One-click confirm dialog.

## Net work for P1-10

**Verify-only + 1 design decision for ภูม.** The legacy auto-flips silently when
the last tracking is saved; Pacred makes it an explicit one-button action AFTER
trackings are entered (via the spawn form). Functionally equivalent — the order
still reaches `'5'` with promo carried. **Decision for ภูม:** keep the explicit
button (cleaner, idempotent, matches §0 design-latitude) OR add the legacy
"flip when last tracking saved" auto-trigger inside the spawn-form save path. The
brief calls the orders "stuck at hStatus=4 forever" — that's only true if staff
never click the button. Recommend: keep the button + add a banner on status-4
orders ("กดส่งเข้าโกดังเมื่อกรอก tracking ครบ") so staff know the path. No code
gap; UX-reachability nudge only.

### Test assertions
1. Seed a `tb_header_order` with `hstatus='4'` + 2 `tb_order` rows with
   `ctrackingnumber` filled + a `tb_promotion` row on the hno. Call
   `adminSpawnForwarderFromShopOrder({ hNo })`. Assert: ≥1 new `tb_forwarder`
   row with `reforder=hno`; header `hstatus==='5'` + `hdate5` set; a new
   `tb_promotion` row exists for each (promoid × new fid).
2. Re-call (idempotency): `created===0`, `promo_rows_carried===0`, status stays `'5'`.
3. Guard: call on `hstatus='3'` → `ok:false` with the "ต้องเป็นรอจีนจัดส่ง" error.

---

# P1-11 — Status-change notify (Email + SMS + LINE)  ⚠️ MOSTLY DONE; mark-paid gap

## Legacy behaviour — which transition fires which channels

| Transition | Handler (shops.php) | Email | SMS | LINE Notify | LINE OA | Notes |
|---|---|:---:|:---:|:---:|:---:|---|
| create (→1) | `:135-148` | ✅ | — | — | — | `contentMailShopNew` |
| **quote 1→2** | `:994-1065` | ✅ `:996-1002` | ✅ `:1004-1024` | ✅ `:1025-1028` | ✅ `:1031-1065` | **SMS carries payment link** `s/$hNo2` (`:1013-1014`) — drives payment |
| **ordered 3→4** | `:1139-1183` | ✅ `:1140-1147` | — | ✅ `:1150-1153` | ✅ `:1155-1183` | no SMS |
| spawn-fwd (per tracking) | `:1456-1511` | ✅ | — | ✅ (+admin `:1470`) | ✅ | forwarder-created notify |
| **completed 4→5** | `:1566-1579` / `:1775-1788` | ✅ | — | ✅ | — | 2-CH |
| saveNote | `:731-772` | — | — | ✅ (admin token + user) | ✅ (`sendLineOAShopNotify.php`) | |

**The SMS at quote-time is load-bearing** — `$message='ชำระค่าสินค้า ดู->'.$url`
(`:1014`), sent via `sendSMSAPI` (`:1023`), skipped only for `userID='PCS2000'`.
This is the link customers tap to pay. (`:1022` guard.)

⚠️ **Legacy LINE Notify is DEAD** (LINE Notify API EOL Apr 2025 — see CLAUDE.md
2026-05-30 night #2). Do NOT port `sendLine($token,…)` / `lineNotifyForwarder`.
Pacred substitutes `sendLinePush()` / the combined `sendNotification()` pipeline
(in-app row + LINE OA push + email). This is the correct substitution — flag it
as intentional, not a gap.

## Current Pacred state

- ✅ `service-orders-shop-workflow.ts` notify helpers fully cover the
  state-transition handlers:
  - `notifyShopOrderQuoted` (L716): in-app + LINE OA + email via `sendNotification`
    + **SMS via `sendSms(tel, …)`** (L751-756) — 4-CH, payment-link-equivalent. ✅
  - `notifyShopOrderOrdered` (L764): 3-CH (in-app + LINE OA + email). ✅
  - `notifyShopOrderCompleted` (L801): 2-CH. ✅
  - All route legacy `userid` → `profile_id` via `resolveProfileIdsForLegacyUserids`
    and look up `tb_users.usertel/useremail` (L685-714).
- ❌ **GAP 1 — `adminMarkServiceOrderPaidTb`** (`service-orders-tb.ts:126`, the
  LIVE mark-paid for tb orders, mounted via `mark-paid-tb-form.tsx`): debits
  wallet + flips 2→3 but **sends NO customer notification** (it even documents
  this at file header L59-63: "we do NOT send a ชำระสำเร็จ push from here yet").
  Legacy `pay-users.php` only pushed to the admin LINE group on this path, so
  this is arguably faithful — BUT the customer never learns their order advanced.
  ⚠️ NOT FOUND: `pay-users.php` was not re-read in this audit; the file-header
  citation is from the Pacred comment, treat as second-hand until confirmed.
- ❌ **GAP 2 — `adminMarkServiceOrderPaid`** (`service-orders.ts:329`, rebuilt
  path) DOES notify (L489-497) but writes the empty `service_orders` table — dead
  on prod, so its notify never fires for real orders.
- ⚠️ **GAP 3 — general `adminUpdateServiceOrder` quick-flips** DO notify on status
  change (L258-290) — so a manual `2→3` via the update-form select DOES push.
  Good. But it does NOT send the payment-link SMS when an admin manually flips
  `1→2` via the generic form (only the dedicated `adminQuoteShopOrder` does). If
  staff use the generic select to go 1→2 instead of the quote form, the customer
  gets an in-app/LINE notice but no SMS payment link.

## The fix (effort S)

ภูม decides scope; recommended minimal:
1. **`service-orders-tb.ts` `adminMarkServiceOrderPaidTb`** — after the successful
   2→3 flip (after L377, before audit), add a customer notify mirroring the
   shop-workflow helper: resolve `profile_id` from `header.userid` via
   `resolveProfileIdsForLegacyUserids`, `void sendNotification(profileId, {
   category:'order', severity:'success', title:`ชำระเงินสำเร็จ — ${hno}`, … })`.
   Keep it `void` + try/catch so a notify failure never bounces the wallet debit
   (legacy `sendLine` also failed silently).
2. **(optional)** Block/redirect the generic update-form's `1→2` path to route
   through `adminQuoteShopOrder` so the payment-link SMS always fires on quote.
   OR add the SMS to `adminUpdateServiceOrder` when `to==='awaiting_payment'`.
   Lower priority — the quote form is the intended 1→2 entry.

### Test assertions
- After `adminMarkServiceOrderPaidTb` on a payable order, assert a `notifications`
  row was inserted for the resolved `profile_id` (or that `sendNotification` was
  invoked — unit-mock the lib). Assert the wallet debit still committed even if
  notify throws (wrap in try/catch test).
- `adminQuoteShopOrder` already calls `notifyShopOrderQuoted` → assert `sendSms`
  invoked with the customer's `usertel` when present (mock `lib/sms/gateway`).

---

# P1-12 — Header-edit handlers + IPC reassign + per-item / hard delete

## Full enumeration of legacy header-edit POSTs

All under `shops.php` `$_GET['page']=='update'`, plus 3 AJAX endpoints. For each:
legacy POST name → column(s) updated → status of Pacred port.

| # | Legacy POST | shops.php lines | Column(s) updated | saveHistory | Pacred status |
|---|---|---|---|---|---|
| 1 | `saveNote` | 838-904 | `hnotedate, hnoteuser, hnoteuserread, hnote, adminidupdate` | 28 | ✅ `adminAddOrderNote` (shop-workflow.ts:1014) |
| 2 | `update_hStatus` | 905-915 | `hstatus, adminidupdate` | — | ✅ `adminUpdateServiceOrder` |
| 3 | `update2` (quote) | 916-1070 | per-line `tb_order` (camount/cprice/cshippingchn) + header `hcostallth, hcostall, hratecost, hdate2, htotalpricechn, hshippingchn, hdateupdate, hstatus='2', hcount, hdatepayment(+5d), htotalpriceuser` | 29 | ✅ `adminQuoteShopOrder` (header-level; see note A) |
| 4 | `update3` (ordered) | 1071-1185 | per-line `cshippingnumber` + `cpriceupdate` + header `hcostall*, hratecost, hdate4, hpriceupdate, hdateupdate, hstatus='4', hcount, htotalpriceuser` | 30 | ✅ `adminMarkShopOrderOrdered` (see note A) |
| 5 | `update_cost` | 1186-1224 | `hcostallth, hcostall, hratecost, hdateupdate` + recompute `htotalpriceuser` | — | ❌ **MISSING** |
| 6 | `update_hTransportType` | 1225-1237 | `htransporttype, adminidupdate` | 32 | ✅ `adminSwitchOrderTransport` (shop-workflow.ts:938) |
| 7 | `update_hRate` | 1238-1267 | `hrate, adminidupdate` + recompute `htotalpriceuser` | 33 | ❌ **MISSING** |
| 8 | `update_hAddress` | 1268-1308 | copies a `tb_address` row → `haddress*` (by `addressID`); blocks if `hShipBy='PCS'` | 34 | 🟡 PARTIAL — `adminUpdateOrderAddress` (shop-workflow.ts:863) edits the `haddress*` fields directly (free-form), but does NOT copy from a saved `tb_address` by `addressID`. See note B |
| 9 | `update_hShipBy` | 1309-1340 | `hshipby, adminidupdate`; if `'PCS'` overwrites `haddress*` to the PCS-warehouse pickup address; rejects `'3'`/empty | 35 | ❌ **MISSING** |
| 10 | `update_payMethod` | 1341-1351 | `paymethod, adminidupdate` (COD / origin-vs-destination toggle) | — | ❌ **MISSING** |
| 11 | `update_crate` | 1352-1362 | `crate, adminidupdate` (wooden-crate toggle) | — | ❌ **MISSING** |
| 12 | `saveTarcking` / `arrSaveTarcking` | 1363-1792 | `tb_order.ctrackingnumber` + spawns `tb_forwarder` + 4→5 | — | ✅ covered by spawn flow (P1-10) |
| 13 | `updateShippingNumber` | 1793-1805 | `tb_order.cshippingnumber` (per-shop, single) | 36 | 🟡 PARTIAL — `adminMarkShopOrderOrdered` writes cshippingnumber across ALL lines at once; no per-shop single-field edit |
| 14 | `update_cPriceUpdate` | 1806-1846 | `tb_order.cpriceupdate` (one line) + recompute header `hpriceupdate` | — | ❌ **MISSING** (per-line add/subtract money edit) |
| 15 | `upAdminIDIP` | 1847-1857 | `adminidip` (interpreter/IP-operator reassign) | — | ❌ **MISSING** (the IPC reassign — see note C) |

### AJAX endpoints (separate files, not POSTs in shops.php)

| Legacy file | Updates | Pacred status |
|---|---|---|
| `editIPC.php` | renders the reassign modal; the actual write is `upAdminIDIP` (#15). Gate: **reassign blocked if `adminIDCreate != ''`** ("แก้ไขไม่ได้เนื่องจาก มีล่ามจีนเป็นคนเปิดออเดอร์", editIPC.php:52-60) | ❌ MISSING |
| `deleteItem.php` | per-item HARD delete: `DELETE FROM tb_order WHERE hNo AND ID` (only if header has >1 item, `:7`), then `UPDATE tb_header_order SET hTotalPriceCHN=(old-cPrice), hCount=hCount-1`, unlinks the image file. `saveHistory(24)` | ❌ MISSING (note: Pacred has `adminRefundShopOrderItem` which is a *refund* — soft, money-back — NOT the same as this hard line delete) |
| `deleteOrder.php` | HARD delete entire order: `DELETE FROM tb_order WHERE hNo` then `DELETE FROM tb_header_order WHERE hNo`, unlinks all cProvider='4' images. `saveHistory(25)` | ❌ MISSING |

**Note A (update2/update3 fidelity):** Pacred's `adminQuoteShopOrder` /
`adminMarkShopOrderOrdered` accept an admin-typed final THB / shop-order-number
and write the header transition — they do NOT re-edit every per-line
camount/cprice/cshippingchn/cpriceupdate the way the legacy update2/update3 forms
do. The legacy forms are full per-line editors (update1.php / update3.php render
every `tb_order` row as editable inputs). If real staff need to fix a quantity or
unit price at quote-time, that per-line edit surface is **missing** — folded into
"update_cost (#5)" + "update_cPriceUpdate (#14)" gaps. Flag to ภูม: decide whether
the simplified one-field quote is sufficient or the full per-line grid must be ported.

**Note B (address fidelity):** legacy `update_hAddress` (#8) picks a saved
`tb_address` row by `addressID` and copies its fields; Pacred's
`adminUpdateOrderAddress` takes free-form typed fields. Functionally the address
gets set either way, but the legacy "pick from customer's address book" UX is not
ported, and legacy's `hShipBy='PCS'` guard (can't change address when pickup) is
not enforced in the Pacred action. Low risk; flag.

**Note C (IPC reassign = interpreter/ล่ามจีน):** `adminIDIP` is the Chinese-side
interpreter assigned to the order. `upAdminIDIP` (#15) reassigns it.
The candidate list (editIPC.php:7, :38) is:
```sql
SELECT ID, adminID, adminName, adminLastName FROM tb_admin
 WHERE adminStatusA='1' AND companyType='3' AND department='2' AND adminTMP<>'2'
   AND ((section='3') OR (section='4')) OR (adminID='admin_jeen')
 ORDER BY ID ASC
```
**Reassign is gated**: only allowed when `adminIDCreate=''` (i.e. the order was
NOT opened by an interpreter themselves). `tb_admin` is **camelCase** (`adminID`,
`adminName`, `adminStatusA`, `companyType`, `department`, `adminTMP`, `section`).
⚠️ depends on the "13 admins recreated" data task (CLAUDE.md B-3 pending) — the
candidate query returns nothing until ภูม seeds sales/interpreter admins. Code can
ship pluggable; it just returns an empty dropdown until then.

## The fix (effort M) — 8 new handlers + UI

Create them in `actions/admin/service-orders-shop-workflow.ts` (it's at ~1080
lines — well under the 2000 cap; co-locating keeps the shop cluster in one file)
OR a sibling `service-orders-header-edits.ts` if you prefer. Each is a thin
`tb_header_order` (or `tb_order`) UPDATE following the EXACT pattern already in
that file: `withAdmin([...])` → load+guard → `safeLegacyAdminId(…,10)` → update
(lowercase cols) → `logAdminAction` → `revalidatePath` ×3.

| New action | Legacy POST | Target write | Notes |
|---|---|---|---|
| `adminUpdateOrderCost` | #5 | `tb_header_order`: `hcostall, hratecost, hcostallth=(hcostall*hratecost), hdateupdate, adminidupdate` + recompute `htotalpriceuser` | recompute formula below |
| `adminUpdateOrderRate` | #7 | `tb_header_order`: `hrate, hdateupdate, adminidupdate` + recompute `htotalpriceuser` | recompute formula below |
| `adminSwitchOrderShipBy` | #9 | `tb_header_order`: `hshipby, adminidupdate`; if `='PCS'` also overwrite `haddress*` to PCS-warehouse constants (shops.php:1321-1334) | reject `'3'`/empty |
| `adminUpdateOrderPayMethod` | #10 | `tb_header_order`: `paymethod, adminidupdate` | COD toggle; value set = legacy "origin"/"destination" — confirm enum from `service_orders.pay_method` usage |
| `adminUpdateOrderCrate` | #11 | `tb_header_order`: `crate, adminidupdate` | `'1'` = ตีลังไม้ on |
| `adminUpdateOrderItemShippingNumber` | #13 | `tb_order`: `cshippingnumber` WHERE `hno AND cnameshop` | per-shop single-field |
| `adminUpdateOrderItemPriceUpdate` | #14 | `tb_order`: `cpriceupdate` (one ID) + `tb_header_order.hpriceupdate` delta | delta logic at shops.php:1825-1833 |
| `adminReassignOrderInterpreter` | #15 | `tb_header_order`: `adminidip` | gate: only if `adminidcreate` empty (editIPC.php:52). Candidate list = the `tb_admin` query in note C |
| `adminDeleteOrderItem` | deleteItem.php | `DELETE tb_order WHERE hno AND id` (guard: header has >1 item) + `UPDATE tb_header_order SET htotalpricechn=old-cprice, hcount=hcount-1` | HARD delete — gate hard (super/ops). Skip the legacy `unlink()` image step (Pacred images on S3, not local fs) |
| `adminDeleteShopOrder` | deleteOrder.php | `DELETE tb_order WHERE hno` then `DELETE tb_header_order WHERE hno` | HARD delete whole order — gate to `super` only; add a confirm. Consider soft-cancel (`hstatus='6'`) instead — discuss with owner whether a hard delete should even exist in Pacred |

**Recompute formula (legacy `pricePay0`, used by #5 #7 + all transitions):**
```
htotalpriceuser = round_up( ((htotalpricechn + hshippingchn) * hrate) + hshippingservice , 2 )
```
(shops.php:979, :1125, :1220, :1263 — identical everywhere). `round_up` is a
legacy helper = round half-UP to 2 dp. Pacred has `computeShopOrderDebitTotal`
(`lib/service-order/debit-total.ts`, used by `service-orders-tb.ts:249`) — REUSE
it rather than re-deriving, to avoid drift.

### UI mount
Extend `extra-edits-form.tsx` (it's the existing expandable multi-section panel)
with new tabs: 💱 เรท, 💰 ต้นทุน, 🚚 ShipBy, 📦 ตีลัง/COD, 🧑‍💼 ล่ามจีน, plus
delete buttons (with confirm) in a separate "อันตราย" section. Per-item edits
(#13 #14 #deleteItem) belong on each `tb_order` line — the page already renders
`refundableItems` via `AdminRefundItemPanel`; add edit/delete affordances there.
Follow §0 design latitude — group cleanly, don't clone the legacy Bootstrap grid.

### Test assertions (per handler, tsx DB-test on real `tb_header_order`/`tb_order`)
- `adminUpdateOrderRate`: set `hrate`, assert `htotalpriceuser` recomputed ==
  `round_up((htotalpricechn+hshippingchn)*newRate + hshippingservice, 2)`.
- `adminSwitchOrderShipBy({hShipBy:'PCS'})`: assert `haddressname` became
  'รับที่โกดัง PCS กทม' + `haddresszipcode='10160'`.
- `adminReassignOrderInterpreter`: on a header with `adminidcreate=''` → updates
  `adminidip`; on one with `adminidcreate` set → returns the "มีล่ามจีนเป็นคน
  เปิดออเดอร์" error (gate enforced).
- `adminDeleteOrderItem`: on a 2-item header, delete 1 → `tb_order` row gone +
  `hcount` decremented + `htotalpricechn` reduced by that item's `cprice`. On a
  1-item header → rejected (legacy `num_rows>1` guard).
- `adminDeleteShopOrder`: both `tb_order` rows AND the `tb_header_order` row gone.

### Reachability
Same path as P0-14 (dashboard card → list → row). Mount the new edits in the
existing `extra-edits-form.tsx` panel + per-line on `AdminRefundItemPanel`'s
neighbours → all reachable from the order detail page in ≤3 clicks.

---

## Open questions for owner / ภูม

1. **P1-12 hard delete** — `deleteOrder.php` HARD-deletes the header + lines. Do
   we want a destructive hard-delete in Pacred at all, or is soft-cancel
   (`hstatus='6'`) sufficient + safer (preserves audit + the 21,950-row history)?
   Recommend: gate hard-delete to `super` only, or drop it entirely.
2. **P1-10 auto-flip vs button** — keep the explicit `AdminSpawnToCompletedButton`
   (current, idempotent) or add the legacy "flip-to-5-when-last-tracking-saved"
   auto-behaviour? Current button means an order can sit at `'4'` if nobody clicks.
   Recommend keep button + add a status-4 reminder banner.
3. **Per-line quote editor (note A)** — is the simplified single-field quote
   (`adminQuoteShopOrder` types one THB total) enough, or must we port the full
   per-line camount/cprice/cshippingchn/cpriceupdate grid from update1/update3?
   This is the biggest hidden scope in P1-12.
4. **P1-11 mark-paid notify** — confirm against `pay-users.php` (⚠️ NOT re-read in
   this audit) whether legacy intentionally sent NO customer push on admin
   mark-paid. If yes, adding the Pacred customer notify is an *improvement* (still
   recommended for UX) not a fidelity fix.
5. **IPC reassign data dependency** — `adminReassignOrderInterpreter` returns an
   empty dropdown until the 13 admins are recreated (B-3) with
   `companyType='3' AND department='2' AND section IN ('3','4')`. Ship pluggable now?
6. **payMethod enum** — legacy `payMethod` is free-form ('origin'/'destination'/
   COD?). Confirm the exact allowed values from prod `tb_header_order.paymethod`
   distinct values before writing the Zod enum (don't guess).
7. **Sidebar entry (§0d)** — `/admin/service-orders` has no sidebar item, only
   dashboard cards. Add one under the ops group? (ปอน lane / owner call.)
