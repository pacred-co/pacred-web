# 🗄️ ภูม — apply the Phase-I2 migrations to Supabase (dev + prod)

> **For: ภูม.** เดฟ/agent reviews every SQL file as it lands; **ภูม owns
> applying** — there is no zip hand-off. The migration files are already in git
> under `supabase/migrations/`; apply them straight from there. Pairs with
> [`supabase/migrations/README.md`](../../supabase/migrations/README.md).

---

## TL;DR

**9 migrations** are in git but **not yet applied to Supabase**. ภูม applies them
on **dev first**, verifies, then **production** — `supabase db push`, or paste
each file into the SQL Editor **in ascending number order**.

| # | File | Adds | Feature | Review |
|---|---|---|---|---|
| 0044 | `0044_withholding_tax.sql` | `withholding_tax_entries` + `wht-certs` bucket | V-A6 WHT | ✅ |
| 0045 | `0045_freight_qa_inspections.sql` | `freight_qa_inspections` + `qa_inspection_seq` + photos bucket | V-E10 QA/QC | ✅ |
| 0046 | `0046_org_contacts.sql` | `org_contacts` | V-G5 contacts | ✅ |
| 0047 | `0047_tos_versions.sql` | `tos_versions` + `tos_acceptances` | V-G4 TOS | ✅ |
| 0048 | `0048_freight_quotes.sql` | `freight_quotes` + `freight_quote_items` + `freight_quote_seq` | V-E6 quotation | ✅ |
| 0049 | `0049_wallet_order_payment_unique.sql` | `wallet_tx_order_payment_uniq` partial-unique index | F-11/G9 wallet guard | ✅ |
| 0050 | `0050_freight_shipments.sql` | `freight_shipments` + `freight_parties` + `freight_job_seq` + QA FK backfill | V-E1 spine | ✅ |
| 0051 | `0051_freight_invoices.sql` | `freight_invoices` + `freight_invoice_lines` + `freight_invoice_seq` | V-E1 CI | ✅ |
| 0060 | `0060_member_code_3digit.sql` | `generate_member_code()` rewrite + `profiles` backfill | member_code `PR00001`→`PR001` | ✅ |

---

## ✅ SQL review result (เดฟ/agent, 2026-05-17) — all 9 PASS

- **Idempotent** — every file is `create table if not exists` / `create or
  replace` / `create [unique] index if not exists` / `drop+recreate`
  trigger+policy / `do $$ if not exists $$` / `on conflict do nothing`.
  Re-running is safe — never destroys data.
- **Dependencies** — `0044`-`0049` only need the `0002`-`0043` base.
  **`0050` depends on `0045` + `0048`** (it FK-links `freight_quotes` and adds
  the reserved FK onto `freight_qa_inspections`); **`0051` depends on `0050`**.
  → **Apply in ascending number order** and every dependency is satisfied.
- Verified present: `set_updated_at()` (schema.sql) · `is_admin(text[])` (0015)
  · `warehouse` role (0033) · `hs_codes.code` PK · `service_orders.h_no` +
  `forwarders.f_no` unique · `wallet_transactions` columns + CHECK values.
- **No bugs found.** SQL is ready as-is.

> ⚠️ **`0049` caveat** — it builds a UNIQUE index on `wallet_transactions`.
> If production already holds a double-debited order (2 completed `order_payment`
> rows for one `h_no`), the index build fails. Pre-launch the table is
> empty/test-only → not expected; if it happens, dedupe first then re-run.

---

## 📋 Steps — ภูม runs this (dev first, then prod)

### 1. dev Supabase
1. **`supabase db push`** against the dev project — OR — Supabase Dashboard →
   dev → **SQL Editor**, open each file `0044` → `0045` → … → `0051` → `0060`
   **in order**, paste + **Run** one at a time.
2. `"already exists"` / `"duplicate"` notices = **safe** (idempotent). A red
   error that aborts a file = NOT safe — stop, fix or ping เดฟ with the message.
3. Run the **verify block** below — eyeball each result set.
4. Dashboard → **Database → Schema → Reload Schema Cache** (or wait ~1 min).

### 2. production Supabase
Repeat steps 1-4 on the **production** project. The `0060` backfill rewrites
existing `profiles.member_code` (`PR00001`→`PR001`) — running *number* preserved,
only zero-padding changes; `member_code_seq` untouched.

### 3. tell the team
Post: "migrations 0044-0051 + 0060 applied to dev + prod ✅". เดฟ flips the
status in [`team-status-2026-05-17.md`](team-status-2026-05-17.md).

---

## 🔎 Verify block — run after applying

```sql
-- (1) Expected: 15 rows — the new tables.
select table_name from information_schema.tables
 where table_schema = 'public' and table_name in (
   'withholding_tax_entries',
   'freight_qa_inspections','qa_inspection_seq',
   'org_contacts',
   'tos_versions','tos_acceptances',
   'freight_quotes','freight_quote_items','freight_quote_seq',
   'freight_shipments','freight_parties','freight_job_seq',
   'freight_invoices','freight_invoice_lines','freight_invoice_seq'
 ) order by table_name;

-- (2) Expected: 2 rows — new Storage buckets.
select id from storage.buckets
 where id in ('wht-certs','qa-inspection-photos') order by id;

-- (3) Expected: 1 row — F-11 double-debit guard index.
select indexname from pg_indexes
 where schemaname='public' and indexname='wallet_tx_order_payment_uniq';

-- (4) Expected: 1 row, pads_to_3 = true — member_code generator min-3-digit.
select proname, pg_get_functiondef(oid) like '%lpad%3%' as pads_to_3
  from pg_proc where proname='generate_member_code';
```

---

## ⚠️ Notes

- **No env changes** needed for any of these migrations.
- **Serials** — `inspection_no` / `quote_no` / `job_no` / `invoice_no` are filled
  by server actions calling the `security definer` RPCs (granted to
  `service_role` only — intentional).
- **F-11 (`0049`)** — apply **before public launch 2pm**; it closes the
  pay-from-wallet double-debit race (actions catch `23505` + re-SELECT).
- **member_code** — after `0060`, member codes are `PR` + **min 3 digits**
  (`PR001`…`PR999`→`PR1000`, overflow-safe). Validators/UI already updated on `main`.
- **If a verify count is short** — a file didn't fully run. Re-run it
  (idempotent) and reload the schema cache.

---

## 🔓 Next

ภูม's next freight migration = **`0052`** (`freight_invoice_payments`, V-E7).
Full numbering map → [`poom-phase-i2-prep.md`](poom-phase-i2-prep.md)
§"Migration numbering map".

---

## Cross-references

- Runbook table → [`supabase/migrations/README.md`](../../supabase/migrations/README.md)
- Migration numbering map → [`poom-phase-i2-prep.md`](poom-phase-i2-prep.md)
- ภูม brief → [`docs/briefs/poom.md`](../briefs/poom.md)
