# Learning — `ALTER COLUMN TYPE` fails when a view depends on the column

**Date:** 2026-06-16 · **Context:** migration 0185 (widen `tb_header_order.hstatus` varchar(1)→(2) for the new "ถึงโกดังจีน" status `'40'`).

## Symptom
A plain widen failed on **both** dev and prod, cleanly (atomic — nothing changed):

```
ERROR: 0A000 cannot alter type of a column used by a view or rule
Detail: rule _RETURN on view vw_sales_by_rep depends on column "hstatus"
```

Postgres refuses to `ALTER COLUMN ... TYPE` while any view (or rule) references that column — even a widening that can't lose data, and even though the view only *reads* the column.

## Fix — drop + alter + recreate, capturing the view def LIVE (don't hand-copy)
1. Find every dependent view (not just the one the error names):
   ```sql
   select distinct dependent.relname
   from pg_depend d
   join pg_rewrite r on r.oid = d.objid
   join pg_class dependent on dependent.oid = r.ev_class
   join pg_class src on src.oid = d.refobjid
   where src.relname = '<table>' and dependent.relkind = 'v';
   ```
2. In ONE transaction: `pg_get_viewdef('<view>'::regclass, true)` to capture the **canonical** def → `DROP VIEW` → `ALTER TABLE ... ALTER COLUMN ... TYPE ...` → `CREATE VIEW <view> AS <captured def>`. Recreating from `pg_get_viewdef` (not a hand-copied dump) guarantees the view is functionally identical.
3. Make the migration file **idempotent**: guard the whole block on `information_schema.columns.character_maximum_length < N` so a reconcile re-run is a no-op (and never re-hits the view dependency).

A throwaway apply script that captures the def at runtime and writes the migration file from it (`scripts/_gen-0185.mjs` pattern) avoids byte-copy errors entirely.

## Rules of thumb
- Before any `ALTER COLUMN TYPE` on a `tb_*` column, run the `pg_depend` query first — a column you think is "just a flag" may be load-bearing for a reporting view. The failure is clean (atomic rollback), so a surprise costs a retry, not data — but it blocks the deploy.
- The reconcile runner (`scripts/reconcile-migrations.mjs`) runs the SQL verbatim, so the migration file itself must carry the drop+recreate, not just a side script.

See also [`migration-env-drift.md`](migration-env-drift.md) (verify-applied by reading the real object, not guessing).
