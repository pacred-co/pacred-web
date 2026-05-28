# tb_admin code-audit (2026-05-27)

Audit branch: `Poom-pacred` (HEAD `e5f2b4f`). Worktree:
`C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7`.

Read-only sweep of every Pacred file that reads or writes `tb_admin` (and the
linked `tb_admin_address`/`tb_org_*_ships` tables), or that stamps a FK
column whose value is a legacy `tb_admin.adminid` username string. Code
files only — docs, migrations, SQL bundles, scripts excluded from the tally
unless they affect runtime behaviour.

## TL;DR

- **24 runtime code files** directly query `tb_admin` (`from("tb_admin")`).
- **1 file** queries `tb_admin_address` (`actions/admin/admin-profile.ts`,
  also handles tb_admin) + the same file mutates the 4 `tb_org_*_ships`
  bridges.
- **1 page** (`/admin/admins/page.tsx`) joins `tb_org_email_ships` +
  `tb_org_tell_ships` for the directory grid + 1 page
  (`/admin/admins/[id]/page.tsx`) joins the full 4-channel ship tables.
- **17 runtime code files** stamp `tb_admin.adminid`-shaped FK values into
  *other* tables (`tb_users.adminidsale`, `tb_forwarder.adminidupdate`,
  `tb_cnt.adminidcreate`, `tb_bill.adminid`, `tb_paydeposit.adminidupdate`,
  `tb_rate_vip_*.adminidupdate`, etc.). These are write-only and would
  orphan if tb_admin is dropped.
- **0 files** under `lib/auth/` or `lib/supabase/` touch tb_admin — modern
  `is_admin()` / `requireAdmin()` runs entirely on the `admins` UUID table
  (ADR-0002). The two schemas are fully decoupled at the auth layer.
- **Top 3 surfaces blocked:**
  1. `/admin/admins` directory page (260 LOC of filter logic over 17 cols)
  2. `/admin/admins/[id]` detail page (12 join-table reads in one Promise.all)
  3. `/admin/customers/transfer-rep` bulk sales-rep transfer (writes
     `tb_users.adminidsale` = `tb_admin.adminid`)

The dominant pattern across the action layer (**16 of 24 files**) is a
shared `resolveLegacyAdminId(email)` helper — one tb_admin select keyed by
`adminemail`, returning the varchar username string the legacy `adminid*`
FK columns expect. This is mechanically rewritable to a single
`admins.adminid` (or equivalent) lookup, IF the new `admins` table carries
a legacy-username bridge column.

## Direct tb_admin readers (24 files)

### 🔴 HARD-BLOCK — the admins management UI itself

#### `app/[locale]/(admin)/admin/admins/page.tsx`
- **L261-265**: `from("tb_admin").select(...)` — 17 cols: `id, adminregistered, adminid, adminname, adminlastname, adminnickname, adminpicture, adminemail, admintel, admintype, admintmp, adminstatusa, admindel, companytype, department, section, enddate`
- **L267-296**: 4 switch blocks with `.eq("adminstatusa", ...)`, `.eq("companytype", ...)`, `.eq("section", ...)`, `.in("section", [...])`, `.eq("admintype", ...)`, `.in("admintype", [...])`, `.neq("admintype", "7")`, `.order("adminregistered")`
- **L303**: `from("tb_admin").select("id", { count: "exact", head: true }).neq("admintype", "")` (count query, runs twice with different filters)
- **L335-338**: `Promise.all` with `from("tb_org_email_ships").select("adminid, oeid")`, `from("tb_org_tell_ships").select("adminid, otid")`, `from("tb_organization_email").select("id, email")`, `from("tb_organization_tell").select("id, tell")`
- **Impact:** 🔴 HARD-BLOCK — this IS the admin directory. Needs full rewrite onto whatever the `admins` table becomes, plus a strategy for the 4 status/company/position/type filters (currently encoded as string codes "1"/"2"/.../"7" / "8"/"14" — the new RBAC needs an equivalent classification).

#### `app/[locale]/(admin)/admin/admins/[id]/page.tsx`
- **L377**: `from("tb_admin").select("*").eq("adminid", adminIDGet).maybeSingle()` — reads every column
- **L378**: `from("tb_admin_address").select("addressno, district, amphoe, province, zipcode, addressnote").eq("adminid", adminIDGet)`
- **L407-414**: `Promise.all` of 8 lookups all keyed by `.eq("adminid", adminIDGet)`:
  - `tb_org_email_ships` `.select("oeid")`
  - `tb_org_tell_ships` `.select("otid")`
  - `tb_org_line_ships` `.select("olid")`
  - `tb_org_wechat_ships` `.select("owcid")`
  - `tb_account_pcs` `.select("id, bankname, accountnumber, accountname")` `.order("id")`
  - `tb_education_background` (2 variants — list + latest)
  - `tb_set_comm_interpreter` `.select("percom")`
- **Impact:** 🔴 HARD-BLOCK — admin detail. Same migration consideration as above + the 8 satellite tables all FK on `adminid`. Migration window must preserve `adminid` value OR backfill all satellites.

### 🔴 HARD-BLOCK — admin profile mutations

#### `actions/admin/admin-profile.ts`
- **L88-94**: helper `resolveLegacyAdminId(email)` — `from("tb_admin").select("adminid").eq("adminemail", email)`
- **L114-117**: furlough `update({admintmp}).eq("adminid", d.admin_id)`
- **L341**: profile `update(personalUpdate).eq("adminid", d.admin_id)` — 12 personal columns (admintel, adminemail, adminname, adminlastname, adminnickname, adminsex, maritalstatus, religion, nationality, nationalidcard, adminbirthday, expirydate)
- **L355-361**: tb_admin_address `select("id").eq("adminid",...)` + conditional `update(addressUpdate).eq("adminid",...)`
- **L374-375**: 4 org-channel `linkChannel` calls — `delete().eq("adminid",...)` then `insert({adminid, oeid|otid|olid|owcid})` for `tb_org_{email,tel,line,wechat}_ships`
- **L414**: job-position `update(jobUpdate).eq("adminid", d.admin_id)` — 9 job cols (companytype, admintype, admintmp, salarytype, department, section, startdate, enddate, salary)
- **Impact:** 🔴 HARD-BLOCK — the full HR profile edit surface. Pure mutation logic; would need a parallel `admins.update(...)` writer.

### 🟠 STILL NEEDS DATA — the `resolveLegacyAdminId` pattern (16 action files)

Each of the 16 files below has the same ~10-line helper that resolves the
current Supabase user's `email` → `tb_admin.adminemail` → `adminid` string.
The returned string is then stamped into FK columns (`adminidupdate`,
`adminidcreate`, `adminid`) on the action's target table. **Without
tb_admin OR a bridge, every mutation would lose the staff-id audit trail.**

Pattern (verbatim across all 16):
```ts
.from("tb_admin")
.select("adminid")
.eq("adminemail", email)
.maybeSingle<{ adminid: string | null }>();
```

| File | Helper line | Target table the result is stamped onto |
|---|---|---|
| `actions/admin/cart.ts` | L91 | `tb_cart.userid` (when staff is row owner) |
| `actions/admin/cnt-payment.ts` | L134 | `tb_cnt.adminidcreate`, `tb_cnt.adminidupdate` |
| `actions/admin/combine-bill.ts` | L80 | `tb_bill.adminid` |
| `actions/admin/wallet-trans.ts` | L60 | `tb_paydeposit.adminidupdate`, `tb_paydeposit.adminid` |
| `actions/admin/wallet-hs.ts` | L65 | `tb_paydeposit.adminidupdate` |
| `actions/admin/yuan-payments-tb.ts` | L57 | `tb_pay.adminidupdate`, `tb_pay.adminid` |
| `actions/admin/warehouse-history.ts` | L71 | `tb_forwarder.adminidupdate` |
| `actions/admin/forwarder-cost.ts` | L62 | `tb_forwarder.adminidupdate` |
| `actions/admin/forwarders-edit.ts` | L56 | `tb_forwarder.adminidupdate` + cargothai mirror |
| `actions/admin/forwarders-new.ts` | L66 | `tb_forwarder.adminidupdate` (new forwarder) |
| `actions/admin/report-cnt-cost-update.ts` | L54 | `tb_forwarder.adminidupdate` |
| `actions/admin/carrier-manual.ts` | L63 | `tb_forwarder.adminidupdate` |
| `actions/admin/api-forwarder-manual.ts` | L61 | `tb_forwarder.adminidupdate` |
| `actions/admin/barcode-import.ts` | L100 | `tb_forwarder.adminidupdate` |
| `actions/admin/rate-edits.ts` | L65 | `tb_rate_vip_*.adminidupdate`, `tb_hs_rate_custom_*.adminidupdate` |
| `actions/admin/service-orders-spawn.ts` | L62 | `tb_forwarder.adminidupdate` (spawn flow) |

- **Impact:** 🟠 STILL NEEDS DATA. The helper itself is trivial to swap, but
  the *value* returned (the varchar username, e.g. `"POPP"`, `"admin_jeen"`)
  is FK-shaped into ~9 other legacy tables. If `admins` is the new SoT, it
  must keep an `adminid` column (or a `legacy_adminid` bridge) AND
  `adminemail` AND the rows must exist for every active staff member, or
  every mutation that audits "who did this?" will drop to `"system"`/email
  fallback.

### 🟢 READ-ONLY DISPLAY — sales-rep card + impersonation chrome

#### `lib/legacy/pcs-chrome.ts`
- **L125-129**: `from("tb_admin").select("adminnickname, adminpicture").eq("adminid", adminIdSale).maybeSingle()` — sales rep resolution from customer's `tb_users.adminidsale`
- **L137-142**: `from("tb_org_tell_ships").select("otid").eq("adminid", adminIdSale).order("id", desc).limit(1)`
- **L148-151**: `from("tb_organization_tell").select("tell").eq("id", shipRow.otid)`
- **Impact:** 🟢 READ-ONLY DISPLAY (left-menu sales-rep widget across every customer page). Trivial swap if `admins` carries `nickname + picture + adminid` columns.

#### `components/sections/pcs-sales-rep-card.tsx`
- **L33-37**: `from("tb_users").select("adminidsale").eq("userid", memberCode)`
- **L43-53**: `from("tb_admin").select("adminname, adminlastname, adminnickname, admintel, adminpicture").eq("adminid", userRow.adminidsale)`
- **Impact:** 🟢 READ-ONLY DISPLAY (customer-facing "เซลล์ดูแลคุณ" card). Trivial swap.

#### `app/[locale]/(protected)/service-import/[fNo]/page.tsx`
- **L495-497**: `from("tb_admin").select("adminid, adminname, admintel").in("adminid", adminIds)` — fan-out lookup of driver names from `tb_forwarder_driver.fdadminid`
- **Impact:** 🟢 READ-ONLY DISPLAY of driver contact info. Trivial swap.

### 🟡 SHADOW LOOKUP — admin pages that page through tb_admin via the same helper

#### `app/[locale]/(admin)/admin/service-orders/cart/page.tsx`
- **L271-275**: Inline `from("tb_admin").select("adminid").eq("adminemail", user.email)` — resolve "my legacy adminid" to filter the default cart view
- **Impact:** 🟡 SHADOW LOOKUP. Same shape as the `resolveLegacyAdminId` helper but written inline because the page is a Server Component.

#### `app/[locale]/(admin)/admin/service-orders/cart/add/page.tsx`
- **L52-58**: Same inline helper
- **Impact:** 🟡 SHADOW LOOKUP.

#### `app/[locale]/(admin)/admin/customers/transfer-rep/page.tsx`
- **L76-81**: `from("tb_admin").select("adminid, adminnickname, adminname, adminlastname, department, section").eq("adminstatusa", "1").order("adminnickname").limit(500)` — active admins dropdown
- **Impact:** 🟠 STILL NEEDS DATA — feeds the bulk transfer-rep form (which then writes the chosen `adminid` into `tb_users.adminidsale`). If tb_admin is gone the dropdown is empty + the write breaks.

#### `actions/admin/admins.ts`
- **L443-446**: `from("tb_admin").select("adminid, adminstatusa, adminnickname").eq("adminid", d.new_admin_userid).maybeSingle()` — target admin existence + active check
- **L516-520**: `listActiveTbAdmins()` — `from("tb_admin").select("adminid, adminnickname, adminname, adminlastname, adminpicture, department, section").eq("adminstatusa", "1").order("adminnickname").limit(500)`
- L469-472: writes `tb_users.update({adminidsale: target.adminid}).in("userid", validIds)` — the bulk action
- **Impact:** 🔴 HARD-BLOCK on the read path (writes `tb_users.adminidsale` from a tb_admin-validated value). After merge: `admins` must validate the target and the FK value stamped must still match what historical `tb_users.adminidsale` rows hold.

## adminid-as-FK references on other tables (FK orphan risk)

These are columns on OTHER tables that store a `tb_admin.adminid` username
string. Deprecating tb_admin without a backfill would leave orphan strings
that no longer JOIN to any row.

### `tb_users.adminidsale` (sales rep assignment)
**Readers:**
- `app/[locale]/(admin)/admin/customers/page.tsx` L156, L190, L411 (table column display)
- `app/[locale]/(admin)/admin/customers/recently-active/page.tsx` L35, L64, L174
- `app/[locale]/(admin)/admin/customers/[id]/legacy-view.tsx` L40, L120, L269 (customer detail "ดูแลโดย <id>")
- `app/[locale]/(admin)/admin/customers/transfer-rep/page.tsx` L49, L55 (filter)
- `app/[locale]/(admin)/admin/customers/transfer-rep/transfer-form.tsx` L24, L106, L247-248 (grouping)
- `app/[locale]/(admin)/admin/forwarders/page.tsx` L233, L298, L430, L521-522 (badges from joined tb_users)
- `app/[locale]/(admin)/admin/forwarders/[fNo]/page.tsx` L286
- `app/[locale]/(admin)/admin/qa/new-client-no-contact/page.tsx`
- `app/[locale]/(admin)/admin/reports/sales-by-rep/page.tsx`
- `app/[locale]/(admin)/admin/reports/user-sales-history/page.tsx` + `[customer_id]/page.tsx`
- `app/[locale]/(protected)/sales/page.tsx` L126 (the customer-side "my sales rep" page)
- `lib/legacy/pcs-chrome.ts` L212-220 (left-menu)
- `components/sections/pcs-sales-rep-card.tsx` L35
- `scripts/data/02-provision-profiles-for-tb-users.ts` L181, L250, L408 (one-off migration script — also writes to `profiles.sales_admin_id`)
- `supabase/migrations/0094_view_sales_by_rep.sql` (view depends on this column)

**Writers:**
- `actions/admin/admins.ts` L471 (bulk transfer)

**Impact:** 🟠 STILL NEEDS DATA — the sales-rep linkage threads through ~15 surfaces (customer pages, admin pages, reports, view, customer-portal). Migration MUST preserve `adminid` as a stable string in the new schema OR run a bulk UPDATE on `tb_users.adminidsale` to switch FK shape.

### `tb_forwarder.adminidupdate` + `adminidcreator`
- **Writers:** ~10 action files in `actions/admin/forwarder*.ts` + `barcode-import.ts` + `report-cnt-cost-update.ts` + `carrier-manual.ts` + `api-forwarder-manual.ts` + `service-orders-spawn.ts` (see resolveLegacyAdminId table above)
- **Readers:** `app/[locale]/(admin)/admin/forwarders/page.tsx` L328, L356, L360 + `app/[locale]/(admin)/admin/forwarders/[fNo]/page.tsx` L322, L360 + `app/[locale]/(admin)/admin/forwarders/warehouse-history/page.tsx` L365 + `app/[locale]/(admin)/admin/reports/forwarder/page.tsx` L135
- **Impact:** 🟠 STILL NEEDS DATA — pure audit trail; the resolution chain (FK string → admin display name) currently never happens (the columns are shown raw or as filter predicates). If tb_admin is dropped, the displayed string still renders; only the implicit JOIN-shape is lost.

### `tb_cnt.adminidcreate` + `adminidupdate`
- **Writers:** `actions/admin/cnt-payment.ts` L245-251, `actions/admin/cnt-hs.ts` L58, L130
- **Readers:** `app/[locale]/(admin)/admin/cnt-hs/page.tsx` L141, L220, L538 + `app/[locale]/(admin)/admin/cnt-hs/[id]/page.tsx` L64, L141, L255-259 (displays raw `adminidcreate` string in detail KV row)
- **Impact:** 🟡 SHADOW LOOKUP — the detail page shows the raw adminid string verbatim. Migration could either keep the legacy string OR backfill to display "ชื่อจริง" using a new admins lookup.

### `tb_bill.adminid`
- **Writers:** `actions/admin/combine-bill.ts` (the resolved username)
- **Readers:** (none directly — bill list pages don't currently display creator)
- **Impact:** 🟡 SHADOW LOOKUP — write-only audit trail.

### `tb_paydeposit.adminidupdate` + `adminid`
- **Writers:** `actions/admin/wallet-trans.ts` L120, L189, L291, `actions/admin/wallet-hs.ts` L190
- **Readers:** `app/[locale]/(admin)/admin/wallet/transactions-view.tsx` (displays via tb_users join, not adminid)
- **Impact:** 🟡 SHADOW LOOKUP — audit trail only.

### `tb_pay.adminidupdate` + `adminid`
- **Writers:** `actions/admin/yuan-payments-tb.ts` L154
- **Readers:** `app/[locale]/(admin)/admin/yuan-payments/page.tsx`, `[id]/page.tsx` (selects column for display)
- **Impact:** 🟡 SHADOW LOOKUP.

### `tb_rate_vip_*.adminidupdate` + `tb_hs_rate_custom_*.adminidupdate`
- **Writers:** `actions/admin/rate-edits.ts` L145, L173, L362, L381
- **Readers:** `app/[locale]/(admin)/admin/rates/custom-user/page.tsx`, `custom-hs/page.tsx`
- **Impact:** 🟡 SHADOW LOOKUP — audit trail for rate-table edits.

### `tb_organization_email.adminidcreate` + `adminidupdate`
- **Writers:** `actions/admin/organization-email.ts` L102, L180
- **Readers:** `app/[locale]/(admin)/admin/organization-email/page.tsx`, `client.tsx`
- **Impact:** 🟡 SHADOW LOOKUP — audit trail for org-channel CRUD.

### `tb_cargothai.adminidupdated` (note: spelled `-ated`)
- **Writers:** `actions/admin/cargothai.ts` L263, L296, `actions/admin/forwarders-edit.ts` L192, `app/api/cron/cargothai-sync/route.ts` L162, L193
- **Hardcoded value:** `"admin_tam"` — the cron/sync writes a literal admin id, NOT a resolved value. **Worth flagging separately** — this is a hard-coded literal string in 5 places, would survive a tb_admin drop only if `"admin_tam"` exists in the new admins table.
- **Impact:** 🟡 SHADOW LOOKUP + hardcoded value spread across 5 files.

### `tb_forwarder_driver.fdadminid`
- **Readers:** `app/[locale]/(protected)/service-import/[fNo]/page.tsx` L485-497 — read fdadminid then JOIN tb_admin to get the driver's name + tel
- **Writers:** `actions/admin/forwarder-drivers.ts`, `actions/admin/driver-work.ts` (these use `admins` UUID not tb_admin — already on modern schema)
- **Impact:** 🟡 SHADOW LOOKUP — one read-only join. Easy to repoint at `admins`.

### `app/[locale]/(admin)/admin/reports/{shop,forwarder}/page.tsx`
- L135 / L142: select `adminidupdate, userid` as report columns
- **Impact:** 🟡 SHADOW LOOKUP — pure display.

## Total impact tally

| Severity | File count | Notes |
|---|---|---|
| 🔴 HARD-BLOCK | 3 | `/admin/admins` directory + `/admin/admins/[id]` detail + `actions/admin/admin-profile.ts` (the HR mutation surface) |
| 🟠 STILL NEEDS DATA | 18 | 16 `resolveLegacyAdminId` consumers + `customers/transfer-rep/page.tsx` + `actions/admin/admins.ts` (bulk transfer) |
| 🟡 SHADOW LOOKUP | 11 | Audit-trail FK writers/readers — work without tb_admin if the FK strings are still readable as raw text |
| 🟢 READ-ONLY DISPLAY | 3 | `lib/legacy/pcs-chrome.ts` left-menu rep · `pcs-sales-rep-card.tsx` · `service-import/[fNo]/page.tsx` driver-info join |
| Files referencing `adminid*` FK columns on OTHER tables | ~25 distinct files | See per-table sections above |
| Files in `lib/auth/**` touching tb_admin | **0** | Modern RBAC entirely on `admins` UUID table — no auth-layer entanglement |

## Recommended migration sequence

The audit suggests a **bridge-then-cutover** strategy rather than a flag-day
rewrite. Order of operations:

1. **Bridge first — add legacy fields to `admins`.** Whatever the new
   `admins` table looks like, give it `adminid VARCHAR(30)` (the legacy
   username) + `adminemail VARCHAR(255)` + `adminnickname` + `adminpicture`
   columns and backfill from current tb_admin. This unlocks all 16
   `resolveLegacyAdminId` files to swap targets with a single
   search-and-replace.

2. **Phase 1 — repoint the `resolveLegacyAdminId` helper** (low-risk, 16
   files, all use the identical 10-line block). Add a shared helper at
   `lib/admin/resolve-legacy-id.ts` and rewrite all 16 callers to use it.
   This is fully behaviour-preserving as long as step 1 is done.

3. **Phase 2 — repoint the 3 🟢 read-only display files.** Trivial swap
   of `.from("tb_admin")` → `.from("admins")` with matching column names.

4. **Phase 3 — rewrite the bulk transfer-rep page** (`actions/admin/admins.ts`
   `listActiveTbAdmins()` + `adminBulkTransferSalesRepTb()` +
   `app/.../customers/transfer-rep/page.tsx`). Decide whether the dropdown
   pulls from `admins.adminid` (FK-shape preserved) or `admins.id` (UUID
   migration of `tb_users.adminidsale` required — much bigger change).

5. **Phase 4 — rewrite the admin directory + detail pages**
   (`/admin/admins` + `/admin/admins/[id]`). These are 🔴 HARD-BLOCK because
   the 17-col filter UI + 12 satellite-table joins all assume the legacy
   schema. The 4 `tb_org_*_ships` tables, `tb_account_pcs`,
   `tb_education_background`, `tb_set_comm_interpreter` need to either
   migrate to FK on `admins.id` or keep FK on `adminid` string (matching
   the bridge field from step 1).

6. **Phase 5 — rewrite `actions/admin/admin-profile.ts`** (the HR profile
   editor). This writes to tb_admin + tb_admin_address + 4 ship tables.
   Largest single file rewrite.

7. **Phase 6 — backfill FK strings on the 8+ audit columns**
   (`tb_forwarder.adminidupdate`, `tb_cnt.adminidcreate`, etc.). Optional —
   the columns can keep storing legacy strings as long as the bridge field
   on `admins` remains.

8. **Phase 7 — drop tb_admin + tb_admin_address.** Only after Phases 1-6
   ship + a soak period confirms no `tb_admin` reads remain (grep CI gate).

**Notable hardcoded value to address:** `"admin_tam"` appears as a literal
string in `actions/admin/cargothai.ts` (2x), `actions/admin/forwarders-edit.ts`
(1x), `app/api/cron/cargothai-sync/route.ts` (2x). This is a cron-job
service-account placeholder, not a resolved value. Either keep
`adminid="admin_tam"` as a sentinel row in `admins` OR replace these 5 sites
with a new "system actor" constant when rewriting.

**Risk hotspots:**
- The `legacy_history_status` integer codes (e.g. `45`, `46`) in
  `organization-email.ts` are tied to a legacy audit-history scheme. Make
  sure the new `admins` table doesn't break that history view.
- `tb_forwarder_driver.fdadminid` is the one place where driver UUIDs from
  `admins` and legacy `tb_admin.adminid` strings are conflated — read-side
  joins to tb_admin here would silently break if drivers were migrated to
  `admins.id` (UUID) without keeping the legacy adminid string.
- `adminidsale` is on the customer-facing `(protected)/sales/page.tsx` —
  customer chrome breaks visibly if the rep card can't resolve.
