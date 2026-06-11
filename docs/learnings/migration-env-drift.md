# Learnings — migration / environment drift

> Pacred applies numbered SQL migrations **by hand** per environment (no
> migrate-on-deploy, no `_migrations` ledger table). That makes schema drift
> between envs a recurring trap. Captured 2026-06-11.

---

## L-MIG-01 · `git pull` moves CODE, not SCHEMA — verify a teammate's migration is APPLIED to prod before promoting their branch

**Trigger.** 2026-06-11, on resume: a prior session integrated ภูม's receipt 50-ทวิ
gate and **pushed the code to `main`** (which reads `tb_receipt.wht_cert_status`)
but **never applied migration `0175` to prod**. Prod was code-ahead-of-schema →
the receipt surfaces (`/r/[token]`, billing-run, wht-certs) would have errored at
request time (`column wht_cert_status does not exist`). Caught only because the
resume re-checked the migration ledger and probed prod for the columns.

**Rule.** When you integrate a teammate branch that adds a `supabase/migrations/*.sql`,
applying it to prod is a SEPARATE step from the merge. Before promoting to `main`:
1. `git diff --name-only origin/dave-pacred origin/<branch> -- supabase/migrations/`
   → list the new migration(s).
2. For each, **probe prod** for the object it creates (don't trust "it's in the
   repo" — repo ≠ applied). `apply-migration-dryrun.mjs <file>` validates the SQL;
   then `--apply`; then re-probe.
3. Production code and production schema must move **together**. A green build
   does NOT prove the schema is applied — `next build` never executes a query.

---

## L-MIG-02 · A dev/shared env can be NON-CONTIGUOUSLY migrated — reconcile, don't linear-apply

**Trigger.** 2026-06-11 the owner handed over the shared DEV project
(`lozntlidlqqzzcaathnm` — the one น้องๆ develop against; **NOT** prod, which is
`yzljakczhwrpbxflnmco`) to bring to parity with prod. Probing it showed a
**patchy** state — it had `0152`/`0172`/`0175` applied but was MISSING
`0154`/`0158`/`0167`/`0173`/`0174`/`0176`. Whoever migrated dev cherry-picked
some + skipped others, so "apply everything from 0153 onward" was wrong (would
re-run + possibly dup the applied ones) and "apply nothing" left it broken.

**The reconciler** (`scripts/reconcile-migrations.mjs`): run every migration in a
range, each in its OWN transaction — COMMIT on success (missing → applied; an
already-applied **idempotent** one is a harmless no-op since every recent
migration uses `IF NOT EXISTS` / `OR REPLACE`), ROLLBACK + skip on a benign
"already exists" error, ROLLBACK + FLAG a real error. Reconciled 0146-0176 on
dev: 28 applied/ok, 1 skipped, 0 real-errors → dev matched prod on every marker.

**Two guards that matter:**
- **Seed-data dup:** a `CREATE TABLE IF NOT EXISTS` + a plain `INSERT` (no
  `ON CONFLICT`) DUPLICATES its seed if re-run on an env that already has the
  table. `grep -il 'insert into'` the range first; pass the already-applied
  seed migrations in `--skip`. (On 2026-06-11 only `0152` + `0167` had seeds —
  `0152` was already on dev so skipped; `0167` was missing so its first-time
  apply was correct.)
- **Schema-only, not data:** Pacred's customer DATA (8,898 rows) was loaded by
  the `pcs-data-migration` runbook, NOT by a `.sql` migration — so re-running
  the migration files is SCHEMA-only (no bulk-data dup). Confirm this stays true
  before reusing the reconciler on a data-bearing range.

---

## L-MIG-03 · To verify "is this migration applied", read the REAL object name out of the file — never guess

**Trigger.** Same 2026-06-11 reconcile: the post-run parity check first reported
`0154`/`0158`/`0167` as "STILL MISSING" — but they had just applied cleanly. The
markers were **guessed wrong**:
- `0154_customer_tag` creates `public.customer_tag` — NOT `tb_customer_tag`.
- `0158_cargo_3number_lines` adds `cost_unit_thb` to **`tb_forwarder_item`** —
  NOT `tb_order` (tb_order gets `cost_unit_cny`).
- `0167_freight_commission_ledger` creates `freight_commission_tiers` /
  `_accruals` / `_withdrawals` — there is NO table literally named
  `freight_commission_ledger`.

A guessed marker gives a false "MISSING" on an object that is actually present →
you'd wrongly re-apply (and maybe dup). **Derive the marker from the file:**
`grep -ioE 'create table (if not exists )?(public\.)?\w+|add column (if not exists )?\w+' <file>` —
the filename is a HINT, not the object name.
