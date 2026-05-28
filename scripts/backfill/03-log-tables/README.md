# Backfill 03 · The 3 oversized log tables (post-Pro-upgrade)

> **Context.** The legacy `pcsc_main` migration loaded **114 of 117 tables**
> to prod Supabase (`yzljakczhwrpbxflnmco`) on 2026-05-19. Three log tables
> were deferred because the free-tier 500 MB DB cap couldn't fit the full
> 1.02 GB of legacy data. Now the project is on the **Pro plan** (2026-05-21)
> so these three can be loaded.
>
> See `docs/runbook/pcs-data-migration.md` §4 + §6.4 for the full migration
> story.

## 1. The 3 tables

| Table             | Rows (max ID) | INSERT blocks | Rough INSERT bytes | Already in `0081`? |
|-------------------|--------------:|--------------:|-------------------:|--------------------|
| `tb_history`      |     ~167,966  |        1,069  |             ~59 MB | Yes (line 2720, RLS + PK + sequence) |
| `tb_history_key`  |     ~336,214  |          869  |             ~62 MB | Yes (line 2752, RLS + PK + sequence) |
| `tb_web_hs`       |   ~2,327,765  |       11,929  |            ~657 MB | Yes (line 6368, RLS + PK + sequence) |
| **Total**         | **~2.83 M**   |   **13,867**  |        **~778 MB** |                    |

The CREATE TABLE / PRIMARY KEY / sequence / RLS for all three already
shipped in migration `0081_pcs_legacy_schema.sql`. These tables exist EMPTY
on prod — we only need to load data.

Source dump: `C:\Users\Admin\pcscargo\newdata\2026-05-18-1358-pcsc_main.sql`
(898 MB; the same one the 114-table load used).

## 2. Why a script (not pre-baked .sql files in the repo)?

The Claude session that wrote this README ran under a sandbox that blocked
`node`, `awk`, `sed`, pipes, and stream redirects against the 898 MB dump.
The extraction logic is encoded in `_extract.mjs` (pure Node, no deps) — run
it locally on the machine where the dump lives. The output `.sql` files are
**customer-PII-bearing** and must NOT be committed (matches the policy
applied to the existing `pcs-legacy-data.sql` in §5 of the runbook).

If you'd rather skip Node, you can paste the original MySQL dump's INSERT
blocks into Supabase after a manual `mysql→pg` find-replace — but the script
is faster and gets the rebrand + zero-date + escape conversions right.

## 3. How to run

```powershell
# From the worktree root:
cd scripts/backfill/03-log-tables

# Verify the line ranges + sizes match this README:
node _analyze.mjs

# Extract one table:
node _extract.mjs tb_history

# ... or all three sequentially:
node _extract.mjs all
```

Output files are written next to the script:
- `tb_history-part-001.sql` (≤ 90 MB · should be a single chunk · ~59 MB)
- `tb_history_key-part-001.sql` (≤ 90 MB · single chunk · ~62 MB)
- `tb_web_hs-part-001.sql` through `tb_web_hs-part-008.sql` (~90 MB each;
  `657 MB / 90 MB = 8` chunks)

The 90 MB chunk limit keeps each file under Supabase SQL editor's effective
paste ceiling (the UI freezes well before the 100 MB hard cap).

## 4. Load order

Load in this order — **smallest first**. If one fails the others are unaffected.

1. `tb_history-part-001.sql`   (~59 MB · ~5 sec on a Pro project · 1 file)
2. `tb_history_key-part-001.sql` (~62 MB · ~6 sec · 1 file)
3. `tb_web_hs-part-001.sql` … `-008.sql` (657 MB · ~1-2 min total · 8 files)

Wall-clock estimate at Supabase Pro write speed ~10 MB/s for COPY-style
INSERT batches: **~80 seconds**. Add overhead for the SQL editor's parse
+ network round-trip — call it **3-5 minutes total** for all 8 files.

## 5. Load procedure (Supabase SQL editor)

Per file:
1. Open the SQL editor on the **prod** project (`yzljakczhwrpbxflnmco`).
2. Paste the file's contents into a fresh tab.
3. Click **Run**.
4. Wait for "Success" (a multi-MB INSERT can take 10-60 seconds).

The files start with `BEGIN;` and end with `COMMIT;` so a partial paste
won't leave a half-loaded state. If the editor times out on a `tb_web_hs`
chunk, switch to `psql`:

```bash
# from your machine with PGPASSWORD set:
psql "postgresql://postgres.yzljakczhwrpbxflnmco:<pwd>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres" \
  -f tb_web_hs-part-005.sql
```

## 6. Conversions applied by `_extract.mjs`

| MySQL                                              | PostgreSQL                                              |
|----------------------------------------------------|---------------------------------------------------------|
| `` INSERT INTO `tb_X` (`ID`, `keyWord`, ...) ``    | `INSERT INTO public.tb_x (id, keyword, ...)`            |
| `\'`  (backslash-quote — string escape)            | `''` (PG-standard doubled-quote)                        |
| `\\` (escaped backslash)                           | `\\` (preserved, both engines accept it inside strings) |
| `\n` `\r` `\t` (escape sequences inside strings)   | literal newline / CR / TAB                              |
| `\0` `\Z` (NUL · SUB)                              | stripped (PG `text` rejects NUL)                        |
| `'0000-00-00'` / `'0000-00-00 00:00:00'`           | `NULL` (PG rejects zero-dates; columns made nullable in `0081`) |
| `_binary 'xxx'`                                    | `'xxx'` (prefix stripped — defensive, none in these 3)  |
| `PCS<digits>` in a `userid` tuple-slot             | `PR<digits>` (member-code rebrand · ONLY tables with `rebrandUserid: true`) |
| `PCSTT/CARGO/ARNON/FAM` in a `userid` tuple-slot   | `PRTT/CARGO/ARNON/FAM` (8 special codes per runbook Q3)|
| `PW` / `JET` / `FCL` / `AIGA`                      | verbatim (no prefix · runbook Q3)                       |

### Rebrand scope per table

- `tb_history`: **no rebrand** (`adminid` is admin code; `action` is free-text
  audit SQL — runbook §3 forbids touching free text).
- `tb_history_key`: **rebrand `userid` only**.
- `tb_web_hs`: **rebrand `userid` only**.

The script does this by detecting a tuple-position `'PCS\d+'` literal and
rewriting just that token (a regex like `(['"\(,]\s*)'(PCS|pcs|Pcs)(\d+)'(\s*[,\)])`
ignores `PCS` substrings inside larger strings).

## 7. Verification queries (run after each table loads)

```sql
-- Expected row counts (from the 2026-05-18-1358 dump, max-ID basis):
SELECT 'tb_history' AS tbl, COUNT(*) AS rows, MAX(id) AS max_id FROM public.tb_history;
-- Expect: rows ≈ 167966, max_id = 167966

SELECT 'tb_history_key' AS tbl, COUNT(*) AS rows, MAX(id) AS max_id FROM public.tb_history_key;
-- Expect: rows ≈ 336214, max_id = 336214

SELECT 'tb_web_hs' AS tbl, COUNT(*) AS rows, MAX(id) AS max_id FROM public.tb_web_hs;
-- Expect: rows ≈ 2327765, max_id = 2327765

-- Sequence resync (so new inserts start above the imported max):
SELECT setval('public.tb_history_id_seq',     (SELECT MAX(id) FROM public.tb_history));
SELECT setval('public.tb_history_key_id_seq', (SELECT MAX(id) FROM public.tb_history_key));
SELECT setval('public.tb_web_hs_id_seq',      (SELECT MAX(id) FROM public.tb_web_hs));

-- Spot-check the userid rebrand (should show PR<n>, not PCS<n>):
SELECT userid, COUNT(*) FROM public.tb_history_key GROUP BY userid ORDER BY COUNT(*) DESC LIMIT 5;
SELECT userid, COUNT(*) FROM public.tb_web_hs      GROUP BY userid ORDER BY COUNT(*) DESC LIMIT 5;

-- Spot-check the audit-log free-text preservation (tb_history.action still
-- holds the original `UPDATE tb_X SET ...` strings with PCS<n> intact):
SELECT id, LEFT(action, 80) FROM public.tb_history WHERE action LIKE '%PCS%' LIMIT 5;
```

## 8. Rollback

If a load fails mid-way (e.g. half a `tb_web_hs` chunk inserts), each file
runs inside `BEGIN; ... COMMIT;` so a parser error rolls back the whole
chunk. To wipe a table and start over:

```sql
TRUNCATE public.tb_history;
TRUNCATE public.tb_history_key;
TRUNCATE public.tb_web_hs;

-- Then reset the sequences:
SELECT setval('public.tb_history_id_seq',     1, false);
SELECT setval('public.tb_history_key_id_seq', 1, false);
SELECT setval('public.tb_web_hs_id_seq',      1, false);
```

`TRUNCATE` is faster than `DELETE` and bypasses RLS — it's the right
operation for "start the load over".

## 9. Open items / STUBs

- **Idempotency on re-runs.** The chunks don't carry `ON CONFLICT DO NOTHING` —
  if you paste a chunk twice you'll get a PK collision (id conflict). If you
  need to re-load, `TRUNCATE` first (§8). The runbook treats this load as
  a one-shot cutover, so idempotency wasn't worth the bytes/perf hit.
- **The sequence reset SQL** at the end of `_extract.mjs` output isn't
  automatic — run it manually from §7 after all 8 `tb_web_hs` chunks load,
  else new rows will collide with the imported IDs.
- **`_all.sql` not produced** — would be ~778 MB single file; well over
  Supabase SQL-editor's paste limit. The chunked-per-table approach is
  the only practical path. (If ภูม wants one master file for record-keeping,
  `cat tb_history-part-*.sql tb_history_key-part-*.sql tb_web_hs-part-*.sql
  > _all.sql` does it — but don't try to paste it.)
- **Column-name casing in the source dump.** The MySQL `keyWord` /
  `apiERROR` / `categoryName` columns get lowercased by the script's INSERT-line
  transform to match the PG schema's lowercase identifiers. Verified on the
  3 affected columns (tb_history_key) — if a future dump introduces a new
  mixed-case column you'd need to add it to the lowercase pass.
- **Customer PII.** The generated `.sql` files contain `userid` codes (PR<n>)
  + IP addresses (`tb_web_hs.ip`) + user agents + session ids + audit SQL
  with phone/name/address payloads. The `.gitignore` should be checked
  before any future agent commits — but per the runbook §5 the convention
  is "data files are customer PII and must NOT be committed", same as
  `pcs-migration-work/` and `pcs-legacy-data.sql`.

## 10. Files in this directory

| File                 | Purpose                                                  |
|----------------------|----------------------------------------------------------|
| `README.md`          | This file                                                |
| `_analyze.mjs`       | Stream-tally INSERTs per table (sanity check)            |
| `_extract.mjs`       | The main extractor (run this for each table)             |
| `_load-all.sh`       | Bash loader — `psql` each generated chunk in order       |
| `_load-all.ps1`      | PowerShell equivalent of `_load-all.sh`                  |
| `.gitignore`         | Blocks `*.sql` files from being committed (PII rule)     |
| `<table>-part-*.sql` | Generated by `_extract.mjs` — **do not commit**          |
