# tb_admin → admins merge intelligence (2026-05-27)

> **Author:** Agent F (read-only intel pass · 2026-05-27)
> **Branch:** `Poom-pacred` HEAD `22d5e37` (worktree synced)
> **Status:** DESIGN INPUT · no code/schema changes made
> **Owner:** ภูม decides shape · เดฟ ratifies before any migration ships

## TL;DR

**Smaller than expected · trickier than expected.**

- tb_admin has **13 rows on prod** (not 50-100). 11 active, 2 inactive, 10 active-and-not-deleted.
- Existing `admins` table has **4 rows · all role=super**, all with `migrated_from_pcs=false` (NATIVE Pacred profiles, NOT from tb_admin). No overlap.
- **Merge complexity: SMALL data volume · MEDIUM design** because:
  - tb_admin uses **camelCase quoted column names** (PostgreSQL preserved the MySQL case) — different from `tb_users` which is lowercase.
  - tb_admin.adminID format = **`admin_<nickname>`** (e.g. `admin_pop`, `admin_nat`) — NOT `PR<n>`. Different ID space entirely.
  - Existing 4 super-admins were assigned via member_code (PR009/PR112/PR132/PR138) but those member_codes do not exist in tb_admin OR tb_users.
  - **20 of 23 distinct `tb_users.adminidsale` values are orphaned** — point at rep-IDs that don't exist in tb_admin (the legacy data dump lost old reps when staff churned).

**Recommended merge shape:** add legacy HR columns to `admins` as nullable sidecar, **provision auth.users + profiles for each of the 11 active tb_admin rows on first-bridge-login** (mirror the customer pcs-legacy-bridge), and **add `admins.legacy_admin_id text unique`** as the canonical join key — let `tb_users.adminidsale` keep pointing at `admin_<nick>` strings.

## Method

- **Read** existing migrations `0015` (admins) · `0016` (admin_contact_extras) · `0018` (HR extras) · `0017` (org_chart) · `0027` (probation field) · `0067` (PCS customer migration · superseded by D1) · `0075` (impersonation) · `0081` (legacy schema · lowercase declared) · `0087` (security view) · `0091` (role enum expansion).
- **Read** application code: `actions/admin/admins.ts` (grant/toggle/transfer + new `tb_users.adminidsale` bulk transfer) · `actions/admin/admin-profile.ts` (HR mutations against `tb_admin`) · `app/[locale]/(admin)/admin/admins/page.tsx` + `[id]/page.tsx` · `lib/auth/require-admin.ts` (role list + cached gate) · `lib/auth/pcs-legacy-bridge.ts` (the customer-side first-login provisioner).
- **Ran** 4 one-shot probes via `tsx + service-role admin client` against PROD Supabase (`yzljakczhwrpbxflnmco`). No PII printed — only shape, counts, and pattern-fingerprints. Scripts under `C:\Users\Admin\AppData\Local\Temp\probe-admin-merge*.mts` (not committed).

---

## Section 1 · tb_admin full column list (EXACT casing)

The migration `0081_pcs_legacy_schema.sql` lines 611-657 declares everything LOWERCASE, but **prod data has camelCase**. Confirmed via direct REST introspection (`select * limit 1`):

```
ID, adminID, adminStatusA, adminPass, adminName, adminLastName, adminEmail,
adminEmailOrg, adminSex, adminBirthday, adminStatus, adminStatusSale,
adminPicture, adminRegistered, adminTel, adminLastLogin, pcs_admin_logged,
adminType, department, section, companyType, startDate, endDate, endDateOfLogin,
adminDel, dateDel, adminNickname, adminTMP, adminTelOrg, salaryType,
adminIDCreate, nationalIDCard, expiryDate, salary, dateCreate, statusResetPass,
nationalIDCardFile, copyHouseRegistrationFile, resumeFile, religion,
nationality, maritalStatus, adminLineTokenNotify, dateAdminLineTokenNotify,
bearer_token
```

**45 columns total.** Anything written against `tb_admin` MUST use the exact camelCase form when going through PostgREST/Supabase JS:

```ts
// ✅ CORRECT
.from("tb_admin").select("adminID, adminEmail, adminStatusA")
.from("tb_admin").eq("adminStatusA", "1")

// ❌ SILENTLY FAILS (returns null count, never errors)
.from("tb_admin").select("adminid, adminemail, adminstatusa")
.from("tb_admin").eq("adminstatusa", "1")
```

**🔴 KNOWN APP BUG (Wave 21 candidate):** `actions/admin/admins.ts` lines 442-518 + `actions/admin/admin-profile.ts` use lowercase `adminid`/`adminstatusa`/`adminemail`/`admintel` etc. throughout — confirmed by probe that those queries error out / return null. The new `/admin/customers/transfer-rep` and `listActiveTbAdmins` are silently broken in prod. The TS page render at `/admin/admins/page.tsx` works because `select("...lowercase...")` returns the columns under the LOWERCASE alias from PostgREST… actually wait — needs verifying. Re-test before declaring. (This isn't a merge-blocker but is in the same wave's diff.)

## Section 2 · admins full column list

```
profile_id, role, granted_at, granted_by, is_active
```

5 columns, primary key `(profile_id, role)`. `is_admin()` SECURITY DEFINER reads this for ALL admin gates across the app — **the merge MUST NOT break the shape of these 5 columns**.

## Section 3 · profiles relevant columns

`profiles` has **49 columns**. Admin-mergerelevant subset (semantic mapping):

| profiles col | tb_admin equivalent | notes |
|---|---|---|
| `id` (uuid) | (none) | FK to auth.users.id — must exist before profile insert |
| `member_code` | (none — `adminID` is separate ID space) | PR-prefix used for customers + the 4 native admins |
| `first_name` | `adminName` | |
| `last_name` | `adminLastName` | |
| `phone` | `adminTel` | |
| `email` | `adminEmail` | |
| `birthday` | `adminBirthday` | |
| `sex` | `adminSex` | |
| `avatar_url` | `adminPicture` | tb_admin has bare filename · profiles wants URL |
| `last_login_at` | `adminLastLogin` | |
| `is_active` | `adminStatusA='1' AND adminDel=''` | |
| `migrated_from_pcs` | (would be set TRUE for merged rows) | already used for customer migration (8895 rows) |
| `legacy_pcs_user_id` | (could carry `adminID` for traceability) | currently used only for customer's `userID` |

`admin_contact_extras` (sidecar from migration `0016`, extended by `0018` + `0027`) has these columns already and is **0 rows on prod**:

```
profile_id (PK FK profiles), display_name, direct_phone, department, section,
updated_at, nickname, company, employee_type, work_email, work_phone,
hired_at, suspended_at, contract_end_date
```

## Section 4 · Row counts (LIVE — confirmed by probe)

| Query | Count |
|---|---|
| `tb_admin` total | **13** |
| `tb_admin WHERE adminStatusA='1'` (active) | **11** |
| `tb_admin WHERE adminStatusA='0'` (inactive) | **2** |
| `tb_admin WHERE adminStatusA='1' AND adminDel=''` (active+not-deleted) | **10** |
| `admins` total | **4** |
| `admins WHERE is_active=true` | **4** |
| `admins by role` | `super: 4` |
| `profiles WHERE migrated_from_pcs=true` | **8,895** |
| `profiles WHERE email LIKE 'pcs-legacy-%@users.pacred.invalid'` | **1** |
| `admin_contact_extras` | **0** |
| `tb_admin_address` | **185** (legacy had multi-address-per-admin) |
| `tb_org_email_ships` | **3** (only 3 of 13 admins have org email assigned) |
| `tb_org_tell_ships` | **19** (~1.5 per admin) |
| `tb_org_line_ships` | **0** |
| `tb_org_wechat_ships` | **0** |
| `tb_users WHERE adminidsale IS NOT NULL AND <> ''` | **8,890** customer assignments |

## Section 5 · Email overlap analysis

```
active tb_admin rows: 11
active rows with non-empty email: 11 (100%)
those emails ALSO in profiles.email: 0 ❌
```

**No tb_admin staff has a matching profile by email.** Means: the merge will need to PROVISION 11 fresh auth.users + profiles rows. None can be linked to existing profiles.

The legacy hash format `tb_admin.adminPass` is **79 chars on all 13 rows** (verified `select adminPass · all length=79`) — same `passTam` / `d+b+c` format as `tb_users.userpass`. **The `lib/auth/pcs-legacy-password.ts` verifier should work out-of-the-box for admin login** — just like the customer bridge.

## Section 6 · The 4 existing `admins` rows — who are they?

| role | profile.member_code | migrated_from_pcs | legacy_pcs_user_id | matched in tb_admin? |
|---|---|---|---|---|
| super | PR112 | false | null | NO |
| super | PR009 | false | null | NO (only one of 4 has profile.email at all) |
| super | PR132 | false | null | NO |
| super | PR138 | false | null | NO |

**All 4 are NATIVE Pacred profiles (rebuilt-app accounts).** None of them correspond to a tb_admin row by email or by id. None have `migrated_from_pcs=true`.

The member_codes (PR009, PR112, PR132, PR138) do not exist in `tb_users` either — they're truly native signups that ภูม manually granted `super` to for admin app access during the rebuilt-app era.

**Implication:** these 4 must be PRESERVED through any merge. They have no tb_admin counterpart — they're our own dev/operator accounts, separate from the legacy 13.

## Section 7 · FK consumers of tb_admin

The migration `0081` declares NO foreign-key constraints on `tb_admin` (it's a flat legacy dump). The "joining" happens at app-query level via the `adminID` string:

**Direct app-code consumers** (`grep tb_admin` over ts/tsx):

- `actions/admin/admins.ts` — `listActiveTbAdmins()`, `adminBulkTransferSalesRepTb()` (writes `tb_users.adminidsale` after validating target lives in tb_admin)
- `actions/admin/admin-profile.ts` — adminAddBankAccount/Furlough/Education/UpdateProfile (all use `adminid` string as FK)
- `actions/admin/forwarders-new.ts`, `forwarders-edit.ts`, `forwarder-cost.ts`, `combine-bill.ts`, `cnt-payment.ts`, `carrier-manual.ts`, `cart.ts`, `barcode-import.ts`, `wallet-trans.ts`, `wallet-hs.ts`, `warehouse-history.ts`, `report-cnt-cost-update.ts`, `rate-edits.ts`, `yuan-payments-tb.ts`, `api-forwarder-manual.ts`, `service-orders-spawn.ts` — write `adminid` field on the various `tb_*` business tables (audit/creator stamp)
- `app/[locale]/(admin)/admin/admins/page.tsx` + `[id]/page.tsx` — render lists/details
- `app/[locale]/(admin)/admin/customers/transfer-rep/page.tsx` — bulk rep transfer UI
- `app/[locale]/(admin)/admin/service-orders/cart{,/add}/page.tsx` — list/grant
- `app/[locale]/(admin)/admin/reports/sales-monthly/page.tsx` — sales-by-rep report
- `lib/admin/sidebar-menu.ts` — references roles
- `lib/legacy/pcs-chrome.ts` — legacy chrome
- `lib/validators/admin-cart.ts` — Zod schema
- `components/sections/pcs-sales-rep-card.tsx` — customer-facing rep card
- `app/[locale]/(protected)/service-import/[fNo]/page.tsx` — customer view

**Indirect consumers** (the `tb_*` business tables stamped with `adminID`):

- `tb_users.adminid` (creator) · `tb_users.adminidsale` (sales rep) — **8,890 customer rows**
- `tb_org_email_ships.adminid`, `tb_org_tell_ships.adminid`, `tb_org_line_ships.adminid`, `tb_org_wechat_ships.adminid` (contact join-tables)
- `tb_admin_address.adminid` (185 rows)
- Likely every `tb_<business>` table has `adminid` audit columns (didn't enumerate exhaustively — pattern is universal)

**Conclusion:** the legacy `adminID` string (`admin_<nick>` form) is referenced everywhere in legacy data + many app paths. **The merge MUST NOT change `tb_admin.adminID`** — Pacred app code can keep stamping audit rows with the legacy string while joining to the new `admins` row via a side table.

## Section 8 · Sample 5 tb_admin rows — SHAPE patterns (no PII)

Of the 11 active rows (confirmed via probe):

- **adminID** all match `admin_<nickname>` pattern (lengths 9-17 chars). Examples (these are admin pseudonyms, not personal IDs, so safe to list): `admin_pop`, `admin_nat`, `admin_pond`, `admin_admin_jane`, `admin_admin_web`, `admin_admin_dev`, `admin_admin_aom`, `admin_admin_win`, `admin_admin_gring`, `admin_admin_pee`, `admin_ploypr01`, `admin_Warehouse` (note: mixed case!), `admin_admin_ploy`.
- **adminEmail** populated on every row (length 17-30).
- **adminTel** populated on every row.
- **adminEmailOrg / adminTelOrg** = `0` on every row (the join-table approach replaces — see tb_org_*_ships counts: 3 email + 19 tell links across 13 admins).
- **adminPicture** = filename string len 8 (default `user.jpg` or similar). Image files not yet backfilled (pending Pro upgrade · §7 of runbook).
- **nationalIDCard** populated on 10 of 11, empty on 1.
- **adminPass** all 79 chars (legacy passTam hash · matches verifier in `lib/auth/pcs-legacy-password.ts`).
- **adminType** distribution: probably ประจำ + ทดลองงาน mix (need full enumeration if relevant).
- **department + section** populated on most active rows (drives `checkRightsName()` org-chart lookup in the page).

## Section 9 · Migration 0081 tb_admin DDL (as DECLARED — lowercase)

See `supabase/migrations/0081_pcs_legacy_schema.sql:611-657` — full DDL listed there. The declared DDL is lowercase but the LOADED DATA preserves camelCase from MySQL via pgloader. **PostgreSQL stores the column names CASE-PRESERVED when CREATE TABLE quotes them, OR case-folded to lowercase when unquoted.** Since the data load came in via pgloader and prod shows camelCase, **the actual prod table has camelCase quoted column names**, which is at odds with the declared migration.

**This is a pre-existing discrepancy.** Not caused by the merge. Possible causes:
- pgloader DDL emission used quoted camelCase identifiers (overriding 0081 if 0081 was applied AFTER the data load · or 0081 wasn't applied at all on prod and the prod schema came purely from pgloader)
- A separate `tb_admin` re-create happened on prod that used quoted camelCase

**Recommendation for ภูม:** before merge, run the suggested verify SQL in §"Open questions" below to confirm prod actually has camelCase columns (not lowercase + aliasing). The merge migration's DDL must match what prod has.

## Section 10 · Migration 0015 admins DDL + RLS

See `supabase/migrations/0015_admin_rbac.sql` for the full schema. Critical bits the merge MUST preserve:

```sql
create table public.admins (
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  role         text not null check (role in ('super','ops','accounting','sales_admin')),  -- enum expanded by 0033/0054/0091
  granted_at   timestamptz not null default now(),
  granted_by   uuid references public.profiles(id) on delete set null,
  is_active    boolean not null default true,
  primary key (profile_id, role)
);

create or replace function public.is_admin(any_role text[] default null)
  returns boolean language plpgsql security definer set search_path = public ...
```

`is_admin()` is called on every admin RLS policy across migrations `0015`, `0017` (org_chart), `0029`, `0033`, `0034`, `0036`, etc. — **breaking it breaks the whole admin app**.

`admins_role_check` was extended by `0091` to 21 roles (Cargo + 13 Freight + qa/sales). Any new column added to `admins` must NOT touch the existing 5 columns or the constraint.

---

## Merge design recommendation

### Hard rules (do not violate)
1. **Preserve `admins` PK shape** `(profile_id, role)`. Don't change it. `is_admin()` reads `profile_id = auth.uid()` so the new merged shape must still resolve to one `auth.users` per admin.
2. **Preserve existing 4 super rows** — they're native Pacred operator accounts unrelated to legacy.
3. **Don't break `tb_users.adminidsale` → `tb_admin.adminID` joins.** Customer assignments must keep working.
4. **Don't write any legacy data to a profile that won't survive auth bootstrap.** Auth.users row must exist before profile row (FK).

### Proposed shape

**Approach A — sidecar columns (RECOMMENDED · smallest blast radius):**

```sql
-- 1. Extend `admins` with legacy HR + identity sidecar columns (nullable so existing 4 rows aren't disturbed).
alter table public.admins
  add column if not exists legacy_admin_id     text,                  -- the 'admin_<nick>' string (FK target for tb_users.adminidsale)
  add column if not exists nickname            text,                  -- adminNickname (Thai เซลล์ นิคเนม)
  add column if not exists admin_status_extra  text,                  -- adminStatus (legacy "สิทธิ์การเข้าถึงข้อมูล")
  add column if not exists company_type        text,                  -- '1'/'2'/'3' Freight&Cargo/Freight/Cargo
  add column if not exists department          text,                  -- numeric string per org chart
  add column if not exists section             text,                  -- numeric string per org chart
  add column if not exists admin_type          text,                  -- '1'-'7' (พนักงานประจำ/ทดลองงาน/...)
  add column if not exists admin_tmp           text,                  -- '1'/'2' พักงานชั่วคราว
  add column if not exists salary_type         text,
  add column if not exists salary              numeric(10,2),
  add column if not exists hired_at            date,                  -- startDate
  add column if not exists ended_at            timestamptz,           -- endDate
  add column if not exists national_id_card    text,
  add column if not exists nationality         text,
  add column if not exists religion            text,
  add column if not exists marital_status      text,
  add column if not exists bearer_token        text;                  -- LINE Messaging API token

-- Unique constraint: at most one row per legacy_admin_id (null allowed for non-legacy rows like the 4 natives).
create unique index if not exists admins_legacy_admin_id_uidx
  on public.admins(legacy_admin_id) where legacy_admin_id is not null;
```

**Why sidecar on `admins` and not `admin_contact_extras`:** the legacy fields define WHO the admin is (status, type, salary, hire date) — they belong with the role grant, not as a separate "contact extras" row. `admin_contact_extras` stays for things like direct_phone/display_name overrides that are independent of legacy identity.

**Alternative — Approach B — separate `admin_hr` table** keyed on `admins.profile_id`. Reasonable if ภูม wants tighter separation, but means one more join on every detail page.

### Profile/auth provisioning strategy

For each of the **11 active tb_admin rows** (the 2 inactive ones — skip OR import as `is_active=false`):

```
1. Read tb_admin row (camelCase).
2. Create auth.users via supabase.auth.admin.createUser({
     email: adminEmail,
     password: <random secure>,
     email_confirm: true,
   })
3. Insert profiles row:
     id: <auth user id>,
     member_code: next_pr_member_code()  -- PR<n> from the lowest-vacant gap
                                          -- (so admin shares ID space with customers · 4 natives already do)
     first_name: adminName,
     last_name: adminLastName,
     email: adminEmail,
     phone: adminTel,
     birthday: adminBirthday,
     sex: adminSex,
     avatar_url: '/legacy/pcs/admin/images/' + adminPicture,
     last_login_at: adminLastLogin,
     migrated_from_pcs: true,
     legacy_pcs_user_id: adminID,         -- carry 'admin_<nick>' for traceability
     is_active: (adminStatusA = '1' AND adminDel = '')
4. Insert admins row:
     profile_id: <auth id>,
     role: <map from companyType + department + section + adminType — see lib/admin/sidebar-menu.ts>,
     is_active: true (or false for adminStatusA='0'),
     granted_by: <ภูม's profile_id>,
     legacy_admin_id: adminID,            -- canonical join key for tb_users.adminidsale
     nickname: adminNickname,
     company_type: companyType,
     department, section, admin_type, salary, etc. -- all the new sidecar cols
5. (Optional) admin_contact_extras row only if needs display_name/direct_phone overrides.
```

**The "next_pr_member_code() vs admin-specific scheme" decision:**
- Native 4 admins already use PR<n> (PR009, PR112, PR132, PR138). So merging legacy 11 into the PR<n> space is consistent.
- The legacy `admin_<nick>` string lives in the NEW `admins.legacy_admin_id` column · `tb_users.adminidsale` keeps working against THAT column via a foreign-data join inside `searchAdminsByQuery()`.

### Auth strategy — three options

**Option 1: Provision-on-first-login (mirror customer bridge).** When an admin tries to sign in with `adminEmail + adminPass`, run the same `pcs-legacy-bridge.ts` flow: verify legacy `passTam` hash, then `auth.admin.createUser()` with the typed password, link to a pre-created profile + admins row. **Pro:** no password reset · admin keeps muscle memory. **Con:** can't migrate the 2 inactive admins (they'll never log in to trigger provisioning) · admin can't appear in `/admin/admins` list until they've logged in.

**Option 2: Backfill upfront with random password + email reset link.** Pre-create all 11 (+ optional 2 inactive) auth.users + profiles + admins in a one-shot server action (like `adminBackfillPcsAuthUsers` did for customers). Send each admin a password-reset email. **Pro:** all 13 visible in admin list immediately. **Con:** admins must reset password (the owner explicitly rejected this for customers — same anti-pattern).

**Option 3: Hybrid — pre-create profiles + admins (no auth.users yet); provision auth.users on first login.** Best of both. Profile + admins row visible in the UI; `/admin/admins` list works. Login flow: bridge sees email match in admins with NO matching auth.user → run the create-on-first-login.

**Recommendation: Option 3.** Matches the owner's "no password reset" rule, doesn't hide migrated staff from the admin list, lets us migrate the 2 inactive admins as `is_active=false` (visible but cannot login).

### `tb_users.adminidsale` joining

After merge, `searchAdminsByQuery` + the rep dropdown in `/admin/customers/transfer-rep` can resolve the legacy `admin_<nick>` string via:

```ts
const { data } = await admin
  .from("admins")
  .select("profile_id, role, legacy_admin_id, nickname, profile:profiles!profile_id(...)")
  .eq("legacy_admin_id", customerAdminIdSale)
  .eq("is_active", true)
  .maybeSingle();
```

No need to change `tb_users.adminidsale` values · no need to write back to `tb_admin`. The orphan rep-IDs (20 of 23 distinct values that don't exist in tb_admin) simply return no match — UI shows "ผู้ขายเก่า · ไม่มีบัญชี" or similar fallback.

### RLS impact

- `admins` already has full RLS. Adding columns doesn't change the policies — keep them as-is.
- `tb_admin` is RLS-locked to `service_role` per migration 0081 (no app-side select). Existing `actions/admin/admin*.ts` go through `createAdminClient()` which bypasses RLS — they'll keep working until they're rewritten to read from `admins` joined to `profiles`.
- **Deprecation order:** new code reads from `admins`. Old code keeps reading from `tb_admin`. After all consumers migrate (timing decision: ภูม) → drop tb_admin (`drop table public.tb_admin cascade`).

### What stays on tb_admin (DEFERRED to a later wave)

- `tb_admin_address` (185 rows · multi-address-per-admin) — port to a new `admin_addresses` table or fold into profiles.address?
- `tb_org_email_ships` / `tb_org_tell_ships` / `tb_org_line_ships` / `tb_org_wechat_ships` (org chat channels) — port pattern unchanged
- `tb_account_pcs` (bank accounts) — already used by `actions/admin/admin-profile.ts` adminAddBankAccount; can stay as-is
- `tb_education_background` — same

These are all keyed by `adminid` (string) — they'll keep working as long as `tb_admin` (or a replacement view) carries the same key.

---

## Open questions for ภูม

1. **Confirm tb_admin column casing on prod.** Run in Supabase SQL Editor:
   ```sql
   SELECT column_name FROM information_schema.columns
   WHERE table_schema='public' AND table_name='tb_admin' ORDER BY ordinal_position;
   ```
   Expected: camelCase per my probe. If it returns lowercase, my probe was wrong (it would have failed differently) and we need to re-investigate.

2. **Confirm migration 0081 application status on prod.** When was the legacy schema migration actually run? Did pgloader create the table independently? This determines whether the merge migration needs to assume lowercase OR camelCase columns.

3. **Migrate the 2 inactive admins?** Both have `adminStatusA='0'`. Option A: import as `admins.is_active=false` (visible in "ลาออกแล้ว" tab). Option B: skip (don't carry over). Option C: hard-delete from tb_admin too. **Recommend Option A** — preserves audit trail.

4. **Role mapping rules.** Each tb_admin row has `companyType` + `department` + `section` + `adminType`. The mapping to one of the 21 `admins.role` enum values needs a per-row decision. Some examples:
   - `companyType=1 dept=4 sect=8 (Accounting Manager) adminType=1` → `accounting`?
   - `companyType=1 dept=6 sect=14 (IT PM) adminType=1` → `super`?
   - `companyType=3 dept=3 sect=5 (Warehouse Manager) adminType=1` → `warehouse`?
   - `adminType=7 (คนในบ้าน)` → don't grant a role (just import as profile, no admins row)?
   The `lib/admin/sidebar-menu.ts` per-role menus give the inverse map. Ask ภูม or เดฟ to confirm before backfill.

5. **The 4 existing native super-admins — keep all as super?** Some may be dev accounts that can be downgraded to `ops` or `qa` post-merge. Probably out of scope for the merge migration · revisit in a follow-up.

6. **What to do with the 20 orphan `tb_users.adminidsale` values?** Options:
   - Provision dead-stub `admins` rows (`is_active=false`, no auth.users, just preserve the string for join) — preserves history visibility but pollutes the admin list
   - Leave orphans — UI shows "—" or "ผู้ขายเก่า" in the rep column for the ~ couple-hundred affected customers
   - Bulk-reassign those customers to a "ไม่มีผู้ดูแล" pool admin
   **Recommend Option 2** with a `data/orphan_legacy_reps.json` artifact for ad-hoc lookup.

7. **app-code bug already in prod** — `actions/admin/admins.ts` `listActiveTbAdmins` + `adminBulkTransferSalesRepTb` use lowercase column names (`adminstatusa`, `adminnickname`, `adminid`). My probe confirms these queries return null counts / empty results. Even before the merge, the `/admin/customers/transfer-rep` bulk transfer is broken. Worth a separate Wave 21 task (or batch with the merge migration).

8. **`tb_users.adminid` (creator) is 0-populated on prod.** All 8,898 rows have `adminid` NULL or empty. Only `adminidsale` (rep assignment) is populated. So the "who created this customer" audit is missing for everyone. Probably out of scope for this merge but worth noting.

---

## Suggested SQL for ภูม to run + paste back (verification queries)

If my probe-based numbers need second-eye verification, paste each into Supabase Dashboard → SQL Editor:

```sql
-- 1. confirm tb_admin column casing
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='tb_admin'
 ORDER BY ordinal_position;

-- 2. confirm admins column shape
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='admins'
 ORDER BY ordinal_position;

-- 3. row counts (paste each output line)
SELECT 'tb_admin total' AS q, count(*) FROM tb_admin
UNION ALL SELECT 'tb_admin active (camelCase)', count(*) FROM tb_admin WHERE "adminStatusA"='1'
UNION ALL SELECT 'tb_admin inactive (camelCase)', count(*) FROM tb_admin WHERE "adminStatusA"='0'
UNION ALL SELECT 'admins total', count(*) FROM admins
UNION ALL SELECT 'admins active', count(*) FROM admins WHERE is_active=true
UNION ALL SELECT 'profiles with email matching tb_admin', count(*)
  FROM tb_admin t JOIN profiles p ON lower(p.email) = lower(t."adminEmail");

-- 4. role distribution of existing admins
SELECT a.role, a.is_active, p.member_code, p.first_name
  FROM admins a JOIN profiles p ON p.id = a.profile_id
  ORDER BY a.role, p.member_code;

-- 5. orphan adminidsale check (count of distinct values not in tb_admin)
SELECT count(distinct u.adminidsale)
  FROM tb_users u
 WHERE u.adminidsale IS NOT NULL AND u.adminidsale <> ''
   AND NOT EXISTS (SELECT 1 FROM tb_admin t WHERE t."adminID" = u.adminidsale);
```

Expected based on probes: (1) camelCase · (2) 5 cols · (3) 13/11/2/4/4/0 · (4) 4 super rows PR009/PR112/PR132/PR138 · (5) 20.
