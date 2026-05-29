# Legacy Gap Audit — adm-14: Admin · HR · settings · org · rate · notifications · API integrations

**Lane:** `adm-14-hr-settings-api` · side: **admin** · owner-of-record: เดฟ (this audit)
**Date:** 2026-05-30 · **Pacred HEAD:** `dave-pacred` @ `844a0b5a`
**Legacy source:** `/Users/dev/Desktop/pcs-realshit/REALSHITDATAPCS/pcsc/public_html/member/pcs-admin/`

> Owner mandate: "ห้าม death", legacy is the spec, flow-ORDER must match. TRUST-BUT-VERIFY every gap by opening the real file.

---

## Overview

### Legacy scope (what PCS Cargo admin does in this lane)

| Group | Legacy files | Real tables (114/117 reconciled = HAVE DATA) |
|---|---|---|
| **Master config** | `settings.php` (502 KB, **134** `update_*` POST handlers), `settings-vip.php`, `products.php` | `tb_settings` (id=1 singleton): CNY rates (rsDefault/rpDefault), numberPaymemt, freeShipping, hRateCostDefault, **+ a 128-cell default-cost matrix** (fCostCar1-4 × fCostShip1-4 × 8 forwarders Default/CargoCenter/JMF/MKCargo/MOMO/MXCargo/Sang/WMXCargo × 2 variants) · `tb_product` |
| **Rate cards** | `rate.php` (73 KB), `rate-vip.php` | `tb_rate_g_kg`/`tb_rate_g_cbm` (+`_car`/`_ship` variants) general tiered · `tb_rate_vip_kg`/`tb_rate_vip_cbm` · `tb_rate_custom_kg`/`tb_rate_custom_cbm` (SVIP) · `tb_hs_rate_custom_*` |
| **HR — recruitment** | `post-job.php`, `post-job-hs.php` | `tb_post_job` (company→adminType→department→section dependent-dropdown job posting) |
| **HR — time/attendance** | `time-attendance-system.php` (8 cases: holiday, holiday-maid, leave-record, record-work-time, history) | `tas_holiday`, `tas_holiday_maid`, `tas_leave`, `tas_historydataold`, `tb_admin` |
| **Org asset registries** | `organization-{tell,email,line,wechat,domainname,chart,category-product}.php`, `organization-table.php` | `tb_organization_tell`/`_email`/`_line`/`_wechat`/`_domainname` (with stored passwords!) · `tb_keyword_product` · `tb_name` |
| **Account self-service** | `account-settings.php`, `address.php` | `tb_admin` (admin password self-change → force re-login) · member address read-only |
| **Customer popup notify** | `notify.php` | `tb_notify_wp` (title/detail/dateStart/dateExp/status/URL — the customer-facing announcement banner ALL customers see) |
| **LINE Notify (admin)** | `line-notify.php`, `admin-table-linenotify.php`, `get-token-linenotify.php`, `api/linenotify/callback`, `api/linenotify/revoke` | `tb_admin.adminLineTokenNotify` (OAuth connect/revoke per-admin) |
| **Partner API — JMF** | `api-forwarder-jmf.php` (dashboard/view/invoice/history/manual) + `api/update-forwarder/JMFCARGO/{GET/fCost, PUT}` | inbound webhook (token-gated) → match `fTrackingCHN` → upsert `tb_forwarder` + `tb_forwarder_jmf_tmp` |
| **Partner API — CN (Cargo Center)** | `api-forwarder-cn.php` (33 KB: APICheckSM/updateAPI/manualUpdate) | pull SM tracking → `tb_forwarder` |
| **Partner API — TTP** | `api-forwarder-ttp.php` | dashboard/dataTable per-SM |
| **Google Sheets pulls** | `api-sheets-ctt.php`/`-mk`/`-mx`/`-sang-2023.php`, `api/autorun/update-sheet-sang*.php` | sheet → JSON dump → forwarder intake (`tb_notify_sheet_ctt` dedupe) |
| **Crons (autorun)** | `check-apprentice/`, `update-active-customers/`, `send-line-sales/` | see Modals/cron inventory below |
| **RBAC reference** | `code-templet.php` (scratch), `api/checkAccessPermission/` | `checkRights()`/`checkRightsName()` via `organization-chart/dataJson.php` |

### Pacred scope (what exists on `dave-pacred`)

HR is the **most complete** sub-area: `/admin/hr/{recruitment,attendance,attendance/leaves,training,org-table,org-chart,assets,policies,audit,humanresource}` all exist with forms + actions. Settings: `/admin/settings/{,legacy-rates,contacts,tos-versions,notifications,business-config}`. Rates: `/admin/rates/{general,vip,custom-user,custom-hs}`. Plus `/admin/broadcasts`, `/admin/carriers`, `/admin/organization-email`, `/admin/system/{crons,cron-health,notifications}`, `/admin/api-forwarder-cn`, `/admin/api-sheets-{ctt,mk,mx,sang}`, `lib/integrations/{momo-jmf,momo-isolated,momo-lcl,google-sheets,cargothai}`, 10 Vercel crons.

**The surface area looks ~90% covered.** The problem is NOT missing pages — it is **a systemic silent dead-write split-brain**: the rebuilt app built parallel Pacred-original tables (`attendance_logs`, `job_postings`, `broadcasts`, `rate_general`, `rate_vip`, `admin_contact_extras`, `wallet_transactions`, `service_orders`, `profiles`) and wired the admin UIs + crons to THOSE, while the 8,898-customer real data lives in the migrated `tb_*`/`tas_*` tables (all 20 lane tables confirmed present in `0081_pcs_legacy_schema.sql` + reconciled per `docs/runbook/pcs-data-migration.md` "114 of 117 tables").

### % complete (faithful — writes to the right table AND correct flow-order)

**~45%.** Pages/forms exist broadly, but ~half the lane writes to empty rebuilt tables. Breakdown:
- ✅ Genuinely faithful (tb_*): `tb-settings.ts`→`tb_settings` rates · `rate-edits.ts`→`tb_rate_vip_*`/`tb_hs_rate_custom_*` · `customer-rate.ts`→`tb_rate_custom_*` · `organization-email.ts`→`tb_organization_email` · `account-settings` password change · momo-sync cron (pivoted to `tb_forwarder`)
- 💀 Dead-write (rebuilt table, real data ignored): rates general/vip editor · all 3 lane crons · broadcasts recipients · HR attendance/recruitment · org-contacts
- ❌ No Pacred equivalent: general rate-card editor (`tb_rate_g_*`) · `tb_notify_wp` customer popup · 128-cell default-cost matrix · 4 of 5 org channels (tell/line/wechat/domainname editors) · `tb_keyword_product` editor · JMF inbound PUT webhook · TTP integration · LINE Notify per-admin OAuth · time-attendance record-work-time/maid-holiday

---

## Workflow-by-workflow gap table

| # | Legacy flow | Pacred equiv | status | flow-order? | owner |
|---|---|---|---|---|---|
| 1 | **CNY rates** rsDefault/rpDefault (settings.php L3-30) | `tb-settings.ts adminSetTbSettingsRates` → `tb_settings` · `/admin/settings/legacy-rates` | ✅ | ✅ (A6 fixed the rsdefault↔rpdefault transfer-surface typo) | ภูม |
| 2 | **numberPaymemt / freeShipping** (settings.php L31-58) | none — `tb_settings.numberPaymemt`/`freeShipping` editable only by raw SQL | ❌ | n/a | ภูม |
| 3 | **128-cell default-cost matrix** fCostCar/Ship × 8 forwarders (settings.php L59-687, ~120 handlers) | none — these `tb_settings` columns have no Pacred editor | ❌ | n/a | ภูม |
| 4 | **hRateCostDefault / hRateCostSale** (settings.php L688-714) | `tb_settings.hratecostdefault` shown read-only in legacy-rates form; `hRateCostSale` absent | 🟡 | partial | ภูม |
| 5 | **General rate card** tiered KG/CBM (rate.php → `tb_rate_g_kg`/`_cbm`) | `/admin/rates/general` → **`rate_general` (REBUILT, empty)**; live calc reads `tb_rate_g_*` via `lib/forwarder/resolve-rate.ts` | 💀 | edits never reach engine | ภูม |
| 6 | **VIP rate card** (rate-vip.php → `tb_rate_vip_kg`/`_cbm`) | TWO paths: `/admin/rates/vip` → `rate_vip` (REBUILT 💀) **vs** `rate-edits.ts adminUpdateVipRateCells` → `tb_rate_vip_*` (✅, wired from `/admin/customers/[id]`) | 🟡 | the per-customer path works; the rate-card page is dead | ภูม |
| 7 | **SVIP / custom-user rates** (`tb_rate_custom_*`) | `customer-rate.ts` + `rate-edits.ts` → `tb_rate_custom_*`/`tb_hs_rate_custom_*` | ✅ | ✅ (faithful waterfall per resolve-rate.ts doc) | ภูม |
| 8 | **Custom-HS rates** (`tb_customrate_hs`+`tb_hs_rate_custom_*`) | `/admin/rates/custom-hs` → `rate_custom_hs` (REBUILT 💀) vs `rate-edits.ts` → `tb_hs_rate_custom_*` (✅) | 🟡 | dual-path | ภูม |
| 9 | **Job posting** company→type→dept→section dropdowns → `tb_post_job` (post-job.php) | `/admin/hr/recruitment/new` → `recruitment.ts` → **`job_postings` (REBUILT, empty)** | 💀 | rebuilt-only, ignores migrated `tb_post_job` | ภูม |
| 10 | **Job applicants tracking** (`tb_post_job` apply flow) | `recruitment.ts` → `job_applicants` (REBUILT) | 💀 | n/a | ภูม |
| 11 | **Annual holiday** add → `tas_holiday` (time-attendance L17-50) | `/admin/hr/attendance` — but `attendance.ts` writes `attendance_logs`/`leave_requests` (REBUILT) | 💀 | `tas_holiday` data ignored | ภูม |
| 12 | **Maid holiday** → `tas_holiday_maid` | none | ❌ | n/a | ภูม |
| 13 | **Leave record** → `tas_leave` (time-attendance) | `/admin/hr/attendance/leaves` → `leave_requests` (REBUILT) | 💀 | `tas_leave` data ignored | ภูม |
| 14 | **Record-work-time / attendance history** (`tas_historydataold`) | `attendance_logs` (REBUILT) — no record-work-time clock | ❌/💀 | n/a | ภูม |
| 15 | **Org email registry** (`tb_organization_email`, with passEmail) | `/admin/organization-email` → `organization-email.ts` → `tb_organization_email` | ✅ | ✅ | ภูม |
| 16 | **Org tell registry** (`tb_organization_tell`) | none (mobile-launchpad READS it; no editor) | ❌ | read-only | ภูม |
| 17 | **Org line/wechat/domainname registries** (3 tables w/ passwords) | none | ❌ | n/a | ภูม |
| 18 | **Org contacts (consolidated)** | `/admin/settings/contacts` → `org_contacts` (REBUILT, migration 0046) — a parallel Pacred system; public/contact reads it | 🟡 | parallel to tb_organization_* (split-brain) | ภูม |
| 19 | **Product keyword category** add → `tb_keyword_product` (organization-category-product.php) | none (only `lib/legacy/pcs-chrome.ts` references it) | ❌ | n/a | ภูม |
| 20 | **Admin password self-change** verify-old→set-new→force re-login (account-settings.php) | `/admin/admins` self-edit (uses tb_admin via admins merge, Wave 22) | ✅ | ✅ | ภูม |
| 21 | **Customer popup announcement** → `tb_notify_wp` (notify.php) — ALL customers see | `/admin/broadcasts` → `broadcasts` (REBUILT) targeting `profiles WHERE status=active` | 💀 | recipients = only auth-migrated subset, not 8,898; `tb_notify_wp` never written/read | เดฟ |
| 22 | **LINE Notify per-admin OAuth** connect/revoke → `tb_admin.adminLineTokenNotify` (get-token-linenotify + callback + revoke) | none (LINE Notify EOL Apr 2025; replaced by LINE OA) | ❌ (intentional? — see flow-order notes) | ก๊อต |
| 23 | **JMF inbound webhook PUT** token→match fTrackingCHN→upsert `tb_forwarder` | `lib/integrations/momo-isolated` + momo-sync cron auto-commits to `tb_forwarder` (Wave 30) | 🟡 | Pacred pulls (cron) instead of legacy inbound push; lands in tb_forwarder ✅ | ก๊อต |
| 24 | **CN (Cargo Center) API** APICheckSM/updateAPI/manualUpdate → `tb_forwarder` | `/admin/api-forwarder-cn` (page + manual) | 🟡 | page present; verify write target (out of this audit's deep-read) | ก๊อต |
| 25 | **TTP API** SM dashboard/detail | none (no `lib/integrations` TTP client) | ❌ | n/a | ก๊อต |
| 26 | **Google Sheets pull** CTT/MK/MX/Sang → forwarder intake | `/admin/api-sheets-{ctt,mk,mx,sang}` + `lib/integrations/google-sheets/ctt-adapter.ts` + cron `sheets-sync-ctt` | 🟡 | CTT adapter foundation only (🟡 per its own doc); MK/MX/Sang pages exist, adapters incomplete | ก๊อต |
| 27 | **Cron: check-apprentice** (a) expire probation `tb_admin.adminStatusA` past `endDate`; (b) expire `tb_forwarder_driver` assignments >17h `fdStatus 1→3` | `expire-probation` → `admin_contact_extras` (REBUILT) + `expire-driver-assignments` (flagged C2 in master audit) | 💀 | reads rebuilt; tb_admin probation never expires; flow SPLIT into 2 crons | ภูม |
| 28 | **Cron: update-active-customers** scan tb_header_order/tb_forwarder/tb_payment → set `tb_users.userActive='1'` + delete orphan tb_check_forwarder | `refresh-active-customers` → reads `service_orders`/`forwarders`/`yuan_payments` → writes `profiles` (ALL REBUILT/empty) | 💀 | complete dead-write — 8,898 customers' active flag never updates | ภูม |
| 29 | **Cron: send-line-sales** 00:05 daily 3-line sum (shop/forwarder/yuan) from `tb_wallet_hs` → LINE Notify token | `sales-daily-digest` → reads `wallet_transactions` (REBUILT) → `sendNotification` to admin `profiles` | 💀 | reads empty table → digest always 0; recipients via profiles | ภูม |

---

## Death-flows (P0/P1 detailed)

### 💀 P0-1 — `refresh-active-customers` cron is a total dead-write
`app/api/cron/refresh-active-customers/route.ts` (L26/44/62/87) reads `service_orders`, `forwarders`, `yuan_payments` and writes `profiles.is_active`. **All four are rebuilt tables that are empty/near-empty on prod.** Legacy `update-active-customers/index.php` reads `tb_header_order`, `tb_forwarder`, `tb_payment` and sets `tb_users.userActive='1'`. Result: the `userActive` flag on the 8,898 migrated customers **never flips** — any admin filter / report / segmentation keyed on active-customer is permanently wrong. Runs every day at 01:00 doing nothing. **Fix: retarget to tb_* + tb_users.** Owner: ภูม.

### 💀 P0-2 — General rate-card editor writes a table the pricing engine ignores
`/admin/rates/general` (+`/vip`) → `actions/admin/rates.ts` writes `rate_general`/`rate_vip` and reads `customer_groups`/`profiles` (all rebuilt, empty). But the LIVE forwarder pricing waterfall is `lib/forwarder/resolve-rate.ts` (its own doc-comment, L1-60: *"This is the LIVE lane (tb_forwarder · ~45k rows)… DISTINCT from calc-price.ts which only drives the rebuilt forwarders lane (almost no prod data)"*) reading `tb_rate_g_*`/`tb_rate_vip_*`/`tb_rate_custom_*`. So an admin editing general rates sees a green toast; **the change never reaches the engine that prices real orders.** There is currently **NO Pacred UI that edits `tb_rate_g_kg`/`tb_rate_g_cbm`** (the general tiered card) — only `resolve-rate.ts` + `forwarders-edit.ts` READ them. The VIP/SVIP per-customer path IS faithful (`rate-edits.ts`/`customer-rate.ts` → tb_*), so the gap is specifically the **general rate-card editor + the `/admin/rates/general|vip` page wiring**. **Fix: build a `tb_rate_g_*` editor + delete/repoint `rates.ts` rebuilt writers.** Owner: ภูม.

### 💀 P0-3 — Customer popup announcements (`tb_notify_wp`) reach almost no one
Legacy `notify.php` writes `tb_notify_wp` — the announcement banner that EVERY customer sees on login. Pacred `/admin/broadcasts` (`actions/admin/broadcasts.ts`) writes the rebuilt `broadcasts` table and resolves recipients from `profiles WHERE status='active'` (L198-220). Per `0067_pcs_customer_migration.sql` §3, `profiles` is backfilled ONLY when a migrated customer actually logs in (FK to `auth.users`); the bulk of the 8,898 are in `tb_users` but NOT yet in `profiles`. So a mass announcement reaches only the small logged-in subset. `tb_notify_wp` is migrated-with-data but **read by nothing** in Pacred. **Fix: either write+read `tb_notify_wp` for the popup, or broadcast recipients off `tb_users`.** Owner: เดฟ (customer-backend + notify spine).

### 💀 P0-4 — `sales-daily-digest` always reports zero
`app/api/cron/sales-daily-digest/route.ts` reads `wallet_transactions` (L49/69, rebuilt/empty) instead of legacy `tb_wallet_hs`. The 00:05 management LINE digest (yesterday's shop/forwarder/yuan paid totals) therefore always sums to 0. It also sends via `sendNotification` to admin `profiles` instead of the legacy LINE-Notify token broadcast. **Fix: read tb_wallet_hs (3 streams joined to tb_header_order/tb_forwarder/tb_payment exactly as send-line-sales does).** Owner: ภูม.

### 💀 P1-5 — HR attendance + recruitment ignore migrated `tas_*` / `tb_post_job`
`/admin/hr/attendance*` → `attendance.ts` writes `attendance_logs`/`leave_requests`; `/admin/hr/recruitment*` → `recruitment.ts` writes `job_postings`/`job_applicants`. All rebuilt. Migrated `tas_holiday`/`tas_holiday_maid`/`tas_leave`/`tb_post_job` are unused. Lower revenue impact (internal HR) but **flow-order + data both diverge** — staff leave history from PCS is invisible. The legacy `record-work-time` clock + `tas_holiday_maid` (maid-holiday) flows have no Pacred equivalent at all. Owner: ภูม.

### 💀 P1-6 — `expire-probation` doesn't expire probation, and the legacy cron's second job is split off
`expire-probation/route.ts` reads `admin_contact_extras` (rebuilt) not `tb_admin`. Legacy `check-apprentice/index.php` does TWO things in one run: (a) `UPDATE tb_admin SET adminStatusA='0'` for interns past `endDate`; (b) expire `tb_forwarder_driver` assignments older than 17h (`fdStatus 1→3` + cascade `tb_forwarder_driver_item`). Pacred split (b) into `expire-driver-assignments` (already flagged C2 in master-fidelity as also pointing at a rebuilt table) and (a) onto `admin_contact_extras` — so **interns on `tb_admin` are never auto-suspended.** Owner: ภูม.

### 🟡 P1-7 — Org-contact split-brain (5 legacy tables vs 1 rebuilt)
Legacy keeps 5 channel registries (`tb_organization_tell/email/line/wechat/domainname`, each storing the channel + password + note). Pacred has TWO simultaneous systems: `/admin/organization-email` (faithful → `tb_organization_email`) AND `/admin/settings/contacts` (→ rebuilt `org_contacts`, also read by public/contact + mobile-launchpad). Only email has a faithful editor; tell/line/wechat/domainname have NO editor (mobile-launchpad only READS `tb_organization_tell`). **Decide one home.** Owner: ภูม.

### ❌ P1-8 — Master config fields with no editor
`tb_settings.numberPaymemt`, `freeShipping`, `hRateCostSale`, and the entire **128-cell default forwarder-cost matrix** (fCostCar1-4 × fCostShip1-4 × 8 forwarders × 2 variants) are editable in legacy `settings.php` but have **no Pacred UI** — only raw SQL. These drive default forwarder cost auto-fill per-partner. Owner: ภูม.

---

## Flow-order divergences

1. **JMF: inbound push → outbound pull.** Legacy: partner JMF POSTs to `api/update-forwarder/JMFCARGO/PUT` (token-gated) which upserts `tb_forwarder` keyed on `fTrackingCHN`. Pacred: a 10-min cron PULLS from MOMO and auto-commits to `tb_forwarder` (`momo-sync` → `lib/integrations/momo-isolated`). **End state is the same table (tb_forwarder ✅)** and the master audit blesses the pull model as "Pacred does better", but the inbound-webhook entrypoint legacy partners may still POST to does not exist — confirm with ก๊อต whether JMF was switched to the pull contract or still pushes.

2. **check-apprentice is one cron doing two jobs; Pacred split it into two — and one half is dead.** Legacy runs intern-expiry + driver-assignment-expiry in a single pass. Pacred = `expire-probation` (dead, rebuilt table) + `expire-driver-assignments` (flagged C2). The split itself is acceptable; the dead targets are not.

3. **send-line-sales recipient channel.** Legacy broadcasts one message to a hard-coded LINE Notify group token. Pacred fans out per-admin `sendNotification` filtered by `notify_channels.daily_digest`. Different delivery model (per-admin opt-in vs single group) — acceptable modernization IF the data source is fixed, but it IS a flow-order divergence to record.

4. **Rate edit entrypoint.** Legacy edits general + VIP + SVIP from dedicated `rate.php`/`rate-vip.php` pages. Pacred faithful edits happen from `/admin/customers/[id]` (per-customer) via `rate-edits.ts`; the dedicated `/admin/rates/*` pages are the dead rebuilt path. The entrypoint moved from "rate admin page" to "customer detail page" for VIP/SVIP, and the general card has no faithful entrypoint at all.

---

## Modals / AJAX / cron / print inventory

### Crons (legacy autorun → Pacred Vercel cron)

| Legacy autorun | Schedule (legacy = manual/server cron) | Pacred cron | Pacred schedule | Status |
|---|---|---|---|---|
| `check-apprentice/index.php` (intern expiry + 17h driver expiry) | server cron | `expire-probation` + `expire-driver-assignments` | `0 2 * * *` + `0 * * * *` | 💀 both point at rebuilt tables |
| `update-active-customers/index.php` (userActive flag) | server cron | `refresh-active-customers` | `0 1 * * *` | 💀 reads/writes rebuilt |
| `send-line-sales/index.php` (00:05 sales digest) | `5 0 * * *` | `sales-daily-digest` | `5 17 * * *` (= 00:05 ICT) | 💀 reads `wallet_transactions` empty |
| `update-sheet-sang*.php` (Google Sheet → JSON) | server cron | `sheets-sync-ctt` + adapter | `0 * * * *` | 🟡 CTT foundation only; MK/MX/Sang adapters incomplete |
| (legacy MOMO/JMF = manual `?page=updateAPI`) | manual | `momo-sync` | `*/5 * * * *` | ✅ pivoted to tb_forwarder (Wave 30) — exceeds legacy |
| (no legacy equiv) | — | `auto-cancel-orders`, `sms-balance-check`, `send-scheduled-broadcasts`, `cargothai-sync` | various | Pacred-extra / out-of-lane |

### AJAX / inbound API endpoints

| Legacy endpoint | Purpose | Pacred |
|---|---|---|
| `api/update-forwarder/JMFCARGO/PUT/index.php` | JMF inbound tracking upsert → tb_forwarder | 🟡 replaced by pull cron |
| `api/update-forwarder/JMFCARGO/GET/fCost/index.php` | JMF cost lookup | ❌ not found |
| `api/linenotify/callback/index.php` | LINE Notify OAuth code→token → tb_admin | ❌ (LINE Notify EOL) |
| `api/linenotify/revoke/index.php` | revoke admin LINE token | ❌ |
| `api/send-mail/index.php` | PHPMailer SMTP + mPDF attach | partial (Pacred has notification/email libs; not 1:1) |
| `api/checkAccessPermission/index.php` | RBAC probe via dataJson | ✅ replaced by `requireAdmin([roles])` |
| `api-forwarder-cn.php?page=manualUpdate` (AJAX form) | manual CN tracking insert → tb_forwarder | 🟡 `/admin/api-forwarder-cn/manual` (write target unverified) |

### Print/PDF
None in this lane (settings/HR/org/notify have no print routes). `api/send-mail` builds a stub mPDF — not a customer-facing document. **No print gaps in adm-14.**

### Forms / dependent-dropdowns
- `post-job.php`: company(PCS/Freight) → adminType → department → section cascading `<select>` (JS `listDepartment`/`listSection`). Pacred `recruitment/new/new-posting-form.tsx` exists but targets rebuilt `job_postings`.
- `time-attendance-system.php`: holiday/leave/maid-holiday modals.
- `organization-*`: add/update modals with `eDuplicate` guard (all faithful CRUD pattern). Only email ported faithfully.

---

## Recommended fixes (ranked, with owner)

| Rank | Fix | Files | Owner | Effort |
|---|---|---|---|---|
| 1 | **P0-1: retarget `refresh-active-customers`** to `tb_header_order`/`tb_forwarder`/`tb_payment` → `tb_users.userActive` + delete orphan `tb_check_forwarder` | `app/api/cron/refresh-active-customers/route.ts` | ภูม | 30 min |
| 2 | **P0-4: retarget `sales-daily-digest`** to `tb_wallet_hs` 3-stream join (matches send-line-sales L exactly) | `app/api/cron/sales-daily-digest/route.ts` | ภูม | 1 h |
| 3 | **P0-2: build general rate-card editor on `tb_rate_g_kg`/`_cbm`** + repoint or delete `actions/admin/rates.ts` rebuilt writers; collapse `/admin/rates/{general,vip}` onto the tb_* path that `rate-edits.ts` already proves | `actions/admin/rates.ts`, `app/[locale]/(admin)/admin/rates/{general,vip}/*` | ภูม | 4-5 h |
| 4 | **P0-3: wire `tb_notify_wp` customer popup** (write from `/admin/broadcasts` or a new `/admin/notify`, read on customer login) OR repoint broadcast recipients to `tb_users` | `actions/admin/broadcasts.ts`, customer layout, `tb_notify_wp` | เดฟ | 3 h |
| 5 | **P1-6: retarget `expire-probation`** to `tb_admin.adminStatusA`/`endDate` (interns) | `app/api/cron/expire-probation/route.ts` | ภูม | 30 min |
| 6 | **P1-5: pivot HR attendance/recruitment** to `tas_leave`/`tas_holiday`/`tb_post_job` (or formally declare HR a Phase-C rebuild and stop calling it ported) | `actions/admin/attendance.ts`, `actions/admin/recruitment.ts` | ภูม | 6-8 h |
| 7 | **P1-8: master-config editors** for `numberPaymemt`/`freeShipping`/`hRateCostSale` + the 128-cell default-cost matrix | extend `tb-settings.ts` + `/admin/settings/legacy-rates` | ภูม | 4 h |
| 8 | **P1-7: collapse org-contact split-brain** — pick `tb_organization_*` (faithful) and migrate `org_contacts` consumers, or seed `org_contacts` from `tb_organization_*`; add tell/line/wechat/domainname editors | `actions/admin/{org-contacts,organization-email}.ts`, `/admin/settings/contacts` | ภูม | 3 h |
| 9 | **JMF/TTP/CN/Sheets verification** — confirm JMF push-vs-pull contract; build TTP client; finish MK/MX/Sang sheet adapters; verify api-forwarder-cn manual write hits tb_forwarder | `lib/integrations/*`, `/admin/api-forwarder-cn/manual` | ก๊อต | 6 h |
| 10 | **`tb_keyword_product` editor** (product-category keywords) — confirm if still needed or Phase-C | new `/admin/products/keywords` | ภูม | 2 h |

### Quick-win cleanup
- Delete (or rename `*-legacy-dead.ts`) `actions/admin/rates.ts` once general editor lands — it's the rebuilt-write twin of `rate-edits.ts`.
- The 3 dead crons (#1/#2/#4 above) are the highest leverage-per-minute fixes in the lane: ~2h total to make daily ops data correct again.

### Security note (out-of-scope but high-confidence)
Legacy files in this lane leak hard-coded secrets in the extract: `notify.php` (DB password `P%F7*bu98NUB`), `api/send-mail/index.php` (Gmail app-password `bblf ftlg vucv qysz`), `api/linenotify/callback` (LINE client secret), JMF PUT token. These are in the read-only legacy snapshot, not Pacred — but if any were copied into Pacred env/config during porting, rotate. (Flagged separately; not part of the gap count.)
