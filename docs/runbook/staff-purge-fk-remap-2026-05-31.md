# Staff purge + re-register — FK landscape + DRAFT remap SQL

> 🔴🔴🔴 **DRAFT · REVIEW-ONLY · NOTHING IN THIS FILE HAS BEEN EXECUTED.** 🔴🔴🔴
>
> This runbook is the executable companion to [ADR-0022](../decisions/0022-staff-purge-and-reregister.md).
> Every SQL block below is a **TEMPLATE for owner review** — DO NOT paste-and-run blind. The remap is
> parameterized by an OLD→NEW code map only the owner can fill in (§3). Run order is load-bearing:
> **backup → build new admins → remap → verify → deactivate old.** Never delete before remap.
>
> **Read-only probe** (safe to run anytime, re-prints everything below from live prod):
> ```bash
> node --env-file=.env.local scripts/staff-purge-analysis.mjs
> ```

**Gathered:** 2026-05-31 · read-only SELECT/count against prod `yzljakczhwrpbxflnmco` · เดฟ.
**Source directive:** owner 2026-05-31 (re-sweep decision #5) — purge all non-customer staff (sales + CS/admin), re-register the new team. Customers (`tb_users` identity) untouched.

---

## 0. The headline numbers (why "remap, don't delete")

| Table | Rows (prod) | Key | Role |
|---|---:|---|---|
| `tb_admin` | **13** | `adminID` (varchar) | LEGACY staff identity (camelCase). The roster to retire. |
| `admins` | **3** | `profile_id` (UUID) | REBUILT Pacred-auth role grant. `requireAdmin()` reads this. |
| `admin_contact_extras` | **0** | `profile_id` | BRIDGE (`legacy_admin_id`+`nickname`). **EMPTY** — bridge doesn't exist yet → P1-15 returns null. |
| `tb_users` | 8,926 | `userID` | CUSTOMERS — **out of scope, never touched.** |

**The data already points at codes that aren't in `tb_admin` (drift over years of staff churn):**

- 8 890 customers (`tb_users.adminIDSale`) carry **13** rep codes — **0 of them in `tb_admin`**.
- 16 954 report rows (`tb_sales_report.sradminidsale`) carry **4** rep codes — **0 of them in `tb_admin`**.
- ~32 distinct codes stamp `tb_forwarder.adminid` (sample), **31 not in `tb_admin`**.

A hard delete would **silently orphan** all of these (they are soft varchar refs, **no DB FK / no CASCADE** — delete won't error, it'll just quietly break). Hence ADR-0022's **remap-then-deactivate**.

---

## 1. FK landscape — every column that references an admin code

Two tiers (ADR-0022 §D-2). **Tier 1 = live ownership/reporting → remap.** **Tier 2 = historical audit stamp → default LEAVE (kept resolvable by deactivating, not deleting, the old `tb_admin` row).**

| Tier | Referencing table | Column | Casing | Non-empty rows | What it means | What breaks if the code is deleted/orphaned |
|---|---|---|---|---:|---|---|
| **1** | `tb_users` | `adminIDSale` | camelCase | **8 890** | Customer's current sales rep | Customer has **no rep** — lead unowned, blank on profile, P1-15 can't re-derive |
| **1** | `tb_sales_report` | `sradminidsale` | lowercase | **16 954** | Monthly rep performance snapshot | Report row resolves to **no name** — commission/perf history unreadable (already broken today) |
| 2 | `tb_forwarder` | `adminid` | lowercase | 41 004 | Who handled the forwarder | Audit stamp loses actor name |
| 2 | `tb_forwarder` | `adminidcreator` | lowercase | 45 696 | Forwarder creator | Audit stamp loses actor name |
| 2 | `tb_forwarder` | `adminidupdate` | lowercase | 46 770 | Forwarder last-updater | Audit stamp loses actor name |
| 2 | `tb_header_order` | `adminid` | lowercase | 20 323 | Shop-order handler | Audit stamp loses actor name |
| 2 | `tb_header_order` | `adminidcreate` | lowercase | 5 123 | Shop-order creator | Audit stamp loses actor name |
| 2 | `tb_header_order` | `adminidupdate` | lowercase | 21 943 | Shop-order last-updater | Audit stamp loses actor name |
| 2 | `tb_header_order` | `adminidip` | lowercase | (n/a*) | Creator IP/admin stamp | Audit stamp loses actor name |
| 2 | `tb_payment` | `adminid` | lowercase | 1 437 | Yuan-payment handler | Audit stamp loses actor name |
| 2 | `tb_payment` | `payadminidcreator` | lowercase | 0 | Yuan-payment creator | (empty — nothing to remap) |
| 2 | `tb_payment` | `adminidupdate` | lowercase | 1 431 | Yuan-payment last-updater | Audit stamp loses actor name |
| 2 | `tb_wallet_hs` | `adminid` | lowercase | 93 384 | Wallet-ledger entry handler | Audit stamp loses actor name |
| 2 | `tb_wallet_hs` | `admincreate` | lowercase | 2 318 | Wallet-ledger creator | Audit stamp loses actor name |
| 2 | `tb_wallet_hs` | `adminidupdate` | lowercase | 97 700 | Wallet-ledger updater | Audit stamp loses actor name |
| 2 | `tb_wallet_hs` | `adminidcrate` | lowercase | (n/a*) | Wallet-ledger creator (legacy typo "crate") | Audit stamp loses actor name |
| 2 | `tb_receipt` | `adminid` | lowercase | 2 422 | Receipt issuer | Audit stamp loses actor name |
| 2 | `tb_receipt` | `adminidprint` | lowercase | 11 909 | Receipt original-print | Audit stamp loses actor name |
| 2 | `tb_receipt` | `adminidprintcopy` | lowercase | 2 | Receipt copy-print | Audit stamp loses actor name |
| 2 | `tb_cnt` | `adminIDCreate` | **camelCase** | 958 | Container-payment creator | Audit stamp loses actor name |
| 2 | `tb_cnt` | `adminIDUpdate` | **camelCase** | 417 | Container-payment updater | Audit stamp loses actor name |
| — | `tb_user_sales_admin_pay` | `admincreate` | lowercase | 5 | Agent-commission payout creator | Audit stamp loses actor name (tiny) |

\* `adminidip` / `adminidcrate` exist as columns (confirmed in the table shape) but a non-empty count wasn't separately captured — treat as Tier-2 audit, default LEAVE. Re-run `scripts/staff-purge-analysis.mjs` (add them to the `fk` list) for exact numbers if the owner opts to remap Tier-2.

**NOT an admin reference (clarified during the probe — do NOT touch as part of staff remap):**
- `tb_user_sales` (4 104 rows · cols `usstatus`/`date`/`useridmain`/`userid`/`idf`) — this is the **customer-agent affiliate commission**; `useridmain`/`userid` reference **`tb_users` customer codes (PR####)**, NOT admin codes. Out of scope.
- `tb_user_sales_pay` (440 rows · `idus`/`idusap`) — join rows for the above. Out of scope.

**Casing reminder (load-bearing for the SQL):** `tb_cnt.adminIDCreate` / `adminIDUpdate` are **camelCase** and MUST be double-quoted in SQL (`"adminIDCreate"`). Everything else is lowercase and unquoted-safe. (`tb_users.adminIDSale` is also camelCase → quote it.)

---

## 2. The mismatch in full (the core problem the re-register fixes)

```
tb_admin.adminID (current 13-row roster):
  admin_pop  admin_nat  admin_pond  admin_admin_win  admin_admin_web
  admin_admin_ploy  admin_admin_jane  admin_admin_dev  admin_admin_gring
  admin_admin_aom  admin_admin_pee  admin_ploypr01  admin_Warehouse

tb_users.adminIDSale (8 890 customers) — 13 codes, NONE in tb_admin:
  admin_mew(430) admin_sarai(270) admin_ploy(83) admin_but(75)
  admin_fogus(64) admin_may(44) admin_admin_eye(12) admin_admin_bam(9)
  admin_admin_jean(9) admin_yyel(1) admin_mind(1) admin_tangm0(1) pcs_cargo(1)

tb_sales_report.sradminidsale (16 954 rows) — 4 codes, NONE in tb_admin:
  admin_jeen(324)  admin_kan(241)  admin_baipor(235)  admin_nin(200)
  (sample tally; re-run the script for the full distribution)
```

→ **Distinct admin codes appearing in the live data ≫ rows in `tb_admin`.** The 8,890 customers and 16,954 report rows reference a *superset* of historical staff that the 13-row roster no longer contains. This is why reps show blank today, and why the remap (not delete) is mandatory.

---

## 3. ⬜ OWNER FILLS THIS IN — the OLD→NEW code map

The remap SQL below is parameterized by this map. **Only the owner knows which old rep's book each new hire inherits** (or whether a departed rep's customers re-pool via P1-15). Fill one row per OLD code that should move; leave a code out (or map to the `__REPOOL__` sentinel) to let P1-15 re-distribute it.

| OLD code (in data today) | Owned customers / report rows | NEW code (the re-registered admin's `legacy_admin_id`) — **fill in** | Notes |
|---|---:|---|---|
| `admin_mew` | 430 cust | `__________` | |
| `admin_sarai` | 270 cust | `__________` | |
| `admin_ploy` | 83 cust | `__________` | |
| `admin_but` | 75 cust | `__________` | |
| `admin_fogus` | 64 cust | `__________` | |
| `admin_may` | 44 cust | `__________` | |
| `admin_admin_eye` | 12 cust | `__________` | |
| `admin_admin_bam` | 9 cust | `__________` | |
| `admin_admin_jean` | 9 cust | `__________` | |
| `admin_yyel` / `admin_mind` / `admin_tangm0` / `pcs_cargo` | 1 each | `__________` | likely re-pool |
| `admin_jeen` | 324 report | `__________` | report-only (Tier-1 #2) |
| `admin_kan` | 241 report | `__________` | report-only |
| `admin_baipor` | 235 report | `__________` | report-only |
| `admin_nin` | 200 report | `__________` | report-only |

> **Decision the owner must also make:** remap `tb_sales_report.sradminidsale` at all? It rewrites *historical* performance attribution. Default recommendation: remap only if the new rep genuinely inherits the old rep's *credit*; otherwise leave it (pre-purge months will read against the old code, which is at least historically truthful).

---

## 4. Pre-flight checks (run + confirm GREEN before any write)

```sql
-- 4a. Column widths — can the NEW codes fit? (longest new code = 'admin_admin_gring' = 17 chars)
--     Observed today: tb_users.adminIDSale already stores 16-char values; tb_sales_report 12-char.
--     CONFIRM both columns accept >=17 chars before remapping a long new code into them.
SELECT table_name, column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE (table_name='tb_users'        AND column_name='adminIDSale')
   OR (table_name='tb_sales_report' AND column_name='sradminidsale');
-- If character_maximum_length < 17 for a column you must remap into, ALTER it wider FIRST
-- (e.g. ALTER TABLE tb_users ALTER COLUMN "adminIDSale" TYPE varchar(32);) — owner-approved.

-- 4b. Snapshot the OLD distribution so we can prove zero-loss after (compare counts post-remap).
SELECT "adminIDSale" AS code, count(*) FROM tb_users
 WHERE "adminIDSale" <> '' GROUP BY 1 ORDER BY 2 DESC;
SELECT sradminidsale AS code, count(*) FROM tb_sales_report
 WHERE sradminidsale <> '' GROUP BY 1 ORDER BY 2 DESC;

-- 4c. Confirm the NEW 13 admins already exist (build them FIRST via /admin/admins/new) with bridge rows.
SELECT a.profile_id, e.legacy_admin_id, e.nickname, a.role, a.is_active
FROM admins a LEFT JOIN admin_contact_extras e USING (profile_id)
ORDER BY e.legacy_admin_id;
-- Every NEW code referenced in the §3 map MUST appear here with is_active=true and a non-null legacy_admin_id.
```

---

## 5. Backup (do FIRST — before any mutation)

```sql
-- Timestamped backup copies of the identity tables + the Tier-1 FK columns.
-- (Tier-2 stamp columns are not remapped by default, so backing up the identity
--  tables + the two Tier-1 columns covers the reversible surface.)
CREATE TABLE bak_tb_admin_20260531              AS SELECT * FROM tb_admin;
CREATE TABLE bak_admins_20260531               AS SELECT * FROM admins;
CREATE TABLE bak_admin_contact_extras_20260531 AS SELECT * FROM admin_contact_extras;
CREATE TABLE bak_tb_users_rep_20260531         AS SELECT "userID", "adminIDSale" FROM tb_users;
CREATE TABLE bak_tb_sales_report_rep_20260531  AS SELECT id, sradminidsale  FROM tb_sales_report;
-- (Supabase: also take a project snapshot / pg_dump for a full safety net.)
```

---

## 6. ⬜ DRAFT remap SQL — TEMPLATE (REVIEW-ONLY · run inside a transaction)

> Replace every `OLD_*` / `NEW_*` literal with the §3 map values. Run the whole Tier-1 block in ONE
> transaction, count-verify (§7) BEFORE `COMMIT`. Idempotent: re-running maps already-new codes to
> themselves (no-op) as long as you never map a NEW code back to an OLD one.

### 6.1 Tier 1 — LIVE ownership (MUST remap). `tb_users.adminIDSale`

```sql
BEGIN;

-- One UPDATE per (OLD → NEW) pair from the §3 map. camelCase column → quote it.
UPDATE tb_users SET "adminIDSale" = 'NEW_FOR_MEW'   WHERE "adminIDSale" = 'admin_mew';
UPDATE tb_users SET "adminIDSale" = 'NEW_FOR_SARAI' WHERE "adminIDSale" = 'admin_sarai';
UPDATE tb_users SET "adminIDSale" = 'NEW_FOR_PLOY'  WHERE "adminIDSale" = 'admin_ploy';
UPDATE tb_users SET "adminIDSale" = 'NEW_FOR_BUT'   WHERE "adminIDSale" = 'admin_but';
UPDATE tb_users SET "adminIDSale" = 'NEW_FOR_FOGUS' WHERE "adminIDSale" = 'admin_fogus';
UPDATE tb_users SET "adminIDSale" = 'NEW_FOR_MAY'   WHERE "adminIDSale" = 'admin_may';
UPDATE tb_users SET "adminIDSale" = 'NEW_FOR_EYE'   WHERE "adminIDSale" = 'admin_admin_eye';
UPDATE tb_users SET "adminIDSale" = 'NEW_FOR_BAM'   WHERE "adminIDSale" = 'admin_admin_bam';
UPDATE tb_users SET "adminIDSale" = 'NEW_FOR_JEAN'  WHERE "adminIDSale" = 'admin_admin_jean';
-- Departed-with-no-successor → blank so P1-15 auto-assign re-pools them to the new team
-- (recommended over forcing a wrong mapping):
UPDATE tb_users SET "adminIDSale" = ''
 WHERE "adminIDSale" IN ('admin_yyel','admin_mind','admin_tangm0','pcs_cargo');

-- VERIFY (must be 0) — any customer still pointing at an OLD code not in the new roster:
-- SELECT count(*) FROM tb_users
--  WHERE "adminIDSale" <> '' AND "adminIDSale" NOT IN (SELECT "adminID" FROM tb_admin WHERE "adminStatusA"='1');

COMMIT;  -- only after §7 verification passes
```

### 6.2 Tier 1 — reporting (OWNER OPT-IN). `tb_sales_report.sradminidsale`

```sql
-- Only if the owner decides historical credit should follow the new rep (ADR-0022 §3 note).
BEGIN;
UPDATE tb_sales_report SET sradminidsale = 'NEW_FOR_JEEN'   WHERE sradminidsale = 'admin_jeen';
UPDATE tb_sales_report SET sradminidsale = 'NEW_FOR_KAN'    WHERE sradminidsale = 'admin_kan';
UPDATE tb_sales_report SET sradminidsale = 'NEW_FOR_BAIPOR' WHERE sradminidsale = 'admin_baipor';
UPDATE tb_sales_report SET sradminidsale = 'NEW_FOR_NIN'    WHERE sradminidsale = 'admin_nin';
COMMIT;  -- after verify
```

### 6.3 Tier 2 — historical audit stamps (DEFAULT: DO NOT RUN)

> ADR-0022 §D-2: these say "who did this back then." Rewriting them lies about history. **Default = leave
> them; keep them resolvable by DEACTIVATING (not deleting) the old `tb_admin` rows in §8.** Provided only
> for the rare case the owner wants to re-attribute a *specific renamed* person (not a new hire).
> ⚠️ varchar(10) trap: many stamp columns are `varchar(10)`; a NEW code > 10 chars will NOT fit — verify
> the column width per §4a before any Tier-2 UPDATE, or the statement errors.

```sql
-- EXAMPLE ONLY — one old→new rename, gated behind explicit owner opt-in. Note camelCase quoting on tb_cnt.
-- BEGIN;
-- UPDATE tb_forwarder    SET adminid          = 'NEW' WHERE adminid          = 'OLD';
-- UPDATE tb_forwarder    SET adminidcreator   = 'NEW' WHERE adminidcreator   = 'OLD';
-- UPDATE tb_forwarder    SET adminidupdate    = 'NEW' WHERE adminidupdate    = 'OLD';
-- UPDATE tb_header_order SET adminid          = 'NEW' WHERE adminid          = 'OLD';
-- UPDATE tb_header_order SET adminidcreate    = 'NEW' WHERE adminidcreate    = 'OLD';
-- UPDATE tb_header_order SET adminidupdate    = 'NEW' WHERE adminidupdate    = 'OLD';
-- UPDATE tb_payment      SET adminid          = 'NEW' WHERE adminid          = 'OLD';
-- UPDATE tb_payment      SET adminidupdate    = 'NEW' WHERE adminidupdate    = 'OLD';
-- UPDATE tb_wallet_hs    SET adminid          = 'NEW' WHERE adminid          = 'OLD';
-- UPDATE tb_wallet_hs    SET adminidupdate    = 'NEW' WHERE adminidupdate    = 'OLD';
-- UPDATE tb_wallet_hs    SET admincreate      = 'NEW' WHERE admincreate      = 'OLD';
-- UPDATE tb_receipt      SET adminid          = 'NEW' WHERE adminid          = 'OLD';
-- UPDATE tb_receipt      SET adminidprint     = 'NEW' WHERE adminidprint     = 'OLD';
-- UPDATE tb_receipt      SET adminidprintcopy = 'NEW' WHERE adminidprintcopy = 'OLD';
-- UPDATE tb_cnt          SET "adminIDCreate"  = 'NEW' WHERE "adminIDCreate"  = 'OLD';   -- camelCase!
-- UPDATE tb_cnt          SET "adminIDUpdate"  = 'NEW' WHERE "adminIDUpdate"  = 'OLD';   -- camelCase!
-- UPDATE tb_user_sales_admin_pay SET admincreate = 'NEW' WHERE admincreate  = 'OLD';
-- COMMIT;
```

---

## 7. Verify (BEFORE COMMIT, and again after)

```sql
-- 7a. Zero customers left pointing at a code not in the active roster:
SELECT count(*) AS orphan_customers FROM tb_users
 WHERE "adminIDSale" <> '' AND "adminIDSale" NOT IN
   (SELECT "adminID" FROM tb_admin WHERE "adminStatusA"='1' AND ("adminDel" IS NULL OR "adminDel"=''));
-- expect 0 (or = the count you intentionally blanked for re-pool)

-- 7b. Total customer-with-rep count unchanged (minus any intentional blanks):
SELECT count(*) FROM tb_users WHERE "adminIDSale" <> '';   -- compare to bak_tb_users_rep_20260531

-- 7c. New rep distribution looks sane (each new code now owns the inherited book):
SELECT "adminIDSale", count(*) FROM tb_users WHERE "adminIDSale" <> '' GROUP BY 1 ORDER BY 2 DESC;

-- 7d. (if §6.2 ran) report rows now resolve:
SELECT count(*) FROM tb_sales_report WHERE sradminidsale <> '' AND sradminidsale NOT IN
  (SELECT "adminID" FROM tb_admin);
```

If 7a is non-zero (unexpectedly), `ROLLBACK` and fix the §3 map before re-running.

---

## 8. Retire the old staff — DEACTIVATE, do NOT DELETE (last step)

```sql
-- Only after §7 is GREEN. Flag the OLD roster inactive; KEEP the rows so old stamps resolve.
-- Identify the OLD rows = the tb_admin rows that are NOT one of the new re-registered admins.
-- (Adjust the NOT IN list to the actual NEW legacy_admin_id set the owner created.)

-- 8a. Old tb_admin rows → inactive (preserve for audit-name resolution):
UPDATE tb_admin
   SET "adminStatusA" = '0',
       "adminDel"     = 'admin_pop',          -- or the supervising new-admin code
       "dateDel"      = now()
 WHERE "adminID" NOT IN ( /* the NEW re-registered adminID codes */ );

-- 8b. Old admins (Pacred-auth) rows → revoke login eligibility:
UPDATE admins SET is_active = false
 WHERE profile_id NOT IN ( /* the NEW admins' profile_ids */ );

-- 8c. (optional) mark the old bridge rows ended so P1-15 won't pick them:
UPDATE admin_contact_extras SET ended_at = now()
 WHERE profile_id NOT IN ( /* the NEW admins' profile_ids */ );

-- ❌ DO NOT: DELETE FROM tb_admin / admins / profiles for old staff.
--    Deletion orphans the 100k+ Tier-2 audit stamps irreversibly (ADR-0022 §D-1).
```

---

## 9. Rollback

- **Before §8:** every remap ran in a transaction — `ROLLBACK` if §7 fails.
- **After commit:** restore Tier-1 columns from the §5 backups:
  ```sql
  UPDATE tb_users u SET "adminIDSale" = b."adminIDSale"
    FROM bak_tb_users_rep_20260531 b WHERE b."userID" = u."userID";
  UPDATE tb_sales_report s SET sradminidsale = b.sradminidsale
    FROM bak_tb_sales_report_rep_20260531 b WHERE b.id = s.id;
  -- Re-activate old tb_admin / admins from bak_* if §8 ran.
  ```
- Because §8 deactivates (not deletes), undoing a retire is just flipping `adminStatusA`/`is_active`/`ended_at` back.

---

## 10. Sign-off checklist (owner ticks before each step)

- [ ] §3 OLD→NEW map filled in (or codes intentionally left for P1-15 re-pool).
- [ ] §4 pre-flight GREEN — column widths confirmed ≥ longest new code; new 13 admins exist with bridge rows.
- [ ] §5 backup tables created (+ Supabase project snapshot).
- [ ] §6.1 Tier-1 customer remap run in a transaction; §7 verify GREEN; committed.
- [ ] §6.2 report remap — decided (run / skip); if run, verified.
- [ ] §6.3 Tier-2 — confirmed **NOT run** (default) unless a specific rename was opted in.
- [ ] §8 old roster deactivated (NOT deleted); P1-15 auto-assign confirmed working on a test signup.

> **Reminder:** this entire file is a plan. `scripts/staff-purge-analysis.mjs` is the only thing that has
> touched prod, and it is strictly read-only. No DELETE/UPDATE has been executed.
