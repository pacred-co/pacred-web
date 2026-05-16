# 🗄️ ภูม — apply the Phase-I2 migrations to Supabase (dev + prod)

> **For: ภูม.** เดฟ reviewed every SQL file in the batch (2026-05-17). This is
> the exact "what to do" checklist ภูม asked for. Pairs with
> [`supabase/migrations/README.md`](../../supabase/migrations/README.md).

---

## TL;DR

6 migrations are committed to git but **not yet applied to Supabase**. Apply
them to **dev first**, verify, then **production**. Combined one-paste file:
[`docs/setup/migrations-0044-0060.sql`](../setup/migrations-0044-0060.sql).

| Migration | Adds | Feature |
|---|---|---|
| `0044_withholding_tax.sql` | `withholding_tax_entries` + `wht-certs` bucket | V-A6 WHT |
| `0045_freight_qa_inspections.sql` | `freight_qa_inspections` + `qa_inspection_seq` + `qa-inspection-photos` bucket | V-E10 QA/QC |
| `0046_org_contacts.sql` | `org_contacts` | V-G5 contacts |
| `0047_tos_versions.sql` | `tos_versions` + `tos_acceptances` | V-G4 TOS |
| `0048_freight_quotes.sql` | `freight_quotes` + `freight_quote_items` + `freight_quote_seq` | V-E6 quotation |
| `0060_member_code_3digit.sql` | `generate_member_code()` rewrite + `profiles` backfill | member_code `PR00001`→`PR001` |

---

## ✅ SQL review result (เดฟ, 2026-05-17) — all 6 PASS

- **Idempotent** — every file is `create table if not exists` / `create or
  replace` / `drop+recreate` trigger+policy / `on conflict do nothing`. Re-running
  is safe, never destroys data.
- **Dependencies satisfied** — all 6 only need the `0002`-`0043` base (already
  live on dev + prod). `set_updated_at()` is in `schema.sql`; `is_admin(text[])`
  is in `0015`; the `warehouse` admin role used by `0045` was already added by
  `0033`. FK targets `service_orders.h_no` + `forwarders.f_no` are both `unique`.
- **Mutually independent** — apply order among the 6 does not matter.
- **`0047` does NOT collide with `0006`** — `0006_tos_acceptance.sql` only added
  two *columns* to `profiles`; `0047` creates new *tables*. No overlap.
- **No bugs found.** The SQL is ready as-is.

> The `0049`-`0059` gap is intentional — reserved for ภูม's freight block
> (`freight_shipments` … `wallet_order_payment_unique`). `0060` member_code was
> numbered there on purpose so เดฟ never collides with ภูม's migration numbers.
> Migrations apply in sorted version order, so `0060` simply sorts last — the
> gap is harmless.

---

## 📋 Steps — do this on dev, then repeat on production

### 1. dev Supabase
1. Supabase Dashboard → **dev** project → **SQL Editor** → New query.
2. Open [`docs/setup/migrations-0044-0060.sql`](../setup/migrations-0044-0060.sql),
   copy the **whole file**, paste, **Run**.
3. `"already exists"` / `"duplicate"` notices = **safe** (idempotent). A red
   error that aborts the run is NOT safe — stop and ping เดฟ with the message.
4. The file ends with a **3-part verify** block. Expected results:
   - **(1)** 9 rows — `freight_qa_inspections`, `freight_quote_items`,
     `freight_quote_seq`, `freight_quotes`, `org_contacts`, `qa_inspection_seq`,
     `tos_acceptances`, `tos_versions`, `withholding_tax_entries`.
   - **(2)** 2 rows — `qa-inspection-photos`, `wht-certs`.
   - **(3)** 1 row, `pads_to_3 = true` — member_code generator now min-3-digit.
5. Dashboard → **Database → Schema** → **Reload Schema Cache** (or wait ~1 min)
   so PostgREST picks up the new tables.

### 2. production Supabase
Repeat steps 1-5 on the **production** project. Same file, same expected
results. The `0060` backfill rewrites existing `profiles.member_code` values
(`PR00001`→`PR001`) — the running *number* is preserved, only the zero-padding
changes; `member_code_seq` is untouched so the next signup continues cleanly.

### 3. tell the team
Post in the team thread: "migrations 0044-0048 + 0060 applied to dev + prod ✅".
เดฟ updates [`team-status-2026-05-17.md`](team-status-2026-05-17.md) (it currently
flags these as "in git but NOT applied").

---

## ⚠️ Notes

- **`OTP_BYPASS` / env** — no env changes needed for these migrations.
- **First QA inspection / first freight quote** — `inspection_no` (`QA-YYMMDD-NNNN`)
  and `quote_no` (`FQYYMMDD-NNNN`) are filled by the server actions calling the
  RPC `next_qa_inspection_no()` / `next_freight_quote_no()`. The RPCs are
  `security definer` + granted to `service_role` only — that is intentional.
- **member_code** — after `0060`, any UI / validator that shows a member code
  expects `PR` + **minimum 3 digits** (`PR001` … `PR999` → `PR1000` → `PR12345`,
  overflow-safe). The 3 validators + 8 UI placeholders + tests are already
  updated on `main` (เดฟ, 2026-05-17).
- **If a verify count is short** — a migration didn't fully run. Re-run the
  combined file (idempotent) and reload the schema cache.

---

## 🔓 What this unblocks (post-launch Phase I2)

Once applied, ภูม's next freight migration starts at **`0049`** (`freight_shipments`,
V-E1). Full numbering map → [`poom-phase-i2-prep.md`](poom-phase-i2-prep.md)
§"Migration numbering map".

---

## Cross-references

- Combined file → [`docs/setup/migrations-0044-0060.sql`](../setup/migrations-0044-0060.sql)
- Runbook table → [`supabase/migrations/README.md`](../../supabase/migrations/README.md)
- Migration numbering map → [`poom-phase-i2-prep.md`](poom-phase-i2-prep.md)
- ภูม brief → [`docs/briefs/poom.md`](../briefs/poom.md)
