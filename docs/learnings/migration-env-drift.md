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

## L-MIG-04 · A VALUE-rename migration (`coID 'PCS'→'PR'`) must be swept through EVERY surface that hardcodes the old literal — the resolver passing because it reads the customer's OWN (migrated) value HIDES the broken editors/exports

**Trigger.** 2026-06-12 mig 0182 renamed the general-tier company code `coID 'PCS'→'PR'` across `tb_users` + `tb_co` + **`tb_rate_g_kg`/`tb_rate_g_cbm`** (the general rate cards). The matching app change updated `lib/forwarder/coid.ts` (`isGeneralCoid` accepts both) + the 4 rate RESOLVERS — and a customer (PR009) was verified to get rates live. Shipped, looked done.

**What the resolver-passing HID.** The live resolver reads the rate card by the customer's OWN coID: `tb_rate_g_kg WHERE coid = <customer.coID>`. Post-0182 the customer is `'PR'` and the card is `'PR'` → match → works. **But every surface that hardcoded the OLD literal `'PCS'` silently broke**, and none of them is on the resolve path so the smoke-verify never touched them:

- **`/admin/rates/general` editor** keyed `const GENERAL_COID = "PCS"` → read `tb_rate_g_* WHERE coid='PCS'` → **0 rows** (prod probe confirmed: 16 rows all `'PR'`, zero `'PCS'`). The general-rate editor for ~8,700 customers rendered an **empty matrix**, and a Save would have written a dead `'PCS'` bucket no resolver reads (§0e dead-write). Broken since 0182, invisible because nobody re-priced FROM the editor.
- **6 "is-VIP" BLACKLIST predicates** (`coid !== "" && coid !== "PCS" && coid !== "GENERAL"`) forgot `'PR'` → a `'PR'` general customer classified as VIP → wrong CSV tier label, wrong customer-group filter (a "general customers" filter excluded all 8,700), wrong list badge.

**Rule — after ANY value-rename migration, grep the whole codebase for the OLD literal and audit each hit:** `grep -rn '"PCS"' actions/ lib/ app/` (then filter the unrelated meanings — here `fShipBy/addressID='PCS'` = self-pickup, `unit='PCS'` = pieces; only the coID/tier columns were renamed). Three hit-classes to fix: (a) a hardcoded WRITE/READ key on the old value (editor/writer) → dead-write/empty; (b) a blacklist predicate that enumerates "everything except the general values" but lists the OLD general value not the NEW; (c) a SQL `.in("col", [...old values])` filter array. **Centralize on ONE predicate + ONE value-list** (here `isGeneralCoid` + `GENERAL_COID_VALUES` in coid.ts) so the next rename is a one-file change, and add a regression test that asserts the NEW value resolves general. The resolver passing is necessary-but-NOT-sufficient evidence the rename is complete.
