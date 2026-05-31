# 01 — Customer / Identity / Auth cluster · big-audit 2026-06-01

> Cluster: registration · login + legacy-password bridge · OTP · member-code · address book ·
> corporate/นิติบุคคล · customer profile/groups · the migrated-8,898-customers state.
> Method: queried prod `yzljakczhwrpbxflnmco` for purpose + key columns + row counts (2026-06-01),
> compared to legacy PHP (`member/pcs-admin/*` + `member/include/`) + Pacred code at HEAD
> (`dave-pacred`), building on the 2026-05-31 re-sweep (`m1-auth-profile-misc.md`) +
> 2026-05-30 lane docs (`cust-01-auth.md`, `adm-08-customers.md`).
>
> **⚠️ Big correction up front:** several P0s the prior audits flagged are **CLOSED at HEAD**
> (admin identity-edit, admin juristic cluster, whole-base broadcast popup, wallet/cashback
> seeding, rep-at-signup). Verified table-by-table below. The genuinely-open holes are now
> small and concentrated.

---

## 1. DATA INVENTORY (prod, queried 2026-06-01)

### Legacy `tb_*` (the real customer data — camelCase on the camelCase-3)

| Table | Rows | Purpose (หัวข้อ it stores) | Key columns |
|---|---:|---|---|
| **`tb_users`** | **8,927** | THE customer master. Identity = `userID` ("PR<n>"/"PCS<n>" string). Every customer-side `tb_*` join keys on it. **camelCase columns.** | `userID` · `userTel` · `userPass` (79-char legacy hash) · `userName`/`userLastName` · `userEmail` · `userLineID`/`userLineIDOA`/`userFacebook` · `userSex`/`userBirthday` · `userStatus` (1/0 soft-del) · `userActive` (''=lead/'1'=contacted) · `userCompany` (''/'1' juristic) · `coID` (rate/promo group → `tb_co`) · `adminID`/`adminIDSale` (owner + sales rep) · `userComparison`+`userComparisonValue` (ค่าเทียบ pricing) · `userCredit`+`userCreditValue`+`userCreditDate` (credit line) · `shopUser` (1=ใช้เอง/2=ขาย) · `channel` (acquisition) · `userRecom` (referrer) · `userTransportType`/`userShipBy`/`userPayMethod` · `userRegisterWith` (all "PCS") · `userNote` · `userPicture` · `userRecoverKey`/`userRecoverDate` |
| **`tb_register`** | **16,853** | Signup **staging** — personal/juristic stage here w/ `token`+OTP `pin`/`refno`, promoted to `tb_users` on OTP-verify, then DELETEd. Legacy is canonical; **Pacred never uses it** (staging pattern abandoned). | `type` · `usertel` · `userpass` · `username`/`userlastname` · `useremail` · `corporatenumber`/`corporatename`/`corporateaddress`/`corporatefile`/`corporatefile20` · `shopuser` · `channel` · `coid` · `adminidsale` · `userrecom` · `token` · `refno` · `pin` |
| **`tb_corporate`** | **346** | Juristic/นิติบุคคล record, keyed by `userid`. Tax-invoice eligibility reads this. | `userid` · `corporatenumber` (tax ID) · `corporatename` · `corporateaddress` · `corporatefile` (affidavit) · `corporatefile20` (VAT-20) · `corporatestatus` (1/2 verified/3 rejected) · `cpdatecreate` |
| **`tb_co`** | **13** | The customer **rate/promo group** registry (the `coID` FK target): `PCS`=ทั่วไป (default), `VIP1..VIP5`, named promo groups (`PRO3.15`, `SWAN`, `SALE.PEPO`, `THADA.VIP`…). Drives which rate card a customer gets. | `coID` · `coName` · `coStatus` |
| **`tb_users_otp`** | **5,268** | Verified-identity log — a row per customer who passed phone OTP. Legacy: 0 rows → re-verify gate fires. | `userid` · `date` |
| **`tb_users_otp_hs`** | **8,777** | OTP-request rate-limit history (per-day cap <5). | (history) |
| **`tb_otp_check`** | **6,725** | OTP send/verify scratch (phone→pin+token+refno). | `usertel` · `pin` · `token` · `refno` · `date` |
| **`tb_address`** | **4,154** | Customer Thai shipping address book (soft-delete via `addressstatus`). | `addressid` · `userid` · `addressname`/`addresslastname` · `addresstel`/`addresstel2` · `addressno`/`addresssubdistrict`/`addressdistrict`/`addressprovince`/`addresszipcode` · `addressnote` · `latitude`/`longitude` · `addressstatus` · `adminid` |
| **`tb_address_main`** | **2,919** | Which `addressid` is each customer's **default** shipping address. | `userid` · `addressid` |
| **`tb_admin_address`** | **185** | STAFF home addresses (HR record, not customer). | `adminid` · `addressno`/`district`/`amphoe`/`province`/`zipcode` |
| **`tb_account_pcs`** | **98** | Company **bank accounts** (for receiving payments) — admin-managed. | `bankname` · `accountnumber` · `accountname` · `adminid` |
| **`tb_education_background`** | **29** | STAFF education (HR record). | `adminid` · `educationlevel`/`institution`/`faculty`/`gpa`/`graduateyear` |
| **`tb_contact_outsider`** | **44** | External-contact CRM (vendors/partners, not customers). | `coname`/`colastname` · `coemail`/`cotel`/`coaddress` · `note` · `adminidcreate`/`adminidupdate` |

**Distribution facts that matter (queried prod):**
- **Juristic:** `tb_users.userCompany='1'` = **350** vs `tb_corporate` = **346** (≈4 juristic users have no corporate row — minor data gap).
- **Activation:** `userActive=''` (legacy lead) = **6,937** · `='1'` (sales-contacted) = **1,963** · `='0'` (Pacred-native pending) = **27**. So the legacy "" sentinel dominates; only 27 native-pending exist.
- **Soft-deleted:** `userStatus='0'` = **9**.
- **Classification:** `userCredit='1'` = **76** · `userComparison='1'` = **10** · in a non-default `coID` group = **183**. These are real revenue levers and ALL live only in `tb_*`.
- **Acquisition:** `channel` mostly '' (962/1000 sampled); `shopUser` '' (962), '1'=22, '2'=16.

### Rebuilt / new (the Pacred-native schema)

| Table | Rows | Purpose | Live / dead vs `tb_*` |
|---|---:|---|---|
| **`profiles`** | **8,939** | Pacred-native customer identity (Supabase-auth-keyed UUID). **Backfilled from `tb_users` during migration** (`migrated_from_pcs=true` = **8,895**). Holds the full superset of columns incl. `customer_group`/`credit_*`/`comparison_*`/`account_type`. | **CANONICAL for auth + native-signup writes.** Mirrored into `tb_users` (best-effort). Reads split: portal pages read `tb_*`, auth reads `profiles`. |
| **`corporate`** (rebuilt) | **1** | Juristic record keyed by `profile_id` UUID. | 🟡 **near-dead.** Customer register-juristic STILL writes here (`saveJuristicStep2`). Admin juristic cluster was re-pointed OFF it → `tb_corporate`. So it holds new-signup juristic only (1 row vs 346). |
| **`addresses`** (rebuilt) | **0** | Pacred-native address book. | 💀 **DEAD** — never written, never backfilled. All address CRUD is on `tb_address`. |
| **`otp_codes`** | **56** | Pacred-native OTP (`phone`/`code_hash`/`purpose`/`expires_at`/`used`/`attempts`). | **LIVE** — this is the OTP path Pacred actually uses (`actions/otp.ts`). Legacy `tb_otp_check`/`tb_users_otp_hs` are read by admin reports only. |
| **`customer_groups`** | **3** | Pacred 3-tier group enum: `PR`/`VIP`/`SVIP`. | 🟡 **mostly cosmetic** — `profiles.customer_group` is `PR` for ~all (VIP=0 queried); the real 13-group model is `tb_co` (183 customers grouped). |
| **`pcs_legacy_customers_staging`** | **0** | Migration staging (drained). | 💀 done — `v_pcs_migration_status` confirms staging_rows=0. |
| **`member_code_migration_audit`** | **79** | Audit of member-code renames during migration (`was`→`becomes`, e.g. PR1→PR125 for staff relocation). | reference only. |
| **`v_pcs_migration_status`** | 1 (view) | Migration health: `migrated_profiles=8,895` · `member_code_seq_current=20,116` · `max_member_code_num=10,903`. | reference. |

---

## 2. REBUILT-TWIN verdict (canonical vs dead-write)

| Concern | Legacy table (canonical for data) | Rebuilt twin | Verdict at HEAD |
|---|---|---|---|
| Customer identity | `tb_users` (8,927) | `profiles` (8,939) | **Both live, inverted.** `profiles` is auth-canonical + backfilled; `tb_users` is the join target for all portal/admin reads. Native signup writes `profiles` first, mirrors `tb_users` best-effort (see §3 G-1). |
| Juristic | `tb_corporate` (346) | `corporate` (1) | **`tb_corporate` won on the ADMIN side** (queue + verify/reject/lookup/convert re-pointed — CLOSED). **Customer register-juristic still dead-writes `corporate`** (G-3, open). |
| Address book | `tb_address` (4,154) + `tb_address_main` (2,919) | `addresses` (0) | **`tb_*` is canonical.** `addresses` is fully dead. Customer add/edit write `tb_address`; delete/set-main are inert (M-1, open). |
| OTP | `tb_otp_check`/`tb_users_otp_hs` (legacy send/limit) | `otp_codes` (56) | **`otp_codes` is the live Pacred path.** Legacy OTP tables are admin-report reads only. Acceptable divergence. |
| Customer group | `tb_co` (13 groups, 183 grouped) | `customer_groups` (3) + `profiles.customer_group` | **`tb_co` is the real model;** rebuilt 3-tier enum is a lossy collapse (G-5). |

---

## 3. LEGACY GAPS (member + admin) — verified at HEAD

Legend: 💀 dead-write · 🔌 inert (UI present, no handler) · ❌ missing · 🟡 partial/divergent · ✅ closed since prior audit

### ✅ CLOSED since the 2026-05-30/31 audits (verified this pass — do NOT re-implement)

| Was | Prior sev | Now | Evidence |
|---|---|---|---|
| OTP "fully bypassed" | P0 (cust-01 #16) | ✅ **env-gated, fail-closed** | `actions/otp.ts:51` `process.env.EMERGENCY_OTP_BYPASS==="true"` (default false). Stale claim. |
| Admin can't edit customer identity | P0-A (adm-08 #4) | ✅ **`adminUpdateUserIdentity`** writes `tb_users` (name/email/tel/sex/birthday/lineid/facebook + history) | `actions/admin/customers.ts:54` |
| Juristic queue/verify/reject/convert dead | P0-B (adm-08 #12-14) | ✅ **all on `tb_corporate`** keyed by userid + sets `tb_users.userCompany` | `customers.ts:176/221/291/584`; `juristic-check/page.tsx:73` reads `tb_corporate`⋈`tb_users` |
| Whole-base login popup impossible | P0 Theme-C (`_MASTER-FRESH` #5) | ✅ **`adminCreateBroadcast`→`tb_notify`** (11 rows, reaches 8,898) + **`NotifyPopup`** reads `tb_notify`/`tb_notify_read` (1,174 reads) | `actions/admin/broadcasts.ts:115`; `(protected)/_notify-popup/notify-popup.tsx:46` |
| No `tb_wallet`/`tb_cash_back` seed at signup | P1-4 (cust-01) | ✅ **seeded** (idempotent, unique-constraint-safe) | `lib/auth/legacy-bridge-tb-users.ts:292/334` |
| No sales-rep at signup | P1-3 (cust-01) | 🟡→✅ **`adminIDSale` assigned at signup** (P1-15) | `legacy-bridge-tb-users.ts:210` |
| Dup-phone re-register orphan | — | ✅ blocked + reveals own code | `actions/auth.ts:200` |

### 🔴 GENUINELY OPEN — customer side (member PHP)

| # | Feature | Legacy | Pacred at HEAD | Sev |
|---|---|---|---|---|
| **M-1** | **Customer delete-address + set-main-address** | `include/pages/address/deleteAddress.php` (soft-del `addressstatus='0'`, refuse if main) + `setMainAddress.php` (UPSERT `tb_address_main`) | 🔌 **STILL inert** — `(protected)/addresses/page.tsx:275/297/365/387` are `data-legacy-onclick` markers; only `addAddressAction`+`editAddressAction` exist (write `tb_address`). **No `deleteAddressAction`/`setMainAddressAction` anywhere** (grep empty). A customer cannot remove or re-prioritise a saved shipping address → wrong-parcel risk. | **P0** |
| **M-2** | **Register-juristic writes `tb_corporate`** | OTP-verify INSERTs `tb_corporate` (userID-keyed) + the file refs | 💀 `saveJuristicStep2` (`actions/auth.ts:460`) upserts rebuilt **`corporate`** (profile_id). New juristic signups are invisible to the (now-faithful) admin juristic queue + tax-invoice eligibility (which read `tb_corporate`). Drops `corporateFile`/`corporateFile20`. | **P1** |
| **M-3** | **7-15-day re-verify OTP gate** | `all-script.php:266-377` auto-pops `#pcs-otp` when `tb_users_otp` has 0 rows for the user | ❌ not in `(protected)/layout.tsx`. `tb_users_otp` (5,268 rows) is only deleted on phone-change + read by admin reports; nothing re-prompts an unverified customer. | P1 |
| **M-4** | **Credit-due nudge popups (1d/3d/past-due)** | `all-script.php:429-722` auto-pops from `tb_forwarder.fCredit`+`fCreditDate` | 🟡 PARTIAL — counts surface as a **badge** on the floating "ชำระ" tab → `/payment-due`; the proactive auto-popup is gone. (Data already in `pcs-chrome.ts`.) | P1 / accept |
| **M-5** | **Reverse-image (camera) search** | `top-menu.php:106-112` camera input → `searchIMG.php` (laonet taobao+1688) | 🔌 **STILL inert** — `search-bar.tsx:115` camera `<button type="button">` has NO `onClick`. Backend (`lib/china-search/laonet.ts` + `searchByImage`) is built; pure wiring gap. | P1 |
| **M-6** | **Unread-receipt popup** | `all-script.php:384-426` `tb_receipt rPopup=''` → "พิมพ์ใบเสร็จ" popup | ❌ no `tb_receipt.rPopup` reader on customer side. | P2 |
| **M-7** | **Order-note read popups (hNote/fNote)** | `all-script.php:498-614` admin notes on order/import auto-shown | ❌ no reader in layout. | P2 |
| **M-8** | **Search-log → `tb_history_key`** | `search.php:370` INSERT per search | 🟡 logs to rebuilt `search_history` (0102), not `tb_history_key`. Acceptable if admin search-demand report reads `search_history`. | P2 |
| **M-9** | **`tb_keyword_product` popular-tag bar** | `top-menu.php:114` renders admin-managed popular keywords | 🟡 `pcs-chrome.ts:280` READS the table but `search-bar.tsx` uses hardcoded i18n quick-keys instead. | P2 |
| **M-10** | **Register referral/`shopUser` UI parity** | one page, post-OTP sales-rep intro popup, `shopUser` select, `channel`/`userRecom` referral | 🟡 tabs + wizard; sales-rep popup absent; verify `shopUser` + referral inputs render (backend ready). | P2 (ปอน) |

### 🔴 GENUINELY OPEN — admin side (pcs-admin PHP)

| # | Feature | Legacy | Pacred at HEAD | Sev |
|---|---|---|---|---|
| **A-1** | **Customer classification management** — grant/revoke VIP / SVIP / comparison / credit-line, as distinct admin actions | `users.php` `registerVIP`/`userComparison`/`userCredit` + handlers `editUserCredit.php`/`editUserComparison.php` + deletes `deleteUserCredit.php` (guard creditValue=0)/`deleteUserComparison.php`/`deleteUserSVIP.php`/`deleteUserCorporation.php` | ❌ **none exist** (grep `userCredit`/`userComparison`/`registerVIP`/`tb_credit` in admin actions → empty). **76 credit + 10 comparison customers** in `tb_users` are unmanageable; admin can't grant a credit line or ค่าเทียบ pricing or revoke them. | **P1** |
| **A-2** | **The 7 classification lists** | `users-{all,general,vip,svip,credit,comparison}.php` + `user-corporation.php` — distinct filtered views w/ per-class row actions | 🟡 Pacred collapses to one list w/ a 3-value `group` chip (normal/vip/special) keyed on the cosmetic `profiles.customer_group`, NOT `tb_co` (13 groups, 183 grouped). | P1 |
| **A-3** | **Dedup the dead transfer-rep twins** | rep ownership = `tb_users.adminIDSale` | 💀 `/customers/transfer-bulk` (`bulkTransferCustomersToSalesRep`) + `/customers/[id]/transfer-rep` (`adminTransferSalesRep`) write `profiles.sales_admin_id` (dead for migrated). The working paths are `adminBulkTransferSalesRepTb` (`/transfer-rep`) + inline `adminUpdateUserSaleRep`. Retire or re-point the dead duplicates. | P1 |
| **A-4** | **`recently-active` lifetime-spend report** | `recently-used-imported-customers.php` — active customers + lifetime shop/forwarder/payment aggregates + last-forwarder-date | 🟡 `/customers/recently-active` = last-login sort only; per-channel aggregates + CSV deferred. | P2 |
| **A-5** | **`tb_users` ↔ `tb_corporate` orphan reconcile** | n/a (legacy atomic) | ❌ NEW find — **350 `userCompany='1'` but only 346 `tb_corporate` rows** = ~4 juristic users with no corporate record (likely from the inverted register path or a migration edge). No reconcile/repair job. | P2 |
| **A-6** | **HR employee record + HR profile** | `admin-table.php` + `admin-profile.php` (151 KB): departments/sections/education (`tb_education_background` 29)/addresses (`tb_admin_address` 185)/org-contacts/salary/national-ID/furlough/commission | ❌ absent (account-level admin fields only). Overlaps ops-roles HR; legacy-present but off the customer-money path. | P2/P3 |
| **A-7** | **Promo-cohort tools** | `check-customer-maomao-vip.php`, `check-customer-maomao-free.php`, `check-customer-shipby-freedom.php`, `user-pro-valentine.php`, `user-pro1212.php` — seasonal/promo customer-cohort grant screens | ❌ none ported. Tie into `tb_co` promo groups (`PRO3.15`/`PRO4.4`…). Marketing lever. | P2 |

### Flow-order divergences still live
- **G-1 — register canonical-table inversion (the root):** legacy = `tb_register`→OTP→`tb_users` (one INSERT IS the customer). Pacred = `auth.users`→`profiles`→best-effort `tb_users` mirror (`legacy-bridge-tb-users.ts`, logs-but-no-rollback; no-ops on collision). The mirror is now richer (seeds wallet/cashback/rep, sets userCompany) so the *symptom surface* is small — but a mirror that silently no-ops still leaves a `profiles`-only customer who is a join-orphan in the `tb_*` plane. **No staging table used.** Architecture decision still owed (make `tb_users` canonical OR make the mirror transactional/fail-closed). Owner: เดฟ.
- **G-2 — `userActive` sentinel split:** legacy lead=`''` (6,937), Pacred-native pending=`'0'` (27). Confirm the admin pending queue filters BOTH (or unify). Owner: ภูม.

---

## 4. MAX-POTENTIAL UPGRADES ("ดึงศักยภาพสูงสุด")

The customer/identity data is the richest asset in the system (8,927 customers, 4,154 addresses,
years of `coID`/credit/comparison/channel signal). Concrete leverage:

| # | Upgrade | Why it's high-value | Effort | Value |
|---|---|---|---|---|
| **U-1** | **Customer 360 + segmentation engine** — join `tb_users` (group/credit/comparison/channel) ⋈ `tb_header_order`+`tb_forwarder`+`tb_payment` lifetime spend ⋈ `userLastLogin` into one admin view + saved segments. Subsumes A-2/A-4. | Turns 8,927 rows of dormant signal into targetable cohorts (re-engage 6,937 `userActive=''` never-contacted leads; surface dormant high-spenders). Direct revenue. | L | **P1** |
| **U-2** | **Win-back / dormant-lead campaign** — the **6,937 `userActive=''`** leads were staged but never sales-contacted, and 27 native-pending sit un-approved. Auto-queue them to reps (round-robin already exists) + LINE/SMS nudge via `tb_notify` (now whole-base) + `otp_codes`. | 78% of the customer base is an un-worked lead pile. Even a small conversion = large absolute revenue. Uses already-built broadcast + rep-assign. | M | **P0** |
| **U-3** | **Credit-line + ค่าเทียบ as a managed product** — build A-1 (grant/revoke on `tb_users`+`tb_credit` w/ legacy guards) THEN add a scoring model (spend history + payment-on-time) that *recommends* credit limits. 76 credit + 10 comparison customers today. | Credit line is a retention + AOV lever; today it's frozen (no admin UI). Scoring makes it scalable + safe. | M (A-1) + L (scoring) | **P1** |
| **U-4** | **Address intelligence** — `tb_address` has 4,154 rows with `latitude`/`longitude`. Cluster delivery density → optimise driver routes, flag duplicate/typo addresses, autofill from `tb_address_main`. | Cuts mis-delivery (the M-1 risk) + driver cost; lat/lng already captured but unused for ops. | M | P2 |
| **U-5** | **Promo-group platform** — generalise `tb_co` (13 groups) into a first-class campaign engine: create a `coID`, attach a rate card + a `tb_notify` push + an expiry, assign cohorts (subsumes A-7). | Marketing self-serve; today promos are hardcoded PHP screens per season. | L | P2 |
| **U-6** | **Unify the identity spine (kill the inversion)** — resolve G-1 so `tb_users` is canonical (or mirror is transactional). Add a nightly reconcile job catching `profiles`-only orphans + the A-5 `userCompany`/`tb_corporate` mismatch. | Removes the entire class of "native customer is a join-orphan" silent bugs; precondition for trusting any analytics built on `tb_users`. | L (decision-gated) | **P1** |
| **U-7** | **OTP/verification trust score** — `tb_users_otp` (5,268 verified) + `tb_users_otp_hs` (8,777 attempts) → a per-customer trust signal; gate high-value actions (credit, large withdraw) on re-verify (revives M-3 with purpose). | Fraud surface for a money platform; the data already distinguishes verified vs never-verified. | M | P2 |
| **U-8** | **Self-serve juristic + e-tax** — finish M-2 (`tb_corporate` write) then let juristic customers self-update company data + auto-pull DBD + trigger e-tax-invoice. 350 juristic customers. | Juristic = the high-AOV B2B segment; today their record can land in the wrong table + tax-invoice flow is admin-only. | M | P1 |

---

## 5. Counts (this cluster, verified at HEAD)

**Open: P0 ×2 · P1 ×8 · P2 ×8** (down sharply from the prior audits — 5 prior P0s confirmed CLOSED).

- **P0 (2):** **M-1** customer delete/set-main-address (inert; data-correctness/wrong-parcel) · **U-2** (treated as P0-value) the 6,937 un-worked lead activation — though U-2 is opportunity not a defect.
  - *Strictly-defect P0 = M-1 only.*
- **P1 (8):** M-2 register-juristic→`tb_corporate` · M-3 re-verify OTP · M-5 camera search wiring · A-1 classification grant/revoke · A-2 the 7 lists · A-3 dedup dead transfer-rep · G-1 identity inversion (architecture) · G-2 userActive sentinel.
- **P2 (8):** M-4 credit popups (or accept badge) · M-6 receipt popup · M-7 order-note popups · M-8 search-log table · M-9 keyword tags · A-4 recently-active report · A-5 juristic orphan reconcile · A-6 HR records · A-7 promo cohorts.

**Lane note:** M-1/M-2/M-5/G-1 = เดฟ + ปอน (customer). A-1/A-2/G-2 = ภูม (admin tb_* CRUD). A-3/A-5 = เดฟ (dedup/reconcile). A-6/A-7 = Phase-C. None collide with the forwarder/money lanes.
