# Legacy-gap audit — adm-08-customers (Admin · customer mgmt: users · search · rate editor · juristic · admins)

> Audited 2026-05-30 (เดฟ lane adm-08). Legacy source = `/Users/dev/Desktop/pcs-realshit/REALSHITDATAPCS/pcsc/public_html/member/pcs-admin/`.
> Pacred compared = `/Users/dev/pacred-web` @ `dave-pacred`. Owner mandate: "ห้าม death", legacy is the spec, flow-ORDER must match.
> Builds on `docs/research/d1-fidelity-admin.md` (§customer-mgmt menu line 116) — this doc extends it to the handler/table level + finds the dead-writes that doc didn't.

## Overview

**Legacy scope** (the customer-management subsystem):
- `users.php` (59 KB) — the master dispatcher. Routes by `?page=` into customer-classification lists (all / general / vip / svip / corporation / comparison / credit) + the per-customer profile (`?page=profile&id=<userID>&page-user=<tab>`). Carries ~12 inline POST handlers: editUser (identity), recover (reset pwd), customRate (the rate editor), update-corporate, editCompStatus, registerVIP, add-address, update (address), updateAdminIDSale (assign rep), update_userNote, comparison-update, credit add/update.
- `users-search.php` (23 KB) — the dedicated customer search (4 keyTypes: รหัสสมาชิก / ชื่อ-นามสกุล / ที่อยู่หลัก / เบอร์โทร) → DataTable with RBAC-gated row actions (ลบบัญชี / รีเซ็ตรหัส / แก้ไขข้อมูล).
- AJAX handlers under `include/pages/users/`: deleteUser, deleteUserCredit, deleteUserCorporation, deleteUserComparison, deleteUserSVIP, recoverUser (modal), recoverAdmin, editUser (modal), editUserCredit (modal), editCompStatus (modal), editSale, editAdmin, getUserID(/CPS/Credit), checkEmailUser, deleteAdmin.
- `transferSalesCustomers.php` + `include/pages/transferSalesCustomers/{home,getItem}.php` — bulk sale-rep reassignment ("ระบบย้ายพนักงานขายที่ดูแลลูกค้า"): filter customers by current rep → multi-select checkboxes → pick new rep (AJAX getItem) → submit `updateSale`/`type=1` → bulk UPDATE `tb_users.adminIDSale` + history.
- `recently-used-imported-customers.php` + `home.php` — a report: every active customer (`userActive='1'`) with lifetime aggregates (shop spend `tb_header_order`, forwarder spend `tb_forwarder fStatus>5`, payment spend `tb_payment payStatus=2`, last forwarder date) — "รายงานลูกค้าที่ใช้งานล่าสุด".
- `customers-move-to-juristic` (named in brief) → realised in legacy as `check-juristic.php` + `include/pages/check-juristic/{home,compare}.php` — the นิติบุคคล verification queue + a DBD (กรมพัฒนาธุรกิจการค้า) field-by-field compare screen with a "แก้ไขข้อมูลตาม DBD" per-field button, then approve (`corporateStatus`).
- Admins: `add-admin.php` (31 KB hire form, Cargo/Freight) + `admin-table.php` (full HR employee CRUD — departments/sections/education/addresses/org-contacts/salary/national-ID) + `admin-profile.php` (151 KB HR profile: accounts, furlough, education, commission-interpreter) + `users.php?page=admin` (a *simpler* `tb_admin` register/edit/reset). Two distinct admin systems.

**Key legacy tables:** `tb_users` (the 8,898 customers; identity = `userID` = "PCS<n>"/"PR<n>" string), `tb_corporate` (juristic, keyed by `userID`), `tb_rate_custom_kg` / `tb_rate_custom_cbm` (live per-user rate), `tb_customrate_hs` + `tb_hs_rate_custom_kg` + `tb_hs_rate_custom_cbm` (rate-change history), `tb_address` + `tb_address_main`, `tb_credit`, `tb_admin` (+ `tb_education_background`, `tb_admin_address`, `tb_org_*_ships`), `tb_wallet`, `tb_cash_back`.

**Pacred scope:** `(admin)/admin/customers/*` (list · `[id]` detail · pending · recently-active · transfer-rep · transfer-bulk · `[id]`/{transfer-rep,convert-to-juristic}) + `(admin)/admin/admins/*` (list · new · `[id]`/edit) + `(admin)/admin/juristic-check/*`. Actions: `actions/admin/{customers,customer-profile,customer-rate,rate-edits,rates,customer-transfer-bulk,customers-reset-pwd,search-customers,admins,admin-profile,search-admins}.ts`.

**% complete (faithful, working against the 8,898 legacy customers): ~62%.**
The list, detail, search, address CRUD, note, sale-rep (inline), rate-editor, reset-pwd, and the per-customer single transfer-rep are correctly re-pointed to `tb_*`. BUT a cluster of high-frequency flows are 💀 **dead-writes to the rebuilt empty `profiles`/`corporate` tables**: basic-identity edit (orphaned entirely), juristic verify/reject + DBD compare, and the `/transfer-bulk` page. The customer *classification* system (VIP/SVIP/general/comparison/credit/juristic as distinct lists + their create/delete) is largely **absent** — Pacred has a single `customer_group` enum (normal/vip/special) that doesn't map to the legacy 6-way model.

---

## Workflow-by-workflow gap table

| # | Legacy flow | Pacred equiv | status | flow-order-correct? | owner |
|---|---|---|---|---|---|
| 1 | **Customer search** — `users-search.php`, 4 keyTypes (code/name/address/phone) → DataTable | `/admin/customers` list + `search-customers.ts` (`?q=`) reads `tb_users` | ✅ | ✅ (Pacred merges search into the list; both capabilities exist — accept) | ภูม |
| 2 | **Customer list by classification** — `?page=all/general/vip/svip/corporation/comparison/credit` (7 distinct lists) | `/admin/customers?group=` chips (normal/vip/special) on `tb_users` | 🟡 | ❌ — legacy has 7 named lists w/ distinct semantics (general vs VIP vs SVIP vs ค่าเทียบ vs เครดิต vs นิติบุคคล); Pacred collapses to 3 enum groups | ภูม |
| 3 | **Per-customer profile page** — `?page=profile&id=` + tabs (address/shop/forwarder/payment/cash-back/wallet/wallet-add/wallet-payment/wallet-his/wallet-withdraw) | `/admin/customers/[id]` reads `tb_users`+`tb_wallet`+`tb_corporate`+`tb_address`; stat cards via `customer-profile.ts:getCustomerStatCounts` | ✅ (Wave 20 P0-1 re-pointed to tb_users) | 🟡 — profile renders; the deep wallet/shop/forwarder/payment *tabs* are summarised as stat-cards, not the full legacy sub-pages | ภูม |
| 4 | **Edit customer identity** — `editUser` modal → `users.php` `update` POST → `tb_users` (name/lastname/email/tel/birthday/sex/facebook/lineid + adminIDSale/coID for senior roles), `saveHistory(...,13)` | `editCustomer` in `customers.ts` writes **`profiles`** (rebuilt) — **and is wired NOWHERE**. No tb_users identity-edit exists. | 💀 (P0) | ❌ — flow absent for real customers | เดฟ |
| 5 | **Reset customer password** — `recoverUser` modal → `users.php` `recover` POST → `UPDATE tb_users.userPass=pass_tam(...)`, `saveHistory(...,12)` | `customers-reset-pwd.ts:adminResetCustomerPassword` resolves tb_users.userid→profiles.member_code→auth.users.id, resets **Supabase auth** pwd (leaves `tb_users.userpass` untouched). Wired via `reset-pwd-button.tsx` on detail page. | ✅ (functional) | 🟡 — divergent mechanism (auth vs legacy hash) but intentional + documented; OK | ภูม |
| 6 | **Soft-delete customer** — `deleteUser.php` → `UPDATE tb_users.userStatus='0'`, RBAC=CEO/Manager/QA/Accounting/ITDT, `saveHistory(...,19)` | `customers.ts:suspendCustomer` → `tb_users.userStatus='0'`; `deletePendingCustomer` hard-deletes pending only | ✅ | ✅ | ภูม |
| 7 | **Recover deleted customer** — restore `userStatus`/`userActive` to '1' | `customers.ts:approveCustomer` flips `userActive/userStatus='1'` (+ auto-assigns rep + welcome SMS) | ✅ | 🟡 — Pacred ADDS rep-auto-assign + SMS (a Phase-C-ish enhancement folded into the port); faithful-core intact | ภูม |
| 8 | **Custom rate editor (SVIP)** — `users.php` `customRate` POST: writes LIVE `tb_rate_custom_kg`+`tb_rate_custom_cbm` (8 cells × KG/CBM × EK/SEA × warehouse), appends history `tb_customrate_hs`+`tb_hs_rate_custom_*` | `customer-rate.ts:adminSaveCustomerRate` writes `tb_rate_custom_kg`+`tb_rate_custom_cbm` + history `tb_customrate_hs`+`tb_hs_rate_custom_*`; wired via `[id]/rate-editor.tsx` | ✅ (explicitly fixes a prior dead-write — comment L12-17) | ✅ — writes LIVE + history, matches legacy order | ภูม |
| 9 | **Assign / change sale-rep (single, inline)** — `users.php` `updateAdminIDSale` POST → `tb_users.adminIDSale` | `customer-profile.ts:adminUpdateUserSaleRep` → `tb_users.adminidsale`; wired via `profile-sections.tsx` | ✅ | ✅ | ภูม |
| 10 | **Transfer sale-rep (single, dedicated route)** — same legacy semantics | `/customers/[id]/transfer-rep` → `admins.ts:adminTransferSalesRep` → **`profiles.sales_admin_id`** (rebuilt) | 💀 (P1) | ❌ — DEAD for legacy customers; duplicates #9 which already works on tb_users | เดฟ |
| 11 | **Bulk transfer sale-rep** — `transferSalesCustomers` → filter by rep → multi-select → `updateSale` → bulk `UPDATE tb_users.adminIDSale` + history | TWO Pacred pages: `/customers/transfer-rep` → `adminBulkTransferSalesRepTb` → **`tb_users.adminIDSale`** ✅ ; `/customers/transfer-bulk` → `bulkTransferCustomersToSalesRep` → **`profiles.sales_admin_id`** 💀 | 🟡 / 💀 | ❌ — the working one (transfer-rep) lacks the per-customer lifetime-aggregate columns the legacy table shows; the transfer-bulk duplicate is a dead-write | เดฟ |
| 12 | **Juristic verification queue** — `check-juristic/home.php` lists pending นิติบุคคล from `tb_corporate` | `/admin/juristic-check` reads **`corporate`** (rebuilt) joined to `profiles` | 💀 (P0) | ❌ — legacy juristic customers (in `tb_corporate`) are invisible here | เดฟ |
| 13 | **DBD compare + approve** — `check-juristic/compare.php`: field-by-field DBD vs submitted, "แก้ไขข้อมูลตาม DBD" per field, then approve (`corporateStatus`) | `customers.ts:{verifyJuristic,rejectJuristic,lookupDbdJuristic}` operate on **`corporate`** by `profile_id` UUID; wired in `customers-table.tsx` + `juristic-actions.tsx` | 💀 (P0) | ❌ — works only for NEW-signup juristic (profiles+corporate); DEAD for the 8,898 migrated; per-field "edit-to-DBD" buttons not ported | เดฟ |
| 14 | **Convert customer → juristic** — `editCompStatus`/`update-corporate` set `userCompany='1'` + insert/update `tb_corporate` (keyed by userID) | `/customers/[id]/convert-to-juristic` → `customers.ts:adminConvertToJuristic` flips `profiles.account_type='juristic'` + upserts **`corporate`** by `profile_id` | 💀 (P0) | ❌ — writes rebuilt tables; legacy customer's `tb_users.userCompany` + `tb_corporate` never touched | เดฟ |
| 15 | **Edit นิติบุคคล data** — `update-corporate` POST → `UPDATE tb_corporate` (number/name/address + file) | `customer-profile.ts:adminUpdateCorporate` → `tb_corporate` (UPDATE-only); wired via `profile-sections.tsx` | ✅ (file upload deferred) | ✅ — UPDATE-only matches legacy; PDF banner "รอบหน้า" | ภูม |
| 16 | **Customer classification CRUD** — register VIP (`registerVIP` → insert tb_users+wallet+cash_back, code `PCS<n>`), set comparison (`userComparison`+value), add/edit credit (`userCredit`+value+date, insert tb_credit), set SVIP (rate rows); deletes per class | Only `customer_group` enum edit (in the orphaned `editCustomer`). No register-VIP-by-admin, no comparison toggle, no credit-line grant, no per-class delete on tb_users | ❌ | ❌ — the whole legacy classification-management surface is missing on tb_users | ภูม |
| 17 | **Recently-active / imported-customers report** — `recently-used-imported-customers/home.php`: all active customers + lifetime shop/forwarder/payment aggregates + last-forwarder-date | `/admin/customers/recently-active` reads `tb_users` ordered by `userLastLogin` (simple heuristic; per-channel aggregates deferred to "Wave 8") | 🟡 | ❌ — legacy ranks by activity w/ lifetime spend columns; Pacred = last-login sort only, no aggregates/CSV | ปอน |
| 18 | **Admin: simple account CRUD** — `users.php?page=admin` registerAdmin/update/recover on `tb_admin` (+ `saveHistory` 15/16/17) | `/admin/admins` + `admins.ts` + `admin-profile.ts` (list/new/edit/reset) on `admins` + `tb_admin` (legacy_admin_id bridge) | 🟡 | 🟡 — Pacred has a richer RBAC admins table; bridges to tb_admin via legacy_admin_id. Verify reset/edit reach tb_admin for legacy staff visibility | ภูม |
| 19 | **Admin: full HR employee record** — `admin-table.php` add/edit/recover: department/section/education/address/org-email-line-wechat-tel/salary/national-ID/expiry/birthday; `saveHistory(...,57)` | No HR-record route in `(admin)/admin/admins/*` (only account-level fields) | ❌ | ❌ — HR record system absent (overlaps ops-roles HR workspace; out of immediate revenue path but legacy-present) | ภูม |
| 20 | **Admin: HR profile page** — `admin-profile.php` (151 KB): accounts/furlough/education/commission-interpreter sub-forms | `/admin/admins/[id]` (account view only) | ❌ | ❌ — HR profile sub-forms absent | ภูม |

---

## Death-flows (P0/P1 detailed)

### 💀 P0-A — Edit customer identity has NO working path (dead + orphaned)
- **Legacy:** `editUser` modal (`include/pages/users/editUser.php`) → `users.php` `update` POST updates `tb_users` name/lastname/email/tel/birthday/sex/facebook/lineid; senior roles (CEO/Manager/QA/Accounting/ITDT) additionally set `adminIDSale`+`coID`. `saveHistory($sql,13)`. RBAC: visible to almost all departments (the "แก้ไขข้อมูล" button in search rows). This is a daily-use staff action.
- **Pacred:** `customers.ts:editCustomer` writes the rebuilt **`profiles`** table (`.from("profiles").update(...)`, L39/57) keyed by `profiles.id` UUID — AND is imported nowhere (`grep editCustomer` → only its own definition). The live detail page (`profile-sections.tsx`) edits only note / sale-rep / corporate / address — never the core identity fields. `customer-profile.ts` has no name/email/phone/birthday/sex/lineid writer.
- **Impact:** an admin physically cannot correct a migrated customer's name, phone, email, birthday, sex, LINE id, or facebook. For 8,898 customers, the single most basic admin task is missing.
- **Fix:** new `customer-profile.ts:adminUpdateUserIdentity` writing `tb_users` (keyed by `userID`), with the senior-role gate for `adminidsale`/`coid`; wire an "แก้ไขข้อมูล" form into `profile-sections.tsx`. Delete the orphaned `editCustomer`. Owner: **เดฟ** (cross-cutting tb_users identity-edit + RBAC).

### 💀 P0-B — Juristic verification + DBD-compare + convert-to-juristic write the rebuilt tables (dead for 8,898)
- **Legacy:** `check-juristic/home.php` lists pending นิติบุคคล straight from `tb_corporate` (keyed by `userID`). `compare.php` shows DBD (กรมพัฒนาธุรกิจการค้า) data field-by-field vs the customer's submitted data with a per-field "แก้ไขข้อมูลตาม DBD" button, then approve via `corporateStatus`. `editCompStatus`/`update-corporate` also set `tb_users.userCompany='1'`.
- **Pacred:** the entire juristic cluster is on the rebuilt schema:
  - `/admin/juristic-check/page.tsx` → `.from("corporate")` joined to `profiles` (NOT `tb_corporate`).
  - `customers.ts:verifyJuristic` / `rejectJuristic` → `.from("corporate").update(...).eq("profile_id", uuid)`.
  - `customers.ts:lookupDbdJuristic` → caches to `corporate.dbd_payload`.
  - `/customers/[id]/convert-to-juristic` → `adminConvertToJuristic` → `profiles.account_type='juristic'` + upsert `corporate` by `profile_id`.
- **Impact:** the migrated customers' juristic records (in `tb_corporate`) never appear in the verification queue and cannot be verified/rejected/converted. These flows ONLY work for the handful of new-signup juristic customers who have a `profiles`+`corporate` row. This is the classic silent-dead-write: the screens render, buttons "succeed", but touch ~0 real rows. (Note: `customer-profile.ts:adminUpdateCorporate` already proves the correct pattern — it writes `tb_corporate` keyed by `userid`. The verify/reject/convert just need to follow it.)
- **Fix:** re-point the juristic queue + verify/reject/lookup/convert to `tb_corporate` (keyed by `userid`/`userID`) + set `tb_users.userCompany`. The `corporate.status` enum maps to legacy `corporateStatus` (verified/rejected ↔ legacy 2/3). Owner: **เดฟ** (architecture: profiles↔tb_corporate identity bridge + the partial-unique-index on tax_id).

### 💀 P1-C — `/customers/transfer-bulk` + `/customers/[id]/transfer-rep` write `profiles.sales_admin_id` (dead duplicates)
- **Legacy:** sale-rep ownership lives in `tb_users.adminIDSale` (varchar admin string). Bulk reassign = `transferSalesCustomers` (multi-select → bulk UPDATE).
- **Pacred has THREE rep-write paths, two of them dead:**
  - ✅ `customer-profile.ts:adminUpdateUserSaleRep` → `tb_users.adminidsale` (inline on detail page) — CORRECT.
  - ✅ `admins.ts:adminBulkTransferSalesRepTb` → `tb_users.adminIDSale` via `legacy_admin_id` (wired to `/customers/transfer-rep`) — CORRECT.
  - 💀 `admins.ts:adminTransferSalesRep` → `profiles.sales_admin_id` (wired to `/customers/[id]/transfer-rep`).
  - 💀 `customer-transfer-bulk.ts:bulkTransferCustomersToSalesRep` → reads `profiles.id`/`sales_admin_id`, delegates to the dead `adminTransferSalesRep` (wired to `/customers/transfer-bulk`).
- **Impact:** the `/transfer-bulk` page and the per-customer `/transfer-rep` sub-route silently no-op for legacy customers (they filter on `profiles.id` which 8,898 customers don't reliably have). Confusing duplicate of the working `/transfer-rep` bulk page + the working inline assign.
- **Fix:** retire `/customers/transfer-bulk` + `bulkTransferCustomersToSalesRep` + `adminTransferSalesRep` (or re-point them to tb_users); keep the working `adminBulkTransferSalesRepTb` (`/transfer-rep`) and the inline `adminUpdateUserSaleRep`. Add the legacy lifetime-aggregate columns (shop/forwarder/payment spend) to the bulk page so staff can target by value. Owner: **เดฟ** (dedup decision + integration).

### ❌ P1-D — Customer classification management is absent (VIP/SVIP/comparison/credit/juristic as admin-grantable states)
- **Legacy:** admins grant/revoke 6 customer classes from `users.php`: registerVIP (creates a new tb_users+wallet+cash_back), set SVIP (= a custom-rate row exists), set comparison (`userComparison`+`userComparisonValue`), grant credit (`userCredit`+`userCreditValue`+`userCreditDate`, insert `tb_credit`), convert juristic. Each has a delete (`deleteUserSVIP` clears rate rows; `deleteUserCredit` only if `creditValue=0`; `deleteUserComparison`; `deleteUserCorporation`).
- **Pacred:** only a `customer_group` enum (normal/vip/special) exists — and only inside the orphaned `editCustomer`. No admin-grant of credit-line, comparison-pricing, or SVIP-rate (the rate-editor exists but isn't framed as the SVIP grant); no per-class revoke with the legacy guards (e.g. credit only removable at zero balance).
- **Impact:** medium — these are lower-frequency than identity/juristic but are real revenue levers (credit line, ค่าเทียบ pricing). Customers who had these classes in legacy retain the data (migrated) but admins can't manage them.
- **Fix:** model the legacy classes on `tb_users` flags + `tb_credit`; build grant/revoke actions with the legacy guards. Owner: **ภูม** (admin-backend tb_* CRUD, long-haul).

---

## Flow-order divergences (pieces exist but sequence/keying differs)

1. **Classification lists collapsed (WF#2/#16).** Legacy exposes 7 named lists (all/general/vip/svip/corporation/comparison/credit) as distinct menu items with distinct semantics + per-list actions; Pacred has one `tb_users` list with a 3-value `group` chip. The order "pick list → see that class's customers → act with that class's buttons" is lost. Faithful port should restore the 7 filtered views (even if all over one tb_users query) + the per-class action set.
2. **Juristic queue keying (WF#12-14).** Legacy: queue reads `tb_corporate` (userID) → compare against DBD → approve sets `corporateStatus` + `tb_users.userCompany`. Pacred: queue reads `corporate` (profile_id) → approve sets `corporate.status` + `profiles.status`. Same step-order, wrong tables/keys → dead for migrated customers.
3. **Reset-pwd mechanism (WF#5).** Legacy writes the legacy hash into `tb_users.userPass` (so the next legacy-bridge sign-in uses the new pwd). Pacred resets the **Supabase auth** password and intentionally leaves `tb_users.userpass` stale. Functionally fine for Pacred-era sign-in, but a migrated customer who still authenticates via the legacy-bridge hash would not pick up the reset until they're on the auth path. Documented + acceptable, flagged for awareness.
4. **Sale-rep "history of who changed it" (WF#11).** Legacy bulk-transfer button text is literally "เปลี่ยนเซลล์ที่ดูแล **และบันทึกประวัติคนที่เปลี่ยน**" — it records the changing admin. Verify `adminBulkTransferSalesRepTb` writes an equivalent audit row (logAdminAction) — it appears to, but the legacy keeps a per-customer rep-change trail; confirm parity.
5. **Member-code generation (WF#16).** Legacy registerVIP mints `PCS<n>` (L161-163). Pacred mints `PR<n>` (PR + min-3-digit). This is the intended rebrand (per CLAUDE.md) — NOT a gap; noted so a future porter doesn't "fix" it back to PCS.

---

## Modals / AJAX / cron / print inventory

**Legacy modals (loaded via AJAX into the page):**
- `recoverUser.php` / `recoverAdmin.php` — reset-pwd modal (POST back to `users.php` `recover`). Pacred = `reset-pwd-button.tsx` ✅ (customer); admin reset via `admin-profile.ts`.
- `editUser.php` — edit-identity modal. Pacred = 💀 none (orphaned `editCustomer`).
- `editUserCredit.php` — edit credit-line modal (value/days). Pacred = ❌ none.
- `editCompStatus.php` — juristic approve/reject modal (option 2=ยืนยันถูกต้อง / 3=ไม่ผ่าน). Pacred = `juristic-actions.tsx` but on rebuilt `corporate` 💀.
- `editSale.php` / `editAdmin.php` — admin edit modals. Pacred = `/admin/admins/[id]/edit` ✅ (verify tb_admin reach).

**Legacy AJAX endpoints:**
- `deleteUser.php` (userStatus=0), `deleteUserCredit.php` (guard creditValue=0 → clear+DELETE tb_credit), `deleteUserCorporation.php` (clear userCompany + DELETE tb_corporate), `deleteUserComparison.php` (clear userComparison+value), `deleteUserSVIP.php` (DELETE tb_rate_custom_cbm+kg). → Pacred has suspend/delete-pending (tb_users) ✅ but NOT the per-class deletes ❌.
- `checkEmailUser.php` — live email-dup check on tb_users. → Pacred: verify the register/edit forms do an equivalent uniqueness check.
- `getUserID.php` / `getUserIDCPS.php` / `getUserIDCredit.php` — populate userID dropdowns filtered by class. → Pacred uses comboboxes; partial.
- `transferSalesCustomers/getItem.php` — AJAX modal to pick the new rep for selected customers. → Pacred `transfer-form.tsx` (server-side) ✅ for `/transfer-rep`.

**saveHistory action codes used in this lane** (legacy `tb_history`): 12=เปลี่ยนรหัสลูกค้า, 13=แก้ไขข้อมูลส่วนตัวสมาชิก, 14=สมัคร VIP, 15=สมัครแอดมิน, 16=แก้ไขแอดมิน, 17=เปลี่ยนรหัสแอดมิน, 19=ลบบัญชีลูกค้า, 57=เพิ่มพนักงานใหม่. → Pacred uses `logAdminAction(...)` (admin_audit). Verify each legacy-coded event has a Pacred audit entry.

**Cron:** none in this lane (customer-mgmt is interactive only).

**Print/PDF:** none in this lane (no print artefacts on the customer-mgmt screens; print lives in orders/forwarder/wallet lanes).

---

## Recommended fixes (ranked, with owner)

1. **[P0 · เดฟ] Re-point the juristic cluster to `tb_corporate`.** `/admin/juristic-check` queue + `verifyJuristic`/`rejectJuristic`/`lookupDbdJuristic`/`adminConvertToJuristic` → key by `userid`/`userID` on `tb_corporate` (+ set `tb_users.userCompany`). Follow the working `adminUpdateCorporate` pattern. Unblocks juristic for all 8,898. (WF#12-14, P0-B)
2. **[P0 · เดฟ] Add a working customer-identity edit on `tb_users`.** New `adminUpdateUserIdentity` (name/email/phone/birthday/sex/lineid/facebook + senior-role adminidsale/coid) keyed by `userID`; wire into `profile-sections.tsx`; delete orphaned `editCustomer`. (WF#4, P0-A)
3. **[P1 · เดฟ] Dedup the transfer-rep paths.** Retire `/customers/transfer-bulk` + `bulkTransferCustomersToSalesRep` + `adminTransferSalesRep` (profiles writers); keep `adminBulkTransferSalesRepTb` (tb_users) + inline `adminUpdateUserSaleRep`. Add lifetime-spend columns to the surviving bulk page. (WF#10-11, P1-C)
4. **[P1 · ภูม] Restore the 7 classification lists + per-class actions.** Filtered tb_users views for all/general/vip/svip/นิติบุคคล/comparison/credit; grant/revoke credit-line (insert/clear `tb_credit`, guard creditValue=0), comparison toggle, SVIP-rate framing, with the legacy delete guards. (WF#2/#16, P1-D + AJAX deletes)
5. **[P2 · ภูม] Verify admin reset/edit reach `tb_admin` for legacy staff.** Confirm `admins.ts`/`admin-profile.ts` reset+edit write through to `tb_admin` (legacy_admin_id) so PHP-era staff visibility holds; confirm each saveHistory code (12-17,57) has a logAdminAction equivalent. (WF#18)
6. **[P2 · ปอน] Upgrade `/customers/recently-active` to the legacy report.** Add lifetime shop/forwarder/payment aggregates + last-forwarder-date + CSV (data-analysis/dashboard lane). (WF#17)
7. **[P3 · ภูม] (Long-haul / ops-roles overlap) HR employee-record + HR profile.** Port `admin-table.php` + `admin-profile.php` (departments/sections/education/org-contacts/salary/national-ID/furlough/commission). Lower revenue priority; coordinate with the ops-roles HR workspace. (WF#19-20)
