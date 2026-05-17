# Runbook — U2-1 PCS → Pacred customer migration

> **For ภูม** · launch-week one-shot data job
> Source: `docs/UPGRADE_PLAN.md` §2 U2-1 · `docs/research/legacy-chat-datanew-2026-05-17.md` L-2
> Implements: `supabase/migrations/0067_pcs_customer_migration.sql` +
> `actions/admin/pcs-migration.ts` + `/admin/migration/pcs-customers`

---

## What this does

Moves the legacy PCS customer base into Pacred:

1. Re-stamps each `PCS<n>` → `PR<n>` (same running number — `PCS1234 → PR1234`)
2. Offsets `member_code_seq` past the highest legacy number — **the one
   technical trap** (without this, a fresh signup tomorrow becomes
   `PR1234` and collides with the migrated row)
3. Creates `auth.users` + `profiles` rows for each legacy customer
4. Tags migrated rows with `profiles.migrated_from_pcs = true` so the
   team can distinguish them from native Pacred signups
5. Lets migrated customers reset password via email link or phone OTP
   on first login (we generate a random password during the create —
   it never goes anywhere)

Legacy table: `tb_users` (~9,279 rows in the 2026-03-19 dump, max
`userID = PCS10594`). Source dump on ภูม's Windows box:
`C:\xampp\htdocs\pcscargo\member\pcs-admin\html-private\update-database\somedata-2026-03-19-1348-pcsc_main.sql`
(the `tb_users` CREATE + INSERT block starts ~line 1,190,504).

---

## Pre-flight check

Before you start, confirm:

- [ ] Migration `0066_post_u1_audit_fixes.sql` is applied (it must be — U1 shipped)
- [ ] You can sign in to `/admin` as a `super` admin (this runbook needs `super`)
- [ ] The legacy SQL dump is on the machine you're working from
- [ ] Supabase dashboard SQL Editor is open in another tab

---

## Step 1 — Export legacy `tb_users` to CSV

The dump file is a phpMyAdmin SQL export — Postgres can't import it
directly. Convert the relevant `INSERT INTO tb_users` block to CSV
(or any tabular format your SQL Editor accepts).

📋 **CSV template + 3 sample rows:**
[`u2-1-pcs-customers-csv-template.csv`](u2-1-pcs-customers-csv-template.csv)
— column order matches the staging table 1:1. Use the header row as
the contract; replace the 3 sample rows with the real `tb_users` dump.

Easiest path: load the dump into a local MySQL/MariaDB, then export
`tb_users` as CSV.

```bash
# On Windows (assuming XAMPP's MySQL is running):
cd "C:\xampp\mysql\bin"
.\mysql.exe -u root pcsc_main < "C:\xampp\htdocs\pcscargo\member\pcs-admin\html-private\update-database\somedata-2026-03-19-1348-pcsc_main.sql"
.\mysql.exe -u root pcsc_main -e "SELECT userID, userTel, userName, userLastName, userEmail, userLineID, userFacebook, userRegistered, userSex, userBirthday, userLastLogin, coID, adminID, adminIDSale, userRecom, channel, companyCustomer, shopUser, userNote, userActive FROM tb_users WHERE userID LIKE 'PCS%';" --batch --raw > tb_users.tsv
```

Result: `tb_users.tsv` — tab-separated, with header row.

Convert to CSV (LibreOffice / Excel) if your SQL Editor prefers CSV.

**Sanity-check before loading:**
- Open the file. Confirm one row per customer.
- Spot-check 5 rows for non-empty `userID`, plausible `userTel`.
- Note the row count — should be roughly 9,000-10,000.

---

## Step 2 — Apply migration `0067` (do this BEFORE loading staging)

This adds the staging table schema + the `migrated_from_pcs` columns +
the (initially no-op) sequence offset. We apply the migration first so
the staging table exists for step 3.

In Supabase dashboard → SQL Editor → New query:

```sql
-- paste the full contents of:
-- supabase/migrations/0067_pcs_customer_migration.sql
```

Run. Expect a `notice` line:
```
U2-1: migration applied. Staging=0 rows. Already-migrated=0 rows.
```

If the notice shows a non-zero offset (e.g.
`member_code_seq offset to 100 (max_staging=0 max_migrated=0
max_native=99 + buffer=100)`), that's fine — it's accounting for
existing native signups.

---

## Step 3 — Load CSV → `pcs_legacy_customers_staging`

In Supabase dashboard → Table editor → `pcs_legacy_customers_staging`
→ Import data from CSV.

**Column mapping:**

| CSV column          | Staging column         |
|---------------------|------------------------|
| `userID`            | `legacy_user_id`       |
| `userTel`           | `user_tel`             |
| `userName`          | `first_name`           |
| `userLastName`      | `last_name`            |
| `userEmail`         | `email`                |
| `userLineID`        | `line_id`              |
| `userFacebook`      | `facebook_url`         |
| `userRegistered`    | `user_registered`      |
| `userSex`           | `user_sex`             |
| `userBirthday`      | `user_birthday`        |
| `userLastLogin`     | `user_last_login`      |
| `coID`              | `co_id`                |
| `adminID`           | `admin_id`             |
| `adminIDSale`       | `sales_admin_id`       |
| `userRecom`         | `user_recom`           |
| `channel`           | `channel`              |
| `companyCustomer`   | `company_customer`     |
| `shopUser`          | `shop_user`            |
| `userNote`          | `user_note`            |
| `userActive`        | `user_active`          |

Leave the rest (`imported_at`, `backfilled_at`, etc.) for Supabase to
default.

**If the import bombs on a single bad row** (date parsing, encoding),
fix that row in the CSV + retry. The table editor stops on first
error.

**Verify after load:**
```sql
select count(*) as total, count(*) filter (where backfilled_at is null) as pending
  from public.pcs_legacy_customers_staging;
```
Should show total = your row count, pending = total.

---

## Step 4 — Re-apply migration `0067` to set the sequence offset

Now that staging is populated, re-run `0067` so the `setval()` sees
the real `max_staging_num`:

```sql
-- paste 0067 again (same file)
```

Expect notice like:
```
U2-1: member_code_seq offset to 10694
  (max_staging=10594 max_migrated=0 max_native=99 + buffer=100).
  Next signup → PR10695.
```

The `max_staging` should match the highest `PCS<n>` you imported.
The `buffer=100` gives headroom for any late-arriving staging rows.

**Verify:**
```sql
select * from public.v_pcs_migration_status;
```

The `member_code_seq_current` should be ≥ `max_legacy_num_in_staging`
(plus 100 buffer).

---

## Step 5 — Run the backfill via `/admin/migration/pcs-customers`

Sign in as a `super` admin. Visit `/admin/migration/pcs-customers`.

1. Confirm the status panel shows:
   - **Staging total** = your imported row count
   - **Pending backfill** = same number
   - **Sequence offset OK** = YES (green)

2. Click **Dry run** first (batch size 500). This walks the rows,
   classifies them (skippable / failable / good), reports counts
   without writing anything.

3. If the dry-run counts look sane, click **Run backfill**. This
   creates auth.users + profiles for one batch of 500 rows.

4. The page auto-refreshes. **Repeat clicking Run backfill** until
   "Pending backfill" hits 0.

   Each batch takes 30-60s for 500 rows (auth.users createUser is
   ~50ms/row). 9,279 rows ÷ 500 = **~19 clicks**.

5. The action is idempotent — a re-run skips already-backfilled rows.
   If the Vercel function times out mid-batch (60s ceiling), some rows
   are done + some aren't — re-run picks up cleanly.

**Per-row outcomes:**
- **Created** — auth.users + profiles inserted ✓
- **Skipped: `already_in_profiles`** — re-run hit a row that previous run created. Marks staging done.
- **Skipped: `no_phone_or_email`** — legacy row with neither. ~30% of cold leads. Stays in staging with `notes` set so you can revisit.
- **Skipped: `bad_legacy_id_format`** — `userID` wasn't `PCS<digits>`. Should not happen but harmless.
- **Failed: `<message>`** — auth API errored (duplicate phone, bad email, etc.). Row stays pending. Check the staging row's `notes` for detail.

---

## Step 6 — Verify

```sql
select * from public.v_pcs_migration_status;
```

Expected:
- `staging_pending` ≈ 0 (or = "no email/phone" rows you triaged)
- `migrated_profiles` = (your imported count − skipped no-contact)
- `max_member_code_num` ≥ `max_legacy_num_in_staging`
- `member_code_seq_current` > `max_member_code_num`

**Spot-check a migrated customer:**
```sql
select id, member_code, phone, email, first_name, last_name,
       migrated_from_pcs, legacy_pcs_user_id, status
  from public.profiles
  where migrated_from_pcs = true
  order by member_code
  limit 5;
```

You should see `PR<n>` codes whose number matches the legacy `PCS<n>`.
`status = 'active'`. `migrated_from_pcs = true`.

**Confirm the next native signup won't collide:**
```sql
select last_value, is_called from public.member_code_seq;
-- last_value > max_member_code_num → next nextval() returns last_value + 1 → safe.
```

---

## Step 7 — Tell the customers (rebrand notice)

Per ป๊อป (`[LINE]Sys ระบบหลังบ้าน.txt` 2026-05-17 11:48):

> "เราจะแจ้งลูกค้าว่าเรารีแบรน"

Pacred sales team takes over from here:
- Phone-follow the migrated list (the `sales_admin_id` is preserved
  from legacy, so each rep knows their own list).
- Send the rebrand notice (template TBD — sales team owns).
- Customers reset password via "Forgot password" → email link OR
  phone OTP on first login.

---

## Cleanup (after launch week settles)

Once the migration is verified live + no rollback is anticipated:

```sql
-- Optional: drop the staging table to free space + clean up.
-- Keep the migrated_from_pcs + legacy_pcs_user_id columns on
-- profiles forever — those are the audit trail.
drop table if exists public.pcs_legacy_customers_staging;
```

(The migration creates `pcs_legacy_customers_staging` with
`create table if not exists`, so re-applying `0067` after a drop is
safe — it re-creates the table empty.)

---

## Rollback (if catastrophic)

The migration is additive. To undo:

```sql
-- 1) Delete migrated profiles (the trigger will fire updated_at;
--    auth.users.id FK cascades on delete from profiles, but we want
--    to clear auth.users too — do it via the admin API, NOT here).
-- 2) Reset the sequence (only if you're sure no NATIVE signups landed
--    after the offset — those would re-collide).

-- One-row-at-a-time delete via admin API + delete-auth-user is the
-- only safe way. Don't bulk DELETE FROM auth.users — that strands
-- sessions + breaks RLS triggers.

-- For a partial rollback (e.g. one bad batch), filter by the time
-- window of the backfill audit log entry:
select payload from public.admin_audit_log
  where action = 'pcs_migration.backfill_batch'
  order by created_at desc limit 10;
```

---

## Cross-references

- Migration: `supabase/migrations/0067_pcs_customer_migration.sql`
- Server action: `actions/admin/pcs-migration.ts`
- Admin UI: `app/[locale]/(admin)/admin/migration/pcs-customers/page.tsx`
- Upstream spec: `docs/research/legacy-chat-datanew-2026-05-17.md` L-2
- Member-code rule (do not change): `supabase/migrations/0060_member_code_3digit.sql`
- Roadmap entry: `docs/UPGRADE_PLAN.md` §2 U2-1
