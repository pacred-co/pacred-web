# Wave 29 — tb_receipt PR-format pollution audit (2026-05-30)

> Wave 28 minted invoices with the wrong doc-number format (`PR<yyMMdd>-<seq>` e.g. `PR260529-3`) since deploy. Legacy format = `{FRC|FRG}{yyMM}-{NNNNN}`. This runbook is the prod cleanup gate before Wave 29 #206 (auto-receipt) goes live.
>
> See: `docs/research/legacy-accounting-reality-2026-05-30.md` §3 for full context.

## Step 1 — Read-only audit (run FIRST, decide AFTER)

Paste in Supabase Dashboard SQL Editor (`pacred-production`):

```sql
-- 1a. How many polluted rows?
SELECT COUNT(*)                              AS pr_rows,
       MIN(issuedate)                        AS earliest,
       MAX(issuedate)                        AS latest
FROM tb_receipt
WHERE rid LIKE 'PR%';

-- 1b. Every polluted row + admin + amount + status + item count
SELECT r.id,
       r.rid,
       r.userid,
       r.corporatetype,
       r.rstatus,
       r.ramount,
       r.issuedate,
       r.adminid,
       (SELECT COUNT(*) FROM tb_receipt_item WHERE rid = r.rid)  AS item_count,
       r.refid,
       r.statusprint
FROM tb_receipt r
WHERE r.rid LIKE 'PR%'
ORDER BY r.issuedate DESC;

-- 1c. Have any been printed yet? (statusprint='1' means actually went to customer)
SELECT rid, statusprint, adminidprint, rdateprint
FROM tb_receipt
WHERE rid LIKE 'PR%'
  AND statusprint = '1';

-- 1d. Did any get paid? (rstatus='1' = paid)
SELECT rid, rstatus, ramount, issuedate
FROM tb_receipt
WHERE rid LIKE 'PR%'
  AND rstatus = '1';

-- 1e. What's the highest FRG/FRC counter this month?
-- (need this to know what to RENAME the PR rows to)
SELECT 'FRG' AS family,
       COUNT(*)                                              AS count_this_month,
       MAX(rid)                                              AS max_rid,
       MAX(CAST(SUBSTRING(rid FROM 9 FOR 5) AS INTEGER))     AS max_seq
FROM tb_receipt
WHERE rid LIKE 'FRG' || TO_CHAR(NOW(), 'YYMM') || '-%'
  AND corporatetype = '2'
UNION ALL
SELECT 'FRC',
       COUNT(*),
       MAX(rid),
       MAX(CAST(SUBSTRING(rid FROM 9 FOR 5) AS INTEGER))
FROM tb_receipt
WHERE rid LIKE 'FRC' || TO_CHAR(NOW(), 'YYMM') || '-%'
  AND corporatetype = '1';
```

## Step 2 — Decision matrix

| If 1a returns | And 1c statusprint | And 1d rstatus | Decision |
|---|---|---|---|
| **0 rows** | n/a | n/a | ✅ No pollution · skip Step 3 |
| 1-10 rows | 0 printed | 0 paid | ✅ **Option A — Rename** (cheap · keep audit trail) |
| 1-10 rows | ≥1 printed OR ≥1 paid | | ⚠️ **Option B — Keep + tag** (don't break customer-quoted invoice numbers · add a `note` column entry) |
| > 10 rows | mixed | mixed | 🔴 **Stop · escalate to ก๊อต** (deeper migration plan needed) |

## Step 3a — OPTION A · Rename polluted rows to FRG/FRC

Only run if Step 2 → Option A. Renames the rids inline + updates `tb_receipt_item.rid` join field. Wraps in a transaction so you can roll back if the verify check fails.

```sql
BEGIN;

-- Stage the renames into a temp table so we don't mutate tb_receipt and
-- tb_receipt_item independently (the rid join would break midway).
CREATE TEMP TABLE pr_rename_plan AS
WITH polluted AS (
  SELECT id, rid, corporatetype, issuedate,
         ROW_NUMBER() OVER (
           PARTITION BY corporatetype, TO_CHAR(issuedate, 'YYMM')
           ORDER BY issuedate, id
         ) AS pollution_rank
  FROM tb_receipt
  WHERE rid LIKE 'PR%'
),
highest_per_month AS (
  SELECT corporatetype,
         TO_CHAR(issuedate, 'YYMM')                                AS yymm,
         COALESCE(
           MAX(CAST(SUBSTRING(rid FROM 9 FOR 5) AS INTEGER)),
           0
         ) AS max_seq
  FROM tb_receipt
  WHERE rid ~ '^FR[CG][0-9]{4}-[0-9]{5}$'
  GROUP BY corporatetype, TO_CHAR(issuedate, 'YYMM')
)
SELECT
  p.id,
  p.rid                                                            AS old_rid,
  (CASE p.corporatetype WHEN '1' THEN 'FRC' ELSE 'FRG' END)
    || TO_CHAR(p.issuedate, 'YYMM')
    || '-'
    || LPAD(
         (COALESCE(h.max_seq, 0) + p.pollution_rank)::text,
         5,
         '0'
       )                                                            AS new_rid
FROM polluted p
LEFT JOIN highest_per_month h
       ON h.corporatetype = p.corporatetype
      AND h.yymm = TO_CHAR(p.issuedate, 'YYMM');

-- Preview before mutating
SELECT * FROM pr_rename_plan ORDER BY new_rid;

-- ⚠️ Stop here · review the preview. If happy, continue. If not, ROLLBACK.

-- Apply: rename tb_receipt_item rows first (children of the join), then
-- tb_receipt parent rows.
UPDATE tb_receipt_item ri
SET rid = p.new_rid
FROM pr_rename_plan p
WHERE ri.rid = p.old_rid;

UPDATE tb_receipt r
SET rid = p.new_rid
FROM pr_rename_plan p
WHERE r.id = p.id;

-- Verify — should return 0 polluted rows
SELECT 'tb_receipt'      AS table_name, COUNT(*) FROM tb_receipt      WHERE rid LIKE 'PR%'
UNION ALL
SELECT 'tb_receipt_item',              COUNT(*) FROM tb_receipt_item WHERE rid LIKE 'PR%';

-- If both = 0 → COMMIT;  if not → ROLLBACK;
COMMIT;
```

## Step 3b — OPTION B · Keep + tag

Only if any PR-rid invoice has been printed AND/OR paid. The PR number is now in the customer's hands; renaming would break their records.

```sql
BEGIN;

-- Add a note explaining the doc number is the legacy Wave-28 format.
-- The `refid` column is a free-text field per Pacred usage (legacy used
-- it as a reference pointer, but our code already over-uses it as notes
-- per agent audit Wave 28 finding #4 — we tolerate this here).
UPDATE tb_receipt
SET refid = CONCAT(
  COALESCE(refid, ''),
  CASE WHEN refid IS NULL OR refid = '' THEN '' ELSE ' | ' END,
  '⚠️ Wave-28 legacy doc-number format (PR not FRG/FRC). DO NOT cite as FRG/FRC.'
)
WHERE rid LIKE 'PR%';

SELECT id, rid, refid FROM tb_receipt WHERE rid LIKE 'PR%';

COMMIT;
```

## Step 4 — Code-side safety net

After cleanup, deploy Wave 29 #205 (the new `mintReceiptDocNo` minter — already shipped to `lib/admin/mint-receipt-doc-no.ts`). Wave 28's `mintReceiptId` in `actions/admin/forwarder-invoice.ts:125-148` will be replaced by Agent G as part of Wave 29 #206 — so no further PR-format rows will be created.

Add a lint guard (TODO Wave 30): ESLint rule rejecting any string literal `PR<digits>-<digits>` that's NOT a `tb_users.userID`. Stops future mis-mints from sneaking back in.

## Cross-links

- `docs/research/legacy-accounting-reality-2026-05-30.md` §3 — full audit
- `lib/admin/mint-receipt-doc-no.ts` — the correct minter
- `lib/admin/mint-receipt-doc-no.test.ts` — 21 pass / 0 fail
- Legacy source: `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\include\functions.php:457-486`
